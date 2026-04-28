// ===== Slideshow Animation System =====
// Display WMS layers, GeoJSON, images, and video with transitions and metadata

const slideshowCanvas = document.getElementById('slideshow-canvas');
const slideshowCtx = slideshowCanvas ? slideshowCanvas.getContext('2d') : null;
const slideshowBtn = document.getElementById('slideshow-btn');
const slideshowMetadata = document.getElementById('slideshow-metadata');

// BroadcastChannel for controller communication
const slideshowChannel = new BroadcastChannel('map_controller_channel');

// Slideshow state
let slideshowConfig = null;
let currentSlideIndex = 0;
let isSlideShowActive = false;
let slideshowTimer = null;
let currentMediaElement = null;
let currentMediaRotation = 0;
let currentMediaFitMode = 'contain';
let transitionProgress = 0;
let transitionAnimationFrame = null;
let activeWmsLayerId = null; // currently visible WMS layer
let wmsTransitionFrame = null;

// Media cache
const mediaCache = new Map();

// Config path
const SLIDESHOW_CONFIG_PATH = (window.APP_CONFIG && window.APP_CONFIG.data.other.slideshowConfig) || 'media/slideshow/slideshow-config.json';
const SLIDESHOW_MEDIA_PATH = 'media/slideshow/';

// Resolve a slide's media path: absolute paths (containing '/') are used as-is,
// relative names are prefixed with SLIDESHOW_MEDIA_PATH.
function resolveMediaPath(slide) {
  if (!slide.media) return null;
  return slide.media.includes('/') ? slide.media : SLIDESHOW_MEDIA_PATH + slide.media;
}

// Load slideshow configuration
async function loadSlideshowConfig() {
  try {
    const response = await fetch(SLIDESHOW_CONFIG_PATH);
    if (!response.ok) {
      console.warn('Slideshow config not found. Using default empty config.');
      return { slides: [], settings: { loop: true, autoAdvance: true, showMetadata: true, metadataPosition: 'bottom-right' } };
    }
    const config = await response.json();
    return config;
  } catch (error) {
    console.error('Error loading slideshow config:', error);
    return { slides: [], settings: { loop: true, autoAdvance: true, showMetadata: true, metadataPosition: 'bottom-right' } };
  }
}

// Resize slideshow canvas to match table overlay
function resizeSlideshowCanvas() {
  if (!slideshowCanvas) return;
  const s = computeOverlayPixelSize();
  slideshowCanvas.width = s.w;
  slideshowCanvas.height = s.h;
  slideshowCanvas.style.width = s.w + 'px';
  slideshowCanvas.style.height = s.h + 'px';
}

// ========== WMS Layer Management ==========

// Build a unique source/layer id for a slide
function wmsId(index) {
  return 'slideshow-wms-' + index;
}

// Build tile URL for a slide (WMS or ArcGIS MapServer)
function buildTileUrl(slide) {
  const tileSize = 256;
  if (slide.type === 'arcgis') {
    const a = slide.arcgis;
    return a.url + '/export' +
      '?bbox={bbox-epsg-3857}' +
      '&bboxSR=3857&imageSR=3857' +
      '&size=' + tileSize + ',' + tileSize +
      '&format=' + encodeURIComponent(a.format || 'png') +
      '&transparent=' + (a.transparent !== false) +
      '&layers=show:' + (a.layers != null ? a.layers : '0') +
      '&f=image';
  }
  // Default: WMS
  const wms = slide.wms;
  return wms.url +
    '?SERVICE=WMS' +
    '&VERSION=' + encodeURIComponent(wms.version || '1.1.1') +
    '&REQUEST=GetMap' +
    '&LAYERS=' + encodeURIComponent(wms.layers) +
    '&STYLES=' +
    '&SRS=EPSG:3857' +
    '&FORMAT=' + encodeURIComponent(wms.format || 'image/png') +
    '&TRANSPARENT=true' +
    '&WIDTH=' + tileSize +
    '&HEIGHT=' + tileSize +
    '&BBOX={bbox-epsg-3857}';
}

