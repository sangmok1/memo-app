const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  close: () => ipcRenderer.send('window-close'),
  minimize: () => ipcRenderer.send('window-minimize'),
  archiveCompleted: (dateKey, items) => ipcRenderer.invoke('archive-completed', dateKey, items),
  getArchivePath: () => ipcRenderer.invoke('get-archive-path'),
  openArchiveFolder: () => ipcRenderer.invoke('open-archive-folder'),
  getLoginSettings: () => ipcRenderer.invoke('get-login-settings'),
  setLoginSettings: (enabled) => ipcRenderer.invoke('set-login-settings', enabled),
});
