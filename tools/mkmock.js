/* Generates mock-api.json from the REAL sheets using the REAL parsers. */
const fs = require('fs');
const path = require('path');
const J = f => path.join(__dirname, f);
const qa = JSON.parse(fs.readFileSync(J('qa.json'), 'utf8'));
const sc = JSON.parse(fs.readFileSync(J('sched.json'), 'utf8'));
const casc = fs.existsSync(J('casc.json')) ? JSON.parse(fs.readFileSync(J('casc.json'), 'utf8')) : {};
const prod = fs.existsSync(J('prod.json')) ? JSON.parse(fs.readFileSync(J('prod.json'), 'utf8')) : {};
const rev = g => g.map(r => r.map(c => {
  if (c && typeof c === 'object' && c.__d) { const p = c.__d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  return c;
}));
for (const k in qa) qa[k] = rev(qa[k]);
for (const k in sc) sc[k] = rev(sc[k]);
for (const k in casc) casc[k] = rev(casc[k]);

global.SpreadsheetApp = null;
global.grid = (ss, tab) => (ss.__d[tab] || []);
const src = ['Code.gs', 'Parsers.gs', 'Parsers2.gs', 'Parsers3.gs', 'Parsers4.gs']
  .map(f => fs.readFileSync(require('path').join(__dirname, '..', 'apps-script', f), 'utf8')).join('\n');
// Strip the live Apps Script grid() (uses SpreadsheetApp) so the mock below wins.
const srcNoGrid = src.replace(/function grid\(ss, tabName\)[\s\S]*?\n\}/, '');
eval(srcNoGrid);
// Guarantee the mock grid is what all parsers use (covers stripHtml edge cases).
var grid = (ss, tab) => (ss.__d[tab] || []);

global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => 'FAKE' }) };
const PERF = { __d: qa }, SCHED = { __d: sc }, CASC = { __d: casc }, PROD = { __d: prod };
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
  leaveRequests: parseLeave(SCHED),
  cascades: parseCascades(CASC),
  products: parseProducts(PROD)
};
// Embed cascade reference images as base64 data-URIs so they always render on
// the dashboard (Google Drive blocks cross-origin browser hotlinks by referrer;
// a server-side curl download with no referrer succeeds). One image per cell URL.
(function embedCascadeImages() {
  const { execSync } = require('child_process');
  const casc = out.cascades || [];
  const URL_RE = /https?:\/\/[^\s)<>"'\]]+/g;
  const isImg = u => /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(u) ||
    /drive\.google\.com|docs\.google\.com\/uc|lh3\.googleusercontent\.com|imgur\.com/i.test(u);
  const direct = u => {
    u = (u || '').replace(/&amp;/g, '&');
    const m = u.match(/drive\.google\.com\/file\/d\/([^\/?]+)/) || u.match(/drive\.google\.com\/open\?id=([^&]+)/) || u.match(/drive\.google\.com\/uc\?[^&]*id=([^&]+)/);
    return m ? 'https://lh3.googleusercontent.com/d/' + m[1] : u;
  };
  casc.forEach(row => {
    const text = (row.linkRefs || '') + ' ' + (row.cascade || '');
    const urls = (text.match(URL_RE) || []).filter(isImg).map(direct);
    const seen = {}; const imgs = [];
    urls.forEach(u => {
      if (seen[u]) return; seen[u] = 1;
      try {
        const b64 = execSync('curl -sL --max-time 25 ' + JSON.stringify(u), { maxBuffer: 8 * 1024 * 1024 });
        if (b64 && b64.length > 200) {
          const sig = b64.slice(0, 4).toString('hex');
          const ext = sig === '89504e47' ? 'png' : sig.startsWith('ffd8') ? 'jpeg' : sig === '474946' ? 'gif' : sig === '524946' ? 'webp' : 'png';
          imgs.push({ url: u, src: 'data:image/' + ext + ';base64,' + b64.toString('base64') });
        }
      } catch (e) { /* skip undownloadable image */ }
    });
    if (imgs.length) row.cascadeImages = imgs;
  });
})();

// Embed product images as base64 data-URIs (same server-side download trick as
// cascades - Drive blocks browser hotlinks by referrer, so we download + inline).
(function embedProductImages() {
  const { execSync } = require('child_process');
  const direct = u => {
    u = (u || '').replace(/&amp;/g, '&');
    const m = u.match(/drive\.google\.com\/file\/d\/([^\/?]+)/) || u.match(/drive\.google\.com\/open\?id=([^&]+)/) || u.match(/drive\.google\.com\/uc\?[^&]*id=([^&]+)/);
    return m ? 'https://lh3.googleusercontent.com/d/' + m[1] : u;
  };
  (out.products || []).forEach(row => {
    const u = direct(row.image || '');
    if (!/lh3\.googleusercontent\.com|drive\.google\.com|\.(png|jpe?g|gif|webp|bmp|svg)/i.test(u)) return;
    try {
      const b64 = execSync('curl -sL --max-time 30 ' + JSON.stringify(u), { maxBuffer: 8 * 1024 * 1024 });
      if (b64 && b64.length > 200) {
        const sig = b64.slice(0, 4).toString('hex');
        const ext = sig === '89504e47' ? 'png' : sig.startsWith('ffd8') ? 'jpeg' : sig === '474946' ? 'gif' : sig === '524946' ? 'webp' : 'png';
        row.imageData = 'data:image/' + ext + ';base64,' + b64.toString('base64');
      }
    } catch (e) { /* leave image as the link if download fails */ }
  });
})();

// Manual photos: embed as base64 ONLY when the Drive file is a PUBLIC image
// (so it renders inline with no Drive permission/referrer block). PDFs and
// non-public files stay as 'doc' and open in the Drive viewer via the pink
// "Click here to view document" CTA (which needs the file shared "anyone with
// link"). We intentionally do NOT embed PDFs - they bloat data.js and the
// viewer handles them fine.
(function embedManualPhotos() {
  const { execSync } = require('child_process');
  const py = process.platform === 'win32' ? 'python' : 'python3';
  (out.products || []).forEach(row => {
    (row.manualPhotos || []).forEach(ph => {
      const idm = (ph.url || '').match(/file\/d\/([^/]+)/);
      if (!idm) return;
      try {
        const res = execSync(py + ' ' + require('path').join(__dirname, 'dl_manual.py') + ' ' + idm[1], { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', timeout: 120000 });
        const meta = JSON.parse(res.trim().split('\n').pop());
        if (meta.kind === 'image' && meta.imgData) { ph.kind = 'image'; ph.imgData = meta.imgData; }
        else { ph.kind = 'doc'; }   // PDF / doc / non-public -> viewer CTA
      } catch (e) { ph.kind = 'doc'; }
    });
  });
})();

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
fs.writeFileSync(path.join(__dirname, '..', 'mock-api.json'), JSON.stringify(out));
console.log('wrote mock-api.json');
Object.keys(out).forEach(k => { if (Array.isArray(out[k])) console.log('  ' + k, out[k].length); });
console.log('  officialScorecard.weekly', os.weekly.length, 'monthly', os.monthly.length);
