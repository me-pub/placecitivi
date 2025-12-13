(function () {
    'use strict';

    const {api, setStatus} = window.CCTVAdmin;

    async function checkAlreadyLoggedIn() {
        try {
            await api('me', {method: 'GET'});
            location.href = 'admin-cameras.html';
        } catch (e) {
            // not logged in
        }
    }

    document.getElementById('loginForm').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        setStatus(document.getElementById('loginStatus'), 'Logging in...', '');
        try {
            await api('login', {
                method: 'POST',
                headers: {'content-type': 'application/json'},
                body: JSON.stringify({
                    username: document.getElementById('loginUser').value,
                    password: document.getElementById('loginPass').value,
                }),
            });
            location.href = 'admin-cameras.html';
        } catch (e) {
            setStatus(document.getElementById('loginStatus'), e.message || 'Login failed', 'err');
        }
    });

    checkAlreadyLoggedIn();
})();

