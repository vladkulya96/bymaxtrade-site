const { chromium } = require('playwright');
(async () => {
  const [,, url, out, mode] = process.argv;
  const browser = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const ctx = mode === 'phone'
    ? await browser.newContext({viewport:{width:390,height:844}, deviceScaleFactor:3, isMobile:true, hasTouch:true})
    : mode === 'phone2' ? await browser.newContext({viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true})
    : mode === 'desk15' ? await browser.newContext({viewport:{width:1440,height:900}, deviceScaleFactor:1.5}) : await browser.newContext({viewport:{width:1440,height:900}, deviceScaleFactor:1});
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto(url, {waitUntil:'load'});
  await page.waitForFunction(() => window.__snap === 1, null, {timeout: 240000, polling: 1000});
  await page.addStyleTag({content:'.jp,#jCart,#jRail,header,.site-header{visibility:hidden!important}'});
  await page.screenshot({path: out, timeout: 60000});
  const info = await page.evaluate(() => { const c=document.getElementById('world'); return {w:c.width,h:c.height,dpr:devicePixelRatio}; });
  console.log(out, JSON.stringify(info));
  await browser.close();
})();
