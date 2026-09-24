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
  const invitation=new URL(summary.invite);const url=(process.env.MR_CLIENT_URL||base+'/session/client.html')+invitation.search;
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),phone=await mobile.newPage();
  if(memoryTransport)await memoryTransport(mobile);
  await phone.addInitScript(trackPeers);
  await phone.addInitScript(()=>{let api;Object.defineProperty(window,'MR_MAP',{get:()=>api,set(value){api=value;const Original=value.CompanionMap;value.CompanionMap=class extends Original{constructor(options){super(options);window.__companionMap=this;}};},configurable:true});});
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
  await phone.locator('#phone-controls').waitFor();
  await phone.screenshot({path:'.runtime/phone-controls.png'});
  await phone.getByRole('button',{name:'Map',exact:true}).click();
  await phone.locator('#phone-map canvas.maplibregl-canvas').waitFor();
  await phone.waitForTimeout(1800);
  const box=await phone.locator('#phone-map').boundingBox();await phone.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
  await page.waitForFunction(()=>window.isovistSession.getState().position!==null);
  const touch=await mobile.newCDPSession(phone);
  const beforeDrag=await phone.evaluate(()=>({scroll:scrollY,zoom:__companionMap.map.getZoom(),center:__companionMap.map.getCenter().toArray()}));
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
  for(let y=0;y<80;y+=10)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2+y}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await phone.evaluate(()=>scrollY),beforeDrag.scroll,'Isovist dragging must not scroll the page');
  assert.equal(await phone.evaluate(()=>__companionMap.map.getZoom()),beforeDrag.zoom);
  assert.deepEqual(await phone.evaluate(()=>__companionMap.map.getCenter().toArray()),beforeDrag.center,'A single finger changes input, not the map camera');
  const viewerBeforePinch=await page.evaluate(()=>isovistSession.getState().position);
  const pair=[{x:box.x+box.width*.4,y:box.y+box.height*.5},{x:box.x+box.width*.6,y:box.y+box.height*.5}];
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pair});
  for(let step=1;step<=5;step++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...pair[0],x:pair[0].x-step*7},{...pair[1],x:pair[1].x+step*7}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await phone.waitForTimeout(200);
  assert.ok(await phone.evaluate(()=>__companionMap.map.getZoom())>beforeDrag.zoom,'Two-finger pinch zooms');
  assert.deepEqual(await page.evaluate(()=>isovistSession.getState().position),viewerBeforePinch,'Pinch never places or drags a viewpoint');
  await phone.locator('#fit').click();
  await phone.screenshot({path:'.runtime/phone-map.png'});
  await phone.getByRole('button',{name:'Open apps'}).click();
  await phone.locator('[data-layer="canvas-btn"] input').check();await phone.locator('[data-layer="canvas-btn"] .open').click();
  await phone.locator('#tool').selectOption('marker');
  await phone.waitForFunction(()=>document.getElementById('layer-enabled').checked);
  const canvasBox=await phone.locator('#phone-map').boundingBox();
  await phone.touchscreen.tap(canvasBox.x+canvasBox.width*.5,canvasBox.y+canvasBox.height*.5);
  await page.waitForFunction(()=>window.MR_SESSION.getObjects().length===1);
  await phone.locator('#undo').click();await page.waitForFunction(()=>window.MR_SESSION.getObjects().length===0);
  await phone.locator('#redo').click();await page.waitForFunction(()=>window.MR_SESSION.getObjects().length===1);
  if(memoryTransport){
    const slotBefore=await page.evaluate(()=>MR_SESSION.getState().slots[0]);
    await phone.evaluate(()=>Object.values(window.__peers[0].connections).flat()[0].close());
    await phone.waitForFunction(()=>document.getElementById('connection').textContent==='Reconnecting…');
    await phone.waitForFunction(()=>document.getElementById('connection').textContent.includes('Controller 1'));
    assert.equal(await page.evaluate(()=>MR_SESSION.getState().slots[0]),slotBefore,'Reconnect retains the editing slot');
    assert.equal(await phone.locator('#notice').isVisible(),false,'Reconnect does not leave a stale host-unavailable banner');
  }
  await phone.reload();await phone.waitForFunction(()=>document.getElementById('connection').textContent.includes('Controller 1'));
  await phone.screenshot({path:'.runtime/phone-drawer.png'});
  const adminPage=await desktop.newPage();await adminPage.goto(base+'/controller.html#session');
  await adminPage.locator('#mr-session-page iframe').waitFor();
  const admin=adminPage.frameLocator('#mr-session-page iframe');await admin.locator('#qr img').waitFor();await adminPage.screenshot({path:'.runtime/admin.png'});
  assert.equal(desktop.pages().length,2,'Session stays inside the controller');
  const qrBounds=await page.locator('.mr-qr-banner').evaluateAll(nodes=>nodes.filter(n=>!n.hidden).map(n=>{const r=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right;}));
  assert.ok(qrBounds.every(Boolean),'QR banners must fit inside the sidebars');
  const send=async(target,message)=>target.evaluate(message=>Object.values(window.__peers[0].connections).flat()[0].send(message),{actionId:crypto.randomUUID(),...message});
  const additional=[];
  for(let slot=2;slot<=5;slot++){
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});if(memoryTransport)await memoryTransport(context);
    const guest=await context.newPage();await guest.addInitScript(trackPeers);guest.on('pageerror',e=>errors.push(e.message));await guest.goto(url,{waitUntil:'domcontentloaded'});
    await guest.waitForFunction(()=>document.getElementById('connection').textContent.includes('Spectator'));
    if(slot<=4){await guest.locator('#choose-slot').click();await guest.locator('#slots button').nth(slot-1).click();await guest.waitForFunction(slot=>document.getElementById('connection').textContent.includes('Controller '+slot),slot);await guest.getByRole('button',{name:'Close profile',exact:true}).click();}
    additional.push({context,page:guest});
  }
  console.log('PASS: four editors and a fifth spectator');
  const objectId=await page.evaluate(()=>MR_SESSION.getObjects()[0].id);
  await send(additional[0].page,{type:'canvas',operation:'delete',objectId});
  await additional[0].page.getByText('Only the author or host can edit this annotation',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>MR_SESSION.getObjects().length),1);
  await send(additional[3].page,{type:'layer',layer:'canvas-btn',enabled:false});
  await additional[3].page.getByText('Choose an editing slot first',{exact:true}).waitFor();
  await send(phone,{type:'control',message:{type:'calibrate_action',action:'pan_up'}});
  await phone.getByText('Control is not available remotely',{exact:true}).waitFor();
  console.log('PASS: ownership, spectators and calibration boundary');
  await phone.locator('[data-layer="isovist-btn"] .open').click();
  await phone.locator('#isovist-radius').evaluate(input=>{input.value='250';input.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(()=>window.isovistSession.getState().radius===250);
  await additional[0].page.locator('[data-layer="isovist-btn"] .open').click();
  await additional[0].page.locator('#isovist-radius').waitFor();
  await additional[0].page.waitForFunction(()=>document.getElementById('isovist-radius')?.value==='250');
  console.log('PASS: authoritative compact controls');
  await phone.getByRole('button',{name:'Open apps'}).click();
  await phone.locator('[data-layer="cfd-simulation-btn"] input').check();await phone.locator('[data-layer="cfd-simulation-btn"] .open').click();
  await phone.getByRole('button',{name:'Map',exact:true}).click();await phone.locator('#tool').selectOption('obstacle');
  await page.waitForFunction(()=>window.cfdSession.getState().active);
  const windBox=await phone.locator('#phone-map').boundingBox();
  const windZoom=await phone.evaluate(()=>__companionMap.map.getZoom());
  for(const[x,y]of [[.44,.45],[.56,.45],[.56,.57]]){
    await phone.touchscreen.tap(windBox.x+windBox.width*x,windBox.y+windBox.height*y);
    assert.ok(await phone.locator('#phone-map .mr-map-overlay g circle').count()>0,'Show polygon corners before saving');
  }
  await phone.waitForTimeout(400);
  assert.equal(await phone.evaluate(()=>__companionMap.map.getZoom()),windZoom,'Drawing must not trigger double-tap zoom');
  await phone.screenshot({path:'.runtime/phone-wind-preview.png'});
  // A two-finger pan must preserve the unfinished shape and not add a corner.
  const beforePan=await phone.evaluate(()=>__companionMap.map.getCenter().toArray());
  const pinchPoints=[{x:windBox.x+windBox.width*.35,y:windBox.y+windBox.height*.5},{x:windBox.x+windBox.width*.65,y:windBox.y+windBox.height*.5}];
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pinchPoints});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:pinchPoints.map(p=>({...p,y:p.y+25}))});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await phone.evaluate(()=>__companionMap.polygon?.points.length),3,'Two-finger navigation preserves the draft');
  await phone.waitForTimeout(100);
  assert.notDeepEqual(await phone.evaluate(()=>__companionMap.map.getCenter().toArray()),beforePan,'Two fingers pan the map while drawing');
  await phone.locator('#finish').click();await page.waitForFunction(()=>window.MR_CFD_OBSTACLES?.length===1);
  await phone.waitForFunction(()=>__companionMap.objects.some(o=>o.tool==='obstacle'));
  assert.deepEqual(await phone.evaluate(()=>Object.keys(__companionMap.map.getStyle().sources)),['base'],'Phone map has only a basemap');
  if(memoryTransport){
    const start=memoryTransport.stats.length;await phone.waitForTimeout(5000);
    const transfers=memoryTransport.stats.slice(start).filter(s=>s.from===page.url());
    const bytes=transfers.reduce((sum,s)=>sum+s.bytes,0);
    console.log('CFD running: '+bytes+' bytes host-to-phones in 5 seconds, across five participants');
    assert.ok(bytes<12000,'Idle CFD must not stream results or repeated full snapshots');
    assert.equal(memoryTransport.stats.some(s=>['base','map','drafts'].includes(s.type)),false,'No map results, footprints or draft echoes');
  }
  await phone.screenshot({path:'.runtime/phone-wind.png'});
  await send(phone,{type:'layer',layer:'cfd-simulation-btn',enabled:false});
  console.log('PASS: additive CFD obstacle drawing');
  // The host consumes a bulky service result; the phone receives only its receipt.
  await page.route('**/api/services/ecom/api/mr/layer',route=>route.fulfill({json:{meta:{hours:[12]},testResult:'RESULT'.repeat(100000)}}));
  await page.evaluate(()=>{window.__originalControl=MR_ADAPTER.control;MR_ADAPTER.control=message=>{if(message.layer?.testResult)window.__hostServiceResult=message;else window.__originalControl(message);};});
  const receipt=await phone.evaluate(()=>new Promise(resolve=>{
    const channel=Object.values(window.__peers[0].connections).flat()[0],requestId='result-offload-test';
    const listener=message=>{if(message.requestId===requestId){channel.off('data',listener);resolve(message);}};
    channel.on('data',listener);channel.send({type:'rpc',requestId,method:'POST',path:'/api/services/ecom/api/mr/layer'});
  }));
  assert.equal(receipt.type,'rpc-result');assert.ok(JSON.stringify(receipt).length<500);
  assert.deepEqual(JSON.parse(Buffer.from(receipt.body,'base64').toString()),{appliedOnHost:true,hours:[12]});
  assert.equal(await page.evaluate(()=>__hostServiceResult.layer.testResult.length),600000);
  await page.evaluate(()=>MR_ADAPTER.control=window.__originalControl);
  await page.unroute('**/api/services/ecom/api/mr/layer');
  console.log('PASS: service results stay on the host; phone receives a small receipt');
  await admin.getByRole('button',{name:'Pause editing',exact:true}).click();
  await phone.waitForFunction(()=>document.getElementById('connection').textContent.includes('paused'));
  await send(phone,{type:'canvas',operation:'delete',objectId});await phone.getByText('Host paused remote editing',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>MR_SESSION.getObjects().length),2);
  await admin.getByRole('button',{name:'Resume editing',exact:true}).click();
  const slot3=await page.evaluate(()=>MR_SESSION.getState().slots[2]);
  await page.evaluate(id=>{const c=new BroadcastChannel('mr_session_admin');c.postMessage({type:'admin-command',action:'release',personId:id});c.close();},slot3);
  await additional[3].page.locator('#choose-slot').click();await additional[3].page.locator('#slots button').nth(2).click();await additional[3].page.waitForFunction(()=>document.getElementById('connection').textContent.includes('Controller 3'));
  const sessionId=await page.evaluate(()=>MR_SESSION.getState().sessionId);await adminPage.close();
  const reopened=await desktop.newPage();await reopened.goto(base+'/controller.html#session');await reopened.frameLocator('#mr-session-page iframe').locator('#qr img').waitFor();
  assert.equal(await page.evaluate(()=>MR_SESSION.getState().sessionId),sessionId);
  await page.waitForTimeout(500);const log=await(await page.request.get(base+'/api/session/'+sessionId)).json();
  assert.equal(log.schemaVersion,2);assert.equal(log.finalState.objects.length,2);assert.ok(log.events.some(e=>e.kind==='slot.released'));
  console.log('PASS: pause, release/reclaim, controller Session page and durable log');
  // Select an actual EPC footprint through the mobile location tool.
  await phone.getByRole('button',{name:'Open apps'}).click();
  await phone.locator('[data-layer="epc-btn"] input').check();await phone.locator('[data-layer="epc-btn"] .open').click();
  await phone.getByRole('button',{name:'Map',exact:true}).click();
  await page.waitForFunction(()=>MR_ADAPTER.active['epc-btn']&&map.getSource('epc-buildings'));
  const epcPoint=await page.evaluate(()=>{
    const t=MR_ADAPTER.table();
    for(const f of map.getSource('epc-buildings')._data.features){const ring=f.geometry.type==='Polygon'?f.geometry.coordinates[0]:f.geometry.coordinates[0][0];
      const c=ring.slice(0,-1).reduce((a,p)=>[a[0]+p[0]/(ring.length-1),a[1]+p[1]/(ring.length-1)],[0,0]),p=MR_MAP.normalized(c,t);
      if(p.x>.2&&p.x<.8&&p.y>.2&&p.y<.8&&map.queryRenderedFeatures(map.project(c),{layers:['epc-buildings-fill']}).length)return c;
    }throw Error('No EPC building inside table');
  });
  const epcTap=await phone.evaluate(c=>{const p=__companionMap.map.project(c),r=document.getElementById('phone-map').getBoundingClientRect();return{x:r.left+p.x,y:r.top+p.y};},epcPoint);
  await phone.touchscreen.tap(epcTap.x,epcTap.y);
  await page.waitForFunction(()=>map.getSource('epc-selected')._data.features.length===1);
  await phone.getByRole('button',{name:'Controls',exact:true}).click();
  assert.equal(await phone.locator('#dashboard').getAttribute('src'),null,'EPC results stay on the host');
  await phone.screenshot({path:'.runtime/phone-epc-selection.png'});
  // Each of Canvas, wind and comfort independently suppresses Street Life.
  for(const id of ['isovist-btn','canvas-btn','epc-btn'])await send(phone,{type:'layer',layer:id,enabled:false});
  for(const id of ['canvas-btn','cfd-simulation-btn','thermal-comfort-btn']){
    await send(phone,{type:'layer',layer:id,enabled:true});
    await page.waitForFunction(id=>MR_ADAPTER.active[id],id);await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>streetLifeAnimation.isActive()),false,id+' suppresses Street Life');
    if(id==='canvas-btn')assert.equal(await page.evaluate(()=>getBasemap()),'osmLight');
    await send(phone,{type:'layer',layer:id,enabled:false});await page.waitForFunction(id=>!MR_ADAPTER.active[id],id);
  }
  console.log('PASS: polygon previews, touch scrolling/zoom, EPC location, light Canvas and Street Life');
  await phone.getByRole('button',{name:'Open apps'}).click();
  for(const id of ['cfd-simulation-btn','stormwater-btn','sun-study-btn','thermal-comfort-btn','isovist-btn','street-view-btn','epc-btn','ecom-energy-btn','bird-sounds-btn','slideshow-btn','campus-demo-btn','fcc-demo-btn','grid-animation-btn']){
    await phone.locator('[data-layer="'+id+'"] .open').click();
    if(id==='ecom-energy-btn')await phone.frameLocator('#dashboard').locator('#metadata-section').waitFor();
    else await phone.locator('#phone-controls').waitFor();
    await phone.waitForTimeout(200);
    if(id==='ecom-energy-btn'){
      const response=await phone.locator('#dashboard').evaluate(async iframe=>{const response=await iframe.contentWindow.fetch('/api/services/ecom/api/health');return {status:response.status,body:await response.json()};});
      assert.equal(response.status,200);assert.equal(response.body.status,'ok');
    }
    await phone.screenshot({path:'.runtime/panel-'+id+'.png'});
    if(id==='sun-study-btn'){
      const sun=phone;await phone.locator('#phone-controls details').evaluate(el=>el.open=true);
      for(const width of [320,390]){
        await phone.setViewportSize({width,height:844});
        for(const selector of ['#sun-date','#sun-time','#shadow-opacity','#sun-speed','#sun-animate-btn','#false-color-btn','#toggle-trees-btn']){
          assert.ok(await sun.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),selector+' fits at '+width);
        }
      }
      await phone.screenshot({path:'.runtime/panel-sun-study-btn.png'});
    }
    assert.equal(await phone.locator('[data-target="calibrate-btn"]').count(),0);
    await phone.getByRole('button',{name:'Open apps'}).click();
  }
  console.log('PASS: all 13 dashboard panels and calibration UI exclusion');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: join, slot claim, layer control, Isovist tap, Canvas create/undo/redo, reload identity, admin QR');
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
