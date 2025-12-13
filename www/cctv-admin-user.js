(function () {
    'use strict';

    const {api, setStatus, requireAuth, bindLogoutButton, setActiveNav, $} = window.CCTVAdmin;

    $('saveUser').addEventListener('click', async () => {
        setStatus($('userStatus'), 'Saving...', '');
        try {
            await api('user', {
                method: 'PUT',
                headers: {'content-type': 'application/json'},
                body: JSON.stringify({
                    username: $('newUser').value || '',
                    password: $('newPass').value || '',
                }),
            });
            $('newUser').value = '';
            $('newPass').value = '';
            setStatus($('userStatus'), 'Updated.', 'ok');
            const me = await api('me', {method: 'GET'}).catch(() => null);
            if (me && document.getElementById('whoami')) {
                document.getElementById('whoami').textContent = me.username ? ' — ' + me.username : '';
            }
        } catch (e) {
            setStatus($('userStatus'), e.message || 'Update failed', 'err');
        }
    });

    (async () => {
        setActiveNav('admin-user.html');
        bindLogoutButton();
        const info = await requireAuth();
        if (!info) return;
    })();
})();

