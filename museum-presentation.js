/* Non-geographic exhibit information. Location-scoped placement never changes camera calibration. */
(function(){
'use strict';
const isHost=!!window.MR_LAYERS, channel=new BroadcastChannel('map_controller_channel');
const key='mr-museum-presentation:'+ (window.APP_CONFIG?.location?.id || 'default');
const defaults={muted:false,gridHold:false,leftX:0,leftY:0,rightX:0,rightY:0,zoneWidth:0,fontSize:16,opacity:{}};
let config={...defaults},states={},lastDetail={};
const labels={
 'synthpop-heatmap-btn':['Synth Pop Heatmap','Same trip. Different walking speeds.'],
 'slow-walkers-btn':['Time Lost by Slow Walkers','Can a short walk make a long delay?'],
 'cfd-simulation-btn':['Wind','Ribbons show direction. Colour shows modelled speed in m/s; this is a qualitative simulation.'],
 'stormwater-btn':['Stormwater','Blue paths show surface runoff. Bright pools indicate accumulation; not a flood-depth forecast.'],
 'sun-study-btn':['Sun & shadow','Explore how the date and time change sunlight and building shadows.'],
 'isovist-btn':['What can you see?','Yellow marks the visible area. Buildings and tree canopies block the view. Move the observer with your phone.'],
 'bird-sounds-btn':['Bird soundscape','Glowing rings locate playing birds. Choose a species on your phone to listen.'],
 'slideshow-btn':['City layers','Explore the mapped datasets and their categories on your phone.'],
 'trafik-btn':['Street Life','City activity and reported bus and tram positions. Transport starts and stops with Street Life.'],
 'street-view-btn':['Street View','Explore street-level imagery from the observer’s position.'],
 'grid-animation-btn':['Table alignment','Numbered cells mark physical tiles. Use the steady grid for calibration.']
};
function valid(value){
 const next={...config};
 for(const field of ['muted','gridHold'])if(typeof value[field]==='boolean')next[field]=value[field];
 for(const field of ['leftX','leftY','rightX','rightY'])if(Number.isFinite(value[field]))next[field]=Math.max(-2000,Math.min(2000,value[field]));
 if(Number.isFinite(value.zoneWidth))next.zoneWidth=Math.max(0,Math.min(800,value.zoneWidth));
 if(Number.isFinite(value.fontSize))next.fontSize=Math.max(14,Math.min(36,value.fontSize));
 if(value.opacity){next.opacity={...config.opacity};for(const [id,n] of Object.entries(value.opacity))if(labels[id]&&Number.isFinite(n))next.opacity[id]=Math.max(.1,Math.min(1,n));}
 return next;
}
function broadcast(){channel.postMessage({type:'museum_state',config,states,detail:lastDetail});}
let left,right,list,rightList,qr,qrCaption,qrModules=0,invite='',windState=null,slideState=null,sunState=null;
function apply(){
 window.MR_GRID_HOLD=config.gridHold;if(config.gridHold)window.MR_LAYERS?.setEnabled('grid-animation-btn',true);window.MR_AUDIO?.setMuted(config.muted);
 window.dispatchEvent(new CustomEvent('mr-grid-mode'));
 const canvases={'cfd-simulation-btn':['cfd-simulation-canvas'],'stormwater-btn':['stormwater-canvas'],'sun-study-btn':['sun-study-canvas','sun-study-overlay'],'bird-sounds-btn':['bird-sounds-canvas'],'slideshow-btn':['slideshow-canvas'],'trafik-btn':['trafik-canvas'],'grid-animation-btn':['grid-animation-canvas']};
 for(const [id,els] of Object.entries(canvases))for(const el of els){const node=document.getElementById(el);if(node)node.style.opacity=config.opacity[id]??1;}
 window.MR_RENDER?.setOpacity?.(config.opacity);
 place();broadcast();window.dispatchEvent(new Event('mr-museum-presentation'));
}
function place(){
 if(!left)return;
 const t=window.getTableLayout(), rail=window.MR_CALIBRATION.dimensions.sidebarWidth*t.w/window.MR_CALIBRATION.dimensions.tableWidth;
 const available=Math.max(0,Math.min(t.left,innerWidth-t.left-t.w)-rail-24);
 const width=config.zoneWidth||available;
 left.hidden=right.hidden=width<100;
 Object.assign(left.style,{left:(t.left-rail-width-12+config.leftX)+'px',top:(t.top+20+config.leftY)+'px',width:width+'px',maxHeight:Math.max(0,t.h-40)+'px',fontSize:config.fontSize+'px'});
 Object.assign(right.style,{left:(t.left+t.w+rail+12+config.rightX)+'px',top:(t.top+20+config.rightY)+'px',width:width+'px',maxHeight:Math.max(0,t.h-40)+'px',fontSize:config.fontSize+'px'});
 // Integer module pixels with four-module white quiet zone; never shrink an unreadable QR.
 const modulePixels=Math.floor((width-16)/Math.max(1,qrModules+8));
 qr.hidden=!invite||modulePixels<2;
 if(!qr.hidden){const size=qrModules*modulePixels;qr.style.width=size+'px';qr.style.height=size+'px';qr.style.padding=(4*modulePixels)+'px';}
 qrCaption.textContent=!invite?'Session invitation is preparing…':qr.hidden?'Scan the staff controller’s QR to join.':'Scan to explore';
 lastDetail={zoneWidth:Math.round(width),qrModulePixels:modulePixels,qrVisible:!qr.hidden,placementWarning:width<100?'Information zones need more projection space.':modulePixels<2?'QR needs a wider information zone (minimum 2 pixels per module).':''};
}
function render(){
 states=window.MR_LAYERS.getState();list.replaceChildren();rightList.replaceChildren();
 const active=Object.entries(states).filter(([,s])=>s.active||s.requested||s.error);
 let number=0;for(const [id,state] of active){if(!labels[id])continue;const item=document.createElement('section'),title=document.createElement('h3'),text=document.createElement('p');title.textContent=labels[id][0]+(state.status==='loading'?' · Loading':state.error?' · Unavailable':'');text.textContent=state.error||labels[id][1];if(id==='slideshow-btn' && slideState?.metadata?.title)title.textContent=slideState.metadata.title;
 if(id==='cfd-simulation-btn' && windState){const key=document.createElement('div');key.className='museum-speed-key';const colors=Array.from({length:5},(_,i)=>window.CFD.speedColor(i*windState.colorMaxMps/4,windState.palette,windState.colorMaxMps));key.style.background='linear-gradient(90deg,'+colors.map(c=>'rgb('+c.slice(0,3).join(',')+')').join(',')+')';const units=document.createElement('small');units.textContent='0 — '+windState.colorMaxMps+' m/s · wind '+windState.windSpeed+' m/s';item.append(key,units);}
 if(window.MR_MOBILITY_CORE?.DEFINITIONS[id]){
   const core=window.MR_MOBILITY_CORE,definition=core.DEFINITIONS[id],mobility=window.MR_MOBILITY?.[definition.key].getState(),story=core.story({...mobility,key:definition.key});
   item.className='mobility-story';
   const node=(tag,cls,content)=>{const el=document.createElement(tag);el.className=cls;if(content!==undefined)el.textContent=content;return el;};
   title.className='mobility-story-question';title.textContent=story.question;
   text.textContent=mobility?.error||story.intro;
   item.append(node('div','mobility-story-view',story.view));
   const metric=node('div','mobility-story-stat');metric.append(node('strong','',story.metric),node('span','',story.metricLabel));item.append(metric,node('p','mobility-story-detail',story.detail));
   item.append(node('h4','mobility-story-legend-title',story.legendTitle));
   const legend=node('div','mobility-legend'),journeys=mobility?.view==='journeys';
   const entries=journeys?[{color:'#2dd4bf',label:'4.8 km/h'},{color:'#fb923c',label:'4.235 km/h'}]:mobility?.legend||[];
   if(!journeys&&mobility?.legendMode==='continuous'){
     legend.className+=' mobility-legend-continuous';const bar=node('div','mobility-colour-ramp');bar.style.background='linear-gradient(90deg,'+entries.map(e=>e.color).join(',')+')';legend.append(bar);
     const ticks=node('div','mobility-legend-ticks');for(const entry of entries)ticks.append(node('span','',entry.label.replace(' min','')));legend.append(ticks);
   }else for(const entry of entries){const row=node('span',''),swatch=node('i','');swatch.style.background=entry.color;row.append(swatch,document.createTextNode(entry.label));legend.append(row);}
   item.append(legend);
   if(journeys){const arrivals=node('div','mobility-arrivals');for(const [walker,label]of [['medium','4.8 km/h'],['slow','4.235 km/h']]){const count=node('div','mobility-arrival-'+walker);count.append(node('strong','',String(mobility.arrivals?.[walker]||0)),node('span','',label+' · arrived'));arrivals.append(count);}item.append(arrivals);}
   item.append(node('p','mobility-story-reading',story.reading),node('p','mobility-story-prompt',story.prompt),node('small','mobility-story-footnote',story.footnote));
   const credits=node('small','mobility-story-credits');
   for(const [name,url]of [['Research','https://github.com/SaraAboebeid/slow_walkers'],['Synthetic population','https://zenodo.org/records/10801936']]){const link=node('a','',name);link.href=url;link.target='_blank';link.rel='noopener';credits.append(link);}
   item.append(credits);item.prepend(node('div','mobility-story-chapter',story.chapter));
   if(active.length===1){
     const companion=node('section','mobility-story mobility-story-companion');companion.append(node('div','mobility-story-chapter','The experiment'),node('h3','mobility-story-question','Same city. Different pace.'));
     const speeds=node('div','mobility-walking-speeds');
     for(const [speed,label,cls]of [['4.8','Reference walk','medium'],['4.235','Slower walk','slow']]){const row=node('div','mobility-walk-'+cls);row.append(node('strong','',speed),node('span','',' km/h'),node('small','',label));speeds.append(row);}companion.append(speeds);
     companion.append(node('p','','About 12% slower on foot. A connection can turn that small difference into a much longer trip.'));
     const steps=node('div','mobility-connection-steps');for(const label of ['Walk','Connection','Wait'])steps.append(node('span','',label));companion.append(steps);
     companion.append(node('p','mobility-story-reading',definition.key==='synthpop'?'This view follows trips to one hospital. Time Lost explores missed connections to destinations across the city.':'This view looks at missed connections across the city. Synth Pop follows a separate set of healthcare trips to Sahlgrenska.'));
     rightList.append(companion);
   }
 }

 item.prepend(title,text);if(item.className==='mobility-story'){const chapter=item.querySelector('.mobility-story-chapter');if(chapter)item.prepend(chapter);}(number++<Math.ceil(active.length/2)?list:rightList).append(item);}
 if(!active.length){const p=document.createElement('p');p.textContent='A living city. Scan to explore sunlight, wind, water and urban life.';list.append(p);}
 right.classList.toggle('has-mobility-story',active.some(([id])=>!!window.MR_MOBILITY_CORE?.DEFINITIONS[id]));
 place();broadcast();
}
if(isHost){
 try{config=valid(JSON.parse(localStorage.getItem(key)||'{}'));}catch{}
 left=document.createElement('aside');left.className='museum-zone museum-zone-left';left.setAttribute('aria-label','Exhibit information');
 const title=document.createElement('h2');title.textContent=window.APP_CONFIG?.location?.title || 'Explore the city';list=document.createElement('div');left.append(title,list);
 right=document.createElement('aside');right.className='museum-zone museum-zone-right';right.setAttribute('aria-label','Join the exhibit');qrCaption=document.createElement('h2');qr=document.createElement('div');qr.className='museum-qr';const instruction=document.createElement('p');instruction.textContent='Use your phone to choose layers and explore the table together.';rightList=document.createElement('div');rightList.className='museum-right-stories';right.append(qrCaption,qr,instruction,rightList);document.body.append(left,right);
 window.addEventListener('mr-layer-state',render);window.addEventListener('mr-mobility-state',render);window.addEventListener('resize',place);window.addEventListener('mr-transform',place);
 window.addEventListener('mr-invite',({detail})=>{invite=detail;qr.replaceChildren();if(invite&&typeof QRCode!=='undefined'){const code=new QRCode(qr,{text:invite,width:512,height:512,correctLevel:QRCode.CorrectLevel.L});qrModules=code._oQRCode.getModuleCount();}place();broadcast();});
 window.addEventListener('mr-session-state',({detail})=>{if(detail.endedAt){invite='';place();}});
 channel.onmessage=({data})=>{if(data.type==='cfd_state'){windState=data;render();}if(data.type==='slideshow_update'){slideState=data;render();}if(data.type==='museum_request')broadcast();if(data.type==='museum_control'){config=valid(data.value||{});try{localStorage.setItem(key,JSON.stringify(config));}catch{}apply();}};
 window.MR_MUSEUM={getState:()=>({config,states,detail:lastDetail})};
 apply();render();
}else{
 const panel=document.createElement('details');panel.className='museum-setup';const summary=document.createElement('summary');summary.textContent='Exhibit setup';panel.append(summary);
 const description=document.createElement('p');description.textContent='Fixed rendering quality · unrestricted stacking. Placement is saved for this location; map calibration is unchanged.';panel.append(description);
 const fields={},send=value=>channel.postMessage({type:'museum_control',value});
 for(const [id,label,type,min,max] of [['muted','Mute exhibit audio','checkbox'],['gridHold','Steady numbered grid','checkbox'],['leftX','Left zone X offset (px)','number',-2000,2000],['leftY','Left zone Y offset (px)','number',-2000,2000],['rightX','Right zone X offset (px)','number',-2000,2000],['rightY','Right zone Y offset (px)','number',-2000,2000],['zoneWidth','Zone width (px, 0 = automatic)','number',0,800],['fontSize','Information text size (px)','number',14,36]]){const row=document.createElement('label'),input=document.createElement('input');row.textContent=label;input.type=type;input.min=min;input.max=max;input.onchange=()=>send({[id]:type==='checkbox'?input.checked:Number(input.value)});row.append(input);panel.append(row);fields[id]=input;}
 const warning=document.createElement('p');warning.setAttribute('role','status');panel.append(warning);
 const layerRows={};for(const [id,[name]]of Object.entries(labels)){const row=document.createElement('label'),input=document.createElement('input'),status=document.createElement('span');row.textContent=name+' opacity';input.type='range';input.min='.1';input.max='1';input.step='.05';input.value='1';input.oninput=()=>send({opacity:{[id]:Number(input.value)}});input.setAttribute('aria-label',name+' opacity');row.append(input,status);panel.append(row);layerRows[id]={input,status};}
 document.body.append(panel);
 channel.onmessage=({data})=>{if(data.type!=='museum_state')return;config=data.config;for(const [id,el]of Object.entries(fields))if(document.activeElement!==el){if(el.type==='checkbox')el.checked=config[id];else el.value=config[id];}for(const [id,row]of Object.entries(layerRows)){if(document.activeElement!==row.input)row.input.value=config.opacity[id]??1;row.status.textContent=data.states[id]?.status||'off';}warning.textContent=data.detail.placementWarning||'Information zones and QR fit the current viewport.';};
 channel.postMessage({type:'museum_request'});panel.addEventListener('toggle',()=>{if(panel.open)channel.postMessage({type:'museum_request'});});
}
window.addEventListener('pagehide',()=>channel.close(),{once:true});
})();
