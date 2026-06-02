        // Variabili globali
        let currentDocument = {
            name: 'Documento1',
            content: '',
            wordCount: 0
        };

        let isMarkdownMode = false;
        let selectedImage = null;
        let selectedTable = null;
        let currentOrientation = 'portrait';
        let currentMargins = {
            top: 25,
            right: 25,
            bottom: 25,
            left: 25
        };

        // Inizializzazione
        document.addEventListener('DOMContentLoaded', function() {
            initEditor();
            updateWordCount();
            setupEventListeners();
            updatePaperMargins();
        });

        function initEditor() {
            console.log("Editor inizializzato con successo");
            document.getElementById('editor').focus();
        }

        function setupEventListeners() {
            document.getElementById('editor').addEventListener('input', updateWordCount);
            document.getElementById('fileInput').addEventListener('change', handleFileUpload);
            document.getElementById('imageUpload').addEventListener('change', handleImageUpload);
            setInterval(autoSave, 30000);
            
            // Click outside per deselezionare immagini/tabelle - VERSIONE CORRETTA
            document.addEventListener('click', function(e) {
                // Se il click è avvenuto all'interno di un modal, non deselezionare nulla
                if (e.target.closest('.modal')) {
                    return;
                }

                if (!e.target.closest('.resizable-image') && !e.target.closest('.image-toolbar')) {
                    deselectAllImages();
                }
                if (!e.target.closest('table') && !e.target.closest('.table-toolbar')) {
                    deselectAllTables();
                }
            });
        }

        // Gestione Tab Ribbon
        function showTab(tabId) {
            document.querySelectorAll('.ribbon-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.ribbon-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            const tabElement = document.getElementById(tabId);
            if (tabElement) {
                tabElement.classList.add('active');
                const tabButton = document.querySelector(`.ribbon-tab[onclick="showTab('${tabId}')"]`);
                if (tabButton) {
                    tabButton.classList.add('active');
                }
            }
        }

        // Gestione Modal
        function showModal(modalId) {
            document.getElementById(modalId).style.display = 'block';
        }

        function closeModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
        }

        function showModalTab(tabId) {
            document.querySelectorAll('.modal-tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.modal-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            document.getElementById(tabId).classList.add('active');
            event.target.classList.add('active');
        }

        function showEditTableTab(tabId) {
            document.querySelectorAll('#editTableModal .modal-tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('#editTableModal .modal-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            
            document.getElementById(tabId).classList.add('active');
            event.target.classList.add('active');
        }

        // ORIENTAMENTO - Nuove funzioni
        function showOrientationModal() {
            // Imposta l'opzione corrente come selezionata
            document.querySelectorAll('.orientation-option').forEach(option => {
                option.classList.remove('selected');
            });
            document.querySelector(`.orientation-option[onclick="selectOrientation('${currentOrientation}')"]`).classList.add('selected');
            
            // Aggiorna l'anteprima
            updateOrientationPreview();
            
            showModal('orientationModal');
        }

        function selectOrientation(orientation) {
            // Rimuovi selezione da tutte le opzioni
            document.querySelectorAll('.orientation-option').forEach(option => {
                option.classList.remove('selected');
            });
            
            // Aggiungi selezione all'opzione cliccata
            event.target.closest('.orientation-option').classList.add('selected');
            
            // Aggiorna l'anteprima
            updateOrientationPreview(orientation);
        }

        function updateOrientationPreview(orientation = currentOrientation) {
            const preview = document.getElementById('pagePreview');
            preview.className = 'page-preview ' + orientation;
            
            if (orientation === 'portrait') {
                preview.innerHTML = `
                    <div style="text-align: center; color: #666;">
                        <i class="fas fa-portrait" style="font-size: 24px;"></i>
                        <div>Pagina Verticale</div>
                    </div>
                `;
            } else {
                preview.innerHTML = `
                    <div style="text-align: center; color: #666;">
                        <i class="fas fa-landscape" style="font-size: 24px;"></i>
                        <div>Pagina Orizzontale</div>
                    </div>
                `;
            }
        }

        function applyOrientation() {
            const selectedOption = document.querySelector('.orientation-option.selected');
            const orientation = selectedOption.getAttribute('onclick').match(/'([^']+)'/)[1];
            
            // Applica l'orientamento al foglio
            const paper = document.getElementById('paper');
            paper.classList.remove('portrait', 'landscape');
            paper.classList.add(orientation);
            
            currentOrientation = orientation;
            
            // Aggiorna la barra di stato
            document.getElementById('orientationStatus').textContent = 
                orientation === 'portrait' ? 'Verticale' : 'Orizzontale';
            
            closeModal('orientationModal');
        }

        // MARGINI - Nuove funzioni
        function showMarginsModal() {
            // Imposta i valori correnti nei campi
            document.getElementById('marginTop').value = currentMargins.top;
            document.getElementById('marginRight').value = currentMargins.right;
            document.getElementById('marginBottom').value = currentMargins.bottom;
            document.getElementById('marginLeft').value = currentMargins.left;
            
            showModal('marginsModal');
        }

        function setDefaultMargins(type) {
            let margins;
            
            switch(type) {
                case 'normal':
                    margins = { top: 25, right: 25, bottom: 25, left: 25 };
                    break;
                case 'narrow':
                    margins = { top: 12, right: 12, bottom: 12, left: 12 };
                    break;
                case 'wide':
                    margins = { top: 40, right: 40, bottom: 40, left: 40 };
                    break;
            }
            
            document.getElementById('marginTop').value = margins.top;
            document.getElementById('marginRight').value = margins.right;
            document.getElementById('marginBottom').value = margins.bottom;
            document.getElementById('marginLeft').value = margins.left;
        }

        function applyMargins() {
            currentMargins = {
                top: parseInt(document.getElementById('marginTop').value) || 25,
                right: parseInt(document.getElementById('marginRight').value) || 25,
                bottom: parseInt(document.getElementById('marginBottom').value) || 25,
                left: parseInt(document.getElementById('marginLeft').value) || 25
            };
            
            updatePaperMargins();
            closeModal('marginsModal');
        }

        function updatePaperMargins() {
            const paperContent = document.querySelector('.paper-content');
            paperContent.style.padding = 
                `${currentMargins.top}mm ${currentMargins.right}mm ${currentMargins.bottom}mm ${currentMargins.left}mm`;
        }

        // Comandi Editor
        function execCommand(command, value = null) {
            document.execCommand(command, false, value);
            document.getElementById('editor').focus();
        }

        function formatText(format) {
            execCommand('formatBlock', format);
        }

        function changeColor(color) {
            execCommand('styleWithCSS', true);
            execCommand('foreColor', color);
        }

        function changeFont(font) {
            execCommand('fontName', false, font);
        }

        // Gestione File
        function newDocument() {
            if(confirm('Vuoi creare un nuovo documento? Le modifiche non salvate andranno perse.')) {
                document.getElementById('editor').innerHTML = '<h1>Nuovo Documento</h1><p>Inizia a scrivere qui...</p>';
                currentDocument.name = 'Documento1';
                document.getElementById('documentName').textContent = currentDocument.name;
                updateWordCount();
                closeModal('fileModal');
            }
        }

        function openFile() {
            document.getElementById('fileInput').click();
        }

        function handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById('editor').innerHTML = e.target.result;
                currentDocument.name = file.name;
                document.getElementById('documentName').textContent = currentDocument.name;
                updateWordCount();
                closeModal('fileModal');
            };
            reader.readAsText(file);
        }

        // SALVATAGGIO SERVER
        function saveToServer() {
            const content = document.getElementById('editor').innerHTML;
            const filename = currentDocument.name || 'documento_senza_nome';
            
            fetch('save.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: content,
                    filename: filename
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Documento salvato sul server con successo!');
                    console.log('File salvato in: ' + data.filepath);
                } else {
                    alert('Errore nel salvataggio: ' + data.error);
                }
            })
            .catch(error => {
                console.error('Errore:', error);
                alert('Errore di connessione al server');
            });
            
            closeModal('fileModal');
        }

        function saveDocument() {
            const content = document.getElementById('editor').innerHTML;
            currentDocument.content = content;
            
            const blob = new Blob([content], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = currentDocument.name + '.html';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            alert('Documento salvato come ' + currentDocument.name + '.html');
            closeModal('fileModal');
        }

        function saveAsDocument() {
            const newName = prompt('Inserisci il nome del documento:', currentDocument.name);
            if (newName) {
                currentDocument.name = newName;
                document.getElementById('documentName').textContent = currentDocument.name;
                saveDocument();
            }
        }

        function exportDocument() {
            alert('Esportazione PDF - Funzione da implementare con librerie JS');
            closeModal('fileModal');
        }

        // GESTIONE IMMAGINI - Funzioni reinserite
        function showImageModal() {
            showModal('imageModal');
        }

        function handleImageUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById('uploadPreview').innerHTML = 
                    `<img src="${e.target.result}" style="max-width: 100%; max-height: 200px;">`;
            };
            reader.readAsDataURL(file);
        }

        function insertImageFromModal() {
            let imageUrl = document.getElementById('imageUrl').value;
            const imageUpload = document.getElementById('imageUpload').files[0];
            
            if (imageUpload) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    insertResizableImage(e.target.result);
                };
                reader.readAsDataURL(imageUpload);
            } else if (imageUrl) {
                insertResizableImage(imageUrl);
            } else {
                alert('Inserisci un URL o carica un file immagine');
                return;
            }
            
            closeModal('imageModal');
        }

        function insertResizableImage(src) {
            const width = document.getElementById('imageWidth').value || '300';
            const height = document.getElementById('imageHeight').value || '200';
            const align = document.getElementById('imageAlign').value || 'center';
            
            const imgContainer = document.createElement('div');
            imgContainer.className = 'resizable-image';
            imgContainer.style.display = 'block';
            imgContainer.style.textAlign = align;
            imgContainer.style.margin = '10px 0';
            
            const img = document.createElement('img');
            img.src = src;
            img.style.width = width + 'px';
            img.style.height = 'auto';
            img.style.maxWidth = '100%';
            
            imgContainer.appendChild(img);
            
            // Aggiungi handle per il ridimensionamento
            addResizeHandles(imgContainer, img);
            
            // Aggiungi event listener per la selezione
            imgContainer.addEventListener('click', function(e) {
                e.stopPropagation();
                selectImage(imgContainer);
            });
            
            // Inserisci nel documento
            execCommand('insertHTML', imgContainer.outerHTML);
        }

        function addResizeHandles(container, img) {
            const handles = [
                { position: 'bottom-right', cursor: 'nwse-resize' },
                { position: 'bottom-left', cursor: 'nesw-resize' },
                { position: 'top-right', cursor: 'nesw-resize' },
                { position: 'top-left', cursor: 'nwse-resize' }
            ];
            
            handles.forEach(handle => {
                const handleEl = document.createElement('div');
                handleEl.className = `resize-handle ${handle.position}`;
                handleEl.style.cursor = handle.cursor;
                container.appendChild(handleEl);
                
                // Implementazione del ridimensionamento
                handleEl.addEventListener('mousedown', function(e) {
                    e.stopPropagation();
                    initResize(e, container, img, handle.position);
                });
            });
        }

        function initResize(e, container, img, handlePosition) {
            e.preventDefault();
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = parseInt(img.style.width) || img.offsetWidth;
            const startHeight = parseInt(img.style.height) || img.offsetHeight;
            
            function doResize(e) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                
                let newWidth = startWidth;
                let newHeight = startHeight;
                
                if (handlePosition.includes('right')) newWidth = startWidth + deltaX;
                if (handlePosition.includes('left')) newWidth = startWidth - deltaX;
                if (handlePosition.includes('bottom')) newHeight = startHeight + deltaY;
                if (handlePosition.includes('top')) newHeight = startHeight - deltaY;
                
                // Mantieni le proporzioni minime
                newWidth = Math.max(50, newWidth);
                newHeight = Math.max(50, newHeight);
                
                img.style.width = newWidth + 'px';
            }
            
            function stopResize() {
                document.removeEventListener('mousemove', doResize);
                document.removeEventListener('mouseup', stopResize);
            }
            
            document.addEventListener('mousemove', doResize);
            document.addEventListener('mouseup', stopResize);
        }

        function selectImage(imgContainer) {
            deselectAllImages();
            deselectAllTables();
            
            imgContainer.classList.add('selected');
            selectedImage = imgContainer;
            
            // Mostra modal di modifica
            showModal('editImageModal');
            
            // Imposta i valori correnti
            const img = imgContainer.querySelector('img');
            document.getElementById('editImageWidth').value = parseInt(img.style.width) || img.offsetWidth;
            document.getElementById('editImageHeight').value = parseInt(img.style.height) || img.offsetHeight;
            
            // Determina allineamento
            const align = imgContainer.style.textAlign || 'center';
            document.getElementById('editImageAlign').value = align;
        }

        function deselectAllImages() {
            document.querySelectorAll('.resizable-image').forEach(img => {
                img.classList.remove('selected');
            });
            selectedImage = null;
        }

        function applyImageChanges() {
            if (!selectedImage) return;
            
            const img = selectedImage.querySelector('img');
            const newWidth = document.getElementById('editImageWidth').value;
            const newHeight = document.getElementById('editImageHeight').value;
            const newAlign = document.getElementById('editImageAlign').value;
            
            img.style.width = newWidth + 'px';
            if (newHeight) img.style.height = newHeight + 'px';
            selectedImage.style.textAlign = newAlign;
            
            closeModal('editImageModal');
        }

        function deleteSelectedImage() {
            if (!selectedImage) return;
            
            if (confirm('Sei sicuro di voler eliminare questa immagine?')) {
                selectedImage.remove();
                closeModal('editImageModal');
            }
        }

        // GESTIONE TABELLE - Funzioni reinserite
        function showTableModal() {
            showModal('tableModal');
        }

        function insertTableFromModal() {
            const rows = parseInt(document.getElementById('tableRows').value) || 3;
            const cols = parseInt(document.getElementById('tableCols').value) || 3;
            const width = document.getElementById('tableWidth').value;
            const style = document.getElementById('tableStyle').value;
            
            let tableHTML = `<table style="width: ${width}" class="${style}">`;
            
            for (let i = 0; i < rows; i++) {
                tableHTML += '<tr>';
                for (let j = 0; j < cols; j++) {
                    tableHTML += `<td contenteditable="true">&nbsp;</td>`;
                }
                tableHTML += '</tr>';
            }
            tableHTML += '</table>';
            
            // Inserisci la tabella
            execCommand('insertHTML', tableHTML);
            
            // Aggiungi event listener per la selezione
            const tables = document.querySelectorAll('#editor table');
            const newTable = tables[tables.length - 1];
            newTable.addEventListener('click', function(e) {
                e.stopPropagation();
                selectTable(newTable);
            });
            
            closeModal('tableModal');
        }

        function selectTable(table) {
            deselectAllImages();
            deselectAllTables();
            
            table.classList.add('selected');
            selectedTable = table;
            
            // Mostra modal di modifica
            showModal('editTableModal');
            
            // Imposta i valori correnti
            const currentWidth = table.style.width || '100%';
            document.getElementById('editTableWidth').value = currentWidth;
            
            // Determina lo stile corrente
            let currentStyle = 'basic';
            if (table.classList.contains('striped')) currentStyle = 'striped';
            if (table.classList.contains('bordered')) currentStyle = 'bordered';
            document.getElementById('editTableStyle').value = currentStyle;
        }

        function deselectAllTables() {
            document.querySelectorAll('table').forEach(table => {
                table.classList.remove('selected');
            });
            selectedTable = null;
        }

        // Funzioni per modificare le tabelle - VERSIONE CORRETTA
        function addTableRow() {
            if (!selectedTable) {
                // Se la tabella non è selezionata, proviamo a trovare l'ultima tabella selezionata
                const selectedTables = document.querySelectorAll('table.selected');
                if (selectedTables.length > 0) {
                    selectedTable = selectedTables[0];
                } else {
                    console.log("Nessuna tabella selezionata");
                    return;
                }
            }
            
            const row = selectedTable.insertRow();
            const colCount = selectedTable.rows[0].cells.length;
            
            for (let i = 0; i < colCount; i++) {
                const cell = row.insertCell();
                cell.contentEditable = true;
                cell.innerHTML = '&nbsp;';
            }
            
            // Mantieni la tabella selezionata
            selectedTable.classList.add('selected');
        }

        function deleteTableRow() {
            if (!selectedTable) {
                const selectedTables = document.querySelectorAll('table.selected');
                if (selectedTables.length > 0) {
                    selectedTable = selectedTables[0];
                } else {
                    console.log("Nessuna tabella selezionata");
                    return;
                }
            }
            
            if (selectedTable.rows.length <= 1) return;
            
            selectedTable.deleteRow(-1);
            selectedTable.classList.add('selected');
        }

        function addTableColumn() {
            if (!selectedTable) {
                const selectedTables = document.querySelectorAll('table.selected');
                if (selectedTables.length > 0) {
                    selectedTable = selectedTables[0];
                } else {
                    console.log("Nessuna tabella selezionata");
                    return;
                }
            }
            
            for (let i = 0; i < selectedTable.rows.length; i++) {
                const cell = selectedTable.rows[i].insertCell();
                cell.contentEditable = true;
                cell.innerHTML = '&nbsp;';
            }
            
            selectedTable.classList.add('selected');
        }

        function deleteTableColumn() {
            if (!selectedTable) {
                const selectedTables = document.querySelectorAll('table.selected');
                if (selectedTables.length > 0) {
                    selectedTable = selectedTables[0];
                } else {
                    console.log("Nessuna tabella selezionata");
                    return;
                }
            }
            
            if (selectedTable.rows[0].cells.length <= 1) return;
            
            for (let i = 0; i < selectedTable.rows.length; i++) {
                selectedTable.rows[i].deleteCell(-1);
            }
            
            selectedTable.classList.add('selected');
        }

        function mergeTableCells() {
            alert('Seleziona più celle da unire (funzione avanzata da implementare)');
        }

        function splitTableCells() {
            alert('Seleziona una cella da dividere (funzione avanzata da implementare)');
        }

        // FUNZIONE APPLICA CORRETTA - ORA FUNZIONA!
        function applyTableChanges() {
            if (!selectedTable) {
                // Proviamo a trovare la tabella selezionata
                const selectedTables = document.querySelectorAll('table.selected');
                if (selectedTables.length > 0) {
                    selectedTable = selectedTables[0];
                } else {
                    console.log("Nessuna tabella selezionata");
                    return;
                }
            }
            
            const width = document.getElementById('editTableWidth').value;
            const style = document.getElementById('editTableStyle').value;
            
            console.log("Applica modifiche:", width, style);
            
            // Applica la larghezza
            selectedTable.style.width = width;
            
            // Rimuovi tutte le classi di stile e aggiungi quella selezionata
            selectedTable.classList.remove('basic', 'striped', 'bordered');
            selectedTable.classList.add(style);
            
            // Mantieni la classe selected
            selectedTable.classList.add('selected');
            
            closeModal('editTableModal');
        }

        function deleteSelectedTable() {
            if (!selectedTable) {
                const selectedTables = document.querySelectorAll('table.selected');
                if (selectedTables.length > 0) {
                    selectedTable = selectedTables[0];
                } else {
                    console.log("Nessuna tabella selezionata");
                    return;
                }
            }
            
            if (confirm('Sei sicuro di voler eliminare questa tabella?')) {
                selectedTable.remove();
                closeModal('editTableModal');
            }
        }

        // Utility
        function updateWordCount() {
            const text = document.getElementById('editor').innerText || document.getElementById('editor').textContent;
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            currentDocument.wordCount = words;
            document.getElementById('wordCount').textContent = words;
            
            const pageCount = Math.max(1, Math.ceil(words / 250));
            document.getElementById('pageCount').textContent = pageCount;
        }

        function autoSave() {
            const content = document.getElementById('editor').innerHTML;
            localStorage.setItem('autoSaveDocument', content);
            console.log('Salvataggio automatico effettuato');
        }

        // Altre funzioni
        function handlePaste() {
            alert('Incolla - Usa Ctrl+V o il menu contestuale');
        }

        function insertLink() {
            const url = prompt('Inserisci URL:');
            if (url) {
                execCommand('createLink', url);
            }
        }

        function changeMargins() {
            showMarginsModal();
        }

        function changeOrientation() {
            showOrientationModal();
        }

        function spellCheck() {
            alert('Controllo ortografia - Da implementare');
        }

        function wordCount() {
            alert(`Conteggio parole: ${currentDocument.wordCount}`);
        }

        function toggleFullscreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.log(`Errore fullscreen: ${err.message}`);
                });
            } else {
                document.exitFullscreen();
            }
        }

        function toggleMarkdown() {
            alert('Modalità Markdown - Da implementare con conversione HTML/Markdown');
        }

        function closeApp() {
            if(confirm('Sei sicuro di voler uscire?')) {
                window.close();
            }
        }

        function toggleZoom() {
            alert('Zoom - Da implementare');
        }

        function toggleLayout() {
            alert('Cambio layout - Da implementare');
        }



