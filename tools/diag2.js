const fs = require('fs');
const qa = JSON.parse(fs.readFileSync('qa.json', 'utf8'));
const S = v => (v === null || v === undefined) ? '' : String(v.__d || v).replace(/\s+/g, ' ').trim();
const g = qa['Team Weekly and Monthly Stats'];

console.log('total rows', g.length);
console.log('=== all non-empty col-A labels that look like block headers ===');
g.forEach((r, i) => {
  const a = S(r[0]);
  if (/users|csr name|name of agent|call stats|scorecard|week|total|productivity/i.test(a) ||
      /call stats|week \(/i.test(r.map(S).join(' ')) && !S(r[1])) {
    console.log(i, JSON.stringify(r.map(S).slice(0, 6)));
  }
});
