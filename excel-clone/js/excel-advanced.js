// excel-advanced.js
class ExcelAdvanced {
    constructor(spreadsheet, excelFunctions) {
        this.spreadsheet = spreadsheet;
        this.functions = excelFunctions;
        this.conditionalFormats = [];
        this.tables = [];
        this.charts = [];
        this.init();
    }

    init() {
        this.bindDataToolsEvents();
        this.bindConditionalFormattingEvents();
        this.bindTableEvents();
        this.bindChartEvents();
        this.bindReviewEvents();
        this.bindViewEvents();
    }

    // ===== STRUMENTI DATI =====
    bindDataToolsEvents() {
        const dataTab = document.getElementById('data-tab');
        if (!dataTab) return;
        const byTitle = (title, handler) => {
            dataTab.querySelectorAll(`[title="${title}"]`).forEach(btn => btn.addEventListener('click', handler));
        };

        // Ordinamento
        byTitle('Ordina dalla A alla Z', () => this.sortData('asc'));
        byTitle('Ordina dalla Z alla A', () => this.sortData('desc'));
        byTitle('Ordina personalizzato', () => this.showCustomSortDialog());

        // Filtri
        byTitle('Filtro', () => this.toggleFilter());
        byTitle('Riapplica', () => this.toggleFilter());
        byTitle('Avanzato', () => this.showAdvancedFilter());
        byTitle('Cancella', () => {
            // Ripristina il filtro avanzato (righe compresse) e rimuovi le icone di filtro
            this._clearAdvFilter();
            document.querySelectorAll('.cell').forEach(c => { c.style.display = ''; });
            document.querySelectorAll('.filter-icon').forEach(i => i.remove());
            this.spreadsheet.updateStatus('Filtri rimossi');
        });

        // Dati esterni
        byTitle('Da file', () => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = '.csv,.txt,.tsv';
            input.onchange = (e) => this.importCSV(e.target.files[0]);
            input.click();
        });
        byTitle('Da database', () => this.showImportDialog('database'));
        byTitle('Da Web', () => this.showImportDialog('web'));
        byTitle('Da query', () => this.showImportDialog('query'));
        byTitle('Aggiorna tutto', () => { this.spreadsheet.recalculate(); this.spreadsheet.updateStatus('Dati aggiornati'); });
        byTitle('Proprietà', () => this.showConnectionPropertiesDialog());
        byTitle('Modifica collegamenti', () => this.showEditLinksDialog());

        // Analisi
        byTitle('Analisi dati', () => this.showDataAnalysis());
        byTitle('Simulazione', () => this.showWhatIfDialog());
        byTitle('Foglio previsione', () => this.showForecastDialog());
        byTitle('Previsione linea temporale', () => this.showForecastDialog());

