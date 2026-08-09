/**
 * FILE 2 of 3  ->  Parsers.gs
 * Turns the block/matrix sheet layouts into flat JSON rows.
 */

/* ============ DAILY PRODUCTIVITY ============
 * Tabs: 'Daily and Weekly Call Stats' (single source, per request)
 * Repeating blocks:
 *   row A: WEEK: ...
 *   header row: NAME OF AGENT | Weekly Target | Weekly Actual | <7 date cells> | % Productivity | Final Score
 *   next row  : blank,blank,blank, Mon..Sun
 *   then agent rows until a blank/next block
 * Emits one row per agent per DAY.
 */
function parseDailyProductivity(ss) {
  var out = [];
  ['Daily and Weekly Call Stats'].forEach(function (tab) {
    var g = grid(ss, tab);
    for (var r = 0; r < g.length; r++) {
      var first = S(g[r][0]);
      if (!/^(name of agent)$/i.test(first)) continue;
      // Two block shapes share this header. Only the one carrying 'Weekly Target'
      // is productivity; the bare date grid is daily CALLS (parsed separately).
      if (!g[r].some(function (h) { return /weekly target/i.test(S(h)); })) continue;

      // header row found -> locate the 7 date columns and the summary columns
      var hdr = g[r], dateCols = [], pctCol = -1, scoreCol = -1, tgtCol = -1, actCol = -1;
      for (var c = 1; c < hdr.length; c++) {
        var h = S(hdr[c]);
        if (isDate(hdr[c])) dateCols.push({ c: c, d: iso(hdr[c]) });
        else if (/weekly target/i.test(h)) tgtCol = c;
        else if (/weekly actual|actual\s*productivity/i.test(h)) actCol = c;
        else if (/productivity\s*%|% ?productivity/i.test(h)) pctCol = c;
        else if (/final\s*score/i.test(h)) scoreCol = c;
      }
      if (!dateCols.length) continue;

      // agent rows start after the Mon..Sun label row (if present)
      var start = r + 1;
      if (start < g.length && /^(mon|monday)$/i.test(S(g[start][dateCols[0].c]))) start++;

      for (var i = start; i < g.length; i++) {
        var nm = S(g[i][0]);
        if (!nm) { if (i > start && !S(g[i][1])) break; else continue; }
        if (notAgentRow(nm)) break;
        var agent = canonAgent(nm);
        var pct = num(g[i][pctCol]), fs = num(g[i][scoreCol]);
        var tgt = num(g[i][tgtCol]), act = num(g[i][actCol]);

        for (var k = 0; k < dateCols.length; k++) {
          var raw = g[i][dateCols[k].c];
          var rs = S(raw);
          var isOff = /^off$/i.test(rs);
          var v = isOff ? null : num(raw);
          if (v === null && !isOff) continue;      // genuinely empty cell -> skip
          out.push({
            agent: agent, date: dateCols[k].d, week: weekStart(dateCols[k].d),
            day: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][k] || '',
            tickets: v, off: isOff,
            weeklyTarget: tgt, weeklyActual: act,
            productivityPct: pct, finalScore: fs, source: tab
          });
        }
      }
    }
  });
  return dedupe(out, function (x) { return x.agent + '|' + x.date; });
}

/** Later blocks win (the sheet is appended chronologically). */
function dedupe(rows, keyFn) {
  var m = {}, order = [];
  rows.forEach(function (r) { var k = keyFn(r); if (!(k in m)) order.push(k); m[k] = r; });
  return order.map(function (k) { return m[k]; });
}

/* ============ WEEKLY CALL STATS ============
 * Tabs: 'Daily and Weekly Call Stats' (single source, per request)
 
 * Each week has a 'Weekly Call Stats' block headed
 *   NAME OF AGENT | Ringing Attempts | Picked Up | Not Picked Up |
 *   Picked Up Rate | AHT | Picked Up Rate Score | AHT Rate Score
 * The week is taken from the real date cells in the productivity header above.
 * Emits one row per agent per WEEK.
 */
