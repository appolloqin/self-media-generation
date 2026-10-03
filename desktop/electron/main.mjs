import { app, BrowserWindow, Menu, ipcMain, shell, dialog } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { allowedOriginFor, resolveRemoteConsoleUrl } from './config.mjs'
import { loadSettings, saveSettings, dataDir } from './settings.mjs'
import { startLocalServer, stopLocalServer, isRunning, localUrl } from './local-server.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

/** @type {BrowserWindow | null} */
let mainWindow = null

function showError(message) {
  if (!mainWindow) return
  return mainWindow
    .loadFile(path.join(__dirname, 'error.html'), { query: { message } })
    .catch((err) => console.warn('[desktop] 展示错误页失败:', err))
}

async function applyMode() {
  const settings = loadSettings()
  if (!mainWindow) return
  if (settings.mode === 'remote') {
    const url = resolveRemoteConsoleUrl(settings.remoteUrl)
    await mainWindow.loadURL(url)
    return
  }
  await mainWindow.loadFile(path.join(__dirname, 'loading.html'))
  try {
    const { url } = await startLocalServer()
    await mainWindow.loadURL(url)
  } catch (err) {
    await showError(err instanceof Error ? err.message : String(err))
  }
}

function buildMenu() {
  const settings = loadSettings()
  const template = [
    {
      label: '模式',
      submenu: [
        {
          label: '本地一体化（默认）',
          type: 'radio',
          checked: settings.mode === 'local',
          click: async () => {
            saveSettings({ mode: 'local' })
            await applyMode()
          },
        },
        {
          label: `远程控制台（${settings.remoteUrl}）`,
          type: 'radio',
          checked: settings.mode === 'remote',
          click: async () => {
            saveSettings({ mode: 'remote' })
            await applyMode()
          },
        },
        { type: 'separator' },
        {
          label: '设置远程控制台地址…',
          click: async () => {
            const value = await promptRemoteUrl(settings.remoteUrl)
            if (value) {
              saveSettings({ mode: 'remote', remoteUrl: value })
              await applyMode()
            }
          },
        },
        { type: 'separator' },
        {
          label: '复制本地服务地址',
          enabled: settings.mode === 'local',
          click: () => {
            if (isRunning()) shell.writeText(localUrl())
          },
        },
        {
          label: '重启本地服务',
          enabled: settings.mode === 'local',
          click: async () => {
            stopLocalServer()
            await applyMode()
          },
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '打开数据目录',
          click: () => shell.openPath(dataDir()),
        },
        {
          label: '打开日志目录',
          click: () => shell.openPath(path.join(dataDir(), 'logs')),
        },
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: '关于 智媒工坊',
              message: '智媒工坊 · AI 自媒体内容创作平台',
              detail: `桌面端 v${app.getVersion()}\n热点雷达 · 多智能体写作 · 智能排版 · 多平台发布\n\n本地模式数据目录：${dataDir()}`,
              buttons: ['好的'],
            })
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function promptRemoteUrl(current) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 480,
      height: 220,
      parent: mainWindow ?? undefined,
      modal: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: '设置远程控制台地址',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    })
    win.removeMenu()
    ipcMain.once('prompt-result', (_e, value) => {
      if (!win.isDestroyed()) win.close()
      resolve(typeof value === 'string' && value.trim() ? value.trim() : null)
    })
    win.on('closed', () => resolve(null))
    win.loadFile(path.join(__dirname, 'prompt.html'), { query: { value: current || '' } })
  })
}

ipcMain.on('desktop-retry', () => {
  applyMode().catch((err) => console.warn('[desktop] 重试失败:', err))
})
ipcMain.on('desktop-open-datadir', () => shell.openPath(dataDir()))

// 本地服务意外退出时提示并给出重试入口
process.on('smg:server-exit', ({ code, signal }) => {
  if (loadSettings().mode === 'remote') return
  showError(`本地服务已退出（code=${code ?? '-'} signal=${signal ?? '-'}）`)
})

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('com.smg.workshop')
  buildMenu()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: '智媒工坊',
    show: false,
    backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const settings = loadSettings()
    const origin =
      settings.mode === 'remote' ? allowedOriginFor(resolveRemoteConsoleUrl(settings.remoteUrl)) : 'http://127.0.0.1'
    if (!url.startsWith(origin)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  await applyMode()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })
      mainWindow.once('ready-to-show', () => mainWindow?.show())
      await applyMode()
    }
  })
})

app.on('window-all-closed', () => {
  stopLocalServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => stopLocalServer())
