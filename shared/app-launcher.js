/**
 * Office Suite App Launcher (Waffle Menu)
 * Componente condiviso per tutti i programmi della suite.
 * Include: griglia app, creazione rapida nuovi file, ricerca.
 */
(function() {
    'use strict';

    const APPS = [
        { name: 'Word', icon: 'fa-file-word', color: '#2564c1', href: 'word-clone/index.html', desc: 'Elaborazione testi' },
        { name: 'Excel', icon: 'fa-file-excel', color: '#217346', href: 'excel-clone/index.html', desc: 'Foglio di calcolo' },
        { name: 'PowerPoint', icon: 'fa-file-powerpoint', color: '#d04423', href: 'powerpoint-clone/index.html', desc: 'Presentazioni' },
        { name: 'OneNote', icon: 'fa-book-open', color: '#7b1fa2', href: 'onenote-clone/index.html', desc: 'Blocco appunti' },
        { name: 'Outlook', icon: 'fa-envelope', color: '#0078d4', href: 'outlook-clone/index.html', desc: 'Posta elettronica' },
        { name: 'OneDrive', icon: 'fa-cloud', color: '#0078d4', href: 'onedrive-clone/index.html', desc: 'File e archiviazione' },
        { name: 'Power BI', icon: 'fa-chart-column', color: '#f2c811', href: 'powerbi-clone/index.html', desc: 'Dashboard e report' },
        { name: 'Access', icon: 'fa-database', color: '#a4373a', href: 'access-clone/index.html', desc: 'Database' }
    ];

    const QUICK_CREATE = [
        { name: 'Documento', icon: 'fa-file-word', color: '#2564c1', href: 'word-clone/index.html' },
        { name: 'Cartella di lavoro', icon: 'fa-file-excel', color: '#217346', href: 'excel-clone/index.html' },
        { name: 'Presentazione', icon: 'fa-file-powerpoint', color: '#d04423', href: 'powerpoint-clone/index.html' },
        { name: 'Blocco appunti', icon: 'fa-book-open', color: '#7b1fa2', href: 'onenote-clone/index.html' },
        { name: 'Email', icon: 'fa-envelope', color: '#0078d4', href: 'outlook-clone/index.html' },
        { name: 'I miei file', icon: 'fa-cloud', color: '#0078d4', href: 'onedrive-clone/index.html' },
        { name: 'Report', icon: 'fa-chart-column', color: '#f2c811', href: 'powerbi-clone/index.html' },
        { name: 'Database', icon: 'fa-database', color: '#a4373a', href: 'access-clone/index.html' }
    ];

    // Detect base path (we're inside a subfolder like word-clone/)
    function getBasePath() {
        const path = window.location.pathname;
        // If we're in a subfolder like /word-clone/index.html, go up one level
        const parts = path.split('/');
        // Find the clone folder
        const cloneIdx = parts.findIndex(p => p.endsWith('-clone'));
        if (cloneIdx !== -1) {
            return '../';
        }
        return './';
    }

    function createLauncherCSS() {
        if (document.getElementById('app-launcher-css')) return;
        const style = document.createElement('style');
        style.id = 'app-launcher-css';
        style.textContent = `
            .waffle-btn {
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border-radius: 4px;
                border: none;
                background: none;
                color: inherit;
                position: relative;
                transition: background 0.15s;
                flex-shrink: 0;
            }
            .waffle-btn:hover { background: rgba(255,255,255,0.15); }
            .waffle-btn .waffle-grid {
                display: grid;
                grid-template-columns: repeat(3, 5px);
                gap: 3px;
            }
            .waffle-btn .waffle-dot {
                width: 5px;
                height: 5px;
                background: currentColor;
                border-radius: 1px;
                opacity: 0.85;
            }
            /* Panel */
            .app-launcher-panel {
                position: fixed;
                top: 0;
                left: 0;
                width: 340px;
                max-height: 100vh;
                background: white;
                box-shadow: 4px 0 24px rgba(0,0,0,0.18);
                z-index: 9999;
                transform: translateX(-100%);
                transition: transform 0.25s cubic-bezier(0.4,0,0.2,1);
                display: flex;
                flex-direction: column;
                overflow-y: auto;
                color: #333;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            .app-launcher-panel.open { transform: translateX(0); }
            .app-launcher-overlay {
                position: fixed;
                top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.25);
                z-index: 9998;
                display: none;
            }
            .app-launcher-overlay.open { display: block; }
            /* Header */
            .al-header {
                padding: 16px 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #eee;
            }
            .al-header h3 {
                font-size: 16px;
                font-weight: 600;
                color: #333;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .al-header h3 i { color: #e94560; }
            .al-close {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                color: #999;
                padding: 4px 8px;
                border-radius: 4px;
            }
            .al-close:hover { background: #f0f0f0; color: #333; }
            /* Search */
            .al-search {
                padding: 12px 20px;
            }
            .al-search input {
                width: 100%;
                padding: 10px 14px 10px 36px;
                border: 1px solid #ddd;
                border-radius: 6px;
                font-size: 13px;
                outline: none;
                background: #f8f8f8;
                transition: border-color 0.2s;
            }
            .al-search input:focus { border-color: #2564c1; background: white; }
            .al-search-wrap { position: relative; }
            .al-search-wrap i {
                position: absolute;
                left: 12px;
                top: 50%;
                transform: translateY(-50%);
                color: #aaa;
                font-size: 13px;
            }
            /* Section */
            .al-section-title {
                padding: 10px 20px 6px;
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: #888;
            }
            /* App Grid */
            .al-apps-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 4px;
                padding: 4px 16px 12px;
            }
            .al-app-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
                padding: 14px 6px;
                border-radius: 8px;
                cursor: pointer;
                text-decoration: none;
                color: #333;
                transition: background 0.15s;
            }
            .al-app-item:hover { background: #f0f4ff; }
            .al-app-icon {
                width: 44px;
                height: 44px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 22px;
            }
            .al-app-name {
                font-size: 11px;
                text-align: center;
                line-height: 1.3;
                font-weight: 500;
            }
            /* Divider */
            .al-divider {
                height: 1px;
                background: #eee;
                margin: 4px 20px;
            }
            /* Quick Create */
            .al-create-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 4px;
                padding: 4px 16px 16px;
            }
            .al-create-item {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
                padding: 10px 4px;
                border-radius: 8px;
                cursor: pointer;
                text-decoration: none;
                color: #333;
                transition: background 0.15s;
            }
            .al-create-item:hover { background: #f0f4ff; }
            .al-create-icon {
                width: 36px;
                height: 36px;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                background: #f5f5f5;
                border: 1px solid #e0e0e0;
            }
            .al-create-name {
                font-size: 10px;
                text-align: center;
                line-height: 1.2;
                color: #555;
            }
            /* Home link */
            .al-home-link {
                padding: 12px 20px;
                display: flex;
                align-items: center;
                gap: 10px;
                cursor: pointer;
                text-decoration: none;
                color: #2564c1;
                font-size: 13px;
                font-weight: 500;
                border-top: 1px solid #eee;
                transition: background 0.15s;
            }
            .al-home-link:hover { background: #f0f4ff; }
            .al-home-link i { font-size: 15px; }
            /* Responsive */
            @media (max-width: 768px) {
                .app-launcher-panel { width: 100%; }
            }
        `;
        document.head.appendChild(style);
    }

    function createLauncherDOM() {
        if (document.getElementById('appLauncherPanel')) return;
        const basePath = getBasePath();

        // Overlay
        const overlay = document.createElement('div');
        overlay.className = 'app-launcher-overlay';
        overlay.id = 'appLauncherOverlay';
        overlay.addEventListener('click', closeLauncher);
        document.body.appendChild(overlay);

        // Panel
        const panel = document.createElement('div');
        panel.className = 'app-launcher-panel';
        panel.id = 'appLauncherPanel';

        let appsHtml = '';
        APPS.forEach(app => {
            appsHtml += `<a class="al-app-item" href="${basePath}${app.href}" data-name="${app.name.toLowerCase()} ${app.desc.toLowerCase()}">
                <div class="al-app-icon" style="background:${app.color}15;color:${app.color};">
                    <i class="fas ${app.icon}"></i>
                </div>
                <span class="al-app-name">${app.name}</span>
            </a>`;
        });

        // Add placeholder apps (like the real Office 365)
        const extras = [
            { name: 'Calendario', icon: 'fa-calendar-alt', color: '#0078d4', soon: true },
            { name: 'To Do', icon: 'fa-check-circle', color: '#4caf50', soon: true },
            { name: 'Altre app', icon: 'fa-plus-circle', color: '#666', href: '' }
        ];
        extras.forEach(app => {
            if (app.soon) {
                appsHtml += `<div class="al-app-item" style="opacity:0.45;cursor:default;" title="Prossimamente" data-name="${app.name.toLowerCase()}">
                    <div class="al-app-icon" style="background:${app.color}15;color:${app.color};">
                        <i class="fas ${app.icon}"></i>
                    </div>
                    <span class="al-app-name">${app.name}</span>
                </div>`;
            }
        });

        let createHtml = '';
        QUICK_CREATE.forEach(item => {
            createHtml += `<a class="al-create-item" href="${basePath}${item.href}">
                <div class="al-create-icon" style="color:${item.color};">
                    <i class="fas ${item.icon}"></i>
                </div>
                <span class="al-create-name">${item.name}</span>
            </a>`;
        });

        panel.innerHTML = `
            <div class="al-header">
                <h3><i class="fas fa-cubes"></i> Office Suite</h3>
                <button class="al-close" onclick="window.OfficeLauncher.close()"><i class="fas fa-times"></i></button>
            </div>
            <div class="al-search">
                <div class="al-search-wrap">
                    <i class="fas fa-search"></i>
                    <input type="text" placeholder="Trova app di Office Suite" id="alSearchInput" oninput="window.OfficeLauncher.filter(this.value)">
                </div>
            </div>
            <div class="al-section-title">App</div>
            <div class="al-apps-grid" id="alAppsGrid">
                ${appsHtml}
            </div>
            <div class="al-divider"></div>
            <div class="al-section-title">Crea nuovo</div>
            <div class="al-create-grid">
                ${createHtml}
            </div>
            <a class="al-home-link" href="${basePath}index.html">
                <i class="fas fa-th-large"></i> Tutte le app e i servizi
            </a>
        `;
        document.body.appendChild(panel);
    }

    function openLauncher() {
        createLauncherCSS();
        createLauncherDOM();
        document.getElementById('appLauncherPanel').classList.add('open');
        document.getElementById('appLauncherOverlay').classList.add('open');
        setTimeout(() => {
            const input = document.getElementById('alSearchInput');
            if (input) input.focus();
        }, 300);
    }

    function closeLauncher() {
        const panel = document.getElementById('appLauncherPanel');
        const overlay = document.getElementById('appLauncherOverlay');
        if (panel) panel.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
    }

    function toggleLauncher() {
        const panel = document.getElementById('appLauncherPanel');
        if (panel && panel.classList.contains('open')) {
            closeLauncher();
        } else {
            openLauncher();
        }
    }

    function filterApps(query) {
        const q = query.toLowerCase().trim();
        const items = document.querySelectorAll('#alAppsGrid .al-app-item');
        items.forEach(item => {
            const name = item.dataset.name || '';
            item.style.display = (!q || name.includes(q)) ? '' : 'none';
        });
    }

    /**
     * Creates a waffle button element that can be inserted into any title bar.
     * @param {object} options - { color: 'white' }
     * @returns {HTMLElement}
     */
    function createWaffleButton(options = {}) {
        const btn = document.createElement('button');
        btn.className = 'waffle-btn';
        btn.title = 'App Office Suite';
        btn.style.color = options.color || 'white';
        btn.innerHTML = `<div class="waffle-grid">
            <span class="waffle-dot"></span><span class="waffle-dot"></span><span class="waffle-dot"></span>
            <span class="waffle-dot"></span><span class="waffle-dot"></span><span class="waffle-dot"></span>
            <span class="waffle-dot"></span><span class="waffle-dot"></span><span class="waffle-dot"></span>
        </div>`;
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleLauncher();
        });
        return btn;
    }

    // Public API
    window.OfficeLauncher = {
        open: openLauncher,
        close: closeLauncher,
        toggle: toggleLauncher,
        filter: filterApps,
        createButton: createWaffleButton,
        init: function() {
            createLauncherCSS();
            createLauncherDOM();
        }
    };
})();
