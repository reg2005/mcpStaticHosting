// Run with a temporary Playwright package; no browser dependency is added to the app.
const { dirname } = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: process.env.PATH.split(':').map(dirname) }));
const assert = require('node:assert/strict');
(async () => {
  const browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP example.test 127.0.0.1','--no-proxy-server']});
  try {
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    const page=await context.newPage();
    const origin='https://example.test:28443';
    assert.ok(process.env.BROWSER_PATH?.startsWith('/sites/'));
    await page.goto(origin+process.env.BROWSER_PATH);
    await page.waitForFunction(()=>document.body.dataset.script==='ran');
    await page.waitForFunction(()=>document.body.dataset.module==='ran');
    assert.ok((await page.evaluate(()=>fetch('./assets/style.css').then(r=>r.text()))).includes('rgb(12, 34, 56)'));
    assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).color),'rgb(12, 34, 56)');
    const boundaries=await page.evaluate(async()=>{
      const out={};
      try {void document.cookie;out.cookies=false;}catch{out.cookies=true;}
      try {void localStorage.length;out.storage=false;}catch{out.storage=true;}
      try {await fetch('/api/auth/get-session').then(r=>r.text());out.management=false;}catch{out.management=true;}
      try {await navigator.serviceWorker.register('worker.js');out.worker=false;}catch{out.worker=true;}
      return out;
    });
    assert.deepEqual(boundaries,{cookies:true,storage:true,management:true,worker:true});
    await page.getByRole('link',{name:'About'}).click();
    await page.getByRole('heading',{name:'path about page'}).waitFor();
    console.log('PASS Chromium: relative CSS and links, scripts, opaque-origin management/storage/cookie/service-worker isolation');
    assert.ok(process.env.BROWSER_LOCKED_PATH?.startsWith('/sites/'));
    await page.goto(origin+process.env.BROWSER_LOCKED_PATH);
    await page.locator('input[name=password]').fill('test-only-site-password');
    await page.getByRole('button',{name:'Unlock',exact:true}).click();
    await page.getByRole('heading',{name:'locked browser test'}).waitFor();
    assert.equal(await page.locator('h1').evaluate(el=>getComputedStyle(el).color),'rgb(12, 34, 56)');
    console.log('PASS Chromium: password form navigation and protected CSS load in the sandbox');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
