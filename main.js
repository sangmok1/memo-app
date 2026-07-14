const { app, BrowserWindow, ipcMain, shell, nativeImage, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { mergeAppStates, mergeArchiveTrees } = require('./sync-merge');
const {
  filterAppStateByGroup,
  applyGroupMergeToFull,
  assignOrphanMemosToGroup,
  normalizeSyncConfig,
  syncGroupKeyLabel,
} = require('./sync-groups');

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

async function fetchRemoteBundle(key) {
  const apiUrl = getSyncApiUrl();
  if (!apiUrl || !key) return null;
  const res = await fetch(`${apiUrl}?key=${encodeURIComponent(key)}`);
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `pull_failed_${res.status}`);
  return data.bundle || null;
}

async function pushBundle(key, bundle) {
  const apiUrl = getSyncApiUrl();
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, bundle }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `push_failed_${res.status}`);
  return data;
}

function packArchiveTreeForMemoIds(memoIdSet) {
  const all = packArchiveTree();
  const filtered = {};
  Object.entries(all).forEach(([relPath, data]) => {
    const memoId = relPath.split('/')[0];
    if (memoIdSet.has(memoId)) filtered[relPath] = data;
  });
  return filtered;
}

async function syncOneGroup(fullAppState, group, defaultGroupId) {
  let key = String(group.key || '').trim();
  const subset = filterAppStateByGroup(fullAppState, group.id, defaultGroupId);
  const memoIds = new Set(Object.keys(subset.memos));
  const localArchives = packArchiveTreeForMemoIds(memoIds);

  let remoteBundle = null;
  if (key) {
    try {
      remoteBundle = await fetchRemoteBundle(key);
    } catch (err) {
      if (err.message !== 'not_found') throw err;
    }
  }

  const mergedSubset = remoteBundle
    ? mergeAppStates(subset, remoteBundle.appState)
    : subset;
  const mergedArchives = remoteBundle
    ? mergeArchiveTrees(localArchives, remoteBundle.archives)
    : localArchives;

  applyArchiveTreeMerged(mergedArchives);

  Object.keys(mergedSubset.memos).forEach((id) => {
    mergedSubset.memos[id].syncGroupId = group.id;
  });

  const outBundle = {
    version: 2,
    exportedAt: new Date().toISOString(),
    appState: mergedSubset,
    archives: mergedArchives,
  };

  const pushResult = await pushBundle(key || undefined, outBundle);
  key = pushResult.key || key;

  return { groupId: group.id, key, mergedSubset, merged: Boolean(remoteBundle) };
}

async function syncAllGroups(appState) {
  const config = normalizeSyncConfig(loadConfig());
  if (!config.syncEnabled) return { skipped: true };

  const apiUrl = getSyncApiUrl();
  if (!apiUrl) throw new Error('sync_api_not_configured');

  if (!config.syncGroups.length) {
    config.syncGroups.push({
      id: 'sg-default',
      key: '',
      name: syncGroupKeyLabel(''),
      createdAt: new Date().toISOString(),
    });
  }

  let fullState = appState;
  const defaultGroupId = config.defaultSyncGroupId || config.syncGroups[0].id;
  const primaryGroupId = config.syncGroups[0].id;

  Object.values(fullState.memos || {}).forEach((memo) => {
    if (!memo.syncGroupId) memo.syncGroupId = primaryGroupId;
  });

  for (const group of config.syncGroups.filter((g) => g.key)) {
    const result = await syncOneGroup(fullState, group, defaultGroupId);
    fullState = applyGroupMergeToFull(fullState, group.id, result.mergedSubset, defaultGroupId);
    group.key = result.key;
    group.name = syncGroupKeyLabel(result.key);
  }

  config.syncGroups = config.syncGroups.map((g) => ({ ...g, name: syncGroupKeyLabel(g.key) }));

  config.syncKey = config.syncGroups[0]?.key || config.syncKey || '';
  config.lastSyncKey = config.syncKey;
  config.lastSyncAt = new Date().toISOString();
  saveConfig(config);

  return {
    appState: fullState,
    merged: true,
    exportedAt: config.lastSyncAt,
  };
}

