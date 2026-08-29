/* Bakes mock-api.json (produced by mkmock.js from the REAL sheets using the
 * REAL parsers) into ../data.js - a static snapshot the dashboard reads with
 * no Apps Script and no network call.
 *
 * Three lossless size tricks, because this file gets pasted by hand:
 *   1. Fields the frontend never reads are dropped (e.g. qaScores.criteria).
 *   2. Tables are COLUMNAR - column names once, rows as plain arrays.
 *   3. Repeated strings (agent names, metrics, weeks, dates) are INTERNED
 *      into one shared table and referenced by index.
 * app-core.js reverses all three at load time.
 */
const fs = require('fs');

const d = JSON.parse(fs.readFileSync(__dirname + '/../mock-api.json', 'utf8'));

/* ---- string interning ---------------------------------------------------
 * A string becomes {s:i} -> index into the shared table. Only worth it for
 * strings that actually repeat, so single-use strings are left inline.
 */
const freq = new Map();
function count(v) { if (typeof v === 'string' && v) freq.set(v, (freq.get(v) || 0) + 1); }

const T = {
  dailyProductivity: ['agent','date','week','day','tickets','off',
                      'weeklyTarget','weeklyActual','productivityPct','finalScore'],
  weeklyCallStats:   ['agent','week','attempts','pickedUp','notPickedUp','pickupRate','aht'],
  // 'criteria' is a big per-call object the dashboard never renders - dropped
  qaScores:          ['agent','date','week','day','score','link','notes'],
  qaBreakdown:       ['agent','week','jacky','tl','finalQA','productivityPct','finalProductivity'],
  scorecards:        ['week','weekLabel','section','agent','metric','value','raw'],
  monthlyScores:     ['agent','period','label','type','score'],
  teamSchedule:      ['agent','date','week','day','shift','off','source'],
  otSchedule:        ['agent','date','week','day','otTime','hours','hotline'],
  breakSchedule:     ['agent','day','firstBreak','lunchBreak','lastBreak','team','off','source'],
  leaveRequests:     ['agent','month','leaveType','reason','details','dateManila','datePST',
                     'date','week','status','statusNorm','requestedOn','approvedOn','notes'],
  cascades:         ['category','brand','title','date','month','dayNum','dateLabel','cascade','linkRefs','cascadeRuns']
};

Object.keys(T).forEach(k => (d[k] || []).forEach(row => T[k].forEach(c => count(row[c]))));

// intern anything seen more than once and long enough to pay for itself
const strings = [...freq.entries()].filter(([s, n]) => n > 1 && s.length > 2).map(([s]) => s);
const idx = new Map(strings.map((s, i) => [s, i]));
// An interned string is written as a ONE-ELEMENT ARRAY [i]. A bare number must
// stay a bare number, or real numeric values (scores, hours) would be decoded
// as string-table lookups on the way back in.
const enc = v => (typeof v === 'string' && idx.has(v)) ? [idx.get(v)] : v;

/** [{a:1,b:2}, ...] -> {c:['a','b'], r:[[1,2], ...]} with strings interned */
function pack(rows, cols) {
  return {
    c: cols,
    r: (rows || []).map(row => {
      const a = cols.map(k => {
        if (k === 'cascadeRuns') {
          // runs: [[text, bold, italic], ...] -> intern the run text
          const runs = row[k];
          if (!runs) return null;
          return runs.map(r => [enc(typeof r[0] === 'string' ? r[0] : ''), !!r[1], !!r[2]]);
        }
        return (row[k] === undefined ? null : enc(row[k]));
      });
      while (a.length && a[a.length - 1] === null) a.pop();  // re-filled on expand
      return a;
    })
  };
}

const out = {
  lastUpdated: new Date().toISOString(),
  dataYear: d.dataYear || 2026,
  mode: 'snapshot',
  warnings: [],
  officialScorecard: d.officialScorecard || { weekly: [], monthly: [] },
  leaveFormOptions: d.leaveFormOptions || { leaveTypes: [], reasons: [] },
  strings: strings,
  packed: {}
};
Object.keys(T).forEach(k => { out.packed[k] = pack(d[k], T[k]); });

const js =
  '/* ============================================================\n' +
  ' * data.js - STATIC DATA SNAPSHOT (no Apps Script required)\n' +
  ' *\n' +
  ' * Generated from the Team QA and Leave/Schedule Google Sheets.\n' +
  ' * 2026 data only. Contains NO credentials, NO sheet IDs, NO tokens -\n' +
  ' * just names, numbers and dates.\n' +
  ' *\n' +
  ' * Compressed (columnar + shared string table) so it stays small enough\n' +
  ' * to paste; app-core.js expands it back into normal objects on load.\n' +
  ' *\n' +
  ' * Snapshot taken: ' + new Date().toISOString() + '\n' +
  ' * ============================================================ */\n' +
  'window.DASHBOARD_DATA = ' + JSON.stringify(out) + ';\n';

const outPath = __dirname + '/../data.js';

/* If nothing but the timestamp changed, keep the existing file byte-for-byte.
 * The hourly refresh job commits whenever data.js differs, so without this a
 * fresh lastUpdated would produce a pointless commit every single hour. */
function unchangedApartFromTimestamp(nextObj) {
  try {
    const prev = fs.readFileSync(outPath, 'utf8');
    const at = prev.indexOf('window.DASHBOARD_DATA =');
    if (at < 0) return false;
    const old = JSON.parse(prev.slice(at + 'window.DASHBOARD_DATA ='.length).trim().replace(/;$/, ''));
    const a = Object.assign({}, old,     { lastUpdated: null });
    const b = Object.assign({}, nextObj, { lastUpdated: null });
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (e) {
    return false;   // no previous file, or unreadable -> write a fresh one
  }
}

if (require.main === module) {
  if (unchangedApartFromTimestamp(out)) {
    console.log('data unchanged - leaving data.js as is');
  } else {
    fs.writeFileSync(outPath, js);

    console.log('wrote data.js  ' + (Buffer.byteLength(js) / 1024).toFixed(0) + ' KB  (' +
                strings.length + ' interned strings)');
    Object.keys(T).forEach(k => {
      console.log('  ' + k.padEnd(20) + String(out.packed[k].r.length).padStart(5));
    });
  }
}

/* the column map is the contract between bake and expandSnapshot - export it
   so verification scripts assert against it rather than a stale copy */
module.exports = { COLUMNS: T };