/*--------------------------------------------*/
// VARIABILI GLOBALI PER LA CRONOLOGIA
let historyStack = [];
let currentHistoryIndex = -1;
let maxHistorySize = 50;

// INIZIALIZZA LA CRONOLOGIA
function initHistory() {
    const content = document.getElementById('editor').innerHTML;
    historyStack = [content];
    currentHistoryIndex = 0;
    updateHistoryButtons();
}

// SALVA STATO NELLA CRONOLOGIA
function saveToHistory() {
    const content = document.getElementById('editor').innerHTML;
    
    // Se siamo in mezzo alla cronologia, rimuovi gli stati successivi
    if (currentHistoryIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, currentHistoryIndex + 1);
    }
    
    // Aggiungi il nuovo stato
    historyStack.push(content);
    currentHistoryIndex++;
    
    // Limita la dimensione della cronologia
    if (historyStack.length > maxHistorySize) {
        historyStack.shift();
        currentHistoryIndex--;
    }
    
    updateHistoryButtons();
}

// FUNZIONE ANNULLA (UNDO)
function undo() {
    if (currentHistoryIndex > 0) {
        currentHistoryIndex--;
        const editor = document.getElementById('editor');
        editor.innerHTML = historyStack[currentHistoryIndex];
        updateWordCount();
        updateHistoryButtons();
    }
}

