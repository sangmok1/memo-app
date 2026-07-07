const { app, BrowserWindow, ipcMain, shell, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('Memos');

const userDataPath = path.join(app.getPath('appData'), 'memo-postit');
app.setPath('userData', userDataPath);

let mainWindow;
let alarmPopupWindow = null;
let alarmPopupResolve = null;
let alarmPopupPayload = null;
let alarmAutoCloseTimer = null;

function finishAlarmPopup() {
  if (alarmAutoCloseTimer) {
    clearTimeout(alarmAutoCloseTimer);
    alarmAutoCloseTimer = null;
  }
  if (alarmPopupResolve) {
    alarmPopupResolve();
    alarmPopupResolve = null;
  }
  alarmPopupPayload = null;
}

function closeAlarmPopupWindow() {
  if (alarmAutoCloseTimer) {
    clearTimeout(alarmAutoCloseTimer);
    alarmAutoCloseTimer = null;
  }
  if (alarmPopupWindow && !alarmPopupWindow.isDestroyed()) {
    alarmPopupWindow.close();
  }
  alarmPopupWindow = null;
}

function sendAlarmDataToPopup() {
  if (!alarmPopupWindow || alarmPopupWindow.isDestroyed() || !alarmPopupPayload) return;
  alarmPopupWindow.webContents.send('alarm-data', alarmPopupPayload);
}

function showAlarmPopupWindow({ title, content }) {
  return new Promise((resolve) => {
    alarmPopupResolve = resolve;
    alarmPopupPayload = {
      title: String(title || '알람').slice(0, 100),
      content: String(content || '').slice(0, 500),
    };
    closeAlarmPopupWindow();

    const display = screen.getPrimaryDisplay();
    const { x, y, width, height } = display.bounds;

    alarmPopupWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      hasShadow: false,
      focusable: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'alarm-popup-preload.js'),
        contextIsolation: true,
        sandbox: false,
      },
    });

    alarmPopupWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    alarmPopupWindow.setAlwaysOnTop(true, 'screen-saver');

    alarmPopupWindow.once('ready-to-show', () => {
      alarmPopupWindow?.show();
      alarmPopupWindow?.focus();
    });

    alarmPopupWindow.on('closed', () => {
      alarmPopupWindow = null;
      finishAlarmPopup();
    });

    alarmAutoCloseTimer = setTimeout(() => {
      closeAlarmPopupWindow();
    }, 5 * 60 * 1000);

    alarmPopupWindow.loadFile(path.join(__dirname, 'alarm-popup.html'));
  });
}

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
  } catch {
    return { openAtLogin: true };
  }
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

function applyLoginSettings(enabled) {
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: enabled });
    return;
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: [path.resolve(__dirname)],
  });
}

function getArchiveRoot() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'archive');
  }
  return path.join(__dirname, 'archive');
}

function getMemoArchiveDir(memoId) {
  return path.join(getArchiveRoot(), memoId);
}

function ensureArchiveRoot() {
  const dir = getArchiveRoot();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function formatDateLabel(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${y}년 ${m}월 ${d}일 (${weekdays[date.getDay()]})`;
}

function writeMarkdown(memoId, dateKey, data) {
  const archiveDir = getMemoArchiveDir(memoId);
  fs.mkdirSync(archiveDir, { recursive: true });
  const mdPath = path.join(archiveDir, `${dateKey}.md`);
  const lines = [`# ${data.dateLabel}`, '', `메모 ID: ${memoId}`, ''];
  if (data.items.length === 0) {
    lines.push('_완료한 일 없음_');
  } else {
    data.items.forEach((item) => {
      const prefix = item.depth === 1 ? '      - ' : '- ';
      lines.push(`${prefix}${item.text}`);
    });
  }
  lines.push('');
  fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 332,
    height: 420,
    minWidth: 292,
    minHeight: 200,
    maxWidth: 432,
    maxHeight: 600,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    resizable: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('index.html');
}

function setAppIcon() {
  const iconPath = path.join(__dirname, 'build/icon.png');
  if (!fs.existsSync(iconPath)) return;
  const icon = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon);
  }
}

app.whenReady().then(() => {
  setAppIcon();
  const config = loadConfig();
  applyLoginSettings(config.openAtLogin !== false);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.on('window-minimize', () => mainWindow?.minimize());

ipcMain.handle('focus-window', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (process.platform === 'darwin' && app.dock) {
    app.dock.show();
  }
});

ipcMain.handle('show-alarm-popup', (_, payload) => showAlarmPopupWindow(payload));

ipcMain.on('alarm-popup-dismiss', () => {
  closeAlarmPopupWindow();
});

ipcMain.on('alarm-popup-ready', () => {
  sendAlarmDataToPopup();
});

ipcMain.handle('force-close-alarm-popup', () => {
  closeAlarmPopupWindow();
  return true;
});

ipcMain.handle('get-login-settings', () => {
  const config = loadConfig();
  return { openAtLogin: config.openAtLogin !== false };
});

ipcMain.handle('set-login-settings', (_, enabled) => {
  const config = loadConfig();
  config.openAtLogin = enabled;
  saveConfig(config);
  applyLoginSettings(enabled);
  return { openAtLogin: enabled };
});

ipcMain.handle('create-memo-folder', (_, memoId) => {
  ensureArchiveRoot();
  const dir = getMemoArchiveDir(memoId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
});

ipcMain.handle('archive-completed', (_, memoId, dateKey, items) => {
  ensureArchiveRoot();
  const archiveDir = getMemoArchiveDir(memoId);
  fs.mkdirSync(archiveDir, { recursive: true });
  const filePath = path.join(archiveDir, `${dateKey}.json`);
  let data = {
    date: dateKey,
    dateLabel: formatDateLabel(dateKey),
    memoId,
    items: [],
  };

  if (fs.existsSync(filePath)) {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  const existingTexts = new Set(data.items.map((i) => i.text));
  const now = new Date().toISOString();

  items.forEach((item) => {
    const text = item.text.trim();
    if (text && !existingTexts.has(text)) {
      data.items.push({ text, depth: item.depth || 0, savedAt: now });
      existingTexts.add(text);
    }
  });

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  writeMarkdown(memoId, dateKey, data);
  return filePath;
});

ipcMain.handle('get-archive-path', (_, memoId) => {
  if (memoId) return getMemoArchiveDir(memoId);
  return getArchiveRoot();
});

ipcMain.handle('open-archive-folder', (_, memoId) => {
  ensureArchiveRoot();
  const dir = memoId ? getMemoArchiveDir(memoId) : getArchiveRoot();
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
});
