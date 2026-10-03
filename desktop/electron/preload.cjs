const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('smg', {
  retry: () => ipcRenderer.send('desktop-retry'),
  openDataDir: () => ipcRenderer.send('desktop-open-datadir'),
})
