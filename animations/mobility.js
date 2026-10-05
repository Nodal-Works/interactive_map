/* Prepared mobility layers share the calibrated analysis pass and museum lifecycle. */
(function(){
  'use strict';
  const core=window.MR_MOBILITY_CORE,render=window.MR_RENDER;
  if(!core||!render||!window.MR_LAYERS)return;
  const channel=new BroadcastChannel('map_controller_channel'),viewMap=render.map,instances={};
  const empty=()=>({type:'FeatureCollection',features:[]});
  for(const [id,definition] of Object.entries(core.DEFINITIONS)){
    const key=definition.key,prefix=key==='synthpop'?'synthpop-':'slow-walkers-';
    let active=false,revision=0,abort=null,frame=null,last=null,elapsed=0,lastDraw=0,lastPublish=0;
    let data=null,districts=null,journeys=null,error=null,canvas=null,context=null,projected=null;
    const state={...definition,key,active:false,ready:false,view:'heatmap',playing:false,timeSeconds:0,duration:0,rate:120,departure:-1,arrivals:{medium:0,slow:0}};
    const source=prefix+'cells',fill=prefix+'fill';
    function snapshot(){return {...state,active,error,arrivals:{...state.arrivals}};}
    function publish(){const value=snapshot();channel.postMessage({type:key+'_state',...value});window.dispatchEvent(new CustomEvent('mr-mobility-state',{detail:{id,...value}}));}
    function stopFrames(){if(frame!==null)window.MR_FRAMES.cancel(frame);frame=null;last=null;}
    function schedule(){if(active&&state.playing&&!document.hidden&&frame===null)frame=window.MR_FRAMES.request(key,tick);}
    function cells(){
      if(!data||!viewMap.getSource(source))return;
      const collection=key==='synthpop'?data:{type:'FeatureCollection',features:data.features.map(f=>({...f,properties:{delay:f.properties.values[state.departure+1]}}))};
      viewMap.getSource(source).setData(collection);
      viewMap.setFilter(fill,['!=',['get','delay'],null]);
      viewMap.setLayoutProperty(fill,'visibility',active&&(key!=='synthpop'||state.view==='heatmap')?'visible':'none');
      if(key==='slow_walkers'){
        const index=state.departure+1;
        state.maximumDistrict=districts.features.map(f=>({name:f.properties.name,value:f.properties.values[index]}))
          .filter(x=>Number.isFinite(x.value)).sort((a,b)=>b.value-a.value)[0]||null;
      }
    }
    function placeCanvas(){
      if(!canvas)return;
      const t=window.getTableLayout();Object.assign(canvas.style,{left:t.left+'px',top:t.top+'px',width:t.w+'px',height:t.h+'px'});
      canvas.width=Math.max(1,Math.round(t.w));canvas.height=Math.max(1,Math.round(t.h));
      canvas.style.opacity=String(window.MR_MUSEUM?.getState().config.opacity[id]??1);
      const r=window.map.getContainer().getBoundingClientRect();
      projected=journeys.tracks.map(track=>({...track,legs:track.legs.map(leg=>({...leg,coordinates:leg.coordinates.map(c=>{const p=window.map.project(c);return[p.x+r.left-t.left,p.y+r.top-t.top];})}))}));
      drawJourneys();
    }
    function drawJourneys(){
      if(!context||!projected)return;
      context.clearRect(0,0,canvas.width,canvas.height);
      canvas.hidden=!active||state.view!=='journeys';if(canvas.hidden)return;
      const scale=window.mrTableScale?.()??1;
      for(const walker of ['slow','medium']){
        context.strokeStyle=walker==='medium'?'#2dd4bf':'#fb923c';context.lineWidth=Math.max(.5,scale*.65);context.globalAlpha=.14;
        context.beginPath();for(const track of projected)if(track.walker===walker)for(const leg of track.legs){leg.coordinates.forEach((p,i)=>i?context.lineTo(...p):context.moveTo(...p));}context.stroke();
      }
      context.globalAlpha=1;state.arrivals={medium:0,slow:0};
      for(const track of projected){
        const p=core.position(track,state.timeSeconds);if(p.arrived){state.arrivals[track.walker]++;continue;}
        const [x,y]=p.coordinate;if(x<0||y<0||x>canvas.width||y>canvas.height)continue;
        const medium=track.walker==='medium',radius=Math.max(2.5,scale*(medium?2.3:3.3));
        context.beginPath();context.arc(x,y,radius,0,Math.PI*2);context.fillStyle=medium?'#2dd4bf':'#fb923c';context.fill();
        context.strokeStyle=medium?'#143b38':'#fff';context.lineWidth=Math.max(.7,scale*.6);context.stroke();
      }
      const destination=data.metadata.destination.coordinates,t=window.getTableLayout(),r=window.map.getContainer().getBoundingClientRect(),p=window.map.project(destination);
      const x=p.x+r.left-t.left,y=p.y+r.top-t.top;
      context.fillStyle='#fff';context.strokeStyle='#111';context.lineWidth=2;context.beginPath();context.arc(x,y,Math.max(4,scale*4),0,Math.PI*2);context.fill();context.stroke();
      window.MR_FRAMES.recordRender(key);
    }
    function tick(now){
      frame=null;if(!active||!state.playing||document.hidden)return;
      const dt=last===null?0:Math.min(.1,(now-last)/1000);last=now;
      if(key==='synthpop'){
        state.timeSeconds=Math.min(state.duration,state.timeSeconds+dt*state.rate);
        if(now-lastDraw>=33){drawJourneys();lastDraw=now;}
        if(state.timeSeconds>=state.duration){state.playing=false;drawJourneys();}
      }else{
        elapsed+=dt;if(elapsed>=3){elapsed%=3;state.departure=(state.departure+1)%state.departures.length;cells();publish();}
      }
      if(now-lastPublish>=1000||!state.playing){lastPublish=now;publish();}schedule();
    }
    async function load(file){const response=await fetch(window.mrAsset('media/mobility/'+file),{signal:abort.signal});if(!response.ok)throw Error('Prepared mobility data is unavailable');return response.json();}
    function disable(){revision++;abort?.abort();abort=null;active=false;state.playing=false;stopFrames();if(viewMap.getLayer(fill))viewMap.setLayoutProperty(fill,'visibility','none');if(canvas){context.clearRect(0,0,canvas.width,canvas.height);canvas.hidden=true;}publish();}
    async function enable(current){
      const generation=++revision;error=null;abort=new AbortController();
      try{
        await render.ready;if(!current()||generation!==revision)return;
        if(!data){
          if(key==='synthpop')[data,journeys]=await Promise.all([load('synthpop.geojson'),load('journeys.json')]);
          else [data,districts]=await Promise.all([load('slow-walkers.geojson'),load('districts.geojson')]);
        }
        if(!current()||generation!==revision)return;
        const meta=data.metadata;state.ready=true;state.legend=core.legend(meta.bins,meta.colors);state.statistics=meta;
        if(key==='synthpop'){
          state.duration=journeys.duration;
          if(!canvas){canvas=document.createElement('canvas');canvas.id='synthpop-journey-canvas';canvas.setAttribute('aria-hidden','true');canvas.style.cssText='position:fixed;pointer-events:none;z-index:15';canvas.hidden=true;document.body.append(canvas);context=canvas.getContext('2d');placeCanvas();}
        }else Object.assign(state,{departures:meta.departures,completedDepartures:meta.completedDepartures,plannedDepartures:meta.plannedDepartures,routingDate:meta.routingDate});
        if(!viewMap.getSource(source))viewMap.addSource(source,{type:'geojson',data:empty()});
        if(!viewMap.getLayer(fill)){
          const color=['step',['get','delay'],meta.colors[0]];for(let i=1;i<meta.bins.length;i++)color.push(meta.bins[i],meta.colors[i]);
          viewMap.addLayer({id:fill,type:'fill',source,filter:['!=',['get','delay'],null],paint:{'fill-color':color,'fill-opacity':.72,'fill-outline-color':'rgba(255,255,255,.08)'}});
        }
        active=true;cells();drawJourneys();publish();
      }catch(e){if(e.name==='AbortError'||generation!==revision)return;error=e.message;throw e;}
    }
    function control(message){
      if(message.type!==key+'_control')return;
      if(message.action==='request_state'){publish();return;}
      if(!active||!state.ready)return;
      const value=message.value;
      switch(message.action){
        case 'set_view':if(key!=='synthpop'||!['heatmap','journeys'].includes(value))return;state.view=value;state.playing=false;stopFrames();cells();drawJourneys();break;
        case 'set_time':if(key!=='synthpop'||!Number.isFinite(value)||value<0||value>state.duration)return;state.timeSeconds=value;drawJourneys();break;
        case 'set_rate':if(![60,120,360].includes(value))return;state.rate=value;break;
        case 'set_departure':if(key!=='slow_walkers'||!Number.isInteger(value)||value< -1||value>=state.departures.length)return;state.departure=value;state.playing=false;stopFrames();cells();break;
        case 'play':if(key==='synthpop'){state.view='journeys';if(state.timeSeconds>=state.duration)state.timeSeconds=0;cells();drawJourneys();}else if(state.departure<0){state.departure=0;cells();}state.playing=true;last=null;elapsed=0;schedule();break;
        case 'pause':state.playing=false;stopFrames();break;
        case 'restart':state.timeSeconds=0;last=null;drawJourneys();break;
        default:return;
      }publish();
    }
    channel.addEventListener('message',({data:message})=>control(message));
    document.addEventListener('visibilitychange',()=>{stopFrames();schedule();});
    window.map.on('moveend',placeCanvas);window.addEventListener('resize',placeCanvas);
    window.addEventListener('mr-museum-presentation',()=>{if(canvas)canvas.style.opacity=String(window.MR_MUSEUM?.getState().config.opacity[id]??1);});
    instances[key]={getState:snapshot,control};
    window.MR_LAYERS.register(id,{getEnabled:()=>active,enable,disable,isReady:()=>state.ready,getError:()=>error,
      dispose(){stopFrames();abort?.abort();window.map.off('moveend',placeCanvas);window.removeEventListener('resize',placeCanvas);canvas?.remove();if(viewMap.getLayer(fill))viewMap.removeLayer(fill);if(viewMap.getSource(source))viewMap.removeSource(source);}});
  }
  window.MR_MOBILITY=instances;window.addEventListener('pagehide',()=>channel.close(),{once:true});
})();
