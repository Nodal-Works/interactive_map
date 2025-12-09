// Controller logic for the secondary screen

const channel = new BroadcastChannel('map_controller_channel');
const statusIndicator = document.getElementById('connection-status');
const statusText = document.getElementById('connection-text');
const welcomeScreen = document.getElementById('welcome-screen');

// Update connection status
// Since BroadcastChannel doesn't have a direct "connected" event for peers, 
// we'll assume connected if we can send, but we can implement a ping/pong if needed.
// For now, we'll just show it as active.
statusIndicator.classList.add('connected');
statusText.textContent = 'Connected';

// Function to show welcome screen
function showWelcome() {
    welcomeScreen.classList.remove('hidden');
    document.querySelectorAll('.control-btn').forEach(b => b.classList.remove('active'));
    startTour();
}

// Make header title clickable to go home
const headerTitle = document.querySelector('header h1');
headerTitle.style.cursor = 'pointer';
headerTitle.title = 'Click to return to Welcome Screen';
headerTitle.addEventListener('click', showWelcome);

// Home button
document.getElementById('home-btn').addEventListener('click', showWelcome);

// Handle button clicks
document.querySelectorAll('.control-btn[data-target]').forEach(btn => {
    btn.addEventListener('click', () => {
        stopTour();
        const targetId = btn.dataset.target;
        const action = btn.dataset.action;
        
        // Send message to main window
        channel.postMessage({
            type: 'control_action',
            target: targetId,
            action: action
        });

        // Update UI state locally
        document.querySelectorAll('.control-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        updateMetadata(targetId);
        updateDashboard(targetId);
    });
});

function updateDashboard(targetId) {
    const dashboardContent = document.getElementById('dashboard-content');
    const legendContent = document.getElementById('legend-content');
    
    if (targetId === 'stormwater-btn') {
        dashboardContent.innerHTML = `
            <div class="dashboard-container">
                <div class="dashboard-card">
                    <div class="dashboard-section-title">
                        <span class="material-icons" style="font-size: 18px;">info</span>
                        Simulation Info
                    </div>
                    <div class="info-box" style="margin-bottom: 1rem; border-left-color: #0ea5e9;">
                        <div class="info-title">Methodology</div>
                        <p class="info-text">
                            Uses a <strong>D8 Flow Direction</strong> algorithm on a Digital Elevation Model (DEM). 
                            Calculates steepest descent for each cell and computes <strong>Flow Accumulation</strong>.
                            Particles spawn in high-accumulation zones to visualize drainage paths.
                        </p>
                    </div>
                    <div class="info-box" style="border-left-color: #0ea5e9;">
                        <div class="info-title">Real-world Application</div>
                        <p class="info-text">
                            Critical for <strong>urban planning</strong> and <strong>flood risk assessment</strong>. 
                            Identifies natural drainage paths and potential pooling zones to inform infrastructure design 
                            and avoid flood-prone construction.
                        </p>
                    </div>
                </div>
            </div>
        `;
        legendContent.innerHTML = `
            <div class="dashboard-card">
                <div class="dashboard-section-title">Legend</div>
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <div class="legend-item">
                        <div class="legend-color" style="background: linear-gradient(to right, #00f, #0ff);"></div>
                        <span class="legend-label">Flow Intensity</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: rgba(0, 100, 255, 0.5); border-radius: 50%;"></div>
                        <span class="legend-label">Accumulation Pools</span>
                    </div>
                </div>
            </div>
        `;
    } else if (targetId === 'sun-study-btn') {
        dashboardContent.innerHTML = `
            <div class="dashboard-container">
                <div class="dashboard-card">
                    <div class="dashboard-section-title">
                        <span class="material-icons" style="font-size: 18px;">tune</span>
                        Controls
                    </div>
                    
                    <div class="control-row">
                        <label class="control-label">Date</label>
                        <input type="date" id="sun-date" class="modern-date" value="${new Date().toISOString().split('T')[0]}">
                    </div>

                    <div class="control-row">
                        <label class="control-label">Time</label>
                        <input type="range" id="sun-time" class="modern-range" min="0" max="24" step="0.25" value="12">
                        <span id="time-display" class="control-value">12:00</span>
                    </div>

                    <div class="control-row">
                        <label class="control-label">Shadow Opacity</label>
                        <input type="range" id="shadow-opacity" class="modern-range" min="0.1" max="1.0" step="0.1" value="0.8">
                    </div>

                    <div class="control-row">
                        <label class="control-label">Animation Speed</label>
                        <input type="range" id="sun-speed" class="modern-range" min="0.5" max="5" step="0.5" value="2">
                        <span id="speed-display" class="control-value">2x</span>
                    </div>

                    <div class="action-grid">
                        <button id="sun-animate-btn" class="modern-btn primary">
                            <span class="material-icons">play_arrow</span> Animate Day
                        </button>
                        <button id="false-color-btn" class="modern-btn">
                            <span class="material-icons">palette</span> False Color
                        </button>
                    </div>
                </div>

                <div class="dashboard-card">
                    <div class="dashboard-section-title">
                        <span class="material-icons" style="font-size: 18px;">analytics</span>
                        Analysis Data
                    </div>
                    <div class="control-row">
                        <span class="control-label">Sun Altitude</span>
                        <span id="altitude-display" class="control-value">--</span>
                    </div>
                    <div class="control-row">
                        <span class="control-label">Sun Azimuth</span>
                        <span id="azimuth-display" class="control-value">--</span>
                    </div>
                </div>

                <div class="dashboard-card">
                    <div class="dashboard-section-title">
                        <span class="material-icons" style="font-size: 18px;">school</span>
                        Educational Context
                    </div>
                    <div class="info-box" style="margin-bottom: 1rem;">
                        <div class="info-title">Methodology</div>
                        <p class="info-text">
                            Renders accurate shadows using <strong>Three.js</strong> based on astronomical calculations for Gothenburg's latitude. 
                            Uses <strong>SSAO</strong> (Screen Space Ambient Occlusion) for depth perception.
                        </p>
                    </div>
                    <div class="info-box">
                        <div class="info-title">Application</div>
                        <p class="info-text">
                            Used by architects to optimize <strong>natural light</strong>, design energy-efficient buildings, 
                            and ensure public spaces receive adequate sunlight (solar access analysis).
                        </p>
                    </div>
                </div>
            </div>
        `;
        
        legendContent.innerHTML = `
            <div class="dashboard-card">
                <div class="dashboard-section-title">Legend</div>
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <div class="legend-item">
                        <div class="legend-color" style="background: rgba(0,0,0,0.5);"></div>
                        <span class="legend-label">Shadow Cast</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: linear-gradient(to right, blue, green, yellow, red);"></div>
                        <span class="legend-label">Solar Exposure (False Color)</span>
                    </div>
                </div>
            </div>
        `;

        // Attach event listeners for Sun Study controls
        const dateInput = document.getElementById('sun-date');
        const timeInput = document.getElementById('sun-time');
        const timeDisplay = document.getElementById('time-display');
        const opacityInput = document.getElementById('shadow-opacity');
        const animateBtn = document.getElementById('sun-animate-btn');
        const speedInput = document.getElementById('sun-speed');
        const speedDisplay = document.getElementById('speed-display');
        const falseColorBtn = document.getElementById('false-color-btn');

        const sendControl = (action, value) => {
            channel.postMessage({
                type: 'sun_control',
                action: action,
                value: value
            });
        };

        dateInput.addEventListener('change', (e) => sendControl('set_date', e.target.value));
        
        timeInput.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            const h = Math.floor(val);
            const m = Math.floor((val - h) * 60);
            timeDisplay.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            sendControl('set_time', val);
        });

        opacityInput.addEventListener('input', (e) => sendControl('set_opacity', e.target.value));
        
        animateBtn.addEventListener('click', () => {
            animateBtn.classList.toggle('active');
            const isActive = animateBtn.classList.contains('active');
            animateBtn.innerHTML = isActive 
                ? '<span class="material-icons">pause</span> Pause' 
                : '<span class="material-icons">play_arrow</span> Animate Day';
            sendControl('toggle_animation');
        });

        speedInput.addEventListener('input', (e) => {
            speedDisplay.textContent = e.target.value + 'x';
            sendControl('set_speed', e.target.value);
        });

        falseColorBtn.addEventListener('click', () => {
            falseColorBtn.classList.toggle('active');
            sendControl('toggle_false_color');
        });

    } else if (targetId === 'cfd-simulation-btn') {
        dashboardContent.innerHTML = `
            <div class="dashboard-container">
                <div class="dashboard-card">
                    <div class="dashboard-section-title">
                        <span class="material-icons" style="font-size: 18px;">tune</span>
                        Wind Controls
                    </div>
                    
                    <div class="control-row">
                        <label class="control-label">Wind Speed</label>
                        <input type="range" id="wind-speed" class="modern-range" min="1" max="20" step="0.5" value="5">
                        <span id="wind-speed-display" class="control-value">5.0 m/s</span>
                    </div>

                    <div class="control-row">
                        <label class="control-label">Direction</label>
                        <input type="range" id="wind-direction" class="modern-range" min="0" max="360" step="15" value="0">
                        <span id="wind-dir-display" class="control-value">0°</span>
                    </div>

                    <div class="control-row">
                        <label class="control-label">Particles</label>
                        <select id="particle-count" class="modern-date" style="width: 100px;">
                            <option value="300">Low</option>
                            <option value="800" selected>Medium</option>
                            <option value="1500">High</option>
                        </select>
                    </div>

                    <div class="control-row">
                        <label class="control-label">Particle Speed</label>
                        <input type="range" id="particle-speed" class="modern-range" min="2" max="40" step="2" value="20">
                        <span id="particle-speed-display" class="control-value">20x</span>
                    </div>

                    <div class="control-row">
                        <label class="control-label">Viscosity</label>
                        <input type="range" id="viscosity" class="modern-range" min="0" max="1" step="0.1" value="0.5">
                    </div>

                    <div class="control-row">
                        <label class="control-label">Grid Resolution</label>
                        <select id="grid-resolution" class="modern-date" style="width: 100px;">
                            <option value="100">100 (Fast)</option>
                            <option value="150">150</option>
                            <option value="200" selected>200 (Normal)</option>
                            <option value="250">250</option>
                            <option value="300">300 (High)</option>
                        </select>
                    </div>
                </div>

                <div class="dashboard-card">
                    <div class="dashboard-section-title">
                        <span class="material-icons" style="font-size: 18px;">school</span>
                        Educational Context
                    </div>
                    <div class="info-box" style="margin-bottom: 1rem; border-left-color: #10b981;">
                        <div class="info-title">Methodology</div>
                        <p class="info-text">
                            Uses the <strong>Lattice Boltzmann Method (LBM)</strong>, a powerful CFD technique that simulates fluid dynamics by tracking particle distributions on a grid (D2Q9 lattice). It solves the Navier-Stokes equations in real-time.
                        </p>
                    </div>
                    <div class="info-box" style="border-left-color: #10b981;">
                        <div class="info-title">Application</div>
                        <p class="info-text">
                            Essential for <strong>wind comfort analysis</strong> in urban design. Helps architects ensure pedestrian safety, plan natural ventilation corridors, and mitigate dangerous wind tunnel effects around tall buildings.
                        </p>
                    </div>
                </div>
            </div>
        `;
        
        legendContent.innerHTML = `
            <div class="dashboard-card">
                <div class="dashboard-section-title">Legend</div>
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    
                    <div>
                        <div class="legend-label" style="margin-bottom: 0.5rem;">Wind Velocity Scale</div>
                        <div style="height: 12px; background: linear-gradient(to right, #3b82f6, #10b981, #ef4444); border-radius: 6px; margin-bottom: 0.25rem;"></div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #6b7280;">
                            <span>0 m/s</span>
                            <span>Moderate</span>
                            <span>High</span>
                        </div>
                    </div>

                    <div class="legend-item">
                        <div class="legend-color" style="background: #1f2937;"></div>
                        <div>
                            <span class="legend-label">Building Obstacles</span>
                            <div style="font-size: 0.75rem; color: #6b7280;">Impermeable boundaries</div>
                        </div>
                    </div>

                    <div class="legend-item">
                        <div class="legend-color" style="background: rgba(255,255,255,0.5); border: 1px dashed #9ca3af;"></div>
                        <div>
                            <span class="legend-label">Airflow Particles</span>
                            <div style="font-size: 0.75rem; color: #6b7280;">Tracers visualizing flow path</div>
                        </div>
                    </div>

                    <div style="border-top: 1px solid #e5e7eb; padding-top: 0.5rem; margin-top: 0.5rem;">
                        <div style="font-size: 0.8rem; color: #6b7280; display: flex; justify-content: space-between;">
                            <span>Domain Width:</span>
                            <span style="font-family: monospace;">~500m</span>
                        </div>
                        <div style="font-size: 0.8rem; color: #6b7280; display: flex; justify-content: space-between;">
                            <span>Simulation Method:</span>
                            <span style="font-family: monospace;">LBM D2Q9</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Attach event listeners
        const windSpeed = document.getElementById('wind-speed');
        const windSpeedDisplay = document.getElementById('wind-speed-display');
        const windDir = document.getElementById('wind-direction');
        const windDirDisplay = document.getElementById('wind-dir-display');
        const particleCount = document.getElementById('particle-count');
        const particleSpeed = document.getElementById('particle-speed');
        const particleSpeedDisplay = document.getElementById('particle-speed-display');
        const viscosity = document.getElementById('viscosity');
        const gridResolution = document.getElementById('grid-resolution');

        const sendCfdControl = (action, value) => {
            channel.postMessage({
                type: 'cfd_control',
                action: action,
                value: value
            });
        };

        windSpeed.addEventListener('input', (e) => {
            windSpeedDisplay.textContent = parseFloat(e.target.value).toFixed(1) + ' m/s';
            sendCfdControl('set_wind_speed', e.target.value);
        });

        windDir.addEventListener('input', (e) => {
            windDirDisplay.textContent = e.target.value + '°';
            sendCfdControl('set_wind_direction', e.target.value);
        });

        particleCount.addEventListener('change', (e) => {
            sendCfdControl('set_particles', e.target.value);
        });

        particleSpeed.addEventListener('input', (e) => {
            particleSpeedDisplay.textContent = e.target.value + 'x';
            sendCfdControl('set_particle_speed', e.target.value);
        });

        viscosity.addEventListener('input', (e) => {
            sendCfdControl('set_viscosity', e.target.value);
        });

        gridResolution.addEventListener('change', (e) => {
            sendCfdControl('set_resolution', e.target.value);
        });

    } else if (targetId === 'isovist-btn') {
        dashboardContent.innerHTML = `
            <div class="dashboard-container">
                <div class="dashboard-card">
                    <div class="dashboard-section-title">
                        <span class="material-icons" style="font-size: 18px;">visibility</span>
                        Isovist Controls
                    </div>
                    
                    <div class="control-row">
                        <label class="control-label">View Radius</label>
                        <input type="range" id="isovist-radius" class="modern-range" min="50" max="500" step="10" value="200">
                        <span id="radius-display" class="control-value">200m</span>
                    </div>

                    <div class="control-row">
                        <label class="control-label">Field of View</label>
                        <input type="range" id="isovist-fov" class="modern-range" min="30" max="180" step="5" value="120">
                        <span id="fov-display" class="control-value">120°</span>
                    </div>

                    <div class="action-grid">
                        <button id="toggle-360-btn" class="modern-btn">
                            <span class="material-icons">360</span> Toggle 360°
                        </button>
                        <button id="toggle-follow-btn" class="modern-btn active">
                            <span class="material-icons">mouse</span> Follow Cursor
                        </button>
                    </div>
                </div>

                <div class="dashboard-card">
                    <div class="dashboard-section-title">
                        <span class="material-icons" style="font-size: 18px;">school</span>
                        Educational Context
                    </div>
                    <div class="info-box" style="margin-bottom: 1rem; border-left-color: #eab308;">
                        <div class="info-title">Methodology</div>
                        <p class="info-text">
                            Calculates a <strong>visibility polygon</strong> (isovist) from a specific point by casting rays in all directions until they hit an obstacle (building). 
                            Simulates human visual perception in urban space.
                        </p>
                    </div>
                    <div class="info-box" style="border-left-color: #eab308;">
                        <div class="info-title">Application</div>
                        <p class="info-text">
                            Used in <strong>urban design</strong> and <strong>criminology</strong> (CPTED) to analyze surveillance, openness, and spatial connectivity. 
                            Helps identify "dead spaces" with poor visibility or maximize scenic views.
                        </p>
                    </div>
                </div>
            </div>
        `;
        
        legendContent.innerHTML = `
            <div class="dashboard-card">
                <div class="dashboard-section-title">Legend</div>
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <div class="legend-item">
                        <div class="legend-color" style="background: rgba(255, 255, 0, 0.3); border: 1px solid #eab308;"></div>
                        <span class="legend-label">Visible Area</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="width: 12px; height: 12px; border-radius: 50%; background: #ff0000; border: 2px solid white; margin: 6px;"></div>
                        <span class="legend-label">Viewer Position</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="height: 3px; background: #ff0000; margin: 10px 0;"></div>
                        <span class="legend-label">View Direction</span>
                    </div>
                </div>
            </div>
        `;

        // Attach event listeners
        const radiusInput = document.getElementById('isovist-radius');
        const radiusDisplay = document.getElementById('radius-display');
        const fovInput = document.getElementById('isovist-fov');
        const fovDisplay = document.getElementById('fov-display');
        const toggle360Btn = document.getElementById('toggle-360-btn');
        const toggleFollowBtn = document.getElementById('toggle-follow-btn');

        const sendIsovistControl = (action, value) => {
            channel.postMessage({
                type: 'isovist_control',
                action: action,
                value: value
            });
        };

        radiusInput.addEventListener('input', (e) => {
            radiusDisplay.textContent = e.target.value + 'm';
            sendIsovistControl('set_radius', e.target.value);
        });

        fovInput.addEventListener('input', (e) => {
            fovDisplay.textContent = e.target.value + '°';
            sendIsovistControl('set_fov', e.target.value);
        });

        toggle360Btn.addEventListener('click', () => {
            toggle360Btn.classList.toggle('active');
            sendIsovistControl('toggle_360');
            // Disable FOV slider if 360 is active
            if (toggle360Btn.classList.contains('active')) {
                fovInput.disabled = true;
                fovInput.parentElement.style.opacity = '0.5';
            } else {
                fovInput.disabled = false;
                fovInput.parentElement.style.opacity = '1';
            }
        });

        toggleFollowBtn.addEventListener('click', () => {
            toggleFollowBtn.classList.toggle('active');
            sendIsovistControl('toggle_follow');
        });

    } else if (targetId === 'grid-animation-btn') {
        dashboardContent.innerHTML = `
            <div class="dashboard-container">
                <div class="dashboard-card">
                    <div class="dashboard-section-title">
                        <span class="material-icons" style="font-size: 18px;">info</span>
                        System Info
                    </div>
                    <div class="info-box" style="margin-bottom: 1rem; border-left-color: #00ffff;">
                        <div class="info-title">Physical Digital Twin</div>
                        <p class="info-text">
                            This grid projection aligns perfectly with the <strong>physical 3D printed tiles</strong> on the table. 
                            It serves as a calibration layer to ensure the digital projection matches the physical model boundaries.
                        </p>
                    </div>
                    <div class="info-box" style="border-left-color: #00ffff;">
                        <div class="info-title">Grid Structure</div>
                        <p class="info-text">
                            The table is divided into a <strong>5x3 grid</strong> of 20x20cm tiles. 
                            Each cell represents a modular section of the city model, allowing for swappable districts.
                        </p>
                    </div>
                </div>
            </div>
        `;
        
        legendContent.innerHTML = `
            <div class="dashboard-card">
                <div class="dashboard-section-title">Legend</div>
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <div class="legend-item">
                        <div class="legend-color" style="border: 2px solid #00ffff; background: rgba(0, 255, 255, 0.1);"></div>
                        <span class="legend-label">Tile Boundary</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="width: 12px; height: 12px; border-radius: 50%; background: #00ffff; box-shadow: 0 0 5px #00ffff; margin: 6px;"></div>
                        <span class="legend-label">Calibration Node</span>
                    </div>
                </div>
            </div>
        `;

    } else if (targetId === 'bird-sounds-btn') {
        dashboardContent.innerHTML = `
            <div class="dashboard-container">
                <div class="dashboard-card">
                    <div class="dashboard-section-title">
                        <span class="material-icons" style="font-size: 18px;">volume_up</span>
                        Audio Controls
                    </div>
                    
                    <div class="control-row">
                        <label class="control-label">Master Volume</label>
                        <input type="range" id="bird-volume" class="modern-range" min="0" max="1" step="0.1" value="0.5">
                    </div>

                    <div class="action-grid">
                        <button id="stop-sounds-btn" class="modern-btn">
                            <span class="material-icons">stop</span> Stop All
                        </button>
                    </div>
                </div>

                <div class="dashboard-card">
                    <div class="dashboard-section-title">
                        <span class="material-icons" style="font-size: 18px;">school</span>
                        Educational Context
                    </div>
                    <div class="info-box" style="margin-bottom: 1rem; border-left-color: #84cc16;">
                        <div class="info-title">Methodology</div>
                        <p class="info-text">
                            Visualizes and spatializes bird calls based on <strong>simulated sensor data</strong>. 
                            Different species are mapped to specific habitats within the district.
                        </p>
                    </div>
                    <div class="info-box" style="border-left-color: #84cc16;">
                        <div class="info-title">Application</div>
                        <p class="info-text">
                            Used for <strong>biodiversity monitoring</strong> and assessing the quality of urban green spaces. 
                            Soundscapes are a key indicator of ecosystem health in cities.
                        </p>
                    </div>
                </div>
            </div>
        `;
        
        legendContent.innerHTML = `
            <div class="dashboard-card">
                <div class="dashboard-section-title">Legend</div>
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <div class="legend-item">
                        <div class="legend-color" style="background: #FFD700; border-radius: 50%;"></div>
                        <span class="legend-label">Thrush Nightingale</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #00BFFF; border-radius: 50%;"></div>
                        <span class="legend-label">European Pied Flycatcher</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color" style="background: #FF4500; border-radius: 50%;"></div>
                        <span class="legend-label">Black Redstart</span>
                    </div>
                     <div class="legend-item">
                        <div class="legend-color" style="border: 2px solid #666; background: transparent; border-radius: 50%;"></div>
                        <span class="legend-label">Audio Sensor</span>
                    </div>
                </div>
            </div>
        `;
        
        // Attach event listeners
        const volumeInput = document.getElementById('bird-volume');
        const stopBtn = document.getElementById('stop-sounds-btn');

        const sendBirdControl = (action, value) => {
            channel.postMessage({
                type: 'bird_control',
                action: action,
                value: value
            });
        };

        if (volumeInput) {
            volumeInput.addEventListener('input', (e) => {
                sendBirdControl('set_volume', e.target.value);
            });
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                sendBirdControl('stop_all');
            });
        }

    } else {
        // Default or other tools
        dashboardContent.innerHTML = '<p>Select a simulation to view details.</p>';
        legendContent.innerHTML = '<p>Select a simulation to view its legend.</p>';
    }
}

document.getElementById('reset-view-btn').addEventListener('click', () => {
    stopTour();
    channel.postMessage({
        type: 'reset_view'
    });
});

document.getElementById('fullscreen-btn').addEventListener('click', () => {
    stopTour();
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        document.exitFullscreen();
    }
});

// Listen for updates from the main window
channel.onmessage = (event) => {
    const data = event.data;
    if (data.type === 'state_update') {
        // Update controller UI based on main window state
        console.log('Received state update:', data);
        if (data.activeLayer) {
             document.querySelectorAll('.control-btn').forEach(b => {
                 if (b.dataset.target === data.activeLayer) {
                     b.classList.add('active');
                     updateMetadata(data.activeLayer);
                     updateDashboard(data.activeLayer);
                 } else {
                     b.classList.remove('active');
                 }
             });
        }
    } else if (data.type === 'bird_status') {
        updateBirdDashboard(data.activeBirds);
    } else if (data.type === 'sun_position') {
        const altDisplay = document.getElementById('altitude-display');
        const azDisplay = document.getElementById('azimuth-display');
        // Only update if elements exist (i.e., Sun Study dashboard is active)
        if (altDisplay) altDisplay.textContent = data.altitude.toFixed(1);
        if (azDisplay) azDisplay.textContent = data.azimuth.toFixed(1);
    } else if (data.type === 'sun_time_update') {
        const timeSlider = document.getElementById('sun-time');
        const timeDisplay = document.getElementById('time-display');
        if (timeSlider && timeDisplay) {
            // Only update if not currently being dragged (optional check, but good for UX)
            // For simplicity, we'll just update it, which might fight the user if they drag while animating
            // But usually animation is paused when dragging manually
            timeSlider.value = data.time;
            const h = Math.floor(data.time);
            const m = Math.floor((data.time - h) * 60);
            timeDisplay.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        }
    }
};

function updateBirdDashboard(activeBirds) {
    const dashboardContent = document.getElementById('dashboard-content');
    // Only update if Bird Sounds is the active layer (checked via button state)
    const birdBtn = document.querySelector('.control-btn[data-target="bird-sounds-btn"]');
    if (!birdBtn || !birdBtn.classList.contains('active')) return;

    if (!activeBirds || activeBirds.length === 0) {
        dashboardContent.innerHTML = '<p>Listening for bird calls...</p>';
        return;
    }

    let html = `
        <style>
            .bird-card {
                background: #fff;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                margin-bottom: 10px;
                border-left: 4px solid transparent;
                display: flex;
                height: 80px;
            }
            .bird-image-container {
                width: 80px;
                height: 80px;
                flex-shrink: 0;
            }
            .bird-image {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .bird-info {
                padding: 8px 12px;
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                justify-content: center;
                overflow: hidden;
            }
            .bird-name {
                font-weight: bold;
                font-size: 0.95rem;
                margin-bottom: 4px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .sensor-info {
                font-size: 0.75rem;
                color: #888;
                display: flex;
                align-items: center;
                gap: 4px;
                margin-bottom: 4px;
            }
            
            /* CSS Waveform Animation */
            .waveform-visualizer {
                display: flex;
                align-items: flex-end;
                gap: 2px;
                height: 24px;
                margin-top: auto;
            }
            .wave-bar {
                width: 4px;
                background-color: #ccc;
                animation: wave 1s ease-in-out infinite;
                border-radius: 2px;
            }
            @keyframes wave {
                0%, 100% { height: 20%; }
                50% { height: 100%; }
            }
        </style>
        <div style="display: flex; flex-direction: column;">
    `;

    activeBirds.forEach(item => {
        // Generate random animation delays for a more organic look
        const bars = Array.from({length: 15}, (_, i) => {
            const delay = Math.random() * 1;
            return `<div class="wave-bar" style="background-color: ${item.bird.color}; animation-delay: -${delay}s;"></div>`;
        }).join('');

        html += `
            <div class="bird-card" style="border-left-color: ${item.bird.color};">
                <div class="bird-image-container">
                    <img src="${item.bird.image}" alt="${item.bird.name}" class="bird-image">
                </div>
                <div class="bird-info">
                    <div class="bird-name" style="color: ${item.bird.color};">${item.bird.name}</div>
                    <div class="sensor-info">
                        <span class="material-icons" style="font-size: 12px;">sensors</span>
                        Sensor #${item.sensor.id}
                    </div>
                    <div class="waveform-visualizer">
                        ${bars}
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';
    dashboardContent.innerHTML = html;
}

function updateMetadata(layerId) {
    welcomeScreen.classList.add('hidden');
    const metaLayer = document.getElementById('meta-layer');
    const metaDesc = document.getElementById('meta-desc');
    const legendContent = document.getElementById('legend-content');
    
    let name = 'None';
    let desc = 'Interactive map of the district. Use controls to toggle layers.';
    let legend = '<p>Select a simulation to view its legend.</p>';

    switch(layerId) {
        case 'cfd-simulation-btn':
            name = 'CFD Wind Simulation';
            desc = 'Computational Fluid Dynamics simulation showing wind flow patterns around buildings. Colors indicate wind speed.';
            legend = `
                <div style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">
                    <div style="width: 20px; height: 100px; background: linear-gradient(to top, blue, green, yellow, red);"></div>
                    <div style="display: flex; flex-direction: column; justify-content: space-between; height: 100px;">
                        <span>High Speed (> 10 m/s)</span>
                        <span>Medium Speed (5 m/s)</span>
                        <span>Low Speed (< 1 m/s)</span>
                    </div>
                </div>
            `;
            break;
        case 'bird-sounds-btn':
            name = 'Bird Sounds';
            desc = 'Simulated bird sensors detecting local species. Visualizes sound intensity at sensor locations.';
            legend = `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="width: 12px; height: 12px; border-radius: 50%; background: #FFD700;"></span>
                            <span style="font-weight: bold;">Thrush Nightingale</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #666; margin-left: 22px;">
                            Known for its powerful and melodic song, often heard at night.
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="width: 12px; height: 12px; border-radius: 50%; background: #00BFFF;"></span>
                            <span style="font-weight: bold;">European Pied Flycatcher</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #666; margin-left: 22px;">
                            A small passerine bird with a rhythmic, repetitive song.
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="width: 12px; height: 12px; border-radius: 50%; background: #FF4500;"></span>
                            <span style="font-weight: bold;">Black Redstart</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #666; margin-left: 22px;">
                            Adapts well to urban environments, known for its warbling tail.
                        </div>
                    </div>
                </div>
            `;
            break;
        case 'stormwater-btn':
            name = 'Stormwater Flow';
            desc = 'Simulation of water accumulation and flow during heavy rainfall events. Highlights potential flood risk areas.';
            legend = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="width: 15px; height: 15px; background: #0000ff; display: inline-block;"></span> Water Accumulation
                </div>
            `;
            break;
        case 'sun-study-btn':
            name = 'Sun Study';
            desc = 'Shadow analysis showing sunlight exposure at different times of day/year.';
            legend = '<p>Shadows cast by buildings based on solar position.</p>';
            break;
        case 'slideshow-btn':
            name = 'Slideshow';
            desc = 'Cycling through various data visualizations and views of the project.';
            legend = '<p>Displaying project slides.</p>';
            break;
        case 'grid-animation-btn':
            name = 'Grid Animation';
            desc = 'Animated grid overlay effect.';
            legend = '<p>Grid overlay active.</p>';
            break;
        case 'isovist-btn':
            name = 'Interactive Isovist';
            desc = 'Visual field analysis from a specific point. Shows what is visible from the selected location.';
            legend = '<p>Click on map to set view point.</p>';
            break;
    }

    metaLayer.textContent = name;
    metaDesc.textContent = desc;
    legendContent.innerHTML = legend;
}

// --- Tour Logic ---

const tourSteps = [
    { selector: '[data-target="cfd-simulation-btn"]', title: 'CFD Wind Simulation', desc: 'Visualize wind flow patterns and speeds around buildings.' },
    { selector: '[data-target="stormwater-btn"]', title: 'Stormwater Flow', desc: 'Simulate water accumulation and flood risks during heavy rain.' },
    { selector: '[data-target="sun-study-btn"]', title: 'Sun Study', desc: 'Analyze sunlight exposure and shadows throughout the day.' },
    { selector: '[data-target="slideshow-btn"]', title: 'Slideshow', desc: 'Cycle through curated project views and visualizations.' },
    { selector: '[data-target="grid-animation-btn"]', title: 'Grid Animation', desc: 'Toggle the animated grid overlay for spatial reference.' },
    { selector: '[data-target="isovist-btn"]', title: 'Interactive Isovist', desc: 'Analyze visibility fields from specific vantage points.' },
    { selector: '#reset-view-btn', title: 'Reset View', desc: 'Return the map to the default starting position.' },
    { selector: '#fullscreen-btn', title: 'Full Screen', desc: 'Toggle full screen mode for this controller.' },
    { selector: '[data-target="bird-sounds-btn"]', title: 'Bird Sounds', desc: 'Listen to simulated bird sensors and view real-time activity.' }
];

let tourInterval;
let currentStep = 0;
const tourInfo = document.getElementById('tour-info');
const tourTitle = document.getElementById('tour-title');
const tourDesc = document.getElementById('tour-desc');

function startTour() {
    if (tourInterval) clearInterval(tourInterval);
    currentStep = 0;
    tourInfo.classList.add('active');
    showTourStep();
    tourInterval = setInterval(nextTourStep, 4000); // 4 seconds per step
}

function nextTourStep() {
    currentStep = (currentStep + 1) % tourSteps.length;
    showTourStep();
}

function showTourStep() {
    // Remove highlight from all
    document.querySelectorAll('.control-btn').forEach(b => b.classList.remove('tour-highlight'));
    
    const step = tourSteps[currentStep];
    const btn = document.querySelector(step.selector);
    if (btn) btn.classList.add('tour-highlight');
    
    // Update text with fade effect
    tourInfo.style.opacity = 0;
    setTimeout(() => {
        tourTitle.textContent = step.title;
        tourDesc.textContent = step.desc;
        tourInfo.style.opacity = 1;
    }, 300);

    // Set background effect
    if (step.selector.includes('cfd')) setEffect('wind');
    else if (step.selector.includes('stormwater')) setEffect('rain');
    else if (step.selector.includes('sun')) setEffect('sun');
    else if (step.selector.includes('isovist')) setEffect('isovist');
    else if (step.selector.includes('grid')) setEffect('grid');
    else if (step.selector.includes('slideshow')) setEffect('slideshow');
    else if (step.selector.includes('bird-sounds')) setEffect('soundwaves');
    else setEffect('default');
}

function stopTour() {
    if (tourInterval) {
        clearInterval(tourInterval);
        tourInterval = null;
    }
    document.querySelectorAll('.control-btn').forEach(b => b.classList.remove('tour-highlight'));
    tourInfo.classList.remove('active');
    setEffect('default'); // Stop effects
}

// Start tour initially
// startTour(); // Moved to end of file to ensure all functions are defined

// --- Background Animation Logic ---

const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let animationId;
let particles = [];
let currentEffect = 'default';

function resizeCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function initParticles(effect) {
    particles = [];
    
    if (effect === 'sun') {
        // Single sun object
        particles.push({
            angle: Math.PI, // Start at left (sunrise)
            radius: 60,
            speed: 0.005
        });
        return;
    }

    const count = 100;
    for (let i = 0; i < count; i++) {
        particles.push(createParticle(effect));
    }
}

function createParticle(effect) {
    const w = canvas.width;
    const h = canvas.height;
    
    if (effect === 'wind') {
        return {
            x: Math.random() * w,
            y: Math.random() * h,
            speed: Math.random() * 15 + 5, // Faster
            length: Math.random() * 100 + 50, // Longer
            width: Math.random() * 2 + 1, // Thicker
            opacity: Math.random() * 0.6 + 0.2
        };
    } else if (effect === 'rain') {
        return {
            x: Math.random() * w,
            y: Math.random() * h,
            speed: Math.random() * 15 + 10, // Faster
            length: Math.random() * 30 + 15, // Longer
            width: Math.random() * 2 + 1, // Thicker
            opacity: Math.random() * 0.6 + 0.2
        };
    } else if (effect === 'isovist') {
        // Points moving around
        return {
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            radius: Math.random() * 3 + 1,
            opacity: Math.random() * 0.5
        };
    } else if (effect === 'grid') {
        // Grid lines
        return {
            x: Math.random() * w,
            y: Math.random() * h,
            size: Math.random() * 50 + 20,
            opacity: 0,
            targetOpacity: Math.random() * 0.3,
            life: 0
        };
    } else if (effect === 'slideshow') {
        // Floating squares
        return {
            x: Math.random() * w,
            y: Math.random() * h,
            size: Math.random() * 40 + 10,
            vx: (Math.random() - 0.5) * 1,
            vy: (Math.random() - 0.5) * 1,
            opacity: Math.random() * 0.3
        };
    } else if (effect === 'soundwaves') {
        // Floating sine waves
        return {
            x: Math.random() * w,
            y: Math.random() * h,
            width: Math.random() * 100 + 50,
            amplitude: Math.random() * 20 + 5,
            frequency: Math.random() * 0.1 + 0.02,
            speed: Math.random() * 2 + 0.5,
            phase: Math.random() * Math.PI * 2,
            opacity: Math.random() * 0.5 + 0.2
        };
    }
    
    return {};
}

function updateParticles() {
    const w = canvas.width;
    const h = canvas.height;
    
    particles.forEach(p => {
        if (currentEffect === 'wind') {
            p.x += p.speed;
            if (p.x > w) p.x = -p.length;
        } else if (currentEffect === 'rain') {
            p.y += p.speed;
            p.x += 1; // Slight wind
            if (p.y > h) {
                p.y = -p.length;
                p.x = Math.random() * w;
            }
        } else if (currentEffect === 'sun') {
            p.angle += p.speed;
            if (p.angle > 2 * Math.PI) p.angle = Math.PI; // Loop back to sunrise
        } else if (currentEffect === 'isovist') {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0 || p.x > w) p.vx *= -1;
            if (p.y < 0 || p.y > h) p.vy *= -1;
        } else if (currentEffect === 'grid') {
            p.life++;
            if (p.life < 50) p.opacity += 0.01;
            else if (p.life > 100) p.opacity -= 0.01;
            
            if (p.life > 150) {
                p.life = 0;
                p.x = Math.random() * w;
                p.y = Math.random() * h;
                p.opacity = 0;
            }
        } else if (currentEffect === 'slideshow') {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0 || p.x > w) p.vx *= -1;
            if (p.y < 0 || p.y > h) p.vy *= -1;
        } else if (currentEffect === 'soundwaves') {
            p.x += p.speed;
            p.phase += 0.1;
            if (p.x > w) p.x = -p.width;
        }
    });
}

function drawParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (currentEffect === 'wind') {
        ctx.strokeStyle = 'rgba(30, 144, 255, 0.8)'; // Brighter blue
        particles.forEach(p => {
            ctx.lineWidth = p.width;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + p.length, p.y);
            ctx.globalAlpha = p.opacity;
            ctx.stroke();
        });
    } else if (currentEffect === 'rain') {
        ctx.strokeStyle = 'rgba(0, 0, 200, 0.8)'; // Darker, visible blue
        particles.forEach(p => {
            ctx.lineWidth = p.width;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + 2, p.y + p.length);
            ctx.globalAlpha = p.opacity;
            ctx.stroke();
        });
    } else if (currentEffect === 'sun') {
        const sun = particles[0];
        const cx = canvas.width / 2;
        const cy = canvas.height * 0.8; // Horizon line lower down
        const radius = Math.min(canvas.width, canvas.height) * 0.4; // Path radius
        
        // Calculate sun position
        const sunX = cx + Math.cos(sun.angle) * radius;
        const sunY = cy + Math.sin(sun.angle) * radius;
        
        // Sky gradient based on sun height (angle)
        // Angle goes from PI (left) to 2PI (right)
        // Noon is at 1.5 PI
        const progress = (sun.angle - Math.PI) / Math.PI; // 0 to 1
        let skyColor1, skyColor2;
        
        if (progress < 0.5) {
            // Sunrise to Noon
            // Orange/Red -> Blue
            const t = progress * 2;
            skyColor1 = `rgba(${255 * (1-t)}, ${100 + 155 * t}, ${255 * t}, 0.3)`;
        } else {
            // Noon to Sunset
            // Blue -> Orange/Red
            const t = (progress - 0.5) * 2;
            skyColor1 = `rgba(${255 * t}, ${255 * (1-t)}, ${255 * (1-t)}, 0.3)`;
        }
        
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, skyColor1);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw Sun
        ctx.fillStyle = 'rgba(255, 200, 0, 0.9)';
        ctx.shadowBlur = 20;
        ctx.shadowColor = 'orange';
        ctx.beginPath();
        ctx.arc(sunX, sunY, sun.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
    } else if (currentEffect === 'isovist') {
        ctx.fillStyle = 'rgba(255, 69, 0, 0.6)';
        particles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.globalAlpha = p.opacity;
            ctx.fill();
            
            // "Vision" cone
            ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + 50, p.y - 20);
            ctx.lineTo(p.x + 50, p.y + 20);
            ctx.closePath();
            ctx.fill();
        });
    } else if (currentEffect === 'grid') {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        particles.forEach(p => {
            ctx.globalAlpha = p.opacity;
            ctx.strokeRect(p.x, p.y, p.size, p.size);
        });
    } else if (currentEffect === 'slideshow') {
        ctx.fillStyle = 'rgba(70, 130, 180, 0.4)';
        particles.forEach(p => {
            ctx.globalAlpha = p.opacity;
            ctx.fillRect(p.x, p.y, p.size, p.size * 0.6); // Aspect ratio like a slide
        });
    } else if (currentEffect === 'soundwaves') {
        ctx.strokeStyle = 'rgba(255, 20, 147, 0.6)'; // Deep pink
        particles.forEach(p => {
            ctx.beginPath();
            ctx.globalAlpha = p.opacity;
            for (let i = 0; i < p.width; i++) {
                const y = p.y + Math.sin(i * p.frequency + p.phase) * p.amplitude;
                if (i === 0) ctx.moveTo(p.x + i, y);
                else ctx.lineTo(p.x + i, y);
            }
            ctx.stroke();
        });
    }
    
    ctx.globalAlpha = 1;
}

function animate() {
    updateParticles();
    drawParticles();
    animationId = requestAnimationFrame(animate);
}

function setEffect(effectName) {
    if (currentEffect !== effectName) {
        currentEffect = effectName;
        initParticles(effectName);
    }
}

// Start animation loop
animate();

// Start tour initially (now that everything is defined)
startTour();