// FUNZIONE RIPRISTINA (REDO)
function redo() {
    if (currentHistoryIndex < historyStack.length - 1) {
        currentHistoryIndex++;
        const editor = document.getElementById('editor');
        editor.innerHTML = historyStack[currentHistoryIndex];
        updateWordCount();
        updateHistoryButtons();
    }
}

// AGGIORNA STATO BOTTONI
function updateHistoryButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    
    if (undoBtn && redoBtn) {
        undoBtn.disabled = currentHistoryIndex <= 0;
        redoBtn.disabled = currentHistoryIndex >= historyStack.length - 1;
    }
}

// MODIFICA LA FUNZIONE setupEventListeners PER INCLUDERE IL SALVATAGGIO AUTOMATICO
function setupEventListeners() {
    const editor = document.getElementById('editor');
    const fileInput = document.getElementById('fileInput');
    const imageUpload = document.getElementById('imageUpload');
    
    if (editor) {
        // Salva nella cronologia quando il contenuto cambia (con debounce)
        let saveTimeout;
        editor.addEventListener('input', function() {
            updateWordCount();
            
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                saveToHistory();
            }, 1000); // Salva dopo 1 secondo di inattività
        });
        
        // Salva anche quando vengono eseguiti comandi (bold, italic, etc.)
        editor.addEventListener('DOMSubtreeModified', function() {
            if (!this.isContentModified) {
                this.isContentModified = true;
                setTimeout(() => {
                    this.isContentModified = false;
                }, 100);
            }
        });
    } else {
        console.error("Elemento 'editor' non trovato!");
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }
    
    if (imageUpload) {
        imageUpload.addEventListener('change', handleImageUpload);
    }
    
    setInterval(autoSave, 30000);
    
    // Click outside per deselezionare immagini/tabelle
    document.addEventListener('click', function(e) {
        if (e.target.closest('.modal')) {
            return;
        }

        if (!e.target.closest('.resizable-image') && !e.target.closest('.image-toolbar')) {
            deselectAllImages();
        }
        if (!e.target.closest('table') && !e.target.closest('.table-toolbar')) {
            deselectAllTables();
        }
    });
}

