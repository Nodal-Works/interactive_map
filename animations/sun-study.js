// Sun Study Module - Three.js shadow overlay on map
// Renders shadows from STL model as transparent overlay on the web map
// Uses Sweden location (Gothenburg area) for accurate sun positioning
// Supports dual model system (buildings + trees) with multi-source shadow discrimination

let THREE, STLLoader, EffectComposer, RenderPass, SSAOPass, SMAAPass, OutputPass;

async function loadDependencies() {
  THREE = await import('three');
  const stlModule = await import('three/addons/loaders/STLLoader.js');
  STLLoader = stlModule.STLLoader;
  
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
    
    // Dual model system
    this.meshBuildings = null;  // Model 1: terrain/buildings (mesh.stl)
    this.meshTrees = null;      // Model 2: trees (trees.stl)
    this.treesVisible = false;  // Toggle state for trees
    this.treesLoaded = false;   // Whether tree model has been loaded
    this.buildingsCenter = null; // Stored center for aligning trees
    
    // Performance: Dirty flags (kept for future use)
    this.shadowMapsDirty = true;
    this.lastSunPosition = { x: 0, y: 0, z: 0 };
    this.frameCount = 0;
    this.shadowUpdateInterval = 2;
    
    // Cached matrices (for future dual shadow system)
    this.cachedShadowMatrixBuildings = null;
    this.cachedShadowMatrixTrees = null;
    
    // Materials
    this.standardMaterial = null;
    this.standardMaterialTrees = null;
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
                this.shadowMapsDirty = true;
                break;
            case 'set_time':
                this.timeOfDay = parseFloat(data.value);
                this.updateSunPosition();
                this.shadowMapsDirty = true;
                break;
            case 'set_opacity':
                this.shadowOpacity = parseFloat(data.value);
                if (this.shadowMaterial) this.shadowMaterial.opacity = this.shadowOpacity;
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
            case 'toggle_trees':
                this.toggleTrees();
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
    this.setupDualShadowSystem();
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
  
  toggleTrees() {
    if (!this.treesLoaded) {
      // Load trees for the first time
      this.loadTreesSTL();
      return;
    }
    
    this.treesVisible = !this.treesVisible;
    
    if (this.meshTrees) {
      this.meshTrees.visible = this.treesVisible && !this.isFalseColorMode;
      this.meshTrees.castShadow = this.treesVisible;
    }
    
    // Mark shadow maps as needing update
    this.shadowMapsDirty = true;
    
    // Notify controller of state change
    if (this.channel) {
      this.channel.postMessage({
        type: 'trees_state',
        visible: this.treesVisible,
        loaded: this.treesLoaded
      });
    }
    
    console.log('Trees visibility:', this.treesVisible);
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
  
  setupDualShadowSystem() {
    // Two-pass shadow system for multi-source shadow discrimination
    // We render the scene twice to separate render targets:
    // 1) Buildings-only shadows → shadowTargetBuildings
    // 2) Combined shadows (buildings + trees) → shadowTargetCombined
    // The false color shader then samples both to determine shadow source
    
    const width = window.innerWidth - 120;
    const height = window.innerHeight;
    // Account for pixel ratio to match actual framebuffer size
    const pixelRatio = this.renderer ? this.renderer.getPixelRatio() : window.devicePixelRatio || 1;
    const targetWidth = Math.floor(width * pixelRatio);
    const targetHeight = Math.floor(height * pixelRatio);
    
    // Render targets for shadow passes (store shadow result as color)
    this.shadowTargetBuildings = new THREE.WebGLRenderTarget(targetWidth, targetHeight, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });
    
    this.shadowTargetCombined = new THREE.WebGLRenderTarget(targetWidth, targetHeight, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });
    
    // Simple material that outputs shadow value as grayscale
    this.shadowCaptureMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.DoubleSide
    });
    
    this.shadowCaptureMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <shadowmap_pars_fragment>',
        `
        #include <shadowmap_pars_fragment>
        #include <shadowmask_pars_fragment>
        `
      );
      
      // Output shadow mask as grayscale color
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>
        float shadowVal = 1.0;
        #ifdef USE_SHADOWMAP
          shadowVal = getShadowMask();
        #endif
        gl_FragColor = vec4(shadowVal, shadowVal, shadowVal, 1.0);
        `
      );
    };
  }
  
  createFalseColorMaterial() {
    // False color shader for multi-source shadow visualization
    // Samples two shadow textures to determine shadow source:
    // - tShadowBuildings: shadow with buildings only
    // - tShadowCombined: shadow with buildings + trees
    
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
      shader.uniforms.treesEnabled = { value: false };
      shader.uniforms.tShadowBuildings = { value: null };
      shader.uniforms.tShadowCombined = { value: null };
      shader.uniforms.resolution = { value: new THREE.Vector2(window.innerWidth - 120, window.innerHeight) };
      
      // Store shader reference to update uniforms later
      this.falseColorMaterial.userData.shader = shader;
      
      // Inject uniforms and varyings
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `
        #include <common>
        uniform vec3 sunDirection;
        uniform bool treesEnabled;
        uniform sampler2D tShadowBuildings;
        uniform sampler2D tShadowCombined;
        uniform vec2 resolution;
        `
      );
      
      // Inject false color logic at the end of the fragment shader
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>
        
        // Custom False Color Logic
        vec3 myNormal = normalize(vNormal);
        if (!gl_FrontFacing) myNormal = -myNormal;
        
        vec3 myLightDir = normalize(sunDirection);
        
        // Calculate sun-facing factor
        float myNdotL = dot(myNormal, myLightDir);
        float mySunFacing = max(0.0, myNdotL);
        
        // Sample shadow textures using screen coordinates
        vec2 screenUV = gl_FragCoord.xy / resolution;
        
        float shadowBuildings = texture2D(tShadowBuildings, screenUV).r;
        float shadowCombined = texture2D(tShadowCombined, screenUV).r;
        
        // Shadow detection thresholds (PCF shadows - fairly sharp but with some filtering)
        float shadowThreshold = 0.65;  // Threshold for detecting shadow
        float treeDifferenceThreshold = 0.02; // Very sensitive - trees add even small shadow
        
        bool inBuildingShadow = shadowBuildings < shadowThreshold;
        bool inCombinedShadow = shadowCombined < shadowThreshold;
        
        // Tree-only shadow: No building shadow, but combined has shadow
        bool inTreeOnlyShadow = !inBuildingShadow && inCombinedShadow && treesEnabled;
        
        // Combined shadow: Building shadow exists, AND trees make it even darker
        // Compare intensities - if combined is noticeably darker than buildings-only,
        // trees are contributing additional shadow
        float treesContribution = shadowBuildings - shadowCombined; // positive = trees adding shadow
        bool treesAddingShadow = treesContribution > treeDifferenceThreshold;
        bool inCombinedBothShadow = inBuildingShadow && treesAddingShadow && treesEnabled;
        
        // Building-only shadow: Building shadow, but trees don't add anything
        bool inBuildingOnlyShadow = inBuildingShadow && !treesAddingShadow;
        
        // Exposure is high only if facing sun AND not in any shadow
        float exposure = mySunFacing * shadowCombined;
        
        vec3 myColor;
        
        if (inTreeOnlyShadow) {
          // Tree-only shadow - BRIGHT GREEN (very distinct)
          float shadowIntensity = 1.0 - shadowCombined;
          myColor = mix(vec3(0.2, 0.65, 0.25), vec3(0.1, 0.5, 0.15), shadowIntensity);
        } else if (inCombinedBothShadow) {
          // Both building AND trees shadow this area - MAGENTA/PURPLE (very distinct)
          float shadowIntensity = 1.0 - shadowCombined;
          myColor = mix(vec3(0.6, 0.2, 0.55), vec3(0.45, 0.1, 0.45), shadowIntensity);
        } else if (inBuildingOnlyShadow) {
          // Building shadow only - BLUE tint
          float shadowIntensity = 1.0 - shadowBuildings;
          myColor = mix(vec3(0.3, 0.35, 0.6), vec3(0.15, 0.2, 0.5), shadowIntensity);
        } else {
          // Lit area - use sun exposure gradient (YELLOW to RED)
          vec3 color0 = vec3(0.95, 0.85, 0.4);   // Low exposure - pale yellow
          vec3 color1 = vec3(1.0, 0.7, 0.2);     // Medium exposure - orange
          vec3 color2 = vec3(1.0, 0.4, 0.15);    // High exposure - red-orange
          vec3 color3 = vec3(0.95, 0.2, 0.1);    // Direct sun - red
          
          myColor = color0;
          myColor = mix(myColor, color1, smoothstep(0.0, 0.35, exposure));
          myColor = mix(myColor, color2, smoothstep(0.35, 0.7, exposure));
          myColor = mix(myColor, color3, smoothstep(0.7, 1.0, exposure));
        }
        
        // Add subtle dithering to break up banding
        float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.015;
        myColor += dither;
        
        gl_FragColor = vec4(myColor, 1.0);
        `
      );
    };
  }
  
  toggleFalseColorMode() {
    if (!this.mesh) return;
    
    this.isFalseColorMode = !this.isFalseColorMode;
    this.shadowMapsDirty = true; // Force shadow map update on mode change
    
    if (this.isFalseColorMode) {
      if (!this.falseColorMaterial) {
        this.createFalseColorMaterial();
      }
      this.mesh.material = this.falseColorMaterial;
      
      // Also apply false color to trees so they show consistent visualization
      if (this.meshTrees) {
        this.meshTrees.material = this.falseColorMaterial;
      }
    } else {
      this.mesh.material = this.standardMaterial;
      
      // Restore trees material
      if (this.meshTrees && this.standardMaterialTrees) {
        this.meshTrees.material = this.standardMaterialTrees;
      }
    }
  }
  
  updateFalseColorUniforms() {
    if (!this.falseColorMaterial || !this.sunLight) return;
    
    const shader = this.falseColorMaterial.userData.shader;
    if (!shader || !shader.uniforms) return;
    
    // Update sun direction
    const sunDir = this.sunLight.position.clone().normalize();
    if (sunDir.lengthSq() === 0) {
      sunDir.set(0, 1, 0);
    }
    
    if (shader.uniforms.sunDirection) {
      shader.uniforms.sunDirection.value.copy(sunDir);
    }
    if (shader.uniforms.treesEnabled) {
      shader.uniforms.treesEnabled.value = this.treesVisible && this.treesLoaded;
    }
    if (shader.uniforms.tShadowBuildings && this.shadowTargetBuildings) {
      shader.uniforms.tShadowBuildings.value = this.shadowTargetBuildings.texture;
    }
    if (shader.uniforms.tShadowCombined && this.shadowTargetCombined) {
      shader.uniforms.tShadowCombined.value = this.shadowTargetCombined.texture;
    }
    if (shader.uniforms.resolution) {
      const pixelRatio = this.renderer ? this.renderer.getPixelRatio() : 1;
      shader.uniforms.resolution.value.set(
        (window.innerWidth - 120) * pixelRatio,
        window.innerHeight * pixelRatio
      );
    }
  }
  
  renderShadowMaps() {
    // Two-pass shadow rendering for multi-source shadow discrimination
    // This method is called before the main render in false color mode
    
    if (!this.meshBuildings || !this.sunLight || !this.renderer) return;
    if (!this.shadowTargetBuildings || !this.shadowTargetCombined) return;
    if (!this.shadowCaptureMaterial) return;
    
    const treesActive = this.treesVisible && this.treesLoaded && this.meshTrees;
    
    // Store original state
    const originalBuildingsMaterial = this.meshBuildings.material;
    const originalTreesMaterial = treesActive ? this.meshTrees.material : null;
    const originalClearColor = this.renderer.getClearColor(new THREE.Color());
    const originalClearAlpha = this.renderer.getClearAlpha();
    const originalShadowType = this.renderer.shadowMap.type;
    const originalBias = this.sunLight.shadow.bias;
    const originalNormalBias = this.sunLight.shadow.normalBias;
    
    // Use PCF shadows for shadow capture passes (cleaner than Basic, sharper than VSM)
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    
    // Adjust bias to prevent shadow acne artifacts
    this.sunLight.shadow.bias = -0.001;
    this.sunLight.shadow.normalBias = 0.02;
    
    // Set clear color to white (1.0 = no shadow) so areas without geometry 
    // are treated as fully lit, not in shadow
    this.renderer.setClearColor(0xffffff, 1.0);
    
    // Use shadow capture material for both passes
    this.meshBuildings.material = this.shadowCaptureMaterial;
    if (treesActive) {
      this.meshTrees.material = this.shadowCaptureMaterial;
    }
    
    // ========== PASS 1: Buildings only ==========
    this.meshBuildings.castShadow = true;
    if (treesActive) {
      this.meshTrees.castShadow = false;  // Disable tree shadows for this pass
      this.meshTrees.visible = false;      // Hide trees entirely
    }
    
    // Force shadow map rebuild with new shadow type
    if (this.sunLight.shadow.map) {
      this.sunLight.shadow.map.dispose();
      this.sunLight.shadow.map = null;
    }
    this.sunLight.shadow.needsUpdate = true;
    
    // Render to buildings shadow target
    this.renderer.setRenderTarget(this.shadowTargetBuildings);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    
    // ========== PASS 2: Combined (buildings + trees) ==========
    if (treesActive) {
      this.meshTrees.castShadow = true;   // Enable tree shadows
      this.meshTrees.visible = true;      // Show trees
      
      // Force shadow map rebuild for combined pass
      if (this.sunLight.shadow.map) {
        this.sunLight.shadow.map.dispose();
        this.sunLight.shadow.map = null;
      }
      this.sunLight.shadow.needsUpdate = true;
      
      // Render to combined shadow target
      this.renderer.setRenderTarget(this.shadowTargetCombined);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    } else {
      // No trees - combined is same as buildings
      this.renderer.setRenderTarget(this.shadowTargetCombined);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }
    
    // Reset render target and restore original state
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(originalClearColor, originalClearAlpha);
    this.renderer.shadowMap.type = originalShadowType;
    this.sunLight.shadow.bias = originalBias;
    this.sunLight.shadow.normalBias = originalNormalBias;
    
    // Force shadow map rebuild with original shadow type for final render
    if (this.sunLight.shadow.map) {
      this.sunLight.shadow.map.dispose();
      this.sunLight.shadow.map = null;
    }
    
    // Restore original materials
    this.meshBuildings.material = originalBuildingsMaterial;
    if (treesActive) {
      this.meshTrees.material = originalTreesMaterial;
    }
    
    // Ensure both meshes are visible and casting shadows for final render
    this.meshBuildings.castShadow = true;
    if (treesActive) {
      this.meshTrees.castShadow = true;
      this.meshTrees.visible = true;
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
    
    // Apply same transforms to trees
    if (this.meshTrees) {
      this.meshTrees.scale.set(scale, scale, -scale);
      this.meshTrees.rotation.y = this.baseRotation + (this.rotationOffset * Math.PI / 180);
      this.meshTrees.position.x = this.offsetX;
      this.meshTrees.position.z = this.offsetZ;
    }
  }
  

  
  setupRenderer() {
    const width = window.innerWidth - 120;
    const height = window.innerHeight;
    
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance' // Request high-performance GPU
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    // Use VSM for smoother shadows without banding artifacts
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
  }
  
  setupScene() {
    this.scene = new THREE.Scene();
    // Use a light neutral background in false color mode, transparent otherwise
    // The background will be updated when toggling false color mode
    this.scene.background = null; // Transparent by default
    
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
    
    // Check if sun actually moved (for dirty flag)
    const threshold = 0.1;
    if (Math.abs(sunX - this.lastSunPosition.x) > threshold ||
        Math.abs(sunY - this.lastSunPosition.y) > threshold ||
        Math.abs(sunZ - this.lastSunPosition.z) > threshold) {
      this.shadowMapsDirty = true;
      this.lastSunPosition = { x: sunX, y: sunY, z: sunZ };
    }
    
    this.sunLight.position.set(sunX, sunY, sunZ);
    this.sunLight.target.position.set(0, 50, 0); // Target the center of the model (raised)
    this.sunLight.target.updateMatrixWorld();
    
    // Update shadow camera to follow the light and cover the scene properly
    this.sunLight.shadow.camera.updateProjectionMatrix();
    this.sunLight.updateMatrixWorld();
    
    // Update shadow cameras for false color mode
    if (this.shadowCameraBuildings) {
      const shadowSize = 800;
      this.shadowCameraBuildings.left = -shadowSize;
      this.shadowCameraBuildings.right = shadowSize;
      this.shadowCameraBuildings.top = shadowSize;
      this.shadowCameraBuildings.bottom = -shadowSize;
      this.shadowCameraBuildings.updateProjectionMatrix();
    }
    if (this.shadowCameraTrees) {
      const shadowSize = 800;
      this.shadowCameraTrees.left = -shadowSize;
      this.shadowCameraTrees.right = shadowSize;
      this.shadowCameraTrees.top = shadowSize;
      this.shadowCameraTrees.bottom = -shadowSize;
      this.shadowCameraTrees.updateProjectionMatrix();
    }
  }
  
  loadSTLModel() {
    const loader = new STLLoader();
    console.log('Loading STL model (buildings/terrain)...');
    
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
        geometry.computeVertexNormals();
        
        geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        geometry.boundingBox.getSize(size);
        geometry.boundingBox.getCenter(center);
        
        console.log('STL size:', size);
        
        // Store center for aligning trees later
        this.buildingsCenter = center.clone();
        
        // Center geometry
        geometry.translate(-center.x, -center.y, -center.z);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        
        // Material - matte white for better projection contrast
        this.standardMaterial = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 1.0,
          metalness: 0.0,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 1,
          depthWrite: true
        });
        
        this.meshBuildings = new THREE.Mesh(geometry, this.standardMaterial);
        this.meshBuildings.castShadow = true;
        this.meshBuildings.receiveShadow = true;
        this.meshBuildings.renderOrder = 1;
        this.meshBuildings.frustumCulled = true;
        
        // Keep reference as this.mesh for compatibility
        this.mesh = this.meshBuildings;
        
        // Store model size for fitting
        this.modelSize = size;

        
        // Initial setup
        this.baseRotation = -Math.PI/2; 
        this.meshBuildings.rotation.y = this.baseRotation;
        
        // Apply initial position offset
        this.meshBuildings.position.x = this.offsetX;
        this.meshBuildings.position.y = 50;
        this.meshBuildings.position.z = this.offsetZ;
        
        this.scene.add(this.meshBuildings);
        this.fitCameraToModel();
        
        console.log('Buildings STL added - size:', size);
      },
      (progress) => {
        console.log('Loading STL...', progress.loaded, 'bytes');
      },
      (error) => {
        console.error('Error loading STL:', error);
      }
    );
  }
  
  loadTreesSTL() {
    if (this.treesLoaded) return;
    
    const loader = new STLLoader();
    console.log('Loading trees STL model...');
    
    loader.load(
      './media/trees.stl',
      (geometry) => {
        console.log('Trees STL loaded, vertices:', geometry.attributes.position.count);
        
        // Apply same coordinate swap as buildings
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
          const y = positions[i + 1];
          const z = positions[i + 2];
          positions[i + 1] = z;
          positions[i + 2] = y;
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
        
        // Use the SAME center as buildings for alignment
        // This ensures trees align with the terrain/buildings
        if (this.buildingsCenter) {
          geometry.translate(-this.buildingsCenter.x, -this.buildingsCenter.y, -this.buildingsCenter.z);
          console.log('Trees aligned using buildings center:', this.buildingsCenter);
        } else {
          // Fallback: use own center if buildings not loaded yet
          geometry.computeBoundingBox();
          const center = new THREE.Vector3();
          geometry.boundingBox.getCenter(center);
          geometry.translate(-center.x, -center.y, -center.z);
          console.warn('Trees loaded before buildings - using own center');
        }
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        
        // Tree material - green tint to distinguish
        this.standardMaterialTrees = new THREE.MeshStandardMaterial({
          color: 0x4a7c4e,
          roughness: 0.9,
          metalness: 0.0,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
          depthWrite: true
        });
        
        this.meshTrees = new THREE.Mesh(geometry, this.standardMaterialTrees);
        this.meshTrees.castShadow = true;
        this.meshTrees.receiveShadow = true;
        this.meshTrees.renderOrder = 2;
        this.meshTrees.frustumCulled = true;
        
        // Apply same transforms as buildings
        if (this.baseScale) {
          const scale = this.baseScale * this.scaleMultiplier;
          this.meshTrees.scale.set(scale, scale, -scale);
        }
        this.meshTrees.rotation.y = this.baseRotation + (this.rotationOffset * Math.PI / 180);
        this.meshTrees.position.x = this.offsetX;
        this.meshTrees.position.y = 50;
        this.meshTrees.position.z = this.offsetZ;
        
        this.scene.add(this.meshTrees);
        
        this.treesLoaded = true;
        this.treesVisible = true;
        this.shadowMapsDirty = true;
        
        // Hide trees if in false color mode
        if (this.isFalseColorMode) {
          this.meshTrees.visible = false;
        }
        
        // Notify controller
        if (this.channel) {
          this.channel.postMessage({
            type: 'trees_state',
            visible: this.treesVisible,
            loaded: this.treesLoaded
          });
        }
        
        console.log('Trees STL added');
      },
      (progress) => {
        console.log('Loading trees STL...', progress.loaded, 'bytes');
      },
      (error) => {
        console.error('Error loading trees STL:', error);
        if (this.channel) {
          this.channel.postMessage({
            type: 'trees_state',
            visible: false,
            loaded: false,
            error: 'Failed to load trees.stl'
          });
        }
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
    
    // Apply to trees if loaded
    if (this.meshTrees) {
      this.meshTrees.scale.set(scale * this.scaleMultiplier, scale * this.scaleMultiplier, -scale * this.scaleMultiplier);
    }

    this.baseScale = scale;
    
    // Set camera to match the canvas dimensions 1:1 to avoid distortion
    this.camera.left = -canvasWidth / 2;
    this.camera.right = canvasWidth / 2;
    this.camera.top = canvasHeight / 2;
    this.camera.bottom = -canvasHeight / 2;
    this.camera.updateProjectionMatrix();
    
    // Update shadow camera to cover the model
    const worldSize = maxDim * scale;
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
    
    this.shadowMapsDirty = true;
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
    
    // Resize shadow targets (account for pixel ratio)
    const targetWidth = Math.floor(width * pixelRatio);
    const targetHeight = Math.floor(height * pixelRatio);
    if (this.shadowTargetBuildings) {
      this.shadowTargetBuildings.setSize(targetWidth, targetHeight);
    }
    if (this.shadowTargetCombined) {
      this.shadowTargetCombined.setSize(targetWidth, targetHeight);
    }
    
    if (this.mesh) {
      this.fitCameraToModel();
    }
    
    this.shadowMapsDirty = true;
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
    
    // Render shadow maps for false color mode (with throttling)
    if (this.isFalseColorMode) {
      this.renderShadowMaps();
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
    this.shadowMapsDirty = true; // Force update on show
    
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
