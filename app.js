const STORAGE_KEY = 'memo-postit-data';
const ARCHIVE_FALLBACK_KEY = 'memo-postit-archive';
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const ALARM_CHECK_INTERVAL = 15000;
const DAY_CHECK_INTERVAL = 60 * 60 * 1000;
const SYNC_DEBOUNCE_MS = 3000;
const SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000;
const CALENDAR_AUTO_INTERVAL_MS = 60 * 60 * 1000;

let syncConfigCache = { googleAuth: null, cloudPullEnabled: false };

function getDefaultSyncGroupId() {
  return syncConfigCache.defaultSyncGroupId || 'sg-default';
}

function getMemoSyncGroupMeta(memo) {
  if (!syncConfigCache.syncEnabled || isAlarmBoard(memo)) return null;
  if (!syncConfigCache.googleAuth?.email) return null;
  return {
    group: { key: syncConfigCache.googleAuth.email },
    index: 0,
  };
}

const BELL_PATH = 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.9 2.49.4 4 2.42 4 4.9v6z';

function createBellSvg(hue, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', `hsl(${hue}, 72%, 52%)`);
  path.setAttribute('d', BELL_PATH);
  svg.appendChild(path);
  return svg;
}

function getKSTDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
}

function formatKSTDate(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const day = WEEKDAY_LABELS[date.getDay()];
  return `${y}년 ${m}월 ${d}일 (${day})`;
}

function getDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShortDateFromKey(dateKey) {
  const parts = dateKey.split('-');
  return `${Number(parts[1])}월 ${Number(parts[2])}일`;
}

function generateMemoId() {
  const d = getKSTDate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6);
  return `${y}${m}${day}-${rand}`;
}

function createEmptyMemo(id, syncGroupId) {
  return {
    id,
    type: 'memo',
    createdAt: new Date().toISOString(),
    syncGroupId: syncGroupId || getDefaultSyncGroupId(),
    today: [createTodoItem()],
    general: [createTodoItem()],
    savedDate: getDateKey(getKSTDate()),
    colorHue: 54,
    colorMode: 'hue',
    colorGray: 94,
    autoWrap: true,
  };
}

function createEmptyAlarm(id, syncGroupId) {
  return {
    id,
    type: 'alarm',
    createdAt: new Date().toISOString(),
    syncGroupId: syncGroupId || getDefaultSyncGroupId(),
    onceAlarms: [],
    recurringAlarms: [],
    colorHue: 200,
    colorMode: 'hue',
    colorGray: 35,
    popupSizePercent: 50,
  };
}

function createAlarmItem(partial = {}) {
  return {
    id: createId(),
    title: partial.title || '',
    content: partial.content || '',
    time: partial.time || '09:00',
    date: partial.date || getDateKey(getKSTDate()),
    daysOfWeek: partial.daysOfWeek?.length ? [...partial.daysOfWeek] : [getKSTDate().getDay()],
    enabled: partial.enabled !== false,
    fired: false,
    lastTriggeredAt: null,
  };
}

function migrateData(raw) {
  if (raw && raw.memos && raw.memoOrder) {
    const now = new Date().toISOString();
    if (!raw.updatedAt) raw.updatedAt = now;
    if (!raw.deletedMemos) raw.deletedMemos = {};
    if (!raw.deletedMemoGroups) raw.deletedMemoGroups = {};
    Object.values(raw.memos).forEach((item) => {
      if (!item.type) item.type = 'memo';
      if (!item.updatedAt) item.updatedAt = item.createdAt || now;
      if (item.type === 'alarm') {
        item.onceAlarms = item.onceAlarms || [];
        item.recurringAlarms = item.recurringAlarms || [];
        if (item.popupSizePercent === undefined) item.popupSizePercent = 50;
      } else if (item.autoWrap === undefined) {
        item.autoWrap = true;
      }
      if (!item.colorMode) item.colorMode = 'hue';
      if (item.colorGray === undefined) item.colorGray = item.type === 'alarm' ? 30 : 94;
    });
    return raw;
  }

  const id = generateMemoId();
  const legacy = raw || {};
  return {
    activeMemoId: id,
    memoOrder: [id],
    deletedMemos: {},
    memos: {
      [id]: {
        id,
        type: 'memo',
        createdAt: new Date().toISOString(),
        today: legacy.today?.length ? legacy.today : [createTodoItem()],
        general: legacy.general?.length ? legacy.general : [createTodoItem()],
        savedDate: legacy.savedDate || getDateKey(getKSTDate()),
        colorHue: legacy.colorHue ?? 54,
        autoWrap: legacy.autoWrap !== false,
      },
    },
  };
}

function loadAppState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrateData(JSON.parse(raw));
  } catch {}
  const id = generateMemoId();
  return {
    activeMemoId: id,
    memoOrder: [id],
    memos: { [id]: createEmptyMemo(id) },
    deletedMemos: {},
  };
}

function touchAppState(memoId = appState.activeMemoId) {
  const now = new Date().toISOString();
  appState.updatedAt = now;
  if (memoId && appState.memos[memoId]) {
    appState.memos[memoId].updatedAt = now;
  }
}

function saveAppState(options = {}) {
  if (!options.skipTouch) touchAppState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  if (!options.skipSync) scheduleCloudSync();
}

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function createTodoItem(text = '', depth = 0) {
  return { id: createId(), text, done: false, depth: depth === 1 ? 1 : 0 };
}

function isAlarmBoard(item) {
  return item?.type === 'alarm';
}

function normalizeItemDepth(item) {
  if (item.depth !== 1) item.depth = 0;
}

function formatSummaryLine(text, depth = 0) {
  const label = text.trim();
  if (depth === 1) return `  ◦ ${label}`;
  return `• ${label}`;
}

function hasParentAbove(items, index) {
  for (let i = index - 1; i >= 0; i--) {
    if ((items[i].depth || 0) === 0) return true;
  }
  return false;
}

function getChildIndices(items, parentIndex) {
  const children = [];
  for (let i = parentIndex + 1; i < items.length; i++) {
    if ((items[i].depth || 0) === 1) children.push(i);
    else break;
  }
  return children;
}

function getMoveBlockIndices(items, index) {
  if (!items[index]) return [];
  if ((items[index].depth || 0) === 1) return [index];
  return [index, ...getChildIndices(items, index)];
}

let dragState = null;

function clearDropIndicators() {
  document.querySelectorAll('.drop-placeholder').forEach((el) => el.remove());
  document.querySelectorAll('.todo-list').forEach((el) => {
    el.classList.remove('drag-over');
    delete el.dataset.dropIndex;
  });
  document.querySelectorAll('.todo-item.dragging-follow').forEach((el) => {
    el.classList.remove('dragging-follow');
  });
}

function updateDropIndicator(listEl, dropIndex, blockSize) {
  document.querySelectorAll('.drop-placeholder').forEach((el) => el.remove());
  document.querySelectorAll('.todo-list').forEach((el) => el.classList.remove('drag-over'));

  listEl.classList.add('drag-over');
  listEl.dataset.dropIndex = String(dropIndex);

  const items = [...listEl.querySelectorAll('.todo-item:not(.dragging):not(.dragging-follow)')];
  const placeholder = document.createElement('li');
  placeholder.className = 'drop-placeholder';
  placeholder.setAttribute('aria-hidden', 'true');
  const rowHeight = 28;
  const gap = 4;
  placeholder.style.height = `${Math.max(1, blockSize) * rowHeight + (Math.max(1, blockSize) - 1) * gap}px`;

  if (dropIndex >= items.length) {
    listEl.appendChild(placeholder);
  } else {
    listEl.insertBefore(placeholder, items[dropIndex]);
  }
}

function getListByType(listType) {
  return listType === 'today' ? currentMemo.today : currentMemo.general;
}

function getListEl(listType) {
  return listType === 'today' ? todayListEl : generalListEl;
}

function saveData() {
  saveAppState();
}

function formatAlarmTimeMeta(alarm, recurring) {
  if (recurring) {
    const days = [...alarm.daysOfWeek].sort((a, b) => {
      const aa = a === 0 ? 7 : a;
      const bb = b === 0 ? 7 : b;
      return aa - bb;
    });
    const dayText = days.map((d) => WEEKDAY_LABELS[d]).join('·');
    return `${dayText} ${alarm.time}`;
  }
  const parts = alarm.date.split('-');
  const weekday = WEEKDAY_LABELS[new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getDay()];
  return `${Number(parts[1])}/${Number(parts[2])} (${weekday}) ${alarm.time}`;
}

