const { chromium } = require('playwright');
(async () => { const browser = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for (const f of process.argv.slice(2)) { const page = await (await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true})).newPage();
  const errs=[]; page.on('pageerror', e=>errs.push(e.message)); page.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
  await page.goto('file://'+f,{timeout:120000}); await page.waitForTimeout(20000);
  const r = await page.evaluate(()=>{ const c=document.getElementById('world'); return c? c.width+'x'+c.height : 'no canvas'; });
  console.log(f.split('/').pop(), r, errs.length? errs.slice(0,3).join(' | ') : 'no errors'); await page.close(); }
 await browser.close(); })();
