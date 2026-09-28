/**
 * Bird Sounds Animation Layer
 * 
 * Visualizes bird sounds from simulated sensors.
 */

class BirdSoundsLayer {
  constructor(map) {
    this.map = map;
    this.canvas = document.getElementById('bird-sounds-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.isActive = false;
    this.frameId=null;
    this.sensorPositions=null;
    this.invalidate=()=>{if(this.isActive && this.frameId===null)this.frameId=(window.MR_FRAMES ? window.MR_FRAMES.request('birds',this.animate) : requestAnimationFrame(this.animate));};
    this.audioContext = null;
    this.buffers=new Map(); this.loadingSound=false; this.generation=0;
    
    // Sensor locations (around the center of the map)
    this.sensors = window.APP_CONFIG.area.birdSensors.map(sensor => ({...sensor}));

    // Bird species configuration
    this.birds = [
      { 
        name: 'Thrush Nightingale', 
        file: window.mrAsset('media/sound/XC372879 - Thrush Nightingale - Luscinia luscinia.mp3'),
        color: '#FFD700', // Gold
        image: 'https://upload.wikimedia.org/wikipedia/commons/9/93/Luscinia_luscinia_vogelartinfo_chris_romeiks_CHR3635.jpg',
        desc: 'Known for its powerful and melodious song, often heard at night. It breeds in dense damp thickets.'
      },
      { 
        name: 'European Pied Flycatcher', 
        file: window.mrAsset('media/sound/XC647538 - European Pied Flycatcher - Ficedula hypoleuca.mp3'),
        color: '#00BFFF', // Deep Sky Blue
        image: 'https://upload.wikimedia.org/wikipedia/commons/5/53/Ficedula_hypoleuca_-Wood_of_Cree_Nature_Reserve%2C_Scotland_-male-8a.jpg',
        desc: 'A small passerine bird that breeds in most of Europe and western Asia. It is migratory, wintering in western Africa.'
      },
      { 
        name: 'Black Redstart', 
        file: window.mrAsset('media/sound/XC900416 - Black Redstart - Phoenicurus ochruros.mp3'),
        color: '#FF4500', // Orange Red
        image: 'https://upload.wikimedia.org/wikipedia/commons/1/14/Hausrotschwanz_Brutpflege_2006-05-21-05.jpg',
        desc: 'A small passerine bird that has adapted to live in the heart of industrial and urban centers.'
      }
    ];

    this.activeSounds = []; // Stores currently playing sounds
    this.nextPlayTimeout = null;
    this.masterVolume = 0.5;
    this.controllerChannel = new BroadcastChannel('map_controller_channel');
    
    this.controllerChannel.onmessage = (event) => {
        if (event.data.type === 'bird_control') {
            const { action, value } = event.data;
            if (action === 'set_volume') {
                this.setVolume(value);
            } else if (action === 'stop_all') {
                this.stopAll();
            } else if (action === 'request_status') {
                this.broadcastActiveBirds();
            }
        }
    };

    // Bind methods
    this.animate = this.animate.bind(this);
    this.resize = this.resize.bind(this);
    this.scheduleNextBird = this.scheduleNextBird.bind(this);

    // Setup
    this.resize();
    window.addEventListener('resize', this.resize);
    
    // Map events to redraw
    map.on('move', () => {this.sensorPositions=null;this.invalidate();});
    map.on('moveend', this.invalidate);
    map.on('zoom', this.invalidate);

    // Button handler
    const btn = document.getElementById('bird-sounds-btn');
    if (btn) {
      btn.addEventListener('click', () => this.toggle());
      window.MR_LAYERS?.register('bird-sounds-btn',{getEnabled:()=>this.isActive,enable:()=>{if(!this.isActive)this.toggle();},disable:()=>{if(this.isActive)this.toggle();}});
    }

    // Unlock AudioContext on first user interaction
    const unlockAudio = () => {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(() => {
          console.log('AudioContext resumed by user gesture');
        });
      } else if (!this.audioContext) {
        this.audioContext = (window.MR_AUDIO_CONTEXT ||= new (window.AudioContext || window.webkitAudioContext)());
      }
      // Remove listeners once unlocked
      if (this.audioContext && this.audioContext.state === 'running') {
        document.removeEventListener('click', unlockAudio, true);
        document.removeEventListener('touchstart', unlockAudio);
        document.removeEventListener('keydown', unlockAudio);
      }
    };

    window.addEventListener('mr-audio-unlock',unlockAudio);
    document.addEventListener('click', unlockAudio, true);
    document.addEventListener('touchstart', unlockAudio);
    document.addEventListener('keydown', unlockAudio);
  }

