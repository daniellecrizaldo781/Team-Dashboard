/* Guard for the automated refresh.
 *
 * A parser that silently returns nothing still produces a valid, well-formed,
 * completely empty data.js. Without this check the hourly job would happily
 * commit that and blank the dashboard. Exit non-zero -> the workflow fails and
 * the previous good data.js stays in place.
 *
 * Run: node tools/checkdata.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let fail = 0;
const bad = m => { fail++; console.log('  FAIL ' + m); };
const ok  = m => console.log('  ok   ' + m);

/* decode data.js using the dashboard's own expander, so this validates the
   real shipped artifact rather than an assumption about it */
const core = fs.readFileSync(path.join(ROOT, 'app-core.js'), 'utf8');
const fn = core.match(/function expandSnapshot[\s\S]*?\r?\n\r?\}/);
if (!fn) { console.log('FATAL: expandSnapshot not found in app-core.js'); process.exit(1); }
const box = vm.createContext({});
vm.runInContext(fn[0] + 'this.expandSnapshot = expandSnapshot;', box);

const win = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8').replace(/^window\./m, 'this.'), win);
if (!win.DASHBOARD_DATA) { console.log('FATAL: data.js defined no DASHBOARD_DATA'); process.exit(1); }
const d = box.expandSnapshot(win.DASHBOARD_DATA);

/* Floors reflect the August-2026-only scope (DATA_FROM = 2026-08-01) and the
 * fact that weekly call stats / team / break come from a single source tab.
 * Set well below the real August figures so only a genuine breakage trips
 * them - e.g. a parser returning nothing would drop these to ~0. */
const MIN = {
  dailyProductivity: 20,
  weeklyCallStats: 0,
  qaScores: 40,
  scorecards: 60,
  teamSchedule: 200,
  breakSchedule: 3,
  otSchedule: 20
};

console.log('=== row counts ===');
for (const [k, floor] of Object.entries(MIN)) {
  const n = (d[k] || []).length;
  n >= floor ? ok(`${k}: ${n} (>= ${floor})`) : bad(`${k}: only ${n}, expected at least ${floor}`);
}

console.log('\n=== data sanity ===');
const agents = new Set((d.qaScores || []).map(r => r.agent).filter(Boolean));
agents.size >= 5 ? ok(`${agents.size} agents with QA records`)
                 : bad(`only ${agents.size} agents found - parser likely broke`);

const scores = (d.qaScores || []).map(r => r.score).filter(v => typeof v === 'number');
scores.length >= 40 ? ok(`${scores.length} numeric QA scores`)
                      : bad(`only ${scores.length} numeric QA scores - check the intern encoding`);

const oor = scores.filter(v => v < 0 || v > 1.5);
oor.length ? bad(`${oor.length} QA scores outside 0-1.5, e.g. ${oor[0]}`)
           : ok('QA scores all within range');

const years = new Set();
Object.keys(MIN).forEach(k => (d[k] || []).forEach(r =>
  ['date', 'week'].forEach(f => { if (r[f]) years.add(String(r[f]).slice(0, 4)); })));
[...years].every(y => y === String(d.dataYear))
  ? ok(`only ${d.dataYear} data present`)
  : bad('unexpected years: ' + [...years].sort().join(', '));

console.log('\n=== no secrets ===');
const SECRET = /script\.google\.com|AIza[0-9A-Za-z_\-]{20,}|ghp_[0-9A-Za-z]{20,}|"private_key"|BEGIN PRIVATE KEY/;
SECRET.test(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'))
  ? bad('data.js contains something secret-looking')
  : ok('data.js clean');

console.log('\n=== regression guard (never publish a data.js that lost rows vs last commit) ===');
const { execSync } = require('child_process');
function packedRowCount(src) {
  if (!src || !src.packed) return 0;
  let n = 0;
  Object.keys(src.packed).forEach(k => { const t = src.packed[k]; if (t && t.r) n += t.r.length; });
  return n;
}
function prevRowCount() {
  try {
    const prev = execSync('git show HEAD:data.js', { cwd: ROOT, encoding: 'utf8' });
    const box2 = vm.createContext({});
    vm.runInContext(prev.replace(/^window\./m, 'this.'), box2);
    return packedRowCount(box2.DASHBOARD_DATA);
  } catch (e) { return 0; } // no prior commit / not in a repo -> skip
}
const prev = prevRowCount();
const cur = packedRowCount(win.DASHBOARD_DATA);
if (prev > 0 && cur < prev * 0.7) {
  bad(`row count dropped from ${prev} to ${cur} (>${(100*(1-cur/prev)).toFixed(0)}% loss) - refusing to publish a partial snapshot: ${cur} < ${(prev*0.7)|0}`);
} else {
  ok(`row count ${cur}${prev ? ' (prev ' + prev + ')' : ''}`);
}
console.log(fail ? `\nFAILED - ${fail} problem(s); refusing to publish this data.js`
                 : '\nPASSED - data.js looks good');
process.exit(fail ? 1 : 0);
