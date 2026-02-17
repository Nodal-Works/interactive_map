// Google Street View Integration
// Map interaction module - sends click positions to controller
// Version: 3.2 - Shows actual camera position from Street View metadata
// Refactored to ES6 class-based module

class StreetViewIntegration {
  constructor(map) {
    this.map = map;
    this.channel = new BroadcastChannel('map_controller_channel');
    
    // State
    this.streetViewActive = false;
    this.buttonInitialized = false;
    this.viewerPosition = null;
    this.cursorPosition = null;
    this.actualCameraPosition = null; // The real Street View camera location
    this.apiKey = null;
    
    // Follow cursor settings (matching isovist behavior)
    this.FOLLOW_CURSOR = true;
    this.FOLLOW_THRESHOLD = 30; // meters before viewer starts following
    this.FOLLOW_SPEED = 0.15; // how fast viewer follows (0-1)
    
    // Broadcast throttling
    this.lastBroadcastPosition = null;
    this.lastBroadcastHeading = null;
    this.lastMetadataFetch = null;
    this.BROADCAST_MIN_DISTANCE = 3; // meters
    this.BROADCAST_MIN_HEADING_CHANGE = 15; // degrees
    this.METADATA_FETCH_DISTANCE = 5; // meters - fetch new metadata if moved this far
    
    // Direction line settings
    this.DIRECTION_LINE_LENGTH = 50; // meters
    
    // Camera position history for fading trail
    this.cameraHistory = [];
    this.MAX_HISTORY = 10; // Number of past positions to show
    
    // SAM Segmentation Integration
    this.SAM_SERVER_URL = 'http://localhost:8000';
    this.samServerAvailable = false;
    
    console.log('Street View module loaded (v3.4 - with SAM segmentation)');
    
    // Bind event handlers
    this.onMapClick = this.onMapClick.bind(this);
    this.onMapMouseMove = this.onMapMouseMove.bind(this);
    this.onChannelMessage = this.onChannelMessage.bind(this);
    
    // Initialize
    this.init();
  }
  
  async init() {
    // Load API key from config
    await this.loadApiKey();
    
    // Initialize channel message listener
    this.channel.onmessage = this.onChannelMessage;
    
    // Initialize SAM segmentation
    await this.initSamSegmentation();
    
    // Initialize button when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initStreetViewButton());
    } else {
      this.initStreetViewButton();
    }
    
    // Wait for map if not available
    if (!this.map && window.map) {
      this.map = window.map;
    }
    
