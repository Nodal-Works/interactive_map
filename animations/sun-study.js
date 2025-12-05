// Sun Study Module - Three.js shadow overlay on map
// Renders shadows from STL model as transparent overlay on the web map
// Uses Sweden location (Gothenburg area) for accurate sun positioning

let THREE, STLLoader, EffectComposer, RenderPass, SSAOPass;

async function loadDependencies() {
  THREE = await import('three');
  const stlModule = await import('three/addons/loaders/STLLoader.js');
  STLLoader = stlModule.STLLoader;
  
  // Post-processing for ambient occlusion
  const composerModule = await import('three/addons/postprocessing/EffectComposer.js');
  EffectComposer = composerModule.EffectComposer;
  const renderPassModule = await import('three/addons/postprocessing/RenderPass.js');
  RenderPass = renderPassModule.RenderPass;
  const ssaoPassModule = await import('three/addons/postprocessing/SSAOPass.js');
  SSAOPass = ssaoPassModule.SSAOPass;
  
  return true;
}

class SunStudy {
  constructor() {
    this.canvas = null;
    this.renderer = null;
    this.composer = null;
    this.ssaoPass = null;
    this.scene = null;
    this.camera = null;
    this.sunLight = null;
    this.mesh = null;
    this.isActive = false;
    this.animationId = null;
    
    // Materials
    this.standardMaterial = null;
    this.falseColorMaterial = null;
    this.isFalseColorMode = false;
    
    // Sweden location (Gothenburg - matches map center)
    this.latitude = 57.68839377903814;
    this.longitude = 11.977770568930168;
    
    // Map bearing for alignment
    this.mapBearing = -92.58546386659737;
    
    // Time settings
    // Default to June 21st (Summer Solstice)
    this.date = new Date();
    this.date.setMonth(5); // June (0-indexed)
    this.date.setDate(21);
    
    this.timeOfDay = 12;
    this.isAnimating = false;
    this.animationSpeed = 2;
    
    // Shadow settings
    this.shadowOpacity = 0.8;
    
    // Manual adjustment offsets
    this.offsetX = 0;      // X position offset
    this.offsetZ = 0;      // Z position offset (Y on screen in top-down)
    this.rotationOffset = 0; // Additional rotation in degrees
    this.scaleMultiplier = 1.0; // Scale multiplier
    
    this.controlPanel = null;
    this.dependenciesLoaded = false;
    
    this.initUI();
  }
  
  initUI() {
    // Create transparent canvas overlay for shadows only
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'sun-study-canvas';
    this.canvas.style.cssText = `
      position: fixed;
      left: 60px;
      right: 60px;
      top: 0;
      bottom: 0;
      width: calc(100% - 120px);
      height: 100%;
      z-index: 400;
      display: none;
      pointer-events: none;
      background: transparent;
    `;
    document.body.appendChild(this.canvas);
    
    this.createControlPanel();
    
    const sunBtn = document.getElementById('sun-study-btn');
    if (sunBtn) {
      sunBtn.addEventListener('click', () => this.toggle());
    }
    
    window.addEventListener('resize', () => this.onResize());
  }
  
  async initThreeJS() {
    if (this.dependenciesLoaded) return;
    
    console.log('Loading Three.js for sun study...');
    await loadDependencies();
    this.dependenciesLoaded = true;
    
    this.setupRenderer();
    this.setupScene();
    this.setupCamera();
    this.setupLights();
    this.setupPostProcessing();
    this.loadSTLModel();
  }
  