// Add a raster source + layer to the map (hidden initially)
function addWmsLayer(index, slide) {
  const id = wmsId(index);
  if (map.getSource(id)) return; // already added

  const tileSize = 256;
  const url = buildTileUrl(slide);

  map.addSource(id, {
    type: 'raster',
    tiles: [url],
    tileSize: tileSize
  });

  map.addLayer({
    id: id,
    type: 'raster',
    source: id,
    paint: {
      'raster-opacity': 0,
      'raster-fade-duration': 0
    }
  });
}

// Remove a WMS layer + source from the map
function removeWmsLayer(index) {
  const id = wmsId(index);
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
}

// Remove all slideshow raster layers (WMS + ArcGIS)
function removeAllWmsLayers() {
  if (!slideshowConfig || !slideshowConfig.slides) return;
  slideshowConfig.slides.forEach((slide, i) => {
    if (slide.type === 'wms' || slide.type === 'arcgis') removeWmsLayer(i);
  });
  activeWmsLayerId = null;
}

// Animate WMS layer opacity transition (fade in new, fade out old)
function animateWmsTransition(oldLayerId, newLayerId, duration) {
  return new Promise((resolve) => {
    if (wmsTransitionFrame) cancelAnimationFrame(wmsTransitionFrame);
    const startTime = performance.now();

    function step(now) {
      const t = Math.min((now - startTime) / duration, 1);
      // Ease in-out
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      if (newLayerId && map.getLayer(newLayerId)) {
        map.setPaintProperty(newLayerId, 'raster-opacity', ease);
      }
      if (oldLayerId && map.getLayer(oldLayerId)) {
        map.setPaintProperty(oldLayerId, 'raster-opacity', 1 - ease);
      }

      if (t < 1) {
        wmsTransitionFrame = requestAnimationFrame(step);
      } else {
        wmsTransitionFrame = null;
        resolve();
      }
    }
    wmsTransitionFrame = requestAnimationFrame(step);
  });
}

// ========== Legacy media preload (images/video/geojson) ==========

async function preloadMedia(slide) {
  const mediaPath = resolveMediaPath(slide);

  if (mediaCache.has(mediaPath)) {
    return mediaCache.get(mediaPath);
  }

  if (slide.type === 'image' || slide.type === 'gif') {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { mediaCache.set(mediaPath, img); resolve(img); };
      img.onerror = () => reject(new Error(`Failed to load image: ${mediaPath}`));
      img.src = mediaPath;
    });
  } else if (slide.type === 'video') {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.onloadeddata = () => { mediaCache.set(mediaPath, video); resolve(video); };
      video.onerror = () => reject(new Error(`Failed to load video: ${mediaPath}`));
      video.src = mediaPath;
    });
  } else if (slide.type === 'geojson') {
    const response = await fetch(mediaPath);
    const geojson = await response.json();
    mediaCache.set(mediaPath, geojson);
    return geojson;
  }
}

// Draw image/video on canvas
function drawMediaOnCanvas(media, fitMode = 'contain', rotation = 0) {
  if (!slideshowCtx) return;
  const cw = slideshowCanvas.width, ch = slideshowCanvas.height;
  let mw, mh;
  if (media instanceof HTMLVideoElement) { mw = media.videoWidth; mh = media.videoHeight; }
  else { mw = media.width; mh = media.height; }
  if (!mw || !mh) return;

  const rot90 = (rotation === 90 || rotation === 270);
  const ew = rot90 ? mh : mw, eh = rot90 ? mw : mh;
  let dw, dh, dx, dy;
  if (fitMode === 'contain') {
    const s = Math.min(cw / ew, ch / eh); dw = ew * s; dh = eh * s;
  } else if (fitMode === 'cover') {
    const s = Math.max(cw / ew, ch / eh); dw = ew * s; dh = eh * s;
  } else { dw = cw; dh = ch; }
  dx = (cw - dw) / 2; dy = (ch - dh) / 2;

  slideshowCtx.clearRect(0, 0, cw, ch);
  if (rotation !== 0) {
    slideshowCtx.save();
    slideshowCtx.translate(dx + dw / 2, dy + dh / 2);
    slideshowCtx.rotate((rotation * Math.PI) / 180);
    if (rot90) slideshowCtx.drawImage(media, -dh / 2, -dw / 2, dh, dw);
    else slideshowCtx.drawImage(media, -dw / 2, -dh / 2, dw, dh);
    slideshowCtx.restore();
  } else {
    slideshowCtx.drawImage(media, dx, dy, dw, dh);
  }
}

