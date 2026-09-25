// Interactive Isovist (Viewshed) Visualization
// Real-time visibility polygon calculation with draggable viewer
// Version: 1.4 - with Street View camera trail

(function() {
  const map = window.MR_RENDER?.map || window.map;
  let activationRevision=0, geometryWorker=null, geometryReady=false, calculationId=0, calculationBusy=false, latestCalculation=null;
  function requestCalculation(){
    if(!geometryReady || !viewerPosition)return;
    latestCalculation={type:'calculate',id:++calculationId,position:viewerPosition,cursor:cursorPosition,options:window.isovistSession.getState()};
    if(!calculationBusy){calculationBusy=true;geometryWorker.postMessage(latestCalculation);latestCalculation=null;}
  }
  function acceptCalculation(result){
    viewerPosition=result.origin;
    for(const [id,features] of [['isovist-polygon',[result.mainPolygon]],['isovist-gradient',result.bands],['isovist-viewed-buildings',result.viewedBuildings],['isovist-trees',result.viewedTrees]])map.getSource(id)?.setData({type:'FeatureCollection',features});
    map.getSource('isovist-viewer')?.setData({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:viewerPosition},properties:{}}]});
    broadcastIsovistStats(result.stats);
  }

  if (typeof window.map === 'undefined') {
    console.warn('Isovist: Map not ready yet, will initialize when available');
  }

  const isovistChannel = new BroadcastChannel('map_controller_channel');
  
  let isovistActive = false;
  let viewerPosition = null;
  let cursorPosition = null;
  let obstacles = []; // Flattened list of polygon rings with bboxes
  let isDragging = false;
  let updateRequestId = null;
  let animationFrameId = null;
  let outlineFrameCount = 0;

  let MAX_VIEW_DISTANCE = 200; // meters
  const RAY_COUNT = 180; // number of rays to cast (reduced for performance)
  const DEG2RAD = Math.PI / 180;
  let HUMAN_FOV = 120; // human field of view in degrees (120° total, 60° each side)
  let USE_HUMAN_FOV = true; // set to false for full 360° view
  let FOLLOW_CURSOR = true; // viewer follows cursor when it moves far enough
  const FOLLOW_THRESHOLD = 50; // distance in meters before viewer starts following
  const FOLLOW_SPEED = 0.15; // how fast viewer follows (0-1, higher = faster)
  
  // Tree obstacle settings
  let treeObstacles = []; // Circular obstacles from trees
  const TREE_BASE_RADIUS = 2; // Base radius in meters for tree canopy
  const TREE_RADIUS_VARIATION = 1.5; // Random variation in meters
  const TREE_HEIGHT_FACTOR = 0.3; // Additional radius per meter of height
  let INCLUDE_TREES = true; // Toggle tree obstacles in view analysis
  
  // Path history for trace
  let pathHistory = [];
  const MAX_PATH_POINTS = 500;
  const MIN_PATH_DISTANCE = 2; // minimum meters between path points
  
  // Street View actual camera position trail
  let streetViewApiKey = null;
  let actualCameraPosition = null;
  let cameraHistory = [];
  const MAX_CAMERA_HISTORY = 12;
  let lastMetadataFetch = null;
  const METADATA_FETCH_DISTANCE = 5; // meters between fetches
  
  // Street View position broadcast throttling
  let lastBroadcastPosition = null;
  let lastBroadcastHeading = null;
  const BROADCAST_MIN_DISTANCE = 3; // minimum meters between broadcasts
  const BROADCAST_MIN_HEADING_CHANGE = 15; // minimum degrees before heading update
  
  // Load Street View API key
  async function loadStreetViewApiKey() {
    const paths = ['trafik-config.json', './trafik-config.json'];
    for (const path of paths) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          const config = await response.json();
          const key = config.streetViewApiKey || config.googleMapsApiKey;
          if (key) {
            streetViewApiKey = key;
            console.log('Isovist: Street View API key loaded');
            return;
          }
        }
      } catch (e) { /* try next */ }
    }
    console.warn('Isovist: Could not load Street View API key');
  }
  loadStreetViewApiKey();

  // Ambient soundscape settings
  let ambientAudioContext = null;
  let ambientSoundEnabled = true; // Toggle for ambient sound
  const MAX_AMBIENT_VOLUME = 0.5; // Cap volume at 50%
  const VOLUME_SMOOTHING = 0.1; // How fast volume changes (0-1, lower = smoother)
  let audioUnlocked = false; // Track if user has interacted (for autoplay policy)
  let pendingAudioStart = false; // Track if we're waiting to start audio
  
  // Nature sounds (bird sounds)
  const natureSounds = [
    window.mrAsset('media/sound/XC372879 - Thrush Nightingale - Luscinia luscinia.mp3'),
    window.mrAsset('media/sound/XC647538 - European Pied Flycatcher - Ficedula hypoleuca.mp3'),
    window.mrAsset('media/sound/XC900416 - Black Redstart - Phoenicurus ochruros.mp3')
  ];
  
  // City/urban sounds
  const citySounds = [
    window.mrAsset('media/sound/city.mp3')
  ];
  
  // Active audio elements and gain nodes
  let natureAudio = null;
  let cityAudio = null;
  let natureGainNode = null;
  let cityGainNode = null;
  let currentNatureSoundIndex = 0;
  let currentGreenViewFactor = 0; // 0 = no trees, 1 = all trees
  let targetNatureVolume = 0;
  let targetCityVolume = 0;
  let volumeAnimationFrame = null;

  // Listen for remote control messages
  const channel = new BroadcastChannel('map_controller_channel');
  
  // Function to broadcast isovist statistics to controller
  function broadcastIsovistStats(stats) {
    channel.postMessage({
      type: 'isovist_stats',
      data: stats
    });
    
    // Update ambient soundscape based on green view factor
    if (ambientSoundEnabled && stats.totalRays > 0) {
      // Calculate green view factor: ratio of tree rays to total rays
      const gvf = stats.treeRays / stats.totalRays;
      updateAmbientSoundscape(gvf);
    }
  }
  
  // ============================================
  // AMBIENT SOUNDSCAPE SYSTEM
  // Based on Green View Factor (GVF)
  // ============================================
  
  function initAmbientAudio() {
    if (ambientAudioContext) return; // Already initialized
    if (!audioUnlocked) return; // Don't init until user gesture
    
    try {
      ambientAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create nature audio (pick a random bird sound to start)
      currentNatureSoundIndex = Math.floor(Math.random() * natureSounds.length);
      natureAudio = (window.mrMuseumAudio || (url=>new Audio(url)))(natureSounds[currentNatureSoundIndex]);
      natureAudio.loop = true;
      
      // Create city audio
      cityAudio = (window.mrMuseumAudio || (url=>new Audio(url)))(citySounds[0]);
      cityAudio.loop = true;
      
      // Create gain nodes for volume control
      const natureSource = ambientAudioContext.createMediaElementSource(natureAudio);
      natureGainNode = ambientAudioContext.createGain();
      natureGainNode.gain.value = 0;
      natureSource.connect(natureGainNode);
      natureGainNode.connect(window.MR_AUDIO?.destination(ambientAudioContext) || ambientAudioContext.destination);
      
      const citySource = ambientAudioContext.createMediaElementSource(cityAudio);
      cityGainNode = ambientAudioContext.createGain();
      cityGainNode.gain.value = 0;
      citySource.connect(cityGainNode);
      cityGainNode.connect(window.MR_AUDIO?.destination(ambientAudioContext) || ambientAudioContext.destination);
      
      // Handle nature audio ending to switch to next bird sound
      natureAudio.addEventListener('ended', switchNatureSound);
      
      console.log('Ambient audio initialized');
    } catch (e) {
      console.warn('Failed to initialize ambient audio:', e);
      ambientAudioContext = null;
    }
  }
  
  function switchNatureSound() {
    if (!natureAudio || !ambientAudioContext) return;
    
    // Pick a different bird sound
    const prevIndex = currentNatureSoundIndex;
    do {
      currentNatureSoundIndex = Math.floor(Math.random() * natureSounds.length);
    } while (currentNatureSoundIndex === prevIndex && natureSounds.length > 1);
    
    // Update source and restart
    natureAudio.src = natureSounds[currentNatureSoundIndex];
    if (targetNatureVolume > 0 && audioUnlocked) {
      natureAudio.play().catch(e => console.warn('Nature sound play failed:', e));
    }
  }
  
  function startAmbientAudio() {
    // If user hasn't interacted yet, mark as pending and wait
    if (!audioUnlocked) {
      pendingAudioStart = true;
      console.log('Ambient audio pending - waiting for user interaction');
      return;
    }
    
    if (!ambientAudioContext) {
      initAmbientAudio();
    }
    
    if (!ambientAudioContext) return; // Failed to initialize
    
    // Resume audio context if suspended (browser autoplay policy)
    if (ambientAudioContext.state === 'suspended') {
      ambientAudioContext.resume().catch(e => console.warn('Audio context resume failed:', e));
    }
    
    // Start both audio streams (they start muted, volume controlled by GVF)
    natureAudio.play().catch(e => console.warn('Nature audio play failed:', e));
    cityAudio.play().catch(e => console.warn('City audio play failed:', e));
    
    // Start volume animation loop
    if (!volumeAnimationFrame) {
      animateVolumes();
    }
    
    pendingAudioStart = false;
    console.log('Ambient audio started');
  }
  
  function stopAmbientAudio() {
    if (volumeAnimationFrame) {
      (window.MR_FRAMES ? window.MR_FRAMES.cancel.bind(window.MR_FRAMES) : cancelAnimationFrame)(volumeAnimationFrame);
      volumeAnimationFrame = null;
    }
    
    if (natureAudio) {
      natureAudio.pause();
      natureAudio.currentTime = 0;
    }
    if (cityAudio) {
      cityAudio.pause();
      cityAudio.currentTime = 0;
    }
    
    if (natureGainNode) natureGainNode.gain.value = 0;
    if (cityGainNode) cityGainNode.gain.value = 0;
    
    targetNatureVolume = 0;
    targetCityVolume = 0;
    currentGreenViewFactor = 0;
    
    console.log('Ambient audio stopped');
  }
  
  function updateAmbientSoundscape(gvf) {
    // gvf: 0 = no trees visible (city sound), 1 = all trees (nature sound)
    currentGreenViewFactor = gvf;
    
    // Calculate target volumes based on GVF
    // High GVF = more nature, less city
    // Low GVF = more city, less nature
    // Both capped at MAX_AMBIENT_VOLUME (0.5)
    
    targetNatureVolume = gvf * MAX_AMBIENT_VOLUME;
    targetCityVolume = (1 - gvf) * MAX_AMBIENT_VOLUME;
    
    // Ensure minimum volume for active sound to keep some ambiance
    const minVolume = 0.05;
    if (gvf > 0.1) {
      targetNatureVolume = Math.max(targetNatureVolume, minVolume);
    }
    if (gvf < 0.9) {
      targetCityVolume = Math.max(targetCityVolume, minVolume);
    }
  }
  
  function animateVolumes() {
    if (!ambientAudioContext || !isovistActive) {
      volumeAnimationFrame = null;
      return;
    }
    
    // Smoothly interpolate current volumes towards targets
    if (natureGainNode) {
      const currentNature = natureGainNode.gain.value;
      const newNature = currentNature + (targetNatureVolume - currentNature) * VOLUME_SMOOTHING;
      natureGainNode.gain.setValueAtTime(newNature, ambientAudioContext.currentTime);
    }
    
    if (cityGainNode) {
      const currentCity = cityGainNode.gain.value;
      const newCity = currentCity + (targetCityVolume - currentCity) * VOLUME_SMOOTHING;
      cityGainNode.gain.setValueAtTime(newCity, ambientAudioContext.currentTime);
    }
    
    volumeAnimationFrame = (window.MR_FRAMES ? window.MR_FRAMES.request.bind(window.MR_FRAMES,'isovist-audio') : requestAnimationFrame)(animateVolumes);
  }
  
  // Unlock audio on user interaction (browser autoplay policy)
  function setupAudioUnlock() {
    const unlockAudio = () => {
      if (audioUnlocked) return; // Already unlocked
      
      audioUnlocked = true;
      console.log('Audio unlocked by user gesture');
      
      // Resume existing context if any
      if (ambientAudioContext && ambientAudioContext.state === 'suspended') {
        ambientAudioContext.resume();
      }
      
      // If audio was waiting to start, start it now
      if (pendingAudioStart && isovistActive && ambientSoundEnabled) {
        startAmbientAudio();
      }
    };
    
    // Listen on multiple events to catch any user interaction
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
    document.addEventListener('keydown', unlockAudio);
    document.addEventListener('mousedown', unlockAudio);
  }
  
  setupAudioUnlock();
  
  // ============================================
  // END AMBIENT SOUNDSCAPE SYSTEM
  // ============================================
  
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
            case 'toggle_trees':
                INCLUDE_TREES = !INCLUDE_TREES;
                if (isovistActive && viewerPosition) updateVisualization();
                break;
            case 'toggle_ambient_sound':
                ambientSoundEnabled = !ambientSoundEnabled;
                if (!ambientSoundEnabled) {
                    stopAmbientAudio();
                } else if (isovistActive && viewerPosition) {
                    startAmbientAudio();
                }
                break;
            case 'set_ambient_volume':
                const vol = parseFloat(data.value);
                if (!isNaN(vol) && vol >= 0 && vol <= 1) {
                    // Temporarily override max volume
                    if (natureGainNode) natureGainNode.gain.setTargetAtTime(vol * currentGreenViewFactor, ambientAudioContext.currentTime, 0.1);
                    if (cityGainNode) cityGainNode.gain.setTargetAtTime(vol * (1 - currentGreenViewFactor), ambientAudioContext.currentTime, 0.1);
                }
                break;
        }
    }
  };

  // Initialize isovist mode
  function initIsovist() {
    const btn = document.getElementById('isovist-btn');
    if (!btn) return;

    btn.addEventListener('click', toggleIsovist);
    window.MR_LAYERS?.register('isovist-btn',{getEnabled:()=>isovistActive,enable:async()=>{if(!isovistActive)await toggleIsovist();},disable:()=>{if(isovistActive)toggleIsovist();},isReady:()=>geometryReady});
  }

  async function toggleIsovist() {
    isovistActive = !isovistActive;
    const btn = document.getElementById('isovist-btn');

    if (isovistActive) {
      btn.classList.add('toggled-off');
      btn.style.background = '#0078d4';
      btn.style.color = '#fff';
      await activateIsovist();
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

  async function activateIsovist() {
    const revision=++activationRevision;
    await window.MR_RENDER?.ready;
    if(!isovistActive || revision!==activationRevision)return;
    // Broadcast state to controller
    isovistChannel.postMessage({ type: 'animation_state', animationId: 'isovist-btn', isActive: true });
    
    // Load building obstacles from loaded GeoJSON
    const buildingsTask=loadBuildingObstacles();
    
    // Load tree obstacles
    const treesTask=loadTreeObstacles();
    
    // Initialize ambient soundscape
    if (ambientSoundEnabled) {
      startAmbientAudio();
    }

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
      // Band 0 (smallest) is covered by Band 0, 1, 2 -> High opacity
      // Band 2 (largest) is covered by Band 2 only -> Low opacity
      for (let i = 0; i < 3; i++) {
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

    // Add path trace source and layer
    if (!map.getSource('isovist-path-trace')) {
      map.addSource('isovist-path-trace', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: []
          }
        }
      });

      map.addLayer({
        id: 'isovist-path-trace-line',
        type: 'line',
        source: 'isovist-path-trace',
        paint: {
          'line-color': '#ff6b6b',
          'line-width': 2,
          'line-opacity': 0.4,
          'line-blur': 1
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        }
      });
      
      // Add dots along the path
      map.addLayer({
        id: 'isovist-path-trace-dots',
        type: 'circle',
        source: 'isovist-path-trace',
        paint: {
          'circle-radius': 2,
          'circle-color': '#ff6b6b',
          'circle-opacity': 0.3
        }
      });
    }
    
    // Add Street View actual camera position trail (green markers)
    if (!map.getSource('isovist-streetview-camera')) {
      map.addSource('isovist-streetview-camera', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
      
      // Historical camera positions (fading green)
      map.addLayer({
        id: 'isovist-streetview-camera-history',
        type: 'circle',
        source: 'isovist-streetview-camera',
        filter: ['==', ['get', 'type'], 'history'],
        paint: {
          'circle-radius': 7,
          'circle-color': '#00ff88',
          'circle-opacity': ['get', 'opacity'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': ['get', 'opacity']
        }
      });
      
      // Current camera position glow (bright green)
      map.addLayer({
        id: 'isovist-streetview-camera-glow',
        type: 'circle',
        source: 'isovist-streetview-camera',
        filter: ['==', ['get', 'type'], 'current'],
        paint: {
          'circle-radius': 18,
          'circle-color': '#00ff88',
          'circle-opacity': 0.4,
          'circle-blur': 1
        }
      });
      
      // Current camera position point (bright green)
      map.addLayer({
        id: 'isovist-streetview-camera-point',
        type: 'circle',
        source: 'isovist-streetview-camera',
        filter: ['==', ['get', 'type'], 'current'],
        paint: {
          'circle-radius': 10,
          'circle-color': '#00ff88',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3
        }
      });
    }

    // Add source and layer for highlighted (viewed) buildings
    if (!map.getSource('isovist-viewed-buildings')) {
      map.addSource('isovist-viewed-buildings', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      map.addLayer({
        id: 'isovist-viewed-buildings-fill',
        type: 'fill',
        source: 'isovist-viewed-buildings',
        paint: {
          'fill-color': [
            'match',
            ['get', 'objekttyp'],
            'Bostad', '#E57373',           // Coral for residential
            'Verksamhet', '#00ACC1',       // Teal for commercial/business
            'Samhällsfunktion', '#9C27B0', // Purple for public functions
            'Komplementbyggnad', '#FF9800', // Orange for outbuildings
            '#888888'                       // Gray for unknown
          ],
          'fill-opacity': 0.6
        }
      });

      map.addLayer({
        id: 'isovist-viewed-buildings-outline',
        type: 'line',
        source: 'isovist-viewed-buildings',
        paint: {
          'line-color': [
            'match',
            ['get', 'objekttyp'],
            'Bostad', '#C62828',           // Darker coral/red
            'Verksamhet', '#00838F',       // Darker teal
            'Samhällsfunktion', '#6A1B9A', // Darker purple
            'Komplementbyggnad', '#E65100', // Darker orange
            '#555555'                       // Darker gray
          ],
          'line-width': 2,
          'line-opacity': 1
        }
      });
    }

    // Add source and layer for ALL trees (background layer)
    if (!map.getSource('isovist-all-trees')) {
      map.addSource('isovist-all-trees', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Point circles preserve canopy metres without triangulating 31,000 polygons.
      map.addLayer({id:'isovist-all-trees-fill',type:'circle',source:'isovist-all-trees',paint:{'circle-color':'#90EE90','circle-opacity':.08,'circle-stroke-color':'#228B22','circle-stroke-width':.5,'circle-stroke-opacity':.12,'circle-radius':['interpolate',['exponential',2],['zoom'],0,['get','radiusAtZoom0'],22,['*',['get','radiusAtZoom0'],4194304]]}});
    }

    // Add source and layer for highlighted (viewed) trees
    if (!map.getSource('isovist-trees')) {
      map.addSource('isovist-trees', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      // Tree canopy circles (viewed trees - brighter)
      map.addLayer({
        id: 'isovist-trees-fill',
        type: 'fill',
        source: 'isovist-trees',
        paint: {
          'fill-color': '#2D5A27',  // Dark forest green
          'fill-opacity': 0.7
        }
      });

      map.addLayer({
        id: 'isovist-trees-outline',
        type: 'line',
        source: 'isovist-trees',
        paint: {
          'line-color': '#1B3D1B',  // Even darker green
          'line-width': 1.5,
          'line-opacity': 0.9
        }
      });
    }

    // Enforce Z-order to ensure outline is visible on top of gradients
    const layerOrder = [
      'isovist-path-trace-line',
      'isovist-path-trace-dots',
      'isovist-all-trees-fill',
      'isovist-all-trees-outline',
      'isovist-fill',
      'isovist-gradient-0',
      'isovist-gradient-1',
      'isovist-gradient-2',
      'isovist-viewed-buildings-fill',
      'isovist-viewed-buildings-outline',
      'isovist-trees-fill',
      'isovist-trees-outline',
      'isovist-streetview-camera-history',
      'isovist-streetview-camera-glow',
      'isovist-streetview-camera-point',
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
    await Promise.all([buildingsTask,treesTask]);
    if(!isovistActive || revision!==activationRevision)return;
    geometryWorker=new Worker('animations/isovist-worker.js');
    geometryWorker.onmessage=({data})=>{
      if(!isovistActive || revision!==activationRevision)return;
      if(data.type==='error'){window.MR_LAYERS?.fail('isovist-btn','Visibility calculation failed: '+data.message);return;}
      if(data.type==='ready'){geometryReady=true;updateVisualization();return;}
      calculationBusy=false;
      if(data.id===calculationId)acceptCalculation(data.result);
      if(latestCalculation){calculationBusy=true;geometryWorker.postMessage(latestCalculation);latestCalculation=null;}
    };
    geometryWorker.onerror=()=>{window.MR_LAYERS?.fail('isovist-btn','Visibility worker could not start. Reload to retry.');};
    geometryWorker.postMessage({type:'init',obstacles,trees:treeObstacles});
    if(!viewerPosition){const center=map.getCenter();viewerPosition=[center.lng,center.lat];}
  }

  function deactivateIsovist() {
    activationRevision++;geometryWorker?.terminate();geometryWorker=null;geometryReady=false;calculationBusy=false;latestCalculation=null;calculationId++;
    if(updateRequestId){(window.MR_FRAMES ? window.MR_FRAMES.cancel.bind(window.MR_FRAMES) : cancelAnimationFrame)(updateRequestId);updateRequestId=null;}
    // Broadcast state to controller
    isovistChannel.postMessage({ type: 'animation_state', animationId: 'isovist-btn', isActive: false });
    
    // Stop animation
    if (animationFrameId) {
      (window.MR_FRAMES ? window.MR_FRAMES.cancel.bind(window.MR_FRAMES) : cancelAnimationFrame)(animationFrameId);
      animationFrameId = null;
    }
    
    // Stop ambient soundscape
    stopAmbientAudio();

    // Remove event listeners
    map.off('click', onMapClick);
    map.off('mousemove', onMapMouseMove);
    map.off('mousedown', 'isovist-viewer-point', onViewerMouseDown);
    map.off('mouseup', onViewerMouseUp);

    // Clear data
    viewerPosition = null;
    cursorPosition = null;
    isDragging = false;
    pathHistory = [];  // Clear path history
    actualCameraPosition = null;
    cameraHistory = [];
    lastMetadataFetch = null;

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
    if (map.getSource('isovist-viewed-buildings')) {
      map.getSource('isovist-viewed-buildings').setData({
        type: 'FeatureCollection',
        features: []
      });
    }
    if (map.getSource('isovist-path-trace')) {
      map.getSource('isovist-path-trace').setData({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: []
        }
      });
    }
    if (map.getSource('isovist-streetview-camera')) {
      map.getSource('isovist-streetview-camera').setData({
        type: 'FeatureCollection',
        features: []
      });
    }
    if (map.getSource('isovist-trees')) {
      map.getSource('isovist-trees').setData({
        type: 'FeatureCollection',
        features: []
      });
    }
    if (map.getSource('isovist-all-trees')) {
      map.getSource('isovist-all-trees').setData({
        type: 'FeatureCollection',
        features: []
      });
    }
    
    // Clear tree obstacles
    treeObstacles = [];

    map.getCanvas().style.cursor = '';
  }

  function animateOutline() {
    if (!isovistActive) return;
    
    // Throttle to ~20fps to reduce GPU paint property updates
    outlineFrameCount++;
    if (outlineFrameCount % 3 !== 0) {
      animationFrameId = (window.MR_FRAMES ? window.MR_FRAMES.request.bind(window.MR_FRAMES,'isovist-outline') : requestAnimationFrame)(animateOutline);
      return;
    }
    
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
    
    animationFrameId = (window.MR_FRAMES ? window.MR_FRAMES.request.bind(window.MR_FRAMES,'isovist-outline') : requestAnimationFrame)(animateOutline);
  }

  async function loadBuildingObstacles() {
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
      await loadDefaultBuildings();
    }
  }

  function processGeoJSON(geojson) {
    if (!geojson || !geojson.features) return;
    
    geojson.features.forEach(feature => {
      if (feature.geometry.type === 'Polygon') {
        addObstacle(feature.geometry.coordinates, feature.properties);
      } else if (feature.geometry.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach(polygon => {
          addObstacle(polygon, feature.properties);
        });
      }
    });
  }

  function addObstacle(rings, properties = {}) {
    const ring = rings[0];
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
      points: ring, rings,
      properties: properties,
      bbox: { minLng, minLat, maxLng, maxLat }
    });
  }
  
  // Fetch Street View metadata to get actual camera position
  async function fetchStreetViewMetadata(position) {
    if (!streetViewApiKey) return;
    
    // Throttle metadata fetches
    if (lastMetadataFetch && distance(lastMetadataFetch, position) < METADATA_FETCH_DISTANCE) {
      return;
    }
    lastMetadataFetch = [...position];
    
    const lat = position[1];
    const lng = position[0];
    const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${streetViewApiKey}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'OK' && data.location) {
        const newCameraPos = [data.location.lng, data.location.lat];
        
        // Add to history if different from last position
        if (!actualCameraPosition || distance(actualCameraPosition, newCameraPos) > 2) {
          if (actualCameraPosition) {
            cameraHistory.unshift([...actualCameraPosition]);
            while (cameraHistory.length > MAX_CAMERA_HISTORY) {
              cameraHistory.pop();
            }
          }
        }
        
        actualCameraPosition = newCameraPos;
        
        // Update the camera layer
        updateStreetViewCameraLayer();
      }
    } catch (err) {
      // Silently fail
    }
  }
  
  // Update Street View camera position layer
  function updateStreetViewCameraLayer() {
    if (!map.getSource('isovist-streetview-camera')) return;
    
    const features = [];
    
    // Historical camera positions
    cameraHistory.forEach((pos, index) => {
      const opacity = 1 - ((index + 1) / (MAX_CAMERA_HISTORY + 1));
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: pos },
        properties: { type: 'history', opacity: opacity }
      });
    });
    
    // Current camera position
    if (actualCameraPosition) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: actualCameraPosition },
        properties: { type: 'current' }
      });
    }
    
    map.getSource('isovist-streetview-camera').setData({
      type: 'FeatureCollection',
      features: features
    });
  }

  async function loadTreeObstacles() {
    const revision=activationRevision;
    try {
      const response = await fetch(window.mrAsset('media/trees.geojson'));
      if (!response.ok) {
        console.warn('Trees file not found');
        return;
      }
      
      const geojson = await response.json();
      
      if (!isovistActive || revision!==activationRevision) return;
      
      // Process tree points into circular obstacles
      treeObstacles = [];
      
      // Use a seeded random for consistent radii per tree
      const seededRandom = (seed) => {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
      };
      
      geojson.features.forEach((feature, idx) => {
        if (feature.geometry.type === 'Point') {
          const coords = feature.geometry.coordinates;
          const height = feature.properties.height || 10;
          
          // Calculate radius based on height with random variation
          const randomVariation = (seededRandom(idx) - 0.5) * 2 * TREE_RADIUS_VARIATION;
          const radius = Number(feature.properties.crown_radius) > 0 ? Number(feature.properties.crown_radius) : TREE_BASE_RADIUS + (height * TREE_HEIGHT_FACTOR) + randomVariation;
          
          // Calculate bbox for spatial filtering
          const radiusDeg = radius / 110540;
          const radiusLng=radius/(111320*Math.cos(coords[1]*DEG2RAD)); // rough meters to degrees
          
          treeObstacles.push({
            center: coords,
            radius: Math.max(1, radius), // minimum 1 meter radius
            properties: feature.properties,
            bbox: {
              minLng: coords[0] - radiusLng,
              minLat: coords[1] - radiusDeg,
              maxLng: coords[0] + radiusLng,
              maxLat: coords[1] + radiusDeg
            }
          });
        }
      });
      
      console.log(`Loaded ${treeObstacles.length} tree obstacles`);
      showToast(`Loaded ${treeObstacles.length} trees for view analysis`, 3000);
      
      // Update the all-trees layer to show all tree canopies
      if (map.getSource('isovist-all-trees')) {
        const allTreeFeatures = treeObstacles.map(tree=>({type:'Feature',geometry:{type:'Point',coordinates:tree.center},properties:{radiusAtZoom0:tree.radius*512/(40075016.68557849*Math.cos(tree.center[1]*DEG2RAD))/(window.mrTableScale?.()||1)}}));

        map.getSource('isovist-all-trees').setData({
          type: 'FeatureCollection',
          features: allTreeFeatures
        });
      }
      
    } catch (error) {
      console.warn('Failed to load trees:', error);
    }
  }

  async function loadDefaultBuildings() {
    const revision=activationRevision;
    try {
      const response = await fetch(window.mrAsset('media/building-footprints.geojson'));
      if (!response.ok) {
        throw new Error('Building footprints file not found');
      }
      
      const geojson = await response.json();
      
      if(!isovistActive || revision!==activationRevision)return;
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
    if (window.MR_CANVAS_EDITING) return;
    if (!isDragging) {
      const clickPos = [e.lngLat.lng, e.lngLat.lat];
      viewerPosition = getValidPosition(clickPos);
      updateVisualization();
    }
  }

  function onMapMouseMove(e) {
    if (window.MR_CANVAS_EDITING) return;
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
    updateRequestId = (window.MR_FRAMES ? window.MR_FRAMES.request.bind(window.MR_FRAMES,'isovist-input') : requestAnimationFrame)(() => {
      performUpdate();
      updateRequestId = null;
    });
  }

  window.isovistSession = {
    getState: () => ({active: isovistActive, position: viewerPosition, cursor: cursorPosition, radius: MAX_VIEW_DISTANCE, fov: HUMAN_FOV, follow: FOLLOW_CURSOR, humanFov: USE_HUMAN_FOV, trees: INCLUDE_TREES, ambientSound: ambientSoundEnabled}),
    point(coordinate, headingOnly) {
      if (!isovistActive) throw Error('Turn on Isovist first');
      if (headingOnly) cursorPosition = coordinate;
      else viewerPosition = getValidPosition(coordinate);
      updateVisualization();
    }
  };

  function performUpdate() {
    if (!isovistActive || !viewerPosition || !map.getSource('isovist-viewer')) return;
    
    // Fetch Street View actual camera position (throttled internally)
    fetchStreetViewMetadata(viewerPosition);
    
    // Broadcast position for Street View (throttled by distance OR heading change)
    const currentHeading = cursorPosition ? calculateBearing(viewerPosition, cursorPosition) : 0;
    const positionChanged = !lastBroadcastPosition || distance(lastBroadcastPosition, viewerPosition) > BROADCAST_MIN_DISTANCE;
    const headingChanged = lastBroadcastHeading === null || Math.abs(currentHeading - lastBroadcastHeading) > BROADCAST_MIN_HEADING_CHANGE;
    
    if (positionChanged || headingChanged) {
      lastBroadcastPosition = [...viewerPosition];
      lastBroadcastHeading = currentHeading;
      isovistChannel.postMessage({
        type: 'street_view_position',
        position: {
          lng: viewerPosition[0],
          lat: viewerPosition[1]
        },
        heading: currentHeading
      });
    }

    // Update path history
    if (pathHistory.length === 0 || 
        distance(pathHistory[pathHistory.length - 1], viewerPosition) > MIN_PATH_DISTANCE) {
      pathHistory.push([...viewerPosition]);
      if (pathHistory.length > MAX_PATH_POINTS) {
        pathHistory.shift();
      }
      
      // Update path trace on map
      if (map.getSource('isovist-path-trace') && pathHistory.length > 1) {
        map.getSource('isovist-path-trace').setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: pathHistory
          }
        });
      }
    }

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

    requestCalculation();
  }

  function getValidPosition(position) { return position; }
  function calculateBearing(from, to) {
    const dLon = to[0] - from[0];
    const y = Math.sin(dLon * Math.PI / 180) * Math.cos(to[1] * Math.PI / 180);
    const x = Math.cos(from[1] * Math.PI / 180) * Math.sin(to[1] * Math.PI / 180) -
              Math.sin(from[1] * Math.PI / 180) * Math.cos(to[1] * Math.PI / 180) * 
              Math.cos(dLon * Math.PI / 180);
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  function destination(origin, distMeters, bearing) {
    // Fast flat-earth approximation (accurate within 0.1% for distances < 1km)
    const brng = bearing * DEG2RAD;
    const cosLat = Math.cos(origin[1] * DEG2RAD);
    return [
      origin[0] + Math.sin(brng) * distMeters / (111320 * cosLat),
      origin[1] + Math.cos(brng) * distMeters / 110540
    ];
  }

  function distance(point1, point2) {
    // Fast flat-earth approximation (accurate within 0.1% for distances < 1km)
    const latMid = (point1[1] + point2[1]) * 0.5 * DEG2RAD;
    const cosLat = Math.cos(latMid);
    const dx = (point2[0] - point1[0]) * 111320 * cosLat;
    const dy = (point2[1] - point1[1]) * 110540;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function lineIntersection(p1, p2, p3, p4) {
    // Line segment intersection using parametric equations
    const x1 = p1[0], y1 = p1[1];
    const x2 = p2[0], y2 = p2[1];
    const x3 = p3[0], y3 = p3[1];
    const x4 = p4[0], y4 = p4[1];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-18) return null; // Parallel lines

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

  initIsovist();

})();
