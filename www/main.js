if (!document.querySelector('link[data-cctv-theme], link[href$="cctv-theme.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'cctv-theme.css';
    link.dataset.cctvTheme = 'true';
    document.head.appendChild(link);
}

if (!document.querySelector('script[data-map-theme], script[src$="map-theme.js"]')) {
    const script = document.createElement('script');
    script.src = 'map-theme.js';
    script.dataset.mapTheme = 'true';
    document.head.appendChild(script);
}

document.body.classList.add('shell-page');

const header = document.createElement('header');
header.className = 'site-header';
header.innerHTML = `
    <div class="site-brand">
        <div>
            <div class="site-mark">go2rtc</div>
        </div>
    </div>
    <nav aria-label="Primary">
        <a href="index.html">Map</a>
        <a href="grid.html">Grid</a>
        <a href="streams.html">Streams</a>
        <a href="links.html">Links</a>
        <a href="log.html">Log</a>
        <a href="config.html">Config</a>
        <a href="net.html">Net</a>
        <a href="add.html">Add</a>
        <a href="admin.html">Admin</a>
    </nav>
`;

document.body.prepend(header);

const current = location.pathname.split('/').pop() || 'index.html';
header.querySelectorAll('a').forEach((a) => {
    if (a.getAttribute('href') === current) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
    } else {
        a.removeAttribute('aria-current');
    }
});
