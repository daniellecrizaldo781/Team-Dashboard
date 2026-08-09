/**
 * FILE 4 of 4  ->  Parsers3.gs
 * Two more block shapes inside 'Team Weekly and Monthly Stats':
 *   - daily CALLS grid  : 'NAME OF AGENT' + 7 date cols, NO 'Weekly Target'
 *   - official scorecard: 'CSR NAME' + weighted components + OVERALL SCORE
 */

/* ============ OFFICIAL WEEKLY SCORECARD (OVERALL SCORE) ============
 * Header shapes seen in the sheet:
 *   CSR NAME | Attendance & Reliability 30% | QA Spotcheck 40% | Productivity 30% | OVERALL SCORE
 *   CSR NAME | Attendance & Reliability 30% | Overall QA Spotcheck 40% | QA Jacky Spotcheck 30%
 *            | TL Spotcheck 10% | Productivity 30% | OVERALL SCORE
 *   CSR NAME | Week 1 | Week 2 | ... | Overall Score        (monthly roll-up)
 * This is the OFFICIAL score - rankings use it rather than a home-made formula.
 */
function parseOfficialScorecard(ss) {
  var weekly = [], monthly = [];
  var g = grid(ss, 'Team Weekly and Monthly Stats');
  var curTitle = '', curWeek = '';

  for (var r = 0; r < g.length; r++) {
    var a = S(g[r][0]);

    if (/scorecard/i.test(a) && !S(g[r][1])) curTitle = a;

    var wk = S(g[r].map(S).join(' ')).match(/week\s*\(\s*([A-Za-z]+\s+\d{1,2}\s*,?\s*\d{4})/i);
    if (wk) curWeek = weekStart(toISO(wk[1]));

    if (!/^csr name$/i.test(a)) continue;

    var hdr = g[r], comps = [], overallCol = -1, isMonthly = false;
    for (var c = 1; c < hdr.length; c++) {
      var h = S(hdr[c]);
      if (!h) continue;
      if (/overall\s*score/i.test(h)) { overallCol = c; continue; }
      if (/^week\s*\d/i.test(h)) isMonthly = true;
      if (/scorecard\s*\(/i.test(h)) continue;
      comps.push({ c: c, name: h });
    }
    if (overallCol < 0) continue;

    for (var i = r + 1; i < g.length; i++) {
      var nm = S(g[i][0]);
      if (!nm) break;
      if (notAgentRow(nm) || /scorecard/i.test(nm)) break;
      var ov = num(g[i][overallCol]);
      if (ov === null) continue;

      var parts = {};
      comps.forEach(function (k) { var v = num(g[i][k.c]); if (v !== null) parts[k.name] = v; });

      var rec = {
        agent: canonAgent(nm), title: curTitle, overall: ov, components: parts
      };
      if (isMonthly) { rec.period = curTitle; monthly.push(rec); }
      else { rec.week = curWeek; weekly.push(rec); }
      r = i;
    }
  }
  return { weekly: weekly, monthly: monthly };
}