function getTodayKey() {
  return getDateKey(getKSTDate());
}

let appState = loadAppState();
let currentMemo = appState.memos[appState.activeMemoId];
let lastCheckedDateKey = null;

const todayListEl = document.getElementById('today-list');
const generalListEl = document.getElementById('general-list');
const todayDateEl = document.getElementById('today-date');
const memoListEl = document.getElementById('memo-list');
const postitEl = document.querySelector('.postit');
const memoViewEl = document.getElementById('memo-view');
const alarmViewEl = document.getElementById('alarm-view');
const memoFooterEl = document.getElementById('memo-footer');
const onceAlarmListEl = document.getElementById('once-alarm-list');
const recurringAlarmListEl = document.getElementById('recurring-alarm-list');

const createTypeModal = document.getElementById('create-type-modal');
const alarmFormModal = document.getElementById('alarm-form-modal');
const deleteModal = document.getElementById('delete-modal');

let pendingDeleteMemoId = null;
let editingAlarmContext = null;
let alarmQueue = [];
let isAlarmRingOpen = false;

todayDateEl.textContent = formatKSTDate(getKSTDate());

async function archiveItems(memoId, dateKey, items) {
  const payload = items
    .filter((t) => t.text.trim())
    .map((t) => ({ text: t.text.trim(), depth: t.depth || 0 }));

  if (payload.length === 0) return;

  if (window.electronAPI?.archiveCompleted) {
    await window.electronAPI.archiveCompleted(memoId, dateKey, payload);
    return;
  }

  const fallback = JSON.parse(localStorage.getItem(ARCHIVE_FALLBACK_KEY) || '{}');
  if (!fallback[memoId]) fallback[memoId] = {};
  if (!fallback[memoId][dateKey]) {
    fallback[memoId][dateKey] = { date: dateKey, items: [] };
  }
  const existing = new Set(fallback[memoId][dateKey].items.map((i) => i.text));
  payload.forEach((item) => {
    if (!existing.has(item.text)) {
      fallback[memoId][dateKey].items.push({ text: item.text, savedAt: new Date().toISOString() });
      existing.add(item.text);
    }
  });
  localStorage.setItem(ARCHIVE_FALLBACK_KEY, JSON.stringify(fallback));
}

async function handleDayRolloverForMemo(memo) {
  if (isAlarmBoard(memo)) return;

  const todayKey = getTodayKey();
  memo.today.forEach(normalizeItemDepth);
  memo.general.forEach(normalizeItemDepth);

  if (!memo.savedDate || memo.savedDate === todayKey) {
    if (!memo.savedDate) memo.savedDate = todayKey;
    return;
  }

  const yesterdayKey = memo.savedDate;
  const dateLabel = formatShortDateFromKey(yesterdayKey);

  const completedToday = memo.today.filter((t) => t.done && t.text.trim());
  const completedGeneral = memo.general.filter((t) => t.done && t.text.trim());
  const completed = [...completedToday, ...completedGeneral];
  if (completed.length > 0) {
    await archiveItems(memo.id, yesterdayKey, completed);
  }

  const toMove = memo.today.filter((t) => t.text.trim() && !t.done);
  toMove.reverse().forEach((item) => {
    const text = item.text.trim();
    const suffix = `(${dateLabel})`;
    const newText = text.includes(suffix) ? text : `${text} (${dateLabel})`;
    memo.general.unshift(createTodoItem(newText, item.depth || 0));
  });

  memo.today = [createTodoItem()];
  memo.general = memo.general.filter((t) => !(t.done && t.text.trim()));
  if (!memo.general.length) memo.general = [createTodoItem()];
  memo.savedDate = getTodayKey();
  memo.updatedAt = new Date().toISOString();
}

async function checkDayRollover() {
  const todayKey = getTodayKey();
  todayDateEl.textContent = formatKSTDate(getKSTDate());

  if (todayKey === lastCheckedDateKey) return;

  const dayChanged = lastCheckedDateKey !== null;
  lastCheckedDateKey = todayKey;
  for (const id of appState.memoOrder) {
    await handleDayRolloverForMemo(appState.memos[id]);
  }
  currentMemo = appState.memos[appState.activeMemoId];
  saveAppState({ skipSync: dayChanged });
  refreshActiveUI();
  if (dayChanged) {
    scheduleCloudSync(true);
    runAutoCalendarImport().catch(() => {});
  }
}

function handleCheckboxChange(listType, index, isDone) {
  const items = getListByType(listType);
  if (!items[index]) return;

  items[index].done = isDone;

  if ((items[index].depth || 0) === 0) {
    getChildIndices(items, index).forEach((i) => {
      items[i].done = isDone;
    });
  }

  saveData();
  renderAllLists();
}

function moveItem(fromType, toType, itemId, toIndex) {
  const fromList = getListByType(fromType);
  const fromIndex = fromList.findIndex((i) => i.id === itemId);
  if (fromIndex === -1) return;

  const blockIndices = getMoveBlockIndices(fromList, fromIndex);
  const blockItems = blockIndices.map((i) => fromList[i]);

  for (let i = blockIndices.length - 1; i >= 0; i--) {
    fromList.splice(blockIndices[i], 1);
  }

  const toList = getListByType(toType);
  let insertIndex = Math.max(0, Math.min(toIndex, toList.length));

  if (fromType === toType && fromIndex < insertIndex) {
    insertIndex -= blockIndices.length;
  }

  toList.splice(insertIndex, 0, ...blockItems);
  saveData();
  renderAllLists();
}

function getDropIndex(listEl, clientY) {
  const items = [...listEl.querySelectorAll('.todo-item:not(.dragging):not(.dragging-follow)')];
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return i;
  }
  return items.length;
}

function setupDropZone(listEl, listType) {
  listEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const dropIndex = getDropIndex(listEl, e.clientY);
    const blockSize = dragState?.blockSize || 1;
    updateDropIndicator(listEl, dropIndex, blockSize);
  });

  listEl.addEventListener('dragleave', (e) => {
    if (!listEl.contains(e.relatedTarget)) {
      listEl.classList.remove('drag-over');
      listEl.querySelectorAll('.drop-placeholder').forEach((el) => el.remove());
    }
  });

  listEl.addEventListener('drop', (e) => {
    e.preventDefault();
    clearDropIndicators();
    const itemId = e.dataTransfer.getData('text/plain');
    const fromType = e.dataTransfer.getData('application/list-type');
    if (!itemId || !fromType) return;
    const toIndex = Number(listEl.dataset.dropIndex ?? getDropIndex(listEl, e.clientY));
    moveItem(fromType, listType, itemId, toIndex);
    dragState = null;
  });
}

function isAutoWrapEnabled() {
  return !isAlarmBoard(currentMemo) && currentMemo.autoWrap !== false;
}

function focusItemInput(listType, index) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const input = getListEl(listType).querySelectorAll('.todo-text')[index];
      if (!input) return;
      input.focus({ preventScroll: true });
      if (input.tagName === 'INPUT') {
        const len = input.value.length;
        input.setSelectionRange(len, len);
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
  });
}

function getTodoText(el) {
  if (el.tagName === 'INPUT') return el.value;
  return el.textContent.replace(/\u00a0/g, ' ').trimEnd();
}

function syncTodoTextPlaceholder(el) {
  if (el.tagName === 'INPUT') return;
  el.classList.toggle('is-empty', !getTodoText(el));
}

function placeCaretAtStart(el) {
  if (el.tagName === 'INPUT') {
    el.setSelectionRange(0, 0);
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function bindTodoTextEvents(input, items, index, listType) {
  const onChange = () => {
    items[index].text = getTodoText(input);
    syncTodoTextPlaceholder(input);
    saveData();
  };

  if (input.tagName === 'DIV') {
    input.addEventListener('mousedown', (e) => {
      if (getTodoText(input)) return;
      e.preventDefault();
      input.focus();
      placeCaretAtStart(input);
    });
    input.addEventListener('focus', () => {
      if (!getTodoText(input)) placeCaretAtStart(input);
    });
  }

  input.addEventListener('input', onChange);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      setItemDepth(listType, index, e.shiftKey ? 0 : 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      items[index].text = getTodoText(input);
      insertItemAfter(listType, index, items[index].depth || 0);
      return;
    }
    const empty = input.tagName === 'INPUT' ? !input.value : !getTodoText(input);
    if (e.key === 'Backspace' && empty && items.length > 1) {
      e.preventDefault();
      items.splice(index, 1);
      saveData();
      renderAllLists();
      focusItemInput(listType, Math.max(0, index - 1));
    }
  });

  if (input.tagName === 'DIV') {
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain').replace(/\r?\n/g, ' ');
      document.execCommand('insertText', false, text);
    });
  }
}

