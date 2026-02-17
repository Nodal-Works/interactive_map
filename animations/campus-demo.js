// Campus Demo - Dynamic SVG Layer Presentation
// Animates campus.svg layers in sequence with keyboard controls
// Version: 0.4 - Slideshow mode (arrow keys to navigate)

class CampusDemoAnimation {
  constructor(map) {
    this.map = map;
    this.channel = new BroadcastChannel('map_controller_channel');
    this.active = false;
    this.container = null;
    this.svgDoc = null;
    this.rafId = null;
    this.animationPhase = -1;
    this.phaseStartTime = 0;
    this.svgLoaded = false;
    this.phaseComplete = false;

    this.prevStreetLifeActive = false;
    this.prevTrafikActive = false;

    this.positionControls = null;
    this.svgTransform = {
      translateX: 128,
      translateY: -35,
      scale: 2.45,
      rotation: 3
    };
    this.SHOW_POSITION_CONTROLS = false;

    this.buildingsLayerAdded = false;
    this.BUILDINGS_SOURCE_ID = 'campus-demo-buildings';
    this.BUILDINGS_LAYER_ID = 'campus-demo-buildings-fill';
    this.BUILDINGS_OUTLINE_ID = 'campus-demo-buildings-outline';

    this.PHASES = [
      { name: 'boundary', duration: 3000, label: 'Project Boundary' },
      { name: 'living-primary', duration: 4000, label: 'Living Campus - Primary Routes' },
      { name: 'living-secondary', duration: 3000, label: 'Living Campus - Secondary Routes' },
      { name: 'living-points', duration: 3000, label: 'Living Campus - Points' },
      { name: 'living-asterix', duration: 2000, label: 'Living Campus - Activity Nodes' },
      { name: 'health-primary', duration: 4000, label: 'Health Campus - Primary Routes' },
      { name: 'health-secondary', duration: 3000, label: 'Health Campus - Secondary Routes' },
      { name: 'health-tertiary', duration: 3000, label: 'Health Campus - Tertiary Routes' },
      { name: 'health-points', duration: 3000, label: 'Health Campus - Points' },
      { name: 'green-spaces', duration: 4000, label: 'Green Meeting Spaces' },
    ];

    this.phaseIndicator = null;
  }

  start() {
    this.toggle();
  }

  stop() {
    if (this.active) {
      this.toggle();
    }
  }

  toggle() {
    this.active = !this.active;
    const btn = document.getElementById('campus-demo-btn');
    
    if (this.active) {
      if (btn) {
        btn.classList.add('toggled-off');
        btn.style.background = '#0078d4';
        btn.style.color = '#fff';
      }
      this.activateCampusDemo();
    } else {
      if (btn) {
        btn.classList.remove('toggled-off');
        btn.style.background = '';
        btn.style.color = '';
      }
      this.deactivateCampusDemo();
    }
  }

  activateCampusDemo() {
    this.channel.postMessage({
      type: 'animation_state',
      animationId: 'campus-demo-btn',
      isActive: true
    });

    this.loadSVG();
    this.createPhaseIndicator();
    this.setupKeyboardControls();
    this.addBuildingsLayer();
  }

  deactivateCampusDemo() {
    this.channel.postMessage({
      type: 'animation_state',
      animationId: 'campus-demo-btn',
      isActive: false
    });

    this.removeSVG();
    this.removePhaseIndicator();
    this.removeBuildingsLayer();
    this.animationPhase = -1;
  }

  createPhaseIndicator() {
    if (this.phaseIndicator) return;
    this.phaseIndicator = document.createElement('div');
    this.phaseIndicator.id = 'campus-phase-indicator';
    this.phaseIndicator.style.cssText = `
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      z-index: 100;
      display: flex;
      align-items: center;
      gap: 16px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
    `;
    this.phaseIndicator.innerHTML = `
      <span class="phase-label" style="min-width: 200px;">Press → to start</span>
      <span class="phase-dots" style="display: flex; gap: 6px;"></span>
      <span class="phase-hint" style="opacity: 0.6; font-size: 12px;">← →</span>
    `;
    document.body.appendChild(this.phaseIndicator);
    this.updatePhaseIndicator();
  }

  updatePhaseIndicator() {
    if (!this.phaseIndicator) return;
    const label = this.phaseIndicator.querySelector('.phase-label');
    const dots = this.phaseIndicator.querySelector('.phase-dots');
    
    if (this.animationPhase < 0) {
      label.textContent = 'Press → to start';
    } else if (this.animationPhase < this.PHASES.length) {
      label.textContent = this.PHASES[this.animationPhase].label;
    } else {
      label.textContent = 'Complete - Press ← to review';
    }
    
    dots.innerHTML = this.PHASES.map((_, i) => {
      const isActive = i === this.animationPhase;
      const isPast = i < this.animationPhase;
      const color = isActive ? '#4CAF50' : (isPast ? '#888' : '#444');
      return `<span style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; transition: background 0.3s;"></span>`;
    }).join('');
  }

