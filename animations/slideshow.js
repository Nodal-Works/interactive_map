// ===== Slideshow Animation System (ES6 Class) =====
// Display image/video/gif/geojson media with transitions and metadata

class SlideshowAnimation {
  constructor(canvasId = 'slideshow-canvas', buttonId = 'slideshow-btn', metadataId = 'slideshow-metadata') {
    // DOM Elements
    this.slideshowCanvas = document.getElementById(canvasId);
    this.slideshowCtx = this.slideshowCanvas ? this.slideshowCanvas.getContext('2d') : null;
    this.slideshowBtn = document.getElementById(buttonId);
    this.slideshowMetadata = document.getElementById(metadataId);

    // BroadcastChannel for controller communication
    this.slideshowChannel = new BroadcastChannel('map_controller_channel');

    // Slideshow state
    this.slideshowConfig = null;
    this.currentSlideIndex = 0;
    this.isSlideShowActive = false;
    this.slideshowTimer = null;
    this.currentMediaElement = null;
    this.currentMediaRotation = 0; // Track rotation of current media
    this.currentMediaFitMode = 'contain'; // Track fitMode of current media
    this.transitionProgress = 0;
    this.transitionAnimationFrame = null;

    // Media cache
    this.mediaCache = new Map();

    // Config paths
    this.SLIDESHOW_CONFIG_PATH = 'media/slideshow/slideshow-config.json';
    this.SLIDESHOW_MEDIA_PATH = 'media/slideshow/';

    // GeoJSON animation state
    this.geojsonAnimationFrame = null;
    this.geojsonAnimationActive = false;

    // Video animation state
    this.videoAnimationFrame = null;

    // Bind event handlers to preserve 'this' context
    this.handleWindowResize = this.handleWindowResize.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleBroadcastMessage = this.handleBroadcastMessage.bind(this);
    this.handleButtonClick = this.toggle.bind(this);

    // Set up event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Wire up slideshow button
    if (this.slideshowBtn) {
      this.slideshowBtn.addEventListener('click', this.handleButtonClick);
    }

    // Resize canvas on window resize
    window.addEventListener('resize', this.handleWindowResize);

    // Keyboard controls for manual navigation
    document.addEventListener('keydown', this.handleKeyDown);

    // Listen for slideshow control messages from controller
    this.slideshowChannel.addEventListener('message', this.handleBroadcastMessage);
  }

  removeEventListeners() {
    if (this.slideshowBtn) {
      this.slideshowBtn.removeEventListener('click', this.handleButtonClick);
    }
    window.removeEventListener('resize', this.handleWindowResize);
    document.removeEventListener('keydown', this.handleKeyDown);
    this.slideshowChannel.removeEventListener('message', this.handleBroadcastMessage);
  }

  handleWindowResize() {
    if (this.isSlideShowActive && this.slideshowCanvas) {
      this.resizeSlideshowCanvas();
      if (this.currentMediaElement && !(this.currentMediaElement instanceof HTMLVideoElement)) {
        this.drawMediaOnCanvas(this.currentMediaElement, this.slideshowConfig.settings.fitMode);
      }
    }
  }

