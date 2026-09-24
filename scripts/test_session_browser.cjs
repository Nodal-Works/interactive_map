/* Run with MR_PLAYWRIGHT pointing to a Playwright installation if it is not in node_modules. */
const {chromium}=require(process.env.MR_PLAYWRIGHT || 'playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const base=process.env.MR_TEST_URL || 'http://127.0.0.1:8091';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.MR_BROWSER || undefined,args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--disable-features=WebRtcHideLocalIpsWithMdns']});
  const desktop=await browser.newContext({viewport:{width:1440,height:900}}), page=await desktop.newPage();
  const memoryTransport=process.env.MR_TEST_TRANSPORT==='memory'?require('./session_test_transport.cjs')():null;
  if(memoryTransport)await memoryTransport(desktop);
  function trackPeers(){let constructor;window.__peers=[];Object.defineProperty(window,'Peer',{get(){return constructor;},set(value){constructor=new Proxy(value,{construct(target,args){const peer=Reflect.construct(target,args);window.__peers.push(peer);return peer;}});},configurable:true});}
  await page.addInitScript(trackPeers);
  const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.log('HOST ERROR',error.message);});
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  await page.locator('#start-overlay').click();
  await page.waitForFunction(()=>window.MR_SESSION && window.MR_ADAPTER && window.map.loaded(),{timeout:60000});
  const summary=await page.evaluate(()=>new Promise(resolve=>{const channel=new BroadcastChannel('mr_session_admin');const timer=setInterval(()=>channel.postMessage({type:'admin-request'}),500);const timeout=setTimeout(()=>{clearInterval(timer);channel.close();resolve(null);},25000);channel.onmessage=({data})=>{if(data.type==='admin-state'&&data.invite){clearInterval(timer);clearTimeout(timeout);channel.close();resolve(data);}};}));
  console.log('Host session',summary?{peerStatus:summary.peerStatus,saveStatus:summary.saveStatus,services:summary.services}:'NO INVITATION');
  await page.screenshot({path:'.runtime/host.png'});
  if(!summary)throw Error('Host did not create an invitation');
  const invitation=new URL(summary.invite);const url=base+'/session/client.html'+invitation.search;
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),phone=await mobile.newPage();
  if(memoryTransport)await memoryTransport(mobile);
  await phone.addInitScript(trackPeers);
  phone.on('pageerror',error=>{errors.push(error.message);console.log('PHONE ERROR',error.message);});
  phone.on('console',message=>{if(['warning','error'].includes(message.type()))console.log('PHONE CONSOLE',message.text().slice(0,300));});
  await phone.goto(url,{waitUntil:'domcontentloaded'});
  await phone.screenshot({path:'.runtime/phone-connect.png'});
  console.log('Phone loaded',await phone.locator('#connection').textContent());
  try {await phone.waitForFunction(()=>document.getElementById('connection').textContent.includes('Spectator'),null,{timeout:30000});}
  catch(error){
    const diagnostics=async()=>Promise.all(window.__peers.map(async p=>({open:p.open,disconnected:p.disconnected,connections:await Promise.all(Object.values(p.connections).flat().map(async c=>({open:c.open,ice:c.peerConnection?.iceConnectionState,connection:c.peerConnection?.connectionState,stats:c.peerConnection?[...await c.peerConnection.getStats()].map(([,v])=>v).filter(v=>['local-candidate','remote-candidate','candidate-pair'].includes(v.type)).map(v=>({type:v.type,state:v.state,candidateType:v.candidateType,protocol:v.protocol,requestsSent:v.requestsSent,responsesReceived:v.responsesReceived})):[]})))})));
    console.log('HOST PEERS',JSON.stringify(await page.evaluate(diagnostics)));console.log('PHONE PEERS',JSON.stringify(await phone.evaluate(diagnostics)));console.log('PHONE STATE',await phone.locator('body').innerText());await phone.screenshot({path:'.runtime/phone-failed.png'});await browser.close();throw error;}
  await phone.getByRole('button',{name:'Choose a controller slot',exact:true}).click();
  await phone.locator('#slots button').first().click();
  await phone.waitForFunction(()=>document.getElementById('connection').textContent.includes('Controller 1'));
  await phone.getByRole('button',{name:'Close profile',exact:true}).click();
  await phone.locator('[data-layer="isovist-btn"] input').check();
  await page.waitForFunction(()=>window.MR_ADAPTER.active['isovist-btn']);
  await phone.locator('[data-layer="isovist-btn"] .open').click();
  await phone.frameLocator('#dashboard').locator('#dashboard-content').waitFor();
  await phone.screenshot({path:'.runtime/phone-controls.png'});
  await phone.getByRole('button',{name:'Map',exact:true}).click();
  await phone.locator('#phone-map canvas.maplibregl-canvas').waitFor();
  await phone.waitForTimeout(1800);
  const box=await phone.locator('#phone-map').boundingBox();await phone.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
  await page.waitForFunction(()=>window.isovistSession.getState().position!==null);
  await phone.screenshot({path:'.runtime/phone-map.png'});
  await phone.getByRole('button',{name:'Open apps'}).click();
  await phone.locator('[data-layer="canvas-btn"] input').check();await phone.locator('[data-layer="canvas-btn"] .open').click();
  await phone.getByRole('button',{name:'Open drawing tools'}).click();await phone.locator('#tool').selectOption('marker');
  await phone.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.5);
  await page.waitForFunction(()=>window.MR_SESSION.getObjects().length===1);
  await phone.locator('#undo').click();await page.waitForFunction(()=>window.MR_SESSION.getObjects().length===0);
  await phone.locator('#redo').click();await page.waitForFunction(()=>window.MR_SESSION.getObjects().length===1);
  await phone.reload();await phone.waitForFunction(()=>document.getElementById('connection').textContent.includes('Controller 1'));
  await phone.screenshot({path:'.runtime/phone-drawer.png'});
  const admin=await desktop.newPage();await admin.goto(base+'/session/');await admin.locator('#qr img').waitFor();await admin.screenshot({path:'.runtime/admin.png'});
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: join, slot claim, layer control, Isovist tap, Canvas create/undo/redo, reload identity, admin QR');
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
