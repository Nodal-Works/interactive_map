(function () {
  'use strict';
  window.mrAsset = path => window.APP_CONFIG.assets[path] || path;
  document.addEventListener('DOMContentLoaded', () => {
    const config = window.APP_CONFIG;
    if(config.branding?.logos?.length){
      for(const container of document.querySelectorAll('.logo-container')){
        container.replaceChildren(...config.branding.logos.map(logo=>{const img=document.createElement('img');img.src=logo.src;img.alt=logo.alt;img.className='welcome-logo';return img;}));
      }
    }
    if(config.layerCatalog?.some(layer=>layer.id==='trafik-btn')){
      const anchor=document.getElementById('bird-sounds-btn');
      if(anchor){
        const button=anchor.cloneNode(false);button.id='trafik-btn';button.textContent='🚌';button.title='Live transit';
        const channel=new BroadcastChannel('map_controller_channel');
        button.onclick=async()=>{if(window.trafikAnimation.isActive())window.trafikAnimation.stop();else await window.trafikAnimation.start();const isActive=window.trafikAnimation.isActive();button.classList.toggle('active',isActive);channel.postMessage({type:'animation_state',animationId:'trafik-btn',isActive});};anchor.after(button);
      }
      const controllerAnchor=document.querySelector('[data-target="bird-sounds-btn"]');
      if(controllerAnchor){const button=controllerAnchor.cloneNode(false);button.dataset.target='trafik-btn';button.textContent='🚌';button.title='Live transit';const channel=new BroadcastChannel('map_controller_channel');button.onclick=()=>channel.postMessage({type:'control_action',target:'trafik-btn',action:'click'});controllerAnchor.after(button);}
    }
    if(config.presentation?.intro && document.getElementById('map')){
      const controls=document.createElement('div');controls.style.cssText='position:fixed;bottom:12px;right:12px;z-index:20000;display:flex;gap:8px';
      for(const [label,action] of [['Replay intro','mrPlayIntroduction'],['Skip intro','mrSkipIntroduction']]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>window[action]?.();controls.append(button);}
      document.body.append(controls);
    }
    if(config.culturalSites?.length){
      const mapButton=document.getElementById('bird-sounds-btn');
      if(mapButton){const button=mapButton.cloneNode(false);button.id='cultural-gravity-btn';button.textContent='◎';button.title='Cultural Gravity';mapButton.after(button);}
      const controllerButton=document.querySelector('[data-target="bird-sounds-btn"]');
      if(controllerButton){const button=controllerButton.cloneNode(false);button.dataset.target='cultural-gravity-btn';button.textContent='◎';button.title='Cultural Gravity';button.onclick=()=>new BroadcastChannel('map_controller_channel').postMessage({type:'control_action',action:'click',target:'cultural-gravity-btn'});controllerButton.after(button);}
    }
    if(['localhost','127.0.0.1'].includes(location.hostname) && !location.pathname.includes('/session/')){
      const version=config.location?.version;
      setInterval(async()=>{try{const response=await fetch('/api/locations/active');if(!response.ok)return;const current=await response.json();if(current.id!==(config.location?.id || null)||current.version!==version)location.reload();}catch{}},3000);
    }
    document.title = config.app.title + (location.pathname.endsWith('launcher.html') ? ' Launcher' : location.pathname.endsWith('controller.html') ? ' Controller' : '');
    const launcherTitle = document.querySelector('.header h1');
    if (location.pathname.endsWith('launcher.html') && launcherTitle) launcherTitle.textContent = config.app.title + ' Launcher';
    const heading=document.querySelector('header h1');
    if(location.pathname.endsWith('controller.html') && heading)heading.textContent=config.app.title+' Dashboard';
    const phoneTitle=document.querySelector('.app-header strong');
    if(phoneTitle)phoneTitle.textContent=config.app.title;
    if(config.branding?.logos?.length){document.querySelectorAll('.sidebar-logo').forEach((img,index)=>{const logo=config.branding.logos[index%config.branding.logos.length];img.src=logo.src;img.alt=logo.alt;});}
    document.querySelectorAll('.sidebar-title').forEach(el => {el.textContent = config.app.title;});
    document.querySelectorAll('.welcome-title').forEach(el => {el.textContent = config.app.welcomeTitle;});
    document.querySelectorAll('img').forEach(el => {
      const source = el.getAttribute('src');
      const key = {'media/chalmers_logo.png':'chalmers','media/dtcc_logo.png':'dtcc','media/survey_qr.png':'survey'}[source];
      if (key) el.src = config.images[key];
    });
    for (const id of config.disabledLayers) {
      const button=document.getElementById(id);
      if(button){button.hidden=true;button.style.display='none';}
      document.querySelectorAll(`[data-target="${id}"]`).forEach(el => {
        const target=el.closest('.host-layer-row') || el;target.hidden=true;target.style.display='none';
      });
    }
  });
})();
