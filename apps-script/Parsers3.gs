/**
 * FILE 4 of 4  ->  Parsers3.gs
 * Two block shapes inside 'WEEKLY SCORECARD':
 *   - daily CALLS grid  : 'NAME OF AGENT' + 7 date cols, NO 'Weekly Target'
 *   - official scorecard: 'CSR NAME' + weighted components + OVERALL SCORE
 */

/* ============ OFFICIAL WEEKLY SCORECARD (OVERALL SCORE) ============
 * Parses the 'WEEKLY SCORECARD' tab for per-agent overall scores.
 * Sheet has weekly blocks with WEEK: banner, agent header row, and
 * TOTAL SCORE (out of 100) row. Week from banner end date.
 * Emits { agent, week, title, overall, components } per agent per week.
 */
function parseOfficialScorecard(ss) {
  var weekly = [], monthly = [];
  var g = grid(ss, "WEEKLY SCORECARD");
  if (!g || !g.length) return { weekly: [], monthly: [] };

  var curLabel = "", curWeek = "";
  var agentCols = [];

  for (var r = 0; r < g.length; r++) {
    var a = S(g[r][0]);
    var joined = g[r].map(S).join(" ");

    var names = [];
    for (var c = 1; c < g[r].length; c++) {
      var v = S(g[r][c]);
      if (v && /^[A-Za-z][A-Za-z .ñ]+$/.test(v) && v.split(" ").length <= 4 && !/week|ending/i.test(v)) {
        if (!/\d/.test(v)) names.push({ c: c, agent: canonAgent(v) });
      }
    }
    if (!a && names.length >= 3) { agentCols = names; continue; }

    var wk = joined.match(/week\s*:?\s*([A-Za-z]{3,}\s+\d{1,2}\s*,?\s*\d{4})\s*-\s*([A-Za-z]{3,}\s+\d{1,2}\s*,?\s*\d{4})/i);
    // A "Week Ending" row is a continuation label of the SAME block, not a new
    // week. If its WEEK: text is stale (e.g. still the previous week after the
    // user added a new block), honoring it would REWIND curWeek and attribute
    // the whole new block to the old week (then dedupe silently drops it).
    if (!/^week ending/i.test(a) && wk && r > agentCols.length) {
      curLabel = S(joined).slice(0, 60);
      curWeek = weekStart(toISO(wk[2]));
    } else if (!wk) {
      wk = joined.match(/week\s*:?\s*([A-Za-z]{3,}\s+\d{1,2}\s*,?\s*\d{4})/i);
      if (!/^week ending/i.test(a) && wk && r > agentCols.length) {
        curLabel = S(joined).slice(0, 60);
        curWeek = weekStart(toISO(wk[1]));
      }
    }

    if (!/^(total score|overall %)$/i.test(a)) continue;
    if (!agentCols.length) continue;

    for (var i = 0; i < agentCols.length; i++) {
      var col = agentCols[i];
      var val = num(g[r][col.c]);
      if (val === null) continue;
      weekly.push({ agent: col.agent, week: curWeek, title: curLabel, overall: val, components: {} });
    }
  }

  var seen = {};
  var deduped = [];
  weekly.forEach(function (r) {
    var k = r.agent + "|" + r.week;
    if (seen[k]) return;
    seen[k] = 1;
    deduped.push(r);
  });
  return { weekly: deduped, monthly: monthly };
}
