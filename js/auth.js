/**
 * auth.js — Modulo di autenticazione centralizzato QR code
 * Include nel <head> di ogni pagina che deve supportare l'autenticazione.
 *
 * Espone:
 *   window.CloneOfficeAuth     — Oggetto principale
 *   .init()                    — Inizializza auth (da chiamare onload)
 *   .getUser()                 — Restituisce utente corrente o null
 *   .isAuthenticated()         — Boolean
 *   .isAdmin()                 — Boolean
 *   .showLoginUI(container)    — Mostra UI login QR nel contenitore
 *   .showUserUI(container)     — Mostra pannello utente nel contenitore
 *   .logout()                  — Logout
 *   .onAuthChange(callback)    — Callback quando stato auth cambia
 */

(function() {
    'use strict';

    // Path assoluto per funzionare da qualsiasi pagina
    const API_BASE = (function() {
        const scripts = document.getElementsByTagName('script');
        for (let s of scripts) {
            if (s.src && s.src.includes('auth.js')) {
                return s.src.substring(0, s.src.indexOf('/js/')) + '/backend/api.php';
            }
        }
        return window.AUTH_API_BASE || '/backend/api.php';
    })();
    let _user = null;
    let _callbacks = [];
    let _pollTimer = null;
    let _heartbeatTimer = null;
    let _sessionActive = false;

    // ─── Device fingerprint ───
    function getDeviceFingerprint() {
        let fp = localStorage.getItem('clone_office_device_fp');
        if (!fp) {
            fp = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('clone_office_device_fp', fp);
        }
        return fp;
    }

    function getDeviceName() {
        const w = window.screen.width;
        const h = window.screen.height;
        const ua = navigator.userAgent || '';
        let os = 'PC';
        if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
        else if (/Android/.test(ua)) os = 'Android';
        else if (/Mac/.test(ua)) os = 'macOS';
        else if (/Linux/.test(ua) && !/Windows/.test(ua)) os = 'Linux';
        return os + ' (' + w + 'x' + h + ')';
    }

    function getAppName() {
        const path = window.location.pathname;
        if (path.includes('/excel-clone/')) return 'excel';
        if (path.includes('/word-clone/')) return 'word';
        if (path.includes('/powerpoint-clone/')) return 'powerpoint';
        if (path.includes('/onenote-clone/')) return 'onenote';
        if (path.includes('/outlook-clone/')) return 'outlook';
        if (path.includes('/onedrive-clone/')) return 'onedrive';
        return 'index';
    }

    function startSession() {
        if (_sessionActive) return Promise.resolve();
        const fp = getDeviceFingerprint();
        return fetch(API_BASE + '?action=session-start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                fingerprint: fp,
                device_name: getDeviceName(),
                app: getAppName()
            })
        })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'limit_reached') {
                _sessionActive = false;
                return data; // Ritorna l'errore per gestirlo
            }
            _sessionActive = true;
            // Avvia heartbeat ogni 120 secondi
            if (_heartbeatTimer) clearInterval(_heartbeatTimer);
            _heartbeatTimer = setInterval(() => {
                fetch(API_BASE + '?action=session-heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ fingerprint: fp })
                }).catch(() => {});
            }, 120000);
            return data;
        })
        .catch(() => { return { status: 'error' }; });
    }

    function stopSession() {
        _sessionActive = false;
        if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
        const fp = localStorage.getItem('clone_office_device_fp');
        if (!fp) return Promise.resolve();
        return fetch(API_BASE + '?action=session-end', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ fingerprint: fp })
        }).catch(() => {});
    }

    window.CloneOfficeAuth = {
        /** Inizializza: verifica sessione esistente e avvia tracking */
        init: function() {
            // MODALITÀ DEMO: su hosting statico (GitHub Pages / file://) il backend PHP non gira.
            // Evita l'overlay "Accesso richiesto" e rende le app usabili con salvataggio locale.
            var staticHost = (location.protocol === 'file:') ||
                /\.github\.io$/i.test(location.hostname) ||
                /\.pages\.dev$/i.test(location.hostname) ||
                /\.netlify\.app$/i.test(location.hostname);
            if (staticHost || window.AUTH_FORCE_DEMO) {
                window.CLONE_OFFICE_DEMO = true;
                _user = { name: 'Ospite (demo)', email: '', role: 'user', demo: true };
                this._notify();
                return Promise.resolve(_user);
            }
            return fetch(API_BASE + '?action=user-info', {
                credentials: 'include'
            })
            .then(r => r.json())
            .then(data => {
                if (data.authenticated && data.user) {
                    _user = data.user;
                    this._notify();
                    // Avvia sessione tracking
                    startSession().then(sessionData => {
                        if (sessionData && sessionData.status === 'limit_reached') {
                            this._notifySessionLimit(sessionData);
                        }
                    });
                    return _user;
                }
                _user = null;
                this._notify();
                return null;
            })
            .catch(() => {
                _user = null;
                this._notify();
                return null;
            });
        },

        /** Callback per limite sessioni raggiunto */
        _limitCallbacks: [],
        onSessionLimit: function(cb) {
            if (typeof cb === 'function') this._limitCallbacks.push(cb);
        },
        _notifySessionLimit: function(data) {
            this._limitCallbacks.forEach(cb => { try { cb(data); } catch(e) {} });
        },

        /** Restituisce l'utente corrente */
        getUser: function() { return _user; },

        /** È autenticato? */
        isAuthenticated: function() { return _user !== null; },

        /** È admin? */
        isAdmin: function() { return _user && _user.role === 'admin'; },

        /** Logout */
        logout: function() {
            return stopSession().then(() => {
                return fetch(API_BASE + '?action=logout', { credentials: 'include' });
            })
            .then(r => r.json())
            .then(() => {
                _user = null;
                this._notify();
            });
        },

        /** Mostra UI login con QR code nel contenitore */
        showLoginUI: function(container) {
            container.innerHTML = '<div style="text-align:center;padding:20px;">' +
                '<div class="spinner" style="display:inline-block;width:32px;height:32px;border:3px solid #eee;border-top-color:#e94560;border-radius:50%;animation:spin 0.8s linear infinite;margin:10px auto;"></div>' +
                '<p style="color:#888;font-size:13px;margin-top:10px;">Generazione codice...</p>' +
                '</div>';

            // Genera nuovo token
            fetch(API_BASE + '?action=new-auth', { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    container.innerHTML = '<p style="color:#d32f2f;font-size:13px;">Errore: ' + data.error + '</p>';
                    return;
                }

                const qrUrl = data.qr_url;
                const token = data.token;
                const expiresIn = data.expires_in || 600;

                container.innerHTML = `
                    <div style="text-align:center;">
                        <h3 style="font-size:16px;color:#1a1a2e;margin-bottom:4px;">Accedi con QR Code</h3>
                        <p style="font-size:12px;color:#999;margin-bottom:14px;">Inquadra il codice con il telefono</p>
                        <div id="qr-code-container" style="background:#fff;border:2px solid #eee;border-radius:12px;padding:12px;display:inline-block;margin-bottom:10px;">
                            <div id="qr-code" style="width:180px;height:180px;display:flex;align-items:center;justify-content:center;"></div>
                        </div>
                        <div id="qr-status" style="font-size:12px;color:#888;margin-bottom:8px;">
                            <span class="qr-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f44336;animation:blink 1s infinite;margin-right:6px;"></span>
                            In attesa della scansione...
                        </div>
                        <div style="font-size:11px;color:#aaa;">
                            <i class="fas fa-clock"></i> Scade tra <span id="qr-timer">${Math.floor(expiresIn / 60)}:00</span>
                        </div>
                        <p style="font-size:11px;color:#aaa;margin-top:10px;">
                            <a href="#" id="qr-recovery-link" style="color:#e94560;">Hai già un account? Recupera accesso</a>
                        </p>
                    </div>
                    <style>
                        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
                    </style>
                `;

                // Genera QR code usando API esterna (funziona senza librerie)
                const qrImg = document.getElementById('qr-code');
                const img = document.createElement('img');
                img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(qrUrl);
                img.alt = 'QR Code';
                img.style.width = '180px';
                img.style.height = '180px';
                img.onerror = function() {
                    // Fallback: mostra URL
                    qrImg.innerHTML = '<div style="font-size:11px;color:#666;word-break:break-all;padding:10px;">' +
                        '<p style="margin-bottom:8px;">Scansiona manualmente:</p>' +
                        '<code style="font-size:10px;background:#f5f5f5;padding:4px 8px;border-radius:4px;">' + qrUrl + '</code></div>';
                };
                qrImg.appendChild(img);

                // Timer countdown
                const timerEl = document.getElementById('qr-timer');
                let remaining = expiresIn;
                const timerInt = setInterval(() => {
                    remaining--;
                    if (remaining <= 0) {
                        clearInterval(timerInt);
                        document.getElementById('qr-status').innerHTML = '<span style="color:#d32f2f;">⌛ Codice scaduto</span>';
                        document.querySelector('.qr-dot')?.remove();
                        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
                        return;
                    }
                    const m = Math.floor(remaining / 60);
                    const s = remaining % 60;
                    timerEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
                }, 1000);

                // Polling stato
                _pollTimer = setInterval(() => {
                    fetch(API_BASE + '?action=check-auth&token=' + token, { credentials: 'include' })
                    .then(r => r.json())
                    .then(status => {
                        if (status.status === 'completed') {
                            clearInterval(_pollTimer);
                            clearInterval(timerInt);
                            _pollTimer = null;
                            // Auth completata
                            _user = status.user;
                            this._notify();
                            container.innerHTML = `
                                <div style="text-align:center;padding:10px;">
                                    <div style="font-size:40px;margin-bottom:8px;">✅</div>
                                    <h3 style="font-size:16px;color:#217346;margin-bottom:4px;">Accesso effettuato!</h3>
                                    <p style="font-size:13px;color:#888;">Benvenuto, <strong>${status.user.name}</strong></p>
                                </div>
                            `;
                        }
                    })
                    .catch(() => {});
                }, 1500);

                // Recovery link
                document.getElementById('qr-recovery-link').addEventListener('click', (e) => {
                    e.preventDefault();
                    clearInterval(_pollTimer);
                    clearInterval(timerInt);
                    _pollTimer = null;
                    this._showRecoveryUI(container);
                });
            })
            .catch(err => {
                container.innerHTML = '<p style="color:#d32f2f;font-size:13px;">Errore di connessione al server</p>';
            });
        },

        /** Mostra pannello utente */
        showUserUI: function(container) {
            if (!_user) {
                this.showLoginUI(container);
                return;
            }

            container.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:#f8faff;border:1px solid #e8f0fe;border-radius:8px;">
                    <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#1a1a2e,#0f3460);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0;">
                        ${_user.name.charAt(0).toUpperCase()}
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:600;color:#1a1a2e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_user.name}</div>
                        <div style="font-size:11px;color:#888;">
                            ${_user.role === 'admin' ? '<span style="color:#e94560;font-weight:600;">Admin</span>' : 'Utente'}
                            ${_user.role === 'admin' ? ` · <a href="${API_BASE.replace(/api\.php$/, 'admin-dashboard.php')}" style="color:#0078d4;text-decoration:none;">Dashboard</a>` : ''}
                        </div>
                    </div>
                    <button id="btn-logout" style="padding:6px 12px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;font-size:12px;color:#666;transition:all 0.2s;white-space:nowrap;" onmouseenter="this.style.borderColor='#d32f2f';this.style.color='#d32f2f';" onmouseleave="this.style.borderColor='#ddd';this.style.color='#666';">Esci</button>
                </div>
            `;

            container.querySelector('#btn-logout').addEventListener('click', () => {
                this.logout().then(() => {
                    this.showLoginUI(container);
                });
            });
        },

        /** Mostra UI recupero tramite secret key */
        _showRecoveryUI: function(container) {
            container.innerHTML = `
                <div style="text-align:center;">
                    <h3 style="font-size:16px;color:#1a1a2e;margin-bottom:4px;">Recupera accesso</h3>
                    <p style="font-size:12px;color:#999;margin-bottom:14px;">Inserisci la tua chiave segreta per recuperare l'account</p>
                    <div style="margin-bottom:12px;">
                        <input type="text" id="recovery-key" placeholder="XXXX-XXXX-XXXX-XXXX" style="width:100%;max-width:280px;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:16px;text-align:center;font-family:monospace;letter-spacing:2px;outline:none;" onfocus="this.style.borderColor='#e94560'" onblur="this.style.borderColor='#ddd'">
                    </div>
                    <div id="recovery-error" style="color:#d32f2f;font-size:12px;display:none;margin-bottom:8px;"></div>
                    <div style="display:flex;gap:8px;justify-content:center;">
                        <button id="btn-recovery-cancel" style="padding:8px 18px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;font-size:13px;">Annulla</button>
                        <button id="btn-recovery-go" style="padding:8px 18px;background:#1a1a2e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">Recupera</button>
                    </div>
                </div>
            `;

            container.querySelector('#btn-recovery-cancel').addEventListener('click', () => {
                this.showLoginUI(container);
            });

            container.querySelector('#btn-recovery-go').addEventListener('click', () => {
                const key = document.getElementById('recovery-key').value.trim().toUpperCase();
                const errEl = document.getElementById('recovery-error');
                if (!key) {
                    errEl.textContent = 'Inserisci la chiave segreta'; errEl.style.display = 'block'; return;
                }
                fetch(API_BASE + '?action=recovery', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ secret_key: key })
                })
                .then(r => r.json())
                .then(data => {
                    if (data.error) {
                        errEl.textContent = data.error; errEl.style.display = 'block'; return;
                    }
                    _user = data.user;
                    this._notify();
                    this.showUserUI(container);
                })
                .catch(err => {
                    errEl.textContent = 'Errore di connessione'; errEl.style.display = 'block';
                });
            });

            document.getElementById('recovery-key').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') document.getElementById('btn-recovery-go').click();
            });
        },

        /** Callback quando cambia stato auth */
        onAuthChange: function(cb) {
            if (typeof cb === 'function') _callbacks.push(cb);
        },

        _notify: function() {
            _callbacks.forEach(cb => { try { cb(_user); } catch(e) {} });
        }
    };

    // ─── Avviso "funzione server non disponibile in demo" ───
    // Su hosting statico (GitHub Pages / file://) il backend PHP non gira: le
    // funzioni Salva/Apri dal server non possono funzionare. Mostriamo un avviso
    // elegante invece di lasciare che il browser navighi all'elenco cartelle.
    // Ritorna true se siamo in demo (chiamante deve interrompere l'azione server).
    window.cloneOfficeDemoNotice = function(action) {
        if (!window.CLONE_OFFICE_DEMO) return false;
        try {
            var old = document.getElementById('clone-demo-toast');
            if (old) old.remove();
            var t = document.createElement('div');
            t.id = 'clone-demo-toast';
            t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);' +
                'background:#323130;color:#fff;padding:14px 22px;border-radius:8px;z-index:2147483647;' +
                'font:14px/1.5 Segoe UI,system-ui,sans-serif;max-width:90vw;box-shadow:0 6px 24px rgba(0,0,0,.35);' +
                'display:flex;align-items:flex-start;gap:10px;';
            var msg = (action ? action : 'Questa funzione') +
                ' richiede il backend e non è disponibile in questa demo statica.' +
                ' Usa il <b>salvataggio locale</b> (sul dispositivo). Online completo: su un host con PHP (es. Altervista).';
            t.innerHTML = '<span style="font-size:18px;line-height:1;">☁️</span><span>' + msg + '</span>';
            document.body.appendChild(t);
            setTimeout(function() { if (t.parentNode) t.remove(); }, 6000);
        } catch (e) {
            try { alert('Funzione server non disponibile in questa demo statica. Usa il salvataggio locale.'); } catch (e2) {}
        }
        return true;
    };

    // Termina sessione quando la pagina viene chiusa
    window.addEventListener('beforeunload', function() {
        if (_sessionActive) {
            const fp = localStorage.getItem('clone_office_device_fp');
            if (fp) {
                navigator.sendBeacon(API_BASE + '?action=session-end', new Blob([JSON.stringify({ fingerprint: fp })], { type: 'application/json' }));
            }
        }
    });
})();