function createTodoTextField(item) {
  if (isAutoWrapEnabled()) {
    const input = document.createElement('div');
    input.className = 'todo-text wrap' + (item.text.trim() ? '' : ' is-empty');
    input.contentEditable = 'true';
    input.spellcheck = false;
    input.dataset.placeholder = '할일 입력...';
    input.textContent = item.text;
    return input;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'todo-text single-line';
  input.value = item.text;
  input.placeholder = '할일 입력...';
  return input;
}

function insertItemAfter(listType, index, depth = 0) {
  const items = getListByType(listType);
  const insertAt = Math.min(index + 1, items.length);
  items.splice(insertAt, 0, createTodoItem('', depth));
  saveData();
  renderAllLists();
  focusItemInput(listType, insertAt);
}

function setItemDepth(listType, index, depth) {
  const items = getListByType(listType);
  if (!items[index]) return;
  if (depth === 1 && !hasParentAbove(items, index)) return;
  items[index].depth = depth === 1 ? 1 : 0;
  saveData();
  renderAllLists();
  focusItemInput(listType, index);
}

function renderList(listEl, items, listType) {
  listEl.innerHTML = '';
  items.forEach((item, index) => {
    const li = document.createElement('li');
    const depth = item.depth === 1 ? 1 : 0;
    li.className = 'todo-item' + (item.done ? ' done' : '') + (depth === 1 ? ' sub-item' : '');
    li.dataset.id = item.id;

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.title = '드래그해서 옮기기';
    handle.draggable = true;
    handle.addEventListener('dragstart', (e) => {
      const blockIndices = getMoveBlockIndices(items, index);
      dragState = {
        itemId: item.id,
        listType,
        blockSize: blockIndices.length,
      };
      e.dataTransfer.setData('text/plain', item.id);
      e.dataTransfer.setData('application/list-type', listType);
      li.classList.add('dragging');
      blockIndices.slice(1).forEach((childIndex) => {
        const childLi = listEl.querySelector(`.todo-item[data-id="${items[childIndex].id}"]`);
        childLi?.classList.add('dragging-follow');
      });
    });
    handle.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      dragState = null;
      clearDropIndicators();
    });

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.done;

    const input = createTodoTextField(item);

    const indentBtn = document.createElement('button');
    indentBtn.className = 'btn-indent' + (depth === 1 ? ' active' : '');
    indentBtn.textContent = depth === 1 ? '‹' : '›';
    indentBtn.type = 'button';
    if (depth === 0 && !hasParentAbove(items, index)) {
      indentBtn.disabled = true;
    }
    indentBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setItemDepth(listType, index, depth === 1 ? 0 : 1);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = '삭제';

    checkbox.addEventListener('change', () => handleCheckboxChange(listType, index, checkbox.checked));
    bindTodoTextEvents(input, items, index, listType);
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasParent = (items[index].depth || 0) === 0;
      items.splice(index, 1);
      if (wasParent) {
        for (let i = index; i < items.length; i++) {
          if ((items[i].depth || 0) === 1) items[i].depth = 0;
          else break;
        }
      }
      saveData();
      renderAllLists();
    });

    li.append(handle, checkbox, indentBtn, input, deleteBtn);
    listEl.appendChild(li);
  });
}

function renderAllLists() {
  if (!currentMemo.today?.length) currentMemo.today = [createTodoItem()];
  if (!currentMemo.general?.length) currentMemo.general = [createTodoItem()];
  renderList(todayListEl, currentMemo.today, 'today');
  renderList(generalListEl, currentMemo.general, 'general');
  refreshFindIfOpen();
}

function renderAlarmList(listEl, alarms, recurring) {
  listEl.innerHTML = '';
  if (!alarms.length) {
    const empty = document.createElement('li');
    empty.className = 'alarm-item-meta';
    empty.style.padding = '4px 2px';
    empty.textContent = recurring ? '등록된 주기적 알람이 없습니다' : '등록된 1회성 알람이 없습니다';
    listEl.appendChild(empty);
    return;
  }

  alarms.forEach((alarm, index) => {
    const li = document.createElement('li');
    li.className = 'alarm-item' + (alarm.fired || alarm.enabled === false ? ' disabled' : '');

    const main = document.createElement('div');
    main.className = 'alarm-item-main';

    const title = document.createElement('div');
    title.className = 'alarm-item-title';
    title.textContent = alarm.title || '(제목 없음)';

    const meta = document.createElement('div');
    meta.className = 'alarm-item-meta';
    meta.textContent = formatAlarmTimeMeta(alarm, recurring) + (alarm.fired ? ' · 완료' : '');

    main.append(title, meta);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = '삭제';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      alarms.splice(index, 1);
      saveData();
      renderAlarmLists();
    });

    li.addEventListener('click', () => openAlarmForm(recurring ? 'recurring' : 'once', alarm));

    li.append(main, deleteBtn);
    listEl.appendChild(li);
  });
}

function renderAlarmLists() {
  if (!isAlarmBoard(currentMemo)) return;
  renderAlarmList(onceAlarmListEl, currentMemo.onceAlarms, false);
  renderAlarmList(recurringAlarmListEl, currentMemo.recurringAlarms, true);
  refreshFindIfOpen();
}

function addItem(listType, depth = 0) {
  getListByType(listType).push(createTodoItem('', depth));
  saveData();
  renderAllLists();
  focusItemInput(listType, getListByType(listType).length - 1);
}

function clampPaperGray(value) {
  return Math.max(6, Math.min(96, Number(value) || 94));
}

function getMemoColorState(memo) {
  const isAlarm = isAlarmBoard(memo);
  if ((memo.colorMode || 'hue') === 'gray') {
    return {
      mode: 'gray',
      gray: clampPaperGray(memo.colorGray ?? (isAlarm ? 30 : 94)),
    };
  }
  return {
    mode: 'hue',
    hue: memo.colorHue ?? (isAlarm ? 200 : 54),
  };
}

function applyMemoColor(memo) {
  const color = getMemoColorState(memo);
  if (color.mode === 'gray') {
    const paper = color.gray;
    const top = Math.min(98, paper + 3);
    const bottom = Math.max(4, paper - 4);
    postitEl.dataset.colorMode = 'gray';
    postitEl.style.backgroundColor = `hsl(0, 0%, ${paper}%)`;
    postitEl.style.background = `linear-gradient(165deg, hsl(0, 0%, ${top}%) 0%, hsl(0, 0%, ${paper}%) 48%, hsl(0, 0%, ${bottom}%) 100%)`;
    postitEl.classList.toggle('postit-gray-dark', paper < 52);
    postitEl.classList.toggle('postit-gray-light', paper >= 52);
  } else {
    delete postitEl.dataset.colorMode;
    postitEl.style.removeProperty('background');
    postitEl.style.removeProperty('background-color');
    postitEl.style.setProperty('--hue', color.hue);
    document.documentElement.style.setProperty('--hue', color.hue);
    postitEl.classList.remove('postit-gray-dark', 'postit-gray-light');
  }
}

function applyTabColor(btn, item) {
  const isAlarm = isAlarmBoard(item);
  const color = getMemoColorState(item);
  if (color.mode === 'gray') {
    btn.style.removeProperty('--tab-hue');
    btn.style.background = `hsl(0, 0%, ${color.gray}%)`;
  } else {
    btn.style.removeProperty('background');
    btn.style.setProperty('--tab-hue', color.hue);
  }
}

function updateColorSliderUI(memo) {
  if (!colorSlider) return;
  const color = getMemoColorState(memo);
  const colorLabel = document.getElementById('color-label');
  if (color.mode === 'gray') {
    colorSlider.min = '0';
    colorSlider.max = '100';
    colorSlider.value = String(color.gray);
    colorSlider.classList.add('color-slider-gray');
    if (colorLabel) {
      colorLabel.textContent = isAlarmBoard(memo) ? '알람지 색' : '메모지 색';
    }
  } else {
    colorSlider.min = '0';
    colorSlider.max = '360';
    colorSlider.value = String(color.hue);
    colorSlider.classList.remove('color-slider-gray');
    if (colorLabel) {
      colorLabel.textContent = isAlarmBoard(memo) ? '알람 색상' : '메모 색상';
    }
  }
}

