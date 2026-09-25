(function(root){
  'use strict';
  const pick=(source,keys)=>Object.fromEntries(keys.filter(key=>source?.[key]!==undefined).map(key=>[key,source[key]]));
  const settings={
    'cfd-simulation-btn':['cfd','windSpeed angle viscosity resolution trees particles playback visualStyle facadeGlow palette colorMaxMps'],
    'isovist-btn':['isovist','radius fov follow humanFov trees ambientSound'],
    'sun-study-btn':['sun','time date animating trees falseColor opacity speed'],
    'thermal-comfort-btn':['thermal','hour showRaster showStreets mode tour']
  };
  // Explicit inputs only: new desktop broadcasts cannot silently add result
  // geometry, images, time series or solver diagnostics to the phone payload.
  function project(state,focus){
    const result={type:'state',sessionId:state.sessionId,paused:state.paused,endedAt:state.endedAt,
      layers:state.layers,slots:state.slots,table:pick(state.table,['corners','bearing','revision']),
      participants:state.participants.map(p=>pick(p,['id','name','avatar','color','online','slot'])),messages:[]};
    const entry=settings[focus?.layer];
    if(entry){const[name,keys]=entry;result[name]=pick(state[name],keys.split(' '));
      if(name==='thermal'&&result.thermal.tour)result.thermal.tour=pick(result.thermal.tour,['open','playing','step','layer']);}
    if(focus?.layer==='slideshow-btn') {
      const slide=(state.messages || []).find(m=>m.type==='slideshow_update');
      if(slide) result.slideshow={...pick(slide,['isActive','currentIndex','totalSlides','status','error','categoryIndex','categoryCount','category','autoReveal']),title:slide.metadata?.title || ''};
    }
    if(focus?.layer==='ecom-energy-btn'&&focus.tab==='controls'){
      result.messages=(state.messages||[]).filter(m=>['ecom_ui_state','ecom_pong','ecom_sound_state','ecom_applied'].includes(m.type)).map(m=>{
        if(m.type==='ecom_ui_state')return pick(m,['type','editorId','ui']);
        return pick(m,['type','active','on','hour','hours','playing']);
      });
    }
    return result;
  }
  function drawings(objects,focus){
    if(focus?.tab!=='map')return [];
    if(focus.layer==='cfd-simulation-btn')return objects.filter(o=>o.tool==='obstacle');
    if(focus.layer==='canvas-btn')return objects.filter(o=>o.tool!=='obstacle');
    return [];
  }
  root.MR_PHONE_STATE={project,drawings};
  if(typeof module!=='undefined')module.exports=root.MR_PHONE_STATE;
})(typeof window==='undefined'?globalThis:window);
