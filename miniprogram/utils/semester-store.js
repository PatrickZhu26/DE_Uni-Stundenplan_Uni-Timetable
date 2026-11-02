const M = require('./model');
const KEY = 'stundenplan_archives_v1';
const CURRENT = 'stundenplan_complete_v2';

const load = storage => {
  const records = storage.getStorageSync(KEY);
  return Array.isArray(records) ? records : [];
};
const identity = state => [state.meta && state.meta.school || '', state.meta && state.meta.semester || ''].join('\u001f');
const title = state => [state.meta && state.meta.school, state.meta && state.meta.semester].filter(Boolean).join(' · ') || '我的学期课表';

function linked(record, state, previous) {
  if (record.scheduleId) return record.scheduleId === state.scheduleId;
  const old = previous && (!previous.scheduleId || previous.scheduleId === state.scheduleId) ? previous : state;
  if (!record.state || identity(record.state) !== identity(old)) return false;
  // Attach older snapshots only when they share a course, or have a named semester.
  const ids = new Set((old.courses || []).map(c => c.id));
  return !!(old.meta && old.meta.semester) || (record.state.courses || []).some(c => ids.has(c.id));
}

function updatedRecords(records, state, previous, create) {
  let matched = false;
  const now = new Date().toISOString();
  const next = records.map(record => {
    if (!linked(record, state, previous)) return record;
    matched = true;
    return {...record, scheduleId: state.scheduleId, state: M.clone(state), count: state.courses.length, updatedAt: now};
  });
  if (create && !matched) {
    if (next.length >= 50) throw Error('学期档案已满50份，请先备份并删除不需要的档案');
    next.unshift({id: M.uid(), scheduleId: state.scheduleId, title: title(state), savedAt: M.fmt(new Date()), updatedAt: now, count: state.courses.length, state: M.clone(state)});
  }
  return next;
}

function persist(storage, state, create = false) {
  const previous = storage.getStorageSync(CURRENT);
  const records = load(storage);
  const next = updatedRecords(records, state, previous, create);
  // Restore both keys if the second write fails; never leave an outdated linked archive.
  try {
    storage.setStorageSync(KEY, next);
    storage.setStorageSync(CURRENT, state);
  } catch (error) {
    try { storage.setStorageSync(KEY, records); } catch (_) {}
    try { if (previous) storage.setStorageSync(CURRENT, previous); } catch (_) {}
    throw error;
  }
}

module.exports = {KEY, CURRENT, load, identity, title, linked, updatedRecords, persist};
