/* Harness: runs the real Apps Script parsers against exported sheet grids. */
const fs = require('fs');

const qa = JSON.parse(fs.readFileSync('qa.json', 'utf8'));
const sc = JSON.parse(fs.readFileSync('sched.json', 'utf8'));

// revive {__d:'YYYY-MM-DD'} into real Dates (local, no UTC shift)
const rev = g => g.map(r => r.map(c => {
  if (c && typeof c === 'object' && c.__d) {
    const p = c.__d.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  return c;
}));
for (const k in qa) qa[k] = rev(qa[k]);
for (const k in sc) sc[k] = rev(sc[k]);

// ---- Apps Script shims ----
global.SpreadsheetApp = null;
const mkSS = data => ({ __d: data });
global.grid = (ss, tab) => (ss.__d[tab] || []);

// load parser sources (strip nothing; they only use helpers we define)
const src = ['Code.gs', 'Parsers.gs', 'Parsers2.gs', 'Parsers3.gs']
  .map(f => fs.readFileSync('../apps-script/' + f, 'utf8')).join('\n');
// remove the SpreadsheetApp-dependent entrypoints we don't call
eval(src.replace(/function grid\(ss, tabName\)[\s\S]*?\n}/, ''));

const PERF = mkSS(qa), SCHED = mkSS(sc);

function head(label, arr, n = 3) {
  console.log('\n### ' + label + '  rows=' + arr.length);
  arr.slice(0, n).forEach(r => console.log('   ' + JSON.stringify(r).slice(0, 210)));
}

const dp = parseDailyProductivity(PERF);   head('dailyProductivity', dp);
const wc = parseWeeklyCallStats(PERF);     head('weeklyCallStats', wc);
const qs = parseQA(PERF);                  head('qaScores', qs);
const sd = parseScorecards(PERF);          head('scorecards', sd);
const mo = parseMonthly(PERF);             head('monthlyScores', mo);
const ts = parseTeamSchedule(SCHED);       head('teamSchedule', ts);
const ot = parseOT(SCHED);                 head('otSchedule', ot);
const bk = parseBreaks(SCHED);             head('breakSchedule', bk);
const lv = parseLeave(SCHED);              head('leaveRequests', lv);

const os = parseOfficialScorecard(PERF);
head('official.weekly', os.weekly); head('official.monthly', os.monthly);

const uniq = (a, f) => [...new Set(a.map(f).filter(Boolean))].sort();
console.log('\n=== AGENTS ===');
console.log('daily  :', uniq(dp, r => r.agent).join(', '));
console.log('qa     :', uniq(qs, r => r.agent).join(', '));
console.log('monthly:', uniq(mo, r => r.agent).join(', '));
console.log('sched  :', uniq(ts, r => r.agent).join(', '));
console.log('leave  :', uniq(lv, r => r.agent).join(', '));

console.log('\n=== SANITY ===');
console.log('weeks daily :', uniq(dp, r => r.week).slice(-6).join(', '));
console.log('all Mondays :', uniq(dp, r => r.week).every(w => {
  const p = w.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).getDay() === 1;
}));
console.log('monthly periods:', uniq(mo, r => r.period).slice(0, 8).join(' | '));
console.log('leave statuses :', uniq(lv, r => r.statusNorm).join(', '));
console.log('leave raw stat :', uniq(lv, r => r.status).slice(0, 10).join(' | '));
console.log('QA score range :', Math.min(...qs.map(r => r.score)), '-', Math.max(...qs.map(r => r.score)));
console.log('OT hours sample:', uniq(ot, r => r.otTime).slice(0, 6).join(' | '));
console.log('breaks by src  :', JSON.stringify(bk.reduce((a, r) => (a[r.source] = (a[r.source] || 0) + 1, a), {})));
console.log('sched shifts   :', uniq(ts, r => r.shift).slice(0, 10).join(' | '));
