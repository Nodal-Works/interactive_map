// Manual projector calibration controls and saved presets.
const ORIGINAL_CALIBRATION = {id: 'original', name: 'Original Calibration', author: 'Project default', timestamp: null, ...window.MR_CALIBRATION.original, dimensions: {...window.APP_CONFIG.table}};

function escapeCalibrationText(value) {
    return String(value ?? '').replace(/[&<>\'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
}

function readCalibrationHistory() {
    try {
        return [ORIGINAL_CALIBRATION, ...JSON.parse(localStorage.getItem('interactive_map_calibrations') || '[]')];
    } catch (error) {
        return [ORIGINAL_CALIBRATION];
    }
}

function renderCalibrationHistory(container) {
    if (!container) return;
    const selectedId = localStorage.getItem('interactive_map_selected_calibration') || 'original';
    const calibrations = readCalibrationHistory();
    container.innerHTML = `
        <div class="dashboard-card">
            <div class="dashboard-section-title">Saved Calibrations</div>
            <p class="info-text">Select a calibration to restore it. The original calibration is always available.</p>
            <div style="display: grid; gap: 0.5rem;">
                ${calibrations.map(calibration => `
                    <button class="calibration-tile${calibration.id === selectedId ? ' active' : ''}" data-calibration-id="${escapeCalibrationText(calibration.id)}" style="text-align: left; padding: 0.65rem; border: 1px solid ${calibration.id === selectedId ? '#4ade80' : '#4a4a4a'}; border-radius: 6px; background: ${calibration.id === selectedId ? '#263b2b' : '#333'}; color: #e0e0e0; cursor: pointer;">
                        <strong>${escapeCalibrationText(calibration.name)}</strong><br>
                        <small>${escapeCalibrationText(calibration.author || 'Unknown author')} · ${calibration.timestamp ? escapeCalibrationText(new Date(calibration.timestamp).toLocaleString()) : 'Built-in default'}</small>
                    </button>
                `).join('')}
            </div>
        </div>
    `;
    container.querySelectorAll('[data-calibration-id]').forEach(tile => {
        tile.addEventListener('click', () => {
            const calibration = calibrations.find(item => item.id === tile.dataset.calibrationId);
            if (!calibration) return;
            localStorage.setItem('interactive_map_selected_calibration', calibration.id);
            channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'load_calibration', calibration });
            renderCalibrationHistory(container);
        });
    });
}

function refreshSavedCalibrationSelect() {
    const select = document.getElementById('ctrl-saved-calibration');
    if (!select) return;
    select.innerHTML = '<option value="">Select saved calibration...</option>';
    readCalibrationHistory().slice(1).forEach(calibration => {
        const option = document.createElement('option');
        option.value = calibration.id;
        option.textContent = `${calibration.name} - ${calibration.author || 'Unknown'} (${new Date(calibration.timestamp).toLocaleString()})`;
        select.appendChild(option);
    });
}


