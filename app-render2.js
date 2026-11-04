/* ============================================================
 * app-render2.js - Scorecards, Team Schedule, OT & Break
 * ============================================================ */

/* ---------------- SCORECARDS ---------------- */
function renderScorecards() {
  var rank = buildRanking();
  topPerformerCard('scTop', rank);

  // week selector (matches the Schedule / OT pattern)
  var scoreWeeks = uniq(rank.filter(function (r) { return r.scoreWeek; }).map(function (r) { return r.scoreWeek; })).sort().reverse();
  // include every week present in the source too, so empty weeks are still pickable
  var allWeeks = uniq((DATA.officialScorecard && DATA.officialScorecard.weekly || []).map(function (r) { return r.week; })).sort().reverse();
  var weeks = uniq(scoreWeeks.concat(allWeeks));
  var wkSel = $('scRankWeek');
  if (wkSel) {
    if (!F.scRankWeek || weeks.indexOf(F.scRankWeek) < 0) F.scRankWeek = weeks[0] || '';
    wkSel.innerHTML = weeks.map(function (w) { return '<option value="' + esc(w) + '">' + esc(fmtWeek(w)) + '</option>'; }).join('');
    wkSel.value = F.scRankWeek;
    wkSel.onchange = function () { F.scRankWeek = this.value; renderScorecards(); };
    // rebuild ranking for the chosen week
    rank = buildRanking();
  }

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
  var list = $('scAgentList');
  if (!list) return;

  // agents that actually have scorecard rows
  var agents = uniq((DATA.scorecards || []).map(function (r) { return r.agent; })).sort();
  if (!agents.length) { list.innerHTML = '<div class="empty">No scorecard detail available.</div>'; return; }

  // weeks available (desc)
  var weeks = uniq((DATA.scorecards || []).map(function (r) { return r.week; })).sort().reverse();

  // list of agent names (clickable) -> opens the scorecard lightbox
  list.innerHTML = agents.map(function (a) {
    var latest = weeks.filter(function (w) {
      return (DATA.scorecards || []).some(function (r) { return r.agent === a && r.week === w; });
    })[0] || '';
    return '<button type="button" class="qa-agent-row" onclick="openScAgent(\'' + esc(a) + '\')">' +
      '<span class="qa-agent-name">' + esc(a) + '</span>' +
      (latest ? '<span class="qa-agent-evals">' + esc(fmtWeek(latest)) + '</span>' : '') +
      '<span class="qa-agent-arrow">&#9654;</span>' +
      '</button>';
  }).join('');
}

/* Open the scorecard lightbox for one agent: fullscreen sheet-style scorecard. */
function openScAgent(agent) {
  var lb = document.getElementById('lb');
  var img = document.getElementById('lbImg');
  var fr = document.getElementById('lbFrame');
  var content = document.getElementById('lbContent');
  if (!lb || !content) return;
  if (img) img.style.display = 'none';
  if (fr) fr.style.display = 'none';
  content.style.display = 'block';

  var weeks = uniq((DATA.scorecards || []).filter(function (r) { return r.agent === agent; })
    .map(function (r) { return r.week; })).sort().reverse();
  var week = weeks[0] || '';
  var rows = (DATA.scorecards || []).filter(function (r) { return r.agent === agent && r.week === week; });

  var bySection = {};
  rows.forEach(function (r) { (bySection[r.section] = bySection[r.section] || []).push(r); });
  var sectionOrder = ['ATTENDANCE', 'QUALITY', 'PRODUCTIVITY', 'FINAL SCORE'];

  function fmtRow(r) {
    var v = r.raw;
    if (v === null || v === undefined || v === '') v = '—';
    return '<tr><td class="sc-metric">' + esc(r.metric || '—') + '</td>' +
           '<td class="sc-value">' + esc(v) + '</td></tr>';
  }

  var html = '<div class="qa-lb-head">' +
    '<span class="qa-lb-title">' + esc(agent) + '</span>' +
    '<span class="qa-lb-meta">' + (week ? esc(fmtWeek(week)) : '') + '</span></div>';
  if (!rows.length) {
    html += '<div class="empty"><b>No scorecard</b>No scorecard detail for ' + esc(agent) + '.</div>';
  } else {
    html += '<div class="sc-detail">';
    sectionOrder.forEach(function (sec) {
      var srows = bySection[sec];
      if (!srows || !srows.length) return;
      html += '<div class="sc-section"><div class="sc-section-head">' + esc(sec) + '</div><table class="sc-detail-table"><tbody>';
      srows.forEach(function (r) { html += fmtRow(r); });
      html += '</tbody></table></div>';
    });
    html += '</div>';
  }
  content.innerHTML = html;
  lb.classList.add('show');
}

