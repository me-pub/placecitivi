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

    const viewer = $('viewer');
    const viewerTitle = $('viewerTitle');
    const viewerBody = $('viewerBody');
    $('viewerClose').addEventListener('click', closeViewer);

    function closeViewer() {
        viewer.style.display = 'none';
        viewerBody.innerHTML = '';
    }

    function openViewer(camera) {
        viewerTitle.textContent = camera.name || 'Camera';
        viewerBody.innerHTML = '';
        viewer.style.display = 'block';

        if (!camera.stream) {
            viewerBody.innerHTML = `<div class=\"hint\">No stream configured for this camera.</div>`;
            return;
        }

        const video = document.createElement('video-stream');
        video.background = true;
        video.style.height = '100%';
        video.style.width = '100%';
        try {
            // Avoid STUN delays on offline networks.
            video.pcConfig.iceServers = [];
        } catch (e) {
            // ignore
        }
        video.src = new URL('api/ws?src=' + encodeURIComponent(camera.stream), location.href);
        viewerBody.appendChild(video);
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

        const tileURL = settings.tile_url || DEFAULTS.tile_url;
        const tileAttr = settings.tile_attribution || DEFAULTS.tile_attribution;
        L.tileLayer(tileURL, {attribution: tileAttr, maxZoom: 22}).addTo(map);

        for (const cam of cameras || []) {
            if (!Number.isFinite(cam.lat) || !Number.isFinite(cam.lng)) continue;
            const marker = L.marker([cam.lat, wrapLng(cam.lng)]).addTo(map);

            const title = esc(cam.name || 'Camera');
            const desc = esc(cam.description || '');
            const streamHint = cam.stream ? `<div style=\"color:#666;font-size:12px\">stream: ${esc(cam.stream)}</div>` : '';
            const popup = `
                <div class=\"popup-title\">${title}</div>
                ${desc ? `<div>${desc}</div>` : ''}
                ${streamHint}
                <div class=\"popup-actions\">
                    <button class=\"btn\" data-action=\"view\">View</button>
                    ${cam.stream ? `<a class=\"btn\" style=\"text-decoration:none;display:inline-block\" href=\"stream.html?src=${encodeURIComponent(cam.stream)}\">Open</a>` : ''}
                </div>
            `;
            marker.bindPopup(popup);

            marker.on('popupopen', (ev) => {
                const el = ev.popup.getElement();
                const btn = el && el.querySelector('[data-action=\"view\"]');
                if (btn) btn.onclick = () => openViewer(cam);
            });

            marker.on('dblclick', () => openViewer(cam));
        }

        map.on('click', () => {
            // clicking the map closes the viewer on mobile
            if (window.innerWidth < 800) closeViewer();
        });
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
