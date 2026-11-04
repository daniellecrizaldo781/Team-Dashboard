
const fs = require('fs');
const src = fs.readFileSync('C:/Users/Danielle/qa-dashboard/app-init.js', 'utf8');
const lines = src.split('\n');
console.log('TOTAL LINES:', lines.length);
console.log('--- lines containing wire / boot triggers ---');
lines.forEach((l,i)=>{
  if (/wire\(\)/.test(l) || /DOMContentLoaded/.test(l) || /addEventListener\(['"]load/.test(l) || /window\.onload/.test(l) || /\.onload\s*=/.test(l)) {
    console.log((i+1)+': '+l.trim().slice(0,110));
  }
});
console.log('--- LAST 8 LINES ---');
console.log(lines.slice(-9).join('\n'));