// Canvas transition (for image/video slides)
function animateCanvasTransition(oldMedia, newMedia, transitionType, duration = 500, oldRot = 0, newRot = 0, oldFit = 'contain', newFit = 'contain') {
  return new Promise((resolve) => {
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      if (slideshowCtx) {
        slideshowCtx.clearRect(0, 0, slideshowCanvas.width, slideshowCanvas.height);
        if (oldMedia) { slideshowCtx.globalAlpha = 1 - t; drawMediaOnCanvas(oldMedia, oldFit, oldRot); }
        if (newMedia) { slideshowCtx.globalAlpha = t; drawMediaOnCanvas(newMedia, newFit, newRot); }
        slideshowCtx.globalAlpha = 1;
      }
      if (t < 1) transitionAnimationFrame = requestAnimationFrame(step);
      else resolve();
    }
    transitionAnimationFrame = requestAnimationFrame(step);
  });
}

// Display metadata
function displayMetadata(slide) {
  if (slideshowMetadata) slideshowMetadata.style.display = 'none';
  broadcastSlideshowState(slide);
}

// Broadcast slideshow state to controller window
function broadcastSlideshowState(slide) {
  const total = slideshowConfig && slideshowConfig.slides ? slideshowConfig.slides.length : 0;

  slideshowChannel.postMessage({
    type: 'slideshow_update',
    isActive: isSlideShowActive,
    currentIndex: currentSlideIndex,
    totalSlides: total,
    metadata: slide?.metadata || null,
    slideType: slide?.type || null
  });
}

// Update legend to highlight current attribute - broadcasts to controller only
function highlightLegendItem(slide, propertyValue) {
  slideshowChannel.postMessage({ type: 'slideshow_legend_highlight', highlightValue: propertyValue });
}

// GeoJSON animation state
let geojsonAnimationFrame = null;
let geojsonAnimationActive = false;
let geojsonStepIndex = -1;
let geojsonStepValues = [];
let geojsonStepSlide = null;
let geojsonStepStyle = null;
let geojsonStepBusy = false;

function getGeoJSONStepConfig(slide) {
  const style = slide?.metadata?.style || {};
  const values = style.colorProperty && style.colorMap ? Object.keys(style.colorMap) : [];
  return { style, values };
}

function hasManualGeoJSONSteps(slide) {
  return slide?.type === 'geojson' && getGeoJSONStepConfig(slide).values.length > 0;
}

function resetGeoJSONStepState() {
  geojsonStepIndex = -1;
  geojsonStepValues = [];
  geojsonStepSlide = null;
  geojsonStepStyle = null;
  geojsonStepBusy = false;
  slideshowChannel.postMessage({ type: 'slideshow_legend_highlight', highlightValue: null });
}

function initializeGeoJSONStepState(slide) {
  const { style, values } = getGeoJSONStepConfig(slide);
  geojsonStepIndex = -1;
  geojsonStepValues = values;
  geojsonStepSlide = slide;
  geojsonStepStyle = style;
  geojsonStepBusy = false;
}

function buildGeoJSONValueFilter(propertyName, values) {
  if (!values.length) return ['==', ['get', propertyName], '__slideshow_no_match__'];
  if (values.length === 1) return ['==', ['get', propertyName], values[0]];
  return ['any', ...values.map(v => ['==', ['get', propertyName], v])];
}

function buildGeoJSONColorExpression(propertyName, colorMap, values, fallbackColor) {
  const expr = ['match', ['get', propertyName]];
  values.forEach(v => expr.push(v, colorMap[v]));
  expr.push(fallbackColor);
  return expr;
}