function saveColorFromSlider(value) {
  const n = Number(value);
  if ((currentMemo.colorMode || 'hue') === 'gray') {
    currentMemo.colorGray = n;
  } else {
    currentMemo.colorHue = n;
  }
  saveData();
  renderMemoSidebar();
}

function toggleColorModeEasterEgg() {
  if (!currentMemo) return;
  if ((currentMemo.colorMode || 'hue') === 'hue') {
    currentMemo.colorMode = 'gray';
    if (currentMemo.colorGray === undefined) {
      currentMemo.colorGray = isAlarmBoard(currentMemo) ? 30 : 94;
    }
  } else {
    currentMemo.colorMode = 'hue';
  }
  applyMemoColor(currentMemo);
  updateColorSliderUI(currentMemo);
  saveData();
  renderMemoSidebar();
}

function renderMemoSidebar() {
  memoListEl.innerHTML = '';
  appState.memoOrder.forEach((id) => {
    const item = appState.memos[id];
    if (!item) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    const isAlarm = isAlarmBoard(item);
    btn.className = 'memo-tab' + (isAlarm ? ' alarm-tab' : '') + (id === appState.activeMemoId ? ' active' : '');
    applyTabColor(btn, item);
    const syncMeta = getMemoSyncGroupMeta(item);
    if (syncMeta) {
      btn.classList.add('sync-tab', `sync-g${syncMeta.index % 6}`);
    }
    let tabTitle = appState.memoOrder.length > 1
      ? `${isAlarm ? '알람' : '메모'} · ${item.id}\n클릭: 전환 · 우클릭: 삭제`
      : item.id;
    if (syncMeta) tabTitle += `\n☁ ${syncMeta.group.key}`;
    btn.title = tabTitle;
    if (isAlarm) {
      btn.appendChild(createBellSvg(item.colorHue ?? 200, 16));
    }
    btn.addEventListener('click', () => switchMemo(id));
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      promptDeleteMemo(id);
    });
    memoListEl.appendChild(btn);
  });
  updateDeleteMemoButton();
}

function updateDeleteMemoButton() {
  const btn = document.getElementById('btn-delete-memo');
  if (!btn) return;
  const canDelete = appState.memoOrder.length > 1;
  btn.disabled = !canDelete;
  const isAlarm = isAlarmBoard(currentMemo);
  btn.textContent = isAlarm ? '이 알람 삭제' : '이 메모 삭제';
  btn.title = canDelete
    ? (isAlarm ? '현재 알람 삭제' : '현재 메모 삭제')
    : '마지막 항목은 삭제할 수 없습니다';
}

function normalizePopupSizePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(20, Math.round(n)));
}

function updateSettingsForType() {
  const isAlarm = isAlarmBoard(currentMemo);
  document.getElementById('btn-open-archive').style.display = isAlarm ? 'none' : '';
  const archiveRow = document.querySelector('.settings-archive-row');
  if (archiveRow) archiveRow.style.display = isAlarm ? 'none' : '';
  const syncBlock = document.getElementById('sync-settings-block');
  if (syncBlock) syncBlock.style.display = isAlarm ? 'none' : '';
  const btnArchiveReport = document.getElementById('btn-archive-report');
  if (btnArchiveReport) btnArchiveReport.style.display = isAlarm ? 'none' : '';
  const autoWrapRow = document.getElementById('auto-wrap-row');
  if (autoWrapRow) autoWrapRow.style.display = isAlarm ? 'none' : '';
  const alarmSizeRow = document.getElementById('alarm-size-row');
  if (alarmSizeRow) alarmSizeRow.style.display = isAlarm ? '' : 'none';
}

function refreshActiveUI() {
  applyMemoColor(currentMemo);
  todayDateEl.textContent = formatKSTDate(getKSTDate());

  const isAlarm = isAlarmBoard(currentMemo);

  memoViewEl.classList.toggle('hidden', isAlarm);
  alarmViewEl.classList.toggle('hidden', !isAlarm);
  memoFooterEl.classList.toggle('hidden', isAlarm);
  updateSettingsForType();
  updateColorSliderUI(currentMemo);
  const autoWrapEl = document.getElementById('auto-wrap');
  if (autoWrapEl && !isAlarm) autoWrapEl.checked = currentMemo.autoWrap !== false;
  const alarmSizeEl = document.getElementById('alarm-popup-size');
  if (alarmSizeEl && isAlarm) {
    alarmSizeEl.value = normalizePopupSizePercent(currentMemo.popupSizePercent);
  }

  if (isAlarm) {
    renderAlarmLists();
  } else {
    renderAllLists();
  }
  renderMemoSidebar();
}

function promptDeleteMemo(memoId) {
  if (appState.memoOrder.length <= 1 || !appState.memos[memoId]) return;
  pendingDeleteMemoId = memoId;
  const target = appState.memos[memoId];
  const isAlarm = isAlarmBoard(target);
  document.getElementById('delete-modal-title').textContent = isAlarm ? '알람 삭제' : '메모 삭제';
  document.getElementById('delete-modal-message').innerHTML = isAlarm
    ? '이 알람 목록이 삭제됩니다.'
    : '이 메모의 할일 목록이 삭제됩니다.<br>완료 기록 폴더는 유지됩니다.';
  deleteModal.classList.remove('hidden');
}

function closeDeleteModal() {
  pendingDeleteMemoId = null;
  deleteModal.classList.add('hidden');
}

function deleteMemo(memoId) {
  if (appState.memoOrder.length <= 1 || !appState.memos[memoId]) return;

  if (!appState.deletedMemos) appState.deletedMemos = {};
  if (!appState.deletedMemoGroups) appState.deletedMemoGroups = {};
  appState.deletedMemos[memoId] = new Date().toISOString();
  appState.deletedMemoGroups[memoId] = appState.memos[memoId].syncGroupId || getDefaultSyncGroupId();

  const orderIndex = appState.memoOrder.indexOf(memoId);
  delete appState.memos[memoId];
  appState.memoOrder = appState.memoOrder.filter((id) => id !== memoId);

  if (appState.activeMemoId === memoId) {
    const nextIndex = Math.min(orderIndex, appState.memoOrder.length - 1);
    appState.activeMemoId = appState.memoOrder[nextIndex];
    currentMemo = appState.memos[appState.activeMemoId];
  }

  saveAppState();
  closeDeleteModal();
  refreshActiveUI();
}

function switchMemo(memoId) {
  if (!appState.memos[memoId] || memoId === appState.activeMemoId) return;
  appState.activeMemoId = memoId;
  currentMemo = appState.memos[memoId];
  saveAppState();
  refreshActiveUI();
}

function openCreateTypeModal() {
  createTypeModal.classList.remove('hidden');
}

function closeCreateTypeModal() {
  createTypeModal.classList.add('hidden');
}

async function createNewMemo() {
  const id = generateMemoId();
  if (window.electronAPI?.createMemoFolder) {
    await window.electronAPI.createMemoFolder(id);
  }
  const hues = [54, 45, 120, 200, 280, 15];
  const hue = hues[appState.memoOrder.length % hues.length];
  appState.memos[id] = createEmptyMemo(id);
  appState.memos[id].colorHue = hue;
  appState.memoOrder.push(id);
  appState.activeMemoId = id;
  currentMemo = appState.memos[id];
  saveAppState();
  closeCreateTypeModal();
  refreshActiveUI();
}

async function createNewAlarmBoard() {
  const id = generateMemoId();
  const hues = [200, 220, 180, 260, 15, 54];
  const hue = hues[appState.memoOrder.length % hues.length];
  appState.memos[id] = createEmptyAlarm(id);
  appState.memos[id].colorHue = hue;
  appState.memoOrder.push(id);
  appState.activeMemoId = id;
  currentMemo = appState.memos[id];
  saveAppState();
  closeCreateTypeModal();
  refreshActiveUI();
}

function setDayPickerSelection(days) {
  document.querySelectorAll('#alarm-day-picker .day-btn').forEach((btn) => {
    const day = Number(btn.dataset.day);
    btn.classList.toggle('active', days.includes(day));
  });
}

