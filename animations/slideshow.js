// ===== Slideshow Animation System =====
// Display image/video/gif/geojson media with transitions and metadata

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
let currentMediaRotation = 0; // Track rotation of current media
let currentMediaFitMode = 'contain'; // Track fitMode of current media
let transitionProgress = 0;
let transitionAnimationFrame = null;

let slideStatus = 'idle', slideError = null;
let slideJob = null, startRevision = 0;
const rasterSlides = new window.MR_RASTER_SLIDES.RasterSlides(map);

// Media cache
const mediaCache = new Map();

// Config path
const SLIDESHOW_CONFIG_PATH = window.mrAsset('media/slideshow/slideshow-config.json');
const SLIDESHOW_MEDIA_PATH = 'media/slideshow/';

// Load slideshow configuration
async function loadSlideshowConfig() {
  try {
    const response = await fetch(SLIDESHOW_CONFIG_PATH);
    if (!response.ok) {
      console.warn('Slideshow config not found. Using default empty config.');
      return { slides: [], settings: { loop: true, autoAdvance: true, showMetadata: true, metadataPosition: 'bottom-right', fitMode: 'contain' } };
    }
    const config = await response.json();
    config.slides = (config.slides || []).filter(slide => slide.enabled !== false);
    config.settings ||= {};
    return config;
  } catch (error) {
    console.error('Error loading slideshow config:', error);
    return { slides: [], settings: { loop: true, autoAdvance: true, showMetadata: true, metadataPosition: 'bottom-right', fitMode: 'contain' } };
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

// Preload media
async function preloadMedia(slide) {
  const mediaPath = window.mrAsset(slide.media.includes('/') ? slide.media : SLIDESHOW_MEDIA_PATH + slide.media);
  
  if (mediaCache.has(mediaPath)) {
    return mediaCache.get(mediaPath);
  }
  
  if (slide.type === 'image' || slide.type === 'gif') {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        mediaCache.set(mediaPath, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${mediaPath}`));
      img.src = mediaPath;
    });
  } else if (slide.type === 'video') {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      video.onloadeddata = () => {
        mediaCache.set(mediaPath, video);
        resolve(video);
      };
      video.onerror = () => reject(new Error(`Failed to load video: ${mediaPath}`));
      video.src = mediaPath;
    });
  } else if (slide.type === 'geojson') {
    try {
      const response = await fetch(mediaPath);
      const geojson = await response.json();
      mediaCache.set(mediaPath, geojson);
      return geojson;
    } catch (error) {
      throw new Error(`Failed to load GeoJSON: ${mediaPath}`);
    }
  }
}

// Draw image/video on canvas with fit mode and optional rotation
function drawMediaOnCanvas(media, fitMode = 'contain', rotation = 0) {
  if (!slideshowCtx) return;
  
  const canvasWidth = slideshowCanvas.width;
  const canvasHeight = slideshowCanvas.height;
  
  let mediaWidth, mediaHeight;
  
  if (media instanceof HTMLVideoElement) {
    mediaWidth = media.videoWidth;
    mediaHeight = media.videoHeight;
  } else {
    mediaWidth = media.width;
    mediaHeight = media.height;
  }
  
  if (!mediaWidth || !mediaHeight) return;
  
  // If rotating 90 or 270 degrees, swap dimensions for aspect ratio calculation
  const rotatedDimensions = (rotation === 90 || rotation === 270);
  const effectiveMediaWidth = rotatedDimensions ? mediaHeight : mediaWidth;
  const effectiveMediaHeight = rotatedDimensions ? mediaWidth : mediaHeight;
  
  let drawWidth, drawHeight, drawX, drawY;
  
  if (fitMode === 'contain') {
    // Scale to fit inside canvas while maintaining aspect ratio
    const scale = Math.min(canvasWidth / effectiveMediaWidth, canvasHeight / effectiveMediaHeight);
    drawWidth = effectiveMediaWidth * scale;
    drawHeight = effectiveMediaHeight * scale;
    drawX = (canvasWidth - drawWidth) / 2;
    drawY = (canvasHeight - drawHeight) / 2;
  } else if (fitMode === 'cover') {
    // Scale to cover entire canvas while maintaining aspect ratio
    const scale = Math.max(canvasWidth / effectiveMediaWidth, canvasHeight / effectiveMediaHeight);
    drawWidth = effectiveMediaWidth * scale;
    drawHeight = effectiveMediaHeight * scale;
    drawX = (canvasWidth - drawWidth) / 2;
    drawY = (canvasHeight - drawHeight) / 2;
  } else {
    // Stretch to fill canvas
    drawWidth = canvasWidth;
    drawHeight = canvasHeight;
    drawX = 0;
    drawY = 0;
  }
  
  slideshowCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  
  // Apply rotation if needed
  if (rotation !== 0) {
    slideshowCtx.save();
    
    // Move to center of where the image will be drawn
    const centerX = drawX + drawWidth / 2;
    const centerY = drawY + drawHeight / 2;
    
    slideshowCtx.translate(centerX, centerY);
    slideshowCtx.rotate((rotation * Math.PI) / 180);
    
    // For 90/270 degree rotations, we need to adjust the drawing rectangle
    // because the image dimensions are swapped
    if (rotatedDimensions) {
      slideshowCtx.drawImage(media, -drawHeight / 2, -drawWidth / 2, drawHeight, drawWidth);
    } else {
      slideshowCtx.drawImage(media, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    }
    
    slideshowCtx.restore();
  } else {
    slideshowCtx.drawImage(media, drawX, drawY, drawWidth, drawHeight);
  }
}

// Apply transition effect
function applyTransition(oldMedia, newMedia, progress, transitionType, oldRotation = 0, newRotation = 0, oldFitMode = 'contain', newFitMode = 'contain') {
  if (!slideshowCtx) return;
  
  const canvasWidth = slideshowCanvas.width;
  const canvasHeight = slideshowCanvas.height;
  
  slideshowCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  
  switch (transitionType) {
    case 'fade':
      if (oldMedia) {
        slideshowCtx.globalAlpha = 1 - progress;
        drawMediaOnCanvas(oldMedia, oldFitMode, oldRotation);
      }
      if (newMedia) {
        slideshowCtx.globalAlpha = progress;
        drawMediaOnCanvas(newMedia, newFitMode, newRotation);
      }
      slideshowCtx.globalAlpha = 1;
      break;
      
    case 'slide-left':
      if (oldMedia) {
        slideshowCtx.save();
        slideshowCtx.translate(-canvasWidth * progress, 0);
        drawMediaOnCanvas(oldMedia, oldFitMode, oldRotation);
        slideshowCtx.restore();
      }
      if (newMedia) {
        slideshowCtx.save();
        slideshowCtx.translate(canvasWidth * (1 - progress), 0);
        drawMediaOnCanvas(newMedia, newFitMode, newRotation);
        slideshowCtx.restore();
      }
      break;
      
    case 'slide-right':
      if (oldMedia) {
        slideshowCtx.save();
        slideshowCtx.translate(canvasWidth * progress, 0);
        drawMediaOnCanvas(oldMedia, oldFitMode, oldRotation);
        slideshowCtx.restore();
      }
      if (newMedia) {
        slideshowCtx.save();
        slideshowCtx.translate(-canvasWidth * (1 - progress), 0);
        drawMediaOnCanvas(newMedia, newFitMode, newRotation);
        slideshowCtx.restore();
      }
      break;
      
    case 'zoom':
      if (oldMedia) {
        const scale = 1 + progress * 0.5;
        slideshowCtx.globalAlpha = 1 - progress;
        slideshowCtx.save();
        slideshowCtx.translate(canvasWidth / 2, canvasHeight / 2);
        slideshowCtx.scale(scale, scale);
        slideshowCtx.translate(-canvasWidth / 2, -canvasHeight / 2);
        drawMediaOnCanvas(oldMedia, oldFitMode, oldRotation);
        slideshowCtx.restore();
        slideshowCtx.globalAlpha = 1;
      }
      if (newMedia) {
        const scale = 0.5 + progress * 0.5;
        slideshowCtx.globalAlpha = progress;
        slideshowCtx.save();
        slideshowCtx.translate(canvasWidth / 2, canvasHeight / 2);
        slideshowCtx.scale(scale, scale);
        slideshowCtx.translate(-canvasWidth / 2, -canvasHeight / 2);
        drawMediaOnCanvas(newMedia, newFitMode, newRotation);
        slideshowCtx.restore();
        slideshowCtx.globalAlpha = 1;
      }
      break;
      
    default: // instant
      if (newMedia) {
        drawMediaOnCanvas(newMedia, newFitMode, newRotation);
      }
  }
}

// Animate transition
function animateTransition(oldMedia, newMedia, transitionType, duration = 500, oldRotation = 0, newRotation = 0, oldFitMode = 'contain', newFitMode = 'contain') {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const signal = slideJob?.signal;
    function animate(currentTime) {
      if (signal?.aborted) {resolve(); return;}
      const elapsed = currentTime - startTime;
      transitionProgress = Math.min(elapsed / duration, 1);
      
      applyTransition(oldMedia, newMedia, transitionProgress, transitionType, oldRotation, newRotation, oldFitMode, newFitMode);
      
      if (transitionProgress < 1) {
        transitionAnimationFrame = requestAnimationFrame(animate);
      } else {
        resolve();
      }
    }
    
    transitionAnimationFrame = requestAnimationFrame(animate);
  });
}

// Display metadata
function displayMetadata(slide, highlightValue = null) {
  // Hide metadata overlay in main window - it's now shown in controller
  if (slideshowMetadata) {
    slideshowMetadata.style.display = 'none';
  }
  
  // Still broadcast to controller
  broadcastSlideshowState(slide);
}

// Broadcast slideshow state to controller window
function broadcastSlideshowState(slide) {
  // Allow broadcasting even if config is missing (e.g. during loading or error)
  const total = slideshowConfig && slideshowConfig.slides ? slideshowConfig.slides.length : 0;
  
  slideshowChannel.postMessage({
    type: 'slideshow_update',
    isActive: isSlideShowActive,
    currentIndex: currentSlideIndex,
    totalSlides: total,
    metadata: slide?.metadata || null,
    slideType: slide?.type || null,
    status: slideStatus, error: slideError
  });
}

// Update legend to highlight current attribute - broadcasts to controller only
function highlightLegendItem(slide, propertyValue) {
  // Broadcast highlight state to controller
  slideshowChannel.postMessage({
    type: 'slideshow_legend_highlight',
    highlightValue: propertyValue
  });
}

// GeoJSON animation state
let geojsonAnimationFrame = null;
let geojsonAnimationActive = false;

// Extract unique values for a property from GeoJSON
function getUniquePropertyValues(geojson, propertyName) {
  const values = new Set();
  if (geojson.features) {
    geojson.features.forEach(feature => {
      const value = feature.properties?.[propertyName];
      if (value !== undefined && value !== null) {
        values.add(value);
      }
    });
  }
  return Array.from(values);
}

// Animate GeoJSON by sequentially highlighting each unique attribute value
async function animateGeoJSONByProperty(geojson, slide) {
  const style = slide.metadata?.style || {};
  const colorProperty = style.colorProperty;
  
  if (!colorProperty || !style.colorMap) {
    // No property-based animation, just display normally
    return;
  }
  
  geojsonAnimationActive = true;
  const uniqueValues = Object.keys(style.colorMap);
  
  // Animation parameters
  const glowDuration = 800; // Duration of glow effect in ms
  const fillDuration = 400; // Duration of fill effect in ms
  const pauseBetween = 200; // Pause between attributes
  
  for (let i = 0; i < uniqueValues.length && geojsonAnimationActive; i++) {
    const value = uniqueValues[i];
    const color = style.colorMap[value];
    
    // Highlight current legend item
    highlightLegendItem(slide, value);
    
    // Phase 1: Intense glow outline
    await animateGlow(value, color, glowDuration, colorProperty);
    
    // Phase 2: Fill/stroke appears
    if (geojsonAnimationActive) {
      await animateFill(value, color, fillDuration, colorProperty, style.fillOpacity || 0.5, style.strokeOpacity || 0.8, uniqueValues, style.colorMap);
    }
    
    // Small pause before next attribute
    if (i < uniqueValues.length - 1 && geojsonAnimationActive) {
      await new Promise(resolve => setTimeout(resolve, pauseBetween));
    }
  }
  
  // Broadcast clear highlight to controller
  slideshowChannel.postMessage({
    type: 'slideshow_legend_highlight',
    highlightValue: null
  });
  
  // Return true if animation completed successfully
  return geojsonAnimationActive;
}

// Animate glowing outline for a specific property value
function animateGlow(propertyValue, color, duration, propertyName) {
  return new Promise((resolve) => {
    const startTime = performance.now();
    
    // Add glow layer if it doesn't exist
    if (!map.getLayer('slideshow-glow')) {
      map.addLayer({
        id: 'slideshow-glow',
        type: 'line',
        source: 'slideshow-geojson',
        paint: {
          'line-color': color,
          'line-width': 0,
          'line-blur': 0,
          'line-opacity': 0
        }
      });
    }
    
    function animate(currentTime) {
      if (!geojsonAnimationActive) {
        resolve();
        return;
      }
      
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Glow effect: pulse from 0 to max and back
      const glowProgress = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
      const maxWidth = 8;
      const maxBlur = 10;
      const maxOpacity = 1;
      
      map.setPaintProperty('slideshow-glow', 'line-width', glowProgress * maxWidth);
      map.setPaintProperty('slideshow-glow', 'line-blur', glowProgress * maxBlur);
      map.setPaintProperty('slideshow-glow', 'line-opacity', glowProgress * maxOpacity);
      map.setPaintProperty('slideshow-glow', 'line-color', color);
      map.setFilter('slideshow-glow', ['==', ['get', propertyName], propertyValue]);
      
      if (progress < 1) {
        geojsonAnimationFrame = requestAnimationFrame(animate);
      } else {
        resolve();
      }
    }
    
    geojsonAnimationFrame = requestAnimationFrame(animate);
  });
}

// Animate fill/stroke for a specific property value
function animateFill(propertyValue, color, duration, propertyName, targetFillOpacity, targetStrokeOpacity, allValues, colorMap) {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const currentIndex = allValues.indexOf(propertyValue);
    const previousValues = allValues.slice(0, currentIndex);
    
    function animate(currentTime) {
      if (!geojsonAnimationActive) {
        resolve();
        return;
      }
      
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Show all values up to and including current one
      const visibleValues = allValues.slice(0, currentIndex + 1);
      
      // Build match expression with opacity per feature for fills
      const fillOpacityExpression = ['match', ['get', propertyName]];
      previousValues.forEach(val => {
        fillOpacityExpression.push(val, targetFillOpacity);
      });
      const currentFillOpacity = progress * targetFillOpacity;
      fillOpacityExpression.push(propertyValue, currentFillOpacity);
      fillOpacityExpression.push(0);
      
      // Build match expression with opacity per feature for lines/strokes
      const strokeOpacityExpression = ['match', ['get', propertyName]];
      previousValues.forEach(val => {
        strokeOpacityExpression.push(val, targetStrokeOpacity);
      });
      const currentStrokeOpacity = progress * targetStrokeOpacity;
      strokeOpacityExpression.push(propertyValue, currentStrokeOpacity);
      strokeOpacityExpression.push(0);
      
      // Build color match expression
      const colorExpression = ['match', ['get', propertyName]];
      visibleValues.forEach(val => {
        colorExpression.push(val, colorMap[val]);
      });
      colorExpression.push('#cccccc'); // default color
      
      const multiFilter = ['any', ...visibleValues.map(v => ['==', ['get', propertyName], v])];
      
      // Update fill layer (for polygons)
      if (map.getLayer('slideshow-fill')) {
        map.setFilter('slideshow-fill', ['all', ['==', ['geometry-type'], 'Polygon'], multiFilter]);
        map.setPaintProperty('slideshow-fill', 'fill-opacity', fillOpacityExpression);
        map.setPaintProperty('slideshow-fill', 'fill-color', colorExpression);
      }
      
      // Update line layer (for LineStrings like streets)
      if (map.getLayer('slideshow-line')) {
        map.setFilter('slideshow-line', ['all', ['==', ['geometry-type'], 'LineString'], multiFilter]);
        map.setPaintProperty('slideshow-line', 'line-opacity', strokeOpacityExpression);
        map.setPaintProperty('slideshow-line', 'line-color', colorExpression);
      }
      
      if (progress < 1) {
        geojsonAnimationFrame = requestAnimationFrame(animate);
      } else {
        resolve();
      }
    }
    
    geojsonAnimationFrame = requestAnimationFrame(animate);
  });
}

// Stop GeoJSON animation
function stopGeoJSONAnimation() {
  geojsonAnimationActive = false;
  if (geojsonAnimationFrame) {
    cancelAnimationFrame(geojsonAnimationFrame);
    geojsonAnimationFrame = null;
  }
  
  // Remove glow layer
  if (map.getLayer('slideshow-glow')) {
    map.removeLayer('slideshow-glow');
  }
}

// Remove all slideshow GeoJSON layers from the map
function removeGeoJSONLayers() {
  stopGeoJSONAnimation();
  
  if (map.getSource('slideshow-geojson')) {
    ['slideshow-fill', 'slideshow-line', 'slideshow-polygon-outline', 'slideshow-point', 'slideshow-glow'].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    map.removeSource('slideshow-geojson');
  }
}

// Handle GeoJSON display
async function displayGeoJSON(geojson, slide) {
  // Stop any ongoing animation
  stopGeoJSONAnimation();
  
  // Remove previous slideshow GeoJSON layers
  if (map.getSource('slideshow-geojson')) {
    ['slideshow-fill', 'slideshow-line', 'slideshow-polygon-outline', 'slideshow-point', 'slideshow-glow'].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    map.removeSource('slideshow-geojson');
  }
  
  // Add new GeoJSON layer
  map.addSource('slideshow-geojson', { type: 'geojson', data: geojson });
  
  // Get style from metadata or use defaults
  const style = slide.metadata?.style || {};
  const fillOpacity = style.fillOpacity || 0.4;
  const strokeWidth = style.strokeWidth || 2;
  const pointRadius = style.pointRadius || 5;
  
  // Check if we have property-based styling (colorProperty and colorMap)
  let fillColor, strokeColor, pointColor;
  
  if (style.colorProperty && style.colorMap) {
    // Build match expression for data-driven styling
    // Format: ['match', ['get', 'property'], value1, color1, value2, color2, ..., defaultColor]
    const matchExpression = ['match', ['get', style.colorProperty]];
    
    // Add each property value and its color
    Object.entries(style.colorMap).forEach(([value, color]) => {
      matchExpression.push(value, color);
    });
    
    // Add default color
    matchExpression.push(style.fillColor || '#3388ff');
    
    fillColor = matchExpression;
    strokeColor = style.strokeColor || ['match', ['get', style.colorProperty],
      ...Object.entries(style.colorMap).flatMap(([value, color]) => [value, color]),
      style.strokeColor || '#0066cc'
    ];
    pointColor = matchExpression;
  } else {
    // Use single color for all features
    fillColor = style.fillColor || '#3388ff';
    strokeColor = style.strokeColor || '#0066cc';
    pointColor = style.pointColor || '#ff7800';
  }
  
  // Add fill layer for polygons (initially invisible for animation)
  map.addLayer({
    id: 'slideshow-fill',
    type: 'fill',
    source: 'slideshow-geojson',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': fillColor,
      'fill-opacity': 0 // Start invisible for animation
    }
  });
  
  // Add line layer for LineString geometries (e.g., streets)
  map.addLayer({
    id: 'slideshow-line',
    type: 'line',
    source: 'slideshow-geojson',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: {
      'line-color': strokeColor,
      'line-width': strokeWidth,
      'line-opacity': 0 // Start invisible for animation
    }
  });
  
  // Add line layer for polygon outlines
  map.addLayer({
    id: 'slideshow-polygon-outline',
    type: 'line',
    source: 'slideshow-geojson',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'line-color': strokeColor,
      'line-width': 1,
      'line-opacity': 0.3 // Subtle outline during animation
    }
  });
  
  // Add circle layer for points
  map.addLayer({
    id: 'slideshow-point',
    type: 'circle',
    source: 'slideshow-geojson',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': pointRadius,
      'circle-color': pointColor,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1
    }
  });
  
  // Start the sequential animation
  let animationCompleted = false;
  if (style.colorProperty && style.colorMap) {
    animationCompleted = await animateGeoJSONByProperty(geojson, slide);
    
    // After animation completes, set final state
    if (geojsonAnimationActive) {
      const strokeOpacity = style.strokeOpacity || 0.8;
      map.setPaintProperty('slideshow-fill', 'fill-opacity', fillOpacity);
      map.setPaintProperty('slideshow-line', 'line-opacity', strokeOpacity);
      map.setPaintProperty('slideshow-polygon-outline', 'line-opacity', 1);
    }
  } else {
    // No animation, show immediately
    const strokeOpacity = style.strokeOpacity || 0.8;
    map.setPaintProperty('slideshow-fill', 'fill-opacity', fillOpacity);
    map.setPaintProperty('slideshow-line', 'line-opacity', strokeOpacity);
    map.setPaintProperty('slideshow-polygon-outline', 'line-opacity', 1);
  }
  
  return animationCompleted;
}

// Bound asynchronous work to the current slide, including legacy media loads.
function awaitSlide(promise, signal, timeout = 15000) {
  return new Promise((resolve,reject) => {
    const finish=(error,value)=>{clearTimeout(timer);signal.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
    const cancel=()=>finish(new DOMException('Slide changed','AbortError'));
    const timer=setTimeout(()=>finish(Error('Slide timed out. Retry or choose Next.')),timeout);
    signal.addEventListener('abort',cancel,{once:true});
    if(signal.aborted) cancel();
    Promise.resolve(promise).then(value=>finish(null,value),finish);
  });
}
function cancelSlide() {
  slideJob?.abort();
  clearTimeout(slideshowTimer);slideshowTimer=null;
  if (currentMediaElement instanceof HTMLVideoElement) currentMediaElement.pause();
  stopGeoJSONAnimation();
}
async function displaySlide(index) {
  if(!isSlideShowActive || !slideshowConfig?.slides[index]) return;
  cancelSlide();
  const job=new AbortController();slideJob=job;
  const slide=slideshowConfig.slides[index];
  slideStatus='loading';slideError=null;displayMetadata(slide);
  const oldMedia=currentMediaElement,oldRotation=currentMediaRotation,oldFit=currentMediaFitMode;
  try {
    if(['wms','arcgis'].includes(slide.type)) {
      removeGeoJSONLayers();
      slideshowCanvas?.classList.remove('active');
      currentMediaElement=null;
      await rasterSlides.show(slide,job.signal,slideshowConfig.settings.wmsTransitionDuration ?? 700);
    } else {
      rasterSlides.clear();
      const media=await awaitSlide(preloadMedia(slide),job.signal);
      if(job.signal.aborted) return;
      if(slide.type==='geojson') {
        slideshowCanvas?.classList.remove('active');
        currentMediaElement=null;
        await awaitSlide(displayGeoJSON(media,slide),job.signal,60000);
      } else {
        removeGeoJSONLayers();
        slideshowCanvas?.classList.add('active');
        currentMediaElement=media;
        currentMediaRotation=slide.rotation || 0;
        currentMediaFitMode=slide.fitMode || slideshowConfig.settings.fitMode || 'contain';
        if(slide.type==='video') {media.currentTime=0;await awaitSlide(media.play(),job.signal);}
        await awaitSlide(animateTransition(oldMedia,media,slide.transition || 'fade',500,oldRotation,currentMediaRotation,oldFit,currentMediaFitMode),job.signal);
        if(slide.type==='video') {
          const draw=()=>{if(job.signal.aborted || media.paused || media.ended)return;drawMediaOnCanvas(media,currentMediaFitMode,currentMediaRotation);requestAnimationFrame(draw);};draw();
        }
      }
    }
    if(job.signal.aborted) return;
    slideStatus='ready';displayMetadata(slide);
    if(slideshowConfig.settings.autoAdvance) slideshowTimer=setTimeout(advanceSlide,slide.duration || 5000);
  } catch(error) {
    if(job.signal.aborted) return;
    slideStatus='error';slideError=error.message;
    rasterSlides.clear();removeGeoJSONLayers();slideshowCanvas?.classList.remove('active');
    displayMetadata(slide);
  }
}
function navigateSlide(direction) {
  if(!isSlideShowActive || !slideshowConfig?.slides.length)return;
  let index=currentSlideIndex+direction;
  if(index>=slideshowConfig.slides.length && !slideshowConfig.settings.loop){stopSlideshow();return;}
  currentSlideIndex=(index+slideshowConfig.slides.length)%slideshowConfig.slides.length;
  displaySlide(currentSlideIndex);
}
function advanceSlide() {navigateSlide(1);}
async function startSlideshow() {
  if(isSlideShowActive){stopSlideshow();return;}
  const revision=++startRevision;
  isSlideShowActive=true;slideshowBtn?.classList.add('active');
  slideshowChannel.postMessage({type:'animation_state',animationId:'slideshow-btn',isActive:true});
  slideStatus='loading';slideError=null;broadcastSlideshowState(null);
  slideshowConfig=await loadSlideshowConfig();
  if(revision!==startRevision || !isSlideShowActive)return;
  if(!slideshowConfig.slides.length){stopSlideshow();showToast('No enabled slides found');return;}
  currentSlideIndex=0;resizeSlideshowCanvas();displaySlide(0);
}
function stopSlideshow() {
  startRevision++;isSlideShowActive=false;cancelSlide();rasterSlides.clear();removeGeoJSONLayers();
  slideshowCanvas?.classList.remove('active');
  if(slideshowMetadata)slideshowMetadata.style.display='none';
  slideshowCtx?.clearRect(0,0,slideshowCanvas.width,slideshowCanvas.height);
  slideshowBtn?.classList.remove('active');currentMediaElement=null;currentSlideIndex=0;
  slideStatus='idle';slideError=null;
  slideshowChannel.postMessage({type:'animation_state',animationId:'slideshow-btn',isActive:false});
  broadcastSlideshowState(null);
}
slideshowBtn?.addEventListener('click',startSlideshow);
window.addEventListener('resize',()=>{
  if(!isSlideShowActive)return;
  resizeSlideshowCanvas();
  if(currentMediaElement)drawMediaOnCanvas(currentMediaElement,currentMediaFitMode,currentMediaRotation);
});
map.on('style.load',()=>{
  const slide=slideshowConfig?.slides[currentSlideIndex];
  if(isSlideShowActive && ['wms','arcgis'].includes(slide?.type) && !map.getSource(rasterSlides.active))displaySlide(currentSlideIndex);
});
document.addEventListener('keydown',event=>{
  if(!isSlideShowActive || event.repeat || event.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  if(event.key==='ArrowRight'){event.preventDefault();navigateSlide(1);}
  if(event.key==='ArrowLeft'){event.preventDefault();navigateSlide(-1);}
  if(event.key==='Escape'){event.preventDefault();stopSlideshow();}
});
slideshowChannel.addEventListener('message',({data})=>{
  if(data.type!=='slideshow_control')return;
  if(data.action==='next')navigateSlide(1);
  if(data.action==='previous')navigateSlide(-1);
  if(data.action==='stop')stopSlideshow();
  if(data.action==='retry' && isSlideShowActive)displaySlide(currentSlideIndex);
  if(data.action==='request_status')broadcastSlideshowState(isSlideShowActive?slideshowConfig?.slides[currentSlideIndex]:null);
});
