// Install the cloud function's npm dependencies before running this check.
const assert = require('node:assert/strict');
const { parseItems } = require('../cloudfunctions/parseSchedule/parser');
const { calendarText, parseCalendar } = require('../cloudfunctions/parseSchedule/calendar');
const M = require('../miniprogram/utils/model');
const Study = require('../miniprogram/utils/study');

// Campo's PDF has a legend that repeats the label used for an actual appointment.
const item = (s, x, y) => ({ s, x, y, h: 8 });
const pdf = parseItems([[
  item('Do., 05.11.2026', 110, 20),
  item('Übungen zur Physik, Übung', 108, 48),
  item('14:00 Uhr', 100, 64), item('16:00 Uhr', 150, 64),
  item('14-täglich', 100, 72), item('22.10.26 - 04.02.27', 100, 80),
  item('Fr., 06.11.2026', 310, 20),
  item('Labor-Einführung, Sonstige Lehrveranstaltung', 308, 48),
  item('10:00 Uhr', 300, 64), item('12:00 Uhr', 350, 64),
  item('Einzeltermin', 300, 72), item('06.11.26', 300, 80),
  item('Einzeltermin', 64, 600), item('wöchentlich', 130, 600)
]]);
assert.deepEqual(pdf.warnings, []);
assert.equal(pdf.courses.length, 2);
const [fortnight, oneOff] = pdf.courses.map(M.normalize);
assert.equal(fortnight.weekInterval, 2);
assert(M.occursOn(fortnight, '2026-10-22'));
assert(!M.occursOn(fortnight, '2026-10-29'));
assert(M.occursOn(fortnight, '2026-11-05'));
assert(!Study.calendar('2026-10', fortnight, []).find(cell => cell.date === '2026-10-29').available);
assert.equal(oneOff.building, '');
assert(M.occursOn(oneOff, '2026-11-06'));
assert(!M.occursOn(oneOff, '2026-11-13'));

// Standards-based feed on another university domain. UTC dates cross the DST boundary.
const icsText = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//University Timetable Test//DE',
  'BEGIN:VEVENT',
  'UID:repeat@example.edu',
  'DTSTART;TZID=Europe/Berlin:20261022T140000',
  'DTEND;TZID=Europe/Berlin:20261022T160000',
  'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=5',
  'EXDATE;TZID=Europe/Berlin:20261105T140000',
  'SUMMARY:Physikübung',
  'LOCATION:Hörsaal 1',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:repeat@example.edu',
  'RECURRENCE-ID;TZID=Europe/Berlin:20261119T140000',
  'DTSTART;TZID=Europe/Berlin:20261120T140000',
  'DTEND;TZID=Europe/Berlin:20261120T160000',
  'LOCATION:Hörsaal 2',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:repeat@example.edu',
  'RECURRENCE-ID;TZID=Europe/Berlin:20261203T140000',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:single@example.edu',
  'DTSTART:20261106T090000Z',
  'DTEND:20261106T110000Z',
  'SUMMARY:Einzeltermin',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');
const ics = parseCalendar(icsText, 'campus.example.edu');
const urlPrefixed = parseCalendar('https://campus.example.edu/calendar.php'+icsText);
assert.deepEqual(urlPrefixed.courses, ics.courses);
assert.equal(calendarText('<html>'+icsText+'</html>'), '');
assert.deepEqual(ics.warnings, []);
const courses = ics.courses.map(M.normalize);
assert.equal(courses.length, 3);
assert.equal(ics.meta.school, '');
const recurring = courses.find(course => course.room === 'Hörsaal 1');
assert.equal(recurring.weekInterval, 2);
assert.deepEqual(recurring.cancelledDates, ['2026-11-05', '2026-11-19', '2026-12-03']);
assert.equal(recurring.start, '14:00');
const replacement = courses.find(course => course.room === 'Hörsaal 2');
assert.equal(replacement.title, 'Physikübung');
assert.equal(replacement.from, '2026-11-20');
assert.equal(courses.find(course => course.title === 'Einzeltermin').start, '10:00');

const schoolCalendar = [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'UID:excluded-first@example.edu',
  'DTSTART;TZID=Europe/Berlin:20261012T101500',
  'DTEND;TZID=Europe/Berlin:20261012T114500',
  'RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261102T114500',
  'EXDATE;TZID=Europe/Berlin:20261012T101500',
  'SUMMARY:Elektrotechnik', 'CATEGORIES:Vorlesung',
  'END:VEVENT',
  'BEGIN:VEVENT', 'UID:alternate-week@example.edu',
  'DTSTART;TZID=Europe/Berlin:20261022T140000',
  'DTEND;TZID=Europe/Berlin:20261022T160000',
  'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TH;UNTIL=20261112T160000',
  'SUMMARY:Übungen zur Physik', 'CATEGORIES:Übung',
  'END:VEVENT',
  'BEGIN:VEVENT', 'UID:description@example.edu',
  'DTSTART;TZID=Europe/Berlin:20261106T100000',
  'DTEND;TZID=Europe/Berlin:20261106T120000',
  'SUMMARY:Kontaktmesse', 'CATEGORIES:Sonstige Lehrveranstaltung',
  'DESCRIPTION:<p>Einführung &amp; Übungen</p><p>Vorbereitung auf Prüfungen</p>',
  'END:VEVENT', 'END:VCALENDAR'
].join('\r\n');
const [electrical, physics, fair] = parseCalendar(schoolCalendar).courses.map(M.normalize);
assert.equal(electrical.from, '2026-10-12');
assert.deepEqual(electrical.sourceCancelledDates, ['2026-10-12']);
assert(!M.occursOn(electrical, '2026-10-12'));
assert(M.occursOn(electrical, '2026-10-19'));
assert.equal(physics.type, 'Übung');
assert.equal(physics.to, '2026-11-12');
assert(!M.occursOn(physics, '2026-11-12'));
assert.equal(fair.type, 'Sonstige Lehrveranstaltung');
assert.equal(fair.note, 'Einführung & Übungen\nVorbereitung auf Prüfungen');
console.log('PASS: Campo PDF one-offs and fortnightly dates, standard ICS exclusions, changed/cancelled events and Berlin time');
