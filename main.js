const { app, BrowserWindow, ipcMain, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('Memos');

const userDataPath = path.join(app.getPath('appData'), 'memo-postit');
app.setPath('userData', userDataPath);

let mainWindow;

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

function getArchiveDir() {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'archive');
  }
  return path.join(__dirname, 'archive');
}

function ensureArchiveDir() {
  const dir = getArchiveDir();
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

function writeMarkdown(dateKey, data) {
  const mdPath = path.join(getArchiveDir(), `${dateKey}.md`);
  const lines = [`# ${data.dateLabel}`, ''];
  if (data.items.length === 0) {
    lines.push('_완료한 일 없음_');
  } else {
    data.items.forEach((item) => lines.push(`- ${item.text}`));
  }
  lines.push('');
  fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 300,
    height: 420,
    minWidth: 260,
    minHeight: 200,
    maxWidth: 400,
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

ipcMain.handle('archive-completed', (_, dateKey, items) => {
  ensureArchiveDir();
  const archiveDir = getArchiveDir();
  const filePath = path.join(archiveDir, `${dateKey}.json`);
  let data = {
    date: dateKey,
    dateLabel: formatDateLabel(dateKey),
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
      data.items.push({ text, savedAt: now });
      existingTexts.add(text);
    }
  });

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  writeMarkdown(dateKey, data);
  return filePath;
});

ipcMain.handle('get-archive-path', () => getArchiveDir());

ipcMain.handle('open-archive-folder', () => {
  ensureArchiveDir();
  shell.openPath(getArchiveDir());
});
