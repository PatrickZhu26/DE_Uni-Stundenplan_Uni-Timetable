const M = require('./model');
const PDF = require('./pdf-export');
const windowContexts = new WeakMap();

function deadline(task, kind) {
  const d = M.date(task.date);
  const value = kind === 'exam' ? task.end || task.time : task.time;
  d.setHours(Number(value.slice(0, 2)), Number(value.slice(3, 5)), 0, 0);
  return d.getTime();
}

function active(items, kind, now = Date.now()) {
  return (items || []).filter(t => !t.done && deadline(t, kind) >= now)
    .sort((a, b) => deadline(a, kind) - deadline(b, kind));
}

function decorate(course, now = Date.now()) {
  const homework = active(course.homework, 'homework', now);
  const exams = active(course.exams, 'exam', now);
  const next = homework[0];
  const left = next ? deadline(next, 'homework') - now : 0;
  return {...course, compactRoom: PDF.shortRoom(course.room), homeworkCount: homework.length, examCount: exams.length,
    homeworkLabel: next ? (left <= 86400000 ? '即将截止 · ' : '作业 · ') + next.date.slice(5).replace('-', '/') + ' ' + next.time : '',
    homeworkDueLabel: next ? next.date.slice(5).replace('-', '/') + ' ' + next.time : '',
    homeworkUrgent: !!next && left <= 86400000,
    examLabel: exams.length ? '考试 · ' + exams[0].date.slice(5).replace('-', '/') + ' ' + exams[0].time : ''};
}

function calendar(month, course, selected) {
  const first = month + '-01';
  const offset = (M.date(first).getDay() + 6) % 7;
  const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0, 12).getDate();
  const cells = [];
  for (let i = 0; i < Math.ceil((offset + end) / 7) * 7; i++) {
    const ds = M.addDays(first, i - offset);
    const inMonth = ds.slice(0, 7) === month;
    const available = inMonth && ds >= course.from && ds <= course.to && (M.date(ds).getDay() + 6) % 7 === course.day;
    cells.push({date: ds, day: Number(ds.slice(8)), inMonth, available, selected: selected.includes(ds)});
  }
  return cells;
}

function windowWidth(api) {
  try { const info = api.getWindowInfo ? api.getWindowInfo() : api.getSystemInfoSync(); return info.windowWidth || 375; }
  catch (_) { return 375; }
}

function layoutContext(api, width) {
  let info = {};
  try { info = api.getWindowInfo ? api.getWindowInfo() : api.getSystemInfoSync(); } catch (_) {}
  const reportedWidth = Number(info.windowWidth) || 375;
  const previous = windowContexts.get(api);
  // Some clients return their previous system dimensions during/after rotation.
  const viewportWidth = Number(width) || (previous && previous.reportedWidth === reportedWidth ? previous.width : reportedWidth);
  windowContexts.set(api, {width: viewportWidth, reportedWidth});
  const shortSide = Math.min(Number(info.screenWidth) || viewportWidth, Number(info.screenHeight) || viewportWidth);
  const area = reportedWidth === viewportWidth ? info.safeArea || {} : {};
  const left = Math.max(0, Number(area.left) || 0);
  const right = area.right == null ? 0 : Math.max(0, (Number(info.screenWidth) || viewportWidth) - Number(area.right));
  const safeAreaStyle = '--safe-left:' + Math.min(left, viewportWidth / 3) + 'px;--safe-right:' + Math.min(right, viewportWidth / 3) + 'px';
  return {viewportWidth, fitGrid: viewportWidth >= 600 || shortSide >= 600, safeAreaStyle};
}

function setPrimary(items, id, primary) {
  const selected = items.find(c => c.id === id);
  if (!selected) return items;
  return items.map(c => c.id === id ? {...c, primary: !!primary}
    : primary && M.overlap(c, selected) ? {...c, primary: false} : c);
}

function gridLayout(items, start, end, compact, viewport, dayCount, options = {}) {
  const layout = M.layout(items, start, end);
  const axis = compact ? 44 : 62;
  const fit = options.fit === undefined ? viewport >= 600 : !!options.fit;
  const content = options.contentWidth > axis ? options.contentWidth : Math.min(viewport, 1200) - (viewport >= 600 ? 56 : viewport * 52 / 750) - 2;
  const column = Math.max(1, (content - axis) / Math.max(1, dayCount));
  // A tablet's actual container width is the budget, including overlapping sessions.
  if (!compact) return {...layout, width: fit ? column : Math.max(layout.width, column)};
  // Colour intervals into lanes. A preferred course takes lane zero whenever possible.
  const ordered = layout.blocks.slice().sort((a, b) => Number(b.primary) - Number(a.primary) || a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const lanes = [];
  const laneFor = {};
  for (const c of ordered) {
    let lane = lanes.findIndex(items => items.every(x => x.end <= c.start || x.start >= c.end));
    if (lane < 0) { lane = lanes.length; lanes.push([]); }
    lanes[lane].push(c);
    laneFor[c.id] = lane;
  }
  // Each numbered course keeps its own hit target and its original time interval.
  const width = fit ? column : Math.max(56, 48 + Math.max(0, lanes.length - 1) * 18, column);
  const blocks = layout.blocks.map(c => {
    const simultaneous = layout.blocks.filter(x => x.id === c.id || x.start < c.end && c.start < x.end);
    const count = Math.max(...simultaneous.map(x => laneFor[x.id])) + 1;
    const lane = laneFor[c.id];
    const small = lane > 0;
    const stripe = Math.min(18, width / (count + 2));
    const left = small ? width - (count - lane) * stripe : 0;
    return {...c, collapsed: small, number: lane, leftPct: left / width * 100, widthPct: (small ? stripe : width - (count - 1) * stripe) / width * 100};
  });
  return {blocks, maxColumns: lanes.length || 1, width};
}

module.exports = {deadline, active, decorate, calendar, windowWidth, layoutContext, setPrimary, gridLayout};
