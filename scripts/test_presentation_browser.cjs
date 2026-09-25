/* Deterministic map-layer integration. --live also checks configured WMS imagery. */
const {chromium}=require(process.env.MR_PLAYWRIGHT || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.MR_TEST_URL || 'http://127.0.0.1:8093';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.MR_BROWSER || undefined,args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error' && /layers\.slideshow/.test(message.text()))errors.push(message.text());});
  if(!process.argv.includes('--live')) {
   const config=JSON.parse(fs.readFileSync('media/slideshow/slideshow-config.json'));
   config.slides=[config.slides[0],{type:'wms',wms:{url:base+'/fixture-wms',layers:'test'},metadata:{title:'Fixture WMS',source:'Test'}},{type:'arcgis',arcgis:{url:base+'/fixture-arcgis',layers:'0'},metadata:{title:'Fixture ArcGIS',source:'Test'}},{type:'wms',wms:{url:base+'/fixture-failed',layers:'test'},metadata:{title:'Failed service'}}];
   await context.route('**/slideshow-config.json',r=>r.fulfill({json:config}));
   const png=fs.readFileSync('media/chalmers_logo.png');
   await context.route('**/fixture-wms?**',r=>r.fulfill({contentType:'image/png',body:png}));
   await context.route('**/fixture-arcgis/export?**',r=>r.fulfill({contentType:'image/png',body:png}));
   await context.route('**/fixture-failed?**',r=>r.fulfill({status:503,body:'Unavailable'}));
  }
  await page.goto(base+'/index.html');await page.getByText('Click to Start',{exact:true}).click();
  await page.waitForFunction(()=>window.map?.loaded());
  const camera=await page.evaluate(()=>({center:map.getCenter().toArray(),zoom:map.getZoom(),bearing:map.getBearing()}));
  const controller=await context.newPage();controller.on('pageerror',e=>errors.push(e.message));await controller.goto(base+'/controller.html');
  await controller.getByRole('checkbox',{name:'Enable Slideshow',exact:true}).check();
  await controller.getByRole('button',{name:'slideshow',exact:true}).click();
  await controller.getByRole('button',{name:'Next category',exact:true}).waitFor();
  await page.waitForFunction(()=>map.getSource('slideshow-geojson') && map.isSourceLoaded('slideshow-geojson'));
  await page.waitForFunction(()=>map.queryRenderedFeatures({layers:['slideshow-fill']}).length===0);
  await controller.getByRole('button',{name:'Next category',exact:true}).click();
  await page.waitForFunction(()=>reveal?.index===0);
  await page.waitForFunction(()=>{const features=map.queryRenderedFeatures({layers:['slideshow-fill']});return features.length>0 && features.every(f=>f.properties[reveal.style.colorProperty]===reveal.values[0]);});
  await controller.getByRole('button',{name:'Show all',exact:true}).click();await page.waitForFunction(()=>reveal?.index===reveal?.values.length-1);
  await controller.screenshot({path:'.runtime/desktop-slideshow-categories.png'});
  const rasterIndices=await page.evaluate(()=>slideshowConfig.slides.map((s,i)=>['wms','arcgis'].includes(s.type)?i:-1).filter(i=>i>=0));
  for(const index of rasterIndices) {
   // Public controls exercise navigation; this inspection reads the authoritative state.
   while(await page.evaluate(()=>currentSlideIndex)!==index) {
    await controller.getByRole('button',{name:'Next chevron_right',exact:true}).click();
   }
   await page.waitForFunction(()=>['ready','error'].includes(slideStatus),null,{timeout:20000});
   const state=await page.evaluate(()=>({status:slideStatus,error:slideError,title:slideshowConfig.slides[currentSlideIndex].metadata.title,count:map.getStyle().layers.filter(l=>l.id.startsWith('slideshow-raster-')).length}));
   console.log('Raster',state);
   if(state.title==='Failed service'){
    assert.equal(state.status,'error');assert.equal(state.count,0);
    await controller.getByRole('button',{name:'Retry',exact:true}).click();await page.waitForFunction(()=>slideStatus==='error');
   } else {assert.equal(state.status,'ready',state.error);assert.equal(state.count,1);}
   assert.deepEqual(await page.evaluate(()=>({center:map.getCenter().toArray(),zoom:map.getZoom(),bearing:map.getBearing()})),camera);
   if(state.status==='ready') {
    await page.getByRole('button',{name:'Switch Basemap',exact:true}).click();
    assert.equal(await page.evaluate(()=>map.getStyle().layers.filter(l=>l.id.startsWith('slideshow-raster-')).length),1);
    await page.screenshot({path:'.runtime/presentation-raster-'+index+'.png'});
   }
  }
  await controller.getByRole('button',{name:'stop Stop Slideshow',exact:true}).click();
  await page.waitForFunction(()=>!isSlideShowActive);
  assert.equal(await page.evaluate(()=>map.getStyle().layers.filter(l=>l.id.startsWith('slideshow-')).length),0);
  // Config-driven branding and disabled layers agree across local entry points.
  await context.route('**/app-config.js',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync('app-config.js','utf8')+"\nwindow.APP_CONFIG.disabledLayers=['campus-demo-btn'];window.APP_CONFIG.app.title='Campus Test';"}));
  await controller.reload();await controller.waitForLoadState('domcontentloaded');
  assert.equal(await controller.getByRole('heading',{name:'Campus Test Dashboard',exact:true}).count(),1);
  assert.equal(await controller.getByRole('checkbox',{name:'Enable Chalmers Campus Vision',exact:true}).isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS desktop category controls, raster navigation/failure, fixed camera and complete cleanup');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
