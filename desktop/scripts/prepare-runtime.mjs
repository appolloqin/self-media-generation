import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopDir, '..')
const runtimeRoot = path.join(desktopDir, 'runtime')

function log(...args) {
  console.log('[prepare-runtime]', ...args)
}

function run(cmd, args, cwd = repoRoot, extraEnv) {
  log('$', cmd, args.join(' '))
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
  })
  if (r.status !== 0) throw new Error(`Command failed (${r.status}): ${cmd} ${args.join(' ')}`)
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(from, to) {
  rmrf(to)
  ensureDir(path.dirname(to))
  fs.cpSync(from, to, { recursive: true })
}

/* ---------------- 运行时 Node（复用 Electron，不额外下载） ---------------- */

/**
 * Electron 已内置完整 Node 运行时，没必要再下载一份官方 Node。
 * electron.exe / Electron.app 在 ELECTRON_RUN_AS_NODE=1 下即为标准 node。
 * 可执行文件路径因平台而异（macOS 在 .app bundle 内），必须读 path.txt，不能写死 dist/electron。
 */
function electronBinary() {
  const electronDir = path.join(desktopDir, 'node_modules', 'electron')
  const pathFile = path.join(electronDir, 'path.txt')
  if (!fs.existsSync(pathFile)) {
    throw new Error(
      `未找到 Electron 安装标记：${pathFile}\n请先执行 npm run desktop:install（或 cd desktop && npm install）`,
    )
  }
  const rel = fs.readFileSync(pathFile, 'utf8').trim()
  const bin = path.join(electronDir, 'dist', rel)
  if (!fs.existsSync(bin)) {
    throw new Error(
      `未找到 Electron 可执行文件：${bin}\n请删除 desktop/node_modules/electron 后重新执行 npm run desktop:install`,
    )
  }
  return bin
}

/** 读取 Electron 版本号（node-gyp 需要它来定位对应 headers） */
function electronVersion() {
  const pkg = path.join(desktopDir, 'node_modules', 'electron', 'package.json')
  if (!fs.existsSync(pkg)) throw new Error('未安装 electron，请先执行 npm run desktop:install')
  return JSON.parse(fs.readFileSync(pkg, 'utf8')).version
}

/** 读取 Electron 内置 Node 的版本与 ABI（modules）号，用于依赖指纹 */
function runtimeNodeInfo() {
  const bin = electronBinary()
  const r = spawnSync(bin, ['-p', 'JSON.stringify({version:process.versions.node,modules:process.versions.modules})'], {
    cwd: desktopDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  if (r.status !== 0 || !r.stdout) throw new Error(`无法读取 Electron 内置 Node 版本：${r.stderr || r.status}`)
  return JSON.parse(String(r.stdout).trim())
}

/* ---------------- 构建本项目 ---------------- */

function buildProject() {
  run('npm', ['run', 'build:server'])
  run('npm', ['run', 'build:web'])
}

/**
 * 服务端产物已由 esbuild 打包为单文件 ESM，仅 better-sqlite3 / sharp 等原生模块保持外部引用，
 * 因此运行时只需把 dist 与生产依赖放在 runtime/server 下。
 * 注意：必须写成 type=module，否则 dist/index.js 会被当成 CJS 解析而报错。
 */
function stageServer() {
  const serverDir = path.join(runtimeRoot, 'server')
  const srcPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'server', 'package.json'), 'utf8'))
  const deps = {}
  for (const [name, range] of Object.entries(srcPkg.dependencies || {})) {
    // @smg/shared 已被 esbuild 内联进 bundle，无需运行时安装
    if (name === '@smg/shared') continue
    deps[name] = range
  }
  const stagedPkg = {
    name: 'smg-server-runtime',
    version: srcPkg.version || '1.0.0',
    private: true,
    type: 'module',
    main: 'dist/index.js',
    dependencies: deps,
  }
  ensureDir(serverDir)
  const pkgJson = JSON.stringify(stagedPkg, null, 2)
  fs.writeFileSync(path.join(serverDir, 'package.json'), pkgJson)
  copyDir(path.join(repoRoot, 'server', 'dist'), path.join(serverDir, 'dist'))
  log('已暂存后端 → runtime/server')
  return pkgJson
}

/** 前端产物：服务端按 <runtime>/web/dist 解析 SPA 静态资源 */
function stageWeb() {
  const from = path.join(repoRoot, 'web', 'dist')
  if (!fs.existsSync(path.join(from, 'index.html'))) throw new Error('前端构建产物缺失，请先执行 npm run build:web')
  copyDir(from, path.join(runtimeRoot, 'web', 'dist'))
  log('已暂存前端 → runtime/web/dist')
}

/* ---------------- 生产依赖 ---------------- */

/** 定位 npm-cli.js（纯 JS，可用任意 node 驱动）：优先本机 npm，其次全局安装的 npm */
function findNpmCli() {
  const candidates = []
  if (process.env.npm_execpath && process.env.npm_execpath.endsWith('npm-cli.js')) {
    candidates.push(process.env.npm_execpath)
  }
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js'))
  }
  // `where npm` 指向的 .cmd 同级目录里通常就有 npm-cli.js（NVM / Node 官方安装均如此）
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const which = spawnSync('where', [npmCmd], { encoding: 'utf8', shell: true })
  if (which.status === 0) {
    for (const line of String(which.stdout).split(/\r?\n/)) {
      const dir = path.dirname(line.trim())
      if (dir) candidates.push(path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js'))
    }
  }
  const globalRoot = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: true })
  if (globalRoot.status === 0) {
    candidates.push(path.join(String(globalRoot.stdout).trim(), 'npm', 'bin', 'npm-cli.js'))
  }
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return null
}