function getDayPickerSelection() {
  return [...document.querySelectorAll('#alarm-day-picker .day-btn.active')]
    .map((btn) => Number(btn.dataset.day));
}

function updateAlarmFormMode(repeat) {
  document.getElementById('alarm-date-row').classList.toggle('hidden', repeat);
  document.getElementById('alarm-days-row').classList.toggle('hidden', !repeat);
}

function openAlarmForm(kind, alarm = null) {
  editingAlarmContext = { kind, alarmId: alarm?.id || null };
  document.getElementById('alarm-form-title').textContent = alarm ? '알람 수정' : '알람 추가';
  document.getElementById('alarm-title-input').value = alarm?.title || '';
  document.getElementById('alarm-content-input').value = alarm?.content || '';
  document.getElementById('alarm-time-input').value = alarm?.time || '09:00';
  document.getElementById('alarm-date-input').value = alarm?.date || getDateKey(getKSTDate());
  document.getElementById('alarm-repeat-input').checked = kind === 'recurring';
  setDayPickerSelection(alarm?.daysOfWeek || [getKSTDate().getDay()]);
  updateAlarmFormMode(kind === 'recurring');
  alarmFormModal.classList.remove('hidden');
  const scrollEl = alarmFormModal.querySelector('.modal-form-scroll');
  if (scrollEl) scrollEl.scrollTop = 0;
  document.getElementById('alarm-title-input').focus();
}

function closeAlarmForm() {
  editingAlarmContext = null;
  alarmFormModal.classList.add('hidden');
}

function saveAlarmForm() {
  const title = document.getElementById('alarm-title-input').value.trim();
  const content = document.getElementById('alarm-content-input').value.trim();
  const time = document.getElementById('alarm-time-input').value;
  const date = document.getElementById('alarm-date-input').value;
  const repeat = document.getElementById('alarm-repeat-input').checked;
  const daysOfWeek = getDayPickerSelection();

  if (!title) {
    document.getElementById('alarm-title-input').focus();
    return;
  }
  if (!time) return;
  if (repeat && daysOfWeek.length === 0) return;
  if (!repeat && !date) return;

  const targetList = repeat ? currentMemo.recurringAlarms : currentMemo.onceAlarms;
  const otherList = repeat ? currentMemo.onceAlarms : currentMemo.recurringAlarms;

  if (editingAlarmContext?.alarmId) {
    const idx = targetList.findIndex((a) => a.id === editingAlarmContext.alarmId);
    const otherIdx = otherList.findIndex((a) => a.id === editingAlarmContext.alarmId);

    if (idx !== -1) {
      Object.assign(targetList[idx], { title, content, time, date, daysOfWeek, fired: false, lastTriggeredAt: null });
    } else if (otherIdx !== -1) {
      otherList.splice(otherIdx, 1);
      targetList.push(createAlarmItem({ title, content, time, date, daysOfWeek }));
    }
  } else {
    targetList.push(createAlarmItem({ title, content, time, date, daysOfWeek }));
  }

  saveData();
  closeAlarmForm();
  renderAlarmLists();
}

function getTriggerKey(now, alarm) {
  return `${getDateKey(now)}-${alarm.time}-${alarm.id}`;
}

function shouldTriggerAlarm(alarm, now, recurring) {
  if (!alarm.enabled || alarm.fired) return false;

  const [hour, minute] = alarm.time.split(':').map(Number);
  if (now.getHours() !== hour || now.getMinutes() !== minute) return false;

  const triggerKey = getTriggerKey(now, alarm);
  if (alarm.lastTriggeredAt === triggerKey) return false;

  if (recurring) {
    return alarm.daysOfWeek.includes(now.getDay());
  }
  return alarm.date === getDateKey(now);
}

function markAlarmTriggered(alarm, now, recurring) {
  alarm.lastTriggeredAt = getTriggerKey(now, alarm);
  if (!recurring) alarm.fired = true;
}

function dismissAlarmRing() {
  isAlarmRingOpen = false;
  processAlarmQueue();
}

async function processAlarmQueue() {
  if (isAlarmRingOpen || alarmQueue.length === 0) return;
  const next = alarmQueue.shift();
  await showAlarmRingPopup(next);
}

async function showAlarmRingPopup(payload) {
  isAlarmRingOpen = true;
  try {
    if (window.electronAPI?.showAlarmPopup) {
      await window.electronAPI.showAlarmPopup({
        title: payload.title,
        content: payload.content,
        sizePercent: normalizePopupSizePercent(payload.popupSizePercent),
      });
    }
  } catch {
    await window.electronAPI?.forceCloseAlarmPopup?.();
  } finally {
    dismissAlarmRing();
  }
}

function enqueueAlarmRing(alarm, popupSizePercent) {
  alarmQueue.push({
    title: alarm.title,
    content: alarm.content,
    popupSizePercent: normalizePopupSizePercent(popupSizePercent),
  });
  processAlarmQueue();
}

function checkAllAlarms() {
  const now = getKSTDate();
  let changed = false;

  appState.memoOrder.forEach((boardId) => {
    const board = appState.memos[boardId];
    if (!isAlarmBoard(board)) return;

    board.onceAlarms.forEach((alarm) => {
      if (shouldTriggerAlarm(alarm, now, false)) {
        markAlarmTriggered(alarm, now, false);
        enqueueAlarmRing(alarm, board.popupSizePercent);
        changed = true;
      }
    });

    board.recurringAlarms.forEach((alarm) => {
      if (shouldTriggerAlarm(alarm, now, true)) {
        markAlarmTriggered(alarm, now, true);
        enqueueAlarmRing(alarm, board.popupSizePercent);
        changed = true;
      }
    });
  });

  if (changed) {
    saveAppState();
    if (isAlarmBoard(currentMemo)) renderAlarmLists();
  }
}

function buildSummary() {
  const date = formatKSTDate(getKSTDate());
  const completedToday = currentMemo.today.filter((t) => t.done && t.text.trim());
  const completedGeneral = currentMemo.general.filter((t) => t.done && t.text.trim());

  if (completedToday.length === 0 && completedGeneral.length === 0) {
    return `${date}\n\n완료한 일이 없습니다.`;
  }

  const lines = [];

  completedToday.forEach((t) => lines.push(formatSummaryLine(t.text, t.depth || 0)));
  if (completedToday.length > 0 && completedGeneral.length > 0) lines.push('');
  completedGeneral.forEach((t) => lines.push(formatSummaryLine(t.text, t.depth || 0)));

  return lines.join('\n');
}

document.querySelectorAll('.btn-add[data-list]').forEach((btn) => {
  btn.addEventListener('click', () => addItem(btn.dataset.list));
});

document.getElementById('btn-new-memo').addEventListener('click', openCreateTypeModal);
document.getElementById('btn-create-memo').addEventListener('click', () => createNewMemo());
document.getElementById('btn-create-alarm').addEventListener('click', () => createNewAlarmBoard());
const createAlarmIconEl = document.querySelector('#btn-create-alarm .alarm-icon');
if (createAlarmIconEl) createAlarmIconEl.appendChild(createBellSvg(200, 26));
createTypeModal.querySelector('.modal-backdrop').addEventListener('click', closeCreateTypeModal);

document.getElementById('btn-add-once-alarm').addEventListener('click', () => openAlarmForm('once'));
document.getElementById('btn-add-recurring-alarm').addEventListener('click', () => openAlarmForm('recurring'));
document.getElementById('btn-save-alarm').addEventListener('click', saveAlarmForm);
document.getElementById('btn-cancel-alarm').addEventListener('click', closeAlarmForm);
alarmFormModal.querySelector('.modal-backdrop').addEventListener('click', closeAlarmForm);

document.getElementById('alarm-repeat-input').addEventListener('change', (e) => {
  updateAlarmFormMode(e.target.checked);
});

document.querySelectorAll('#alarm-day-picker .day-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
  });
});

const summaryModal = document.getElementById('summary-modal');
const summaryText = document.getElementById('summary-text');

document.getElementById('btn-summary').addEventListener('click', async () => {
  summaryText.value = buildSummary();
  const completedToday = currentMemo.today.filter((t) => t.done && t.text.trim());
  if (completedToday.length > 0) {
    await archiveItems(currentMemo.id, getTodayKey(), completedToday);
  }
  summaryModal.classList.remove('hidden');
});

