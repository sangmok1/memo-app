const { app, BrowserWindow, ipcMain, shell, nativeImage, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { mergeAppStates, mergeArchiveTrees } = require('./sync-merge');
const { normalizeSyncConfig } = require('./sync-groups');
const {
  getClientId,
  getClientSecret,
  loginWithGoogle,
  getValidIdToken,
  getValidAccessToken,
  publicGoogleAuth,
} = require('./google-auth');
const { fetchCalendarEventsForDate } = require('./google-calendar');

app.setName('Memos');

const userDataPath = path.join(app.getPath('appData'), 'memo-postit');
app.setPath('userData', userDataPath);

let mainWindow;
let archiveReportWindow = null;
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

function normalizePopupSizePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(20, Math.round(n)));
}

function showAlarmPopupWindow({ title, content, sizePercent }) {
  return new Promise((resolve) => {
    alarmPopupResolve = resolve;
    alarmPopupPayload = {
      title: String(title || '알람').slice(0, 100),
      content: String(content || '').slice(0, 500),
    };
    closeAlarmPopupWindow();

    const display = screen.getPrimaryDisplay();
    const { x, y, width, height } = display.workArea;
    const percent = normalizePopupSizePercent(sizePercent);
    const popupWidth = Math.round(width * (percent / 100));
    const popupHeight = Math.round(height * (percent / 100));
    const popupX = x + Math.round((width - popupWidth) / 2);
    const popupY = y + Math.round((height - popupHeight) / 2);

    alarmPopupWindow = new BrowserWindow({
      x: popupX,
      y: popupY,
      width: popupWidth,
      height: popupHeight,
      frame: false,
      transparent: false,
      backgroundColor: '#fffef8',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      hasShadow: true,
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

    alarmPopupWindow.webContents.on('did-finish-load', () => {
      sendAlarmDataToPopup();
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
      const prefix = item.depth === 1 ? '  ◦ ' : '• ';
      lines.push(`${prefix}${item.text}`);
    });
  }
  lines.push('');
  fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
}

function sendArchiveReportMemoId(memoId) {
  if (!archiveReportWindow || archiveReportWindow.isDestroyed() || !memoId) return;
  archiveReportWindow.webContents.send('archive-report-memo-id', memoId);
}

function openArchiveReportWindow(memoId) {
  if (!memoId) return;

  if (archiveReportWindow && !archiveReportWindow.isDestroyed()) {
    sendArchiveReportMemoId(memoId);
    if (archiveReportWindow.isMinimized()) archiveReportWindow.restore();
    archiveReportWindow.show();
    archiveReportWindow.focus();
    return;
  }

  const display = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = display.workAreaSize;
  const winWidth = Math.min(640, screenW - 40);
  const winHeight = Math.min(860, screenH - 40);

  archiveReportWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    minWidth: 420,
    minHeight: 520,
    title: 'Memos · 완료 기록',
    backgroundColor: '#f0ebe0',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'archive-report-preload.js'),
      contextIsolation: true,
    },
  });

  archiveReportWindow.once('ready-to-show', () => {
    archiveReportWindow?.show();
    archiveReportWindow?.focus();
    sendArchiveReportMemoId(memoId);
  });

  archiveReportWindow.webContents.on('did-finish-load', () => {
    sendArchiveReportMemoId(memoId);
  });

  archiveReportWindow.on('closed', () => {
    archiveReportWindow = null;
  });

  archiveReportWindow.loadFile(path.join(__dirname, 'archive-report.html'));
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

function sendOpenFind() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('open-find');
}

function createApplicationMenu() {
  const editSubmenu = [
    {
      label: '찾기',
      accelerator: 'CmdOrCtrl+F',
      click: sendOpenFind,
    },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { role: 'selectAll' },
  ];

  const template = process.platform === 'darwin'
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
        { label: '편집', submenu: editSubmenu },
      ]
    : [{ label: '편집', submenu: editSubmenu }];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  setAppIcon();
  createApplicationMenu();
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

ipcMain.handle('open-archive-report-window', (_, memoId) => {
  openArchiveReportWindow(memoId);
});

