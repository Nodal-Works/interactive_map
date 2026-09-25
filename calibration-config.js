// Host-only calibration resolution. Never included in the published phone client.
(function () {
  'use strict';
  const config = window.APP_CONFIG;
  const valid = c => c?.center && [c.center.lng, c.center.lat, c.zoom, c.bearing].every(Number.isFinite);
  let original = config.calibration.fallback;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', config.calibration.path, false);
    xhr.send();
    if (xhr.status === 200) {
      const value = JSON.parse(xhr.responseText);
      if (valid(value)) original = value;
    }
  } catch (error) { console.warn('Using configured calibration fallback', error); }
  let current = original;
  try {
    const selected = localStorage.getItem((window.APP_CONFIG.calibration.storagePrefix + 'selected_calibration'));
    const history = JSON.parse(localStorage.getItem((window.APP_CONFIG.calibration.storagePrefix + 'calibrations')) || '[]');
    const saved = history.find(c => c.id === selected) || JSON.parse(localStorage.getItem((window.APP_CONFIG.calibration.storagePrefix + 'default_calibration')) || 'null');
    if (selected !== 'original' && valid(saved)) current = saved;
  } catch (error) { console.warn('Using project calibration', error); }
  function dimensions(value) {
    return Object.fromEntries(['screenWidth','screenHeight','tableWidth','tableHeight'].map(key =>
      [key, Number.isFinite(value?.[key]) && value[key] > 0 ? value[key] : config.table[key]]));
  }
  window.MR_CALIBRATION = {original, current, dimensions: dimensions(current.dimensions),
    applyDimensions(value) {
      this.dimensions = dimensions(value);
      window.dispatchEvent(new Event('resize'));
    }};
})();
