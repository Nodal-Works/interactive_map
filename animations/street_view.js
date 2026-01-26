// Google Street View Integration
// Map interaction module - sends click positions to controller
// Version: 3.1 - Dynamic follow cursor mode with map preview

(function() {
  const channel = new BroadcastChannel('map_controller_channel');
  
  // State
  let streetViewActive = false;
  let buttonInitialized = false;
  let viewerPosition = null;
  let cursorPosition = null;
  
  // Follow cursor settings (matching isovist behavior)
  let FOLLOW_CURSOR = true;
  const FOLLOW_THRESHOLD = 30; // meters before viewer starts following
  const FOLLOW_SPEED = 0.15; // how fast viewer follows (0-1)
  
  // Broadcast throttling
  let lastBroadcastPosition = null;
  let lastBroadcastHeading = null;
  const BROADCAST_MIN_DISTANCE = 3; // meters
  const BROADCAST_MIN_HEADING_CHANGE = 15; // degrees
  
  // Direction line settings
  const DIRECTION_LINE_LENGTH = 50; // meters
  
  console.log('Street View module loaded (v3.1 - with map preview)');
  
  // Listen for control messages from controller
  channel.onmessage = (event) => {
    const data = event.data;
    
    if (data.type === 'street_view_control') {
      switch (data.action) {
        case 'activate':
          activateStreetView();
          break;
        case 'deactivate':
          deactivateStreetView();
          break;
        case 'toggle_follow':
          FOLLOW_CURSOR = !FOLLOW_CURSOR;
          showToast(FOLLOW_CURSOR ? 'Follow cursor enabled' : 'Follow cursor disabled');
          break;
      }
    }
  };
  
  // Activate Street View mode - enable map clicks and follow
  function activateStreetView() {
    if (streetViewActive) return;
    streetViewActive = true;
    
    console.log('Street View activating...');
    
    // Broadcast state
    channel.postMessage({ 
      type: 'animation_state', 
      animationId: 'street-view-btn', 
      isActive: true 
    });
    
    // Add map layers for visualization
    addMapLayers();
    
    // Add map event listeners
    if (window.map) {
      console.log('Adding map listeners');
      window.map.on('click', onMapClick);
      window.map.on('mousemove', onMapMouseMove);
      window.map.getCanvas().style.cursor = 'crosshair';
    } else {
      console.warn('Map not available');
    }
    
    showToast('Street View active - click to place viewer, move to look around');
  }
  
  // Deactivate Street View mode
  function deactivateStreetView() {
    if (!streetViewActive) return;
    streetViewActive = false;
    
    console.log('Street View deactivating...');
    
    // Broadcast state
    channel.postMessage({ 
      type: 'animation_state', 
      animationId: 'street-view-btn', 
      isActive: false 
    });
    
    // Remove map event listeners
    if (window.map) {
      window.map.off('click', onMapClick);
      window.map.off('mousemove', onMapMouseMove);
      window.map.getCanvas().style.cursor = '';
    }
    
    // Clear map layers
    clearMapLayers();
    
    // Reset state
    viewerPosition = null;
    cursorPosition = null;
    lastBroadcastPosition = null;
    lastBroadcastHeading = null;
    
    showToast('Street View deactivated');
  }
  
  // Add map layers for viewer visualization
  function addMapLayers() {
    if (!window.map) return;
    
    // Add source for viewer point and direction
    if (!window.map.getSource('streetview-viewer')) {
      window.map.addSource('streetview-viewer', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
      
      // Direction line layer (rendered first, below point)
      window.map.addLayer({
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
      window.map.addLayer({
        id: 'streetview-fov',
        type: 'fill',
        source: 'streetview-viewer',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': '#00aaff',
          'fill-opacity': 0.15
        }
      });
      
      window.map.addLayer({
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
      
      // Viewer point layer (rendered on top)
      window.map.addLayer({
        id: 'streetview-viewer-point',
        type: 'circle',
        source: 'streetview-viewer',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 8,
          'circle-color': '#00aaff',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3
        }
      });
    }
  }
  
  // Clear map layers
  function clearMapLayers() {
    if (!window.map) return;
    
    // Clear data
    if (window.map.getSource('streetview-viewer')) {
      window.map.getSource('streetview-viewer').setData({
        type: 'FeatureCollection',
        features: []
      });
    }
  }
  
  // Update map visualization
  function updateMapVisualization() {
    if (!window.map || !viewerPosition) return;
    
    const features = [];
    
    // Add viewer point
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: viewerPosition
      },
      properties: {}
    });
    
    // Add direction line and FOV cone if cursor is set
    if (cursorPosition) {
      const bearing = calculateBearing(viewerPosition, cursorPosition);
      const endPoint = destination(viewerPosition, DIRECTION_LINE_LENGTH, bearing);
      
      // Direction line
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [viewerPosition, endPoint]
        },
        properties: {}
      });
      
      // FOV cone (100° field of view to match Street View)
      const fovAngle = 50; // half of 100°
      const fovDistance = DIRECTION_LINE_LENGTH * 1.5;
      const leftPoint = destination(viewerPosition, fovDistance, (bearing - fovAngle + 360) % 360);
      const rightPoint = destination(viewerPosition, fovDistance, (bearing + fovAngle) % 360);
      
      // Create arc points for smoother cone
      const arcPoints = [viewerPosition];
      const arcSteps = 20;
      for (let i = 0; i <= arcSteps; i++) {
        const angle = bearing - fovAngle + (i / arcSteps) * (fovAngle * 2);
        arcPoints.push(destination(viewerPosition, fovDistance, (angle + 360) % 360));
      }
      arcPoints.push(viewerPosition); // close the polygon
      
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [arcPoints]
        },
        properties: {}
      });
    }
    
    // Update source
    if (window.map.getSource('streetview-viewer')) {
      window.map.getSource('streetview-viewer').setData({
        type: 'FeatureCollection',
        features: features
      });
    }
  }
  
  // Handle map clicks - place viewer position
  function onMapClick(e) {
    if (!streetViewActive) return;
    
    viewerPosition = [e.lngLat.lng, e.lngLat.lat];
    cursorPosition = viewerPosition; // Initialize cursor at click point
    console.log('Viewer placed at:', viewerPosition);
    
    // Update map visualization
    updateMapVisualization();
    
    // Immediately broadcast the new position
    broadcastPosition();
    
    showToast('Viewer placed - move cursor to look around');
  }
  
  // Handle mouse move - update heading and follow
  function onMapMouseMove(e) {
    if (!streetViewActive || !viewerPosition) return;
    
    cursorPosition = [e.lngLat.lng, e.lngLat.lat];
    
    // Auto-follow cursor if enabled
    if (FOLLOW_CURSOR) {
      const dist = distance(viewerPosition, cursorPosition);
      
      if (dist > FOLLOW_THRESHOLD) {
        // Move viewer toward cursor
        const newLng = viewerPosition[0] + (cursorPosition[0] - viewerPosition[0]) * FOLLOW_SPEED;
        const newLat = viewerPosition[1] + (cursorPosition[1] - viewerPosition[1]) * FOLLOW_SPEED;
        viewerPosition = [newLng, newLat];
      }
    }
    
    // Update map visualization
    updateMapVisualization();
    
    // Broadcast position update (throttled)
    broadcastPosition();
  }
  
  // Broadcast position to controller (throttled)
  function broadcastPosition() {
    if (!viewerPosition) return;
    
    const currentHeading = cursorPosition ? calculateBearing(viewerPosition, cursorPosition) : 0;
    const positionChanged = !lastBroadcastPosition || distance(lastBroadcastPosition, viewerPosition) > BROADCAST_MIN_DISTANCE;
    const headingChanged = lastBroadcastHeading === null || Math.abs(currentHeading - lastBroadcastHeading) > BROADCAST_MIN_HEADING_CHANGE;
    
    if (positionChanged || headingChanged) {
      lastBroadcastPosition = [...viewerPosition];
      lastBroadcastHeading = currentHeading;
      
      channel.postMessage({
        type: 'street_view_position',
        position: {
          lng: viewerPosition[0],
          lat: viewerPosition[1]
        },
        heading: currentHeading
      });
    }
  }
  
  // Calculate bearing between two points
  function calculateBearing(from, to) {
    const dLon = to[0] - from[0];
    const y = Math.sin(dLon * Math.PI / 180) * Math.cos(to[1] * Math.PI / 180);
    const x = Math.cos(from[1] * Math.PI / 180) * Math.sin(to[1] * Math.PI / 180) -
              Math.sin(from[1] * Math.PI / 180) * Math.cos(to[1] * Math.PI / 180) * 
              Math.cos(dLon * Math.PI / 180);
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }
  
  // Calculate destination point given start, distance (meters), and bearing (degrees)
  function destination(origin, dist, bearing) {
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
  function distance(point1, point2) {
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
  function showToast(message) {
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
  function initStreetViewButton() {
    if (buttonInitialized) return;
    
    const btn = document.getElementById('street-view-btn');
    if (!btn) {
      console.log('Street View button not found');
      return;
    }
    
    console.log('Initializing Street View button');
    buttonInitialized = true;
    
    btn.addEventListener('click', () => {
      console.log('Street View button clicked, active:', streetViewActive);
      if (streetViewActive) {
        deactivateStreetView();
      } else {
        activateStreetView();
      }
    });
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStreetViewButton);
  } else {
    initStreetViewButton();
  }
  
  // Also try when map is ready
  const checkMap = setInterval(() => {
    if (window.map) {
      clearInterval(checkMap);
      initStreetViewButton();
      console.log('Map ready, Street View initialized');
    }
  }, 100);
  setTimeout(() => clearInterval(checkMap), 10000);
  
})();
