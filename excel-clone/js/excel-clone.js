// excel-clone.js

function showConfirmDialog(message, onConfirm, onCancel) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
    overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <i class="fas fa-question-circle" style="font-size:24px;color:#e67e22;"></i>
            <p style="margin:0;font-size:14px;">${message}</p>
        </div>
        <div style="text-align:right;">
            <button id="confirm-no" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">No</button>
            <button id="confirm-yes" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Sì</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#confirm-no').onclick = () => { close(); if (onCancel) onCancel(); };
    overlay.querySelector('#confirm-yes').onclick = () => { close(); if (onConfirm) onConfirm(); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { close(); if (onCancel) onCancel(); } });
}

document.addEventListener('DOMContentLoaded', function() {
    // Inizializza il sistema dei menu
    const menuSystem = new ExcelMenu('menu-bar');
    
    // Inizializza il foglio di calcolo
    const spreadsheet = new Spreadsheet('spreadsheet', 100, 26);
    
    // INIZIALIZZA LE FUNZIONI BASE
    const excelFunctions = enhanceSpreadsheet(spreadsheet);
    
    // INIZIALIZZA LE FUNZIONI AVANZATE (se il file esiste)
    let excelAdvanced = null;
    if (typeof initExcelAdvanced !== 'undefined') {
        excelAdvanced = initExcelAdvanced(spreadsheet, excelFunctions);
    }
    
    // Espone le istanze per l'uso globale
    window.excelMenu = menuSystem;
    window.spreadsheet = spreadsheet;
    window.excelFunctions = excelFunctions;
    if (excelAdvanced) {
        window.excelAdvanced = excelAdvanced;
    }
    
    // Inizializza gli eventi esterni (dialog, toolbar, etc.)
    if (menuSystem.initExternalEvents) {
        menuSystem.initExternalEvents();
    }
    
    // Solo i controlli finestra rimangono qui
    initWindowControls();
    
    function initWindowControls() {
        // Controlli finestra (simulati)
        const minimizeBtn = document.querySelector('.control-btn.minimize');
        const maximizeBtn = document.querySelector('.control-btn.maximize');
        const closeBtn = document.querySelector('.control-btn.close');
        
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                document.body.style.transform = 'scale(0)';
                document.body.style.transition = 'transform 0.3s';
                setTimeout(() => { document.body.style.transform = ''; }, 300);
            });
        }

        if (maximizeBtn) {
            maximizeBtn.addEventListener('click', () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                } else {
                    document.exitFullscreen();
                }
            });
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                showConfirmDialog('Vuoi chiudere l\'applicazione?', () => menuSystem.closeFile());
            });
        }
        
        // Barra di ricerca
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    menuSystem.showHelp();
                }
            });
        }
        
        // Previeni menu contestuale solo dove non gestito
        document.addEventListener('contextmenu', (e) => {
            // Non impedire su celle e oggetti grafici (hanno menu personalizzato)
            if (e.target.closest('.cell') || e.target.closest('.drawing-object')) return;
            e.preventDefault();
        });
    }
});
