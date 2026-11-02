const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const M = require('../miniprogram/utils/model');
const Study = require('../miniprogram/utils/study');
const A = require('../miniprogram/utils/semester-store');
const G = require('../miniprogram/utils/grades');
const PDF = require('../miniprogram/utils/pdf-export');
let modal, pageScroll = 0;
const store = {};
const wx = {
  getStorageSync: k => store[k], setStorageSync: (k, v) => {store[k] = M.clone(v);},
  showModal: o => {modal = o;}, showToast: () => {}, cloud: {init() {}},
  pageScrollTo: o => {pageScroll = o.scrollTop;}, nextTick: fn => fn(),
  getWindowInfo: () => ({windowWidth: 375})
};
function load(name) {
  let page;
  const folder = path.resolve(__dirname, '../miniprogram/pages', name);
  vm.runInNewContext(fs.readFileSync(path.join(folder, 'index.js'), 'utf8'), {Page: x => {page = x;}, require: x => require(path.resolve(folder, x)), wx, console, Date, setTimeout: () => 1, clearTimeout() {}, clearInterval() {}});
  page.data = M.clone(page.data);
  page.setData = function(patch) {
    for (const [k, v] of Object.entries(patch)) {
      const parts = k.replace(/\[(\d+)\]/g, '.$1').split('.');
      let target = this.data;
      for (const key of parts.slice(0, -1)) target = target[key];
      target[parts.at(-1)] = v;
    }
  };
  return page;
}
const base = M.normalize({...M.blank(0, '2026-11-02'), id: 'math', title: 'Mathematik', to: '2027-02-08', shortTitle: 'Math', primary: true, cancelledDates: ['2026-11-09']});
const old = M.normalize({title: 'Legacy', day: 0, start: '08:00', end: '09:00', from: '2026-11-02', to: '2026-11-30'});
assert.deepEqual(old.cancelledDates, []); assert.deepEqual(old.exams, []); assert.deepEqual(old.homework, []);
assert(M.occursOn(base, '2026-11-02')); assert(!M.occursOn(base, '2026-11-09')); assert(M.occursOn(base, '2026-11-16'));
const onlyOne = {...base, to: base.from, cancelledDates: [base.from]};
assert(!M.overlap(onlyOne, {...onlyOne, id: 'other', cancelledDates: []}));
assert.throws(() => M.normalize({...base, cancelledDates: ['2026-02-30']}));
const cells = Study.calendar('2026-11', base, ['2026-11-09']);
assert(cells.find(c => c.date === '2026-11-09').selected);
assert(!cells.find(c => c.date === '2026-11-10').available);
const p = load('index'); p.onLoad(); p.setData({courses: [base], weekStart: '2026-11-02'}); p.refresh();
p.openCancelCalendar(); // Blank editor may be current date; real edit below.
p._gridScrollLeft = 752; p._pageScrollTop = 611; p.setData({selectedDay: 3});
p.openEdit({currentTarget: {dataset: {id: base.id}}});
assert.equal(pageScroll, 0); p.openCancelCalendar();
p.toggleCancelDate({currentTarget: {dataset: {date: '2026-11-02'}}}); p.saveCancelDates();
assert(p.data.form.cancelledDates.includes('2026-11-02')); p.saveCourse();
assert.equal(p.data.gridScrollLeft, 752); assert.equal(pageScroll, 611); assert.equal(p.data.selectedDay, 3); assert.equal(p.data.weekStart, '2026-11-02');
assert.equal(p.data.gridDays[0].blocks.length, 0);
p._suppressTap = 0; p.openEdit({currentTarget: {dataset: {id: base.id}}}); p.closeEditor(); assert.equal(p.data.gridScrollLeft, 752); assert.equal(pageScroll, 611);
p.setData({weekStart: '2026-11-16'}); p.refresh(); assert.equal(p.data.gridDays[0].blocks.length, 1);
// Compact layout keeps every hit target, expands the selected primary and has numbered alternatives.
const parallel = [base, {...base, id: 'physics', title: 'Physik', primary: false}, {...base, id: 'chemistry', title: 'Chemie', primary: false}];
for (const width of [320, 375, 430, 768, 1024, 1366]) {
  const l = Study.gridLayout(parallel, '08:00', '20:00', true, width, 5);
  assert.equal(l.blocks.length, 3); assert(!l.blocks.find(c => c.id === base.id).collapsed);
  assert.deepEqual(l.blocks.filter(c => c.collapsed).map(c => c.number).sort(), [1, 2]);
  assert(l.blocks.every(c => c.widthPct > 0 && c.leftPct >= 0 && c.leftPct + c.widthPct <= 100.001));
  assert(l.blocks.find(c => !c.collapsed).widthPct > l.blocks.find(c => c.collapsed).widthPct);
}
// A real archive follows all persisted course fields; previous semesters and grades are separate.
store[A.KEY] = [];
const gradesBefore = {...G.empty(), terms: [{id: 'grades', program: 'ME', semester: 'W', courses: [G.course({title: 'Grade', credits: 5, grade: '1.3'})]}]};
store[G.KEY] = M.clone(gradesBefore);
const winter = {...M.emptyState(), scheduleId: 'winter', courses: [base], meta: {school: 'FAU', semester: 'W', state: ''}};
A.persist(wx, winter, true); const archiveId = store[A.KEY][0].id;
const edit = {...winter, courses: [{...base, note: 'Changed', cancelledDates: ['2026-11-02']}, {...base, id: 'added', title: 'New'}]};
A.persist(wx, edit); assert.equal(store[A.KEY][0].count, 2); assert.equal(store[A.KEY][0].state.courses[0].note, 'Changed');
assert.equal(store[A.KEY][0].id, archiveId);
const summer = {...winter, scheduleId: 'summer', meta: {school: 'FAU', semester: 'S'}};
A.persist(wx, summer, true); assert.equal(store[A.KEY].length, 2); assert.equal(store[A.KEY].find(r => r.id === archiveId).count, 2);
// Legacy named snapshots must not be overwritten when importing a different semester.
const legacy = {id: 'old-archive', title: 'W', state: M.clone(winter), count: 1}; delete legacy.state.scheduleId;
const migrated = A.updatedRecords([legacy], summer, winter, true);
assert.equal(migrated.length, 2); assert.equal(migrated.find(r => r.id === 'old-archive').state.meta.semester, 'W');
const archivesBeforeFailure = M.clone(store[A.KEY]);
const failing = {getStorageSync: wx.getStorageSync, setStorageSync(k, v) {if (k === A.CURRENT) throw Error('full'); wx.setStorageSync(k, v);}};
assert.throws(() => A.persist(failing, {...summer, courses: []})); assert.deepEqual(store[A.KEY], archivesBeforeFailure);
// Homework badges expire at the actual deadline but the saved history remains available.
const task = {id: 'hw', title: 'Blatt 04', date: '2026-11-05', time: '18:00', end: '', note: 'Submit online', done: false};
const cutoff = Study.deadline(task, 'homework');
assert.equal(Study.decorate({...base, homework: [task]}, cutoff - 1).homeworkCount, 1);
assert.equal(Study.decorate({...base, homework: [task]}, cutoff + 1).homeworkCount, 0);
assert.equal(Study.decorate({...base, homework: [{...task, done: true}]}, cutoff - 1).homeworkCount, 0);
const exam = {...task, id: 'exam', title: 'Exam', end: '20:00', room: 'H5'};
assert.equal(Study.decorate({...base, exams: [exam]}, cutoff + 3600000).examCount, 1);
// Saving the planner updates just that course's tasks and its linked semester archive.
p.setData({...winter, courses: [base]}); A.persist(wx, p.snapshot(), true);
p._suppressTap = 0; p.openEdit({currentTarget: {dataset: {id: base.id}}});
p.openStudy({currentTarget: {dataset: {kind: 'homework'}}}); p.setData({studyForm: task}); p.saveStudy();
assert.equal(p.data.form.homework.length, 1); assert.equal(store[A.CURRENT].courses[0].homework[0].title, task.title);
assert.equal(store[A.KEY].find(r => r.scheduleId === 'winter').state.courses[0].homework[0].title, task.title);
p.closeStudy(); p.closeEditor();
// Clearing is confirmed, empties the linked archive and cannot touch independent grades.
p.clearSchedule(); assert(p.data.courses.length); modal.success({confirm: false}); assert(p.data.courses.length);
p.clearSchedule(); modal.success({confirm: true}); assert.equal(p.data.courses.length, 0); assert.equal(p.data.baseline, null);
assert.equal(store[A.KEY].find(r => r.scheduleId === 'winter').count, 0); assert.deepEqual(store[G.KEY], gradesBefore);
const archives = load('archives'); archives.onLoad({}); archives.open({currentTarget: {dataset: {id: archiveId}}}); assert(archives.data.selected); assert(archives.data.days.every(d => d.blocks.length === 0));
const scheduleBeforeDelete = M.clone(store[A.CURRENT]); archives.remove({currentTarget: {dataset: {id: archiveId}}}); modal.success({confirm: true});
assert(!store[A.KEY].some(r => r.id === archiveId)); assert.deepEqual(store[A.CURRENT], scheduleBeforeDelete); assert.deepEqual(store[G.KEY], gradesBefore);
const g = load('grades'); g.onLoad(); g.clearAllGrades(); modal.success({confirm: false}); assert.equal(g.data.terms.length, 1);
g.clearAllGrades(); modal.success({confirm: true}); assert.equal(g.data.terms.length, 0); assert.deepEqual(store[A.CURRENT], scheduleBeforeDelete);
const full = {...winter, courses: [{...base, homework: [task], exams: [exam]}], infoMode: 'compact'};
const binary = PDF.buildPDF([], {...full, format: 'STUNDENPLAN-v2'}); const decoded = PDF.readEmbedded(binary.buffer);
const pdfLines=PDF.detailPages({measureText:s=>({width:String(s).length*10})},full).flat().map(l=>l.s).join('\n');assert(pdfLines.includes('取消日期：2026-11-09'));assert(pdfLines.includes('考试：Exam'));assert(pdfLines.includes('作业：Blatt 04'));
assert.equal(decoded.courses[0].homework[0].title, task.title); assert.equal(decoded.courses[0].cancelledDates[0], '2026-11-09'); assert.equal(decoded.infoMode, 'compact');
const config = require('../miniprogram/app.json'); assert.equal(config.window.pageOrientation, 'auto'); assert.equal(config.resizable, true);
for (const name of ['index', 'archives', 'grades']) {
  const page = load(name), template = fs.readFileSync(path.join(__dirname, '../miniprogram/pages', name, 'index.wxml'), 'utf8');
  for (const m of template.matchAll(/(?:bind|catch)\w+="(\w+)"/g)) assert.equal(typeof page[m[1]], 'function', name + ': ' + m[1]);
}
console.log('PASS: cancellation calendar and recurrence, saved return position, compact primary and 1/2 lanes at six viewport widths, linked and historical archives, legacy migration, failure rollback, empty archive opening, scoped deletion, planner save/deadlines, independent grades and complete PDF backup');