ipcMain.on('archive-report-close', () => {
  if (archiveReportWindow && !archiveReportWindow.isDestroyed()) {
    archiveReportWindow.close();
  }
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
    updatedAt: new Date().toISOString(),
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

  data.updatedAt = new Date().toISOString();
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

ipcMain.handle('fetch-archive-period', (_, memoId, startKey, endKey) => {
  ensureArchiveRoot();
  const dir = getMemoArchiveDir(memoId);
  if (!fs.existsSync(dir)) return [];

  const result = [];
  for (const file of fs.readdirSync(dir)) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(file)) continue;
    const dateKey = file.slice(0, 10);
    if (dateKey < startKey || dateKey > endKey) continue;
    try {
      result.push(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
    } catch {}
  }
  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
});

ipcMain.handle('save-period-report', (_, memoId, fileName, content) => {
  ensureArchiveRoot();
  const reportsDir = path.join(getMemoArchiveDir(memoId), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const safeName = path.basename(fileName).replace(/[^\w.\-가-힣]/g, '_');
  const filePath = path.join(reportsDir, safeName.endsWith('.md') ? safeName : `${safeName}.md`);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
});

function getSyncApiUrl() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'sync-api.config.json'), 'utf8'));
    return String(cfg.apiUrl || '').replace(/\/$/, '');
  } catch {
    return '';
  }
}

function packArchiveTree() {
  ensureArchiveRoot();
  const root = getArchiveRoot();
  const archives = {};
  if (!fs.existsSync(root)) return archives;

  const walk = (relDir) => {
    const fullDir = relDir ? path.join(root, relDir) : root;
    for (const name of fs.readdirSync(fullDir)) {
      const relPath = relDir ? `${relDir}/${name}` : name;
      const fullPath = path.join(fullDir, name);
      if (fs.statSync(fullPath).isDirectory()) {
        walk(relPath);
        continue;
      }
      if (!name.endsWith('.json')) continue;
      try {
        archives[relPath] = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      } catch {
        archives[relPath] = fs.readFileSync(fullPath, 'utf8');
      }
    }
  };
  walk('');
  return archives;
}

function clearDirContents(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

function applyArchiveTreeMerged(archives) {
  ensureArchiveRoot();
  const root = getArchiveRoot();
  if (!archives || typeof archives !== 'object') return;

  Object.entries(archives).forEach(([relPath, data]) => {
    const safeRel = relPath.replace(/^(\.\.[\\/])+/, '').replace(/^[/\\]+/, '');
    if (!safeRel.endsWith('.json')) return;
    const filePath = path.join(root, safeRel);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content, 'utf8');
  });
}

function saveGoogleAuthRecord(auth) {
  const config = normalizeSyncConfig(loadConfig());
  config.googleAuth = auth;
  saveConfig(config);
}

async function getGoogleIdToken() {
  const config = normalizeSyncConfig(loadConfig());
  if (!config.googleAuth?.refreshToken && !config.googleAuth?.idToken) {
    throw new Error('google_not_signed_in');
  }
  const clientId = getClientId(__dirname);
  const clientSecret = getClientSecret(__dirname);
  if (!clientId) throw new Error('google_oauth_not_configured');
  return getValidIdToken(config.googleAuth, clientId, clientSecret, saveGoogleAuthRecord);
}

async function getGoogleAccessToken() {
  const config = normalizeSyncConfig(loadConfig());
  if (!config.googleAuth?.refreshToken && !config.googleAuth?.accessToken) {
    throw new Error('google_not_signed_in');
  }
  const clientId = getClientId(__dirname);
  const clientSecret = getClientSecret(__dirname);
  if (!clientId) throw new Error('google_oauth_not_configured');
  return getValidAccessToken(config.googleAuth, clientId, clientSecret, saveGoogleAuthRecord);
}

async function fetchRemoteBundleAuth(idToken) {
  const apiUrl = getSyncApiUrl();
  if (!apiUrl) throw new Error('sync_api_not_configured');
  const res = await fetch(apiUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `pull_failed_${res.status}`);
  return data.bundle || null;
}

async function pushBundleAuth(idToken, bundle, options = {}) {
  const apiUrl = getSyncApiUrl();
  if (!apiUrl) throw new Error('sync_api_not_configured');
  const body = { bundle };
  if (options.mergeOnly) body.mode = 'merge';
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `push_failed_${res.status}`);
  return data;
}

function buildSyncBundle(appState, archives) {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    appState,
    archives,
  };
}

async function syncWithGoogle(appState, options = {}) {
  const config = normalizeSyncConfig(loadConfig());
  if (!config.syncEnabled) return { skipped: true };

  const apiUrl = getSyncApiUrl();
  if (!apiUrl) throw new Error('sync_api_not_configured');
  if (!config.googleAuth?.sub) throw new Error('google_not_signed_in');

  const idToken = await getGoogleIdToken();
  const pull = config.cloudPullEnabled === true;
  const localArchives = packArchiveTree();

  let remoteBundle = null;
  if (pull) {
    remoteBundle = await fetchRemoteBundleAuth(idToken);
  }

  const mergedState = remoteBundle
    ? mergeAppStates(appState, remoteBundle.appState)
    : appState;
  const mergedArchives = remoteBundle
    ? mergeArchiveTrees(localArchives, remoteBundle.archives)
    : localArchives;

  if (pull) {
    applyArchiveTreeMerged(mergedArchives);
  }

  const outBundle = buildSyncBundle(
    pull ? mergedState : appState,
    pull ? mergedArchives : localArchives,
  );

  await pushBundleAuth(idToken, outBundle, { mergeOnly: !pull });

  config.lastSyncAt = new Date().toISOString();
  saveConfig(config);

  if (!pull) {
    return {
      pushed: true,
      merged: false,
      exportedAt: config.lastSyncAt,
    };
  }

  return {
    appState: mergedState,
    merged: Boolean(remoteBundle),
    exportedAt: config.lastSyncAt,
  };
}

