// Sun Study Module - Three.js shadow overlay on map
// Renders shadows from STL model as transparent overlay on the web map
// Uses Sweden location (Gothenburg area) for accurate sun positioning

let THREE, STLLoader, EffectComposer, RenderPass, SSAOPass, SMAAPass, OutputPass;

async function loadDependencies() {
  THREE = await import('three');
  const stlModule = await import('three/addons/loaders/STLLoader.js');
  STLLoader = stlModule.STLLoader;
  
  // Post-processing for ambient occlusion and antialiasing
  const composerModule = await import('three/addons/postprocessing/EffectComposer.js');
  EffectComposer = composerModule.EffectComposer;
  const renderPassModule = await import('three/addons/postprocessing/RenderPass.js');
  RenderPass = renderPassModule.RenderPass;
  const ssaoPassModule = await import('three/addons/postprocessing/SSAOPass.js');
  SSAOPass = ssaoPassModule.SSAOPass;
  const smaaPassModule = await import('three/addons/postprocessing/SMAAPass.js');
  SMAAPass = smaaPassModule.SMAAPass;
  const outputPassModule = await import('three/addons/postprocessing/OutputPass.js');
  OutputPass = outputPassModule.OutputPass;
  
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
    this.scaleMultiplier = 0.89; // Scale multiplier
    
    this.controlPanel = null;
    this.dependenciesLoaded = false;
    
    this.initUI();
    
    // Listen for remote control messages
    this.channel = new BroadcastChannel('map_controller_channel');
    this.channel.onmessage = (event) => this.handleRemoteControl(event.data);
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
    
    // Control panel moved to remote controller
    // this.createControlPanel();
    
    const sunBtn = document.getElementById('sun-study-btn');
    if (sunBtn) {
      sunBtn.addEventListener('click', () => this.toggle());
    }
    
    window.addEventListener('resize', () => this.onResize());
  }

  handleRemoteControl(data) {
    if (!this.isActive && data.type !== 'control_action') return;

    if (data.type === 'sun_control') {
        switch (data.action) {
            case 'set_date':
                this.date = new Date(data.value);
                this.updateSunPosition();
                break;
            case 'set_time':
                this.timeOfDay = parseFloat(data.value);
                this.updateSunPosition();
                break;
            case 'set_opacity':
                this.shadowOpacity = parseFloat(data.value);
                if (this.mesh) this.mesh.material.opacity = this.shadowOpacity;
                break;
            case 'toggle_animation':
                this.toggleAnimation();
                break;
            case 'set_speed':
                this.animationSpeed = parseFloat(data.value);
                break;
            case 'toggle_false_color':
                this.toggleFalseColor();
                break;
        }
    }
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
  
  // Control panel removed - logic moved to remote controller
  
  bindControlEvents() {
    // No local controls to bind
  }
  
  toggleAnimation() {
    this.isAnimating = !this.isAnimating;
  }

  toggleFalseColor() {
    this.toggleFalseColorMode();
  }
  
  updateTimeDisplay() {
    if (this.channel) {
        this.channel.postMessage({
            type: 'sun_time_update',
            time: this.timeOfDay
        });
    }
  }
  
  /*
  createControlPanel() {
    // ... removed ...
  }
  */
  
  createFalseColorMaterial() {
    // Custom shader for false color sun exposure visualization
    // Shows surface orientation relative to sun direction AND shadows
    // Uses onBeforeCompile to leverage existing shadow map logic from MeshStandardMaterial
    
    this.falseColorMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
      depthWrite: true
    });
    
    this.falseColorMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.sunDirection = { value: new THREE.Vector3(0, 1, 0) };
      
      // Store shader reference to update uniforms later
      this.falseColorMaterial.userData.shader = shader;
      
      // Inject uniform definition safely by replacing common chunk
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `
        #include <common>
        uniform vec3 sunDirection;
        `
      );
      
      // Inject shadowmask_pars_fragment after shadowmap_pars_fragment to ensure dependencies are met
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <shadowmap_pars_fragment>',
        `
        #include <shadowmap_pars_fragment>
        #include <shadowmask_pars_fragment>
        `
      );
      
      // Inject false color logic at the end of the fragment shader
      // We replace the dithering chunk which is at the very end
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>
        
        // Custom False Color Logic
        // vNormal is the varying from vertex shader (view space)
        vec3 myNormal = normalize( vNormal );
        if (!gl_FrontFacing) myNormal = -myNormal;
        
        vec3 myLightDir = normalize(sunDirection);
        
        // Calculate sun-facing factor
        float myNdotL = dot(myNormal, myLightDir);
        float mySunFacing = max(0.0, myNdotL);
        
        // Get shadow factor (1.0 = lit, 0.0 = shadow)
        float myShadow = 1.0;
        #ifdef USE_SHADOWMAP
          myShadow = getShadowMask();
        #endif
        
        // Combine: Exposure is high only if facing sun AND not in shadow
        float exposure = mySunFacing * myShadow;
        
        // Smooth color gradient using continuous interpolation to avoid banding
        // Define color stops
        vec3 color0 = vec3(0.15, 0.1, 0.35);   // Deep shadow - dark purple
        vec3 color1 = vec3(0.1, 0.25, 0.6);    // Shadow - blue
        vec3 color2 = vec3(0.1, 0.6, 0.8);     // Partial shadow - cyan
        vec3 color3 = vec3(0.3, 0.75, 0.3);    // Neutral - green
        vec3 color4 = vec3(1.0, 0.9, 0.2);     // Partial sun - yellow
        vec3 color5 = vec3(1.0, 0.5, 0.1);     // Good sun - orange
        vec3 color6 = vec3(0.95, 0.2, 0.1);    // Direct sun - red
        
        // Use smoothstep for continuous gradient without hard edges
        vec3 myColor;
        float e = exposure;
        
        // Continuous blend across all color stops
        myColor = color0;
        myColor = mix(myColor, color1, smoothstep(0.0, 0.15, e));
        myColor = mix(myColor, color2, smoothstep(0.15, 0.30, e));
        myColor = mix(myColor, color3, smoothstep(0.30, 0.45, e));
        myColor = mix(myColor, color4, smoothstep(0.45, 0.60, e));
        myColor = mix(myColor, color5, smoothstep(0.60, 0.80, e));
        myColor = mix(myColor, color6, smoothstep(0.80, 1.0, e));
        
        // Add subtle dithering to break up any remaining banding
        float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.02;
        myColor += dither;
        
        gl_FragColor = vec4(myColor, 1.0);
        `
      );
    };
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
    
    // Ensure we have a valid direction
    if (sunDir.lengthSq() === 0) {
      sunDir.set(0, 1, 0);
    }
    
    // Update uniform in the compiled shader if it exists
    if (this.falseColorMaterial.userData.shader && 
        this.falseColorMaterial.userData.shader.uniforms && 
        this.falseColorMaterial.userData.shader.uniforms.sunDirection) {
      this.falseColorMaterial.userData.shader.uniforms.sunDirection.value.copy(sunDir);
    }
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
    // Use VSM for smoother shadows without banding artifacts
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
  }
  
  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = null; // Transparent
    
    // Ground plane to receive shadows (invisible except for shadows)
    // Make it very large to catch all shadows regardless of sun angle
    const groundGeometry = new THREE.PlaneGeometry(5000, 5000);
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
      0.15       // Lower intensity for high contrast
    );
    hemiLight.position.set(0, 500, 0);
    this.scene.add(hemiLight);
    
    // Minimal ambient for fill - very low for high contrast
    const ambient = new THREE.AmbientLight(0xffffff, 0.05);
    this.scene.add(ambient);
    
    // Directional sun light for shadows
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sunLight.castShadow = true;
    
    // Higher resolution shadow map - use maximum supported
    this.sunLight.shadow.mapSize.width = 8192;
    this.sunLight.shadow.mapSize.height = 8192;
    // VSM uses blurSamples instead of radius for softness
    this.sunLight.shadow.blurSamples = 25;
    this.sunLight.shadow.radius = 4;
    
    // Shadow camera settings - will be updated dynamically with sun position
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 3000;
    
    // Shadow frustum - balance between coverage and resolution
    // Smaller = better resolution but may clip, larger = more coverage but more aliasing
    // This will be dynamically updated in fitCameraToModel based on view size
    const shadowSize = 800;
    this.sunLight.shadow.camera.left = -shadowSize;
    this.sunLight.shadow.camera.right = shadowSize;
    this.sunLight.shadow.camera.top = shadowSize;
    this.sunLight.shadow.camera.bottom = -shadowSize;
    
    // Bias settings for VSM - typically needs less bias
    this.sunLight.shadow.bias = -0.0001;
    this.sunLight.shadow.normalBias = 0.02;
    
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
    
    // SMAA antialiasing pass - better quality than FXAA
    this.smaaPass = new SMAAPass(width * this.renderer.getPixelRatio(), height * this.renderer.getPixelRatio());
    this.composer.addPass(this.smaaPass);
    
    // Output pass for correct color space
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
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
    
    // Send sun position to controller
    if (this.channel) {
        this.channel.postMessage({
            type: 'sun_position',
            altitude: altitude,
            azimuth: azimuth
        });
    }
    
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
    this.sunLight.target.updateMatrixWorld();
    
    // Update shadow camera to follow the light and cover the scene properly
    this.sunLight.shadow.camera.updateProjectionMatrix();
    this.sunLight.updateMatrixWorld();
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
    
    // Apply scale with multiplier (preserving the Z flip)
    this.mesh.scale.set(scale * this.scaleMultiplier, scale * this.scaleMultiplier, -scale * this.scaleMultiplier);
    

    this.baseScale = scale;
    
    // Set camera to match the canvas dimensions 1:1 to avoid distortion
    this.camera.left = -canvasWidth / 2;
    this.camera.right = canvasWidth / 2;
    this.camera.top = canvasHeight / 2;
    this.camera.bottom = -canvasHeight / 2;
    this.camera.updateProjectionMatrix();
    
    // Update shadow camera to cover the model
    const worldSize = maxDim * scale;
    // Calculate shadow frustum - balance coverage vs resolution
    // Too large = aliasing/banding, too small = clipping
    // Use the scaled model size as the primary reference
    const shadowSize = Math.max(worldSize * 1.5, 800); 
    
    this.sunLight.shadow.camera.left = -shadowSize;
    this.sunLight.shadow.camera.right = shadowSize;
    this.sunLight.shadow.camera.top = shadowSize;
    this.sunLight.shadow.camera.bottom = -shadowSize;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 3000;
    this.sunLight.shadow.camera.updateProjectionMatrix();
    
    // Force shadow map update
    if (this.sunLight.shadow.map) {
      this.sunLight.shadow.map.dispose();
      this.sunLight.shadow.map = null;
    }
  }
  
  onResize() {
    if (!this.isActive || !this.renderer) return;
    
    const width = window.innerWidth - 120;
    const height = window.innerHeight;
    const pixelRatio = this.renderer.getPixelRatio();
    
    this.renderer.setSize(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.ssaoPass) {
      this.ssaoPass.setSize(width, height);
    }
    if (this.smaaPass) {
      this.smaaPass.setSize(width * pixelRatio, height * pixelRatio);
    }
    if (this.mesh) {
      this.fitCameraToModel();
    }
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
    // this.controlPanel.style.display = 'block'; // Panel moved to controller
    
    setTimeout(() => {
      this.onResize();
      this.animate();
    }, 50);
  }
  
  hide() {
    this.canvas.style.display = 'none';
    // this.controlPanel.style.display = 'none'; // Panel moved to controller
    this.isAnimating = false;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    
    // Button logic moved to controller
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.sunStudy = new SunStudy();
});

export { SunStudy };
