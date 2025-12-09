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
    });
});

document.getElementById('reset-view-btn').addEventListener('click', () => {
    channel.postMessage({
        type: 'reset_view'
    });
});

document.getElementById('fullscreen-btn').addEventListener('click', () => {
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
                 } else {
                     b.classList.remove('active');
                 }
             });
        }
    }
};

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
    { selector: '#fullscreen-btn', title: 'Full Screen', desc: 'Toggle full screen mode for this controller.' }
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