/* ---------------- MONTHLY SCORECARD ---------------- */
function renderMonthly() {
  // monthlyScores is month-scoped - ignore the global week/agent filters so the
  // page always shows the full monthly history regardless of the selected week
  var ms = slice(DATA.monthlyScores || [], { ignoreWeek: true, ignoreAgent: true });
  var months = ms.filter(function (r) { return r.type === 'month'; });
  var weeks  = ms.filter(function (r) { return r.type === 'week'; });

  if (!months.length) {
    ['moTop', 'moRankTable', 'moAgentTop', 'moWeekTable'].forEach(function (id) {
      var m = $(id); if (m) m.innerHTML = '';
    });
    var sel = $('moMonth'); if (sel) sel.innerHTML = '<option value="">No monthly data</option>';
    var asel = $('moAgentSel'); if (asel) asel.innerHTML = '';
    return;
  }

  // distinct months sorted by their date (period is "Month YYYY")
  var monthList = uniq(months.map(function (r) { return r.period; })).sort(function (a, b) {
    return monthSortKey(a) - monthSortKey(b);
  });

  // month selector (page-level toggle, replaces the global filter bar)
  var sel = $('moMonth');
  var latest = monthList[monthList.length - 1];
  var cur = (F.moMonth && monthList.indexOf(F.moMonth) >= 0) ? F.moMonth : latest;
  if (sel) {
    sel.innerHTML = monthList.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
    sel.value = cur;
    sel.onchange = function () { F.moMonth = this.value; renderMonthly(); };
  }
  var monthName = cur.split(' ')[0];

  // ---- Official Scorecard Ranking (Monthly) ----
  // each agent scored by the AVERAGE of their weekly overall scores this month
  var wkRows = weeks.filter(function (r) { return (r.period || '').indexOf(monthName) === 0; });
  var byA = groupBy(wkRows, function (r) { return r.agent; });
  var newRank = byA.keys.map(function (a) {
    var rs = byA.map[a].slice().sort(function (x, y) { return (x.period || '').localeCompare(y.period || ''); });
    return {
      agent: a,
      overall: avg(rs.map(function (r) { return r.score; })),
      scoreWeeks: rs.map(function (r) { return r.period; }),
      rating: '', qa: null, prod: null, calls: null, evals: 0
    };
  }).sort(function (x, y) {
    var a = x.overall, b = y.overall;
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  });
  newRank.forEach(function (r, i) { r.rank = i + 1; });
  topPerformerCard('moTop', newRank);

  // ranking table (all agents, monthly)
  var compNames = [];
  makeTable('moRankTable', [
    { key: 'rank', label: 'Rank', num: true,
      fmt: function (r) { return r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] + ' ' + r.rank : '<span class="rank">' + r.rank + '</span>'; } },
    { key: 'agent', label: 'Agent' },
    { key: 'overall', label: 'Monthly Overall', num: true, fmt: function (r) { return r.overall === null ? '—' : scorePill(r.overall, 2); } },
    { key: 'weeks', label: 'Weeks', num: true, fmt: function (r) { return n0((r.scoreWeeks || []).length); } }
  ], newRank, { sort: 'rank', dir: 'asc', empty: 'No monthly scorecard data for ' + cur + '.' });

  // ---- Per-Agent view: pick an agent -> their weekly scores for the month ----
  var moAgents = uniq(months.concat(wkRows).map(function (r) { return r.agent; })).sort();
  var aSel = $('moAgentSel');
  if (aSel) {
    aSel.innerHTML = moAgents.map(function (a) { return '<option value="' + esc(a) + '">' + esc(a) + '</option>'; }).join('');
    if (F.moAgent && moAgents.indexOf(F.moAgent) >= 0) aSel.value = F.moAgent;
    else { F.moAgent = moAgents[0]; aSel.value = F.moAgent; }
    aSel.onchange = function () { F.moAgent = this.value; renderMonthly(); };
  }
  var agent = F.moAgent || moAgents[0];
  var aMonth = months.filter(function (r) { return r.agent === agent && r.period === cur; })[0];
  var aWeeks = wkRows.filter(function (r) { return r.agent === agent; })
    .sort(function (x, y) { return (x.period || '').localeCompare(y.period || ''); });

  // top-performer card for this agent (their monthly overall)
  topPerformerCard('moAgentTop', aMonth ? [{
    agent: agent, overall: aMonth.score, scoreWeek: null, rating: '', qa: null, prod: null, calls: null, evals: 0
  }] : []);

  // weekly overall-score breakdown (table only, no bar chart)
  makeTable('moWeekTable', [
    { key: 'period', label: 'Week', sortVal: function (r) { return r.period; } },
    { key: 'score', label: 'Overall Score', num: true, fmt: function (r) { return scorePill(r.score, 2); } }
  ], aWeeks, { sort: 'period', dir: 'asc', empty: 'No weekly scorecard records for ' + agent + ' in ' + cur + '.' });
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
      // default to the CURRENT week when it's in the data, else the LATEST week
    // (today may be past the last scheduled week, so fall back to the newest one)
    var def = (weeks.indexOf(now) >= 0) ? now : (weeks[weeks.length - 1] || '');
      if (F.otWeek && weeks.indexOf(F.otWeek) >= 0) sel.value = F.otWeek;
      else { F.otWeek = def; sel.value = def; }
      sel.onchange = function () { F.otWeek = this.value; renderOtBreak(); };
    }
  var ot = otBase.filter(function (r) { return r.week === (F.otWeek || weeks[0] || ''); });

  kpi('otKpis', [
    { label: 'OT Entries', value: n0(ot.length), sub: 'in current view' },
    { label: 'Total OT Hours', value: n1(sum(ot.map(function (r) { return r.hours; }))), sub: 'scheduled hours' },
    { label: 'Agents on OT', value: n0(uniq(ot.map(function (r) { return r.agent; })).length), sub: 'unique agents' },
    { label: 'Avg Hours / Entry', value: n1(avg(ot.map(function (r) { return r.hours; }))), sub: 'per OT shift' }
  ]);

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
  // ignore the global week/agent filters — leave requests are browsed by their
  // own month selector, not the call-week filter (which would strip every leave
  // whose .week doesn't match the currently-selected week).
  var lv = slice(DATA.leaveRequests, { ignoreWeek: true, ignoreAgent: true });
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

  // default selected month = current month (Manila) if it has leaves, else the
  // latest month that has (upcoming) leaves. This way the page opens on the
  // month the user is actually in, not a far-future month.
  var monthMap = {};
  lv.forEach(function (r) { var m = (r.dateManila || r.date || '').slice(0, 7); if (m) (monthMap[m] = monthMap[m] || []).push(r); });
  var mKeys = Object.keys(monthMap).sort();
  var curM = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7);
  if (!F.lvMonth || mKeys.indexOf(F.lvMonth) < 0) {
    F.lvMonth = (mKeys.indexOf(curM) >= 0) ? curM : (mKeys[mKeys.length - 1] || '');
  }

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
          '<div class="lc-times">' +
            '<span class="lc-time">Requested: ' + (r.requestedOn ? esc(fmtDate(r.requestedOn)) : '—') + '</span>' +
            '<span class="lc-time">Approved: ' + (r.approvedOn ? esc(fmtDate(r.approvedOn)) : '—') + '</span>' +
          '</div>' +
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

