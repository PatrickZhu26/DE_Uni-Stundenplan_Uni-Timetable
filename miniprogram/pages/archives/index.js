const M = require('../../utils/model');
const H = require('../../utils/holidays');
const A = require('../../utils/semester-store');
const Study = require('../../utils/study');
const toast = title => wx.showToast({title, icon: 'none'});
const error = e => wx.showModal({title: '操作未完成', content: e.message || '请先备份并检查存储空间。', showCancel: false});
Page({
  data: {records: [], selected: null, weekStart: '', weekLabel: '', days: [], hours: [], width: 1200, height: 1200, viewportWidth: 375, fitGrid: false, gridViewportWidth: 0, headerHeight: 70},
  onLoad(o) {this.setData(Study.layoutContext(wx)); this.reload(); if (o.save === '1') this.saveCurrent();},
  onShow() {this.setData(Study.layoutContext(wx)); this.reload();},
  onResize(e) {this.setData({...Study.layoutContext(wx, e.size.windowWidth), gridViewportWidth: 0}); if (this.data.selected) this.render();},
  reload() {
    const records = A.load(wx);
    const selected = this.data.selected && records.find(r => r.id === this.data.selected.id) || null;
    this.setData({records, selected});
    if (selected) this.render();
  },
  saveCurrent() {
    const saved = wx.getStorageSync(A.CURRENT);
    if (!saved || !saved.courses || !saved.courses.length) return toast('请先添加或导入课程');
    const state = {...M.clone(saved), scheduleId: saved.scheduleId || M.uid()};
    const existing = this.data.records.find(r => A.linked(r, state, saved));
    if (!existing && this.data.records.length >= 50) return toast('最多保存50份学期课表');
    const name = existing ? existing.title : A.title(state);
    wx.showModal({title: existing ? '更新学期课表' : '保存学期课表', editable: true, placeholderText: '学校 / 专业 / 学期', content: name,
      success: r => {
        if (!r.confirm) return;
        try {
          A.persist(wx, state, true);
          const records = A.load(wx).map(record => record.scheduleId === state.scheduleId ? {...record, title: (r.content || name).trim().slice(0, 150)} : record);
          wx.setStorageSync(A.KEY, records);
          this.reload();
          toast('已保存，后续修改自动同步');
        } catch (e) {error(e);}
      }
    });
  },
  open(e) {
    const selected = this.data.records.find(r => r.id === e.currentTarget.dataset.id);
    if (!selected) return;
    const courses = selected.state.courses || [];
    const first = courses.length ? courses.reduce((a, c) => c.from < a ? c.from : a, courses[0].from) : M.fmt(new Date());
    this.setData({selected, weekStart: M.monday(M.date(first))}); this.render();
  },
  close() {this.setData({selected: null});},
  week(e) {this.setData({weekStart: M.addDays(this.data.weekStart, Number(e.currentTarget.dataset.delta) * 7)}); this.render();},
  render() {
    const s = this.data.selected.state, v = M.validView(s.view) ? s.view : M.defaultView();
    const start = M.minute(v.start), end = M.minute(v.end), height = (end - start) * 100 / 60;
    const days = v.days.map(day => {
      const date = M.addDays(this.data.weekStart, day), holiday = H.info(date, s.holiday || H.normalize());
      const courses = holiday.suspended ? [] : s.courses.filter(c => M.occursOn(c, date)).map(c => Study.decorate(c));
      return {day, name: M.days[day], date, ...Study.gridLayout(courses, v.start, v.end, s.infoMode === 'compact', this.data.viewportWidth, v.days.length, {fit: this.data.fitGrid, contentWidth: this.data.gridViewportWidth}), holiday};
    });
    const hours = [];
    for (let n = start; n <= end; n += 60) hours.push({label: M.time(n), top: (n - start) * 100 / 60});
    this.setData({days, hours, height, width: (s.infoMode === 'compact' ? 44 : 62) + days.reduce((n, d) => n + d.width, 0), weekLabel: this.data.weekStart + ' — ' + M.addDays(this.data.weekStart, 6)});
    this.measureTimetable();
  },
  measureTimetable() {
    if (!wx.nextTick || !wx.createSelectorQuery) return;
    wx.nextTick(() => {
      if (!this.data.selected) return;
      let frame, header;
      const q = wx.createSelectorQuery().in(this);
      q.select('.archive-scroll').boundingClientRect(r => {frame = r;});
      q.select('.grid-head').boundingClientRect(r => {header = r;});
      q.exec(() => {
        const patch = {}, width = frame && Math.floor(frame.width) - 2;
        if (width > 0 && Math.abs(width - this.data.gridViewportWidth) > .5) patch.gridViewportWidth = width;
        if (header && header.height > 0 && Math.abs(header.height - this.data.headerHeight) > 1) patch.headerHeight = Math.ceil(header.height);
        if (!Object.keys(patch).length) return;
        this.setData(patch);
        if (patch.gridViewportWidth) this.render();
      });
    });
  },
  showDetails(e) {
    const course = this.data.selected.state.courses.find(c => c.id === e.currentTarget.dataset.id);
    if (!course) return;
    wx.showModal({title: course.title, content: [M.days[course.day] + ' ' + course.start + '–' + course.end, course.from + ' 至 ' + course.to, [course.building, course.room].filter(Boolean).join(' · '), course.teacher, course.note, course.cancelledDates && course.cancelledDates.length ? '取消日期：' + course.cancelledDates.join('、') : ''].filter(Boolean).join('\n'), showCancel: false});
  },
  remove(e) {
    const id = e.currentTarget.dataset.id, record = this.data.records.find(r => r.id === id);
    if (!record) return;
    wx.showModal({title: '删除这份学期档案？', content: record.title + '\n仅删除保存的档案，当前课表与成绩保持不变。可先复制档案备份。', confirmText: '删除档案', confirmColor: '#c94b3d',
      success: r => {if (r.confirm) {try {wx.setStorageSync(A.KEY, A.load(wx).filter(x => x.id !== id)); this.reload(); toast('档案已删除');} catch (e) {error(e);}}}
    });
  },
  clearAll() {
    if (!this.data.records.length) return;
    wx.showModal({title: '删除所有学期档案？', content: '将删除保存的 ' + this.data.records.length + ' 份档案，当前课表与成绩不受影响。建议先复制档案备份。', confirmText: '全部删除', confirmColor: '#c94b3d',
      success: r => {if (r.confirm) {try {wx.setStorageSync(A.KEY, []); this.reload(); toast('学期档案已清空');} catch (e) {error(e);}}}
    });
  },
  backup() {wx.setClipboardData({data: JSON.stringify({format: 'STUNDENPLAN-ARCHIVES-v1', records: this.data.records})});},
  restore() {
    wx.showModal({title: '导入学期档案备份', content: '先复制档案JSON。导入时按档案ID合并，保留当前课表。', success: r => {
      if (!r.confirm) return;
      wx.getClipboardData({success: x => {
        try {
          const p = JSON.parse(x.data);
          if (p.format !== 'STUNDENPLAN-ARCHIVES-v1' || !Array.isArray(p.records)) throw Error('不是学期档案备份');
          const map = new Map(this.data.records.map(r => [r.id, r]));
          for (const original of p.records) {
            if (!original.id || !original.state) throw Error('档案不完整');
            const record = M.clone(original);
            record.state.courses = M.normalizeAll(record.state.courses);
            record.state.view = M.validView(record.state.view) ? record.state.view : M.defaultView();
            record.state.holiday = H.normalize(record.state.holiday);
            record.state.infoMode = record.state.infoMode === 'compact' ? 'compact' : 'full';
            record.id = String(record.id).slice(0, 100);
            record.scheduleId = String(record.scheduleId || record.state.scheduleId || '').slice(0, 100);
            record.title = String(record.title || '学期课表').slice(0, 150);
            record.count = record.state.courses.length;
            record.savedAt = String(record.savedAt || '').slice(0, 50);
            map.set(record.id, record);
          }
          if (map.size > 50) throw Error('最多50份档案');
          wx.setStorageSync(A.KEY, [...map.values()]); this.reload(); toast('档案已导入');
        } catch (e) {error(e);}
      }});
    }});
  }
});
