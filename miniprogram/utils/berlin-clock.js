const M = require('./model');
const hour = 3600000;
let formatter;
try {
  formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
  });
} catch (_) {}

function lastSunday(year, month) {
  const end = new Date(Date.UTC(year, month + 1, 0, 1));
  return Date.UTC(year, month, end.getUTCDate() - end.getUTCDay(), 1);
}

function isSummer(now) {
  const year = new Date(now).getUTCFullYear();
  return now >= lastSunday(year, 2) && now < lastSunday(year, 9);
}

function at(day, time) {
  const wallTime = Date.parse(day + 'T' + time + ':00Z');
  const summerTime = wallTime - 2 * hour;
  // Use the first occurrence in autumn and roll forward through the gap in spring.
  return isSummer(summerTime) ? summerTime : wallTime - hour;
}

function today(now = Date.now()) {
  if (formatter && typeof formatter.formatToParts === 'function') {
    const parts = {};
    for (const {type, value} of formatter.formatToParts(now)) parts[type] = value;
    return parts.year+'-'+parts.month+'-'+parts.day;
  }
  // Older runtimes without Intl still need the current CET/CEST transition dates.
  return new Date(now + (isSummer(now) ? 2 : 1)*hour).toISOString().slice(0, 10);
}

function week(day = today()) {
  const selectedDay = (M.date(day).getDay()+6)%7;
  return {todayDate:day, selectedDay, weekStart:M.addDays(day, -selectedDay)};
}

function nextMidnight(now) {
  const tomorrow = M.addDays(today(now), 1);
  const utcMidnight = Date.parse(tomorrow);
  return today(utcMidnight - 2*hour) === tomorrow ? utcMidnight - 2*hour : utcMidnight - hour;
}

module.exports = {today, week, nextMidnight, at};
