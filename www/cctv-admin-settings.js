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
    let settings = null;
    let pendingLogoDataURL = '';

    function ensureMap() {
        if (map) return;
        map = L.map('map', {zoomControl: true, worldCopyJump: true});
        map.setView([0, 0], 2);
    }

    function applySettingsToMap() {
        ensureMap();
        if (!settings) return;

        const center = [settings.center_lat || 0, wrapLng(settings.center_lng || 0)];
        const zoom = Number.isFinite(settings.zoom) ? settings.zoom : 2;
        map.setView(center, zoom);

        const tileURL = settings.tile_url || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        const tileAttr = settings.tile_attribution || '&copy; OpenStreetMap contributors';

        if (tile) {
            try { map.removeLayer(tile); } catch (e) {}
            tile = null;
        }
        tile = L.tileLayer(tileURL, {attribution: tileAttr, maxZoom: 22});
        tile.addTo(map);
    }

    async function refresh() {
        settings = await api('settings', {method: 'GET'});

        $('corpName').value = settings.corporate_name || '';
        $('tileURL').value = settings.tile_url || '';
        $('tileAttr').value = settings.tile_attribution || '';
        $('centerLat').value = settings.center_lat;
        $('centerLng').value = wrapLng(settings.center_lng);
        $('zoom').value = settings.zoom;

        applySettingsToMap();
    }

    $('corpLogo').addEventListener('change', () => {
        const file = $('corpLogo').files && $('corpLogo').files[0];
        if (!file) {
            pendingLogoDataURL = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            pendingLogoDataURL = String(reader.result || '');
            setStatus($('settingsStatus'), 'Logo loaded (not saved yet).', 'ok');
        };
        reader.onerror = () => setStatus($('settingsStatus'), 'Failed to read logo file.', 'err');
        reader.readAsDataURL(file);
    });

    $('useMapView').addEventListener('click', () => {
        const c = map.getCenter();
        $('centerLat').value = c.lat.toFixed(6);
        $('centerLng').value = wrapLng(c.lng).toFixed(6);
        $('zoom').value = map.getZoom();
        setStatus($('settingsStatus'), 'Copied from map view.', 'ok');
    });

    $('saveSettings').addEventListener('click', async () => {
        setStatus($('settingsStatus'), 'Saving...', '');
        try {
            const centerLng = wrapLng(Number($('centerLng').value));
            $('centerLng').value = Number.isFinite(centerLng) ? centerLng.toFixed(6) : $('centerLng').value;

            const payload = {
                center_lat: Number($('centerLat').value),
                center_lng: centerLng,
                zoom: Number($('zoom').value),
                corporate_name: $('corpName').value || '',
                corporate_logo: pendingLogoDataURL || settings.corporate_logo || '',
                tile_url: $('tileURL').value || '',
                tile_attribution: $('tileAttr').value || '',
            };
            await api('settings', {
                method: 'PUT',
                headers: {'content-type': 'application/json'},
                body: JSON.stringify(payload),
            });
            pendingLogoDataURL = '';
            setStatus($('settingsStatus'), 'Saved.', 'ok');
            await refresh();
        } catch (e) {
            setStatus($('settingsStatus'), e.message || 'Save failed', 'err');
        }
    });

    (async () => {
        setActiveNav('admin-settings.html');
        bindLogoutButton();
        const info = await requireAuth();
        if (!info) return;

        ensureMap();
        await refresh();
    })();
})();

