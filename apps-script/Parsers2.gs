/**
 * FILE 3 of 3  ->  Parsers2.gs
 * Scorecards, monthly official scores, and everything from the Schedule sheet.
 */

/* ============ WEEKLY SCORECARD ============
 * Block layout: metrics down column A, agents across the header row.
 * Emits { week, agent, metric, value }.
 */
function parseScorecards(ss) {
  var g = grid(ss, 'WEEKLY SCORECARD');
  var out = [], agentCols = [], curWeek = '', curLabel = '', section = '';

  for (var r = 0; r < g.length; r++) {
    var a = S(g[r][0]);
    var joined = g[r].map(S).join(' ');

    // a row whose cells are mostly agent names = new block header
    var names = [];
    for (var c = 1; c < g[r].length; c++) {
      var v = S(g[r][c]);
      if (v && /^[A-Za-z][A-Za-z .'\u00f1-]+$/.test(v) && v.split(' ').length <= 4 && !/week|ending/i.test(v)) {
        names.push({ c: c, agent: canonAgent(v) });
      }
    }
    if (!a && names.length >= 3) { agentCols = names; continue; }

    var wk = joined.match(/week\s*:?\s*([A-Za-z]+\s*\d{1,2}\s*,?\s*\d{4})/i);
    if (wk) { curLabel = S(wk[0]).slice(0, 60); curWeek = weekStart(toISO(wk[1])); }

    if (!a || !agentCols.length) continue;

    // section header rows (ATTENDANCE, QUALITY, ...) have no numbers next to them
    var hasVal = agentCols.some(function (x) { return S(g[r][x.c]) !== ''; });
    if (!hasVal) { if (/^[A-Z &/]+$/.test(a)) section = a; continue; }
    if (/^week ending$/i.test(a)) continue;

    agentCols.forEach(function (x) {
      var v = num(g[r][x.c]);
      var raw = S(g[r][x.c]);
      if (v === null && !raw) return;
      out.push({
        week: curWeek, weekLabel: curLabel, section: section,
        agent: x.agent, metric: a, value: v, raw: raw
      });
    });
  }
  return out;
}

/* ============ MONTHLY SCORECARD ============
 * Agents down column A; header has 'Week: ...' and '<Month> <Year> Overall Score'.
 * This is the OFFICIAL score - the dashboard ranks on it rather than inventing one.
 */
function parseMonthly(ss) {
  var g = grid(ss, 'MONTHLY SCORECARD');
  if (!g.length) return [];

  var hRow = -1;
  for (var r = 0; r < Math.min(g.length, 6); r++) {
    if (g[r].map(S).join(' ').match(/week\s*:/i)) { hRow = r; break; }
  }
  if (hRow < 0) return [];

  var cols = [];
  for (var c = 1; c < g[hRow].length; c++) {
    var h = S(g[hRow][c]);
    if (!h) continue;
    var isOverall = /overall\s*sc/i.test(h);
    var label = h.replace(/^week\s*:?\s*/i, '').replace(/\s+/g, ' ').trim();
    var m = h.match(/([A-Za-z]+)\s+(\d{4})\s*overall/i);
    cols.push({
      c: c, label: label, type: isOverall ? 'month' : 'week',
      period: isOverall && m ? (m[1] + ' ' + m[2]) : label
    });
  }

  var out = [];
  for (var i = hRow + 1; i < g.length; i++) {
    var nm = S(g[i][0]);
    if (!nm || notAgentRow(nm)) continue;
    cols.forEach(function (k) {
      var v = num(g[i][k.c]);
      if (v === null) return;
      out.push({ agent: canonAgent(nm), period: k.period, label: k.label, type: k.type, score: v });
    });
  }
  return out;
}

/* ============ TEAM SCHEDULE ============
 * Grid: agents down column A, dates across the header, shift strings in cells.
 * Repeating week blocks down the tab. Emits one row per agent per date.
 */
function parseTeamSchedule(ss) {
  var out = [];
  ['Team Schedule', 'NEW TEAM SCHEDULE '].forEach(function (tab) {
    var g = grid(ss, tab);
    for (var r = 0; r < g.length; r++) {
      var dateCols = [];
      for (var c = 1; c < g[r].length; c++) if (isDate(g[r][c])) dateCols.push({ c: c, d: iso(g[r][c]) });
      if (dateCols.length < 3) continue;

      var start = r + 1;
      var days = {};
      if (start < g.length && /^(mon|monday)$/i.test(S(g[start][dateCols[0].c]))) {
        dateCols.forEach(function (x) { days[x.c] = S(g[start][x.c]); });
        start++;
      }

      for (var i = start; i < g.length; i++) {
        var nm = S(g[i][0]);
        if (!nm) break;
        if (notAgentRow(nm)) break;
        if (isDate(g[i][1]) || isDate(g[i][2])) break;   // next block's header
        dateCols.forEach(function (x) {
          var shift = S(g[i][x.c]);
          if (!shift) return;
          out.push({
            agent: canonAgent(nm), date: x.d, week: weekStart(x.d),
            day: days[x.c] || '', shift: shift,
            off: /^off$/i.test(shift), source: tab.trim()
          });
        });
        r = i;
      }
    }
  });
  return dedupe(out, function (x) { return x.agent + '|' + x.date; });
}

/* ============ OT SCHEDULE ============ */
function parseOT(ss) {
  var g = grid(ss, 'OT SCHEDULE');
  var out = [];
  for (var r = 0; r < g.length; r++) {
    var dateCols = [];
    for (var c = 1; c < g[r].length; c++) if (isDate(g[r][c])) dateCols.push({ c: c, d: iso(g[r][c]) });
    if (dateCols.length < 3) continue;

    // hotline column sits left of the first date column
    var hotCol = -1;
    for (var c2 = 1; c2 < dateCols[0].c; c2++) if (S(g[r][c2])) hotCol = c2;

    var start = r + 1, days = {};
    if (start < g.length && /^(mon|monday)$/i.test(S(g[start][dateCols[0].c]))) {
      dateCols.forEach(function (x) { days[x.c] = S(g[start][x.c]); });
      start++;
    }

    for (var i = start; i < g.length; i++) {
      var nm = S(g[i][0]);
      if (!nm) continue;
      if (notAgentRow(nm)) break;
      var hotline = hotCol > 0 ? S(g[i][hotCol]) : '';
      dateCols.forEach(function (x) {
        var t = S(g[i][x.c]);
        if (!t) return;
        out.push({
          agent: canonAgent(nm), date: x.d, week: weekStart(x.d),
          day: days[x.c] || '', otTime: t, hotline: hotline, hours: otHours(t)
        });
      });
    }
    r = g.length;   // single block tab
  }
  return out;
}

/** '10AM - 12PM' -> 2 ; returns null when unparseable. */
function otHours(t) {
  var m = S(t).match(/(\d{1,2})(?::(\d{2}))?\s*([AP]M)?\s*[-\u2013to]+\s*(\d{1,2})(?::(\d{2}))?\s*([AP]M)?/i);
  if (!m) return null;
  function h24(h, mi, ap) {
    h = +h; mi = mi ? +mi : 0;
    if (ap) { ap = ap.toUpperCase(); if (ap === 'PM' && h !== 12) h += 12; if (ap === 'AM' && h === 12) h = 0; }
    return h + mi / 60;
  }
  var a = h24(m[1], m[2], m[3] || m[6]), b = h24(m[4], m[5], m[6] || m[3]);
  var diff = b - a;
  if (diff < 0) diff += 24;
  return Math.round(diff * 100) / 100 || null;
}

/* ============ BREAK SCHEDULE ============
 * Two shapes:
 *  A) side-by-side agent panels: agent name row, then DAY|FIRST BREAK|LUNCH|LAST
 *  B) tidy table: Agent Name | Team Assignment | First | Lunch | Second
 */
function parseBreaks(ss) {
  var out = [];

  // shape B - tidy
  var tb = grid(ss, 'BREAK SCHEDULE AND ADMIN TASK A');
  for (var r = 0; r < tb.length; r++) {
    if (!/agent name/i.test(S(tb[r][0]))) continue;
    var hdr = tb[r], col = {};
    for (var c = 1; c < hdr.length; c++) {
      var h = S(hdr[c]);
      if (/team|assign/i.test(h)) col.team = c;
      else if (/first/i.test(h))  col.first = c;
      else if (/lunch/i.test(h))  col.lunch = c;
      else if (/second|last/i.test(h)) col.last = c;
    }
    for (var i = r + 1; i < tb.length; i++) {
      var nm = S(tb[i][0]);
      if (!nm) continue;
      out.push({
        agent: canonAgent(nm), day: 'ALL', team: S(tb[i][col.team]),
        firstBreak: S(tb[i][col.first]), lunchBreak: S(tb[i][col.lunch]),
        lastBreak: S(tb[i][col.last]), source: 'BREAK SCHEDULE AND ADMIN TASK A'
      });
    }
    break;
  }

  // shape A - side-by-side panels
  ['Break Schedule', 'SEPTEMBER BREAK SCHED', 'NEW TEAM BREAK SCHEDULE'].forEach(function (tab) {
    var g = grid(ss, tab);
    for (var r = 0; r < g.length; r++) {
      if (!/^day$/i.test(S(g[r][0]))) continue;

      // each panel = a DAY column plus the 3 break columns to its right
      var panels = [];
      for (var c = 0; c < g[r].length; c++) {
        if (!/^day$/i.test(S(g[r][c]))) continue;
        var agent = '';
        for (var up = r - 1; up >= 0 && up >= r - 3; up--) {
          var cand = S(g[up][c]) || S(g[up][c + 1]);
          if (cand && !/break|sched|shift|team|\d{4}/i.test(cand)) { agent = cand; break; }
        }
        panels.push({ dayC: c, agent: canonAgent(agent) });
      }

      for (var i = r + 1; i < g.length; i++) {
        var stop = true;
        panels.forEach(function (p) {
          var day = S(g[i][p.dayC]);
          if (!day || !/^(mon|tue|wed|thu|fri|sat|sun)/i.test(day)) return;
          stop = false;
          if (!p.agent) return;
          var f = S(g[i][p.dayC + 1]);
          out.push({
            agent: p.agent, day: day, team: '',
            firstBreak: /^off$/i.test(f) ? 'OFF' : f,
            lunchBreak: S(g[i][p.dayC + 2]), lastBreak: S(g[i][p.dayC + 3]),
            off: /^off$/i.test(f), source: tab
          });
        });
        if (stop) { r = i; break; }
      }
    }
  });
  return out;
}

/* ============ LEAVE REQUESTS ============ (already tidy) */
function parseLeave(ss) {
  var g = grid(ss, 'Leave Request Sheet');
  if (!g.length) return [];

  var hRow = -1;
  for (var r = 0; r < Math.min(g.length, 10); r++) {
    if (/agent name/i.test(g[r].map(S).join('|'))) { hRow = r; break; }
  }
  if (hRow < 0) return [];

  var hdr = g[hRow], col = {};
  for (var c = 0; c < hdr.length; c++) {
    var h = S(hdr[c]);
    if (/agent name/i.test(h))            col.agent = c;
    else if (/advise for/i.test(h))       col.type = c;
    else if (/^reason/i.test(h))          col.reason = c;
    else if (/^details/i.test(h))         col.details = c;
    else if (/date of leave.*pst/i.test(h))  col.datePST = c;
    else if (/date of leave/i.test(h))       col.dateMNL = c;
    else if (/approved/i.test(h))         col.status = c;
    else if (/date of approval/i.test(h)) col.approvedOn = c;
    else if (/tl notes/i.test(h))         col.notes = c;
    else if (/^w$/i.test(h) || /month/i.test(h)) col.month = c;
  }

  var out = [];
  for (var i = hRow + 1; i < g.length; i++) {
    var agent = canonAgent(g[i][col.agent]);
    var dMNL = toISO(g[i][col.dateMNL]);
    var dPST = toISO(g[i][col.datePST]);
    if (!agent && !dMNL) continue;
    var st = S(g[i][col.status]);
    out.push({
      agent: agent, month: S(g[i][col.month]),
      leaveType: S(g[i][col.type]), reason: S(g[i][col.reason]),
      details: S(g[i][col.details]),
      dateManila: dMNL, datePST: dPST,
      date: dMNL || dPST, week: weekStart(dMNL || dPST),
      status: st, statusNorm: normStatus(st),
      approvedOn: toISO(g[i][col.approvedOn]), notes: S(g[i][col.notes])
    });
  }
  return out;
}

/** Only normalises what actually appears in the sheet - invents nothing. */
function normStatus(s) {
  var v = S(s).toLowerCase();
  if (!v) return 'Pending';
  if (/^y(es)?$|approved/.test(v))       return 'Approved';
  if (/^n(o)?$|declin|denied|reject/.test(v)) return 'Declined';
  if (/pending|for approval/.test(v))    return 'Pending';
  return S(s);
}