    if (!this.map) {
      const checkMap = setInterval(() => {
        if (window.map && !this.map) {
          this.map = window.map;
          clearInterval(checkMap);
          this.initStreetViewButton();
          console.log('Map ready, Street View initialized');
        }
      }, 100);
      setTimeout(() => clearInterval(checkMap), 10000);
    }
  }
  
  // Load API key from config (try multiple paths)
  async loadApiKey() {
    const paths = ['trafik-config.json', './trafik-config.json', '../trafik-config.json'];
    for (const path of paths) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          const config = await response.json();
          // Try both possible key names
          const key = config.streetViewApiKey || config.googleMapsApiKey;
          if (key) {
            this.apiKey = key;
            console.log('Street View API key loaded from', path);
            return;
          }
        }
      } catch (e) {
        // Try next path
      }
    }
    console.warn('Could not load API key from any path');
  }
  
  // Channel message handler
  onChannelMessage(event) {
    const data = event.data;
    
    if (data.type === 'street_view_control') {
      switch (data.action) {
        case 'activate':
          this.start();
          break;
        case 'deactivate':
          this.stop();
          break;
        case 'toggle_follow':
          this.FOLLOW_CURSOR = !this.FOLLOW_CURSOR;
          this.showToast(this.FOLLOW_CURSOR ? 'Follow cursor enabled' : 'Follow cursor disabled');
          break;
      }
    }
  }
  
  // Public methods
  start() {
    this.activateStreetView();
  }
  
  stop() {
    this.deactivateStreetView();
  }
  
  toggle() {
    if (this.streetViewActive) {
      this.stop();
    } else {
      this.start();
    }
  }
  
  isActive() {
    return this.streetViewActive;
  }
  
  // Activate Street View mode - enable map clicks and follow
  activateStreetView() {
    if (this.streetViewActive) return;
    this.streetViewActive = true;
    
    console.log('Street View activating...');
    
    // Hide street life animation canvas
    const streetLifeCanvas = document.getElementById('street-life-canvas');
    if (streetLifeCanvas) {
      streetLifeCanvas.style.display = 'none';
    }
    
    // Hide trafik (tram/bus) canvas
    const trafikCanvas = document.getElementById('trafik-canvas');
    if (trafikCanvas) {
      trafikCanvas.style.display = 'none';
    }
    
    // Broadcast state
    this.channel.postMessage({ 
      type: 'animation_state', 
      animationId: 'street-view-btn', 
      isActive: true 
    });
    
    // Add map layers for visualization
    this.addMapLayers();
    
    // Add map event listeners
    if (this.map) {
      console.log('Adding map listeners');
      this.map.on('click', this.onMapClick);
      this.map.on('mousemove', this.onMapMouseMove);
      this.map.getCanvas().style.cursor = 'crosshair';
    } else {
      console.warn('Map not available');
    }
    
    this.showToast('Street View active - click to place viewer, move to look around');
  }
  
  // Deactivate Street View mode
  deactivateStreetView() {
    if (!this.streetViewActive) return;
    this.streetViewActive = false;
    
    console.log('Street View deactivating...');
    
    // Show street life animation canvas again
    const streetLifeCanvas = document.getElementById('street-life-canvas');
    if (streetLifeCanvas) {
      streetLifeCanvas.style.display = 'block';
    }
    
    // Show trafik (tram/bus) canvas again
    const trafikCanvas = document.getElementById('trafik-canvas');
    if (trafikCanvas) {
      trafikCanvas.style.display = 'block';
    }
    
    // Broadcast state
    this.channel.postMessage({ 
      type: 'animation_state', 
      animationId: 'street-view-btn', 
      isActive: false 
    });
    
    // Remove map event listeners
    if (this.map) {
      this.map.off('click', this.onMapClick);
      this.map.off('mousemove', this.onMapMouseMove);
      this.map.getCanvas().style.cursor = '';
    }
    
    // Clear map layers
    this.clearMapLayers();
    
    // Reset state
    this.viewerPosition = null;
    this.cursorPosition = null;
    this.actualCameraPosition = null;
    this.lastBroadcastPosition = null;
    this.lastBroadcastHeading = null;
    this.lastMetadataFetch = null;
    this.cameraHistory.length = 0; // Clear history
    
    this.showToast('Street View deactivated');
  }
  
  // Add map layers for viewer visualization
  addMapLayers() {
    if (!this.map) return;
    
    // Note: Google Street View coverage overlay requires the full Google Maps JavaScript API
    // which would conflict with MapLibre. The coverage isn't available as public tiles.
    
    // Add source for viewer point and direction (user's requested position)
    if (!this.map.getSource('streetview-viewer')) {
      this.map.addSource('streetview-viewer', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
      
      // Direction line layer (rendered first, below point)
      this.map.addLayer({
        id: 'streetview-direction',
        type: 'line',
        source: 'streetview-viewer',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': '#00aaff',
          'line-width': 4,
          'line-opacity': 0.9
        },
        layout: {
          'line-cap': 'round'
        }
      });
      
      // Field of view cone (semi-transparent)
      this.map.addLayer({
        id: 'streetview-fov',
        type: 'fill',
        source: 'streetview-viewer',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': '#00aaff',
          'fill-opacity': 0.15
        }
      });
      
      this.map.addLayer({
        id: 'streetview-fov-outline',
        type: 'line',
        source: 'streetview-viewer',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'line-color': '#00aaff',
          'line-width': 2,
          'line-opacity': 0.5,
          'line-dasharray': [2, 2]
        }
      });
      
      // Viewer point outer glow (user's requested position)
      this.map.addLayer({
        id: 'streetview-viewer-glow',
        type: 'circle',
        source: 'streetview-viewer',
        filter: ['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'type'], 'camera']],
        paint: {
          'circle-radius': 16,
          'circle-color': '#00aaff',
          'circle-opacity': 0.3,
          'circle-blur': 1
        }
      });
      
      // Viewer point layer (user's requested position - blue)
      this.map.addLayer({
        id: 'streetview-viewer-point',
        type: 'circle',
        source: 'streetview-viewer',
        filter: ['all', ['==', ['geometry-type'], 'Point'], ['!', ['has', 'type']]],
        paint: {
          'circle-radius': 10,
          'circle-color': '#00aaff',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3
        }
      });
      
      // Historical camera positions (fading green trail)
      this.map.addLayer({
        id: 'streetview-camera-history',
        type: 'circle',
        source: 'streetview-viewer',
        filter: ['==', ['get', 'type'], 'camera-history'],
        paint: {
          'circle-radius': 8,
          'circle-color': '#00ff88',
          'circle-opacity': ['get', 'opacity'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': ['get', 'opacity']
        }
      });
      
      // Actual camera position glow (green - brightest)
      this.map.addLayer({
        id: 'streetview-camera-glow',
        type: 'circle',
        source: 'streetview-viewer',
        filter: ['==', ['get', 'type'], 'camera'],
        paint: {
          'circle-radius': 22,
          'circle-color': '#00ff88',
          'circle-opacity': 0.5,
          'circle-blur': 1
        }
      });
      
      // Actual camera position point (green - brightest, on top)
      this.map.addLayer({
        id: 'streetview-camera-point',
        type: 'circle',
        source: 'streetview-viewer',
        filter: ['==', ['get', 'type'], 'camera'],
        paint: {
          'circle-radius': 14,
          'circle-color': '#00ff88',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 4
        }
      });
      
      console.log('Street View viewer layers added');
    }
  }
  
  // Clear map layers
  clearMapLayers() {
    if (!this.map) return;
    
    // Clear viewer data
    if (this.map.getSource('streetview-viewer')) {
      this.map.getSource('streetview-viewer').setData({
        type: 'FeatureCollection',
        features: []
      });
    }
  }
  
  // Update map visualization
  updateMapVisualization() {
    if (!this.map || !this.viewerPosition) return;
    
    const features = [];
    
    // Add viewer point
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: this.viewerPosition
      },
      properties: {}
    });
    
    // Add direction line and FOV cone if cursor is set
    if (this.cursorPosition) {
      const bearing = this.calculateBearing(this.viewerPosition, this.cursorPosition);
      const endPoint = this.destination(this.viewerPosition, this.DIRECTION_LINE_LENGTH, bearing);
      
      // Direction line
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [this.viewerPosition, endPoint]
        },
        properties: {}
      });
      
      // FOV cone (100° field of view to match Street View)
      const fovAngle = 50; // half of 100°
      const fovDistance = this.DIRECTION_LINE_LENGTH * 1.5;
      const leftPoint = this.destination(this.viewerPosition, fovDistance, (bearing - fovAngle + 360) % 360);
      const rightPoint = this.destination(this.viewerPosition, fovDistance, (bearing + fovAngle) % 360);
      
      // Create arc points for smoother cone
      const arcPoints = [this.viewerPosition];
      const arcSteps = 20;
      for (let i = 0; i <= arcSteps; i++) {
        const angle = bearing - fovAngle + (i / arcSteps) * (fovAngle * 2);
        arcPoints.push(this.destination(this.viewerPosition, fovDistance, (angle + 360) % 360));
      }
      arcPoints.push(this.viewerPosition); // close the polygon
      
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [arcPoints]
        },
        properties: {}
      });
    }
    
    // Add historical camera positions (fading trail)
    this.cameraHistory.forEach((pos, index) => {
      const opacity = 1 - ((index + 1) / (this.MAX_HISTORY + 1)); // Fade from ~0.9 to ~0.1
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: pos
        },
        properties: { 
          type: 'camera-history',
          opacity: opacity,
          index: index
        }
      });
    });
    
    // Add actual camera position if available (green marker - brightest)
    if (this.actualCameraPosition) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: this.actualCameraPosition
        },
        properties: { type: 'camera' }
      });
    }
    
    // Update source
    if (this.map.getSource('streetview-viewer')) {
      this.map.getSource('streetview-viewer').setData({
        type: 'FeatureCollection',
        features: features
      });
    }
  }
  
  // Check if the SAM server is running
  async checkSamServer() {
    try {
      const resp = await fetch(this.SAM_SERVER_URL + '/');
      if (resp.ok) {
        this.samServerAvailable = true;
        this.setSamStatus('Ready', true);
      } else {
        this.samServerAvailable = false;
        this.setSamStatus('Unavailable', false);
      }
    } catch (e) {
      this.samServerAvailable = false;
      this.setSamStatus('Unavailable', false);
    }
  }

  setSamStatus(msg, ok) {
    const el = document.getElementById('sam-server-status');
    if (el) {
      el.textContent = 'SAM Server: ' + msg;
      el.style.color = ok ? '#22c55e' : '#ef4444';
    }
  }

  // Initialize SAM segmentation
  async initSamSegmentation() {
    const btn = document.getElementById('sam-segment-btn');
    if (!btn) return;
    
    btn.addEventListener('click', async () => {
      await this.checkSamServer();
      if (!this.samServerAvailable) {
        this.showToast('SAM server not available');
        return;
      }
      // Get the current Street View image element
      const img = document.getElementById('street-view-image');
      if (!img || !img.src || img.style.display === 'none') {
        this.showToast('No Street View image to segment');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Segmenting...';
      this.setSamStatus('Processing...', true);
      try {
        // Fetch the image as a blob
        const imageBlob = await fetch(img.src).then(r => r.blob());
        const formData = new FormData();
        formData.append('file', imageBlob, 'streetview.jpg');
        // Optionally add confidence/lite params
        // formData.append('confidence', '0.3');
        // formData.append('lite', 'true');
        const resp = await fetch(this.SAM_SERVER_URL + '/segment', {
          method: 'POST',
          body: formData
        });
        if (!resp.ok) throw new Error('Segmentation failed');

        const contentType = (resp.headers.get('content-type') || '').toLowerCase();
        let segData = null;
        if (contentType.includes('application/json')) {
          const body = await resp.json();
          segData = body.results || body;
          if (body.mask) {
            const maskContainer = document.getElementById('sam-mask-container');
            if (maskContainer) {
              maskContainer.innerHTML = `<img src="${body.mask}" style="max-width:100%; border-radius:8px; border:2px solid #444; margin-bottom:0.5rem;" alt="Segmentation Mask" />`;
            }
          }
        } else {
          // Older behavior: image blob + X-Segmentation-JSON header
          const maskBlob = await resp.blob();
          const segJson = resp.headers.get('X-Segmentation-JSON');

          let finalMaskBlob = maskBlob;
          if (segJson) {
            try {
              const data = JSON.parse(segJson);
              const candidates = [];
              if (data.mask_url) candidates.push(data.mask_url);
              if (data.mask) candidates.push(data.mask);
              if (data.mask_filename) candidates.push(data.mask_filename);
              if (data.files && typeof data.files === 'object') Object.values(data.files).forEach(v => candidates.push(v));
              if (data.output_files && typeof data.output_files === 'object') Object.values(data.output_files).forEach(v => candidates.push(v));

              let chosen = null;
              for (const c of candidates) {
                if (!c) continue;
                const s = String(c);
                if (/mask/i.test(s) || /_mask\./i.test(s)) { chosen = s; break; }
                if (/^https?:\/\/.+\.(png|jpg|jpeg|webp)$/i.test(s)) { chosen = s; break; }
              }

              if (chosen) {
                const candidateUrl = (/^https?:\/\//i.test(chosen)) ? chosen : (this.SAM_SERVER_URL + '/' + chosen.replace(/^\//, ''));
                try {
                  const r2 = await fetch(candidateUrl);
                  if (r2.ok) {
                    const b2 = await r2.blob();
                    const ct = r2.headers.get('content-type') || '';
                    if (ct.startsWith('image/') || b2.size > 0) finalMaskBlob = b2;
                  }
                } catch (e) {
                  // ignore
                }
              }
              segData = data;
            } catch (e) {
              // ignore
            }
          }

          const maskUrl = URL.createObjectURL(finalMaskBlob);
          const maskContainer = document.getElementById('sam-mask-container');
          if (maskContainer) {
            maskContainer.innerHTML = `<img src="${maskUrl}" style="max-width:100%; border-radius:8px; border:2px solid #444; margin-bottom:0.5rem;" alt="Segmentation Mask" />`;
          }
        }
        // Show class breakdown
        if (segJson) {
          const data = JSON.parse(segJson);
          const cats = data.categories || {};
          const palette = {
            'Open View': '#1f78b4',
            'Trees': '#33a02c',
            'Bostad': '#e31a1c',
            'Verksamhet': '#ff7f00',
            'Samhällsfunktion': '#6a3d9a',
            'Komplementbyggnad': '#b15928',
            'Unknown': '#8c8c8c'
          };
          let table = '<table style="width:100%; font-size:1rem; color:#eee; border-collapse:collapse;">';
          table += '<tr><th style="text-align:left; color:#60a5fa;">Class</th></tr>';
          Object.entries(cats).sort((a,b)=>b[1].pixel_ratio_percent-a[1].pixel_ratio_percent).forEach(([cat, val]) => {
            const color = palette[cat] || '#777';
            table += `<tr><td style="padding:6px 4px; display:flex; align-items:center; gap:8px;"><span style="width:12px; height:12px; background:${color}; display:inline-block; border-radius:2px;"></span><span>${cat}</span></td></tr>`;
          });
          table += '</table>';
          const classTable = document.getElementById('sam-class-table');
          if (classTable) classTable.innerHTML = table;
        }
        this.setSamStatus('Done', true);
      } catch (err) {
        this.setSamStatus('Error', false);
        this.showToast('Segmentation failed: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Segment Street View';
      }
    });
    // Initial status check
    await this.checkSamServer();
  }
  
  // Fetch Street View metadata to get actual camera position
  async fetchStreetViewMetadata(position) {
    if (!this.apiKey) {
      console.warn('No API key for Street View metadata');
      return;
    }
    
    // Throttle metadata fetches
    if (this.lastMetadataFetch && this.distance(this.lastMetadataFetch, position) < this.METADATA_FETCH_DISTANCE) {
      return;
    }
    this.lastMetadataFetch = [...position];
    
    const lat = position[1];
    const lng = position[0];
    const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${this.apiKey}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'OK' && data.location) {
        const newCameraPos = [data.location.lng, data.location.lat];
        
        // Add to history if different from last position (avoid duplicates)
        if (!this.actualCameraPosition || 
            this.distance(this.actualCameraPosition, newCameraPos) > 2) {
          // Add previous position to history before updating
          if (this.actualCameraPosition) {
            this.cameraHistory.unshift([...this.actualCameraPosition]);
            // Trim history to max size
            while (this.cameraHistory.length > this.MAX_HISTORY) {
              this.cameraHistory.pop();
            }
          }
        }
        
        this.actualCameraPosition = newCameraPos;
        console.log('Actual camera at:', this.actualCameraPosition, 'Date:', data.date);
        
        // Update visualization with camera position
        this.updateMapVisualization();
      } else {
        this.actualCameraPosition = null;
        console.log('No Street View coverage at this location');
        this.updateMapVisualization();
      }
    } catch (err) {
      console.warn('Failed to fetch Street View metadata:', err);
    }
  }
  
  // Handle map clicks - place viewer position
  onMapClick(e) {
    if (!this.streetViewActive) return;
    
    this.viewerPosition = [e.lngLat.lng, e.lngLat.lat];
    this.cursorPosition = this.viewerPosition; // Initialize cursor at click point
    console.log('Viewer placed at:', this.viewerPosition);
    
    // Fetch actual camera position
    this.fetchStreetViewMetadata(this.viewerPosition);
    
    // Update map visualization
    this.updateMapVisualization();
    
    // Immediately broadcast the new position
    this.broadcastPosition();
    
    this.showToast('Viewer placed - move cursor to look around');
  }
  
  // Handle mouse move - update heading and follow
  onMapMouseMove(e) {
    if (!this.streetViewActive || !this.viewerPosition) return;
    
    this.cursorPosition = [e.lngLat.lng, e.lngLat.lat];
    
    // Auto-follow cursor if enabled
    if (this.FOLLOW_CURSOR) {
      const dist = this.distance(this.viewerPosition, this.cursorPosition);
      
      if (dist > this.FOLLOW_THRESHOLD) {
        // Move viewer toward cursor
        const newLng = this.viewerPosition[0] + (this.cursorPosition[0] - this.viewerPosition[0]) * this.FOLLOW_SPEED;
        const newLat = this.viewerPosition[1] + (this.cursorPosition[1] - this.viewerPosition[1]) * this.FOLLOW_SPEED;
        this.viewerPosition = [newLng, newLat];
        
        // Fetch metadata for new position (throttled internally)
        this.fetchStreetViewMetadata(this.viewerPosition);
      }
    }
    
    // Update map visualization
    this.updateMapVisualization();
    
    // Broadcast position update (throttled)
    this.broadcastPosition();
  }
  
  // Broadcast position to controller (throttled)
  broadcastPosition() {
    if (!this.viewerPosition) return;
    
    const currentHeading = this.cursorPosition ? this.calculateBearing(this.viewerPosition, this.cursorPosition) : 0;
    const positionChanged = !this.lastBroadcastPosition || this.distance(this.lastBroadcastPosition, this.viewerPosition) > this.BROADCAST_MIN_DISTANCE;
    const headingChanged = this.lastBroadcastHeading === null || Math.abs(currentHeading - this.lastBroadcastHeading) > this.BROADCAST_MIN_HEADING_CHANGE;
    
    if (positionChanged || headingChanged) {
      this.lastBroadcastPosition = [...this.viewerPosition];
      this.lastBroadcastHeading = currentHeading;
      
      this.channel.postMessage({
        type: 'street_view_position',
        position: {
          lng: this.viewerPosition[0],
          lat: this.viewerPosition[1]
        },
        heading: currentHeading
      });
    }
  }
  
  // Calculate bearing between two points
  calculateBearing(from, to) {
    const dLon = to[0] - from[0];
    const y = Math.sin(dLon * Math.PI / 180) * Math.cos(to[1] * Math.PI / 180);
    const x = Math.cos(from[1] * Math.PI / 180) * Math.sin(to[1] * Math.PI / 180) -
              Math.sin(from[1] * Math.PI / 180) * Math.cos(to[1] * Math.PI / 180) * 
              Math.cos(dLon * Math.PI / 180);
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }
  
  // Calculate destination point given start, distance (meters), and bearing (degrees)
  destination(origin, dist, bearing) {
    const R = 6371000; // Earth radius in meters
    const lat1 = origin[1] * Math.PI / 180;
    const lon1 = origin[0] * Math.PI / 180;
    const brng = bearing * Math.PI / 180;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(dist / R) +
      Math.cos(lat1) * Math.sin(dist / R) * Math.cos(brng)
    );

    const lon2 = lon1 + Math.atan2(
      Math.sin(brng) * Math.sin(dist / R) * Math.cos(lat1),
      Math.cos(dist / R) - Math.sin(lat1) * Math.sin(lat2)
    );

    return [lon2 * 180 / Math.PI, lat2 * 180 / Math.PI];
  }
  
  // Calculate distance between two points in meters
  distance(point1, point2) {
    const R = 6371000; // Earth radius in meters
    const lat1 = point1[1] * Math.PI / 180;
    const lat2 = point2[1] * Math.PI / 180;
    const dLat = (point2[1] - point1[1]) * Math.PI / 180;
    const dLon = (point2[0] - point1[0]) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
  
  // Toast notification helper
  showToast(message) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast-notification';
      toast.style.cssText = 'position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: rgba(0, 0, 0, 0.85); color: #fff; padding: 12px 24px; border-radius: 8px; font-size: 14px; z-index: 10000; transition: opacity 0.3s ease; pointer-events: none;';
      document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.style.opacity = '1';
    
    setTimeout(() => {
      toast.style.opacity = '0';
    }, 3000);
  }
  
  // Initialize button on main map
  initStreetViewButton() {
    if (this.buttonInitialized) return;
    const btn = document.getElementById('street-view-btn');
    if (!btn) {
      console.log('Street View button not found');
      return;
    }
    console.log('Initializing Street View button');
    this.buttonInitialized = true;
    btn.addEventListener('click', () => {
      console.log('Street View button clicked, active:', this.streetViewActive);
      this.toggle();
    });
  }
}

// Export the class
export { StreetViewIntegration };

// Create global instance if map is available
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const mapInstance = window.map || null;
    window.streetViewIntegration = new StreetViewIntegration(mapInstance);
  });
} else {
  const mapInstance = window.map || null;
  window.streetViewIntegration = new StreetViewIntegration(mapInstance);
}
