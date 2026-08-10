/* ============================================================
 * app-render2.js - Scorecards, Team Schedule, OT & Break
 * ============================================================ */

/* ---------------- SCORECARDS ---------------- */
function renderScorecards() {
  var rank = buildRanking();
  topPerformerCard('scTop', rank);

  var withScore = rank.filter(function (r) { return r.overall !== null; });
  kpi('scKpis', [
    { label: 'Agents Ranked', value: n0(rank.length), sub: 'in current view' },
    { label: 'Team Average Score', html: withScore.length ? pct(avg(withScore.map(function (r) { return r.overall; })), 2) : '\u2014',
      sub: 'official overall score',
      tone: withScore.length && avg(withScore.map(function (r) { return r.overall; })) >= 0.95 ? 'good' : 'warn' },
    { label: 'Highest Score', html: withScore[0] ? pct(withScore[0].overall, 2) : '\u2014', sub: withScore[0] ? withScore[0].agent : '', tone: 'good' },
    { label: 'Lowest Score', html: withScore.length ? pct(withScore[withScore.length - 1].overall, 2) : '\u2014',
      sub: withScore.length ? withScore[withScore.length - 1].agent : '', tone: 'warn' },
    { label: 'At or Above 95%', value: n0(withScore.filter(function (r) { return r.overall >= 0.95; }).length), sub: 'excellent', tone: 'good' },
    { label: 'Below 85%', value: n0(withScore.filter(function (r) { return r.overall < 0.85; }).length), sub: 'needs attention', tone: 'warn' }
  ]);

  barChart('chScAgent', withScore.map(function (r) { return r.agent; }), withScore.map(function (r) { return r.overall; }),
    { percent: true, horizontal: true, label: 'Overall Score',
      colors: withScore.map(function (r) { return r.overall >= 0.95 ? PINK.rose : (r.overall >= 0.85 ? PINK.dusty : PINK.bad); }) });

  // component columns: only the four weighted metrics (capped to their max)
  var compNames = [];
  rank.forEach(function (r) { if (r.components) Object.keys(r.components).forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(WEIGHT_MAX, k) && compNames.indexOf(k) < 0) compNames.push(k);
  }); });

  var cols = [
    { key: 'rank', label: 'Rank', num: true,
      fmt: function (r) { return r.rank <= 3 ? ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'][r.rank - 1] + ' ' + r.rank : '<span class="rank">' + r.rank + '</span>'; } },
    { key: 'agent', label: 'Agent' },
    { key: 'overall', label: 'Overall Score', num: true, fmt: function (r) { return scorePill(r.overall, 2); } },
    { key: 'prod', label: 'Productivity', num: true, fmt: function (r) { return r.prod === null ? '—' : pct(r.prod); } },
    { key: 'calls', label: 'Calls', num: true, fmt: function (r) { return n0(r.calls); } },
    { key: 'rating', label: 'Team Ranking', fmt: function (r) {
        if (!r.rating) return '\u2014';
        var k = /top/i.test(r.rating) ? 'ok' : (/good/i.test(r.rating) ? 'n' : 'warn');
        return '<span class="pill ' + k + '">' + esc(r.rating) + '</span>'; } },
    { key: 'scoreWeek', label: 'Scorecard Week', fmt: function (r) { return r.scoreWeek ? fmtWeek(r.scoreWeek) : '\u2014'; },
      sortVal: function (r) { return r.scoreWeek; } }
  ];
  compNames.forEach(function (c) {
    cols.push({
      key: 'c_' + c, label: c, num: true,
      fmt: function (r) { var v = r.components && r.components[c]; return (v === undefined || v === null) ? '\u2014' : n1(v * 100) + '%'; },
      sortVal: function (r) { return (r.components && r.components[c]) || null; },
      text: function (r) { return (r.components && r.components[c]) || ''; }
    });
  });
  makeTable('scTable', cols, rank, { sort: 'rank', dir: 'asc', empty: 'No scorecard data available for the selected filters.' });

  // Weekly Scorecard Detail: pick an agent (and week) -> sheet-style table
  renderScDetail(rank);
}

// Build the per-agent Weekly Scorecard Detail (sheet-style, like the source tab)
function renderScDetail(rank) {
  var wrap = $('scDetailWrap');
  var sel = $('scAgentSel');
  if (!wrap || !sel) return;

  // agents that actually have scorecard rows
  var agents = uniq((DATA.scorecards || []).map(function (r) { return r.agent; })).sort();
  if (!agents.length) { wrap.innerHTML = '<div class="empty">No scorecard detail available.</div>'; return; }

  // weeks available (desc), so the selector can choose which week
  var weeks = uniq((DATA.scorecards || []).map(function (r) { return r.week; })).sort().reverse();

  sel.innerHTML = agents.map(function (a) { return '<option value="' + esc(a) + '">' + esc(a) + '</option>'; }).join('');
  if (F.scAgent && agents.indexOf(F.scAgent) >= 0) sel.value = F.scAgent;
  else { F.scAgent = agents[0]; sel.value = F.scAgent; }
  sel.onchange = function () { F.scAgent = this.value; renderScDetail(rank); };

  // week selector (rebuilt each time so it can reflect the chosen agent's weeks)
  var agentWeeks = weeks.filter(function (w) {
    return (DATA.scorecards || []).some(function (r) { return r.agent === F.scAgent && r.week === w; });
  });
  var wkSel = $('scWeekSel');
  if (!wkSel) {
    wkSel = document.createElement('select');
    wkSel.id = 'scWeekSel';
    wkSel.className = 'search';
    sel.insertAdjacentElement('afterend', wkSel);
  }
  wkSel.innerHTML = agentWeeks.map(function (w) { return '<option value="' + esc(w) + '">' + esc(fmtWeek(w)) + '</option>'; }).join('');
  if (F.scWeek && agentWeeks.indexOf(F.scWeek) >= 0) wkSel.value = F.scWeek;
  else { F.scWeek = agentWeeks[0]; wkSel.value = F.scWeek; }
  wkSel.onchange = function () { F.scWeek = this.value; renderScDetail(rank); };

  // gather rows for this agent+week, grouped by section, sheet order
  var rows = (DATA.scorecards || []).filter(function (r) { return r.agent === F.scAgent && r.week === F.scWeek; });
  if (!rows.length) { wrap.innerHTML = '<div class="empty">No scorecard detail for ' + esc(F.scAgent) + ' in ' + esc(fmtWeek(F.scWeek)) + '.</div>'; return; }

  var bySection = {};
  rows.forEach(function (r) {
    (bySection[r.section] = bySection[r.section] || []).push(r);
  });
  var sectionOrder = ['ATTENDANCE', 'QUALITY', 'PRODUCTIVITY', 'FINAL SCORE'];

  // pretty label for each metric; map raw values cleanly
  function fmtRow(r) {
    var v = r.raw;
    if (v === null || v === undefined || v === '') v = '—';
    // percentages show as % ; numbers show as-is
    var show = v;
    return '<tr><td class="sc-metric">' + esc(r.metric || '—') + '</td>' +
           '<td class="sc-value">' + esc(show) + '</td></tr>';
  }

  var html = '';
  sectionOrder.forEach(function (sec) {
    var srows = bySection[sec];
    if (!srows || !srows.length) return;
    html += '<div class="sc-section"><div class="sc-section-head">' + esc(sec) + '</div><table class="sc-detail-table"><tbody>';
    srows.forEach(function (r) { html += fmtRow(r); });
    html += '</tbody></table></div>';
  });
  wrap.innerHTML = html;
}

/* ---------------- MONTHLY SCORECARD ---------------- */
function renderMonthly() {
  var ms = slice(DATA.monthlyScores || []);
  var months = ms.filter(function (r) { return r.type === 'month'; });
  var weeks  = ms.filter(function (r) { return r.type === 'week'; });

  // distinct months sorted by their date (period is "Month YYYY")
  var monthList = uniq(months.map(function (r) { return r.period; })).sort(function (a, b) {
    return monthSortKey(a) - monthSortKey(b);
  });

  // KPIs
  var periods = {};
  months.forEach(function (r) { (periods[r.agent] = periods[r.agent] || []).push(r); });
  var latest = monthList[monthList.length - 1];
  var latestRows = months.filter(function (r) { return r.period === latest; });
  var latestSorted = latestRows.slice().sort(function (a, b) { return b.score - a.score; });
  var avgLatest = latestSorted.length ? avg(latestSorted.map(function (r) { return r.score; })) : null;
  kpi('moKpis', [
    { label: 'Months Covered', value: n0(monthList.length), sub: monthList.length ? monthList[0] + ' – ' + latest : '' },
    { label: 'Agents', value: n0(uniq(months.map(function (r) { return r.agent; })).length), sub: 'with monthly scores' },
    { label: 'Latest Month Avg', html: avgLatest !== null ? pct(avgLatest, 2) : '—',
      sub: latest || '', tone: avgLatest !== null && avgLatest >= 0.95 ? 'good' : 'warn' },
    { label: 'Latest Month Top', html: latestSorted[0] ? scorePill(latestSorted[0].score, 2) : '—',
      sub: latestSorted[0] ? latestSorted[0].agent : '', tone: 'good' },
    { label: 'Months >= 95%', value: n0(monthList.filter(function (m) {
        var rs = months.filter(function (r) { return r.period === m; });
        return rs.length && avg(rs.map(function (r) { return r.score; })) >= 0.95;
      }).length), sub: 'team avg excellent' },
    { label: 'Months < 85%', value: n0(monthList.filter(function (m) {
        var rs = months.filter(function (r) { return r.period === m; });
        return rs.length && avg(rs.map(function (r) { return r.score; })) < 0.85;
      }).length), sub: 'needs attention', tone: 'warn' }
  ]);

  // Latest month bar chart
  barChart('chMoLatest', latestSorted.map(function (r) { return r.agent; }),
    latestSorted.map(function (r) { return r.score; }),
    { percent: true, horizontal: true, label: 'Overall Score',
      colors: latestSorted.map(function (r) { return r.score >= 0.95 ? PINK.rose : (r.score >= 0.85 ? PINK.dusty : PINK.bad); }) });

  // Monthly trend: average team score per month (line)
  if (monthList.length) {
    lineChart('chMoTrend', monthList,
      [{ label: 'Team Avg Score', data: monthList.map(function (m) {
          var rs = months.filter(function (r) { return r.period === m; });
          return rs.length ? avg(rs.map(function (r) { return r.score; })) : null;
        }) }], {});
  } else { chartEmpty('chMoTrend'); }

  // Month selector + records table
  var sel = $('moMonth');
  if (sel) {
    var cur = F.moMonth && monthList.indexOf(F.moMonth) >= 0 ? F.moMonth : latest;
    sel.innerHTML = monthList.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
    sel.value = cur;
    sel.onchange = function () { F.moMonth = this.value; renderMonthly(); };
    var rows = months.filter(function (r) { return r.period === cur; })
      .sort(function (a, b) { return b.score - a.score; });
    makeTable('moTable', [
      { key: 'agent', label: 'Agent' },
      { key: 'period', label: 'Month', fmt: function (r) { return esc(r.period); } },
      { key: 'score', label: 'Overall Score', num: true, fmt: function (r) { return scorePill(r.score, 2); } }
    ], rows, { sort: 'score', dir: 'desc', empty: 'No monthly scorecard records available.' });
  }
}

/* ---------------- TEAM SCHEDULE ---------------- */
var SHIFT_CLASS = {};
function shiftPill(s, off) {
  if (!s) return '\u2014';
  if (off || /^off$/i.test(s)) return '<span class="pill off">OFF</span>';
  if (/lwop|leave|vl|sl/i.test(s)) return '<span class="pill warn">' + esc(s) + '</span>';
  return '<span class="pill n">' + esc(s) + '</span>';
}

function renderSchedule() {
  var tsAll = (DATA.teamSchedule || []).slice();
  var hlMap = agentHotlineMap();
  var now = thisWeekStart();

  // archive past weeks: only keep upcoming schedule weeks
  var upcoming = tsAll.filter(function (r) { return (r.week || '') >= now; });
  var base = upcoming.length ? upcoming : tsAll;

  // one week at a time: week selector (default = earliest upcoming week)
  var weeks = uniq(base.map(function (r) { return r.week; })).sort();
  if (!weeks.length) weeks = uniq(tsAll.map(function (r) { return r.week; })).sort();
  var sel = $('tsWeek');
  if (sel) {
    sel.innerHTML = weeks.map(function (w) { return '<option value="' + esc(w) + '">' + esc(fmtWeek(w)) + '</option>'; }).join('');
    if (F.tsWeek && weeks.indexOf(F.tsWeek) >= 0) sel.value = F.tsWeek;
    else { F.tsWeek = weeks[0] || ''; sel.value = F.tsWeek; }
    sel.onchange = function () { F.tsWeek = this.value; renderSchedule(); };
  }

  var wk = F.tsWeek || weeks[0] || '';
  var wkRows = base.filter(function (r) { return r.week === wk; });

  var ohaRows = wkRows.filter(function (r) { return (hlMap[r.agent] || 'ALL BRANDS') === 'OHA'; });
  var abRows  = wkRows.filter(function (r) { return (hlMap[r.agent] || 'ALL BRANDS') === 'ALL BRANDS'; });
  var shown = ohaRows.concat(abRows);

  // KPIs: agents on leave this week + half-day schedules this week
  var lv = (DATA.leaveRequests || []).filter(function (r) {
    return (r.week || '') === wk;
  });
  var onLeave = uniq(lv.map(function (r) { return r.agent; })).length;
  var halfDay = shown.filter(function (r) { return isHalfDayShift(r.shift); }).length;

  kpi('tsKpis', [
    { label: 'Agents on Leave', value: n0(onLeave), sub: 'this week', tone: onLeave ? 'warn' : '' },
    { label: 'Half-Day Schedules', value: n0(halfDay), sub: 'part-day shifts', tone: '' },
    { label: 'Scheduled (shown)', value: n0(shown.length), sub: 'rows in view' },
    { label: 'Week', value: fmtWeek(wk), sub: 'upcoming only' }
  ]);

  renderScheduleTable('tsGridOHA', 'OHA', ohaRows, hlMap);
  renderScheduleTable('tsGridAB', 'ALL BRANDS', abRows, hlMap);
}

// one hotline's schedule for a single week, columns = dates, hotline shown only in header
function renderScheduleTable(mountId, hotline, rows, hlMap) {
  var grid = $(mountId);
  if (!grid) return;
  if (!rows.length) {
    grid.innerHTML = '<div class="empty"><b>No ' + esc(hotline) + ' schedule</b>No schedule rows for this week.</div>';
    return;
  }
  var dates = uniq(rows.map(function (r) { return r.date; })).sort();
  var agents = uniq(rows.map(function (r) { return r.agent; })).sort();
  var idx = {};
  rows.forEach(function (r) { idx[r.agent + '|' + r.date] = r; });

  var h = '<table class="sched-table"><thead><tr><th>Agent</th>';
  dates.forEach(function (d) {
    var dd = ymd(d);
    h += '<th>' + (dd ? dd.toLocaleDateString('en-US', { weekday: 'short' }) + '<br>' +
         dd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : esc(d)) + '</th>';
  });
  h += '</tr></thead><tbody>';
  agents.forEach(function (a) {
    h += '<tr><td class="agent-cell"><b>' + esc(a) + '</b></td>';
    dates.forEach(function (d) {
      var r = idx[a + '|' + d];
      h += '<td>' + (r ? shiftPill(r.shift, r.off) : '—') + '</td>';
    });
    h += '</tr>';
  });
  h += '</tbody></table>';
  grid.innerHTML = h;
}

/* ---------------- OT & BREAK ---------------- */
function renderOtBreak() {
  var otAll = (DATA.otSchedule || []).slice();
  var now = thisWeekStart();
  var upcoming = otAll.filter(function (r) { return (r.week || '') >= now; });
  var otBase = upcoming.length ? upcoming : otAll;

  // one week at a time: week selector (default = earliest upcoming week)
  var weeks = uniq(otBase.map(function (r) { return r.week; })).sort();
  if (!weeks.length) weeks = uniq(otAll.map(function (r) { return r.week; })).sort();
  var sel = $('otWeek');
  if (sel) {
    sel.innerHTML = weeks.map(function (w) { return '<option value="' + esc(w) + '">' + esc(fmtWeek(w)) + '</option>'; }).join('');
    if (F.otWeek && weeks.indexOf(F.otWeek) >= 0) sel.value = F.otWeek;
    else { F.otWeek = weeks[0] || ''; sel.value = F.otWeek; }
    sel.onchange = function () { F.otWeek = this.value; renderOtBreak(); };
  }
  var ot = otBase.filter(function (r) { return r.week === (F.otWeek || weeks[0] || ''); });

  kpi('otKpis', [
    { label: 'OT Entries', value: n0(ot.length), sub: 'in current view' },
    { label: 'Total OT Hours', value: n1(sum(ot.map(function (r) { return r.hours; }))), sub: 'scheduled hours' },
    { label: 'Agents on OT', value: n0(uniq(ot.map(function (r) { return r.agent; })).length), sub: 'unique agents' },
    { label: 'Avg Hours / Entry', value: n1(avg(ot.map(function (r) { return r.hours; }))), sub: 'per OT shift' }
  ]);

  var byAg = groupBy(ot, function (r) { return r.agent; });
  var ag = byAg.keys.slice().sort(function (a, b) {
    return sum(byAg.map[b].map(function (r) { return r.hours; })) - sum(byAg.map[a].map(function (r) { return r.hours; }));
  });
  barChart('chOt', ag, ag.map(function (a) { return sum(byAg.map[a].map(function (r) { return r.hours; })); }),
    { horizontal: true, label: 'OT Hours', unit: 'hrs' });

  // OT schedule grid: one row per agent, columns = Hotline | Mon..Sun (otTime) | Hours
  var weeks = uniq(ot.map(function (r) { return r.week; })).sort().reverse();
  var target = weeks[0];
  var grid = $('otGrid');
  if (!target) {
    grid.innerHTML = '<div class="empty"><b>No OT schedule</b>No upcoming OT records for the selected week.</div>';
  } else {
    var wkRows = ot.filter(function (r) { return r.week === target; });
    var dayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var agents = uniq(wkRows.map(function (r) { return r.agent; })).sort();
    var idx = {};
    var hotlineOf = {};
    wkRows.forEach(function (r) { idx[r.agent + '|' + r.day] = r; if (r.hotline) hotlineOf[r.agent] = r.hotline; });
    var h = '<table><thead><tr><th>Agent</th><th>Hotline Assignment</th>';
    dayKeys.forEach(function (d) { h += '<th>' + d + '</th>'; });
    h += '<th>Hours</th></tr></thead><tbody>';
    agents.forEach(function (a) {
      var wkHours = sum(wkRows.filter(function (r) { return r.agent === a; }).map(function (r) { return r.hours || 0; }));
      h += '<tr><td><b>' + esc(a) + '</b></td>' +
           '<td>' + (hotlineOf[a] ? '<span class="pill n">' + esc(hotlineOf[a]) + '</span>' : '—') + '</td>';
      dayKeys.forEach(function (d) {
        var r = idx[a + '|' + d];
        h += '<td>' + (r ? esc(r.otTime) : '—') + '</td>';
      });
      h += '<td><b>' + n1(wkHours) + '</b></td></tr>';
    });
    h += '</tbody></table>';
    grid.innerHTML = h;
  }

  // breaks carry no date column in the source, so only the agent filter applies
  var bk = (DATA.breakSchedule || []).filter(function (r) { return F.agent === 'ALL' || r.agent === F.agent; });
  makeTable('bkTable', [
    { key: 'agent', label: 'Agent' },
    { key: 'day', label: 'Day' },
    { key: 'firstBreak', label: 'First Break', fmt: function (r) { return r.off ? '<span class="pill off">OFF</span>' : esc(r.firstBreak || '—'); } },
    { key: 'lunchBreak', label: 'Lunch Break', fmt: function (r) { return esc(r.lunchBreak || '—'); } },
    { key: 'lastBreak', label: 'Last Break', fmt: function (r) { return esc(r.lastBreak || '—'); } },
    { key: 'team', label: 'Team', fmt: function (r) { return r.team ? '<span class="pill n">' + esc(r.team) + '</span>' : '—'; } }
  ], bk, { sort: 'agent', dir: 'asc', empty: 'No break schedule available for this agent.' });
}

/* ---------------- LEAVE REQUESTS ---------------- */
var STATUS_CLASS = { Approved: 'ok', Pending: 'warn', Declined: 'bad' };

function renderLeaves() {
  var lv = slice(DATA.leaveRequests);
  // hide leaves whose date has already passed (Manila time) to avoid clutter
  var todayMNL = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  lv = lv.filter(function (r) {
    var d = r.dateManila || r.date || '';
    return !d || d >= todayMNL;
  });
  // chronological order: by leave date (Manila), oldest first; undated sink to end
  lv.sort(function (a, b) {
    var da = a.dateManila || a.date || '', db = b.dateManila || b.date || '';
    if (da && db) return da < db ? -1 : (da > db ? 1 : 0);
    if (da) return -1;
    if (db) return 1;
    return 0;
  });

  // default selected month = latest month that has (upcoming) leaves
  var monthMap = {};
  lv.forEach(function (r) { var m = (r.dateManila || r.date || '').slice(0, 7); if (m) (monthMap[m] = monthMap[m] || []).push(r); });
  var mKeys = Object.keys(monthMap).sort();
  if (!F.lvMonth || mKeys.indexOf(F.lvMonth) < 0) F.lvMonth = mKeys[mKeys.length - 1] || '';

  // month selector (brings back the ability to pick a month)
  var mSel = $('lvMonth');
  if (mSel) {
    mSel.innerHTML = mKeys.map(function (m) {
      var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1;
      var name = new Date(y, mo, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return '<option value="' + esc(m) + '">' + esc(name) + '</option>';
    }).join('');
    mSel.value = F.lvMonth;
    mSel.onchange = function () { F.lvMonth = this.value; renderLeaves(); };
  }

  // filter to selected month (this is what the chips + calendar + list reflect)
  var lvMonth = lv.filter(function (r) { return (r.dateManila || r.date || '').slice(0, 7) === F.lvMonth; });

  // chips count only the leaves shown for the selected month
  kpi('lvKpis', [
    { label: 'Total Requests', value: n0(lvMonth.length), sub: 'this month', tone: '' },
    { label: 'Approved', value: n0(lvMonth.filter(function (r) { return r.statusNorm === 'Approved'; }).length), sub: 'approved', tone: 'good' },
    { label: 'Pending', value: n0(lvMonth.filter(function (r) { return r.statusNorm === 'Pending'; }).length), sub: 'awaiting', tone: 'warn' },
    { label: 'Declined', value: n0(lvMonth.filter(function (r) { return r.statusNorm === 'Declined'; }).length), sub: 'declined', tone: 'bad' }
  ]);

  // leave list is rendered as vertical cards below (see lvList)

  // month calendar grid (at-a-glance leaves per date)
  renderLeaveCalendar(lvMonth);

  // PIN gate: lvAgent is a locked text field, filled by verifyPin() in app-init.
  // (no dropdown population needed)

  // leave list as cute vertical cards (one per request, stacked)
  var list = $('lvList');
  if (list) {
    if (!lvMonth.length) {
      list.innerHTML = '<div class="empty"><b>No leave requests</b>No leave requests for ' + esc(F.lvMonth) + '.</div>';
    } else {
      list.innerHTML = lvMonth.map(function (r) {
        var k = STATUS_CLASS[r.statusNorm] || 'n';
        var when = r.dateManila ? fmtDate(r.dateManila) : (r.date ? fmtDate(r.date) : '—');
        return '<div class="leave-card">' +
          '<div class="lc-top"><span class="lc-agent">' + esc(r.agent) + '</span>' +
            '<span class="pill ' + k + '">' + esc(r.statusNorm || r.status || '—') + '</span></div>' +
          '<div class="lc-meta">' + esc(r.leaveType || '—') + ' &middot; ' + esc(r.reason || '—') + '</div>' +
          '<div class="lc-date">📅 ' + when + '</div>' +
          (r.details ? '<div class="lc-details">' + esc(r.details) + '</div>' : '') +
        '</div>';
      }).join('');
    }
  }
}

/* Leave calendar: a month grid showing which agents are on leave per day.
 * Only shows the months that actually have leaves (no empty months). */
function renderLeaveCalendar(lv) {
  var wrap = $('lvCalWrap');
  if (!wrap) return;
  if (!lv.length) { wrap.innerHTML = ''; return; }

  var months = {};
  lv.forEach(function (r) {
    var d = r.dateManila || r.date || '';
    if (!d) return;
    var m = d.slice(0, 7);
    (months[m] = months[m] || []).push(r);
  });
  var monthKeys = Object.keys(months).sort();
  if (!monthKeys.length) { wrap.innerHTML = ''; return; }

  var todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  var html = '';
  monthKeys.forEach(function (m) {
    var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1;
    var first = new Date(y, mo, 1);
    var startDow = (first.getDay() + 6) % 7; // Mon=0
    var daysInMonth = new Date(y, mo + 1, 0).getDate();
    var byDay = {};
    months[m].forEach(function (r) {
      var day = (+ (r.dateManila || r.date).slice(8, 10));
      (byDay[day] = byDay[day] || []).push(r);
    });
    var monthName = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    html += '<div class="cal-month"><div class="cal-title">' + esc(monthName) + '</div>';
    html += '<div class="cal-grid"><div class="cal-dow">Mon</div><div class="cal-dow">Tue</div><div class="cal-dow">Wed</div><div class="cal-dow">Thu</div><div class="cal-dow">Fri</div><div class="cal-dow">Sat</div><div class="cal-dow">Sun</div>';
    for (var i = 0; i < startDow; i++) html += '<div class="cal-cell cal-empty"></div>';
    for (var day = 1; day <= daysInMonth; day++) {
      var rows = byDay[day] || [];
      var isToday = todayStr === (y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0'));
      html += '<div class="cal-cell' + (rows.length ? ' cal-has' : '') + (isToday ? ' cal-today' : '') + '">';
      html += '<div class="cal-daynum">' + day + '</div>';
      if (rows.length) {
        html += '<div class="cal-leaves">';
        rows.forEach(function (r) {
          var k = STATUS_CLASS[r.statusNorm] || 'n';
          html += '<span class="cal-pill ' + k + '" title="' + esc(r.agent) + ' - ' + esc(r.leaveType || '') + '">' + esc(r.agent.split(' ')[0]) + '</span>';
        });
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div></div>';
  });
  wrap.innerHTML = html;
}

/** Submit a leave request: POST to the configured web-app endpoint, else keep
 *  a local draft. The dashboard is a static snapshot, so a live write to the
 *  Google Sheet needs a tiny Apps Script web app (see LeaveSubmit.gs). The body
 *  is form-encoded (payload=<json>) to avoid a CORS preflight on the web app. */
function submitLeave(payload) {
  var url = (window.DASHBOARD_CONFIG && window.DASHBOARD_CONFIG.leaveWebAppUrl) || '';
  if (!url) {
    // no endpoint configured - store locally so it still shows on the dashboard
    try {
      var drafts = JSON.parse(localStorage.getItem('leaveDrafts') || '[]');
      drafts.push(payload);
      localStorage.setItem('leaveDrafts', JSON.stringify(drafts));
    } catch (e) {}
    return Promise.resolve({ ok: true, local: true });
  }
  // Embed action inside the payload: the Apps Script's parseBody returns only
  // the inner payload JSON, so the action must live there (not just top-level).
  var envelope = Object.assign({ action: 'submitLeave' }, payload);
  var body = 'payload=' + encodeURIComponent(JSON.stringify(envelope));
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body
  }).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; });
}

