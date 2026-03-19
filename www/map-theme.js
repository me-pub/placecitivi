(function () {
    'use strict';

    const STORAGE_KEY = 'cctv-map-theme-provider';
    const CHANGE_EVENT = 'cctv-map-theme-change';

    const THEMES = [
        {
            key: 'default',
            label: 'Default',
            tile_url: '',
            tile_attribution: '',
        },
        {
            key: 'osm',
            label: 'OSM Standard',
            tile_url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            tile_attribution: '&copy; OpenStreetMap contributors',
        },
        {
            key: 'carto-light',
            label: 'Carto Positron',
            tile_url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
            tile_attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        },
        {
            key: 'carto-dark',
            label: 'Carto Dark Matter',
            tile_url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            tile_attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        },
        {
            key: 'esri-satellite',
            label: 'Esri Satellite',
            tile_url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            tile_attribution: 'Tiles &copy; Esri',
        },
    ];

    function getSelectedKey() {
        try {
            return localStorage.getItem(STORAGE_KEY) || 'default';
        } catch (e) {
            return 'default';
        }
    }

    function findTheme(key) {
        return THEMES.find((item) => item.key === key) || THEMES[0];
    }

    function setSelectedKey(key) {
        const theme = findTheme(key);
        try {
            localStorage.setItem(STORAGE_KEY, theme.key);
        } catch (e) {
            // ignore storage failures
        }
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, {detail: theme}));
    }

    function getThemeOverride() {
        const theme = findTheme(getSelectedKey());
        if (!theme || theme.key === 'default') return null;
        return {
            key: theme.key,
            tile_url: theme.tile_url,
            tile_attribution: theme.tile_attribution,
        };
    }

    function ensureControl(nav) {
        if (!nav || nav.querySelector('.map-theme-wrap')) return;

        const wrap = document.createElement('div');
        wrap.className = 'map-theme-wrap';

        const label = document.createElement('label');
        label.className = 'map-theme-label';
        label.setAttribute('for', 'mapThemeSelect');
        label.textContent = 'Map';

        const select = document.createElement('select');
        select.id = 'mapThemeSelect';
        select.className = 'map-theme-select';
        THEMES.forEach((item) => {
            const option = document.createElement('option');
            option.value = item.key;
            option.textContent = item.label;
            select.appendChild(option);
        });
        select.value = getSelectedKey();
        select.addEventListener('change', (ev) => {
            setSelectedKey(ev.target.value);
        });

        wrap.appendChild(label);
        wrap.appendChild(select);
        nav.appendChild(wrap);
    }

    function initControls() {
        document.querySelectorAll('header nav').forEach((nav) => ensureControl(nav));
    }

    window.CCTVMapTheme = {
        THEMES: THEMES.slice(),
        getSelectedKey,
        setSelectedKey,
        getThemeOverride,
        CHANGE_EVENT,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initControls);
    } else {
        initControls();
    }
})();