document.getElementById('btn-close-modal').addEventListener('click', () => {
  summaryModal.classList.add('hidden');
});

summaryModal.querySelector('.modal-backdrop').addEventListener('click', () => {
  summaryModal.classList.add('hidden');
});

document.getElementById('btn-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(summaryText.value);
    const btn = document.getElementById('btn-copy');
    const orig = btn.textContent;
    btn.textContent = '복사됨!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  } catch {
    summaryText.select();
    document.execCommand('copy');
  }
});

const settingsPanel = document.getElementById('settings-panel');
const settingsBtn = document.getElementById('btn-settings');
const colorSlider = document.getElementById('color-slider');
const colorLabelEl = document.getElementById('color-label');

settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
  settingsBtn.classList.toggle('active');
});

colorSlider.addEventListener('input', () => {
  applyMemoColor(currentMemo);
  saveColorFromSlider(Number(colorSlider.value));
});

let colorLabelClickCount = 0;
let colorLabelClickTimer = null;
colorLabelEl?.addEventListener('click', (e) => {
  colorLabelClickCount += 1;
  if (colorLabelClickTimer) clearTimeout(colorLabelClickTimer);
  colorLabelClickTimer = setTimeout(() => {
    colorLabelClickCount = 0;
  }, 550);
  if (colorLabelClickCount >= 3) {
    colorLabelClickCount = 0;
    e.preventDefault();
    toggleColorModeEasterEgg();
  }
});

const autoWrapEl = document.getElementById('auto-wrap');
if (autoWrapEl) {
  autoWrapEl.addEventListener('change', () => {
    if (isAlarmBoard(currentMemo)) return;
    currentMemo.autoWrap = autoWrapEl.checked;
    saveData();
    renderAllLists();
  });
}

const alarmPopupSizeEl = document.getElementById('alarm-popup-size');
if (alarmPopupSizeEl) {
  const applyAlarmPopupSize = () => {
    if (!isAlarmBoard(currentMemo)) return;
    const size = normalizePopupSizePercent(alarmPopupSizeEl.value);
    alarmPopupSizeEl.value = size;
    currentMemo.popupSizePercent = size;
    saveData();
  };
  alarmPopupSizeEl.addEventListener('change', applyAlarmPopupSize);
  alarmPopupSizeEl.addEventListener('blur', applyAlarmPopupSize);
}

const btnOpenArchive = document.getElementById('btn-open-archive');
if (btnOpenArchive) {
  if (window.electronAPI?.openArchiveFolder) {
    btnOpenArchive.addEventListener('click', () => {
      window.electronAPI.openArchiveFolder(currentMemo.id);
    });
  } else {
    btnOpenArchive.style.display = 'none';
  }
}

const btnArchiveReport = document.getElementById('btn-archive-report');
if (btnArchiveReport) {
  if (window.electronAPI?.openArchiveReportWindow) {
    btnArchiveReport.addEventListener('click', () => {
      if (!isAlarmBoard(currentMemo)) {
        window.electronAPI.openArchiveReportWindow(currentMemo.id);
      }
    });
  } else {
    btnArchiveReport.style.display = 'none';
  }
}

document.getElementById('btn-delete-memo').addEventListener('click', () => {
  promptDeleteMemo(appState.activeMemoId);
});

document.getElementById('btn-confirm-delete').addEventListener('click', () => {
  if (pendingDeleteMemoId) deleteMemo(pendingDeleteMemoId);
});

document.getElementById('btn-cancel-delete').addEventListener('click', closeDeleteModal);
deleteModal.querySelector('.modal-backdrop').addEventListener('click', closeDeleteModal);

const syncEnabledEl = document.getElementById('sync-enabled');
const calendarAutoImportEl = document.getElementById('calendar-auto-import');
const syncSignedInBlock = document.getElementById('sync-signed-in-block');
const syncStatusEl = document.getElementById('sync-status');
const syncSettingsBlock = document.getElementById('sync-settings-block');
const googleAccountLabel = document.getElementById('google-account-label');
const btnGoogleLogout = document.getElementById('btn-google-logout');
const btnSyncPull = document.getElementById('btn-sync-pull');
const btnSyncNow = document.getElementById('btn-sync-now');
let syncDebounceTimer = null;
let syncInFlight = false;
let syncPending = false;

function formatSyncTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function updateGoogleSyncUI(config) {
  const signedIn = Boolean(config?.googleAuth?.email);
  const enabled = Boolean(config?.syncEnabled);

  syncSignedInBlock?.classList.toggle('hidden', !(enabled && signedIn));
  syncStatusEl?.classList.toggle('hidden', !enabled);

  if (googleAccountLabel) {
    googleAccountLabel.textContent = signedIn ? config.googleAuth.email : '';
  }
  if (calendarAutoImportEl) {
    calendarAutoImportEl.checked = Boolean(config.calendarAutoImport);
  }
}

function mergeCalendarEventsIntoToday(memo, events, dateKey) {
  if (!memo || isAlarmBoard(memo)) return { added: 0, updated: 0, removed: 0, changed: false };
  if (!Array.isArray(memo.today)) memo.today = [createTodoItem()];

  const remoteIds = new Set((events || []).map((event) => event.id).filter(Boolean));
  let removed = 0;

  memo.today = memo.today.filter((item) => {
    if (!item.calendarEventId) return true;
    if (item.calendarDate !== dateKey) return true;
    if (remoteIds.has(item.calendarEventId)) return true;
    removed += 1;
    return false;
  });

  const byEventId = new Map(
    memo.today
      .filter((item) => item.calendarEventId)
      .map((item) => [item.calendarEventId, item]),
  );

  let added = 0;
  let updated = 0;
  (events || []).forEach((event) => {
    if (!event?.id) return;
    const existing = byEventId.get(event.id);
    if (existing) {
      if (existing.text !== event.text) {
        existing.text = event.text;
        updated += 1;
      }
      existing.calendarDate = dateKey;
      return;
    }

    const newItem = {
      id: createId(),
      text: event.text,
      done: false,
      depth: 0,
      calendarEventId: event.id,
      calendarDate: dateKey,
    };

    const emptyIdx = memo.today.findIndex((item) => !item.text.trim() && !item.done && !item.calendarEventId);
    if (emptyIdx >= 0) memo.today.splice(emptyIdx, 0, newItem);
    else memo.today.push(newItem);
    byEventId.set(event.id, newItem);
    added += 1;
  });

  if (!memo.today.length) memo.today.push(createTodoItem());
  memo.updatedAt = new Date().toISOString();
  const changed = added > 0 || updated > 0 || removed > 0;
  return { added, updated, removed, changed };
}

async function importCalendarToToday(options = {}) {
  if (!window.electronAPI?.fetchCalendarToday || !currentMemo || isAlarmBoard(currentMemo)) {
    return { added: 0, skipped: true };
  }

  let config = syncConfigCache?.googleAuth?.email
    ? syncConfigCache
    : await window.electronAPI.getSyncConfig();

  if (!config.googleAuth?.email) {
    if (options.promptLogin) {
      throw new Error('google_not_signed_in');
    }
    return { added: 0, skipped: true };
  }

  if (!config.googleAuth?.calendarScopeGranted) {
    if (options.silent || options.skipAuthPrompt) {
      return { added: 0, updated: 0, removed: 0, skipped: true, changed: false };
    }
    if (!window.electronAPI?.googleRequestCalendar) {
      throw new Error('calendar_permission_denied');
    }
    syncConfigCache = await window.electronAPI.googleRequestCalendar();
    config = syncConfigCache;
  }

  const dateKey = getTodayKey();
  let events;
  try {
    events = await window.electronAPI.fetchCalendarToday(dateKey);
  } catch (err) {
    if (
      err.message === 'calendar_permission_denied'
      && window.electronAPI?.googleRequestCalendar
      && !options.silent
    ) {
      syncConfigCache = await window.electronAPI.googleRequestCalendar();
      events = await window.electronAPI.fetchCalendarToday(dateKey);
    } else {
      throw err;
    }
  }

  const mergeResult = mergeCalendarEventsIntoToday(currentMemo, events, dateKey);
  if (mergeResult.changed || options.alwaysSave) {
    saveAppState({ skipSync: true });
    renderAllLists();
  }
  return {
    ...mergeResult,
    total: events?.length || 0,
  };
}