// MODIFICA LA FUNZIONE initEditor PER INIZIALIZZARE LA CRONOLOGIA
function initEditor() {
    console.log("Editor inizializzato con successo");
    const editor = document.getElementById('editor');
    if (editor) {
        editor.focus();
        initHistory(); // Inizializza la cronologia
    }
}

// MODIFICA LE FUNZIONI CHE CAMBIANO IL CONTENUTO PER SALVARE NELLA CRONOLOGIA

function newDocument() {
    if(confirm('Vuoi creare un nuovo documento? Le modifiche non salvate andranno perse.')) {
        document.getElementById('editor').innerHTML = '<h1>Nuovo Documento</h1><p>Inizia a scrivere qui...</p>';
        currentDocument.name = 'Documento1';
        document.getElementById('documentName').textContent = currentDocument.name;
        updateWordCount();
        saveToHistory(); // Salva lo stato iniziale del nuovo documento
        closeModal('fileModal');
    }
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('editor').innerHTML = e.target.result;
        currentDocument.name = file.name;
        document.getElementById('documentName').textContent = currentDocument.name;
        updateWordCount();
        saveToHistory(); // Salva lo stato del file caricato
        closeModal('fileModal');
    };
    reader.readAsText(file);
}

// AGGIUNGI IL SALVATAGGIO NELLA CRONOLOGIA PER I COMANDI PRINCIPALI
function execCommand(command, value = null) {
    document.execCommand(command, false, value);
    document.getElementById('editor').focus();
    // Salva nella cronologia dopo un breve delay
    setTimeout(saveToHistory, 100);
}

function formatText(format) {
    execCommand('formatBlock', format);
}

function changeColor(color) {
    execCommand('styleWithCSS', true);
    execCommand('foreColor', color);
}

function changeBackgroundColor(color) {
    execCommand('styleWithCSS', true);
    execCommand('hiliteColor', false, color);
}

        // FUNZIONI PER EVIDENZIAZIONE TESTO
        function highlightText(color) {
            const selection = window.getSelection();
            if (selection.toString().length === 0) {
                alert('Seleziona prima del testo da evidenziare');
                return;
            }
            
            const range = selection.getRangeAt(0);
            const selectedText = range.extractContents();
            const span = document.createElement('span');
            
            // Aggiungi la classe di evidenziazione in base al colore
            span.className = `highlight-${color}`;
            span.appendChild(selectedText);
            
            range.insertNode(span);
            
            // Ripristina la selezione
            selection.removeAllRanges();
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            selection.addRange(newRange);
        }

        function removeHighlight() {
            const selection = window.getSelection();
            if (selection.toString().length === 0) {
                alert('Seleziona prima del testo da cui rimuovere l\'evidenziazione');
                return;
            }
            
            const range = selection.getRangeAt(0);
            const selectedContent = range.extractContents();
            
            // Rimuovi gli span di evidenziazione mantenendo il testo
            const tempDiv = document.createElement('div');
            tempDiv.appendChild(selectedContent.cloneNode(true));
            
            // Rimuovi gli span di evidenziazione
            const highlightSpans = tempDiv.querySelectorAll('[class*="highlight-"]');
            highlightSpans.forEach(span => {
                const parent = span.parentNode;
                while (span.firstChild) {
                    parent.insertBefore(span.firstChild, span);
                }
                parent.removeChild(span);
            });
            
            // Inserisci il contenuto pulito
            range.insertNode(tempDiv);
            
            // Ripristina la selezione
            selection.removeAllRanges();
            const newRange = document.createRange();
            newRange.selectNodeContents(tempDiv);
            selection.addRange(newRange);
        }


        // Ripristino da salvataggio automatico all'avvio
        window.addEventListener('load', function() {
            const saved = localStorage.getItem('autoSaveDocument');
            if (saved && confirm('Trovato un salvataggio automatico. Vuoi ripristinarlo?')) {
                document.getElementById('editor').innerHTML = saved;
                updateWordCount();
            }
        });


// VARIABILI PER IL CONTROLLO ORTOGRAFICO
let spellCheckEnabled = false;
let currentSpellCheckErrors = [];

