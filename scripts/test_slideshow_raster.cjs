const assert=require('node:assert/strict');
const {tileUrl,RasterSlides}=require('../animations/slideshow-raster.js');
global.requestAnimationFrame=fn=>setImmediate(()=>fn(performance.now()));global.cancelAnimationFrame=clearImmediate;
class MapFixture {
 constructor(){this.sources=new Map();this.layers=new Map();this.events={};}
 on(type,fn){(this.events[type] ||= new Set()).add(fn);}
 off(type,fn){this.events[type]?.delete(fn);}
 emit(type,data){for(const fn of [...this.events[type]||[]])fn(data);}
 addSource(id,source){this.sources.set(id,source);}
 addLayer(layer){this.layers.set(layer.id,layer);}
 getSource(id){return this.sources.get(id);}
 getLayer(id){return this.layers.get(id);}
 removeLayer(id){this.layers.delete(id);}
 removeSource(id){this.sources.delete(id);}
 setPaintProperty(id,key,value){this.layers.get(id).paint[key]=value;}
 isSourceLoaded(id){return !!this.sources.get(id)?.loaded;}
 ready(id){this.sources.get(id).loaded=true;this.emit('sourcedata',{sourceId:id,tile:{state:'loaded'}});}
}
(async()=>{
 const slide={type:'wms',wms:{url:'https://example.com/wms?existing=yes',layers:'a,b',version:'1.3.0'},metadata:{source:'Test source'}};
 const url=tileUrl(slide);assert.ok(url.includes('BBOX={bbox-epsg-3857}'));assert.equal(new URL(url).searchParams.get('CRS'),'EPSG:3857');assert.equal(new URL(url).searchParams.get('existing'),'yes');
 assert.equal(new URL(tileUrl({type:'arcgis',arcgis:{url:'https://example.com/MapServer/',layers:'1,2'}})).pathname,'/MapServer/export');
 const map=new MapFixture(),raster=new RasterSlides(map,20),job=new AbortController();
 let pending=raster.show(slide,job.signal,0);map.ready('slideshow-raster-1');await pending;
 assert.equal(map.layers.size,1);assert.equal(map.getLayer(raster.active).paint['raster-opacity'],1);
 const cancel=new AbortController();pending=raster.show(slide,cancel.signal,0);cancel.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(map.layers.size,1,'Cancelled source removed, previous retained');
 pending=raster.show(slide,new AbortController().signal,0);map.sources.get('slideshow-raster-3').loaded=true;map.emit('sourcedata',{sourceId:'slideshow-raster-3',sourceDataType:'content'});await assert.rejects(pending,/timed out/);assert.equal(map.layers.size,1);
 pending=raster.show(slide,new AbortController().signal,0);map.emit('error',{sourceId:'slideshow-raster-4'});await assert.rejects(pending,/unavailable/);
 pending=raster.show(slide,new AbortController().signal,0);map.ready('slideshow-raster-5');await pending;assert.equal(map.layers.size,1);assert.ok(!map.getSource('slideshow-raster-1'));
 raster.clear();assert.equal(map.sources.size,0);assert.equal(map.layers.size,0);
 assert.ok(Object.values(map.events).every(set=>set.size===0),'No event listeners leaked');
 console.log('PASS WMS/ArcGIS URLs, readiness, timeout, failure, cancellation, crossfade replacement and cleanup');
})();
