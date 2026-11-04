const ICAL = require('ical.js');
const {compile} = require('html-to-text');
const {metaFrom} = require('./parser');

const DAY_MS = 86400000;
const MAX_EVENT_DAYS = 730;
const MAX_OCCURRENCES = 10000;
const timetableTypes = ['Vorlesung', 'Übung', 'Tutorium', 'Seminar', 'Praktikum', 'Kolloquium', 'Sonstige Lehrveranstaltung'];
const htmlToText = compile({wordwrap: false, preserveNewlines: true, selectors: [
  {selector: 'a', options: {ignoreHref: true}},
  {selector: 'img', format: 'skip'}
]});
const berlin = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

function calendarText(value) {
  const text = value.trim();
  // Some exporters put their source URL immediately before the calendar.
  const marker = text.match(/^(?:https:\/\/[^\s<>]{1,4096}?\s*)?(BEGIN:VCALENDAR)(?:\r\n|\n|\r)/i);
  return marker ? 'BEGIN:VCALENDAR\n'+text.slice(marker[0].length) : '';
}

function civilTime(time) {
  if (!time || time.isDate) return '';
  // Floating times in a German timetable are already in campus time.
  if (['floating', 'Europe/Berlin'].includes(time.zone.tzid)) return time.toString();
  const parts = Object.fromEntries(berlin.formatToParts(time.toJSDate()).map(({type,value}) => [type,value]));
  return parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute+':'+parts.second;
}

