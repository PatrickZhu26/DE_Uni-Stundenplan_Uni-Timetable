const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../miniprogram/utils/model');
const Berlin = require('../miniprogram/utils/berlin-clock');

assert.equal(Berlin.nextMidnight(Date.parse('2026-03-29T10:00:00Z')), Date.parse('2026-03-29T22:00:00Z'));
assert.equal(Berlin.nextMidnight(Date.parse('2026-10-25T10:00:00Z')), Date.parse('2026-10-25T23:00:00Z'));
const realNow = Date.now;
let now = Date.parse('2026-11-03T22:59:59Z');
let page, timer, modal;
const root = path.resolve(__dirname, '../miniprogram/pages/index');
const store = {};
const wx = {
  getStorageSync: key => store[key], setStorageSync: (key, value) => {store[key] = value;},
  getWindowInfo: () => ({windowWidth:390}), cloud: {init() {}}, showModal: value => {modal = value;}
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'index.js'), 'utf8'), {
  Page: value => {page = value;}, require: request => require(path.resolve(root, request)), wx, console, Date,
  setTimeout: (callback, delay) => {timer = {callback, delay}; return 1;},
  clearTimeout: () => {timer = null;}
});
page.setData = function(patch) {Object.assign(this.data, patch);};

try {
  Date.now = () => now;
  page.onLoad();
  page.onShow();
  assert.equal(page.data.todayDate, '2026-11-03');
  assert.equal(page.data.selectedDay, 1);
  assert.equal(timer.delay, 1050);
  now = Date.parse('2026-11-03T23:00:00.050Z');
  timer.callback();
  assert.equal(page.data.todayDate, '2026-11-04');
  assert.equal(page.data.weekStart, '2026-11-02');
  assert.equal(page.data.selectedDay, 2);
  assert(page.data.dayTabs[2].active);

  const course = M.normalize({...M.blank(0, '2026-10-12'), title:'Elektrotechnik',
    to:'2027-02-01', cancelledDates:['2026-10-12'], sourceCancelledDates:['2026-10-12']});
  page.acceptResult({courses:[course], meta:{school:'Test'}});
  page.confirmPDFImport();
  modal.success({confirm:true});
  assert.equal(page.data.weekStart, '2026-11-02');
  assert.equal(page.data.selectedDay, 2);

  page.onHide();
  assert.equal(timer, null);
  now = Date.parse('2026-11-08T23:00:00Z');
  page.onShow();
  assert.equal(page.data.weekStart, '2026-11-09');
  assert.equal(page.data.selectedDay, 0);
  page.changeWeek({currentTarget:{dataset:{delta:-4}}});
  assert.equal(page.data.weekStart, '2026-10-12');
  assert.equal(page.data.gridDays[0].blocks.length, 0);
  assert.equal(page.data.schoolCancellations[0].date, '2026-10-12');
  now = Date.parse('2026-11-09T23:00:00Z');
  timer.callback();
  assert.equal(page.data.weekStart, '2026-10-12');
  page.returnToday();
  assert.equal(page.data.weekStart, '2026-11-09');
  assert.equal(page.data.todayDate, '2026-11-10');
  assert.equal(page.data.selectedDay, 1);
  assert.equal(page.data.schoolCancellations.length, 0);
  page.onUnload();
  assert.equal(timer, null);
} finally {
  Date.now = realNow;
}
console.log('PASS: Berlin midnight and DST, import and return to current week, foreground recovery, school cancellations and manual week browsing');
