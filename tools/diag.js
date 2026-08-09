const fs = require('fs');
const qa = JSON.parse(fs.readFileSync('qa.json', 'utf8'));
const sc = JSON.parse(fs.readFileSync('sched.json', 'utf8'));
const S = v => (v === null || v === undefined) ? '' : String(v.__d || v).replace(/\s+/g, ' ').trim();

const g = qa['Team Weekly and Monthly Stats'];
console.log('=== WEEKLY CALL STATS: rows with USERS in col A ===');
g.forEach((r, i) => { if (/^users$/i.test(S(r[0]))) console.log(i, JSON.stringify(r.map(S).slice(0, 8))); });
console.log('\n=== rows 8..30 col A ===');
for (let i = 8; i < 32; i++) console.log(i, JSON.stringify(g[i].map(S).slice(0, 8)));

const l = sc['Leave Request Sheet'];
console.log('\n=== LEAVE: total', l.length, ' non-empty col B ===');
let ne = 0;
l.forEach(r => { if (S(r[1])) ne++; });
console.log('rows with agent name:', ne);
console.log('rows 25..34:');
for (let i = 25; i < 35; i++) console.log(i, JSON.stringify(l[i].map(S).slice(0, 9)));
