const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  close: () => ipcRenderer.send('window-close'),
  minimize: () => ipcRenderer.send('window-minimize'),
  focusWindow: () => ipcRenderer.invoke('focus-window'),
  showAlarmPopup: (payload) => ipcRenderer.invoke('show-alarm-popup', payload),
  createMemoFolder: (memoId) => ipcRenderer.invoke('create-memo-folder', memoId),
  archiveCompleted: (memoId, dateKey, items) => ipcRenderer.invoke('archive-completed', memoId, dateKey, items),
  getArchivePath: (memoId) => ipcRenderer.invoke('get-archive-path', memoId),
  openArchiveFolder: (memoId) => ipcRenderer.invoke('open-archive-folder', memoId),
  getLoginSettings: () => ipcRenderer.invoke('get-login-settings'),
  setLoginSettings: (enabled) => ipcRenderer.invoke('set-login-settings', enabled),
});
