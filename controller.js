// CFD controls reflect the display's authoritative state whenever this panel opens.
let cfdState = { ...CFD.DEFAULTS };
function renderCfdState() {
    const ids = { 'wind-visual-style': cfdState.visualStyle, 'wind-palette': cfdState.palette,
        'wind-color-range': cfdState.colorMaxMps, 'wind-speed': cfdState.windSpeed, 'wind-direction': cfdState.angle,
        'particle-count': cfdState.particles, 'particle-speed': cfdState.playback,
        'viscosity': (cfdState.viscosity - .02) / .13, 'grid-resolution': cfdState.resolution };
    for (const [id, value] of Object.entries(ids)) {
        const input = document.getElementById(id);
        if (input) input.value = value;
    }
    const labels = { 'wind-speed-display': `${cfdState.windSpeed.toFixed(1)} m/s`,
        'wind-dir-display': `${cfdState.angle}° ${['→','↘','↓','↙','←','↖','↑','↗'][Math.round(cfdState.angle / 45) % 8]}`,
        'particle-speed-display': `${cfdState.playback}x`, 'trees-status': cfdState.trees ? 'On' : 'Off' };
    for (const [id, value] of Object.entries(labels)) {
        const label = document.getElementById(id);
        if (label) label.textContent = value;
    }
    const facadeToggle = document.getElementById('wind-facade-glow');
    if (facadeToggle) facadeToggle.checked = cfdState.facadeGlow;
    const facadeLegend = document.getElementById('wind-impact-swatch');
    if (facadeLegend) {
        const color = cfdState.palette === 'monochrome' ? '#f5f5f5' : '#ffd58c';
        facadeLegend.style.background = color;
        facadeLegend.style.boxShadow = `0 0 8px ${color}`;
    }
    const description = document.getElementById('wind-style-description');
    if (description) description.textContent = CFDVisuals.STYLES[cfdState.visualStyle] || CFDVisuals.STYLES.ribbons;
    const legend = CFD.colorLegend(cfdState.palette, cfdState.colorMaxMps);
    for (const id of ['wind-color-preview', 'wind-color-legend']) {
        const element = document.getElementById(id);
        if (element) element.style.background = legend.gradient;
    }
    legend.labels.forEach((text, i) => {
        for (const prefix of ['wind-range-label-', 'wind-preview-label-']) {
            const element = document.getElementById(prefix + i);
            if (element) element.textContent = text;
        }
    });
    const trees = document.getElementById('toggle-trees-btn');
    if (trees) {
        trees.dataset.enabled = String(cfdState.trees);
        trees.style.background = cfdState.trees ? '#2D5A27' : '#333';
        trees.style.borderColor = cfdState.trees ? '#4a9441' : '#555';
    }
}

// Controller logic for the secondary screen
// ============================================

// Message type constants - keep in sync with main.js and animation modules
const MSG_TYPES = {
    // Outgoing (controller -> main)
    CONTROL_ACTION: 'control_action',
    RESET_VIEW: 'reset_view',
    CALIBRATE_ACTION: 'calibrate_action',
    SUN_CONTROL: 'sun_control',
    CFD_CONTROL: 'cfd_control',
    ISOVIST_CONTROL: 'isovist_control',
    BIRD_CONTROL: 'bird_control',
    SLIDESHOW_CONTROL: 'slideshow_control',
    FCC_DEMO_CONTROL: 'fcc_demo_control',
    // Incoming (main -> controller)
    STATE_UPDATE: 'state_update',
    ANIMATION_STATE: 'animation_state',  // New: animation on/off state
    SLIDESHOW_UPDATE: 'slideshow_update',
    SLIDESHOW_LEGEND_HIGHLIGHT: 'slideshow_legend_highlight',
    BIRD_STATUS: 'bird_status',
    SUN_POSITION: 'sun_position',
    SUN_TIME_UPDATE: 'sun_time_update',
    CALIBRATION_DATA: 'calibration_data',
    FCC_DEMO_PROGRESS: 'fcc_demo_progress',
    FCC_DEMO_READY: 'fcc_demo_ready',
    FCC_DEMO_STATS: 'fcc_demo_stats',
    FCC_DEMO_PLAYBACK_STATE: 'fcc_demo_playback_state',
    EPC_BUILDING_SELECTED: 'epc_building_selected'
};

// Debug mode - set to false in production
const DEBUG_MODE = false;
function debugLog(...args) {
    if (DEBUG_MODE) console.log('[Controller]', ...args);
}

const channel = new BroadcastChannel('map_controller_channel');
const statusIndicator = document.getElementById('connection-status');
const statusText = document.getElementById('connection-text');
const welcomeScreen = document.getElementById('welcome-screen');


// State objects loaded from their respective module files:
// - slideshowState from controller/slideshow-dashboard.js
// - fccDemoState from controller/fcc-demo-dashboard.js
// - sunStudyState from controller/sun-study-ui.js

let thermalComfortState = { hour: 14, meanPet: null, active: false, ready: false, showRaster: true, showStreets: true, route: null };



// Sun Study UI loaded from controller/sun-study-ui.js
// Exposes globals: sunStudyState, setSunStudyLayout, updateSunStudySky, etc.


// Animation layer tracking - tracks active animations and their order
// Animation buttons are buttons that toggle visualizations on/off
const ANIMATION_BUTTONS = [
    'cfd-simulation-btn',
    'stormwater-btn', 
    'thermal-comfort-btn',
    'sun-study-btn',
    'slideshow-btn',
    'grid-animation-btn',
    'isovist-btn',
    'bird-sounds-btn',
    'campus-demo-btn',
    'fcc-demo-btn',
    'street-view-btn',
    'epc-btn',
    'ecom-energy-btn'
];

// Function buttons are buttons that perform actions (not toggleable animations)
const FUNCTION_BUTTONS = [
    'reset-view-btn',
    'fullscreen-btn',
    'calibrate-btn',
    'credits-btn'
];

// Track active animations in order they were activated
let activeAnimations = [];

function isAnimationButton(targetId) {
    return ANIMATION_BUTTONS.includes(targetId);
}

// Called when we receive actual state from the main window
function setAnimationState(targetId, isActive, follow = true) {
    const newlyActive = isActive && !activeAnimations.includes(targetId);
    if (isActive) {
        if (!activeAnimations.includes(targetId)) {
            activeAnimations.push(targetId);
        }
    } else {
        activeAnimations = activeAnimations.filter(id => id !== targetId);
        if (targetId === 'sun-study-btn') {
            setSunStudyLayout(false);
        }
        // Reset campus demo legend when it's deactivated
        if (targetId === 'campus-demo-btn') {
            resetCampusDemoLegend();
        }
        if (targetId === 'epc-btn') {
            epcState.selected = null;
            if (document.getElementById('main-panel')?.classList.contains('epc-mode')) {
                renderEpcBuildingDashboard(null);
            }
        }
    }
    syncAnimationButtonStates();
    const toggle = document.querySelector(`[data-layer-switch="${targetId}"]`);
    if (toggle) toggle.checked = isActive;
    if (follow && newlyActive && !new URLSearchParams(location.search).has('sessionController')) openHostLayer(targetId);
}

function syncAnimationButtonStates() {
    // Remove all existing badges first
    document.querySelectorAll('.animation-order-badge').forEach(badge => badge.remove());
    
    // Update each animation button's active state and badge
    ANIMATION_BUTTONS.forEach(targetId => {
        const btn = document.querySelector(`[data-target="${targetId}"]`);
        if (!btn) return;
        
        const isActive = activeAnimations.includes(targetId);
        const orderIndex = activeAnimations.indexOf(targetId);
        
        // Set or remove active class based on tracking
        if (isActive) {
            btn.classList.add('active');
            
            // Only show order badge if multiple animations are active
            if (activeAnimations.length > 1) {
                const badge = document.createElement('span');
                badge.className = 'animation-order-badge';
                badge.textContent = orderIndex + 1;
                btn.appendChild(badge);
            }
        } else {
            btn.classList.remove('active');
        }
    });
}

// Update connection status
// Since BroadcastChannel doesn't have a direct "connected" event for peers, 
// we'll assume connected if we can send, but we can implement a ping/pong if needed.
// For now, we'll just show it as active.
statusIndicator.classList.add('connected');
statusText.textContent = 'Connected';

// Function to show welcome screen
function showWelcome() {
    welcomeScreen.classList.remove('hidden');
    // Home changes navigation only; retain authoritative layer state.
    syncAnimationButtonStates();
    // Also clear function button selections
    document.querySelectorAll('.control-btn.function-btn').forEach(b => b.classList.remove('selected'));
    setSunStudyLayout(false);
    startTour();
}

// Make header title clickable to go home
const headerTitle = document.querySelector('header h1');
headerTitle.style.cursor = 'pointer';
headerTitle.title = 'Click to return to Welcome Screen';
headerTitle.addEventListener('click', showWelcome);

// Home button
document.getElementById('home-btn').addEventListener('click', showWelcome);

function openHostLayer(targetId) {
    document.querySelectorAll('.control-btn[data-target]').forEach(button=>button.setAttribute('aria-current',String(button.dataset.target===targetId)));
    if (location.hash === '#session') { history.replaceState(null, '', location.pathname + location.search); window.dispatchEvent(new Event('hashchange')); }
    stopTour();
    updateMetadata(targetId);
    updateDashboard(targetId);
}

