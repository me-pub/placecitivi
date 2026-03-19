(function () {
    'use strict';

    const apiBase = new URL('api/cctv/admin/', location.href);

    function $(id) {
        return document.getElementById(id);
    }

    function setStatus(el, msg, kind) {
        if (!el) return;
        el.className = 'status' + (kind ? ' ' + kind : '');
        el.textContent = msg || '';
    }

    function wrapLng(lng) {
        if (!Number.isFinite(lng)) return lng;
        let x = ((lng + 180) % 360 + 360) % 360 - 180;
        if (Object.is(x, -0)) x = 0;
        return x;
    }

    async function api(path, options) {
        const url = new URL(path, apiBase);
        const r = await fetch(url, Object.assign({credentials: 'include'}, options || {}));
        if (!r.ok) {
            const text = await r.text().catch(() => '');
            const err = new Error(text || r.statusText);
            err.status = r.status;
            throw err;
        }
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/json')) return await r.json();
        return await r.text();
    }

    async function me() {
        return await api('me', {method: 'GET'});
    }

    async function requireAuth() {
        try {
            const info = await me();
            const who = $('whoami');
            if (who) who.textContent = info.username ? ' — ' + info.username : '';
            return info;
        } catch (e) {
            location.href = 'admin.html';
            return null;
        }
    }

    async function logout() {
        try {
            await api('logout', {method: 'POST'});
        } finally {
            location.href = 'admin.html';
        }
    }

    function setActiveNav(href) {
        document.querySelectorAll('header nav a').forEach(a => {
            if (!href) return;
            const same = a.getAttribute('href') === href;
            a.classList.toggle('active', same);
            if (same) {
                a.setAttribute('aria-current', 'page');
            } else {
                a.removeAttribute('aria-current');
            }
        });
    }

    function bindLogoutButton() {
        const btn = $('logoutBtn');
        if (btn) btn.addEventListener('click', logout);
    }

    window.CCTVAdmin = {
        $,
        api,
        setStatus,
        wrapLng,
        me,
        requireAuth,
        logout,
        setActiveNav,
        bindLogoutButton,
    };
})();
