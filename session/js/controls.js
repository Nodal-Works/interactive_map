(function(){
  'use strict';
  const definitions={
    'cfd-simulation-btn':{state:'cfd',type:'cfd_control',fields:[
      ['wind-speed','Wind speed','range','windSpeed','set_wind_speed',1,20,.5,5,' m/s'],
      ['wind-direction','Wind direction','range','angle','set_wind_direction',0,360,15,0,'°'],
      ['wind-trees','Include trees','checkbox','trees','toggle_trees',true],
      ['wind-visual-style','Display style','select','visualStyle','set_visual_style',['ribbons','particles'],'ribbons','advanced'],
      ['wind-palette','Colour palette','select','palette','set_color_palette',['classic','ocean','ember','monochrome'],'classic','advanced'],
      ['wind-color-range','Colour range (m/s)','select','colorMaxMps','set_color_range',[5,10,20,40],20,'advanced'],
      ['wind-facade-glow','Wind-impact glow','checkbox','facadeGlow','set_facade_glow',true,'advanced'],
      ['particle-count','Visual density','select','particles','set_particles',[200,500,1000],500,'advanced'],
      ['particle-speed','Playback speed','range','playback','set_particle_speed',2,40,2,20,'×','advanced'],
      ['viscosity','Viscosity','range','viscosity','set_viscosity',0,1,.01,.077,'','advanced'],
      ['grid-resolution','Resolution','select','resolution','set_resolution',[100,150,200,250,300],150,'advanced']
    ]},
    'isovist-btn':{state:'isovist',type:'isovist_control',fields:[
      ['isovist-radius','View radius','range','radius','set_radius',50,500,10,200,' m'],
      ['isovist-fov','Field of view','range','fov','set_fov',30,180,5,120,'°'],
      ['isovist-360','Full 360° view','checkbox','humanFov','toggle_360',false],
      ['isovist-trees','Include trees','checkbox','trees','toggle_trees',true],
      ['isovist-sound','Ambient sound','checkbox','ambientSound','toggle_ambient_sound',false,'advanced'],
      ['isovist-volume','Volume','range','volume','set_ambient_volume',0,1,.1,.5,'','advanced']
    ]},
    'sun-study-btn':{state:'sun',type:'sun_control',fields:[
      ['sun-date','Date','date','date','set_date','2026-06-21'],
      ['sun-time','Time of day','range','time','set_time',0,24,.25,12,' h'],
      ['sun-animate-btn','Animate','checkbox','animating','toggle_animation',false],
      ['toggle-trees-btn','Include trees','checkbox','trees','toggle_trees',false],
      ['false-color-btn','Exposure colours','checkbox','falseColor','toggle_false_color',false],
      ['shadow-opacity','Shadow opacity','range','opacity','set_opacity',.1,1,.1,.8,'','advanced'],
      ['sun-speed','Animation speed','range','speed','set_speed',.5,5,.5,2,'×','advanced']
    ]},
    'thermal-comfort-btn':{state:'thermal',type:'thermal_control',fields:[
      ['comfort-mode','Map input','select','mode','set_mode',['route','inspect'],'route'],
      ['comfort-hour','Hour','range','hour','set_hour',8,20,1,14,':00'],
      ['comfort-raster','Show comfort on table','checkbox','showRaster','show_raster',true],
      ['comfort-streets','Show streets on table','checkbox','showStreets','show_streets',true]
    ],actions:[['Clear route','clear_route'],['Play tour','tour_play'],['Pause tour','tour_pause'],['Previous','tour_back'],['Next','tour_next'],['End tour','tour_end']]},
    'bird-sounds-btn':{type:'bird_control',fields:[['bird-volume','Volume','range','volume','set_volume',0,1,.1,.5,'']],actions:[['Stop sounds','stop_all']]},
    'slideshow-btn':{type:'slideshow_control',actions:[['Previous','previous'],['Next','next'],['Stop','stop']]},
    'campus-demo-btn':{type:'campus_demo_control',actions:[['Play','autoplay'],['Previous','previous'],['Next','next'],['Stop','stop']]},
    'fcc-demo-btn':{type:'fcc_demo_control',fields:[['fcc-progress','Position','range','progress','seek',0,1,.01,0,''],['fcc-speed','Speed','range','speed','set_speed',.25,2,.25,1,'×']],actions:[['Play','play'],['Pause','pause']]}
  };
  class Controls {
    constructor(element,send){this.element=element;this.send=send;}
    open(layer){
      this.definition=definitions[layer.id]||{};this.layer=layer.id;this.inputs=[];this.element.replaceChildren();
      const lead=document.createElement('p');lead.className='control-note';lead.textContent=layer.tool?'Use Map to place your input. See the result on the table.':'See and hear the result on the table.';this.element.append(lead);
      const advanced=document.createElement('details'),summary=document.createElement('summary');summary.textContent='More settings';advanced.append(summary);
      for(const field of this.definition.fields||[]){
        const[id,label,kind,key,action,...options]=field,wrapper=document.createElement('label'),caption=document.createElement('span'),input=document.createElement(kind==='select'?'select':'input'),value=document.createElement('output');
        wrapper.className='phone-control '+kind;caption.textContent=label;input.id=id;input.setAttribute('aria-label',label);wrapper.append(caption);
        let initial;
        if(kind==='range'){[input.min,input.max,input.step,initial]=options;input.type='range';wrapper.append(value,input);input.oninput=()=>{value.textContent=input.value+(options[4]||'');};}
        else if(kind==='select'){for(const item of options[0])input.add(new Option(String(item),String(item)));initial=options[1];wrapper.append(input);}
        else {input.type=kind;initial=options[0];wrapper.append(input);}
        if(kind==='checkbox')input.checked=initial;else input.value=initial;
        input.oninput?.();
        // Sliders render instantly here; commit once on release instead of
        // rebuilding the host simulation for every intermediate pixel.
        input.onchange=()=>{let v=kind==='checkbox'?input.checked:kind==='range'||kind==='select'&&typeof initial==='number'?Number(input.value):input.value;
          this.send({type:'control',message:{type:this.definition.type,action,value:v}});};
        this.inputs.push({input,value,kind,key,options});(options.includes('advanced')?advanced:this.element).append(wrapper);
      }
      if(advanced.children.length>1)this.element.append(advanced);
      if(this.definition.actions){const actions=document.createElement('div');actions.className='actions';
        for(const[label,action]of this.definition.actions){const button=document.createElement('button');button.textContent=label;button.onclick=()=>this.send({type:'control',message:{type:this.definition.type,action}});actions.append(button);}this.element.append(actions);}
    }
    update(state,canEdit){
      const values=state?.[this.definition?.state]||{};
      for(const{input,kind,key}of this.inputs||[]){
        let v=values[key];if(key==='viscosity'&&v!==undefined)v=(v-.02)/.13;
        if(key==='humanFov'&&v!==undefined)v=!v;
        if(v!==undefined&&document.activeElement!==input){if(kind==='checkbox')input.checked=!!v;else input.value=v;input.oninput?.();}
        input.disabled=!canEdit||(input.id==='isovist-fov'&&values.humanFov===false);
      }
      for(const button of this.element.querySelectorAll('button'))button.disabled=!canEdit;
    }
  }
  window.MR_CONTROLS=Controls;
})();
