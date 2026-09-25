// ===== Slideshow Animation System =====
// Display image/video/gif/geojson media with transitions and metadata

const slideshowMap = window.MR_RENDER?.map || window.map;
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
let reveal = null, revealTimer = null;
let slideJob = null, startRevision = 0;
const rasterSlides = new window.MR_RASTER_SLIDES.RasterSlides(slideshowMap);

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
      transitionProgress = Math.max(0, Math.min(elapsed / duration, 1));
      
      applyTransition(oldMedia, newMedia, transitionProgress, transitionType, oldRotation, newRotation, oldFitMode, newFitMode);
      
      if (transitionProgress < 1) {
        transitionAnimationFrame = (window.MR_FRAMES ? window.MR_FRAMES.request.bind(window.MR_FRAMES, 'slides') : requestAnimationFrame)(animate);
      } else {
        resolve();
      }
    }
    
    transitionAnimationFrame = (window.MR_FRAMES ? window.MR_FRAMES.request.bind(window.MR_FRAMES, 'slides') : requestAnimationFrame)(animate);
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
    status: slideStatus, error: slideError,
    categoryIndex: reveal?.index ?? -1, categoryCount: reveal?.values.length || 0,
    category: reveal?.values[reveal.index] || null, autoReveal: !!reveal?.automatic
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

// Presenter state changes immediately; visual interpolation cannot block controls.
function paintReveal(progress = 1) {
  if(!reveal)return;
  const {style,values,index}=reveal, visible=values.slice(0,index+1);
  const filter=['in',['get',style.colorProperty],['literal',visible]];
  const opacity=max=>index<0?0:['case',['==',['get',style.colorProperty],values[index]],max*progress,max];
  for(const [id,geometry,property,alpha] of [
    ['slideshow-fill','Polygon','fill-opacity',style.fillOpacity ?? .5],
    ['slideshow-line','LineString','line-opacity',style.strokeOpacity ?? .8],
    ['slideshow-polygon-outline','Polygon','line-opacity',1],
    ['slideshow-point','Point','circle-opacity',1]]) {
    if(slideshowMap.getLayer(id)){slideshowMap.setFilter(id,['all',['==',['geometry-type'],geometry],filter]);slideshowMap.setPaintProperty(id,property,opacity(alpha));}
  }
}
function stopGeoJSONAnimation() {
  clearTimeout(revealTimer);revealTimer=null;
  if(reveal)reveal.automatic=false;
  geojsonAnimationActive=false;
  if(geojsonAnimationFrame)(window.MR_FRAMES ? window.MR_FRAMES.cancel.bind(window.MR_FRAMES) : cancelAnimationFrame)(geojsonAnimationFrame);
  geojsonAnimationFrame=null;
  if(slideshowMap.getLayer('slideshow-glow'))slideshowMap.removeLayer('slideshow-glow');
}
function animateReveal() {
  if(!reveal || reveal.index<0)return;
  const state=reveal,started=performance.now(),value=state.values[state.index];
  slideshowMap.addLayer({id:'slideshow-glow',type:'line',source:'slideshow-geojson',
    filter:['==',['get',state.style.colorProperty],value],
    paint:{'line-color':state.style.colorMap[value],'line-width':0,'line-blur':3,'line-opacity':0}});
  const frame=now=>{
    if(reveal!==state || !isSlideShowActive || !slideshowMap.getLayer('slideshow-glow'))return;
    const progress=Math.max(0,Math.min(1,(now-started)/800)),glow=Math.sin(progress*Math.PI);
    paintReveal(Math.min(1,progress*2));
    slideshowMap.setPaintProperty('slideshow-glow','line-width',glow*6);
    slideshowMap.setPaintProperty('slideshow-glow','line-opacity',glow*.8);
    if(progress<1)geojsonAnimationFrame=(window.MR_FRAMES ? window.MR_FRAMES.request.bind(window.MR_FRAMES, 'slides') : requestAnimationFrame)(frame);
    else {slideshowMap.removeLayer('slideshow-glow');geojsonAnimationFrame=null;}
  };
  geojsonAnimationFrame=(window.MR_FRAMES ? window.MR_FRAMES.request.bind(window.MR_FRAMES, 'slides') : requestAnimationFrame)(frame);
}
function categoryControl(action) {
  if(!isSlideShowActive || slideStatus!=='ready' || !reveal)return;
  stopGeoJSONAnimation();paintReveal();
  if(action==='category_next')reveal.index=Math.min(reveal.values.length-1,reveal.index+1);
  if(action==='category_previous')reveal.index=Math.max(-1,reveal.index-1);
  if(action==='show_all')reveal.index=reveal.values.length-1;
  if(action==='auto_reveal') {
    if(reveal.index>=reveal.values.length-1)reveal.index=-1;
    reveal.automatic=true;
  }
  if(action==='category_next')animateReveal();else paintReveal();
  function publish(){broadcastSlideshowState(slideshowConfig.slides[currentSlideIndex]);highlightLegendItem(null,reveal?.values[reveal.index] || null);}
  function nextAuto(){
    if(!reveal?.automatic)return;
    const next=reveal.index+1;
    stopGeoJSONAnimation();reveal.index=next;paintReveal();animateReveal();
    reveal.automatic=next<reveal.values.length-1;
    publish();
    if(reveal.automatic)revealTimer=setTimeout(nextAuto,1400);
  }
  publish();
  if(reveal.automatic)nextAuto();
}

