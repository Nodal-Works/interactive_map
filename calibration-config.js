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
  // A running host may still use the previous frontend generator until restart.
  // The profile itself remains authoritative for an uncalibrated table.
  if(original===config.calibration.fallback && config.table.fitToTable && original.fitBounds && original.fitToTable===undefined) {
    original={...original,fitToTable:true,tableFlip:original.tableFlip ?? false};
  }
  let current = original;
  try {
    const selected = localStorage.getItem((window.APP_CONFIG?.location?.id ? 'interactive_map_selected_calibration:' + window.APP_CONFIG.location.id : 'interactive_map_selected_calibration'));
    const history = JSON.parse(localStorage.getItem((window.APP_CONFIG?.location?.id ? 'interactive_map_calibrations:' + window.APP_CONFIG.location.id : 'interactive_map_calibrations')) || '[]');
    const saved = history.find(c => c.id === selected) || JSON.parse(localStorage.getItem((window.APP_CONFIG?.location?.id ? 'interactive_map_default_calibration:' + window.APP_CONFIG.location.id : 'interactive_map_default_calibration')) || 'null');
    if (selected !== 'original' && valid(saved)) current = saved;
  } catch (error) { console.warn('Using project calibration', error); }
  function dimensions(value, legacy=false) {
    const result = Object.fromEntries(['screenWidth','screenHeight','tableWidth','tableHeight','tileSize','sidebarWidth'].map(key =>
      [key, Number.isFinite(value?.[key]) && value[key] > 0 ? value[key] : (legacy ? ({screenWidth:111.93,screenHeight:62.96,tableWidth:100,tableHeight:60,tileSize:20,sidebarWidth:7.5})[key] : (config.table[key] ?? (key==='sidebarWidth' ? 7.5 : undefined)))]));
    for (const key of ['columns','rows']) {
      const count=value?.[key] ?? (legacy ? undefined : config.table[key]);
      if (Number.isInteger(count) && count>0) result[key]=count;
    }
    result.layoutMode=value?.layoutMode || (legacy ? 'legacy' : config.table.layoutMode || 'legacy');
    if (!['legacy','preview','projector'].includes(result.layoutMode)) result.layoutMode='legacy';
    return result;
  }
  window.MR_CALIBRATION = {original, current,
    dimensions: dimensions(current.dimensions, current!==original && !current.dimensions?.layoutMode),
    applyDimensions(value, legacy=false) {
      this.dimensions = dimensions(value, legacy);
      window.dispatchEvent(new Event('resize'));
    }};
})();
