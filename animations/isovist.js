// Interactive Isovist (Viewshed) Visualization
// Real-time visibility polygon calculation with draggable viewer
// Version: 1.1 - Static dash pattern with breathing glow effect

(function() {
  if (typeof window.map === 'undefined') {
    console.warn('Isovist: Map not ready yet, will initialize when available');
  }

  let isovistActive = false;
  let viewerPosition = null;
  let cursorPosition = null;
  let obstacles = []; // Flattened list of polygon rings with bboxes
  let isDragging = false;
  let updateRequestId = null;
  let animationFrameId = null;

  let MAX_VIEW_DISTANCE = 200; // meters
  const RAY_COUNT = 360; // number of rays to cast
  let HUMAN_FOV = 120; // human field of view in degrees (120° total, 60° each side)
  let USE_HUMAN_FOV = true; // set to false for full 360° view
  let FOLLOW_CURSOR = true; // viewer follows cursor when it moves far enough
  const FOLLOW_THRESHOLD = 50; // distance in meters before viewer starts following
  const FOLLOW_SPEED = 0.15; // how fast viewer follows (0-1, higher = faster)

  // Listen for remote control messages
  const channel = new BroadcastChannel('map_controller_channel');
  channel.onmessage = (event) => {
    const data = event.data;
    if (data.type === 'isovist_control') {
        switch (data.action) {
            case 'set_radius':
                MAX_VIEW_DISTANCE = parseInt(data.value);
                if (isovistActive && viewerPosition) updateVisualization();
                break;
            case 'set_fov':
                HUMAN_FOV = parseInt(data.value);
                if (isovistActive && viewerPosition) updateVisualization();
                break;
            case 'toggle_360':
                USE_HUMAN_FOV = !USE_HUMAN_FOV;
                if (isovistActive && viewerPosition) updateVisualization();
                break;
             case 'toggle_follow':
                FOLLOW_CURSOR = !FOLLOW_CURSOR;
                break;
        }
    }
  };

  // Initialize isovist mode
  function initIsovist() {
    const btn = document.getElementById('isovist-btn');
    if (!btn) return;

    btn.addEventListener('click', toggleIsovist);
  }

  function toggleIsovist() {
    isovistActive = !isovistActive;
    const btn = document.getElementById('isovist-btn');

    if (isovistActive) {
      btn.classList.add('toggled-off');
      btn.style.background = '#0078d4';
      btn.style.color = '#fff';
      activateIsovist();
      const fovMsg = USE_HUMAN_FOV ? ` (${HUMAN_FOV}° FOV)` : ' (360° view)';
      const followMsg = FOLLOW_CURSOR ? ' - Viewer follows cursor!' : '';
      showToast(`Click map to place viewer. Move cursor to look around${fovMsg}${followMsg}`);
    } else {
      btn.classList.remove('toggled-off');
      btn.style.background = '';
      btn.style.color = '';
      deactivateIsovist();
      showToast('Isovist mode disabled');
    }
  }

  function activateIsovist() {
    // Load building obstacles from loaded GeoJSON
    loadBuildingObstacles();

    // Add isovist layers to map
    if (!map.getSource('isovist-polygon')) {
      map.addSource('isovist-polygon', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Create a radial gradient effect using multiple layers with varying opacity
      // We'll create the fill with a custom paint property
      map.addLayer({
        id: 'isovist-fill',
        type: 'fill',
        source: 'isovist-polygon',
        paint: {
          'fill-color': '#ffff00',
          'fill-opacity': 0.35
        }
      });
    }

    // Add gradient overlay source for fade effect
    if (!map.getSource('isovist-gradient')) {
      map.addSource('isovist-gradient', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Multiple layers for gradient fade effect (stacked bands)
      // We use constant opacity because the bands will overlap
      // Band 0 (smallest) is covered by Band 0, 1, 2, 3, 4 -> High opacity
      // Band 4 (largest) is covered by Band 4 only -> Low opacity
      for (let i = 0; i < 5; i++) {
        map.addLayer({
          id: `isovist-gradient-${i}`,
          type: 'fill',
          source: 'isovist-gradient',
          filter: ['==', ['get', 'ring'], i],
          paint: {
            'fill-color': '#ffd500',
            'fill-opacity': 0.1
          }
        });
      }
    }

    // Add a thin outline for definition (added after gradients to be on top)
    if (!map.getLayer('isovist-line')) {
      map.addLayer({
        id: 'isovist-line',
        type: 'line',
        source: 'isovist-polygon',
        paint: {
          'line-color': '#ff0099',
          'line-width': 16,
          'line-opacity': 1,
          'line-dasharray': [2, 2]  // Static dashes - never updated to prevent animation
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        }
      });
      
      // Explicitly disable transitions for this layer to prevent dash animation
      map.setPaintProperty('isovist-line', 'line-width-transition', { duration: 0 });
      map.setPaintProperty('isovist-line', 'line-opacity-transition', { duration: 0 });
      map.setPaintProperty('isovist-line', 'line-blur-transition', { duration: 0 });
    }

    if (!map.getSource('isovist-viewer')) {
      map.addSource('isovist-viewer', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      map.addLayer({
        id: 'isovist-viewer-point',
        type: 'circle',
        source: 'isovist-viewer',
        paint: {
          'circle-radius': 4,
          'circle-color': '#ff0000',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1
        }
      });

      map.addLayer({
        id: 'isovist-direction',
        type: 'line',
        source: 'isovist-viewer',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': '#ff0000',
          'line-width': 3,
          'line-opacity': 1
        }
      });
    }

    // Enforce Z-order to ensure outline is visible on top of gradients
    const layerOrder = [
      'isovist-fill',
      'isovist-gradient-0',
      'isovist-gradient-1',
      'isovist-gradient-2',
      'isovist-gradient-3',
      'isovist-gradient-4',
      'isovist-line',
      'isovist-direction',
      'isovist-viewer-point'
    ];

    layerOrder.forEach(layerId => {
      if (map.getLayer(layerId)) {
        map.moveLayer(layerId);
      }
    });

    // Set up event listeners
    map.on('click', onMapClick);
    map.on('mousemove', onMapMouseMove);
    map.on('mousedown', 'isovist-viewer-point', onViewerMouseDown);
    map.on('mouseup', onViewerMouseUp);
    map.getCanvas().style.cursor = 'crosshair';

    // Start outline animation
    animateOutline();
  }

  function deactivateIsovist() {
    // Stop animation
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    // Remove event listeners
    map.off('click', onMapClick);
    map.off('mousemove', onMapMouseMove);
    map.off('mousedown', 'isovist-viewer-point', onViewerMouseDown);
    map.off('mouseup', onViewerMouseUp);

    // Clear data
    viewerPosition = null;
    cursorPosition = null;
    isDragging = false;

    // Clear layers
    if (map.getSource('isovist-polygon')) {
      map.getSource('isovist-polygon').setData({
        type: 'FeatureCollection',
        features: []
      });
    }
    if (map.getSource('isovist-viewer')) {
      map.getSource('isovist-viewer').setData({
        type: 'FeatureCollection',
        features: []
      });
    }
    if (map.getSource('isovist-gradient')) {
      map.getSource('isovist-gradient').setData({
        type: 'FeatureCollection',
        features: []
      });
    }

    // Remove building footprints overlay
    if (map.getLayer('user-fill')) {
      map.removeLayer('user-fill');
    }
    if (map.getSource('usergeo')) {
      map.removeSource('usergeo');
    }

    map.getCanvas().style.cursor = '';
  }

  function animateOutline() {
    if (!isovistActive) return;
    
    const time = Date.now() / 1000;
    
    // Pulsing glow effect (breathing)
    const pulseSpeed = 0.1;
    const sine = Math.sin(time * pulseSpeed);
    
    // Width: 8px to 16px (much thicker for better visibility)
    const width = 12 + sine * 4; 
    
    // Opacity: 0.9 to 1.0 (high visibility)
    const opacity = 0.95 + sine * 0.05;
    
    // Blur: 6px to 14px (balanced glow)
    const blur = 10 + sine * 4;
    
    if (map.getLayer('isovist-line')) {
      map.setPaintProperty('isovist-line', 'line-width', width);
      map.setPaintProperty('isovist-line', 'line-opacity', opacity);
      map.setPaintProperty('isovist-line', 'line-blur', blur);
      // Note: line-dasharray is NOT set here to avoid triggering transitions
      // It's set once during layer initialization
    }
    
    animationFrameId = requestAnimationFrame(animateOutline);
  }

  function loadBuildingObstacles() {
    obstacles = [];

    // Check for user-loaded GeoJSON with building data
    if (map.getSource('usergeo')) {
      // Try to get data from source
      const source = map.getSource('usergeo');
      // _data is internal but often needed. Fallback to serialize() if available.
      const data = source._data || (source.serialize && source.serialize().data);
      
      if (data && data.features) {
        processGeoJSON(data);
      }
    }

    console.log(`Loaded ${obstacles.length} building obstacles`);
    if (obstacles.length === 0) {
      // Try to load default building footprints from media folder
      showToast('Loading building footprints...', 3000);
      loadDefaultBuildings();
    }
  }

  function processGeoJSON(geojson) {
    if (!geojson || !geojson.features) return;
    
    geojson.features.forEach(feature => {
      if (feature.geometry.type === 'Polygon') {
        addObstacle(feature.geometry.coordinates[0]);
      } else if (feature.geometry.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach(polygon => {
          addObstacle(polygon[0]);
        });
      }
    });
  }

  function addObstacle(ring) {
    if (!ring || ring.length < 3) return;
    
    // Calculate bbox
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const p of ring) {
      minLng = Math.min(minLng, p[0]);
      minLat = Math.min(minLat, p[1]);
      maxLng = Math.max(maxLng, p[0]);
      maxLat = Math.max(maxLat, p[1]);
    }
    
    obstacles.push({
      points: ring,
      bbox: { minLng, minLat, maxLng, maxLat }
    });
  }

  async function loadDefaultBuildings() {
    try {
      const response = await fetch('media/building-footprints.geojson');
      if (!response.ok) {
        throw new Error('Building footprints file not found');
      }
      
      const geojson = await response.json();
      
      if (!isovistActive) return;
      
      // Add to map as user geo source
      if (map.getSource('usergeo')) {
        map.getSource('usergeo').setData(geojson);
      } else {
        // Create the source if it doesn't exist
        map.addSource('usergeo', { type: 'geojson', data: geojson });
        
        // Add layers for visualization with no stroke and no points
        map.addLayer({ 
          id: 'user-fill', 
          type: 'fill', 
          source: 'usergeo', 
          paint: { 'fill-color':'#3388ff','fill-opacity':0.2 } 
        });
      }
      
      // Process obstacles
      processGeoJSON(geojson);
      
      showToast(`Loaded ${obstacles.length} buildings from default file`, 3000);
      console.log(`Loaded ${obstacles.length} building obstacles from media/building-footprints.geojson`);
      
    } catch (error) {
      console.error('Failed to load default buildings:', error);
      showToast('No buildings available. Upload building-footprints.geojson or place it in media/ folder', 5000);
    }
  }

  function onMapClick(e) {
    if (!isDragging) {
      const clickPos = [e.lngLat.lng, e.lngLat.lat];
      viewerPosition = getValidPosition(clickPos);
      updateVisualization();
    }
  }

  function onMapMouseMove(e) {
    if (isDragging && viewerPosition) {
      const newPos = [e.lngLat.lng, e.lngLat.lat];
      viewerPosition = getValidPosition(newPos);
    }
    cursorPosition = [e.lngLat.lng, e.lngLat.lat];
    
    // Auto-follow cursor if enabled and viewer is placed
    if (FOLLOW_CURSOR && viewerPosition && !isDragging) {
      const dist = distance(viewerPosition, cursorPosition);
      
      if (dist > FOLLOW_THRESHOLD) {
        // Move viewer toward cursor using linear interpolation
        const newLng = viewerPosition[0] + (cursorPosition[0] - viewerPosition[0]) * FOLLOW_SPEED;
        const newLat = viewerPosition[1] + (cursorPosition[1] - viewerPosition[1]) * FOLLOW_SPEED;
        const tentativePos = [newLng, newLat];
        viewerPosition = getValidPosition(tentativePos);
      }
    }
    
    updateVisualization();
  }

  function onViewerMouseDown(e) {
    e.preventDefault();
    isDragging = true;
    map.getCanvas().style.cursor = 'grabbing';
  }

  function onViewerMouseUp() {
    isDragging = false;
    map.getCanvas().style.cursor = 'crosshair';
  }

  function updateVisualization() {
    if (updateRequestId) return;
    updateRequestId = requestAnimationFrame(() => {
      performUpdate();
      updateRequestId = null;
    });
  }

  function performUpdate() {
    if (!viewerPosition) return;

    // Update viewer point and direction line
    const viewerFeatures = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: viewerPosition
          },
          properties: {}
        }
      ]
    };

    // Add direction line if cursor is set
    if (cursorPosition) {
      const directionLength = 30; // meters
      const bearing = calculateBearing(viewerPosition, cursorPosition);
      const endPoint = destination(viewerPosition, directionLength, bearing);

      viewerFeatures.features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [viewerPosition, endPoint]
        },
        properties: {}
      });
    }

    map.getSource('isovist-viewer').setData(viewerFeatures);

    // Calculate and update isovist polygon
    if (obstacles.length > 0) {
      const result = calculateIsovistFeatures(viewerPosition, cursorPosition);
      
      map.getSource('isovist-polygon').setData({
        type: 'FeatureCollection',
        features: [result.mainPolygon]
      });
      
      map.getSource('isovist-gradient').setData({
        type: 'FeatureCollection',
        features: result.bands
      });
    }
  }

  function calculateIsovistFeatures(origin, lookDirection) {
    // Ray casting algorithm to compute visibility polygon
    const rays = [];
    
    // Determine the viewing angle range
    let startAngle, endAngle, angleStep;
    
    if (USE_HUMAN_FOV && lookDirection) {
      // Calculate the direction the viewer is looking
      const viewBearing = calculateBearing(origin, lookDirection);
      const halfFOV = (HUMAN_FOV / 2) * Math.PI / 180;
      const viewAngle = viewBearing * Math.PI / 180;
      
      // Define the cone of vision
      startAngle = viewAngle - halfFOV;
      endAngle = viewAngle + halfFOV;
      angleStep = (HUMAN_FOV * Math.PI / 180) / RAY_COUNT;
      
      // Add the origin point to create a cone shape
      rays.push({ angle: startAngle, dist: 0 });
    } else {
      // Full 360° view
      startAngle = 0;
      endAngle = 2 * Math.PI;
      angleStep = (2 * Math.PI) / RAY_COUNT;
    }

    // Optimization: Filter obstacles by distance (bbox check)
    // 200m is roughly 0.002 degrees. Using 0.003 as safe margin.
    const range = 0.003; 
    const viewBbox = {
        minLng: origin[0] - range,
        minLat: origin[1] - range,
        maxLng: origin[0] + range,
        maxLat: origin[1] + range
    };

    const activeObstacles = obstacles.filter(obs => {
        return !(obs.bbox.minLng > viewBbox.maxLng || 
                 obs.bbox.maxLng < viewBbox.minLng || 
                 obs.bbox.minLat > viewBbox.maxLat || 
                 obs.bbox.maxLat < viewBbox.minLat);
    });

    // Cast rays within the field of view
    const numRays = Math.ceil((endAngle - startAngle) / angleStep);
    for (let i = 0; i <= numRays; i++) {
      const angle = startAngle + (i * angleStep);
      const rayEnd = destination(origin, MAX_VIEW_DISTANCE, (angle * 180) / Math.PI);

      // Find closest intersection with any building
      let minDistance = MAX_VIEW_DISTANCE;

      activeObstacles.forEach(obstacle => {
        const coords = obstacle.points;

        // Check intersection with each edge of the building polygon
        for (let j = 0; j < coords.length - 1; j++) {
          const edge = [coords[j], coords[j + 1]];
          const intersection = lineIntersection(origin, rayEnd, edge[0], edge[1]);

          if (intersection) {
            const dist = distance(origin, intersection);
            if (dist < minDistance) {
              minDistance = dist;
            }
          }
        }
      });

      rays.push({ angle: angle, dist: minDistance });
    }
    
    // Generate polygons
    const mainPolygonPoints = [];
    const bands = [];
    const numBands = 5;
    
    // 1. Main Polygon
    rays.forEach(ray => {
        if (ray.dist > 0) { // Skip origin point if present
            mainPolygonPoints.push(destination(origin, ray.dist, (ray.angle * 180) / Math.PI));
        }
    });
    
    // Close the polygon
    if (USE_HUMAN_FOV && lookDirection) {
        mainPolygonPoints.push(origin);
        // Ensure start is origin too for closed polygon
        mainPolygonPoints.unshift(origin);
    } else {
        mainPolygonPoints.push(mainPolygonPoints[0]);
    }

    const mainPolygon = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [mainPolygonPoints]
      },
      properties: {}
    };

    // 2. Gradient Bands (Stacked)
    for (let b = 0; b < numBands; b++) {
        const limit = (MAX_VIEW_DISTANCE / numBands) * (b + 1);
        const bandPoints = [];
        
        rays.forEach(ray => {
            if (ray.dist > 0) {
                const d = Math.min(ray.dist, limit);
                bandPoints.push(destination(origin, d, (ray.angle * 180) / Math.PI));
            }
        });

        if (USE_HUMAN_FOV && lookDirection) {
            bandPoints.push(origin);
            bandPoints.unshift(origin);
        } else {
            bandPoints.push(bandPoints[0]);
        }

        bands.push({
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [bandPoints]
            },
            properties: { ring: b }
        });
    }

    return { mainPolygon, bands };
  }

  // Collision detection and position validation
  function getValidPosition(position) {
    // Check if position is inside any building
    const insideBuilding = isPointInsideAnyBuilding(position);
    
    if (!insideBuilding) {
      return position;
    }
    
    // If inside a building, find the nearest valid position outside
    return findNearestValidPosition(position);
  }

  function isPointInsideAnyBuilding(point) {
    for (const obstacle of obstacles) {
      if (isPointInPolygon(point, obstacle.points)) {
        return true;
      }
    }
    return false;
  }

  function isPointInPolygon(point, polygon) {
    // Ray casting algorithm for point-in-polygon test
    const x = point[0], y = point[1];
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      
      const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }

  function findNearestValidPosition(position) {
    // Search in a spiral pattern for the nearest valid position
    const searchRadius = 5; // meters
    const searchSteps = 16; // number of directions to check
    
    for (let radius = searchRadius; radius <= MAX_VIEW_DISTANCE; radius += searchRadius) {
      for (let i = 0; i < searchSteps; i++) {
        const angle = (i / searchSteps) * 360;
        const testPos = destination(position, radius, angle);
        
        if (!isPointInsideAnyBuilding(testPos)) {
          return testPos;
        }
      }
    }
    
    // If no valid position found, return original (shouldn't happen)
    console.warn('Could not find valid position outside buildings');
    return position;
  }

  // Geometric helper functions
  function calculateBearing(from, to) {
    const dLon = to[0] - from[0];
    const y = Math.sin(dLon * Math.PI / 180) * Math.cos(to[1] * Math.PI / 180);
    const x = Math.cos(from[1] * Math.PI / 180) * Math.sin(to[1] * Math.PI / 180) -
              Math.sin(from[1] * Math.PI / 180) * Math.cos(to[1] * Math.PI / 180) * 
              Math.cos(dLon * Math.PI / 180);
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  function destination(origin, distance, bearing) {
    const R = 6371000; // Earth radius in meters
    const lat1 = origin[1] * Math.PI / 180;
    const lon1 = origin[0] * Math.PI / 180;
    const brng = bearing * Math.PI / 180;

    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(distance / R) +
      Math.cos(lat1) * Math.sin(distance / R) * Math.cos(brng)
    );

    const lon2 = lon1 + Math.atan2(
      Math.sin(brng) * Math.sin(distance / R) * Math.cos(lat1),
      Math.cos(distance / R) - Math.sin(lat1) * Math.sin(lat2)
    );

    return [lon2 * 180 / Math.PI, lat2 * 180 / Math.PI];
  }

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

  function lineIntersection(p1, p2, p3, p4) {
    // Line segment intersection using parametric equations
    const x1 = p1[0], y1 = p1[1];
    const x2 = p2[0], y2 = p2[1];
    const x3 = p3[0], y3 = p3[1];
    const x4 = p4[0], y4 = p4[1];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return null; // Parallel lines

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return [
        x1 + t * (x2 - x1),
        y1 + t * (y2 - y1)
      ];
    }

    return null;
  }

  // Initialize when map is ready
  if (window.map && window.map.loaded()) {
    initIsovist();
  } else if (window.map) {
    window.map.on('load', initIsovist);
  } else {
    // Wait for map to be defined
    const checkMap = setInterval(() => {
      if (window.map) {
        clearInterval(checkMap);
        if (window.map.loaded()) {
          initIsovist();
        } else {
          window.map.on('load', initIsovist);
        }
      }
    }, 100);
  }

})();