function occurrenceCourse({item, startDate, endDate}, original) {
  const start = civilTime(startDate);
  const end = civilTime(endDate);
  const from = start.slice(0, 10);
  const begin = start.slice(11, 16);
  const finish = end.slice(11, 16);
  const title = (item.summary ?? original.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!title || !from || from !== end.slice(0, 10) || begin >= finish) return null;
  const categoryProps = item.component.hasProperty('categories') ? item.component : original.component;
  const categories = categoryProps.getAllProperties('categories').flatMap(p => p.getValues())
    .map(category => category.trim().toLowerCase());
  const description = item.description ?? original.description ?? '';
  const note = /<\/?[a-z][^>]*>|&(?:#[\da-fx]+|[a-z]+);/i.test(description)
    ? htmlToText(description).replace(/\n{2,}/g, '\n') : description;
  return {
    day: (new Date(from).getUTCDay() + 6) % 7, from, to: from, title,
    start: begin, end: finish, room: (item.location ?? original.location ?? '').trim().slice(0, 400), building: '', teacher: '',
    note: note.trim().slice(0, 5000),
    type: timetableTypes.find(type => categories.includes(type.toLowerCase())) || 'Sonstiges'
  };
}

function seriesKey(course) {
  return JSON.stringify([course.day, course.start, course.end, course.title, course.type, course.room, course.note]);
}

function collapseDates(series, interval, originalRange) {
  const dates = [...series.dates].sort();
  const last = dates[dates.length - 1];
  const from = originalRange && originalRange.from < dates[0] ? originalRange.from : dates[0];
  const to = originalRange && originalRange.to > last ? originalRange.to : last;
  const first = Date.parse(from);
  let step = interval * 7 * DAY_MS;
  if (dates.some(date => (Date.parse(date) - first) % step !== 0)) {
    interval = 1;
    step = 7 * DAY_MS;
  }
  const cancelledDates = [];
  for (let time = first; time <= Date.parse(to); time += step) {
    const date = new Date(time).toISOString().slice(0, 10);
    if (!series.dates.has(date)) cancelledDates.push(date);
  }
  const sourceCancelledDates = originalRange ? cancelledDates.filter(date => originalRange.excluded.has(date)) : [];
  return {...series.course, from, to, weekInterval: from === to ? 1 : interval, cancelledDates, sourceCancelledDates};
}

function originalWeeklyRange(event, rules) {
  if (rules.length !== 1 || rules[0].freq !== 'WEEKLY') return null;
  const course = occurrenceCourse({item:event, startDate:event.startDate, endDate:event.endDate}, event);
  if (!course) return null;
  const until = civilTime(rules[0].until).slice(0, 10);
  const bounded = Date.parse(until) - Date.parse(course.from) <= MAX_EVENT_DAYS * DAY_MS;
  const excluded = new Set(event.component.getAllProperties('exdate').flatMap(prop => prop.getValues())
    .map(civilTime).filter(date => date.slice(11, 16) === course.start).map(date => date.slice(0, 10)));
  return {key:seriesKey(course), from:course.from, to:bounded ? until : '', excluded};
}

function parseCalendar(text, sourceHost = '') {
  let calendar;
  try { calendar = new ICAL.Component(ICAL.parse(calendarText(text))); }
  catch (_) { throw Error('学校返回的 iCalendar 文件格式不完整，请重新复制导出链接'); }
  if (calendar.name !== 'vcalendar') throw Error('链接没有返回有效的 iCalendar 课表');
  const components = calendar.getAllSubcomponents('vevent');
  if (components.length > 2000) throw Error('日历事件过多，请从学校系统导出一个学期的课表');
  const overrides = new Map();
  const masterUIDs = new Set();
  for (const component of components) {
    const uid = component.getFirstPropertyValue('uid');
    if (!component.hasProperty('recurrence-id')) {
      if (uid) masterUIDs.add(uid);
      continue;
    }
    if (!uid) continue;
    if (!overrides.has(uid)) overrides.set(uid, []);
    // CANCELLED overrides may omit DTSTART. Give the library an occurrence time to match.
    if (!component.hasProperty('dtstart') && component.getFirstPropertyValue('status') === 'CANCELLED') {
      const recurrence = component.getFirstProperty('recurrence-id');
      const start = new ICAL.Property('dtstart');
      const zone = recurrence.getParameter('tzid');
      if (zone) start.setParameter('tzid', zone);
      start.setValue(recurrence.getFirstValue());
      component.addProperty(start);
    }
    overrides.get(uid).push(component);
  }

  const courses = [];
  const seen = new Set();
  let skipped = 0, clipped = false, occurrenceCount = 0;
  for (const component of components) {
    if (component.getFirstPropertyValue('status') === 'CANCELLED') continue;
    const uid = component.getFirstPropertyValue('uid');
    if (component.hasProperty('recurrence-id') && masterUIDs.has(uid)) continue;
    const event = new ICAL.Event(component, {exceptions: overrides.get(uid) || [], strictExceptions: true});
    if (!event.startDate || event.startDate.isDate) {
      skipped++;
      continue;
    }
    const rules = component.getAllProperties('rrule').map(prop => prop.getFirstValue());
    if (rules.some(rule => !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(rule.freq))) {
      skipped++;
      continue;
    }
    const interval = rules.length === 1 && rules[0].freq === 'WEEKLY' ? Math.min(52, rules[0].interval || 1) : 1;
    const originalRange = originalWeeklyRange(event, rules);
    const groups = new Map();
    const iterator = event.isRecurring() ? event.iterator() : null;
    const firstDay = Date.parse(civilTime(event.startDate).slice(0, 10));
    let occurrence = iterator ? iterator.next() : event.startDate;
    while (occurrence) {
      if (++occurrenceCount > MAX_OCCURRENCES) throw Error('日历事件过多，请从学校系统导出一个学期的课表');
      if (Date.parse(civilTime(occurrence).slice(0, 10)) - firstDay > MAX_EVENT_DAYS * DAY_MS) {
        clipped = true;
        break;
      }
      const details = event.getOccurrenceDetails(occurrence);
      if (details.item.component.getFirstPropertyValue('status') !== 'CANCELLED') {
        const course = occurrenceCourse(details,event);
        if (!course) skipped++;
        else {
          // A changed classroom, weekday or time needs its own timetable row.
          const key = seriesKey(course);
          if (!groups.has(key)) groups.set(key, {course, dates: new Set()});
          groups.get(key).dates.add(course.from);
        }
      }
      occurrence = iterator ? iterator.next() : null;
    }
    for (const [key, group] of groups) {
      const course = collapseDates(group, interval, key === originalRange?.key ? originalRange : null);
      const fingerprint = JSON.stringify([key, course.from, course.to, course.weekInterval, course.cancelledDates]);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      if (courses.length === 500) throw Error('识别到超过500条课程，请从学校系统导出一个学期的课表');
      courses.push({...course, id: 'ics_' + courses.length, color: courses.length % 7});
    }
  }
  const warnings = [];
  if (skipped) warnings.push('有 '+skipped+' 个事件缺少有效的同日上课时间，或使用了非常规重复规则，未加入预览。');
  if (clipped) warnings.push('重复超过两年的日历事件已按起始日期起的两年范围导入。');
  const header = ['x-wr-calname', 'name'].map(name => ({s: String(calendar.getFirstPropertyValue(name) || '')})).filter(item => item.s);
  if (sourceHost === 'campo.fau.eu' || sourceHost === 'www.campo.fau.eu') header.push({s: 'FAU'});
  return {courses: courses.sort((a,b) => a.day-b.day || a.start.localeCompare(b.start) || a.from.localeCompare(b.from)), meta: metaFrom(header), warnings, adapter: 'icalendar'};
}

module.exports = {calendarText,parseCalendar};
