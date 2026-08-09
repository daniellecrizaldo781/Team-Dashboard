const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const DIR = 'C:/Users/Danielle/qa-dashboard';
const PAGES = ['overview','productivity','calls','qa','scorecards','schedule','otbreak','leave'];
const VPS = [320,360,390,768,1024,1440];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0,180)); });

  // serve the real mock payload in place of the Apps Script endpoint
  const mock = fs.readFileSync(path.join(DIR, 'mock-api.json'), 'utf8');
  await page.route('**/macros/s/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: mock }));
  await page.addInitScript(() => { window.__API_OVERRIDE = 'https://script.google.com/macros/s/MOCK/exec'; });
  await page.route('**/config.js*', r => r.fulfill({
    status: 200, contentType: 'application/javascript',
    body: "window.API_URL='https://script.google.com/macros/s/MOCK/exec';window.REFRESH_MINUTES=5;"
  }));

  await page.goto('file:///' + DIR + '/index.html');
  await page.waitForTimeout(2500);

  console.log('=== SYNC STATUS ===');
  console.log(await page.textContent('#syncText'));
  const bn = await page.$('#banner');
  console.log('banner hidden:', await bn.isHidden());

  console.log('\n=== PAGES ===');
  for (const p of PAGES) {
    await page.click(`.nav-btn[data-page="${p}"]`);
    await page.waitForTimeout(450);
    const r = await page.evaluate(() => {
      const vis = [...document.querySelectorAll('.page')].filter(s => !s.hidden);
      const sec = vis[0];
      return {
        visible: vis.length,
        id: sec ? sec.id : null,
        kpis: sec ? sec.querySelectorAll('.kpi').length : 0,
        charts: sec ? [...sec.querySelectorAll('canvas')].filter(c => c.style.display !== 'none').length : 0,
        empties: sec ? sec.querySelectorAll('.empty').length : 0,
        rows: sec ? sec.querySelectorAll('tbody tr').length : 0,
        title: document.getElementById('pageTitle').textContent
      };
    });
    console.log(`${p.padEnd(13)} vis=${r.visible} ${String(r.id).padEnd(16)} kpi=${String(r.kpis).padEnd(2)} charts=${r.charts} rows=${String(r.rows).padEnd(3)} empty=${r.empties}  "${r.title}"`);
  }

  console.log('\n=== TOP PERFORMER ===');
  await page.click('.nav-btn[data-page="overview"]'); await page.waitForTimeout(300);
  console.log((await page.textContent('#topPerformer')).replace(/\s+/g,' ').trim().slice(0,160));

  console.log('\n=== FILTERS RECALCULATE ===');
  const kpiOf = async () => (await page.textContent('#ovKpis')).replace(/\s+/g,' ').trim().slice(0,120);
  const before = await kpiOf();
  const agents = await page.evaluate(() => [...document.querySelectorAll('#fAgent option')].map(o=>o.value));
  await page.selectOption('#fAgent', agents[2]); await page.waitForTimeout(500);
  const afterA = await kpiOf();
  console.log('agent filter changed KPIs:', before !== afterA, '->', agents[2]);
  const weeks = await page.evaluate(() => [...document.querySelectorAll('#fWeek option')].map(o=>o.value));
  await page.selectOption('#fWeek', weeks[1]); await page.waitForTimeout(500);
  console.log('week filter changed KPIs:', afterA !== (await kpiOf()), '->', weeks[1]);
  await page.click('#btnReset'); await page.waitForTimeout(500);
  console.log('reset restored:', (await kpiOf()) === before);

  console.log('\n=== SORT / SEARCH / PAGINATE ===');
  await page.click('.nav-btn[data-page="qa"]'); await page.waitForTimeout(500);
  const r1 = await page.evaluate(() => document.querySelector('#qaTable tbody tr').textContent.trim().slice(0,40));
  await page.click('#qaTable thead th:nth-child(4)'); await page.waitForTimeout(300);
  const r2 = await page.evaluate(() => document.querySelector('#qaTable tbody tr').textContent.trim().slice(0,40));
  console.log('sort changed first row:', r1 !== r2);
  await page.fill('#qaSearch', 'Godwin'); await page.waitForTimeout(400);
  console.log('search filtered:', await page.evaluate(() => {
    const t=[...document.querySelectorAll('#qaTable tbody tr')];
    return t.length + ' rows, all Godwin=' + t.every(r=>/Godwin/.test(r.textContent));
  }));
  await page.fill('#qaSearch', '');
  await page.waitForTimeout(300);
  console.log('pager:', (await page.textContent('#qaPager')).replace(/\s+/g,' ').trim());

  console.log('\n=== OT/BREAK TABS ===');
  await page.click('.nav-btn[data-page="otbreak"]'); await page.waitForTimeout(400);
  console.log('ot rows:', await page.evaluate(()=>document.querySelectorAll('#otTable tbody tr').length));
  await page.click('#obTabs .tab[data-tab="brk"]'); await page.waitForTimeout(400);
  console.log('break visible:', await page.evaluate(()=>!document.getElementById('obBrk').hidden),
              'rows:', await page.evaluate(()=>document.querySelectorAll('#bkTable tbody tr').length));

  console.log('\n=== RESPONSIVE (no horizontal overflow) ===');
  for (const w of VPS) {
    await page.setViewportSize({ width: w, height: 900 });
    let bad = [];
    for (const p of PAGES) {
      await page.click(`.nav-btn[data-page="${p}"]`, { force: true }).catch(()=>{});
      await page.waitForTimeout(220);
      const o = await page.evaluate(vw => {
        const res = { scroll: document.documentElement.scrollWidth, wide: [] };
        document.querySelectorAll('.page:not([hidden]) *').forEach(e => {
          if (e.closest('.tscroll,.chartbox,.scroll') || e.tagName==='CANVAS' || e.tagName==='TABLE') return;
          if (e.getBoundingClientRect().width > vw + 1) res.wide.push(e.tagName+'.'+(e.className||'').toString().slice(0,22));
        });
        return res;
      }, w);
      if (o.scroll > w + 1 || o.wide.length) bad.push(`${p}(sw=${o.scroll}${o.wide.length?' wide:'+o.wide.slice(0,2):''})`);
    }
    console.log(`${String(w).padStart(4)}px : ${bad.length ? 'OVERFLOW ' + bad.join(', ') : 'clean'}`);
  }

  console.log('\n=== SECURITY SCAN ===');
  const files = fs.readdirSync(DIR).filter(f=>/\.(js|html|css|json)$/.test(f));
  let leaks = 0;
  for (const f of files) {
    const t = fs.readFileSync(path.join(DIR,f),'utf8');
    for (const [lbl,re] of [['SheetID',/1AkFiHvDwf6IzTvGfYvrsaxLU6ae3Xv1pLz0qlUeOi48|1rLP2iXwK_0bjEOXt2_rH9brqcXecdrkVupVk2U1-5L8/],
                            ['GH token',/gh[pous]_[A-Za-z0-9]{20,}/],['Google key',/AIza[0-9A-Za-z_-]{30,}/],
                            ['private_key',/private_key/],['service_account',/service_account/]]) {
      if (re.test(t)) { console.log('  LEAK', lbl, 'in', f); leaks++; }
    }
  }
  console.log(leaks ? `  ${leaks} leak(s)` : '  clean - no sheet IDs, tokens, or credentials in frontend files');

  console.log('\n=== ERRORS ===');
  console.log(errs.length ? errs.slice(0,12).join('\n') : 'none');
  await browser.close();
})();
