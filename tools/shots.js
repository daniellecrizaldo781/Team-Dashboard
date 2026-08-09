const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DIR = 'C:/Users/Danielle/qa-dashboard';
(async () => {
  const b = await chromium.launch();
  const mock = fs.readFileSync(path.join(DIR,'mock-api.json'),'utf8');
  for (const [name, w, h, pg] of [['desktop-overview',1440,1000,'overview'],
                                  ['desktop-qa',1440,1000,'qa'],
                                  ['desktop-scorecards',1440,1000,'scorecards'],
                                  ['desktop-schedule',1440,1000,'schedule'],
                                  ['mobile-overview',390,860,'overview'],
                                  ['mobile-leave',390,860,'leave']]) {
    const c = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:1 });
    const p = await c.newPage();
    await p.route('**/macros/s/**', r=>r.fulfill({status:200,contentType:'application/json',body:mock}));
    await p.route('**/config.js*', r=>r.fulfill({status:200,contentType:'application/javascript',
      body:"window.API_URL='https://script.google.com/macros/s/MOCK/exec';window.REFRESH_MINUTES=5;"}));
    await p.goto('file:///'+DIR+'/index.html');
    await p.waitForTimeout(2200);
    await p.click(`.nav-btn[data-page="${pg}"]`, {force:true});
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${DIR}/shots/${name}.png`, fullPage:false });
    await c.close();
    console.log('shot', name);
  }
  await b.close();
})();
