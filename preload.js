const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  close: () => ipcRenderer.send('window-close'),
  minimize: () => ipcRenderer.send('window-minimize'),
  focusWindow: () => ipcRenderer.invoke('focus-window'),
  showAlarmPopup: (payload) => ipcRenderer.invoke('show-alarm-popup', payload),
  forceCloseAlarmPopup: () => ipcRenderer.invoke('force-close-alarm-popup'),
  createMemoFolder: (memoId) => ipcRenderer.invoke('create-memo-folder', memoId),
  archiveCompleted: (memoId, dateKey, items) => ipcRenderer.invoke('archive-completed', memoId, dateKey, items),
  getArchivePath: (memoId) => ipcRenderer.invoke('get-archive-path', memoId),
  openArchiveFolder: (memoId) => ipcRenderer.invoke('open-archive-folder', memoId),
  openArchiveReportWindow: (memoId) => ipcRenderer.invoke('open-archive-report-window', memoId),
  onOpenFind: (callback) => {
    ipcRenderer.on('open-find', () => callback());
  },
  getLoginSettings: () => ipcRenderer.invoke('get-login-settings'),
  setLoginSettings: (enabled) => ipcRenderer.invoke('set-login-settings', enabled),
  syncMerge: (appState) => ipcRenderer.invoke('sync-merge', appState),
  syncImport: (appState, key) => ipcRenderer.invoke('sync-import', appState, key),
  setSyncSettings: (settings) => ipcRenderer.invoke('set-sync-settings', settings),
  getSyncConfig: () => ipcRenderer.invoke('get-sync-config'),
});
