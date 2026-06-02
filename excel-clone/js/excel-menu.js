class ExcelMenu {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.activeMenu = null;
        this.menuStructure = this.getDefaultMenuStructure();
        this.init();
    }

    getDefaultMenuStructure() {
        return [
            {
                name: "File",
                tabId: null,
                options: [
                    { name: "Nuovo", shortcut: "Ctrl+N", action: () => this.newFile() },
                    { name: "Apri", shortcut: "Ctrl+O", action: () => this.openFile() },
                    { name: "Salva", shortcut: "Ctrl+S", action: () => this.saveFile() },
                    { name: "Salva con nome", action: () => this.saveAsFile() },
                    { type: "separator" },
                    { name: "Salva sul server", action: () => this.saveToServer() },
                    { name: "Apri dal server", action: () => this.openFromServer() },
                    { type: "separator" },
                    { name: "Download file", action: () => this.downloadFile() },
                    { name: "Carica file", action: () => this.uploadFile() },
                    { type: "separator" },
                    { name: "Salva PDF su OneDrive", icon: "fa-cloud-upload-alt", action: () => this.exportToPdf('server') },
                    { name: "Scarica PDF", icon: "fa-download", action: () => this.exportToPdf('download') },
                    { type: "separator" },
                    { name: "Anteprima di stampa", icon: "fa-print", action: () => this.printPreview() },
                    { name: "Stampa", shortcut: "Ctrl+P", action: () => this.printFile() },
                    { type: "separator" },
                    { name: "Chiudi", action: () => this.closeFile() }
                ]
            },
            { name: "Home", tabId: "home-tab" },
            { name: "Inserisci", tabId: "insert-tab" },
            { name: "Layout di pagina", tabId: "page-layout-tab" },
            { name: "Formule", tabId: "formulas-tab" },
            { name: "Dati", tabId: "data-tab" },
            { name: "Revisione", tabId: "review-tab" },
            { name: "Visualizza", tabId: "view-tab" },
            { name: "Condividi", tabId: "share-tab" },
            { name: "Guida", tabId: "help-tab" },
            { name: "Disegno", tabId: "drawing-tab" }
        ];
    }

    init() {
        this.createMenuBar();
        this.bindEvents();
        this.showRibbonTab('home-tab');
        this.setActiveMenuItem('home');
    }

    createMenuBar() {
        this.container.innerHTML = '';

        this.menuStructure.forEach(menu => {
            const menuItem = document.createElement('div');
            menuItem.className = 'menu-item';
            menuItem.textContent = menu.name;
            
            const menuSlug = menu.name.toLowerCase().replace(/\s+/g, '-');
            menuItem.setAttribute('data-menu', menuSlug);
            menuItem.setAttribute('data-tab-id', menu.tabId || '');
            
            if (menu.name === "File" && menu.options && menu.options.length > 0) {
                const dropdown = document.createElement('div');
                dropdown.className = 'menu-dropdown';
                
                menu.options.forEach(option => {
                    if (option.type === 'separator') {
                        const separator = document.createElement('div');
                        separator.className = 'menu-separator';
                        dropdown.appendChild(separator);
                    } else {
                        const optionElement = document.createElement('div');
                        optionElement.className = 'menu-option';
                        if (option.icon) {
                            const icon = document.createElement('i');
                            icon.className = `fas ${option.icon}`;
                            icon.style.marginRight = '8px';
                            icon.style.width = '16px';
                            icon.style.textAlign = 'center';
                            optionElement.appendChild(icon);
                            optionElement.appendChild(document.createTextNode(option.name));
                        } else {
                            optionElement.textContent = option.name;
                        }
                        
                        if (option.shortcut) {
                            const shortcut = document.createElement('span');
                            shortcut.className = 'menu-shortcut';
                            shortcut.textContent = option.shortcut;
                            optionElement.appendChild(shortcut);
                        }
                        
                        optionElement.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (option.action) option.action();
                            this.hideAllMenus();
                        });
                        
                        dropdown.appendChild(optionElement);
                    }
                });
                
                menuItem.appendChild(dropdown);
            }
            
            this.container.appendChild(menuItem);
        });
    }

    bindEvents() {
        this.container.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.menu-item');
            if (menuItem) {
                e.stopPropagation();
                const menuName = menuItem.getAttribute('data-menu');
                const tabId = menuItem.getAttribute('data-tab-id');
                
                if (menuName === 'file') {
                    this.toggleMenu(menuItem);
                } else if (tabId) {
                    this.hideAllMenus();
                    this.showRibbonTab(tabId);
                    this.setActiveMenuItem(menuName);
                }
            }
        });

        document.addEventListener('click', () => {
            this.hideAllMenus();
        });

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey) {
                switch(e.key.toLowerCase()) {
                    case 'n': e.preventDefault(); this.newFile(); break;
                    case 'o': e.preventDefault(); this.openFile(); break;
                    case 's': e.preventDefault(); this.saveFile(); break;
                    case 'p': e.preventDefault(); this.printFile(); break;
                    case 'b': e.preventDefault(); this.toggleBold(); break;
                    case 'i': e.preventDefault(); this.toggleItalic(); break;
                    case 'u': e.preventDefault(); this.toggleUnderline(); break;
                    case 'c': e.preventDefault(); this.copy(); break;
                    case 'x': e.preventDefault(); this.cut(); break;
                    case 'v': e.preventDefault(); this.paste(); break;
                    case 'z': 
                        e.preventDefault(); 
                        if (e.shiftKey) {
                            this.redo();
                        } else {
                            this.undo();
                        }
                        break;
                    case 'y': e.preventDefault(); this.redo(); break;
                    case 'a': e.preventDefault(); this.selectAll(); break;
                }
            }
            
            if (e.altKey && e.key === '=') {
                e.preventDefault(); 
                this.autoSum(); 
            }
            
            if (e.key === 'F1') {
                e.preventDefault();
                this.showHelp();
            }

            if (e.key === 'F9') {
                e.preventDefault();
                this.recalculateSheet();
            }
        });
    }

    toggleMenu(menuItem) {
        const isActive = menuItem.classList.contains('active');
        this.hideAllMenus();
        if (!isActive) {
            menuItem.classList.add('active');
            const dropdown = menuItem.querySelector('.menu-dropdown');
            if (dropdown) {
                dropdown.classList.add('show');
                this.activeMenu = menuItem;
            }
        }
    }

    hideAllMenus() {
        // Chiude solo i dropdown (menu File), ma NON toglie l'highlight
        // dalle voci di tab (Home, Inserisci, ecc.) — quella è gestita da setActiveMenuItem
        const fileMenus = this.container.querySelectorAll('.menu-item.active[data-tab-id=""]');
        fileMenus.forEach(item => {
            item.classList.remove('active');
            const dropdown = item.querySelector('.menu-dropdown');
            if (dropdown) dropdown.classList.remove('show');
        });
        // Rimuove anche eventuali active su menu senza tab-id che hanno dropdown aperti
        document.querySelectorAll('.menu-dropdown.show').forEach(dd => {
            dd.classList.remove('show');
            const parent = dd.closest('.menu-item');
            if (parent) parent.classList.remove('active');
        });
        this.activeMenu = null;
    }

    showRibbonTab(tabId) {
        document.querySelectorAll('.ribbon-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        const tab = document.getElementById(tabId);
        if (tab) {
            tab.classList.add('active');
            console.log('Tab mostrato:', tabId);
        } else {
            console.warn('Tab non trovato:', tabId);
        }
    }

    setActiveMenuItem(menuName) {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        const menuItem = document.querySelector(`[data-menu="${menuName}"]`);
        if (menuItem) {
            menuItem.classList.add('active');
        }
    }

// ===== FILE - LOCALSTORAGE =====

newFile() {
    const self = this;
    const doNew = () => {
        if (window.spreadsheet) window.spreadsheet.clear();
        document.getElementById('docTitle').value = 'Cartel1';
        self.updateStatus('Nuovo foglio creato');
        self.hideAllMenus();
    };
    if (window.spreadsheet && window.spreadsheet.isModified && window.spreadsheet.isModified()) {
        showConfirmDialog('Ci sono modifiche non salvate. Vuoi procedere comunque?', doNew);
    } else {
        doNew();
    }
}

    openFile() {
        const openDialog = document.getElementById('open-dialog');
        if (openDialog) {
            openDialog.style.display = 'flex';
            this.loadFileList();
        }
        this.hideAllMenus();
    }

    saveFile() {
        const titleInput = document.getElementById('docTitle');
        if (titleInput) {
            const filename = titleInput.value.trim() || 'Cartel1';
            this.performSave(filename);
        }
        this.hideAllMenus();
    }

    saveAsFile() {
        const saveDialog = document.getElementById('save-dialog');
        if (saveDialog) {
            const titleInput = document.getElementById('docTitle');
            const currentFilename = titleInput ? titleInput.value.replace('*', '') : 'Cartel1';
            document.getElementById('filename-input').value = currentFilename;
            saveDialog.style.display = 'flex';
        }
        this.hideAllMenus();
    }

    performSave(filename) {
        if (!window.spreadsheet) return;
        const data = window.spreadsheet.exportData();
        try {
            localStorage.setItem(`excel-file-${filename}`, JSON.stringify(data));
            if (window.spreadsheet.setModified) {
                window.spreadsheet.setModified(false);
            }
            document.getElementById('docTitle').value = filename;
            this.updateStatus('File salvato in localStorage');
            const saveDialog = document.getElementById('save-dialog');
            if (saveDialog) {
                saveDialog.style.display = 'none';
            }
        } catch (error) {
            this.updateStatus('Errore nel salvataggio');
            console.error('Errore salvataggio:', error);
        }
    }

    loadFileList() {
        const fileList = document.getElementById('file-list');
        if (!fileList) return;
        fileList.innerHTML = '';
        const files = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('excel-file-')) {
                    files.push(key.replace('excel-file-', ''));
                }
            }
        } catch (error) {
            console.error('Errore caricamento file list:', error);
        }
        if (files.length === 0) {
            fileList.innerHTML = '<div class="file-item">Nessun file salvato</div>';
            return;
        }
        files.forEach(filename => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.style.display = 'flex';
            fileItem.style.justifyContent = 'space-between';
            fileItem.style.alignItems = 'center';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = filename;
            nameSpan.style.flex = '1';
            nameSpan.style.overflow = 'hidden';
            nameSpan.style.textOverflow = 'ellipsis';
            nameSpan.style.whiteSpace = 'nowrap';
            fileItem.appendChild(nameSpan);

            const delBtn = document.createElement('button');
            delBtn.className = 'file-delete-btn';
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.title = 'Elimina file';
            delBtn.style.cssText = 'border:none;background:none;color:#bbb;cursor:pointer;padding:4px 8px;font-size:13px;border-radius:4px;flex:0 0 auto;';
            delBtn.addEventListener('mouseenter', () => { delBtn.style.color = '#d32f2f'; });
            delBtn.addEventListener('mouseleave', () => { delBtn.style.color = '#bbb'; });
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteLocalFile(filename);
            });
            fileItem.appendChild(delBtn);

            fileItem.addEventListener('click', () => {
                document.querySelectorAll('.file-item').forEach(item => {
                    item.classList.remove('selected');
                });
                fileItem.classList.add('selected');
            });
            fileList.appendChild(fileItem);
        });
    }

    deleteLocalFile(filename) {
        const self = this;
        const doDelete = () => {
            try {
                localStorage.removeItem('excel-file-' + filename);
                self.updateStatus('File "' + filename + '" eliminato');
                self.showNotification('File "' + filename + '" eliminato', 'info');
                self.loadFileList();
            } catch (e) {
                self.showNotification('Errore eliminazione: ' + e.message, 'error');
            }
        };
        if (typeof showConfirmDialog === 'function') {
            showConfirmDialog('Eliminare definitivamente "' + filename + '"?', doDelete);
        } else if (confirm('Eliminare definitivamente "' + filename + '"?')) {
            doDelete();
        }
    }

    performOpen(filename) {
        if (!window.spreadsheet) return;
        try {
            const data = localStorage.getItem(`excel-file-${filename}`);
            if (data) {
                window.spreadsheet.importData(JSON.parse(data));
                document.getElementById('docTitle').value = filename;
                this.updateStatus('File aperto da localStorage');
                const openDialog = document.getElementById('open-dialog');
                if (openDialog) {
                    openDialog.style.display = 'none';
                }
            } else {
                this.showNotification('File non trovato', 'error');
            }
        } catch (error) {
            this.updateStatus('Errore apertura file');
            console.error('Errore apertura file:', error);
        }
    }

    // ===== SERVER PHP =====

    saveToServer() {
        if (!window.spreadsheet) return;
        const self = this;
        const overlay = document.createElement('div');
        overlay.id = 'server-save-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:350px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Salva sul server</h3>
                <button id="ss-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:16px;">
                <label style="display:block;margin-bottom:4px;font-size:13px;">Nome del file:</label>
                <input type="text" id="ss-filename" value="${document.getElementById('docTitle')?.value?.replace('*','').trim() || 'Cartel1'}" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;" autofocus>
            </div>
            <div style="text-align:right;">
                <button id="ss-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="ss-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Salva</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('#ss-close').onclick = close;
        overlay.querySelector('#ss-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('#ss-ok').onclick = () => {
            const filename = overlay.querySelector('#ss-filename').value.trim();
            if (!filename) return;
            close();
            const data = window.spreadsheet.exportData();
            self.updateStatus('Salvataggio sul server...');
            fetch('php/save.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: filename, content: data })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    self.updateStatus('File salvato sul server');
                    if (window.spreadsheet.setModified) window.spreadsheet.setModified(false);
                    document.getElementById('docTitle').value = filename;
                } else {
                    self.updateStatus('Errore: ' + result.message);
                    self.showNotification('Errore: ' + result.message, 'error');
                }
            })
            .catch(error => {
                self.updateStatus('Errore connessione server');
                console.error('Errore:', error);
                self.showNotification('Errore connessione: ' + error.message, 'error');
            });
        };
        setTimeout(() => { const el = overlay.querySelector('#ss-filename'); if (el) { el.focus(); el.select(); } }, 100);
        this.hideAllMenus();
    }

    openFromServer() {
        const self = this;
        this.updateStatus('Caricamento lista file...');
        fetch('php/list_files.php')
        .then(response => response.json())
        .then(result => {
            if (result.success && result.files.length > 0) {
                const overlay = document.createElement('div');
                overlay.id = 'server-open-modal';
                overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
                overlay.innerHTML = `<div style="background:#fff;border-radius:12px;padding:24px;min-width:520px;max-width:600px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                        <h3 style="margin:0;font-size:16px;color:#1a1a2e;">Apri dal server</h3>
                        <button id="so-close" style="border:none;background:none;font-size:22px;cursor:pointer;color:#999;">✕</button>
                    </div>
                    <div style="max-height:360px;overflow-y:auto;border:1px solid #eee;border-radius:8px;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;">
                            <thead>
                                <tr style="background:#f8f9fa;">
                                    <th style="padding:10px 12px;text-align:left;font-weight:600;color:#555;border-bottom:1px solid #eee;">Nome</th>
                                    <th style="padding:10px 12px;text-align:center;font-weight:600;color:#555;border-bottom:1px solid #eee;width:60px;">Tipo</th>
                                    <th style="padding:10px 12px;text-align:right;font-weight:600;color:#555;border-bottom:1px solid #eee;width:80px;">Dimensione</th>
                                    <th style="padding:10px 12px;text-align:left;font-weight:600;color:#555;border-bottom:1px solid #eee;width:140px;">Modifica</th>
                                    <th style="padding:10px 12px;border-bottom:1px solid #eee;width:40px;"></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${result.files.map(f => {
                                    const sizeStr = f.size < 1024 ? f.size + ' B' : (f.size / 1024).toFixed(1) + ' KB';
                                    const ext = (f.type || 'json').toUpperCase();
                                    return `<tr style="cursor:pointer;border-bottom:1px solid #f5f5f5;" onclick="(function(){ document.getElementById('server-open-modal')?.remove(); window.excelMenu.loadFromServer('${f.name.replace(/'/g,"\\'")}'); })()" onmouseenter="this.style.background='#f0faf4'" onmouseleave="this.style.background=''">
                                        <td style="padding:10px 12px;">
                                            <i class="fas fa-file-excel" style="color:#217346;margin-right:8px;"></i>
                                            ${f.name}
                                        </td>
                                        <td style="padding:10px 12px;text-align:center;">
                                            <span style="display:inline-block;padding:1px 8px;border-radius:4px;font-size:10px;font-weight:600;background:#e8f5e9;color:#217346;">${ext}</span>
                                        </td>
                                        <td style="padding:10px 12px;text-align:right;color:#888;font-size:12px;">${sizeStr}</td>
                                        <td style="padding:10px 12px;color:#888;font-size:11px;">${f.modified_formatted || ''}</td>
                                        <td style="padding:10px 12px;text-align:center;">
                                            <button onclick="event.stopPropagation(); window.excelMenu.confirmDeleteFromServer('${f.filename.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')" style="border:none;background:none;color:#ccc;cursor:pointer;padding:4px;border-radius:4px;" title="Elimina" onmouseenter="this.style.color='#d32f2f'" onmouseleave="this.style.color='#ccc'">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div style="text-align:right;margin-top:12px;">
                        <button id="so-cancel" style="padding:8px 20px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;font-size:13px;color:#666;">Chiudi</button>
                    </div>
                </div>`;
                document.body.appendChild(overlay);
                const close = () => overlay.remove();
                overlay.querySelector('#so-close').onclick = close;
                overlay.querySelector('#so-cancel').onclick = close;
                overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
            } else {
                self.showNotification('Nessun file sul server', 'info');
            }
        })
        .catch(error => {
            self.updateStatus('Errore connessione server');
            console.error('Errore:', error);
            self.showNotification('Errore connessione: ' + error.message, 'error');
        });
        this.hideAllMenus();
    }

    confirmDeleteFromServer(filename) {
        if (confirm('Eliminare il file «' + filename + '»?')) {
            this.deleteFromServer(filename);
        }
    }

    deleteFromServer(filename) {
        this.updateStatus('Eliminazione...');
        fetch('php/delete.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: filename })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                this.updateStatus('File eliminato');
                this.showNotification('File «' + filename + '» eliminato con successo', 'info');
                // Aggiorna l'elenco: chiude e riapre la finestra "Apri dal server"
                document.getElementById('server-open-modal')?.remove();
                this.openFromServer();
            } else {
                this.updateStatus('Errore: ' + (result.message || 'eliminazione fallita'));
                this.showNotification('Errore: ' + (result.message || 'eliminazione fallita'), 'error');
            }
        })
        .catch(error => {
            this.updateStatus('Errore connessione server');
            this.showNotification('Errore connessione: ' + error.message, 'error');
        });
    }

    loadFromServer(filename) {
        this.updateStatus('Caricamento dal server...');
        fetch('php/load.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: filename })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                if (window.spreadsheet) {
                    window.spreadsheet.importData(result.content);
                    document.getElementById('docTitle').value = filename;
                    this.updateStatus('File caricato dal server');
                }
            } else {
                this.updateStatus('Errore: ' + result.message);
                this.showNotification('Errore: ' + result.message, 'error');
            }
        })
        .catch(error => {
            this.updateStatus('Errore connessione server');
            console.error('Errore:', error);
            this.showNotification('Errore connessione: ' + error.message, 'error');
        });
    }

    // ===== DOWNLOAD/UPLOAD =====

    downloadFile() {
        if (!window.spreadsheet) return;
        const titleInput = document.getElementById('docTitle');
        const filename = titleInput ? titleInput.value.replace('*', '') : 'Cartel1';
        const data = window.spreadsheet.exportData();
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.updateStatus('File scaricato');
        this.hideAllMenus();
    }

    uploadFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (window.spreadsheet) {
                        window.spreadsheet.importData(data);
                        const filename = file.name.replace('.json', '');
                        document.getElementById('docTitle').value = filename;
                        this.updateStatus('File caricato');
                    }
                } catch (error) {
                    this.updateStatus('Errore lettura file');
                    console.error('Errore:', error);
                    this.showNotification('File JSON non valido', 'error');
                }
            };
            reader.onerror = () => {
                this.updateStatus('Errore lettura file');
                this.showNotification('Errore lettura file', 'error');
            };
            reader.readAsText(file);
        };
        input.click();
        this.hideAllMenus();
    }

    exportToPdf(mode = 'download') {
        const element = document.getElementById('spreadsheet-viewport') || document.getElementById('spreadsheet');
        if (!element) {
            this.updateStatus('Errore: area del foglio non trovata');
            return;
        }
        const titleInput = document.getElementById('docTitle');
        const filename = titleInput ? titleInput.value.replace('*', '').trim() : 'Foglio di calcolo';
        const opt = {
            margin:       10,
            filename:     `${filename}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
        };
        this.updateStatus('Esportazione PDF in corso...');
        const pdfFilename = `${filename}.pdf`;
        html2pdf().set(opt).from(element).outputPdf('blob').then((pdfBlob) => {
            if (mode === 'server') {
                const fd = new FormData();
                fd.append('files', new File([pdfBlob], pdfFilename, { type: 'application/pdf' }));
                fd.append('path', 'I miei file');
                fetch('../onedrive-clone/api.php?action=upload', { method: 'POST', body: fd })
                    .then((r) => r.json())
                    .then((res) => {
                        if (res.success) {
                            this.updateStatus('PDF salvato su OneDrive!');
                        } else {
                            this.updateStatus('Errore salvataggio PDF su OneDrive');
                        }
                    })
                    .catch(() => {
                        this.updateStatus('Errore connessione OneDrive');
                    });
            } else {
                const url = URL.createObjectURL(pdfBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = pdfFilename;
                a.click();
                URL.revokeObjectURL(url);
                this.updateStatus('PDF scaricato con successo');
            }
        }).catch((err) => {
            console.error('Errore esportazione PDF:', err);
            this.updateStatus('Errore esportazione PDF');
        });
        this.hideAllMenus();
    }

    _buildPrintableHtml() {
        const ss = window.spreadsheet;
        if (!ss) return '<p>Nessun foglio aperto</p>';
        const title = document.getElementById('docTitle')?.value || 'Foglio di calcolo';
        const date = new Date().toLocaleDateString('it-IT');

        // Determina l'area effettivamente utilizzata
        let maxRow = 0, maxCol = 0;
        for (const ref in ss.data) {
            const coords = ss.getCellCoordinates(ref);
            if (coords.row > maxRow) maxRow = coords.row;
            if (coords.col > maxCol) maxCol = coords.col;
        }
        let startRow = 0, startCol = 0;
        let endRow = Math.min(maxRow, (ss.rows || 100) - 1);
        let endCol = Math.min(maxCol, (ss.cols || 26) - 1);

        // Area di stampa (ss._printArea = "A1:C20"): limita l'intervallo stampato
        if (ss._printArea) {
            const parts = String(ss._printArea).split(':');
            const a = ss.getCellCoordinates(parts[0]);
            const b = parts[1] ? ss.getCellCoordinates(parts[1]) : a;
            if (a && b) {
                startRow = Math.min(a.row, b.row); endRow = Math.max(a.row, b.row);
                startCol = Math.min(a.col, b.col); endCol = Math.max(a.col, b.col);
            }
        }

        // Impostazioni di Layout di pagina (salvate in localStorage dalla tab)
        const orientation = localStorage.getItem('excel_orientation') === 'orizzontale' ? 'landscape' : 'portrait';
        const paperMap = { 'A3': 'A3', 'A4': 'A4', 'A5': 'A5', 'Lettera': 'letter', 'Legale': 'legal', 'Tabloid': '11in 17in' };
        const paper = paperMap[localStorage.getItem('excel_paper')] || 'A4';
        const scale = Math.max(10, Math.min(400, parseInt(localStorage.getItem('excel_scale')) || 100));
        const marginPresets = { normale: {top:2.54,bottom:2.54,left:1.91,right:1.91}, largo: {top:2.54,bottom:2.54,left:3.18,right:3.18}, stretto: {top:1.91,bottom:1.91,left:0.64,right:0.64} };
        let margins = marginPresets.normale;
        const marginId = localStorage.getItem('excel_margins') || 'normale';
        if (marginId === 'personalizzati') { try { const c = JSON.parse(localStorage.getItem('excel_margins_custom')); if (c) margins = c; } catch (e) {} }
        else if (marginPresets[marginId]) margins = marginPresets[marginId];
        // Righe da ripetere in alto ("Stampa titoli", es. "$1:$2" o "1:2")
        let titleRows = null;
        const tr = localStorage.getItem('excel_print_rows');
        if (tr) { const mm = tr.replace(/\$/g, '').match(/(\d+)\s*:\s*(\d+)/); if (mm) titleRows = { from: parseInt(mm[1]) - 1, to: parseInt(mm[2]) - 1 }; }
        const pageBreaks = Array.isArray(ss._pageBreaks) ? ss._pageBreaks : [];

        // Raccoglie le celle con bordi personalizzati
        const cellStyles = {};
        for (const ref in ss.data) {
            const d = ss.data[ref];
            if (d && d.borderColor) cellStyles[ref] = d.borderColor;
        }

        // Costruisce HTML per ogni drawing object — renderizzati come blocchi in-flow
        // dopo la tabella. Niente position:absolute perché il browser non pagina
        // correttamente gli elementi posizionati assolutamente su più pagine.
        // In Excel, gli oggetti che vanno oltre la pagina vengono stampati su pagine successive.
        let drawingsHtml = '';
        if (ss.drawingObjects && ss.drawingObjects.length > 0) {
            drawingsHtml = '<div style="margin-top:24px;">';
            drawingsHtml += ss.drawingObjects.map(draw => {
                let style = '';
                const w = draw.width || 200;
                const h = draw.height || 150;
                style += `width:${Math.min(w, 600)}px;height:${h}px;`;
                if (draw.fillColor) style += `background-color:${draw.fillColor};`;
                if (draw.borderColor) style += `border:${draw.borderWidth || 2}px solid ${draw.borderColor};`;
                if (draw.borderRadius !== undefined) style += `border-radius:${draw.borderRadius}px;`;
                if (draw.opacity !== undefined) style += `opacity:${draw.opacity};`;
                if (draw.rotation) style += `transform:rotate(${draw.rotation}deg);`;
                if (draw.color) style += `color:${draw.color};`;
                if (draw.fontSize) style += `font-size:${draw.fontSize}px;`;
                if (draw.fontWeight) style += `font-weight:${draw.fontWeight};`;
                if (draw.fontStyle) style += `font-style:${draw.fontStyle};`;
                if (draw.fontFamily) style += `font-family:${draw.fontFamily};`;
                if (draw.textDecoration) style += `text-decoration:${draw.textDecoration};`;
                if (draw.textAlign) style += `text-align:${draw.textAlign};`;
                if (draw.padding !== undefined) style += `padding:${draw.padding}px;`;
                style += 'box-sizing:border-box;overflow:visible;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;page-break-inside:avoid;';

                let inner = '';
                if (draw.type === 'image' && draw.src) {
                    inner = `<img src="${draw.src}" style="max-width:100%;max-height:100%;object-fit:contain;display:block;">`;
                } else if (draw.html) {
                    inner = draw.html;
                } else if (draw.content) {
                    inner = draw.content;
                } else if (draw.type === 'chart' || draw.type === 'smartart') {
                    inner = draw.html || draw.content || '';
                } else if (draw.type === 'shape' && draw.shapeType && draw.shapeType !== 'rectangle') {
                    if (draw.shapeType === 'circle') style += 'border-radius:50%;';
                    inner = draw.content || '';
                }

                return `<div style="${style}">${inner}</div>`;
            }).join('\n');
            drawingsHtml += '</div>';
        }

        let html = `<html><head><title>${title}</title>
        <style>
            @page { size: ${paper} ${orientation}; margin: ${margins.top}cm ${margins.right}cm ${margins.bottom}cm ${margins.left}cm; }
            * { box-sizing: border-box; }
            body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; font-size: 11pt; color: #000; }
            .print-scale { zoom: ${scale / 100}; }
            tr.page-break-row td { border-bottom: 2px dashed #999 !important; }
            tr.page-break-row { page-break-after: always; }
            thead.repeat-titles { display: table-header-group; }
            .no-print { }
            .print-header { text-align: center; margin-bottom: 16px; }
            .print-header h1 { font-size: 18pt; margin: 0 0 4px; font-weight: 400; color: #222; }
            .print-header .date { font-size: 9pt; color: #888; }
            table { border-collapse: collapse; width: 100%; }
            td { padding: 2px 6px; font-size: 10pt; height: 20px; vertical-align: middle; min-width: 80px; }
            tr { page-break-inside: avoid; }
            .footer { text-align: center; font-size: 8pt; color: #aaa; border-top: 1px solid #eee; padding-top: 4px; margin-top: 20px; }
            .print-btn-bar { margin:0 0 12px; text-align:center; }
            @media print {
                .no-print { display: none !important; }
                body { padding: 0; }
                .footer { position: fixed; bottom: 0; left: 0; right: 0; }
            }
        </style></head><body>
        <div class="no-print print-btn-bar">
            <button onclick="window.print()" style="padding:10px 28px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;font-weight:600;margin-right:8px;">🖨️ Stampa</button>
            <button onclick="window.close()" style="padding:10px 28px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:14px;">✕ Chiudi anteprima</button>
            <span style="margin-left:16px;font-size:12px;color:#888;">Le griglie e le intestazioni sono nascoste — solo i dati vengono stampati</span>
        </div>
        <div class="print-header">
            <h1>${title}</h1>
            <div class="date">${date}</div>
        </div>
        <div class="print-scale"><table>`;

        const buildRow = (r) => {
            let row = '';
            for (let c = startCol; c <= endCol; c++) {
                const ref = ss.numberToColumn(c) + (r + 1);
                const d = ss.data[ref];
                const val = d ? (d.computedValue !== undefined && d.computedValue !== '' ? d.computedValue : d.value || '') : '';
                const hasBorder = cellStyles[ref];
                row += `<td${hasBorder ? ' style="border:1px solid ' + hasBorder + ';"' : ''}>${val}</td>`;
            }
            return row;
        };

        // "Stampa titoli": righe ripetute in alto su ogni pagina (thead)
        if (titleRows) {
            html += '<thead class="repeat-titles">';
            for (let r = titleRows.from; r <= titleRows.to && r <= endRow; r++) html += '<tr>' + buildRow(r) + '</tr>';
            html += '</thead>';
        }
        html += '<tbody>';
        for (let r = startRow; r <= endRow; r++) {
            // Salta le righe già mostrate come titoli ripetuti
            if (titleRows && r >= titleRows.from && r <= titleRows.to) continue;
            const isBreak = pageBreaks.includes(r);
            html += `<tr${isBreak ? ' class="page-break-row"' : ''}>` + buildRow(r) + '</tr>';
        }
        html += '</tbody>';

        html += `</table></div>`;
        if (drawingsHtml) html += drawingsHtml;
        html += `<div class="footer">Generato da Clone Office Suite il ${date}</div>
    </body></html>`;
        return html;
    }

    printFile() {
        const html = this._buildPrintableHtml();
        const w = window.open('', '_blank', 'width=900,height=700');
        if (!w) { this.updateStatus('Attiva i popup per la stampa'); return; }
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => { w.print(); }, 500);
        this.updateStatus('Stampa avviata');
        this.hideAllMenus();
    }

    printPreview() {
        const html = this._buildPrintableHtml();
        const w = window.open('', '_blank', 'width=1100,height=750');
        if (!w) { this.updateStatus('Attiva i popup per l\'anteprima'); return; }
        w.document.write(html);
        w.document.close();
        w.focus();
        this.updateStatus('Anteprima di stampa');
        this.hideAllMenus();
    }

    closeFile() {
        const self = this;
        // Chiude la cartella di lavoro e torna al menu generale della suite (hub).
        const doClose = () => {
            self.hideAllMenus();
            self.updateStatus('Chiusura in corso...');
            // Torna alla home della suite Office (menu generale)
            window.location.href = '../index.html';
        };
        if (window.spreadsheet && window.spreadsheet.isModified && window.spreadsheet.isModified()) {
            showConfirmDialog('Modifiche non salvate. Salvare prima di chiudere?', () => {
                self.saveFile();
                // Dà il tempo al salvataggio asincrono di partire, poi chiude
                setTimeout(doClose, 400);
            }, doClose);
        } else {
            doClose();
        }
    }

    // ===== CLIPBOARD =====

    paste() {
        if (window.spreadsheet) {
            window.spreadsheet.paste();
            this.updateStatus('Incollato');
        }
    }

    cut() {
        if (window.spreadsheet) {
            window.spreadsheet.cut();
            this.updateStatus('Tagliato');
        }
    }

    copy() {
        if (window.spreadsheet) {
            window.spreadsheet.copy();
            this.updateStatus('Copiato');
        }
    }

    // ===== FORMATTAZIONE =====

    toggleBold() {
        if (window.spreadsheet) {
            const isBold = window.spreadsheet.toggleBold();
            const btnBold = document.getElementById('btn-bold');
            if (btnBold) btnBold.classList.toggle('active', isBold);
            this.updateStatus('Grassetto ' + (isBold ? 'on' : 'off'));
        }
    }

    toggleItalic() {
        if (window.spreadsheet) {
            const isItalic = window.spreadsheet.toggleItalic();
            const btnItalic = document.getElementById('btn-italic');
            if (btnItalic) btnItalic.classList.toggle('active', isItalic);
            this.updateStatus('Corsivo ' + (isItalic ? 'on' : 'off'));
        }
    }

    toggleUnderline() {
        if (window.spreadsheet) {
            const isUnderline = window.spreadsheet.toggleUnderline();
            const btnUnderline = document.getElementById('btn-underline');
            if (btnUnderline) btnUnderline.classList.toggle('active', isUnderline);
            this.updateStatus('Sottolineato ' + (isUnderline ? 'on' : 'off'));
        }
    }

    // ===== VARIE =====

    autoSum() {
        if (window.spreadsheet) {
            window.spreadsheet.autoSum();
            this.updateStatus('Somma automatica');
        }
    }

    recalculateSheet() {
        if (window.spreadsheet) {
            window.spreadsheet.recalculate();
            this.updateStatus('Ricalcolato');
        }
    }

    selectAll() {
        if (window.spreadsheet) {
            window.spreadsheet.selectAll();
            this.updateStatus("Tutto selezionato");
        }
    }

    undo() {
        if (window.spreadsheet) {
            window.spreadsheet.undo();
        }
    }

    redo() {
        if (window.spreadsheet) {
            window.spreadsheet.redo();
        }
    }

    showHelp() {
        window.open('guida.html', '_blank');
        this.updateStatus('Guida aperta');
    }

    updateStatus(message) {
        const statusElement = document.getElementById('status-text');
        if (statusElement) {
            statusElement.textContent = message;
            setTimeout(() => {
                if (statusElement.textContent === message) {
                    statusElement.textContent = 'Pronto';
                }
            }, 3000);
        }
    }

    showNotification(message, type = 'info') {
        const existing = document.getElementById('excel-notification');
        if (existing) existing.remove();
        const colors = { error: '#c0392b', info: '#2980b9', success: '#217346' };
        const icons = { error: 'fa-exclamation-circle', info: 'fa-info-circle', success: 'fa-check-circle' };
        const toast = document.createElement('div');
        toast.id = 'excel-notification';
        toast.style.cssText = `position:fixed;top:20px;right:20px;background:${colors[type] || colors.info};color:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.2);z-index:10001;display:flex;align-items:center;gap:10px;font-size:14px;max-width:400px;animation:slideIn 0.3s ease;`;
        toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span><button style="border:none;background:none;color:#fff;font-size:18px;cursor:pointer;margin-left:8px;padding:0;" onclick="this.parentElement.remove()">✕</button>`;
        document.body.appendChild(toast);
        setTimeout(() => { if (toast.parentElement) toast.remove(); }, 4000);
    }

    // ===== DIALOG =====

    handleSaveConfirm() {
        const filenameInput = document.getElementById('filename-input');
        if (filenameInput && filenameInput.value) {
            this.performSave(filenameInput.value);
        }
    }

    handleSaveCancel() {
        const saveDialog = document.getElementById('save-dialog');
        if (saveDialog) saveDialog.style.display = 'none';
    }

    handleOpenConfirm() {
        const selectedFile = document.querySelector('.file-item.selected');
        if (selectedFile) {
            this.performOpen(selectedFile.textContent);
        } else {
            this.showNotification('Seleziona un file', 'info');
        }
    }

    handleOpenCancel() {
        const openDialog = document.getElementById('open-dialog');
        if (openDialog) openDialog.style.display = 'none';
    }

    initExternalEvents() {
        const saveConfirm = document.getElementById('save-confirm');
        const saveCancel = document.getElementById('save-cancel');
        if (saveConfirm) saveConfirm.addEventListener('click', () => this.handleSaveConfirm());
        if (saveCancel) saveCancel.addEventListener('click', () => this.handleSaveCancel());

        const openConfirm = document.getElementById('open-confirm');
        const openCancel = document.getElementById('open-cancel');
        if (openConfirm) openConfirm.addEventListener('click', () => this.handleOpenConfirm());
        if (openCancel) openCancel.addEventListener('click', () => this.handleOpenCancel());

        window.addEventListener('click', (e) => {
            const saveDialog = document.getElementById('save-dialog');
            const openDialog = document.getElementById('open-dialog');
            if (e.target === saveDialog) this.handleSaveCancel();
            if (e.target === openDialog) this.handleOpenCancel();
        });

        const btnPaste = document.getElementById('btn-paste');
        const btnCut = document.getElementById('btn-cut');
        const btnCopy = document.getElementById('btn-copy');
        const btnBold = document.getElementById('btn-bold');
        const btnItalic = document.getElementById('btn-italic');
        const btnUnderline = document.getElementById('btn-underline');

        if (btnPaste) btnPaste.addEventListener('click', () => this.paste());
        if (btnCut) btnCut.addEventListener('click', () => this.cut());
        if (btnCopy) btnCopy.addEventListener('click', () => this.copy());
        if (btnBold) btnBold.addEventListener('click', () => this.toggleBold());
        if (btnItalic) btnItalic.addEventListener('click', () => this.toggleItalic());
        if (btnUnderline) btnUnderline.addEventListener('click', () => this.toggleUnderline());

        const btnNormalView = document.getElementById('btn-normal-view');
        const btnPageLayout = document.getElementById('btn-page-layout');
        const btnPageBreak = document.getElementById('btn-page-break');
        const btnZoomIn = document.getElementById('btn-zoom-in');
        const btnZoomOut = document.getElementById('btn-zoom-out');

        if (btnNormalView) {
            btnNormalView.addEventListener('click', () => {
                this.showRibbonTab('view-tab');
                this.setActiveMenuItem('visualizza');
            });
        }
        if (btnPageLayout) {
            btnPageLayout.addEventListener('click', () => {
                this.showRibbonTab('page-layout-tab');
                this.setActiveMenuItem('layout-di-pagina');
            });
        }
        if (btnPageBreak) {
            btnPageBreak.addEventListener('click', () => {
                this.showRibbonTab('view-tab');
                this.setActiveMenuItem('visualizza');
            });
        }
        // Zoom +/- della barra di stato: gestiti da excel-advanced.js (setZoom/currentZoom),
        // unica fonte di stato dello zoom. Qui non li ribindiamo per evitare stati divergenti.

        const btnComments = document.getElementById('btn-comments');
        const btnUpdate = document.getElementById('btn-update');
        const btnEdit = document.getElementById('btn-edit');
        const btnBuyMS365 = document.getElementById('btn-buy-ms365');

        if (btnComments) {
            btnComments.addEventListener('click', () => {
                this.showRibbonTab('review-tab');
                this.setActiveMenuItem('revisione');
            });
        }
        if (btnUpdate) btnUpdate.addEventListener('click', () => this.updateStatus('Aggiornamento'));
        if (btnEdit) btnEdit.addEventListener('click', () => {
            if (window.spreadsheet && window.spreadsheet.selectedCell) {
                window.spreadsheet.editCell(window.spreadsheet.selectedCell);
            }
        });
        if (btnBuyMS365) btnBuyMS365.addEventListener('click', () => { window.open('../buy.html', '_blank'); });
    }

    // ===== ZOOM =====
    zoomIn() {
        this._setZoom((this._currentZoom || 100) + 10);
    }

    zoomOut() {
        this._setZoom((this._currentZoom || 100) - 10);
    }

    _setZoom(level) {
        level = Math.max(10, Math.min(400, level));
        this._currentZoom = level;
        const viewport = document.getElementById('spreadsheet-viewport');
        if (viewport) {
            viewport.style.transform = `scale(${level / 100})`;
            viewport.style.transformOrigin = 'top left';
        }
        const zoomLabel = document.getElementById('zoom-level');
        if (zoomLabel) zoomLabel.textContent = level + '%';
        this.updateStatus('Zoom: ' + level + '%');
    }
}