async function pullFromGoogleCloud(appState) {
  const config = normalizeSyncConfig(loadConfig());
  if (!config.googleAuth?.sub) throw new Error('google_not_signed_in');

  const idToken = await getGoogleIdToken();
  const remoteBundle = await fetchRemoteBundleAuth(idToken);
  const localArchives = packArchiveTree();

  if (!remoteBundle) {
    config.cloudPullEnabled = true;
    config.lastSyncAt = new Date().toISOString();
    saveConfig(config);
    return { appState, merged: false, empty: true };
  }

  const mergedState = mergeAppStates(appState, remoteBundle.appState);
  const mergedArchives = mergeArchiveTrees(localArchives, remoteBundle.archives);
  applyArchiveTreeMerged(mergedArchives);

  config.cloudPullEnabled = true;
  config.lastSyncAt = new Date().toISOString();
  saveConfig(config);

  await pushBundleAuth(idToken, buildSyncBundle(mergedState, mergedArchives));

  return {
    appState: mergedState,
    merged: true,
    exportedAt: config.lastSyncAt,
  };
}

ipcMain.handle('google-login', async () => {
  const auth = await loginWithGoogle(__dirname, { includeCalendar: false });
  const config = normalizeSyncConfig(loadConfig());
  const sameAccount = config.googleAuth?.sub && config.googleAuth.sub === auth.sub;
  const keepCalendarScope = sameAccount && config.googleAuth?.calendarScopeGranted;
  config.googleAuth = {
    ...auth,
    calendarScopeGranted: keepCalendarScope || auth.calendarScopeGranted,
  };
  if (!sameAccount) config.cloudPullEnabled = false;
  config.syncEnabled = true;
  saveConfig(config);
  return getSyncConfigPayload();
});

ipcMain.handle('google-request-calendar', async () => {
  const config = normalizeSyncConfig(loadConfig());
  const auth = await loginWithGoogle(__dirname, { includeCalendar: true });
  config.googleAuth = {
    ...(config.googleAuth || {}),
    ...auth,
    calendarScopeGranted: true,
  };
  config.syncEnabled = true;
  saveConfig(config);
  return getSyncConfigPayload();
});

ipcMain.handle('google-logout', () => {
  const config = normalizeSyncConfig(loadConfig());
  delete config.googleAuth;
  config.syncEnabled = false;
  config.cloudPullEnabled = false;
  saveConfig(config);
  return getSyncConfigPayload();
});

ipcMain.handle('fetch-calendar-today', async (_, dateKey) => {
  const accessToken = await getGoogleAccessToken();
  const key = String(dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    throw new Error('invalid_date_key');
  }
  return fetchCalendarEventsForDate(accessToken, key);
});

ipcMain.handle('sync-merge', (_, appState) => syncWithGoogle(appState));
ipcMain.handle('sync-pull', (_, appState) => pullFromGoogleCloud(appState));
ipcMain.handle('set-sync-settings', (_, settings) => {
  const config = normalizeSyncConfig(loadConfig());
  if (typeof settings.syncEnabled === 'boolean') config.syncEnabled = settings.syncEnabled;
  if (typeof settings.cloudPullEnabled === 'boolean') {
    config.cloudPullEnabled = settings.cloudPullEnabled;
  }
  if (typeof settings.calendarAutoImport === 'boolean') {
    config.calendarAutoImport = settings.calendarAutoImport;
  }
  saveConfig(config);
  return getSyncConfigPayload();
});
ipcMain.handle('get-sync-config', () => getSyncConfigPayload());

function getSyncConfigPayload() {
  const config = normalizeSyncConfig(loadConfig());
  return {
    apiUrl: getSyncApiUrl(),
    syncEnabled: Boolean(config.syncEnabled),
    cloudPullEnabled: config.cloudPullEnabled === true,
    calendarAutoImport: config.calendarAutoImport === true,
    googleAuth: publicGoogleAuth(config.googleAuth),
    lastSyncAt: config.lastSyncAt || '',
    defaultSyncGroupId: config.defaultSyncGroupId,
  };
}
