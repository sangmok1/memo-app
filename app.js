const STORAGE_KEY = 'memo-postit-data';
const ARCHIVE_FALLBACK_KEY = 'memo-postit-archive';
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const ALARM_CHECK_INTERVAL = 15000;

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

function createEmptyMemo(id) {
  return {
    id,
    type: 'memo',
    createdAt: new Date().toISOString(),
    today: [createTodoItem()],
    general: [createTodoItem()],
    savedDate: getDateKey(getKSTDate()),
    colorHue: 54,
  };
}

function createEmptyAlarm(id) {
  return {
    id,
    type: 'alarm',
    createdAt: new Date().toISOString(),
    onceAlarms: [],
    recurringAlarms: [],
    colorHue: 200,
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
    Object.values(raw.memos).forEach((item) => {
      if (!item.type) item.type = 'memo';
      if (item.type === 'alarm') {
        item.onceAlarms = item.onceAlarms || [];
        item.recurringAlarms = item.recurringAlarms || [];
      }
    });
    return raw;
  }

  const id = generateMemoId();
  const legacy = raw || {};
  return {
    activeMemoId: id,
    memoOrder: [id],
    memos: {
      [id]: {
        id,
        type: 'memo',
        createdAt: new Date().toISOString(),
        today: legacy.today?.length ? legacy.today : [createTodoItem()],
        general: legacy.general?.length ? legacy.general : [createTodoItem()],
        savedDate: legacy.savedDate || getDateKey(getKSTDate()),
        colorHue: legacy.colorHue ?? 54,
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
  };
}

function saveAppState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
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
  if (depth === 1) return `      - ${label}`;
  return `- ${label}`;
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

let appState = loadAppState();
let currentMemo = appState.memos[appState.activeMemoId];
const todayKey = getDateKey(getKSTDate());

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

  memo.today.forEach(normalizeItemDepth);
  memo.general.forEach(normalizeItemDepth);

  if (!memo.savedDate || memo.savedDate === todayKey) {
    if (!memo.savedDate) memo.savedDate = todayKey;
    return;
  }

  const yesterdayKey = memo.savedDate;
  const dateLabel = formatShortDateFromKey(yesterdayKey);

  const completed = memo.today.filter((t) => t.done && t.text.trim());
  if (completed.length > 0) {
    await archiveItems(memo.id, yesterdayKey, completed);
  }

  const toMove = memo.today.filter((t) => t.text.trim());
  toMove.reverse().forEach((item) => {
    const text = item.text.trim();
    const suffix = `(${dateLabel})`;
    const newText = text.includes(suffix) ? text : `${text} (${dateLabel})`;
    memo.general.unshift(createTodoItem(newText, item.depth || 0));
  });

  memo.today = [createTodoItem()];
  memo.savedDate = todayKey;
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

  const [item] = fromList.splice(fromIndex, 1);
  const toList = getListByType(toType);

  let insertIndex = Math.max(0, Math.min(toIndex, toList.length));
  if (fromType === toType && fromIndex < insertIndex) {
    insertIndex -= 1;
  }

  toList.splice(insertIndex, 0, item);
  saveData();
  renderAllLists();
}

function getDropIndex(listEl, clientY) {
  const items = [...listEl.querySelectorAll('.todo-item:not(.dragging)')];
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
    listEl.classList.add('drag-over');
    listEl.dataset.dropIndex = String(getDropIndex(listEl, e.clientY));
  });

  listEl.addEventListener('dragleave', (e) => {
    if (!listEl.contains(e.relatedTarget)) {
      listEl.classList.remove('drag-over');
    }
  });

  listEl.addEventListener('drop', (e) => {
    e.preventDefault();
    listEl.classList.remove('drag-over');
    const itemId = e.dataTransfer.getData('text/plain');
    const fromType = e.dataTransfer.getData('application/list-type');
    if (!itemId || !fromType) return;
    const toIndex = Number(listEl.dataset.dropIndex ?? getDropIndex(listEl, e.clientY));
    moveItem(fromType, listType, itemId, toIndex);
  });
}

function focusItemInput(listType, index) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const input = getListEl(listType).querySelectorAll('input[type="text"]')[index];
      if (!input) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange(0, 0);
    });
  });
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
      e.dataTransfer.setData('text/plain', item.id);
      e.dataTransfer.setData('application/list-type', listType);
      li.classList.add('dragging');
    });
    handle.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      document.querySelectorAll('.todo-list').forEach((el) => el.classList.remove('drag-over'));
    });

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = item.done;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = item.text;
    input.placeholder = '할일 입력...';

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
    input.addEventListener('input', () => {
      items[index].text = input.value;
      saveData();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        setItemDepth(listType, index, e.shiftKey ? 0 : 1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        insertItemAfter(listType, index, items[index].depth || 0);
        return;
      }
      if (e.key === 'Backspace' && input.value === '' && items.length > 1) {
        e.preventDefault();
        items.splice(index, 1);
        saveData();
        renderAllLists();
        focusItemInput(listType, Math.max(0, index - 1));
      }
    });
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
}