  removePhaseIndicator() {
    if (this.phaseIndicator && this.phaseIndicator.parentNode) {
      this.phaseIndicator.parentNode.removeChild(this.phaseIndicator);
      this.phaseIndicator = null;
    }
  }

  loadSavedTransform() {
    try {
      const saved = localStorage.getItem('campus-demo-transform');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.svgTransform = { ...this.svgTransform, ...parsed };
        console.log('Campus Demo: Loaded saved transform:', this.svgTransform);
      }
    } catch (e) {
      console.warn('Campus Demo: Could not load saved transform:', e);
    }
  }

  saveTransform() {
    try {
      localStorage.setItem('campus-demo-transform', JSON.stringify(this.svgTransform));
      console.log('Campus Demo: Saved transform:', this.svgTransform);
    } catch (e) {
      console.warn('Campus Demo: Could not save transform:', e);
    }
  }

  applyTransform() {
    if (!this.svgDoc) return;
    const rotation = this.svgTransform.rotation * -90;
    this.svgDoc.style.transform = `
      translate(${this.svgTransform.translateX}px, ${this.svgTransform.translateY}px)
      scale(${this.svgTransform.scale})
      rotate(${rotation}deg)
    `;
    this.svgDoc.style.transformOrigin = 'center center';
  }

  createPositionControls() {
    if (this.positionControls) return;
    
    this.loadSavedTransform();
    
    this.positionControls = document.createElement('div');
    this.positionControls.id = 'campus-position-controls';
    this.positionControls.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 16px;
      border-radius: 12px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      z-index: 200;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.15);
      min-width: 220px;
      pointer-events: auto;
    `;
    
    this.positionControls.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 12px; font-size: 14px;">SVG Position Controls</div>
      
      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px; opacity: 0.7;">Rotation (90° steps)</label>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="pos-rotate-ccw" style="padding: 6px 12px; cursor: pointer; border-radius: 4px; border: 1px solid #555; background: #333; color: white;">↺ -90°</button>
          <span id="pos-rotation-val" style="min-width: 50px; text-align: center;">${this.svgTransform.rotation * -90}°</span>
          <button id="pos-rotate-cw" style="padding: 6px 12px; cursor: pointer; border-radius: 4px; border: 1px solid #555; background: #333; color: white;">↻ +90°</button>
        </div>
      </div>
      
      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px; opacity: 0.7;">Translate X: <span id="pos-x-val">${this.svgTransform.translateX}</span>px</label>
        <input type="range" id="pos-translate-x" min="-500" max="500" value="${this.svgTransform.translateX}" style="width: 100%; cursor: pointer;">
      </div>
      
      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px; opacity: 0.7;">Translate Y: <span id="pos-y-val">${this.svgTransform.translateY}</span>px</label>
        <input type="range" id="pos-translate-y" min="-500" max="500" value="${this.svgTransform.translateY}" style="width: 100%; cursor: pointer;">
      </div>
      
      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px; opacity: 0.7;">Scale: <span id="pos-scale-val">${this.svgTransform.scale.toFixed(2)}</span></label>
        <input type="range" id="pos-scale" min="0.1" max="3" step="0.05" value="${this.svgTransform.scale}" style="width: 100%; cursor: pointer;">
      </div>
    `;
    document.body.appendChild(this.positionControls);

    document.getElementById('pos-rotate-ccw')?.addEventListener('click', () => {
      this.svgTransform.rotation = (this.svgTransform.rotation - 1 + 4) % 4;
      this.applyTransform();
      this.saveTransform();
      document.getElementById('pos-rotation-val').textContent = this.svgTransform.rotation * -90 + '°';
    });

    document.getElementById('pos-rotate-cw')?.addEventListener('click', () => {
      this.svgTransform.rotation = (this.svgTransform.rotation + 1) % 4;
      this.applyTransform();
      this.saveTransform();
      document.getElementById('pos-rotation-val').textContent = this.svgTransform.rotation * -90 + '°';
    });

    document.getElementById('pos-translate-x')?.addEventListener('input', (e) => {
      this.svgTransform.translateX = parseFloat(e.target.value);
      this.applyTransform();
      this.saveTransform();
      document.getElementById('pos-x-val').textContent = this.svgTransform.translateX;
    });

    document.getElementById('pos-translate-y')?.addEventListener('input', (e) => {
      this.svgTransform.translateY = parseFloat(e.target.value);
      this.applyTransform();
      this.saveTransform();
      document.getElementById('pos-y-val').textContent = this.svgTransform.translateY;
    });

    document.getElementById('pos-scale')?.addEventListener('input', (e) => {
      this.svgTransform.scale = parseFloat(e.target.value);
      this.applyTransform();
      this.saveTransform();
      document.getElementById('pos-scale-val').textContent = this.svgTransform.scale.toFixed(2);
    });
  }

  removePositionControls() {
    if (this.positionControls && this.positionControls.parentNode) {
      this.positionControls.parentNode.removeChild(this.positionControls);
      this.positionControls = null;
    }
  }

  setupKeyboardControls() {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  handleKeyDown(e) {
    if (!this.active) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.nextPhase();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.prevPhase();
    }
  }

  nextPhase() {
    if (this.animationPhase < this.PHASES.length - 1) {
      this.animationPhase++;
      this.phaseStartTime = performance.now();
      this.phaseComplete = false;
      this.animatePhase();
      this.updatePhaseIndicator();
    }
  }

  prevPhase() {
    if (this.animationPhase > 0) {
      this.animationPhase--;
      this.phaseStartTime = performance.now();
      this.phaseComplete = false;
      this.animatePhase();
      this.updatePhaseIndicator();
    }
  }

  async loadSVG() {
    try {
      const response = await fetch('media/campus_v2.svg');
      const svgText = await response.text();
      
      const wrapper = document.createElement('div');
      wrapper.id = 'campus-demo-svg-container';
      wrapper.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        z-index: 50;
      `;
      
      wrapper.innerHTML = svgText;
      document.body.appendChild(wrapper);
      
      this.container = wrapper;
      this.svgDoc = wrapper.querySelector('svg');
      
      if (this.svgDoc) {
        this.svgDoc.style.cssText = `
          position: absolute;
          width: 100%;
          height: 100%;
          left: 0;
          top: 0;
          pointer-events: auto;
        `;
        
        this.hideAllLayers();
        this.loadSavedTransform();
        this.applyTransform();
        this.svgLoaded = true;
        
        if (this.SHOW_POSITION_CONTROLS) {
          this.createPositionControls();
        }
      }
    } catch (e) {
      console.error('Campus Demo: Failed to load SVG:', e);
    }
  }

  removeSVG() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
      this.svgDoc = null;
      this.svgLoaded = false;
    }
    this.removePositionControls();
  }

  hideAllLayers() {
    if (!this.svgDoc) return;
    
    const layerNames = [
      'boundary', 'living-primary', 'living-secondary', 'living-points', 'living-asterix',
      'health-primary', 'health-secondary', 'health-tertiary', 'health-points', 'green-spaces'
    ];
    
    layerNames.forEach(name => {
      const group = this.svgDoc.querySelector(`[id="${name}"]`);
      if (group) group.style.display = 'none';
    });
  }

  showLayer(layerName) {
    if (!this.svgDoc) return;
    const group = this.svgDoc.querySelector(`[id="${layerName}"]`);
    if (group) group.style.display = 'block';
  }

  hideLayer(layerName) {
    if (!this.svgDoc) return;
    const group = this.svgDoc.querySelector(`[id="${layerName}"]`);
    if (group) group.style.display = 'none';
  }

  animatePhase() {
    if (this.animationPhase < 0 || this.animationPhase >= this.PHASES.length) return;
    
    const phase = this.PHASES[this.animationPhase];
    this.showLayer(phase.name);
    
    const updateAnimation = () => {
      const elapsed = performance.now() - this.phaseStartTime;
      const progress = Math.min(1, elapsed / phase.duration);
      
      const elements = this.svgDoc.querySelectorAll(`[id="${phase.name}"] *`);
      elements.forEach(el => {
        if (el.tagName.toLowerCase() === 'path' || el.tagName.toLowerCase() === 'circle') {
          const totalLength = el.getTotalLength?.() || 0;
          if (totalLength > 0) {
            el.style.strokeDasharray = totalLength;
            el.style.strokeDashoffset = totalLength * (1 - progress);
          }
        }
      });
      
      if (progress < 1) {
        this.rafId = requestAnimationFrame(updateAnimation);
      } else {
        this.phaseComplete = true;
      }
    };
    
    updateAnimation();
  }

  addBuildingsLayer() {
    if (this.buildingsLayerAdded) return;
    
    const source = this.map.getSource('building-footprints');
    if (!source) return;
    
    if (!this.map.getLayer(this.BUILDINGS_LAYER_ID)) {
      this.map.addLayer({
        id: this.BUILDINGS_LAYER_ID,
        type: 'fill',
        source: 'building-footprints',
        paint: {
          'fill-color': '#888888',
          'fill-opacity': 0.2
        }
      });
    }
    
    if (!this.map.getLayer(this.BUILDINGS_OUTLINE_ID)) {
      this.map.addLayer({
        id: this.BUILDINGS_OUTLINE_ID,
        type: 'line',
        source: 'building-footprints',
        paint: {
          'line-color': '#666666',
          'line-width': 1,
          'line-opacity': 0.4
        }
      });
    }
    
    this.buildingsLayerAdded = true;
  }

  removeBuildingsLayer() {
    if (this.map.getLayer(this.BUILDINGS_LAYER_ID)) {
      this.map.removeLayer(this.BUILDINGS_LAYER_ID);
    }
    if (this.map.getLayer(this.BUILDINGS_OUTLINE_ID)) {
      this.map.removeLayer(this.BUILDINGS_OUTLINE_ID);
    }
    this.buildingsLayerAdded = false;
  }
}

export { CampusDemoAnimation };
