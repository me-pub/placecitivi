(function () {
    'use strict';

    const DEFAULTS = {
        corporate_name: 'GRID',
        corporate_logo: '',
    };

    const TARGET_RATIO = 16 / 9;

    function $(id) {
        return document.getElementById(id);
    }

    /** @param {string} s */
    function esc(s) {
        return String(s || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function createStreamElement(stream) {
        /** @type {any} */
        const video = document.createElement('video-stream');
        video.style.height = '100%';
        video.style.width = '100%';
        video.src = new URL('api/ws?src=' + encodeURIComponent(stream), location.href);
        // Keep streams alive even when tiles reflow or scroll.
        video.background = true;
        video.visibilityCheck = false;
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
        $('corpName').textContent = 'GRID';
        $('corpTag').textContent = name;
        document.title = 'GRID';

        const logo = settings.corporate_logo || '';
        const img = $('corpLogo');
        if (logo) {
            img.src = logo;
            img.style.display = 'block';
        } else {
            img.style.display = 'none';
        }
    }

    function computeGrid(count, rect) {
        if (count <= 1) {
            return {cols: 1, rows: 1, ratio: rect.width / rect.height};
        }

        const maxCols = Math.min(count, 8);
        let best = {score: -Infinity, cols: 1, rows: count};

        for (let cols = 1; cols <= maxCols; cols++) {
            const rows = Math.ceil(count / cols);
            const tileW = rect.width / cols;
            const tileH = rect.height / rows;
            if (tileW <= 0 || tileH <= 0) continue;
            const ratio = tileW / tileH;
            const ratioPenalty = Math.abs(ratio - TARGET_RATIO) + 0.15;
            const score = (tileW * tileH) / ratioPenalty;
            if (score > best.score) {
                best = {score, cols, rows};
            }
        }

        return {cols: best.cols, rows: best.rows, ratio: rect.width / rect.height};
    }

    function applyGridLayout(count) {
        const grid = $('grid');
        if (!grid) return;
        const rect = grid.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const layout = computeGrid(count, rect);
        grid.style.setProperty('--grid-cols', String(layout.cols));
        grid.style.setProperty('--grid-rows', String(layout.rows));
        $('gridMeta').textContent = `${layout.cols} x ${layout.rows}`;
    }

    function createTile(cam) {
        const tile = document.createElement('article');
        tile.className = 'tile';

        const title = esc(cam.name || 'Camera');
        const desc = esc(cam.description || '');
        const stream = cam.stream || '';

        tile.innerHTML = `
            <div class="tile-top">
                <div class="tile-title">
                    <strong title="${title}">${title}</strong>
                    <span title="${desc}">${desc || 'No description'}</span>
                </div>
                <div class="tile-badge">${stream ? 'LIVE' : 'NO STREAM'}</div>
            </div>
            <div class="tile-media" data-role="player">
                <div class="placeholder">${stream ? 'Loading preview...' : 'No stream configured'}</div>
            </div>
        `;

        if (stream) {
            tile.dataset.stream = stream;
        }

        return tile;
    }

    function mountStreams(tiles) {
        const mountTile = (tile) => {
            const stream = tile.dataset.stream;
            if (!stream) return;
            const host = tile.querySelector('[data-role="player"]');
            if (!host || !host.isConnected) return;
            host.innerHTML = '';
            const video = createStreamElement(stream);
            host.appendChild(video);
            tile._video = video;
        };

        const run = () => {
            tiles.forEach(mountTile);
        };

        if (customElements.get('video-stream')) {
            requestAnimationFrame(run);
            return;
        }

        customElements.whenDefined('video-stream').then(() => {
            requestAnimationFrame(run);
        }).catch(() => {
            // ignore
        });
    }

    function renderGrid(cameras) {
        const grid = $('grid');
        if (!grid) return;
        grid.innerHTML = '';

        if (!cameras.length) {
            const empty = document.createElement('div');
            empty.className = 'grid-empty';
            empty.textContent = 'No CCTV cameras configured yet.';
            grid.appendChild(empty);
            $('gridMeta').textContent = '0 x 0';
            return;
        }

        const tiles = [];
        for (const cam of cameras) {
            const tile = createTile(cam);
            grid.appendChild(tile);
            tiles.push(tile);
        }

        applyGridLayout(cameras.length);
        mountStreams(tiles);
    }

    function bindResize(count) {
        let scheduled = null;
        const onResize = () => {
            if (scheduled) return;
            scheduled = requestAnimationFrame(() => {
                scheduled = null;
                applyGridLayout(count);
            });
        };

        window.addEventListener('resize', onResize);
        if ('ResizeObserver' in window) {
            const grid = $('grid');
            if (grid) {
                const obs = new ResizeObserver(onResize);
                obs.observe(grid);
            }
        }
    }

    window.addEventListener('beforeunload', () => {
        const tiles = document.querySelectorAll('.tile');
        tiles.forEach(tile => {
            if (tile._video) stopStreamElement(tile._video);
        });
    });

    (async () => {
        try {
            const data = await loadData();
            const settings = Object.assign({}, DEFAULTS, data.settings || data.Settings || {});
            const cameras = data.cameras || data.Cameras || [];
            applyBranding(settings);
            $('camCount').textContent = String(cameras.length);
            renderGrid(cameras);
            bindResize(cameras.length);
        } catch (e) {
            console.error(e);
            const grid = $('grid');
            if (grid) {
                grid.innerHTML = '<div class="grid-empty">Failed to load CCTV grid. Open DevTools for details.</div>';
            }
        }
    })();
})();
