const fs = require('fs');
const qa = JSON.parse(fs.readFileSync('qa.json', 'utf8'));
const S = v => (v === null || v === undefined) ? '' : String(v.__d || v).replace(/\s+/g, ' ').trim();
const g = qa['Team Weekly and Monthly Stats'];
console.log('--- rows 50..66 (the bare date-grid block) ---');
for (let i = 50; i < 67; i++) console.log(i, JSON.stringify(g[i].map(S).slice(0, 10)));
