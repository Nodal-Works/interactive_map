(function () {
  'use strict';
  window.mrAsset = path => window.APP_CONFIG.assets[path] || path;
  document.addEventListener('DOMContentLoaded', () => {
    const config = window.APP_CONFIG;
    document.title = config.app.title + (location.pathname.endsWith('launcher.html') ? ' Launcher' : location.pathname.endsWith('controller.html') ? ' Controller' : '');
    const launcherTitle = document.querySelector('.header h1');
    if (location.pathname.endsWith('launcher.html') && launcherTitle) launcherTitle.textContent = config.app.title + ' Launcher';
    const heading=document.querySelector('header h1');
    if(location.pathname.endsWith('controller.html') && heading)heading.textContent=config.app.title+' Dashboard';
    const phoneTitle=document.querySelector('.app-header strong');
    if(phoneTitle)phoneTitle.textContent=config.app.title;
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
