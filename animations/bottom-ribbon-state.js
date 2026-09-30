// Small, DOM-free state machine shared by the bottom-ribbon selector.
(function (root) {
    'use strict';

    function createBottomRibbonState() {
        const activeOrder = [];
        const available = { isovist: false, ecom: false };
        let selection = 'auto';

        function snapshot() {
            let visible = null;
            if (selection !== 'auto') {
                if (activeOrder.includes(selection) && available[selection]) visible = selection;
            } else {
                for (let i = activeOrder.length - 1; i >= 0; i--) {
                    if (available[activeOrder[i]]) { visible = activeOrder[i]; break; }
                }
            }
            return { selection, visible, active: activeOrder.slice(), available: { ...available } };
        }

        return {
            setActive(id, enabled) {
                if (!(id in available)) return snapshot();
                const index = activeOrder.indexOf(id);
                if (enabled && index < 0) activeOrder.push(id);
                if (!enabled && index >= 0) activeOrder.splice(index, 1);
                if (!enabled && selection === id) selection = 'auto';
                return snapshot();
            },
            setAvailable(id, enabled) {
                if (id in available) available[id] = !!enabled;
                return snapshot();
            },
            select(value) {
                if (value === 'auto' || value in available) selection = value;
                return snapshot();
            },
            snapshot
        };
    }

    createBottomRibbonState.heightFor = function (freeHeight, viewportWidth, screenWidthCm, ribbonHeightCm) {
        const free = Math.max(0, Number(freeHeight) || 0);
        const width = Math.max(0, Number(viewportWidth) || 0);
        const screen = Math.max(0, Number(screenWidthCm) || 0);
        const cm = Math.max(0, Number(ribbonHeightCm) || 0);
        return screen ? Math.min(free, width / screen * cm) : 0;
    };

    root.MR_BOTTOM_RIBBON_STATE = createBottomRibbonState;
})(window);
