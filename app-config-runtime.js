(function () {
  'use strict';
  window.mrAsset = path => window.APP_CONFIG.assets[path] || path;
  document.addEventListener('DOMContentLoaded', () => {
    const config = window.APP_CONFIG;
    document.title = config.app.title + (location.pathname.endsWith('launcher.html') ? ' Launcher' : location.pathname.endsWith('controller.html') ? ' Controller' : '');
    const launcherTitle = document.querySelector('.header h1');
    if (location.pathname.endsWith('launcher.html') && launcherTitle) launcherTitle.textContent = config.app.title + ' Launcher';
    document.querySelectorAll('.sidebar-title').forEach(el => {el.textContent = config.app.title;});
    document.querySelectorAll('.welcome-title').forEach(el => {el.textContent = config.app.welcomeTitle;});
    document.querySelectorAll('img').forEach(el => {
      const source = el.getAttribute('src');
      const key = {'media/chalmers_logo.png':'chalmers','media/dtcc_logo.png':'dtcc','media/survey_qr.png':'survey'}[source];
      if (key) el.src = config.images[key];
    });
    for (const id of config.disabledLayers) {
      document.getElementById(id)?.setAttribute('hidden', '');
      document.querySelectorAll(`[data-target="${id}"]`).forEach(el => {el.hidden = true;});
    }
  });
})();
