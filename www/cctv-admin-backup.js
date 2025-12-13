(function () {
    'use strict';

    const {api, setStatus, requireAuth, bindLogoutButton, setActiveNav, $} = window.CCTVAdmin;

    $('exportBtn').addEventListener('click', async () => {
        setStatus($('backupStatus'), 'Exporting...', '');
        try {
            const r = await fetch(new URL('api/cctv/admin/export', location.href), {credentials: 'include'});
            if (!r.ok) throw new Error(await r.text());
            const blob = await r.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'cctv-backup.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setStatus($('backupStatus'), 'Exported.', 'ok');
        } catch (e) {
            setStatus($('backupStatus'), e.message || 'Export failed', 'err');
        }
    });

    $('importBtn').addEventListener('click', async () => {
        const file = $('importFile').files && $('importFile').files[0];
        if (!file) {
            setStatus($('backupStatus'), 'Choose a JSON file first.', 'err');
            return;
        }
        if (!confirm('Import will replace settings and cameras. Continue?')) return;

        setStatus($('backupStatus'), 'Importing...', '');
        try {
            const text = await file.text();
            await api('import', {
                method: 'POST',
                headers: {'content-type': 'application/json'},
                body: text,
            });
            setStatus($('backupStatus'), 'Imported.', 'ok');
        } catch (e) {
            setStatus($('backupStatus'), e.message || 'Import failed', 'err');
        }
    });

    (async () => {
        setActiveNav('admin-backup.html');
        bindLogoutButton();
        const info = await requireAuth();
        if (!info) return;
    })();
})();