// DIZIONARIO ITALIANO BASE (puoi espanderlo)
const italianDictionary = [
    'il', 'lo', 'la', 'i', 'gli', 'le', 'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
    'non', 'ma', 'o', 'e', 'se', 'come', 'quando', 'dove', 'perché', 'che', 'cui', 'chi', 'cosa',
    'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'quelli', 'quelle', 'mio', 'mia',
    'tuo', 'tua', 'suo', 'sua', 'nostro', 'nostra', 'vostro', 'vostra', 'loro', 'essere', 'avere',
    'fare', 'andare', 'venire', 'dire', 'potere', 'volere', 'dovere', 'sapere', 'vedere', 'sentire',
    'parlare', 'trovare', 'prendere', 'dare', 'guardare', 'passare', 'stare', 'lasciare', 'mettere',
    'pensare', 'credere', 'capire', 'conoscere', 'diventare', 'rimanere', 'entrare', 'uscire',
    'arrivare', 'partire', 'vivere', 'morire', 'nascere', 'crescere', 'lavorare', 'cominciare',
    'finire', 'seguire', 'correre', 'camminare', 'leggere', 'scrivere', 'studiare', 'insegnare',
    'imparare', 'ascoltare', 'cantare', 'ballare', 'disegnare', 'dormire', 'sognare', 'amare',
    'odiare', 'ridere', 'piangere', 'urlare', 'chiamare', 'rispondere', 'aspettare', 'cercare',
    'toccare', 'comprare', 'vendere', 'pagare', 'costare', 'aprire', 'chiudere', 'alzare',
    'abbassare', 'salire', 'scendere', 'portare', 'volare', 'nuotare', 'guidare', 'viaggiare',
    'visitare', 'ricordare', 'dimenticare', 'scegliere', 'decidere', 'provare', 'riuscire',
    'cadere', 'rompere', 'aggiustare', 'pulire', 'sporcare', 'lavare', 'asciugare', 'cucinare',
    'mangiare', 'bere', 'preparare', 'servire', 'offrire', 'chiedere', 'aiutare', 'salutare',
    'baciare', 'abbracciare', 'giocare', 'vincere', 'perdere', 'lottare', 'combattere', 'difendere',
    'attaccare', 'rubare', 'nascondere', 'tradire', 'mentire', 'promettere', 'perdonare', 'accettare',
    'rifiutare', 'cambiare', 'continuare', 'smettere', 'soffrire', 'godere', 'meritare', 'valere',
    'costruire', 'distruggere', 'creare', 'inventare', 'scoprire', 'risolvere', 'contare', 'calcolare',
    'misurare', 'pesare', 'aumentare', 'diminuire', 'scappare', 'inseguire', 'raggiungere', 'superare',
    'sorpassare', 'attraversare', 'girare', 'voltare', 'fermare', 'muovere', 'spostare', 'sollevare',
    'gettare', 'raccogliere', 'seminare', 'coltivare', 'raccontare', 'descrivere', 'spiegare', 'mostrare',
    'cancellare', 'segnare', 'dipingere', 'scolpire', 'fotografare', 'registrare', 'riprodurre', 'suonare',
    'recitare', 'rappresentare', 'celebrare', 'festeggiare', 'divertire', 'stancare', 'riposare', 'rilassare',
    'preoccupare', 'spaventare', 'tranquillizzare', 'svegliare', 'addormentare', 'immaginare', 'supporre',
    'sperare', 'temere', 'desiderare', 'comprendere', 'lavorare', 'riposare', 'saltare', 'tuffare',
    'arrampicare', 'spingere', 'tirare', 'lanciare', 'afferrare', 'tenere', 'togliere', 'posare', 'appendere',
    'riempire', 'svuotare', 'legare', 'slegare', 'avvitare', 'svitare', 'incollare', 'staccare', 'riparare',
    'fallire', 'ostacolare', 'proteggere', 'minacciare', 'salvare', 'rischiare', 'perdere', 'indicare',
    'dubitare', 'approvare', 'criticare', 'lodare', 'biasimare', 'ringraziare', 'scusare', 'incolpare',
    'accusare', 'assolvere', 'condannare', 'punire', 'premiare', 'comandare', 'obbedire', 'ubbidire',
    'disobbedire', 'consigliare', 'ordinare', 'proibire', 'permettre', 'impedire', 'facilitare', 'complicare',
    'migliorare', 'peggiorare', 'conservare', 'iniziare', 'terminare', 'interrompere', 'proseguire', 'precedere',
    'accompagnare', 'condurre', 'trasportare', 'parcheggiare', 'girare', 'esplorare', 'domandare', 'interrogare',
    'esaminare', 'verificare', 'confermare', 'smentire', 'dimostrare', 'testare', 'sperimentare', 'valutare',
    'giudicare', 'confrontare', 'paragonare', 'distinguere', 'confondere', 'separare', 'unire', 'collegare',
    'connettere', 'dividere', 'condividere', 'partecipare', 'collaborare', 'cooperare', 'assistere', 'sostenere',
    'appoggiare', 'opporsi', 'resistere', 'arrendersi', 'cedere', 'negoziare', 'contrattare', 'accordare',
    'discutere', 'litigare', 'battagliare', 'sconfiggere', 'fuggire', 'catturare', 'liberare', 'arrestare',
    'imprigionare', 'ricompensare', 'gratificare', 'elogiare', 'complimentare', 'rimproverare', 'sgridare',
    'incoraggiare', 'consolare', 'confortare', 'calmare', 'agitare', 'innervosire', 'irritare', 'arrabbiare',
    'incollerire', 'terrorizzare', 'intimidire', 'aggredire', 'colpire', 'picchiare', 'ferire', 'danneggiare',
    'rovinare', 'guastare', 'curare', 'sanare', 'guarire', 'ammalare', 'dolere', 'sanguinare', 'medicare',
    'operare', 'trapiantare', 'vaccinare', 'prevenire', 'infettare', 'contagiare', 'disinfettare', 'igienizzare',
    'sterilizzare', 'organizzare', 'ordinare', 'sistemare', 'riordinare', 'arrangiare', 'allestire', 'montare',
    'smontare', 'demolire', 'produrre', 'fabbricare', 'elaborare', 'trasformare', 'modificare', 'adattare',
    'adeguare', 'perfezionare', 'ottimizzare', 'deteriorare', 'mantenere', 'preservare', 'salvaguardare',
    'tutelare', 'garantire', 'assicurare', 'pericolare', 'avventurare', 'osare', 'tentare', 'ispezionare',
    'analizzare', 'ricercare', 'investigare', 'indagare', 'ritrovare', 'smarrire', 'celare', 'occultare',
    'mascherare', 'travestire', 'camuffare', 'simulare', 'fingere', 'ingannare', 'imbrogliare', 'truccare',
    'manipolare', 'influenzare', 'condizionare', 'persuadere', 'convincere', 'dissuadere', 'sconsigliare',
    'suggerire', 'proporre', 'presentare', 'esporre', 'illustrare', 'chiarire', 'definire', 'narrare',
    'riferire', 'comunicare', 'informare', 'avvisare', 'avvertire', 'annunciare', 'dichiarare', 'proclamare',
    'gridare', 'sussurrare', 'bisbigliare', 'conversare', 'chiacchierare', 'dialogare', 'interlocuire',
    'replicare', 'ribattere', 'obiettare', 'contraddire', 'confutare', 'ratificare', 'validare', 'autenticare',
    'certificare', 'attestare', 'giurare', 'impegnarsi', 'impegnare', 'forzare', 'costringere', 'imporsi',
    'esigere', 'pretendere', 'richiedere', 'dirigere', 'amministrare', 'gestire', 'governare', 'regolare',
    'sorvegliare', 'vigilare', 'monitorare', 'supervisionare', 'coordinare', 'pianificare', 'programmare',
    'progettare', 'schematizzare', 'abbozzare', 'delineare', 'tracciare', 'marcare', 'contrassegnare',
    'etichettare', 'classificare', 'catalogare', 'archiviare', 'registrare', 'annotare', 'appuntare',
    'rilevare', 'constatare', 'accorgersi', 'incontrare', 'imbattersi', 'incrociare', 'incappare',
    'soccombere', 'sopravvivere', 'sopportare', 'tollerare', 'patire', 'subire', 'accogliere', 'ospitare',
    'alloggiare', 'abitare', 'residenziare', 'dimorare', 'esistere', 'sussistere', 'persistere', 'perdurare',
    'conseguire', 'risultare', 'derivare', 'provenire', 'originare', 'crearsi', 'formarsi', 'svilupparsi',
    'evolversi', 'espandersi', 'diffondersi', 'propagarsi', 'estendersi', 'allargarsi', 'ampliarsi',
    'ingrandirsi', 'accrescersi', 'incrementare', 'moltiplicarsi', 'proliferare', 'riprodursi', 'generare',
    'plasmare', 'foggire', 'modellare', 'intagliare', 'incidere', 'colorare', 'tingere', 'verniciare',
    'decorare', 'abbellire', 'adornare', 'ornare', 'guarnire', 'fregiare', 'impreziosire', 'arrichire',
    'abbigliare', 'vestire', 'indossare', 'esibire', 'sfoggiare', 'ostentare', 'manifestare', 'esprimere',
    'rivelare', 'svelare', 'palesare', 'sottolineare', 'accentuare', 'rinforzare', 'rafforzare', 'consolidare',
    'convalidare', 'accertare', 'riscontrare', 'revisionare', 'rivedere', 'correggere', 'rettificare',
    'variare', 'alterare', 'convertire', 'mutare', 'divenire', 'trasformarsi', 'cambiarsi', 'mutarsi',
    'progresso', 'avanzare', 'progredire', 'affinare', 'migliorarsi', 'perfezionarsi', 'affinarsi',
    'maturare', 'fiorire', 'sbocciare', 'germogliare', 'benvenuto', 'funzionante', 'interfaccia', 'simile',
    'formattare', 'aggiungere', 'elenchi', 'funzionalità', 'base', 'complete', 'familiare', 'dipendenza',
    'esterna', 'documento', 'successo', 'iniziare', 'scrivere', 'qui', 'testo', 'completamente', 'editor',
    'molto', 'altro', 'forte', 'corsivo', 'aggiungere', 'strumenti', 'comandi', 'formattazione', 'tabelle',
    'immagini', 'collegamenti', 'allineamento', 'elenco', 'puntato', 'numerato', 'colore', 'carattere',
    'dimensione', 'grassetto', 'sottolineato', 'titolo', 'paragrafo', 'normale', 'evidenziare', 'giallo',
    'verde', 'rosa', 'blu', 'arancione', 'rimuovere', 'evidenziazione', 'appunti', 'incolla', 'taglia',
    'copia', 'annulla', 'ripristina', 'carattere', 'paragrafo', 'stili', 'inserisci', 'layout', 'revisione',
    'controllo', 'ortografia', 'conteggio', 'parole', 'strumenti', 'superiore', 'menu', 'file', 'home',
    'inserisci', 'layout', 'revisione', 'azioni', 'rapide', 'salva', 'server', 'nuovo', 'apri', 'esporta',
    'pdf', 'salva', 'nome', 'chiudi', 'modal', 'immagine', 'tabella', 'collegamento', 'url', 'carica',
    'file', 'dimensioni', 'larghezza', 'altezza', 'allineamento', 'sinistra', 'centro', 'destra', 'anteprima',
    'upload', 'righe', 'colonne', 'stile', 'base', 'righe', 'alterne', 'bordi', 'modifica', 'struttura',
    'aggiungi', 'rimuovi', 'celle', 'unisci', 'dividi', 'applica', 'elimina', 'orientamento', 'verticale',
    'orizzontale', 'margini', 'superiore', 'inferiore', 'sinistro', 'destro', 'normale', 'stretto', 'ampio',
    'barra', 'titolo', 'stato', 'pagine', 'lingua', 'italiano', 'zoom', 'stampa', 'pieno', 'schermo',
    'markdown', 'aiuto', 'informazioni', 'versione', 'aggiornamento', 'preferenze', 'impostazioni', 'tema',
    'chiaro', 'scuro', 'colori', 'personalizzazione', 'strumenti', 'avanzati', 'pubblicazione', 'condivisione',
    'collaborazione', 'commenti', 'modifiche', 'tracciamento', 'revisioni', 'accettare', 'rifiutare',
    'modifiche', 'protezione', 'password', 'sicurezza', 'privacy', 'backup', 'ripristino', 'cronologia',
    'versioni', 'precedenti', 'differenze', 'confronto', 'unione', 'divisione', 'sezioni', 'intestazione',
    'piè', 'pagina', 'numeri', 'pagine', 'note', 'riferimenti', 'bibliografia', 'indice', 'sommario',
    'titoli', 'sottotitoli', 'capitoli', 'paragrafi', 'figure', 'tabelle', 'grafici', 'diagrammi', 'equazioni',
    'formule', 'simboli', 'caratteri', 'speciali', 'emoji', 'faccine', 'disegni', 'forme', 'linee', 'frecce',
    'rettangoli', 'cerchi', 'poligoni', 'testo', 'artistico', 'wordart', 'effetti', 'ombre', 'riflessi',
    'lucentezza', 'trasparenza', 'gradienti', 'riempimenti', 'trame', 'immagini', 'sfondo', 'filigrana',
    'bordo', 'pagina', 'colonna', 'testo', 'opaco', 'trasparente', 'visibile', 'nascosto', 'bloccato',
    'sbloccato', 'gruppo', 'separato', 'allineato', 'distribuito', 'spazio', 'uniforme', 'regolare',
    'casuale', 'ordinato', 'alfabetico', 'numerico', 'cronologico', 'priorità', 'importanza', 'urgenza',
    'completamento', 'progresso', 'stato', 'avanzamento', 'livello', 'difficoltà', 'complesso', 'semplice',
    'basico', 'avanzato', 'esperto', 'professionale', 'enterprise', 'business', 'personale', 'educativo',
    'scolastico', 'universitario', 'ricerca', 'scientifico', 'tecnico', 'medico', 'legale', 'finanziario',
    'commerciale', 'marketing', 'vendite', 'risorse', 'umane', 'gestione', 'progetto', 'pianificazione',
    'budget', 'tempo', 'scadenza', 'milestone', 'obiettivo', 'risultato', 'performance', 'efficienza',
    'produttività', 'qualità', 'quantità', 'velocità', 'precisione', 'accuratezza', 'affidabilità',
    'sicurezza', 'stabilità', 'compatibilità', 'portabilità', 'scalabilità', 'flessibilità', 'modularità',
    'riutilizzo', 'manutenibilità', 'documentazione', 'supporto', 'assistenza', 'formazione', 'tutorial',
    'guida', 'manuale', 'istruzioni', 'passo', 'procedura', 'metodologia', 'tecnica', 'strategia',
    'approccio', 'soluzione', 'problema', 'sfida', 'opportunità', 'innovazione', 'creatività', 'originalità',
    'unicità', 'valore', 'beneficio', 'vantaggio', 'svantaggio', 'limitazione', 'restrizione', 'vincolo',
    'requisito', 'specifica', 'caratteristica', 'funzione', 'capacità', 'potenzialità', 'possibilità',
    'opportunità', 'scenario', 'caso', 'uso', 'applicazione', 'implementazione', 'integrazione', 'migrazione',
    'aggiornamento', 'miglioramento', 'ottimizzazione', 'personalizzazione', 'localizzazione', 'internazionalizzazione',
    'traduzione', 'lingua', 'locale', 'globale', 'regionale', 'nazionale', 'internazionale', 'multilingue',
    'accessibilità', 'inclusività', 'usabilità', 'esperienza', 'utente', 'interfaccia', 'grafica', 'design',
    'estetica', 'attrattiva', 'coinvolgimento', 'soddisfazione', 'fedeltà', 'ritenzione', 'acquisizione',
    'conversione', 'fidelizzazione', 'engagement', 'interazione', 'navigazione', 'ricerca', 'filtro',
    'ordinamento', 'categorizzazione', 'tassonomia', 'ontologia', 'metadata', 'tag', 'etichette', 'keyword',
    'ricerca', 'testo', 'libero', 'avanzata', 'booleana', 'fuzzy', 'fonetica', 'sinonimi', 'antonimi',
    'omofoni', 'omografi', 'polisemici', 'ambigui', 'specifici', 'generici', 'tecnici', 'gergali', 'formali',
    'informali', 'colloquiali', 'dialettali', 'regionali', 'arcaici', 'obsoleti', 'moderni', 'contemporanei',
    'futuri', 'visionari', 'fantasy', 'sci-fi', 'realistici', 'astratti', 'concreti', 'tangibili', 'virtuali',
    'digitali', 'analogici', 'ibridi', 'convergenti', 'divergenti', 'paralleli', 'alternativi', 'complementari',
    'supplementari', 'aggiuntivi', 'opzionali', 'obbligatori', 'necessari', 'essenziali', 'fondamentali',
    'primari', 'secondari', 'terziari', 'multilivello', 'gerarchici', 'reticolari', 'modulari', 'compositi',
    'atomici', 'molecolari', 'macromolecolari', 'nanoscopici', 'microscopici', 'macroscopici', 'cosmici',
    'universali', 'globali', 'locali', 'puntuali', 'distribuiti', 'centralizzati', 'decentralizzati',
    'federati', 'isolati', 'connessi', 'integrati', 'separati', 'uniti', 'divisi', 'fusi', 'scissi',
    'ricomposti', 'scomposti', 'analizzati', 'sintetizzati', 'compresi', 'spiegati', 'descritti', 'narrati',
    'raccontati', 'commentati', 'criticati', 'valutati', 'giudicati', 'premiati', 'penalizzati', 'migliorati',
    'peggiorati', 'mantenuti', 'conservati', 'cambiati', 'modificati', 'rivoluzionati', 'evoluti', 'involuti',
    'progressi', 'regressi', 'avanzamenti', 'arretramenti', 'successi', 'fallimenti', 'vittorie', 'sconfitte',
    'acquisizioni', 'perdite', 'guadagni', 'profitti', 'perdite', 'bilanci', 'equilibri', 'squilibri',
    'armonie', 'dissonanze', 'consonanze', 'ritmi', 'melodie', 'armonie', 'sinfonie', 'concert', 'opera',
    'balletto', 'teatro', 'cinema', 'televisione', 'radio', 'internet', 'web', 'digitale', 'analogico',
    'virtuale', 'reale', 'aumentato', 'immersivo', 'interattivo', 'passivo', 'attivo', 'proattivo', 'reattivo',
    'preventivo', 'correttivo', 'predittivo', 'prescrittivo', 'descrittivo', 'narrativo', 'espositivo',
    'argomentativo', 'persuasivo', 'informativo', 'educativo', 'divulgativo', 'scientifico', 'tecnico',
    'umanistico', 'artistico', 'creativo', 'innovativo', 'tradizionale', 'conservatore', 'progressista',
    'rivoluzionario', 'evoluzionario', 'statico', 'dinamico', 'fluido', 'rigido', 'flessibile', 'adattabile',
    'resistente', 'fragile', 'robusto', 'delicato', 'sottile', 'spesso', 'lungo', 'corto', 'alto', 'basso',
    'largo', 'stretto', 'pesante', 'leggero', 'veloce', 'lento', 'caldo', 'freddo', 'duro', 'morbido',
    'liscio', 'ruvido', 'lucido', 'opaco', 'trasparente', 'traslucido', 'opaco', 'colorato', 'monocromatico',
    'policromo', 'pastello', 'vivace', 'smorto', 'brillante', 'spento', 'saturato', 'desaturato', 'contrasto',
    'luminosità', 'tonalità', 'saturazione', 'temperatura', 'colore', 'tinta', 'sfumatura', 'gradiente',
    'pattern', 'texture', 'rilievo', 'profondità', 'prospettiva', 'dimensione', 'scala', 'proporzione',
    'simmetria', 'asimmetria', 'bilanciamento', 'squilibrio', 'armonia', 'contrasto', 'ritmo', 'movimento',
    'staticità', 'dinamismo', 'energia', 'forza', 'potenza', 'debolezza', 'fragilità', 'resilienza',
    'resistenza', 'elasticità', 'plasticità', 'viscosità', 'fluidità', 'solidità', 'gassosità', 'plasmaticità',
    'cristallinità', 'amorfismo', 'struttura', 'organizzazione', 'sistem', 'complesso', 'semplice', 'caotico',
    'ordinato', 'casuale', 'deterministico', 'probabilistico', 'statistico', 'quantistico', 'relativistico',
    'newtoniano', 'einsteiniano', 'galileiano', 'aristotelico', 'platonico', 'socratico', 'cartesiano',
    'kantiano', 'hegeliano', 'marxiano', 'freudiano', 'jungiano', 'darwiniano', 'lamarckiano', 'einsteiniano',
    'bohriano', 'schrodingeriano', 'heisenbergiano', 'diracano', 'feynmaniano', 'hawkingiano', 'penrosiano',
    'benvenuto', 'online', 'clone', 'editor', 'testo', 'completamente', 'funzionante', 'interfaccia', 'simile', 'microsoft', 'word',
    'formattare', 'aggiungere', 'elenchi', 'funzionalità', 'base', 'complete', 'familiare', 'dipendenza', 'esterna', 'documento',
    'successo', 'iniziare', 'scrivere', 'qui', 'forte', 'corsivo', 'strumenti', 'comandi', 'formattazione', 'tabelle', 'immagini',
    'collegamenti', 'allineamento', 'puntato', 'numerato', 'colore', 'carattere', 'dimensione', 'grassetto', 'sottolineato', 'titolo',
    'paragrafo', 'normale', 'evidenziare', 'giallo', 'verde', 'rosa', 'blu', 'arancione', 'rimuovere', 'evidenziazione', 'appunti',
    'incolla', 'taglia', 'copia', 'annulla', 'ripristina', 'stili', 'inserisci', 'layout', 'revisione', 'controllo', 'ortografia',
    'conteggio', 'parole', 'azioni', 'rapide', 'salva', 'server', 'nuovo', 'apri', 'esporta', 'pdf', 'chiudi', 'modal', 'url',
    'carica', 'file', 'dimensioni', 'larghezza', 'altezza', 'sinistra', 'centro', 'destra', 'anteprima', 'upload', 'righe', 'colonne',
    'base', 'alterne', 'bordi', 'modifica', 'struttura', 'aggiungi', 'rimuovi', 'celle', 'unisci', 'dividi', 'applica', 'elimina',
    'verticale', 'orizzontale', 'margini', 'superiore', 'inferiore', 'sinistro', 'destro', 'normale', 'stretto', 'ampio', 'stato',
    'pagine', 'lingua', 'italiano', 'zoom', 'stampa', 'schermo', 'markdown', 'puoi', 'altro', 'molto', 'altro'
];