async function createSyncGroup(name) {
  const config = normalizeSyncConfig(loadConfig());
  const apiUrl = getSyncApiUrl();
  if (!apiUrl) throw new Error('sync_api_not_configured');

  const emptyBundle = {
    version: 2,
    exportedAt: new Date().toISOString(),
    appState: {
      memos: {},
      memoOrder: [],
      deletedMemos: {},
      updatedAt: new Date().toISOString(),
    },
    archives: {},
  };
  const pushResult = await pushBundle(undefined, emptyBundle);
  const group = {
    id: `sg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    key: pushResult.key,
    name: syncGroupKeyLabel(pushResult.key),
    createdAt: new Date().toISOString(),
  };
  config.syncGroups.push(group);
  config.defaultSyncGroupId = group.id;
  config.syncEnabled = true;
  saveConfig(config);
  return group;
}

async function connectSyncGroup(appState, key) {
  const config = normalizeSyncConfig(loadConfig());
  const apiUrl = getSyncApiUrl();
  if (!apiUrl) throw new Error('sync_api_not_configured');

  const keyedGroups = config.syncGroups.filter((g) => g.key);
  let group = config.syncGroups.find((g) => g.key === key);
  if (!group) {
    if (config.syncGroups.length === 1 && !config.syncGroups[0].key) {
      group = config.syncGroups[0];
      group.key = key;
    } else {
      group = {
        id: `sg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        key,
        name: syncGroupKeyLabel(key),
        createdAt: new Date().toISOString(),
      };
      config.syncGroups.push(group);
    }
    if (keyedGroups.length === 0) {
      assignOrphanMemosToGroup(appState, group.id);
    }
  }

  config.syncEnabled = true;
  config.defaultSyncGroupId = group.id;
  saveConfig(config);

  const defaultGroupId = config.defaultSyncGroupId;
  const result = await syncOneGroup(appState, group, defaultGroupId);
  const fullState = applyGroupMergeToFull(appState, group.id, result.mergedSubset, defaultGroupId);
  group.key = result.key;

  config.lastSyncAt = new Date().toISOString();
  saveConfig(config);

  return { appState: fullState, group, key: result.key };
}

async function syncPullMergePush(appState, options = {}) {
  if (options.key && options.connectGroup) {
    return connectSyncGroup(appState, options.key);
  }
  return syncAllGroups(appState);
}

async function syncExportToCloud(appState, existingKey) {
  return syncAllGroups(appState);
}

async function syncImportFromCloud(appState, key) {
  return connectSyncGroup(appState, key);
}

ipcMain.handle('sync-merge', (_, appState) => syncAllGroups(appState));
ipcMain.handle('sync-export', (_, appState, existingKey) => syncExportToCloud(appState, existingKey));
ipcMain.handle('sync-import', (_, appState, key) => syncImportFromCloud(appState, key));
ipcMain.handle('create-sync-group', (_, name) => createSyncGroup(name));
ipcMain.handle('delete-sync-group', (_, groupId) => {
  const config = normalizeSyncConfig(loadConfig());
  if (config.syncGroups.length <= 1) throw new Error('last_sync_key');
  const idx = config.syncGroups.findIndex((g) => g.id === groupId);
  if (idx === -1) throw new Error('group_not_found');
  config.syncGroups.splice(idx, 1);
  if (config.defaultSyncGroupId === groupId) {
    config.defaultSyncGroupId = config.syncGroups[0].id;
  }
  saveConfig(config);
  return getSyncConfigPayload();
});
ipcMain.handle('set-sync-settings', (_, settings) => {
  const config = normalizeSyncConfig(loadConfig());
  if (typeof settings.syncEnabled === 'boolean') config.syncEnabled = settings.syncEnabled;
  if (settings.defaultSyncGroupId) {
    const exists = config.syncGroups.some((g) => g.id === settings.defaultSyncGroupId);
    if (exists) config.defaultSyncGroupId = settings.defaultSyncGroupId;
  }
  if (settings.syncKey) {
    const safeKey = String(settings.syncKey).trim();
    if (/^[\w-]{12,64}$/.test(safeKey)) {
      config.syncKey = safeKey;
      config.lastSyncKey = safeKey;
      if (config.syncGroups[0]) config.syncGroups[0].key = safeKey;
    }
  }
  saveConfig(config);
  return getSyncConfigPayload();
});
ipcMain.handle('get-sync-config', () => getSyncConfigPayload());

function getSyncConfigPayload() {
  const config = normalizeSyncConfig(loadConfig());
  const primary = config.syncGroups[0];
  return {
    apiUrl: getSyncApiUrl(),
    syncEnabled: Boolean(config.syncEnabled),
    syncKey: primary?.key || config.syncKey || config.lastSyncKey || '',
    lastSyncKey: primary?.key || config.syncKey || config.lastSyncKey || '',
    lastSyncAt: config.lastSyncAt || '',
    syncGroups: config.syncGroups,
    defaultSyncGroupId: config.defaultSyncGroupId,
  };
}
