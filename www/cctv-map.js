(function () {
    'use strict';

    const DEFAULTS = {
        center_lat: 0,
        center_lng: 0,
        zoom: 2,
        corporate_name: 'CCTV Map',
        corporate_logo: '',
        tile_url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        tile_attribution: '&copy; OpenStreetMap contributors',
    };

    /** @param {string} s */
    function esc(s) {
        return String(s || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function wrapLng(lng) {
        if (!Number.isFinite(lng)) return lng;
        let x = ((lng + 180) % 360 + 360) % 360 - 180;
        if (Object.is(x, -0)) x = 0;
        return x;
    }

    function $(id) {
        return document.getElementById(id);
    }

    function resolveTileSettings(settings) {
        const fallbackURL = settings.tile_url || DEFAULTS.tile_url;
        const fallbackAttr = settings.tile_attribution || DEFAULTS.tile_attribution;
        const api = window.CCTVMapTheme;
        const override = api && typeof api.getThemeOverride === 'function'
            ? api.getThemeOverride()
            : null;
        if (!override) {
            return {tileURL: fallbackURL, tileAttr: fallbackAttr};
        }
        return {
            tileURL: override.tile_url || fallbackURL,
            tileAttr: override.tile_attribution || fallbackAttr,
        };
    }

    function createStreamElement(stream) {
        /** @type {any} */
        const video = document.createElement('video-stream');
        video.style.height = '100%';
        video.style.width = '100%';
        video.src = new URL('api/ws?src=' + encodeURIComponent(stream), location.href);
        return video;
    }

    function stopStreamElement(video) {
        if (!video) return;
        try {
            video.background = false;
        } catch (e) {
            // ignore
        }
        try {
            if (typeof video.ondisconnect === 'function') {
                video.ondisconnect();
            }
        } catch (e) {
            // ignore
        }
        try {
            video.remove();
        } catch (e) {
            // ignore
        }
    }

    async function loadData() {
        const r = await fetch(new URL('api/cctv/public', location.href), {cache: 'no-cache'});
        if (!r.ok) throw new Error('Failed to load CCTV data');
        return await r.json();
    }

    function applyBranding(settings) {
        const name = settings.corporate_name || DEFAULTS.corporate_name;
        $('corpName').textContent = name;
        document.title = name;
        const tag = $('corpTag');
        if (tag) tag.textContent = 'Live Map';

        const logo = settings.corporate_logo || '';
        const img = $('corpLogo');
        if (logo) {
            img.src = logo;
            img.style.display = 'block';
        } else {
            img.style.display = 'none';
        }
    }

    function initMap(settings, cameras) {
        const centerLat = Number.isFinite(settings.center_lat) ? settings.center_lat : DEFAULTS.center_lat;
        const centerLng = Number.isFinite(settings.center_lng) ? wrapLng(settings.center_lng) : DEFAULTS.center_lng;
        const zoom = Number.isFinite(settings.zoom) ? settings.zoom : DEFAULTS.zoom;

        const map = L.map('map', {zoomControl: true, worldCopyJump: true}).setView([centerLat, centerLng], zoom);

        let tile = null;
        const applyTiles = () => {
            const t = resolveTileSettings(settings);
            if (tile) {
                try { map.removeLayer(tile); } catch (e) {}
                tile = null;
            }
            tile = L.tileLayer(t.tileURL, {attribution: t.tileAttr, maxZoom: 22}).addTo(map);
        };
        applyTiles();
        window.addEventListener('cctv-map-theme-change', applyTiles);

        for (const cam of cameras || []) {
            if (!Number.isFinite(cam.lat) || !Number.isFinite(cam.lng)) continue;
            const marker = L.marker([cam.lat, wrapLng(cam.lng)]).addTo(map);

            let popupVideo = null;
            const title = esc(cam.name || 'Camera');
            const desc = esc(cam.description || '');
            const streamHint = cam.stream ? `<div style=\"color:#666;font-size:12px\">stream: ${esc(cam.stream)}</div>` : '';

            const popupRoot = document.createElement('div');
            popupRoot.innerHTML = `
                <div class=\"popup-title\">${title}</div>
                ${desc ? `<div>${desc}</div>` : ''}
                ${streamHint}
                ${cam.stream ? `
                    <div class=\"popup-player\" data-role=\"player\"></div>
                    <div class=\"popup-actions\">
                        <a class=\"btn\" style=\"text-decoration:none;display:inline-block\" href=\"stream.html?src=${encodeURIComponent(cam.stream)}\">Open</a>
                    </div>
                ` : `<div class=\"hint\">No stream configured for this camera.</div>`}
            `;

            marker.bindPopup(popupRoot, {maxWidth: 760});

            marker.on('popupopen', (ev) => {
                const host = popupRoot.querySelector('[data-role=\"player\"]');
                if (!host || !cam.stream) return;

                const mount = () => {
                    // popup might already be closed
                    if (!host.isConnected) return;

                    stopStreamElement(popupVideo);
                    host.innerHTML = '';

                    popupVideo = createStreamElement(cam.stream);
                    host.appendChild(popupVideo);
                };

                if (customElements.get('video-stream')) {
                    mount();
                    return;
                }

                host.innerHTML = '<div class="hint">Loading player...</div>';
                customElements.whenDefined('video-stream').then(mount).catch(() => {
                    // ignore
                });
            });

            marker.on('popupclose', () => {
                stopStreamElement(popupVideo);
                popupVideo = null;
            });
        }
    }

    (async () => {
        try {
            const data = await loadData();
            const settings = Object.assign({}, DEFAULTS, data.settings || data.Settings || {});
            const cameras = data.cameras || data.Cameras || [];
            applyBranding(settings);
            initMap(settings, cameras);
        } catch (e) {
            console.error(e);
            document.body.innerHTML = `<div class=\"hint\">Failed to load CCTV map data. Open DevTools for details.</div>`;
        }
    })();
})();
