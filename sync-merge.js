function ts(value) {
  return new Date(value || 0).getTime() || 0;
}

function mergeAppStates(local, remote) {
  if (!remote?.memos) return local;
  if (!local?.memos) return remote;

  const mergedMemos = { ...local.memos };
  const ids = new Set([
    ...Object.keys(local.memos || {}),
    ...Object.keys(remote.memos || {}),
  ]);

  ids.forEach((id) => {
    const left = local.memos[id];
    const right = remote.memos[id];
    if (!left) {
      mergedMemos[id] = right;
      return;
    }
    if (!right) return;
    mergedMemos[id] = ts(right.updatedAt || right.createdAt) >= ts(left.updatedAt || left.createdAt)
      ? right
      : left;
  });

  const localNewer = ts(local.updatedAt) >= ts(remote.updatedAt);
  const primary = localNewer ? local.memoOrder || [] : remote.memoOrder || [];
  const secondary = localNewer ? remote.memoOrder || [] : local.memoOrder || [];
  const mergedOrder = [...primary];
  secondary.forEach((id) => {
    if (mergedMemos[id] && !mergedOrder.includes(id)) mergedOrder.push(id);
  });

  let activeMemoId = local.activeMemoId;
  if (!mergedMemos[activeMemoId]) {
    activeMemoId = mergedMemos[remote.activeMemoId] ? remote.activeMemoId : mergedOrder[0];
  }

  return {
    ...local,
    memos: mergedMemos,
    memoOrder: mergedOrder.length ? mergedOrder : local.memoOrder,
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

module.exports = {
  mergeAppStates,
  mergeArchiveTrees,
};