function parseWeeklyCallStats(ss) {
  var out = [];

  ['Daily and Weekly Call Stats'].forEach(function (tab) {
    var g = grid(ss, tab);
    var curWeek = '', curLabel = '';

    for (var r = 0; r < g.length; r++) {
      var row = g[r], first = S(row[0]);
      var joined = row.map(S).join(' ');

      // --- week context -------------------------------------------------
      // Most reliable: the productivity header right above carries the 7 real
      // date cells. Fall back to the textual 'WEEK: ...' banner.
      if (/^(name of agent)$/i.test(first) &&
          row.some(function (h) { return /weekly target/i.test(S(h)); })) {
        for (var dc = 1; dc < row.length; dc++) {
          if (isDate(row[dc])) { curWeek = weekStart(iso(row[dc])); break; }
        }
        continue;
      }
      var wk = joined.match(/week\s*:?\s*\(?\s*([A-Za-z]{3,}\s+\d{1,2})/i);
      if (wk && /week\s*:/i.test(joined)) { curLabel = S(joined).slice(0, 60); }

      // --- call-stats header ---------------------------------------------
      // Two historical shapes: 'NAME OF AGENT' + Ringing/Picked Up, or 'USERS'.
      var isCallHdr =
        (/^(name of agent|users)$/i.test(first) &&
         /ringing|attempts/i.test(joined) && /picked\s*up/i.test(joined));
      if (!isCallHdr) continue;

      var col = {};
      for (var c = 1; c < row.length; c++) {
        var h = S(row[c]);
        if (/ringing|attempts/i.test(h))                       col.attempts = c;
        else if (/not\s*picked/i.test(h))                      col.notPicked = c;
        else if (/picked\s*up[\s\S]*rate[\s\S]*score/i.test(h)) col.rateScore = c;
        else if (/aht[\s\S]*score/i.test(h))                   col.ahtScore = c;
        else if (/picked\s*up[\s\S]*rate|rate\s*%/i.test(h))    col.rate = c;
        else if (/picked\s*up/i.test(h))                       col.picked = c;
        else if (/aht/i.test(h))                               col.aht = c;
      }
      if (col.attempts === undefined && col.picked === undefined) continue;

      // agent rows follow, possibly after one blank spacer row
      var blanks = 0;
      for (var i = r + 1; i < g.length; i++) {
        var nm = S(g[i][0]);
        if (!nm) { if (++blanks > 1) break; else continue; }
        if (notAgentRow(nm)) break;
        blanks = 0;

        var attempts = num(g[i][col.attempts]);
        var picked   = num(g[i][col.picked]);
        if (attempts === null && picked === null) continue;   // week not filled in yet

        var rate = num(g[i][col.rate]);
        if (rate !== null && rate > 1.5) rate = rate / 100;   // sheet mixes 0.99 and 99

        out.push({
          agent: canonAgent(nm),
          week: curWeek,
          weekLabel: curLabel,
          attempts: attempts,
          pickedUp: picked,
          notPickedUp: num(g[i][col.notPicked]),
          pickupRate: rate,
          aht: S(g[i][col.aht]),
          pickupRateScore: num(g[i][col.rateScore]),
          ahtScore: num(g[i][col.ahtScore]),
          date: null,
          source: tab
        });
      }
    }
  });

  // one row per agent per week; later blocks win
  return dedupe(out.filter(function (r) { return r.week; }),
                function (x) { return x.agent + '|' + x.week; });
}

/* ============ QA JACKY / TL SCORES ============
 * Same 'Daily and Weekly Call Stats' tab, bottom block headed
 *   NAME OF AGENT | QA JACKY SCORE 30% | QA TL SCORE 10% | Final QA Score |
 *   Productivity % (30%) | FINAL Productivity Score
 * Values are fractions (1 = 100%). Week comes from the productivity header
 * above the block, tracked the same way as parseWeeklyCallStats.
 * Emits one row per agent per WEEK.
 */
function parseQaJacky(ss) {
  var out = [];
  ['Daily and Weekly Call Stats'].forEach(function (tab) {
    var g = grid(ss, tab);
    var curWeek = '';

    for (var r = 0; r < g.length; r++) {
      var first = S(g[r][0]);

      // track week from the productivity header (7 real date cells)
      if (/^(name of agent)$/i.test(first) &&
          g[r].some(function (h) { return /weekly target/i.test(S(h)); })) {
        for (var dc = 1; dc < g[r].length; dc++) {
          if (isDate(g[r][dc])) { curWeek = weekStart(iso(g[r][dc])); break; }
        }
        continue;
      }

      // QA Jacky block header
      if (!/^(name of agent)$/i.test(first)) continue;
      if (!/qa\s*jacky/i.test(g[r].map(S).join(' '))) continue;

      var col = {};
      for (var c = 1; c < g[r].length; c++) {
        var h = S(g[r][c]).replace(/\s+/g, ' ').trim().toLowerCase();
        if (/^qa\s*jacky/.test(h))            col.jacky = c;
        else if (/^qa\s*tl/.test(h))          col.tl = c;
        else if (/final\s*qa/.test(h))        col.finalQA = c;
        else if (/productivity\s*%\s*\(/.test(h)) col.prodPct = c;
        else if (/final\s*productivity/.test(h)) col.finalProd = c;
      }
      if (col.jacky === undefined) continue;

      for (var i = r + 1; i < g.length; i++) {
        var nm = S(g[i][0]);
        if (!nm) continue;
        if (notAgentRow(nm)) break;
        out.push({
          agent: canonAgent(nm),
          week: curWeek,
          jacky: num(g[i][col.jacky]),
          tl: col.tl !== undefined ? num(g[i][col.tl]) : null,
          finalQA: col.finalQA !== undefined ? num(g[i][col.finalQA]) : null,
          productivityPct: col.prodPct !== undefined ? num(g[i][col.prodPct]) : null,
          finalProductivity: col.finalProd !== undefined ? num(g[i][col.finalProd]) : null,
          source: tab
        });
      }
    }
  });
  return dedupe(out.filter(function (r) { return r.week; }),
                function (x) { return x.agent + '|' + x.week; });
}

/* ============ QA SCORES ============
 * One tab per agent. Header row contains 'Ticket Link' and 'Date'.
 * Emits one row per evaluated call.
 */
function parseQA(ss) {
  var out = [];
  QA_TABS.forEach(function (tab) {
    var g = grid(ss, tab);
    if (!g.length) return;
    var agent = TAB_TO_AGENT[tab] || tab;

    var hRow = -1;
    for (var r = 0; r < Math.min(g.length, 40); r++) {
      if (/ticket link/i.test(S(g[r][0]))) { hRow = r; break; }
    }
    if (hRow < 0) return;

    var hdr = g[hRow], col = { crit: [] };
    for (var c = 0; c < hdr.length; c++) {
      var h = S(hdr[c]);
      if (/ticket link/i.test(h))       col.link = c;
      else if (/^date/i.test(h))        col.date = c;
      else if (/^day/i.test(h))         col.day = c;
      else if (/^score$/i.test(h))      col.score = c;
      else if (/^average/i.test(h))     col.avg = c;
      else if (/^notes$/i.test(h))      col.notes = c;
      else if (h) col.crit.push({ c: c, name: h.replace(/\s*\d+%$/, '') });
    }

    for (var i = hRow + 1; i < g.length; i++) {
      var dISO = toISO(g[i][col.date]);
      var sc   = num(g[i][col.score]);
      if (!dISO || sc === null) continue;
      var crit = {};
      col.crit.forEach(function (k) { var v = S(g[i][k.c]); if (v) crit[k.name] = v; });
      out.push({
        agent: agent, tab: tab, date: dISO, week: weekStart(dISO),
        day: S(g[i][col.day]), score: sc > 1.5 ? sc / 100 : sc,
        average: num(g[i][col.avg]), link: S(g[i][col.link]),
        notes: S(g[i][col.notes]), criteria: crit
      });
    }
  });
  return out;
}
