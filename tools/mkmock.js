/* Generates mock-api.json from the REAL sheets using the REAL parsers. */
const fs = require('fs');
const qa = JSON.parse(fs.readFileSync('qa.json', 'utf8'));
const sc = JSON.parse(fs.readFileSync('sched.json', 'utf8'));
const rev = g => g.map(r => r.map(c => {
  if (c && typeof c === 'object' && c.__d) { const p = c.__d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  return c;
}));
for (const k in qa) qa[k] = rev(qa[k]);
for (const k in sc) sc[k] = rev(sc[k]);

global.SpreadsheetApp = null;
global.grid = (ss, tab) => (ss.__d[tab] || []);
const src = ['Code.gs', 'Parsers.gs', 'Parsers2.gs', 'Parsers3.gs']
  .map(f => fs.readFileSync('../apps-script/' + f, 'utf8')).join('\n');
eval(src.replace(/function grid\(ss, tabName\)[\s\S]*?\n}/, ''));

global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'FAKE' }) };
const PERF = { __d: qa }, SCHED = { __d: sc };
const os = parseOfficialScorecard(PERF);
const out = {
  ok: true, mode: 'data', warnings: [],
  lastUpdated: new Date().toISOString(),
  dailyProductivity: parseDailyProductivity(PERF),
  weeklyCallStats: parseWeeklyCallStats(PERF),
  qaScores: parseQA(PERF),
  qaBreakdown: parseQaJacky(PERF),
  scorecards: parseScorecards(PERF),
  monthlyScores: parseMonthly(PERF),
  officialScorecard: os,
  teamSchedule: parseTeamSchedule(SCHED),
  otSchedule: parseOT(SCHED),
  breakSchedule: parseBreaks(SCHED),
  leaveRequests: parseLeave(SCHED)
};
const before = {}; Object.keys(out).forEach(k=>{ if(Array.isArray(out[k])) before[k]=out[k].length; });
restrictToYear(out, DATA_YEAR);
// Scorecards stay full-history (WEEKLY SCORECARD reaches back to January);
// every other dataset is trimmed to on/after DATA_FROM (August).
const scorecardsFull = out.scorecards;
restrictFrom(out, DATA_FROM);
out.scorecards = scorecardsFull;
// Schedule-type datasets capped at DATA_TO (August) so future roster weeks drop.
['teamSchedule', 'otSchedule', 'breakSchedule'].forEach(k => {
  if (Array.isArray(out[k])) out[k] = out[k].filter(r => rowFrom(r, DATA_FROM) && beforeTo(r, DATA_TO));
});
out.dataYear = DATA_YEAR;
out.dataFrom = DATA_FROM;
out.dataTo = DATA_TO;
console.log('year filter (before -> after):');
Object.keys(before).forEach(k=>{ if(before[k]!==out[k].length) console.log('  '+k+': '+before[k]+' -> '+out[k].length); });
fs.writeFileSync('../mock-api.json', JSON.stringify(out));
console.log('wrote mock-api.json');
Object.keys(out).forEach(k => { if (Array.isArray(out[k])) console.log('  ' + k, out[k].length); });
console.log('  officialScorecard.weekly', os.weekly.length, 'monthly', os.monthly.length);
