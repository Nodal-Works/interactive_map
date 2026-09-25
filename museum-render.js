/* Transparent geographic analysis pass above terrain; primary map owns input. */
(function() {
  'use strict';
  const primary=window.map;
  if(!primary || !window.APP_CONFIG.location)return;
  const container=document.createElement('div');container.id='museum-analysis-map';
  container.setAttribute('aria-hidden','true');document.body.append(container);
  const initial=primary.getContainer().getBoundingClientRect();
  Object.assign(container.style,{left:initial.left+'px',top:initial.top+'px',width:initial.width+'px',height:initial.height+'px'});
  const overlay=new maplibregl.Map({container,interactive:false,attributionControl:false,pixelRatio:1,
    style:{version:8,sources:{},layers:[],glyphs:'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf'},
    center:primary.getCenter(),zoom:primary.getZoom(),bearing:primary.getBearing(),pitch:primary.getPitch()});
  const ready=new Promise(resolve=>{if(overlay.isStyleLoaded())resolve();else overlay.once('style.load',()=>{container.dataset.ready='true';resolve();});});
  const refresh=window.installTableMapScale(overlay);
  const delegated=new Map();
  const isAnalysis=id=>typeof id==='string' && /^(isovist-|slideshow-|streetview-)/.test(id);
  const target=id=>isAnalysis(id)?overlay:primary;
  let lastWidth=0,lastHeight=0;
  const opacity={},paintBases=new Map();
  const group=id=>id.startsWith('isovist-')?'isovist-btn':id.startsWith('slideshow-')?'slideshow-btn':'street-view-btn';
  const applyPaint=(id,name,value)=>{const factor=opacity[group(id)]??1;return typeof value==='number'?value*factor:['*',value,factor];};
  function align(){
    const r=primary.getContainer().getBoundingClientRect();
    Object.assign(container.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
    if(r.width!==lastWidth || r.height!==lastHeight){lastWidth=r.width;lastHeight=r.height;overlay.resize();refresh();}
    overlay.jumpTo({center:primary.getCenter(),zoom:primary.getZoom(),bearing:primary.getBearing(),pitch:primary.getPitch()});
    const t=window.getTableLayout();container.style.clipPath=`inset(${Math.max(0,t.top-r.top)}px ${Math.max(0,r.right-t.left-t.w)}px ${Math.max(0,r.bottom-t.top-t.h)}px ${Math.max(0,t.left-r.left)}px)`;
  }
  primary.on('move',align);window.addEventListener('resize',align);ready.then(align);
  const proxy=new Proxy(primary,{get(object,key){
    if(['addSource','getSource','removeSource','getLayer','removeLayer','setPaintProperty','setLayoutProperty','setFilter','moveLayer','isSourceLoaded'].includes(key))return(id,...args)=>{
      const map=target(id);
      if(key==='moveLayer' && args[0] && !map.getLayer(args[0]))args=[];
      if(map===overlay && key==='setPaintProperty' && args[0].endsWith('-opacity')){paintBases.set(id+':'+args[0],args[1]);args[1]=applyPaint(id,args[0],args[1]);}
      if(key==='removeLayer')for(const key of paintBases.keys())if(key.startsWith(id+':'))paintBases.delete(key);
      return map[key](id,...args);
    };
    if(key==='addLayer')return(layer,before)=>{const map=target(layer.id);if(map===overlay){layer={...layer,paint:{...layer.paint}};for(const [name,value]of Object.entries(layer.paint))if(name.endsWith('-opacity')){paintBases.set(layer.id+':'+name,value);layer.paint[name]=applyPaint(layer.id,name,value);}}return map.addLayer(layer,before && map.getLayer(before)?before:undefined);};
    if(key==='getStyle')return()=>({...primary.getStyle(),layers:[...primary.getStyle().layers,...(overlay.getStyle()?.layers || [])]});
    if(key==='on' || key==='off')return(event,layer,handler)=>{
      if(typeof layer==='string' && isAnalysis(layer)){
        if(key==='on') {const fn=e=>{if(overlay.getLayer(layer)&&overlay.queryRenderedFeatures(e.point,{layers:[layer]}).length)handler(e);};delegated.set(handler,fn);primary.on(event,fn);}
        else {const fn=delegated.get(handler);if(fn)primary.off(event,fn);delegated.delete(handler);}return proxy;
      }
      if(['sourcedata','error','style.load'].includes(event) && typeof layer==='function'){primary[key](event,layer);overlay[key](event,layer);return proxy;}
      return handler===undefined ? primary[key](event,layer) : primary[key](event,layer,handler);
    };
    const value=object[key];return typeof value==='function'?value.bind(object):value;
  }});
  window.MR_RENDER={map:proxy,analysisMap:overlay,ready,setOpacity(values){Object.assign(opacity,values);for(const [key,base]of paintBases){const [id,name]=key.split(':');if(overlay.getLayer(id))overlay.setPaintProperty(id,name,applyPaint(id,name,base));}}};
  window.addEventListener('pagehide',()=>{primary.off('move',align);window.removeEventListener('resize',align);overlay.remove();},{once:true});
})();
