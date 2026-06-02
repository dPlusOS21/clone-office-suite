// excel-functions.js
class ExcelFunctions {
    constructor(spreadsheet) {
        this.spreadsheet = spreadsheet;
        this.init();
    }

    init() {
        this.migrateExistingCells();
        this.bindFormattingEvents();
        this.bindAlignmentEvents();
        this.bindNumberFormatEvents();
        this.bindCellOperations();
        this.bindEditingEvents();
        this.bindAdvancedFormatting();
        this.bindClipboardEvents();
    }

    // ===== FORMATTAZIONE TESTO AVANZATA =====
    bindFormattingEvents() {
        // Font family
        const fontFamily = document.getElementById('font-family');
        if (fontFamily) {
            fontFamily.addEventListener('change', (e) => {
                this.setFontFamily(e.target.value);
            });
        }

        // Font size
        const fontSize = document.getElementById('font-size');
        if (fontSize) {
            fontSize.addEventListener('change', (e) => {
                this.setFontSize(parseInt(e.target.value));
            });
        }

        // Colore carattere
        document.querySelectorAll('[title*="Colore carattere"]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showColorPicker('font');
            });
        });

        // Colore riempimento
        document.querySelectorAll('[title*="Colore riempimento"]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showColorPicker('fill');
            });
        });

        // Bordi
        document.querySelectorAll('[title*="Bordi"]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showBorderMenu();
            });
        });
    }

    setFontFamily(fontFamily) {
        if (!this.spreadsheet.data[this.spreadsheet.selectedCell]) {
            this.spreadsheet.data[this.spreadsheet.selectedCell] = this.createCellData();
        }
        this.spreadsheet.data[this.spreadsheet.selectedCell].format.fontFamily = fontFamily;
        this.applyFormatToSelection('fontFamily', fontFamily);
        this.spreadsheet.updateCellDisplay(this.spreadsheet.selectedCell);
        this.spreadsheet.setModified(true);
        this.spreadsheet.setModified(true);
    }

    setFontSize(fontSize) {
        if (!this.spreadsheet.data[this.spreadsheet.selectedCell]) {
            this.spreadsheet.data[this.spreadsheet.selectedCell] = this.createCellData();
        }
        this.spreadsheet.data[this.spreadsheet.selectedCell].format.fontSize = fontSize;
        this.applyFormatToSelection('fontSize', fontSize);
        this.spreadsheet.updateCellDisplay(this.spreadsheet.selectedCell);
        this.spreadsheet.setModified(true);
        this.spreadsheet.saveState();
    }

    // ===== ALLINEAMENTO =====
    bindAlignmentEvents() {
        // Allineamento orizzontale
        document.querySelectorAll('[title*="Allinea a sinistra"]').forEach(btn => {
            btn.addEventListener('click', () => this.setHorizontalAlignment('left'));
        });

        document.querySelectorAll('[title*="Allinea al centro"]').forEach(btn => {
            btn.addEventListener('click', () => this.setHorizontalAlignment('center'));
        });

        document.querySelectorAll('[title*="Allinea a destra"]').forEach(btn => {
            btn.addEventListener('click', () => this.setHorizontalAlignment('right'));
        });

        // Allineamento verticale
        document.querySelectorAll('[title*="Allinea in alto"]').forEach(btn => {
            btn.addEventListener('click', () => this.setVerticalAlignment('top'));
        });

        document.querySelectorAll('[title*="Allinea al centro verticale"]').forEach(btn => {
            btn.addEventListener('click', () => this.setVerticalAlignment('middle'));
        });

        document.querySelectorAll('[title*="Allinea in basso"]').forEach(btn => {
            btn.addEventListener('click', () => this.setVerticalAlignment('bottom'));
        });

        // Unisci e centra
        document.querySelectorAll('[title*="Unisci e centra"]').forEach(btn => {
            btn.addEventListener('click', () => this.mergeCells());
        });

        // A capo automatico
        document.querySelectorAll('[title*="A capo automatico"]').forEach(btn => {
            btn.addEventListener('click', () => this.toggleWrapText());
        });
    }

    setHorizontalAlignment(alignment) {
        this.applyFormatToSelection('horizontalAlign', alignment);
        this.spreadsheet.setModified(true);
        this.spreadsheet.saveState();
    }

    setVerticalAlignment(alignment) {
        this.applyFormatToSelection('verticalAlign', alignment);
        this.spreadsheet.setModified(true);
        this.spreadsheet.saveState();
    }

    toggleWrapText() {
        const current = this.spreadsheet.data[this.spreadsheet.selectedCell]?.format.wrapText || false;
        this.applyFormatToSelection('wrapText', !current);
        this.spreadsheet.setModified(true);
        this.spreadsheet.saveState();
    }

    mergeCells() {
        const start = this.spreadsheet.selectedRange.start;
        const end = this.spreadsheet.selectedRange.end;

        if (start === end) {
            // Se è già unita, separa
            const cellData = this.spreadsheet.data[start];
            if (cellData && cellData.merged) {
                this.unmergeCells(start);
                return;
            }
            this.spreadsheet.updateStatus('Seleziona un range di celle per unire');
            return;
        }

        const startCoords = this.spreadsheet.getCellCoordinates(start);
        const endCoords = this.spreadsheet.getCellCoordinates(end);
        const s = this.spreadsheet;

        // Numero righe e colonne
        const numRows = endCoords.row - startCoords.row + 1;
        const numCols = endCoords.col - startCoords.col + 1;

        // Crea/aggiorna cella principale
        const mergedData = s.data[start] || this.createCellData();
        mergedData.merged = { start, end, rows: numRows, cols: numCols };
        s.data[start] = mergedData;

        // Espandi visivamente la cella principale
        const startEl = document.querySelector(`[data-cell="${start}"]`);
        if (startEl) {
            startEl.style.width = (s.cellWidth * numCols) + 'px';
            startEl.style.height = (s.cellHeight * numRows) + 'px';
            startEl.style.zIndex = '3';
            startEl.style.overflow = 'hidden';
        }

        // Nascondi le celle coperte
        for (let row = startCoords.row; row <= endCoords.row; row++) {
            for (let col = startCoords.col; col <= endCoords.col; col++) {
                if (row === startCoords.row && col === startCoords.col) continue;
                const cellRef = `${s.numberToColumn(col)}${row + 1}`;
                const cellEl = document.querySelector(`[data-cell="${cellRef}"]`);
                if (cellEl) cellEl.style.visibility = 'hidden';
                delete s.data[cellRef];
            }
        }

        s.updateCellDisplay(start);
        // Centra il contenuto
        s.data[start].format.horizontalAlign = 'center';
        s.data[start].format.verticalAlign = 'middle';
        s.updateCellDisplay(start);
        s.setModified(true);
        s.saveState();
        s.updateStatus(`Celle unite: ${start}:${end}`);
    }

    unmergeCells(cellRef) {
        const s = this.spreadsheet;
        const cellData = s.data[cellRef];
        if (!cellData || !cellData.merged) return;

        const startCoords = s.getCellCoordinates(cellData.merged.start);
        const endCoords = s.getCellCoordinates(cellData.merged.end);

        // Ripristina dimensioni della cella principale
        const startEl = document.querySelector(`[data-cell="${cellRef}"]`);
        if (startEl) {
            startEl.style.width = s.cellWidth + 'px';
            startEl.style.height = s.cellHeight + 'px';
            startEl.style.zIndex = '';
        }

        // Mostra le celle nascoste
        for (let row = startCoords.row; row <= endCoords.row; row++) {
            for (let col = startCoords.col; col <= endCoords.col; col++) {
                const ref = `${s.numberToColumn(col)}${row + 1}`;
                const cellEl = document.querySelector(`[data-cell="${ref}"]`);
                if (cellEl) cellEl.style.visibility = '';
            }
        }

        delete cellData.merged;
        s.updateCellDisplay(cellRef);
        s.setModified(true);
        s.saveState();
        s.updateStatus('Celle separate');
    }

    // ===== FORMATTAZIONE NUMERI =====
    bindNumberFormatEvents() {
        const numberFormat = document.getElementById('number-format');
        if (numberFormat) {
            numberFormat.addEventListener('change', (e) => {
                this.setNumberFormat(e.target.value);
            });
        }

        // Formato valuta
        document.querySelectorAll('[title*="Formato valuta"]').forEach(btn => {
            btn.addEventListener('click', () => this.setNumberFormat('currency'));
        });

        // Formato percentuale
        document.querySelectorAll('[title*="Formato percentuale"]').forEach(btn => {
            btn.addEventListener('click', () => this.setNumberFormat('percentage'));
        });

        // Separatore migliaia
        document.querySelectorAll('[title*="Formato separatore"]').forEach(btn => {
            btn.addEventListener('click', () => this.setNumberFormat('thousands'));
        });

        // Decimali
        document.querySelectorAll('[title*="Aumenta decimali"]').forEach(btn => {
            btn.addEventListener('click', () => this.adjustDecimals(1));
        });

        document.querySelectorAll('[title*="Riduci decimali"]').forEach(btn => {
            btn.addEventListener('click', () => this.adjustDecimals(-1));
        });
    }

    setNumberFormat(format) {
        // Normalizza verso le chiavi canoniche usate da _formatNumber:
        // gestisce sia i nomi inglesi dei pulsanti (currency/percentage/thousands)
        // sia i testi italiani del menu a tendina (con maiuscola).
        const map = {
            'currency': 'valuta', 'percentage': 'percentuale', 'thousands': 'separatore',
            'generale': 'generale', 'numero': 'numero', 'valuta': 'valuta',
            'contabile': 'contabile', 'data breve': 'data breve', 'data lunga': 'data lunga',
            'ora': 'ora', 'percentuale': 'percentuale', 'frazione': 'frazione',
            'scientifico': 'scientifico', 'testo': 'testo',
            'altri formati numerici': 'generale'
        };
        const canon = map[String(format).toLowerCase()] || 'generale';
        this.applyFormatToSelection('numberFormat', canon);
        this.spreadsheet.setModified(true);
        this.spreadsheet.saveState();
        this.updateSelectedCellsDisplay();
    }

    adjustDecimals(direction) {
        const cells = this.getSelectedCells();
        cells.forEach(cellRef => {
            if (!this.spreadsheet.data[cellRef]) return;
            const cell = this.spreadsheet.data[cellRef];
            // Applica solo a celle numeriche
            if (!this.spreadsheet.isNumber(cell.computedValue || cell.value)) return;
            // Se la cella è in formato Generale/Testo, passa a Numero così i decimali sono visibili
            if (!cell.format.numberFormat || cell.format.numberFormat === 'generale' || cell.format.numberFormat === 'testo') {
                cell.format.numberFormat = 'numero';
            }
            if (!cell.format.decimals) cell.format.decimals = 0;
            cell.format.decimals = Math.max(0, cell.format.decimals + direction);
            this.spreadsheet.updateCellDisplay(cellRef);
        });
        this.spreadsheet.setModified(true);
        this.spreadsheet.saveState();
    }

    // ===== OPERAZIONI CELLE =====
    bindCellOperations() {
        // Inserisci — solo il bottone specifico nel Home tab (id btn-insert-cells)
        const btnInsert = document.getElementById('btn-insert-cells');
        if (btnInsert) btnInsert.addEventListener('click', () => this.insertCells());

        // Elimina — solo il bottone specifico nel Home tab (id btn-delete-cells)
        const btnDelete = document.getElementById('btn-delete-cells');
        if (btnDelete) btnDelete.addEventListener('click', () => this.deleteCells());

        // Formato celle — solo il bottone specifico nel Home tab (id btn-format-cells)
        const btnFormat = document.getElementById('btn-format-cells');
        if (btnFormat) btnFormat.addEventListener('click', () => this.showFormatDialog());
    }

    insertCells() {
        const self = this;
        const s = this.spreadsheet;
        if (s.isProtected) {
            s.updateStatus('Il foglio è protetto. Impossibile inserire celle.');
            return;
        }
        const overlay = document.createElement('div');
        overlay.id = 'insert-cells-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:20px;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <strong style="font-size:15px;">Inserisci celle</strong>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#insert-cells-modal').remove()">✕</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                <label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;">
                    <input type="radio" name="insert-opt" value="right" checked> Sposta celle a destra
                </label>
                <label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;">
                    <input type="radio" name="insert-opt" value="down"> Sposta celle in basso
                </label>
                <label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;">
                    <input type="radio" name="insert-opt" value="row"> Riga intera
                </label>
                <label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;">
                    <input type="radio" name="insert-opt" value="col"> Colonna intera
                </label>
            </div>
            <div style="margin-top:16px;text-align:right;">
                <button id="ic-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="ic-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>`;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        dialog.querySelector('#ic-cancel').onclick = () => overlay.remove();
        dialog.querySelector('#ic-ok').onclick = () => {
            const opt = dialog.querySelector('input[name="insert-opt"]:checked').value;
            const coords = s.getCellCoordinates(s.selectedCell);
            if (opt === 'row') {
                s.insertRow();
            } else if (opt === 'col') {
                s.insertColumn();
            } else if (opt === 'down') {
                // Sposta celle in basso: sposta i dati dalla riga corrente verso il basso
                const col = s.numberToColumn(coords.col);
                for (let r = s.rows - 1; r > coords.row; r--) {
                    const src = col + r;
                    const dst = col + (r + 1);
                    const val = s.getCellValue(src);
                    if (val) { s.setCellValue(dst, val); s.setCellValue(src, ''); }
                }
                s.setCellValue(s.selectedCell, '');
                s.updateStatus('Celle spostate in basso');
            } else {
                // Sposta celle a destra
                const row = coords.row + 1;
                for (let c = s.cols - 1; c > coords.col; c--) {
                    const src = s.numberToColumn(c - 1) + row;
                    const dst = s.numberToColumn(c) + row;
                    const val = s.getCellValue(src);
                    if (val) { s.setCellValue(dst, val); s.setCellValue(src, ''); }
                }
                s.setCellValue(s.selectedCell, '');
                s.updateStatus('Celle spostate a destra');
            }
            s.setModified(true);
            overlay.remove();
        };
    }

    deleteCells() {
        const self = this;
        const s = this.spreadsheet;
        if (s.isProtected) {
            s.updateStatus('Il foglio è protetto. Impossibile eliminare celle.');
            return;
        }
        const overlay = document.createElement('div');
        overlay.id = 'delete-cells-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:20px;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <strong style="font-size:15px;">Elimina celle</strong>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#delete-cells-modal').remove()">✕</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                <label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;">
                    <input type="radio" name="delete-opt" value="left" checked> Sposta celle a sinistra
                </label>
                <label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;">
                    <input type="radio" name="delete-opt" value="up"> Sposta celle in alto
                </label>
                <label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;">
                    <input type="radio" name="delete-opt" value="row"> Riga intera
                </label>
                <label style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;">
                    <input type="radio" name="delete-opt" value="col"> Colonna intera
                </label>
            </div>
            <div style="margin-top:16px;text-align:right;">
                <button id="dc-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="dc-ok" style="padding:6px 16px;background:#c42b1c;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>`;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        dialog.querySelector('#dc-cancel').onclick = () => overlay.remove();
        dialog.querySelector('#dc-ok').onclick = () => {
            const opt = dialog.querySelector('input[name="delete-opt"]:checked').value;
            const coords = s.getCellCoordinates(s.selectedCell);
            if (opt === 'row') {
                s.deleteRow();
            } else if (opt === 'col') {
                s.deleteColumn();
            } else if (opt === 'up') {
                const col = s.numberToColumn(coords.col);
                for (let r = coords.row; r < s.rows - 1; r++) {
                    const src = col + (r + 2);
                    const dst = col + (r + 1);
                    const val = s.getCellValue(src);
                    s.setCellValue(dst, val || '');
                }
                s.setCellValue(s.numberToColumn(coords.col) + s.rows, '');
                s.updateStatus('Celle spostate in alto');
            } else {
                const row = coords.row + 1;
                for (let c = coords.col; c < s.cols - 1; c++) {
                    const src = s.numberToColumn(c + 1) + row;
                    const dst = s.numberToColumn(c) + row;
                    const val = s.getCellValue(src);
                    s.setCellValue(dst, val || '');
                }
                s.setCellValue(s.numberToColumn(s.cols - 1) + row, '');
                s.updateStatus('Celle spostate a sinistra');
            }
            s.setModified(true);
            overlay.remove();
        };
    }

    // ===== MODIFICA =====
    bindEditingEvents() {
        // Somma automatica
        document.querySelectorAll('[title*="Somma"]').forEach(btn => {
            btn.addEventListener('click', () => this.autoSum());
        });

        // Riempimento
        document.querySelectorAll('[title*="Riempimento"]').forEach(btn => {
            btn.addEventListener('click', () => this.showFillMenu());
        });

        // Cancella
        document.querySelectorAll('[title*="Cancella"]').forEach(btn => {
            btn.addEventListener('click', () => this.clearContents());
        });

        // Ordina e filtra
        document.querySelectorAll('[title*="Ordina e filtra"]').forEach(btn => {
            btn.addEventListener('click', () => this.showSortFilterMenu());
        });

        // Trova e seleziona
        document.querySelectorAll('[title*="Trova e seleziona"]').forEach(btn => {
            btn.addEventListener('click', () => this.showFindDialog());
        });
    }

    autoSum() {
        this.spreadsheet.autoSum();
    }

    clearContents() {
        const cells = this.getSelectedCells();
        cells.forEach(cellRef => {
            this.spreadsheet.clearCell(cellRef);
        });
        this.spreadsheet.updateStatus('Contenuti cancellati');
    }

    // ===== FORMATTAZIONE AVANZATA =====
    bindAdvancedFormatting() {
        // Stili condizionali — delegato a excel-advanced.js (menu con regole + motore
        // applyConditionalFormat). Qui NON agganciamo per evitare il doppio binding
        // (si aprivano due UI diverse).

        // Formatta come tabella — delegato a excel-advanced.js per evitare doppio bind
        // (bindato in excel-advanced.js bindTableEvents)

        // Stili cella
        document.querySelectorAll('[title*="Stili cella"]').forEach(btn => {
            btn.addEventListener('click', () => this.showCellStyles());
        });
    }

    // ===== APPUNTI (COPIA/TAGLIA/INCOLLA) =====
    // I pulsanti Copia/Taglia/Incolla sono gestiti da excel-menu.js (con messaggi di
    // stato). Qui NON li agganciamo per evitare il doppio binding: l'incolla scattava
    // due volte (doppio incolla).
    bindClipboardEvents() {
        /* no-op: vedi excel-menu.js */
    }

    // ===== BORDI =====
    showBorderMenu() {
        const dialog = document.createElement('div');
        dialog.className = 'modal';
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 4px;
            min-width: 300px;
            max-width: 500px;
        `;

        content.innerHTML = `
            <h3 style="margin-bottom: 15px; font-size: 14px; font-weight: 600;">Bordi</h3>
            
            <div class="border-presets" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 20px;">
                <div class="border-preset" data-type="none" style="border: 1px solid #d6d6d6; padding: 10px; text-align: center; cursor: pointer; border-radius: 2px;">
                    <div style="font-size: 20px; color: #666;">∅</div>
                    <div style="font-size: 11px; margin-top: 5px;">Nessun bordo</div>
                </div>
                <div class="border-preset" data-type="all" style="border: 1px solid #d6d6d6; padding: 10px; text-align: center; cursor: pointer; border-radius: 2px;">
                    <div style="font-size: 20px; color: #666;">▣</div>
                    <div style="font-size: 11px; margin-top: 5px;">Tutti i bordi</div>
                </div>
                <div class="border-preset" data-type="outside" style="border: 1px solid #d6d6d6; padding: 10px; text-align: center; cursor: pointer; border-radius: 2px;">
                    <div style="font-size: 20px; color: #666;">▢</div>
                    <div style="font-size: 11px; margin-top: 5px;">Bordo esterno</div>
                </div>
                <div class="border-preset" data-type="thick" style="border: 1px solid #d6d6d6; padding: 10px; text-align: center; cursor: pointer; border-radius: 2px;">
                    <div style="font-size: 20px; color: #666;">▩</div>
                    <div style="font-size: 11px; margin-top: 5px;">Bordo spesso</div>
                </div>
                <div class="border-preset" data-type="double" style="border: 1px solid #d6d6d6; padding: 10px; text-align: center; cursor: pointer; border-radius: 2px;">
                    <div style="font-size: 20px; color: #666;">⧈</div>
                    <div style="font-size: 11px; margin-top: 5px;">Doppio bordo</div>
                </div>
                <div class="border-preset" data-type="dashed" style="border: 1px solid #d6d6d6; padding: 10px; text-align: center; cursor: pointer; border-radius: 2px;">
                    <div style="font-size: 20px; color: #666;">┄</div>
                    <div style="font-size: 11px; margin-top: 5px;">Tratteggiato</div>
                </div>
            </div>

            <div class="border-custom" style="margin-bottom: 20px;">
                <div style="font-size: 12px; font-weight: 600; margin-bottom: 10px;">Bordi personalizzati</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <label style="font-size: 11px; display: block; margin-bottom: 5px;">Stile linea:</label>
                        <select id="border-style" style="width: 100%; padding: 5px; border: 1px solid #d6d6d6; border-radius: 2px; font-size: 11px;">
                            <option value="none">Nessuno</option>
                            <option value="thin">Linea sottile</option>
                            <option value="medium">Linea media</option>
                            <option value="thick">Linea spessa</option>
                            <option value="double">Doppia linea</option>
                            <option value="dashed">Tratteggiata</option>
                            <option value="dotted">Punteggiata</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 11px; display: block; margin-bottom: 5px;">Colore:</label>
                        <input type="color" id="border-color" value="#000000" style="width: 100%; height: 27px; border: 1px solid #d6d6d6; border-radius: 2px;">
                    </div>
                </div>
                
                <div style="margin-top: 15px;">
                    <div style="font-size: 11px; margin-bottom: 8px;">Applica a:</div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button class="border-side-btn" data-side="all" style="padding: 5px 10px; border: 1px solid #d6d6d6; background: white; border-radius: 2px; font-size: 11px; cursor: pointer;">Tutti i bordi</button>
                        <button class="border-side-btn" data-side="top" style="padding: 5px 10px; border: 1px solid #d6d6d6; background: white; border-radius: 2px; font-size: 11px; cursor: pointer;">Bordo superiore</button>
                        <button class="border-side-btn" data-side="bottom" style="padding: 5px 10px; border: 1px solid #d6d6d6; background: white; border-radius: 2px; font-size: 11px; cursor: pointer;">Bordo inferiore</button>
                        <button class="border-side-btn" data-side="left" style="padding: 5px 10px; border: 1px solid #d6d6d6; background: white; border-radius: 2px; font-size: 11px; cursor: pointer;">Bordo sinistro</button>
                        <button class="border-side-btn" data-side="right" style="padding: 5px 10px; border: 1px solid #d6d6d6; background: white; border-radius: 2px; font-size: 11px; cursor: pointer;">Bordo destro</button>
                        <button class="border-side-btn" data-side="outside" style="padding: 5px 10px; border: 1px solid #d6d6d6; background: white; border-radius: 2px; font-size: 11px; cursor: pointer;">Bordo esterno</button>
                    </div>
                </div>
            </div>

            <div class="modal-buttons" style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;">
                <button id="border-apply" style="padding: 6px 16px; border: 1px solid #0078d4; background: #0078d4; color: white; border-radius: 2px; font-size: 11px; cursor: pointer;">Applica</button>
                <button id="border-cancel" style="padding: 6px 16px; border: 1px solid #d6d6d6; background: white; border-radius: 2px; font-size: 11px; cursor: pointer;">Annulla</button>
            </div>
        `;

        // Aggiungi event listeners per i preset
        content.querySelectorAll('.border-preset').forEach(preset => {
            preset.addEventListener('click', () => {
                // Rimuovi selezione precedente
                content.querySelectorAll('.border-preset').forEach(p => {
                    p.style.backgroundColor = '';
                    p.style.borderColor = '#d6d6d6';
                });
                
                // Seleziona corrente
                preset.style.backgroundColor = '#e1f0ff';
                preset.style.borderColor = '#0078d4';
                
                const borderType = preset.getAttribute('data-type');
                this.applyBorderPreset(borderType);
                document.body.removeChild(dialog);
            });
        });

        // Aggiungi event listeners per i bordi personalizzati
        content.querySelectorAll('.border-side-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const side = btn.getAttribute('data-side');
                const style = content.querySelector('#border-style').value;
                const color = content.querySelector('#border-color').value;
                
                this.applyCustomBorder(side, style, color);
                document.body.removeChild(dialog);
            });
        });

        // Pulsanti di azione
        content.querySelector('#border-apply').addEventListener('click', () => {
            const style = content.querySelector('#border-style').value;
            const color = content.querySelector('#border-color').value;
            this.applyCustomBorder('all', style, color);
            document.body.removeChild(dialog);
        });

        content.querySelector('#border-cancel').addEventListener('click', () => {
            document.body.removeChild(dialog);
        });

        // Chiudi cliccando fuori
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                document.body.removeChild(dialog);
            }
        });

        dialog.appendChild(content);
        document.body.appendChild(dialog);
    }

    applyBorderPreset(presetType) {
        const cells = this.getSelectedCells();
        const borderConfigs = {
            'none': { style: 'none', color: '#000000' },
            'all': { style: 'thin', color: '#000000' },
            'outside': { style: 'thin', color: '#000000' },
            'thick': { style: 'thick', color: '#000000' },
            'double': { style: 'double', color: '#000000' },
            'dashed': { style: 'dashed', color: '#000000' }
        };

        cells.forEach(cellRef => {
            if (!this.spreadsheet.data[cellRef]) {
                this.spreadsheet.data[cellRef] = this.createCellData();
            }

            const cell = this.spreadsheet.data[cellRef];
            
            // INIZIALIZZA I BORDI SE NON ESISTONO
            if (!cell.format.borders) {
                cell.format.borders = {
                    top: { style: 'none', color: '#000000' },
                    right: { style: 'none', color: '#000000' },
                    bottom: { style: 'none', color: '#000000' },
                    left: { style: 'none', color: '#000000' }
                };
            }

            const config = borderConfigs[presetType];

            switch(presetType) {
                case 'none':
                    cell.format.borders.top = { style: 'none', color: '#000000' };
                    cell.format.borders.right = { style: 'none', color: '#000000' };
                    cell.format.borders.bottom = { style: 'none', color: '#000000' };
                    cell.format.borders.left = { style: 'none', color: '#000000' };
                    break;
                case 'all':
                    cell.format.borders.top = config;
                    cell.format.borders.right = config;
                    cell.format.borders.bottom = config;
                    cell.format.borders.left = config;
                    break;
                case 'outside':
                    this.applyOutsideBorder(cellRef, cells, config);
                    break;
                case 'thick':
                case 'double':
                case 'dashed':
                    cell.format.borders.top = config;
                    cell.format.borders.right = config;
                    cell.format.borders.bottom = config;
                    cell.format.borders.left = config;
                    break;
            }

            this.spreadsheet.updateCellDisplay(cellRef);
        });

        this.spreadsheet.setModified(true);
        this.spreadsheet.saveState();
        this.spreadsheet.updateStatus(`Bordo ${presetType} applicato`);
    }

    applyOutsideBorder(cellRef, selectedCells, config) {
        if (selectedCells.length <= 1) {
            this.applyCustomBorderToCell(cellRef, 'all', config.style, config.color);
            return;
        }

        const coords = this.spreadsheet.getCellCoordinates(cellRef);
        let isTop = true, isBottom = true, isLeft = true, isRight = true;

        // Controlla se la cella è sul bordo della selezione
        selectedCells.forEach(otherCellRef => {
            if (otherCellRef !== cellRef) {
                const otherCoords = this.spreadsheet.getCellCoordinates(otherCellRef);
                
                if (otherCoords.row === coords.row - 1) isTop = false;
                if (otherCoords.row === coords.row + 1) isBottom = false;
                if (otherCoords.col === coords.col - 1) isLeft = false;
                if (otherCoords.col === coords.col + 1) isRight = false;
            }
        });

        const cell = this.spreadsheet.data[cellRef];
        
        // INIZIALIZZA I BORDI SE NON ESISTONO
        if (!cell.format.borders) {
            cell.format.borders = {
                top: { style: 'none', color: '#000000' },
                right: { style: 'none', color: '#000000' },
                bottom: { style: 'none', color: '#000000' },
                left: { style: 'none', color: '#000000' }
            };
        }

        // Applica i bordi solo dove la cella è sul bordo esterno
        if (isTop) cell.format.borders.top = config;
        if (isBottom) cell.format.borders.bottom = config;
        if (isLeft) cell.format.borders.left = config;
        if (isRight) cell.format.borders.right = config;
    }

    applyCustomBorder(side, style, color) {
        const cells = this.getSelectedCells();
        
        cells.forEach(cellRef => {
            this.applyCustomBorderToCell(cellRef, side, style, color);
        });

        this.spreadsheet.setModified(true);
        this.spreadsheet.saveState();
        this.spreadsheet.updateStatus(`Bordo personalizzato applicato`);
    }

    applyCustomBorderToCell(cellRef, side, style, color) {
        if (!this.spreadsheet.data[cellRef]) {
            this.spreadsheet.data[cellRef] = this.createCellData();
        }

        const cell = this.spreadsheet.data[cellRef];
        
        // INIZIALIZZA I BORDI SE NON ESISTONO
        if (!cell.format.borders) {
            cell.format.borders = {
                top: { style: 'none', color: '#000000' },
                right: { style: 'none', color: '#000000' },
                bottom: { style: 'none', color: '#000000' },
                left: { style: 'none', color: '#000000' }
            };
        }

        const borderConfig = { style, color };

        switch(side) {
            case 'all':
                cell.format.borders.top = borderConfig;
                cell.format.borders.right = borderConfig;
                cell.format.borders.bottom = borderConfig;
                cell.format.borders.left = borderConfig;
                break;
            case 'top':
                cell.format.borders.top = borderConfig;
                break;
            case 'bottom':
                cell.format.borders.bottom = borderConfig;
                break;
            case 'left':
                cell.format.borders.left = borderConfig;
                break;
            case 'right':
                cell.format.borders.right = borderConfig;
                break;
            case 'outside':
                const selectedCells = this.getSelectedCells();
                this.applyOutsideBorder(cellRef, selectedCells, borderConfig);
                break;
        }

        this.spreadsheet.updateCellDisplay(cellRef);
    }

    // ===== FUNZIONI AUSILIARIE =====
    createCellData() {
        return {
            value: '',
            formula: '',
            format: {
                bold: false,
                italic: false,
                underline: false,
                numberFormat: 'generale',
                horizontalAlign: 'left',
                verticalAlign: 'middle',
                fontFamily: 'Calibri',
                fontSize: 11,
                fontColor: '#000000',
                fillColor: '',
                wrapText: false,
                decimals: 0,
                borders: {
                    top: { style: 'none', color: '#000000' },
                    right: { style: 'none', color: '#000000' },
                    bottom: { style: 'none', color: '#000000' },
                    left: { style: 'none', color: '#000000' }
                }
            },
            computedValue: ''
        };
    }

    migrateExistingCells() {
        for (const cellRef in this.spreadsheet.data) {
            const cell = this.spreadsheet.data[cellRef];
            if (cell && cell.format && !cell.format.borders) {
                cell.format.borders = {
                    top: { style: 'none', color: '#000000' },
                    right: { style: 'none', color: '#000000' },
                    bottom: { style: 'none', color: '#000000' },
                    left: { style: 'none', color: '#000000' }
                };
            }
        }
    }

    applyFormatToSelection(property, value) {
        const cells = this.getSelectedCells();
        if (this.spreadsheet.isProtected) {
            const allEditable = cells.every(ref => this.spreadsheet.isCellEditable(ref));
            if (!allEditable) {
                this.spreadsheet.updateStatus('Operazione annullata: alcune celle sono protette.');
                return;
            }
        }
        cells.forEach(cellRef => {
            if (!this.spreadsheet.data[cellRef]) {
                this.spreadsheet.data[cellRef] = this.createCellData();
            }
            this.spreadsheet.data[cellRef].format[property] = value;
            this.spreadsheet.updateCellDisplay(cellRef);
        });
        this.spreadsheet.setModified(true);
    }

    getSelectedCells() {
        const cells = [];
        const start = this.spreadsheet.selectedRange.start;
        const end = this.spreadsheet.selectedRange.end;
        
        if (start === end) {
            return [start];
        }

        const startCoords = this.spreadsheet.getCellCoordinates(start);
        const endCoords = this.spreadsheet.getCellCoordinates(end);
        
        for (let row = startCoords.row; row <= endCoords.row; row++) {
            for (let col = startCoords.col; col <= endCoords.col; col++) {
                const cellRef = `${this.spreadsheet.numberToColumn(col)}${row + 1}`;
                cells.push(cellRef);
            }
        }

        return cells;
    }

    getRangeData(cells) {
        const data = [];
        const rows = new Map();
        
        // Raggruppa per righe
        cells.forEach(cellRef => {
            const coords = this.spreadsheet.getCellCoordinates(cellRef);
            if (!rows.has(coords.row)) {
                rows.set(coords.row, []);
            }
            rows.get(coords.row).push({
                cellRef,
                value: this.spreadsheet.getCellValue(cellRef),
                data: this.spreadsheet.data[cellRef]
            });
        });

        // Ordina le righe
        const sortedRows = Array.from(rows.keys()).sort((a, b) => a - b);
        sortedRows.forEach(row => {
            // Ordina le colonne nella riga
            const rowCells = rows.get(row).sort((a, b) => {
                const aCol = this.spreadsheet.getCellCoordinates(a.cellRef).col;
                const bCol = this.spreadsheet.getCellCoordinates(b.cellRef).col;
                return aCol - bCol;
            });
            data.push(rowCells);
        });

        return data;
    }

    updateSelectedCellsDisplay() {
        const cells = this.getSelectedCells();
        cells.forEach(cellRef => {
            this.spreadsheet.updateCellDisplay(cellRef);
        });
    }

    // ===== FUNZIONI UI (placeholder per demo) =====
    showColorPicker(type) {
        const self = this;
        const presets = ['#000000','#FFFFFF','#FF0000','#00FF00','#0000FF','#FFFF00','#FF00FF','#00FFFF',
            '#C00000','#FF6600','#FFD966','#92D050','#00B0F0','#7030A0','#FFC0CB','#D9E2F3',
            '#F2F2F2','#D9D9D9','#BFBFBF','#808080','#404040','#262626','#E7E6E6','#FBE5D6'];
        const label = type === 'font' ? 'Colore Carattere' : 'Colore Riempimento';

        const overlay = document.createElement('div');
        overlay.id = 'color-picker-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.3);min-width:280px;';
        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <strong>${label}</strong>
                <button style="border:none;background:none;font-size:18px;cursor:pointer;" onclick="this.closest('#color-picker-modal').remove()">✕</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin-bottom:12px;">
                ${presets.map(c => `<div class="cp-swatch" data-color="${c}" style="width:28px;height:28px;background:${c};border:1px solid #ccc;border-radius:3px;cursor:pointer;" title="${c}"></div>`).join('')}
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
                <label style="font-size:12px;">Personalizzato:</label>
                <input type="color" id="cp-custom" value="#000000" style="width:40px;height:28px;border:1px solid #ccc;border-radius:3px;cursor:pointer;">
                <button id="cp-apply-custom" style="padding:4px 12px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Applica</button>
            </div>
            ${type === 'fill' ? '<div style="margin-top:8px;"><button id="cp-no-fill" style="padding:4px 12px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:12px;">Nessun riempimento</button></div>' : ''}
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        dialog.querySelectorAll('.cp-swatch').forEach(sw => {
            sw.addEventListener('click', () => {
                self.applyFormatToSelection(type === 'font' ? 'fontColor' : 'fillColor', sw.dataset.color);
                self.spreadsheet.setModified(true);
                self.spreadsheet.saveState();
                overlay.remove();
            });
        });

        dialog.querySelector('#cp-apply-custom').addEventListener('click', () => {
            const color = dialog.querySelector('#cp-custom').value;
            self.applyFormatToSelection(type === 'font' ? 'fontColor' : 'fillColor', color);
            self.spreadsheet.setModified(true);
            self.spreadsheet.saveState();
            overlay.remove();
        });

        const noFill = dialog.querySelector('#cp-no-fill');
        if (noFill) {
            noFill.addEventListener('click', () => {
                self.applyFormatToSelection('fillColor', '');
                self.spreadsheet.setModified(true);
                self.spreadsheet.saveState();
                overlay.remove();
            });
        }
    }

    showFormatDialog() {
        const self = this;
        const s = this.spreadsheet;
        const cell = s.selectedCell;
        const data = s.data[cell] || {};
        const fmt = data.format || {};

        const overlay = document.createElement('div');
        overlay.id = 'format-cells-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:0;width:520px;max-height:85vh;box-shadow:0 8px 32px rgba(0,0,0,0.3);display:flex;flex-direction:column;';

        const tabs = ['Numero', 'Allineamento', 'Carattere', 'Bordo', 'Riempimento', 'Protezione'];
        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #ddd;">
                <strong style="font-size:15px;">Formato celle</strong>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#format-cells-modal').remove()">✕</button>
            </div>
            <div id="fc-tabs" style="display:flex;border-bottom:1px solid #ddd;background:#f9f9f9;">
                ${tabs.map((t, i) => `<div class="fc-tab" data-idx="${i}" style="padding:8px 14px;cursor:pointer;font-size:12px;border-bottom:2px solid ${i === 0 ? '#217346' : 'transparent'};${i === 0 ? 'font-weight:bold;color:#217346;' : 'color:#666;'}">${t}</div>`).join('')}
            </div>
            <div id="fc-content" style="padding:16px;min-height:260px;overflow-y:auto;"></div>
            <div style="padding:12px 16px;border-top:1px solid #ddd;text-align:right;">
                <button id="fc-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="fc-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>`;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        dialog.querySelector('#fc-cancel').onclick = () => overlay.remove();

        const content = dialog.querySelector('#fc-content');
        let activeTab = 0;

        // State
        const state = {
            numberFormat: fmt.numberFormat || 'Generale',
            decimals: fmt.decimals != null ? fmt.decimals : 2,
            hAlign: fmt.horizontalAlign || 'general',
            vAlign: fmt.verticalAlign || 'bottom',
            wrapText: fmt.wrapText || false,
            fontFamily: fmt.fontFamily || 'Calibri',
            fontSize: fmt.fontSize || 11,
            bold: fmt.bold || false,
            italic: fmt.italic || false,
            underline: fmt.underline || false,
            fontColor: fmt.fontColor || '#000000',
            fillColor: fmt.fillColor || '',
            borderStyle: fmt.borderStyle || 'none',
            locked: fmt.locked !== false
        };

        const renderTab = (idx) => {
            activeTab = idx;
            dialog.querySelectorAll('.fc-tab').forEach((t, i) => {
                t.style.borderBottom = i === idx ? '2px solid #217346' : '2px solid transparent';
                t.style.fontWeight = i === idx ? 'bold' : 'normal';
                t.style.color = i === idx ? '#217346' : '#666';
            });
            if (idx === 0) { // Numero
                content.innerHTML = `
                    <div style="margin-bottom:12px;">
                        <label style="font-size:12px;font-weight:bold;">Categoria:</label>
                        <select id="fc-numfmt" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;margin-top:4px;">
                            ${['Generale','Numero','Valuta','Contabile','Data breve','Data lunga','Ora','Percentuale','Frazione','Scientifico','Testo'].map(o => `<option${o === state.numberFormat ? ' selected' : ''}>${o}</option>`).join('')}
                        </select>
                    </div>
                    <div style="margin-bottom:12px;">
                        <label style="font-size:12px;font-weight:bold;">Posizioni decimali:</label>
                        <input type="number" id="fc-decimals" value="${state.decimals}" min="0" max="30" style="width:80px;padding:6px;border:1px solid #ccc;border-radius:4px;margin-top:4px;">
                    </div>
                    <div style="padding:12px;background:#f5f5f5;border-radius:4px;font-size:12px;">
                        <b>Anteprima:</b> <span id="fc-preview">${self.formatPreview(s.getCellValue(cell), state.numberFormat, state.decimals)}</span>
                    </div>`;
                content.querySelector('#fc-numfmt').onchange = (e) => { state.numberFormat = e.target.value; content.querySelector('#fc-preview').textContent = self.formatPreview(s.getCellValue(cell), state.numberFormat, state.decimals); };
                content.querySelector('#fc-decimals').onchange = (e) => { state.decimals = parseInt(e.target.value); content.querySelector('#fc-preview').textContent = self.formatPreview(s.getCellValue(cell), state.numberFormat, state.decimals); };
            } else if (idx === 1) { // Allineamento
                content.innerHTML = `
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        <div>
                            <label style="font-size:12px;font-weight:bold;">Allineamento orizzontale:</label>
                            <select id="fc-halign" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;margin-top:4px;">
                                ${['general','left','center','right'].map(o => `<option value="${o}"${o === state.hAlign ? ' selected' : ''}>${o === 'general' ? 'Generale' : o === 'left' ? 'Sinistra' : o === 'center' ? 'Centro' : 'Destra'}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="font-size:12px;font-weight:bold;">Allineamento verticale:</label>
                            <select id="fc-valign" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;margin-top:4px;">
                                ${['top','middle','bottom'].map(o => `<option value="${o}"${o === state.vAlign ? ' selected' : ''}>${o === 'top' ? 'In alto' : o === 'middle' ? 'Al centro' : 'In basso'}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div style="margin-top:12px;">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                            <input type="checkbox" id="fc-wrap" ${state.wrapText ? 'checked' : ''}> Testo a capo
                        </label>
                    </div>`;
                content.querySelector('#fc-halign').onchange = (e) => state.hAlign = e.target.value;
                content.querySelector('#fc-valign').onchange = (e) => state.vAlign = e.target.value;
                content.querySelector('#fc-wrap').onchange = (e) => state.wrapText = e.target.checked;
            } else if (idx === 2) { // Carattere
                content.innerHTML = `
                    <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:12px;">
                        <div>
                            <label style="font-size:12px;font-weight:bold;">Tipo di carattere:</label>
                            <select id="fc-font" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;margin-top:4px;">
                                ${['Calibri','Arial','Times New Roman','Verdana','Georgia','Courier New','Trebuchet MS','Tahoma','Comic Sans MS'].map(f => `<option${f === state.fontFamily ? ' selected' : ''}>${f}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="font-size:12px;font-weight:bold;">Dimensione:</label>
                            <input type="number" id="fc-fsize" value="${state.fontSize}" min="6" max="72" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;margin-top:4px;">
                        </div>
                    </div>
                    <div style="display:flex;gap:12px;margin-bottom:12px;">
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" id="fc-bold" ${state.bold ? 'checked' : ''}> <b>Grassetto</b></label>
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" id="fc-italic" ${state.italic ? 'checked' : ''}> <i>Corsivo</i></label>
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" id="fc-underline" ${state.underline ? 'checked' : ''}> <u>Sottolineato</u></label>
                    </div>
                    <div>
                        <label style="font-size:12px;font-weight:bold;">Colore:</label>
                        <input type="color" id="fc-fcolor" value="${state.fontColor}" style="margin-left:8px;cursor:pointer;">
                    </div>
                    <div style="margin-top:12px;padding:12px;background:#f5f5f5;border-radius:4px;">
                        <span id="fc-font-preview" style="font-family:${state.fontFamily};font-size:${state.fontSize}px;${state.bold ? 'font-weight:bold;' : ''}${state.italic ? 'font-style:italic;' : ''}${state.underline ? 'text-decoration:underline;' : ''}color:${state.fontColor};">AaBbCcYyZz 123</span>
                    </div>`;
                const updatePreview = () => {
                    const p = content.querySelector('#fc-font-preview');
                    if (p) { p.style.fontFamily = state.fontFamily; p.style.fontSize = state.fontSize + 'px'; p.style.fontWeight = state.bold ? 'bold' : 'normal'; p.style.fontStyle = state.italic ? 'italic' : 'normal'; p.style.textDecoration = state.underline ? 'underline' : 'none'; p.style.color = state.fontColor; }
                };
                content.querySelector('#fc-font').onchange = (e) => { state.fontFamily = e.target.value; updatePreview(); };
                content.querySelector('#fc-fsize').onchange = (e) => { state.fontSize = parseInt(e.target.value); updatePreview(); };
                content.querySelector('#fc-bold').onchange = (e) => { state.bold = e.target.checked; updatePreview(); };
                content.querySelector('#fc-italic').onchange = (e) => { state.italic = e.target.checked; updatePreview(); };
                content.querySelector('#fc-underline').onchange = (e) => { state.underline = e.target.checked; updatePreview(); };
                content.querySelector('#fc-fcolor').onchange = (e) => { state.fontColor = e.target.value; updatePreview(); };
            } else if (idx === 3) { // Bordo
                const borders = [
                    { id: 'none', label: 'Nessuno', icon: '▢' },
                    { id: 'all', label: 'Tutti i bordi', icon: '▦' },
                    { id: 'outline', label: 'Contorno', icon: '□' },
                    { id: 'bottom', label: 'Bordo inferiore', icon: '▁' },
                    { id: 'top', label: 'Bordo superiore', icon: '▔' },
                    { id: 'left', label: 'Bordo sinistro', icon: '▏' },
                    { id: 'right', label: 'Bordo destro', icon: '▕' }
                ];
                content.innerHTML = `
                    <label style="font-size:12px;font-weight:bold;">Stile bordo:</label>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;">
                        ${borders.map(b => `<button class="fc-border-btn" data-border="${b.id}" style="padding:10px;border:1px solid #ddd;background:${b.id === state.borderStyle ? '#e8f5e9' : '#fff'};border-radius:4px;cursor:pointer;text-align:left;font-size:13px;">${b.icon} ${b.label}</button>`).join('')}
                    </div>`;
                content.querySelectorAll('.fc-border-btn').forEach(btn => {
                    btn.onclick = () => {
                        state.borderStyle = btn.dataset.border;
                        content.querySelectorAll('.fc-border-btn').forEach(b => b.style.background = b.dataset.border === state.borderStyle ? '#e8f5e9' : '#fff');
                    };
                });
            } else if (idx === 4) { // Riempimento
                const colors = ['', '#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
                    '#C6EFCE', '#FFC7CE', '#FFEB9C', '#D9E2F3', '#E2EFDA', '#FCE4D6', '#F2F2F2', '#D6DCE4', '#4472C4',
                    '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#9B2335', '#636363'];
                content.innerHTML = `
                    <label style="font-size:12px;font-weight:bold;">Colore di sfondo:</label>
                    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;">
                        ${colors.map(c => `<div class="fc-fill-btn" data-color="${c}" style="width:28px;height:28px;background:${c || '#fff'};border:2px solid ${c === state.fillColor ? '#217346' : '#ddd'};border-radius:4px;cursor:pointer;${!c ? 'position:relative;overflow:hidden;' : ''}" title="${c || 'Nessun colore'}">${!c ? '<div style="position:absolute;top:50%;left:-2px;width:140%;height:2px;background:red;transform:rotate(-45deg);"></div>' : ''}</div>`).join('')}
                    </div>
                    <div style="margin-top:12px;">
                        <label style="font-size:12px;">Colore personalizzato: </label>
                        <input type="color" id="fc-custom-fill" value="${state.fillColor || '#ffffff'}" style="cursor:pointer;">
                    </div>`;
                content.querySelectorAll('.fc-fill-btn').forEach(btn => {
                    btn.onclick = () => {
                        state.fillColor = btn.dataset.color;
                        content.querySelectorAll('.fc-fill-btn').forEach(b => b.style.borderColor = b.dataset.color === state.fillColor ? '#217346' : '#ddd');
                    };
                });
                content.querySelector('#fc-custom-fill').onchange = (e) => {
                    state.fillColor = e.target.value;
                    content.querySelectorAll('.fc-fill-btn').forEach(b => b.style.borderColor = '#ddd');
                };
            } else { // Protezione
                content.innerHTML = `
                    <div style="margin-bottom:12px;">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px;border:1px solid #ddd;border-radius:4px;">
                            <input type="checkbox" id="fc-locked" ${state.locked ? 'checked' : ''}> <div><b>Bloccata</b><br><span style="font-size:12px;color:#666;">La cella sarà protetta quando il foglio è protetto</span></div>
                        </label>
                    </div>
                    <div style="padding:12px;background:#fff3cd;border-radius:4px;font-size:12px;color:#856404;">
                        ⚠ La protezione delle celle ha effetto solo quando il foglio è protetto (Revisione > Proteggi foglio).
                    </div>`;
                content.querySelector('#fc-locked').onchange = (e) => state.locked = e.target.checked;
            }
        };

        dialog.querySelectorAll('.fc-tab').forEach(tab => {
            tab.onclick = () => renderTab(parseInt(tab.dataset.idx));
        });
        renderTab(0);

        // OK — applica formattazione
        dialog.querySelector('#fc-ok').onclick = () => {
            const cells = self.getSelectedCells();
            if (s.isProtected) {
                const allEditable = cells.every(ref => s.isCellEditable(ref));
                if (!allEditable) {
                    s.updateStatus('Operazione annullata: alcune celle sono protette.');
                    return;
                }
            }
            cells.forEach(ref => {
                if (!s.data[ref]) {
                    s.data[ref] = self.createCellData();
                }
                const fmt = s.data[ref].format;

                // Applica TUTTE le proprietà direttamente (un solo saveState alla fine)
                fmt.bold = state.bold;
                fmt.italic = state.italic;
                fmt.underline = state.underline;
                fmt.fontFamily = state.fontFamily;
                fmt.fontSize = state.fontSize;
                fmt.fontColor = state.fontColor;
                fmt.fillColor = state.fillColor;
                fmt.horizontalAlign = state.hAlign;
                fmt.verticalAlign = state.vAlign;
                fmt.numberFormat = state.numberFormat;
                fmt.decimals = state.decimals;
                fmt.locked = state.locked;
                fmt.wrapText = state.wrapText;

                // Bordi — salvati in data.format.borders, NON direttamente sul DOM
                if (state.borderStyle !== 'none') {
                    if (!fmt.borders) {
                        fmt.borders = {
                            top: { style: 'none', color: '#000000' },
                            right: { style: 'none', color: '#000000' },
                            bottom: { style: 'none', color: '#000000' },
                            left: { style: 'none', color: '#000000' }
                        };
                    }
                    const borderCfg = { style: 'thin', color: '#000000' };
                    if (state.borderStyle === 'all' || state.borderStyle === 'outline') {
                        fmt.borders.top = borderCfg;
                        fmt.borders.bottom = borderCfg;
                        fmt.borders.left = borderCfg;
                        fmt.borders.right = borderCfg;
                    } else if (state.borderStyle === 'bottom') fmt.borders.bottom = borderCfg;
                    else if (state.borderStyle === 'top') fmt.borders.top = borderCfg;
                    else if (state.borderStyle === 'left') fmt.borders.left = borderCfg;
                    else if (state.borderStyle === 'right') fmt.borders.right = borderCfg;
                }

                s.updateCellDisplay(ref);
            });
            s.setModified(true);
            s.saveState();
            s.updateStatus('Formato celle applicato');
            overlay.remove();
        };
    }

    formatPreview(value, format, decimals) {
        if (!value) return '(vuoto)';
        const num = parseFloat(value);
        if (format === 'Generale') return value;
        if (format === 'Numero' && !isNaN(num)) return num.toFixed(decimals);
        if (format === 'Valuta' && !isNaN(num)) return '€ ' + num.toFixed(decimals);
        if (format === 'Contabile' && !isNaN(num)) return (num >= 0 ? '€ ' : '-€ ') + Math.abs(num).toFixed(decimals);
        if (format === 'Percentuale' && !isNaN(num)) return (num * 100).toFixed(decimals) + '%';
        if (format === 'Scientifico' && !isNaN(num)) return num.toExponential(decimals);
        if (format === 'Data breve') return new Date().toLocaleDateString('it-IT');
        if (format === 'Data lunga') return new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        if (format === 'Ora') return new Date().toLocaleTimeString('it-IT');
        if (format === 'Frazione' && !isNaN(num)) { const whole = Math.floor(num); const frac = num - whole; return frac ? whole + ' ' + Math.round(frac * 8) + '/8' : '' + whole; }
        return value;
    }

    // Crea un menu a tendina ancorato a un pulsante (titolo) del ribbon.
    _ribbonDropdown(anchorSelector, items) {
        document.querySelectorAll('.rf-dropdown').forEach(m => m.remove());
        const btn = document.querySelector(anchorSelector);
        const menu = document.createElement('div');
        menu.className = 'rf-dropdown';
        menu.style.cssText = 'position:fixed;background:#fff;border:1px solid #c7c7c7;border-radius:4px;box-shadow:0 4px 16px rgba(0,0,0,0.18);z-index:10001;min-width:220px;padding:4px 0;font-size:13px;';
        items.forEach(it => {
            if (it.separator) {
                const hr = document.createElement('div');
                hr.style.cssText = 'height:1px;background:#eee;margin:4px 0;';
                menu.appendChild(hr);
                return;
            }
            const row = document.createElement('div');
            row.style.cssText = 'padding:7px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;white-space:nowrap;';
            row.innerHTML = `<span style="width:18px;text-align:center;color:#217346;">${it.icon || ''}</span><span>${it.label}</span>${it.shortcut ? `<span style="margin-left:auto;color:#999;font-size:11px;">${it.shortcut}</span>` : ''}`;
            row.onmouseenter = () => row.style.background = '#f3f9f5';
            row.onmouseleave = () => row.style.background = '#fff';
            row.onclick = () => { menu.remove(); try { it.fn(); } catch (e) {} };
            menu.appendChild(row);
        });
        document.body.appendChild(menu);
        if (btn) {
            const r = btn.getBoundingClientRect();
            menu.style.top = r.bottom + 'px';
            menu.style.left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 8) + 'px';
        } else {
            menu.style.top = '120px'; menu.style.left = '120px';
        }
        setTimeout(() => {
            const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', close); } };
            document.addEventListener('mousedown', close);
        }, 0);
        return menu;
    }

    // Riempimento in una direzione: copia il valore/formato della cella attiva
    fillDirection(dir) {
        const s = this.spreadsheet;
        const range = s.selectedRange;
        if (!range) return;
        const a = s.getCellCoordinates(range.start), b = s.getCellCoordinates(range.end);
        const r1 = Math.min(a.row, b.row), r2 = Math.max(a.row, b.row);
        const c1 = Math.min(a.col, b.col), c2 = Math.max(a.col, b.col);
        s.saveState();
        const copyFrom = (sr, sc, dr, dc) => {
            const src = s.numberToColumn(sc) + (sr + 1), dst = s.numberToColumn(dc) + (dr + 1);
            s.setCellValue(dst, s.getCellValue(src));
            if (s.data[src] && s.data[src].format) {
                s.data[dst] = s.data[dst] || {};
                s.data[dst].format = { ...s.data[src].format };
                s.updateCellDisplay(dst);
            }
        };
        if (dir === 'down') for (let c = c1; c <= c2; c++) for (let r = r1 + 1; r <= r2; r++) copyFrom(r1, c, r, c);
        else if (dir === 'up') for (let c = c1; c <= c2; c++) for (let r = r2 - 1; r >= r1; r--) copyFrom(r2, c, r, c);
        else if (dir === 'right') for (let r = r1; r <= r2; r++) for (let c = c1 + 1; c <= c2; c++) copyFrom(r, c1, r, c);
        else if (dir === 'left') for (let r = r1; r <= r2; r++) for (let c = c2 - 1; c >= c1; c--) copyFrom(r, c2, r, c);
        s.setModified(true); s.saveState();
        s.updateStatus('Riempimento completato');
    }

    // Riempimento serie: incrementa numeri / continua sequenze verso il basso
    fillSeries() {
        const s = this.spreadsheet;
        const range = s.selectedRange;
        if (!range) return;
        const a = s.getCellCoordinates(range.start), b = s.getCellCoordinates(range.end);
        const r1 = Math.min(a.row, b.row), r2 = Math.max(a.row, b.row);
        const c1 = Math.min(a.col, b.col), c2 = Math.max(a.col, b.col);
        if (r2 <= r1) { this.spreadsheet.updateStatus('Seleziona almeno due celle in colonna per la serie'); return; }
        s.saveState();
        for (let c = c1; c <= c2; c++) {
            const first = parseFloat(s.getCellValue(s.numberToColumn(c) + (r1 + 1)));
            const second = parseFloat(s.getCellValue(s.numberToColumn(c) + (r1 + 2)));
            const step = (!isNaN(first) && !isNaN(second)) ? (second - first) : 1;
            const base = !isNaN(first) ? first : 0;
            for (let r = r1; r <= r2; r++) {
                s.setCellValue(s.numberToColumn(c) + (r + 1), String(base + step * (r - r1)));
            }
        }
        s.setModified(true); s.saveState();
        s.updateStatus('Serie riempita');
    }

    showFillMenu() {
        this._ribbonDropdown('#home-tab [title*="Riempimento"]', [
            { label: 'Giù', icon: '↓', shortcut: 'Ctrl+J', fn: () => this.fillDirection('down') },
            { label: 'Destra', icon: '→', shortcut: 'Ctrl+D', fn: () => this.fillDirection('right') },
            { label: 'Su', icon: '↑', fn: () => this.fillDirection('up') },
            { label: 'Sinistra', icon: '←', fn: () => this.fillDirection('left') },
            { separator: true },
            { label: 'Serie...', icon: '∷', fn: () => this.fillSeries() }
        ]);
    }

    showSortFilterMenu() {
        const adv = window.excelAdvanced;
        this._ribbonDropdown('#home-tab [title*="Ordina e filtra"]', [
            { label: 'Ordina dalla A alla Z', icon: '↓', fn: () => adv ? adv.sortData('asc') : null },
            { label: 'Ordina dalla Z alla A', icon: '↑', fn: () => adv ? adv.sortData('desc') : null },
            { label: 'Ordinamento personalizzato...', icon: '⇅', fn: () => adv ? adv.showCustomSortDialog() : null },
            { separator: true },
            { label: 'Filtro', icon: '▼', fn: () => adv ? adv.toggleFilter() : null },
            { label: 'Cancella filtri', icon: '✕', fn: () => { document.querySelectorAll('.filter-icon').forEach(i => i.remove()); if (adv && adv._clearAdvFilter) adv._clearAdvFilter(); this.spreadsheet.updateStatus('Filtri rimossi'); } }
        ]);
    }

    showFindDialog() {
        const self = this;
        const overlay = document.createElement('div');
        overlay.id = 'find-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.3);min-width:380px;';
        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <strong>Trova e Sostituisci</strong>
                <button style="border:none;background:none;font-size:18px;cursor:pointer;" onclick="this.closest('#find-modal').remove()">✕</button>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;font-size:12px;font-weight:600;">Cerca:</label>
                <input type="text" id="find-input" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;font-size:12px;font-weight:600;">Sostituisci con:</label>
                <input type="text" id="replace-input" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
            </div>
            <div style="display:flex;gap:8px;">
                <button id="find-btn" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Trova successivo</button>
                <button id="replace-btn" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Sostituisci tutto</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        dialog.querySelector('#find-input').focus();

        dialog.querySelector('#find-btn').onclick = () => {
            const q = dialog.querySelector('#find-input').value;
            if (q) self.findAndSelect(q);
        };
        dialog.querySelector('#replace-btn').onclick = () => {
            const q = dialog.querySelector('#find-input').value;
            const r = dialog.querySelector('#replace-input').value;
            if (!q) return;
            let count = 0;
            for (const ref in self.spreadsheet.data) {
                const val = String(self.spreadsheet.data[ref].value || '');
                if (val.toLowerCase().includes(q.toLowerCase())) {
                    self.spreadsheet.data[ref].value = val.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), r);
                    if (self.spreadsheet.data[ref].formula) self.spreadsheet.data[ref].formula = '';
                    self.spreadsheet.data[ref].computedValue = self.spreadsheet.data[ref].value;
                    self.spreadsheet.updateCellDisplay(ref);
                    count++;
                }
            }
            self.spreadsheet.setModified(true);
            self.spreadsheet.saveState();
            self.spreadsheet.updateStatus(count + ' sostituzioni effettuate');
        };
    }

    findAndSelect(searchTerm) {
        for (const cellRef in this.spreadsheet.data) {
            const cellData = this.spreadsheet.data[cellRef];
            const value = cellData.computedValue || cellData.value;
            if (value.toString().toLowerCase().includes(searchTerm.toLowerCase())) {
                this.spreadsheet.selectCell(cellRef);
                this.spreadsheet.updateStatus(`Trovato: "${searchTerm}" in ${cellRef}`);
                return;
            }
        }
        this.spreadsheet.updateStatus(`"${searchTerm}" non trovato`);
    }

    showConditionalFormatting() {
        if (window.excelAdvanced && typeof window.excelAdvanced.showConditionalFormattingMenu === 'function') {
            window.excelAdvanced.showConditionalFormattingMenu();
        } else {
            this.spreadsheet.updateStatus('Formattazione condizionale non disponibile');
        }
    }

    formatAsTable() {
        if (window.excelAdvanced) {
            window.excelAdvanced.formatAsTable();
        } else {
            this.spreadsheet.updateStatus('Formatta come tabella non disponibile');
        }
    }

    showCellStyles() {
        const self = this;
        const styles = [
            { name: 'Positivo', bg: '#c6efce', fg: '#006100' },
            { name: 'Negativo', bg: '#ffc7ce', fg: '#9c0006' },
            { name: 'Neutro', bg: '#ffeb9c', fg: '#9c5700' },
            { name: 'Intestazione', bg: '#4472c4', fg: '#ffffff', bold: true },
            { name: 'Totale', bg: '#d9e2f3', fg: '#000000', bold: true },
            { name: 'Normale', bg: '', fg: '#000000', bold: false }
        ];
        const overlay = document.createElement('div');
        overlay.id = 'cellstyles-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:10000;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <strong>Stili Cella</strong>
                <button style="border:none;background:none;font-size:18px;cursor:pointer;" onclick="this.closest('#cellstyles-modal').remove()">✕</button>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${styles.map((s, i) => `<button class="cs-btn" data-idx="${i}" style="padding:10px 16px;background:${s.bg || '#fff'};color:${s.fg};border:1px solid #ccc;border-radius:4px;cursor:pointer;${s.bold ? 'font-weight:bold;' : ''}">${s.name}</button>`).join('')}
            </div>`;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        dialog.querySelectorAll('.cs-btn').forEach(btn => {
            btn.onclick = () => {
                const st = styles[parseInt(btn.dataset.idx)];
                self.applyFormatToSelection('fillColor', st.bg);
                self.applyFormatToSelection('fontColor', st.fg);
                if (st.bold !== undefined) self.applyFormatToSelection('bold', st.bold);
                self.spreadsheet.setModified(true);
                self.spreadsheet.saveState();
                overlay.remove();
            };
        });
    }
}

// Estende la classe Spreadsheet esistente con nuove funzionalità
function enhanceSpreadsheet(spreadsheet) {
    // Aggiungi supporto per formati numerici avanzati
    const originalUpdateCellDisplay = spreadsheet.updateCellDisplay;
    spreadsheet.updateCellDisplay = function(cellRef) {
        const cellElement = document.querySelector(`[data-cell="${cellRef}"]`);
        if (!cellElement) return;
        
        const content = cellElement.querySelector('.cell-content');
        const cellData = this.data[cellRef];
        
        if (cellData) {
            let displayValue = cellData.computedValue || cellData.value || '';
            
            // Applica formattazione numerica
            if (this.isNumber(displayValue) && cellData.format.numberFormat !== 'testo') {
                displayValue = this.formatNumber(displayValue, cellData.format);
            }
            
            content.textContent = displayValue;
            content.className = 'cell-content';
            
            // Stili esistenti
            if (this.isNumber(displayValue) && cellData.format.numberFormat !== 'testo') {
                content.classList.add('cell-number');
            } else {
                content.classList.add('cell-text');
            }
            
            if (cellData.format.bold) content.classList.add('cell-bold');
            if (cellData.format.italic) content.classList.add('cell-italic');
            if (cellData.format.underline) content.classList.add('cell-underline');
            if (cellData.formula) content.classList.add('cell-formula');
            
            // Nuovi stili
            if (cellData.format.fontFamily) {
                content.style.fontFamily = cellData.format.fontFamily;
            }
            if (cellData.format.fontSize) {
                content.style.fontSize = cellData.format.fontSize + 'pt';
            }
            if (cellData.format.fontColor) {
                content.style.color = cellData.format.fontColor;
            }
            if (cellData.format.fillColor) {
                cellElement.style.backgroundColor = cellData.format.fillColor;
            } else {
                cellElement.style.backgroundColor = '';
            }
            if (cellData.format.horizontalAlign) {
                content.style.justifyContent = this.getJustifyContent(cellData.format.horizontalAlign);
            }
            if (cellData.format.wrapText) {
                content.style.whiteSpace = 'normal';
                content.style.wordWrap = 'break-word';
                content.style.alignItems = 'flex-start';
                content.style.paddingTop = '2px';
            }

            // APPLICA BORDI
            this.applyBorderStyles(cellElement, cellData.format.borders);
            
        } else {
            content.textContent = '';
            content.className = 'cell-content cell-text';
            content.style = '';
            cellElement.style.backgroundColor = '';
            // Rimuovi tutti i bordi
            cellElement.style.borderTop = '';
            cellElement.style.borderRight = '';
            cellElement.style.borderBottom = '';
            cellElement.style.borderLeft = '';
        }
    };

    // Helper per allineamento
    spreadsheet.getJustifyContent = function(align) {
        switch(align) {
            case 'left': return 'flex-start';
            case 'center': return 'center';
            case 'right': return 'flex-end';
            default: return 'flex-start';
        }
    };

    // Formattazione numerica avanzata
    spreadsheet.formatNumber = function(value, format) {
        const num = parseFloat(value);
        if (isNaN(num)) return value;
        const dec = format.decimals;
        const serialToDate = (n) => new Date((n - 25569) * 86400000);

        switch(format.numberFormat) {
            case 'numero':
                return num.toLocaleString('it-IT', {
                    minimumFractionDigits: dec || 0,
                    maximumFractionDigits: dec || 0
                });
            case 'separatore':
            case 'thousands':
                return num.toLocaleString('it-IT', {
                    minimumFractionDigits: dec || 2,
                    maximumFractionDigits: dec || 2
                });
            case 'valuta':
            case 'currency':
                return num.toLocaleString('it-IT', {
                    minimumFractionDigits: dec || 2, maximumFractionDigits: dec || 2
                }) + ' €';
            case 'contabile':
                return (num < 0 ? '-' : '') + Math.abs(num).toLocaleString('it-IT', {
                    minimumFractionDigits: 2, maximumFractionDigits: 2
                }) + ' €';
            case 'percentuale':
            case 'percentage':
                return (num * 100).toLocaleString('it-IT', {
                    minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0
                }) + '%';
            case 'scientifico':
                return num.toExponential(dec || 2);
            case 'frazione':
                return typeof spreadsheet._toFraction === 'function' ? spreadsheet._toFraction(num) : String(num);
            case 'data breve': {
                const d = serialToDate(num); return isNaN(d.getTime()) ? value : d.toLocaleDateString('it-IT');
            }
            case 'data lunga': {
                const d = serialToDate(num); return isNaN(d.getTime()) ? value : d.toLocaleDateString('it-IT', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
            }
            case 'ora': {
                const d = serialToDate(num); return isNaN(d.getTime()) ? value : d.toLocaleTimeString('it-IT');
            }
            default:
                return value;
        }
    };

    // Aggiungi questo metodo helper per applicare i bordi
    spreadsheet.applyBorderStyles = function(cellElement, borders) {
        // Se borders non esiste, usa i bordi di default
        if (!borders) {
            cellElement.style.borderTop = '1px solid #d6d6d6';
            cellElement.style.borderRight = '1px solid #d6d6d6';
            cellElement.style.borderBottom = '1px solid #d6d6d6';
            cellElement.style.borderLeft = '1px solid #d6d6d6';
            return;
        }

        // Funzione helper per convertire lo stile in CSS
        const getBorderStyle = (border) => {
            if (!border || border.style === 'none') return '';
            
            const widthMap = {
                'thin': '1px',
                'medium': '2px',
                'thick': '3px',
                'double': '3px',
                'dashed': '1px',
                'dotted': '1px'
            };
            
            const styleMap = {
                'thin': 'solid',
                'medium': 'solid',
                'thick': 'solid',
                'double': 'double',
                'dashed': 'dashed',
                'dotted': 'dotted'
            };
            
            const width = widthMap[border.style] || '1px';
            const style = styleMap[border.style] || 'solid';
            const color = border.color || '#000000';
            
            return `${width} ${style} ${color}`;
        };

        // Applica i bordi individuali
        cellElement.style.borderTop = getBorderStyle(borders.top);
        cellElement.style.borderRight = getBorderStyle(borders.right);
        cellElement.style.borderBottom = getBorderStyle(borders.bottom);
        cellElement.style.borderLeft = getBorderStyle(borders.left);
    };

    return new ExcelFunctions(spreadsheet);
}