function addItem(listType, depth = 0) {
  getListByType(listType).push(createTodoItem('', depth));
  saveData();
  renderAllLists();
  focusItemInput(listType, getListByType(listType).length - 1);
}

function applyColor(hue) {
  postitEl.style.setProperty('--hue', hue);
  document.documentElement.style.setProperty('--hue', hue);
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
    btn.style.setProperty('--tab-hue', item.colorHue ?? (isAlarm ? 200 : 54));
    btn.title = appState.memoOrder.length > 1
      ? `${isAlarm ? '알람' : '메모'} · ${item.id}\n클릭: 전환 · 우클릭: 삭제`
      : item.id;
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

function updateSettingsForType() {
  const isAlarm = isAlarmBoard(currentMemo);
  document.getElementById('color-label').textContent = isAlarm ? '알람 색상' : '메모 색상';
  document.getElementById('btn-open-archive').style.display = isAlarm ? 'none' : '';
}

function refreshActiveUI() {
  applyColor(currentMemo.colorHue ?? (isAlarmBoard(currentMemo) ? 200 : 54));
  colorSlider.value = currentMemo.colorHue ?? (isAlarmBoard(currentMemo) ? 200 : 54);
  todayDateEl.textContent = formatKSTDate(getKSTDate());

  const isAlarm = isAlarmBoard(currentMemo);
  memoViewEl.classList.toggle('hidden', isAlarm);
  alarmViewEl.classList.toggle('hidden', !isAlarm);
  memoFooterEl.classList.toggle('hidden', isAlarm);
  updateSettingsForType();

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
      });
    }
  } catch {
    await window.electronAPI?.forceCloseAlarmPopup?.();
  } finally {
    dismissAlarmRing();
  }
}

function enqueueAlarmRing(alarm) {
  alarmQueue.push({
    title: alarm.title,
    content: alarm.content,
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
        enqueueAlarmRing(alarm);
        changed = true;
      }
    });

    board.recurringAlarms.forEach((alarm) => {
      if (shouldTriggerAlarm(alarm, now, true)) {
        markAlarmTriggered(alarm, now, true);
        enqueueAlarmRing(alarm);
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

  const lines = [`📋 ${date}`, ''];

  if (completedToday.length > 0) {
    lines.push('[오늘 한일]');
    completedToday.forEach((t) => lines.push(formatSummaryLine(t.text, t.depth || 0)));
    lines.push('');
  }

  if (completedGeneral.length > 0) {
    lines.push('[할일]');
    completedGeneral.forEach((t) => lines.push(formatSummaryLine(t.text, t.depth || 0)));
    lines.push('');
  }

  lines.push(`총 ${completedToday.length + completedGeneral.length}건 완료`);
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
    await archiveItems(currentMemo.id, todayKey, completedToday);
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

function saveColor(hue) {
  currentMemo.colorHue = hue;
  saveData();
  renderMemoSidebar();
}

settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
  settingsBtn.classList.toggle('active');
});

colorSlider.addEventListener('input', () => {
  applyColor(Number(colorSlider.value));
  saveColor(Number(colorSlider.value));
});

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

document.getElementById('btn-delete-memo').addEventListener('click', () => {
  promptDeleteMemo(appState.activeMemoId);
});

document.getElementById('btn-confirm-delete').addEventListener('click', () => {
  if (pendingDeleteMemoId) deleteMemo(pendingDeleteMemoId);
});

document.getElementById('btn-cancel-delete').addEventListener('click', closeDeleteModal);
deleteModal.querySelector('.modal-backdrop').addEventListener('click', closeDeleteModal);

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

async function boot() {
  for (const id of appState.memoOrder) {
    await handleDayRolloverForMemo(appState.memos[id]);
  }

  if (window.electronAPI?.createMemoFolder) {
    for (const id of appState.memoOrder) {
      if (!isAlarmBoard(appState.memos[id])) {
        await window.electronAPI.createMemoFolder(id);
      }
    }
  }

  currentMemo = appState.memos[appState.activeMemoId];
  saveAppState();
  refreshActiveUI();
  checkAllAlarms();
  setInterval(checkAllAlarms, ALARM_CHECK_INTERVAL);
}

boot();