function applyGeoJSONStepState(stepIndex) {
  if (!geojsonStepStyle?.colorProperty || !geojsonStepStyle.colorMap) return;

  const propertyName = geojsonStepStyle.colorProperty;
  const visibleValues = stepIndex >= 0 ? geojsonStepValues.slice(0, stepIndex + 1) : [];
  const visibleFilter = buildGeoJSONValueFilter(propertyName, visibleValues);
  const fillOpacity = geojsonStepStyle.fillOpacity || 0.5;
  const strokeOpacity = geojsonStepStyle.strokeOpacity || 0.8;
  const fillColor = buildGeoJSONColorExpression(propertyName, geojsonStepStyle.colorMap, visibleValues, geojsonStepStyle.fillColor || '#3388ff');
  const lineColor = buildGeoJSONColorExpression(propertyName, geojsonStepStyle.colorMap, visibleValues, geojsonStepStyle.strokeColor || '#0066cc');

  if (map.getLayer('slideshow-fill')) {
    map.setFilter('slideshow-fill', ['all', ['==', ['geometry-type'], 'Polygon'], visibleFilter]);
    map.setPaintProperty('slideshow-fill', 'fill-opacity', visibleValues.length ? fillOpacity : 0);
    map.setPaintProperty('slideshow-fill', 'fill-color', fillColor);
  }
  if (map.getLayer('slideshow-line')) {
    map.setFilter('slideshow-line', ['all', ['==', ['geometry-type'], 'LineString'], visibleFilter]);
    map.setPaintProperty('slideshow-line', 'line-opacity', visibleValues.length ? strokeOpacity : 0);
    map.setPaintProperty('slideshow-line', 'line-color', lineColor);
  }
  if (map.getLayer('slideshow-point')) {
    map.setFilter('slideshow-point', ['all', ['==', ['geometry-type'], 'Point'], visibleFilter]);
    map.setPaintProperty('slideshow-point', 'circle-opacity', visibleValues.length ? 1 : 0);
  }

  highlightLegendItem(geojsonStepSlide, stepIndex >= 0 ? geojsonStepValues[stepIndex] : null);
}

async function stepGeoJSON(direction) {
  if (geojsonStepBusy) return true;
  if (!geojsonStepSlide || !geojsonStepStyle?.colorProperty || !geojsonStepValues.length) return false;

  const targetIndex = geojsonStepIndex + direction;
  if (targetIndex < -1 || targetIndex >= geojsonStepValues.length) return false;

  stopGeoJSONAnimation();
  geojsonStepBusy = true;

  if (direction < 0) {
    geojsonStepIndex = targetIndex;
    applyGeoJSONStepState(geojsonStepIndex);

    if (geojsonStepIndex >= 0) {
      const value = geojsonStepValues[geojsonStepIndex];
      const color = geojsonStepStyle.colorMap[value];
      geojsonAnimationActive = true;
      await animateGlow(value, color, 800, geojsonStepStyle.colorProperty);
      const completed = geojsonAnimationActive;
      stopGeoJSONAnimation();
      if (completed) applyGeoJSONStepState(geojsonStepIndex);
    }

    geojsonStepBusy = false;
    return true;
  }

  const value = geojsonStepValues[targetIndex];
  const color = geojsonStepStyle.colorMap[value];
  geojsonAnimationActive = true;
  highlightLegendItem(geojsonStepSlide, value);
  await animateGlow(value, color, 800, geojsonStepStyle.colorProperty);

  if (geojsonAnimationActive) {
    await animateFill(
      value,
      color,
      400,
      geojsonStepStyle.colorProperty,
      geojsonStepStyle.fillOpacity || 0.5,
      geojsonStepStyle.strokeOpacity || 0.8,
      geojsonStepValues,
      geojsonStepStyle.colorMap
    );
  }

  const completed = geojsonAnimationActive;
  stopGeoJSONAnimation();
  if (completed) {
    geojsonStepIndex = targetIndex;
    applyGeoJSONStepState(geojsonStepIndex);
  }

  geojsonStepBusy = false;
  return completed;
}