  createControlPanel() {
    this.controlPanel = document.createElement('div');
    this.controlPanel.id = 'sun-study-panel';
    this.controlPanel.innerHTML = `
      <h3>☀️ Sun Study</h3>
      <div class="sun-control">
        <label>Date</label>
        <input type="date" id="sun-date" value="${this.date.toISOString().split('T')[0]}">
      </div>
      <div class="sun-control">
        <label>Time: <span id="time-display">12:00</span></label>
        <input type="range" id="sun-time" min="0" max="24" step="0.25" value="12">
      </div>
      <div class="sun-control">
        <label>Sun Altitude: <span id="altitude-display">--</span>°</label>
      </div>
      <div class="sun-control">
        <label>Sun Azimuth: <span id="azimuth-display">--</span>°</label>
      </div>
      <div class="sun-control">
        <label>Shadow Opacity</label>
        <input type="range" id="shadow-opacity" min="0.1" max="1.0" step="0.1" value="0.8">
      </div>
      <div class="sun-actions">
        <button id="sun-animate-btn" class="sun-btn">▶ Animate Day</button>
      </div>
      <div class="sun-control">
        <label>Speed: <span id="speed-display">2x</span></label>
        <input type="range" id="sun-speed" min="0.5" max="5" step="0.5" value="2">
      </div>

      <hr style="border: none; border-top: 1px solid #ddd; margin: 12px 0;">
      <div class="sun-actions">
        <button id="false-color-btn" class="sun-btn">🌈 False Color</button>
      </div>
      <div class="sun-info">
        <small>📍 Gothenburg, Sweden</small>
      </div>
    `;
    this.controlPanel.style.cssText = `
      position: fixed;
      right: 72px;
      top: 20px;
      z-index: 600;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      padding: 16px;
      width: 220px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      display: none;
    `;
    document.body.appendChild(this.controlPanel);
    
    const style = document.createElement('style');
    style.textContent = `
      #sun-study-panel h3 { margin: 0 0 12px 0; font-size: 16px; color: #333; }
      .sun-control { margin-bottom: 12px; }
      .sun-control label { display: block; margin-bottom: 4px; color: #555; font-weight: 500; }
      .sun-control input[type="date"], .sun-control input[type="range"] { width: 100%; box-sizing: border-box; }
      .sun-control input[type="date"] { padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; }
      .sun-control input[type="range"] { -webkit-appearance: none; height: 6px; background: #ddd; border-radius: 3px; cursor: pointer; }
      .sun-control input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; background: #f59e0b; border-radius: 50%; cursor: pointer; }
      .sun-actions { display: flex; gap: 8px; margin: 16px 0; }
      .sun-btn { flex: 1; padding: 8px 12px; border: none; border-radius: 4px; background: #f59e0b; color: white; font-weight: 600; cursor: pointer; }
      .sun-btn:hover { background: #d97706; }
      .sun-btn.active { background: #059669; }
      .sun-info { margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee; color: #888; }
    `;
    document.head.appendChild(style);
    
    setTimeout(() => this.bindControlEvents(), 100);
  }
  
  bindControlEvents() {
    const dateInput = document.getElementById('sun-date');
    const timeSlider = document.getElementById('sun-time');
    const speedSlider = document.getElementById('sun-speed');
    const opacitySlider = document.getElementById('shadow-opacity');
    const animateBtn = document.getElementById('sun-animate-btn');
    
    if (dateInput) {
      dateInput.addEventListener('change', (e) => {
        this.date = new Date(e.target.value);
        this.updateSunPosition();
      });
    }
    
    if (timeSlider) {
      timeSlider.addEventListener('input', (e) => {
        this.timeOfDay = parseFloat(e.target.value);
        this.updateTimeDisplay();
        this.updateSunPosition();
      });
    }
    
    if (speedSlider) {
      speedSlider.addEventListener('input', (e) => {
        this.animationSpeed = parseFloat(e.target.value);
        document.getElementById('speed-display').textContent = `${this.animationSpeed}x`;
      });
    }
    
    if (opacitySlider) {
      opacitySlider.addEventListener('input', (e) => {
        this.shadowOpacity = parseFloat(e.target.value);
        if (this.shadowMaterial) {
          this.shadowMaterial.opacity = this.shadowOpacity;
          this.shadowMaterial.needsUpdate = true;
        }
      });
    }
    
    if (animateBtn) {
      animateBtn.addEventListener('click', () => {
        this.isAnimating = !this.isAnimating;
        animateBtn.textContent = this.isAnimating ? '⏸ Pause' : '▶ Animate Day';
        animateBtn.classList.toggle('active', this.isAnimating);
      });
    }
    

    
    // False color toggle
    const falseColorBtn = document.getElementById('false-color-btn');
    if (falseColorBtn) {
      falseColorBtn.addEventListener('click', () => {
        this.toggleFalseColorMode();
        falseColorBtn.textContent = this.isFalseColorMode ? '🎨 Normal View' : '🌈 False Color';
        falseColorBtn.classList.toggle('active', this.isFalseColorMode);
      });
    }
  }
  