// Remove all slideshow GeoJSON layers from the map
function removeGeoJSONLayers() {
  stopGeoJSONAnimation();
  reveal=null;
  
  if (slideshowMap.getSource('slideshow-geojson')) {
    ['slideshow-fill', 'slideshow-line', 'slideshow-polygon-outline', 'slideshow-point', 'slideshow-glow'].forEach(id => {
      if (slideshowMap.getLayer(id)) slideshowMap.removeLayer(id);
    });
    slideshowMap.removeSource('slideshow-geojson');
  }
}

// Handle GeoJSON display
async function displayGeoJSON(geojson, slide) {
  // Stop any ongoing animation
  stopGeoJSONAnimation();
  
  // Remove previous slideshow GeoJSON layers
  if (slideshowMap.getSource('slideshow-geojson')) {
    ['slideshow-fill', 'slideshow-line', 'slideshow-polygon-outline', 'slideshow-point', 'slideshow-glow'].forEach(id => {
      if (slideshowMap.getLayer(id)) slideshowMap.removeLayer(id);
    });
    slideshowMap.removeSource('slideshow-geojson');
  }
  
  // Add new GeoJSON layer
  slideshowMap.addSource('slideshow-geojson', { type: 'geojson', data: geojson });
  
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
  slideshowMap.addLayer({
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
  slideshowMap.addLayer({
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
  slideshowMap.addLayer({
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
  slideshowMap.addLayer({
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
  
  if (style.colorProperty && Object.keys(style.colorMap || {}).length) {
    reveal={style,values:Object.keys(style.colorMap),index:-1,automatic:false};
    paintReveal();
  } else {
    reveal=null;
    slideshowMap.setPaintProperty('slideshow-fill','fill-opacity',fillOpacity);
    slideshowMap.setPaintProperty('slideshow-line','line-opacity',style.strokeOpacity ?? .8);
    slideshowMap.setPaintProperty('slideshow-polygon-outline','line-opacity',1);
  }
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
  cancelSlide();reveal=null;
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
          const draw=()=>{if(job.signal.aborted || media.paused || media.ended)return;drawMediaOnCanvas(media,currentMediaFitMode,currentMediaRotation);(window.MR_FRAMES ? window.MR_FRAMES.request.bind(window.MR_FRAMES, 'slides') : requestAnimationFrame)(draw);};draw();
        }
      }
    }
    if(job.signal.aborted) return;
    slideStatus='ready';displayMetadata(slide);
    if(slideshowConfig.settings.autoAdvance && !reveal) slideshowTimer=setTimeout(advanceSlide,slide.duration || 5000);
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
  const loaded=await loadSlideshowConfig();
  if(revision!==startRevision || !isSlideShowActive)return;
  slideshowConfig=loaded;
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
window.MR_LAYERS?.register('slideshow-btn',{getEnabled:()=>isSlideShowActive,enable:async(current)=>{await window.MR_RENDER?.ready;if(current && !current())return;if(!isSlideShowActive)await startSlideshow();},disable:stopSlideshow,isReady:()=>slideStatus==='ready',getError:()=>slideError});
window.addEventListener('resize',()=>{
  if(!isSlideShowActive)return;
  resizeSlideshowCanvas();
  if(currentMediaElement)drawMediaOnCanvas(currentMediaElement,currentMediaFitMode,currentMediaRotation);
});
slideshowMap.on('style.load',()=>{
  const slide=slideshowConfig?.slides[currentSlideIndex];
  if(isSlideShowActive && ['wms','arcgis'].includes(slide?.type) && !slideshowMap.getSource(rasterSlides.active))displaySlide(currentSlideIndex);
});
document.addEventListener('keydown',event=>{
  if(!isSlideShowActive || event.repeat || event.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  if(event.key==='ArrowRight'){event.preventDefault();reveal && !event.shiftKey ? categoryControl('category_next') : navigateSlide(1);}
  if(event.key==='ArrowLeft'){event.preventDefault();reveal && !event.shiftKey ? categoryControl('category_previous') : navigateSlide(-1);}
  if(event.key==='Escape'){event.preventDefault();stopSlideshow();}
});
slideshowChannel.addEventListener('message',({data})=>{
  if(data.type!=='slideshow_control')return;
  if(['category_next','category_previous','show_all','auto_reveal','pause_reveal'].includes(data.action))categoryControl(data.action);
  if(data.action==='next')navigateSlide(1);
  if(data.action==='previous')navigateSlide(-1);
  if(data.action==='stop')stopSlideshow();
  if(data.action==='retry' && isSlideShowActive)displaySlide(currentSlideIndex);
  if(data.action==='request_status')broadcastSlideshowState(isSlideShowActive?slideshowConfig?.slides[currentSlideIndex]:null);
});