// Handle button clicks
document.querySelectorAll('.control-btn[data-target]').forEach(btn => {
    if (isAnimationButton(btn.dataset.target) && !new URLSearchParams(location.search).has('sessionController')) {
        const row = document.createElement('div'); row.className = 'host-layer-row';
        btn.before(row); row.append(btn);
        const toggle = document.createElement('input'); toggle.type = 'checkbox';
        toggle.dataset.layerSwitch = btn.dataset.target;
        toggle.setAttribute('aria-label', 'Enable ' + (btn.title || btn.textContent.trim()));
        toggle.onchange = () => {
            const admin = new BroadcastChannel('mr_session_admin');
            admin.postMessage({type:'admin-command',action:'layer',layer:btn.dataset.target,enabled:toggle.checked});admin.close();
        };
        row.append(toggle);
    }
    btn.addEventListener('click', () => {
        stopTour();
        const targetId = btn.dataset.target;
        const action = btn.dataset.action;
        
        if (isAnimationButton(targetId)) { openHostLayer(targetId); return; }

        // Send message to main window - the main window will respond with actual state
        channel.postMessage({
            type: MSG_TYPES.CONTROL_ACTION,
            target: targetId,
            action: action
        });

        // For function buttons, mark as selected for dashboard display
        if (!isAnimationButton(targetId)) {
            document.querySelectorAll('.control-btn.function-btn').forEach(b => {
                b.classList.remove('selected');
            });
            btn.classList.add('selected');
        }
        
        // Always update metadata and dashboard when a button is clicked
        updateMetadata(targetId);
        updateDashboard(targetId);

        // Request immediate status update for dynamic layers
        if (targetId === 'bird-sounds-btn') {
            channel.postMessage({ type: MSG_TYPES.BIRD_CONTROL, action: 'request_status' });
        } else if (targetId === 'slideshow-btn') {
            channel.postMessage({ type: MSG_TYPES.SLIDESHOW_CONTROL, action: 'request_status' });
        }
    });
});

function thermalNumber(value, digits = 1) {
    return value != null && Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '--';
}

function thermalProfileSvg(route) {
    if (!route) return '<p class="thermal-empty-profile">Select an origin and destination to compare exposure along both paths.</p>';
    const paths = [route.shortest, route.coolest];
    const samples = paths.flatMap(item => item.properties.profile || []);
    if (!samples.length) return '';
    const maxDistance = Math.max(...samples.map(item => Number(item.distance_m)), 1);
    const minPet = Math.floor(Math.min(...samples.map(item => Number(item.pet_c))) - 2);
    const maxPet = Math.ceil(Math.max(...samples.map(item => Number(item.pet_c))) + 2);
    const x = item => 35 + Number(item.distance_m) / maxDistance * 525;
    const y = item => 112 - (Number(item.pet_c) - minPet) / Math.max(maxPet - minPet, 1) * 90;
    const line = item => (item.properties.profile || []).map((sample, index) =>
        `${index ? 'L' : 'M'}${x(sample).toFixed(1)},${y(sample).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 580 140" role="img" aria-label="PET along shortest and coolest routes">
        <line x1="35" y1="112" x2="560" y2="112" stroke="#64748b" />
        <line x1="35" y1="20" x2="35" y2="112" stroke="#64748b" />
        <text x="3" y="27" fill="#94a3b8" font-size="12">${maxPet}°</text>
        <text x="3" y="112" fill="#94a3b8" font-size="12">${minPet}°</text>
        <text x="485" y="134" fill="#94a3b8" font-size="12">${Math.round(maxDistance)} m</text>
        <path d="${line(route.shortest)}" fill="none" stroke="#f8fafc" stroke-width="2.5" stroke-dasharray="5 4" />
        <path d="${line(route.coolest)}" fill="none" stroke="#48e7ff" stroke-width="3" />
    </svg>`;
}

function updateCoolpathsExplorer(state, dashboardContent) {
    const tour = state.tour || { open: false, playing: false, step: 0 };
    const step = window.COOLPATHS_GUIDE[tour.step] || window.COOLPATHS_GUIDE[0];
    const usable = state.active && state.ready;
    const specialNames = { buildings: 'Building geometry', streets: 'Walking network', routes: 'Shortest & coolest routes' };
    const element = id => document.getElementById(id);
    element('coolpaths-tour-count').textContent = tour.open ? `${tour.step + 1} / 6` : '6 steps';
    element('coolpaths-step-title').textContent = tour.open ? step.title : 'Explore the data behind every route';
    element('coolpaths-step-body').textContent = tour.open ? step.body : 'Follow the preparation from city geometry to a cooler walk. Each step reveals its actual map layer.';
    element('coolpaths-step-hint').textContent = tour.open ? step.hint : 'Start the tour or choose any step above.';
    dashboardContent.querySelectorAll('[data-tour-step]').forEach(button => {
        const selected = tour.open && Number(button.dataset.tourStep) === tour.step;
        button.setAttribute('aria-current', selected ? 'step' : 'false');
        button.disabled = !usable;
    });
    element('coolpaths-tour-play').textContent = tour.playing ? 'Pause' : tour.open ? 'Play tour' : 'Start tour';
    element('coolpaths-tour-play').disabled = !usable;
    element('coolpaths-tour-back').disabled = !usable || !tour.open || tour.step === 0;
    element('coolpaths-tour-next').disabled = !usable || !tour.open || tour.step === 5;
    element('coolpaths-tour-explore').disabled = !usable || !tour.open;
    element('coolpaths-tour-end').disabled = !tour.open;
    element('coolpaths-layer-controls').hidden = !tour.open;
    const select = element('coolpaths-input-layer');
    const signature = `${tour.step}:${!!state.catalog}`;
    if (select.dataset.options !== signature) {
        select.replaceChildren(...step.choices.map(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = specialNames[name] || state.catalog?.layers[name]?.title || name;
            return option;
        }));
        select.dataset.options = signature;
    }
    select.value = tour.layer || step.layer;
    const selected = state.catalog?.layers[tour.layer];
    const scale = element('coolpaths-input-scale');
    scale.replaceChildren();
    if (selected) {
        const bar = document.createElement('div');
        bar.style.background = `linear-gradient(90deg, ${selected.colors.join(',')})`;
        const labels = document.createElement('span');
        labels.textContent = selected.unit === 'mask' ?
            (tour.layer === 'shade' ? 'Indigo: cast shadow · clear: no cast shadow' : 'Blue: water · clear: land') :
            `${selected.stops[0]} → ${selected.stops.at(-1)} ${selected.unit}`;
        scale.append(bar, labels);
    }
    element('coolpaths-layer-source').textContent = selected?.source ||
        (tour.layer === 'buildings' ? 'Local and OpenStreetMap footprints · heights inferred where absent' :
            tour.layer === 'streets' ? 'OpenStreetMap walking graph · sampled PET per street' :
                tour.layer === 'routes' ? (state.route ? 'Your selected walk' : 'Example walk calculated live on the prepared graph') : '');
    const weather = state.status?.hours?.[String(state.hour)];
    const sun = state.catalog?.sun;
    element('coolpaths-tour-weather').innerHTML = usable ?
        `<span>Air <strong>${thermalNumber(weather?.air_temperature_c)}°C</strong></span>
         <span>Humidity <strong>${thermalNumber(weather?.relative_humidity_pct, 0)}%</strong></span>
         <span>Wind at 10 m <strong>${thermalNumber(weather?.wind_10m_ms)} m/s</strong></span>
         ${tour.open && sun ? `<span>☀ ${thermalNumber(sun.elevation_deg, 0)}° high · ${thermalNumber(sun.azimuth_deg, 0)}° bearing</span>` : ''}` : '';
    element('coolpaths-tour-status').textContent = tour.error || (tour.loading ? 'Loading the prepared map layer…' :
        tour.playing ? 'Playing · the sun step also moves through the study hours' : '');
    ['route', 'inspect'].forEach(mode => {
        element(`coolpaths-mode-${mode}`).setAttribute('aria-pressed', String((state.mode || 'route') === mode));
        element(`coolpaths-mode-${mode}`).disabled = !usable;
    });
    const sample = state.inspection;
    const values = sample?.values;
    element('coolpaths-inspector-message').textContent = state.inspectionLoading ? 'Sampling this location…' :
        state.inspectionError || sample?.message || (state.mode === 'inspect' ?
            'Click a location on the map. The pink ring marks your sample.' : 'Choose Inspect, then click the map to sample a location.');
    element('coolpaths-sample-pet').textContent = values?.pet == null ? '--' : `${thermalNumber(values.pet)}°C`;
    element('coolpaths-sample-mrt').textContent = values?.mrt == null ? '--' : `${thermalNumber(values.mrt)}°C`;
    element('coolpaths-sample-air').textContent = sample ? `${thermalNumber(sample.weather.air_temperature_c)}°C` : '--';
    element('coolpaths-sample-shade').textContent = sample?.building ? 'Building' : values?.shade == null ? '--' :
        values.shade > 0.5 ? 'Cast shade' : values.canopy > 0.1 ? 'Under canopy' : 'Sunlit';
    element('coolpaths-sample-sky').textContent = values?.svf == null ? '--' : `${thermalNumber(values.svf * 100, 0)}%`;
    element('coolpaths-sample-canopy').textContent = values?.canopy == null ? '--' : `${thermalNumber(values.canopy)} m`;
    element('coolpaths-sample-detail').textContent = sample ?
        `${sample.point[1].toFixed(5)}, ${sample.point[0].toFixed(5)} · ${String(sample.hour).padStart(2, '0')}:00 · ` +
        (sample.building ? `${thermalNumber(sample.building.height_m)} m building (${sample.building.source})` :
            `NDVI ${thermalNumber(values.ndvi, 2)} · direct sunlight ${thermalNumber(values.direct, 0)} W/m²`) : '';
}

