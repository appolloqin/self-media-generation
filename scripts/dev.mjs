#!/usr/bin/env node
/**
 * 本地双进程开发启动器
 * - 直接以 node 执行 tsx / vite CLI，避免 Windows cmd「终止批处理操作吗(Y/N)?」乱码
 * - Ctrl+C / SIGTERM 时优雅结束子进程，并以 0 退出
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(path.join(root, 'package.json'));

function resolveCli(pkg, candidates) {
  const pkgJsonPath = require.resolve(`${pkg}/package.json`);
  const pkgRoot = path.dirname(pkgJsonPath);
  for (const rel of candidates) {
    const abs = path.join(pkgRoot, rel);
    if (existsSync(abs)) return abs;
  }
  const pkgJson = require(`${pkg}/package.json`);
  const bin =
    typeof pkgJson.bin === 'string'
      ? pkgJson.bin
      : pkgJson.bin?.[pkg] || Object.values(pkgJson.bin || {})[0];
  if (!bin) throw new Error(`Cannot resolve CLI for ${pkg}`);
  const abs = path.join(pkgRoot, bin);
  if (!existsSync(abs)) throw new Error(`CLI not found: ${abs}`);
  return abs;
}

const tsxCli = resolveCli('tsx', ['dist/cli.mjs', 'dist/cli.js']);
const viteCli = resolveCli('vite', ['bin/vite.js']);

/** @type {{ name: string, child: import('node:child_process').ChildProcess | null }[]} */
const procs = [];
let shuttingDown = false;
let exitCode = 0;

function prefixLine(name, chunk, stream) {
  const text = chunk.toString();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '' && i === lines.length - 1) continue;
    stream.write(`[${name}] ${line}\n`);
  }
}

function start(name, args, cwd) {
  const child = spawn(process.execPath, args, {
    cwd,
    shell: false,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  });

  child.stdout?.on('data', (buf) => prefixLine(name, buf, process.stdout));
  child.stderr?.on('data', (buf) => prefixLine(name, buf, process.stderr));

  const entry = { name, child };
  procs.push(entry);

  child.on('exit', (code, signal) => {
    entry.child = null;
    if (shuttingDown) return;
    if (signal) {
      exitCode = 1;
      shutdown();
      return;
    }
    if (code && code !== 0) {
      exitCode = code;
      shutdown();
    }
  });

  return child;
}

function killChild(child) {
  if (!child || child.killed || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        shell: false,
        stdio: 'ignore',
      });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    try {
      child.kill();
    } catch {
      // ignore
    }
  }
}

function shutdown(code = exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) killChild(p.child);
  setTimeout(() => {
    process.exit(code);
  }, 250);
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  try {
    process.on(sig, () => {
      exitCode = 0;
      shutdown(0);
    });
  } catch {
    // SIGBREAK may be unavailable
  }
}

start('server', [tsxCli, 'watch', 'src/index.ts'], path.join(root, 'server'));
start('web', [viteCli], path.join(root, 'web'));
