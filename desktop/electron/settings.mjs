import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_CONSOLE_URL } from './config.mjs'

/**
 * @typedef {{ mode: 'local' | 'remote', remoteUrl: string }} DesktopSettings
 */

function settingsPath() {
  return path.join(app.getPath('userData'), 'desktop-settings.json')
}

function normalizeMode(value) {
  return value === 'remote' ? 'remote' : 'local'
}

function normalizeUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return DEFAULT_CONSOLE_URL
  try {
    return new URL(raw).href
  } catch {
    return DEFAULT_CONSOLE_URL
  }
}

/** @returns {DesktopSettings} */
export function loadSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))
    return { mode: normalizeMode(parsed.mode), remoteUrl: normalizeUrl(parsed.remoteUrl) }
  } catch {
    return { mode: 'local', remoteUrl: DEFAULT_CONSOLE_URL }
  }
}

/** @param {Partial<DesktopSettings>} patch */
export function saveSettings(patch) {
  const next = {
    mode: normalizeMode(patch.mode ?? loadSettings().mode),
    remoteUrl: normalizeUrl(patch.remoteUrl ?? loadSettings().remoteUrl),
  }
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2))
  return next
}

/** 数据目录：数据库、上传文件、日志、缓存均落在此处 */
export function dataDir() {
  const dir = path.join(app.getPath('userData'), 'data')
  for (const sub of ['', 'uploads', 'images', 'articles', 'templates', 'logs', 'cache', 'tmp']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true })
  }
  return dir
}
