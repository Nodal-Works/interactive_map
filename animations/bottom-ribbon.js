// Coordinate the Isovist and ECOM panels that can occupy the map's bottom ribbon.
(function () {
    'use strict';
    if (!window.MR_BOTTOM_RIBBON_STATE) return;

    const state = window.MR_BOTTOM_RIBBON_STATE();
    const channel = new BroadcastChannel('map_controller_channel');
    const colors = {
        'Open View': '#87CEEB', Trees: '#2D5A27', Bostad: '#E57373',
        Verksamhet: '#00ACC1', 'Samhällsfunktion': '#9C27B0',
        Komplementbyggnad: '#FF9800', Unknown: '#888888'
    };
    const order = ['Unknown', 'Komplementbyggnad', 'Samhällsfunktion', 'Verksamhet', 'Bostad', 'Trees', 'Open View'];
    const history = [];
    const gvfHistory = [];
    let currentStats = null;
    let ribbonHeight = NaN;

    const panel = document.createElement('section');
    panel.id = 'isovist-bottom-ribbon';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Live Isovist visibility statistics');
    panel.innerHTML = `
        <div class="isovist-ribbon-title">ISOVIST <span>LIVE VISIBILITY</span></div>
        <div class="isovist-ribbon-current">
            <div class="isovist-ribbon-donut"><span data-gvf>--</span><small>GVF</small></div>
            <div class="isovist-ribbon-counts">
                <span><b data-buildings>0</b> buildings</span>
                <span><b data-trees>0</b> trees</span>
                <span><b data-open>0%</b> open view</span>
            </div>
        </div>
        <div class="isovist-ribbon-chart-wrap">
            <div class="isovist-ribbon-legend" aria-label="Visibility categories"></div>
            <canvas class="isovist-ribbon-chart" role="img" aria-label="Visibility history by category"></canvas>
        </div>
        <div class="isovist-ribbon-average"><small>AVERAGE GVF</small><b data-average>--</b><span data-rating></span></div>`;
    document.body.append(panel);

    const style = document.createElement('style');
    style.textContent = `
        #isovist-bottom-ribbon{position:fixed;left:clamp(12px,4vw,60px);right:clamp(12px,4vw,60px);bottom:0;z-index:850;
            height:var(--isovist-ribbon-height,96px);display:grid;grid-template-columns:110px 210px minmax(220px,1fr) 120px;
            align-items:stretch;gap:14px;padding:9px 14px;box-sizing:border-box;overflow:hidden;pointer-events:none;
            border:1px solid rgba(130,223,194,.45);border-radius:12px 12px 0 0;background:rgba(9,16,23,.94);
            color:#eef3f8;font:12px/1.25 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 -7px 28px #0008}
        #isovist-bottom-ribbon[hidden]{display:none}
        .isovist-ribbon-title{align-self:center;font-weight:750;letter-spacing:.12em;color:#82dfc2}
        .isovist-ribbon-title span{display:block;margin-top:5px;font-size:9px;letter-spacing:.08em;color:#a8b5c2}
        .isovist-ribbon-current{display:flex;align-items:center;gap:12px;min-width:0}
        .isovist-ribbon-donut{width:62px;height:62px;flex:none;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;
            position:relative;background:#26323e;box-shadow:inset 0 0 0 9px #101722;font-size:15px;font-weight:750}
        .isovist-ribbon-donut small{font-size:8px;color:#a8b5c2;letter-spacing:.08em}
        .isovist-ribbon-counts{display:grid;gap:4px;color:#bdc8d3;font-size:10px}
        .isovist-ribbon-counts b{color:#fff;font-size:13px;font-variant-numeric:tabular-nums}
        .isovist-ribbon-chart-wrap{display:grid;grid-template-rows:auto 1fr;min-width:0;min-height:0;gap:4px}
        .isovist-ribbon-legend{display:flex;align-items:center;gap:4px 10px;overflow:hidden;white-space:nowrap;font-size:9px;color:#d1d9e0}
        .isovist-ribbon-legend span{display:inline-flex;align-items:center;gap:3px}
        .isovist-ribbon-legend i{width:7px;height:7px;border-radius:2px;flex:none}
        .isovist-ribbon-chart{width:100%;height:100%;min-height:30px;display:block;border-radius:3px;background:#ffffff08}
        .isovist-ribbon-average{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;text-align:right}
        .isovist-ribbon-average small{font-size:8px;letter-spacing:.08em;color:#9eabb7}
        .isovist-ribbon-average b{font-size:21px;font-variant-numeric:tabular-nums}
        .isovist-ribbon-average span{font-size:10px;font-weight:650}
        @media(max-width:850px){#isovist-bottom-ribbon{left:10px;right:10px;grid-template-columns:78px 160px minmax(150px,1fr) 82px;gap:7px;padding:6px 8px}
            .isovist-ribbon-title{font-size:10px}.isovist-ribbon-donut{width:48px;height:48px;font-size:12px;box-shadow:inset 0 0 0 7px #101722}
            .isovist-ribbon-counts{font-size:9px}.isovist-ribbon-counts b{font-size:11px}.isovist-ribbon-legend{gap:3px 5px;font-size:8px}}
        @media(max-width:580px){#isovist-bottom-ribbon{grid-template-columns:62px minmax(115px,1fr) 62px;gap:5px}
            .isovist-ribbon-chart-wrap{grid-column:1/-1;grid-row:2}.isovist-ribbon-title span{font-size:8px}.isovist-ribbon-legend span:nth-child(n+5){display:none}}
        @media(prefers-reduced-motion:reduce){#isovist-bottom-ribbon{scroll-behavior:auto}}
    `;
    document.head.append(style);

    const ecomPanel = document.querySelector('.ecom-kpi-bottom');
    if (ecomPanel) {
        ecomPanel.hidden = false;
        ecomPanel.style.setProperty('visibility', 'hidden', 'important');
        ecomPanel.style.setProperty('opacity', '0', 'important');
        state.setAvailable('ecom', !!window.ecomKpiBars?.isShowing());
    }

    function currentPercentages(stats) {
        const rays = stats.totalRays || 1;
        const building = stats.buildingTypeRays || {};
        return {
            'Open View': stats.openRays || 0,
            Trees: stats.treeRays || 0,
            Bostad: building.Bostad || 0,
            Verksamhet: building.Verksamhet || 0,
            'Samhällsfunktion': building['Samhällsfunktion'] || 0,
            Komplementbyggnad: building.Komplementbyggnad || 0,
            Unknown: building.Unknown || 0
        };
    }

    function drawHistory() {
        const canvas = panel.querySelector('.isovist-ribbon-chart');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);
        if (history.length < 2) return;
        const dx = width / Math.max(1, history.length - 1);
        order.forEach((name, level) => {
            ctx.beginPath();
            history.forEach((point, i) => {
                const before = order.slice(0, level).reduce((sum, key) => sum + point[key], 0);
                const y = height - (before + point[name]) / 100 * height;
                if (i === 0) ctx.moveTo(0, y); else ctx.lineTo(i * dx, y);
            });
            for (let i = history.length - 1; i >= 0; i--) {
                const before = order.slice(0, level).reduce((sum, key) => sum + history[i][key], 0);
                const y = height - before / 100 * height;
                ctx.lineTo(i * dx, y);
            }
            ctx.closePath(); ctx.fillStyle = colors[name]; ctx.globalAlpha = .85; ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    function renderStats(stats) {
        if (!stats || !Number.isFinite(Number(stats.totalRays))) return;
        currentStats = stats;
        const rays = currentPercentages(stats);
        const percents = Object.fromEntries(order.map(name => [name, 100 * rays[name] / Math.max(1, stats.totalRays)]));
        history.push(percents); if (history.length > 100) history.shift();
        gvfHistory.push(percents.Trees); if (gvfHistory.length > 100) gvfHistory.shift();
        const gvf = percents.Trees;
        const average = gvfHistory.reduce((a, b) => a + b, 0) / gvfHistory.length;
        const donut = panel.querySelector('.isovist-ribbon-donut');
        let angle = 0;
        donut.style.background = 'conic-gradient(' + order.map(name => {
            const from = angle; angle += percents[name] * 3.6;
            return `${colors[name]} ${from}deg ${angle}deg`;
        }).join(', ') + ')';
        panel.querySelector('[data-gvf]').textContent = gvf.toFixed(0) + '%';
        panel.querySelector('[data-buildings]').textContent = String(stats.totalBuildings || 0);
        panel.querySelector('[data-trees]').textContent = String(stats.totalTrees || 0);
        panel.querySelector('[data-open]').textContent = percents['Open View'].toFixed(0) + '%';
        panel.querySelector('[data-average]').textContent = average.toFixed(1) + '%';
        const rating = average >= 30 ? ['Good', '#4caf50'] : average >= 15 ? ['Fair', '#ff9800'] : ['Poor', '#f44336'];
        const ratingNode = panel.querySelector('[data-rating]'); ratingNode.textContent = rating[0]; ratingNode.style.color = rating[1];
        const legend = panel.querySelector('.isovist-ribbon-legend'); legend.replaceChildren();
        order.slice().reverse().forEach(name => {
            const item = document.createElement('span'), dot = document.createElement('i'), label = document.createElement('span');
            dot.style.background = colors[name];
            const short = name === 'Samhällsfunktion' ? 'Public' : name === 'Komplementbyggnad' ? 'Outbldg' : name === 'Verksamhet' ? 'Comm.' : name === 'Bostad' ? 'Resid.' : name === 'Open View' ? 'Open' : name;
            label.textContent = short + ' ' + percents[name].toFixed(0) + '%';
            item.append(dot, label); legend.append(item);
        });
        state.setAvailable('isovist', true);
        render();
        drawHistory();
    }

    function render() {
        const snapshot = state.snapshot();
        const sized = Number.isFinite(ribbonHeight) ? ribbonHeight >= 48 : true;
        if (Number.isFinite(ribbonHeight)) panel.style.setProperty('--isovist-ribbon-height', Math.max(0, ribbonHeight) + 'px');
        panel.hidden = !(sized && snapshot.visible === 'isovist' && currentStats);
        panel.setAttribute('aria-hidden', String(panel.hidden));
        if (ecomPanel) {
            const showEcom = sized && snapshot.visible === 'ecom';
            ecomPanel.style.setProperty('visibility', showEcom ? 'visible' : 'hidden', 'important');
            ecomPanel.style.setProperty('opacity', showEcom ? '1' : '0', 'important');
            ecomPanel.setAttribute('aria-hidden', String(!showEcom));
        }
        channel.postMessage({ type: 'bottom_ribbon_state', state: snapshot });
    }

    channel.addEventListener('message', ({ data }) => {
        if (data?.type === 'animation_state') {
            const id = data.animationId === 'isovist-btn' ? 'isovist' : data.animationId === 'ecom-energy-btn' ? 'ecom' : null;
            if (!id) return;
            const wasActive = state.snapshot().active.includes(id);
            const snapshot = state.setActive(id, !!data.isActive);
            if (id === 'isovist' && data.isActive && !wasActive) {
                history.length = 0; gvfHistory.length = 0; currentStats = null;
                state.setAvailable('isovist', false);
            }
            if (!data.isActive) state.setAvailable(id, false);
            render();
            return;
        }
        if (data?.type === 'bottom_ribbon_select') {
            state.select(data.selection); render(); return;
        }
        if (data?.type === 'bottom_ribbon_request_state') render();
    });
    window.addEventListener('mr-isovist-stats', ({ detail }) => renderStats(detail));
    window.addEventListener('mr-bottom-ribbon-availability', ({ detail }) => {
        if (!detail || detail.id !== 'ecom') return;
        state.setAvailable('ecom', !!detail.available); render();
    });
    window.addEventListener('mr-ribbon-size', ({ detail }) => {
        ribbonHeight = Number(detail?.height);
        if (!Number.isFinite(ribbonHeight)) ribbonHeight = NaN;
        render(); drawHistory();
    });
    window.addEventListener('resize', drawHistory);
    new ResizeObserver(drawHistory).observe(panel);
    window.MR_BOTTOM_RIBBON = { refresh: render, getState: state.snapshot };
    render();
})();
