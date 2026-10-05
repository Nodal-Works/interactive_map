/* One compact, accessible set of mobility controls for staff and phone visitors. */
(function(){
  'use strict';
  const core=window.MR_MOBILITY_CORE;if(!core)return;
  const element=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  class MobilityControls{
    constructor(container,send){this.container=container;this.send=send;}
    open(id){
      this.id=id;this.definition=core.DEFINITIONS[id];this.inputs=[];this.buttons=[];this.container.replaceChildren();
      this.container.classList.add('mobility-controls');
      this.container.append(element('h3',this.definition.question),element('p',this.definition.description));
      this.summary=element('p','Preparing the exhibit data…');this.summary.setAttribute('role','status');this.container.append(this.summary);
      this.legend=element('div');this.legend.className='mobility-legend';this.container.append(this.legend);
      const send=(action,value)=>this.send({type:this.definition.key+'_control',action,...(value!==undefined?{value}:{})});
      const select=(label,key,action,options)=>{const row=element('label',label),input=element('select');input.setAttribute('aria-label',label);for(const [value,text]of options)input.add(new Option(text,value));input.onchange=()=>send(action,key==='departure'?Number(input.value):input.value);row.append(input);this.container.append(row);this.inputs.push({key,input});return input;};
      if(this.definition.key==='synthpop'){
        select('View','view','set_view',[['heatmap','Heatmap'],['journeys','Journeys']]);
        const row=element('label','Elapsed trip time'),input=element('input');input.type='range';input.min=0;input.max=1;input.step=1;input.setAttribute('aria-label','Elapsed trip time');
        this.time=element('output','0.0 min');input.oninput=()=>{this.time.textContent=(Number(input.value)/60).toFixed(1)+' min';};input.onchange=()=>send('set_time',Number(input.value));row.append(this.time,input);this.container.append(row);this.inputs.push({key:'timeSeconds',input});
        const rate=select('Playback speed','rate','set_rate',[[60,'1 minute / second'],[120,'2 minutes / second'],[360,'6 minutes / second']]);rate.onchange=()=>send('set_rate',Number(rate.value));
      }else this.departure=select('Departure time','departure','set_departure',[[-1,'Average of available samples']]);
      const actions=element('div');actions.className='actions';
      for(const [text,action]of [['Play','play'],['Pause','pause'],...(this.definition.key==='synthpop'?[['Restart','restart']]:[])]){const b=element('button',text);b.type='button';b.dataset.action=action;b.onclick=()=>send(action);this.buttons.push(b);actions.append(b);}this.container.append(actions);
      this.container.append(element('p',this.definition.note));
      const credits=element('small');for(const [title,url]of [['Research and routing data','https://github.com/SaraAboebeid/slow_walkers'],['Synthetic population','https://zenodo.org/records/10801936']]){const a=element('a',title);a.href=url;a.target='_blank';a.rel='noopener';credits.append(a,document.createTextNode(' · '));}this.container.append(credits);
    }
    update(state,canEdit){
      const current=state||{},ready=!!current.ready;
      this.summary.textContent=current.error||core.summary(current);
      if(this.departure&&ready&&this.departure.options.length!==current.departures.length+1){this.departure.replaceChildren(new Option('Average of available samples',-1),...current.departures.map((t,i)=>new Option(t,i)));}
      for(const {key,input}of this.inputs){
        if(key==='timeSeconds')input.max=current.duration||1;
        if(current[key]!==undefined&&document.activeElement!==input)input.value=current[key];
        input.disabled=!canEdit||!ready||!current.active;
        input.parentElement.hidden=current.key==='synthpop'&&['timeSeconds','rate'].includes(key)&&current.view!=='journeys';
      }
      if(this.time&&document.activeElement!==this.inputs.find(x=>x.key==='timeSeconds')?.input)this.time.textContent=((current.timeSeconds||0)/60).toFixed(1)+' min';
      for(const b of this.buttons){b.disabled=!canEdit||!ready||!current.active;b.hidden=b.dataset.action==='pause'?!current.playing:b.dataset.action==='play'?!!current.playing:false;}
      const entries=current.view==='journeys'&&current.key==='synthpop'?[{color:'#2dd4bf',label:'4.8 km/h · smaller teal marker'},{color:'#fb923c',label:'4.235 km/h · larger orange marker'}]:current.legend||[];
      const signature=JSON.stringify(entries);if(this.signature!==signature){this.signature=signature;this.legend.replaceChildren();for(const entry of entries){const row=element('span'),swatch=element('i');swatch.style.background=entry.color;row.append(swatch,document.createTextNode(entry.label));this.legend.append(row);}}
    }
  }
  window.MR_MOBILITY_CONTROLS=MobilityControls;
  const channel=new BroadcastChannel('map_controller_channel'),states={};let dashboard=null;
  channel.addEventListener('message',({data})=>{if(!['synthpop_state','slow_walkers_state'].includes(data.type))return;states[data.key]=data;if(dashboard?.definition.key===data.key)dashboard.update(data,true);});
  window.showMobilityDashboard=id=>{
    document.getElementById('dashboard-title').textContent=core.DEFINITIONS[id].title;
    document.getElementById('legend-title').textContent='About the model';
    document.getElementById('legend-content').replaceChildren(element('p',core.DEFINITIONS[id].note));
    const content=document.getElementById('dashboard-content');dashboard=new MobilityControls(content,message=>channel.postMessage(message));dashboard.open(id);dashboard.update(states[dashboard.definition.key],true);
    document.getElementById('metadata-content').textContent='Prepared research data · fixed Universeum footprint · host-controlled playback';
    channel.postMessage({type:dashboard.definition.key+'_control',action:'request_state'});
  };
  window.addEventListener('pagehide',()=>channel.close(),{once:true});
})();