function animateGlow(propertyValue, color, duration, propertyName) {
  return new Promise((resolve) => {
    const startTime = performance.now();
    if (!map.getLayer('slideshow-glow')) {
      map.addLayer({ id: 'slideshow-glow', type: 'line', source: 'slideshow-geojson', paint: { 'line-color': color, 'line-width': 0, 'line-blur': 0, 'line-opacity': 0 } });
    }
    function animate(currentTime) {
      if (!geojsonAnimationActive) { resolve(); return; }
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const g = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
      map.setPaintProperty('slideshow-glow', 'line-width', g * 8);
      map.setPaintProperty('slideshow-glow', 'line-blur', g * 10);
      map.setPaintProperty('slideshow-glow', 'line-opacity', g);
      map.setPaintProperty('slideshow-glow', 'line-color', color);
      map.setFilter('slideshow-glow', ['==', ['get', propertyName], propertyValue]);
      if (progress < 1) geojsonAnimationFrame = requestAnimationFrame(animate);
      else resolve();
    }
    geojsonAnimationFrame = requestAnimationFrame(animate);
  });
}

function animateFill(propertyValue, color, duration, propertyName, targetFillOpacity, targetStrokeOpacity, allValues, colorMap) {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const currentIndex = allValues.indexOf(propertyValue);
    const previousValues = allValues.slice(0, currentIndex);
    function animate(currentTime) {
      if (!geojsonAnimationActive) { resolve(); return; }
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const visibleValues = allValues.slice(0, currentIndex + 1);
      const fillOp = ['match', ['get', propertyName]];
      previousValues.forEach(v => fillOp.push(v, targetFillOpacity));
      fillOp.push(propertyValue, progress * targetFillOpacity);
      fillOp.push(0);
      const strokeOp = ['match', ['get', propertyName]];
      previousValues.forEach(v => strokeOp.push(v, targetStrokeOpacity));
      strokeOp.push(propertyValue, progress * targetStrokeOpacity);
      strokeOp.push(0);
      const colExpr = ['match', ['get', propertyName]];
      visibleValues.forEach(v => colExpr.push(v, colorMap[v]));
      colExpr.push('#cccccc');
      const mf = ['any', ...visibleValues.map(v => ['==', ['get', propertyName], v])];
      if (map.getLayer('slideshow-fill')) { map.setFilter('slideshow-fill', ['all', ['==', ['geometry-type'], 'Polygon'], mf]); map.setPaintProperty('slideshow-fill', 'fill-opacity', fillOp); map.setPaintProperty('slideshow-fill', 'fill-color', colExpr); }
      if (map.getLayer('slideshow-line')) { map.setFilter('slideshow-line', ['all', ['==', ['geometry-type'], 'LineString'], mf]); map.setPaintProperty('slideshow-line', 'line-opacity', strokeOp); map.setPaintProperty('slideshow-line', 'line-color', colExpr); }
      if (progress < 1) geojsonAnimationFrame = requestAnimationFrame(animate);
      else resolve();
    }
    geojsonAnimationFrame = requestAnimationFrame(animate);
  });
}

function stopGeoJSONAnimation() {
  geojsonAnimationActive = false;
  if (geojsonAnimationFrame) { cancelAnimationFrame(geojsonAnimationFrame); geojsonAnimationFrame = null; }
  if (map.getLayer('slideshow-glow')) map.removeLayer('slideshow-glow');
}

function removeGeoJSONLayers() {
  stopGeoJSONAnimation();
  resetGeoJSONStepState();
  if (map.getSource('slideshow-geojson')) {
    ['slideshow-fill', 'slideshow-line', 'slideshow-polygon-outline', 'slideshow-point', 'slideshow-glow'].forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
    map.removeSource('slideshow-geojson');
  }
}