/* ---------------- COE REQUEST PAGE ---------------- */
var COE_ = {
  company: '4am Media, LLC',
  addr: ['2400 Kettner Blvd.', '#238', 'San Diego', 'CA', '92101'],
  phone: '619-977-5996',
  logo: 'data:image/png;base64,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',
  signature: 'data:image/jpeg;base64,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'
};
function coe$id(x) { return document.getElementById(x); }
function coeMoney(v) {
  if (v === '' || v === null || v === undefined) return '[Salary]';
  var n = parseFloat(v);
  if (isNaN(n)) return '[Salary]';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function coeFmtDate(v) {
  if (!v) return '';
  var dt = new Date(v + (typeof v === 'string' && v.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(dt)) return String(v);
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
function coeStartLabel(v) {
  if (!v) return '[Start Date]';
  var dt = new Date(v + 'T00:00:00');
  if (isNaN(dt)) return String(v);
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
function coeMsg(msg, isErr) {
  var el = coe$id('coeMsg');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = isErr ? '#B04141' : 'var(--ink2)';
}
function coeCoeDeps() { return (DATA && DATA.coeDeps) || []; }
function coeFindDep(agent) {
  var l = (agent || '').toLowerCase().replace(/\s+/g, ' ');
  for (var i = 0; i < coeCoeDeps().length; i++) {
    var a = coeCoeDeps()[i].agent;
    if (a && a.toLowerCase().replace(/\s+/g, ' ') === l) return coeCoeDeps()[i];
  }
  return null;
}
/* today's date, formatted for a date input (yyyy-mm-dd) AND for letters */
function coeToday() {
  try {
    var now = new Date();
    return now.getFullYear() + '-' + (now.getMonth() < 9 ? '0' : '') + (now.getMonth() + 1) + '-' + (now.getDate() < 10 ? '0' : '') + now.getDate();
  } catch (e) { return ''; }
}
function coePopulateAgents() {
  var sel = coe$id('f_agent');
  if (!sel) return;
  var deps = coeCoeDeps();
  sel.innerHTML = '<option value="">Select your name&hellip;</option>' +
    deps.map(function (d) { return '<option value="' + esc(d.agent) + '">' + esc(d.agent) + '</option>'; }).join('');
  if (F.coeAgent) { var keep = coeFindDep(F.coeAgent); if (keep) sel.value = keep.agent; }
  coeAutoFillDates();
}
function coeAutoFillDates() {
  var sel = coe$id('f_agent'), start = coe$id('f_start'), issue = coe$id('f_issue');
  if (!sel) return;
  var dep = coeFindDep(sel.value);
  if (start) start.value = (dep && dep.startDate) ? dep.startDate : '';
  if (dep) F.coeAgent = dep.agent; else if (sel.value) F.coeAgent = sel.value;
  if (issue) issue.value = coeToday();
  renderCoe();
}
/* Render the OFFICIAL 4am Media COE template verbatim (logo + layout + wording). */
function renderCoe() {
  var doc = coe$id('coeDoc');
  if (!doc) return;
  var sel = coe$id('f_agent');
  var dep = sel && sel.value ? coeFindDep(sel.value) : null;
  var name = (dep && dep.agent) || '[Employee Name]';
  var start = dep && dep.startDate ? coeStartLabel(dep.startDate) : '[Start Date]';
  var issueEl = coe$id('f_issue');
  var issue = issueEl && issueEl.value ? coeFmtDate(issueEl.value) : '[Issue Date]';
  var rate = coeMoney(coe$id('f_rate') && coe$id('f_rate').value);
  var pos = 'Customer Service Representative';
  var hrs = 40;
  var addr = COE_.addr.join(' ');

  doc.innerHTML =
    '<div class="doc-logo"><img src="' + COE_.logo + '" alt="4am Media" style="max-width:170px;height:auto;display:block;margin:0 auto"></div>' +
    '<div class="doc-addr">' + COE_.company + '<br>' + COE_.addr[0] + ' ' + COE_.addr[1] + '<br>' + COE_.addr[2] + ', ' + COE_.addr[3] + ' ' + COE_.addr[4] + ' &bull; ' + COE_.phone + '</div>' +
    '<div class="doc-date">' + issue + '</div>' +
    '<div class="doc-subject">Re: Verification of Employment for ' + name + '</div>' +
    '<div class="doc-body">To Whom It May Concern,<br><br>' +
      'Please accept this letter as confirmation that ' + name + ' has been employed with ' + COE_.company + ' since ' + start + '. Currently, ' + name + ':</div>' +
    '<ul class="doc-bullets">' +
      '<li>Holds the title of ' + pos + '.</li>' +
      '<li>Earns ' + rate + ' per hour.</li>' +
      '<li>Works on a full-time basis of forty (40) hours per week.</li>' +
    '</ul>' +
    '<div class="doc-closing">If you have any questions or require additional information, please give me a call at the above number.</div>' +
    '<div class="doc-sign">Best regards,<br>' +
      '<img src="' + COE_.signature + '" alt="signature" style="max-width:120px;height:auto;display:block;margin:8px 0 2px">' +
      '<span class="doc-sig-name">Nick Urbani,</span><br>' +
      'Owner - ' + COE_.company + '</div>';
}
/* Log a COE request to the sheet (or store locally if no endpoint wired). */
function submitCoe(payload) {
  var url = (window.DASHBOARD_CONFIG && window.DASHBOARD_CONFIG.coeLogWebAppUrl) || '';
  if (!url) {
    try {
      var drafts = JSON.parse(localStorage.getItem('coeLogs') || '[]');
      drafts.push(payload);
      localStorage.setItem('coeLogs', JSON.stringify(drafts));
    } catch (e) {}
    return Promise.resolve({ ok: true, local: true });
  }
  var envelope = Object.assign({ action: 'logCoe' }, payload);
  var body = 'payload=' + encodeURIComponent(JSON.stringify(envelope));
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body
  }).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; });
}
function wireCoe() {
  var sel = coe$id('f_agent');
  if (sel) {
    coePopulateAgents();
    sel.addEventListener('change', coeAutoFillDates);
  }
  var fields = ['f_rate'];
  fields.forEach(function (id) {
    var el = coe$id(id);
    if (el) el.addEventListener('input', renderCoe);
  });
  var dl = coe$id('coeDlBtn');
  if (dl) dl.addEventListener('click', function () {
    var sel = coe$id('f_agent');
    if (!sel || !sel.value) { coeMsg('Select your name first.', true); sel && sel.focus(); return; }
    var dep = coeFindDep(sel.value);
    var rateEl = coe$id('f_rate');
    if (!rateEl || !parseFloat(rateEl.value)) { coeMsg('Enter your hourly rate.', true); rateEl && rateEl.focus(); return; }
    var passEl = coe$id('f_pass');
    var entered = passEl ? passEl.value.trim() : '';
    var correct = (dep && dep.password) ? String(dep.password).trim() : '';
    if (correct && entered !== correct) {
      coeMsg('Wrong passcode for ' + sel.value + '.', true);
      if (passEl) { passEl.value = ''; passEl.focus(); }
      return;
    }
    if (!entered) { coeMsg('Enter your COE passcode.', true); passEl && passEl.focus(); return; }
    coeMsg('');
    // log the request, then generate a clean one-page PDF (no browser print
    // header/footer/URL - jsPDF renders from the letter element directly).
    var issue = coe$id('f_issue') ? coe$id('f_issue').value : '';
    var payload = {
      agent: dep.agent, rate: parseFloat(rateEl.value) || 0, startDate: dep.startDate || '',
      issueDate: issue, ip: ''
    };
    submitCoe(payload).then(function (res) {
      coeMsg(res && res.ok
        ? (res.local ? 'COE request recorded (local). Generating PDF…' : 'COE request logged in the sheet. Generating PDF…')
        : 'COE request logged locally. Generating PDF…');
      coeMakePdf(dep);
    });
  });
  renderCoe();
}
/* Render the letter element to a clean single-page PDF with jsPDF+html2canvas.
 * No browser print dialog, so there is never a header, footer or website URL. */
function coeMakePdf(dep) {
  var src = coe$id('coeDoc');
  if (!src || typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    // fallback: plain print (browser may show header/footer)
    window.print();
    return;
  }
  var name = (dep && dep.agent) || 'Employee';
  var onImg = function (canvas) {
    try {
      var W = canvas.width, H = canvas.height;
      var pdf = new window.jspdf.jsPDF({ unit: 'px', format: [W, H], orientation: W > H ? 'l' : 'p' });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, W, H);
      var safe = name.replace(/[^A-Za-z0-9 _.-]/g, '').replace(/\s+/g, '_').slice(0, 40) || 'COE';
      pdf.save('COE_' + safe + '.pdf');
      coeMsg('PDF downloaded - one page, no header/footer.');
    } catch (e) { coeMsg('Could not build the PDF: ' + (e.message || e), true); }
  };
  html2canvas(src, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
    .then(onImg)
    .catch(function (e) { coeMsg('PDF capture failed: ' + (e && e.message ? e.message : e), true); });
}
/* app-render2.js loads at end of <body>, so all COE fields already exist.
   Self-wire here instead of depending on the app-init boot sequence. */
try { wireCoe(); } catch (e) { console.error('coe', e); }