function renderManualCalibration(dashboardTitle, legendTitle, dashboardContent, legendContent) {
    if (dashboardTitle) dashboardTitle.textContent = 'Calibration Controls';
    if (legendTitle) legendTitle.textContent = 'Instructions';

    dashboardContent.innerHTML = `
        <div class="dashboard-container">
            <div class="dashboard-card">
                <div class="dashboard-section-title">Manual Calibration</div>

                <div class="control-row">
                    <span class="control-label">Screen Width (cm)</span>
                    <input type="number" id="ctrl-screen-w" class="modern-date" value="111.93" step="0.1" style="width: 80px;">
                </div>
                <div class="control-row">
                    <span class="control-label">Screen Height (cm)</span>
                    <input type="number" id="ctrl-screen-h" class="modern-date" value="62.96" step="0.1" style="width: 80px;">
                </div>
                <div class="control-row">
                    <span class="control-label">Table Width (cm)</span>
                    <input type="number" id="ctrl-table-w" class="modern-date" value="100" step="0.1" style="width: 80px;">
                </div>
                <div class="control-row">
                    <span class="control-label">Table Height (cm)</span>
                    <input type="number" id="ctrl-table-h" class="modern-date" value="60" step="0.1" style="width: 80px;">
                </div>

                <div class="action-grid">
                    <button id="ctrl-show-overlay" class="modern-btn">Show Overlay</button>
                    <button id="ctrl-hide-overlay" class="modern-btn">Hide Overlay</button>
                </div>

                <div style="margin-top: 1rem;">
                    <button id="ctrl-calibrate-fit" class="modern-btn primary" style="width: 100%;">Copy Current Calibration</button>
                </div>
                <div class="control-row" style="margin-top: 1rem;">
                    <span class="control-label">Calibration Name</span>
                    <input type="text" id="ctrl-calibration-name" class="modern-date" placeholder="e.g. Projector 1" style="width: 150px;">
                </div>
                <div class="control-row">
                    <span class="control-label">Author</span>
                    <input type="text" id="ctrl-calibration-author" class="modern-date" placeholder="Your name" style="width: 150px;">
                </div>
                <div class="action-grid">
                    <button id="ctrl-save-calibration" class="modern-btn">Save Calibration</button>
                    <button id="ctrl-overwrite-calibration" class="modern-btn primary">Overwrite Existing Calibration Settings</button>
                </div>
                <div class="control-row">
                    <span class="control-label">Restore Saved Calibration</span>
                    <select id="ctrl-saved-calibration" class="modern-date" style="width: 150px;">
                        <option value="">Select saved calibration...</option>
                    </select>
                </div>
            </div>

            <div class="dashboard-card">
                <div class="dashboard-section-title">Map Adjustment</div>
                <div class="action-grid" style="grid-template-columns: repeat(3, 1fr);">
                    <button id="ctrl-rotate-left" class="modern-btn"><span class="material-icons">rotate_left</span></button>
                    <button id="ctrl-reset-rotation" class="modern-btn">Reset</button>
                    <button id="ctrl-rotate-right" class="modern-btn"><span class="material-icons">rotate_right</span></button>
                </div>
                <div class="action-grid">
                    <button id="ctrl-zoom-in" class="modern-btn"><span class="material-icons">add</span> Zoom</button>
                    <button id="ctrl-zoom-out" class="modern-btn"><span class="material-icons">remove</span> Zoom</button>
                </div>
                <div class="action-grid" style="grid-template-columns: repeat(3, 1fr);">
                    <span></span>
                    <button id="ctrl-pan-up" class="modern-btn" title="Pan up"><span class="material-icons">keyboard_arrow_up</span></button>
                    <span></span>
                    <button id="ctrl-pan-left" class="modern-btn" title="Pan left"><span class="material-icons">keyboard_arrow_left</span></button>
                    <span></span>
                    <button id="ctrl-pan-right" class="modern-btn" title="Pan right"><span class="material-icons">keyboard_arrow_right</span></button>
                    <span></span>
                    <button id="ctrl-pan-down" class="modern-btn" title="Pan down"><span class="material-icons">keyboard_arrow_down</span></button>
                    <span></span>
                </div>
                <div style="margin-top: 1rem;">
                    <button id="ctrl-lock-center" class="modern-btn" style="width: 100%;">Lock Center</button>
                </div>
                <div style="margin-top: 0.5rem;">
                    <button id="ctrl-toggle-table-markers" class="modern-btn" style="width: 100%;">Toggle Table Markers</button>
                </div>
            </div>
        </div>
    `;

    renderCalibrationHistory(legendContent);

    // Add event listeners for manual calibration
    document.getElementById('ctrl-show-overlay').addEventListener('click', () => {
        const sw = document.getElementById('ctrl-screen-w').value;
        const sh = document.getElementById('ctrl-screen-h').value;
        const tw = document.getElementById('ctrl-table-w').value;
        const th = document.getElementById('ctrl-table-h').value;
        channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'show_overlay', params: { sw, sh, tw, th } });
    });

    document.getElementById('ctrl-hide-overlay').addEventListener('click', () => {
        channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'hide_overlay' });
    });

    document.getElementById('ctrl-calibrate-fit').addEventListener('click', () => {
        channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'copy_calibration' });
    });

    const calibrationNameInput = document.getElementById('ctrl-calibration-name');
    const calibrationAuthorInput = document.getElementById('ctrl-calibration-author');
    const savedCalibrationSelect = document.getElementById('ctrl-saved-calibration');
    const calibrationDimensionInputs = {
        screenWidth: document.getElementById('ctrl-screen-w'),
        screenHeight: document.getElementById('ctrl-screen-h'),
        tableWidth: document.getElementById('ctrl-table-w'),
        tableHeight: document.getElementById('ctrl-table-h')
    };

    Object.entries(calibrationDimensionInputs).forEach(([key, input]) => {input.value = window.MR_CALIBRATION.dimensions[key];});
    try {
        const selectedId = localStorage.getItem('interactive_map_selected_calibration');
        const selected = readCalibrationHistory().find(item => item.id === selectedId);
        const calibration = selected || JSON.parse(localStorage.getItem('interactive_map_default_calibration') || 'null');
        if (calibration?.dimensions) {
            Object.entries(calibrationDimensionInputs).forEach(([key, input]) => {
                if (calibration.dimensions[key] !== undefined) input.value = calibration.dimensions[key];
            });
        }
    } catch (error) {
        console.warn('Could not load saved calibration dimensions');
    }

    refreshSavedCalibrationSelect();

    document.getElementById('ctrl-save-calibration').addEventListener('click', () => {
        const name = calibrationNameInput.value.trim();
        if (!name) {
            alert('Enter a calibration name first.');
            calibrationNameInput.focus();
            return;
        }
        channel.postMessage({
            type: MSG_TYPES.CALIBRATE_ACTION,
            action: 'save_calibration',
            name,
            author: calibrationAuthorInput.value.trim(),
            dimensions: Object.fromEntries(Object.entries(calibrationDimensionInputs).map(([key, input]) => [key, Number(input.value)]))
        });
    });

    document.getElementById('ctrl-overwrite-calibration').addEventListener('click', () => {
        const name = calibrationNameInput.value.trim() || 'Default Calibration';
        channel.postMessage({
            type: MSG_TYPES.CALIBRATE_ACTION,
            action: 'overwrite_default_calibration',
            name,
            author: calibrationAuthorInput.value.trim(),
            dimensions: Object.fromEntries(Object.entries(calibrationDimensionInputs).map(([key, input]) => [key, Number(input.value)]))
        });
    });

    savedCalibrationSelect.addEventListener('change', () => {
        if (!savedCalibrationSelect.value) return;
        const calibration = readCalibrationHistory().find(item => item.id === savedCalibrationSelect.value);
        if (calibration) {
            localStorage.setItem('interactive_map_selected_calibration', calibration.id);
            if (calibration.dimensions) {
                Object.entries(calibrationDimensionInputs).forEach(([key, input]) => {
                    if (calibration.dimensions[key] !== undefined) input.value = calibration.dimensions[key];
                });
            }
            channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'load_calibration', calibration });
        }
    });

    document.getElementById('ctrl-zoom-in').addEventListener('click', () => channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'zoom_in' }));
    document.getElementById('ctrl-zoom-out').addEventListener('click', () => channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'zoom_out' }));
    document.getElementById('ctrl-pan-up').addEventListener('click', () => channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'pan_up' }));
    document.getElementById('ctrl-pan-left').addEventListener('click', () => channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'pan_left' }));
    document.getElementById('ctrl-pan-right').addEventListener('click', () => channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'pan_right' }));
    document.getElementById('ctrl-pan-down').addEventListener('click', () => channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'pan_down' }));
    document.getElementById('ctrl-rotate-left').addEventListener('click', () => channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'rotate_left' }));
    document.getElementById('ctrl-rotate-right').addEventListener('click', () => channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'rotate_right' }));
    document.getElementById('ctrl-reset-rotation').addEventListener('click', () => channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'reset_rotation' }));

    const lockBtn = document.getElementById('ctrl-lock-center');
    lockBtn.addEventListener('click', () => {
        lockBtn.classList.toggle('active');
        channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'lock_center', value: lockBtn.classList.contains('active') });
    });

    const toggleTableMarkersBtn = document.getElementById('ctrl-toggle-table-markers');
    toggleTableMarkersBtn.addEventListener('click', () => {
        toggleTableMarkersBtn.classList.toggle('active');
        channel.postMessage({ type: MSG_TYPES.CALIBRATE_ACTION, action: 'toggle_table_markers', value: toggleTableMarkersBtn.classList.contains('active') });
    });

    return;
}
