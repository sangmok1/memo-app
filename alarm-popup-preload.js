const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alarmPopupAPI', {
  dismiss: () => ipcRenderer.send('alarm-popup-dismiss'),
  onAlarmData: (callback) => {
    ipcRenderer.on('alarm-data', (_, data) => callback(data));
  },
});
