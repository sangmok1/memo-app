function filterAppStateByGroup(appState, groupId, defaultGroupId) {
  const memos = {};
  const memoOrder = [];
  for (const id of appState.memoOrder || []) {
    const memo = appState.memos?.[id];
    if (!memo) continue;
    const gid = memo.syncGroupId || defaultGroupId;
    if (gid !== groupId) continue;
    memos[id] = memo;
    memoOrder.push(id);
  }

  const deletedMemos = {};
  Object.entries(appState.deletedMemos || {}).forEach(([id, at]) => {
    const memo = appState.memos?.[id];
    const deletedGroup = appState.deletedMemoGroups?.[id];
    const gid = deletedGroup || memo?.syncGroupId || defaultGroupId;
    if (gid === groupId) deletedMemos[id] = at;
  });

  return {
    updatedAt: appState.updatedAt || new Date().toISOString(),
    activeMemoId: memoOrder.includes(appState.activeMemoId)
      ? appState.activeMemoId
      : (memoOrder[0] || ''),
    memoOrder,
    memos,
    deletedMemos,
  };
}

function applyGroupMergeToFull(fullState, groupId, mergedSubset, defaultGroupId) {
  const next = {
    ...fullState,
    memos: { ...fullState.memos },
    deletedMemos: { ...(fullState.deletedMemos || {}) },
    deletedMemoGroups: { ...(fullState.deletedMemoGroups || {}) },
  };

  for (const id of Object.keys(next.memos)) {
    const gid = next.memos[id].syncGroupId || defaultGroupId;
    if (gid === groupId && !mergedSubset.memos[id]) {
      delete next.memos[id];
      next.memoOrder = next.memoOrder.filter((x) => x !== id);
    }
  }

  Object.entries(mergedSubset.memos || {}).forEach(([id, memo]) => {
    next.memos[id] = { ...memo, syncGroupId: groupId };
    if (!next.memoOrder.includes(id)) next.memoOrder.push(id);
  });

  Object.entries(mergedSubset.deletedMemos || {}).forEach(([id, at]) => {
    next.deletedMemos[id] = at;
    next.deletedMemoGroups[id] = groupId;
  });

  if (!next.memos[next.activeMemoId]) {
    next.activeMemoId = next.memoOrder.find((id) => next.memos[id]) || next.memoOrder[0] || '';
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

function assignOrphanMemosToGroup(appState, groupId) {
  Object.values(appState.memos || {}).forEach((memo) => {
    if (!memo.syncGroupId) memo.syncGroupId = groupId;
  });
}

function normalizeSyncConfig(config) {
  const c = { ...config };
  if (!Array.isArray(c.syncGroups) || !c.syncGroups.length) {
    const key = c.syncKey || c.lastSyncKey || '';
    c.syncGroups = [{
      id: 'sg-default',
      key,
      name: '그룹 1',
      createdAt: c.lastSyncAt || new Date().toISOString(),
    }];
  }
  if (!c.defaultSyncGroupId) {
    c.defaultSyncGroupId = c.syncGroups[0].id;
  }
  return c;
}

module.exports = {
  filterAppStateByGroup,
  applyGroupMergeToFull,
  assignOrphanMemosToGroup,
  normalizeSyncConfig,
};
