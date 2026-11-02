const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const M = require('../miniprogram/utils/model');
const Study = require('../miniprogram/utils/study');
const G = require('../miniprogram/utils/grades');
const base = M.normalize({...M.blank(0, '2026-11-02'), id: 'a', title: 'Mathematik', to: '2026-12-28'});
const conflicts = [base, {...base, id: 'b', title: 'Physik'}, {...base, id: 'c', primary: true, title: 'Chemie'}];
// Native container widths include app padding, borders, split view and fractional pixels.
const viewportWidths = [280, 320, 360, 393, 412, 480, 540, 560, 600, 744, 768, 800, 820, 834, 912, 1024, 1180, 1194, 1280, 1366, 1440, 1920, 2560];
for (const viewport of viewportWidths) {
  for (const contentWidth of [viewport - 58, viewport - 94.5]) {
    for (const compact of [false, true]) {
      for (const count of [5, 7]) {
        const axis = compact ? 44 : 62;
        const days = Array.from({length: count}, (_, i) => Study.gridLayout(i === 1 ? conflicts : i === 4 ? [base] : [], '08:00', '20:00', compact, viewport, count, {fit: true, contentWidth}));
        assert(Math.abs(axis + days.reduce((n, d) => n + d.width, 0) - contentWidth) < .001, 'all days must fit exactly');
        assert(days.every(d => Math.abs(d.width - days[0].width) < .001), 'conflicts cannot expand a weekday');
        const rightmost = axis + days.slice(0, 5).reduce((n, d) => n + d.width, 0);
        assert(rightmost <= contentWidth + .001, 'Friday must remain inside the native viewport');
        for (const c of days[1].blocks) assert(c.leftPct >= 0 && c.widthPct > 0 && c.leftPct + c.widthPct <= 100.001);
        if (compact) assert(!days[1].blocks.find(c => c.id === 'c').collapsed);
      }
    }
  }
}
assert(Study.layoutContext({getWindowInfo: () => ({windowWidth: 560, screenWidth: 768, screenHeight: 1024})}).fitGrid);
assert(!Study.layoutContext({getWindowInfo: () => ({windowWidth: 375, screenWidth: 375, screenHeight: 812})}).fitGrid);
assert(Study.layoutContext({getWindowInfo: () => ({windowWidth: 1024, screenWidth: 1024, screenHeight: 1366})}, 540).fitGrid, 'tablet split view must use the measured window');
assert.equal(Study.layoutContext({getWindowInfo: () => ({windowWidth: 768, screenWidth: 768, screenHeight: 1024})}, 1366).viewportWidth, 1366, 'resize width must override a stale system value');
const landscapeApi = {getWindowInfo: () => ({windowWidth: 852, screenWidth: 852, screenHeight: 393, safeArea: {left: 44, right: 808}})};
assert.equal(Study.layoutContext(landscapeApi).safeAreaStyle, '--safe-left:44px;--safe-right:44px');
assert.equal(Study.layoutContext(landscapeApi, 393).safeAreaStyle, '--safe-left:0px;--safe-right:0px', 'stale landscape insets must not shrink a portrait page');
assert.equal(Study.layoutContext(landscapeApi).viewportWidth, 393, 'opening another page must retain the last resize width until system data catches up');
assert.equal(Study.layoutContext({getWindowInfo: () => ({windowWidth: 393})}).safeAreaStyle, '--safe-left:0px;--safe-right:0px');
assert.equal(Study.layoutContext({getWindowInfo() {throw Error('unsupported');}}).viewportWidth, 375);
let modal, failGrade = false, frameWidth = 708.4, queryCount = 0;
const store = {};
const wx = {
  getWindowInfo: () => ({windowWidth: 768, screenWidth: 768, screenHeight: 1024}),
  getStorageSync: k => store[k], setStorageSync: (k, v) => {if (failGrade && k === G.KEY) throw Error('full'); store[k] = M.clone(v);},
  showModal: o => {modal = o;}, showToast() {}, cloud: {init() {}}, pageScrollTo() {}, nextTick: f => f(),
  createSelectorQuery() {
    const entries = []; let selector;
    return {in() {return this;}, select(s) {selector = s; return this;}, boundingClientRect(f) {entries.push([selector, f]); return this;}, exec(f) {queryCount++; assert(queryCount < 50, 'measurement must converge'); for (const [s, cb] of entries) cb(s === '.timetable-scroll' || s === '.archive-scroll' ? {width: frameWidth} : {height: 70}); if (f) f();}};
  }
};
function load(name) {
  let page;
  const folder = path.resolve(__dirname, '../miniprogram/pages', name);
  vm.runInNewContext(fs.readFileSync(path.join(folder, 'index.js'), 'utf8'), {Page: p => {page = p;}, require: r => require(path.resolve(folder, r)), wx, Date, console, setTimeout: () => 1, clearTimeout() {}, clearInterval() {}});
  page.data = M.clone(page.data);
  page.setData = function(patch) {for (const [k, v] of Object.entries(patch)) {const parts = k.replace(/\[(\d+)\]/g, '.$1').split('.'); let t = this.data; for (const key of parts.slice(0, -1)) t = t[key]; t[parts.at(-1)] = v;}};
  return page;
}
const p = load('index'); p.onLoad();
const gradeLayout = load('grades'); gradeLayout.onLoad();
const gradesBeforeResize = JSON.stringify(gradeLayout._state);
gradeLayout.onResize({size: {windowWidth: 852}});
assert.equal(gradeLayout.data.viewportWidth, 852); assert.equal(JSON.stringify(gradeLayout._state), gradesBeforeResize, 'resizing must not alter grade data');
const helpLayout = load('help'); helpLayout.onLoad(); helpLayout.onResize({size: {windowWidth: 852}});
assert.equal(helpLayout.data.viewportWidth, 852);
p.setData({courses: conflicts, weekStart: '2026-11-02'}); p.refresh();
assert(p.data.fitGrid); assert.equal(p.data.gridViewportWidth, 706); assert(Math.abs(p.data.gridWidth - 706) < .001);
frameWidth = 1002.2; p.onResize({size: {windowWidth: 1024}});
assert.equal(p.data.gridViewportWidth, 1000); assert(Math.abs(p.data.gridWidth - 1000) < .001);
// Primary choice appears only for a compact editor with a real recurring collision.
const lonely = {...base, id: 'thursday', day: 3}; p.setData({courses: [...conflicts, lonely], infoMode: 'compact'});
p.openEdit({currentTarget: {dataset: {id: 'a'}}}); assert(p.data.showPrimaryOption);
p.openEdit({currentTarget: {dataset: {id: 'thursday'}}}); assert(!p.data.showPrimaryOption);
p.setData({infoMode: 'full'}); p.openEdit({currentTarget: {dataset: {id: 'a'}}}); assert(!p.data.showPrimaryOption);
p.setData({infoMode: 'compact'}); p.openEdit({currentTarget: {dataset: {id: 'a'}}});
p.changePicker({currentTarget: {dataset: {field: 'day'}}, detail: {value: 4}}); assert(!p.data.showPrimaryOption);
p.changePicker({currentTarget: {dataset: {field: 'day'}}, detail: {value: 0}}); assert(p.data.showPrimaryOption);
p.changePicker({currentTarget: {dataset: {field: 'start'}}, detail: {value: '15:00'}}); assert(!p.data.showPrimaryOption);
p.setData({form: {...base, from: '2026-11-02', to: '2026-11-02', cancelledDates: ['2026-11-02']}}); p.updatePrimaryOption(); assert(!p.data.showPrimaryOption);
p.setData({previewEditIndex: 0, editingId: '', importPreview: conflicts, form: base}); p.updatePrimaryOption(); assert(p.data.showPrimaryOption);
// Reminder display data still expires, and its shortcut opens the correct course's homework.
const task = {id: 'hw', title: 'Blatt 04', date: '2026-11-05', time: '18:00', done: false};
const cutoff = Study.deadline(task, 'homework'); const decorated = Study.decorate({...base, homework: [task]}, cutoff - 1000);
assert.equal(decorated.homeworkDueLabel, '11/05 18:00'); assert(decorated.homeworkUrgent);
assert.equal(Study.decorate({...base, homework: [task]}, cutoff + 1).homeworkCount, 0);
p.setData({courses: [{...base, homework: [task]}], previewEditIndex: -1}); p._suppressTap = 0;
p.openCourseHomework({currentTarget: {dataset: {id: 'a'}}}); assert.equal(p.data.editingId, 'a'); assert.equal(p.data.studyKind, 'homework'); assert.equal(p.data.studyRows[0].id, 'hw');
// Clearing one semester has explicit confirmation, leaves other semesters byte-for-byte,
// and cannot modify timetable/archive keys, school settings or grading rules.
const parent = G.course({id: 'module', title: '94590 Module', recordKind: 'module', credits: 5, grade: '1.7'});
const child = G.course({id: 'child', title: '45902 Teil 2', parentId: 'module', parentTitle: parent.title, credits: 2.5, grade: '2.0'});
const fixture = {...G.empty(), school: G.school({abbr: 'FAU'}), calculated: true, terms: [
  {id: 'winter-me', program: 'Mechatronik', semester: 'Wintersemester 2026/27', courses: [parent], calculated: true},
  {id: 'summer-me', program: 'Mechatronik', semester: 'Sommersemester 2027', courses: [child], calculated: true},
  {id: 'winter-cs', program: 'Informatik', semester: 'Wintersemester 2026/27', courses: [G.course({id: 'cs', title: 'Programmieren', credits: 5, grade: '1.3'})], calculated: true}
]};
store[G.KEY] = M.clone(fixture); store.stundenplan_complete_v2 = {courses: [base]}; store.stundenplan_archives_v1 = [{id: 'archive', state: {courses: [base]}}];
const nonGrades = JSON.stringify([store.stundenplan_complete_v2, store.stundenplan_archives_v1]);
const g = load('grades'); g.onLoad(); const before = M.clone(g._state);
g.clearTermGrades({currentTarget: {dataset: {id: 'winter-me'}}}); assert(modal.content.includes('Mechatronik')); assert(modal.content.includes('Wintersemester 2026/27'));
g.toggleTerm({currentTarget: {dataset: {id: 'winter-me'}}}); assert.equal(g._state.terms[0].collapsed, before.terms[0].collapsed);
modal.success({confirm: false}); assert.deepEqual(g._state, before);
g.clearTermGrades({currentTarget: {dataset: {id: 'winter-me'}}}); modal.success({confirm: true});
assert.deepEqual(g._state.terms, before.terms.slice(1)); assert.deepEqual(g._state.school, before.school); assert.deepEqual(g._state.rules, before.rules); assert.equal(g._state.calculated, false);
assert.equal(JSON.stringify([store.stundenplan_complete_v2, store.stundenplan_archives_v1]), nonGrades);
g._state = M.clone(before); store[G.KEY] = M.clone(before); failGrade = true;
g.clearTermGrades({currentTarget: {dataset: {id: 'winter-me'}}}); modal.success({confirm: true}); assert.deepEqual(g._state, before); assert.deepEqual(store[G.KEY], before);
console.log('PASS: exact container fit at ' + viewportWidths.length + ' widths from 280 to 2560, full/compact 5/7-day grids with three-way conflicts, split view/stale resize information, converging native measurement, context-sensitive primary choice, reminder shortcut/deadline, and confirmed single-semester deletion with isolated data and failure rollback');
