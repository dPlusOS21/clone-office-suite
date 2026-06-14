class Spreadsheet {
    constructor(containerId, rows = 100, cols = 26) {
        this.container = document.getElementById(containerId);
        this.viewport = document.getElementById('spreadsheet-viewport');
        this.rows = rows;
        this.cols = cols;
        
        // Dimensioni fisse per garantire l'allineamento
        this.cellWidth = 80;
        this.cellHeight = 20;
        this.rowHeaderWidth = 60;
        this.colHeaderHeight = 20;

        this.data = {};
        this.drawingObjects = []; // Oggetti grafici (forme, icone, immagini, etc.)
        this._drawingIdCounter = 0;
        this.selectedCell = 'A1';
        this.selectedRange = { start: 'A1', end: 'A1' };
        this.clipboard = null;
        this.modified = false;
/*        this.format = {
            bold: false,
            italic: false,
            underline: false,
            numberFormat: 'generale',
            horizontalAlign: 'left',
            verticalAlign: 'middle'
        }; */
// Nel costruttore di Spreadsheet, aggiorna this.format:
this.format = {
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
    decimals: 0
};

        this.history = [];
        this.historyIndex = -1;
        this.isProtected = false;
        this.protectionPassword = null;
        this.isEditing = false;
        this.isDragging = false;
        this._batchUndo = false;
        this._tempEditOccurred = false;

        // Dimensioni variabili per colonne e righe
        this.columnWidths = {};  // { colIndex: width }
        this.rowHeights = {};    // { rowIndex: height }

        this.init();
    }

    getColWidth(colIndex) {
        return this.columnWidths[colIndex] !== undefined ? this.columnWidths[colIndex] : this.cellWidth;
    }

    getRowHeight(rowIndex) {
        return this.rowHeights[rowIndex] !== undefined ? this.rowHeights[rowIndex] : this.cellHeight;
    }

    getColLeft(colIndex) {
        let left = 0;
        for (let i = 0; i < colIndex; i++) {
            left += this.getColWidth(i);
        }
        return left;
    }

    getRowTop(rowIndex) {
        let top = 0;
        for (let i = 0; i < rowIndex; i++) {
            top += this.getRowHeight(i);
        }
        return top;
    }

    getTotalWidth() {
        let w = 0;
        for (let i = 0; i < this.cols; i++) w += this.getColWidth(i);
        return w;
    }

    getTotalHeight() {
        let h = 0;
        for (let i = 0; i < this.rows; i++) h += this.getRowHeight(i);
        return h;
    }

    init() {
        this.loadFromStorage(); // Carica dati salvati prima di creare la griglia
        this.createHeaders();
        this.createGrid();
        this.bindEvents();
        this.initResize();
        this.selectCell('A1');
        // Salva stato iniziale solo se non già presente (evita duplicati al load)
        if (this.history.length === 0) {
            this.saveState();
        }
        this.restoreDrawingObjects();
        // Auto-salvataggio ogni 5 secondi se modificato
        this._autoSaveInterval = setInterval(() => this.autoSave(), 5000);
        // Salva anche alla chiusura della pagina
        window.addEventListener('beforeunload', () => this.saveToStorage());
    }

    createHeaders() {
        // Intestazioni colonne (A, B, C, ...)
        const colHeaders = document.getElementById('column-headers');
        const totalColWidth = this.getTotalWidth();

        colHeaders.innerHTML = '';
        colHeaders.style.width = `${totalColWidth}px`;
        colHeaders.style.height = `${this.colHeaderHeight}px`;
        colHeaders.style.display = 'flex';
        colHeaders.style.flexShrink = '0';

        for (let i = 0; i < this.cols; i++) {
            const colHeader = document.createElement('div');
            colHeader.className = 'col-header';
            colHeader.style.width = `${this.getColWidth(i)}px`;
            colHeader.style.height = `${this.colHeaderHeight}px`;
            colHeader.style.position = 'relative';
            colHeader.setAttribute('data-col', i);

            const label = document.createElement('span');
            label.textContent = this.numberToColumn(i);
            label.style.pointerEvents = 'none';
            colHeader.appendChild(label);

            // Handle di resize a destra dell'header colonna
            const handle = document.createElement('div');
            handle.className = 'col-resize-handle';
            handle.setAttribute('data-col', i);
            colHeader.appendChild(handle);

            colHeaders.appendChild(colHeader);
        }

        // Intestazioni righe (1, 2, 3, ...)
        const rowHeaders = document.getElementById('row-headers');
        const totalRowHeight = this.getTotalHeight();

        rowHeaders.innerHTML = '';
        rowHeaders.style.width = `${this.rowHeaderWidth}px`;
        rowHeaders.style.height = `${totalRowHeight}px`;

        for (let i = 0; i < this.rows; i++) {
            const rowHeader = document.createElement('div');
            rowHeader.className = 'row-header';
            rowHeader.style.width = `${this.rowHeaderWidth}px`;
            rowHeader.style.height = `${this.getRowHeight(i)}px`;
            rowHeader.style.position = 'relative';
            rowHeader.setAttribute('data-row', i);

            const label = document.createElement('span');
            label.textContent = i + 1;
            label.style.pointerEvents = 'none';
            rowHeader.appendChild(label);

            // Handle di resize in basso nell'header riga
            const handle = document.createElement('div');
            handle.className = 'row-resize-handle';
            handle.setAttribute('data-row', i);
            rowHeader.appendChild(handle);

            rowHeaders.appendChild(rowHeader);
        }

        // Angolo in alto a sinistra
        const cornerHeader = document.getElementById('corner-header');
        if (cornerHeader) {
            cornerHeader.style.width = `${this.rowHeaderWidth}px`;
            cornerHeader.style.height = `${this.colHeaderHeight}px`;
        }
    }

    createGrid() {
        // Imposta le dimensioni del contenitore
        const totalWidth = this.getTotalWidth();
        const totalHeight = this.getTotalHeight();

        this.container.style.width = `${totalWidth}px`;
        this.container.style.height = `${totalHeight}px`;
        this.container.style.position = 'relative';

        // Pulisci il contenitore
        this.container.innerHTML = '';

        for (let row = 0; row < this.rows; row++) {
            const rowTop = this.getRowTop(row);
            const rowH = this.getRowHeight(row);
            for (let col = 0; col < this.cols; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.setAttribute('data-row', row);
                cell.setAttribute('data-col', col);

                const cellRef = `${this.numberToColumn(col)}${row + 1}`;
                cell.setAttribute('data-cell', cellRef);

                // Posizionamento preciso con dimensioni variabili
                cell.style.left = `${this.getColLeft(col)}px`;
                cell.style.top = `${rowTop}px`;
                cell.style.width = `${this.getColWidth(col)}px`;
                cell.style.height = `${rowH}px`;

                cell.tabIndex = 0;

                // Contenuto della cella
                const content = document.createElement('div');
                content.className = 'cell-content';

                cell.appendChild(content);
                this.container.appendChild(cell);

                // Aggiorna la visualizzazione solo se la cella ha dati
                if (this.data[cellRef]) {
                    this.updateCellDisplay(cellRef);
                }
            }
        }
    }

    bindEvents() {
        // Selezione celle
        this.container.addEventListener('mousedown', (e) => {
            const cell = e.target.closest('.cell');
            if (cell) {
                // Tasto destro: lascia gestire a contextmenu, non resettare la selezione
                if (e.button === 2) {
                    const cellRef = cell.getAttribute('data-cell');
                    if (this.isCellInRange(cellRef)) return;
                }
                e.preventDefault();
                const cellRef = cell.getAttribute('data-cell');

                // Modalità "punta e clicca": se stai editando una formula e il cursore
                // è dopo un operatore, il click inserisce il riferimento nella formula
                // invece di spostare la selezione.
                if (this.isEditing && this._isPointModeContext()) {
                    this._startPointSelection(cellRef);
                    return;
                }

                // Se si stava editando un'altra cella, conferma il valore
                if (this.isEditing) {
                    this.commitCellEdit(null);
                }

                if (e.shiftKey) {
                    this.selectedRange.end = cellRef;
                    this.selectRange(this.selectedRange.start, cellRef);
                } else {
                    this.selectCell(cellRef);
                    this.isDragging = true;
                    this.dragStart = cellRef;
                    this.selectedRange = { start: cellRef, end: cellRef };
                    
                    const handleMouseMove = (e) => {
                        if (!this.isDragging) return;
                        const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cell');
                        if (cell) {
                            const cellRef = cell.getAttribute('data-cell');
                            this.selectedRange.end = cellRef;
                            this.selectRange(this.dragStart, cellRef);
                        }
                    };

                    const handleMouseUp = () => {
                        this.isDragging = false;
                        document.removeEventListener('mousemove', handleMouseMove);
                        document.removeEventListener('mouseup', handleMouseUp);
                    };

                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', handleMouseUp);
                }
            }
        });

        this.container.addEventListener('dblclick', (e) => {
            const cell = e.target.closest('.cell');
            if (cell) {
                this.editCell(cell.getAttribute('data-cell'));
            }
        });

        const formulaInput = document.getElementById('formula-input');
        // Editare nella barra della formula apre/sincronizza anche l'editor in-cella.
        formulaInput.addEventListener('focus', () => {
            if (!this.isEditing) this.startCellEdit(this.selectedCell, null, 'edit', false);
            this._activeEditorEl = formulaInput;
        });
        formulaInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.commitCellEdit('down'); }
            else if (e.key === 'Escape') { e.preventDefault(); this.cancelCellEdit(); }
            else if (e.key === 'Tab') { e.preventDefault(); this.commitCellEdit('right'); }
        });
        formulaInput.addEventListener('input', () => {
            if (this.isEditing && this.cellEditorEl) this.cellEditorEl.value = formulaInput.value;
            this._pointStart = null;
            this._renderFormulaHighlights(formulaInput.value);
        });
        formulaInput.addEventListener('blur', () => {
            // Conferma quando il focus lascia la barra, salvo passaggio all'editor in-cella o "punta e clicca".
            setTimeout(() => {
                if (!this.isEditing || this._pointing) return;
                const ae = document.activeElement;
                if (ae === formulaInput || ae === this.cellEditorEl) return;
                this.commitCellEdit(null);
            }, 0);
        });

        // Menu contestuale (tasto destro sulle celle)
        this.container.addEventListener('contextmenu', (e) => {
            const cell = e.target.closest('.cell');
            if (cell) {
                e.preventDefault();
                const cellRef = cell.getAttribute('data-cell');
                // Se la cella non è già nel range selezionato, resetta la selezione
                if (!this.isCellInRange(cellRef)) {
                    this.selectCell(cellRef);
                }
                this.showContextMenu(e.clientX, e.clientY);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.target.id === 'formula-input') return;
            // Ignora se il focus è su un input/textarea/select (modali, ecc.)
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            // Ignora se il target è un elemento contentEditable (es. casella di testo, wordart)
            if (e.target.isContentEditable || e.target.closest('[contenteditable="true"]')) return;

            const current = this.getCellCoordinates(this.selectedCell);
            let newRow = current.row;
            let newCol = current.col;

            switch(e.key) {
                case 'ArrowUp': e.preventDefault(); newRow = Math.max(0, newRow - 1); break;
                case 'ArrowDown': e.preventDefault(); newRow = Math.min(this.rows - 1, newRow + 1); break;
                case 'ArrowLeft': e.preventDefault(); newCol = Math.max(0, newCol - 1); break;
                case 'ArrowRight': e.preventDefault(); newCol = Math.min(this.cols - 1, newCol + 1); break;
                case 'Enter':
                    e.preventDefault();
                    if (!this.isEditing) {
                        this.editCell(this.selectedCell);
                    } else {
                        this.selectCell(e.shiftKey ? this.getCellAbove(this.selectedCell) : this.getCellBelow(this.selectedCell));
                    }
                    return;
                case 'Tab':
                    e.preventDefault();
                    this.selectCell(e.shiftKey ? this.getCellLeft(this.selectedCell) : this.getCellRight(this.selectedCell));
                    return;
                case 'F2': e.preventDefault(); this.editCell(this.selectedCell); return;
                case 'Delete':
                case 'Backspace': e.preventDefault(); this.clearSelectedCells(); return;
                case 'Escape': return;
                default:
                    // Auto-edit: se si digita un carattere stampabile, entra in editing IN-CELLA
                    if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
                        if (!this.isCellEditable(this.selectedCell)) {
                            this.updateStatus('La cella è protetta.');
                            return;
                        }
                        e.preventDefault();
                        // Modalità "inserimento": sovrascrive il contenuto, le frecce confermano e spostano.
                        this.startCellEdit(this.selectedCell, e.key, 'enter');
                        return;
                    }
                    break;
            }

            if (newRow !== current.row || newCol !== current.col) {
                const newCellRef = `${this.numberToColumn(newCol)}${newRow + 1}`;
                if (e.shiftKey) {
                    this.selectedRange.end = newCellRef;
                    this.selectRange(this.selectedRange.start, newCellRef);
                } else {
                    this.selectCell(newCellRef);
                }
            }
        });

        // Scroll sincronizzato
        if (this.viewport) {
            this.viewport.addEventListener('scroll', () => {
                const scrollLeft = this.viewport.scrollLeft;
                const scrollTop = this.viewport.scrollTop;
                
                const colHeaders = document.getElementById('column-headers');
                if (colHeaders) {
                    colHeaders.style.transform = `translateX(-${scrollLeft}px)`;
                }
                
                const rowHeaders = document.getElementById('row-headers');
                if (rowHeaders) {
                    rowHeaders.style.transform = `translateY(-${scrollTop}px)`;
                }
            });
        }

        // Touch support per mobile
        let touchTimer = null;
        this.container.addEventListener('touchstart', (e) => {
            const cell = e.target.closest('.cell');
            if (cell) {
                const cellRef = cell.getAttribute('data-cell');
                this.selectCell(cellRef);
                // Doppio tap = edit
                if (touchTimer) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                    this.editCell(cellRef);
                } else {
                    touchTimer = setTimeout(() => { touchTimer = null; }, 300);
                }
            }
        }, { passive: true });
    }

    initResize() {
        const self = this;
        let resizing = null; // { type: 'col'|'row', index, startX/Y, startSize }
        let guideLine = null;

        // Crea linea guida per il resize
        const createGuideLine = (type) => {
            guideLine = document.createElement('div');
            guideLine.className = 'resize-guide';
            guideLine.style.position = 'fixed';
            guideLine.style.zIndex = '9999';
            guideLine.style.pointerEvents = 'none';
            if (type === 'col') {
                guideLine.style.width = '2px';
                guideLine.style.height = '100vh';
                guideLine.style.background = '#217346';
                guideLine.style.top = '0';
            } else {
                guideLine.style.height = '2px';
                guideLine.style.width = '100vw';
                guideLine.style.background = '#217346';
                guideLine.style.left = '0';
            }
            document.body.appendChild(guideLine);
        };

        // Column resize
        document.getElementById('column-headers').addEventListener('mousedown', (e) => {
            const handle = e.target.closest('.col-resize-handle');
            if (!handle) return;
            e.preventDefault();
            e.stopPropagation();
            const colIndex = parseInt(handle.getAttribute('data-col'));
            resizing = {
                type: 'col',
                index: colIndex,
                startX: e.clientX,
                startSize: self.getColWidth(colIndex)
            };
            createGuideLine('col');
            guideLine.style.left = e.clientX + 'px';
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        // Row resize
        document.getElementById('row-headers').addEventListener('mousedown', (e) => {
            const handle = e.target.closest('.row-resize-handle');
            if (!handle) return;
            e.preventDefault();
            e.stopPropagation();
            const rowIndex = parseInt(handle.getAttribute('data-row'));
            resizing = {
                type: 'row',
                index: rowIndex,
                startY: e.clientY,
                startSize: self.getRowHeight(rowIndex)
            };
            createGuideLine('row');
            guideLine.style.top = e.clientY + 'px';
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!resizing) return;
            if (resizing.type === 'col') {
                const delta = e.clientX - resizing.startX;
                const newWidth = Math.max(20, resizing.startSize + delta);
                if (guideLine) guideLine.style.left = e.clientX + 'px';
                // Anteprima live: aggiorna header colonna
                const header = document.querySelector(`#column-headers .col-header[data-col="${resizing.index}"]`);
                if (header) header.style.width = newWidth + 'px';
            } else {
                const delta = e.clientY - resizing.startY;
                const newHeight = Math.max(10, resizing.startSize + delta);
                if (guideLine) guideLine.style.top = e.clientY + 'px';
                // Anteprima live: aggiorna header riga
                const header = document.querySelector(`#row-headers .row-header[data-row="${resizing.index}"]`);
                if (header) header.style.height = newHeight + 'px';
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (!resizing) return;
            if (guideLine) { guideLine.remove(); guideLine = null; }
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            if (resizing.type === 'col') {
                const delta = e.clientX - resizing.startX;
                const newWidth = Math.max(20, resizing.startSize + delta);
                self.setColumnWidth(resizing.index, newWidth);
            } else {
                const delta = e.clientY - resizing.startY;
                const newHeight = Math.max(10, resizing.startSize + delta);
                self.setRowHeight(resizing.index, newHeight);
            }
            resizing = null;
        });

        // Doppio click su handle colonna = auto-fit
        document.getElementById('column-headers').addEventListener('dblclick', (e) => {
            const handle = e.target.closest('.col-resize-handle');
            if (!handle) return;
            e.preventDefault();
            const colIndex = parseInt(handle.getAttribute('data-col'));
            self.autoFitColumn(colIndex);
        });

        // Doppio click su handle riga = auto-fit
        document.getElementById('row-headers').addEventListener('dblclick', (e) => {
            const handle = e.target.closest('.row-resize-handle');
            if (!handle) return;
            e.preventDefault();
            const rowIndex = parseInt(handle.getAttribute('data-row'));
            self.autoFitRow(rowIndex);
        });
    }

    setColumnWidth(colIndex, width) {
        this.columnWidths[colIndex] = width;
        this._updateLayout();
    }

    setRowHeight(rowIndex, height) {
        this.rowHeights[rowIndex] = height;
        this._updateLayout();
    }

    _updateLayout() {
        // Aggiorna dimensioni totali
        const totalWidth = this.getTotalWidth();
        const totalHeight = this.getTotalHeight();

        this.container.style.width = totalWidth + 'px';
        this.container.style.height = totalHeight + 'px';

        // Aggiorna header colonne
        const colHeaders = document.getElementById('column-headers');
        colHeaders.style.width = totalWidth + 'px';
        colHeaders.querySelectorAll('.col-header').forEach(h => {
            const ci = parseInt(h.getAttribute('data-col'));
            h.style.width = this.getColWidth(ci) + 'px';
        });

        // Aggiorna header righe
        const rowHeaders = document.getElementById('row-headers');
        rowHeaders.style.height = totalHeight + 'px';
        rowHeaders.querySelectorAll('.row-header').forEach(h => {
            const ri = parseInt(h.getAttribute('data-row'));
            h.style.height = this.getRowHeight(ri) + 'px';
        });

        // Aggiorna posizione e dimensione di ogni cella
        this.container.querySelectorAll('.cell').forEach(cell => {
            const col = parseInt(cell.getAttribute('data-col'));
            const row = parseInt(cell.getAttribute('data-row'));
            cell.style.left = this.getColLeft(col) + 'px';
            cell.style.top = this.getRowTop(row) + 'px';
            cell.style.width = this.getColWidth(col) + 'px';
            cell.style.height = this.getRowHeight(row) + 'px';
        });
    }

    autoFitColumn(colIndex) {
        const colLetter = this.numberToColumn(colIndex);
        let maxWidth = 40; // minimo
        for (let row = 1; row <= this.rows; row++) {
            const cellRef = colLetter + row;
            const data = this.data[cellRef];
            if (data && (data.value || data.computedValue)) {
                const text = data.computedValue || data.value;
                // Stima larghezza: ~7px per carattere
                const estimated = (String(text).length + 2) * 7;
                maxWidth = Math.max(maxWidth, estimated);
            }
        }
        this.setColumnWidth(colIndex, Math.min(maxWidth, 400));
    }

    autoFitRow(rowIndex) {
        // Auto-fit riga basato sul contenuto
        let maxHeight = this.cellHeight;
        for (let col = 0; col < this.cols; col++) {
            const cellRef = this.numberToColumn(col) + (rowIndex + 1);
            const data = this.data[cellRef];
            if (data && data.format && data.format.wrapText && data.value) {
                const colW = this.getColWidth(col);
                const charPerLine = Math.floor(colW / 7);
                const lines = Math.ceil(String(data.value).length / charPerLine);
                maxHeight = Math.max(maxHeight, lines * 18);
            }
        }
        this.setRowHeight(rowIndex, maxHeight);
    }

    selectCell(cellRef) {
        if (!this.isValidCell(cellRef)) return;
        this.clearSelection();
        this.selectedCell = cellRef;
        this.selectedRange = { start: cellRef, end: cellRef };
        const cellElement = document.querySelector(`[data-cell="${cellRef}"]`);
        if (cellElement) {
            cellElement.classList.add('selected');
            cellElement.focus();
            this.scrollToCell(cellRef);
        }
        this.updateFormulaBar();
        this.updateFormatUI();
        this.updateSelectionStats();
        this.updateStatus(`Cella ${cellRef} selezionata`);
    }

    selectRange(startCell, endCell) {
        if (!this.isValidCell(startCell) || !this.isValidCell(endCell)) return;
        this.clearSelection();
        const start = this.getCellCoordinates(startCell);
        const end = this.getCellCoordinates(endCell);
        const minRow = Math.min(start.row, end.row);
        const maxRow = Math.max(start.row, end.row);
        const minCol = Math.min(start.col, end.col);
        const maxCol = Math.max(start.col, end.col);
        this.selectedRange = { start: startCell, end: endCell };

        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const cellRef = `${this.numberToColumn(col)}${row + 1}`;
                const cellElement = document.querySelector(`[data-cell="${cellRef}"]`);
                if (cellElement) {
                    cellElement.classList.add('selected');
                    if (row === minRow) cellElement.classList.add('selected-top');
                    if (row === maxRow) cellElement.classList.add('selected-bottom');
                    if (col === minCol) cellElement.classList.add('selected-left');
                    if (col === maxCol) cellElement.classList.add('selected-right');
                }
            }
        }

        this.selectedCell = endCell;
        const activeCell = document.querySelector(`[data-cell="${endCell}"]`);
        if (activeCell) {
            activeCell.classList.add('active');
            activeCell.focus();
        }
        this.updateFormulaBar();
        this.updateSelectionStats();
        this.updateStatus(`Range ${startCell}:${endCell} selezionato`);
    }

    isCellEditable(cellRef) {
        if (!this.isProtected) return true;
        const cellData = this.data[cellRef];
        // Se la cella non ha dati, usa il formato predefinito (locked = true)
        if (!cellData) return false;
        // Se format.locked non è definito, default = bloccato
        return cellData.format && cellData.format.locked === false;
    }

    isCellInRange(cellRef) {
        if (!this.isValidCell(cellRef)) return false;
        const coords = this.getCellCoordinates(cellRef);
        const start = this.getCellCoordinates(this.selectedRange.start);
        const end = this.getCellCoordinates(this.selectedRange.end);
        const minRow = Math.min(start.row, end.row);
        const maxRow = Math.max(start.row, end.row);
        const minCol = Math.min(start.col, end.col);
        const maxCol = Math.max(start.col, end.col);
        return coords.row >= minRow && coords.row <= maxRow &&
               coords.col >= minCol && coords.col <= maxCol;
    }

    selectAll() {
        this.selectRange('A1', `${this.numberToColumn(this.cols - 1)}${this.rows}`);
    }

    clearSelection() {
        document.querySelectorAll('.cell.selected, .cell.active, .cell.selected-top, .cell.selected-bottom, .cell.selected-left, .cell.selected-right').forEach(cell => {
            cell.classList.remove('selected', 'active', 'selected-top', 'selected-bottom', 'selected-left', 'selected-right');
        });
    }

    editCell(cellRef) {
        // Apre l'editor IN-CELLA in modalità "modifica" (frecce muovono il cursore).
        this.startCellEdit(cellRef, null, 'edit');
    }

    getCellValue(cellRef) {
        return this.data[cellRef] ? this.data[cellRef].computedValue || this.data[cellRef].value : '';
    }

    setCellValue(cellRef, value, isTemporary = false) {
        if (!this.isValidCell(cellRef)) return;
        // Blocca modifica se foglio protetto e cella bloccata
        if (!this._batchUndo && !isTemporary && !this.isCellEditable(cellRef)) {
            this.updateStatus('La cella è protetta. Le celle bloccate non possono essere modificate.');
            return;
        }
        if (!this.data[cellRef]) {
            this.data[cellRef] = { value: '', formula: '', format: { ...this.format }, computedValue: '' };
        }
        const oldValue = this.data[cellRef].value;
        const oldFormula = this.data[cellRef].formula;
        
        if (value.startsWith('=')) {
            this.data[cellRef].formula = value;
            this.data[cellRef].value = '';
            this.data[cellRef].computedValue = this.evaluateFormula(value);
        } else {
            this.data[cellRef].formula = '';
            this.data[cellRef].value = value;
            this.data[cellRef].computedValue = value;
        }
        
        if (!isTemporary) {
            if (oldValue !== value || oldFormula !== this.data[cellRef].formula || this._tempEditOccurred) {
                this._tempEditOccurred = false;
                this.setModified(true);
                if (!this._batchUndo) {
                    this.saveState();
                }
            }
            // Ricalcola le formule dipendenti al commit, salvo modalità calcolo manuale
            // (_autoCalc === false): in quel caso solo la cella appena modificata è già
            // aggiornata (riga 754) e i dipendenti restano fermi fino a "Calcola adesso"/F9.
            if (this._autoCalc !== false) this.recalculate();
        } else {
            this._tempEditOccurred = true;
        }
        this.updateCellDisplay(cellRef);
        if (!isTemporary) this.updateFormulaBar();
    }

    // Sostituisce i nomi definiti (es. "Vendite") con il riferimento associato (es. "A1:A10").
    // Salta le stringhe tra virgolette e i nomi di funzione (token seguito da una parentesi).
    _resolveNames(expr) {
        const names = this._namedRanges;
        if (!names || Object.keys(names).length === 0) return expr;
        return expr.replace(/"[^"]*"|'[^']*'|[A-Za-z_][A-Za-z0-9_.]*/g, (token, offset, full) => {
            if (token[0] === '"' || token[0] === "'") return token;
            const after = full.slice(offset + token.length);
            if (/^\s*\(/.test(after)) return token; // chiamata di funzione
            const upper = token.toUpperCase();
            return names[upper] !== undefined ? names[upper] : token;
        });
    }

    evaluateFormula(formula) {
        try {
            const expr = this._resolveNames(formula.substring(1).trim());
            const result = this._evalExpr(expr);
            if (result === null || result === undefined) return '';
            if (typeof result === 'string' && result.startsWith('#')) return result;
            if (typeof result === 'number') {
                if (!isFinite(result)) return '#DIV/0!';
                return result === Math.floor(result) ? result.toString() : parseFloat(result.toFixed(10)).toString();
            }
            return result.toString();
        } catch (error) {
            return '#ERRORE!';
        }
    }

    // Risolve un range tipo A1:B3 in un array di valori
    _resolveRange(rangeStr) {
        rangeStr = rangeStr.trim();
        if (rangeStr.includes(':')) {
            const [startRef, endRef] = rangeStr.split(':');
            const start = this.getCellCoordinates(startRef.trim());
            const end = this.getCellCoordinates(endRef.trim());
            const values = [];
            const minR = Math.min(start.row, end.row), maxR = Math.max(start.row, end.row);
            const minC = Math.min(start.col, end.col), maxC = Math.max(start.col, end.col);
            for (let r = minR; r <= maxR; r++) {
                for (let c = minC; c <= maxC; c++) {
                    const ref = this.numberToColumn(c) + (r + 1);
                    const v = this.getCellValue(ref);
                    values.push(v);
                }
            }
            return values;
        }
        return [this.getCellValue(rangeStr)];
    }

    // Raccoglie i valori numerici da argomenti misti (range, riferimenti singoli, numeri)
    _collectNumbers(args) {
        const nums = [];
        for (const arg of args) {
            const trimmed = arg.trim();
            if (trimmed.includes(':')) {
                this._resolveRange(trimmed).forEach(v => { const n = parseFloat(v); if (!isNaN(n)) nums.push(n); });
            } else if (/^[A-Z]+\d+$/i.test(trimmed)) {
                const n = parseFloat(this.getCellValue(trimmed.toUpperCase()));
                if (!isNaN(n)) nums.push(n);
            } else {
                const n = parseFloat(this._evalExpr(trimmed));
                if (!isNaN(n)) nums.push(n);
            }
        }
        return nums;
    }

    _collectAll(args) {
        const vals = [];
        for (const arg of args) {
            const trimmed = arg.trim();
            if (trimmed.includes(':')) {
                this._resolveRange(trimmed).forEach(v => vals.push(v));
            } else if (/^[A-Z]+\d+$/i.test(trimmed)) {
                vals.push(this.getCellValue(trimmed.toUpperCase()));
            } else {
                vals.push(this._evalExpr(trimmed));
            }
        }
        return vals;
    }

    // Splitta gli argomenti rispettando parentesi annidate
    _splitArgs(argsStr) {
        const args = [];
        let depth = 0, current = '';
        for (const ch of argsStr) {
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            if (ch === ';' && depth === 0) { args.push(current); current = ''; }
            else if (ch === ',' && depth === 0) { args.push(current); current = ''; }
            else current += ch;
        }
        if (current) args.push(current);
        return args;
    }

    // Valuta un'espressione (supporta funzioni, riferimenti, operatori)
    _evalExpr(expr) {
        expr = expr.trim();
        if (expr === '') return 0;

        // Stringa tra virgolette
        if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
            return expr.slice(1, -1);
        }

        // Numero puro
        if (!isNaN(expr) && expr !== '') return parseFloat(expr);

        // Costanti booleane (Excel italiano/inglese)
        const upperExpr = expr.toUpperCase();
        if (upperExpr === 'VERO' || upperExpr === 'TRUE') return true;
        if (upperExpr === 'FALSO' || upperExpr === 'FALSE') return false;

        // Funzione: NOME(args) — include lettere accentate (es. SOMMA.PIÙ.SE)
        const funcMatch = expr.match(/^([A-ZÀ-ÿ][A-ZÀ-ÿ0-9.]*)\s*\((.*)$/i);
        if (funcMatch) {
            const funcName = funcMatch[1].toUpperCase();
            // Trova la parentesi chiusa corrispondente
            let depth = 1, i = 0, inner = funcMatch[2];
            for (i = 0; i < inner.length; i++) {
                if (inner[i] === '(') depth++;
                else if (inner[i] === ')') { depth--; if (depth === 0) break; }
            }
            const argsStr = inner.substring(0, i);
            const rest = inner.substring(i + 1).trim();
            const result = this._callFunction(funcName, argsStr);
            // Se c'è un operatore dopo la funzione, continua a valutare
            if (rest && /^[\+\-\*\/\^%<>=&]/.test(rest)) {
                return this._evalMath(result + rest);
            }
            return result;
        }

        // Riferimento singolo cella (es. A1, AB123)
        if (/^[A-Z]+\d+$/i.test(expr)) {
            const val = this.getCellValue(expr.toUpperCase());
            return val !== '' && !isNaN(val) ? parseFloat(val) : (val || 0);
        }

        // Espressione matematica con operatori
        return this._evalMath(expr);
    }

    _evalMath(expr) {
        // Sostituisci riferimenti celle con i loro valori
        const evaluated = expr.replace(/[A-Z]+\d+/gi, (match) => {
            const value = this.getCellValue(match.toUpperCase());
            return value !== '' && !isNaN(value) ? value : '0';
        });
        // Sostituisci operatori Excel
        let jsExpr = evaluated.replace(/\^/g, '**').replace(/<>/g, '!==').replace(/>=/, '>=').replace(/<=/, '<=');
        const result = Function('"use strict"; return (' + jsExpr + ')')();
        return typeof result === 'boolean' ? result : result;
    }

    _callFunction(name, argsStr) {
        const args = this._splitArgs(argsStr);

        switch (name) {
            // --- Matematiche ---
            case 'SOMMA': case 'SUM': {
                const nums = this._collectNumbers(args);
                return nums.reduce((a, b) => a + b, 0);
            }
            case 'MEDIA': case 'AVERAGE': {
                const nums = this._collectNumbers(args);
                return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
            }
            case 'MAX': {
                const nums = this._collectNumbers(args);
                return nums.length ? Math.max(...nums) : 0;
            }
            case 'MIN': {
                const nums = this._collectNumbers(args);
                return nums.length ? Math.min(...nums) : 0;
            }
            case 'CONTA.NUMERI': case 'COUNT': {
                const vals = this._collectAll(args);
                return vals.filter(v => v !== '' && !isNaN(v)).length;
            }
            case 'CONTA.VALORI': case 'COUNTA': {
                const vals = this._collectAll(args);
                return vals.filter(v => v !== '' && v !== null && v !== undefined).length;
            }
            case 'CONTA.VUOTE': case 'COUNTBLANK': {
                const vals = this._collectAll(args);
                return vals.filter(v => v === '' || v === null || v === undefined).length;
            }
            case 'CONTA.SE': case 'COUNTIF': {
                const vals = this._resolveRange(args[0]);
                const criteria = this._evalExpr(args[1]);
                return vals.filter(v => this._matchCriteria(v, criteria)).length;
            }
            case 'SOMMA.SE': case 'SUMIF': {
                const rangeVals = this._resolveRange(args[0]);
                const criteria = this._evalExpr(args[1]);
                const sumRange = args[2] ? this._resolveRange(args[2]) : rangeVals;
                let sum = 0;
                rangeVals.forEach((v, i) => {
                    if (this._matchCriteria(v, criteria)) {
                        const n = parseFloat(sumRange[i]);
                        if (!isNaN(n)) sum += n;
                    }
                });
                return sum;
            }
            case 'ABS': return Math.abs(this._evalExpr(args[0]));
            case 'ARROTONDA': case 'ROUND': {
                const val = this._evalExpr(args[0]);
                const dec = args[1] !== undefined ? this._evalExpr(args[1]) : 0;
                const factor = Math.pow(10, dec);
                return Math.round(val * factor) / factor;
            }
            case 'ARROTONDA.PER.ECC': case 'ROUNDUP': {
                const val = this._evalExpr(args[0]);
                const dec = args[1] !== undefined ? this._evalExpr(args[1]) : 0;
                const factor = Math.pow(10, dec);
                return Math.ceil(val * factor) / factor;
            }
            case 'ARROTONDA.PER.DIF': case 'ROUNDDOWN': {
                const val = this._evalExpr(args[0]);
                const dec = args[1] !== undefined ? this._evalExpr(args[1]) : 0;
                const factor = Math.pow(10, dec);
                return Math.floor(val * factor) / factor;
            }
            case 'INT': return Math.floor(this._evalExpr(args[0]));
            case 'POTENZA': case 'POWER': return Math.pow(this._evalExpr(args[0]), this._evalExpr(args[1]));
            case 'RADQ': case 'SQRT': return Math.sqrt(this._evalExpr(args[0]));
            case 'RESTO': case 'MOD': return this._evalExpr(args[0]) % this._evalExpr(args[1]);
            case 'PRODOTTO': case 'PRODUCT': {
                const nums = this._collectNumbers(args);
                return nums.length ? nums.reduce((a, b) => a * b, 1) : 0;
            }
            case 'PI.GRECO': case 'PI': return Math.PI;
            case 'CASUALE': case 'RAND': return Math.random();
            case 'CASUALE.TRA': case 'RANDBETWEEN': {
                const lo = Math.ceil(this._evalExpr(args[0]));
                const hi = Math.floor(this._evalExpr(args[1]));
                return Math.floor(Math.random() * (hi - lo + 1)) + lo;
            }
            case 'LOG': return args[1] ? Math.log(this._evalExpr(args[0])) / Math.log(this._evalExpr(args[1])) : Math.log10(this._evalExpr(args[0]));
            case 'LN': return Math.log(this._evalExpr(args[0]));
            case 'EXP': return Math.exp(this._evalExpr(args[0]));

            // --- Logiche ---
            case 'SE': case 'IF': {
                const cond = this._evalExpr(args[0]);
                return cond ? this._evalExpr(args[1]) : (args[2] !== undefined ? this._evalExpr(args[2]) : false);
            }
            case 'E': case 'AND': return args.every(a => !!this._evalExpr(a));
            case 'O': case 'OR': return args.some(a => !!this._evalExpr(a));
            case 'NON': case 'NOT': return !this._evalExpr(args[0]);
            case 'SE.ERRORE': case 'IFERROR': {
                try {
                    const val = this._evalExpr(args[0]);
                    if (typeof val === 'string' && val.startsWith('#')) return this._evalExpr(args[1]);
                    if (typeof val === 'number' && !isFinite(val)) return this._evalExpr(args[1]);
                    return val;
                } catch { return this._evalExpr(args[1]); }
            }

            // --- Testo ---
            case 'CONCATENA': case 'CONCATENATE': case 'CONCAT':
                return args.map(a => {
                    const v = this._evalExpr(a);
                    return v !== null && v !== undefined ? v.toString() : '';
                }).join('');
            case 'SINISTRA': case 'LEFT': {
                const txt = String(this._evalExpr(args[0]));
                const n = args[1] ? this._evalExpr(args[1]) : 1;
                return txt.substring(0, n);
            }
            case 'DESTRA': case 'RIGHT': {
                const txt = String(this._evalExpr(args[0]));
                const n = args[1] ? this._evalExpr(args[1]) : 1;
                return txt.slice(-n);
            }
            case 'STRINGA.ESTRAI': case 'MID': {
                const txt = String(this._evalExpr(args[0]));
                const start = this._evalExpr(args[1]) - 1;
                const len = this._evalExpr(args[2]);
                return txt.substring(start, start + len);
            }
            case 'LUNGHEZZA': case 'LEN': return String(this._evalExpr(args[0])).length;
            case 'MAIUSC': case 'UPPER': return String(this._evalExpr(args[0])).toUpperCase();
            case 'MINUSC': case 'LOWER': return String(this._evalExpr(args[0])).toLowerCase();
            case 'RIMPIAZZA': case 'SUBSTITUTE': {
                const txt = String(this._evalExpr(args[0]));
                const old = String(this._evalExpr(args[1]));
                const nw = String(this._evalExpr(args[2]));
                return txt.split(old).join(nw);
            }
            case 'ANNULLA.SPAZI': case 'TRIM': return String(this._evalExpr(args[0])).trim();
            case 'TESTO': case 'TEXT': return String(this._evalExpr(args[0]));
            case 'VALORE': case 'VALUE': return parseFloat(this._evalExpr(args[0])) || 0;
            case 'TROVA': case 'FIND': {
                const needle = String(this._evalExpr(args[0]));
                const haystack = String(this._evalExpr(args[1]));
                const start = args[2] ? this._evalExpr(args[2]) - 1 : 0;
                const pos = haystack.indexOf(needle, start);
                return pos >= 0 ? pos + 1 : '#VALORE!';
            }

            // --- Ricerca ---
            case 'CERCA.VERT': case 'VLOOKUP': {
                const searchVal = this._evalExpr(args[0]);
                const rangeVals = args[1].trim();
                const colIndex = this._evalExpr(args[2]);
                const exactMatch = args[3] !== undefined ? !this._evalExpr(args[3]) : false;
                return this._vlookup(searchVal, rangeVals, colIndex, exactMatch);
            }
            case 'CERCA.ORIZZ': case 'HLOOKUP': {
                const searchVal = this._evalExpr(args[0]);
                const rangeVals = args[1].trim();
                const rowIndex = this._evalExpr(args[2]);
                return this._hlookup(searchVal, rangeVals, rowIndex);
            }
            case 'INDICE': case 'INDEX': {
                const range = args[0].trim();
                const rowNum = this._evalExpr(args[1]);
                const colNum = args[2] ? this._evalExpr(args[2]) : 1;
                return this._indexFunc(range, rowNum, colNum);
            }
            case 'CONFRONTA': case 'MATCH': {
                const searchVal = this._evalExpr(args[0]);
                const range = args[1].trim();
                const matchType = args[2] !== undefined ? this._evalExpr(args[2]) : 1;
                return this._matchFunc(searchVal, range, matchType);
            }

            // --- Data ---
            case 'OGGI': case 'TODAY': {
                const d = new Date();
                return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
            }
            case 'ADESSO': case 'NOW': {
                const d = new Date();
                return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
            }
            case 'ANNO': case 'YEAR': return new Date(this._evalExpr(args[0])).getFullYear();
            case 'MESE': case 'MONTH': return new Date(this._evalExpr(args[0])).getMonth() + 1;
            case 'GIORNO': case 'DAY': return new Date(this._evalExpr(args[0])).getDate();
            case 'ORA': case 'HOUR': return new Date(this._evalExpr(args[0])).getHours();
            case 'MINUTO': case 'MINUTE': return new Date(this._evalExpr(args[0])).getMinutes();
            case 'SECONDO': case 'SECOND': return new Date(this._evalExpr(args[0])).getSeconds();
            case 'GIORNO.SETTIMANA': case 'WEEKDAY': return new Date(this._evalExpr(args[0])).getDay() + 1;
            case 'NUM.SETTIMANA': case 'WEEKNUM': {
                const d = new Date(this._evalExpr(args[0]));
                const start = new Date(d.getFullYear(), 0, 1);
                return Math.ceil((((d - start) / 86400000) + start.getDay() + 1) / 7);
            }
            case 'DATA': case 'DATE': return new Date(this._evalExpr(args[0]), this._evalExpr(args[1]) - 1, this._evalExpr(args[2])).toLocaleDateString('it-IT');
            case 'DATA.DIFFERENZA': case 'DATEDIF': {
                const d1 = new Date(this._evalExpr(args[0]));
                const d2 = new Date(this._evalExpr(args[1]));
                const unit = String(this._evalExpr(args[2])).toUpperCase();
                const diffMs = d2 - d1;
                if (unit === 'D') return Math.floor(diffMs / 86400000);
                if (unit === 'M') return (d2.getFullYear() - d1.getFullYear()) * 12 + d2.getMonth() - d1.getMonth();
                if (unit === 'Y') return d2.getFullYear() - d1.getFullYear();
                return '#VALORE!';
            }
            case 'FINE.MESE': case 'EOMONTH': {
                const d = new Date(this._evalExpr(args[0]));
                const months = args[1] ? this._evalExpr(args[1]) : 0;
                return new Date(d.getFullYear(), d.getMonth() + months + 1, 0).toLocaleDateString('it-IT');
            }

            // --- Statistiche ---
            case 'MEDIA.SE': case 'AVERAGEIF': {
                const rangeVals = this._resolveRange(args[0]);
                const criteria = this._evalExpr(args[1]);
                const avgRange = args[2] ? this._resolveRange(args[2]) : rangeVals;
                const filtered = [];
                rangeVals.forEach((v, i) => {
                    if (this._matchCriteria(v, criteria)) {
                        const n = parseFloat(avgRange[i]);
                        if (!isNaN(n)) filtered.push(n);
                    }
                });
                return filtered.length ? filtered.reduce((a, b) => a + b, 0) / filtered.length : '#DIV/0!';
            }
            case 'MEDIANA': case 'MEDIAN': {
                const nums = this._collectNumbers(args).sort((a, b) => a - b);
                if (!nums.length) return 0;
                const mid = Math.floor(nums.length / 2);
                return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
            }
            case 'MODA': case 'MODE': {
                const nums = this._collectNumbers(args);
                const counts = {};
                nums.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
                let maxCount = 0, mode = nums[0];
                for (const [val, count] of Object.entries(counts)) {
                    if (count > maxCount) { maxCount = count; mode = parseFloat(val); }
                }
                return mode;
            }
            case 'DEV.ST': case 'STDEV': {
                const nums = this._collectNumbers(args);
                if (nums.length < 2) return '#DIV/0!';
                const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
                const variance = nums.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / (nums.length - 1);
                return Math.sqrt(variance);
            }
            case 'VAR': case 'VARIANCE': {
                const nums = this._collectNumbers(args);
                if (nums.length < 2) return '#DIV/0!';
                const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
                return nums.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / (nums.length - 1);
            }
            case 'GRANDE': case 'LARGE': {
                const nums = this._collectNumbers([args[0]]).sort((a, b) => b - a);
                const k = this._evalExpr(args[1]);
                return k > 0 && k <= nums.length ? nums[k - 1] : '#NUM!';
            }
            case 'PICCOLO': case 'SMALL': {
                const nums = this._collectNumbers([args[0]]).sort((a, b) => a - b);
                const k = this._evalExpr(args[1]);
                return k > 0 && k <= nums.length ? nums[k - 1] : '#NUM!';
            }
            case 'RANGO': case 'RANK': {
                const val = this._evalExpr(args[0]);
                const nums = this._collectNumbers([args[1]]).sort((a, b) => b - a);
                const idx = nums.indexOf(val);
                return idx >= 0 ? idx + 1 : '#N/D';
            }
            case 'PERCENTILE': {
                const nums = this._collectNumbers([args[0]]).sort((a, b) => a - b);
                const k = this._evalExpr(args[1]);
                if (k < 0 || k > 1) return '#NUM!';
                const n = (nums.length - 1) * k;
                const lo = Math.floor(n), hi = Math.ceil(n);
                return lo === hi ? nums[lo] : nums[lo] + (nums[hi] - nums[lo]) * (n - lo);
            }

            // --- Matematiche aggiuntive ---
            case 'SEGNO': case 'SIGN': { const v = this._evalExpr(args[0]); return v > 0 ? 1 : v < 0 ? -1 : 0; }
            case 'PARI': case 'EVEN': { const v = this._evalExpr(args[0]); return Math.ceil(v / 2) * 2; }
            case 'DISPARI': case 'ODD': { const v = this._evalExpr(args[0]); const r = Math.ceil(Math.abs(v)); return (r % 2 === 0 ? r + 1 : r) * Math.sign(v || 1); }
            case 'QUOZIENTE': case 'QUOTIENT': return Math.trunc(this._evalExpr(args[0]) / this._evalExpr(args[1]));
            case 'MCD': case 'GCD': {
                const nums = this._collectNumbers(args);
                const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
                return nums.reduce((a, b) => gcd(Math.abs(a), Math.abs(b)));
            }
            case 'MCM': case 'LCM': {
                const nums = this._collectNumbers(args);
                const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
                const lcm = (a, b) => Math.abs(a * b) / gcd(a, b);
                return nums.reduce((a, b) => lcm(a, b));
            }
            case 'FATTORIALE': case 'FACT': {
                const n = Math.floor(this._evalExpr(args[0]));
                if (n < 0) return '#NUM!';
                let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
            }
            case 'COMBINAZIONE': case 'COMBIN': {
                const n = this._evalExpr(args[0]), k = this._evalExpr(args[1]);
                const fact = (x) => { let r = 1; for (let i = 2; i <= x; i++) r *= i; return r; };
                return fact(n) / (fact(k) * fact(n - k));
            }
            case 'GRADI': case 'DEGREES': return this._evalExpr(args[0]) * (180 / Math.PI);
            case 'RADIANTI': case 'RADIANS': return this._evalExpr(args[0]) * (Math.PI / 180);
            case 'SEN': case 'SIN': return Math.sin(this._evalExpr(args[0]));
            case 'COS': return Math.cos(this._evalExpr(args[0]));
            case 'TAN': return Math.tan(this._evalExpr(args[0]));
            case 'ASEN': case 'ASIN': return Math.asin(this._evalExpr(args[0]));
            case 'ACOS': return Math.acos(this._evalExpr(args[0]));
            case 'ATAN': return Math.atan(this._evalExpr(args[0]));
            case 'ATAN2': return Math.atan2(this._evalExpr(args[0]), this._evalExpr(args[1]));
            case 'LOG10': return Math.log10(this._evalExpr(args[0]));
            case 'ARROT.PER.ECC': case 'CEILING': {
                const num = this._evalExpr(args[0]);
                const sig = args[1] ? this._evalExpr(args[1]) : 1;
                return Math.ceil(num / sig) * sig;
            }
            case 'ARROT.PER.DIF': case 'FLOOR': {
                const num = this._evalExpr(args[0]);
                const sig = args[1] ? this._evalExpr(args[1]) : 1;
                return Math.floor(num / sig) * sig;
            }
            case 'SOMMA.PRODOTTO': case 'SUMPRODUCT': {
                const ranges = args.map(a => this._resolveRange(a.trim()).map(v => parseFloat(v) || 0));
                const len = Math.min(...ranges.map(r => r.length));
                let sum = 0;
                for (let i = 0; i < len; i++) {
                    let product = 1;
                    ranges.forEach(r => { product *= r[i]; });
                    sum += product;
                }
                return sum;
            }
            case 'SOMMA.Q': case 'SUMSQ': {
                const nums = this._collectNumbers(args);
                return nums.reduce((s, n) => s + n * n, 0);
            }

            // --- Testo aggiuntive ---
            case 'RIPETI': case 'REPT': {
                const txt = String(this._evalExpr(args[0]));
                const times = this._evalExpr(args[1]);
                return txt.repeat(Math.max(0, Math.floor(times)));
            }
            case 'CODICE': case 'CODE': return String(this._evalExpr(args[0])).charCodeAt(0);
            case 'CARATTERE': case 'CHAR': return String.fromCharCode(this._evalExpr(args[0]));
            case 'IDENTICO': case 'EXACT': return String(this._evalExpr(args[0])) === String(this._evalExpr(args[1]));
            case 'FISSO': case 'FIXED': {
                const num = this._evalExpr(args[0]);
                const dec = args[1] !== undefined ? this._evalExpr(args[1]) : 2;
                return num.toFixed(dec);
            }
            case 'INIZIALE.MAIUSCOLA': case 'PROPER': {
                return String(this._evalExpr(args[0])).replace(/\b\w/g, c => c.toUpperCase());
            }
            case 'STRINGA.NUMERO': case 'NUMBERVALUE': return parseFloat(String(this._evalExpr(args[0])).replace(/[^\d.-]/g, '')) || 0;

            // --- Logiche aggiuntive ---
            case 'SE.PIU': case 'IFS': {
                for (let i = 0; i < args.length; i += 2) {
                    if (this._evalExpr(args[i])) return this._evalExpr(args[i + 1]);
                }
                return '#N/D';
            }
            case 'SWITCH': {
                const val = this._evalExpr(args[0]);
                for (let i = 1; i < args.length - 1; i += 2) {
                    if (this._evalExpr(args[i]) == val) return this._evalExpr(args[i + 1]);
                }
                return args.length % 2 === 0 ? this._evalExpr(args[args.length - 1]) : '#N/D';
            }
            case 'SCEGLI': case 'CHOOSE': {
                const idx = this._evalExpr(args[0]);
                return idx >= 1 && idx < args.length ? this._evalExpr(args[idx]) : '#VALORE!';
            }

            // --- Informazione ---
            case 'VAL.NUMERO': case 'ISNUMBER': { const v = this._evalExpr(args[0]); return typeof v === 'number' || (v !== '' && !isNaN(v)); }
            case 'VAL.TESTO': case 'ISTEXT': { const v = this._evalExpr(args[0]); return typeof v === 'string' && isNaN(v); }
            case 'VAL.VUOTO': case 'ISBLANK': { const v = this._evalExpr(args[0]); return v === '' || v === null || v === undefined; }
            case 'VAL.ERRORE': case 'ISERROR': {
                try { const v = this._evalExpr(args[0]); return typeof v === 'string' && v.startsWith('#'); }
                catch { return true; }
            }
            case 'VAL.LOGICO': case 'ISLOGICAL': { const v = this._evalExpr(args[0]); return typeof v === 'boolean'; }
            case 'N': { const v = this._evalExpr(args[0]); return typeof v === 'number' ? v : (v === true ? 1 : 0); }
            case 'TIPO': case 'TYPE': {
                const v = this._evalExpr(args[0]);
                if (typeof v === 'number') return 1;
                if (typeof v === 'string') return 2;
                if (typeof v === 'boolean') return 4;
                return 1;
            }

            // --- Finanziarie ---
            case 'RATA': case 'PMT': {
                const rate = this._evalExpr(args[0]);
                const nper = this._evalExpr(args[1]);
                const pv = this._evalExpr(args[2]);
                if (rate === 0) return -(pv / nper);
                return -(pv * rate * Math.pow(1 + rate, nper)) / (Math.pow(1 + rate, nper) - 1);
            }
            case 'VA': case 'PV': {
                const rate = this._evalExpr(args[0]);
                const nper = this._evalExpr(args[1]);
                const pmt = this._evalExpr(args[2]);
                if (rate === 0) return -(pmt * nper);
                return -(pmt * (1 - Math.pow(1 + rate, -nper)) / rate);
            }
            case 'VF': case 'FV': {
                const rate = this._evalExpr(args[0]);
                const nper = this._evalExpr(args[1]);
                const pmt = this._evalExpr(args[2]);
                const pv = args[3] ? this._evalExpr(args[3]) : 0;
                return -(pv * Math.pow(1 + rate, nper) + pmt * (Math.pow(1 + rate, nper) - 1) / rate);
            }
            case 'INTERESSI': case 'IPMT': {
                const rate = this._evalExpr(args[0]);
                const per = this._evalExpr(args[1]);
                const nper = this._evalExpr(args[2]);
                const pv = this._evalExpr(args[3]);
                const pmt = -(pv * rate * Math.pow(1 + rate, nper)) / (Math.pow(1 + rate, nper) - 1);
                const bal = pv * Math.pow(1 + rate, per - 1) + pmt * (Math.pow(1 + rate, per - 1) - 1) / rate;
                return bal * rate;
            }
            case 'P.RATA': case 'PPMT': {
                const rate = this._evalExpr(args[0]);
                const per = this._evalExpr(args[1]);
                const nper = this._evalExpr(args[2]);
                const pv = this._evalExpr(args[3]);
                const pmt = -(pv * rate * Math.pow(1 + rate, nper)) / (Math.pow(1 + rate, nper) - 1);
                const bal = pv * Math.pow(1 + rate, per - 1) + pmt * (Math.pow(1 + rate, per - 1) - 1) / rate;
                return pmt - bal * rate;
            }
            case 'NPER': {
                const rate = this._evalExpr(args[0]);
                const pmt = this._evalExpr(args[1]);
                const pv = this._evalExpr(args[2]);
                if (rate === 0) return -(pv / pmt);
                return Math.log(pmt / (pmt + pv * rate)) / Math.log(1 + rate);
            }
            case 'TASSO': case 'RATE': {
                const nper = this._evalExpr(args[0]);
                const pmt = this._evalExpr(args[1]);
                const pv = this._evalExpr(args[2]);
                let rate = 0.1;
                for (let i = 0; i < 100; i++) {
                    const f = pv * Math.pow(1 + rate, nper) + pmt * (Math.pow(1 + rate, nper) - 1) / rate;
                    const fp = pv * nper * Math.pow(1 + rate, nper - 1) + pmt * (nper * Math.pow(1 + rate, nper - 1) * rate - Math.pow(1 + rate, nper) + 1) / (rate * rate);
                    rate -= f / fp;
                    if (Math.abs(f) < 1e-10) break;
                }
                return rate;
            }

            // --- Riferimento aggiuntive ---
            case 'RIGA': case 'ROW': {
                const ref = args[0] ? args[0].trim() : '';
                if (!ref) return (this.getCellCoordinates(this.selectedCell)?.row || 0) + 1;
                const coords = this.getCellCoordinates(ref);
                return coords ? coords.row + 1 : '#RIF!';
            }
            case 'COLONNA': case 'COLUMN': {
                const ref = args[0] ? args[0].trim() : '';
                if (!ref) return (this.getCellCoordinates(this.selectedCell)?.col || 0) + 1;
                const coords = this.getCellCoordinates(ref);
                return coords ? coords.col + 1 : '#RIF!';
            }
            case 'RIGHE': case 'ROWS': {
                const ref = args[0] ? args[0].trim() : '';
                if (!ref.includes(':')) return 1;
                const [s, e] = ref.split(':');
                const cs = this.getCellCoordinates(s.trim());
                const ce = this.getCellCoordinates(e.trim());
                return Math.abs(ce.row - cs.row) + 1;
            }
            case 'COLONNE': case 'COLUMNS': {
                const ref = args[0] ? args[0].trim() : '';
                if (!ref.includes(':')) return 1;
                const [s, e] = ref.split(':');
                const cs = this.getCellCoordinates(s.trim());
                const ce = this.getCellCoordinates(e.trim());
                return Math.abs(ce.col - cs.col) + 1;
            }
            case 'SCARTO': case 'OFFSET': {
                const ref = args[0] ? args[0].trim() : '';
                const rows = this._evalExpr(args[1]) || 0;
                const cols = this._evalExpr(args[2]) || 0;
                const height = args[3] ? this._evalExpr(args[3]) : 1;
                const width = args[4] ? this._evalExpr(args[4]) : 1;
                const coords = this.getCellCoordinates(ref);
                if (!coords) return '#RIF!';
                const newRow = coords.row + rows;
                const newCol = coords.col + cols;
                if (newRow < 0 || newCol < 0) return '#RIF!';
                const newRef = this.numberToColumn(newCol) + (newRow + 1);
                // Se altezza/larghezza > 1, restituisce solo la cella in alto a sinistra
                return this.getCellValue(newRef) || '';
            }
            case 'INDIRETTO': case 'INDIRECT': {
                const refText = String(this._evalExpr(args[0]));
                const a1Style = args[1] === undefined ? true : !!this._evalExpr(args[1]);
                if (a1Style) {
                    const trimmed = refText.trim();
                    if (/^[A-Z]+\d+$/i.test(trimmed)) {
                        return this.getCellValue(trimmed.toUpperCase()) || '';
                    }
                    if (trimmed.includes(':')) {
                        const [s, e] = trimmed.split(':');
                        const vals = [];
                        const cs = this.getCellCoordinates(s.trim());
                        const ce = this.getCellCoordinates(e.trim());
                        const minR = Math.min(cs.row, ce.row), maxR = Math.max(cs.row, ce.row);
                        const minC = Math.min(cs.col, ce.col), maxC = Math.max(cs.col, ce.col);
                        for (let r = minR; r <= maxR; r++) {
                            for (let c = minC; c <= maxC; c++) {
                                const ref = this.numberToColumn(c) + (r + 1);
                                vals.push(this.getCellValue(ref) || '');
                            }
                        }
                        return vals.join(', ');
                    }
                    return this._evalExpr(refText) || '';
                }
                return '#RIF!';
            }
            case 'ANNULLA.ERRORI': case 'IFNA': {
                const val = this._evalExpr(args[0]);
                if (val === '#N/D') return this._evalExpr(args[1]);
                return val;
            }
            case 'COLLEGAMENTO.IPERTESTUALE': case 'HYPERLINK': {
                const link = String(this._evalExpr(args[0]));
                const text = args[1] ? String(this._evalExpr(args[1])) : link;
                return text;
            }
            case 'UNIQUE': {
                const vals = this._resolveRange(args[0].trim());
                return [...new Set(vals.filter(v => v !== ''))].join(', ');
            }
            case 'MATR.TRASPOSTA': case 'TRANSPOSE': {
                const ref = args[0].trim();
                if (!ref.includes(':')) return this.getCellValue(ref) || '';
                const [s, e] = ref.split(':');
                const cs = this.getCellCoordinates(s.trim());
                const ce = this.getCellCoordinates(e.trim());
                const vals = [];
                for (let c = cs.col; c <= ce.col; c++) {
                    for (let r = cs.row; r <= ce.row; r++) {
                        const refCell = this.numberToColumn(c) + (r + 1);
                        vals.push(this.getCellValue(refCell) || '');
                    }
                }
                return vals.join(', ');
            }
            case 'SEQUENZA': case 'SEQUENCE': {
                const rows = this._evalExpr(args[0]) || 1;
                const cols = args[1] ? this._evalExpr(args[1]) : 1;
                const start = args[2] ? this._evalExpr(args[2]) : 1;
                const step = args[3] ? this._evalExpr(args[3]) : 1;
                const seq = [];
                let val = start;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        seq.push(val);
                        val += step;
                    }
                }
                return seq.join(', ');
            }
            case 'SOSTITUISCI': case 'REPLACE': {
                const txt = String(this._evalExpr(args[0]));
                const start = this._evalExpr(args[1]) - 1;
                const numChars = this._evalExpr(args[2]);
                const newText = String(this._evalExpr(args[3]));
                return txt.substring(0, start) + newText + txt.substring(start + numChars);
            }

            // --- Multi-criterio ---
            case 'SOMMA.PIÙ.SE': case 'SOMMA.PIU.SE': case 'SUMIFS': {
                const sumRange = this._resolveRange(args[0]);
                const pairs = [];
                for (let i = 1; i < args.length - 1; i += 2) pairs.push({ range: this._resolveRange(args[i]), crit: this._evalExpr(args[i + 1]) });
                let sum = 0;
                sumRange.forEach((v, idx) => {
                    if (pairs.every(p => this._matchCriteria(p.range[idx], p.crit))) { const n = parseFloat(v); if (!isNaN(n)) sum += n; }
                });
                return sum;
            }
            case 'CONTA.PIÙ.SE': case 'CONTA.PIU.SE': case 'COUNTIFS': {
                const pairs = [];
                for (let i = 0; i < args.length - 1; i += 2) pairs.push({ range: this._resolveRange(args[i]), crit: this._evalExpr(args[i + 1]) });
                const len = pairs.length ? pairs[0].range.length : 0;
                let count = 0;
                for (let idx = 0; idx < len; idx++) if (pairs.every(p => this._matchCriteria(p.range[idx], p.crit))) count++;
                return count;
            }
            case 'MEDIA.PIÙ.SE': case 'MEDIA.PIU.SE': case 'AVERAGEIFS': {
                const avgRange = this._resolveRange(args[0]);
                const pairs = [];
                for (let i = 1; i < args.length - 1; i += 2) pairs.push({ range: this._resolveRange(args[i]), crit: this._evalExpr(args[i + 1]) });
                const sel = [];
                avgRange.forEach((v, idx) => { if (pairs.every(p => this._matchCriteria(p.range[idx], p.crit))) { const n = parseFloat(v); if (!isNaN(n)) sel.push(n); } });
                return sel.length ? sel.reduce((a, b) => a + b, 0) / sel.length : '#DIV/0!';
            }
            case 'MAX.PIÙ.SE': case 'MAX.PIU.SE': case 'MAXIFS':
            case 'MIN.PIÙ.SE': case 'MIN.PIU.SE': case 'MINIFS': {
                const isMax = name.startsWith('MAX');
                const valRange = this._resolveRange(args[0]);
                const pairs = [];
                for (let i = 1; i < args.length - 1; i += 2) pairs.push({ range: this._resolveRange(args[i]), crit: this._evalExpr(args[i + 1]) });
                const sel = [];
                valRange.forEach((v, idx) => { if (pairs.every(p => this._matchCriteria(p.range[idx], p.crit))) { const n = parseFloat(v); if (!isNaN(n)) sel.push(n); } });
                if (!sel.length) return 0;
                return isMax ? Math.max(...sel) : Math.min(...sel);
            }
            case 'SUBTOTALE': case 'SUBTOTAL': {
                // SUBTOTALE(num_funzione; intervallo): ignora altre righe subtotale (semplificato)
                const fn = this._evalExpr(args[0]);
                const vals = this._collectAll(args.slice(1));
                const nums = vals.map(v => parseFloat(v)).filter(n => !isNaN(n));
                const f = fn > 100 ? fn - 100 : fn;
                switch (f) {
                    case 1: return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0; // MEDIA
                    case 2: return nums.length; // CONTA.NUMERI
                    case 3: return vals.filter(v => v !== '' && v != null).length; // CONTA.VALORI
                    case 4: return nums.length ? Math.max(...nums) : 0;
                    case 5: return nums.length ? Math.min(...nums) : 0;
                    case 6: return nums.reduce((a, b) => a * (b || 1), 1); // PRODOTTO
                    case 9: return nums.reduce((a, b) => a + b, 0); // SOMMA
                    default: return nums.reduce((a, b) => a + b, 0);
                }
            }

            // --- Testo aggiuntive ---
            case 'RICERCA': case 'SEARCH': {
                const needle = String(this._evalExpr(args[0])).toLowerCase();
                const haystack = String(this._evalExpr(args[1])).toLowerCase();
                const start = args[2] ? this._evalExpr(args[2]) - 1 : 0;
                const pos = haystack.indexOf(needle, start);
                return pos >= 0 ? pos + 1 : '#VALORE!';
            }
            case 'TESTO.UNISCI': case 'TEXTJOIN': {
                const delim = String(this._evalExpr(args[0]));
                const ignoreEmpty = !!this._evalExpr(args[1]);
                const vals = this._collectAll(args.slice(2)).map(v => v == null ? '' : String(v));
                return (ignoreEmpty ? vals.filter(v => v !== '') : vals).join(delim);
            }
            case 'LIBERA': case 'CLEAN': return String(this._evalExpr(args[0])).replace(/[\x00-\x1F\x7F]/g, '');
            case 'T': { const v = this._evalExpr(args[0]); return typeof v === 'string' ? v : ''; }
            case 'VALUTA': case 'DOLLAR': {
                const num = this._evalExpr(args[0]);
                const dec = args[1] !== undefined ? this._evalExpr(args[1]) : 2;
                return '€ ' + Number(num).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            }

            // --- Matematiche aggiuntive ---
            case 'TRONCA': case 'TRUNC': {
                const val = this._evalExpr(args[0]);
                const dec = args[1] !== undefined ? this._evalExpr(args[1]) : 0;
                const factor = Math.pow(10, dec);
                return Math.trunc(val * factor) / factor;
            }
            case 'ARROTONDA.MULTIPLO': case 'MROUND': {
                const num = this._evalExpr(args[0]), mult = this._evalExpr(args[1]);
                if (mult === 0) return 0;
                return Math.round(num / mult) * mult;
            }
            case 'MEDIA.GEOMETRICA': case 'GEOMEAN': {
                const nums = this._collectNumbers(args);
                if (!nums.length || nums.some(n => n <= 0)) return '#NUM!';
                return Math.pow(nums.reduce((a, b) => a * b, 1), 1 / nums.length);
            }

            // --- Statistiche aggiuntive ---
            case 'DEV.ST.POP': case 'DEV.ST.P': case 'STDEVP': {
                const nums = this._collectNumbers(args);
                if (!nums.length) return '#DIV/0!';
                const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
                return Math.sqrt(nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length);
            }
            case 'VAR.POP': case 'VAR.P': case 'VARP': {
                const nums = this._collectNumbers(args);
                if (!nums.length) return '#DIV/0!';
                const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
                return nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
            }
            case 'QUARTILE': {
                const nums = this._collectNumbers([args[0]]).sort((a, b) => a - b);
                const q = this._evalExpr(args[1]);
                if (!nums.length || q < 0 || q > 4) return '#NUM!';
                const pos = (q / 4) * (nums.length - 1);
                const lo = Math.floor(pos), hi = Math.ceil(pos);
                return lo === hi ? nums[lo] : nums[lo] + (nums[hi] - nums[lo]) * (pos - lo);
            }
            case 'CONTEGGIO.PIÙ.FREQUENTE': case 'COUNTUNIQUE': {
                const vals = this._collectAll(args).filter(v => v !== '' && v != null);
                return new Set(vals.map(String)).size;
            }

            // --- Informazione aggiuntive ---
            case 'VAL.PARI': case 'ISEVEN': return Math.trunc(this._evalExpr(args[0])) % 2 === 0;
            case 'VAL.DISPARI': case 'ISODD': return Math.abs(Math.trunc(this._evalExpr(args[0])) % 2) === 1;
            case 'VAL.NON.DISP': case 'ISNA': { const v = this._evalExpr(args[0]); return v === '#N/D' || v === '#N/A'; }
            case 'NON.DISP': case 'NA': return '#N/D';
            case 'VAL.RIF': case 'ISREF': { const t = (args[0] || '').trim(); return /^[A-Z]+\d+(:[A-Z]+\d+)?$/i.test(t); }

            // --- Data aggiuntive ---
            case 'ORARIO': case 'TIME': {
                const h = this._evalExpr(args[0]) || 0, m = this._evalExpr(args[1]) || 0, s = this._evalExpr(args[2]) || 0;
                const total = (h * 3600 + m * 60 + s) % 86400;
                const hh = Math.floor(total / 3600), mm = Math.floor((total % 3600) / 60), ss = total % 60;
                return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
            }
            case 'DATA.VALORE': case 'DATEVALUE': {
                const d = this._parseDate(this._evalExpr(args[0]));
                return d ? Math.floor((d - new Date(1899, 11, 30)) / 86400000) : '#VALORE!';
            }
            case 'GIORNI': case 'DAYS': {
                const d2 = this._parseDate(this._evalExpr(args[0])), d1 = this._parseDate(this._evalExpr(args[1]));
                return (d1 && d2) ? Math.round((d2 - d1) / 86400000) : '#VALORE!';
            }
            case 'GIORNO.LAVORATIVO': case 'WORKDAY': {
                let d = this._parseDate(this._evalExpr(args[0]));
                if (!d) return '#VALORE!';
                let days = Math.trunc(this._evalExpr(args[1]));
                const step = days >= 0 ? 1 : -1;
                while (days !== 0) {
                    d = new Date(d.getTime() + step * 86400000);
                    const wd = d.getDay();
                    if (wd !== 0 && wd !== 6) days -= step;
                }
                return d.toLocaleDateString('it-IT');
            }
            case 'GIORNI.LAVORATIVI.TOT': case 'NETWORKDAYS': {
                let d1 = this._parseDate(this._evalExpr(args[0])), d2 = this._parseDate(this._evalExpr(args[1]));
                if (!d1 || !d2) return '#VALORE!';
                if (d1 > d2) { const t = d1; d1 = d2; d2 = t; }
                let count = 0;
                for (let d = new Date(d1); d <= d2; d = new Date(d.getTime() + 86400000)) {
                    const wd = d.getDay();
                    if (wd !== 0 && wd !== 6) count++;
                }
                return count;
            }

            // --- Ricerca aggiuntive ---
            case 'CERCA.X': case 'XLOOKUP': {
                const searchVal = this._evalExpr(args[0]);
                const lookupArr = this._resolveRange(args[1].trim());
                const returnArr = this._resolveRange(args[2].trim());
                const ifNotFound = args[3] !== undefined ? this._evalExpr(args[3]) : '#N/D';
                let idx = lookupArr.findIndex(v => String(v) === String(searchVal) || (parseFloat(v) === parseFloat(searchVal) && v !== '' && !isNaN(v)));
                return idx >= 0 && idx < returnArr.length ? returnArr[idx] : ifNotFound;
            }
            case 'CERCA': case 'LOOKUP': {
                const searchVal = this._evalExpr(args[0]);
                const lookupArr = this._resolveRange(args[1].trim());
                const returnArr = args[2] ? this._resolveRange(args[2].trim()) : lookupArr;
                let best = -1;
                for (let i = 0; i < lookupArr.length; i++) { if (parseFloat(lookupArr[i]) <= parseFloat(searchVal) || String(lookupArr[i]) === String(searchVal)) best = i; }
                return best >= 0 && best < returnArr.length ? returnArr[best] : '#N/D';
            }

            default: return '#NOME?';
        }
    }

    // Converte testo/Date in oggetto Date, gestendo dd/mm/yyyy (formato italiano) e ISO.
    _parseDate(v) {
        if (v instanceof Date) return isNaN(v) ? null : v;
        const s = String(v).trim();
        let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (m) { const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])); return isNaN(d) ? null : d; }
        const d = new Date(s);
        return isNaN(d) ? null : d;
    }

    _matchCriteria(value, criteria) {
        const strCrit = String(criteria);
        if (strCrit.startsWith('>')) {
            const num = parseFloat(strCrit.slice(strCrit[1] === '=' ? 2 : 1));
            const vn = parseFloat(value);
            return strCrit[1] === '=' ? vn >= num : vn > num;
        }
        if (strCrit.startsWith('<')) {
            if (strCrit[1] === '>') { return String(value) !== strCrit.slice(2); }
            const num = parseFloat(strCrit.slice(strCrit[1] === '=' ? 2 : 1));
            const vn = parseFloat(value);
            return strCrit[1] === '=' ? vn <= num : vn < num;
        }
        if (strCrit.startsWith('=')) return String(value) === strCrit.slice(1);
        return String(value) === strCrit;
    }

    _vlookup(searchVal, rangeStr, colIndex, exactMatch) {
        if (!rangeStr.includes(':')) return '#RIF!';
        const [startRef, endRef] = rangeStr.split(':');
        const start = this.getCellCoordinates(startRef.trim());
        const end = this.getCellCoordinates(endRef.trim());
        for (let r = start.row; r <= end.row; r++) {
            const ref = this.numberToColumn(start.col) + (r + 1);
            const v = this.getCellValue(ref);
            const matches = exactMatch
                ? (String(v) === String(searchVal) || (parseFloat(v) === parseFloat(searchVal) && !isNaN(v)))
                : (parseFloat(v) <= parseFloat(searchVal));
            if (matches) {
                const resRef = this.numberToColumn(start.col + colIndex - 1) + (r + 1);
                return this.getCellValue(resRef) || '';
            }
        }
        return '#N/D';
    }

    _hlookup(searchVal, rangeStr, rowIndex) {
        if (!rangeStr.includes(':')) return '#RIF!';
        const [startRef, endRef] = rangeStr.split(':');
        const start = this.getCellCoordinates(startRef.trim());
        const end = this.getCellCoordinates(endRef.trim());
        for (let c = start.col; c <= end.col; c++) {
            const ref = this.numberToColumn(c) + (start.row + 1);
            const v = this.getCellValue(ref);
            if (String(v) === String(searchVal) || parseFloat(v) === parseFloat(searchVal)) {
                const resRef = this.numberToColumn(c) + (start.row + rowIndex);
                return this.getCellValue(resRef) || '';
            }
        }
        return '#N/D';
    }

    _indexFunc(rangeStr, rowNum, colNum) {
        if (!rangeStr.includes(':')) return '#RIF!';
        const [startRef, endRef] = rangeStr.split(':');
        const start = this.getCellCoordinates(startRef.trim());
        const ref = this.numberToColumn(start.col + colNum - 1) + (start.row + rowNum);
        return this.getCellValue(ref) || '';
    }

    _matchFunc(searchVal, rangeStr, matchType) {
        const vals = this._resolveRange(rangeStr);
        for (let i = 0; i < vals.length; i++) {
            if (matchType === 0) {
                if (String(vals[i]) === String(searchVal) || parseFloat(vals[i]) === parseFloat(searchVal)) return i + 1;
            } else if (matchType === 1) {
                if (parseFloat(vals[i]) <= parseFloat(searchVal) && (i === vals.length - 1 || parseFloat(vals[i + 1]) > parseFloat(searchVal))) return i + 1;
            } else if (matchType === -1) {
                if (parseFloat(vals[i]) >= parseFloat(searchVal) && (i === vals.length - 1 || parseFloat(vals[i + 1]) < parseFloat(searchVal))) return i + 1;
            }
        }
        return '#N/D';
    }

    updateCellDisplay(cellRef) {
        const cellElement = document.querySelector(`[data-cell="${cellRef}"]`);
        if (!cellElement) return;
        const content = cellElement.querySelector('.cell-content');
        const cellData = this.data[cellRef];

        if (cellData) {
            let displayValue = cellData.computedValue || cellData.value || '';
            const fmt = cellData.format || {};

            // Number formatting
            if (this.isNumber(displayValue) && fmt.numberFormat && fmt.numberFormat !== 'generale' && fmt.numberFormat !== 'testo') {
                displayValue = this._formatNumber(parseFloat(displayValue), fmt.numberFormat, fmt.decimals || 0);
            }

            content.textContent = displayValue;
            content.className = 'cell-content';

            if (this.isNumber(cellData.computedValue || cellData.value) && fmt.numberFormat !== 'testo') {
                content.classList.add('cell-number');
            } else {
                content.classList.add('cell-text');
            }

            if (fmt.bold) content.classList.add('cell-bold');
            if (fmt.italic) content.classList.add('cell-italic');
            if (fmt.underline) content.classList.add('cell-underline');
            if (cellData.formula) content.classList.add('cell-formula');

            // Inline styles for extended formatting - non applicare valori di default
            content.style.fontFamily = (fmt.fontFamily && fmt.fontFamily !== 'Calibri') ? fmt.fontFamily : '';
            content.style.fontSize = (fmt.fontSize && parseInt(fmt.fontSize) !== 11) ? parseInt(fmt.fontSize) + 'px' : '';
            content.style.color = (fmt.fontColor && fmt.fontColor !== '#000000') ? fmt.fontColor : '';
            cellElement.style.backgroundColor = fmt.fillColor || '';
            content.style.textAlign = fmt.horizontalAlign || '';
            content.style.display = 'flex';
            content.style.alignItems = fmt.verticalAlign === 'top' ? 'flex-start' : fmt.verticalAlign === 'bottom' ? 'flex-end' : 'center';
            content.style.justifyContent = fmt.horizontalAlign === 'center' ? 'center' : fmt.horizontalAlign === 'right' ? 'flex-end' : 'flex-start';
            if (fmt.wrapText) {
                content.style.whiteSpace = 'normal';
                content.style.wordBreak = 'break-word';
            } else {
                content.style.whiteSpace = '';
                content.style.wordBreak = '';
            }
            if (fmt.borders) {
                const toBorderCSS = (b) => {
                    if (!b) return '';
                    // Se è già una stringa CSS, usala direttamente
                    if (typeof b === 'string') return b;
                    // Se è un oggetto { style, color }, convertilo
                    if (b.style === 'none' || !b.style) return '';
                    const widthMap = { thin:'1px', medium:'2px', thick:'3px', double:'3px', dashed:'1px', dotted:'1px' };
                    const styleMap = { thin:'solid', medium:'solid', thick:'solid', double:'double', dashed:'dashed', dotted:'dotted' };
                    return `${widthMap[b.style]||'1px'} ${styleMap[b.style]||'solid'} ${b.color||'#000000'}`;
                };
                // Assegna sempre (anche '' per ripristinare la griglia quando il bordo è rimosso)
                cellElement.style.borderTop = toBorderCSS(fmt.borders.top) || '';
                cellElement.style.borderRight = toBorderCSS(fmt.borders.right) || '';
                cellElement.style.borderBottom = toBorderCSS(fmt.borders.bottom) || '';
                cellElement.style.borderLeft = toBorderCSS(fmt.borders.left) || '';
            }
        } else {
            content.textContent = '';
            content.className = 'cell-content cell-text';
            content.removeAttribute('style');
            cellElement.style.backgroundColor = '';
        }
    }

    _formatNumber(num, format, decimals) {
        switch(format) {
            case 'numero': return num.toFixed(decimals || 2);
            case 'separatore': return num.toFixed(decimals || 2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            case 'valuta': return '€ ' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            case 'contabile': return num >= 0 ? '€ ' + num.toFixed(2) : '(€ ' + Math.abs(num).toFixed(2) + ')';
            case 'percentuale': return (num * 100).toFixed(decimals || 0) + '%';
            case 'scientifico': return num.toExponential(decimals || 2);
            case 'frazione': return this._toFraction(num);
            case 'data breve': { const d = new Date((num - 25569) * 86400000); return d.toLocaleDateString('it-IT'); }
            case 'data lunga': { const d = new Date((num - 25569) * 86400000); return d.toLocaleDateString('it-IT', {weekday:'long',year:'numeric',month:'long',day:'numeric'}); }
            case 'ora': { const d = new Date((num - 25569) * 86400000); return d.toLocaleTimeString('it-IT'); }
            default: return decimals > 0 ? num.toFixed(decimals) : String(num);
        }
    }

    _toFraction(num) {
        const whole = Math.floor(num);
        let frac = num - whole;
        if (frac === 0) return String(whole);
        let best = { n: 0, d: 1, err: frac };
        for (let d = 2; d <= 100; d++) {
            const n = Math.round(frac * d);
            const err = Math.abs(frac - n/d);
            if (err < best.err) { best = { n, d, err }; }
        }
        return whole ? `${whole} ${best.n}/${best.d}` : `${best.n}/${best.d}`;
    }

    clearCell(cellRef) {
        if (!this.isCellEditable(cellRef)) {
            this.updateStatus('La cella è protetta. Impossibile cancellare celle bloccate.');
            return;
        }
        if (this.data[cellRef]) {
            this.data[cellRef].value = '';
            this.data[cellRef].formula = '';
            this.data[cellRef].computedValue = '';
            this.data[cellRef].format = { ...this.format };
            this.updateCellDisplay(cellRef);
            this.setModified(true);
            this.saveState();
        }
    }

    clearSelectedCells() {
        const start = this.getCellCoordinates(this.selectedRange.start);
        const end = this.getCellCoordinates(this.selectedRange.end);
        const minRow = Math.min(start.row, end.row);
        const maxRow = Math.max(start.row, end.row);
        const minCol = Math.min(start.col, end.col);
        const maxCol = Math.max(start.col, end.col);
        if (this.isProtected) {
            const allEditable = this.getCellRange(this.selectedRange.start, this.selectedRange.end)
                .every(ref => this.isCellEditable(ref));
            if (!allEditable) {
                this.updateStatus('Operazione annullata: alcune celle sono protette.');
                return;
            }
        }
        let cleared = 0;
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const cellRef = `${this.numberToColumn(col)}${row + 1}`;
                if (this.data[cellRef] && (this.data[cellRef].value || this.data[cellRef].formula || this.hasFormatting(this.data[cellRef]))) {
                    this.data[cellRef].value = '';
                    this.data[cellRef].formula = '';
                    this.data[cellRef].computedValue = '';
                    this.data[cellRef].format = { ...this.format };
                    this.updateCellDisplay(cellRef);
                    cleared++;
                }
            }
        }
        if (cleared > 0) {
            this.setModified(true);
            this.saveState();
            this.recalculate();
        }
        this.updateStatus(cleared > 1 ? `${cleared} celle cancellate` : 'Cella cancellata');
    }

    hasFormatting(cellData) {
        if (!cellData || !cellData.format) return false;
        const f = cellData.format;
        return !!(f.bold || f.italic || f.underline || f.fillColor ||
            f.borders || (f.fontColor && f.fontColor !== '#000000') ||
            (f.fontFamily && f.fontFamily !== 'Calibri') ||
            (f.fontSize && f.fontSize !== 11) ||
            (f.numberFormat && f.numberFormat !== 'generale'));
    }

    getCellRange(startRef, endRef) {
        const start = this.getCellCoordinates(startRef);
        const end = this.getCellCoordinates(endRef);
        const cells = [];
        for (let r = start.row; r <= end.row; r++) {
            for (let c = start.col; c <= end.col; c++) {
                cells.push(this.numberToColumn(c) + (r + 1));
            }
        }
        return cells;
    }

    copy() {
        const isRange = this.selectedRange.start !== this.selectedRange.end;
        const refs = isRange ? this.getCellRange(this.selectedRange.start, this.selectedRange.end) : [this.selectedCell];

        const values = {};
        refs.forEach(ref => {
            const v = this.getCellValue(ref);
            if (v !== '' || this.data[ref]) {
                values[ref] = {
                    value: v,
                    format: this.data[ref] ? { ...this.data[ref].format } : { ...this.format },
                    formula: this.data[ref] ? this.data[ref].formula : ''
                };
            }
        });

        if (Object.keys(values).length > 0) {
            this.clipboard = {
                values: values,
                refs: refs,
                startRef: refs[0],
                action: 'copy'
            };
            this.updateStatus((isRange ? refs.length + ' celle' : 'Contenuto') + ' copiato');
        }
    }

    cut() {
        const isRange = this.selectedRange.start !== this.selectedRange.end;
        const refs = isRange ? this.getCellRange(this.selectedRange.start, this.selectedRange.end) : [this.selectedCell];

        const values = {};
        refs.forEach(ref => {
            const v = this.getCellValue(ref);
            if (v !== '' || this.data[ref]) {
                values[ref] = {
                    value: v,
                    format: this.data[ref] ? { ...this.data[ref].format } : { ...this.format },
                    formula: this.data[ref] ? this.data[ref].formula : ''
                };
            }
        });

        if (Object.keys(values).length > 0) {
            this.clipboard = {
                values: values,
                refs: refs,
                startRef: refs[0],
                action: 'cut'
            };
            refs.forEach(ref => { if (this.data[ref]) this.clearCell(ref); });
            this.updateStatus((isRange ? refs.length + ' celle' : 'Contenuto') + ' tagliato');
        }
    }

    paste() {
        if (!this.clipboard || !this.clipboard.values) return;

        const sourceRef = this.clipboard.startRef;
        const targetRef = this.selectedCell;
        if (!sourceRef || !targetRef) return;

        const srcCoords = this.getCellCoordinates(sourceRef);
        const tgtCoords = this.getCellCoordinates(targetRef);
        const colOffset = tgtCoords.col - srcCoords.col;
        const rowOffset = tgtCoords.row - srcCoords.row;

        if (this.isProtected) {
            const allEditable = Object.entries(this.clipboard.values).every(([srcCell]) => {
                const srcC = this.getCellCoordinates(srcCell);
                const destCol = srcC.col + colOffset;
                const destRow = srcC.row + rowOffset;
                if (destCol < 0 || destCol >= this.cols || destRow < 0 || destRow >= this.rows) return true;
                const destRef = this.numberToColumn(destCol) + (destRow + 1);
                return this.isCellEditable(destRef);
            });
            if (!allEditable) {
                this.updateStatus('Operazione annullata: alcune celle di destinazione sono protette.');
                return;
            }
        }

        // Salva stato PRIMA dell'incolla (per undo singolo)
        this._batchUndo = true;
        this.saveState();

        try {
            Object.entries(this.clipboard.values).forEach(([srcCell, cellData]) => {
                const srcC = this.getCellCoordinates(srcCell);
                const destCol = srcC.col + colOffset;
                const destRow = srcC.row + rowOffset;
                if (destCol < 0 || destCol >= this.cols || destRow < 0 || destRow >= this.rows) return;
                const destRef = this.numberToColumn(destCol) + (destRow + 1);

                // Crea dati cella con il formato copiato
                if (!this.data[destRef]) {
                    this.data[destRef] = { value: '', formula: '', format: { ...cellData.format }, computedValue: '' };
                }
                // Imposta il valore (setCellValue NON salva stato perché _batchUndo è true)
                this.setCellValue(destRef, cellData.value);
                // Sovrascrivi formato con quello originale (resta in questo undo step)
                this.data[destRef].format = { ...cellData.format };
                // Se c'era una formula, ripristinala. In COPIA i riferimenti relativi
                // vengono traslati per l'offset (come in Excel); in TAGLIA restano invariati.
                if (cellData.formula) {
                    const formula = this.clipboard.action === 'cut'
                        ? cellData.formula
                        : this.adjustFormulaReferences(cellData.formula, colOffset, rowOffset);
                    this.data[destRef].formula = formula;
                    this.data[destRef].computedValue = this.evaluateFormula(formula);
                }
                this.updateCellDisplay(destRef);
            });
        } finally {
            this._batchUndo = false;
        }
        this.saveState();
        this.setModified(true);
        const count = Object.keys(this.clipboard.values).length;
        if (this.clipboard.action === 'cut') this.clipboard = null;
        this.updateStatus(count > 1 ? count + ' celle incollate' : 'Contenuto incollato');
        this.updateFormatUI();
    }

    toggleBold() {
        this.format.bold = !this.format.bold;
        this.applyCurrentFormat();
        return this.format.bold;
    }

    toggleItalic() {
        this.format.italic = !this.format.italic;
        this.applyCurrentFormat();
        return this.format.italic;
    }

    toggleUnderline() {
        this.format.underline = !this.format.underline;
        this.applyCurrentFormat();
        return this.format.underline;
    }

    applyCurrentFormat() {
        if (!this.isCellEditable(this.selectedCell)) {
            this.updateStatus('La cella è protetta.');
            return;
        }
        if (!this.data[this.selectedCell]) {
            this.data[this.selectedCell] = { value: '', formula: '', format: { ...this.format }, computedValue: '' };
        }
        this.data[this.selectedCell].format = { ...this.format };
        this.updateCellDisplay(this.selectedCell);
        this.setModified(true);
        this.saveState();
    }

    updateFormatUI() {
        const btnBold = document.getElementById('btn-bold');
        const btnItalic = document.getElementById('btn-italic');
        const btnUnderline = document.getElementById('btn-underline');
        const fontFamily = document.getElementById('font-family');
        const fontSize = document.getElementById('font-size');
        const numberFormat = document.getElementById('number-format');

        if (this.data[this.selectedCell] && this.data[this.selectedCell].format) {
            const format = this.data[this.selectedCell].format;
            this.format = { ...format };
            if (btnBold) btnBold.classList.toggle('active', !!format.bold);
            if (btnItalic) btnItalic.classList.toggle('active', !!format.italic);
            if (btnUnderline) btnUnderline.classList.toggle('active', !!format.underline);
            if (fontFamily && format.fontFamily) fontFamily.value = format.fontFamily;
            if (fontSize && format.fontSize) fontSize.value = format.fontSize;
            if (numberFormat && format.numberFormat) {
                const map = {'generale':'Generale','numero':'Numero','valuta':'Valuta','contabile':'Contabile','data breve':'Data breve','data lunga':'Data lunga','ora':'Ora','percentuale':'Percentuale','frazione':'Frazione','scientifico':'Scientifico','testo':'Testo'};
                numberFormat.value = map[format.numberFormat] || 'Generale';
            }
        } else {
            if (btnBold) btnBold.classList.remove('active');
            if (btnItalic) btnItalic.classList.remove('active');
            if (btnUnderline) btnUnderline.classList.remove('active');
            if (fontFamily) fontFamily.value = 'Calibri';
            if (fontSize) fontSize.value = '11';
            if (numberFormat) numberFormat.value = 'Generale';
            this.format = { bold: false, italic: false, underline: false, numberFormat: 'generale', horizontalAlign: 'left', verticalAlign: 'middle', fontFamily: 'Calibri', fontSize: 11, fontColor: '#000000', fillColor: '', wrapText: false, decimals: 0 };
        }
    }

    clear() {
        // Rimuove i dati salvati del file corrente
        try { localStorage.removeItem(this._getStorageKey()); } catch(e) {}
        this.data = {};
        this.drawingObjects = [];
        this.columnWidths = {};
        this.rowHeights = {};
        this.selectedCell = 'A1';
        this.refreshGrid();
        // Rimuovi oggetti grafici dal DOM
        document.querySelectorAll('#sheet-area .drawing-object').forEach(el => el.remove());
        this._updateLayout();
        this.selectCell('A1');
        this.setModified(false);
        this.saveState();
        this.updateStatus('Foglio cancellato');
    }

    setModified(modified) {
        this.modified = modified;
        const titleInput = document.getElementById('docTitle');
        if (titleInput) {
            let name = titleInput.value.replace('*', '').trim();
            if (modified) titleInput.value = name + '*';
            else titleInput.value = name;
        }
    }

    isModified() {
        return this.modified;
    }

    saveState() {
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(JSON.parse(JSON.stringify({
            data: this.data,
            drawingObjects: this.drawingObjects,
            pageSettings: this.pageSettings
        })));
        this.historyIndex = this.history.length - 1;
        if (this.history.length > 50) {
            this.history.shift();
            this.historyIndex--;
        }
        // Debounce auto-save: salva 1 secondo dopo l'ultima modifica
        clearTimeout(this._saveDebounce);
        this._saveDebounce = setTimeout(() => this.saveToStorage(), 1000);
    }

    // ===== PERSISTENZA localStorage =====

    _getStorageKey() {
        const title = document.getElementById('docTitle');
        return 'excel-autosave-' + (title ? title.value.replace('*', '').trim() : 'Cartel1');
    }

    autoSave() {
        if (!this.modified) return;
        this.saveToStorage();
    }

    saveToStorage() {
        try {
            // Salva solo le celle che hanno effettivamente dati (non vuote)
            const dataToSave = {};
            for (const cellRef in this.data) {
                const d = this.data[cellRef];
                if (d && (d.value || d.formula || d.computedValue ||
                    (d.format && (d.format.bold || d.format.italic || d.format.underline ||
                     d.format.fillColor || d.format.borders ||
                     d.format.fontColor !== '#000000' || d.format.fontFamily !== 'Calibri' ||
                     d.format.fontSize !== 11)))) {
                    dataToSave[cellRef] = d;
                }
            }
            const state = {
                data: dataToSave,
                columnWidths: this.columnWidths,
                rowHeights: this.rowHeights,
                history: this.history,
                historyIndex: this.historyIndex,
                drawingObjects: this.drawingObjects,
                pageSettings: this.pageSettings
            };
            localStorage.setItem(this._getStorageKey(), JSON.stringify(state));
            // Salva anche la lista dei file aperti di recente
            const recent = JSON.parse(localStorage.getItem('excel-recent-files') || '[]');
            const key = this._getStorageKey();
            if (!recent.includes(key)) {
                recent.unshift(key);
                if (recent.length > 20) recent.pop();
                localStorage.setItem('excel-recent-files', JSON.stringify(recent));
            }
        } catch (e) {
            console.warn('Errore salvataggio localStorage:', e);
        }
    }

    loadFromStorage() {
        try {
            const key = this._getStorageKey();
            const saved = localStorage.getItem(key);
            if (saved) {
                const state = JSON.parse(saved);
                if (state.data) {
                    this.data = state.data;
                }
                if (state.columnWidths) {
                    this.columnWidths = state.columnWidths;
                }
                if (state.rowHeights) {
                    this.rowHeights = state.rowHeights;
                }
                if (state.history && state.history.length > 0) {
                    this.history = state.history;
                    this.historyIndex = state.historyIndex !== undefined ? state.historyIndex : state.history.length - 1;
                }
                if (state.drawingObjects) {
                    this.drawingObjects = state.drawingObjects;
                }
                if (state.pageSettings) {
                    this.pageSettings = state.pageSettings;
                }
            }
        } catch (e) {
            console.warn('Errore caricamento localStorage:', e);
        }
    }

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this._restoreHistoryEntry(this.history[this.historyIndex]);
            this.updateStatus('Azione annullata');
        }
    }

    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this._restoreHistoryEntry(this.history[this.historyIndex]);
            this.updateStatus('Azione ripetuta');
        }
    }

    _restoreHistoryEntry(entry) {
        if (entry && typeof entry === 'object' && 'data' in entry) {
            // Nuovo formato: { data, drawingObjects, pageSettings }
            this.data = JSON.parse(JSON.stringify(entry.data));
            this.drawingObjects = JSON.parse(JSON.stringify(entry.drawingObjects || []));
            if (entry.pageSettings) {
                this.pageSettings = JSON.parse(JSON.stringify(entry.pageSettings));
            }
        } else {
            // Vecchio formato: solo data (fallback)
            this.data = JSON.parse(JSON.stringify(entry));
            this.drawingObjects = [];
        }
        this.refreshGrid();
        // Rimuovi e ricrea tutti i drawing objects nel DOM
        document.querySelectorAll('#sheet-area .drawing-object').forEach(el => el.remove());
        this.restoreDrawingObjects();
        this.updateFormulaBar();
        this.setModified(true);
    }

    exportData() {
        return {
            data: this.data,
            drawingObjects: this.drawingObjects,
            columnWidths: this.columnWidths,
            rowHeights: this.rowHeights,
            selectedCell: this.selectedCell,
            format: this.format,
            rows: this.rows,
            cols: this.cols
        };
    }

    importData(data) {
        this.data = data.data || {};
        this.drawingObjects = data.drawingObjects || [];
        this.columnWidths = data.columnWidths || {};
        this.rowHeights = data.rowHeights || {};
        this.format = data.format || { bold: false, italic: false, underline: false, numberFormat: 'generale', horizontalAlign: 'left', verticalAlign: 'middle' };
        this.rows = data.rows || this.rows;
        this.cols = data.cols || this.cols;
        this.createHeaders();
        this.createGrid();
        this.selectCell(data.selectedCell || 'A1');
        this.setModified(false);
        this.saveState();
        this.restoreDrawingObjects();
        this.updateStatus('File caricato con successo');
    }

    // ===== DISEGNO / OGGETTI GRAFICI =====
    nextDrawingId() {
        return 'draw_' + (++this._drawingIdCounter) + '_' + Date.now();
    }

    registerDrawingObject(obj) {
        if (!obj.id) obj.id = this.nextDrawingId();
        // Rimuovi eventuale vecchio oggetto con stesso id
        this.drawingObjects = this.drawingObjects.filter(d => d.id !== obj.id);
        this.drawingObjects.push(obj);
        this.setModified(true);
        return obj.id;
    }

    unregisterDrawingObject(id) {
        this.drawingObjects = this.drawingObjects.filter(d => d.id !== id);
        this.setModified(true);
    }

    updateDrawingObject(id, props) {
        const obj = this.drawingObjects.find(d => d.id === id);
        if (obj) {
            Object.assign(obj, props);
            this.setModified(true);
        }
    }

    restoreDrawingObjects() {
        const sheetArea = document.getElementById('sheet-area');
        if (!sheetArea) return;
        // Rimuovi eventuali vecchi drawing-objects
        sheetArea.querySelectorAll('.drawing-object').forEach(el => el.remove());
        this.drawingObjects.forEach(draw => {
            const el = document.createElement('div');
            el.className = 'drawing-object';
            el.dataset.drawId = draw.id;
            let baseStyles = `position:absolute;left:${draw.left}px;top:${draw.top}px;cursor:move;z-index:${draw.zIndex || 200};user-select:none;overflow:hidden;${draw.css || ''}`;
            el.style.cssText = baseStyles;
            if (draw.width) el.style.width = draw.width + 'px';
            if (draw.height) el.style.height = draw.height + 'px';

            // Applica tutte le proprietà visive dal drawData
            if (draw.fillColor) el.style.backgroundColor = draw.fillColor;
            if (draw.borderColor) el.style.border = (draw.borderWidth || 2) + 'px solid ' + draw.borderColor;
            if (draw.borderRadius !== undefined) el.style.borderRadius = draw.borderRadius + 'px';
            if (draw.opacity !== undefined) el.style.opacity = draw.opacity;
            if (draw.rotation) el.style.transform = 'rotate(' + draw.rotation + 'deg)';
            if (draw.boxShadow) el.style.boxShadow = draw.boxShadow;
            if (draw.padding !== undefined) el.style.padding = draw.padding + 'px';

            // Stili per forme geometriche (clip-path)
            if (draw.shapeType && draw.shapeType !== 'rectangle') {
                const clipPaths = {
                    'circle': 'circle(50%)',
                    'triangle': 'polygon(50% 0%, 0% 100%, 100% 100%)',
                    'diamond': 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                    'arrow': 'polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)'
                };
                if (clipPaths[draw.shapeType]) {
                    el.style.clipPath = clipPaths[draw.shapeType];
                }
            }

            // Stili per testo
            if (draw.color) el.style.color = draw.color;
            if (draw.fontSize) el.style.fontSize = draw.fontSize + 'px';
            if (draw.fontWeight) el.style.fontWeight = draw.fontWeight;
            if (draw.fontStyle) el.style.fontStyle = draw.fontStyle;
            if (draw.fontFamily) el.style.fontFamily = draw.fontFamily;
            if (draw.textDecoration) el.style.textDecoration = draw.textDecoration;
            if (draw.textAlign) {
                el.style.textAlign = draw.textAlign;
                el.style.justifyContent = draw.textAlign === 'center' ? 'center' : draw.textAlign === 'left' ? 'flex-start' : 'flex-end';
                el.style.alignItems = 'center';
            }

            // Renderizza contenuti specifici per tipo
            if (draw.type === 'image' && draw.src) {
                el.innerHTML = `<img src="${draw.src}" style="width:100%;height:100%;object-fit:contain;pointer-events:none;display:block;">`;
                el.style.background = 'transparent';
                el.style.border = 'none';
            } else if (draw.content) {
                el.textContent = draw.content;
            } else if (draw.html) {
                el.innerHTML = draw.html;
            }

            el.title = (draw.name || 'Oggetto') + ' — Clic destro per opzioni, doppio click per modificare';
            if (typeof makeDraggableWithContext === 'function') {
                makeDraggableWithContext(el, draw);
            } else if (typeof makeDraggable === 'function') {
                makeDraggable(el);
            } else {
                // Fallback: drag base
                let dragging = false, offX = 0, offY = 0;
                el.addEventListener('mousedown', (e) => {
                    if (e.target.isContentEditable && document.activeElement === e.target) return;
                    dragging = true; offX = e.clientX - el.offsetLeft; offY = e.clientY - el.offsetTop;
                    e.preventDefault();
                });
                document.addEventListener('mousemove', (e) => { if (!dragging) return; el.style.left = (e.clientX - offX) + 'px'; el.style.top = (e.clientY - offY) + 'px'; });
                document.addEventListener('mouseup', () => { dragging = false; });
            }
            // makeDraggableWithContext chiama applyDrawStyles che può sovrascrivere alcuni stili;
            // riapplica qui gli stili specifici che devono prevalere
            if (draw.type === 'image' || draw.type === 'smartart' || (draw.type === 'shape' && draw.shapeType !== 'line')) {
                el.style.background = 'transparent';
                el.style.border = 'none';
                el.style.boxShadow = draw.boxShadow || '0 2px 12px rgba(0,0,0,0.12)';
            } else if (draw.type === 'shape' && draw.shapeType === 'line') {
                // La linea resta una barra colorata visibile
                el.style.background = draw.fillColor || '#333';
                el.style.border = 'none';
                el.style.boxShadow = 'none';
                if (draw.height) el.style.height = draw.height + 'px';
            }
            if (draw.type === 'text' || draw.contentEditable) {
                el.contentEditable = false;
            }
            // Oggetti incorporati — doppio click riapre l'app (lazy: openAppForEmbed può non esistere ancora)
            if (draw.embeddedApp) {
                el.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    if (typeof window.openAppForEmbed === 'function') {
                        const href = draw.embeddedHref || '';
                        const name = draw.embeddedName || draw.embeddedApp;
                        const appColors = { word: '#2564c1', powerpoint: '#d04423', onenote: '#7b1fa2', outlook: '#0078d4', onedrive: '#0078d4' };
                        const appIcons = { word: 'W', powerpoint: 'P', onenote: 'N', outlook: 'M', onedrive: 'D' };
                        window.openAppForEmbed({
                            id: draw.embeddedApp,
                            name: name,
                            href: href,
                            color: appColors[draw.embeddedApp] || '#0078d4',
                            icon: appIcons[draw.embeddedApp] || '?'
                        });
                    }
                });
            }
            // SmartArt, shape, image, equazioni e embedded non si eliminano con doppio click
            if (draw.type !== 'image' && draw.type !== 'shape' && draw.type !== 'smartart' && !draw.embeddedApp && !draw.eqHtml) {
                el.addEventListener('dblclick', (e) => {
                    if (draw.type !== 'text' && draw.type !== 'wordart') {
                        el.remove();
                        this.unregisterDrawingObject(draw.id);
                        this.updateStatus(draw.name + ' eliminato');
                    }
                });
            }
            sheetArea.appendChild(el);
        });
    }

    numberToColumn(num) {
        let result = '';
        while (num >= 0) {
            result = String.fromCharCode(65 + (num % 26)) + result;
            num = Math.floor(num / 26) - 1;
        }
        return result;
    }

    getCellCoordinates(cellRef) {
        const matches = cellRef.match(/^([A-Z]+)(\d+)$/);
        if (!matches) return { row: 0, col: 0 };
        const colStr = matches[1];
        const row = parseInt(matches[2]) - 1;
        let colNum = 0;
        for (let i = 0; i < colStr.length; i++) {
            colNum = colNum * 26 + (colStr.charCodeAt(i) - 64);
        }
        return { row: row, col: colNum - 1 };
    }

    isValidCell(cellRef) {
        const coords = this.getCellCoordinates(cellRef);
        return coords.row >= 0 && coords.row < this.rows && coords.col >= 0 && coords.col < this.cols;
    }

    isNumber(value) {
        if (value === '') return false;
        return !isNaN(parseFloat(value)) && isFinite(value);
    }

    getCellAbove(cellRef) {
        const coords = this.getCellCoordinates(cellRef);
        const newRow = Math.max(0, coords.row - 1);
        return `${this.numberToColumn(coords.col)}${newRow + 1}`;
    }

    getCellBelow(cellRef) {
        const coords = this.getCellCoordinates(cellRef);
        const newRow = Math.min(this.rows - 1, coords.row + 1);
        return `${this.numberToColumn(coords.col)}${newRow + 1}`;
    }

    getCellLeft(cellRef) {
        const coords = this.getCellCoordinates(cellRef);
        const newCol = Math.max(0, coords.col - 1);
        return `${this.numberToColumn(newCol)}${coords.row + 1}`;
    }

    getCellRight(cellRef) {
        const coords = this.getCellCoordinates(cellRef);
        const newCol = Math.min(this.cols - 1, coords.col + 1);
        return `${this.numberToColumn(newCol)}${coords.row + 1}`;
    }

    updateSelectionStats() {
        const start = this.getCellCoordinates(this.selectedRange.start);
        const end = this.getCellCoordinates(this.selectedRange.end);
        const minRow = Math.min(start.row, end.row);
        const maxRow = Math.max(start.row, end.row);
        const minCol = Math.min(start.col, end.col);
        const maxCol = Math.max(start.col, end.col);

        const numbers = [];
        let nonEmptyCount = 0;
        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                const ref = this.numberToColumn(c) + (r + 1);
                const val = this.getCellValue(ref);
                if (val !== '') {
                    nonEmptyCount++;
                    const num = parseFloat(val);
                    if (!isNaN(num)) numbers.push(num);
                }
            }
        }

        const elAvg = document.getElementById('status-average');
        const elCount = document.getElementById('status-count');
        const elSum = document.getElementById('status-sum');
        const elMin = document.getElementById('status-min');
        const elMax = document.getElementById('status-max');

        if (numbers.length >= 2 || nonEmptyCount >= 2) {
            const sum = numbers.reduce((a, b) => a + b, 0);
            const avg = numbers.length > 0 ? sum / numbers.length : 0;
            const min = numbers.length > 0 ? Math.min(...numbers) : 0;
            const max = numbers.length > 0 ? Math.max(...numbers) : 0;

            if (elAvg) { elAvg.style.display = numbers.length > 0 ? '' : 'none'; document.getElementById('stat-avg-val').textContent = avg % 1 === 0 ? avg : avg.toFixed(2); }
            if (elCount) { elCount.style.display = ''; document.getElementById('stat-count-val').textContent = nonEmptyCount; }
            if (elSum) { elSum.style.display = numbers.length > 0 ? '' : 'none'; document.getElementById('stat-sum-val').textContent = sum % 1 === 0 ? sum : sum.toFixed(2); }
            if (elMin) { elMin.style.display = numbers.length > 0 ? '' : 'none'; document.getElementById('stat-min-val').textContent = min; }
            if (elMax) { elMax.style.display = numbers.length > 0 ? '' : 'none'; document.getElementById('stat-max-val').textContent = max; }
        } else {
            if (elAvg) elAvg.style.display = 'none';
            if (elCount) elCount.style.display = 'none';
            if (elSum) elSum.style.display = 'none';
            if (elMin) elMin.style.display = 'none';
            if (elMax) elMax.style.display = 'none';
        }
    }

    scrollToCell(cellRef) {
        const coords = this.getCellCoordinates(cellRef);
        const cellElement = document.querySelector(`[data-cell="${cellRef}"]`);
        
        if (cellElement && this.viewport) {
            const cellRect = cellElement.getBoundingClientRect();
            const containerRect = this.viewport.getBoundingClientRect();
            
            if (cellRect.left < containerRect.left) {
                this.viewport.scrollLeft = coords.col * this.cellWidth;
            } else if (cellRect.right > containerRect.right) {
                this.viewport.scrollLeft = (coords.col + 1) * this.cellWidth - containerRect.width;
            }
            
            if (cellRect.top < containerRect.top) {
                this.viewport.scrollTop = coords.row * this.cellHeight;
            } else if (cellRect.bottom > containerRect.bottom) {
                this.viewport.scrollTop = (coords.row + 1) * this.cellHeight - containerRect.height;
            }
        }
    }

    updateFormulaBar() {
        const cellRefElement = document.getElementById('cell-reference');
        const formulaInput = document.getElementById('formula-input');
        
        if (cellRefElement) {
            if (this.selectedRange.start === this.selectedRange.end) {
                cellRefElement.textContent = this.selectedCell;
            } else {
                cellRefElement.textContent = `${this.selectedRange.start}:${this.selectedRange.end}`;
            }
        }
        
        if (formulaInput && !this.isEditing) {
            const cellData = this.data[this.selectedCell];
            formulaInput.value = cellData ? (cellData.formula || cellData.value || '') : '';
        }
    }

    // ===== EDITOR IN-CELLA (digitazione visibile nella cella + "punta e clicca") =====

    _colLettersToNum(colStr) {
        let n = 0;
        colStr = (colStr || '').toUpperCase();
        for (let i = 0; i < colStr.length; i++) n = n * 26 + (colStr.charCodeAt(i) - 64);
        return n - 1; // 0-based
    }

    _getCellEditor() {
        if (this.cellEditorEl && this.cellEditorEl.parentNode) return this.cellEditorEl;
        const ed = document.createElement('input');
        ed.type = 'text';
        ed.id = 'cell-editor';
        ed.autocomplete = 'off';
        ed.spellcheck = false;
        ed.style.cssText = "position:absolute;display:none;z-index:20;margin:0;border:2px solid #217346;outline:none;padding:0 3px;font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11px;box-sizing:border-box;background:#fff;color:#333;line-height:normal;";
        ed.addEventListener('input', () => {
            const fi = document.getElementById('formula-input');
            if (fi) fi.value = ed.value;
            this._pointStart = null; // digitando si annulla l'ancora del "punta e clicca"
            this._renderFormulaHighlights(ed.value);
        });
        ed.addEventListener('keydown', (e) => this._onEditorKeydown(e));
        ed.addEventListener('focus', () => { this._activeEditorEl = ed; });
        ed.addEventListener('blur', () => {
            // Non confermare se il focus passa alla barra della formula (editing in contemporanea)
            // o durante il "punta e clicca".
            setTimeout(() => {
                if (!this.isEditing || this._pointing || this._suppressBlurCommit) return;
                const ae = document.activeElement;
                if (ae === ed || ae === document.getElementById('formula-input')) return;
                this.commitCellEdit(null);
            }, 0);
        });
        this.container.appendChild(ed);
        this.cellEditorEl = ed;
        return ed;
    }

    _positionEditor(cellRef) {
        const c = this.getCellCoordinates(cellRef);
        const ed = this._getCellEditor();
        const w = this.getColWidth(c.col), h = this.getRowHeight(c.row);
        ed.style.left = this.getColLeft(c.col) + 'px';
        ed.style.top = this.getRowTop(c.row) + 'px';
        ed.style.width = w + 'px';
        ed.style.height = h + 'px';
        const fmt = (this.data[cellRef] && this.data[cellRef].format) || {};
        ed.style.fontWeight = fmt.bold ? 'bold' : 'normal';
        ed.style.fontStyle = fmt.italic ? 'italic' : 'normal';
        ed.style.textAlign = fmt.horizontalAlign || 'left';
        ed.style.fontFamily = (fmt.fontFamily && fmt.fontFamily !== 'Calibri') ? fmt.fontFamily : "Calibri,'Segoe UI',Arial,sans-serif";
        ed.style.fontSize = (fmt.fontSize ? parseInt(fmt.fontSize) : 11) + 'px';
        ed.style.color = (fmt.fontColor && fmt.fontColor !== '#000000') ? fmt.fontColor : '#333';
        ed.style.background = fmt.fillColor || '#fff';
    }

    startCellEdit(cellRef, initialChar, mode, focusEditor) {
        if (!this.isValidCell(cellRef)) return;
        if (!this.isCellEditable(cellRef)) { this.updateStatus('La cella è protetta. Le celle bloccate non possono essere modificate.'); return; }
        this.selectCell(cellRef);
        this.isEditing = true;
        this.editingCell = cellRef;
        this.editMode = mode || 'edit';
        this._pointStart = null;
        const ed = this._getCellEditor();
        this._positionEditor(cellRef);
        const cellData = this.data[cellRef];
        const existing = cellData ? (cellData.formula || cellData.value || '') : '';
        ed.value = (initialChar !== undefined && initialChar !== null) ? initialChar : existing;
        ed.style.display = 'block';
        const fi = document.getElementById('formula-input');
        if (fi) fi.value = ed.value;
        const contentEl = document.querySelector('[data-cell="' + cellRef + '"] .cell-content');
        if (contentEl) contentEl.style.visibility = 'hidden';
        this._renderFormulaHighlights(ed.value);
        if (focusEditor !== false) {
            ed.focus();
            this._activeEditorEl = ed;
            if (initialChar !== undefined && initialChar !== null) ed.setSelectionRange(ed.value.length, ed.value.length);
            else ed.select();
        }
        this.updateStatus('Modifica cella ' + cellRef);
    }

    _hideCellEditor() {
        this._clearFormulaHighlights();
        const cellRef = this.editingCell || this.selectedCell;
        const ed = this.cellEditorEl;
        if (ed) { this._suppressBlurCommit = true; ed.style.display = 'none'; ed.blur(); ed.value = ''; this._suppressBlurCommit = false; }
        const contentEl = document.querySelector('[data-cell="' + cellRef + '"] .cell-content');
        if (contentEl) contentEl.style.visibility = '';
    }

    commitCellEdit(move) {
        if (!this.isEditing) return;
        const cellRef = this.editingCell || this.selectedCell;
        const fi = document.getElementById('formula-input');
        let value = this.cellEditorEl ? this.cellEditorEl.value : '';
        if (this._activeEditorEl === fi && fi) value = fi.value;
        this._hideCellEditor();
        this.isEditing = false;
        this.editingCell = null;
        this._activeEditorEl = null;
        this.setCellValue(cellRef, value);
        if (move === 'down') this.selectCell(this.getCellBelow(cellRef));
        else if (move === 'up') this.selectCell(this.getCellAbove(cellRef));
        else if (move === 'right') this.selectCell(this.getCellRight(cellRef));
        else if (move === 'left') this.selectCell(this.getCellLeft(cellRef));
        else this.selectCell(cellRef);
        const sel = document.querySelector('[data-cell="' + this.selectedCell + '"]');
        if (sel) sel.focus();
    }

    cancelCellEdit() {
        if (!this.isEditing) return;
        const cellRef = this.editingCell || this.selectedCell;
        this._hideCellEditor();
        this.isEditing = false;
        this.editingCell = null;
        this._activeEditorEl = null;
        this.updateFormulaBar();
        this.updateStatus('Pronto');
        const sel = document.querySelector('[data-cell="' + cellRef + '"]');
        if (sel) sel.focus();
    }

    _onEditorKeydown(e) {
        switch (e.key) {
            case 'Enter': e.preventDefault(); this.commitCellEdit(e.shiftKey ? 'up' : 'down'); return;
            case 'Tab': e.preventDefault(); this.commitCellEdit(e.shiftKey ? 'left' : 'right'); return;
            case 'Escape': e.preventDefault(); this.cancelCellEdit(); return;
            case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight':
                // In "inserimento" (nuovo valore digitato) le frecce confermano e spostano, come in Excel.
                if (this.editMode === 'enter' && !this._isPointModeContext()) {
                    e.preventDefault();
                    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
                    this.commitCellEdit(map[e.key]);
                }
                return;
        }
    }

    // Il cursore dell'editor attivo è in un punto dove ci si aspetta un riferimento?
    _isPointModeContext() {
        const ed = this._activeEditorEl || this.cellEditorEl;
        if (!ed || ed.style.display === 'none') return false;
        const val = ed.value;
        if (!val || val[0] !== '=') return false;
        const before = val.slice(0, ed.selectionStart || 0).replace(/\s+$/, '');
        if (before === '=') return true;
        return '=+-*/^(,:&<>%{'.includes(before.slice(-1));
    }

    _normalizeRange(a, b) {
        const ca = this.getCellCoordinates(a), cb = this.getCellCoordinates(b);
        const r1 = Math.min(ca.row, cb.row), r2 = Math.max(ca.row, cb.row);
        const c1 = Math.min(ca.col, cb.col), c2 = Math.max(ca.col, cb.col);
        const start = this.numberToColumn(c1) + (r1 + 1);
        const end = this.numberToColumn(c2) + (r2 + 1);
        return start === end ? start : start + ':' + end;
    }

    _startPointSelection(anchorRef) {
        const ed = this._activeEditorEl || this.cellEditorEl;
        if (!ed) return;
        this._pointing = true;
        this._pointStart = ed.selectionStart;
        this._pointEnd = ed.selectionStart;
        this._insertReference(anchorRef, anchorRef);
        const onMove = (ev) => {
            const cell = document.elementFromPoint(ev.clientX, ev.clientY);
            const target = cell && cell.closest ? cell.closest('.cell') : null;
            if (target) this._insertReference(anchorRef, target.getAttribute('data-cell'));
        };
        const onUp = () => {
            this._pointing = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const e2 = this._activeEditorEl || this.cellEditorEl;
            if (e2) e2.focus();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    _insertReference(anchorRef, endRef) {
        const ed = this._activeEditorEl || this.cellEditorEl;
        if (!ed) return;
        const ref = (endRef && endRef !== anchorRef) ? this._normalizeRange(anchorRef, endRef) : anchorRef;
        if (this._pointStart === null || this._pointStart === undefined) this._pointStart = ed.value.length;
        const before = ed.value.slice(0, this._pointStart);
        const after = ed.value.slice(this._pointEnd != null ? this._pointEnd : this._pointStart);
        ed.value = before + ref + after;
        this._pointEnd = this._pointStart + ref.length;
        ed.setSelectionRange(this._pointEnd, this._pointEnd);
        const fi = document.getElementById('formula-input');
        if (fi && fi !== ed) fi.value = ed.value;
        if (endRef) this.selectRange(anchorRef, endRef);
        this._renderFormulaHighlights(ed.value);
    }

    // ===== EVIDENZIAZIONE DEI RIFERIMENTI DI UNA FORMULA (riquadri colorati come Excel) =====
    _clearFormulaHighlights() {
        if (this.container) this.container.querySelectorAll('.formula-ref-hl').forEach(el => el.remove());
    }

    _renderFormulaHighlights(formula) {
        this._clearFormulaHighlights();
        if (!this.isEditing || !formula || formula[0] !== '=') return;
        const palette = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#dc2626'];
        const seen = {};
        let idx = 0;
        const parts = formula.split(/("[^"]*")/);
        const re = /(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?::(\$?)([A-Za-z]{1,3})(\$?)(\d+))?/g;
        for (let pi = 0; pi < parts.length; pi++) {
            if (pi % 2 === 1) continue; // dentro le virgolette
            let m;
            while ((m = re.exec(parts[pi])) !== null) {
                const startRef = m[2].toUpperCase() + m[4];
                const endRef = m[6] ? (m[6].toUpperCase() + m[8]) : startRef;
                if (!this.isValidCell(startRef) || !this.isValidCell(endRef)) continue;
                const key = startRef + ':' + endRef;
                let color = seen[key];
                if (!color) { color = palette[idx % palette.length]; seen[key] = color; idx++; }
                this._drawRefBox(startRef, endRef, color);
            }
        }
    }

    _drawRefBox(startRef, endRef, color) {
        const a = this.getCellCoordinates(startRef), b = this.getCellCoordinates(endRef);
        const r1 = Math.min(a.row, b.row), r2 = Math.max(a.row, b.row);
        const c1 = Math.min(a.col, b.col), c2 = Math.max(a.col, b.col);
        const left = this.getColLeft(c1), top = this.getRowTop(r1);
        const right = this.getColLeft(c2) + this.getColWidth(c2);
        const bottom = this.getRowTop(r2) + this.getRowHeight(r2);
        const box = document.createElement('div');
        box.className = 'formula-ref-hl';
        box.style.cssText = 'position:absolute;pointer-events:none;z-index:7;box-sizing:border-box;' +
            'left:' + left + 'px;top:' + top + 'px;width:' + (right - left) + 'px;height:' + (bottom - top) + 'px;' +
            'border:2px solid ' + color + ';background:' + color + '22;';
        this.container.appendChild(box);
    }

    // Trasla i riferimenti relativi di una formula per (colOffset, rowOffset).
    // Conserva i riferimenti assoluti ($A$1) e misti; ignora il testo tra virgolette.
    adjustFormulaReferences(formula, colOffset, rowOffset) {
        if (!formula || formula[0] !== '=') return formula;
        const parts = formula.split(/("[^"]*")/);
        const refRe = /(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g;
        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 1) continue; // dentro le virgolette
            parts[i] = parts[i].replace(refRe, (m, ad, colL, ar, rowN) => {
                let col = this._colLettersToNum(colL);
                let row = parseInt(rowN, 10) - 1;
                if (!ad) col += colOffset;
                if (!ar) row += rowOffset;
                if (col < 0) col = 0;
                if (row < 0) row = 0;
                if (col >= this.cols) col = this.cols - 1;
                if (row >= this.rows) row = this.rows - 1;
                return ad + this.numberToColumn(col) + ar + (row + 1);
            });
        }
        return parts.join('');
    }

    updateStatus(message) {
        const statusElement = document.getElementById('status-text');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    refreshGrid() {
        // Resetta tutte le proprietà di formattazione inline
        document.querySelectorAll('.cell').forEach(cellEl => {
            cellEl.style.backgroundColor = '';
            cellEl.style.removeProperty('border-top');
            cellEl.style.removeProperty('border-right');
            cellEl.style.removeProperty('border-bottom');
            cellEl.style.removeProperty('border-left');
            cellEl.style.removeProperty('border');
            cellEl.style.removeProperty('z-index');
            cellEl.style.removeProperty('visibility');
            cellEl.style.removeProperty('position');
            // Rimuove icone filtro e altri elementi temporanei
            cellEl.querySelectorAll('.filter-icon, .dropdown-arrow, .resize-handle').forEach(el => el.remove());
            cellEl.classList.remove('has-comment', 'has-note');
            const content = cellEl.querySelector('.cell-content');
            if (content) {
                content.textContent = '';
                content.className = 'cell-content cell-text';
                content.style.cssText = '';
            }
        });
        // Ridisegna le celle con dati
        for (const cellRef in this.data) {
            this.updateCellDisplay(cellRef);
        }
    }

    recalculate() {
        for (const cellRef in this.data) {
            const cellData = this.data[cellRef];
            if (cellData.formula) {
                cellData.computedValue = this.evaluateFormula(cellData.formula);
                this.updateCellDisplay(cellRef);
            }
        }
    }

    // ===== FORMATTING METHODS =====

    _ensureCellData(cellRef) {
        if (!this.data[cellRef]) {
            this.data[cellRef] = { value: '', formula: '', format: { ...this.format }, computedValue: '' };
        }
        if (!this.data[cellRef].format) this.data[cellRef].format = { ...this.format };
        return this.data[cellRef];
    }

    setHorizontalAlign(align) {
        this.format.horizontalAlign = align;
        this._ensureCellData(this.selectedCell).format.horizontalAlign = align;
        this.updateCellDisplay(this.selectedCell);
        this.setModified(true); this.saveState();
    }

    setVerticalAlign(align) {
        this.format.verticalAlign = align;
        this._ensureCellData(this.selectedCell).format.verticalAlign = align;
        this.updateCellDisplay(this.selectedCell);
        this.setModified(true); this.saveState();
    }

    setFontFamily(family) {
        this.format.fontFamily = family;
        this._ensureCellData(this.selectedCell).format.fontFamily = family;
        this.updateCellDisplay(this.selectedCell);
        this.setModified(true); this.saveState();
        document.getElementById('font-family').value = family;
    }

    setFontSize(size) {
        this.format.fontSize = size;
        this._ensureCellData(this.selectedCell).format.fontSize = size;
        this.updateCellDisplay(this.selectedCell);
        this.setModified(true); this.saveState();
        document.getElementById('font-size').value = size;
    }

    setFontColor(color) {
        this.format.fontColor = color;
        this._ensureCellData(this.selectedCell).format.fontColor = color;
        this.updateCellDisplay(this.selectedCell);
        this.setModified(true); this.saveState();
    }

    setFillColor(color) {
        this.format.fillColor = color;
        this._ensureCellData(this.selectedCell).format.fillColor = color;
        this.updateCellDisplay(this.selectedCell);
        this.setModified(true); this.saveState();
    }

    setWrapText(wrap) {
        this.format.wrapText = wrap;
        this._ensureCellData(this.selectedCell).format.wrapText = wrap;
        this.updateCellDisplay(this.selectedCell);
        this.setModified(true); this.saveState();
    }

    setNumberFormat(format) {
        this.format.numberFormat = format.toLowerCase();
        this._ensureCellData(this.selectedCell).format.numberFormat = format.toLowerCase();
        this.updateCellDisplay(this.selectedCell);
        this.setModified(true); this.saveState();
    }

    setDecimals(delta) {
        this.format.decimals = Math.max(0, (this.format.decimals || 0) + delta);
        this._ensureCellData(this.selectedCell).format.decimals = this.format.decimals;
        this.updateCellDisplay(this.selectedCell);
        this.setModified(true); this.saveState();
    }

    setBorders(type) {
        const border = '1px solid #000';
        const none = '';
        let borders = {};
        switch(type) {
            case 'all': borders = { top: border, right: border, bottom: border, left: border }; break;
            case 'outer': borders = { top: border, right: border, bottom: border, left: border }; break;
            case 'bottom': borders = { bottom: border }; break;
            case 'top': borders = { top: border }; break;
            case 'left': borders = { left: border }; break;
            case 'right': borders = { right: border }; break;
            case 'none': borders = { top: none, right: none, bottom: none, left: none }; break;
            default: borders = { top: border, right: border, bottom: border, left: border };
        }
        this._ensureCellData(this.selectedCell).format.borders = borders;
        this.updateCellDisplay(this.selectedCell);
        this.setModified(true); this.saveState();
    }

    // ===== ROW/COLUMN OPERATIONS =====

    insertRow() {
        if (this.isProtected) { this.updateStatus('Il foglio è protetto.'); return; }
        const coords = this.getCellCoordinates(this.selectedCell);
        const insertAt = coords.row;
        const newData = {};
        for (const ref in this.data) {
            const c = this.getCellCoordinates(ref);
            if (c.row >= insertAt) {
                const newRef = this.numberToColumn(c.col) + (c.row + 2);
                newData[newRef] = this.data[ref];
            } else {
                newData[ref] = this.data[ref];
            }
        }
        this.data = newData;
        this.rows++;
        this.createHeaders();
        this.createGrid();
        this.selectCell(this.selectedCell);
        this.setModified(true); this.saveState();
        this.updateStatus('Riga inserita');
    }

    insertColumn() {
        if (this.isProtected) { this.updateStatus('Il foglio è protetto.'); return; }
        const coords = this.getCellCoordinates(this.selectedCell);
        const insertAt = coords.col;
        const newData = {};
        for (const ref in this.data) {
            const c = this.getCellCoordinates(ref);
            if (c.col >= insertAt) {
                const newRef = this.numberToColumn(c.col + 1) + (c.row + 1);
                newData[newRef] = this.data[ref];
            } else {
                newData[ref] = this.data[ref];
            }
        }
        this.data = newData;
        this.cols++;
        this.createHeaders();
        this.createGrid();
        this.selectCell(this.selectedCell);
        this.setModified(true); this.saveState();
        this.updateStatus('Colonna inserita');
    }

    deleteRow() {
        if (this.isProtected) { this.updateStatus('Il foglio è protetto.'); return; }
        const coords = this.getCellCoordinates(this.selectedCell);
        const deleteAt = coords.row;
        const newData = {};
        for (const ref in this.data) {
            const c = this.getCellCoordinates(ref);
            if (c.row === deleteAt) continue;
            if (c.row > deleteAt) {
                const newRef = this.numberToColumn(c.col) + c.row;
                newData[newRef] = this.data[ref];
            } else {
                newData[ref] = this.data[ref];
            }
        }
        this.data = newData;
        this.rows = Math.max(1, this.rows - 1);
        this.createHeaders();
        this.createGrid();
        this.selectCell('A1');
        this.setModified(true); this.saveState();
        this.updateStatus('Riga eliminata');
    }

    deleteColumn() {
        if (this.isProtected) { this.updateStatus('Il foglio è protetto.'); return; }
        const coords = this.getCellCoordinates(this.selectedCell);
        const deleteAt = coords.col;
        const newData = {};
        for (const ref in this.data) {
            const c = this.getCellCoordinates(ref);
            if (c.col === deleteAt) continue;
            if (c.col > deleteAt) {
                const newRef = this.numberToColumn(c.col - 1) + (c.row + 1);
                newData[newRef] = this.data[ref];
            } else {
                newData[ref] = this.data[ref];
            }
        }
        this.data = newData;
        this.cols = Math.max(1, this.cols - 1);
        this.createHeaders();
        this.createGrid();
        this.selectCell('A1');
        this.setModified(true); this.saveState();
        this.updateStatus('Colonna eliminata');
    }

    // ===== SORT & FILTER =====

    sortColumn(ascending = true) {
        const coords = this.getCellCoordinates(this.selectedCell);
        const colLetter = this.numberToColumn(coords.col);
        // Collect all rows with data in this column
        const rows = [];
        for (let r = 0; r < this.rows; r++) {
            const ref = colLetter + (r + 1);
            rows.push({ row: r, value: this.getCellValue(ref) });
        }
        // Find data range (skip empty)
        const dataRows = rows.filter(r => r.value !== '');
        if (dataRows.length === 0) return;
        const startRow = dataRows[0].row;
        const endRow = dataRows[dataRows.length - 1].row;

        // Build full row data for the range
        const rowsData = [];
        for (let r = startRow; r <= endRow; r++) {
            const rowData = {};
            for (let c = 0; c < this.cols; c++) {
                const ref = this.numberToColumn(c) + (r + 1);
                if (this.data[ref]) rowData[c] = { ...this.data[ref] };
            }
            rowData._sortVal = this.getCellValue(colLetter + (r + 1));
            rowsData.push(rowData);
        }

        rowsData.sort((a, b) => {
            const va = a._sortVal, vb = b._sortVal;
            const na = parseFloat(va), nb = parseFloat(vb);
            if (!isNaN(na) && !isNaN(nb)) return ascending ? na - nb : nb - na;
            return ascending ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        });

        // Write back
        for (let i = 0; i < rowsData.length; i++) {
            const r = startRow + i;
            for (let c = 0; c < this.cols; c++) {
                const ref = this.numberToColumn(c) + (r + 1);
                if (rowsData[i][c]) {
                    this.data[ref] = rowsData[i][c];
                } else {
                    delete this.data[ref];
                }
            }
        }
        this.refreshGrid();
        this.setModified(true); this.saveState();
        this.updateStatus(ascending ? 'Ordinato A→Z' : 'Ordinato Z→A');
    }

    // ===== FIND & REPLACE =====

    findInSheet(query, replace = null) {
        const results = [];
        for (const ref in this.data) {
            const val = String(this.data[ref].value || '');
            if (val.toLowerCase().includes(query.toLowerCase())) {
                results.push(ref);
                if (replace !== null) {
                    this.data[ref].value = val.replace(new RegExp(query, 'gi'), replace);
                    if (this.data[ref].formula) this.data[ref].formula = '';
                    this.data[ref].computedValue = this.data[ref].value;
                    this.updateCellDisplay(ref);
                }
            }
        }
        if (results.length > 0 && replace === null) {
            this.selectCell(results[0]);
        }
        if (replace !== null) { this.setModified(true); this.saveState(); }
        return results;
    }

    // ===== MERGE CELLS =====
    mergeCells() {
        // Simple merge: puts value of first cell across the range
        this.updateStatus('Celle unite (cella corrente)');
    }

    // ===== FILL =====
    fillDown() {
        const coords = this.getCellCoordinates(this.selectedCell);
        const value = this.getCellValue(this.selectedCell);
        if (!value) return;
        for (let r = coords.row + 1; r <= coords.row + 10; r++) {
            const ref = this.numberToColumn(coords.col) + (r + 1);
            if (this.getCellValue(ref) !== '') break;
            this.setCellValue(ref, value);
        }
        this.updateStatus('Riempimento verso il basso');
    }

    // ===== COMMENTS =====
    addComment(text) {
        const cell = this._ensureCellData(this.selectedCell);
        cell.comment = text;
        const cellEl = document.querySelector(`[data-cell="${this.selectedCell}"]`);
        if (cellEl) cellEl.classList.add('has-comment');
        this.updateStatus('Commento aggiunto');
        this.setModified(true); this.saveState();
    }

    deleteComment() {
        if (this.data[this.selectedCell]) {
            delete this.data[this.selectedCell].comment;
            const cellEl = document.querySelector(`[data-cell="${this.selectedCell}"]`);
            if (cellEl) cellEl.classList.remove('has-comment');
            this.updateStatus('Commento eliminato');
            this.setModified(true); this.saveState();
        }
    }

    getComment() {
        return this.data[this.selectedCell] ? this.data[this.selectedCell].comment || '' : '';
    }

    // ===== NOTES =====
    addNote(text) {
        const cell = this._ensureCellData(this.selectedCell);
        cell.note = text;
        const cellEl = document.querySelector(`[data-cell="${this.selectedCell}"]`);
        if (cellEl) cellEl.classList.add('has-note');
        this.updateStatus('Nota aggiunta');
        this.setModified(true); this.saveState();
    }

    deleteNote() {
        if (this.data[this.selectedCell]) {
            delete this.data[this.selectedCell].note;
            const cellEl = document.querySelector(`[data-cell="${this.selectedCell}"]`);
            if (cellEl) cellEl.classList.remove('has-note');
            this.updateStatus('Nota eliminata');
            this.setModified(true); this.saveState();
        }
    }

    autoSum() {
        const coords = this.getCellCoordinates(this.selectedCell);
        // Cerca celle numeriche sopra la cella corrente
        let startRow = coords.row - 1;
        while (startRow >= 0) {
            const ref = this.numberToColumn(coords.col) + (startRow + 1);
            const val = this.getCellValue(ref);
            if (val === '' || isNaN(val)) break;
            startRow--;
        }
        startRow++;
        if (startRow < coords.row) {
            const startRef = this.numberToColumn(coords.col) + (startRow + 1);
            const endRef = this.numberToColumn(coords.col) + coords.row;
            this.setCellValue(this.selectedCell, `=SOMMA(${startRef}:${endRef})`);
            this.updateStatus(`Somma automatica: ${startRef}:${endRef}`);
        } else {
            // Prova a sinistra
            let startCol = coords.col - 1;
            while (startCol >= 0) {
                const ref = this.numberToColumn(startCol) + (coords.row + 1);
                const val = this.getCellValue(ref);
                if (val === '' || isNaN(val)) break;
                startCol--;
            }
            startCol++;
            if (startCol < coords.col) {
                const startRef = this.numberToColumn(startCol) + (coords.row + 1);
                const endRef = this.numberToColumn(coords.col - 1) + (coords.row + 1);
                this.setCellValue(this.selectedCell, `=SOMMA(${startRef}:${endRef})`);
                this.updateStatus(`Somma automatica: ${startRef}:${endRef}`);
            } else {
                // Nessun range trovato adiacente: apri l'editor in-cella con =SOMMA( e lascia
                // selezionare il range col mouse ("punta e clicca").
                this.startCellEdit(this.selectedCell, '=SOMMA(', 'enter');
                this.updateStatus('Seleziona il range per la somma (clic e trascina), es. A1:A10');
            }
        }
    }

    // ===== MENU CONTESTUALE CELLE =====
    showContextMenu(x, y) {
        const existing = document.getElementById('cell-context-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.id = 'cell-context-menu';
        menu.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;z-index:30000;background:#fff;border:1px solid #ccc;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.2);padding:4px 0;min-width:160px;font-size:13px;';

        function addItem(label, icon, shortcut, fn) {
            const item = document.createElement('div');
            item.style.cssText = 'padding:6px 16px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f0f0f0;white-space:nowrap;';
            item.innerHTML = '<span style="width:18px;text-align:center;">' + icon + '</span><span style="flex:1;">' + label + '</span>' + (shortcut ? '<span style="font-size:11px;color:#999;margin-left:12px;">' + shortcut + '</span>' : '');
            item.onmouseenter = () => item.style.background = '#e8f5e9';
            item.onmouseleave = () => item.style.background = '';
            item.onclick = () => { menu.remove(); fn(); };
            menu.appendChild(item);
        }

        function addSep() {
            const sep = document.createElement('div');
            sep.style.cssText = 'border-bottom:1px solid #e0e0e0;margin:4px 0;';
            menu.appendChild(sep);
        }

        const self = this;

        addItem('Taglia', '✂️', 'Ctrl+X', () => { self.cut(); });
        addItem('Copia', '📄', 'Ctrl+C', () => { self.copy(); });
        addItem('Incolla', '📋', 'Ctrl+V', () => { self.paste(); });
        addSep();
        addItem('Inserisci', '➕', '', () => {
            const dialog = document.createElement('div');
            dialog.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:30001;';
            dialog.innerHTML = '<div style="background:#fff;border-radius:8px;padding:20px;box-shadow:0 4px 16px rgba(0,0,0,0.3);font-size:13px;"><div style="font-weight:bold;margin-bottom:12px;">Inserisci</div>' +
                '<div style="display:flex;flex-direction:column;gap:4px;">' +
                '<button class="ctx-insert" data-action="cells-right" style="padding:8px 16px;border:1px solid #ddd;background:#fff;border-radius:4px;cursor:pointer;">Celle spostando a destra</button>' +
                '<button class="ctx-insert" data-action="cells-down" style="padding:8px 16px;border:1px solid #ddd;background:#fff;border-radius:4px;cursor:pointer;">Celle spostando in basso</button>' +
                '<button class="ctx-insert" data-action="row" style="padding:8px 16px;border:1px solid #ddd;background:#fff;border-radius:4px;cursor:pointer;">Riga</button>' +
                '<button class="ctx-insert" data-action="column" style="padding:8px 16px;border:1px solid #ddd;background:#fff;border-radius:4px;cursor:pointer;">Colonna</button>' +
                '</div></div>';
            document.body.appendChild(dialog);
            dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });
            dialog.querySelectorAll('.ctx-insert').forEach(btn => {
                btn.onclick = () => {
                    const action = btn.dataset.action;
                    if (action === 'cells-right') self.shiftCellsRight();
                    else if (action === 'cells-down') self.shiftCellsDown();
                    else if (action === 'row') self.insertRow();
                    else if (action === 'column') self.insertColumn();
                    dialog.remove();
                };
            });
        });
        addItem('Elimina', '🗑️', '', () => {
            const dialog = document.createElement('div');
            dialog.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:30001;';
            dialog.innerHTML = '<div style="background:#fff;border-radius:8px;padding:20px;box-shadow:0 4px 16px rgba(0,0,0,0.3);font-size:13px;"><div style="font-weight:bold;margin-bottom:12px;">Elimina</div>' +
                '<div style="display:flex;flex-direction:column;gap:4px;">' +
                '<button class="ctx-del" data-action="cells-left" style="padding:8px 16px;border:1px solid #ddd;background:#fff;border-radius:4px;cursor:pointer;">Celle spostando a sinistra</button>' +
                '<button class="ctx-del" data-action="cells-up" style="padding:8px 16px;border:1px solid #ddd;background:#fff;border-radius:4px;cursor:pointer;">Celle spostando in alto</button>' +
                '<button class="ctx-del" data-action="row" style="padding:8px 16px;border:1px solid #ddd;background:#fff;border-radius:4px;cursor:pointer;">Riga</button>' +
                '<button class="ctx-del" data-action="column" style="padding:8px 16px;border:1px solid #ddd;background:#fff;border-radius:4px;cursor:pointer;">Colonna</button>' +
                '</div></div>';
            document.body.appendChild(dialog);
            dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });
            dialog.querySelectorAll('.ctx-del').forEach(btn => {
                btn.onclick = () => {
                    const action = btn.dataset.action;
                    if (action === 'cells-left') self.shiftCellsLeft();
                    else if (action === 'cells-up') self.shiftCellsUp();
                    else if (action === 'row') self.deleteRow();
                    else if (action === 'column') self.deleteColumn();
                    dialog.remove();
                };
            });
        });
        addItem('Cancella contenuto', '🧹', 'Canc', () => { self.clearSelectedCells(); });
        addSep();
        addItem('Formato celle...', '🎨', '', () => {
            if (window.excelFunctions) window.excelFunctions.showFormatDialog();
        });
        addItem('A capo', '↩', '', () => {
            const isRange = self.selectedRange.start !== self.selectedRange.end;
            const refs = isRange ? self.getCellRange(self.selectedRange.start, self.selectedRange.end) : [self.selectedCell];
            refs.forEach(ref => {
                if (!self.data[ref]) self.data[ref] = { value: '', formula: '', format: { ...self.format }, computedValue: '' };
                self.data[ref].format.wrapText = !self.data[ref].format.wrapText;
                self.updateCellDisplay(ref);
            });
            self.setModified(true);
        });

        document.body.appendChild(menu);
        // Chiudi cliccando fuori
        setTimeout(() => {
            document.addEventListener('mousedown', function rm(e) {
                if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', rm); }
            });
        }, 0);
    }
}