// FUNZIONE PRINCIPALE DI CONTROLLO ORTOGRAFICO
function spellCheck() {
    if (!spellCheckEnabled) {
        startSpellCheck();
    } else {
        stopSpellCheck();
    }
}

// AVVIA IL CONTROLLO ORTOGRAFICO
function startSpellCheck() {
    spellCheckEnabled = true;
    currentSpellCheckErrors = [];
    
    const editor = document.getElementById('editor');
    
    // SALVA la posizione del cursore
    const selection = window.getSelection();
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    
    // Ottieni solo il testo visibile, non l'HTML
    const textContent = editor.textContent || editor.innerText;
    
    // Dividi il testo in parole (solo testo, non HTML)
    const words = textContent.match(/\b[\wÀ-ÿ']+\b/gi) || [];
    
    // Trova gli errori
    const uniqueWords = [...new Set(words)]; // Evita duplicati
    uniqueWords.forEach((word) => {
        const normalizedWord = word.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        if (!italianDictionary.includes(normalizedWord) && 
            !italianDictionary.includes(word.toLowerCase()) &&
            word.length > 2 &&
            !isProbablyHTML(word)) {
            currentSpellCheckErrors.push({
                word: word,
                normalized: normalizedWord
            });
        }
    });
    
    // Evidenzia gli errori nel testo visibile
    highlightSpellCheckErrorsInText();
    
    // Aggiorna l'interfaccia
    updateSpellCheckUI();
    
    // RIPRISTINA la posizione del cursore
    if (range) {
        selection.removeAllRanges();
        selection.addRange(range);
    }
    
    if (currentSpellCheckErrors.length > 0) {
        alert(`Controllo ortografia completato. Trovati ${currentSpellCheckErrors.length} parole potenzialmente errate.`);
    } else {
        alert('Nessun errore di ortografia trovato!');
    }
}

// VERIFICA SE È PROBABILMENTE HTML/TAG
function isProbablyHTML(word) {
    const htmlPatterns = [
        /^<[^>]+>$/,
        /^&[a-z]+;$/,
        /^[a-z]+="[^"]*"$/,
        /^[a-z]+='[^']*'$/,
        /^\/[a-z]+$/,
        /^[a-z]+\/>$/,
        /^<!--/,
        /^-->$/
    ];
    
    return htmlPatterns.some(pattern => pattern.test(word));
}