        // Raggruppa/separa/subtotali
        byTitle('Raggruppa', () => this.groupData());
        byTitle('Separa', () => this.ungroupData());
        byTitle('Subtotali', () => this.showSubtotalDialog());
    }

    importCSV(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const lines = e.target.result.split(/\r?\n/).filter(l => l.length > 0);
            // Importa a partire dalla cella selezionata (come Excel), non sempre da A1
            const start = this.spreadsheet.getCellCoordinates(this.spreadsheet.selectedCell || 'A1') || { row: 0, col: 0 };
            // Delimitatore: TAB per .tsv, altrimenti rileva tra ; e ,
            let delimiter = /\.tsv$/i.test(file.name) ? '\t' : (lines[0] && lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',');
            lines.forEach((line, row) => {
                const cols = line.split(delimiter);
                cols.forEach((val, col) => {
                    const ref = this.spreadsheet.numberToColumn(start.col + col) + (start.row + row + 1);
                    this.spreadsheet.setCellValue(ref, val.trim().replace(/^["']|["']$/g, ''));
                });
            });
            this.spreadsheet.setModified(true);
            if (this.spreadsheet.saveState) this.spreadsheet.saveState();
            this.spreadsheet.updateStatus(`CSV importato (${lines.length} righe) da ${file.name}`);
        };
        reader.readAsText(file);
    }

    showDataAnalysis() {
        const sel = this.functions.getSelectedCells();
        const numbers = sel.map(r => parseFloat(this.spreadsheet.getCellValue(r))).filter(n => !isNaN(n));
        if (numbers.length === 0) {
            this.spreadsheet.updateStatus('Seleziona celle con numeri per l\'analisi');
            return;
        }
        const sum = numbers.reduce((a,b) => a+b, 0);
        const avg = sum / numbers.length;
        const sorted = [...numbers].sort((a,b) => a-b);
        const median = sorted.length % 2 === 0 ? (sorted[sorted.length/2-1] + sorted[sorted.length/2]) / 2 : sorted[Math.floor(sorted.length/2)];
        const variance = numbers.reduce((s, n) => s + Math.pow(n - avg, 2), 0) / numbers.length;
        const stdDev = Math.sqrt(variance);

        const overlay = document.createElement('div');
        overlay.id = 'analysis-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Analisi dati</h3>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#analysis-modal').remove()">✕</button>
            </div>
            <table style="width:100%;font-size:13px;border-collapse:collapse;">
                <tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">Conteggio</td><td style="padding:4px 8px;border-bottom:1px solid #eee;font-weight:bold;text-align:right;">${numbers.length}</td></tr>
                <tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">Somma</td><td style="padding:4px 8px;border-bottom:1px solid #eee;font-weight:bold;text-align:right;">${sum.toFixed(2)}</td></tr>
                <tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">Media</td><td style="padding:4px 8px;border-bottom:1px solid #eee;font-weight:bold;text-align:right;">${avg.toFixed(2)}</td></tr>
                <tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">Mediana</td><td style="padding:4px 8px;border-bottom:1px solid #eee;font-weight:bold;text-align:right;">${median.toFixed(2)}</td></tr>
                <tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">Min</td><td style="padding:4px 8px;border-bottom:1px solid #eee;font-weight:bold;text-align:right;">${sorted[0]}</td></tr>
                <tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">Max</td><td style="padding:4px 8px;border-bottom:1px solid #eee;font-weight:bold;text-align:right;">${sorted[sorted.length-1]}</td></tr>
                <tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">Deviazione std.</td><td style="padding:4px 8px;border-bottom:1px solid #eee;font-weight:bold;text-align:right;">${stdDev.toFixed(4)}</td></tr>
                <tr><td style="padding:4px 8px;">Varianza</td><td style="padding:4px 8px;font-weight:bold;text-align:right;">${variance.toFixed(4)}</td></tr>
            </table>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    sortData(direction) {
        const cells = this.functions.getSelectedCells();
        if (cells.length < 2) {
            this.spreadsheet.updateStatus('Seleziona un range di celle da ordinare');
            return;
        }

        const data = this.getRangeData(cells);
        const sortedData = this.performSort(data, direction);
        this.applySortedData(cells, sortedData);
        
        this.spreadsheet.setModified(true);
        this.spreadsheet.updateStatus(`Dati ordinati ${direction === 'asc' ? 'A-Z' : 'Z-A'}`);
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
                data: this.spreadsheet.data[cellRef] ? { ...this.spreadsheet.data[cellRef] } : { value: '', formula: '', format: {}, computedValue: '' }
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

performSort(data, direction) {
    // Per semplicità, ordiniamo solo per la prima colonna
    return data.sort((a, b) => {
        const valA = a[0]?.value || '';
        const valB = b[0]?.value || '';
        
        // Controlla se sono numeri
        const isNumA = this.spreadsheet.isNumber(valA);
        const isNumB = this.spreadsheet.isNumber(valB);
        
        if (isNumA && isNumB) {
            return direction === 'asc' ? 
                parseFloat(valA) - parseFloat(valB) : 
                parseFloat(valB) - parseFloat(valA);
        } else {
            const strA = String(valA || '');
            const strB = String(valB || '');
            return direction === 'asc' ? 
                strA.localeCompare(strB) : 
                strB.localeCompare(strA);
        }
    });
}

applySortedData(originalCells, sortedData) {
    // Ricostruisce i dati nelle nuove posizioni
    const flatOriginal = this.flattenCellArray(originalCells);
    const flatSorted = this.flattenCellArray(sortedData);
    
    const tempData = {};
    
    flatSorted.forEach((sortedCell, index) => {
        const originalCell = flatOriginal[index];
        if (originalCell && sortedCell) {
            tempData[originalCell.cellRef] = sortedCell.data;
        }
    });

    // Applica i dati riordinati
    Object.keys(tempData).forEach(cellRef => {
        if (tempData[cellRef]) {
            this.spreadsheet.data[cellRef] = tempData[cellRef];
            this.spreadsheet.updateCellDisplay(cellRef);
        }
    });
}

// Aggiungi questo metodo helper
flattenCellArray(cellArray) {
    const flat = [];
    cellArray.forEach(row => {
        if (Array.isArray(row)) {
            row.forEach(cell => {
                if (cell && cell.cellRef) {
                    flat.push(cell);
                }
            });
        }
    });
    return flat;
}

    toggleFilter() {
        const cells = this.functions.getSelectedCells();
        if (cells.length === 0) return;

        // Crea intestazioni di filtro
        const firstCell = cells[0];
        const coords = this.spreadsheet.getCellCoordinates(firstCell);
        
        // Trova tutte le celle nella stessa colonna
        const columnCells = cells.filter(cell => {
            const cellCoords = this.spreadsheet.getCellCoordinates(cell);
            return cellCoords.col === coords.col;
        });

        // Aggiungi icone filtro
        columnCells.forEach(cellRef => {
            const cellElement = document.querySelector(`[data-cell="${cellRef}"]`);
            if (cellElement && !cellElement.querySelector('.filter-icon')) {
                const filterIcon = document.createElement('div');
                filterIcon.className = 'filter-icon';
                filterIcon.innerHTML = '▼';
                filterIcon.style.cssText = `
                    position: absolute;
                    right: 2px;
                    top: 50%;
                    transform: translateY(-50%);
                    font-size: 8px;
                    cursor: pointer;
                    color: #666;
                `;
                cellElement.style.position = 'relative';
                cellElement.appendChild(filterIcon);

                filterIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showFilterMenu(cellRef, columnCells);
                });
            }
        });

        this.spreadsheet.updateStatus('Filtro applicato');
    }

    showFilterMenu(headerCell, columnCells) {
        const uniqueValues = [...new Set(columnCells.map(cell =>
            this.spreadsheet.getCellValue(cell)
        ))].filter(v => v !== '');

        const overlay = document.createElement('div');
        overlay.id = 'filter-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:20px;min-width:300px;max-width:400px;max-height:80vh;overflow:auto;box-shadow:0 8px 32px rgba(0,0,0,0.3);';

        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h3 style="margin:0;font-size:16px;">Filtra colonna</h3>
                <button id="filter-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:12px;">
                <input type="text" id="filter-search" placeholder="Cerca..." style="width:100%;padding:6px 10px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
            </div>
            <div style="max-height:200px;overflow-y:auto;border:1px solid #eee;border-radius:4px;margin-bottom:12px;">
                <label style="display:flex;align-items:center;padding:6px 10px;border-bottom:1px solid #f0f0f0;cursor:pointer;">
                    <input type="checkbox" id="filter-all" checked style="margin-right:8px;"> <strong>(Seleziona tutto)</strong>
                </label>
                ${uniqueValues.map((v, i) => `<label style="display:flex;align-items:center;padding:6px 10px;border-bottom:1px solid #f0f0f0;cursor:pointer;">
                    <input type="checkbox" class="filter-val-cb" data-value="${v.replace(/"/g, '&quot;')}" checked style="margin-right:8px;"> ${v || '(vuoto)'}
                </label>`).join('')}
            </div>
            <div style="text-align:right;">
                <button id="filter-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="filter-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('#filter-close').onclick = close;
        overlay.querySelector('#filter-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        const allCb = overlay.querySelector('#filter-all');
        const valCbs = overlay.querySelectorAll('.filter-val-cb');
        allCb.onchange = () => valCbs.forEach(cb => cb.checked = allCb.checked);

        overlay.querySelector('#filter-search').addEventListener('input', (e) => {
            const search = e.target.value.toLowerCase();
            valCbs.forEach(cb => {
                cb.closest('label').style.display = cb.dataset.value.toLowerCase().includes(search) ? '' : 'none';
            });
        });

        overlay.querySelector('#filter-ok').onclick = () => {
            const selected = [...valCbs].filter(cb => cb.checked).map(cb => cb.dataset.value);
            if (selected.length < uniqueValues.length) {
                columnCells.forEach(cellRef => {
                    const val = this.spreadsheet.getCellValue(cellRef);
                    const coords = this.spreadsheet.getCellCoordinates(cellRef);
                    if (!selected.includes(val)) {
                        const rowCells = document.querySelectorAll(`[data-cell$="${coords.row}"]`);
                        rowCells.forEach(c => {
                            const r = parseInt(c.dataset.cell.replace(/[A-Z]+/, ''));
                            if (r === coords.row) c.style.display = 'none';
                        });
                    }
                });
                this.spreadsheet.updateStatus('Filtro applicato');
            }
            close();
        };
    }

    applyFilter(columnCells, filterValue) {
        // Nasconde le righe che non corrispondono al filtro
        const rowsToHide = new Set();
        
        columnCells.forEach(cellRef => {
            const cellValue = this.spreadsheet.getCellValue(cellRef);
            const coords = this.spreadsheet.getCellCoordinates(cellRef);
            
            if (!cellValue.includes(filterValue)) {
                rowsToHide.add(coords.row);
            }
        });

        // Nasconde le righe (implementazione semplificata)
        rowsToHide.forEach(row => {
            for (let col = 0; col < this.spreadsheet.cols; col++) {
                const cellRef = `${this.spreadsheet.numberToColumn(col)}${row + 1}`;
                const cellElement = document.querySelector(`[data-cell="${cellRef}"]`);
                if (cellElement) {
                    cellElement.style.display = 'none';
                }
            }
        });

        this.spreadsheet.updateStatus(`Filtrato per: ${filterValue}`);
    }

    removeDuplicates() {
        const cells = this.functions.getSelectedCells();
        const seen = new Set();
        const duplicates = [];

        cells.forEach(cellRef => {
            const value = this.spreadsheet.getCellValue(cellRef);
            if (seen.has(value)) {
                duplicates.push(cellRef);
            } else {
                seen.add(value);
            }
        });

        duplicates.forEach(cellRef => {
            this.spreadsheet.clearCell(cellRef);
        });

        this.spreadsheet.setModified(true);
        this.spreadsheet.updateStatus(`Rimossi ${duplicates.length} duplicati`);
    }

    // ===== FORMATTAZIONE CONDIZIONALE =====
    bindConditionalFormattingEvents() {
        document.querySelectorAll('[title*="Stili condizionali"]').forEach(btn => {
            btn.addEventListener('click', () => this.showConditionalFormattingMenu());
        });

        // Inizializza stili predefiniti
        this.initDefaultConditionalFormats();
    }

    initDefaultConditionalFormats() {
        this.conditionalFormats = [
            {
                name: 'Evidenzia celle maggiori di...',
                type: 'greaterThan',
                apply: (cellValue, threshold) => parseFloat(cellValue) > parseFloat(threshold),
                style: { fillColor: '#FFC7CE', fontColor: '#9C0006' }
            },
            {
                name: 'Evidenzia celle minori di...',
                type: 'lessThan',
                apply: (cellValue, threshold) => parseFloat(cellValue) < parseFloat(threshold),
                style: { fillColor: '#FFEB9C', fontColor: '#9C6500' }
            },
            {
                name: 'Evidenzia celle uguali a...',
                type: 'equalTo',
                apply: (cellValue, target) => cellValue == target,
                style: { fillColor: '#C6EFCE', fontColor: '#006100' }
            },
            {
                name: 'Barre dati',
                type: 'dataBars',
                apply: (cellValue, min, max) => true,
                style: { dataBar: true }
            },
            {
                name: 'Scale di colore',
                type: 'colorScale',
                apply: (cellValue, min, max) => true,
                style: { colorScale: true }
            }
        ];
    }

    showConditionalFormattingMenu() {
        const menu = document.createElement('div');
        menu.className = 'menu-dropdown';
        menu.style.cssText = `
            position: fixed;
            background: white;
            border: 1px solid #d6d6d6;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            z-index: 10000;
            min-width: 200px;
        `;

        this.conditionalFormats.forEach(format => {
            const option = document.createElement('div');
            option.className = 'menu-option';
            option.textContent = format.name;
            option.addEventListener('click', () => {
                this.applyConditionalFormat(format);
                document.body.removeChild(menu);
            });
            menu.appendChild(option);
        });

        // Posiziona il menu vicino al pulsante
        const button = document.querySelector('[title*="Stili condizionali"]');
        const rect = button.getBoundingClientRect();
        menu.style.top = `${rect.bottom}px`;
        menu.style.left = `${rect.left}px`;

        document.body.appendChild(menu);

        // Chiudi il menu quando si clicca altrove
        setTimeout(() => {
            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    document.body.removeChild(menu);
                    document.removeEventListener('click', closeMenu);
                }
            };
            document.addEventListener('click', closeMenu);
        }, 0);
    }

    applyConditionalFormat(format) {
        const cells = this.functions.getSelectedCells();
        
        switch (format.type) {
            case 'greaterThan':
            case 'lessThan':
            case 'equalTo':
                this.applyThresholdFormat(cells, format);
                break;
            case 'dataBars':
                this.applyDataBars(cells);
                break;
            case 'colorScale':
                this.applyColorScale(cells);
                break;
        }
    }

    applyThresholdFormat(cells, format) {
        const overlay = document.createElement('div');
        overlay.id = 'threshold-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Formattazione condizionale: ${format.name}</h3>
                <button id="thresh-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:16px;">
                <label style="display:block;margin-bottom:6px;font-size:13px;">Inserisci valore soglia:</label>
                <input type="number" id="thresh-value" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;" autofocus>
            </div>
            <div style="text-align:right;">
                <button id="thresh-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="thresh-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Applica</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('#thresh-close').onclick = close;
        overlay.querySelector('#thresh-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        const input = overlay.querySelector('#thresh-value');
        input.focus();

        const apply = () => {
            const threshold = input.value;
            if (threshold === '') return;
            cells.forEach(cellRef => {
                const cellValue = this.spreadsheet.getCellValue(cellRef);
                if (format.apply(cellValue, threshold)) {
                    this.applyCellStyle(cellRef, format.style);
                }
            });
            this.spreadsheet.setModified(true);
            this.spreadsheet.updateStatus(`Formattazione condizionale applicata: ${format.name}`);
            close();
        };

        overlay.querySelector('#thresh-ok').onclick = apply;
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
    }

    applyDataBars(cells) {
        const values = cells.map(cellRef => parseFloat(this.spreadsheet.getCellValue(cellRef)) || 0);
        const max = Math.max(...values);
        const min = Math.min(...values);
        const range = max - min;

        cells.forEach((cellRef, index) => {
            const value = values[index];
            const percentage = range === 0 ? 0 : ((value - min) / range) * 100;
            
            const cellElement = document.querySelector(`[data-cell="${cellRef}"]`);
            if (cellElement) {
                // Rimuovi barre esistenti
                const existingBar = cellElement.querySelector('.data-bar');
                if (existingBar) existingBar.remove();

                const dataBar = document.createElement('div');
                dataBar.className = 'data-bar';
                dataBar.style.cssText = `
                    position: absolute;
                    left: 0;
                    top: 0;
                    height: 100%;
                    background: linear-gradient(90deg, #63BE7B, #F8696B);
                    width: ${percentage}%;
                    opacity: 0.3;
                    z-index: -1;
                `;
                cellElement.appendChild(dataBar);
            }
        });

        this.spreadsheet.updateStatus('Barre dati applicate');
    }

    applyColorScale(cells) {
        const values = cells.map(cellRef => parseFloat(this.spreadsheet.getCellValue(cellRef)) || 0);
        const max = Math.max(...values);
        const min = Math.min(...values);
        const range = max - min;

        cells.forEach((cellRef, index) => {
            const value = values[index];
            let ratio = range === 0 ? 0 : (value - min) / range;
            
            // Calcola colore da rosso (basso) a verde (alto)
            const red = Math.round(255 * (1 - ratio));
            const green = Math.round(255 * ratio);
            const color = `rgb(${red}, ${green}, 100)`;
            
            this.applyCellStyle(cellRef, { fillColor: color });
        });

        this.spreadsheet.setModified(true);
        this.spreadsheet.updateStatus('Scala di colori applicata');
    }

    applyCellStyle(cellRef, style) {
        if (!this.spreadsheet.data[cellRef]) {
            this.spreadsheet.data[cellRef] = this.functions.createCellData();
        }
        
        Object.assign(this.spreadsheet.data[cellRef].format, style);
        this.spreadsheet.updateCellDisplay(cellRef);
    }

    // ===== TABELLE =====
    bindTableEvents() {
        // "Formatta come tabella" (solo Home tab)
        document.querySelectorAll('[title*="Formatta come tabella"]').forEach(btn => {
            btn.addEventListener('click', () => this.formatAsTable());
        });

        // "Tabella" nel tab Inserisci (non "Formatta come tabella", non "Tabella pivot")
        document.querySelectorAll('#insert-tab .ribbon-button[title="Tabella"]').forEach(btn => {
            btn.addEventListener('click', () => this.createTable());
        });
    }

    formatAsTable() {
        const cells = this.functions.getSelectedCells();
        if (cells.length < 2) {
            this.spreadsheet.updateStatus('Seleziona un range di celle per formattare come tabella');
            return;
        }

        // Crea stile tabella
        const tableStyle = {
            header: { 
                bold: true, 
                fillColor: '#4472C4', 
                fontColor: 'white',
                horizontalAlign: 'center'
            },
            rows: {
                even: { fillColor: '#D9E1F2' },
                odd: { fillColor: 'white' }
            },
            borders: {
                style: 'thin',
                color: '#8EA9DB'
            }
        };

        // Salva stato prima della formattazione (per undo singolo)
        this.spreadsheet.saveState();

        this.applyTableStyle(cells, tableStyle);

        // Aggiungi filtri automatici
        this.toggleFilter();

        this.spreadsheet.setModified(true);
        this.spreadsheet.saveState();
        this.spreadsheet.updateStatus('Range formattato come tabella');
    }

// excel-advanced.js - Sostituisci il metodo applyTableStyle

applyTableStyle(cells, style) {
    const rows = new Map();
    
    // Raggruppa per righe
    cells.forEach(cellRef => {
        const coords = this.spreadsheet.getCellCoordinates(cellRef);
        if (!rows.has(coords.row)) {
            rows.set(coords.row, []);
        }
        rows.get(coords.row).push(cellRef);
    });

    const rowNumbers = Array.from(rows.keys()).sort((a, b) => a - b);
    
    rowNumbers.forEach((row, index) => {
        const isHeader = index === 0;
        const rowStyle = isHeader ? style.header : 
            (index % 2 === 0 ? style.rows.even : style.rows.odd);
        
        rows.get(row).forEach(cellRef => {
            this.applyCellStyle(cellRef, rowStyle);
        });
    });
}

    createTable() {
        const cells = this.functions.getSelectedCells();
        if (cells.length < 2) {
            this.spreadsheet.updateStatus('Seleziona un range di celle per creare una tabella');
            return;
        }

        // Salva stato prima della creazione (undo boundary)
        this.spreadsheet.saveState();

        // Crea oggetto tabella
        const data = this.getRangeData(cells);
        const table = {
            id: 'table_' + Date.now(),
            range: {
                start: this.spreadsheet.selectedRange.start,
                end: this.spreadsheet.selectedRange.end
            },
            headers: [],
            data: [],
            style: 'TableStyleMedium2'
        };

        if (data && data.length > 0 && data[0]) {
            table.headers = data[0].map(cell => cell?.value || '');
            table.data = data.slice(1).map(row => row.map(cell => cell?.value || ''));
        }

        this.tables.push(table);

        // Applica stile tabella direttamente (evita formatAsTable per non duplicare saveState)
        const tableStyle = {
            header: {
                bold: true,
                fillColor: '#4472C4',
                fontColor: 'white',
                horizontalAlign: 'center'
            },
            rows: {
                even: { fillColor: '#D9E1F2' },
                odd: { fillColor: 'white' }
            },
            borders: {
                style: 'thin',
                color: '#8EA9DB'
            }
        };

        this.applyTableStyle(cells, tableStyle);
        this.toggleFilter();

        this.spreadsheet.setModified(true);
        this.spreadsheet.saveState();
        this.spreadsheet.updateStatus('Tabella creata');
    }

    // ===== TABELLA PIVOT =====
    createPivotTable() {
        const cells = this.functions.getSelectedCells();
        if (cells.length < 4) {
            this.spreadsheet.updateStatus('Seleziona un intervallo di dati per creare la tabella pivot');
            return;
        }

        const data = this.getRangeData(cells);
        if (!data || data.length < 2) {
            this.spreadsheet.updateStatus('Sono necessari almeno due righe di dati (intestazione + valori)');
            return;
        }

        // Salva stato prima della creazione
        this.spreadsheet.saveState();

        // Intestazioni dalla prima riga
        const headers = data[0].map(cell => cell?.value || '');
        // Dati dalle righe successive
        const rows = data.slice(1).map(row => row.map(cell => cell?.value || ''));

        // Trova colonne numeriche (per sommarle nella pivot)
        const numericCols = [];
        if (rows.length > 0) {
            for (let c = 0; c < headers.length; c++) {
                const val = rows[0][c];
                if (val !== '' && !isNaN(parseFloat(val)) && isFinite(val)) {
                    numericCols.push(c);
                }
            }
        }

        // Raggruppa per la prima colonna e somma i valori numerici
        const groups = new Map();
        rows.forEach(row => {
            const key = row[0] || '(vuoto)';
            if (!groups.has(key)) {
                groups.set(key, {});
                numericCols.forEach(c => { groups.get(key)[c] = 0; });
            }
            numericCols.forEach(c => {
                groups.get(key)[c] += parseFloat(row[c]) || 0;
            });
        });

        // Trova cella di destinazione (appena sotto il range selezionato + 2)
        const coords = this.spreadsheet.getCellCoordinates(cells[cells.length - 1]);
        let targetRow = coords.row + 3;
        const targetCol = 0; // colonna A
        const targetStart = String.fromCharCode(65 + targetCol) + targetRow;

        // Intestazione pivot
        const pivotHeaders = ['Valori'];
        for (let c = 1; c < headers.length; c++) {
            if (numericCols.includes(c)) {
                pivotHeaders.push(headers[c]);
            }
        }

        // Scrivi risultato pivot
        const ss = this.spreadsheet;
        const pivotCells = [];

        // Scrivi intestazioni pivot
        pivotHeaders.forEach((h, i) => {
            const ref = String.fromCharCode(65 + targetCol + i) + targetRow;
            ss.setCellValue(ref, h);
            pivotCells.push(ref);
        });

        // Scrivi dati pivot
        let r = 0;
        for (const [key, vals] of groups) {
            r++;
            const rowRef = targetRow + r;
            const ref0 = String.fromCharCode(65 + targetCol) + rowRef;
            ss.setCellValue(ref0, key);
            pivotCells.push(ref0);

            numericCols.forEach((c, ci) => {
                const ref = String.fromCharCode(65 + targetCol + ci + 1) + rowRef;
                ss.setCellValue(ref, String(vals[c]));
                pivotCells.push(ref);
            });
        }

        // Applica stile tabella alla pivot
        const pivotStyle = {
            header: { bold: true, fillColor: '#5B9BD5', fontColor: 'white' },
            rows: { even: { fillColor: '#E8F0FE' }, odd: { fillColor: 'white' } },
            borders: { style: 'thin', color: '#B4C6E7' }
        };

        // Raccogli tutte le celle della pivot
        const allPivotCells = [];
        const pivotRowCount = groups.size + 1; // +1 per header
        for (let ri = 0; ri < pivotRowCount; ri++) {
            for (let ci = 0; ci < pivotHeaders.length; ci++) {
                allPivotCells.push(String.fromCharCode(65 + targetCol + ci) + (targetRow + ri));
            }
        }

        // Applica header style alla prima riga
        const firstRowCells = allPivotCells.slice(0, pivotHeaders.length);
        firstRowCells.forEach(ref => {
            this.applyCellStyle(ref, pivotStyle.header);
        });

        // Applica row style alternato
        for (let ri = 1; ri < pivotRowCount; ri++) {
            const rowCells = allPivotCells.slice(ri * pivotHeaders.length, (ri + 1) * pivotHeaders.length);
            const rowStyle = (ri % 2 === 1) ? pivotStyle.rows.odd : pivotStyle.rows.even;
            rowCells.forEach(ref => {
                this.applyCellStyle(ref, rowStyle);
            });
        }

        // Applica bordi
        allPivotCells.forEach(ref => {
            const cellData = ss.data[ref];
            if (cellData && cellData.format) {
                cellData.format.borders = {
                    top: { style: 'thin', color: '#B4C6E7' },
                    bottom: { style: 'thin', color: '#B4C6E7' },
                    left: { style: 'thin', color: '#B4C6E7' },
                    right: { style: 'thin', color: '#B4C6E7' }
                };
            }
            ss.updateCellDisplay(ref);
        });

        ss.setModified(true);
        ss.saveState();
        ss.selectCell(targetStart);
        ss.updateStatus(`Tabella pivot creata - raggruppati per "${headers[0]}"`);
    }

    // ===== GRAFICI =====
    bindChartEvents() {
        // I bottoni grafici sono già gestiti da ribbon-actions.js
        // che delega a createChart() quando excelAdvanced è disponibile
    }

    showChartTypeDialog() {
        const types = [
            { id: 'colonne', icon: '📊', name: 'Colonne' },
            { id: 'barre', icon: '📊', name: 'Barre' },
            { id: 'linee', icon: '📈', name: 'Linee' },
            { id: 'torta', icon: '🥧', name: 'Torta' },
            { id: 'area', icon: '📈', name: 'Area' }
        ];
        const overlay = document.createElement('div');
        overlay.id = 'chart-type-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <strong style="font-size:15px;">Scegli tipo di grafico</strong>
                <button onclick="this.closest('#chart-type-modal').remove()" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                ${types.map(t => `<button class="ct-btn" data-type="${t.id}" style="padding:16px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;text-align:center;font-size:14px;transition:background 0.15s;">${t.icon}<br>${t.name}</button>`).join('')}
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelectorAll('.ct-btn').forEach(btn => {
            btn.onmouseenter = () => btn.style.background = '#e8f5e9';
            btn.onmouseleave = () => btn.style.background = '#fff';
            btn.onclick = () => { this.createChart(btn.dataset.type); overlay.remove(); };
        });
    }

    createChart(type) {
        const cells = this.functions.getSelectedCells();
        if (cells.length < 2) {
            this.spreadsheet.updateStatus('Seleziona i dati per il grafico');
            return;
        }

        const data = this.safeGetRangeData(cells);
        if (!data || data.values.length === 0) {
            this.spreadsheet.updateStatus('Nessun dato valido per creare il grafico');
            return;
        }

        const container = this.createChartContainer(type, data);
        const chart = {
            id: 'chart_' + Date.now(),
            type: type,
            data: data,
            title: `Grafico a ${type}`,
            container: container
        };

        this.charts.push(chart);

        // Inserisce il grafico sul foglio come oggetto drawing
        if (window.insertDrawingObject) {
            const svgEl = container.querySelector('svg');
            if (svgEl) {
                // Rimuovi position:absolute dal SVG per funzionare dentro il drawing div
                svgEl.style.position = '';
                svgEl.style.top = '';
                svgEl.style.left = '';
            }
            // Usa container.innerHTML: l'SVG è in formato HTML, pronto per innerHTML
            const svgHtml = container.innerHTML;
            const typeLabels = {
                'colonne': 'Colonne', 'linee': 'Linee',
                'torta': 'Torta', 'barre': 'Barre', 'area': 'Area'
            };
            window.insertDrawingObject('', {
                name: 'Grafico: ' + (typeLabels[type] || type),
                html: svgHtml,
                width: 460,
                height: 310,
                fillColor: '#ffffff',
                borderColor: '#d6d6d6',
                borderWidth: 1,
                padding: 4
            });
        }

        this.spreadsheet.updateStatus(`Grafico a ${type} creato`);
    }

    safeGetRangeData(cells) {
        try {
            if (!cells || !Array.isArray(cells)) return { labels: [], values: [] };
            const labels = [];
            const values = [];
            cells.forEach(cellRef => {
                const val = this.spreadsheet.getCellValue(cellRef);
                const num = parseFloat(val);
                if (!isNaN(num)) {
                    values.push(num);
                    labels.push(cellRef);
                } else if (val && val.trim()) {
                    labels.push(val);
                }
            });
            return { labels, values };
        } catch (error) {
            return { labels: [], values: [] };
        }
    }

    createChartContainer(type, data) {
        const container = document.createElement('div');
        container.className = 'chart-container';
        container.style.cssText = 'width:450px;height:300px;border:1px solid #d6d6d6;background:white;position:relative;overflow:hidden;';

        const { labels, values } = data;
        if (values.length === 0) return container;

        const colors = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#9B2335', '#636363', '#C55A11'];

        if (type === 'colonne' || type === 'barre') {
            this.renderBarChart(container, labels, values, colors, type === 'barre');
        } else if (type === 'torta') {
            this.renderPieChart(container, labels, values, colors);
        } else if (type === 'linee') {
            this.renderLineChart(container, labels, values, colors);
        } else if (type === 'area') {
            this.renderAreaChart(container, labels, values, colors);
        }

        return container;
    }

    renderBarChart(container, labels, values, colors, horizontal) {
        const max = Math.max(...values, 1);
        const count = values.length;
        const chartW = 400, chartH = 240, padL = 40, padB = 30;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '450');
        svg.setAttribute('height', '300');
        svg.style.cssText = 'position:absolute;top:0;left:0;';

        // Griglia
        for (let i = 0; i <= 4; i++) {
            const y = 10 + (chartH / 4) * i;
            const val = Math.round(max - (max / 4) * i);
            svg.innerHTML += `<line x1="${padL}" y1="${y}" x2="${padL + chartW}" y2="${y}" stroke="#eee" stroke-width="1"/>`;
            svg.innerHTML += `<text x="${padL - 4}" y="${y + 4}" text-anchor="end" font-size="10" fill="#666">${val}</text>`;
        }

        if (horizontal) {
            // Barre orizzontali
            const barH = Math.min(30, (chartH - 10) / count - 4);
            values.forEach((v, i) => {
                const w = (v / max) * chartW;
                const y = 10 + i * (barH + 4);
                svg.innerHTML += `<rect x="${padL}" y="${y}" width="${w}" height="${barH}" fill="${colors[i % colors.length]}" rx="2"/>`;
                svg.innerHTML += `<text x="${padL + w + 4}" y="${y + barH / 2 + 4}" font-size="10" fill="#333">${v}</text>`;
                const lbl = labels[i] !== undefined ? labels[i] : '';
                svg.innerHTML += `<text x="${padL - 4}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="9" fill="#666">${typeof lbl === 'string' && lbl.length > 5 ? lbl.slice(0, 5) : lbl}</text>`;
            });
        } else {
            // Colonne verticali
            const barW = Math.min(40, (chartW - 20) / count - 4);
            const gap = (chartW - barW * count) / (count + 1);
            values.forEach((v, i) => {
                const h = (v / max) * chartH;
                const x = padL + gap + i * (barW + gap);
                const y = 10 + chartH - h;
                svg.innerHTML += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${colors[i % colors.length]}" rx="2"/>`;
                svg.innerHTML += `<text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="#333">${v}</text>`;
                const lbl = labels[i] !== undefined ? labels[i] : '';
                svg.innerHTML += `<text x="${x + barW / 2}" y="${10 + chartH + 14}" text-anchor="middle" font-size="9" fill="#666">${typeof lbl === 'string' && lbl.length > 6 ? lbl.slice(0, 6) : lbl}</text>`;
            });
        }

        container.appendChild(svg);
    }

    renderPieChart(container, labels, values, colors) {
        const total = values.reduce((s, v) => s + v, 0);
        if (total === 0) return;
        const cx = 160, cy = 140, r = 110;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '450');
        svg.setAttribute('height', '300');
        svg.style.cssText = 'position:absolute;top:0;left:0;';

        let angle = -Math.PI / 2;
        values.forEach((v, i) => {
            const slice = (v / total) * Math.PI * 2;
            const x1 = cx + r * Math.cos(angle);
            const y1 = cy + r * Math.sin(angle);
            const x2 = cx + r * Math.cos(angle + slice);
            const y2 = cy + r * Math.sin(angle + slice);
            const large = slice > Math.PI ? 1 : 0;
            svg.innerHTML += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z" fill="${colors[i % colors.length]}" stroke="#fff" stroke-width="2"/>`;
            // Etichetta
            const midAngle = angle + slice / 2;
            const lx = cx + (r * 0.65) * Math.cos(midAngle);
            const ly = cy + (r * 0.65) * Math.sin(midAngle);
            const pct = Math.round(v / total * 100);
            if (pct > 3) svg.innerHTML += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#fff" font-weight="bold">${pct}%</text>`;
            angle += slice;
        });

        // Legenda
        let ly = 20;
        values.forEach((v, i) => {
            const lbl = labels[i] !== undefined ? labels[i] : `Dato ${i + 1}`;
            svg.innerHTML += `<rect x="310" y="${ly}" width="12" height="12" fill="${colors[i % colors.length]}" rx="2"/>`;
            svg.innerHTML += `<text x="328" y="${ly + 10}" font-size="10" fill="#333">${lbl}: ${v}</text>`;
            ly += 18;
        });

        container.appendChild(svg);
    }

    renderLineChart(container, labels, values, colors) {
        const max = Math.max(...values, 1);
        const count = values.length;
        const chartW = 380, chartH = 240, padL = 45, padT = 10;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '450');
        svg.setAttribute('height', '300');
        svg.style.cssText = 'position:absolute;top:0;left:0;';

        // Griglia
        for (let i = 0; i <= 4; i++) {
            const y = padT + (chartH / 4) * i;
            const val = Math.round(max - (max / 4) * i);
            svg.innerHTML += `<line x1="${padL}" y1="${y}" x2="${padL + chartW}" y2="${y}" stroke="#eee" stroke-width="1"/>`;
            svg.innerHTML += `<text x="${padL - 4}" y="${y + 4}" text-anchor="end" font-size="10" fill="#666">${val}</text>`;
        }

        // Linea e punti
        const points = values.map((v, i) => {
            const x = padL + (count > 1 ? (i / (count - 1)) * chartW : chartW / 2);
            const y = padT + chartH - (v / max) * chartH;
            return { x, y, v };
        });
        const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
        svg.innerHTML += `<polyline points="${polyline}" fill="none" stroke="${colors[0]}" stroke-width="2.5"/>`;
        points.forEach(p => {
            svg.innerHTML += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${colors[0]}" stroke="#fff" stroke-width="2"/>`;
            svg.innerHTML += `<text x="${p.x}" y="${p.y - 8}" text-anchor="middle" font-size="10" fill="#333">${p.v}</text>`;
        });

        container.appendChild(svg);
    }

    renderAreaChart(container, labels, values, colors) {
        const max = Math.max(...values, 1);
        const count = values.length;
        const chartW = 380, chartH = 240, padL = 45, padT = 10;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '450');
        svg.setAttribute('height', '300');
        svg.style.cssText = 'position:absolute;top:0;left:0;';

        // Griglia
        for (let i = 0; i <= 4; i++) {
            const y = padT + (chartH / 4) * i;
            const val = Math.round(max - (max / 4) * i);
            svg.innerHTML += `<line x1="${padL}" y1="${y}" x2="${padL + chartW}" y2="${y}" stroke="#eee" stroke-width="1"/>`;
            svg.innerHTML += `<text x="${padL - 4}" y="${y + 4}" text-anchor="end" font-size="10" fill="#666">${val}</text>`;
        }

        // Area
        const points = values.map((v, i) => {
            const x = padL + (count > 1 ? (i / (count - 1)) * chartW : chartW / 2);
            const y = padT + chartH - (v / max) * chartH;
            return { x, y };
        });
        const baseline = padT + chartH;
        let pathD = `M${points[0].x},${baseline}`;
        points.forEach(p => pathD += ` L${p.x},${p.y}`);
        pathD += ` L${points[points.length - 1].x},${baseline} Z`;
        svg.innerHTML += `<path d="${pathD}" fill="${colors[0]}" fill-opacity="0.3" stroke="${colors[0]}" stroke-width="2"/>`;

        // Punti
        points.forEach((p, i) => {
            svg.innerHTML += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${colors[0]}"/>`;
            svg.innerHTML += `<text x="${p.x}" y="${p.y - 6}" text-anchor="middle" font-size="9" fill="#333">${values[i]}</text>`;
        });

        container.appendChild(svg);
    }

    showChartDialog(chart) {
        const dialog = document.createElement('div');
        dialog.id = 'chart-dialog-modal';
        dialog.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const content = document.createElement('div');
        content.style.cssText = 'background:white;padding:20px;border-radius:8px;min-width:500px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
        content.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h3 style="margin:0;font-size:16px;">${chart.title}</h3>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#chart-dialog-modal').remove()">✕</button>
            </div>
            <div class="chart-display"></div>
            <div style="margin-top:16px;text-align:right;">
                <button class="close-chart" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Chiudi</button>
            </div>
        `;

        content.querySelector('.chart-display').appendChild(chart.container);
        content.querySelector('.close-chart').addEventListener('click', () => dialog.remove());

        dialog.appendChild(content);
        document.body.appendChild(dialog);
        dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });
    }

    // ===== REVISIONE =====
    bindReviewEvents() {
        const tab = document.getElementById('review-tab');
        if (!tab) return;
        const byTitle = (title, handler) => {
            tab.querySelectorAll(`[title="${title}"]`).forEach(btn => btn.addEventListener('click', handler));
        };
        // I titoli "Precedente"/"Successivo" esistono SIA nel gruppo Commenti SIA nel gruppo
        // Note: serve agganciarli al gestore giusto in base al titolo del gruppo che li contiene.
        const byTitleInGroup = (title, groupKeyword, handler) => {
            tab.querySelectorAll(`[title="${title}"]`).forEach(btn => {
                const groupTitle = btn.closest('.ribbon-group')?.querySelector('.group-title')?.textContent || '';
                if (groupTitle.includes(groupKeyword)) btn.addEventListener('click', handler);
            });
        };

        // Commenti
        byTitle('Nuovo commento', () => this.addComment());
        byTitle('Elimina', () => this.deleteComment());
        byTitleInGroup('Precedente', 'Commenti', () => this.navigateComment('prev'));
        byTitleInGroup('Successivo', 'Commenti', () => this.navigateComment('next'));
        byTitle('Mostra commento', () => this.showCellComment());
        byTitle('Mostra tutti i commenti', () => this.showAllComments());

        // Protezione
        byTitle('Proteggi foglio', () => this.protectSheet());
        byTitle('Proteggi cartella di lavoro', () => this.protectWorkbook());
        byTitle('Consenti modifica intervalli', () => this.showAllowEditRangesDialog());

        // Controllo ortografia
        byTitle('Controllo ortografia', () => this.spellCheck());
        byTitle('Thesaurus', () => this.showThesaurus());
        byTitle('Controllo accessibilità', () => this.showAccessibilityCheck());

        // Note
        byTitle('Nuova nota', () => this.addNote());
        byTitle('Elimina nota', () => this.deleteNote());
        byTitleInGroup('Precedente', 'Note', () => this.navigateNote('prev'));
        byTitleInGroup('Successivo', 'Note', () => this.navigateNote('next'));
        byTitle('Mostra tutte le note', () => this.showAllNotes());
    }

    navigateNote(direction) {
        const cellsWithNotes = Object.keys(this.spreadsheet.data).filter(r => this.spreadsheet.data[r]?.note).sort();
        if (cellsWithNotes.length === 0) { this.spreadsheet.updateStatus('Nessuna nota trovata'); return; }
        const currentIdx = cellsWithNotes.indexOf(this.spreadsheet.selectedCell);
        let nextIdx;
        if (direction === 'next') nextIdx = currentIdx < cellsWithNotes.length - 1 ? currentIdx + 1 : 0;
        else nextIdx = currentIdx > 0 ? currentIdx - 1 : cellsWithNotes.length - 1;
        const ref = cellsWithNotes[nextIdx];
        this.spreadsheet.selectCell(ref);
        this.spreadsheet.updateStatus(`Nota ${ref}: ${this.spreadsheet.data[ref].note}`);
    }

    navigateComment(direction) {
        const cellsWithComments = Object.keys(this.spreadsheet.data).filter(r => this.spreadsheet.data[r]?.comments?.length > 0).sort();
        if (cellsWithComments.length === 0) { this.spreadsheet.updateStatus('Nessun commento trovato'); return; }
        const currentIdx = cellsWithComments.indexOf(this.spreadsheet.selectedCell);
        let nextIdx;
        if (direction === 'next') nextIdx = currentIdx < cellsWithComments.length - 1 ? currentIdx + 1 : 0;
        else nextIdx = currentIdx > 0 ? currentIdx - 1 : cellsWithComments.length - 1;
        this.spreadsheet.selectCell(cellsWithComments[nextIdx]);
        this.showCellComment();
    }

    showCellComment() {
        const cellRef = this.spreadsheet.selectedCell;
        const data = this.spreadsheet.data[cellRef];
        if (!data?.comments?.length) { this.spreadsheet.updateStatus('Nessun commento in questa cella'); return; }
        const overlay = document.createElement('div');
        overlay.id = 'show-comment-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:350px;max-width:500px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Commenti - ${cellRef}</h3>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#show-comment-modal').remove()">✕</button>
            </div>
            <div style="max-height:300px;overflow-y:auto;">
                ${data.comments.map((c, i) => `<div style="padding:10px;margin-bottom:8px;background:#f8f8f8;border-radius:6px;border-left:3px solid #217346;">
                    <div style="font-size:12px;color:#666;margin-bottom:4px;">${c.author} - ${c.date}</div>
                    <div style="font-size:13px;">${c.text}</div>
                </div>`).join('')}
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    showAllComments() {
        const allComments = [];
        for (const ref in this.spreadsheet.data) {
            const d = this.spreadsheet.data[ref];
            if (d?.comments?.length) d.comments.forEach(c => allComments.push({ ref, ...c }));
        }
        if (allComments.length === 0) { this.spreadsheet.updateStatus('Nessun commento nel foglio'); return; }
        const overlay = document.createElement('div');
        overlay.id = 'all-comments-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:400px;max-width:600px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Tutti i commenti (${allComments.length})</h3>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#all-comments-modal').remove()">✕</button>
            </div>
            <div style="max-height:400px;overflow-y:auto;">
                ${allComments.map(c => `<div style="padding:10px;margin-bottom:8px;background:#f8f8f8;border-radius:6px;border-left:3px solid #217346;cursor:pointer;" data-goto="${c.ref}">
                    <div style="font-size:12px;color:#666;">${c.ref} - ${c.author} - ${c.date}</div>
                    <div style="font-size:13px;">${c.text}</div>
                </div>`).join('')}
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => {
            this.spreadsheet.selectCell(el.dataset.goto);
            overlay.remove();
        }));
    }

    addNote() {
        const cellRef = this.spreadsheet.selectedCell;
        const data = this.spreadsheet.data[cellRef] || (this.spreadsheet.data[cellRef] = this.functions.createCellData());
        const overlay = document.createElement('div');
        overlay.id = 'note-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fffde7;border-radius:8px;padding:20px;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h3 style="margin:0;font-size:16px;">Nota - ${cellRef}</h3>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#note-modal').remove()">✕</button>
            </div>
            <textarea id="note-text" rows="4" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;background:#fffef5;resize:vertical;">${data.note || ''}</textarea>
            <div style="text-align:right;margin-top:12px;">
                <button style="padding:6px 16px;background:#f9a825;color:#fff;border:none;border-radius:4px;cursor:pointer;" onclick="
                    const note=this.closest('#note-modal').querySelector('#note-text').value.trim();
                    if(window.spreadsheet.data['${cellRef}']) window.spreadsheet.data['${cellRef}'].note=note;
                    const cell=document.querySelector('[data-cell=&quot;${cellRef}&quot;]');
                    if(cell){cell.classList.toggle('has-note',!!note);}
                    window.spreadsheet.setModified(true);window.spreadsheet.saveState();
                    this.closest('#note-modal').remove();
                ">Salva</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#note-text').focus();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    deleteNote() {
        const cellRef = this.spreadsheet.selectedCell;
        if (this.spreadsheet.data[cellRef]?.note) {
            delete this.spreadsheet.data[cellRef].note;
            const cell = document.querySelector(`[data-cell="${cellRef}"]`);
            if (cell) cell.classList.remove('has-note');
            this.spreadsheet.updateStatus('Nota eliminata');
        } else {
            this.spreadsheet.updateStatus('Nessuna nota in questa cella');
        }
    }

    showAllNotes() {
        const notes = [];
        for (const ref in this.spreadsheet.data) {
            if (this.spreadsheet.data[ref]?.note) notes.push({ ref, text: this.spreadsheet.data[ref].note });
        }
        if (notes.length === 0) { this.spreadsheet.updateStatus('Nessuna nota nel foglio'); return; }
        const overlay = document.createElement('div');
        overlay.id = 'all-notes-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fffde7;border-radius:8px;padding:20px;min-width:400px;max-width:600px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Tutte le note (${notes.length})</h3>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#all-notes-modal').remove()">✕</button>
            </div>
            <div style="max-height:400px;overflow-y:auto;">
                ${notes.map(n => `<div style="padding:10px;margin-bottom:8px;background:#fffef5;border-radius:6px;border-left:3px solid #f9a825;cursor:pointer;" data-goto="${n.ref}">
                    <div style="font-size:12px;color:#666;margin-bottom:4px;">${n.ref}</div>
                    <div style="font-size:13px;">${n.text}</div>
                </div>`).join('')}
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => {
            this.spreadsheet.selectCell(el.dataset.goto);
            overlay.remove();
        }));
    }

    addComment() {
        const cellRef = this.spreadsheet.selectedCell;
        const overlay = document.createElement('div');
        overlay.id = 'comment-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:350px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Aggiungi commento a ${cellRef}</h3>
                <button id="comment-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <textarea id="comment-text" rows="4" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;resize:vertical;" placeholder="Scrivi il commento..." autofocus></textarea>
            <div style="text-align:right;margin-top:12px;">
                <button id="comment-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="comment-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Aggiungi</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('#comment-close').onclick = close;
        overlay.querySelector('#comment-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        const textarea = overlay.querySelector('#comment-text');
        textarea.focus();

        const self = this;
        const save = () => {
            const comment = textarea.value.trim();
            if (!comment) return;

            if (!self.spreadsheet.data[cellRef]) {
                self.spreadsheet.data[cellRef] = self.functions.createCellData();
            }
            if (!self.spreadsheet.data[cellRef].comments) {
                self.spreadsheet.data[cellRef].comments = [];
            }
            self.spreadsheet.data[cellRef].comments.push({
                text: comment,
                author: 'Utente',
                date: new Date().toLocaleString()
            });

            const cellElement = document.querySelector(`[data-cell="${cellRef}"]`);
            if (cellElement && !cellElement.querySelector('.comment-indicator')) {
                const indicator = document.createElement('div');
                indicator.className = 'comment-indicator';
                indicator.style.cssText = 'position:absolute;top:2px;right:2px;width:6px;height:6px;background:#FF0000;border-radius:50%;';
                cellElement.appendChild(indicator);
            }

            self.spreadsheet.setModified(true);
            self.spreadsheet.updateStatus('Commento aggiunto');
            close();
        };

        overlay.querySelector('#comment-ok').onclick = save;
        textarea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) save(); });
    }

    protectSheet() {
        if (this.spreadsheet.isProtected) {
            // Se già protetto, mostra dialog per rimuovere protezione
            const overlay = document.createElement('div');
            overlay.id = 'protect-modal';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
            overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h3 style="margin:0;font-size:16px;">Rimuovi protezione foglio</h3>
                    <button id="protect-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
                </div>
                ${this.spreadsheet.protectionPassword ? '<div style="margin-bottom:16px;"><label style="display:block;margin-bottom:6px;font-size:13px;">Inserisci password:</label><input type="password" id="protect-pwd" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;" autofocus></div>' : '<p style="margin-bottom:16px;">Rimuovere la protezione dal foglio?</p>'}
                <div style="text-align:right;">
                    <button id="protect-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                    <button id="protect-ok" style="padding:6px 16px;background:#c0392b;color:#fff;border:none;border-radius:4px;cursor:pointer;">Rimuovi protezione</button>
                </div>
            </div>`;
            document.body.appendChild(overlay);
            const close = () => overlay.remove();
            overlay.querySelector('#protect-close').onclick = close;
            overlay.querySelector('#protect-cancel').onclick = close;
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
            overlay.querySelector('#protect-ok').onclick = () => {
                const pwd = overlay.querySelector('#protect-pwd');
                if (this.spreadsheet.protectionPassword && pwd && pwd.value !== this.spreadsheet.protectionPassword) {
                    pwd.style.borderColor = '#c0392b';
                    pwd.placeholder = 'Password errata!';
                    return;
                }
                this.spreadsheet.isProtected = false;
                this.spreadsheet.protectionPassword = null;
                this.spreadsheet.updateStatus('Protezione foglio rimossa');
                close();
            };
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'protect-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Proteggi foglio</h3>
                <button id="protect-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:16px;">
                <label style="display:block;margin-bottom:6px;font-size:13px;">Password (opzionale):</label>
                <input type="password" id="protect-pwd" placeholder="Lascia vuoto per nessuna password" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:16px;">
                <label style="display:block;margin-bottom:6px;font-size:13px;">Consenti agli utenti di:</label>
                <label style="display:flex;align-items:center;padding:4px 0;cursor:pointer;"><input type="checkbox" checked style="margin-right:8px;"> Selezionare celle sbloccate</label>
                <label style="display:flex;align-items:center;padding:4px 0;cursor:pointer;"><input type="checkbox" style="margin-right:8px;"> Selezionare celle bloccate</label>
                <label style="display:flex;align-items:center;padding:4px 0;cursor:pointer;"><input type="checkbox" style="margin-right:8px;"> Formattare celle</label>
                <label style="display:flex;align-items:center;padding:4px 0;cursor:pointer;"><input type="checkbox" style="margin-right:8px;"> Inserire righe</label>
                <label style="display:flex;align-items:center;padding:4px 0;cursor:pointer;"><input type="checkbox" style="margin-right:8px;"> Inserire colonne</label>
            </div>
            <div style="text-align:right;">
                <button id="protect-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="protect-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Proteggi</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('#protect-close').onclick = close;
        overlay.querySelector('#protect-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('#protect-ok').onclick = () => {
            this.spreadsheet.isProtected = true;
            this.spreadsheet.protectionPassword = overlay.querySelector('#protect-pwd').value || null;
            this.spreadsheet.updateStatus('Foglio protetto');
            close();
        };
    }

    spellCheck() {
        // Dizionario italiano di base (parole comuni). Non è esaustivo: serve a segnalare
        // parole NON riconosciute senza alterare la formattazione delle celle (non distruttivo).
        const dict = new Set([
            'il','lo','la','i','gli','le','un','uno','una','di','a','da','in','con','su','per','tra','fra',
            'e','ed','o','od','ma','se','che','chi','cui','non','più','meno','molto','poco','tutto','tutti',
            'questo','questa','questi','queste','quello','quella','come','dove','quando','perché','anche',
            'è','sono','sei','siamo','siete','era','erano','essere','avere','ho','hai','ha','abbiamo','hanno',
            'fare','dire','andare','vedere','sapere','dare','stare','venire','dovere','potere','volere',
            'nome','cognome','data','totale','importo','prezzo','quantità','numero','valore','costo','ricavo',
            'cliente','prodotto','fattura','ordine','mese','anno','giorno','ora','indirizzo','città','telefono',
            'email','note','descrizione','categoria','stato','attivo','scadenza','pagamento','iva','sconto',
            'gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre',
            'lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica','sì','no','ciao','grazie'
        ]);
        const suspects = []; // { ref, word }
        for (const cellRef in this.spreadsheet.data) {
            const cellData = this.spreadsheet.data[cellRef];
            if (!cellData) continue;
            const value = cellData.computedValue || cellData.value;
            if (typeof value !== 'string' || !value.trim()) continue;
            if (cellData.formula) continue; // ignora formule
            value.split(/\s+/).forEach(word => {
                const cleanWord = word.replace(/[^A-Za-zÀ-ÿ]/g, '').toLowerCase();
                // Salta parole corte, parole con cifre/simboli o già nel dizionario
                if (cleanWord.length < 3) return;
                if (/\d/.test(word)) return;
                if (dict.has(cleanWord)) return;
                suspects.push({ ref: cellRef, word: word.replace(/[<>&"]/g, '') });
            });
        }

        if (suspects.length === 0) {
            this.spreadsheet.updateStatus('Controllo ortografia completato: nessuna parola da verificare');
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'spellcheck-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:420px;max-width:560px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h3 style="margin:0;font-size:16px;">ABC Controllo ortografia</h3>
                <button onclick="this.closest('#spellcheck-modal').remove()" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="font-size:13px;color:#666;margin-bottom:12px;">${suspects.length} parol${suspects.length === 1 ? 'a' : 'e'} non riconosciut${suspects.length === 1 ? 'a' : 'e'} dal dizionario di base. Clicca per andare alla cella.</div>
            <div style="max-height:300px;overflow-y:auto;border:1px solid #eee;border-radius:4px;">
                ${suspects.map(s => `<div class="spell-item" data-goto="${s.ref}" style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #f0f0f0;cursor:pointer;font-size:13px;">
                    <span style="color:#c0392b;text-decoration:underline wavy #c0392b;">${s.word}</span>
                    <span style="color:#888;">${s.ref}</span>
                </div>`).join('')}
            </div>
            <div style="text-align:right;margin-top:12px;">
                <button onclick="this.closest('#spellcheck-modal').remove()" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Chiudi</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelectorAll('.spell-item').forEach(el => {
            el.onmouseenter = () => el.style.background = '#f5f5f5';
            el.onmouseleave = () => el.style.background = '';
            el.onclick = () => { this.spreadsheet.selectCell(el.dataset.goto); };
        });
        this.spreadsheet.updateStatus(`Controllo ortografia: ${suspects.length} parole da verificare`);
    }

    // ===== VISUALIZZAZIONE =====
    bindViewEvents() {
        const viewTab = document.getElementById('view-tab');
        if (!viewTab) return;
        const byTitle = (title, handler) => {
            viewTab.querySelectorAll(`[title="${title}"]`).forEach(btn => btn.addEventListener('click', handler));
        };

        // Visualizzazioni cartella di lavoro
        byTitle('Normale', () => {
            this.setViewMode('normal');
            this.spreadsheet.updateStatus('Visualizzazione: Normale');
        });
        byTitle('Layout di pagina', () => {
            this.setViewMode('page-layout');
            this.spreadsheet.updateStatus('Visualizzazione: Layout di pagina');
        });
        byTitle('Anteprima interruzioni di pagina', () => {
            this.setViewMode('page-break');
            this.spreadsheet.updateStatus('Visualizzazione: Anteprima interruzioni');
        });
        byTitle('Visualizzazioni personalizzate', () => {
            this.showCustomViewsDialog();
        });

        // Mostra
        byTitle('Linea della griglia', () => this.toggleGridlines());
        byTitle('Intestazioni', () => this.toggleHeaders());
        byTitle('Barra della formula', () => {
            const formulaBar = document.getElementById('formula-bar');
            if (formulaBar) {
                const visible = formulaBar.style.display !== 'none';
                formulaBar.style.display = visible ? 'none' : '';
                this.spreadsheet.updateStatus(`Barra della formula ${visible ? 'nascosta' : 'mostrata'}`);
            }
        });
        byTitle('Barra di stato', () => {
            const statusBar = document.getElementById('status-bar');
            if (statusBar) {
                const visible = statusBar.style.display !== 'none';
                statusBar.style.display = visible ? 'none' : '';
                this.spreadsheet.updateStatus(`Barra di stato ${visible ? 'nascosta' : 'mostrata'}`);
            }
        });
        byTitle('Regola', () => {
            const ruler = document.getElementById('ruler-bar');
            if (ruler) {
                const visible = ruler.style.display !== 'none';
                ruler.style.display = visible ? 'none' : '';
                this.spreadsheet.updateStatus(`Righello ${visible ? 'nascosto' : 'mostrato'}`);
            } else {
                // Crea righello
                const sheetArea = document.getElementById('sheet-area');
                if (!sheetArea) return;
                const bar = document.createElement('div');
                bar.id = 'ruler-bar';
                bar.style.cssText = 'height:20px;background:#f8f8f8;border-bottom:1px solid #ccc;display:flex;align-items:center;font-size:9px;color:#666;overflow:hidden;flex-shrink:0;';
                for (let i = 0; i <= 30; i++) {
                    const mark = document.createElement('div');
                    mark.style.cssText = `width:${i === 0 ? '60px' : '80px'};text-align:center;border-right:1px solid #ddd;flex-shrink:0;`;
                    mark.textContent = i === 0 ? '' : i + ' cm';
                    bar.appendChild(mark);
                }
                sheetArea.insertBefore(bar, sheetArea.firstChild);
                this.spreadsheet.updateStatus('Righello mostrato');
            }
        });

        // Zoom
        byTitle('Zoom', () => this.showZoomDialog());
        byTitle('Adatta alla selezione', () => {
            // Trova le celle selezionate e calcola il rettangolo
            const selected = document.querySelectorAll('.cell.selected, .cell.in-range');
            if (selected.length === 0) return;
            let minL = Infinity, minT = Infinity, maxR = 0, maxB = 0;
            selected.forEach(c => {
                const l = parseInt(c.style.left) || 0;
                const t = parseInt(c.style.top) || 0;
                const w = parseInt(c.style.width) || 80;
                const h = parseInt(c.style.height) || 25;
                if (l < minL) minL = l;
                if (t < minT) minT = t;
                if (l + w > maxR) maxR = l + w;
                if (t + h > maxB) maxB = t + h;
            });
            const sheetArea = document.getElementById('sheet-area');
            if (!sheetArea) return;
            const viewW = sheetArea.clientWidth;
            const viewH = sheetArea.clientHeight;
            const rangeW = maxR - minL;
            const rangeH = maxB - minT;
            if (rangeW > 0 && rangeH > 0) {
                const zoom = Math.min(Math.floor((viewW / rangeW) * 100), Math.floor((viewH / rangeH) * 100), 400);
                this.setZoom(Math.max(zoom, 10));
            }
        });
        byTitle('100%', () => this.setZoom(100));

        // Finestra
        byTitle('Nuova finestra', () => {
            window.open(window.location.href, '_blank');
        });
        byTitle('Organizza tutto', () => {
            this.spreadsheet.updateStatus('Organizza finestre: una sola finestra attiva');
        });
        byTitle('Nascondi', () => {
            const sheetArea = document.getElementById('sheet-area');
            if (sheetArea) {
                sheetArea.style.visibility = 'hidden';
                this.spreadsheet.updateStatus('Finestra nascosta — usa Mostra per ripristinare');
            }
        });
        byTitle('Mostra', () => {
            const sheetArea = document.getElementById('sheet-area');
            if (sheetArea) {
                sheetArea.style.visibility = 'visible';
                this.spreadsheet.updateStatus('Finestra mostrata');
            }
        });
        byTitle('Dividi', () => {
            const sheetArea = document.getElementById('sheet-area');
            if (!sheetArea) return;
            const existing = sheetArea.querySelector('.split-divider');
            if (existing) {
                existing.remove();
                this.spreadsheet.updateStatus('Divisione rimossa');
            } else {
                const divider = document.createElement('div');
                divider.className = 'split-divider';
                divider.style.cssText = 'position:absolute;left:0;right:0;top:50%;height:3px;background:#217346;cursor:row-resize;z-index:100;';
                sheetArea.appendChild(divider);
                this.spreadsheet.updateStatus('Finestra divisa orizzontalmente');
            }
        });
        byTitle('Blocca riquadri', () => {
            this.toggleFreezePanes();
        });
        byTitle('Sposta', () => {
            this.spreadsheet.updateStatus('Sposta finestra: trascina la barra del titolo');
        });

        // Macro
        byTitle('Visualizza macro', () => {
            this.showMacroDialog();
        });
        byTitle('Macro relative', () => {
            if (this._macroRecording) {
                this._macroRecording = false;
                this.spreadsheet.updateStatus('Registrazione macro interrotta');
            } else {
                this._macroRecording = true;
                this._macroSteps = [];
                this.spreadsheet.updateStatus('Registrazione macro avviata — clicca di nuovo per interrompere');
            }
        });

        // === Status bar buttons ===
        const btnNormal = document.getElementById('btn-normal-view');
        const btnPageLayout = document.getElementById('btn-page-layout');
        const btnPageBreak = document.getElementById('btn-page-break');

        if (btnNormal) btnNormal.addEventListener('click', () => this.setViewMode('normal'));
        if (btnPageLayout) btnPageLayout.addEventListener('click', () => this.setViewMode('page-layout'));
        if (btnPageBreak) btnPageBreak.addEventListener('click', () => this.setViewMode('page-break'));

        // === Zoom slider bar ===
        const zoomSlider = document.getElementById('zoom-slider-bar');
        const zoomOut = document.getElementById('btn-zoom-out');
        const zoomIn = document.getElementById('btn-zoom-in');

        if (zoomSlider) {
            zoomSlider.addEventListener('input', () => {
                this.setZoom(parseInt(zoomSlider.value));
            });
        }
        if (zoomOut) {
            zoomOut.addEventListener('click', () => {
                const current = this.currentZoom || 100;
                this.setZoom(Math.max(10, current - 10));
            });
        }
        if (zoomIn) {
            zoomIn.addEventListener('click', () => {
                const current = this.currentZoom || 100;
                this.setZoom(Math.min(400, current + 10));
            });
        }
    }

    setZoom(level) {
        level = Math.max(10, Math.min(400, level));
        this.currentZoom = level;
        const viewport = document.getElementById('spreadsheet-viewport');
        if (viewport) {
            viewport.style.transform = `scale(${level / 100})`;
            viewport.style.transformOrigin = 'top left';
        }

        const zoomLevel = document.getElementById('zoom-level');
        if (zoomLevel) zoomLevel.textContent = level + '%';

        const slider = document.getElementById('zoom-slider-bar');
        if (slider) slider.value = level;

        if (this.spreadsheet) this.spreadsheet.updateStatus(`Zoom: ${level}%`);
    }

    setViewMode(mode) {
        this.currentViewMode = mode;
        const sheetArea = document.getElementById('sheet-area');
        if (!sheetArea) return;

        // Rimuovi classi precedenti
        sheetArea.classList.remove('view-normal', 'view-page-layout', 'view-page-break');
        sheetArea.classList.add('view-' + mode);

        // Aggiorna bottoni status bar
        document.querySelectorAll('#btn-normal-view, #btn-page-layout, #btn-page-break').forEach(b => b.classList.remove('active'));
        if (mode === 'normal') document.getElementById('btn-normal-view')?.classList.add('active');
        else if (mode === 'page-layout') document.getElementById('btn-page-layout')?.classList.add('active');
        else if (mode === 'page-break') document.getElementById('btn-page-break')?.classList.add('active');

        // Applica stile visivo
        if (mode === 'page-layout') {
            sheetArea.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
            sheetArea.style.margin = '20px auto';
            sheetArea.style.maxWidth = '210mm';
            sheetArea.style.background = '#fff';
        } else if (mode === 'page-break') {
            sheetArea.style.boxShadow = '';
            sheetArea.style.margin = '';
            sheetArea.style.maxWidth = '';
            // Mostra linee di interruzione pagina
            document.querySelectorAll('.page-break-line').forEach(l => l.remove());
            const rows = this.spreadsheet.rows;
            const rowsPerPage = 50;
            for (let r = rowsPerPage; r < rows; r += rowsPerPage) {
                const line = document.createElement('div');
                line.className = 'page-break-line';
                line.style.cssText = `position:absolute;left:0;right:0;top:${r * 25}px;height:2px;background:#0066cc;border-style:dashed;z-index:50;pointer-events:none;`;
                sheetArea.appendChild(line);
            }
        } else {
            sheetArea.style.boxShadow = '';
            sheetArea.style.margin = '';
            sheetArea.style.maxWidth = '';
            document.querySelectorAll('.page-break-line').forEach(l => l.remove());
        }
    }

    toggleFreezePanes() {
        if (this._frozenPanes) {
            this._clearFreeze();
            this.spreadsheet.updateStatus('Riquadri sbloccati');
            return;
        }
        const cell = this.spreadsheet.selectedCell || 'A1';
        const coords = this.spreadsheet.getCellCoordinates(cell);
        if (!coords) return;
        // In Excel si bloccano le righe SOPRA e le colonne A SINISTRA della cella attiva.
        let freezeRow = coords.row;
        let freezeCol = coords.col;
        // Se la cella è A1 (niente da bloccare) blocca riga 1 e colonna A per dare effetto visibile.
        if (freezeRow === 0 && freezeCol === 0) { freezeRow = 1; freezeCol = 1; }
        this._applyFreeze(freezeRow, freezeCol);
        this.spreadsheet.updateStatus(`Riquadri bloccati a ${cell}`);
    }

    _applyFreeze(freezeRow, freezeCol) {
        this._clearFreeze();
        const viewport = document.getElementById('spreadsheet-viewport');
        const colHeaders = document.getElementById('column-headers');
        const rowHeaders = document.getElementById('row-headers');
        if (!viewport) return;

        this._frozenPanes = { row: freezeRow, col: freezeCol };

        // Raccogli e tagga le celle/intestazioni congelate (cache per performance).
        const cornerCells = [], topCells = [], leftCells = [];
        viewport.querySelectorAll('.cell').forEach(c => {
            const r = parseInt(c.dataset.row);
            const col = parseInt(c.dataset.col);
            const inTop = r < freezeRow;
            const inLeft = col < freezeCol;
            if (inTop && inLeft) { cornerCells.push(c); c.classList.add('frozen-corner'); c.style.zIndex = 30; }
            else if (inTop) { topCells.push(c); c.classList.add('frozen-top'); c.style.zIndex = 20; }
            else if (inLeft) { leftCells.push(c); c.classList.add('frozen-left'); c.style.zIndex = 20; }
        });
        const topHeaders = colHeaders ? [...colHeaders.querySelectorAll('.col-header')].filter(h => parseInt(h.dataset.col) < freezeCol) : [];
        const leftHeaders = rowHeaders ? [...rowHeaders.querySelectorAll('.row-header')].filter(h => parseInt(h.dataset.row) < freezeRow) : [];
        // z-index alto + sfondo opaco: coprono gli header scorrevoli che passano sotto.
        topHeaders.forEach(h => { h.style.zIndex = 25; h.style.position = 'relative'; h.style.backgroundColor = '#f3f3f3'; });
        leftHeaders.forEach(h => { h.style.zIndex = 25; h.style.position = 'relative'; h.style.backgroundColor = '#f3f3f3'; });

        // Linee separatrici verde Excel.
        const sheetArea = document.getElementById('sheet-area');
        const drawLines = () => {
            document.querySelectorAll('.freeze-line').forEach(l => l.remove());
            if (!sheetArea) return;
            const x = this.spreadsheet.rowHeaderWidth + this.spreadsheet.getColLeft(freezeCol);
            const y = this.spreadsheet.colHeaderHeight + this.spreadsheet.getRowTop(freezeRow);
            if (freezeCol > 0) {
                const vl = document.createElement('div');
                vl.className = 'freeze-line';
                vl.style.cssText = `position:absolute;left:${x}px;top:${this.spreadsheet.colHeaderHeight}px;bottom:0;width:2px;background:#a6a6a6;z-index:60;pointer-events:none;`;
                sheetArea.appendChild(vl);
            }
            if (freezeRow > 0) {
                const hl = document.createElement('div');
                hl.className = 'freeze-line';
                hl.style.cssText = `position:absolute;top:${y}px;left:${this.spreadsheet.rowHeaderWidth}px;right:0;height:2px;background:#a6a6a6;z-index:60;pointer-events:none;`;
                sheetArea.appendChild(hl);
            }
        };
        drawLines();

        // Handler di scroll: contro-trasla le celle/intestazioni congelate per tenerle ferme.
        this._freezeScrollHandler = () => {
            const sx = viewport.scrollLeft;
            const sy = viewport.scrollTop;
            cornerCells.forEach(c => c.style.transform = `translate(${sx}px, ${sy}px)`);
            topCells.forEach(c => c.style.transform = `translateY(${sy}px)`);
            leftCells.forEach(c => c.style.transform = `translateX(${sx}px)`);
            // Le intestazioni: il contenitore è traslato di -scroll; le congelate si contro-traslano.
            topHeaders.forEach(h => h.style.transform = `translateX(${sx}px)`);
            leftHeaders.forEach(h => h.style.transform = `translateY(${sy}px)`);
        };
        viewport.addEventListener('scroll', this._freezeScrollHandler);
        this._freezeScrollHandler();
    }

    _clearFreeze() {
        const viewport = document.getElementById('spreadsheet-viewport');
        if (this._freezeScrollHandler && viewport) {
            viewport.removeEventListener('scroll', this._freezeScrollHandler);
        }
        this._freezeScrollHandler = null;
        document.querySelectorAll('.frozen-corner, .frozen-top, .frozen-left').forEach(c => {
            c.classList.remove('frozen-corner', 'frozen-top', 'frozen-left');
            c.style.transform = '';
            c.style.zIndex = '';
        });
        const colHeaders = document.getElementById('column-headers');
        const rowHeaders = document.getElementById('row-headers');
        if (colHeaders) colHeaders.querySelectorAll('.col-header').forEach(h => { h.style.transform = ''; h.style.zIndex = ''; h.style.backgroundColor = ''; });
        if (rowHeaders) rowHeaders.querySelectorAll('.row-header').forEach(h => { h.style.transform = ''; h.style.zIndex = ''; h.style.backgroundColor = ''; });
        document.querySelectorAll('.freeze-line').forEach(l => l.remove());
        this._frozenPanes = null;
    }

    // ===== VISUALIZZAZIONI PERSONALIZZATE =====
    _captureViewState() {
        return {
            zoom: this.currentZoom || 100,
            viewMode: this.currentViewMode || 'normal',
            frozen: this._frozenPanes ? { row: this._frozenPanes.row, col: this._frozenPanes.col } : null,
            gridHidden: !!document.getElementById('spreadsheet')?.classList.contains('hide-gridlines'),
            headersHidden: document.getElementById('column-headers')?.style.display === 'none',
            formulaBarHidden: document.getElementById('formula-bar')?.style.display === 'none',
            statusBarHidden: document.getElementById('status-bar')?.style.display === 'none'
        };
    }

    _applyViewState(s) {
        if (!s) return;
        this.setZoom(s.zoom || 100);
        this.setViewMode(s.viewMode || 'normal');
        // Griglia
        const grid = document.getElementById('spreadsheet');
        if (grid) grid.classList.toggle('hide-gridlines', !!s.gridHidden);
        // Intestazioni
        const colH = document.getElementById('column-headers');
        const rowH = document.getElementById('row-headers');
        if (colH) colH.style.display = s.headersHidden ? 'none' : 'flex';
        if (rowH) rowH.style.display = s.headersHidden ? 'none' : 'block';
        // Barre
        const fb = document.getElementById('formula-bar');
        if (fb) fb.style.display = s.formulaBarHidden ? 'none' : '';
        const sb = document.getElementById('status-bar');
        if (sb) sb.style.display = s.statusBarHidden ? 'none' : '';
        // Riquadri bloccati
        this._clearFreeze();
        if (s.frozen) this._applyFreeze(s.frozen.row, s.frozen.col);
    }

    _loadCustomViews() {
        try { return JSON.parse(localStorage.getItem('excel-custom-views') || '{}'); }
        catch (e) { return {}; }
    }
    _saveCustomViews(views) {
        localStorage.setItem('excel-custom-views', JSON.stringify(views));
    }

    showCustomViewsDialog() {
        const views = this._loadCustomViews();
        const overlay = document.createElement('div');
        overlay.id = 'custom-views-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        const renderList = () => {
            const names = Object.keys(views);
            if (!names.length) return '<div style="color:#999;padding:8px;font-size:13px;">Nessuna visualizzazione salvata</div>';
            return names.map(n => `<div class="cv-item" data-name="${n.replace(/"/g,'&quot;')}" style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-radius:4px;font-size:13px;">
                <span style="cursor:pointer;flex:1;" class="cv-apply">${n}</span>
                <button class="cv-del" title="Elimina" style="border:none;background:none;cursor:pointer;color:#c0392b;font-size:14px;">🗑</button>
            </div>`).join('');
        };
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:380px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                <h3 style="margin:0;font-size:16px;">Visualizzazioni personalizzate</h3>
                <button id="cv-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:8px;font-size:12px;color:#666;">Salva l'impostazione corrente (zoom, modalità, griglia, intestazioni, riquadri bloccati) e ripristinala con un clic.</div>
            <div id="cv-list" style="max-height:160px;overflow-y:auto;border:1px solid #eee;border-radius:4px;padding:4px;margin-bottom:12px;">${renderList()}</div>
            <div style="display:flex;gap:8px;margin-bottom:4px;">
                <input type="text" id="cv-name" placeholder="Nome visualizzazione" style="flex:1;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
                <button id="cv-add" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;white-space:nowrap;">Aggiungi</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        const refresh = () => { overlay.querySelector('#cv-list').innerHTML = renderList(); bindItems(); };
        overlay.querySelector('#cv-close').onclick = close;
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        overlay.querySelector('#cv-add').onclick = () => {
            const name = overlay.querySelector('#cv-name').value.trim();
            if (!name) { this.spreadsheet.updateStatus('Inserisci un nome per la visualizzazione'); return; }
            views[name] = this._captureViewState();
            this._saveCustomViews(views);
            this.spreadsheet.updateStatus(`Visualizzazione "${name}" salvata`);
            overlay.querySelector('#cv-name').value = '';
            refresh();
        };
        const bindItems = () => {
            overlay.querySelectorAll('.cv-item').forEach(item => {
                const name = item.dataset.name;
                item.onmouseenter = () => item.style.background = '#e8f5e9';
                item.onmouseleave = () => item.style.background = '';
                item.querySelector('.cv-apply').onclick = () => {
                    this._applyViewState(views[name]);
                    this.spreadsheet.updateStatus(`Visualizzazione "${name}" applicata`);
                    close();
                };
                item.querySelector('.cv-del').onclick = (e) => {
                    e.stopPropagation();
                    delete views[name];
                    this._saveCustomViews(views);
                    this.spreadsheet.updateStatus(`Visualizzazione "${name}" eliminata`);
                    refresh();
                };
            });
        };
        bindItems();
    }

    showMacroDialog() {
        const overlay = document.createElement('div');
        overlay.id = 'macro-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:400px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Macro</h3>
                <button id="macro-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;font-size:13px;">Nome macro:</label>
                <input type="text" id="macro-name" placeholder="NomeMacro" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;font-size:13px;">Codice (JavaScript):</label>
                <textarea id="macro-code" rows="6" placeholder="// Il codice della macro..." style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;font-family:monospace;font-size:12px;resize:vertical;"></textarea>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;font-size:13px;">Macro salvate:</label>
                <div id="macro-list" style="max-height:100px;overflow-y:auto;border:1px solid #eee;border-radius:4px;padding:4px;">
                    <div style="color:#999;padding:4px;font-size:12px;">Nessuna macro salvata</div>
                </div>
            </div>
            <div style="text-align:right;">
                <button id="macro-run" style="padding:6px 16px;margin-right:8px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Esegui</button>
                <button id="macro-save" style="padding:6px 16px;margin-right:8px;border:1px solid #217346;color:#217346;background:#fff;border-radius:4px;cursor:pointer;">Salva</button>
                <button id="macro-cancel" style="padding:6px 16px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Chiudi</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('#macro-close').onclick = close;
        overlay.querySelector('#macro-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        // Popola lista macro salvate
        if (!window._macros) window._macros = {};
        const listEl = overlay.querySelector('#macro-list');
        const macroNames = Object.keys(window._macros);
        if (macroNames.length > 0) {
            listEl.innerHTML = macroNames.map(n =>
                `<div class="macro-item" data-name="${n}" style="padding:4px 8px;cursor:pointer;border-radius:4px;font-size:13px;">${n}</div>`
            ).join('');
            listEl.querySelectorAll('.macro-item').forEach(item => {
                item.onmouseenter = () => item.style.background = '#e8f5e9';
                item.onmouseleave = () => item.style.background = '';
                item.onclick = () => {
                    overlay.querySelector('#macro-name').value = item.dataset.name;
                    overlay.querySelector('#macro-code').value = window._macros[item.dataset.name];
                };
            });
        }

        overlay.querySelector('#macro-save').onclick = () => {
            const name = overlay.querySelector('#macro-name').value.trim();
            const code = overlay.querySelector('#macro-code').value.trim();
            if (name && code) {
                window._macros[name] = code;
                this.spreadsheet.updateStatus('Macro "' + name + '" salvata');
                close();
            }
        };
        overlay.querySelector('#macro-run').onclick = () => {
            const code = overlay.querySelector('#macro-code').value.trim();
            if (code) {
                try {
                    const fn = new Function('spreadsheet', code);
                    fn(this.spreadsheet);
                    this.spreadsheet.updateStatus('Macro eseguita');
                } catch (err) {
                    this.spreadsheet.updateStatus('Errore macro: ' + err.message);
                }
                close();
            }
        };
    }

    showZoomDialog() {
        const currentZoom = this.currentZoom || 100;
        const overlay = document.createElement('div');
        overlay.id = 'zoom-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Zoom</h3>
                <button id="zoom-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
                ${[50, 75, 100, 125, 150, 200, 300, 400].map(z => `<button class="zoom-preset" data-zoom="${z}" style="padding:6px 14px;border:1px solid ${z === currentZoom ? '#217346' : '#ccc'};background:${z === currentZoom ? '#e8f5e9' : '#fff'};border-radius:4px;cursor:pointer;font-size:13px;">${z}%</button>`).join('')}
            </div>
            <div style="margin-bottom:16px;">
                <label style="display:block;margin-bottom:6px;font-size:13px;">Personalizzato (10-400%):</label>
                <input type="range" id="zoom-slider" min="10" max="400" value="${currentZoom}" style="width:100%;">
                <div style="text-align:center;margin-top:4px;"><span id="zoom-display" style="font-weight:bold;">${currentZoom}%</span></div>
            </div>
            <div style="text-align:right;">
                <button id="zoom-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="zoom-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Applica</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('#zoom-close').onclick = close;
        overlay.querySelector('#zoom-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        const slider = overlay.querySelector('#zoom-slider');
        const display = overlay.querySelector('#zoom-display');
        slider.oninput = () => display.textContent = slider.value + '%';

        overlay.querySelectorAll('.zoom-preset').forEach(btn => {
            btn.onclick = () => {
                slider.value = btn.dataset.zoom;
                display.textContent = btn.dataset.zoom + '%';
                overlay.querySelectorAll('.zoom-preset').forEach(b => { b.style.borderColor = '#ccc'; b.style.background = '#fff'; });
                btn.style.borderColor = '#217346';
                btn.style.background = '#e8f5e9';
            };
        });

        overlay.querySelector('#zoom-ok').onclick = () => {
            this.setZoom(parseInt(slider.value));
            close();
        };
    }

    toggleGridlines() {
        const grid = document.getElementById('spreadsheet');
        grid.classList.toggle('hide-gridlines');
        const hidden = grid.classList.contains('hide-gridlines');
        this.spreadsheet.updateStatus(`Griglia ${hidden ? 'nascosta' : 'mostrata'}`);
    }

    toggleHeaders() {
        const colHeaders = document.getElementById('column-headers');
        const rowHeaders = document.getElementById('row-headers');
        const isVisible = colHeaders.style.display !== 'none';
        
        colHeaders.style.display = isVisible ? 'none' : 'flex';
        rowHeaders.style.display = isVisible ? 'none' : 'block';
        
        this.spreadsheet.updateStatus(`Intestazioni ${isVisible ? 'nascoste' : 'mostrate'}`);
    }

    // ===== ESPORTAZIONE =====
    exportToCSV() {
        let csvContent = '';
        
        for (let row = 0; row < this.spreadsheet.rows; row++) {
            const rowData = [];
            for (let col = 0; col < this.spreadsheet.cols; col++) {
                const cellRef = `${this.spreadsheet.numberToColumn(col)}${row + 1}`;
                const value = this.spreadsheet.getCellValue(cellRef);
                rowData.push(`"${value}"`);
            }
            csvContent += rowData.join(',') + '\n';
        }

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'foglio.csv';
        a.click();
        URL.revokeObjectURL(url);
        
        this.spreadsheet.updateStatus('Esportato come CSV');
    }

    // ===== UTILITY =====
    showCustomSortDialog() {
        const ss = this.spreadsheet;
        // Determina il range da ordinare dalla selezione corrente
        const a = ss.getCellCoordinates(ss.selectedRange?.start || ss.selectedCell || 'A1');
        const b = ss.getCellCoordinates(ss.selectedRange?.end || ss.selectedCell || 'A1');
        if (!a || !b) { ss.updateStatus('Selezione non valida'); return; }
        let r1 = Math.min(a.row, b.row), r2 = Math.max(a.row, b.row);
        const c1 = Math.min(a.col, b.col), c2 = Math.max(a.col, b.col);
        if (r1 === r2) { ss.updateStatus('Seleziona almeno due righe da ordinare'); return; }

        const colOptions = (withHeaders) => {
            let html = '';
            for (let c = c1; c <= c2; c++) {
                const letter = ss.numberToColumn(c);
                let label = `Colonna ${letter}`;
                if (withHeaders) {
                    const h = ss.getCellValue(letter + (r1 + 1));
                    if (h) label = h;
                }
                html += `<option value="${c}">${label}</option>`;
            }
            return html;
        };

        const overlay = document.createElement('div');
        overlay.id = 'customsort-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:440px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Ordinamento personalizzato</h3>
                <button id="cs-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <label style="display:flex;align-items:center;margin-bottom:14px;cursor:pointer;font-size:13px;"><input type="checkbox" id="cs-headers" checked style="margin-right:8px;"> I miei dati contengono intestazioni</label>
            <div id="cs-levels"></div>
            <button id="cs-addlevel" style="margin:4px 0 14px;padding:5px 12px;border:1px solid #217346;background:#fff;color:#217346;border-radius:4px;cursor:pointer;font-size:12px;">+ Aggiungi livello</button>
            <div style="text-align:right;border-top:1px solid #eee;padding-top:12px;">
                <button id="cs-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="cs-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('#cs-close').onclick = close;
        overlay.querySelector('#cs-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        const levelsBox = overlay.querySelector('#cs-levels');
        const addLevel = () => {
            if (levelsBox.children.length >= (c2 - c1 + 1)) return;
            const withHeaders = overlay.querySelector('#cs-headers').checked;
            const div = document.createElement('div');
            div.className = 'cs-level';
            div.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:8px;';
            div.innerHTML = `<span style="font-size:12px;color:#666;width:54px;">${levelsBox.children.length === 0 ? 'Ordina per' : 'Quindi per'}</span>
                <select class="cs-col" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px;">${colOptions(withHeaders)}</select>
                <select class="cs-dir" style="padding:6px;border:1px solid #ccc;border-radius:4px;">
                    <option value="asc">Crescente (A→Z)</option>
                    <option value="desc">Decrescente (Z→A)</option>
                </select>
                <button class="cs-del" style="border:none;background:#f0f0f0;border-radius:4px;width:26px;height:26px;cursor:pointer;">✕</button>`;
            div.querySelector('.cs-del').onclick = () => { if (levelsBox.children.length > 1) div.remove(); };
            levelsBox.appendChild(div);
        };
        addLevel();
        overlay.querySelector('#cs-addlevel').onclick = addLevel;
        // Quando cambia "contiene intestazioni", aggiorna le opzioni colonna
        overlay.querySelector('#cs-headers').onchange = () => {
            const withHeaders = overlay.querySelector('#cs-headers').checked;
            levelsBox.querySelectorAll('.cs-col').forEach(sel => {
                const v = sel.value; sel.innerHTML = colOptions(withHeaders); sel.value = v;
            });
        };

        overlay.querySelector('#cs-ok').onclick = () => {
            const withHeaders = overlay.querySelector('#cs-headers').checked;
            const levels = [...levelsBox.querySelectorAll('.cs-level')].map(l => ({
                col: parseInt(l.querySelector('.cs-col').value),
                dir: l.querySelector('.cs-dir').value
            }));
            const dataStart = withHeaders ? r1 + 1 : r1;
            if (dataStart > r2) { ss.updateStatus('Nessuna riga dati da ordinare'); close(); return; }

            // Cattura le righe come oggetti {col: cellDataClone}
            const rowObjs = [];
            for (let r = dataStart; r <= r2; r++) {
                const obj = { _keys: {} };
                for (let c = c1; c <= c2; c++) {
                    const ref = ss.numberToColumn(c) + (r + 1);
                    obj[c] = ss.data[ref] ? JSON.parse(JSON.stringify(ss.data[ref])) : null;
                    obj._keys[c] = ss.getCellValue(ref);
                }
                rowObjs.push(obj);
            }
            // Ordinamento stabile multi-livello
            const cmp = (x, y) => {
                for (const lv of levels) {
                    const vx = x._keys[lv.col] ?? '', vy = y._keys[lv.col] ?? '';
                    const nx = ss.isNumber(vx), ny = ss.isNumber(vy);
                    let res;
                    if (nx && ny) res = parseFloat(vx) - parseFloat(vy);
                    else res = String(vx).localeCompare(String(vy), 'it', { numeric: true, sensitivity: 'base' });
                    if (res !== 0) return lv.dir === 'asc' ? res : -res;
                }
                return 0;
            };
            rowObjs.sort(cmp);
            // Riscrive le righe ordinate nelle posizioni del range
            rowObjs.forEach((obj, i) => {
                const r = dataStart + i;
                for (let c = c1; c <= c2; c++) {
                    const ref = ss.numberToColumn(c) + (r + 1);
                    if (obj[c]) ss.data[ref] = obj[c]; else delete ss.data[ref];
                    ss.updateCellDisplay(ref);
                }
            });
            ss.recalculate();
            ss.setModified(true);
            if (ss.saveState) ss.saveState();
            ss.updateStatus(`Ordinamento applicato (${levels.length} liv.) su ${rowObjs.length} righe`);
            close();
        };
    }

    // Converte "A1:C10" o "A1" in {r1,r2,c1,c2} 0-indexed. Restituisce null se invalido.
    _parseRange(str) {
        if (!str) return null;
        const parts = str.trim().toUpperCase().split(':');
        const a = this.spreadsheet.getCellCoordinates(parts[0]);
        if (!a) return null;
        const b = parts[1] ? this.spreadsheet.getCellCoordinates(parts[1]) : a;
        if (!b) return null;
        return { r1: Math.min(a.row, b.row), r2: Math.max(a.row, b.row), c1: Math.min(a.col, b.col), c2: Math.max(a.col, b.col) };
    }

    // Verifica un valore cella contro un criterio testuale (>, <, >=, <=, <>, = o uguaglianza)
    _matchCriterion(cellValue, criterion) {
        const cv = String(cellValue ?? '').trim();
        const cr = String(criterion ?? '').trim();
        if (cr === '') return true;
        const m = cr.match(/^(>=|<=|<>|>|<|=)\s*(.*)$/);
        if (m) {
            const op = m[1], rhs = m[2].trim();
            const nx = parseFloat(cv), ny = parseFloat(rhs);
            const bothNum = !isNaN(nx) && !isNaN(ny);
            switch (op) {
                case '>':  return bothNum ? nx >  ny : cv >  rhs;
                case '<':  return bothNum ? nx <  ny : cv <  rhs;
                case '>=': return bothNum ? nx >= ny : cv >= rhs;
                case '<=': return bothNum ? nx <= ny : cv <= rhs;
                case '<>': return cv.toLowerCase() !== rhs.toLowerCase();
                case '=':  return cv.toLowerCase() === rhs.toLowerCase();
            }
        }
        return cv.toLowerCase() === cr.toLowerCase();
    }

    _clearAdvFilter() {
        const ss = this.spreadsheet;
        if (!ss._advFilter) return;
        const f = ss._advFilter;
        (f.hiddenRows || []).forEach(r => {
            if (f.origHeights[r] === undefined) delete ss.rowHeights[r]; else ss.rowHeights[r] = f.origHeights[r];
            document.querySelectorAll(`.cell[data-row="${r}"], #row-headers .row-header[data-row="${r}"]`).forEach(el => el.style.display = '');
        });
        ss._advFilter = null;
        ss._updateLayout();
    }

    showAdvancedFilter() {
        const ss = this.spreadsheet;
        const defRange = (ss.selectedRange && ss.selectedRange.start !== ss.selectedRange.end)
            ? `${ss.selectedRange.start}:${ss.selectedRange.end}` : (ss.selectedCell || 'A1');
        const overlay = document.createElement('div');
        overlay.id = 'advfilter-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:380px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Filtro avanzato</h3>
                <button id="af-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:flex;align-items:center;margin-bottom:8px;cursor:pointer;"><input type="radio" name="af-action" value="filter" checked style="margin-right:8px;"> Filtra l'elenco sul posto</label>
                <label style="display:flex;align-items:center;cursor:pointer;"><input type="radio" name="af-action" value="copy" style="margin-right:8px;"> Copia in un'altra posizione</label>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;font-size:13px;">Intervallo elenco (con intestazioni):</label>
                <input type="text" id="af-range" value="${defRange}" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;font-size:13px;">Intervallo criteri (intestazione + valori):</label>
                <input type="text" id="af-criteria" placeholder="es. E1:E2" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
            </div>
            <div id="af-copyto-wrap" style="margin-bottom:12px;display:none;">
                <label style="display:block;margin-bottom:4px;font-size:13px;">Copia in:</label>
                <input type="text" id="af-copyto" placeholder="es. H1" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
            </div>
            <label style="display:flex;align-items:center;margin-bottom:16px;cursor:pointer;"><input type="checkbox" id="af-unique" style="margin-right:8px;"> Solo record univoci</label>
            <div style="text-align:right;">
                <button id="af-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="af-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('#af-close').onclick = close;
        overlay.querySelector('#af-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        const copyWrap = overlay.querySelector('#af-copyto-wrap');
        overlay.querySelectorAll('input[name="af-action"]').forEach(r => r.onchange = () => {
            copyWrap.style.display = overlay.querySelector('input[name="af-action"]:checked').value === 'copy' ? 'block' : 'none';
        });

        overlay.querySelector('#af-ok').onclick = () => {
            const list = this._parseRange(overlay.querySelector('#af-range').value);
            if (!list || list.r1 === list.r2) { ss.updateStatus('Intervallo elenco non valido (servono intestazioni + dati)'); return; }
            const crit = this._parseRange(overlay.querySelector('#af-criteria').value);
            const unique = overlay.querySelector('#af-unique').checked;
            const action = overlay.querySelector('input[name="af-action"]:checked').value;

            // Intestazioni dell'elenco: mappa nome -> indice colonna
            const headers = {};
            for (let c = list.c1; c <= list.c2; c++) headers[String(ss.getCellValue(ss.numberToColumn(c) + (list.r1 + 1))).trim().toLowerCase()] = c;

            // Costruisce i criteri: per ogni riga criterio, lista di {col, expr} (AND); righe in OR
            let critRows = [];
            if (crit) {
                const critCols = [];
                for (let c = crit.c1; c <= crit.c2; c++) {
                    const name = String(ss.getCellValue(ss.numberToColumn(c) + (crit.r1 + 1))).trim().toLowerCase();
                    if (name in headers) critCols.push({ critCol: c, listCol: headers[name] });
                }
                for (let r = crit.r1 + 1; r <= crit.r2; r++) {
                    const conds = [];
                    critCols.forEach(cc => {
                        const expr = ss.getCellValue(ss.numberToColumn(cc.critCol) + (r + 1));
                        if (String(expr).trim() !== '') conds.push({ col: cc.listCol, expr });
                    });
                    if (conds.length) critRows.push(conds);
                }
            }

            const rowMatches = (r) => {
                if (critRows.length === 0) return true;
                return critRows.some(conds => conds.every(cd => this._matchCriterion(ss.getCellValue(ss.numberToColumn(cd.col) + (r + 1)), cd.expr)));
            };
            const rowSignature = (r) => {
                const vals = [];
                for (let c = list.c1; c <= list.c2; c++) vals.push(String(ss.getCellValue(ss.numberToColumn(c) + (r + 1))));
                return vals.join('');
            };

            // Calcola le righe dati che passano
            const seen = new Set();
            const matched = [];
            for (let r = list.r1 + 1; r <= list.r2; r++) {
                if (!rowMatches(r)) continue;
                if (unique) { const sig = rowSignature(r); if (seen.has(sig)) continue; seen.add(sig); }
                matched.push(r);
            }

            if (action === 'copy') {
                const dest = ss.getCellCoordinates((overlay.querySelector('#af-copyto').value || '').trim());
                if (!dest) { ss.updateStatus('Cella di destinazione non valida'); return; }
                let outRow = dest.row;
                // intestazioni
                for (let c = list.c1; c <= list.c2; c++) {
                    ss.setCellValue(ss.numberToColumn(dest.col + (c - list.c1)) + (outRow + 1), ss.getCellValue(ss.numberToColumn(c) + (list.r1 + 1)));
                }
                outRow++;
                matched.forEach(r => {
                    for (let c = list.c1; c <= list.c2; c++) {
                        ss.setCellValue(ss.numberToColumn(dest.col + (c - list.c1)) + (outRow + 1), ss.getCellValue(ss.numberToColumn(c) + (r + 1)));
                    }
                    outRow++;
                });
                ss.recalculate(); ss.setModified(true); if (ss.saveState) ss.saveState();
                ss.updateStatus(`Filtro avanzato: ${matched.length} record copiati`);
            } else {
                // Filtra sul posto: comprime (altezza 0 + display none) le righe NON corrispondenti
                this._clearAdvFilter();
                const matchedSet = new Set(matched);
                const hiddenRows = [], origHeights = {};
                for (let r = list.r1 + 1; r <= list.r2; r++) {
                    if (!matchedSet.has(r)) {
                        origHeights[r] = ss.rowHeights[r];
                        ss.rowHeights[r] = 0;
                        hiddenRows.push(r);
                        document.querySelectorAll(`.cell[data-row="${r}"], #row-headers .row-header[data-row="${r}"]`).forEach(el => el.style.display = 'none');
                    }
                }
                ss._advFilter = { hiddenRows, origHeights };
                ss._updateLayout();
                ss.setModified(true);
                ss.updateStatus(`Filtro avanzato: ${matched.length} righe visibili, ${hiddenRows.length} nascoste`);
            }
            close();
        };
    }

    showDataValidation() {
        const overlay = document.createElement('div');
        overlay.id = 'validation-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:380px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Convalida dati</h3>
                <button id="dv-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;font-size:13px;">Consenti:</label>
                <select id="dv-type" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;">
                    <option value="any">Qualsiasi valore</option>
                    <option value="whole">Numero intero</option>
                    <option value="decimal">Decimale</option>
                    <option value="list">Elenco</option>
                    <option value="date">Data</option>
                    <option value="time">Ora</option>
                    <option value="textLength">Lunghezza testo</option>
                </select>
            </div>
            <div id="dv-criteria" style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;font-size:13px;">Dati:</label>
                <select id="dv-operator" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;margin-bottom:8px;">
                    <option value="between">Tra</option>
                    <option value="notBetween">Non tra</option>
                    <option value="equal">Uguale a</option>
                    <option value="notEqual">Diverso da</option>
                    <option value="greaterThan">Maggiore di</option>
                    <option value="lessThan">Minore di</option>
                </select>
                <input type="text" id="dv-min" placeholder="Minimo" style="width:48%;padding:6px;border:1px solid #ccc;border-radius:4px;">
                <input type="text" id="dv-max" placeholder="Massimo" style="width:48%;padding:6px;border:1px solid #ccc;border-radius:4px;margin-left:2%;">
            </div>
            <label style="display:flex;align-items:center;margin-bottom:16px;cursor:pointer;"><input type="checkbox" id="dv-ignore" checked style="margin-right:8px;"> Ignora celle vuote</label>
            <div style="text-align:right;">
                <button id="dv-clear" style="padding:6px 16px;margin-right:auto;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Cancella tutto</button>
                <button id="dv-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="dv-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('#dv-close').onclick = close;
        overlay.querySelector('#dv-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('#dv-clear').onclick = () => {
            const cellRef = this.spreadsheet.selectedCell;
            if (this.spreadsheet.data[cellRef]) {
                delete this.spreadsheet.data[cellRef].validation;
            }
            this.spreadsheet.updateStatus('Convalida dati rimossa');
            close();
        };
        overlay.querySelector('#dv-ok').onclick = () => {
            const cellRef = this.spreadsheet.selectedCell;
            if (!this.spreadsheet.data[cellRef]) {
                this.spreadsheet.data[cellRef] = this.functions.createCellData();
            }
            this.spreadsheet.data[cellRef].validation = {
                type: overlay.querySelector('#dv-type').value,
                operator: overlay.querySelector('#dv-operator').value,
                min: overlay.querySelector('#dv-min').value,
                max: overlay.querySelector('#dv-max').value
            };
            this.spreadsheet.updateStatus('Convalida dati impostata');
            close();
        };
    }

    groupData() {
        const ss = this.spreadsheet;
        const a = ss.getCellCoordinates(ss.selectedRange?.start || ss.selectedCell || 'A1');
        const b = ss.getCellCoordinates(ss.selectedRange?.end || ss.selectedCell || 'A1');
        const overlay = document.createElement('div');
        overlay.id = 'group-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        // Pre-seleziona righe/colonne in base alla forma della selezione
        const spanRows = Math.abs((a?.row ?? 0) - (b?.row ?? 0));
        const spanCols = Math.abs((a?.col ?? 0) - (b?.col ?? 0));
        const defCols = spanCols > spanRows;
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Raggruppa</h3>
                <button id="grp-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:16px;">
                <label style="display:flex;align-items:center;margin-bottom:8px;cursor:pointer;"><input type="radio" name="grp-dir" value="rows" ${defCols ? '' : 'checked'} style="margin-right:8px;"> Righe</label>
                <label style="display:flex;align-items:center;cursor:pointer;"><input type="radio" name="grp-dir" value="cols" ${defCols ? 'checked' : ''} style="margin-right:8px;"> Colonne</label>
            </div>
            <div style="text-align:right;">
                <button id="grp-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="grp-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('#grp-close').onclick = close;
        overlay.querySelector('#grp-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('#grp-ok').onclick = () => {
            const dir = overlay.querySelector('input[name="grp-dir"]:checked').value;
            const type = dir === 'cols' ? 'cols' : 'rows';
            const start = type === 'rows' ? Math.min(a.row, b.row) : Math.min(a.col, b.col);
            const end = type === 'rows' ? Math.max(a.row, b.row) : Math.max(a.col, b.col);
            if (start === end) { ss.updateStatus('Seleziona più di una ' + (type === 'rows' ? 'riga' : 'colonna') + ' da raggruppare'); close(); return; }
            this._createOutlineGroup(type, start, end);
            close();
        };
    }

    // ===== Outline (raggruppamento righe/colonne) =====
    _outline() {
        if (!this.spreadsheet._outlineGroups) this.spreadsheet._outlineGroups = { rows: [], cols: [] };
        return this.spreadsheet._outlineGroups;
    }

    _createOutlineGroup(type, start, end) {
        const groups = this._outline()[type];
        // Evita duplicati esatti
        if (groups.some(g => g.start === start && g.end === end)) {
            this.spreadsheet.updateStatus('Gruppo già esistente');
            return;
        }
        const group = { start, end, collapsed: false, toggleEl: null };
        groups.push(group);
        this._renderOutlineToggle(type, group);
        this.spreadsheet.setModified(true);
        this.spreadsheet.updateStatus(`${type === 'rows' ? 'Righe' : 'Colonne'} ${start + 1}-${end + 1} raggruppate`);
    }

    _renderOutlineToggle(type, group) {
        const ss = this.spreadsheet;
        // La riga/colonna di riepilogo è subito DOPO il gruppo (convenzione "riepilogo sotto/destra");
        // se il gruppo finisce al bordo, si usa quella PRIMA.
        const maxIdx = type === 'rows' ? ss.rows - 1 : ss.cols - 1;
        const summary = (group.end + 1 <= maxIdx) ? group.end + 1 : group.start - 1;
        group.summary = summary;
        if (summary < 0) return;
        const headerSel = type === 'rows' ? `#row-headers .row-header[data-row="${summary}"]` : `#column-headers .col-header[data-col="${summary}"]`;
        const header = document.querySelector(headerSel);
        if (!header) return;
        const btn = document.createElement('div');
        btn.className = 'outline-toggle';
        btn.textContent = group.collapsed ? '+' : '−';
        btn.title = group.collapsed ? 'Espandi gruppo' : 'Comprimi gruppo';
        btn.style.cssText = 'position:absolute;top:1px;left:1px;width:14px;height:14px;line-height:12px;text-align:center;font-size:12px;border:1px solid #888;background:#fff;color:#217346;cursor:pointer;z-index:6;border-radius:2px;font-weight:bold;';
        btn.onclick = (e) => { e.stopPropagation(); this._toggleOutlineGroup(type, group); };
        header.style.position = 'relative';
        header.appendChild(btn);
        group.toggleEl = btn;
    }

    _toggleOutlineGroup(type, group) {
        const ss = this.spreadsheet;
        group.collapsed = !group.collapsed;
        const dimMap = type === 'rows' ? ss.rowHeights : ss.columnWidths;
        if (!group._orig) group._orig = {};
        for (let i = group.start; i <= group.end; i++) {
            if (group.collapsed) {
                if (!(i in group._orig)) group._orig[i] = dimMap[i];
                dimMap[i] = 0;
            } else {
                if (group._orig[i] === undefined) delete dimMap[i]; else dimMap[i] = group._orig[i];
            }
            const sel = type === 'rows' ? `.cell[data-row="${i}"], #row-headers .row-header[data-row="${i}"]`
                                        : `.cell[data-col="${i}"], #column-headers .col-header[data-col="${i}"]`;
            document.querySelectorAll(sel).forEach(el => el.style.display = group.collapsed ? 'none' : '');
        }
        if (!group.collapsed) group._orig = {};
        if (group.toggleEl) { group.toggleEl.textContent = group.collapsed ? '+' : '−'; group.toggleEl.title = group.collapsed ? 'Espandi gruppo' : 'Comprimi gruppo'; }
        ss._updateLayout();
        ss.updateStatus(`Gruppo ${group.collapsed ? 'compresso' : 'espanso'}`);
    }

    ungroupData() {
        const ss = this.spreadsheet;
        const a = ss.getCellCoordinates(ss.selectedRange?.start || ss.selectedCell || 'A1');
        const b = ss.getCellCoordinates(ss.selectedRange?.end || ss.selectedCell || 'A1');
        const overlay = document.createElement('div');
        overlay.id = 'ungroup-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        const spanRows = Math.abs((a?.row ?? 0) - (b?.row ?? 0));
        const spanCols = Math.abs((a?.col ?? 0) - (b?.col ?? 0));
        const defCols = spanCols > spanRows;
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Separa</h3>
                <button id="ugrp-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:16px;">
                <label style="display:flex;align-items:center;margin-bottom:8px;cursor:pointer;"><input type="radio" name="ugrp-dir" value="rows" ${defCols ? '' : 'checked'} style="margin-right:8px;"> Righe</label>
                <label style="display:flex;align-items:center;cursor:pointer;"><input type="radio" name="ugrp-dir" value="cols" ${defCols ? 'checked' : ''} style="margin-right:8px;"> Colonne</label>
            </div>
            <div style="text-align:right;">
                <button id="ugrp-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="ugrp-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('#ugrp-close').onclick = close;
        overlay.querySelector('#ugrp-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('#ugrp-ok').onclick = () => {
            const dir = overlay.querySelector('input[name="ugrp-dir"]:checked').value;
            const type = dir === 'cols' ? 'cols' : 'rows';
            const lo = type === 'rows' ? Math.min(a.row, b.row) : Math.min(a.col, b.col);
            const hi = type === 'rows' ? Math.max(a.row, b.row) : Math.max(a.col, b.col);
            const groups = this._outline()[type];
            // Trova i gruppi che intersecano la selezione
            const toRemove = groups.filter(g => g.start <= hi && g.end >= lo);
            if (toRemove.length === 0) { ss.updateStatus('Nessun gruppo nella selezione'); close(); return; }
            toRemove.forEach(g => {
                if (g.collapsed) this._toggleOutlineGroup(type, g); // espandi prima di rimuovere
                if (g.toggleEl) g.toggleEl.remove();
                const idx = groups.indexOf(g);
                if (idx >= 0) groups.splice(idx, 1);
            });
            ss.setModified(true);
            ss.updateStatus(`${toRemove.length} gruppo/i rimosso/i`);
            close();
        };
    }

    showSubtotalDialog() {
        const ss = this.spreadsheet;
        const a = ss.getCellCoordinates(ss.selectedRange?.start || ss.selectedCell || 'A1');
        const b = ss.getCellCoordinates(ss.selectedRange?.end || ss.selectedCell || 'A1');
        if (!a || !b) { ss.updateStatus('Selezione non valida'); return; }
        const r1 = Math.min(a.row, b.row), r2 = Math.max(a.row, b.row);
        const c1 = Math.min(a.col, b.col), c2 = Math.max(a.col, b.col);
        if (r1 === r2 || c1 === c2) { ss.updateStatus('Seleziona un intervallo con intestazioni e almeno due colonne'); return; }

        const colOpts = () => {
            let html = '';
            for (let c = c1; c <= c2; c++) {
                const letter = ss.numberToColumn(c);
                const h = ss.getCellValue(letter + (r1 + 1)) || `Colonna ${letter}`;
                html += `<option value="${c}">${h}</option>`;
            }
            return html;
        };

        const overlay = document.createElement('div');
        overlay.id = 'subtotal-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Subtotali</h3>
                <button id="sub-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;font-size:13px;">Ad ogni cambiamento in:</label>
                <select id="sub-column" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;">${colOpts()}</select>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;font-size:13px;">Usa funzione:</label>
                <select id="sub-func" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;">
                    <option value="SUM">Somma</option>
                    <option value="COUNT">Conteggio</option>
                    <option value="AVERAGE">Media</option>
                    <option value="MAX">Max</option>
                    <option value="MIN">Min</option>
                </select>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;font-size:13px;">Aggiungi subtotale a:</label>
                <select id="sub-value" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;">${colOpts()}</select>
            </div>
            <div style="text-align:right;">
                <button id="sub-remove" style="padding:6px 16px;margin-right:auto;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Rimuovi tutti</button>
                <button id="sub-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="sub-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        // Pre-seleziona la seconda colonna come colonna valore
        if (c2 > c1) overlay.querySelector('#sub-value').value = String(c1 + 1);
        const close = () => overlay.remove();
        overlay.querySelector('#sub-close').onclick = close;
        overlay.querySelector('#sub-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('#sub-remove').onclick = () => { this._removeSubtotals(); close(); };
        overlay.querySelector('#sub-ok').onclick = () => {
            const groupCol = parseInt(overlay.querySelector('#sub-column').value);
            const valueCol = parseInt(overlay.querySelector('#sub-value').value);
            const func = overlay.querySelector('#sub-func').value;
            this._applySubtotals({ r1, r2, c1, c2, groupCol, valueCol, func });
            close();
        };
    }

    _aggregate(func, nums) {
        if (nums.length === 0) return 0;
        switch (func) {
            case 'COUNT': return nums.length;
            case 'AVERAGE': return nums.reduce((a, b) => a + b, 0) / nums.length;
            case 'MAX': return Math.max(...nums);
            case 'MIN': return Math.min(...nums);
            default: return nums.reduce((a, b) => a + b, 0);
        }
    }

    _applySubtotals({ r1, r2, c1, c2, groupCol, valueCol, func }) {
        const ss = this.spreadsheet;
        const clone = (o) => o ? JSON.parse(JSON.stringify(o)) : null;
        const colLetter = (c) => ss.numberToColumn(c);
        // Cattura le righe dati (tutte le colonne) e ordina per colonna gruppo per renderle contigue
        const dataRows = [];
        for (let r = r1 + 1; r <= r2; r++) {
            const cells = {};
            for (let c = 0; c < ss.cols; c++) {
                const ref = colLetter(c) + (r + 1);
                if (ss.data[ref]) cells[c] = clone(ss.data[ref]);
            }
            dataRows.push({ cells, groupVal: String(ss.getCellValue(colLetter(groupCol) + (r + 1))), valNum: parseFloat(ss.getCellValue(colLetter(valueCol) + (r + 1))) });
        }
        dataRows.sort((x, y) => x.groupVal.localeCompare(y.groupVal, 'it', { numeric: true }));

        const funcLabel = { SUM: 'Somma', COUNT: 'Conteggio', AVERAGE: 'Media', MAX: 'Max', MIN: 'Min' }[func] || func;
        const mkSubtotalRow = (label, value) => {
            const cells = {};
            const lblData = this.functions.createCellData(); lblData.value = label; lblData.computedValue = label;
            lblData.format = lblData.format || {}; lblData.format.bold = true; lblData._subtotal = true;
            const valData = this.functions.createCellData(); const v = Math.round(value * 1e6) / 1e6;
            valData.value = String(v); valData.computedValue = String(v);
            valData.format = valData.format || {}; valData.format.bold = true; valData._subtotal = true;
            cells[groupCol] = lblData; cells[valueCol] = valData;
            return { cells, _subtotal: true };
        };

        // Costruisce la sequenza di output con righe subtotale a ogni cambio gruppo
        const output = [];
        const allNums = [];
        let i = 0;
        while (i < dataRows.length) {
            const g = dataRows[i].groupVal;
            const groupNums = [];
            while (i < dataRows.length && dataRows[i].groupVal === g) {
                output.push(dataRows[i]);
                if (!isNaN(dataRows[i].valNum)) { groupNums.push(dataRows[i].valNum); allNums.push(dataRows[i].valNum); }
                i++;
            }
            output.push(mkSubtotalRow(`${g} ${funcLabel}`, this._aggregate(func, groupNums)));
        }
        // Totale generale
        output.push(mkSubtotalRow('Totale generale', this._aggregate(func, allNums)));

        const delta = output.length - dataRows.length;
        // Ricostruisce ss.data: righe <= r1 invariate; output a partire da r1+1; righe > r2 spostate di delta
        const newData = {};
        for (const ref in ss.data) {
            const c = ss.getCellCoordinates(ref);
            if (c.row <= r1) newData[ref] = ss.data[ref];
            else if (c.row > r2) newData[colLetter(c.col) + (c.row + delta + 1)] = ss.data[ref];
            // le righe r1+1..r2 vengono riscritte da output
        }
        output.forEach((row, idx) => {
            const R = r1 + 1 + idx;
            for (const c in row.cells) newData[colLetter(parseInt(c)) + (R + 1)] = row.cells[c];
        });
        ss.data = newData;
        if (delta > 0) ss.rows += delta;
        ss.createHeaders();
        ss.createGrid();
        ss.recalculate();
        ss.selectCell(ss.selectedCell || 'A1');
        ss.setModified(true);
        if (ss.saveState) ss.saveState();
        ss.updateStatus(`Subtotali (${funcLabel}) applicati: ${output.length - dataRows.length} righe di riepilogo`);
    }

    _removeSubtotals() {
        const ss = this.spreadsheet;
        // Trova le righe che contengono celle marcate come subtotale
        const subRows = new Set();
        for (const ref in ss.data) {
            if (ss.data[ref] && ss.data[ref]._subtotal) subRows.add(ss.getCellCoordinates(ref).row);
        }
        if (subRows.size === 0) { ss.updateStatus('Nessun subtotale da rimuovere'); return; }
        const sorted = [...subRows].sort((a, b) => a - b);
        // Ricostruisce i dati saltando le righe subtotale e compattando verso l'alto
        const colLetter = (c) => ss.numberToColumn(c);
        const newData = {};
        for (const ref in ss.data) {
            const c = ss.getCellCoordinates(ref);
            if (subRows.has(c.row)) continue;
            const shift = sorted.filter(sr => sr < c.row).length;
            newData[colLetter(c.col) + (c.row - shift + 1)] = ss.data[ref];
        }
        ss.data = newData;
        ss.rows = Math.max(1, ss.rows - subRows.size);
        ss.createHeaders();
        ss.createGrid();
        ss.recalculate();
        ss.setModified(true);
        if (ss.saveState) ss.saveState();
        ss.updateStatus(`${subRows.size} righe di subtotale rimosse`);
    }

    deleteComment() {
        const cellRef = this.spreadsheet.selectedCell;
        if (this.spreadsheet.data[cellRef]?.comments) {
            delete this.spreadsheet.data[cellRef].comments;
            const indicator = document.querySelector(`[data-cell="${cellRef}"] .comment-indicator`);
            if (indicator) indicator.remove();
            this.spreadsheet.setModified(true);
            this.spreadsheet.updateStatus('Commento eliminato');
        }
    }

    // ===== DATA TAB: Import dialogs =====
    showImportDialog(type) {
        const titles = { database: 'Importa da Database', web: 'Importa da Web', query: 'Importa da Query' };
        const _s = this.spreadsheet;
        let bodyHtml = '';
        if (type === 'database') {
            bodyHtml = `
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;font-size:13px;">Tipo connessione:</label>
                    <select id="imp-db-type" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;">
                        <option value="json">JSON (URL)</option><option value="csv">CSV (URL)</option><option value="paste">Incolla dati</option>
                    </select>
                </div>
                <div id="imp-db-fields">
                    <div style="margin-bottom:12px;">
                        <label style="display:block;margin-bottom:4px;font-size:13px;">URL o dati:</label>
                        <textarea id="imp-db-data" rows="6" placeholder="Incolla JSON, CSV o inserisci URL..." style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;font-family:monospace;font-size:12px;resize:vertical;"></textarea>
                    </div>
                </div>`;
        } else if (type === 'web') {
            bodyHtml = `
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;font-size:13px;">URL pagina web:</label>
                    <input type="url" id="imp-web-url" placeholder="https://..." style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;font-size:13px;">Formato dati atteso:</label>
                    <select id="imp-web-format" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;">
                        <option value="json">JSON</option><option value="csv">CSV/Testo</option><option value="html">Tabella HTML</option>
                    </select>
                </div>
                <div style="padding:8px;background:#fff8e1;border-radius:4px;font-size:12px;">⚠️ Per motivi di sicurezza (CORS), l'importazione diretta potrebbe non funzionare per tutti gli URL. In alternativa usa "Incolla dati".</div>`;
        } else {
            bodyHtml = `
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;font-size:13px;">Query (formula di ricerca):</label>
                    <textarea id="imp-query" rows="4" placeholder="Inserisci una query di ricerca dati o formula..." style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;font-family:monospace;font-size:12px;"></textarea>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;font-size:13px;">Oppure incolla dati tabulari:</label>
                    <textarea id="imp-query-data" rows="4" placeholder="Col1\\tCol2\\tCol3\\nVal1\\tVal2\\tVal3" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;font-family:monospace;font-size:12px;"></textarea>
                </div>`;
        }
        const overlay = document.createElement('div');
        overlay.id = 'import-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:420px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">${titles[type]}</h3>
                <button class="imp-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            ${bodyHtml}
            <div style="text-align:right;margin-top:12px;">
                <button class="imp-close" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="imp-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Importa</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelectorAll('.imp-close').forEach(b => b.onclick = () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelector('#imp-ok').onclick = () => {
            let dataText = '';
            if (type === 'database') dataText = overlay.querySelector('#imp-db-data')?.value || '';
            else if (type === 'web') dataText = overlay.querySelector('#imp-web-url')?.value || '';
            else dataText = overlay.querySelector('#imp-query-data')?.value || overlay.querySelector('#imp-query')?.value || '';

            if (!dataText.trim()) { _s.updateStatus('Nessun dato fornito'); return; }
            // Prova a parsare come JSON
            try {
                const json = JSON.parse(dataText);
                const arr = Array.isArray(json) ? json : [json];
                if (arr.length > 0) {
                    const keys = Object.keys(arr[0]);
                    const startCell = _s.selectedCell;
                    const col = startCell.replace(/\d+/g, '').charCodeAt(0) - 65;
                    const row = parseInt(startCell.replace(/[A-Z]+/g, ''));
                    // Intestazioni
                    keys.forEach((k, i) => _s.setCellValue(String.fromCharCode(65 + col + i) + row, k));
                    // Dati
                    arr.forEach((item, r) => {
                        keys.forEach((k, c) => _s.setCellValue(String.fromCharCode(65 + col + c) + (row + r + 1), String(item[k] ?? '')));
                    });
                    _s.updateStatus('Importati ' + arr.length + ' record JSON');
                }
            } catch(e) {
                // Se non è JSON, tratta come testo tabulare/CSV
                const lines = dataText.split('\n').filter(l => l.trim());
                const startCell = _s.selectedCell;
                const col = startCell.replace(/\d+/g, '').charCodeAt(0) - 65;
                const row = parseInt(startCell.replace(/[A-Z]+/g, ''));
                lines.forEach((line, r) => {
                    const cols = line.split(/[\t,;]/);
                    cols.forEach((val, c) => {
                        if (val.trim()) _s.setCellValue(String.fromCharCode(65 + col + c) + (row + r), val.trim().replace(/^["']|["']$/g, ''));
                    });
                });
                _s.updateStatus('Importate ' + lines.length + ' righe di dati');
            }
            overlay.remove();
        };
    }

    showConnectionPropertiesDialog() {
        const overlay = document.createElement('div');
        overlay.id = 'connprop-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:380px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Proprietà connessione dati</h3>
                <button onclick="this.closest('#connprop-modal').remove()" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:12px;">
                <label style="font-size:13px;font-weight:bold;">Nome connessione:</label>
                <input type="text" id="conn-name" value="Connessione1" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;margin-top:4px;">
            </div>
            <div style="margin-bottom:12px;">
                <label style="font-size:13px;font-weight:bold;">Aggiornamento:</label>
                <label style="display:flex;align-items:center;margin-top:6px;cursor:pointer;"><input type="checkbox" id="conn-auto" style="margin-right:8px;"> Aggiorna ogni <input type="number" id="conn-interval" value="60" min="1" style="width:60px;padding:4px;border:1px solid #ccc;border-radius:4px;margin:0 4px;"> minuti</label>
                <label style="display:flex;align-items:center;margin-top:4px;cursor:pointer;"><input type="checkbox" id="conn-open" checked style="margin-right:8px;"> Aggiorna all'apertura del file</label>
            </div>
            <div style="text-align:right;">
                <button onclick="this.closest('#connprop-modal').remove()" style="padding:6px 16px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;margin-right:8px;">Annulla</button>
                <button onclick="window.spreadsheet.updateStatus('Proprietà connessione salvate');this.closest('#connprop-modal').remove()" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    showEditLinksDialog() {
        const overlay = document.createElement('div');
        overlay.id = 'editlinks-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:400px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Modifica collegamenti</h3>
                <button onclick="this.closest('#editlinks-modal').remove()" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="min-height:100px;border:1px solid #ddd;border-radius:4px;padding:16px;text-align:center;color:#999;margin-bottom:12px;">
                <div style="font-size:32px;margin-bottom:8px;">🔗</div>
                Nessun collegamento esterno trovato nel foglio corrente.<br><br>
                <span style="font-size:12px;">I collegamenti vengono creati quando si fa riferimento a celle in altri file o fogli di lavoro esterni.</span>
            </div>
            <div style="text-align:right;">
                <button onclick="this.closest('#editlinks-modal').remove()" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Chiudi</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    // ===== DATA TAB: What-If / Forecast =====
    showWhatIfDialog() {
        const _s = this.spreadsheet;
        const overlay = document.createElement('div');
        overlay.id = 'whatif-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:400px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Analisi di simulazione</h3>
                <button class="wif-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:block;margin-bottom:4px;font-size:13px;font-weight:bold;">Tipo analisi:</label>
                <select id="wif-type" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;">
                    <option value="goal">Ricerca obiettivo (Goal Seek)</option>
                    <option value="scenario">Gestione scenari</option>
                    <option value="table">Tabella dati</option>
                </select>
            </div>
            <div id="wif-body">
                <div style="margin-bottom:12px;">
                    <label style="font-size:13px;">Cella obiettivo (formula):</label>
                    <input type="text" id="wif-target" value="${_s.selectedCell}" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;margin-top:4px;">
                </div>
                <div style="margin-bottom:12px;">
                    <label style="font-size:13px;">Valore desiderato:</label>
                    <input type="number" id="wif-value" placeholder="0" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;margin-top:4px;">
                </div>
                <div style="margin-bottom:12px;">
                    <label style="font-size:13px;">Cella variabile (da modificare):</label>
                    <input type="text" id="wif-variable" placeholder="es. B1" style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;margin-top:4px;">
                </div>
            </div>
            <div style="text-align:right;">
                <button class="wif-close" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="wif-run" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Esegui</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelectorAll('.wif-close').forEach(b => b.onclick = () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelector('#wif-run').onclick = () => {
            const target = overlay.querySelector('#wif-target').value.trim().toUpperCase();
            const desired = parseFloat(overlay.querySelector('#wif-value').value);
            const variable = overlay.querySelector('#wif-variable').value.trim().toUpperCase();
            if (!target || isNaN(desired) || !variable) { _s.updateStatus('Compila tutti i campi'); return; }
            // Semplice Goal Seek con bisection
            let lo = -10000, hi = 10000, mid, result, iterations = 0;
            const origVal = _s.getCellValue(variable);
            for (let i = 0; i < 100; i++) {
                mid = (lo + hi) / 2;
                _s.setCellValue(variable, String(mid), true);
                _s.recalculate();
                result = parseFloat(_s.getCellValue(target));
                if (Math.abs(result - desired) < 0.001) break;
                if (result < desired) lo = mid; else hi = mid;
                iterations++;
            }
            _s.setCellValue(variable, String(Math.round(mid * 10000) / 10000));
            _s.recalculate();
            overlay.remove();
            _s.updateStatus(`Goal Seek: ${variable} = ${Math.round(mid * 10000) / 10000} (${iterations} iterazioni)`);
        };
    }

    showForecastDialog() {
        const _s = this.spreadsheet;
        const sel = this.functions.getSelectedCells();
        const numbers = sel.map(r => parseFloat(_s.getCellValue(r))).filter(n => !isNaN(n));
        if (numbers.length < 3) { _s.updateStatus('Seleziona almeno 3 celle numeriche per la previsione'); return; }

        // Regressione lineare semplice
        const n = numbers.length;
        const xVals = numbers.map((_, i) => i + 1);
        const sumX = xVals.reduce((a, b) => a + b, 0);
        const sumY = numbers.reduce((a, b) => a + b, 0);
        const sumXY = xVals.reduce((s, x, i) => s + x * numbers[i], 0);
        const sumX2 = xVals.reduce((s, x) => s + x * x, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const forecast = [];
        for (let i = 1; i <= 5; i++) {
            forecast.push(Math.round((slope * (n + i) + intercept) * 100) / 100);
        }

        const overlay = document.createElement('div');
        overlay.id = 'forecast-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const maxVal = Math.max(...numbers, ...forecast);
        const allVals = [...numbers, ...forecast];

        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:450px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">📈 Foglio previsione</h3>
                <button onclick="this.closest('#forecast-modal').remove()" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:12px;padding:10px;background:#f8f8f8;border-radius:4px;font-size:13px;">
                <b>Regressione lineare:</b> y = ${Math.round(slope * 100) / 100}x + ${Math.round(intercept * 100) / 100}<br>
                <b>Dati analizzati:</b> ${n} valori | <b>Trend:</b> ${slope > 0 ? '↗ Crescente' : slope < 0 ? '↘ Decrescente' : '→ Stabile'}
            </div>
            <div style="margin-bottom:12px;">
                <div style="font-size:13px;font-weight:bold;margin-bottom:6px;">Grafico trend:</div>
                <div style="display:flex;align-items:flex-end;height:100px;gap:2px;padding:4px;background:#fafafa;border-radius:4px;">
                    ${allVals.map((v, i) => {
                        const h = maxVal > 0 ? Math.max(4, (v / maxVal) * 90) : 4;
                        const isF = i >= numbers.length;
                        return `<div style="flex:1;height:${h}px;background:${isF ? '#ED7D31' : '#4472C4'};border-radius:2px 2px 0 0;position:relative;" title="${v}"><span style="position:absolute;top:-14px;left:50%;transform:translateX(-50%);font-size:9px;white-space:nowrap;">${v}</span></div>`;
                    }).join('')}
                </div>
                <div style="display:flex;gap:12px;margin-top:6px;font-size:11px;">
                    <span><span style="display:inline-block;width:10px;height:10px;background:#4472C4;border-radius:2px;"></span> Dati storici</span>
                    <span><span style="display:inline-block;width:10px;height:10px;background:#ED7D31;border-radius:2px;"></span> Previsione</span>
                </div>
            </div>
            <div style="margin-bottom:12px;">
                <div style="font-size:13px;font-weight:bold;margin-bottom:4px;">Valori previsti (prossimi 5 periodi):</div>
                <table style="width:100%;border-collapse:collapse;">
                    <tr style="background:#f0f0f0;"><th style="padding:4px 8px;text-align:left;border-bottom:1px solid #ddd;">Periodo</th><th style="padding:4px 8px;text-align:right;border-bottom:1px solid #ddd;">Valore</th></tr>
                    ${forecast.map((v, i) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;">${n + i + 1}</td><td style="padding:4px 8px;text-align:right;border-bottom:1px solid #eee;font-weight:bold;color:#ED7D31;">${v}</td></tr>`).join('')}
                </table>
            </div>
            <div style="text-align:right;">
                <button id="fc-insert" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Inserisci previsioni nel foglio</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelector('#fc-insert').onclick = () => {
            const lastCell = sel[sel.length - 1];
            const col = lastCell.replace(/\d+/g, '');
            const row = parseInt(lastCell.replace(/[A-Z]+/g, ''));
            forecast.forEach((v, i) => _s.setCellValue(col + (row + i + 1), String(v)));
            _s.updateStatus('Previsioni inserite');
            overlay.remove();
        };
    }

    // ===== REVIEW TAB: extra dialogs =====
    protectWorkbook() {
        const overlay = document.createElement('div');
        overlay.id = 'protectwb-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:350px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">🔒 Proteggi cartella di lavoro</h3>
                <button onclick="this.closest('#protectwb-modal').remove()" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:12px;">
                <label style="display:flex;align-items:center;margin-bottom:6px;cursor:pointer;"><input type="checkbox" id="pw-structure" checked style="margin-right:8px;"> Struttura (impedisci aggiunta/rimozione fogli)</label>
                <label style="display:flex;align-items:center;cursor:pointer;"><input type="checkbox" id="pw-windows" style="margin-right:8px;"> Finestre (impedisci ridimensionamento)</label>
            </div>
            <div style="margin-bottom:12px;">
                <label style="font-size:13px;">Password (opzionale):</label>
                <input type="password" id="pw-pass" placeholder="Password..." style="width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;margin-top:4px;">
            </div>
            <div style="text-align:right;">
                <button onclick="this.closest('#protectwb-modal').remove()" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button onclick="window._workbookProtected=true;window.spreadsheet.updateStatus('Cartella di lavoro protetta');this.closest('#protectwb-modal').remove()" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    showAllowEditRangesDialog() {
        if (!window._allowedRanges) window._allowedRanges = [];
        const overlay = document.createElement('div');
        overlay.id = 'allowranges-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:400px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Consenti modifica intervalli</h3>
                <button onclick="this.closest('#allowranges-modal').remove()" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div id="ar-list" style="min-height:80px;border:1px solid #ddd;border-radius:4px;padding:8px;margin-bottom:12px;">
                ${window._allowedRanges.length ? window._allowedRanges.map((r, i) => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;"><span>${r.name}: ${r.range}</span><button onclick="window._allowedRanges.splice(${i},1);this.parentNode.remove()" style="border:none;background:#ff4444;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;">✕</button></div>`).join('') : '<div style="text-align:center;color:#999;padding:12px;">Nessun intervallo definito</div>'}
            </div>
            <div style="display:flex;gap:8px;margin-bottom:12px;">
                <input type="text" id="ar-name" placeholder="Nome" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px;">
                <input type="text" id="ar-range" placeholder="Intervallo (es. A1:D10)" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px;">
                <button id="ar-add" style="padding:6px 12px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">+</button>
            </div>
            <div style="text-align:right;">
                <button onclick="this.closest('#allowranges-modal').remove()" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Chiudi</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('#ar-add').onclick = () => {
            const name = overlay.querySelector('#ar-name').value.trim();
            const range = overlay.querySelector('#ar-range').value.trim();
            if (name && range) {
                window._allowedRanges.push({ name, range });
                this.spreadsheet.updateStatus('Intervallo "' + name + '" aggiunto');
                overlay.remove();
                this.showAllowEditRangesDialog();
            }
        };
    }

    showThesaurus() {
        const cellRef = this.spreadsheet.selectedCell;
        const word = (this.spreadsheet.getCellValue(cellRef) || '').trim();
        if (!word) { this.spreadsheet.updateStatus('Seleziona una cella con testo'); return; }
        // Dizionario di sinonimi base per italiano
        const synonyms = {
            'grande': ['ampio','vasto','enorme','imponente','considerevole','maestoso'],
            'piccolo': ['minuscolo','esiguo','ridotto','minimo','microscopico','modesto'],
            'bello': ['attraente','affascinante','splendido','magnifico','grazioso','elegante'],
            'buono': ['ottimo','eccellente','valido','positivo','favorevole','pregevole'],
            'cattivo': ['pessimo','negativo','sfavorevole','inadeguato','scadente','mediocre'],
            'veloce': ['rapido','celere','spedito','fulmineo','sollecito','pronto'],
            'lento': ['tardivo','pigro','flemmatico','graduale','posato','calmo'],
            'fare': ['eseguire','compiere','realizzare','svolgere','effettuare','attuare'],
            'dire': ['affermare','dichiarare','sostenere','esprimere','comunicare','riferire'],
            'andare': ['recarsi','dirigersi','procedere','muoversi','spostarsi','viaggiare'],
            'importante': ['rilevante','significativo','fondamentale','cruciale','essenziale','notevole'],
            'nuovo': ['recente','moderno','fresco','innovativo','originale','inedito'],
            'vecchio': ['antico','datato','anziano','antiquato','obsoleto','vetusto'],
        };
        const lowerWord = word.toLowerCase();
        const found = synonyms[lowerWord] || [];
        const overlay = document.createElement('div');
        overlay.id = 'thesaurus-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:350px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">📖 Thesaurus</h3>
                <button onclick="this.closest('#thesaurus-modal').remove()" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="margin-bottom:12px;padding:8px;background:#f0f0f0;border-radius:4px;">
                <span style="font-size:13px;">Parola cercata:</span> <b style="font-size:16px;">${word}</b>
            </div>
            ${found.length > 0 ? `
                <div style="font-size:13px;font-weight:bold;margin-bottom:8px;">Sinonimi:</div>
                <div style="max-height:250px;overflow-y:auto;">
                    ${found.map(s => `<div class="syn-item" data-word="${s}" style="padding:8px 12px;cursor:pointer;border-radius:4px;border-bottom:1px solid #eee;font-size:14px;">${s}</div>`).join('')}
                </div>
            ` : `<div style="text-align:center;padding:20px;color:#999;">Nessun sinonimo trovato per "${word}".<br><span style="font-size:12px;">Il dizionario contiene: ${Object.keys(synonyms).join(', ')}</span></div>`}
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelectorAll('.syn-item').forEach(item => {
            item.onmouseenter = () => item.style.background = '#e8f5e9';
            item.onmouseleave = () => item.style.background = '';
            item.onclick = () => {
                this.spreadsheet.setCellValue(cellRef, item.dataset.word);
                this.spreadsheet.updateStatus('Sostituito con "' + item.dataset.word + '"');
                overlay.remove();
            };
        });
    }

    showAccessibilityCheck() {
        const issues = [];
        let cellCount = 0, emptyCells = 0, mergedCells = 0, noContrast = 0;
        for (const ref in this.spreadsheet.data) {
            const d = this.spreadsheet.data[ref];
            if (!d) continue;
            cellCount++;
            if (!d.value && !d.formula) emptyCells++;
            if (d.format?.backgroundColor && d.format?.fontColor) {
                // Verifica contrasto semplice
                const bg = d.format.backgroundColor; const fg = d.format.fontColor;
                if (bg === fg) { noContrast++; issues.push(`${ref}: stesso colore testo e sfondo (${bg})`); }
            }
        }
        if (issues.length === 0) issues.push('Nessun problema rilevato!');
        const overlay = document.createElement('div');
        overlay.id = 'access-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:400px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">♿ Controllo accessibilità</h3>
                <button onclick="this.closest('#access-modal').remove()" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
                <div style="padding:10px;background:#e8f5e9;border-radius:4px;text-align:center;"><div style="font-size:20px;font-weight:bold;">${cellCount}</div><div style="font-size:11px;">Celle con dati</div></div>
                <div style="padding:10px;background:${noContrast > 0 ? '#fce4ec' : '#e8f5e9'};border-radius:4px;text-align:center;"><div style="font-size:20px;font-weight:bold;">${noContrast}</div><div style="font-size:11px;">Problemi contrasto</div></div>
            </div>
            <div style="max-height:200px;overflow-y:auto;border:1px solid #eee;border-radius:4px;padding:8px;">
                ${issues.map(i => `<div style="padding:4px 0;border-bottom:1px solid #f0f0f0;font-size:13px;">${noContrast > 0 ? '⚠️' : '✅'} ${i}</div>`).join('')}
            </div>
            <div style="text-align:right;margin-top:12px;">
                <button onclick="this.closest('#access-modal').remove()" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Chiudi</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }
}

// Funzione di inizializzazione
function initExcelAdvanced(spreadsheet, excelFunctions) {
    return new ExcelAdvanced(spreadsheet, excelFunctions);
}
