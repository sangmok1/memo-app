function ts(value) {
  return new Date(value || 0).getTime() || 0;
}

function mergeDeletedMemos(local, remote) {
  const ids = new Set([
    ...Object.keys(local?.deletedMemos || {}),
    ...Object.keys(remote?.deletedMemos || {}),
  ]);
  const merged = {};
  ids.forEach((id) => {
    const left = local?.deletedMemos?.[id];
    const right = remote?.deletedMemos?.[id];
    if (!left) {
      merged[id] = right;
      return;
    }
    if (!right) {
      merged[id] = left;
      return;
    }
    merged[id] = ts(right) >= ts(left) ? right : left;
  });
  return merged;
}

function isMemoDeleted(memoId, deletedMemos, memo) {
  const deletedAt = deletedMemos?.[memoId];
  if (!deletedAt) return false;
  if (!memo) return true;
  return ts(deletedAt) >= ts(memo.updatedAt || memo.createdAt);
}

function mergeAppStates(local, remote) {
  if (!remote?.memos) return local;
  if (!local?.memos) return remote;

  const deletedMemos = mergeDeletedMemos(local, remote);
  const mergedMemos = {};
  const ids = new Set([
    ...Object.keys(local.memos || {}),
    ...Object.keys(remote.memos || {}),
  ]);

  ids.forEach((id) => {
    const left = local.memos[id];
    const right = remote.memos[id];
    let winner = null;

    if (left && right) {
      // 타임스탬프가 같으면(= 같은 상태를 서로 push/pull 한 경우) 로컬을 우선한다.
      // 원격은 stripCompletedItems 로 완료항목이 제거된 채 같은 updatedAt 을 가지므로,
      // >= 로 두면 동점에서 원격이 이겨 당일 완료 체크가 매 동기화마다 사라진다.
      winner = ts(right.updatedAt || right.createdAt) > ts(left.updatedAt || left.createdAt)
        ? right
        : left;
    } else if (left) {
      winner = left;
    } else if (right) {
      winner = right;
    }

    if (!winner || isMemoDeleted(id, deletedMemos, winner)) return;
    mergedMemos[id] = winner;
  });

  const localNewer = ts(local.updatedAt) >= ts(remote.updatedAt);
  const primary = (localNewer ? local.memoOrder : remote.memoOrder) || [];
  const secondary = (localNewer ? remote.memoOrder : local.memoOrder) || [];
  const mergedOrder = primary.filter((id) => mergedMemos[id]);
  secondary.forEach((id) => {
    if (mergedMemos[id] && !mergedOrder.includes(id)) mergedOrder.push(id);
  });
  Object.keys(mergedMemos).forEach((id) => {
    if (!mergedOrder.includes(id)) mergedOrder.push(id);
  });

  let activeMemoId = local.activeMemoId;
  if (!mergedMemos[activeMemoId]) {
    activeMemoId = mergedMemos[remote.activeMemoId] ? remote.activeMemoId : mergedOrder[0];
  }

  return {
    ...local,
    memos: mergedMemos,
    deletedMemos,
    memoOrder: mergedOrder.length ? mergedOrder : Object.keys(mergedMemos),
    activeMemoId,
    updatedAt: new Date().toISOString(),
  };
}

function mergeArchiveItems(localItems, remoteItems) {
  const map = new Map();
  [...(localItems || []), ...(remoteItems || [])].forEach((item) => {
    const text = (item?.text || '').trim();
    if (!text) return;
    const prev = map.get(text);
    if (!prev || ts(item.savedAt) >= ts(prev.savedAt)) {
      map.set(text, { text, depth: item.depth || 0, savedAt: item.savedAt || new Date().toISOString() });
    }
  });
  return [...map.values()];
}

function mergeArchiveEntry(localData, remoteData) {
  if (!localData) return remoteData;
  if (!remoteData) return localData;

  const base = ts(localData.updatedAt || localData.date) >= ts(remoteData.updatedAt || remoteData.date)
    ? localData
    : remoteData;

  return {
    ...base,
    date: localData.date || remoteData.date,
    dateLabel: localData.dateLabel || remoteData.dateLabel,
    memoId: localData.memoId || remoteData.memoId,
    items: mergeArchiveItems(localData.items, remoteData.items),
    updatedAt: new Date(Math.max(
      ts(localData.updatedAt || localData.date),
      ts(remoteData.updatedAt || remoteData.date),
    )).toISOString(),
  };
}

function mergeArchiveTrees(local, remote) {
  const merged = { ...(local || {}) };
  Object.entries(remote || {}).forEach(([path, remoteVal]) => {
    merged[path] = mergeArchiveEntry(merged[path], remoteVal);
  });
  return merged;
}

// 동기화 시 "완료된(done) 항목"은 원격에서 가져오지 않기 위해 제거.
// today / 각 section.items 에서 done=true 항목을 걸러낸 새 state 를 반환한다.
function stripCompletedItems(state) {
  if (!state || !state.memos) return state;
  const filterDone = (arr) => (Array.isArray(arr) ? arr.filter((it) => !it || !it.done) : arr);
  const memos = {};
  Object.entries(state.memos).forEach(([id, memo]) => {
    if (!memo) { memos[id] = memo; return; }
    const next = { ...memo };
    if (Array.isArray(next.today)) next.today = filterDone(next.today);
    if (Array.isArray(next.sections)) {
      next.sections = next.sections.map((s) => (s ? { ...s, items: filterDone(s.items) } : s));
    }
    memos[id] = next;
  });
  return { ...state, memos };
}

module.exports = {
  mergeAppStates,
  mergeArchiveTrees,
  stripCompletedItems,
};
