const { chromium } = require('playwright');
const DIR = 'C:/Users/Danielle/qa-dashboard';
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });

  // NOTE: no route mocking - this is exactly what Danielle sees today
  await p.goto('file:///' + DIR + '/index.html');
  await p.waitForTimeout(3000);

  console.log('banner visible:', await p.evaluate(() => !document.getElementById('banner').hidden));
  console.log('banner text   :', (await p.textContent('#banner')).replace(/\s+/g, ' ').trim());
  console.log('sync text     :', (await p.textContent('#syncText')).replace(/\s+/g, ' ').trim());
  console.log('loader stuck  :', await p.evaluate(() => !document.getElementById('loader').hidden));
  console.log('overview KPIs :', await p.evaluate(() => document.querySelectorAll('#ovKpis .kpi').length));
  console.log('nav clickable :', await p.evaluate(async () => {
    document.querySelector('.nav-btn[data-page="qa"]').click();
    return document.getElementById('pageQa').hidden === false;
  }));
  console.log('errors        :', errs.length ? errs.join(' | ') : 'none');
  await b.close();
})();