  createFalseColorMaterial() {
    // Custom shader for false color sun exposure visualization
    // Shows surface orientation relative to sun direction
    const vertexShader = `
      varying vec3 vNormal;
      
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    
    const fragmentShader = `
      uniform vec3 sunDirection;
      
      varying vec3 vNormal;
      
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(sunDirection);
        
        // Calculate sun-facing factor (dot product)
        float NdotL = dot(normal, lightDir);
        float sunFacing = max(0.0, NdotL);
        
        // Color gradient: blue (shadow) -> cyan -> green -> yellow -> orange -> red (direct sun)
        vec3 color;
        
        if (sunFacing < 0.05) {
          // Deep shadow - dark blue/purple
          color = vec3(0.15, 0.1, 0.35);
        } else if (sunFacing < 0.2) {
          // Shadow - blue
          float t = (sunFacing - 0.05) / 0.15;
          color = mix(vec3(0.15, 0.1, 0.35), vec3(0.1, 0.25, 0.6), t);
        } else if (sunFacing < 0.4) {
          // Partial shadow - blue to cyan
          float t = (sunFacing - 0.2) / 0.2;
          color = mix(vec3(0.1, 0.25, 0.6), vec3(0.1, 0.6, 0.8), t);
        } else if (sunFacing < 0.55) {
          // Neutral - cyan to green
          float t = (sunFacing - 0.4) / 0.15;
          color = mix(vec3(0.1, 0.6, 0.8), vec3(0.3, 0.75, 0.3), t);
        } else if (sunFacing < 0.7) {
          // Partial sun - green to yellow
          float t = (sunFacing - 0.55) / 0.15;
          color = mix(vec3(0.3, 0.75, 0.3), vec3(1.0, 0.9, 0.2), t);
        } else if (sunFacing < 0.85) {
          // Good sun - yellow to orange
          float t = (sunFacing - 0.7) / 0.15;
          color = mix(vec3(1.0, 0.9, 0.2), vec3(1.0, 0.5, 0.1), t);
        } else {
          // Direct sun - orange to red
          float t = (sunFacing - 0.85) / 0.15;
          color = mix(vec3(1.0, 0.5, 0.1), vec3(0.95, 0.2, 0.1), t);
        }
        
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    
    this.falseColorMaterial = new THREE.ShaderMaterial({
      uniforms: {
        sunDirection: { value: new THREE.Vector3(0, 1, 0) }
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      side: THREE.DoubleSide
    });
  }
  
  toggleFalseColorMode() {
    if (!this.mesh) return;
    
    this.isFalseColorMode = !this.isFalseColorMode;
    
    if (this.isFalseColorMode) {
      if (!this.falseColorMaterial) {
        this.createFalseColorMaterial();
      }
      // Update shader uniforms
      this.updateFalseColorUniforms();
      this.mesh.material = this.falseColorMaterial;
    } else {
      this.mesh.material = this.standardMaterial;
    }
  }
  
  updateFalseColorUniforms() {
    if (!this.falseColorMaterial || !this.sunLight) return;
    
    // Update sun direction
    const sunDir = this.sunLight.position.clone().normalize();
    this.falseColorMaterial.uniforms.sunDirection.value.copy(sunDir);
  }
  
  applyManualAdjustments() {
    if (!this.mesh || !this.baseScale) return;
    
    // Apply scale with multiplier
    const scale = this.baseScale * this.scaleMultiplier;
    this.mesh.scale.set(scale, scale, -scale); // Flip Z axis (matches initial setup)
    
    // Apply rotation (base rotation + offset)
    this.mesh.rotation.y = this.baseRotation + (this.rotationOffset * Math.PI / 180);
    
    // Apply position offset
    this.mesh.position.x = this.offsetX;
    this.mesh.position.z = this.offsetZ;
  }
  
  updateTimeDisplay() {
    const hours = Math.floor(this.timeOfDay);
    const minutes = Math.round((this.timeOfDay - hours) * 60);
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    document.getElementById('time-display').textContent = timeStr;
    document.getElementById('sun-time').value = this.timeOfDay;
  }
  
  setupRenderer() {
    const width = window.innerWidth - 120;
    const height = window.innerHeight;
    
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: false
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  
  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = null; // Transparent
    
    // Ground plane to receive shadows (invisible except for shadows)
    const groundGeometry = new THREE.PlaneGeometry(2000, 2000);
    this.shadowMaterial = new THREE.ShadowMaterial({
      opacity: this.shadowOpacity,
      color: 0x000000
    });
    
    this.groundPlane = new THREE.Mesh(groundGeometry, this.shadowMaterial);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.position.y = 0;
    this.groundPlane.receiveShadow = true;
    this.scene.add(this.groundPlane);
  }
  
  setupCamera() {
    const width = window.innerWidth - 120;
    const height = window.innerHeight;
    const aspect = width / height;
    
    // Orthographic camera for top-down view
    const viewSize = 300;
    this.camera = new THREE.OrthographicCamera(
      -viewSize * aspect / 2,
      viewSize * aspect / 2,
      viewSize / 2,
      -viewSize / 2,
      0.1,
      2000
    );
    
    // Top-down view looking straight down
    this.camera.position.set(0, 500, 0);
    this.camera.lookAt(0, 0, 0);
    // Rotate camera to match map bearing
    this.camera.up.set(
      Math.sin(this.mapBearing * Math.PI / 180),
      0,
      Math.cos(this.mapBearing * Math.PI / 180)
    );
  }
  
  setupLights() {
    // Hemisphere light for sky dome effect (sky color from above, ground color from below)
    // Reduced intensity for higher contrast in projection
    const hemiLight = new THREE.HemisphereLight(
      0xfff4e5,  // Warmer sky (less blue/white)
      0x444444,  // Dark ground
      0.2        // Low intensity for high contrast
    );
    hemiLight.position.set(0, 500, 0);
    this.scene.add(hemiLight);
    
    // Minimal ambient for fill - very low for high contrast
    const ambient = new THREE.AmbientLight(0xffffff, 0.1);
    this.scene.add(ambient);
    
    // Directional sun light for shadows
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sunLight.castShadow = true;
    
    // Higher resolution shadow map
    this.sunLight.shadow.mapSize.width = 8192;
    this.sunLight.shadow.mapSize.height = 8192;
    this.sunLight.shadow.radius = 2; // Soften shadows to reduce aliasing
    
    // Shadow camera settings - will be updated dynamically with sun position
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 2000;
    
    // Larger shadow frustum to cover the whole model
    const shadowSize = 300;
    this.sunLight.shadow.camera.left = -shadowSize;
    this.sunLight.shadow.camera.right = shadowSize;
    this.sunLight.shadow.camera.top = shadowSize;
    this.sunLight.shadow.camera.bottom = -shadowSize;
    
    // Bias settings to reduce shadow artifacts (shadow acne)
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.05;
    
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);
    
    this.updateSunPosition();
  }
  