  handleKeyDown(e) {
    if (!this.isSlideShowActive) return;

    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      // Stop any ongoing GeoJSON animation
      this.stopGeoJSONAnimation();
      this.nextSlide();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      // Stop any ongoing GeoJSON animation
      this.stopGeoJSONAnimation();
      this.previousSlide();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.stop();
    }
  }

  handleBroadcastMessage(event) {
    const data = event.data;
    if (data.type !== 'slideshow_control') return;

    if (data.action === 'next') {
      if (!this.isSlideShowActive) return;
      this.stopGeoJSONAnimation();
      this.nextSlide();
    } else if (data.action === 'previous') {
      if (!this.isSlideShowActive) return;
      this.stopGeoJSONAnimation();
      this.previousSlide();
    } else if (data.action === 'stop') {
      this.stop();
    } else if (data.action === 'request_status') {
      const slide = this.slideshowConfig?.slides?.[this.currentSlideIndex];
      this.broadcastSlideshowState(slide);
    }
  }

  // Load slideshow configuration
  async loadSlideshowConfig() {
    try {
      const response = await fetch(this.SLIDESHOW_CONFIG_PATH);
      if (!response.ok) {
        console.warn('Slideshow config not found. Using default empty config.');
        return { slides: [], settings: { loop: true, autoAdvance: true, showMetadata: true, metadataPosition: 'bottom-right', fitMode: 'contain' } };
      }
      const config = await response.json();
      return config;
    } catch (error) {
      console.error('Error loading slideshow config:', error);
      return { slides: [], settings: { loop: true, autoAdvance: true, showMetadata: true, metadataPosition: 'bottom-right', fitMode: 'contain' } };
    }
  }

  // Resize slideshow canvas to match table overlay
  resizeSlideshowCanvas() {
    if (!this.slideshowCanvas) return;
    const s = computeOverlayPixelSize();
    this.slideshowCanvas.width = s.w;
    this.slideshowCanvas.height = s.h;
    this.slideshowCanvas.style.width = s.w + 'px';
    this.slideshowCanvas.style.height = s.h + 'px';
  }

  // Preload media
  async preloadMedia(slide) {
    // Validate slide.media to prevent directory traversal attacks
    // Only allow alphanumeric characters, hyphens, underscores, dots (for extensions), and forward slashes
    // Specifically block '..' and paths starting with '/'
    if (!slide.media) {
      throw new Error('Media path is required');
    }
    if (slide.media.startsWith('/') || slide.media.startsWith('.')) {
      throw new Error(`Invalid media path: ${slide.media}`);
    }
    if (slide.media.includes('..') || slide.media.includes('//')) {
      throw new Error(`Invalid media path: ${slide.media}`);
    }
    if (!/^[a-zA-Z0-9._\-/]+$/.test(slide.media)) {
      throw new Error(`Invalid media path: ${slide.media}`);
    }

    const mediaPath = this.SLIDESHOW_MEDIA_PATH + slide.media;

    if (this.mediaCache.has(mediaPath)) {
      return this.mediaCache.get(mediaPath);
    }

    if (slide.type === 'image' || slide.type === 'gif') {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          this.mediaCache.set(mediaPath, img);
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
          this.mediaCache.set(mediaPath, video);
          resolve(video);
        };
        video.onerror = () => reject(new Error(`Failed to load video: ${mediaPath}`));
        video.src = mediaPath;
      });
    } else if (slide.type === 'geojson') {
      try {
        const response = await fetch(mediaPath);
        const geojson = await response.json();
        this.mediaCache.set(mediaPath, geojson);
        return geojson;
      } catch (error) {
        throw new Error(`Failed to load GeoJSON: ${mediaPath}`);
      }
    }
  }

  // Draw image/video on canvas with fit mode and optional rotation
  drawMediaOnCanvas(media, fitMode = 'contain', rotation = 0) {
    if (!this.slideshowCtx) return;

    const canvasWidth = this.slideshowCanvas.width;
    const canvasHeight = this.slideshowCanvas.height;

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

    this.slideshowCtx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Apply rotation if needed
    if (rotation !== 0) {
      this.slideshowCtx.save();

      // Move to center of where the image will be drawn
      const centerX = drawX + drawWidth / 2;
      const centerY = drawY + drawHeight / 2;

      this.slideshowCtx.translate(centerX, centerY);
      this.slideshowCtx.rotate((rotation * Math.PI) / 180);

      // For 90/270 degree rotations, we need to adjust the drawing rectangle
      // because the image dimensions are swapped
      if (rotatedDimensions) {
        this.slideshowCtx.drawImage(media, -drawHeight / 2, -drawWidth / 2, drawHeight, drawWidth);
      } else {
        this.slideshowCtx.drawImage(media, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      }

      this.slideshowCtx.restore();
    } else {
      this.slideshowCtx.drawImage(media, drawX, drawY, drawWidth, drawHeight);
    }
  }

  // Apply transition effect
  applyTransition(oldMedia, newMedia, progress, transitionType, oldRotation = 0, newRotation = 0, oldFitMode = 'contain', newFitMode = 'contain') {
    if (!this.slideshowCtx) return;

    const canvasWidth = this.slideshowCanvas.width;
    const canvasHeight = this.slideshowCanvas.height;

    this.slideshowCtx.clearRect(0, 0, canvasWidth, canvasHeight);

    switch (transitionType) {
      case 'fade':
        if (oldMedia) {
          this.slideshowCtx.globalAlpha = 1 - progress;
          this.drawMediaOnCanvas(oldMedia, oldFitMode, oldRotation);
        }
        if (newMedia) {
          this.slideshowCtx.globalAlpha = progress;
          this.drawMediaOnCanvas(newMedia, newFitMode, newRotation);
        }
        this.slideshowCtx.globalAlpha = 1;
        break;

      case 'slide-left':
        if (oldMedia) {
          this.slideshowCtx.save();
          this.slideshowCtx.translate(-canvasWidth * progress, 0);
          this.drawMediaOnCanvas(oldMedia, oldFitMode, oldRotation);
          this.slideshowCtx.restore();
        }
        if (newMedia) {
          this.slideshowCtx.save();
          this.slideshowCtx.translate(canvasWidth * (1 - progress), 0);
          this.drawMediaOnCanvas(newMedia, newFitMode, newRotation);
          this.slideshowCtx.restore();
        }
        break;

      case 'slide-right':
        if (oldMedia) {
          this.slideshowCtx.save();
          this.slideshowCtx.translate(canvasWidth * progress, 0);
          this.drawMediaOnCanvas(oldMedia, oldFitMode, oldRotation);
          this.slideshowCtx.restore();
        }
        if (newMedia) {
          this.slideshowCtx.save();
          this.slideshowCtx.translate(-canvasWidth * (1 - progress), 0);
          this.drawMediaOnCanvas(newMedia, newFitMode, newRotation);
          this.slideshowCtx.restore();
        }
        break;

      case 'zoom':
        if (oldMedia) {
          const scale = 1 + progress * 0.5;
          this.slideshowCtx.globalAlpha = 1 - progress;
          this.slideshowCtx.save();
          this.slideshowCtx.translate(canvasWidth / 2, canvasHeight / 2);
          this.slideshowCtx.scale(scale, scale);
          this.slideshowCtx.translate(-canvasWidth / 2, -canvasHeight / 2);
          this.drawMediaOnCanvas(oldMedia, oldFitMode, oldRotation);
          this.slideshowCtx.restore();
          this.slideshowCtx.globalAlpha = 1;
        }
        if (newMedia) {
          const scale = 0.5 + progress * 0.5;
          this.slideshowCtx.globalAlpha = progress;
          this.slideshowCtx.save();
          this.slideshowCtx.translate(canvasWidth / 2, canvasHeight / 2);
          this.slideshowCtx.scale(scale, scale);
          this.slideshowCtx.translate(-canvasWidth / 2, -canvasHeight / 2);
          this.drawMediaOnCanvas(newMedia, newFitMode, newRotation);
          this.slideshowCtx.restore();
          this.slideshowCtx.globalAlpha = 1;
        }
        break;

      default: // instant
        if (newMedia) {
          this.drawMediaOnCanvas(newMedia, newFitMode, newRotation);
        }
    }
  }

  // Animate transition
  animateTransition(oldMedia, newMedia, transitionType, duration = 500, oldRotation = 0, newRotation = 0, oldFitMode = 'contain', newFitMode = 'contain') {
    return new Promise((resolve) => {
      const startTime = performance.now();

      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        this.transitionProgress = Math.min(elapsed / duration, 1);

        this.applyTransition(oldMedia, newMedia, this.transitionProgress, transitionType, oldRotation, newRotation, oldFitMode, newFitMode);

        if (this.transitionProgress < 1) {
          this.transitionAnimationFrame = requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      this.transitionAnimationFrame = requestAnimationFrame(animate);
    });
  }

  // Display metadata
  displayMetadata(slide, highlightValue = null) {
    // Hide metadata overlay in main window - it's now shown in controller
    if (this.slideshowMetadata) {
      this.slideshowMetadata.style.display = 'none';
    }

    // Still broadcast to controller
    this.broadcastSlideshowState(slide);
  }

  // Broadcast slideshow state to controller window
  broadcastSlideshowState(slide) {
    // Allow broadcasting even if config is missing (e.g. during loading or error)
    const total = this.slideshowConfig && this.slideshowConfig.slides ? this.slideshowConfig.slides.length : 0;

    this.slideshowChannel.postMessage({
      type: 'slideshow_update',
      isActive: this.isSlideShowActive,
      currentIndex: this.currentSlideIndex,
      totalSlides: total,
      metadata: slide?.metadata || null,
      slideType: slide?.type || null
    });
  }

  // Update legend to highlight current attribute - broadcasts to controller only
  highlightLegendItem(slide, propertyValue) {
    // Broadcast highlight state to controller
    this.slideshowChannel.postMessage({
      type: 'slideshow_legend_highlight',
      highlightValue: propertyValue
    });
  }

  // Extract unique values for a property from GeoJSON
  getUniquePropertyValues(geojson, propertyName) {
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
  async animateGeoJSONByProperty(geojson, slide) {
    const style = slide.metadata?.style || {};
    const colorProperty = style.colorProperty;

    if (!colorProperty || !style.colorMap) {
      // No property-based animation, just display normally
      return;
    }

    this.geojsonAnimationActive = true;
    const uniqueValues = Object.keys(style.colorMap);

    // Animation parameters
    const glowDuration = 800; // Duration of glow effect in ms
    const fillDuration = 400; // Duration of fill effect in ms
    const pauseBetween = 200; // Pause between attributes

    for (let i = 0; i < uniqueValues.length && this.geojsonAnimationActive; i++) {
      const value = uniqueValues[i];
      const color = style.colorMap[value];

      // Highlight current legend item
      this.highlightLegendItem(slide, value);

      // Phase 1: Intense glow outline
      await this.animateGlow(value, color, glowDuration, colorProperty);

      // Phase 2: Fill/stroke appears
      if (this.geojsonAnimationActive) {
        await this.animateFill(value, color, fillDuration, colorProperty, style.fillOpacity || 0.5, style.strokeOpacity || 0.8, uniqueValues, style.colorMap);
      }

      // Small pause before next attribute
      if (i < uniqueValues.length - 1 && this.geojsonAnimationActive) {
        await new Promise(resolve => setTimeout(resolve, pauseBetween));
      }
    }

    // Broadcast clear highlight to controller
    this.slideshowChannel.postMessage({
      type: 'slideshow_legend_highlight',
      highlightValue: null
    });

    // Return true if animation completed successfully
    return this.geojsonAnimationActive;
  }

  // Animate glowing outline for a specific property value
  animateGlow(propertyValue, color, duration, propertyName) {
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

      const animate = (currentTime) => {
        if (!this.geojsonAnimationActive) {
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
          this.geojsonAnimationFrame = requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      this.geojsonAnimationFrame = requestAnimationFrame(animate);
    });
  }

  // Animate fill/stroke for a specific property value
  animateFill(propertyValue, color, duration, propertyName, targetFillOpacity, targetStrokeOpacity, allValues, colorMap) {
    return new Promise((resolve) => {
      const startTime = performance.now();
      const currentIndex = allValues.indexOf(propertyValue);
      const previousValues = allValues.slice(0, currentIndex);

      const animate = (currentTime) => {
        if (!this.geojsonAnimationActive) {
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
          this.geojsonAnimationFrame = requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      this.geojsonAnimationFrame = requestAnimationFrame(animate);
    });
  }

  // Stop GeoJSON animation
  stopGeoJSONAnimation() {
    this.geojsonAnimationActive = false;
    if (this.geojsonAnimationFrame) {
      cancelAnimationFrame(this.geojsonAnimationFrame);
      this.geojsonAnimationFrame = null;
    }

    // Remove glow layer
    if (map.getLayer('slideshow-glow')) {
      map.removeLayer('slideshow-glow');
    }
  }

  // Remove all slideshow GeoJSON layers from the map
  removeGeoJSONLayers() {
    this.stopGeoJSONAnimation();

    if (map.getSource('slideshow-geojson')) {
      ['slideshow-fill', 'slideshow-line', 'slideshow-polygon-outline', 'slideshow-point', 'slideshow-glow'].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      map.removeSource('slideshow-geojson');
    }
  }

  // Handle GeoJSON display
  async displayGeoJSON(geojson, slide) {
    // Stop any ongoing animation
    this.stopGeoJSONAnimation();

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
      animationCompleted = await this.animateGeoJSONByProperty(geojson, slide);

      // After animation completes, set final state
      if (this.geojsonAnimationActive) {
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

  // Display a slide
  async displaySlide(index) {
    if (!this.slideshowConfig || !this.slideshowConfig.slides || index >= this.slideshowConfig.slides.length) {
      return;
    }

    // Cancel any ongoing video animation frame from previous slide
    if (this.videoAnimationFrame) {
      cancelAnimationFrame(this.videoAnimationFrame);
      this.videoAnimationFrame = null;
    }

    const slide = this.slideshowConfig.slides[index];
    const oldMedia = this.currentMediaElement;
    const oldRotation = this.currentMediaRotation;
    const oldFitMode = this.currentMediaFitMode;
    const newRotation = slide.rotation || 0; // Get rotation from slide config
    const newFitMode = slide.fitMode || this.slideshowConfig.settings.fitMode || 'contain'; // Get fitMode from slide or global config

    try {
      // Preload media
      const media = await this.preloadMedia(slide);

      // Handle different media types
      if (slide.type === 'geojson') {
        // For GeoJSON, hide canvas and display on map with animation
        if (this.slideshowCanvas) {
          this.slideshowCanvas.classList.remove('active');
        }
        if (this.slideshowCtx) {
          this.slideshowCtx.clearRect(0, 0, this.slideshowCanvas.width, this.slideshowCanvas.height);
        }
        // Display metadata first so it's visible during animation
        this.displayMetadata(slide);
        const animationCompleted = await this.displayGeoJSON(media, slide);
        this.currentMediaElement = null;
        this.currentMediaRotation = 0; // GeoJSON doesn't use rotation
        this.currentMediaFitMode = 'contain'; // Reset fitMode

        // Auto-advance after GeoJSON animation completes
        if (animationCompleted && this.isSlideShowActive) {
          // Small pause before advancing to next slide
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (this.isSlideShowActive) {
            this.nextSlide();
            return; // Exit early, don't schedule another timer
          }
        }
      } else if (slide.type === 'video') {
        // Remove any GeoJSON layers from previous slide
        this.removeGeoJSONLayers();

        // For video, show canvas and play it
        if (this.slideshowCanvas) {
          this.slideshowCanvas.classList.add('active');
        }
        media.currentTime = 0;
        await media.play();
        this.currentMediaElement = media;
        this.currentMediaRotation = newRotation;
        this.currentMediaFitMode = newFitMode;

        // Animate transition
        await this.animateTransition(oldMedia, media, slide.transition || 'fade', 500, oldRotation, newRotation, oldFitMode, newFitMode);

        // Draw video frames continuously
        const drawVideoFrame = () => {
          if (this.isSlideShowActive && this.currentSlideIndex === index && !media.paused && !media.ended) {
            this.drawMediaOnCanvas(media, newFitMode, newRotation);
            this.videoAnimationFrame = requestAnimationFrame(drawVideoFrame);
          }
        };
        drawVideoFrame();
        // Display metadata for video
        this.displayMetadata(slide);
      } else {
        // Remove any GeoJSON layers from previous slide
        this.removeGeoJSONLayers();

        // For images/gifs, show canvas
        if (this.slideshowCanvas) {
          this.slideshowCanvas.classList.add('active');
        }
        this.currentMediaElement = media;
        this.currentMediaRotation = newRotation;
        this.currentMediaFitMode = newFitMode;
        await this.animateTransition(oldMedia, media, slide.transition || 'fade', 500, oldRotation, newRotation, oldFitMode, newFitMode);
        // Display metadata for image/gif types
        this.displayMetadata(slide);
      }

      // Schedule next slide
      if (this.slideshowConfig.settings.autoAdvance) {
        const duration = slide.duration || 5000;
        this.slideshowTimer = setTimeout(() => {
          this.nextSlide();
        }, duration);
      }

    } catch (error) {
      console.error('Error displaying slide:', error);
      // Try next slide on error
      this.nextSlide();
    }
  }

  // Advance to next slide (internal method)
  nextSlide() {
    if (!this.isSlideShowActive || !this.slideshowConfig) return;

    // Stop any ongoing GeoJSON animation
    this.stopGeoJSONAnimation();

    // Stop current video if playing
    if (this.currentMediaElement instanceof HTMLVideoElement) {
      this.currentMediaElement.pause();
    }

    // Clear timer
    if (this.slideshowTimer) {
      clearTimeout(this.slideshowTimer);
      this.slideshowTimer = null;
    }

    this.currentSlideIndex++;

    // Loop or stop
    if (this.currentSlideIndex >= this.slideshowConfig.slides.length) {
      if (this.slideshowConfig.settings.loop) {
        this.currentSlideIndex = 0;
      } else {
        this.stop();
        return;
      }
    }

    this.displaySlide(this.currentSlideIndex);
  }

  // Go to previous slide (internal method)
  previousSlide() {
    if (!this.isSlideShowActive || !this.slideshowConfig) return;

    // Stop any ongoing GeoJSON animation
    this.stopGeoJSONAnimation();

    // Clear timer
    if (this.slideshowTimer) {
      clearTimeout(this.slideshowTimer);
      this.slideshowTimer = null;
    }

    // Stop current video if playing
    if (this.currentMediaElement instanceof HTMLVideoElement) {
      this.currentMediaElement.pause();
    }

    this.currentSlideIndex = this.currentSlideIndex - 1;
    if (this.currentSlideIndex < 0) {
      this.currentSlideIndex = this.slideshowConfig.slides.length - 1;
    }

    this.displaySlide(this.currentSlideIndex);
  }

  // PUBLIC API METHODS

  // Start slideshow
  async start() {
    if (this.isSlideShowActive) {
      this.stop();
      return;
    }

    // Load config
    this.slideshowConfig = await this.loadSlideshowConfig();

    if (!this.slideshowConfig.slides || this.slideshowConfig.slides.length === 0) {
      showToast('No slides found in slideshow configuration');
      this.broadcastSlideshowState(null);
      return;
    }

    this.isSlideShowActive = true;
    this.currentSlideIndex = 0;

    // Broadcast animation state to controller
    this.slideshowChannel.postMessage({ type: 'animation_state', animationId: 'slideshow-btn', isActive: true });

    // Broadcast initial state immediately
    if (this.slideshowConfig && this.slideshowConfig.slides && this.slideshowConfig.slides.length > 0) {
      this.broadcastSlideshowState(this.slideshowConfig.slides[0]);
    } else {
      // Broadcast empty/loading state if config failed or empty
      this.slideshowChannel.postMessage({
        type: 'slideshow_update',
        isActive: true, // Still active, just empty
        currentIndex: 0,
        totalSlides: 0,
        metadata: { title: "No Slides Found", description: "Check configuration." },
        slideType: null
      });
    }

    // Prepare canvas (but don't show it yet - displaySlide will decide)
    if (this.slideshowCanvas) {
      this.resizeSlideshowCanvas();
    }

    if (this.slideshowMetadata) {
      this.slideshowMetadata.style.display = 'block';
    }

    // Update button state
    if (this.slideshowBtn) {
      this.slideshowBtn.classList.add('active');
    }

    // Start first slide
    this.displaySlide(this.currentSlideIndex);

    showToast('Slideshow started • Use ← → to navigate • ESC to exit');
  }

  // Stop slideshow
  stop() {
    this.isSlideShowActive = false;

    // Broadcast animation state to controller
    this.slideshowChannel.postMessage({ type: 'animation_state', animationId: 'slideshow-btn', isActive: false });

    // Clear timer
    if (this.slideshowTimer) {
      clearTimeout(this.slideshowTimer);
      this.slideshowTimer = null;
    }

    // Stop video if playing
    if (this.currentMediaElement instanceof HTMLVideoElement) {
      this.currentMediaElement.pause();
    }

    // Cancel transition animation
    if (this.transitionAnimationFrame) {
      cancelAnimationFrame(this.transitionAnimationFrame);
      this.transitionAnimationFrame = null;
    }

    // Cancel video animation frame
    if (this.videoAnimationFrame) {
      cancelAnimationFrame(this.videoAnimationFrame);
      this.videoAnimationFrame = null;
    }

    // Stop GeoJSON animation
    this.stopGeoJSONAnimation();

    // Clear canvas
    if (this.slideshowCtx) {
      this.slideshowCtx.clearRect(0, 0, this.slideshowCanvas.width, this.slideshowCanvas.height);
    }

    // Hide canvas and metadata
    if (this.slideshowCanvas) {
      this.slideshowCanvas.classList.remove('active');
    }

    if (this.slideshowMetadata) {
      this.slideshowMetadata.style.display = 'none';
    }

    // Remove GeoJSON layers
    if (map.getSource('slideshow-geojson')) {
      ['slideshow-fill', 'slideshow-line', 'slideshow-polygon-outline', 'slideshow-point', 'slideshow-glow'].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      map.removeSource('slideshow-geojson');
    }

    // Update button state
    if (this.slideshowBtn) {
      this.slideshowBtn.classList.remove('active');
    }

    this.currentMediaElement = null;
    this.currentSlideIndex = 0;

    // Broadcast stop state to controller
    this.slideshowChannel.postMessage({
      type: 'slideshow_update',
      isActive: false,
      currentIndex: 0,
      totalSlides: 0,
      metadata: null,
      slideType: null
    });

    showToast('Slideshow stopped');
  }

  // Toggle slideshow on/off
  toggle() {
    if (this.isSlideShowActive) {
      this.stop();
    } else {
      this.start();
    }
  }

  // Destroy the instance and clean up event listeners
  destroy() {
    this.stop();
    this.removeEventListeners();
  }
}

export { SlideshowAnimation };
