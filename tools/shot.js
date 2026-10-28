const { chromium } = require('playwright');
(async () => {
  const [,, url, out, mode, waitMs] = process.argv;
  const browser = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const ctx = mode === 'phone'
    ? await browser.newContext({viewport:{width:390,height:844}, deviceScaleFactor:3, isMobile:true, hasTouch:true})
    : await browser.newContext({viewport:{width:1440,height:900}, deviceScaleFactor:1});
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text()); });
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto(url, {waitUntil:'load'});
  await page.evaluate(() => { const j = document.querySelector('.journey') || document.getElementById('world'); j && j.scrollIntoView(); });
  await page.waitForTimeout(parseInt(waitMs||'9000'));
  await page.screenshot({path: out, timeout: 180000, animations:'allow'});
  const info = await page.evaluate(() => { const c=document.getElementById('world'); return {w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight,dpr:devicePixelRatio}; });
  console.log(out, JSON.stringify(info));
  await browser.close();
})();