// EVIDENZIA GLI ERRORI NEL TESTO VISIBILE
function highlightSpellCheckErrorsInText() {
    const editor = document.getElementById('editor');
    const walker = document.createTreeWalker(
        editor,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    let node;
    const nodesToProcess = [];
    
    // Raccoglie tutti i nodi di testo
    while (node = walker.nextNode()) {
        if (node.textContent.trim().length > 0) {
            nodesToProcess.push(node);
        }
    }
    
    // Processa ogni nodo di testo
    nodesToProcess.forEach(textNode => {
        const text = textNode.textContent;
        const words = text.match(/\b[\wÀ-ÿ']+\b/gi) || [];
        
        if (words.length === 0) return;
        
        let newHTML = text;
        let hasChanges = false;
        
        currentSpellCheckErrors.forEach(error => {
            const regex = new RegExp(`\\b${escapeRegExp(error.word)}\\b`, 'g');
            if (regex.test(newHTML)) {
                newHTML = newHTML.replace(regex, `<span class="spell-check-error" data-word="${error.word}">${error.word}</span>`);
                hasChanges = true;
            }
        });
        
        if (hasChanges) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = newHTML;
            
            // Sostituisci il nodo di testo con i nuovi elementi
            const parent = textNode.parentNode;
            while (tempDiv.firstChild) {
                parent.insertBefore(tempDiv.firstChild, textNode);
            }
            parent.removeChild(textNode);
        }
    });
    
    // Aggiungi event listener per le correzioni
    addSpellCheckEventListeners();
}

// RIMUOVI LE EVIDENZIAZIONI
function removeSpellCheckHighlights() {
    const editor = document.getElementById('editor');
    const errorSpans = editor.querySelectorAll('.spell-check-error');
    
    errorSpans.forEach(span => {
        const textNode = document.createTextNode(span.textContent);
        span.parentNode.replaceChild(textNode, span);
    });
    
    // Normalizza il contenuto per unire nodi di testo adiacenti
    editor.normalize();
    
    currentSpellCheckErrors = [];
}

// AGGIUNGI EVENT LISTENER PER LE CORREZIONI
function addSpellCheckEventListeners() {
    const errorElements = document.querySelectorAll('.spell-check-error');
    
    errorElements.forEach(element => {
        // Rimuovi eventuali listener precedenti
        element.replaceWith(element.cloneNode(true));
    });
    
    // Riaggiungi i listener agli elementi nuovi
    const newErrorElements = document.querySelectorAll('.spell-check-error');
    newErrorElements.forEach(element => {
        element.addEventListener('click', function(e) {
            e.stopPropagation();
            showSpellCheckSuggestions(this);
        });
    });
    
    // Chiudi i suggerimenti quando si clicca altrove
    document.addEventListener('click', function() {
        closeSpellCheckSuggestions();
    });
}

// MOSTRA SUGGERIMENTI DI CORREZIONE
function showSpellCheckSuggestions(element) {
    closeSpellCheckSuggestions();
    
    const word = element.getAttribute('data-word');
    const suggestions = getSpellCheckSuggestions(word);
    
    if (suggestions.length === 0) return;
    
    const suggestionsDiv = document.createElement('div');
    suggestionsDiv.className = 'spell-check-suggestions';
    suggestionsDiv.style.top = (element.offsetTop + element.offsetHeight) + 'px';
    suggestionsDiv.style.left = element.offsetLeft + 'px';
    
    suggestions.forEach(suggestion => {
        const suggestionElement = document.createElement('div');
        suggestionElement.className = 'spell-check-suggestion';
        suggestionElement.textContent = suggestion;
        suggestionElement.addEventListener('click', function() {
            replaceSpellCheckWord(element, suggestion);
            closeSpellCheckSuggestions();
        });
        suggestionsDiv.appendChild(suggestionElement);
    });
    
    // Aggiungi opzione "Ignora"
    const ignoreElement = document.createElement('div');
    ignoreElement.className = 'spell-check-suggestion';
    ignoreElement.textContent = 'Ignora';
    ignoreElement.addEventListener('click', function() {
        ignoreSpellCheckWord(element);
        closeSpellCheckSuggestions();
    });
    suggestionsDiv.appendChild(ignoreElement);
    
    element.appendChild(suggestionsDiv);
}

// CHIUDI I SUGGERIMENTI
function closeSpellCheckSuggestions() {
    const existingSuggestions = document.querySelectorAll('.spell-check-suggestions');
    existingSuggestions.forEach(suggestion => {
        suggestion.remove();
    });
}

// OTTIENI SUGGERIMENTI DI CORREZIONE
function getSpellCheckSuggestions(word) {
    const suggestions = [];
    const normalizedWord = word.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Cerca parole simili nel dizionario
    italianDictionary.forEach(dictWord => {
        if (calculateSimilarity(normalizedWord, dictWord) > 0.7) {
            suggestions.push(dictWord);
        }
    });
    
    // Limita a 5 suggerimenti
    return suggestions.slice(0, 5);
}

// CALCOLA SIMILARITÀ TRA PAROLE (algoritmo di Levenshtein semplificato)
function calculateSimilarity(word1, word2) {
    const longer = word1.length > word2.length ? word1 : word2;
    const shorter = word1.length > word2.length ? word2 : word1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = calculateLevenshteinDistance(word1, word2);
    return (longer.length - distance) / longer.length;
}

// CALCOLA DISTANZA DI LEVENSHTEIN
function calculateLevenshteinDistance(word1, word2) {
    const matrix = [];
    
    for (let i = 0; i <= word2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= word1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= word2.length; i++) {
        for (let j = 1; j <= word1.length; j++) {
            if (word2.charAt(i-1) === word1.charAt(j-1)) {
                matrix[i][j] = matrix[i-1][j-1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i-1][j-1] + 1,
                    matrix[i][j-1] + 1,
                    matrix[i-1][j] + 1
                );
            }
        }
    }
    
    return matrix[word2.length][word1.length];
}

// SOSTITUISCI PAROLA CON SUGGERIMENTO
function replaceSpellCheckWord(element, suggestion) {
    const textNode = document.createTextNode(suggestion);
    element.parentNode.replaceChild(textNode, element);
    
    // Riavvia il controllo ortografico
    setTimeout(() => {
        removeSpellCheckHighlights();
        startSpellCheck();
    }, 100);
}

// IGNORA PAROLA
function ignoreSpellCheckWord(element) {
    const textNode = document.createTextNode(element.textContent);
    element.parentNode.replaceChild(textNode, element);
}

// AGGIORNA INTERFACCIA CONTROLLO ORTOGRAFICO
function updateSpellCheckUI() {
    // Seleziona TUTTI i bottoni di controllo ortografia
    const spellCheckBtns = document.querySelectorAll('[onclick="spellCheck()"]');
    
    spellCheckBtns.forEach(btn => {
        if (spellCheckEnabled) {
            btn.innerHTML = '<i class="fas fa-spell-check"></i> Disattiva controllo';
            btn.style.background = '#e74c3c';
            btn.style.color = 'white';
        } else {
            btn.innerHTML = '<i class="fas fa-spell-check"></i> Controllo ortografia';
            btn.style.background = '';
            btn.style.color = '';
        }
    });
}

// FERMA IL CONTROLLO ORTOGRAFICO
function stopSpellCheck() {
    spellCheckEnabled = false;
    removeSpellCheckHighlights();
    updateSpellCheckUI();
    alert('Controllo ortografia disattivato.');
}

// FUNZIONE UTILITY PER ESCAPE REGEXP
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// AGGIUNGI SCORCIATOIA DA TASTIERA
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'F7') {
        e.preventDefault();
        spellCheck();
    }
});

