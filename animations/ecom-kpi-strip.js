// ECOM KPI strip - the community's headline figures on the display.
//
// The same row the controller shows along its foot: the legend for what the
// colours on the map mean, then self-sufficiency, demand, PV and
// self-consumption. Sits between the optimisation results bar (above) and the
// timeline (below); the costs are in the results bar, so they are not
// repeated here.
//
// Hidden during the introduction, shown once the layer has figures.
//
// Listens on the controller channel for: ecom_kpis (from ecom-energy.js),
// ecom_caption, ecom_release, ecom_change, ecom_empty, animation_state.
//
// Exposes globals: ecomKpiStrip

(function () {
    'use strict';

    const EDGE_PX = 60;
    const BOTTOM_PX = 34;     // on top of the timeline strip
    const HEIGHT_PX = 52;

    const palette = (window.ECOM_PALETTE && window.ECOM_PALETTE.semantic) || {};
    const C = {
        building: palette.building || '#ff00a6',
        pv: palette.pv || '#eaff00',
        grid: palette.grid || '#00ffe5',
        battery: palette.battery || '#fa3600',
        ev: palette.charge_point || '#00ff5e'
    };

    const LEGEND = [
        ['Buildings', C.building], ['Solar', C.pv], ['Grid', C.grid],
        ['Battery', C.battery], ['Charging', C.ev]
    ];

    const percent = function (v) {
        return (Number.isFinite(v) ? v : 0).toFixed(1) + '%';
    };
    const mwh = function (v) {
        const n = Number.isFinite(v) ? v : 0;
        return n >= 1000
            ? (n / 1000).toLocaleString('en-GB', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) + ' MWh'
            : Math.round(n).toLocaleString('en-GB') + ' kWh';
    };

    const CELLS = [
        { key: 'self_sufficiency', label: 'Self-sufficient', colour: C.ev, format: percent },
        { key: 'total_demand', label: 'Total demand', colour: C.building, format: mwh },
        { key: 'total_pv_gen', label: 'PV generated', colour: C.pv, format: mwh },
        { key: 'self_consumption', label: 'Self-consumed', colour: C.ev, format: percent }
    ];

    const style = document.createElement('style');
    style.textContent = [
        '.ecom-kpi-strip{position:fixed;left:' + EDGE_PX + 'px;right:' + EDGE_PX + 'px;',
        'bottom:' + BOTTOM_PX + 'px;height:' + HEIGHT_PX + 'px;z-index:848;',
        'box-sizing:border-box;display:flex;align-items:stretch;padding:0 14px;',
        'background:rgba(6,9,12,0.84);color:#e8eef6;pointer-events:none;',
        'font-family:system-ui,-apple-system,Segoe UI,sans-serif;',
        'border-top:1px solid rgba(255,255,255,0.08);',
        'opacity:0;transition:opacity 700ms ease}',
        '.ecom-kpi-strip.is-on{opacity:1}',
        '.ecom-kpi-strip-legend{display:flex;align-items:center;gap:14px;',
        'padding-right:18px;font-size:12px;white-space:nowrap}',
        '.ecom-kpi-strip-key{display:flex;align-items:center;gap:6px}',
        '.ecom-kpi-strip-dot{width:9px;height:9px;border-radius:50%;flex:none}',
        '.ecom-kpi-strip-cell{flex:1;min-width:0;display:flex;align-items:center;gap:10px;',
        'padding:0 16px;border-left:1px solid rgba(255,255,255,0.08)}',
        '.ecom-kpi-strip-value{font-size:22px;font-weight:650;',
        'font-variant-numeric:tabular-nums;white-space:nowrap}',
        '.ecom-kpi-strip-label{font-size:11px;letter-spacing:0.1em;',
        'text-transform:uppercase;opacity:0.7;white-space:nowrap}'
    ].join('');
    document.head.appendChild(style);

    const strip = document.createElement('div');
    strip.className = 'ecom-kpi-strip';
    strip.setAttribute('aria-hidden', 'true');
    strip.innerHTML =
        '<div class="ecom-kpi-strip-legend">' + LEGEND.map(function (item) {
            return '<span class="ecom-kpi-strip-key"><span class="ecom-kpi-strip-dot" style="background:' +
                item[1] + '"></span>' + item[0] + '</span>';
        }).join('') + '</div>' +
        CELLS.map(function (cell) {
            return '<div class="ecom-kpi-strip-cell">' +
                '<span class="ecom-kpi-strip-value" data-kpi="' + cell.key + '" style="color:' +
                cell.colour + '">–</span>' +
                '<span class="ecom-kpi-strip-label">' + cell.label + '</span></div>';
        }).join('');
    document.body.appendChild(strip);

    let layerOn = false, inIntroduction = false, haveFigures = false, last = null;

    function paint(kpis) {
        last = kpis;
        CELLS.forEach(function (cell) {
            strip.querySelector('[data-kpi="' + cell.key + '"]').textContent =
                cell.format(Number(kpis[cell.key]));
        });
    }

    function sync() {
        const on = layerOn && haveFigures && !inIntroduction;
        strip.classList.toggle('is-on', on);
        strip.setAttribute('aria-hidden', String(!on));
    }

    const channel = new BroadcastChannel('map_controller_channel');
    channel.addEventListener('message', function (event) {
        const data = event.data || {};
        if (data.type === 'ecom_kpis' && data.kpis) {
            layerOn = true;
            haveFigures = true;
            paint(data.kpis);
        } else if (data.type === 'animation_state' && data.animationId === 'ecom-energy-btn') {
            layerOn = !!data.isActive;
        } else if (data.type === 'ecom_caption') {
            inIntroduction = !!(data.caption && typeof data.caption.step === 'number');
        } else if (data.type === 'ecom_release' || data.type === 'ecom_change') {
            inIntroduction = false;
        } else if (data.type === 'ecom_empty') {
            layerOn = false;
        } else {
            return;
        }
        sync();
    });

    window.ecomKpiStrip = {
        isShowing: function () { return strip.classList.contains('is-on'); },
        figures: function () { return last; }
    };
})();