/**
 * 原生模块（better-sqlite3 / sharp）的二进制与 Node 的 ABI 强绑定。
 * 必须用「与运行时相同的 Node」去安装，并声明 runtime=electron，
 * 让 prebuild-install 拉取 Electron ABI 对应的预编译包。
 *
 * 不要强制 --build-from-source：CI 上 Python 3.12+ 已移除 distutils，
 * 旧版 node-gyp 源码编译会直接失败；预编译包才是首选路径。
 */
function installServerDeps(pkgJson, nodeInfo) {
  const serverDir = path.join(runtimeRoot, 'server')
  const modulesDir = path.join(serverDir, 'node_modules')
  const depsMarker = path.join(modulesDir, '.deps.json')
  // 依赖内容 + 运行时 Node 的 ABI 号都参与指纹，任一变化都需重装
  const fingerprint = JSON.stringify({ deps: pkgJson, node: nodeInfo, electron: electronVersion() })
  const prev = fs.existsSync(depsMarker) ? fs.readFileSync(depsMarker, 'utf8') : ''
  if (fs.existsSync(modulesDir) && prev === fingerprint) {
    log('后端生产依赖无变化，跳过安装')
    return
  }
  if (fs.existsSync(modulesDir)) {
    log('依赖指纹变化，清理旧 node_modules 后重装…')
    rmrf(modulesDir)
  }
  log(`安装后端生产依赖（目标 Electron ${electronVersion()} / Node ${nodeInfo.version} / ABI ${nodeInfo.modules}）…`)
  // 用 Electron 内置的 node 驱动 npm-cli.js：npm 本身是纯 JS，
  // 这样安装过程与运行时共用同一 Node，原生模块 ABI 天然一致。
  const npmCli = findNpmCli()
  const installArgs = [
    'install',
    '--omit=dev',
    '--no-package-lock',
    '--legacy-peer-deps',
    '--no-audit',
    '--no-fund',
  ]
  // 告知 prebuild-install / node-gyp：目标是 Electron（下载对应 ABI 预编译包）
  const buildEnv = {
    ELECTRON_RUN_AS_NODE: '1',
    npm_config_runtime: 'electron',
    npm_config_target: electronVersion(),
    npm_config_disturl: 'https://electronjs.org/headers',
    npm_config_arch: process.arch,
    npm_config_target_arch: process.arch,
  }
  if (npmCli) {
    run(electronBinary(), [npmCli, ...installArgs], serverDir, buildEnv)
  } else {
    log('警告：未找到 npm-cli.js，回退到系统 npm，原生模块 ABI 可能不匹配')
    run('npm', installArgs, serverDir, buildEnv)
  }
  rebuildNativeForElectron(serverDir)
  ensureDir(modulesDir)
  fs.writeFileSync(depsMarker, fingerprint)
}

/** 若预编译未命中，用 @electron/rebuild 针对 Electron ABI 重建原生模块 */
function rebuildNativeForElectron(serverDir) {
  const cli = path.join(desktopDir, 'node_modules', '@electron/rebuild', 'lib', 'cli.js')
  if (!fs.existsSync(cli)) {
    log('未找到 @electron/rebuild，跳过显式 rebuild')
    return
  }
  const hasBinding = findNativeBinding(path.join(serverDir, 'node_modules', 'better-sqlite3'))
  if (hasBinding) {
    log('已检测到 better-sqlite3 原生绑定，跳过 @electron/rebuild')
    return
  }
  log('未检测到 better-sqlite3 原生绑定，尝试 @electron/rebuild…')
  run(process.execPath, [cli, '-f', '-w', 'better-sqlite3', '-v', electronVersion(), '-m', serverDir], desktopDir)
}

function findNativeBinding(pkgDir) {
  if (!fs.existsSync(pkgDir)) return false
  const stack = [pkgDir]
  while (stack.length) {
    const cur = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      const p = path.join(cur, ent.name)
      if (ent.isFile() && ent.name.endsWith('.node')) return true
      if (ent.isDirectory() && ent.name !== 'node_modules') stack.push(p)
    }
  }
  return false
}

function writeManifest(nodeInfo) {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  const manifest = {
    name: 'smg-desktop-runtime',
    version: rootPkg.version || '1.0.0',
    // 运行时直接复用 Electron 内置 Node，不再单独内嵌 Node 发行包
    node: { source: 'electron', version: nodeInfo.version, modules: nodeInfo.modules },
    builtAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
  }
  fs.writeFileSync(path.join(runtimeRoot, 'manifest.json'), JSON.stringify(manifest, null, 2))
}

/* ---------------- 入口 ---------------- */

function main() {
  ensureDir(runtimeRoot)
  const nodeInfo = runtimeNodeInfo()
  log(`运行时 Node：Electron 内置 v${nodeInfo.version}（ABI ${nodeInfo.modules}）`)
  buildProject()
  const pkgJson = stageServer()
  stageWeb()
  installServerDeps(pkgJson, nodeInfo)
  writeManifest(nodeInfo)
  log('完成 →', runtimeRoot)
}

try {
  main()
} catch (err) {
  console.error('[prepare-runtime] 失败:', err)
  process.exit(1)
}
