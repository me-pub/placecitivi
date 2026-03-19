(function () {
    'use strict';

    const {
        $,
        api,
        setStatus,
        wrapLng,
        requireAuth,
        bindLogoutButton,
        setActiveNav,
    } = window.CCTVAdmin;

    let map = null;
    let tile = null;
    let markers = new Map(); // id -> marker
    let pendingMarker = null;

    let settings = null;
    let cameras = [];
    let edit = {mode: 'none', id: null};

    function resolveTileSettings(s) {
        const fallbackURL = s.tile_url || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        const fallbackAttr = s.tile_attribution || '&copy; OpenStreetMap contributors';
        const api = window.CCTVMapTheme;
        const override = api && typeof api.getThemeOverride === 'function'
            ? api.getThemeOverride()
            : null;
        if (!override) return {tileURL: fallbackURL, tileAttr: fallbackAttr};
        return {
            tileURL: override.tile_url || fallbackURL,
            tileAttr: override.tile_attribution || fallbackAttr,
        };
    }

    function clearEdit() {
        edit = {mode: 'none', id: null};
        $('cancelEdit').style.display = 'none';
        $('deleteCam').style.display = 'none';
        $('viewCam').style.display = 'none';
        $('camName').value = '';
        $('camDesc').value = '';
        $('camStream').value = '';
        $('camURL').value = '';
        $('camLat').value = '';
        $('camLng').value = '';
        setStatus($('camStatus'), '', '');

        if (pendingMarker) {
            try { map.removeLayer(pendingMarker); } catch (e) {}
            pendingMarker = null;
        }
    }

    function setAddMode() {
        clearEdit();
        edit = {mode: 'add', id: null};
        $('cancelEdit').style.display = '';
        $('deleteCam').style.display = 'none';
        $('viewCam').style.display = 'none';
        setStatus($('camStatus'), 'Add mode: click on the map to set location.', 'ok');
    }

    function loadForm(cam) {
        edit = {mode: 'edit', id: cam.id};
        $('cancelEdit').style.display = '';
        $('deleteCam').style.display = '';
        $('viewCam').style.display = cam.stream ? '' : 'none';
        $('camName').value = cam.name || '';
        $('camDesc').value = cam.description || '';
        $('camStream').value = cam.stream || '';
        $('camURL').value = cam.url || '';
        $('camLat').value = cam.lat;
        $('camLng').value = wrapLng(cam.lng);
    }

    function ensureMap() {
        if (map) return;
        map = L.map('map', {zoomControl: true, worldCopyJump: true});
        map.setView([0, 0], 2);

        map.on('click', (ev) => {
            if (edit.mode !== 'add') return;
            $('camLat').value = ev.latlng.lat.toFixed(6);
            $('camLng').value = wrapLng(ev.latlng.lng).toFixed(6);
            setStatus($('camStatus'), 'Location set from map click.', 'ok');

            if (!pendingMarker) {
                pendingMarker = L.marker(ev.latlng, {draggable: true}).addTo(map);
                pendingMarker.on('dragend', () => {
                    const p = pendingMarker.getLatLng();
                    $('camLat').value = p.lat.toFixed(6);
                    $('camLng').value = wrapLng(p.lng).toFixed(6);
                });
            } else {
                pendingMarker.setLatLng(ev.latlng);
            }
        });
    }

    function applySettingsToMap() {
        ensureMap();
        if (!settings) return;

        const center = [settings.center_lat || 0, wrapLng(settings.center_lng || 0)];
        const zoom = Number.isFinite(settings.zoom) ? settings.zoom : 2;
        map.setView(center, zoom);

        const t = resolveTileSettings(settings);

        if (tile) {
            try { map.removeLayer(tile); } catch (e) {}
            tile = null;
        }
        tile = L.tileLayer(t.tileURL, {attribution: t.tileAttr, maxZoom: 22});
        tile.addTo(map);
    }

    function clearMarkers() {
        for (const m of markers.values()) {
            try { map.removeLayer(m); } catch (e) {}
        }
        markers.clear();
    }

    function renderMarkers() {
        ensureMap();
        clearMarkers();

        for (const cam of cameras) {
            if (!Number.isFinite(cam.lat) || !Number.isFinite(cam.lng)) continue;
            const m = L.marker([cam.lat, wrapLng(cam.lng)], {draggable: true}).addTo(map);
            m.bindPopup(`<strong>${cam.name || 'Camera'}</strong><br><span class="muted">${cam.stream || ''}</span>`);

            m.on('click', () => {
                loadForm(cam);
                setStatus($('camStatus'), 'Editing: drag marker to move, then Save.', '');
            });

            m.on('dragend', () => {
                if (edit.mode !== 'edit' || edit.id !== cam.id) return;
                const p = m.getLatLng();
                $('camLat').value = p.lat.toFixed(6);
                $('camLng').value = wrapLng(p.lng).toFixed(6);
            });

            markers.set(cam.id, m);
        }
    }

    function renderTable() {
        const tbody = $('camTable');
        tbody.innerHTML = '';
        for (const cam of cameras) {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.tabIndex = 0;
            tr.setAttribute('role', 'button');
            tr.setAttribute('aria-label', 'Edit camera ' + (cam.name || 'camera'));
            tr.innerHTML = `<td>${cam.name || ''}</td><td class="muted">${cam.stream || ''}</td>`;
            const selectCamera = () => {
                map.setView([cam.lat, wrapLng(cam.lng)], Math.max(map.getZoom(), 14));
                loadForm(cam);
                setStatus($('camStatus'), 'Editing: drag marker to move, then Save.', '');
            };
            tr.addEventListener('click', selectCamera);
            tr.addEventListener('keydown', ev => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    selectCamera();
                }
            });
            tbody.appendChild(tr);
        }
    }

    async function refreshAll() {
        settings = await api('settings', {method: 'GET'});
        cameras = await api('cameras', {method: 'GET'});
        if (!Array.isArray(cameras)) cameras = [];

        applySettingsToMap();
        renderMarkers();
        renderTable();
    }

    function getCameraPayload() {
        const lng = wrapLng(Number($('camLng').value));
        $('camLng').value = Number.isFinite(lng) ? lng.toFixed(6) : $('camLng').value;
        return {
            name: $('camName').value || '',
            description: $('camDesc').value || '',
            stream: $('camStream').value || '',
            url: $('camURL').value || '',
            lat: Number($('camLat').value),
            lng: lng,
        };
    }

    $('addCam').addEventListener('click', setAddMode);
    $('cancelEdit').addEventListener('click', () => clearEdit());

    $('saveCam').addEventListener('click', async () => {
        setStatus($('camStatus'), 'Saving...', '');
        try {
            const payload = getCameraPayload();
            if (edit.mode === 'edit' && edit.id) {
                await api('cameras/' + encodeURIComponent(edit.id), {
                    method: 'PUT',
                    headers: {'content-type': 'application/json'},
                    body: JSON.stringify(payload),
                });
                setStatus($('camStatus'), 'Saved.', 'ok');
            } else {
                const created = await api('cameras', {
                    method: 'POST',
                    headers: {'content-type': 'application/json'},
                    body: JSON.stringify(payload),
                });
                setStatus($('camStatus'), 'Created.', 'ok');
                edit = {mode: 'edit', id: created.id};
            }
            await refreshAll();
            if (edit.mode === 'edit' && edit.id) {
                const cam = cameras.find(c => c.id === edit.id);
                if (cam) loadForm(cam);
            }
        } catch (e) {
            setStatus($('camStatus'), e.message || 'Save failed', 'err');
        }
    });

    $('deleteCam').addEventListener('click', async () => {
        if (!(edit.mode === 'edit' && edit.id)) return;
        if (!confirm('Delete this camera?')) return;
        setStatus($('camStatus'), 'Deleting...', '');
        try {
            await api('cameras/' + encodeURIComponent(edit.id), {method: 'DELETE'});
            setStatus($('camStatus'), 'Deleted.', 'ok');
            clearEdit();
            await refreshAll();
        } catch (e) {
            setStatus($('camStatus'), e.message || 'Delete failed', 'err');
        }
    });

    $('viewCam').addEventListener('click', () => {
        if (!(edit.mode === 'edit' && edit.id)) return;
        const stream = $('camStream').value.trim();
        if (!stream) {
            setStatus($('camStatus'), 'No stream name configured for this camera.', 'err');
            return;
        }
        window.open('stream.html?src=' + encodeURIComponent(stream), '_blank', 'noopener,noreferrer');
    });

    (async () => {
        setActiveNav('admin-cameras.html');
        bindLogoutButton();
        const info = await requireAuth();
        if (!info) return;

        ensureMap();
        await refreshAll();
        window.addEventListener('cctv-map-theme-change', applySettingsToMap);
    })();
})();
