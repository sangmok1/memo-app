const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alarmPopupAPI', {
  dismiss: () => ipcRenderer.send('alarm-popup-dismiss'),
  signalReady: () => ipcRenderer.send('alarm-popup-ready'),
  onAlarmData: (callback) => {
    ipcRenderer.on('alarm-data', (_, data) => callback(data));
  },
});
