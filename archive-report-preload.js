const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('archiveReportAPI', {
  onMemoId: (callback) => {
    ipcRenderer.on('archive-report-memo-id', (_, memoId) => callback(memoId));
  },
  fetchArchivePeriod: (memoId, startKey, endKey) =>
    ipcRenderer.invoke('fetch-archive-period', memoId, startKey, endKey),
  savePeriodReport: (memoId, fileName, content) =>
    ipcRenderer.invoke('save-period-report', memoId, fileName, content),
  close: () => ipcRenderer.send('archive-report-close'),
});