// Funzione per mostrare l'help
function showHelp() {
    alert("Guida - Risorse e supporto per Word Online Clone");
}

// Funzione per la tab Riferimenti
function showReferencesTab() {
    showTab('references-tab');
}

// Funzione per la tab Visualizza
function showViewTab() {
    showTab('view-tab');
}

// Aggiorna la funzione showTab per gestire tutte le tab
function showTab(tabId) {
    // Nascondi tutti i contenuti del ribbon
    document.querySelectorAll('.ribbon-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Rimuovi active da tutte le tab
    document.querySelectorAll('.ribbon-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Mostra il contenuto della tab selezionata
    const tabElement = document.getElementById(tabId);
    if (tabElement) {
        tabElement.classList.add('active');
    }
    
    // Attiva la tab cliccata
    event.target.classList.add('active');
}

// Funzione per il pulsante Acquista
function buyCloneOffice() {
    window.open('../buy.html', '_blank');
}

// AGGIUNGI QUESTE FUNZIONI ALLA FINE DEL FILE

// Funzione per la stampa
function printDocument() {
    const content = document.getElementById('editor').innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Stampa Documento</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; line-height: 1.5; }
                @media print { body { margin: 0; } }
            </style>
        </head>
        <body>
            ${content}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

// Miglioramento della funzione di salvataggio
function saveDocument() {
    const content = document.getElementById('editor').innerHTML;
    currentDocument.content = content;
    
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (currentDocument.name || 'documento') + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Notifica più elegante
    showNotification('Documento salvato con successo!', 'success');
}

// Funzione per mostrare notifiche
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#4CAF50' : '#2196F3'};
        color: white;
        border-radius: 4px;
        z-index: 10000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Miglioramento del controllo ortografico
function enhanceSpellCheck() {
    const editor = document.getElementById('editor');
    editor.addEventListener('input', function() {
        // Aggiungi qui logica avanzata per controllo ortografico in tempo reale
        updateWordCount();
    });
}

// Inizializzazione migliorata
document.addEventListener('DOMContentLoaded', function() {
    initEditor();
    updateWordCount();
    setupEventListeners();
    updatePaperMargins();
    enhanceSpellCheck();
    
    // Carica documento salvato automaticamente
    const saved = localStorage.getItem('autoSaveDocument');
    if (saved) {
        document.getElementById('editor').innerHTML = saved;
        updateWordCount();
    }
});