function updateThermalDashboard() {
    const dashboardContent = document.getElementById('dashboard-content');
    const dashboardTitle = document.getElementById('dashboard-title');
    const legendTitle = document.getElementById('legend-title');
    const legendContent = document.getElementById('legend-content');
    if (!dashboardContent || !legendContent) return;
    if (dashboardTitle) dashboardTitle.textContent = 'CoolPaths routing';
    if (legendTitle) legendTitle.textContent = 'PET and routes';
    if (!document.getElementById('coolpaths-dashboard')) {
        dashboardContent.innerHTML = `
            <div id="coolpaths-dashboard" class="coolpaths-dashboard">
                <div class="coolpaths-heading">
                    <div><span class="coolpaths-eyebrow">GOTHENBURG STUDY</span>
                        <strong id="coolpaths-date">15 July 2026</strong></div>
                    <span id="coolpaths-state" class="coolpaths-state">Waiting for map</span>
                </div>
                <div class="coolpaths-controls">
                    <label for="thermal-hour">Study hour <strong id="thermal-hour-display">14:00</strong></label>
                    <input type="range" id="thermal-hour" class="modern-range" min="8" max="20" step="1" value="14">
                    <div class="coolpaths-hour-ends"><span>08:00</span><span>20:00</span></div>
                    <div class="coolpaths-options">
                        <label><input type="checkbox" id="thermal-raster" checked> PET surface</label>
                        <label><input type="checkbox" id="thermal-streets" checked> Walking streets</label>
                        <button type="button" id="thermal-clear" class="modern-btn">Clear route</button>
                    </div>
                </div>
                <div id="coolpaths-instruction" class="coolpaths-instruction" role="status">Activate the layer on the map.</div>
                <div class="coolpaths-metrics">
                    <div class="coolpaths-metric coolpaths-short"><span>Shortest</span><strong id="thermal-short-distance">--</strong><small id="thermal-short-pet">-- PET</small><small id="thermal-short-heat">-- exposure</small></div>
                    <div class="coolpaths-metric coolpaths-cool"><span>Coolest</span><strong id="thermal-cool-distance">--</strong><small id="thermal-cool-pet">-- PET</small><small id="thermal-cool-heat">-- exposure</small></div>
                    <div class="coolpaths-metric coolpaths-benefit"><span>Difference</span><strong id="thermal-reduction">--</strong><small id="thermal-detour">-- distance</small><small>50% detour limit</small></div>
                </div>
                <div class="coolpaths-profile"><div><strong>PET along route</strong><span>°C by walking distance</span></div><div id="thermal-profile"></div></div>
                <section class="coolpaths-tour" aria-labelledby="coolpaths-tour-heading">
                    <div class="coolpaths-card-heading"><div><span class="coolpaths-eyebrow">FROM INPUTS TO A WALK</span>
                        <h3 id="coolpaths-tour-heading">How CoolPaths works</h3></div><span id="coolpaths-tour-count">6 steps</span></div>
                    <nav class="coolpaths-steps" aria-label="CoolPaths processing steps">
                        ${window.COOLPATHS_GUIDE.map((step, index) => `<button type="button" data-tour-step="${index}" aria-label="Step ${index + 1}: ${step.title}"><span>${index + 1}</span>${step.short}</button>`).join('')}
                    </nav>
                    <h4 id="coolpaths-step-title">Explore the data behind every route</h4>
                    <p id="coolpaths-step-body">Follow the preparation from city geometry to a cooler walk. Each step reveals its actual map layer.</p>
                    <p id="coolpaths-step-hint" class="coolpaths-muted">Start the tour or choose any step above.</p>
                    <div id="coolpaths-layer-controls" hidden>
                        <label class="coolpaths-layer-label" for="coolpaths-input-layer">On the map <select id="coolpaths-input-layer"></select></label>
                        <div id="coolpaths-input-scale" class="coolpaths-input-scale"></div>
                        <p id="coolpaths-layer-source" class="coolpaths-muted"></p>
                    </div>
                    <div class="coolpaths-tour-actions">
                        <button type="button" id="coolpaths-tour-back" class="modern-btn" aria-label="Previous tour step">←</button>
                        <button type="button" id="coolpaths-tour-play" class="modern-btn coolpaths-primary">Start tour</button>
                        <button type="button" id="coolpaths-tour-next" class="modern-btn" aria-label="Next tour step">→</button>
                        <button type="button" id="coolpaths-tour-explore" class="modern-btn">Explore this layer</button>
                        <button type="button" id="coolpaths-tour-end" class="modern-btn">Back to routing</button>
                    </div>
                    <div id="coolpaths-tour-weather" class="coolpaths-tour-weather"></div>
                    <p id="coolpaths-tour-status" class="coolpaths-muted" role="status"></p>
                </section>
                <section class="coolpaths-inspector" aria-labelledby="coolpaths-inspector-heading">
                    <div class="coolpaths-card-heading"><h3 id="coolpaths-inspector-heading">At this location</h3>
                        <div class="coolpaths-mode" role="group" aria-label="Map click action">
                            <button type="button" id="coolpaths-mode-route" aria-pressed="true">Route</button>
                            <button type="button" id="coolpaths-mode-inspect" aria-pressed="false">Inspect</button>
                        </div>
                    </div>
                    <p id="coolpaths-inspector-message" class="coolpaths-muted" role="status">Choose Inspect, then click the map to sample a location.</p>
                    <dl class="coolpaths-samples">
                        <div><dt>PET</dt><dd id="coolpaths-sample-pet">--</dd></div>
                        <div><dt>Radiant temperature</dt><dd id="coolpaths-sample-mrt">--</dd></div>
                        <div><dt>Air temperature</dt><dd id="coolpaths-sample-air">--</dd></div>
                        <div><dt>Sun exposure</dt><dd id="coolpaths-sample-shade">--</dd></div>
                        <div><dt>Sky visible</dt><dd id="coolpaths-sample-sky">--</dd></div>
                        <div><dt>Canopy height</dt><dd id="coolpaths-sample-canopy">--</dd></div>
                    </dl>
                    <p id="coolpaths-sample-detail" class="coolpaths-muted"></p>
                </section>
                <footer class="coolpaths-credit">
                    <strong>Based on CoolPaths</strong> · Deepank Verma, Olaf Mumm &amp; Vanessa Miriam Carlow (2026).<br>
                    <a href="https://doi.org/10.1016/j.cacint.2026.100349" target="_blank" rel="noopener noreferrer">CoolPaths: Street-scale Physiological Equivalent Temperature (PET) mapping and cooler-routes planning using open data.</a>
                    <em>City and Environment Interactions, 30</em>, 100349. ·
                    <a href="https://github.com/deepankverma/coolpaths" target="_blank" rel="noopener noreferrer">Original project ↗</a>
                    <span>Gothenburg adaptation: local geometry, 2 m rasters, MEMI PET and a revised radiation calculation.</span>
                </footer>
            </div>`;
        document.getElementById('thermal-hour')?.addEventListener('input', event => {
            document.getElementById('thermal-hour-display').textContent = `${String(event.target.value).padStart(2, '0')}:00`;
            channel.postMessage({ type: 'thermal_control', action: 'set_hour', value: Number(event.target.value) });
        });
        document.getElementById('thermal-raster')?.addEventListener('change', event =>
            channel.postMessage({ type: 'thermal_control', action: 'show_raster', value: event.target.checked }));
        document.getElementById('thermal-streets')?.addEventListener('change', event =>
            channel.postMessage({ type: 'thermal_control', action: 'show_streets', value: event.target.checked }));
        document.getElementById('thermal-clear')?.addEventListener('click', () =>
            channel.postMessage({ type: 'thermal_control', action: 'clear_route' }));
        const send = (action, value) => channel.postMessage({ type: 'thermal_control', action, value });
        dashboardContent.querySelectorAll('[data-tour-step]').forEach(button =>
            button.addEventListener('click', () => send('tour_step', Number(button.dataset.tourStep))));
        ['back', 'play', 'next', 'explore', 'end'].forEach(action =>
            document.getElementById(`coolpaths-tour-${action}`).addEventListener('click', () => send(`tour_${action}`)));
        document.getElementById('coolpaths-input-layer').addEventListener('change', event => send('tour_layer', event.target.value));
        ['route', 'inspect'].forEach(mode => document.getElementById(`coolpaths-mode-${mode}`).addEventListener('click', () => send('set_mode', mode)));
    }
    const state = thermalComfortState;
    const route = state.route || (state.tour?.open && state.tour.step === 5 ? state.demoRoute : null);
    const short = route?.shortest?.properties;
    const cool = route?.coolest?.properties;
    document.getElementById('coolpaths-date').textContent = state.studyDate || '15 July 2026';
    document.getElementById('coolpaths-state').textContent = state.ready ? 'PET data ready' :
        (state.phase === 'connecting' ? 'Connecting…' : state.active ? 'Data unavailable' : 'Layer off');
    document.getElementById('coolpaths-state').dataset.ready = String(!!state.ready);
    document.getElementById('thermal-hour').value = String(state.hour ?? 14);
    document.getElementById('thermal-hour-display').textContent = `${String(state.hour ?? 14).padStart(2, '0')}:00`;
    document.getElementById('thermal-raster').checked = state.showRaster !== false;
    document.getElementById('thermal-streets').checked = state.showStreets !== false;
    document.getElementById('coolpaths-instruction').textContent = state.mode === 'inspect' && state.active ?
        'Inspect mode · click the map to sample a location. Choose Route to set walking points.' :
        state.message || (state.active ? 'Click once for origin, twice for destination; the third click starts a new route.' : 'Activate the layer on the map.');
    document.getElementById('thermal-short-distance').textContent = short ? `${thermalNumber(short.distance_m, 0)} m` : '--';
    document.getElementById('thermal-cool-distance').textContent = cool ? `${thermalNumber(cool.distance_m, 0)} m` : '--';
    document.getElementById('thermal-short-pet').textContent = short ? `${thermalNumber(short.mean_pet_c)}°C mean PET` : '-- mean PET';
    document.getElementById('thermal-cool-pet').textContent = cool ? `${thermalNumber(cool.mean_pet_c)}°C mean PET` : '-- mean PET';
    document.getElementById('thermal-short-heat').textContent = short ? `${thermalNumber(short.heat_exposure_c_m, 0)} °C·m exposure` : '-- exposure';
    document.getElementById('thermal-cool-heat').textContent = cool ? `${thermalNumber(cool.heat_exposure_c_m, 0)} °C·m exposure` : '-- exposure';
    document.getElementById('thermal-reduction').textContent = route ? `${thermalNumber(route.comparison.heat_reduction_pct)}% less heat` : '--';
    document.getElementById('thermal-detour').textContent = route ? `+${thermalNumber(route.comparison.extra_distance_m, 0)} m (${thermalNumber(route.comparison.extra_distance_pct)}%)` : '-- distance';
    document.getElementById('thermal-profile').innerHTML = thermalProfileSvg(route);
    updateCoolpathsExplorer(state, dashboardContent);
    legendContent.innerHTML = `
        <div class="thermal-legend-gradient"></div>
        <div class="thermal-legend-labels"><span>≤20°C</span><span>24°C</span><span>30°C</span><span>36°C</span><span>≥44°C</span></div>
        <div class="thermal-route-legend"><span class="thermal-route-swatch thermal-route-swatch-cool"></span> Coolest <span class="thermal-route-swatch thermal-route-swatch-short"></span> Shortest</div>
        <p class="thermal-note">${state.airTemp == null ? '' : `Air temperature: ${thermalNumber(state.airTemp)}°C. `}PET is modeled outdoor comfort under clear-sky irradiance; it is not air temperature. Street colors and route exposure use the selected hour.</p>`;
}

