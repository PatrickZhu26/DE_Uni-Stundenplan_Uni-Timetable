const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const M = require('../miniprogram/utils/model');
const A = require('../miniprogram/utils/semester-store');
const Study = require('../miniprogram/utils/study');
const folder = path.resolve(__dirname, '../miniprogram/pages/index');
const store = {};
let modal, fail = false;
const wx = {
  getStorageSync: key => store[key],
  setStorageSync(key, value) {if (fail && key === A.CURRENT) throw Error('Storage full'); store[key] = M.clone(value);},
  getWindowInfo: () => ({windowWidth: 375}), cloud: {init() {}}, showToast() {},
  showModal: value => {modal = value;}, nextTick: fn => fn(), pageScrollTo() {}
};
function load() {
  let p;
  vm.runInNewContext(fs.readFileSync(path.join(folder, 'index.js'), 'utf8'), {
    Page: value => {p = value;}, require: file => require(path.resolve(folder, file)), wx, Date, console,
    setTimeout: () => 1, clearTimeout() {}, clearInterval() {}
  });
  p.data = M.clone(p.data);
  p.setData = patch => {for (const [key, value] of Object.entries(patch)) {
    const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
    let target = p.data;
    for (const part of parts.slice(0, -1)) target = target[part];
    target[parts[parts.length - 1]] = value;
  }};
  p.onLoad(); p.setData({weekStart: '2026-11-02'}); p.refresh();
  return p;
}
const statik = M.normalize({...M.blank(1, '2026-10-13'), id: 'statik', title: 'Statik', to: '2027-02-02', primary: true});
const tut = {...statik, id: 'tut', title: 'TUT GETI', primary: false};
const other = {...statik, id: 'other', title: 'Afternoon', start: '14:00', end: '15:00'};
const state = {...M.emptyState(), scheduleId: 'winter', infoMode: 'compact', courses: [statik, tut, other], meta: {school: 'FAU', semester: 'W'}};
A.persist(wx, state, true);
store.stundenplan_grades_v1 = {sentinel: 'untouched'};
const edit = (p, id) => p.openEdit({currentTarget: {dataset: {id}}});
const choose = (p, value) => p.changePrimary({detail: {value}});
const primary = (items, id) => items.find(c => c.id === id).primary;
let p = load();
edit(p, 'tut');
p.changeText({currentTarget: {dataset: {field: 'note'}}, detail: {value: 'unsaved draft'}});
choose(p, true); p.closeEditor();
assert(primary(store[A.CURRENT].courses, 'tut'), 'switching primary then returning must save the choice');
assert(!primary(store[A.CURRENT].courses, 'statik'), 'previous conflicting primary must be cleared');
assert(primary(store[A.CURRENT].courses, 'other'), 'a separate time slot must keep its choice');
assert.equal(store[A.CURRENT].courses.find(c => c.id === 'tut').note, '', 'unrelated editor drafts must not be saved');
assert(primary(store[A.KEY][0].state.courses, 'tut'), 'linked archive must follow immediately');
assert(!p.data.gridDays[1].blocks.find(c => c.id === 'tut').collapsed);
assert(p.data.gridDays[1].blocks.find(c => c.id === 'statik').collapsed);
p = load();
assert(!p.data.gridDays[1].blocks.find(c => c.id === 'tut').collapsed, 'choice must survive a reload');
edit(p, 'statik'); choose(p, true); p.closeEditor();
assert(primary(store[A.CURRENT].courses, 'statik')); assert(!primary(store[A.CURRENT].courses, 'tut'));
const beforeFailure = M.clone(store);
edit(p, 'tut'); fail = true; choose(p, true); fail = false;
assert.equal(p.data.form.primary, false); assert.deepEqual(store, beforeFailure);
assert.equal(modal.title, '保存失败'); p.closeEditor();
// Import preview preferences survive returning, without writing the current schedule early.
const beforePreview = M.clone(store);
p.setData({importPreview: [{...tut, id: 'import-tut'}], importMode: 1, importMeta: state.meta});
p.editPreview({currentTarget: {dataset: {index: 0}}}); choose(p, true); p.closeEditor();
assert(p.data.importPreview[0].primary); assert.deepEqual(store, beforePreview);
p.confirmPDFImport(); modal.success({confirm: true});
const imported = p.data.courses.find(c => c.id !== 'tut' && c.title === tut.title);
assert(imported.primary); assert(!primary(p.data.courses, 'statik'));
assert(!p.data.gridDays[1].blocks.find(c => c.id === imported.id).collapsed);
// The latest selection wins for a three-way collision on phone, tablet and desktop widths.
const three = [statik, tut, {...tut, id: 'third', title: 'Third'}];
for (const width of [320, 430, 768, 1024, 1366]) {
  for (const chosen of three) {
    const updated = Study.setPrimary(three, chosen.id, true);
    const blocks = Study.gridLayout(updated, '08:00', '20:00', true, width, 5).blocks;
    assert.equal(blocks.filter(c => !c.collapsed).length, 1);
    assert(!blocks.find(c => c.id === chosen.id).collapsed);
    assert.equal(updated.filter(c => c.primary).length, 1);
  }
}
assert.deepEqual(store.stundenplan_grades_v1, {sentinel: 'untouched'});
console.log('PASS: primary switch then Back, previous preference replacement, draft isolation, reload/archive sync, storage rollback, import preview/append and three-way choices at five widths');
