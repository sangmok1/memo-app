const STORAGE_KEY = 'memo-postit-data';
const ARCHIVE_FALLBACK_KEY = 'memo-postit-archive';

function getKSTDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
}

function formatKSTDate(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const day = weekdays[date.getDay()];
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

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { today: [], general: [], savedDate: null, colorHue: 54 };
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function createTodoItem(text = '', depth = 0) {
  return { id: createId(), text, done: false, depth: depth === 1 ? 1 : 0 };
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

function handleCheckboxChange(listType, index, isDone) {
  const items = getListByType(listType);
  if (!items[index]) return;

  items[index].done = isDone;

  if ((items[index].depth || 0) === 0) {
    getChildIndices(items, index).forEach((i) => {
      items[i].done = isDone;
    });
  }

  saveData(state);
  renderAllLists();
}

function getListByType(listType) {
  return listType === 'today' ? state.today : state.general;
}

function getListEl(listType) {
  return listType === 'today' ? todayListEl : generalListEl;
}

const state = loadData();
state.today.forEach(normalizeItemDepth);
state.general.forEach(normalizeItemDepth);
const todayKey = getDateKey(getKSTDate());

const todayListEl = document.getElementById('today-list');
const generalListEl = document.getElementById('general-list');
const todayDateEl = document.getElementById('today-date');

todayDateEl.textContent = formatKSTDate(getKSTDate());

async function archiveItems(dateKey, items) {
  const payload = items
    .filter((t) => t.text.trim())
    .map((t) => ({ text: t.text.trim(), depth: t.depth || 0 }));

  if (payload.length === 0) return;

  if (window.electronAPI?.archiveCompleted) {
    await window.electronAPI.archiveCompleted(dateKey, payload);
    return;
  }

  const fallback = JSON.parse(localStorage.getItem(ARCHIVE_FALLBACK_KEY) || '{}');
  if (!fallback[dateKey]) {
    fallback[dateKey] = { date: dateKey, items: [] };
  }
  const existing = new Set(fallback[dateKey].items.map((i) => i.text));
  payload.forEach((item) => {
    if (!existing.has(item.text)) {
      fallback[dateKey].items.push({ text: item.text, savedAt: new Date().toISOString() });
      existing.add(item.text);
    }
  });
  localStorage.setItem(ARCHIVE_FALLBACK_KEY, JSON.stringify(fallback));
}

async function handleDayRollover() {
  if (!state.savedDate || state.savedDate === todayKey) {
    if (!state.savedDate) {
      state.savedDate = todayKey;
      saveData(state);
    }
    return;
  }

  const yesterdayKey = state.savedDate;
  const dateLabel = formatShortDateFromKey(yesterdayKey);

  const completed = state.today.filter((t) => t.done && t.text.trim());
  if (completed.length > 0) {
    await archiveItems(yesterdayKey, completed);
  }

  const toMove = state.today.filter((t) => t.text.trim());
  toMove.reverse().forEach((item) => {
    const text = item.text.trim();
    const suffix = `(${dateLabel})`;
    const newText = text.includes(suffix) ? text : `${text} (${dateLabel})`;
    state.general.unshift(createTodoItem(newText, item.depth || 0));
  });

  state.today = [];
  state.savedDate = todayKey;
  saveData(state);
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
  saveData(state);
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

    const index = getDropIndex(listEl, e.clientY);
    listEl.dataset.dropIndex = String(index);
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
      const inputs = getListEl(listType).querySelectorAll('input[type="text"]');
      const input = inputs[index];
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
  saveData(state);
  renderAllLists();
  focusItemInput(listType, insertAt);
  const listEl = getListEl(listType);
  requestAnimationFrame(() => {
    listEl.children[insertAt]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function setItemDepth(listType, index, depth) {
  const items = getListByType(listType);
  if (!items[index]) return;
  if (depth === 1 && !hasParentAbove(items, index)) return;
  items[index].depth = depth === 1 ? 1 : 0;
  saveData(state);
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
      e.dataTransfer.effectAllowed = 'move';
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
    indentBtn.title = depth === 1 ? '상위로' : '하위로';
    indentBtn.type = 'button';
    if (depth === 0 && !hasParentAbove(items, index)) {
      indentBtn.disabled = true;
      indentBtn.title = '상위 항목 필요';
    }
    indentBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setItemDepth(listType, index, depth === 1 ? 0 : 1);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = '삭제';

    checkbox.addEventListener('change', () => {
      handleCheckboxChange(listType, index, checkbox.checked);
    });

    input.addEventListener('input', () => {
      items[index].text = input.value;
      saveData(state);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
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
        saveData(state);
        renderAllLists();
        const list = getListEl(listType);
        const inputs = list.querySelectorAll('input[type="text"]');
        inputs[Math.max(0, index - 1)]?.focus();
      }
    });

    deleteBtn.addEventListener('click', () => {
      const wasParent = (items[index].depth || 0) === 0;
      items.splice(index, 1);
      if (wasParent) {
        for (let i = index; i < items.length; i++) {
          if ((items[i].depth || 0) === 1) items[i].depth = 0;
          else break;
        }
      }
      saveData(state);
      renderAllLists();
    });

    li.append(handle, checkbox, indentBtn, input, deleteBtn);
    listEl.appendChild(li);
  });
}

function renderAllLists() {
  renderList(todayListEl, state.today, 'today');
  renderList(generalListEl, state.general, 'general');
}

function addItem(listType, depth = 0) {
  const items = getListByType(listType);
  items.push(createTodoItem('', depth));
  saveData(state);
  renderAllLists();
  focusItemInput(listType, items.length - 1);
  const listEl = getListEl(listType);
  requestAnimationFrame(() => {
    listEl.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function initLists() {
  if (state.today.length === 0) state.today.push(createTodoItem());
  if (state.general.length === 0) state.general.push(createTodoItem());
  saveData(state);
  renderAllLists();
}

document.querySelectorAll('.btn-add').forEach((btn) => {
  btn.addEventListener('click', () => {
    const listType = btn.dataset.list;
    addItem(listType);
    getListEl(listType).querySelectorAll('input[type="text"]').item(-1)?.focus();
  });
});

function buildSummary() {
  const date = formatKSTDate(getKSTDate());
  const completedToday = state.today.filter((t) => t.done && t.text.trim());
  const completedGeneral = state.general.filter((t) => t.done && t.text.trim());

  if (completedToday.length === 0 && completedGeneral.length === 0) {
    return `${date}\n\n완료한 일이 없습니다.`;
  }

  const lines = [`📋 ${date}`, ''];

  if (completedToday.length > 0) {
    lines.push('[오늘 한일]');
    completedToday.forEach((t) => {
      lines.push(formatSummaryLine(t.text, t.depth || 0));
    });
    lines.push('');
  }

  if (completedGeneral.length > 0) {
    lines.push('[할일]');
    completedGeneral.forEach((t) => {
      lines.push(formatSummaryLine(t.text, t.depth || 0));
    });
    lines.push('');
  }

  const total = completedToday.length + completedGeneral.length;
  lines.push(`총 ${total}건 완료`);

  return lines.join('\n');
}

const summaryModal = document.getElementById('summary-modal');
const summaryText = document.getElementById('summary-text');

document.getElementById('btn-summary').addEventListener('click', async () => {
  summaryText.value = buildSummary();

  const completedToday = state.today.filter((t) => t.done && t.text.trim());
  if (completedToday.length > 0) {
    await archiveItems(todayKey, completedToday);
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

const postitEl = document.querySelector('.postit');
const settingsPanel = document.getElementById('settings-panel');
const settingsBtn = document.getElementById('btn-settings');
const colorSlider = document.getElementById('color-slider');

function applyColor(hue) {
  postitEl.style.setProperty('--hue', hue);
  document.documentElement.style.setProperty('--hue', hue);
}

function saveColor(hue) {
  state.colorHue = hue;
  saveData(state);
}

if (state.colorHue == null) state.colorHue = 54;
colorSlider.value = state.colorHue;
applyColor(state.colorHue);

settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
  settingsBtn.classList.toggle('active');
});

colorSlider.addEventListener('input', () => {
  const hue = Number(colorSlider.value);
  applyColor(hue);
  saveColor(hue);
});

const btnOpenArchive = document.getElementById('btn-open-archive');
if (btnOpenArchive) {
  if (window.electronAPI?.openArchiveFolder) {
    btnOpenArchive.addEventListener('click', () => window.electronAPI.openArchiveFolder());
  } else {
    btnOpenArchive.style.display = 'none';
  }
}

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
  await handleDayRollover();
  initLists();
}

boot();
