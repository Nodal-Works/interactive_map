// Hourly energy story at the near edge of the projection table.
// The map owns the calculation; this panel only presents its dispatch reading.
(function () {
    'use strict';
    const palette = (window.ECOM_PALETTE && window.ECOM_PALETTE.semantic) || {};
    const style = document.createElement('style');
    style.textContent = `
        .ecom-flow-panel{--solar:${palette.pv || '#eaff00'};--battery:${palette.battery || '#fa3600'};--grid:${palette.grid || '#00ffe5'};
            position:fixed;left:60px;right:60px;bottom:42px;z-index:850;box-sizing:border-box;
            transform:scaleY(.81);transform-origin:bottom center;
            padding:15px 22px 17px;border:1px solid #34404b;border-radius:16px;
            background:rgba(6,12,18,.95);color:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,sans-serif;
            pointer-events:none;opacity:0;visibility:hidden;transition:opacity .5s;box-shadow:0 8px 32px #0008}
        .ecom-flow-panel.is-on{opacity:1;visibility:visible}
        .ecom-flow-header{display:flex;align-items:baseline;gap:16px;margin-bottom:14px;padding-right:135px}
        .ecom-flow-header strong{font-size:17px}.ecom-flow-time{font-size:14px;color:#c2ceda}
        .ecom-flow-context{margin-left:auto;font-size:12px;color:#b3c2ce}
        .ecom-flow-body{display:grid;grid-template-columns:1fr 1.25fr 1.1fr 2fr;gap:22px}
        .ecom-flow-card{min-width:0;border-left:1px solid #34404b;padding-left:22px}
        .ecom-flow-card:first-child{border:0;padding:0}
        .ecom-flow-label{font-size:12px;font-weight:650;letter-spacing:.1em;text-transform:uppercase;color:#c2ceda}
        .ecom-flow-number{font-size:30px;font-weight:700;line-height:1.25;font-variant-numeric:tabular-nums;white-space:nowrap}
        .ecom-flow-number small{font-size:14px;font-weight:500;color:#c2ceda}
        .ecom-flow-note{font-size:13px;color:#c2ceda;margin-top:5px;line-height:1.45}
        .ecom-flow-solar{color:var(--solar)}.ecom-flow-battery{color:var(--battery)}.ecom-flow-grid{color:var(--grid)}
        .ecom-flow-route{display:flex;align-items:center;gap:8px;font-size:13px;line-height:1.8;color:#c2ceda}
        .ecom-flow-route b{margin-left:auto;white-space:nowrap;font-variant-numeric:tabular-nums;color:#f1f5f9}
        .ecom-flow-arrow{color:#667582}.ecom-flow-route.is-active .ecom-flow-arrow{color:var(--solar);animation:ecom-flow-pulse 1.8s ease-in-out infinite}
        .ecom-flow-track{height:18px;display:flex;overflow:hidden;border-radius:6px;background:#28333e;margin:9px 0}
        .ecom-flow-segment{height:100%;transition:width .5s ease}
        .ecom-flow-key{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;line-height:1.5}
        .ecom-flow-key span:before{content:'';display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;background:currentColor}
        @keyframes ecom-flow-pulse{50%{opacity:.35;transform:translateX(3px)}}
        @media(prefers-reduced-motion:reduce){.ecom-flow-panel,.ecom-flow-segment{transition:none}.ecom-flow-route.is-active .ecom-flow-arrow{animation:none}}
        @media(min-width:1800px){.ecom-flow-panel{padding:20px 28px 24px}.ecom-flow-number{font-size:38px}.ecom-flow-route,.ecom-flow-note,.ecom-flow-key{font-size:16px}.ecom-flow-label{font-size:14px}}
        @media(max-width:1050px){.ecom-flow-panel{left:18px;right:18px}.ecom-flow-body{gap:12px;grid-template-columns:1fr 1.2fr 1fr 1.6fr}.ecom-flow-card{padding-left:12px}.ecom-flow-number{font-size:24px}.ecom-flow-context{display:none}}
        @media(max-width:720px){.ecom-flow-body{grid-template-columns:1fr 1fr;gap:14px}.ecom-flow-card:nth-child(3){border:0;padding:0}.ecom-flow-header{padding-right:0;flex-wrap:wrap;gap:5px 12px}.ecom-flow-panel{bottom:48px;padding:12px}}
    `;
    document.head.appendChild(style);
    const panel = document.createElement('section');
    panel.className = 'ecom-flow-panel ecom-kpi-bottom';
    panel.setAttribute('aria-label', 'Community energy flow for the displayed simulation hour');
    panel.innerHTML = `
        <div class="ecom-flow-header"><strong>Community energy flow</strong><span class="ecom-flow-time"></span><span class="ecom-flow-context"></span></div>
        <div class="ecom-flow-body">
            <div class="ecom-flow-card"><div class="ecom-flow-label">☀ Solar PV</div><div class="ecom-flow-number ecom-flow-solar" data-value="solar"></div><div class="ecom-flow-note" data-value="solarState"></div></div>
            <div class="ecom-flow-card"><div class="ecom-flow-label">Where solar goes</div>
                <div class="ecom-flow-route" data-route="direct"><span class="ecom-flow-arrow">→</span> Used directly <b></b></div>
                <div class="ecom-flow-route" data-route="solarToBattery"><span class="ecom-flow-arrow">→</span> To battery <b></b></div>
                <div class="ecom-flow-route" data-route="solarToGrid"><span class="ecom-flow-arrow">→</span> To grid <b></b></div>
            </div>
            <div class="ecom-flow-card"><div class="ecom-flow-label">▰ Battery</div><div class="ecom-flow-number ecom-flow-battery" data-value="battery"></div><div class="ecom-flow-note" data-value="batteryState"></div><div class="ecom-flow-note" data-value="batterySource"></div></div>
            <div class="ecom-flow-card"><div class="ecom-flow-label">Buildings + EV demand</div><div class="ecom-flow-number" data-value="demand"></div>
                <div class="ecom-flow-track" role="img"><div class="ecom-flow-segment" data-segment="direct" style="background:var(--solar)"></div><div class="ecom-flow-segment" data-segment="batteryToDemand" style="background:var(--battery)"></div><div class="ecom-flow-segment" data-segment="gridToDemand" style="background:var(--grid)"></div></div>
                <div class="ecom-flow-key"><span class="ecom-flow-solar" data-share="direct"></span><span class="ecom-flow-battery" data-share="batteryToDemand"></span><span class="ecom-flow-grid" data-share="gridToDemand"></span></div>
                <div class="ecom-flow-note" data-value="gridState"></div>
            </div>
        </div>`;
    document.body.appendChild(panel);
    // Match the Street Life QR ribbon's calibrated height, including settings
    // and table-transform changes. Measure untransformed content to avoid drift.
    function fitRibbon() {
        const height = parseFloat(getComputedStyle(document.documentElement)
            .getPropertyValue('--mr-bottom-ribbon-height'));
        if (!Number.isFinite(height) || !panel.offsetHeight) return;
        panel.style.bottom = '0px';
        panel.style.transform = 'scaleY(' + Math.max(0, height) / panel.offsetHeight + ')';
    }
    window.addEventListener('mr-ribbon-size', fitRibbon);
    new ResizeObserver(fitRibbon).observe(panel);
    fitRibbon();
    const channel = new BroadcastChannel('map_controller_channel');
    let layerOn = false, inIntroduction = false, settled = false, reading = null, settleTimer = null;
    const number = v => v > 0 && v < .1 ? '<0.1' : v.toLocaleString('en-GB', { maximumFractionDigits: v < 100 ? 1 : 0 });
    const power = v => number(v) + ' kW';
    const put = (key, text) => { panel.querySelector('[data-value="' + key + '"]').textContent = text; };
    function syncVisibility() {
        const on = layerOn && !!reading && settled && !inIntroduction;
        panel.classList.toggle('is-on', on);
        panel.setAttribute('aria-hidden', String(!on));
    }
    function render(r) {
        reading = r;
        const hour = String(r.hour % 24).padStart(2, '0');
        panel.querySelector('.ecom-flow-time').textContent = 'Day ' + (Math.floor(r.hour / 24) + 1) + ' · ' + hour + ':00 · hourly average';
        put('solar', power(r.solar));
        put('solarState', r.solar > 0 ? 'Generating power' : 'No solar generation');
        ['direct', 'solarToBattery', 'solarToGrid'].forEach(key => {
            const row = panel.querySelector('[data-route="' + key + '"]');
            row.querySelector('b').textContent = power(r[key]);
            row.classList.toggle('is-active', r[key] > 0);
        });
        put('battery', r.hasBattery ? power(Math.max(r.batteryIn, r.batteryOut)) : '—');
        put('batteryState', !r.hasBattery ? 'No battery installed' : r.batteryIn > 0 && r.batteryOut > 0 ? 'Charging + discharging' : r.batteryIn > 0 ? 'Charging' : r.batteryOut > 0 ? 'Discharging' : 'Idle');
        const batteryDetails = [];
        if (r.solarToBattery > 0) batteryDetails.push(power(r.solarToBattery) + ' from solar');
        if (r.gridToBattery > 0) batteryDetails.push(power(r.gridToBattery) + ' from grid');
        if (r.batteryToDemand > 0) batteryDetails.push(power(r.batteryToDemand) + ' to demand');
        if (r.batteryToGrid > 0) batteryDetails.push(power(r.batteryToGrid) + ' to grid');
        put('batterySource', batteryDetails.join(' · '));
        put('demand', power(r.demand));
        const shares = [];
        [['direct', 'Solar'], ['batteryToDemand', 'Battery'], ['gridToDemand', 'Grid']].forEach(([key, label]) => {
            const share = r.demand > 0 ? Math.max(0, Math.min(100, r[key] / r.demand * 100)) : 0;
            panel.querySelector('[data-segment="' + key + '"]').style.width = share + '%';
            const text = label + ' ' + number(share) + '%';
            panel.querySelector('[data-share="' + key + '"]').textContent = text;
            shares.push(text);
        });
        panel.querySelector('.ecom-flow-track').setAttribute('aria-label', 'Demand supplied by: ' + shares.join(', '));
        put('gridState', r.demand === 0 ? 'No demand this hour' : r.gridToDemand > 0 ? power(r.gridToDemand) + ' of demand supplied by grid' : 'Demand fully met on campus');
        syncVisibility();
    }
    channel.addEventListener('message', function (event) {
        const data = event.data || {};
        if (data.type === 'ecom_energy_flow' && data.reading) {
            layerOn = true;
            if (!reading && !settleTimer) settleTimer = setTimeout(() => { settled = true; syncVisibility(); }, 1800);
            render(data.reading);
        } else if (data.type === 'ecom_kpis' && data.kpis) {
            panel.querySelector('.ecom-flow-context').textContent = (data.kpis.members || 0) + ' buildings · ' + (data.kpis.chargers || 0) + (data.kpis.chargers === 1 ? ' charge point' : ' charge points');
        } else if (data.type === 'animation_state' && data.animationId === 'ecom-energy-btn') {
            layerOn = !!data.isActive;
            if (layerOn) channel.postMessage({ type: 'ecom_energy_flow_request' });
            syncVisibility();
        } else if (data.type === 'ecom_caption') {
            inIntroduction = !!(data.caption && typeof data.caption.step === 'number');
            syncVisibility();
        } else if (data.type === 'ecom_release' || data.type === 'ecom_change') {
            inIntroduction = false;
            settled = true;
            syncVisibility();
        }
    });
    syncVisibility();
    channel.postMessage({ type: 'ecom_energy_flow_request' });
    window.ecomKpiBars = {
        isShowing: () => panel.classList.contains('is-on'),
        why: () => ({ layerOn, haveFigures: !!reading, settled, inIntroduction }),
        shown: () => reading,
        target: () => reading
    };
})();