  setupPostProcessing() {
    const width = window.innerWidth - 120;
    const height = window.innerHeight;
    
    // Effect composer for post-processing
    this.composer = new EffectComposer(this.renderer);
    
    // Render pass
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);
    
    // SSAO pass for ambient occlusion
    this.ssaoPass = new SSAOPass(this.scene, this.camera, width, height);
    this.ssaoPass.kernelRadius = 32; // Increased radius for stronger AO
    this.ssaoPass.minDistance = 0.005;
    this.ssaoPass.maxDistance = 0.15; // Increased distance
    this.composer.addPass(this.ssaoPass);
  }
  
  calculateSunPosition(date, timeOfDay, latitude) {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    
    const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * Math.PI / 180);
    const hourAngle = (timeOfDay - 12.0) * 15;
    
    const latRad = latitude * Math.PI / 180;
    const declRad = declination * Math.PI / 180;
    const hourRad = hourAngle * Math.PI / 180;
    
    const sinAlt = Math.sin(latRad) * Math.sin(declRad) + 
                   Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourRad);
    const altitude = Math.asin(sinAlt) * 180 / Math.PI;
    
    const cosAz = (Math.sin(declRad) - Math.sin(latRad) * sinAlt) / 
                  (Math.cos(latRad) * Math.cos(Math.asin(sinAlt)));
    let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) * 180 / Math.PI;
    
    if (hourAngle > 0) azimuth = 360 - azimuth;
    
    return { altitude, azimuth };
  }
  
  updateSunPosition() {
    if (!this.sunLight) return;
    
    const { altitude, azimuth } = this.calculateSunPosition(
      this.date, this.timeOfDay, this.latitude
    );
    
    document.getElementById('altitude-display').textContent = altitude.toFixed(1);
    document.getElementById('azimuth-display').textContent = azimuth.toFixed(1);
    
    const distance = 500;
    const altRad = Math.max(0.05, altitude * Math.PI / 180);
    // Adjust azimuth to match map orientation
    const adjustedAz = azimuth - this.mapBearing;
    const azRad = (adjustedAz - 180) * Math.PI / 180;
    
    this.sunLight.intensity = altitude > 0 ? 1.0 : 0;
    
    // Cinematic lighting: Adjust color based on altitude
    // Golden/Reddish at low altitude, White/Yellow at high altitude
    if (altitude > 0) {
      const color = new THREE.Color();
      if (altitude < 10) {
        // Sunrise/Sunset - Reddish Orange
        color.setHSL(0.05, 1.0, 0.6);
      } else if (altitude < 25) {
        // Golden Hour - Orange/Gold
        const t = (altitude - 10) / 15;
        color.setHSL(0.1, 1.0, 0.6 + t * 0.2);
      } else {
        // Day - Warm White
        const t = Math.min(1, (altitude - 25) / 40);
        // Warmer sun: Hue 0.08 (orange-yellow) instead of 0.12 (yellow)
        color.setHSL(0.08, 0.6 - t * 0.2, 0.8 + t * 0.2);
      }
      this.sunLight.color.copy(color);
      
      // Adjust intensity for cinematic feel - boosted for projection
      this.sunLight.intensity = Math.min(2.5, 0.8 + Math.sin(altitude * Math.PI / 180) * 2.0);
    }
    
    // Position the sun light
    const sunX = distance * Math.cos(altRad) * Math.sin(azRad);
    const sunY = distance * Math.sin(altRad);
    const sunZ = distance * Math.cos(altRad) * Math.cos(azRad);
    
    this.sunLight.position.set(sunX, sunY, sunZ);
    this.sunLight.target.position.set(0, 50, 0); // Target the center of the model (raised)
    
    // Update shadow camera to follow the light
    this.sunLight.shadow.camera.updateProjectionMatrix();
  }
  
  loadSTLModel() {
    const loader = new STLLoader();
    console.log('Loading STL model...');
    
    loader.load(
      './media/mesh.stl',
      (geometry) => {
        console.log('STL loaded, vertices:', geometry.attributes.position.count);
        
        // Swap Y and Z coordinates in the geometry (STL has Y/Z swapped)
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
          const y = positions[i + 1];
          const z = positions[i + 2];
          positions[i + 1] = z;  // New Y = old Z
          positions[i + 2] = y;  // New Z = old Y
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals(); // Recompute normals after swapping
        
        geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        geometry.boundingBox.getSize(size);
        geometry.boundingBox.getCenter(center);
        
        console.log('STL size:', size);
        
        // Center geometry
        geometry.translate(-center.x, -center.y, -center.z);
        geometry.computeBoundingBox();
        
        // Material - semi-transparent model with shadows
        // Matte white for better projection contrast
        this.standardMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 1.0, // Fully matte
          metalness: 0.0,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 1,
          depthWrite: true
        });
        
        this.mesh = new THREE.Mesh(geometry, this.standardMaterial);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.renderOrder = 1; // Render after other objects
        
        // Store model size for fitting
        this.modelSize = size;

        
        // Initial setup
        this.baseRotation = -Math.PI/2; 
        this.mesh.rotation.y = this.baseRotation;
        
        // Apply initial position offset
        this.mesh.position.x = this.offsetX;
        this.mesh.position.y = 50; // Raise model above ground plane to avoid clipping
        this.mesh.position.z = this.offsetZ;
        
        this.scene.add(this.mesh);
        this.fitCameraToModel();
        
        console.log('STL added - size:', size);
      },
      (progress) => {
        console.log('Loading STL...', progress.loaded, 'bytes');
      },
      (error) => {
        console.error('Error loading STL:', error);
      }
    );
  }
  
  fitCameraToModel() {
    if (!this.mesh || !this.modelSize) return;
    
    const canvasWidth = window.innerWidth - 120;
    const canvasHeight = window.innerHeight;
    
    // Fit model to canvas with padding
    const padding = 0.8;
    
    // Use the largest dimension to ensure it fits
    const maxDim = Math.max(this.modelSize.x, this.modelSize.z);
    const minCanvasDim = Math.min(canvasWidth, canvasHeight);
    
    const scale = ((minCanvasDim * padding) / maxDim) * 2.0;
    
    // Apply scale (preserving the Z flip)
    this.mesh.scale.set(scale, scale, -scale);
    

    this.baseScale = scale;
    
    // Set camera to match the canvas dimensions 1:1 to avoid distortion
    this.camera.left = -canvasWidth / 2;
    this.camera.right = canvasWidth / 2;
    this.camera.top = canvasHeight / 2;
    this.camera.bottom = -canvasHeight / 2;
    this.camera.updateProjectionMatrix();
    
    // Update shadow camera to cover the model
    const worldSize = maxDim * scale;
    const shadowSize = worldSize * 1.2; // Tighter fit for better shadow resolution
    
    this.sunLight.shadow.camera.left = -shadowSize;
    this.sunLight.shadow.camera.right = shadowSize;
    this.sunLight.shadow.camera.top = shadowSize;
    this.sunLight.shadow.camera.bottom = -shadowSize;
    this.sunLight.shadow.camera.updateProjectionMatrix();
  }
  
  onResize() {
    if (!this.isActive || !this.renderer) return;
    
    const width = window.innerWidth - 120;
    const height = window.innerHeight;
    
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.mesh) this.fitCameraToModel();
  }
  
  animate() {
    if (!this.isActive) return;
    
    this.animationId = requestAnimationFrame(() => this.animate());
    
    if (this.isAnimating) {
      this.timeOfDay += this.animationSpeed * 0.016;
      if (this.timeOfDay >= 24) this.timeOfDay = 0;
      this.updateTimeDisplay();
      this.updateSunPosition();
    }
    
    // Update false color uniforms if in that mode
    if (this.isFalseColorMode) {
      this.updateFalseColorUniforms();
    }
    
    // Use composer for post-processing (SSAO)
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
  
  async toggle() {
    this.isActive = !this.isActive;
    
    const sunBtn = document.getElementById('sun-study-btn');
    if (sunBtn) sunBtn.classList.toggle('active', this.isActive);
    
    if (this.isActive) {
      await this.show();
    } else {
      this.hide();
    }
  }
  
  async show() {
    if (!this.dependenciesLoaded) {
      await this.initThreeJS();
    }
    
    this.canvas.style.display = 'block';
    this.controlPanel.style.display = 'block';
    
    setTimeout(() => {
      this.onResize();
      this.animate();
    }, 50);
  }
  
  hide() {
    this.canvas.style.display = 'none';
    this.controlPanel.style.display = 'none';
    this.isAnimating = false;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    const animateBtn = document.getElementById('sun-animate-btn');
    if (animateBtn) {
      animateBtn.textContent = '▶ Animate Day';
      animateBtn.classList.remove('active');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.sunStudy = new SunStudy();
});

export { SunStudy };
