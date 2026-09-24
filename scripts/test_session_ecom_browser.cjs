/* Focused regression: an iframe RPC may finish before dashboard-ready. */
const {chromium}=require(process.env.MR_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict');
const createTransport=require('./session_test_transport.cjs');
const base=process.env.MR_TEST_URL||'http://127.0.0.1:8091';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.MR_BROWSER||undefined,args:['--enable-unsafe-swiftshader']});
  try {
    const transport=createTransport();
    const desktop=await browser.newContext();await transport(desktop);
    const host=await desktop.newPage();await host.goto(base+'/index.html');await host.locator('#start-overlay').click();
    await host.waitForFunction(()=>window.MR_SESSION&&window.map.loaded());
    const invitation=await host.evaluate(()=>new Promise(resolve=>{
      const channel=new BroadcastChannel('mr_session_admin');
      const timer=setInterval(()=>channel.postMessage({type:'admin-request'}),100);
      channel.onmessage=({data})=>{if(data.invite){clearInterval(timer);channel.close();resolve(data.invite);}};
    }));
    const context=await browser.newContext({viewport:{width:390,height:844}});await transport(context);
    const phone=await context.newPage();
    await phone.addInitScript(()=>window.addEventListener('message',e=>{if(e.data?.type==='dashboard-ready')window.__dashboardReady=true;}));
    let releaseScripts;
    const scriptsHeld=new Promise(resolve=>releaseScripts=resolve);
    await context.route('**/controller.js*',async route=>{await scriptsHeld;await route.continue();});
    await host.route('**/api/services/ecom/api/health',route=>route.fulfill({json:{status:'ok'}}));
    await phone.goto(base+'/session/client.html'+new URL(invitation).search);
    await phone.locator('#profile[open]').waitFor();await phone.locator('#slots button').first().click();
    await phone.locator('#profile').waitFor({state:'hidden'});
    await phone.locator('[data-layer="ecom-energy-btn"] .open').click();
    await phone.waitForFunction(()=>document.getElementById('dashboard').contentWindow.MR_REMOTE_FETCH);
    assert.equal(await phone.evaluate(()=>!!window.__dashboardReady),false);
    const response=await phone.locator('#dashboard').evaluate(async iframe=>{
      const response=await Promise.race([
        iframe.contentWindow.fetch('/api/services/ecom/api/health'),
        new Promise((_,reject)=>setTimeout(()=>reject(Error('Early iframe RPC was lost')),10000))
      ]);
      return {status:response.status,body:await response.json()};
    });
    assert.equal(response.status,200);assert.equal(response.body.status,'ok');
    releaseScripts();
    await phone.waitForFunction(()=>window.__dashboardReady);
    await phone.locator('#apps').click();
    assert.equal(await phone.locator('#dashboard').getAttribute('src'),null);
    console.log('PASS: ECOM response delivered before dashboard-ready and editor unloads cleanly');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