  setVolume(value) {
    const vol = parseFloat(value);
    if (isNaN(vol)) return;
    this.masterVolume = vol;
    
    this.activeSounds.forEach(sound => {
        if (sound.gainNode) {
            sound.gainNode.gain.setTargetAtTime(vol, this.audioContext.currentTime, 0.1);
        } else if (sound.audio) {
            // Fallback for HTML Audio element if Web Audio failed or wasn't fully set up
            sound.audio.volume = vol;
        }
    });
  }

  projectSensor(sensor) {
    if(!this.sensorPositions){const rect=this.map.getContainer().getBoundingClientRect();
      this.sensorPositions=new Map(this.sensors.map(s=>{const p=this.map.project([s.lng,s.lat]);return [s.id,{x:p.x+rect.left,y:p.y+rect.top}];}));}
    return this.sensorPositions.get(sensor.id);
  }

  resize() {
    this.sensorPositions=null;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  toggle() {
    this.isActive = !this.isActive;
    const btn = document.getElementById('bird-sounds-btn');
    if (btn) btn.classList.toggle('active', this.isActive);
    
    // Broadcast state to controller
    this.controllerChannel.postMessage({ type: 'animation_state', animationId: 'bird-sounds-btn', isActive: this.isActive });

    if (this.isActive) {
      this.initAudioContext();
      this.canvas.style.display = 'block';
      this.scheduleNextBird();
      this.animate();
    } else {
      this.stopAll();
      if(this.frameId!==null){if(window.MR_FRAMES)window.MR_FRAMES.cancel(this.frameId);else cancelAnimationFrame(this.frameId);this.frameId=null;}
      window.MR_FRAMES?.times.delete('birds');
      this.canvas.style.display = 'none';
      if (this.nextPlayTimeout) clearTimeout(this.nextPlayTimeout);
    }
  }

  initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = (window.MR_AUDIO_CONTEXT ||= new (window.AudioContext || window.webkitAudioContext)());
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(e => console.warn('AudioContext resume failed (waiting for user gesture):', e));
    }
  }

  broadcastActiveBirds() {
    const activeBirds = this.activeSounds.map(s => ({
      bird: s.bird,
      sensor: s.sensor
    }));
    
    this.controllerChannel.postMessage({
      type: 'bird_status',
      activeBirds: activeBirds
    });
  }

  stopAll() {
    this.generation++; this.loadingSound=false;
    clearTimeout(this.nextPlayTimeout);this.nextPlayTimeout=null;
    this.activeSounds.slice().forEach(sound => this.disposeSound(sound));
    document.getElementById('audio-unlock-overlay')?.remove();
    this.activeSounds = [];
    this.broadcastActiveBirds();
  }

  scheduleNextBird() {
    if (!this.isActive) return;

    clearTimeout(this.nextPlayTimeout);
    // Random delay between 2 and 8 seconds
    const delay = 2000 + Math.random() * 6000;
    
    this.nextPlayTimeout = setTimeout(() => {
      this.playRandomBird();
      this.scheduleNextBird();
    }, delay);
  }

  async playRandomBird() {
    if(!this.isActive || this.loadingSound || this.activeSounds.length>=3)return;
    this.initAudioContext();
    if(this.audioContext.state!=='running'){this.showInteractionPrompt();return;}
    const sensors=this.sensors.filter(s=>!this.activeSounds.some(a=>a.sensor.id===s.id));
    const birds=this.birds.filter(b=>!this.activeSounds.some(a=>a.bird.name===b.name));
    if(!sensors.length || !birds.length)return;
    const sensor=sensors[Math.floor(Math.random()*sensors.length)],bird=birds[Math.floor(Math.random()*birds.length)];
    const generation=this.generation;
    this.loadingSound=true;
    try {
      if(!this.buffers.has(bird.file)){
        this.buffers.set(bird.file,fetch(bird.file).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.arrayBuffer();})
          .then(bytes=>this.audioContext.decodeAudioData(bytes)).catch(error=>{this.buffers.delete(bird.file);throw error;}));
      }
      const buffer=await this.buffers.get(bird.file);
      if(!this.isActive || generation!==this.generation)return;
      const source=this.audioContext.createBufferSource(),gainNode=this.audioContext.createGain(),analyser=this.audioContext.createAnalyser();
      source.buffer=buffer;gainNode.gain.value=this.masterVolume;analyser.fftSize=256;
      source.connect(gainNode);gainNode.connect(analyser);analyser.connect(this.audioContext.destination);
      const sound={bird,sensor,source,gainNode,analyser,dataArray:new Uint8Array(analyser.frequencyBinCount),startTime:Date.now(),lastWaveTime:0,waves:[]};
      source.onended=()=>this.removeSound(sound);
      try { source.start(); } catch (error) { this.disposeSound(sound); throw error; }
      this.activeSounds.push(sound);this.broadcastActiveBirds();this.invalidate();
    }catch(error){
      if(generation===this.generation){console.warn('Bird audio failed:',error);window.showToast?.('Bird sound could not load: '+bird.name);}
    }finally{if(generation===this.generation)this.loadingSound=false;}
  }

  showInteractionPrompt() {
      if (document.getElementById('audio-unlock-overlay')) return;

      const overlay = document.createElement('div');
      overlay.id = 'audio-unlock-overlay';
      overlay.style.cssText = `
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.6);
          z-index: 10000;
          display: flex;
          justify-content: center;
          align-items: center;
          cursor: pointer;
      `;
      
      const btn = document.createElement('button');
      btn.innerText = 'Click to Enable Bird Sounds';
      btn.style.cssText = `
          padding: 20px 40px;
          font-size: 24px;
          background: #1890ff;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      
      overlay.appendChild(btn);
      document.body.appendChild(overlay);
      
      const unlock = async () => {
          if (this.audioContext && this.audioContext.state === 'suspended') {
              try { await this.audioContext.resume(); } catch { return; }
          }
          overlay.remove();
          // Try to play a bird immediately to confirm
          this.playRandomBird();
          this.scheduleNextBird();
      };
      
      overlay.addEventListener('click', unlock);
  }

  disposeSound(sound) {
    if (sound.source) sound.source.onended=null;
    // A completed source can reject stop(); all other nodes must still disconnect.
    try { sound.source?.stop(); } catch {}
    for (const node of [sound.source,sound.gainNode,sound.analyser]) {
      try { node?.disconnect(); } catch {}
    }
  }

  removeSound(soundObj) {
    const index=this.activeSounds.indexOf(soundObj);
    if(index<0)return;
    this.activeSounds.splice(index,1);
    this.disposeSound(soundObj);
    this.broadcastActiveBirds();
  }

  animate(now=performance.now()) {
    this.frameId=null;
    if (!this.isActive) return;
    const step=window.MR_FRAMES ? window.MR_FRAMES.delta('birds',now)*60 : 1;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Enable additive blending for "cool" intersection effects
    this.ctx.globalCompositeOperation = 'screen';

    // Draw sensors
    this.sensors.forEach(sensor => {
      const pos = this.projectSensor(sensor);
      
      // Only draw if within canvas bounds (optional optimization, but good for debugging visibility)
      if (pos.x >= 0 && pos.x <= this.canvas.width && pos.y >= 0 && pos.y <= this.canvas.height) {
          this.ctx.beginPath();
          this.ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
          this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          this.ctx.fill();
          this.ctx.strokeStyle = '#333';
          this.ctx.stroke();
      }
    });

    // Draw active sounds
    const wallNow = Date.now();
    this.activeSounds.forEach(sound => {
      const pos = this.projectSensor(sound.sensor);
      
      // Get audio data
      sound.analyser.getByteFrequencyData(sound.dataArray);
      
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < sound.dataArray.length; i++) {
        sum += sound.dataArray[i];
      }
      const average = sum / sound.dataArray.length;
      const intensity = average / 255;

      // Draw pulsating glow under the sensor
      if (intensity > 0.01) {
        const glowRadius = 50 + intensity * 500; // Dynamic radius based on volume
        const gradient = this.ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, glowRadius);
        
        // Convert hex color to rgb for rgba usage
        // Assuming sound.bird.color is hex like #RRGGBB
        const hex = sound.bird.color;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.4 + intensity * 0.4})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, glowRadius, 0, Math.PI * 2);
        this.ctx.fill();

        // Draw Loop Waveform Visualizer
        // Map frequency data to a circle
        const baseRadius = 75 + intensity * 70;
        const scale = 0.5;
        
        this.ctx.beginPath();
        this.ctx.strokeStyle = sound.bird.color;
        this.ctx.lineWidth = 2;
        
        const len = sound.dataArray.length;
        // We'll use all available bins and mirror them
        const binsToUse = len; 
        
        for (let i = 0; i < binsToUse * 2; i++) {
            // Mirror index: 0->(len-1) then (len-1)->0
            const dataIndex = i < binsToUse ? i : (binsToUse * 2 - 1 - i);
            const value = sound.dataArray[dataIndex];
            
            const angle = (i / (binsToUse * 2)) * Math.PI * 2;
            const r = baseRadius + value * scale;
            
            const x = pos.x + Math.cos(angle) * r;
            const y = pos.y + Math.sin(angle) * r;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        this.ctx.closePath();
        this.ctx.stroke();
      }
      
      // Add new wave if volume is significant (throttled)
      // Use a dynamic threshold based on recent average to detect beats/peaks
      // Simple peak detection: if current > threshold and time elapsed > min_interval
      // We lower the interval to allow faster beats if the song is fast
      if (average > 25 && wallNow - sound.lastWaveTime > 1000) {
        // Check if this is a local peak (simple version: just check if it's loud enough)
        // For better beat detection we'd need history, but this is a visualizer
        
        sound.waves.push({
          r: 0,
          opacity: 0.4, // Start more transparent
          intensity: intensity
        });
        sound.lastWaveTime = wallNow;
      }

      // Update and draw waves
      for (let i = sound.waves.length - 1; i >= 0; i--) {
        const wave = sound.waves[i];
        wave.r += (0.5 + wave.intensity * 1.0) * step; // Faster expansion

        // Fade out slower to let them travel farther
        wave.opacity -= 0.001 * step;

        if (wave.opacity <= 0) {
          sound.waves.splice(i, 1);
          continue;
        }

        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, wave.r, 0, Math.PI * 2);
        this.ctx.strokeStyle = sound.bird.color;
        this.ctx.globalAlpha = wave.opacity;
        this.ctx.lineWidth = 1 + wave.intensity * 3;
        this.ctx.stroke();
        this.ctx.globalAlpha = 1.0;
      }
    });
    
    // Reset composite operation
    this.ctx.globalCompositeOperation = 'source-over';

    this.invalidate();
  }
}

// Projection and audio setup do not depend on map tiles finishing. map.loaded()
// can become false again after the one-time load event, especially on a busy
// display; waiting for a second load event would leave the button unbound.
if (typeof map !== 'undefined') new BirdSoundsLayer(map);
else window.addEventListener('load', () => {
  if (typeof map !== 'undefined') new BirdSoundsLayer(map);
}, {once:true});
