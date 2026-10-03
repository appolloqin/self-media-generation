import { app } from 'electron'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createServer } from 'node:net'
import { dataDir } from './settings.mjs'
import { LOCAL_PORT_START } from './config.mjs'

let child = null
let activePort = null
let stopping = false

/** 运行时根目录：打包后为 resources/runtime，开发时为 desktop/runtime */
export function runtimeRoot() {
  const packaged = path.join(process.resourcesPath || '', 'runtime')
  if (process.resourcesPath && fs.existsSync(packaged)) return packaged
  return path.resolve(app.getAppPath(), 'runtime')
}

/**
 * 运行时 Node：直接复用当前 Electron 可执行文件。
 * Electron 内置了完整 Node（ELECTRON_RUN_AS_NODE=1 即为标准 node 行为），
 * 无需再单独内嵌一份 Node 发行包，且原生模块 ABI 与安装时完全一致。
 */
export function nodeBinary() {
  return process.execPath
}

function findFreePort(start = LOCAL_PORT_START, end = LOCAL_PORT_START + 200) {
  return new Promise((resolve) => {
    let port = start
    const tryNext = () => {
      if (port > end) return resolve(start)
      const srv = createServer()
      srv.once('error', () => tryNext())
      srv.once('listening', () => srv.close(() => resolve(port)))
      srv.listen(port, '127.0.0.1')
      port += 1
    }
    tryNext()
  })
}

function waitHealth(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error(`本地服务健康检查超时 (端口 ${port})`))
      setTimeout(ping, 500)
    }
    const ping = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 2000 }, (res) => {
        res.resume()
        if (res.statusCode === 200) return resolve()
        retry()
      })
      req.on('timeout', () => req.destroy())
      req.on('error', retry)
    }
    ping()
  })
}

export async function startLocalServer() {
  if (child && activePort) return { url: localUrl(), port: activePort }
  const root = runtimeRoot()
  const serverDir = path.join(root, 'server')
  const entry = path.join(serverDir, 'dist', 'index.js')
  if (!fs.existsSync(entry)) {
    throw new Error(`未找到本地服务入口：${entry}\n请先执行 npm run desktop:prepare 生成运行时。`)
  }
  const data = dataDir()
  const port = await findFreePort()
  const env = {
    ...process.env,
    // 让 electron.exe 以纯 Node 模式运行（否则会开出 GUI 窗口）
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    /** 数据（SQLite / 上传 / 日志 / 缓存）全部落到用户目录 */
    SMG_DATA_DIR: data,
  }
  stopping = false
  child = spawn(nodeBinary(), [entry], { cwd: serverDir, env, windowsHide: true })
  child.stdout?.on('data', (b) => process.stdout.write(`[server] ${b}`))
  child.stderr?.on('data', (b) => process.stderr.write(`[server] ${b}`))
  child.on('exit', (code, signal) => {
    console.warn(`[desktop] 本地服务退出 code=${code} signal=${signal}`)
    const exited = child
    child = null
    activePort = null
    if (!stopping && exited && !exited.killed) {
      process.emit('smg:server-exit', { code, signal })
    }
  })
  child.on('error', (err) => console.warn('[desktop] 本地服务启动失败:', err))
  await waitHealth(port)
  activePort = port
  return { url: localUrl(), port }
}

export function localUrl() {
  return `http://127.0.0.1:${activePort ?? 0}`
}

export function isRunning() {
  return Boolean(child && activePort)
}

export function stopLocalServer() {
  if (!child) return
  stopping = true
  const proc = child
  const pid = proc.pid
  child = null
  activePort = null
  try {
    if (process.platform === 'win32' && pid) {
      // Windows 下 node 子进程不会随父进程退出，需要连同进程树一起结束
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
    } else {
      proc.kill('SIGTERM')
      setTimeout(() => {
        try {
          proc.kill('SIGKILL')
        } catch {
          /* 进程可能已退出 */
        }
      }, 3000)
    }
  } catch (err) {
    console.warn('[desktop] 停止本地服务失败:', err)
  }
}