async function displayGeoJSON(geojson, slide) {
  stopGeoJSONAnimation();
  if (map.getSource('slideshow-geojson')) {
    ['slideshow-fill', 'slideshow-line', 'slideshow-polygon-outline', 'slideshow-point', 'slideshow-glow'].forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
    map.removeSource('slideshow-geojson');
  }
  map.addSource('slideshow-geojson', { type: 'geojson', data: geojson });
  const style = slide.metadata?.style || {};
  const fillOpacity = style.fillOpacity || 0.4;
  const strokeWidth = style.strokeWidth || 2;
  const pointRadius = style.pointRadius || 5;
  let fillColor, strokeColor, pointColor;
  if (style.colorProperty && style.colorMap) {
    const me = ['match', ['get', style.colorProperty]];
    Object.entries(style.colorMap).forEach(([v, c]) => me.push(v, c));
    me.push(style.fillColor || '#3388ff');
    fillColor = me;
    strokeColor = style.strokeColor || ['match', ['get', style.colorProperty], ...Object.entries(style.colorMap).flatMap(([v, c]) => [v, c]), style.strokeColor || '#0066cc'];
    pointColor = me;
  } else {
    fillColor = style.fillColor || '#3388ff';
    strokeColor = style.strokeColor || '#0066cc';
    pointColor = style.pointColor || '#ff7800';
  }
  map.addLayer({ id: 'slideshow-fill', type: 'fill', source: 'slideshow-geojson', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': fillColor, 'fill-opacity': 0 } });
  map.addLayer({ id: 'slideshow-line', type: 'line', source: 'slideshow-geojson', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': strokeColor, 'line-width': strokeWidth, 'line-opacity': 0 } });
  map.addLayer({ id: 'slideshow-polygon-outline', type: 'line', source: 'slideshow-geojson', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'line-color': strokeColor, 'line-width': 1, 'line-opacity': 0.3 } });
  map.addLayer({ id: 'slideshow-point', type: 'circle', source: 'slideshow-geojson', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': pointRadius, 'circle-color': pointColor, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1, 'circle-opacity': 1 } });

  if (hasManualGeoJSONSteps(slide)) {
    initializeGeoJSONStepState(slide);
    applyGeoJSONStepState(-1);
  } else {
    map.setPaintProperty('slideshow-fill', 'fill-opacity', fillOpacity);
    map.setPaintProperty('slideshow-line', 'line-opacity', style.strokeOpacity || 0.8);
    map.setPaintProperty('slideshow-polygon-outline', 'line-opacity', 1);
  }
}

function clearSlideshowTimer() {
  if (slideshowTimer) { clearTimeout(slideshowTimer); slideshowTimer = null; }
}

function goToNextSlide() {
  currentSlideIndex++;
  if (currentSlideIndex >= slideshowConfig.slides.length) {
    if (slideshowConfig.settings.loop) currentSlideIndex = 0;
    else { stopSlideshow(); return; }
  }
  displaySlide(currentSlideIndex);
}

function goToPreviousSlide() {
  currentSlideIndex = currentSlideIndex - 1;
  if (currentSlideIndex < 0) currentSlideIndex = slideshowConfig.slides.length - 1;
  displaySlide(currentSlideIndex);
}

async function navigateSlide(direction) {
  if (!isSlideShowActive || !slideshowConfig) return;

  clearSlideshowTimer();
  if (currentMediaElement instanceof HTMLVideoElement) currentMediaElement.pause();

  const stepped = await stepGeoJSON(direction);
  if (stepped) return;

  stopGeoJSONAnimation();
  if (direction > 0) goToNextSlide();
  else goToPreviousSlide();
}

// ========== Main slide display ==========

// Clean up the previous slide's visuals (WMS, GeoJSON, canvas)
function cleanupPreviousSlide(previousType) {
  // Hide canvas
  if (slideshowCanvas) slideshowCanvas.classList.remove('active');
  if (slideshowCtx) slideshowCtx.clearRect(0, 0, slideshowCanvas.width, slideshowCanvas.height);
  // Stop video
  if (currentMediaElement instanceof HTMLVideoElement) currentMediaElement.pause();
  currentMediaElement = null;
  // GeoJSON
  removeGeoJSONLayers();
}

async function displaySlide(index) {
  if (!slideshowConfig || !slideshowConfig.slides || index >= slideshowConfig.slides.length) return;

  const slide = slideshowConfig.slides[index];
  const transitionDuration = slideshowConfig.settings.wmsTransitionDuration || 1000;

  // --- WMS / ArcGIS raster slide ---
  if (slide.type === 'wms' || slide.type === 'arcgis') {
    // Hide canvas
    if (slideshowCanvas) slideshowCanvas.classList.remove('active');
    if (slideshowCtx) slideshowCtx.clearRect(0, 0, slideshowCanvas.width, slideshowCanvas.height);
    if (currentMediaElement instanceof HTMLVideoElement) currentMediaElement.pause();
    currentMediaElement = null;
    removeGeoJSONLayers();

    // Ensure the WMS layer is added
    addWmsLayer(index, slide);
    const newId = wmsId(index);
    const oldId = activeWmsLayerId;

    // Cross-fade
    await animateWmsTransition(oldId, newId, transitionDuration);

    // After transition, fully hide old layer
    if (oldId && oldId !== newId && map.getLayer(oldId)) {
      map.setPaintProperty(oldId, 'raster-opacity', 0);
    }
    activeWmsLayerId = newId;
    displayMetadata(slide);

  // --- GeoJSON slide ---
  } else if (slide.type === 'geojson') {
    // Fade out active WMS if any
    if (activeWmsLayerId && map.getLayer(activeWmsLayerId)) {
      await animateWmsTransition(activeWmsLayerId, null, transitionDuration / 2);
      activeWmsLayerId = null;
    }
    currentMediaElement = null;
    if (slideshowCanvas) slideshowCanvas.classList.remove('active');
    if (slideshowCtx) slideshowCtx.clearRect(0, 0, slideshowCanvas.width, slideshowCanvas.height);
    displayMetadata(slide);
    const media = await preloadMedia(slide);
    await displayGeoJSON(media, slide);

  // --- Video slide ---
  } else if (slide.type === 'video') {
    if (activeWmsLayerId && map.getLayer(activeWmsLayerId)) {
      await animateWmsTransition(activeWmsLayerId, null, transitionDuration / 2);
      activeWmsLayerId = null;
    }
    removeGeoJSONLayers();
    if (slideshowCanvas) slideshowCanvas.classList.add('active');
    const media = await preloadMedia(slide);
    const oldMedia = currentMediaElement;
    media.currentTime = 0;
    await media.play();
    currentMediaElement = media;
    currentMediaRotation = slide.rotation || 0;
    currentMediaFitMode = slide.fitMode || 'contain';
    await animateCanvasTransition(oldMedia, media, 'fade', 500, 0, currentMediaRotation, 'contain', currentMediaFitMode);
    (function drawVideoFrame() {
      if (isSlideShowActive && currentSlideIndex === index && !media.paused && !media.ended) {
        drawMediaOnCanvas(media, currentMediaFitMode, currentMediaRotation);
        requestAnimationFrame(drawVideoFrame);
      }
    })();
    displayMetadata(slide);

  // --- Image / gif slide ---
  } else {
    if (activeWmsLayerId && map.getLayer(activeWmsLayerId)) {
      await animateWmsTransition(activeWmsLayerId, null, transitionDuration / 2);
      activeWmsLayerId = null;
    }
    removeGeoJSONLayers();
    if (slideshowCanvas) slideshowCanvas.classList.add('active');
    const media = await preloadMedia(slide);
    const oldMedia = currentMediaElement;
    currentMediaElement = media;
    currentMediaRotation = slide.rotation || 0;
    currentMediaFitMode = slide.fitMode || 'contain';
    await animateCanvasTransition(oldMedia, media, 'fade', 500, 0, currentMediaRotation, 'contain', currentMediaFitMode);
    displayMetadata(slide);
  }

  // Schedule next slide (auto-advance)
  if (slideshowConfig.settings.autoAdvance && !hasManualGeoJSONSteps(slide)) {
    const duration = slide.duration || 5000;
    slideshowTimer = setTimeout(() => advanceSlide(), duration);
  }
}

// Advance to next slide
function advanceSlide() {
  if (!isSlideShowActive || !slideshowConfig) return;
  navigateSlide(1);
}

// Start slideshow
async function startSlideshow() {
  if (isSlideShowActive) { stopSlideshow(); return; }

  slideshowConfig = await loadSlideshowConfig();
  if (!slideshowConfig.slides || slideshowConfig.slides.length === 0) {
    showToast('No slides found in slideshow configuration');
    broadcastSlideshowState(null);
    return;
  }

  isSlideShowActive = true;
  currentSlideIndex = 0;
  slideshowChannel.postMessage({ type: 'animation_state', animationId: 'slideshow-btn', isActive: true });

  if (slideshowConfig.slides.length > 0) {
    broadcastSlideshowState(slideshowConfig.slides[0]);
  }

  if (slideshowCanvas) resizeSlideshowCanvas();
  if (slideshowMetadata) slideshowMetadata.style.display = 'block';
  if (slideshowBtn) slideshowBtn.classList.add('active');

  displaySlide(currentSlideIndex);
  showToast('Slideshow started • Use ← → to navigate • ESC to exit');
}

// Stop slideshow
function stopSlideshow() {
  isSlideShowActive = false;
  slideshowChannel.postMessage({ type: 'animation_state', animationId: 'slideshow-btn', isActive: false });

  if (slideshowTimer) { clearTimeout(slideshowTimer); slideshowTimer = null; }
  if (currentMediaElement instanceof HTMLVideoElement) currentMediaElement.pause();
  if (transitionAnimationFrame) { cancelAnimationFrame(transitionAnimationFrame); transitionAnimationFrame = null; }
  if (wmsTransitionFrame) { cancelAnimationFrame(wmsTransitionFrame); wmsTransitionFrame = null; }
  stopGeoJSONAnimation();

  if (slideshowCtx) slideshowCtx.clearRect(0, 0, slideshowCanvas.width, slideshowCanvas.height);
  if (slideshowCanvas) slideshowCanvas.classList.remove('active');
  if (slideshowMetadata) slideshowMetadata.style.display = 'none';

  // Remove GeoJSON layers
  removeGeoJSONLayers();

  // Remove all WMS layers
  removeAllWmsLayers();

  if (slideshowBtn) slideshowBtn.classList.remove('active');
  currentMediaElement = null;
  currentSlideIndex = 0;

  slideshowChannel.postMessage({ type: 'slideshow_update', isActive: false, currentIndex: 0, totalSlides: 0, metadata: null, slideType: null });
  showToast('Slideshow stopped');
}

// Wire up slideshow button
if (slideshowBtn) {
  slideshowBtn.addEventListener('click', startSlideshow);
}

// Resize canvas on window resize
window.addEventListener('resize', () => {
  if (isSlideShowActive && slideshowCanvas) {
    resizeSlideshowCanvas();
    if (currentMediaElement && !(currentMediaElement instanceof HTMLVideoElement)) {
      drawMediaOnCanvas(currentMediaElement, currentMediaFitMode, currentMediaRotation);
    }
  }
});

// Keyboard controls
document.addEventListener('keydown', (e) => {
  if (!isSlideShowActive) return;
  if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault();
    navigateSlide(1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    navigateSlide(-1);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    stopSlideshow();
  }
});

// Listen for controller messages
slideshowChannel.addEventListener('message', (event) => {
  const data = event.data;
  if (data.type !== 'slideshow_control') return;
  if (data.action === 'next') {
    if (!isSlideShowActive) return;
    navigateSlide(1);
  } else if (data.action === 'previous') {
    if (!isSlideShowActive) return;
    navigateSlide(-1);
  } else if (data.action === 'stop') {
    stopSlideshow();
  } else if (data.action === 'request_status') {
    const slide = slideshowConfig?.slides?.[currentSlideIndex];
    broadcastSlideshowState(slide);
  }
});
