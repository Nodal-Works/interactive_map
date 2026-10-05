// Street View panoramas for Universeum.
let streetViewApiKey = null;
let streetViewCurrentPosition = null;
let streetViewCurrentHeading = 0;

async function loadStreetViewConfig() {
    if (window.MR_SERVICES) { streetViewApiKey = 'local-host'; return true; }
    if (streetViewApiKey) return true;
    try {
        const response = await fetch('trafik-config.json');
        const config = await response.json();
        streetViewApiKey = config.streetViewApiKey;
        console.log('Street View API key loaded');
        return true;
    } catch (e) {
        console.warn('Could not load Street View API key:', e);
        return false;
    }
}

function initStreetViewControls() {
    const leftBtn = document.getElementById('sv-rotate-left');
    const rightBtn = document.getElementById('sv-rotate-right');

    if (leftBtn) {
        leftBtn.addEventListener('click', () => {
            streetViewCurrentHeading = (streetViewCurrentHeading - 45 + 360) % 360;
            if (streetViewCurrentPosition) {
                updateStreetViewImage();
            }
        });
    }

    if (rightBtn) {
        rightBtn.addEventListener('click', () => {
            streetViewCurrentHeading = (streetViewCurrentHeading + 45) % 360;
            if (streetViewCurrentPosition) {
                updateStreetViewImage();
            }
        });
    }
}

function updateStreetViewImage() {
    const img = document.getElementById('street-view-image');
    const noCoverageMsg = document.getElementById('street-view-no-coverage');
    const coordsDisplay = document.getElementById('street-view-coords');
    const controls = document.getElementById('street-view-heading-controls');

    if (!img || !streetViewApiKey || !streetViewCurrentPosition) return;

    const { lat, lng } = streetViewCurrentPosition;

    // Update coordinates display
    if (coordsDisplay) {
        coordsDisplay.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)} | Heading: ${streetViewCurrentHeading}°`;
    }

    // Build Street View Static API URL
    const size = '640x350';
    const url = window.MR_SERVICES ? `/api/streetview?lat=${lat}&lng=${lng}&heading=${streetViewCurrentHeading}` : `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${lat},${lng}&heading=${streetViewCurrentHeading}&pitch=0&fov=100&key=${streetViewApiKey}`;

    // Set up image load handlers
    img.onload = () => {
        // Check if we got an actual image (not the "no imagery" placeholder)
        // The static API returns a gray image with text if no coverage
        img.style.display = 'block';
        if (noCoverageMsg) noCoverageMsg.style.display = 'none';
        if (coordsDisplay) coordsDisplay.style.display = 'block';
        if (controls) controls.style.display = 'flex';
    };

    img.onerror = () => {
        img.style.display = 'none';
        if (coordsDisplay) coordsDisplay.style.display = 'none';
        if (noCoverageMsg) {
            noCoverageMsg.innerHTML = `
                <span style="font-size: 48px; margin-bottom: 12px;">📷</span>
                <span style="font-size: 16px; margin-bottom: 4px;">No Street View Coverage</span>
                <span style="font-size: 12px; color: #555;">Try clicking a different location on the map</span>
            `;
            noCoverageMsg.style.display = 'flex';
        }
        if (controls) controls.style.display = 'none';
    };

    if (window.MR_REMOTE_FETCH) {
        const requested = url;
        img.dataset.request = requested;
        fetch(url).then(r => { if (!r.ok) throw Error('Street View unavailable'); return r.blob(); }).then(blob => {
            if (img.dataset.request !== requested) return;
            if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
            img.src = URL.createObjectURL(blob);
        }).catch(() => img.onerror());
    } else img.src = url;
}

function updateStreetViewPosition(position, heading) {
    streetViewCurrentPosition = position;
    // Use provided heading or keep current if not provided
    if (heading !== undefined) {
        streetViewCurrentHeading = Math.round(heading);
    }

    // Load API key if needed
    if (!streetViewApiKey) {
        loadStreetViewConfig().then(hasKey => {
            if (hasKey) {
                updateStreetViewImage();
            }
        });
        return;
    }

    updateStreetViewImage();
}
