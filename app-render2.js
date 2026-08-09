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

  // component columns come from the sheet itself, so new weightings appear automatically
  var compNames = [];
  rank.forEach(function (r) { if (r.components) Object.keys(r.components).forEach(function (k) { if (compNames.indexOf(k) < 0) compNames.push(k); }); });

  var cols = [
    { key: 'rank', label: 'Rank', num: true,
      fmt: function (r) { return r.rank <= 3 ? ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'][r.rank - 1] + ' ' + r.rank : '<span class="rank">' + r.rank + '</span>'; } },
    { key: 'agent', label: 'Agent' },
    { key: 'overall', label: 'Overall Score', num: true, fmt: function (r) { return scorePill(r.overall, 2); } },
    { key: 'qa', label: 'QA', num: true, fmt: function (r) { return r.qa === null ? '\u2014' : pct(r.qa); } },
    { key: 'prod', label: 'Productivity', num: true, fmt: function (r) { return r.prod === null ? '\u2014' : pct(r.prod); } },
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

  // weekly scorecard metric detail (from the WEEKLY SCORECARD tab)
  var sd = slice(DATA.scorecards);
  makeTable('scDetail', [
    { key: 'week', label: 'Week', fmt: function (r) { return r.week ? fmtWeek(r.week) : esc(r.weekLabel || '\u2014'); }, sortVal: function (r) { return r.week; } },
    { key: 'agent', label: 'Agent' },
    { key: 'section', label: 'Section', fmt: function (r) { return r.section ? '<span class="pill n">' + esc(r.section) + '</span>' : '\u2014'; } },
    { key: 'metric', label: 'Metric' },
    { key: 'raw', label: 'Value', num: true, fmt: function (r) { return esc(r.raw || '\u2014'); }, sortVal: function (r) { return r.value; } }
  ], sd, { sort: 'week', dir: 'desc', per: 30, pagerId: null, empty: 'No scorecard metrics available for the selected filters.' });
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
  var ts = slice(DATA.teamSchedule);
  var working = ts.filter(function (r) { return !r.off; });

  kpi('tsKpis', [
    { label: 'Scheduled Entries', value: n0(ts.length), sub: 'in current view' },
    { label: 'Agents Scheduled', value: n0(uniq(ts.map(function (r) { return r.agent; })).length), sub: 'unique agents' },
    { label: 'Working Days', value: n0(working.length), sub: 'excluding OFF' },
    { label: 'Days Off', value: n0(ts.filter(function (r) { return r.off; }).length), sub: 'rest days' },
    { label: 'Distinct Shifts', value: n0(uniq(working.map(function (r) { return r.shift; })).length), sub: 'shift patterns' },
    { label: 'Weeks Covered', value: n0(uniq(ts.map(function (r) { return r.week; })).length), sub: 'in current view' }
  ]);

  // calendar grid for a single week (the selected one, else the latest)
  var weeks = uniq(ts.map(function (r) { return r.week; })).sort().reverse();
  var target = F.week !== 'ALL' && weeks.indexOf(F.week) >= 0 ? F.week : weeks[0];
  var grid = $('tsGrid');
  if (!target) {
    grid.innerHTML = '<div class="empty"><b>No schedule</b>No schedule records available for the selected filters.</div>';
  } else {
    var wkRows = ts.filter(function (r) { return r.week === target; });
    var dates = uniq(wkRows.map(function (r) { return r.date; })).sort();
    var agents = uniq(wkRows.map(function (r) { return r.agent; })).sort();
    var idx = {};
    wkRows.forEach(function (r) { idx[r.agent + '|' + r.date] = r; });

    var h = '<table><thead><tr><th>Agent</th>';
    dates.forEach(function (d) {
      var dd = ymd(d);
      h += '<th>' + (dd ? dd.toLocaleDateString('en-US', { weekday: 'short' }) + '<br>' +
           dd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : esc(d)) + '</th>';
    });
    h += '</tr></thead><tbody>';
    agents.forEach(function (a) {
      h += '<tr><td><b>' + esc(a) + '</b></td>';
      dates.forEach(function (d) {
        var r = idx[a + '|' + d];
        h += '<td>' + (r ? shiftPill(r.shift, r.off) : '\u2014') + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table>';
    grid.innerHTML = h;
  }

  makeTable('tsTable', [
    { key: 'date', label: 'Date', fmt: function (r) { return fmtDate(r.date); }, sortVal: function (r) { return r.date; } },
    { key: 'day', label: 'Day' },
    { key: 'agent', label: 'Agent' },
    { key: 'shift', label: 'Shift', fmt: function (r) { return shiftPill(r.shift, r.off); } },
    { key: 'week', label: 'Week', fmt: function (r) { return fmtWeek(r.week); }, sortVal: function (r) { return r.week; } },
    { key: 'source', label: 'Source' }
  ], ts, { sort: 'date', dir: 'desc', per: 25, pagerId: 'tsPager', empty: 'No schedule records available for the selected filters.' });
}

/* ---------------- OT & BREAK ---------------- */
function renderOtBreak() {
  var ot = slice(DATA.otSchedule);

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

  makeTable('otTable', [
    { key: 'date', label: 'Date', fmt: function (r) { return fmtDate(r.date); }, sortVal: function (r) { return r.date; } },
    { key: 'day', label: 'Day' },
    { key: 'agent', label: 'Agent' },
    { key: 'otTime', label: 'OT Schedule', fmt: function (r) { return '<span class="pill n">' + esc(r.otTime) + '</span>'; } },
    { key: 'hours', label: 'Hours', num: true, fmt: function (r) { return r.hours === null ? '\u2014' : n1(r.hours); } },
    { key: 'hotline', label: 'Hotline', fmt: function (r) { return esc(r.hotline || '\u2014'); } },
    { key: 'week', label: 'Week', fmt: function (r) { return fmtWeek(r.week); }, sortVal: function (r) { return r.week; } }
  ], ot, { sort: 'date', dir: 'desc', empty: 'No OT records available for the selected filters.' });

  // breaks carry no date column in the source, so only the agent filter applies
  var bk = (DATA.breakSchedule || []).filter(function (r) { return F.agent === 'ALL' || r.agent === F.agent; });
  makeTable('bkTable', [
    { key: 'agent', label: 'Agent' },
    { key: 'day', label: 'Day' },
    { key: 'firstBreak', label: 'First Break', fmt: function (r) { return r.off ? '<span class="pill off">OFF</span>' : esc(r.firstBreak || '\u2014'); } },
    { key: 'lunchBreak', label: 'Lunch Break', fmt: function (r) { return esc(r.lunchBreak || '\u2014'); } },
    { key: 'lastBreak', label: 'Last Break', fmt: function (r) { return esc(r.lastBreak || '\u2014'); } },
    { key: 'team', label: 'Team', fmt: function (r) { return r.team ? '<span class="pill n">' + esc(r.team) + '</span>' : '\u2014'; } },
    { key: 'source', label: 'Source' }
  ], bk, { sort: 'agent', dir: 'asc', empty: 'No break schedule available for this agent.' });
}

/* ---------------- LEAVE REQUESTS ---------------- */
var STATUS_CLASS = { Approved: 'ok', Pending: 'warn', Declined: 'bad' };

