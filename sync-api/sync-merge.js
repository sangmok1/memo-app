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
      winner = ts(right.updatedAt || right.createdAt) >= ts(left.updatedAt || left.createdAt)
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

module.exports = {
  mergeAppStates,
  mergeArchiveTrees,
};
