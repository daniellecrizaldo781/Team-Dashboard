/* Tests LeaveSubmit.gs against a simulated Leave Request Sheet. */
const fs = require('fs');

// ---- fake sheet ----
const HDR = ['w','Agent Name','Advise For','Reason','Details',
             'Date of Leave (MANILA TIME)','Date of Leave (PST)','Approved?',
             'Date of Approval','TL NOTES'];
let GRID = [HDR,
  ['August','Lyra Miclat','Off Adjustment','Birthday/Family Celebration','',
   new Date(2026,7,2,12),new Date(2026,7,1,12),'Yes','',''],
  ['November','Danielle Mae David','Whole Day LWOP','Birthday/Family Celebration','',
   new Date(2026,10,17,12),new Date(2026,10,16,12),'Pending','','Will plot Soon'],
];
while (GRID.length < 40) GRID.push(new Array(10).fill(''));

const fmt = {};
function mkSheet() {
  return {
    getLastRow: () => GRID.length,
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues: () => Array.from({length: nr}, (_, i) =>
          Array.from({length: nc}, (_, j) => (GRID[r-1+i] || [])[c-1+j] ?? '')),
        setValues(v) { v.forEach((row, i) => {
          while (GRID.length < r+i) GRID.push(new Array(10).fill(''));
          row.forEach((cell, j) => { GRID[r-1+i][c-1+j] = cell; }); }); },
        setNumberFormat(f) { fmt[`${r},${c}`] = f; }
      };
    }
  };
}
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => null,
  openById: () => ({ getSheetByName: n => n === 'Leave Request Sheet' ? mkSheet() : null })
};
global.PropertiesService = { getScriptProperties: () => ({ getProperty: k => 'FAKE_ID_' + k }) };
global.ContentService = { createTextOutput: t => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } };
global.Utilities = { formatDate: (d,tz,f) => 'Aug 9, 2026' };
global.Session = { getScriptTimeZone: () => 'Asia/Manila' };
global.Logger = { log: () => {} };

const src = ['LeaveSubmit.gs'].map(f => fs.readFileSync('../apps-script/'+f,'utf8')).join('\n');
eval(src);

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + '  -> ' + e.message); fail++; }
}
function expectErr(p, re) {
  const r = JSON.parse(doPost({ postData: { contents: JSON.stringify(p) } }));
  if (r.ok) throw new Error('expected rejection, got success');
  if (!re.test(r.error)) throw new Error('wrong error: ' + r.error);
}

const good = { action:'submitLeave', agent:'Lyra Miclat', leaveType:'Off Adjustment',
               reason:'Medical Appointment', date:'2026-09-15', details:'Dentist' };

console.log('--- validation ---');
t('rejects unknown leave type', () => expectErr({...good, leaveType:'Vacation'}, /valid leave type/i));
t('rejects unknown reason',     () => expectErr({...good, reason:'Because'}, /valid reason/i));
t('rejects bad date',           () => expectErr({...good, date:'not-a-date'}, /valid leave date/i));
t('rejects non-2026 date',      () => expectErr({...good, date:'2025-09-15'}, /within 2026/i));
t('rejects missing agent',      () => expectErr({...good, agent:''}, /select your name/i));
t('rejects unknown action',     () => expectErr({...good, action:'deleteAll'}, /unknown action/i));

console.log('\n--- successful submission ---');
let saved;
t('accepts a valid request', () => {
  const r = JSON.parse(doPost({ postData: { contents: JSON.stringify(good) } }));
  if (!r.ok) throw new Error(r.error);
  saved = r;
});
t('status forced to Pending', () => {
  if (saved.saved.status !== 'Pending') throw new Error('got ' + saved.saved.status);
});
t('row written into first blank row', () => {
  const row = GRID[saved.row - 1];
  if (row[1] !== 'Lyra Miclat') throw new Error('agent col wrong: ' + row[1]);
  if (row[7] !== 'Pending') throw new Error('status col wrong: ' + row[7]);
});
t('month auto-derived from date', () => {
  const row = GRID[saved.row - 1];
  if (row[0] !== 'September') throw new Error('got ' + row[0]);
});
t('PST date is one day behind Manila', () => {
  const row = GRID[saved.row - 1];
  const diff = (row[5] - row[6]) / 86400000;
  if (Math.round(diff) !== 1) throw new Error('diff = ' + diff);
});
t('details preserved', () => {
  if (GRID[saved.row - 1][4] !== 'Dentist') throw new Error('got ' + GRID[saved.row-1][4]);
});
t('note records dashboard origin', () => {
  if (!/dashboard/i.test(GRID[saved.row - 1][9])) throw new Error('got ' + GRID[saved.row-1][9]);
});

console.log('\n--- duplicate guard ---');
t('same agent+date rejected', () => expectErr(good, /already exists/i));
t('same date, different agent OK', () => {
  const r = JSON.parse(doPost({ postData: { contents: JSON.stringify({...good, agent:'Dan Mae David'}) } }));
  if (!r.ok) throw new Error(r.error);
});

console.log('\n--- name folding ---');
t("full name maps to sheet's own spelling", () => {
  const r = JSON.parse(doPost({ postData: { contents:
    JSON.stringify({...good, agent:'Danielle Mae David', date:'2026-09-22'}) } }));
  if (!r.ok) throw new Error(r.error);
  if (r.saved.agent !== 'Danielle Mae David')
    throw new Error("expected sheet spelling 'Danielle Mae David', got '" + r.saved.agent + "'");
});

console.log('\n--- form-encoded body (no-preflight path) ---');
t('accepts form-encoded payload', () => {
  const body = 'payload=' + encodeURIComponent(JSON.stringify({...good, date:'2026-10-05'}));
  const r = JSON.parse(doPost({ postData: { contents: body } }));
  if (!r.ok) throw new Error(r.error);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