function updateDashboard(targetId) {
    if (targetId !== 'thermal-comfort-btn' && thermalComfortState.tour?.playing) {
        channel.postMessage({ type: 'thermal_control', action: 'tour_pause' });
    }
    const dashboardContent = document.getElementById('dashboard-content');
    const legendContent = document.getElementById('legend-content');
    const dashboardTitle = document.getElementById('dashboard-title');
    const legendTitle = document.getElementById('legend-title');
    const mainPanel = document.getElementById('main-panel');
    if (mainPanel) {
        mainPanel.classList.toggle('epc-mode', targetId === 'epc-btn');
        mainPanel.classList.toggle('thermal-mode', targetId === 'thermal-comfort-btn');
    }

    // Check if already in sun study mode to avoid duplicate setup
    if (targetId === 'sun-study-btn' && mainPanel && mainPanel.classList.contains('sun-study-mode')) {
        return;
    }

    if (targetId !== 'sun-study-btn') {
        setSunStudyLayout(false);
    }

    // Reset titles by default
    if (dashboardTitle) dashboardTitle.textContent = 'Dashboard';
    if (legendTitle) legendTitle.textContent = 'Legend';

    const ecomGroups = document.getElementById('ecom-groups');
    const metadataTitle = document.getElementById('metadata-title');
    const metadataBody = document.getElementById('metadata-content');
    if (ecomGroups) ecomGroups.style.display = 'none';
    if (metadataBody) metadataBody.style.display = '';
    if (metadataTitle) metadataTitle.textContent = 'Metadata';
    
    // Hide SAM segmentation section by default (only shown for street-view-btn)
    const samSection = document.getElementById('sam-segmentation-section');
    if (samSection && targetId !== 'street-view-btn') {
        samSection.style.display = 'none';
    }

    if (targetId === 'epc-btn') {
        showEpcDashboard(dashboardTitle, legendTitle, legendContent);
        return;
    }

    if (targetId === 'thermal-comfort-btn') {
        updateThermalDashboard();
        channel.postMessage({ type: 'thermal_control', action: 'request_state' });
        return;
    }

    if (targetId === 'ecom-energy-btn') {
        const campusLegend = document.getElementById('campus-demo-legend');
        if (campusLegend) campusLegend.style.display = 'none';
        if (legendContent) legendContent.style.display = '';
        if (ecomGroups) ecomGroups.style.display = '';
        if (metadataBody) metadataBody.style.display = 'none';
        if (metadataTitle) metadataTitle.textContent = 'Community Parameters';
        renderEcomDashboard();
        channel.postMessage({ type: 'ecom_request_summary' });
        window.ecomControls.load();
        return;
    }

    // Campus Demo dashboard
    if (targetId === 'campus-demo-btn') {
        if (dashboardTitle) dashboardTitle.textContent = 'Campus Vision';
        if (legendTitle) legendTitle.textContent = 'Campus Vision Legend';

        dashboardContent.innerHTML = `
            <div class="dashboard-container">
                <div class="dashboard-card">
                    <div class="dashboard-section-title">
                        <span class="material-icons" style="font-size: 18px;">school</span>
                        Chalmers Campus Vision
                    </div>
                    <div class="info-box" style="border-left-color: #3b82f6;">
                        <div class="info-title">Interactive Campus Presentation</div>
                        <p class="info-text">
                            Navigate through the campus vision with layers showing routes, activity nodes, and green spaces.
                        </p>
                    </div>
                    <p style="color: #888; margin-top: 1rem; font-size: 0.9rem;">
                        Press → to start, use ← → to navigate
                    </p>
                </div>
            </div>
        `;
        
        // Show the campus demo legend container, hide default
        const campusLegend = document.getElementById('campus-demo-legend');
        if (campusLegend) {
            legendContent.style.display = 'none';
            campusLegend.style.display = 'block';
        } else {
            legendContent.innerHTML = `
                <div class="dashboard-card">
                    <div class="dashboard-section-title">Ready to Start</div>
                    <p style="color: #888;">Press → to begin the presentation</p>
                </div>
            `;
        }
        
        // Show Campus Demo Contributors in the metadata section
        const metadataContent = document.getElementById('metadata-content');
        const metadataSection = metadataContent?.parentElement;
        if (metadataSection) {
            const metadataTitle = metadataSection.querySelector('h2');
            if (metadataTitle) metadataTitle.textContent = 'Contributors';
            metadataContent.className = 'credits-grid';
            metadataContent.innerHTML = `
                <div class="credit-item">
                    <div class="credit-role">Chalmers Fastigheter</div>
                    <div class="credit-name">Ida Gäskeby</div>
                </div>
                <div class="credit-item">
                    <div class="credit-role">Spacescape</div>
                    <div class="credit-contribution">Spatial Planning & Analysis</div>
                    <div class="credit-name">Selma Sinanovic Gabrallah</div>
                    <div class="credit-name">Malin Dahlhielm</div>
                </div>
                <div class="credit-item">
                    <div class="credit-role">Chalmers Rektors Office</div>
                    <div class="credit-name">Stefan Forsaeus Nilsson</div>
                    <div class="credit-contribution">Rådgivare, Ledningskansliet, Chalmers verksamhetsstöd</div>
                </div>
                <div class="credit-item">
                    <div class="credit-role">Visualisation Developer</div>
                    <div class="credit-name">Sanjay Somanath</div>
                </div>
            `;
        }
        
        return;
    }

    // Use dedicated slideshow dashboard function for slideshow
    if (targetId === 'slideshow-btn') {
        // If we already know the slideshow is active, show the dashboard immediately
        // This prevents overwriting the active state with "Loading..." if the state update
        // arrives before this function is called (race condition).
        if (slideshowState.isActive) {
            updateSlideshowDashboard();
            return;
        }

        // Optimistically show loading state
        dashboardContent.innerHTML = `
            <div class="dashboard-container">
                <div class="dashboard-card">
                    <div class="dashboard-section-title">
                        <span class="material-icons" style="font-size: 18px;">slideshow</span>
                        Slideshow
                    </div>
                    <div class="info-box" style="border-left-color: #8b5cf6;">
                        <div class="info-title">Loading...</div>
                        <p class="info-text">
                            Starting slideshow and loading media...
                        </p>
                    </div>
                </div>
            </div>
        `;
        
        legendContent.innerHTML = `
            <div class="dashboard-card">
                <div class="dashboard-section-title">Legend</div>
                <p style="color: #6b7280; font-size: 0.9rem;">Loading legend...</p>
            </div>
        `;
        
        return;
    }

    if (targetId === 'credits-btn') {
        if (dashboardTitle) dashboardTitle.textContent = 'Project Team';
        if (legendTitle) legendTitle.textContent = 'About';

        dashboardContent.innerHTML = `
            <div class="dashboard-container">
                <div class="dashboard-card">
                    <div class="dashboard-section-title">Contributors</div>
                    <div class="credits-grid">
                        <div class="credit-item">
                            <div class="credit-role">Principle Investigator</div>
                            <div class="credit-name">Alexander Hollberg</div>
                        </div>
                        <div class="credit-item">
                            <div class="credit-role">Development Lead</div>
                            <div class="credit-name">Sanjay Somanath</div>
                        </div>
                        <div class="credit-item">
                            <div class="credit-role">Model Design, Prototyping & Printing</div>
                            <div class="credit-name">Arvid Hall</div>
                        </div>
                        
                        <div class="credit-item">
                            <div class="credit-role">Digital Twin Cities Center</div>
                            <div class="credit-name">Anders Logg, Vasilis Nasarentin</div>
                            <div class="credit-contribution">Funding and Resources</div>
                        </div>

                        <div class="credit-item">
                            <div class="credit-role">A-Verkstad</div>
                            <div class="credit-name">Jarkko Nordlund</div>
                            <div class="credit-contribution">3D Printing expertise & facilities</div>
                        </div>

                        <div class="credit-item">
                            <div class="credit-role">Infravis</div>
                            <div class="credit-name">Fabio Latino</div>
                            <div class="credit-contribution">Funding and Resources</div>
                        </div>

                        <div class="credit-item">
                            <div class="credit-role">Detailed 3D Model</div>
                            <div class="credit-name">Sara Abouebeid</div>
                        </div>

                        <div class="credit-item">
                            <div class="credit-role">CFD Simulation</div>
                            <div class="credit-name">Franziska Hunger</div>
                        </div>

                        <div class="credit-item">
                            <div class="credit-role">Office Coordinator</div>
                            <div class="credit-name">Elisabeth Meyer</div>
                            <div class="credit-contribution">Physical Location Support</div>
                        </div>

                        <div class="credit-item">
                            <div class="credit-role">Data Sources</div>
                            <div class="credit-name">Lantmäteriet, Trafikverket</div>
                        </div>
                    </div>
                </div>
                <div class="dashboard-card">
                    <div class="dashboard-section-title">Metadata</div>
                    <div class="metadata-item">
                        <div class="metadata-label">Current View</div>
                        <div class="metadata-value">Credits</div>
                    </div>
                    <div class="metadata-item">
                        <div class="metadata-label">Active Layer</div>
                        <div class="metadata-value">None</div>
                    </div>
                    <div class="metadata-item">
                        <div class="metadata-label">Description</div>
                        <div class="metadata-value">Project team and contributors information.</div>
                    </div>
                </div>
            </div>
        `;

        legendContent.innerHTML = `
            <div class="dashboard-card">
                <div class="dashboard-section-title">About the Project</div>
                <p class="info-text" style="margin-bottom: 1rem;">
                    The <strong>ACE MR Studio</strong> is an interactive platform designed to bridge the gap between complex urban data and stakeholder engagement.
                </p>
                <p class="info-text">
                    We want this space to be a place to test and ask questions about complex data communication and also inspire a new form of data story telling and research.
                </p>
                <div style="margin-top: 1.5rem; display: flex; justify-content: center; align-items: center;">
                    <img src="media/chalmers_logo.png" style="height: 40px; margin-right: 20px; opacity: 0.8;">
                    <img src="media/dtcc_logo.png" style="height: 70px; opacity: 0.8;">
                </div>
            </div>
            <div class="dashboard-card">
                <div class="dashboard-section-title">Take Our Survey</div>
                <p class="info-text" style="margin-bottom: 1rem;">
                    Help us improve! Scan the QR code to share your feedback.
                </p>
                <div style="display: flex; justify-content: center; align-items: center;">
                    <img src="media/survey_qr.png" style="width: 300px; height: 300px; border-radius: 8px;">
                </div>
            </div>
        `;
        return;
    }

    if (targetId === 'calibrate-btn') {
        renderManualCalibration(dashboardTitle, legendTitle, dashboardContent, legendContent);
        return;
    }

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
        setSunStudyLayout(true);

        if (dashboardTitle) dashboardTitle.textContent = 'Sun Study Sky';
        if (legendTitle) legendTitle.textContent = 'Sun Study';

        const timeLabel = `${Math.floor(sunStudyState.time).toString().padStart(2, '0')}:${Math.floor((sunStudyState.time % 1) * 60).toString().padStart(2, '0')}`;

        dashboardContent.innerHTML = `
            <div class="sun-sky-card">
                <div id="sun-sky" class="sun-sky">
                    <svg class="sun-path" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <path d="M10 70 Q50 10 90 70" stroke="rgba(255,255,255,0.35)" stroke-width="0.6" fill="none" stroke-dasharray="2 2" />
                    </svg>
                    <div class="sun-cloud"></div>
                    <div class="sun-cloud cloud-2"></div>
                    <div id="sun-orb" class="sun-orb"></div>
                    <div class="sun-horizon"></div>
                    <div class="sun-time-center">
                        <div id="sun-time-label" class="sun-time">${timeLabel}</div>
                        <div id="sun-date-label" class="sun-date">${formatSunDate(sunStudyState.date)}</div>
                    </div>
                    <div class="sunrise-label">Sunrise <span id="sunrise-time">06:00</span></div>
                    <div class="sunset-label">Sunset <span id="sunset-time">18:00</span></div>
                </div>
            </div>
        `;

        if (legendContent) legendContent.innerHTML = '';

        const metadataContent = document.getElementById('metadata-content');
        if (metadataContent) {
            metadataContent.innerHTML = `
                <div class="sun-study-bottom-grid">
                    <div class="sun-compact-card">
                        <div class="sun-compact-title">Controls</div>
                        <div class="sun-compact-row">
                            <label>Date</label>
                            <input type="date" id="sun-date" class="modern-date" value="${sunStudyState.date}">
                        </div>
                        <div class="sun-compact-row">
                            <label>Time</label>
                            <input type="range" id="sun-time" class="modern-range" min="0" max="24" step="0.25" value="${sunStudyState.time}">
                            <span id="time-display" class="control-value">${timeLabel}</span>
                        </div>
                        <div class="sun-compact-row">
                            <label>Shadow Opacity</label>
                            <input type="range" id="shadow-opacity" class="modern-range" min="0.1" max="1.0" step="0.1" value="0.8">
                        </div>
                        <div class="sun-compact-row">
                            <label>Speed</label>
                            <input type="range" id="sun-speed" class="modern-range" min="0.5" max="5" step="0.5" value="2">
                            <span id="speed-display" class="control-value">2x</span>
                        </div>
                        <div class="action-grid" style="grid-template-columns: repeat(3, 1fr);">
                            <button id="sun-animate-btn" class="modern-btn primary">
                                <span class="material-icons">play_arrow</span>
                                Animate
                            </button>
                            <button id="false-color-btn" class="modern-btn">
                                <span class="material-icons">palette</span>
                                False
                            </button>
                            <button id="toggle-trees-btn" class="modern-btn">
                                <span class="material-icons">park</span>
                                Trees
                            </button>
                        </div>
                    </div>

                    <div class="sun-compact-card">
                        <div class="sun-compact-title">Live Sun</div>
                        <div class="sun-compact-row">
                            <span>Altitude</span>
                            <span id="altitude-display" class="control-value">--</span>
                        </div>
                        <div class="sun-compact-row">
                            <span>Azimuth</span>
                            <span id="azimuth-display" class="control-value">--</span>
                        </div>
                        <div class="sun-compact-row">
                            <span>Trees</span>
                            <span id="trees-status-display" class="control-value">Off</span>
                        </div>
                    </div>

                    <div class="sun-compact-card">
                        <div class="sun-compact-title">Legend</div>
                        <div class="sun-compact-legend">
                            <div class="legend-item">
                                <div class="legend-color" style="background: rgba(0,0,0,0.5);"></div>
                                <span class="legend-label">Shadow Cast</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-color" style="background: linear-gradient(to right, #f5d866, #ff6626, #f23319);"></div>
                                <span class="legend-label">Sun Exposure</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-color" style="background: #26409a;"></div>
                                <span class="legend-label">Building/Terrain</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-color" style="background: #268040;"></div>
                                <span class="legend-label">Tree Shadow</span>
                            </div>
                            <div class="legend-item">
                                <div class="legend-color" style="background: #8c268c;"></div>
                                <span class="legend-label">Combined</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

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
                type: MSG_TYPES.SUN_CONTROL,
                action: action,
                value: value
            });
        };

        if (dateInput) {
            dateInput.addEventListener('change', (e) => {
                sunStudyState.date = e.target.value;
                updateSunStudySky(sunStudyState.time, sunStudyState.date);
                sendControl('set_date', e.target.value);
            });
        }
        
        if (timeInput && timeDisplay) {
            timeInput.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                const h = Math.floor(val);
                const m = Math.floor((val - h) * 60);
                timeDisplay.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                sunStudyState.time = val;
                updateSunStudySky(val, sunStudyState.date);
                sendControl('set_time', val);
            });
        }

        if (opacityInput) {
            opacityInput.addEventListener('input', (e) => sendControl('set_opacity', e.target.value));
        }
        
        if (animateBtn) {
            animateBtn.addEventListener('click', () => {
                animateBtn.classList.toggle('active');
                const isActive = animateBtn.classList.contains('active');
                animateBtn.innerHTML = isActive 
                    ? '<span class="material-icons">pause</span> Pause'
                    : '<span class="material-icons">play_arrow</span> Animate';
                sendControl('toggle_animation');
            });
        }

        if (speedInput && speedDisplay) {
            speedInput.addEventListener('input', (e) => {
                speedDisplay.textContent = e.target.value + 'x';
                sendControl('set_speed', e.target.value);
            });
        }

        if (falseColorBtn) {
            falseColorBtn.addEventListener('click', () => {
                falseColorBtn.classList.toggle('active');
                sendControl('toggle_false_color');
            });
        }

        const toggleTreesBtn = document.getElementById('toggle-trees-btn');
        if (toggleTreesBtn) {
            toggleTreesBtn.addEventListener('click', () => {
                toggleTreesBtn.classList.toggle('active');
                sendControl('toggle_trees');
            });
        }

        // Update sky visualization
        updateSunStudySky(sunStudyState.time, sunStudyState.date);
        
        // Sync initial date and time to sun-study.js
        sendControl('set_date', sunStudyState.date);
        sendControl('set_time', sunStudyState.time);

    } else if (targetId === 'cfd-simulation-btn') {
        dashboardContent.innerHTML = `
            <div class="dashboard-container">
                <div class="dashboard-card cfd-appearance">
                    <div class="dashboard-section-title">
                        <span class="material-icons" style="font-size: 18px;">air</span>
                        Wind appearance
                    </div>
                    <div class="control-row">
                        <label class="control-label" for="wind-visual-style">Style</label>
                        <select id="wind-visual-style" class="modern-date" aria-describedby="wind-style-description">
                            <option value="ribbons">Ribbons</option>
                            <option value="particles">Particles</option>
                        </select>
                    </div>
                    <p id="wind-style-description" class="cfd-appearance-note" aria-live="polite"></p>
                    <div class="control-row">
                        <label class="control-label" for="wind-palette">Palette</label>
                        <select id="wind-palette" class="modern-date">
                            <option value="classic">Classic · blue to red</option>
                            <option value="ocean">Ocean · blue to white</option>
                            <option value="ember">Ember · purple to yellow</option>
                            <option value="monochrome">Monochrome · gray to white</option>
                        </select>
                    </div>
                    <div class="control-row">
                        <label class="control-label" for="wind-color-range">Speed range</label>
                        <select id="wind-color-range" class="modern-date" aria-describedby="wind-range-note">
                            <option value="5">0–5+ m/s</option>
                            <option value="10">0–10+ m/s</option>
                            <option value="20" selected>0–20+ m/s</option>
                            <option value="40">0–40+ m/s</option>
                        </select>
                    </div>
                    <div id="wind-color-preview" class="cfd-color-bar"></div>
                    <div class="cfd-color-labels"><span id="wind-preview-label-0"></span><span id="wind-preview-label-1"></span><span id="wind-preview-label-2"></span></div>
                    <p id="wind-range-note" class="cfd-appearance-note">Color shows speed in m/s. White moving highlights show direction. “+” means the color has reached the top of the scale.</p>
                    <div class="control-row">
                        <label class="control-label" for="wind-facade-glow">Wind-impact glow</label>
                        <input type="checkbox" id="wind-facade-glow" checked aria-describedby="wind-impact-note" style="width: 20px; height: 20px; accent-color: #ffd58c;">
                    </div>
                    <p id="wind-impact-note" class="cfd-appearance-note">Building edges glow brighter where stronger wind approaches the façade. Qualitative impact, not a measured pressure coefficient.</p>
                    <div class="control-row">
                        <label class="control-label" for="particle-count">Visual density</label>
                        <select id="particle-count" class="modern-date" style="width: 100px;">
                            <option value="200">Low</option>
                            <option value="500" selected>Medium</option>
                            <option value="1000">High</option>
                        </select>
                    </div>

                    <div class="control-row">
                        <label class="control-label" for="particle-speed" title="Visualization speed; independent of wind speed">Tracer playback</label>
                        <input type="range" id="particle-speed" class="modern-range" min="2" max="40" step="2" value="20">
                        <span id="particle-speed-display" class="control-value">20x</span>
                    </div>

                </div>
                <div class="dashboard-card">
                    <div class="dashboard-section-title">
                        <span class="material-icons" style="font-size: 18px;">tune</span>
                        Wind physics
                    </div>

                    <div class="control-row">
                        <label class="control-label">Wind Speed</label>
                        <input type="range" id="wind-speed" class="modern-range" min="1" max="20" step="0.5" value="5">
                        <span id="wind-speed-display" class="control-value">5.0 m/s</span>
                    </div>

                    <div class="control-row">
                        <label class="control-label" title="Clockwise in screen space: 0° points right, 90° points down">Flow Direction</label>
                        <input type="range" id="wind-direction" class="modern-range" min="0" max="360" step="15" value="0">
                        <span id="wind-dir-display" class="control-value">0° →</span>
                    </div>

                    <div class="control-row">
                        <label class="control-label">Viscosity</label>
                        <input type="range" id="viscosity" class="modern-range" min="0" max="1" step="0.001" value="0.077">
                    </div>

                    <div class="control-row">
                        <label class="control-label">Grid Resolution</label>
                        <select id="grid-resolution" class="modern-date" style="width: 100px;">
                            <option value="100">100 (Fast)</option>
                            <option value="150" selected>150</option>
                            <option value="200">200 (Normal)</option>
                            <option value="250">250</option>
                            <option value="300">300 (High)</option>
                        </select>
                    </div>

                    <div class="control-row">
                        <label class="control-label">Include Trees</label>
                        <button id="toggle-trees-btn" class="modern-date" style="width: 100px; cursor: pointer; background: #2D5A27; border: 1px solid #4a9441;">
                            <span class="material-icons" style="font-size: 14px; vertical-align: middle;">park</span>
                            <span id="trees-status">On</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Set metadata to Educational Context for CFD
        const metadataContent = document.getElementById('metadata-content');
        const metadataSection = metadataContent?.parentElement;
        if (metadataSection) {
            const metadataTitle = metadataSection.querySelector('h2');
            if (metadataTitle) metadataTitle.textContent = 'Educational Context';
            metadataContent.innerHTML = `
                <div class="dashboard-card" style="border: none; background: transparent; padding: 0;">
                    <div class="info-box" style="margin-bottom: 1rem; border-left-color: #10b981;">
                        <div class="info-title">Methodology</div>
                        <p class="info-text">
                            Uses a <strong>2D Lattice Boltzmann model</strong> to illustrate flow around building footprints. Ribbons and particles sample the computed velocity field; tracer playback changes presentation speed only. Changing the color range changes colors, not the flow or its motion.
                        </p>
                    </div>
                    <div class="info-box" style="border-left-color: #10b981;">
                        <div class="info-title">Application</div>
                        <p class="info-text">
                            Explore sheltered areas and accelerated flow between buildings. This qualitative model does not simulate wind over roofs or provide validated wind-comfort or safety predictions.
                        </p>
                    </div>
                </div>
            `;
        }
        
        legendContent.innerHTML = `
            <div class="dashboard-card">
                <div class="dashboard-section-title">Legend</div>
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    
                    <div>
                        <div class="legend-label" style="margin-bottom: 0.5rem;">Wind Velocity Scale</div>
                        <div id="wind-color-legend" style="height: 12px; background: ${CFD.colorGradient(cfdState.palette, cfdState.colorMaxMps)}; border-radius: 6px; margin-bottom: 0.25rem;"></div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #6b7280;">
                            <span id="wind-range-label-0">0 m/s</span>
                            <span id="wind-range-label-1">10 m/s</span>
                            <span id="wind-range-label-2">20+ m/s</span>
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
                        <div id="wind-impact-swatch" class="legend-color" style="background: #ffd58c; box-shadow: 0 0 8px #ffd58c;"></div>
                        <div>
                            <span class="legend-label">Wind impact on façades</span>
                            <div style="font-size: 0.75rem; color: #6b7280;">Dim → bright: less → more incoming wind. Independent of the speed color scale.</div>
                        </div>
                    </div>

                    <div class="legend-item">
                        <div class="legend-color" style="background: #2D5A27; border: 1px dashed #4a9441;"></div>
                        <div>
                            <span class="legend-label">Tree Canopies</span>
                            <div style="font-size: 0.75rem; color: #6b7280;">Approximate porous drag</div>
                        </div>
                    </div>

                    <div class="legend-item">
                        <div class="legend-color" style="background: rgba(255,255,255,0.5); border: 1px dashed #9ca3af;"></div>
                        <div>
                            <span class="legend-label">Computed airflow</span>
                            <div style="font-size: 0.75rem; color: #6b7280;">Colored marks show speed; white highlights move downstream</div>
                        </div>
                    </div>

                    <div style="border-top: 1px solid #e5e7eb; padding-top: 0.5rem; margin-top: 0.5rem;">
                        <div style="font-size: 0.8rem; color: #6b7280; display: flex; justify-content: space-between;">
                            <span>Speed Reference:</span>
                            <span style="font-family: monospace;">Inlet calibrated</span>
                        </div>
                        <div style="font-size: 0.8rem; color: #6b7280; display: flex; justify-content: space-between;">
                            <span>Model Fidelity:</span>
                            <span style="font-family: monospace;">Qualitative 2D LBM</span>
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
                type: MSG_TYPES.CFD_CONTROL,
                action: action,
                value: value
            });
        };

        for (const [id, action, property] of [
            ['wind-visual-style', 'set_visual_style', 'visualStyle'],
            ['wind-palette', 'set_color_palette', 'palette'],
            ['wind-color-range', 'set_color_range', 'colorMaxMps']
        ]) {
            document.getElementById(id).addEventListener('change', event => {
                const value = property === 'colorMaxMps' ? Number(event.target.value) : event.target.value;
                cfdState[property] = value;
                renderCfdState();
                sendCfdControl(action, value);
            });
        }

        document.getElementById('wind-facade-glow').addEventListener('change', event => {
            cfdState.facadeGlow = event.target.checked;
            sendCfdControl('set_facade_glow', event.target.checked);
        });

        windSpeed.addEventListener('input', (e) => {
            const speed = parseFloat(e.target.value);
            windSpeedDisplay.textContent = speed.toFixed(1) + ' m/s';
            sendCfdControl('set_wind_speed', e.target.value);
        });

        windDir.addEventListener('input', (e) => {
            const angle = parseFloat(e.target.value);
            const arrows = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
            const arrow = arrows[Math.round(angle / 45) % arrows.length];
            windDirDisplay.textContent = `${e.target.value}° ${arrow}`;
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

        // Tree toggle button
        const toggleTreesBtn = document.getElementById('toggle-trees-btn');
        const treesStatus = document.getElementById('trees-status');
        
        toggleTreesBtn.addEventListener('click', () => {
            const treesEnabled = toggleTreesBtn.dataset.enabled !== 'true';
            toggleTreesBtn.dataset.enabled = String(treesEnabled);
            treesStatus.textContent = treesEnabled ? 'On' : 'Off';
            toggleTreesBtn.style.background = treesEnabled ? '#2D5A27' : '#333';
            toggleTreesBtn.style.borderColor = treesEnabled ? '#4a9441' : '#555';
            sendCfdControl('toggle_trees', treesEnabled);
        });

        renderCfdState();
        sendCfdControl('get_state');

    } else if (targetId === 'isovist-btn') {
        dashboardContent.innerHTML = `
            <div class="dashboard-container">
                <div class="dashboard-card" style="padding: 0; overflow: hidden;">
                    <div style="padding: 0.75rem 1rem 0.5rem; border-bottom: 1px solid #333;">
                        <div class="dashboard-section-title" style="margin: 0;">
                            <span class="material-icons" style="font-size: 18px;">streetview</span>
                            Street View (Live)
                        </div>
                    </div>
                    <div id="street-view-panel" style="width: 100%; height: 620px; background: #1a1a1a; position: relative;">
                        <img id="street-view-image" style="width: 100%; height: 100%; object-fit: cover; display: none;" />
                        <div id="street-view-no-coverage" style="
                            position: absolute;
                            top: 0; left: 0; right: 0; bottom: 0;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            flex-direction: column;
                            color: #666;
                            font-size: 12px;
                            background: #1a1a1a;
                        ">
                            <span style="font-size: 32px; margin-bottom: 8px;">📍</span>
                            <span style="font-size: 13px;">Place viewer on map</span>
                            <span style="font-size: 10px; color: #555;">Street View updates as you move</span>
                        </div>
                        <div id="street-view-coords" style="
                            position: absolute;
                            bottom: 4px;
                            left: 4px;
                            background: rgba(0,0,0,0.7);
                            color: #888;
                            font-size: 9px;
                            padding: 2px 6px;
                            border-radius: 3px;
                            display: none;
                        "></div>
                    </div>
                </div>
                
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
                    <div class="info-box" style="margin-bottom: 0.75rem; border-left-color: #2D5A27;">
                        <div class="info-title">Green View Index (GVI)</div>
                        <p class="info-text">
                            Measures the <strong>percentage of vegetation visible</strong> from a viewpoint. 
                            Higher GVF (≥30%) is linked to reduced stress and better thermal comfort.
                        </p>
                    </div>
                    <div class="info-box" style="border-left-color: #eab308;">
                        <div class="info-title">Isovist Analysis</div>
                        <p class="info-text">
                            Calculates <strong>visibility polygons</strong> by casting rays until they hit obstacles.
                            Used in urban design and CPTED analysis.
                        </p>
                    </div>
                </div>
            </div>
        `;
        
        // Initialize Street View for isovist dashboard
        loadStreetViewConfig();
        
        legendContent.innerHTML = `
            <div class="dashboard-card">
                <div class="dashboard-section-title">Live Visibility</div>
                <div id="isovist-stats-container">
                    <div style="text-align: center; color: #888; padding: 1rem; font-size: 11px;">Place viewer on map...</div>
                </div>
            </div>
            <div class="dashboard-card" style="margin-top: 0.75rem;">
                <div class="dashboard-section-title">Map Legend</div>
                <div style="display: flex; flex-wrap: wrap; gap: 0.4rem 0.8rem; font-size: 10px;">
                    <div class="legend-item" style="margin: 0;">
                        <div class="legend-color" style="width: 14px; height: 14px; background: rgba(255, 255, 0, 0.3); border: 1px solid #eab308;"></div>
                        <span class="legend-label">Visible</span>
                    </div>
                    <div class="legend-item" style="margin: 0;">
                        <div class="legend-color" style="width: 10px; height: 10px; border-radius: 50%; background: #ff0000; border: 2px solid white;"></div>
                        <span class="legend-label">Viewer</span>
                    </div>
                    <div class="legend-item" style="margin: 0;">
                        <div class="legend-color" style="width: 14px; height: 2px; background: #ff0000;"></div>
                        <span class="legend-label">Direction</span>
                    </div>
                </div>
            </div>
        `;

        // Clear history when switching to isovist
        isovistHistory.data = [];
        isovistHistory.gvfHistory = [];

        // Attach event listeners
        const radiusInput = document.getElementById('isovist-radius');
        const radiusDisplay = document.getElementById('radius-display');
        const fovInput = document.getElementById('isovist-fov');
        const fovDisplay = document.getElementById('fov-display');
        const toggle360Btn = document.getElementById('toggle-360-btn');
        const toggleFollowBtn = document.getElementById('toggle-follow-btn');

        const sendIsovistControl = (action, value) => {
            channel.postMessage({
                type: MSG_TYPES.ISOVIST_CONTROL,
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
                <div class="dashboard-card" style="padding: 0.75rem;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="material-icons" style="font-size: 20px; color: #84cc16;">volume_up</span>
                        <input type="range" id="bird-volume" class="modern-range" min="0" max="1" step="0.1" value="0.5" style="flex: 1;">
                        <button id="stop-sounds-btn" class="modern-btn" style="padding: 6px 10px; font-size: 0.8rem;">
                            <span class="material-icons" style="font-size: 16px;">stop</span>
                        </button>
                    </div>
                </div>

                <div id="active-birds-container">
                    <div class="dashboard-card">
                        <div class="dashboard-section-title">Active Birds</div>
                        <p style="color: #888; font-size: 0.85rem;">Listening for bird calls...</p>
                    </div>
                </div>
        `;
        
        legendContent.innerHTML = `
            <div class="dashboard-card">
                <div class="dashboard-section-title">Species Guide</div>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; gap: 10px; align-items: start;">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/9/93/Luscinia_luscinia_vogelartinfo_chris_romeiks_CHR3635.jpg" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                                <span style="width: 10px; height: 10px; border-radius: 50%; background: #FFD700;"></span>
                                <span style="font-weight: bold; font-size: 0.9rem;">Thrush Nightingale</span>
                            </div>
                            <div style="font-size: 0.8rem; color: #666; line-height: 1.3;">
                                Known for its powerful and melodious song, often heard at night. It breeds in dense damp thickets.
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; align-items: start;">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Ficedula_hypoleuca_-Wood_of_Cree_Nature_Reserve%2C_Scotland_-male-8a.jpg" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                                <span style="width: 10px; height: 10px; border-radius: 50%; background: #00BFFF;"></span>
                                <span style="font-weight: bold; font-size: 0.9rem;">European Pied Flycatcher</span>
                            </div>
                            <div style="font-size: 0.8rem; color: #666; line-height: 1.3;">
                                A small passerine bird that breeds in most of Europe and western Asia. It is migratory, wintering in western Africa.
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; align-items: start;">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/1/14/Hausrotschwanz_Brutpflege_2006-05-21-05.jpg" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                                <span style="width: 10px; height: 10px; border-radius: 50%; background: #FF4500;"></span>
                                <span style="font-weight: bold; font-size: 0.9rem;">Black Redstart</span>
                            </div>
                            <div style="font-size: 0.8rem; color: #666; line-height: 1.3;">
                                A small passerine bird that has adapted to live in the heart of industrial and urban centers.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Attach event listeners
        const volumeInput = document.getElementById('bird-volume');
        const stopBtn = document.getElementById('stop-sounds-btn');

        const sendBirdControl = (action, value) => {
            channel.postMessage({
                type: MSG_TYPES.BIRD_CONTROL,
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

    } else if (targetId === 'fcc-demo-btn') {
        // FCC VR Demo dashboard with video player and timeline
        updateFCCDemoDashboard();
        
    } else if (targetId === 'street-view-btn') {
        // Street View dashboard with embedded image
        dashboardContent.innerHTML = `
            <div class="dashboard-container">
                <div class="dashboard-card" style="padding: 0; overflow: hidden;">
                    <div id="street-view-panel" style="width: 100%; height: 350px; background: #1a1a1a; position: relative;">
                        <img id="street-view-image" style="width: 100%; height: 100%; object-fit: cover; display: none;" />
                        <div id="street-view-no-coverage" style="
                            position: absolute;
                            top: 0; left: 0; right: 0; bottom: 0;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            flex-direction: column;
                            color: #666;
                            font-size: 14px;
                            background: #1a1a1a;
                        ">
                            <span style="font-size: 48px; margin-bottom: 12px;">📍</span>
                            <span style="font-size: 16px; margin-bottom: 4px;">Click on the map</span>
                            <span style="font-size: 12px; color: #555;">to view Street View at that location</span>
                        </div>
                        <div id="street-view-coords" style="
                            position: absolute;
                            bottom: 8px;
                            left: 8px;
                            background: rgba(0,0,0,0.7);
                            color: #888;
                            font-size: 10px;
                            padding: 4px 8px;
                            border-radius: 4px;
                            font-family: monospace;
                            z-index: 10;
                        "></div>
                        <div id="street-view-heading-controls" style="
                            position: absolute;
                            bottom: 8px;
                            right: 8px;
                            display: none;
                            gap: 4px;
                            z-index: 10;
                        ">
                            <button id="sv-rotate-left" style="background: rgba(0,0,0,0.7); border: none; color: white; padding: 8px 12px; border-radius: 4px; cursor: pointer;">◀</button>
                            <button id="sv-rotate-right" style="background: rgba(0,0,0,0.7); border: none; color: white; padding: 8px 12px; border-radius: 4px; cursor: pointer;">▶</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        legendContent.innerHTML = `
            <div class="dashboard-card">
                <div class="dashboard-section-title">How to Use</div>
                <div style="font-size: 11px; color: #ccc; line-height: 1.6;">
                    <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
                        <span style="color: #3b82f6; font-weight: bold;">1.</span>
                        <span>Click the Street View button to activate</span>
                    </div>
                    <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
                        <span style="color: #3b82f6; font-weight: bold;">2.</span>
                        <span>Click anywhere on the main map display</span>
                    </div>
                    <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
                        <span style="color: #3b82f6; font-weight: bold;">3.</span>
                        <span>View the Street View image here</span>
                    </div>
                    <div style="display: flex; align-items: flex-start; gap: 8px;">
                        <span style="color: #3b82f6; font-weight: bold;">4.</span>
                        <span>Use ◀ ▶ buttons to rotate view</span>
                    </div>
                </div>
            </div>
            <div class="dashboard-card" style="margin-top: 1rem;">
                <div class="info-box" style="border-left-color: #22c55e;">
                    <div class="info-title">Coverage</div>
                    <p class="info-text">
                        Street View is available along most roads in Sweden. 
                        If no imagery exists, you'll see a "No Coverage" message.
                    </p>
                </div>
            </div>
        `;
        
        // Initialize rotation controls
        initStreetViewControls();
        
        // Show SAM segmentation section for Street View
        const samSection = document.getElementById('sam-segmentation-section');
        if (samSection) samSection.style.display = 'block';
        
    } else {
        // Default or other tools
        dashboardContent.innerHTML = '<p>Select a simulation to view details.</p>';
        legendContent.innerHTML = '<p>Select a simulation to view its legend.</p>';
        
        // Hide SAM segmentation section for non-Street View
        const samSection = document.getElementById('sam-segmentation-section');
        if (samSection) samSection.style.display = 'none';
    }
}

