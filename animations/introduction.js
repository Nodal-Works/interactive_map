(function(root) {
  'use strict';
  root.createLindholmenIntroduction = function(map, calibration, schedule = setTimeout) {
    let armed = false;
    return {start() {
      if (armed) return;
      armed = true;
      const view = {center: [calibration.center.lng, calibration.center.lat], zoom: calibration.zoom, bearing: calibration.bearing, pitch: 0};
      map.jumpTo({...view, zoom: view.zoom - 2});
      map.once('click', () => schedule(() => map.flyTo({...view, duration: 6500, curve: 1.6, essential: true,
        easing: t => t < 0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2}), 900));
    }};
  };
})(typeof window === 'undefined' ? globalThis : window);
