const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('onyx', {
  openViz: () => ipcRenderer.invoke('win:openViz'),
  openPlayer: () => ipcRenderer.invoke('win:openPlayer'),
  openAllDisplays: () => ipcRenderer.invoke('win:openAllDisplays'),
  listDisplays: () => ipcRenderer.invoke('win:listDisplays'),
  downloadSelf: () => ipcRenderer.invoke('win:downloadSelf'),
  closeChild: () => ipcRenderer.invoke('win:closeChild'),
  fullscreen: (flag) => ipcRenderer.invoke('win:fullscreen', flag),
  getDisplay: () => ipcRenderer.invoke('win:getDisplay'),
  onDisplayChange: (cb) => {
    const h = (_e, data) => cb(data)
    ipcRenderer.on('display:changed', h)
    return () => ipcRenderer.removeListener('display:changed', h)
  },
  openFile: (opts) => ipcRenderer.invoke('dialog:openFile', opts),
  saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),
  readText: (p) => ipcRenderer.invoke('fs:readText', p),
  readBinary: (p) => ipcRenderer.invoke('fs:readBinary', p),
  writeText: (p, d) => ipcRenderer.invoke('fs:writeText', p, d),
  scriptsLoad: () => ipcRenderer.invoke('data:scriptsLoad'),
  scriptsSave: (d) => ipcRenderer.invoke('data:scriptsSave', d),
  paramsLoad: () => ipcRenderer.invoke('data:paramsLoad'),
  paramsSave: (d) => ipcRenderer.invoke('data:paramsSave', d),
})