async function runAutoCalendarImport() {
  await refreshSyncConfigCache();
  if (!syncConfigCache.calendarAutoImport) return;
  if (!syncConfigCache.googleAuth?.email) return;
  if (!syncConfigCache.googleAuth?.calendarScopeGranted) return;
  if (!currentMemo || isAlarmBoard(currentMemo)) return;

  try {
    await importCalendarToToday({ silent: true, skipAuthPrompt: true });
  } catch (err) {
    console.error('auto calendar import failed', err);
  }
}

async function ensureCalendarAutoReady() {
  let config = syncConfigCache?.googleAuth?.email
    ? syncConfigCache
    : await window.electronAPI.getSyncConfig();

  if (!config.googleAuth?.email) {
    if (!syncEnabledEl?.checked) {
      syncEnabledEl.checked = true;
    }
    await ensureGoogleLogin();
    config = syncConfigCache;
  }

  if (!config.googleAuth?.calendarScopeGranted) {
    syncConfigCache = await window.electronAPI.googleRequestCalendar();
  }
}

async function handleImportCalendarClick() {
  if (!currentMemo || isAlarmBoard(currentMemo)) return;

  try {
    let config = await window.electronAPI.getSyncConfig();
    if (!config.googleAuth?.email) {
      if (!syncEnabledEl?.checked) {
        alert('먼저 설정에서 Google 로그인 동기화를 켜 주세요.');
        return;
      }
      await ensureGoogleLogin();
      config = syncConfigCache;
    }

    const btn = document.getElementById('btn-import-calendar');
    if (btn) btn.disabled = true;

    const result = await importCalendarToToday({ promptLogin: true, alwaysSave: true });
    if (result.added > 0) {
      alert(`캘린더 일정 ${result.added}개를 오늘 할일에 추가했습니다.`);
    } else if (result.updated > 0 || result.removed > 0) {
      alert('캘린더 일정을 업데이트했습니다.');
    } else if (result.total > 0) {
      alert('오늘 캘린더 일정은 이미 반영되어 있습니다.');
    } else {
      alert('오늘 등록된 캘린더 일정이 없습니다.');
    }
  } catch (err) {
    alert(getSyncErrorMessage(err.message));
  } finally {
    const btn = document.getElementById('btn-import-calendar');
    if (btn) btn.disabled = false;
  }
}

async function refreshSyncConfigCache() {
  if (!window.electronAPI?.getSyncConfig) return;
  syncConfigCache = await window.electronAPI.getSyncConfig();
}

async function updateSyncStatusUI() {
  if (!window.electronAPI?.getSyncConfig || !syncStatusEl) return;
  await refreshSyncConfigCache();
  const config = syncConfigCache;
  updateGoogleSyncUI(config);

  if (!config.syncEnabled) {
    syncStatusEl.textContent = '';
    return;
  }

  const when = formatSyncTime(config.lastSyncAt);
  const pullHint = config.cloudPullEnabled
    ? ' · 클라우드와 자동 맞춤'
    : ' · 업로드만 (불러오기 전)';
  const calendarHint = config.calendarAutoImport ? ' · 캘린더 1시간마다' : '';
  syncStatusEl.textContent = when
    ? `마지막 동기화: ${when}${pullHint}${calendarHint}`
    : (config.googleAuth?.email ? '동기화 대기 중…' : '체크하면 Google 로그인 창이 열립니다');
}

function scheduleCloudSync(immediate = false) {
  if (!window.electronAPI?.syncMerge) return;
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  if (immediate) {
    runCloudSync();
    return;
  }
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    runCloudSync();
  }, SYNC_DEBOUNCE_MS);
}

