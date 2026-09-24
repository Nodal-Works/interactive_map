// Geographic slideshow layers. No camera changes; each load owns its resources.
(function (root) {
  'use strict';
  function tileUrl(slide) {
    const spec = slide.type === 'arcgis' ? slide.arcgis : slide.wms;
    const url = new URL(spec.url);
    const params = slide.type === 'arcgis'
      ? {bbox:'{bbox-epsg-3857}',bboxSR:3857,imageSR:3857,size:'256,256',format:spec.format || 'png',transparent:true,layers:'show:'+(spec.layers ?? 0),f:'image'}
      : {SERVICE:'WMS',REQUEST:'GetMap',VERSION:spec.version || '1.1.1',LAYERS:spec.layers,STYLES:'',
        [spec.version === '1.3.0' ? 'CRS' : 'SRS']:'EPSG:3857',FORMAT:spec.format || 'image/png',TRANSPARENT:true,WIDTH:256,HEIGHT:256,BBOX:'{bbox-epsg-3857}'};
    if (slide.type === 'arcgis') url.pathname = url.pathname.replace(/\/$/, '') + '/export';
    for (const [key,value] of Object.entries(params)) url.searchParams.set(key,String(value));
    return url.toString().replace('%7Bbbox-epsg-3857%7D','{bbox-epsg-3857}');
  }
  const aborted = () => new DOMException('Slide changed', 'AbortError');
  class RasterSlides {
    constructor(map, timeout = 12000) {this.map=map;this.timeout=timeout;this.ids=new Set();this.active=null;this.serial=0;}
    remove(id) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
      if (this.map.getSource(id)) this.map.removeSource(id);
      this.ids.delete(id);
    }
    clear() {for (const id of [...this.ids]) this.remove(id);this.active=null;}
    async show(slide, signal, duration = 700) {
      if (signal.aborted) throw aborted();
      const map=this.map, id='slideshow-raster-'+(++this.serial), previous=this.active;
      this.ids.add(id);
      try {
        await new Promise((resolve,reject) => {
          const finish = error => {clearTimeout(timer);map.off('sourcedata',ready);map.off('error',failed);signal.removeEventListener('abort',cancel);error?reject(error):resolve();};
          const ready = event => {if ((!event || event.sourceId===id) && map.getSource(id) && map.isSourceLoaded(id)) finish();};
          const failed = event => {if (event.sourceId===id || event.source?.id===id) finish(Error('Map service unavailable'));};
          const cancel = () => finish(aborted());
          const timer=setTimeout(()=>finish(Error('Map service timed out. Retry or choose Next.')),this.timeout);
          map.on('sourcedata',ready);map.on('error',failed);signal.addEventListener('abort',cancel,{once:true});
          try {
            map.addSource(id,{type:'raster',tiles:[tileUrl(slide)],tileSize:256,attribution:slide.metadata?.source || ''});
            map.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':0,'raster-fade-duration':0}});
            ready();
          } catch(error) {finish(error);}
        });
        await new Promise((resolve,reject) => {
          let frame, start;
          const cancel=()=>{cancelAnimationFrame(frame);reject(aborted());};
          signal.addEventListener('abort',cancel,{once:true});
          function tick(now) {
            if (signal.aborted) return cancel();
            start ??= now;
            const t=duration?Math.min(1,(now-start)/duration):1, opacity=t*t*(3-2*t);
            if (map.getLayer(id)) map.setPaintProperty(id,'raster-opacity',opacity);
            if (previous && map.getLayer(previous)) map.setPaintProperty(previous,'raster-opacity',1-opacity);
            if(t<1) frame=requestAnimationFrame(tick);
            else {signal.removeEventListener('abort',cancel);resolve();}
          }
          frame=requestAnimationFrame(tick);
        });
        if(signal.aborted) throw aborted();
        for(const other of [...this.ids]) if(other!==id) this.remove(other);
        this.active=id;
      } catch(error) {
        this.remove(id);
        if(previous && map.getLayer(previous)) map.setPaintProperty(previous,'raster-opacity',1);
        throw error;
      }
    }
  }
  root.MR_RASTER_SLIDES={tileUrl,RasterSlides};
  if(typeof module!=='undefined') module.exports=root.MR_RASTER_SLIDES;
})(typeof window==='undefined'?globalThis:window);
