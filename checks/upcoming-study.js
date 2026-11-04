const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../miniprogram/utils/model');
const Study = require('../miniprogram/utils/study');
const Berlin = require('../miniprogram/utils/berlin-clock');

assert.equal(Berlin.at('2026-07-01', '18:00'), Date.parse('2026-07-01T16:00:00Z'));
assert.equal(Berlin.at('2026-11-04', '18:00'), Date.parse('2026-11-04T17:00:00Z'));
assert.equal(Berlin.at('2026-03-29', '02:30'), Date.parse('2026-03-29T01:30:00Z'));
assert.equal(Berlin.at('2026-10-25', '02:30'), Date.parse('2026-10-25T00:30:00Z'));

const task = (id, date, time, extra) => ({id, title: id, date, time, ...extra});
const course = M.normalize({...M.blank(0, '2026-10-12'), title: 'Elektrotechnik', note: '1. PG',
  homework: [task('已完成', '2026-11-05', '09:00', {done:true}), task('已过期', '2026-11-04', '20:00'),
    task('今天截止', '2026-11-04', '23:59', {note:'按要求上传 PDF\n保存提交回执'})],
  exams: [task('周四考试', '2026-11-05', '08:00', {end:'09:30', room:'H 11'})]});
const other = M.normalize({...M.blank(3, '2026-10-15'), title: 'Experimentalphysik',
  homework: [task('两天后截止', '2026-11-06', '09:00')]});
const courses = [other, course];
const now = Date.parse('2026-11-04T22:55:00Z');
const result = Study.upcoming(courses, now, 2);
assert.deepEqual([result.exams, result.homework, result.hasMore], [1, 2, true]);
assert.deepEqual(result.rows.map(t => t.title), ['今天截止','周四考试']);
assert.deepEqual(result.rows.map(t => t.status), ['今天截止','明天考试']);
assert.equal(result.rows[1].room, 'H 11');
assert.equal(Study.upcoming(courses, now, 16).rows[2].status, '还有 2 天');
assert.equal(Study.upcoming(courses, now, 0).rows.length, 0);
assert.equal(Study.upcoming(courses, Date.parse('2026-11-04T23:00:00Z'), 16).rows[0].status, '今天考试');
assert.equal(Study.upcoming(courses, Date.parse('2026-11-05T07:05:00Z'), 16).rows[0].status, '考试进行中');
assert.equal(Study.upcoming(courses, Date.parse('2026-11-05T08:31:00Z'), 16).exams, 0);

const pagePath = path.resolve(__dirname, '../miniprogram/pages/index');
const template = fs.readFileSync(path.join(pagePath, 'index.wxml'), 'utf8');
assert.match(template, /class="editor"><view wx:if="{{!studyKind}}">[\s\S]*?<textarea[^>]*value="{{form\.note}}"[\s\S]*?<view wx:else class="study-page /);
const store = {};
const wx = {
  pageScrollTo: ({scrollTop}) => {top = scrollTop;},
  getStorageSync: key => store[key], setStorageSync: (key, value) => {store[key] = value;},
  showToast() {}
};
let page, top;
vm.runInNewContext(fs.readFileSync(path.join(pagePath, 'index.js'), 'utf8'), {
  Page: value => {page = value;}, require: request => require(path.resolve(pagePath, request)), wx, Date
});
page.setData = function(patch) {Object.assign(this.data, patch);};
const originalNow = Date.now;
try {
  Date.now = () => now;
  Object.assign(page.data, Berlin.week(), {courses});
  page.refresh();
  assert.equal(page.data.agendaOpen, false);
  assert.equal(page.data.agenda.homework, 2);
  page.toggleAgenda();
  assert.equal(page.data.agendaOpen, true);
  page._gridScrollLeft = 650;
  page.onPageScroll({scrollTop:132});
  const event = dataset => ({currentTarget:{dataset}});
  page.openAgendaDetail(event({key:page.data.agenda.rows[0].key}));
  assert.equal(page.data.isEditor, false);
  assert.equal(page.data.agendaDetail.note, '按要求上传 PDF\n保存提交回执');
  page.closeAgendaDetail();
  assert.equal(page.data.agendaDetail, null);
  page.openAgendaDetail(event({key:page.data.agenda.rows[1].key}));
  assert.equal(page.data.agendaDetail.room, 'H 11');
  page.editAgendaTask();
  assert.equal(page.data.agendaDetail, null);
  assert.equal(page.data.studyKind, 'exam');
  assert.equal(page.data.studyFromAgenda, true);
  assert.equal(page.data.studyForm.id, '周四考试');
  assert.equal(page.data.editingId, course.id);
  assert.equal(top, 0);
  page.closeStudy();
  assert.equal(page.data.isEditor, false);
  assert.equal(page.data.agendaOpen, true);
  assert.equal(page.data.gridScrollLeft, 650);
  assert.equal(top, 132);
  page.openAgendaDetail(event({key:page.data.agenda.rows[0].key}));
  page.editAgendaTask();
  assert.equal(page.data.studyKind, 'homework');
  page.data.studyForm.title = '更新后的作业';
  page.saveStudy();
  assert.equal(page.data.isEditor, false);
  assert.equal(page.data.agenda.rows[0].title, '更新后的作业');
  assert.equal(page.data.agenda.rows[1].title, '周四考试');
  const savedCourse = store.stundenplan_complete_v2.courses.find(c => c.id === course.id);
  assert(savedCourse.homework.some(t => t.title === '更新后的作业'));
  assert.equal(savedCourse.note, '1. PG');

  page.openEdit(event({id:course.id}));
  page.onPageScroll({scrollTop:412});
  page.openStudy(event({kind:'homework'}));
  page.editStudy(event({id:'今天截止'}));
  assert.equal(page.data.studyEditing, true);
  assert.equal(page.data.studyFromAgenda, false);
  page.closeStudy();
  assert.equal(page.data.isEditor, true);
  assert.equal(page.data.studyKind, '');
  assert.equal(page.data.form.note, '1. PG');
  assert.equal(top, 412);
  page.closeEditor();
  assert.equal(page.data.isEditor, false);
  assert.equal(top, 132);
  page.changeWeek({currentTarget:{dataset:{delta:-1}}});
  assert.equal(page.data.agenda.rows.length, 3);
  page.setData({courses:[]});
  page.refresh();
  assert.equal(page.data.agenda.rows.length, 0);
} finally {
  Date.now = originalNow;
}
console.log('PASS: Berlin deadlines and DST, sorting, paging, task detail and save, independent return paths');