async function applySyncResult(result) {
  if (result?.appState) {
    appState = migrateData(result.appState);
    currentMemo = appState.memos[appState.activeMemoId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    refreshActiveUI();
  }
  await refreshSyncConfigCache();
  await updateSyncStatusUI();
}

async function runCloudSync() {
  if (!window.electronAPI?.syncMerge) return;
  const config = await window.electronAPI.getSyncConfig();
  if (!config.syncEnabled) return;
  if (!config.googleAuth?.email) return;

  if (syncInFlight) {
    syncPending = true;
    return;
  }

  syncInFlight = true;
  try {
    const result = await window.electronAPI.syncMerge(appState);
    if (result?.skipped) return;
    await applySyncResult(result);
  } catch (err) {
    console.error('cloud sync failed', err);
    if (syncStatusEl) {
      syncStatusEl.textContent = `동기화 실패: ${getSyncErrorMessage(err.message)}`;
    }
  } finally {
    syncInFlight = false;
    if (syncPending) {
      syncPending = false;
      scheduleCloudSync(true);
    }
  }
}

function getSyncErrorMessage(code) {
  const key = String(code || '');
  if (key.includes('EADDRINUSE')) {
    return '로그인 포트가 사용 중입니다. Memos를 완전히 종료(Cmd+Q)한 뒤 다시 시도해 주세요.';
  }
  return ({
    sync_api_not_configured: '동기화 API가 설정되지 않았습니다. 앱을 다시 설치해 주세요.',
    google_oauth_not_configured: 'Google OAuth가 설정되지 않았습니다.',
    google_not_signed_in: 'Google 로그인이 필요합니다.',
    google_missing_refresh_token: 'Google 로그인을 다시 해 주세요.',
    unauthorized: 'Google 로그인이 만료되었습니다. 다시 로그인해 주세요.',
    not_found: '클라우드에 저장된 메모가 없습니다.',
    too_large: '메모 데이터가 너무 큽니다 (8MB 이하).',
    access_denied: 'Google 로그인이 거부되었습니다. GCP OAuth 동의 화면에 본인 Gmail을 테스트 사용자로 추가했는지 확인해 주세요.',
    invalid_oauth_callback: 'Google 로그인에 실패했습니다.',
    oauth_port_in_use: '로그인 포트가 사용 중입니다. Memos를 완전히 종료한 뒤 다시 시도해 주세요.',
    oauth_login_timeout: 'Google 로그인 시간이 초과되었습니다. 다시 시도해 주세요.',
    redirect_uri_mismatch: 'Google OAuth redirect URI가 맞지 않습니다. GCP Console에 http://127.0.0.1:47829/callback 을 등록해 주세요.',
    token_exchange_failed: 'Google 토큰 교환에 실패했습니다. OAuth redirect URI 설정을 확인해 주세요.',
    token_refresh_failed: 'Google 로그인이 만료되었습니다. 다시 로그인해 주세요.',
    calendar_permission_denied: '캘린더 권한이 필요합니다. 버튼을 다시 눌러 Google 캘린더 접근을 허용해 주세요.',
    calendar_fetch_failed: '캘린더 일정을 불러오지 못했습니다.',
  })[code] || `동기화 오류: ${code}`;
}

async function ensureGoogleLogin() {
  if (!window.electronAPI?.googleLogin) throw new Error('google_oauth_not_configured');
  const config = await window.electronAPI.getSyncConfig();
  if (config.googleAuth?.email) {
    syncConfigCache = config;
    return config;
  }
  syncConfigCache = await window.electronAPI.googleLogin();
  if (syncEnabledEl) syncEnabledEl.checked = true;
  updateGoogleSyncUI(syncConfigCache);
  renderMemoSidebar();
  return syncConfigCache;
}

async function handleGoogleLogout() {
  if (!window.electronAPI?.googleLogout) return;
  if (!confirm('Google 계정 연결을 해제할까요?')) return;
  try {
    syncConfigCache = await window.electronAPI.googleLogout();
    if (syncEnabledEl) syncEnabledEl.checked = false;
    updateGoogleSyncUI({ syncEnabled: false, googleAuth: null });
    renderMemoSidebar();
    await updateSyncStatusUI();
  } catch (err) {
    alert(getSyncErrorMessage(err.message));
  }
}

async function handleSyncPull() {
  if (!window.electronAPI?.syncPull) return;
  if (!confirm('클라우드 메모를 이 기기로 불러올까요?\n로컬 메모와 병합됩니다.')) return;

  try {
    await ensureGoogleLogin();
    const result = await window.electronAPI.syncPull(appState);
    await applySyncResult(result);
    if (result?.empty) {
      alert('클라우드에 저장된 메모가 아직 없습니다.');
    } else {
      alert('클라우드 메모를 불러왔습니다.');
    }
  } catch (err) {
    alert(getSyncErrorMessage(err.message));
  }
}

async function initSyncSettings() {
  if (!window.electronAPI?.getSyncConfig || !syncEnabledEl) {
    syncSettingsBlock?.remove();
    return;
  }

  const config = await window.electronAPI.getSyncConfig();
  syncConfigCache = config;
  syncEnabledEl.checked = Boolean(config.syncEnabled);
  if (calendarAutoImportEl) calendarAutoImportEl.checked = Boolean(config.calendarAutoImport);
  updateGoogleSyncUI(config);
  await updateSyncStatusUI();

  syncEnabledEl.addEventListener('change', async () => {
    const enabled = syncEnabledEl.checked;
    try {
      if (enabled) {
        await ensureGoogleLogin();
        await window.electronAPI.setSyncSettings({ syncEnabled: true });
        await runCloudSync();
      } else {
        await window.electronAPI.setSyncSettings({ syncEnabled: false });
      }
      await refreshSyncConfigCache();
      updateGoogleSyncUI(syncConfigCache);
      renderMemoSidebar();
      await updateSyncStatusUI();
    } catch (err) {
      syncEnabledEl.checked = !enabled;
      updateGoogleSyncUI({
        syncEnabled: syncEnabledEl.checked,
        googleAuth: syncConfigCache.googleAuth,
      });
      alert(getSyncErrorMessage(err.message));
    }
  });

  calendarAutoImportEl?.addEventListener('change', async () => {
    const enabled = calendarAutoImportEl.checked;
    try {
      if (enabled) {
        await ensureCalendarAutoReady();
        await window.electronAPI.setSyncSettings({ calendarAutoImport: true });
        await refreshSyncConfigCache();
        updateGoogleSyncUI(syncConfigCache);
        await importCalendarToToday({ alwaysSave: true, skipAuthPrompt: true });
      } else {
        await window.electronAPI.setSyncSettings({ calendarAutoImport: false });
        await refreshSyncConfigCache();
      }
      await updateSyncStatusUI();
    } catch (err) {
      calendarAutoImportEl.checked = !enabled;
      await window.electronAPI.setSyncSettings({ calendarAutoImport: calendarAutoImportEl.checked });
      alert(getSyncErrorMessage(err.message));
    }
  });
}

btnGoogleLogout?.addEventListener('click', handleGoogleLogout);
btnSyncPull?.addEventListener('click', handleSyncPull);
btnSyncNow?.addEventListener('click', () => runCloudSync());
document.getElementById('btn-import-calendar')?.addEventListener('click', handleImportCalendarClick);

const loginAtStartEl = document.getElementById('login-at-start');
if (loginAtStartEl && window.electronAPI?.getLoginSettings) {
  window.electronAPI.getLoginSettings().then(({ openAtLogin }) => {
    loginAtStartEl.checked = openAtLogin;
  });
  loginAtStartEl.addEventListener('change', () => {
    window.electronAPI.setLoginSettings(loginAtStartEl.checked);
  });
} else if (loginAtStartEl) {
  loginAtStartEl.closest('.setting-row').style.display = 'none';
}

if (window.electronAPI) {
  document.getElementById('btn-close').addEventListener('click', () => window.electronAPI.close());
  document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
}

setupDropZone(todayListEl, 'today');
setupDropZone(generalListEl, 'general');

const findBarEl = document.getElementById('find-bar');
const findInputEl = document.getElementById('find-input');
const findCountEl = document.getElementById('find-count');
const findState = { open: false, matches: [], index: -1 };

function clearFindHighlights() {
  document.querySelectorAll('.find-match, .find-current').forEach((el) => {
    el.classList.remove('find-match', 'find-current');
  });
}

function updateFindCount() {
  if (!findCountEl) return;
  if (!findState.matches.length) {
    findCountEl.textContent = findInputEl?.value.trim() ? '0' : '';
    return;
  }
  findCountEl.textContent = `${findState.index + 1}/${findState.matches.length}`;
}

function highlightFindMatch(index) {
  findState.matches.forEach((el) => el.classList.remove('find-current'));
  if (!findState.matches.length) {
    findState.index = -1;
    updateFindCount();
    return;
  }
  findState.index = ((index % findState.matches.length) + findState.matches.length) % findState.matches.length;
  const current = findState.matches[findState.index];
  current.classList.add('find-current');
  current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  updateFindCount();
}

function getTodoFieldText(el) {
  if (!el) return '';
  if (el.tagName === 'INPUT') return el.value || '';
  return getTodoText(el);
}

function collectFindMatches(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  if (isAlarmBoard(currentMemo)) {
    return [...document.querySelectorAll('.alarm-item')].filter((li) => {
      const title = li.querySelector('.alarm-item-title')?.textContent || '';
      const meta = li.querySelector('.alarm-item-meta')?.textContent || '';
      return `${title} ${meta}`.toLowerCase().includes(q);
    });
  }

  return [...document.querySelectorAll('.todo-item')].filter((li) => {
    const field = li.querySelector('.todo-text');
    return getTodoFieldText(field).toLowerCase().includes(q);
  });
}

function runFind(query, focusIndex = 0) {
  clearFindHighlights();
  findState.matches = collectFindMatches(query);
  findState.matches.forEach((el) => el.classList.add('find-match'));
  if (findState.matches.length) highlightFindMatch(focusIndex);
  else updateFindCount();
}

function refreshFindIfOpen() {
  if (!findState.open || !findInputEl) return;
  runFind(findInputEl.value, findState.index >= 0 ? findState.index : 0);
}

function openFindBar(selectAll = false) {
  if (!findBarEl || !findInputEl) return;
  findBarEl.classList.remove('hidden');
  findState.open = true;
  findInputEl.focus();
  if (selectAll) findInputEl.select();
  runFind(findInputEl.value, 0);
}

function closeFindBar() {
  if (!findBarEl || !findInputEl) return;
  findBarEl.classList.add('hidden');
  findState.open = false;
  findState.matches = [];
  findState.index = -1;
  findInputEl.value = '';
  if (findCountEl) findCountEl.textContent = '';
  clearFindHighlights();
}

function stepFind(delta) {
  if (!findState.open) return;
  if (!findState.matches.length) {
    runFind(findInputEl.value, 0);
    return;
  }
  highlightFindMatch(findState.index + delta);
}

function isModalOpen() {
  return document.querySelector('.modal:not(.hidden)') !== null;
}

function setupFindBar() {
  if (!findBarEl || !findInputEl) return;

  findInputEl.addEventListener('input', () => runFind(findInputEl.value, 0));
  findInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      stepFind(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeFindBar();
    }
  });

  document.getElementById('find-prev')?.addEventListener('click', () => stepFind(-1));
  document.getElementById('find-next')?.addEventListener('click', () => stepFind(1));
  document.getElementById('find-close')?.addEventListener('click', closeFindBar);

  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'f') return;
    if (isModalOpen()) return;
    e.preventDefault();
    if (findState.open) {
      findInputEl.focus();
      findInputEl.select();
    } else {
      openFindBar(true);
    }
  });

  if (window.electronAPI?.onOpenFind) {
    window.electronAPI.onOpenFind(() => {
      if (isModalOpen()) return;
      openFindBar(true);
    });
  }
}

setupFindBar();

async function boot() {
  await checkDayRollover();
  await initSyncSettings();

  if (window.electronAPI?.createMemoFolder) {
    for (const id of appState.memoOrder) {
      if (!isAlarmBoard(appState.memos[id])) {
        await window.electronAPI.createMemoFolder(id);
      }
    }
  }

  currentMemo = appState.memos[appState.activeMemoId];
  saveAppState({ skipSync: true });
  refreshActiveUI();
  checkAllAlarms();
  setInterval(checkAllAlarms, ALARM_CHECK_INTERVAL);
  setInterval(checkDayRollover, DAY_CHECK_INTERVAL);
  if (window.electronAPI?.syncMerge) {
    setInterval(runCloudSync, SYNC_INTERVAL_MS);
    setInterval(runAutoCalendarImport, CALENDAR_AUTO_INTERVAL_MS);
    const config = await window.electronAPI.getSyncConfig();
    if (config.syncEnabled) {
      scheduleCloudSync(true);
    }
    if (config.calendarAutoImport) {
      runAutoCalendarImport().catch(() => {});
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkDayRollover();
      runAutoCalendarImport().catch(() => {});
    }
  });
}

boot();