document.getElementById('reset-view-btn').addEventListener('click', () => {
    stopTour();
    channel.postMessage({
        type: MSG_TYPES.RESET_VIEW
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

// Listen for messages from main app
channel.onmessage = (event) => {
    const data = event.data;
    debugLog('Received:', data.type, data);
    
    if (data.type === MSG_TYPES.ANIMATION_STATE) {
        // Received actual animation state from main window - update our tracking
        setAnimationState(data.animationId, data.isActive);
    } else if (data.type === 'isovist_state') {
        const radius = document.getElementById('isovist-radius'), fov = document.getElementById('isovist-fov');
        if (radius) radius.value = data.radius;
        if (fov) {fov.value = data.fov;fov.disabled = !data.humanFov;}
        if (document.getElementById('radius-display')) document.getElementById('radius-display').textContent = data.radius + 'm';
        if (document.getElementById('fov-display')) document.getElementById('fov-display').textContent = data.fov + '°';
        document.getElementById('toggle-360-btn')?.classList.toggle('active', !data.humanFov);
        document.getElementById('toggle-follow-btn')?.classList.toggle('active', data.follow);
    } else if (data.type === 'sun_state') {
        sunStudyState.time = data.time;sunStudyState.date = data.date;
        for (const [id, value] of [['sun-time',data.time],['sun-date',data.date],['sun-speed',data.speed],['shadow-opacity',data.opacity]]) {
            const input = document.getElementById(id);if(input) input.value = value;
        }
        updateSunStudySky(data.time, data.date);
    } else if (data.type === 'cfd_state') {
        cfdState = { ...cfdState, ...data };
        renderCfdState();
    } else if (data.type === 'thermal_state') {
        thermalComfortState = { ...thermalComfortState, ...data };
        if (document.getElementById('main-panel')?.classList.contains('thermal-mode')) updateThermalDashboard();
    } else if (data.type === MSG_TYPES.STATE_UPDATE) {
        // Legacy state update - ignore for animation buttons now
        // We use ANIMATION_STATE for that instead
    } else if (data.type === MSG_TYPES.EPC_BUILDING_SELECTED) {
        epcState.selected = data.building || null;
        if (document.getElementById('main-panel')?.classList.contains('epc-mode')) {
            renderEpcBuildingDashboard(epcState.selected);
        }
    } else if (data.type === MSG_TYPES.SLIDESHOW_UPDATE) {
        // Update slideshow state and display
        slideshowState = {
            isActive: data.isActive,
            currentIndex: data.currentIndex,
            totalSlides: data.totalSlides,
            metadata: data.metadata,
            slideType: data.slideType
        };
        // Update dashboard if slideshow is the active layer
        const slideshowBtn = document.querySelector('.control-btn[data-target="slideshow-btn"]');
        if (slideshowBtn && slideshowBtn.classList.contains('active')) {
            updateSlideshowDashboard();
        }
    } else if (data.type === MSG_TYPES.SLIDESHOW_LEGEND_HIGHLIGHT) {
        // Highlight legend item in controller to match main window animation
        highlightControllerLegendItem(data.highlightValue);
    } else if (data.type === MSG_TYPES.BIRD_STATUS) {
        updateBirdDashboard(data.activeBirds);
    } else if (data.type === MSG_TYPES.SUN_POSITION) {
        const altDisplay = document.getElementById('altitude-display');
        const azDisplay = document.getElementById('azimuth-display');
        // Only update if elements exist (i.e., Sun Study dashboard is active)
        if (altDisplay) altDisplay.textContent = data.altitude.toFixed(1);
        if (azDisplay) azDisplay.textContent = data.azimuth.toFixed(1);
        updateSunStudySky(sunStudyState.time, sunStudyState.date, data.altitude);
    } else if (data.type === MSG_TYPES.SUN_TIME_UPDATE) {
        const timeSlider = document.getElementById('sun-time');
        const timeDisplay = document.getElementById('time-display');
        if (timeSlider && timeDisplay) {
            timeSlider.value = data.time;
            const h = Math.floor(data.time);
            const m = Math.floor((data.time - h) * 60);
            timeDisplay.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        }
        sunStudyState.time = data.time;
        updateSunStudySky(data.time, sunStudyState.date);
    } else if (data.type === 'trees_state') {
        // Update trees toggle button and status display
        const toggleTreesBtn = document.getElementById('toggle-trees-btn');
        const treesStatusDisplay = document.getElementById('trees-status-display');
        
        if (toggleTreesBtn) {
            if (data.visible) {
                toggleTreesBtn.classList.add('active');
            } else {
                toggleTreesBtn.classList.remove('active');
            }
        }
        
        if (treesStatusDisplay) {
            if (data.error) {
                treesStatusDisplay.textContent = 'Error';
                treesStatusDisplay.style.color = '#ef4444';
            } else if (data.loaded && data.visible) {
                treesStatusDisplay.textContent = 'On';
                treesStatusDisplay.style.color = '#22c55e';
            } else if (data.loaded) {
                treesStatusDisplay.textContent = 'Off';
                treesStatusDisplay.style.color = '#9ca3af';
            } else {
                treesStatusDisplay.textContent = 'Loading...';
                treesStatusDisplay.style.color = '#f59e0b';
            }
        }
    } else if (data.type === MSG_TYPES.CALIBRATION_DATA) {
        const calibrationText = data.text;
        navigator.clipboard.writeText(calibrationText).then(() => {
            alert('Calibration copied to clipboard!');
        }).catch(err => {
            console.error('Clipboard error:', err);
            alert('Failed to copy to clipboard. Check console for data.');
            console.log(calibrationText);
        });
    } else if (data.type === 'calibration_saved') {
        localStorage.setItem('interactive_map_selected_calibration', data.calibration.id);
        refreshSavedCalibrationSelect();
        const calibrateButton = document.querySelector('.control-btn[data-target="calibrate-btn"]');
        if (calibrateButton && calibrateButton.classList.contains('selected')) {
            renderCalibrationHistory(document.getElementById('legend-content'));
        }
    } else if (data.type === 'isovist_stats') {
        updateIsovistChart(data.data);
    } else if (data.type === 'fcc_demo_progress') {
        // Update FCC demo progress from main window
        fccDemoState.progress = data.progress;
        fccDemoState.currentTime = data.time;
        updateFCCDemoProgress();
    } else if (data.type === 'fcc_demo_ready') {
        // FCC demo is ready
        fccDemoState.pathLength = data.data.pathLength;
        fccDemoState.pointCount = data.data.pointCount;
        updateFCCDemoDashboard();
    } else if (data.type === 'fcc_demo_stats') {
        // Update FCC demo stats
        fccDemoState.stats = data.data;
        updateFCCDemoStats();
    } else if (data.type === 'fcc_demo_playback_state') {
        // Update playback state
        fccDemoState.isPlaying = data.isPlaying;
        updateFCCDemoPlayButton();
    } else if (data.type === 'street_view_position') {
        // Received position from main map - update Street View panorama
        updateStreetViewPosition(data.position, data.heading);
    } else if (data.type === 'campus_demo_phase') {
        // Update campus demo legend based on current phase
        updateCampusDemoLegend(data.phase, data.phaseIndex, data.label);
    } else if (data.type === 'sam_segment') {
        // Trigger segmentation as requested from main window
        const segBtn = document.getElementById('sam-segment-btn');
        if (segBtn) {
            // Simulate user click
            segBtn.click();
        } else {
            // Update status if available
            if (typeof setSamStatus === 'function') setSamStatus('No segmentation UI', false);
        }
    } else {
        // Log unknown message types for debugging new features
        debugLog('Unknown message type:', data.type);
    }
};


// Isovist dashboard loaded from controller/isovist-dashboard.js
// Bird dashboard loaded from controller/bird-dashboard.js



// FCC demo dashboard loaded from controller/fcc-demo-dashboard.js



// Campus demo legend loaded from controller/campus-demo-legend.js



// Slideshow dashboard loaded from controller/slideshow-dashboard.js


function updateMetadata(layerId) {
    welcomeScreen.classList.add('hidden');
    
    // Sun Study uses custom layout - skip standard metadata update
    if (layerId === 'sun-study-btn') {
        return;
    }
    
    const metaLayer = document.getElementById('meta-layer');
    const metaDesc = document.getElementById('meta-desc');
    const legendContent = document.getElementById('legend-content');
    
    // Guard against null elements (can happen if layout was modified)
    if (!metaLayer || !metaDesc || !legendContent) {
        return;
    }
    
    let name = 'None';
    let desc = 'Interactive map of the district. Use controls to toggle layers.';
    let legend = '<p>Select a simulation to view its legend.</p>';

    switch(layerId) {
        case 'ecom-energy-btn':
            name = 'Energy Community';
            desc = 'Hourly electricity flows between campus members, their roof arrays, the battery and the grid.';
            legend = '';
            break;
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
        case 'thermal-comfort-btn':
            name = 'Outdoor Thermal Comfort';
            desc = 'Processed PET surface and live comparison of shortest and coolest walking routes.';
            legend = '<p>Choose the study hour, then click the map to set a walking origin and destination.</p>';
            break;
        case 'sun-study-btn':
            name = 'Sun Study';
            desc = 'Shadow analysis showing sunlight exposure at different times of day/year.';
            legend = '<p>Shadows cast by buildings based on solar position.</p>';
            break;
        case 'slideshow-btn':
            name = 'Slideshow';
            // Use live metadata if available
            if (slideshowState.isActive && slideshowState.metadata) {
                desc = slideshowState.metadata.title || 'Cycling through project visualizations.';
            } else {
                desc = 'Cycling through various data visualizations and views of the project.';
            }
            legend = '<p>See Legend panel for slide-specific legend.</p>';
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
        case 'epc-btn':
            name = 'Energy Performance Certificates';
            desc = 'Building energy classes and certificate details.';
            legend = '<p>Click a building to inspect its EPC.</p>';
            break;
        case 'calibrate-btn':
            name = 'Projector Calibration';
            desc = 'Configure map projection to align with physical model.';
            legend = '';
            break;
        case 'credits-btn':
            name = 'Credits';
            desc = 'The team behind the ACE MR Studio project.';
            legend = '';
            break;
    }

    metaLayer.textContent = name;
    metaDesc.textContent = desc;
    legendContent.innerHTML = legend;
}


// Tour logic loaded from controller/tour.js

// Background animation loaded from controller/bg-animation.js
// Exposes global: setEffect(effectName)

// Start tour initially (now that everything is defined)
startTour();


// Keyboard controls for slideshow navigation when slideshow is active
document.addEventListener('keydown', (e) => {
    // Check if slideshow button is active
    const slideshowBtn = document.querySelector('.control-btn[data-target="slideshow-btn"]');
    if (slideshowBtn && slideshowBtn.classList.contains('active') && slideshowState.isActive) {
        if (e.key === 'ArrowRight' || e.key === ' ') {
            e.preventDefault();
            channel.postMessage({ type: MSG_TYPES.SLIDESHOW_CONTROL, action: 'next' });
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            channel.postMessage({ type: MSG_TYPES.SLIDESHOW_CONTROL, action: 'previous' });
        } else if (e.key === 'Escape') {
            e.preventDefault();
            channel.postMessage({ type: MSG_TYPES.SLIDESHOW_CONTROL, action: 'stop' });
        }
        return;
    }
    
    // Check if campus demo button is active
    const campusDemoBtn = document.querySelector('.control-btn[data-target="campus-demo-btn"]');
    if (campusDemoBtn && campusDemoBtn.classList.contains('active')) {
        if (e.key === ' ') {
            e.preventDefault();
            channel.postMessage({ type: 'campus_demo_control', action: 'autoplay' });
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            channel.postMessage({ type: 'campus_demo_control', action: 'next' });
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            channel.postMessage({ type: 'campus_demo_control', action: 'previous' });
        } else if (e.key === 'Escape') {
            e.preventDefault();
            channel.postMessage({ type: 'campus_demo_control', action: 'stop' });
        }
        return;
    }
});




// Street View + SAM loaded from controller/street-view.js
