// ribbon-actions.js
// Gestione ribbon, oggetti grafici, drag & drop, menu contestuale disegno
(function() {
    'use strict';

    // ========================================================================
    // SERVIZIO OGGETTI GRAFICI (DRAWING OBJECTS)
    // ========================================================================

    /**
     * Rende un elemento trascinabile con salvataggio posizione e menu contestuale.
     * @param {HTMLElement} el - Elemento DOM da rendere draggable
     * @param {Object} drawData - Dati dell'oggetto grafico (dal registro spreadsheet)
     */
    function makeDraggableWithContext(el, drawData) {
        if (!el || !drawData) return;

        let isDragging = false;
        let offsetX = 0, offsetY = 0;
        let startX = 0, startY = 0;
        let hasMoved = false;
        let groupDrag = []; // { el, dd, startLeft, startTop } per spostamento di gruppo

        el.addEventListener('mousedown', (e) => {
            // Non avviare drag se si sta editando contenuto (contentEditable)
            if (e.target.isContentEditable && document.activeElement === e.target) return;
            // Non avviare drag se click su elemento figlio editabile
            if (e.target.closest('[contenteditable="true"]')) return;
            if (e.button !== 0) return; // Solo tasto sinistro

            // Spostamento di gruppo: cattura le posizioni iniziali dei membri dello stesso gruppo
            groupDrag = [];
            const ssRef = window.spreadsheet;
            if (drawData.groupId && ssRef && ssRef.drawingObjects) {
                document.querySelectorAll('.drawing-object').forEach(other => {
                    if (other === el) return;
                    const dd = ssRef.drawingObjects.find(x => String(x.id) === other.dataset.drawId);
                    if (dd && dd.groupId === drawData.groupId) {
                        groupDrag.push({ el: other, dd, startLeft: other.offsetLeft, startTop: other.offsetTop });
                    }
                });
            }
            isDragging = true;
            hasMoved = false;
            offsetX = e.clientX - el.offsetLeft;
            offsetY = e.clientY - el.offsetTop;
            startX = e.clientX;
            startY = e.clientY;
            el.style.cursor = 'grabbing';
            el.style.transition = 'none';
            // Porta in primo piano durante il drag
            const maxZ = Math.max(200, ...Array.from(document.querySelectorAll('.drawing-object'))
                .map(d => parseInt(d.style.zIndex) || 200));
            el.style.zIndex = maxZ + 1;
            drawData.zIndex = parseInt(el.style.zIndex);
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved = true;

            const left = e.clientX - offsetX;
            const top = e.clientY - offsetY;
            el.style.left = left + 'px';
            el.style.top = top + 'px';
            // Trascina insieme i membri del gruppo
            groupDrag.forEach(g => {
                g.el.style.left = (g.startLeft + dx) + 'px';
                g.el.style.top = (g.startTop + dy) + 'px';
            });
            e.preventDefault();
        });

        document.addEventListener('mouseup', (e) => {
            if (!isDragging) return;
            isDragging = false;
            el.style.cursor = 'move';
            el.style.transition = 'box-shadow 0.2s';

            // Aggiorna posizione nei dati
            drawData.left = parseInt(el.style.left) || 0;
            drawData.top = parseInt(el.style.top) || 0;

            // Aggiorna il registro nel foglio
            const ss = window.spreadsheet;
            if (ss && ss.updateDrawingObject) {
                ss.updateDrawingObject(drawData.id, {
                    left: drawData.left,
                    top: drawData.top,
                    zIndex: drawData.zIndex
                });
                // Persisti anche le nuove posizioni dei membri del gruppo
                groupDrag.forEach(g => {
                    g.dd.left = parseInt(g.el.style.left) || 0;
                    g.dd.top = parseInt(g.el.style.top) || 0;
                    ss.updateDrawingObject(g.dd.id, { left: g.dd.left, top: g.dd.top });
                });
                ss.saveState();
            }
            groupDrag = [];

            if (!hasMoved) {
                // Click senza drag: Ctrl/Shift = multi-selezione, altrimenti selezione singola
                if (e.ctrlKey || e.shiftKey) toggleMultiSelect(el, drawData);
                else selectDrawingObject(el, drawData);
            }
        });

        // Doppio click entra in modalità edit per oggetti di testo / equazioni
        el.addEventListener('dblclick', (e) => {
            // Equazioni — apre l'editor dedicato
            if (drawData.eqHtml !== undefined) {
                e.stopPropagation();
                showEquationEditor(drawData.id, drawData);
                return;
            }
            if (drawData.type === 'text' || drawData.type === 'wordart' || drawData.contentEditable) {
                e.stopPropagation();
                el.contentEditable = true;
                el.focus();
                // Seleziona tutto il contenuto
                try {
                    const range = document.createRange();
                    range.selectNodeContents(el);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                } catch (err) {}
            }
        });

        // Fine editing su blur
        el.addEventListener('blur', () => {
            if (el.isContentEditable) {
                el.contentEditable = false;
                // Aggiorna contenuto
                if (drawData.type === 'text' || drawData.type === 'wordart') {
                    drawData.content = el.textContent || '';
                    drawData.html = el.innerHTML || drawData.html;
                }
                const ss = window.spreadsheet;
                if (ss && ss.updateDrawingObject) {
                    ss.updateDrawingObject(drawData.id, {
                        content: drawData.content,
                        html: drawData.html
                    });
                    ss.saveState();
                }
            }
        });

        // Menu contestuale
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectDrawingObject(el, drawData);
            showDrawingContextMenu(e, el, drawData);
        });

        el.style.cursor = 'move';

        // Applica stili iniziali
        applyDrawStyles(el, drawData);
    }

    /**
     * Seleziona un oggetto grafico (deseleziona gli altri) e gestisce resize handle
     */
    function selectDrawingObject(el, drawData) {
        // Rimuovi resize handle da tutti
        document.querySelectorAll('.drawing-object').forEach(d => {
            d.style.outline = d === el ? '2px dashed #217346' : '';
            d.style.outlineOffset = d === el ? '2px' : '';
        });
        document.querySelectorAll('.resize-handle').forEach(h => h.remove());
        // Aggiungi resize handle all'oggetto selezionato
        if (el) addResizeHandles(el, drawData);
        const ss = window.spreadsheet;
        if (ss && ss.updateStatus) {
            ss.updateStatus('Selezionato: ' + (drawData.name || 'Oggetto grafico'));
        }
    }

    /** Aggiunge/rimuove un oggetto dalla multi-selezione (Ctrl/Shift+click) senza azzerare gli altri */
    function toggleMultiSelect(el, drawData) {
        const isSel = el.style.outline && el.style.outline.includes('dashed');
        if (isSel) {
            el.style.outline = '';
            el.style.outlineOffset = '';
        } else {
            el.style.outline = '2px dashed #217346';
            el.style.outlineOffset = '2px';
        }
        document.querySelectorAll('.resize-handle').forEach(h => h.remove());
        const n = document.querySelectorAll('.drawing-object[style*="dashed"]').length;
        const ss = window.spreadsheet;
        if (ss && ss.updateStatus) ss.updateStatus(`${n} ogget${n === 1 ? 'to' : 'ti'} selezionat${n === 1 ? 'o' : 'i'}`);
    }

    /**
     * Aggiunge 8 handle di ridimensionamento a un drawing object
     */
    function addResizeHandles(el, drawData) {
        if (!el || !drawData) return;
        // Rimuovi handle esistenti
        el.querySelectorAll('.resize-handle').forEach(h => h.remove());

        const positions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        const styles = {
            nw: { top: '-5px', left: '-5px', cursor: 'nwse-resize' },
            n:  { top: '-5px', left: '50%', marginLeft: '-5px', cursor: 'ns-resize' },
            ne: { top: '-5px', right: '-5px', cursor: 'nesw-resize' },
            e:  { top: '50%', right: '-5px', marginTop: '-5px', cursor: 'ew-resize' },
            se: { bottom: '-5px', right: '-5px', cursor: 'nwse-resize' },
            s:  { bottom: '-5px', left: '50%', marginLeft: '-5px', cursor: 'ns-resize' },
            sw: { bottom: '-5px', left: '-5px', cursor: 'nesw-resize' },
            w:  { top: '50%', left: '-5px', marginTop: '-5px', cursor: 'ew-resize' }
        };

        let resizeData = null;

        positions.forEach(pos => {
            const handle = document.createElement('div');
            handle.className = 'resize-handle';
            const s = styles[pos];
            handle.style.cssText = `position:absolute;${Object.entries(s).map(([k,v]) => k+':'+v).join(';')};width:10px;height:10px;background:#fff;border:2px solid #217346;z-index:9999;box-sizing:border-box;`;
            el.appendChild(handle);

            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const startW = el.offsetWidth;
                const startH = el.offsetHeight;
                const startX = e.clientX;
                const startY = e.clientY;
                const startLeft = el.offsetLeft;
                const startTop = el.offsetTop;
                resizeData = { pos, startW, startH, startX, startY, startLeft, startTop };

                document.addEventListener('mousemove', onResizeMove);
                document.addEventListener('mouseup', onResizeEnd, { once: true });
            });
        });

        function onResizeMove(e) {
            if (!resizeData) return;
            const { pos, startW, startH, startX, startY, startLeft, startTop } = resizeData;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            let newW = startW, newH = startH, newLeft = startLeft, newTop = startTop;

            if (pos.includes('e')) newW = Math.max(20, startW + dx);
            if (pos.includes('w')) { newW = Math.max(20, startW - dx); newLeft = startLeft + startW - newW; }
            if (pos.includes('s')) newH = Math.max(20, startH + dy);
            if (pos.includes('n')) { newH = Math.max(20, startH - dy); newTop = startTop + startH - newH; }

            el.style.width = newW + 'px';
            el.style.height = newH + 'px';
            el.style.left = newLeft + 'px';
            el.style.top = newTop + 'px';
        }

        function onResizeEnd() {
            document.removeEventListener('mousemove', onResizeMove);
            if (resizeData) {
                drawData.width = el.offsetWidth;
                drawData.height = el.offsetHeight;
                drawData.left = el.offsetLeft;
                drawData.top = el.offsetTop;
                const ss = window.spreadsheet;
                if (ss && ss.updateDrawingObject) {
                    ss.updateDrawingObject(drawData.id, {
                        width: drawData.width,
                        height: drawData.height,
                        left: drawData.left,
                        top: drawData.top
                    });
                    ss.saveState();
                }
                resizeData = null;
            }
        }
    }

    /**
     * Applica stili CSS a un drawing object in base ai dati
     */
    function applyDrawStyles(el, drawData) {
        if (!el || !drawData) return;

        // Per le forme SVG, aggiorna l'SVG (fill + stroke) invece del div contenitore
        if (drawData.type === 'shape') {
            if (drawData.shapeType === 'line') {
                // La linea è una barra colorata: spessore = height
                el.style.background = drawData.fillColor || '#333';
                el.style.border = 'none';
                if (drawData.height) el.style.height = drawData.height + 'px';
            } else {
                updateShapeSvg(el, drawData);
            }
        } else if (drawData.type === 'smartart') {
            el.style.background = 'transparent';
            el.style.border = 'none';
        } else {
            if (drawData.fillColor) {
                el.style.backgroundColor = drawData.fillColor;
            }
            if (drawData.borderColor) {
                el.style.border = (drawData.borderWidth || 2) + 'px solid ' + drawData.borderColor;
            } else {
                el.style.border = '2px solid #ccc';
            }
        }
        // Opacità
        if (drawData.opacity !== undefined) {
            el.style.opacity = drawData.opacity;
        }
        // Angoli arrotondati
        if (drawData.borderRadius !== undefined) {
            el.style.borderRadius = drawData.borderRadius + 'px';
        }
        // Ombra
        if (drawData.boxShadow) {
            el.style.boxShadow = drawData.boxShadow;
        }
        // Rotazione
        if (drawData.rotation) {
            el.style.transform = 'rotate(' + drawData.rotation + 'deg)';
        }
        // Allineamento testo
        if (drawData.textAlign) {
            el.style.textAlign = drawData.textAlign;
        }
        if (drawData.fontSize) {
            el.style.fontSize = drawData.fontSize + 'px';
        }
        if (drawData.fontWeight) {
            el.style.fontWeight = drawData.fontWeight;
        }
        if (drawData.fontStyle) {
            el.style.fontStyle = drawData.fontStyle;
        }
        if (drawData.fontFamily) {
            el.style.fontFamily = drawData.fontFamily;
        }
        if (drawData.textDecoration) {
            el.style.textDecoration = drawData.textDecoration;
        }
        if (drawData.color) {
            el.style.color = drawData.color;
        }
        if (drawData.shapeType === 'line') {
            el.style.padding = '0';
        } else if (drawData.padding) {
            el.style.padding = drawData.padding + 'px';
        } else {
            el.style.padding = '4px';
        }
    }

    // ========================================================================
    // VECCHIA FUNZIONE DRAGGABLE (legacy, senza contesto)
    // ========================================================================

    function makeDraggable(el) {
        if (!el) return;
        let isDragging = false;
        let offsetX = 0, offsetY = 0;

        el.addEventListener('mousedown', (e) => {
            if (e.target.isContentEditable && document.activeElement === e.target) return;
            if (e.button !== 0) return;
            isDragging = true;
            offsetX = e.clientX - el.offsetLeft;
            offsetY = e.clientY - el.offsetTop;
            el.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            el.style.left = (e.clientX - offsetX) + 'px';
            el.style.top = (e.clientY - offsetY) + 'px';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            el.style.cursor = 'move';
        });

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showDrawingContextMenu(e, el, {});
        });

        el.style.cursor = 'move';
    }

    // ========================================================================
    // MENU CONTESTUALE OGGETTI GRAFICI
    // ========================================================================

    function showDrawingContextMenu(event, el, drawData) {
        // Rimuovi menu precedenti
        const old = document.querySelector('.drawing-context-menu');
        if (old) old.remove();

        const menu = document.createElement('div');
        menu.className = 'drawing-context-menu';
        menu.style.cssText = `
            position:fixed; left:${event.clientX}px; top:${event.clientY}px;
            background:#fff; border:1px solid #d6d6d6; border-radius:4px;
            box-shadow:0 4px 16px rgba(0,0,0,0.2); z-index:20000;
            min-width:180px; padding:4px 0; font-size:12px;
            font-family:'Segoe UI',sans-serif;
        `;

        const items = [];

        if (drawData.type === 'text' || drawData.type === 'wordart') {
            items.push({ label: 'Modifica testo', icon: '✏️', action: () => {
                el.contentEditable = true;
                el.focus();
                try {
                    const range = document.createRange();
                    range.selectNodeContents(el);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                } catch(err){}
            }});
            items.push({ type: 'separator' });
            // Opzioni formattazione testo
            items.push({ label: 'Tipo di carattere', icon: '🔤', action: () => {
                const fonts = ['Calibri','Arial','Times New Roman','Georgia','Impact','Comic Sans MS','Trebuchet MS','Verdana','Courier New','Segoe UI'];
                const current = drawData.fontFamily || 'Calibri';
                const list = fonts.map(f => `<option value="${f}" ${f === current ? 'selected' : ''}>${f}</option>`).join('');
                const picker = document.createElement('div');
                picker.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:30000;';
                picker.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:240px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
                    <strong style="font-size:14px;display:block;margin-bottom:12px;">Tipo di carattere</strong>
                    <select id="font-select" style="width:100%;padding:6px;font-size:13px;border:1px solid #ccc;border-radius:4px;">${list}</select>
                    <div style="text-align:right;margin-top:12px;">
                        <button id="font-cancel" style="padding:5px 12px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;margin-right:6px;">Annulla</button>
                        <button id="font-ok" style="padding:5px 12px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
                    </div>
                </div>`;
                document.body.appendChild(picker);
                picker.querySelector('#font-cancel').onclick = () => picker.remove();
                picker.querySelector('#font-ok').onclick = () => {
                    const val = picker.querySelector('#font-select').value;
                    drawData.fontFamily = val;
                    el.style.fontFamily = val;
                    updateDrawProp(drawData, 'fontFamily', val);
                    picker.remove();
                };
                picker.addEventListener('click', (e) => { if (e.target === picker) picker.remove(); });
            }});
            items.push({ label: 'Dimensione', icon: '🔠', action: () => {
                showInputDialog('Dimensione carattere', 'Dimensione (px):', drawData.fontSize || 28, 'es. 28, compreso tra 1 e 200', (val) => {
                    if (val === null || val === '') return;
                    const fs = parseInt(val);
                    if (fs > 0 && fs <= 200) {
                        drawData.fontSize = fs;
                        el.style.fontSize = fs + 'px';
                        updateDrawProp(drawData, 'fontSize', fs);
                    }
                });
            }});
            items.push({ label: 'Grassetto', icon: '𝗕', action: () => {
                const isBold = drawData.fontWeight === 'bold';
                drawData.fontWeight = isBold ? 'normal' : 'bold';
                el.style.fontWeight = drawData.fontWeight;
                updateDrawProp(drawData, 'fontWeight', drawData.fontWeight);
            }});
            items.push({ label: 'Corsivo', icon: '𝑰', action: () => {
                const isItalic = drawData.fontStyle === 'italic';
                drawData.fontStyle = isItalic ? 'normal' : 'italic';
                el.style.fontStyle = drawData.fontStyle;
                updateDrawProp(drawData, 'fontStyle', drawData.fontStyle);
            }});
            items.push({ label: 'Sottolineato', icon: '𝗨', action: () => {
                const isUnderlined = el.style.textDecoration === 'underline' || drawData.textDecoration === 'underline';
                drawData.textDecoration = isUnderlined ? 'none' : 'underline';
                el.style.textDecoration = drawData.textDecoration;
                updateDrawProp(drawData, 'textDecoration', drawData.textDecoration);
            }});
            items.push({ label: 'Colore testo', icon: '🎨', action: () => {
                showColorDialog('Colore del testo', drawData.color || '#333', (color) => {
                    if (color === null) return;
                    drawData.color = color;
                    el.style.color = color;
                    updateDrawProp(drawData, 'color', color);
                });
            }});
            items.push({ type: 'separator' });
        }

        if (drawData.type === 'smartart') {
            items.push({ label: 'Modifica testo', icon: '✏️', action: () => {
                editSmartArtTexts(el, drawData);
            }});
            items.push({ type: 'separator' });
        }

        const isLine = drawData.type === 'shape' && drawData.shapeType === 'line';

        items.push(
            { label: isLine ? 'Colore linea' : 'Colore riempimento', icon: '🎨', action: () => {
                showColorDialog(isLine ? 'Colore della linea' : 'Colore di riempimento', drawData.fillColor || '#4472C4', (color) => {
                    if (color === null) return;
                    drawData.fillColor = color;
                    if (isLine) {
                        el.style.backgroundColor = color;
                    } else if (drawData.type === 'shape') {
                        updateShapeSvg(el, drawData);
                    } else {
                        el.style.backgroundColor = color;
                    }
                    updateDrawProp(drawData, 'fillColor', color);
                });
            }}
        );

        if (isLine) {
            // Voci dedicate alla linea: spessore = altezza, lunghezza = larghezza
            items.push({ label: 'Spessore linea', icon: '📏', action: () => {
                showInputDialog('Spessore linea', 'Spessore (px):', drawData.height || 4, 'valore tra 1 e 100', (v) => {
                    if (v === null || v === '') return;
                    const h = parseInt(v);
                    if (h >= 1 && h <= 100) {
                        drawData.height = h;
                        el.style.height = h + 'px';
                        updateDrawProp(drawData, 'height', h);
                    }
                });
            }});
            items.push({ label: 'Lunghezza linea', icon: '↔️', action: () => {
                showInputDialog('Lunghezza linea', 'Lunghezza (px):', drawData.width || 120, 'valore tra 10 e 2000', (v) => {
                    if (v === null || v === '') return;
                    const w = parseInt(v);
                    if (w >= 10 && w <= 2000) {
                        drawData.width = w;
                        el.style.width = w + 'px';
                        updateDrawProp(drawData, 'width', w);
                    }
                });
            }});
        } else {
            items.push(
                { label: 'Colore bordo', icon: '✖', action: () => {
                    showColorDialog('Colore del bordo', drawData.borderColor || '#333', (color) => {
                        if (color === null) return;
                        drawData.borderColor = color;
                        if (drawData.type === 'shape') {
                            updateShapeSvg(el, drawData);
                        } else {
                            el.style.border = (drawData.borderWidth || 2) + 'px solid ' + color;
                        }
                        updateDrawProp(drawData, 'borderColor', color);
                    });
                }},
                { label: 'Spessore bordo', icon: '📏', action: () => {
                    showInputDialog('Spessore bordo', 'Spessore (px):', drawData.borderWidth || 2, 'valore tra 1 e 10', (w) => {
                        if (w === null || w === '') return;
                        const bw = parseInt(w);
                        if (bw >= 1 && bw <= 10) {
                            drawData.borderWidth = bw;
                            if (drawData.type === 'shape') {
                                updateShapeSvg(el, drawData);
                            } else {
                                el.style.border = bw + 'px solid ' + (drawData.borderColor || '#333');
                            }
                            updateDrawProp(drawData, 'borderWidth', bw);
                        }
                    });
                }}
            );
        }

        if (drawData.type !== 'image') {
            items.push({ label: 'Opacità', icon: '🔮', action: () => {
                showInputDialog('Opacità', 'Valore (0.1 - 1.0):', drawData.opacity !== undefined ? drawData.opacity : 1, 'es. 0.5 per 50%', (o) => {
                    if (o === null || o === '') return;
                    const opacity = parseFloat(o);
                    if (opacity >= 0.1 && opacity <= 1.0) {
                        drawData.opacity = opacity;
                        el.style.opacity = opacity;
                        updateDrawProp(drawData, 'opacity', opacity);
                    }
                });
            }});
        }

        items.push({ type: 'separator' });
        items.push(
            { label: 'Angoli arrotondati', icon: '⚪', action: () => {
                showInputDialog('Angoli arrotondati', 'Raggio (px):', drawData.borderRadius || 0, 'es. 10 per angoli stondati', (r) => {
                    if (r === null || r === '') return;
                    const br = parseInt(r);
                    if (isNaN(br)) return;
                    drawData.borderRadius = br;
                    el.style.borderRadius = br + 'px';
                    // Per le forme SVG (es. rettangolo) rigenera l'SVG così l'rx cambia davvero
                    if (drawData.type === 'shape' && drawData.shapeType !== 'line') {
                        updateShapeSvg(el, drawData);
                    }
                    updateDrawProp(drawData, 'borderRadius', br);
                });
            }},
            { label: 'Rotazione', icon: '↻', action: () => {
                showInputDialog('Rotazione', 'Gradi:', drawData.rotation || 0, 'es. 45 per ruotare di 45°', (deg) => {
                    if (deg === null || deg === '') return;
                    const rot = parseInt(deg);
                    drawData.rotation = rot;
                    el.style.transform = 'rotate(' + rot + 'deg)';
                    updateDrawProp(drawData, 'rotation', rot);
                });
            }},
            { type: 'separator' },
            { label: 'Porta in primo piano', icon: '⤴', action: () => {
                const maxZ = Math.max(200, ...Array.from(document.querySelectorAll('.drawing-object'))
                    .map(d => parseInt(d.style.zIndex) || 200));
                const newZ = maxZ + 1;
                el.style.zIndex = newZ;
                drawData.zIndex = newZ;
                updateDrawProp(drawData, 'zIndex', newZ);
            }},
            { label: 'Porta in secondo piano', icon: '⤵', action: () => {
                const minZ = Math.min(200, ...Array.from(document.querySelectorAll('.drawing-object'))
                    .map(d => parseInt(d.style.zIndex) || 200));
                const newZ = Math.max(1, minZ - 1);
                el.style.zIndex = newZ;
                drawData.zIndex = newZ;
                updateDrawProp(drawData, 'zIndex', newZ);
            }},
            { type: 'separator' },
            { label: 'Duplica', icon: '📋', action: () => {
                const cloneData = JSON.parse(JSON.stringify(drawData));
                cloneData.id = null; // will get new id
                cloneData.left = (cloneData.left || 0) + 20;
                cloneData.top = (cloneData.top || 0) + 20;
                if (typeof insertDrawingObject === 'function') {
                    insertDrawingObject(cloneData.type || 'shape', cloneData);
                }
            }},
            { label: 'Elimina', icon: '🗑️', action: () => {
                el.remove();
                const ss = window.spreadsheet;
                if (ss && ss.unregisterDrawingObject) {
                    ss.unregisterDrawingObject(drawData.id);
                }
                if (ss && ss.updateStatus) {
                    ss.updateStatus((drawData.name || 'Oggetto') + ' eliminato');
                }
            }}
        );

        items.forEach(item => {
            if (item.type === 'separator') {
                const sep = document.createElement('div');
                sep.style.cssText = 'height:1px;background:#e1e1e1;margin:4px 0;';
                menu.appendChild(sep);
            } else {
                const opt = document.createElement('div');
                opt.style.cssText = 'padding:6px 16px;cursor:pointer;display:flex;align-items:center;gap:8px;transition:background 0.1s;';
                opt.innerHTML = '<span>' + (item.icon || '') + '</span><span>' + item.label + '</span>';
                opt.addEventListener('mouseenter', () => opt.style.background = '#f3f3f3');
                opt.addEventListener('mouseleave', () => opt.style.background = '');
                opt.addEventListener('click', () => {
                    item.action();
                    menu.remove();
                });
                menu.appendChild(opt);
            }
        });

        document.body.appendChild(menu);

        // Chiudi menu al click fuori
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);

        // Evita overflow
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
        }
    }

    /**
     * Aggiorna una proprietà del drawing object nel registro centrale
     */
    function updateDrawProp(drawData, key, value) {
        const ss = window.spreadsheet;
        if (ss && ss.updateDrawingObject && drawData.id) {
            ss.updateDrawingObject(drawData.id, { [key]: value });
        }
    }

    // ========================================================================
    // INSERIMENTO OGGETTI GRAFICI
    // ========================================================================

    /**
     * Inserisce un oggetto grafico nel foglio e lo registra per la persistenza.
     * @param {string} type - Tipo di oggetto ('image', 'text', 'shape', 'wordart', etc.)
     * @param {Object} opts - Opzioni di creazione
     * @returns {HTMLElement} L'elemento creato
     */
    /** Calcola la posizione di una cella nello sheet */
    function getCellPosition(cellRef) {
        const ss = window.spreadsheet;
        if (!ss) return null;
        const cellEl = document.querySelector(`.cell[data-ref="${cellRef}"]`);
        if (cellEl) {
            const rect = cellEl.getBoundingClientRect();
            const sheetArea = document.getElementById('sheet-area');
            const sheetRect = sheetArea ? sheetArea.getBoundingClientRect() : { left: 0, top: 0 };
            return {
                left: rect.left - sheetRect.left,
                top: rect.top - sheetRect.top,
                width: rect.width,
                height: rect.height
            };
        }
        // Fallback: calcola da coordinate colonna/riga
        const coords = ss.getCellCoordinates(cellRef);
        const col = coords.col;
        const row = coords.row;
        let left = 0, top = 0;
        for (let c = 0; c < col; c++) left += ss.getColWidth(c);
        for (let r = 0; r < row; r++) top += ss.getRowHeight(r);
        return { left, top, width: ss.getColWidth(col), height: ss.getRowHeight(row) };
    }

    /** Genera SVG per forme geometriche con bordo (stroke) corretto */
    function getShapeSvg(drawData) {
        const fill = drawData.fillColor || '#4472C4';
        const stroke = drawData.borderColor || '#333';
        const sw = Math.min(drawData.borderWidth || 2, 10);
        const p = 4; // padding per lo stroke
        const w = 100 - 2 * p;
        const cx = 50, cy = 50;
        const shapeType = drawData.shapeType || 'rectangle';
        const r = drawData.borderRadius || 4;

        const paths = {
            'rectangle': `<rect x="${p}" y="${p}" width="${w}" height="${w}" rx="${Math.min(r, w/2)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" />`,
            'circle': `<circle cx="${cx}" cy="${cy}" r="${50 - p - sw/2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`,
            'triangle': `<polygon points="${cx},${p} ${p},${100-p} ${100-p},${100-p}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" />`,
            'diamond': `<polygon points="${cx},${p} ${100-p},${cy} ${cx},${100-p} ${p},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" />`,
            'arrow': `<polygon points="${p},22 ${100-p-40},22 ${100-p-40},${p} ${100-p},${cy} ${100-p-40},${100-p} ${100-p-40},78 ${p},78" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" />`
        };

        return paths[shapeType]
            ? `<svg width="100%" height="100%" viewBox="0 0 100 100" style="display:block;pointer-events:none;">${paths[shapeType]}</svg>`
            : '';
    }

    /** Aggiorna l'SVG di una forma geometrica in base ai drawData correnti */
    function updateShapeSvg(el, drawData) {
        if (drawData.type !== 'shape') return;
        const svg = getShapeSvg(drawData);
        if (svg) {
            const existing = el.querySelector('svg');
            if (existing) {
                existing.outerHTML = svg;
            } else {
                el.innerHTML = svg;
            }
            drawData.html = svg;
        }
        el.style.background = 'transparent';
        el.style.border = 'none';
    }

    // ========================================================================
    // SMARTART
    // ========================================================================

    /**
     * Genera SVG per SmartArt in base al layout
     * @param {string} layoutType - Tipo di layout
     * @param {string[]} [customTexts] - Testi personalizzati (default se omesso)
     */
    function getSmartArtSvg(layoutType, customTexts) {
        const colors = ['#4472C4', '#5B9BD5', '#A9D18E', '#FFC000', '#ED7D31', '#264478'];
        const texts = customTexts || getDefaultSmartArtTexts(layoutType);
        const light = '#fff', dark = '#333';

        switch (layoutType) {
            case 'list':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" style="width:100%;height:100%;display:block;">
                    <defs>
                        <linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${colors[0]}"/><stop offset="100%" stop-color="#3563A8"/></linearGradient>
                        <linearGradient id="lg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${colors[1]}"/><stop offset="100%" stop-color="#4285C4"/></linearGradient>
                        <linearGradient id="lg3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${colors[2]}"/><stop offset="100%" stop-color="#86BE6A"/></linearGradient>
                    </defs>
                    <rect x="20" y="15" width="360" height="62" rx="8" fill="url(#lg1)" stroke="#2b5a9a" stroke-width="1.5"/>
                    <circle cx="42" cy="46" r="14" fill="rgba(255,255,255,0.25)"/>
                    <text x="42" y="51" text-anchor="middle" fill="${light}" font-size="14" font-family="Calibri" font-weight="bold">1</text>
                    <text x="70" y="54" text-anchor="start" fill="${light}" font-size="18" font-family="Calibri">${texts[0]}</text>

                    <rect x="20" y="94" width="360" height="62" rx="8" fill="url(#lg2)" stroke="#4285C4" stroke-width="1.5"/>
                    <circle cx="42" cy="125" r="14" fill="rgba(255,255,255,0.25)"/>
                    <text x="42" y="130" text-anchor="middle" fill="${light}" font-size="14" font-family="Calibri" font-weight="bold">2</text>
                    <text x="70" y="133" text-anchor="start" fill="${light}" font-size="18" font-family="Calibri">${texts[1]}</text>

                    <rect x="20" y="173" width="360" height="62" rx="8" fill="url(#lg3)" stroke="#86BE6A" stroke-width="1.5"/>
                    <circle cx="42" cy="204" r="14" fill="rgba(255,255,255,0.25)"/>
                    <text x="42" y="209" text-anchor="middle" fill="${dark}" font-size="14" font-family="Calibri" font-weight="bold">3</text>
                    <text x="70" y="212" text-anchor="start" fill="${dark}" font-size="18" font-family="Calibri">${texts[2]}</text>
                </svg>`;

            case 'process':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 180" style="width:100%;height:100%;display:block;">
                    <defs>
                        <linearGradient id="pg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${colors[0]}"/><stop offset="100%" stop-color="#2855A0"/></linearGradient>
                        <linearGradient id="pg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${colors[1]}"/><stop offset="100%" stop-color="#3A7AC4"/></linearGradient>
                        <linearGradient id="pg3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${colors[2]}"/><stop offset="100%" stop-color="#7FB873"/></linearGradient>
                        <marker id="arrowG" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="${colors[0]}"/></marker>
                    </defs>
                    <rect x="15" y="40" width="130" height="90" rx="10" fill="url(#pg1)" stroke="#2855A0" stroke-width="1.5"/>
                    <text x="80" y="74" text-anchor="middle" fill="${light}" font-size="14" font-family="Calibri" font-weight="bold">Fase 1</text>
                    <text x="80" y="94" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="11" font-family="Calibri">${texts[0]}</text>
                    <line x1="155" y1="85" x2="185" y2="85" stroke="${colors[0]}" stroke-width="3" marker-end="url(#arrowG)"/>

                    <rect x="195" y="40" width="130" height="90" rx="10" fill="url(#pg2)" stroke="#3A7AC4" stroke-width="1.5"/>
                    <text x="260" y="74" text-anchor="middle" fill="${light}" font-size="14" font-family="Calibri" font-weight="bold">Fase 2</text>
                    <text x="260" y="94" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="11" font-family="Calibri">${texts[1]}</text>
                    <line x1="335" y1="85" x2="365" y2="85" stroke="${colors[0]}" stroke-width="3" marker-end="url(#arrowG)"/>

                    <rect x="375" y="40" width="110" height="90" rx="10" fill="url(#pg3)" stroke="#7FB873" stroke-width="1.5"/>
                    <text x="430" y="74" text-anchor="middle" fill="${dark}" font-size="14" font-family="Calibri" font-weight="bold">Fase 3</text>
                    <text x="430" y="94" text-anchor="middle" fill="rgba(0,0,0,0.65)" font-size="11" font-family="Calibri">${texts[2]}</text>
                </svg>`;

            case 'cycle':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 320" style="width:100%;height:100%;display:block;">
                    <defs>
                        <linearGradient id="cg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${colors[0]}"/><stop offset="100%" stop-color="#2855A0"/></linearGradient>
                        <linearGradient id="cg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${colors[1]}"/><stop offset="100%" stop-color="#3A7AC4"/></linearGradient>
                        <linearGradient id="cg3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${colors[2]}"/><stop offset="100%" stop-color="#7FB873"/></linearGradient>
                        <linearGradient id="cg4" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FFC000"/><stop offset="100%" stop-color="#E0A800"/></linearGradient>
                        <marker id="arrowC" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="${colors[1]}"/></marker>
                    </defs>
                    <!-- Top -->
                    <rect x="140" y="10" width="120" height="55" rx="28" fill="url(#cg1)" stroke="#2855A0" stroke-width="1.5"/>
                    <text x="200" y="43" text-anchor="middle" fill="${light}" font-size="13" font-family="Calibri" font-weight="bold">Fase 1</text>
                    <!-- Right arrow -->
                    <path d="M220,65 Q310,80 310,115" fill="none" stroke="${colors[1]}" stroke-width="2.5" marker-end="url(#arrowC)"/>
                    <!-- Right -->
                    <rect x="280" y="125" width="110" height="55" rx="8" fill="url(#cg2)" stroke="#3A7AC4" stroke-width="1.5"/>
                    <text x="335" y="158" text-anchor="middle" fill="${light}" font-size="13" font-family="Calibri" font-weight="bold">Fase 2</text>
                    <!-- Bottom arrow -->
                    <path d="M310,180 Q280,240 240,250" fill="none" stroke="${colors[2]}" stroke-width="2.5" marker-end="url(#arrowC)"/>
                    <!-- Bottom -->
                    <rect x="140" y="250" width="120" height="55" rx="8" fill="url(#cg3)" stroke="#7FB873" stroke-width="1.5"/>
                    <text x="200" y="283" text-anchor="middle" fill="${dark}" font-size="13" font-family="Calibri" font-weight="bold">Fase 3</text>
                    <!-- Left arrow -->
                    <path d="M160,250 Q90,240 90,180" fill="none" stroke="#FFC000" stroke-width="2.5" marker-end="url(#arrowC)"/>
                    <!-- Left -->
                    <rect x="10" y="125" width="110" height="55" rx="8" fill="url(#cg4)" stroke="#E0A800" stroke-width="1.5"/>
                    <text x="65" y="158" text-anchor="middle" fill="${dark}" font-size="13" font-family="Calibri" font-weight="bold">Fase 4</text>
                    <!-- Top-left arrow -->
                    <path d="M90,135 Q120,80 155,70" fill="none" stroke="${colors[0]}" stroke-width="2.5" marker-end="url(#arrowC)"/>
                </svg>`;

            case 'hierarchy':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 280" style="width:100%;height:100%;display:block;">
                    <defs>
                        <linearGradient id="hg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${colors[0]}"/><stop offset="100%" stop-color="#2855A0"/></linearGradient>
                        <linearGradient id="hg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${colors[1]}"/><stop offset="100%" stop-color="#3A7AC4"/></linearGradient>
                        <linearGradient id="hg3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${colors[2]}"/><stop offset="100%" stop-color="#7FB873"/></linearGradient>
                    </defs>
                    <!-- Top level -->
                    <rect x="135" y="10" width="150" height="55" rx="28" fill="url(#hg1)" stroke="#2855A0" stroke-width="1.5"/>
                    <text x="210" y="43" text-anchor="middle" fill="${light}" font-size="15" font-family="Calibri" font-weight="bold">${texts[0]}</text>
                    <!-- Connector lines -->
                    <line x1="210" y1="65" x2="210" y2="95" stroke="${colors[4]}" stroke-width="2"/>
                    <line x1="70" y1="95" x2="350" y2="95" stroke="${colors[4]}" stroke-width="2"/>
                    <line x1="70" y1="95" x2="70" y2="120" stroke="${colors[4]}" stroke-width="2"/>
                    <line x1="210" y1="95" x2="210" y2="120" stroke="${colors[4]}" stroke-width="2"/>
                    <line x1="350" y1="95" x2="350" y2="120" stroke="${colors[4]}" stroke-width="2"/>
                    <!-- Mid level -->
                    <rect x="15" y="125" width="110" height="55" rx="8" fill="url(#hg2)" stroke="#3A7AC4" stroke-width="1.5"/>
                    <text x="70" y="158" text-anchor="middle" fill="${light}" font-size="13" font-family="Calibri" font-weight="bold">${texts[1]}</text>
                    <rect x="155" y="125" width="110" height="55" rx="8" fill="url(#hg2)" stroke="#3A7AC4" stroke-width="1.5"/>
                    <text x="210" y="158" text-anchor="middle" fill="${light}" font-size="13" font-family="Calibri" font-weight="bold">${texts[2]}</text>
                    <rect x="295" y="125" width="110" height="55" rx="8" fill="url(#hg3)" stroke="#7FB873" stroke-width="1.5"/>
                    <text x="350" y="158" text-anchor="middle" fill="${dark}" font-size="13" font-family="Calibri" font-weight="bold">${texts[3]}</text>
                    <!-- Bottom connectors -->
                    <line x1="70" y1="180" x2="70" y2="200" stroke="${colors[4]}" stroke-width="1.5"/>
                    <line x1="210" y1="180" x2="210" y2="200" stroke="${colors[4]}" stroke-width="1.5"/>
                    <line x1="350" y1="180" x2="350" y2="200" stroke="${colors[4]}" stroke-width="1.5"/>
                    <!-- Bottom level boxes -->
                    <rect x="15" y="205" width="70" height="55" rx="6" fill="url(#hg3)" stroke="#7FB873" stroke-width="1.5"/>
                    <text x="50" y="238" text-anchor="middle" fill="${dark}" font-size="11" font-family="Calibri">${texts[4]}</text>
                    <rect x="95" y="205" width="70" height="55" rx="6" fill="url(#hg3)" stroke="#7FB873" stroke-width="1.5"/>
                    <text x="130" y="238" text-anchor="middle" fill="${dark}" font-size="11" font-family="Calibri">${texts[5]}</text>
                    <rect x="175" y="205" width="70" height="55" rx="6" fill="url(#hg3)" stroke="#7FB873" stroke-width="1.5"/>
                    <text x="210" y="238" text-anchor="middle" fill="${dark}" font-size="11" font-family="Calibri">${texts[6]}</text>
                    <rect x="295" y="205" width="50" height="55" rx="6" fill="url(#hg3)" stroke="#7FB873" stroke-width="1.5"/>
                    <text x="320" y="238" text-anchor="middle" fill="${dark}" font-size="10" font-family="Calibri">${texts[7]}</text>
                    <rect x="355" y="205" width="50" height="55" rx="6" fill="url(#hg3)" stroke="#7FB873" stroke-width="1.5"/>
                    <text x="380" y="238" text-anchor="middle" fill="${dark}" font-size="10" font-family="Calibri">${texts[8]}</text>
                </svg>`;

            case 'pyramid':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 280" style="width:100%;height:100%;display:block;">
                    <defs>
                        <linearGradient id="y1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${colors[0]}"/><stop offset="100%" stop-color="#2855A0"/></linearGradient>
                        <linearGradient id="y2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${colors[1]}"/><stop offset="100%" stop-color="#3A7AC4"/></linearGradient>
                        <linearGradient id="y3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${colors[2]}"/><stop offset="100%" stop-color="#7FB873"/></linearGradient>
                    </defs>
                    <polygon points="150,10 260,100 40,100" fill="url(#y1)" stroke="#2855A0" stroke-width="1.5" stroke-linejoin="round"/>
                    <text x="150" y="70" text-anchor="middle" fill="${light}" font-size="16" font-family="Calibri" font-weight="bold">${texts[0]}</text>
                    <polygon points="40,100 260,100 290,145 10,145" fill="url(#y2)" stroke="#3A7AC4" stroke-width="1.5" stroke-linejoin="round"/>
                    <text x="150" y="130" text-anchor="middle" fill="${light}" font-size="14" font-family="Calibri">${texts[1]}</text>
                    <polygon points="10,145 290,145 295,270 5,270" fill="url(#y3)" stroke="#7FB873" stroke-width="1.5" stroke-linejoin="round"/>
                    <text x="150" y="220" text-anchor="middle" fill="${dark}" font-size="14" font-family="Calibri">${texts[2]}</text>
                </svg>`;

            case 'matrix':
                return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 300" style="width:100%;height:100%;display:block;">
                    <defs>
                        <linearGradient id="m1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${colors[0]}"/><stop offset="100%" stop-color="#2855A0"/></linearGradient>
                        <linearGradient id="m2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${colors[1]}"/><stop offset="100%" stop-color="#3A7AC4"/></linearGradient>
                        <linearGradient id="m3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${colors[2]}"/><stop offset="100%" stop-color="#7FB873"/></linearGradient>
                        <linearGradient id="m4" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FFC000"/><stop offset="100%" stop-color="#E0A800"/></linearGradient>
                    </defs>
                    <rect x="10" y="10" width="160" height="125" rx="8" fill="url(#m1)" stroke="#2855A0" stroke-width="1.5"/>
                    <text x="90" y="55" text-anchor="middle" fill="${light}" font-size="15" font-family="Calibri" font-weight="bold">Quadrante 1</text>
                    <text x="90" y="80" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="11" font-family="Calibri">${texts[0]}</text>

                    <rect x="190" y="10" width="160" height="125" rx="8" fill="url(#m2)" stroke="#3A7AC4" stroke-width="1.5"/>
                    <text x="270" y="55" text-anchor="middle" fill="${light}" font-size="15" font-family="Calibri" font-weight="bold">Quadrante 2</text>
                    <text x="270" y="80" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="11" font-family="Calibri">${texts[1]}</text>

                    <rect x="10" y="160" width="160" height="125" rx="8" fill="url(#m3)" stroke="#7FB873" stroke-width="1.5"/>
                    <text x="90" y="205" text-anchor="middle" fill="${dark}" font-size="15" font-family="Calibri" font-weight="bold">Quadrante 3</text>
                    <text x="90" y="230" text-anchor="middle" fill="rgba(0,0,0,0.65)" font-size="11" font-family="Calibri">${texts[2]}</text>

                    <rect x="190" y="160" width="160" height="125" rx="8" fill="url(#m4)" stroke="#E0A800" stroke-width="1.5"/>
                    <text x="270" y="205" text-anchor="middle" fill="${dark}" font-size="15" font-family="Calibri" font-weight="bold">Quadrante 4</text>
                    <text x="270" y="230" text-anchor="middle" fill="rgba(0,0,0,0.65)" font-size="11" font-family="Calibri">${texts[3]}</text>
                </svg>`;

            default:
                return getSmartArtSvg('list');
        }
    }

    /** Testi predefiniti per ogni layout SmartArt */
    function getDefaultSmartArtTexts(layoutType) {
        const defaults = {
            'list': ['Elemento 1', 'Elemento 2', 'Elemento 3'],
            'process': ['Descrizione fase 1', 'Descrizione fase 2', 'Descrizione fase 3'],
            'cycle': ['Fase 1', 'Fase 2', 'Fase 3', 'Fase 4'],
            'hierarchy': ['Direzione', 'Reparto 1', 'Reparto 2', 'Reparto 3', 'Sotto 1', 'Sotto 2', 'Sotto 3', 'Sotto 4', 'Sotto 5'],
            'pyramid': ['Obiettivi', 'Strategie', 'Risultati'],
            'matrix': ['Alto valore', 'Da mantenere', 'Da sviluppare', 'Bassa priorità']
        };
        return defaults[layoutType] || ['Testo 1', 'Testo 2', 'Testo 3'];
    }

    /** Etichette descrittive per i campi di input dei testi */
    function getSmartArtLabels(layoutType) {
        const labels = {
            'list': ['Testo elemento 1', 'Testo elemento 2', 'Testo elemento 3'],
            'process': ['Descrizione fase 1', 'Descrizione fase 2', 'Descrizione fase 3'],
            'cycle': ['Nome fase 1', 'Nome fase 2', 'Nome fase 3', 'Nome fase 4'],
            'hierarchy': ['Direzione', 'Livello medio 1', 'Livello medio 2', 'Livello medio 3', 'Sotto-livello 1', 'Sotto-livello 2', 'Sotto-livello 3', 'Sotto-livello 4', 'Sotto-livello 5'],
            'pyramid': ['Livello superiore', 'Livello intermedio', 'Livello base'],
            'matrix': ['Quadrante 1', 'Quadrante 2', 'Quadrante 3', 'Quadrante 4']
        };
        return labels[layoutType] || [];
    }

    /** Rigenera SVG SmartArt con nuovi testi e aggiorna DOM + drawData */
    function updateSmartArtSvg(el, drawData) {
        if (drawData.type !== 'smartart') return;
        const layoutType = drawData.smartArtLayout || 'list';
        const texts = drawData.smartArtTexts || getDefaultSmartArtTexts(layoutType);
        const svg = getSmartArtSvg(layoutType, texts);
        if (svg) {
            el.innerHTML = svg;
            drawData.html = svg;
        }
        el.style.background = 'transparent';
        el.style.border = 'none';
    }

    /** Mostra dialog per modificare i testi di uno SmartArt */
    function editSmartArtTexts(el, drawData) {
        const layoutType = drawData.smartArtLayout || 'list';
        const labels = getSmartArtLabels(layoutType);
        const currentTexts = drawData.smartArtTexts ? drawData.smartArtTexts.slice() : getDefaultSmartArtTexts(layoutType);

        // Crea dialog modale
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.3);min-width:360px;max-width:420px;';

        let inputsHtml = labels.map((label, i) => `
            <div style="margin-bottom:10px;">
                <label style="display:block;font-size:12px;color:#555;margin-bottom:2px;">${label}</label>
                <input type="text" id="smartart-text-${i}" value="${escapeHtml(currentTexts[i] || '')}"
                    style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;">
            </div>
        `).join('');

        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <strong style="font-size:15px;">Modifica testo SmartArt</strong>
            </div>
            <form id="smartart-text-form">
                ${inputsHtml}
                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
                    <button type="button" id="smartart-cancel"
                        style="padding:6px 16px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;">Annulla</button>
                    <button type="submit"
                        style="padding:6px 16px;border:1px solid #0078d4;border-radius:4px;background:#0078d4;color:#fff;cursor:pointer;">Applica</button>
                </div>
            </form>`;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Previeni chiusura su click overlay
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        dialog.querySelector('#smartart-cancel').addEventListener('click', () => overlay.remove());

        dialog.querySelector('#smartart-text-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const newTexts = labels.map((_, i) => {
                const input = document.getElementById('smartart-text-' + i);
                return input ? input.value.trim() || currentTexts[i] : currentTexts[i];
            });
            drawData.smartArtTexts = newTexts;
            updateSmartArtSvg(el, drawData);
            // Salva nei drawData persistente
            updateDrawProp(drawData, 'smartArtTexts', newTexts);
            updateDrawProp(drawData, 'html', drawData.html);
            overlay.remove();
            const ss = window.spreadsheet;
            if (ss) ss.updateStatus('Testo SmartArt aggiornato');
        });

        // Focus sul primo input
        const firstInput = document.getElementById('smartart-text-0');
        if (firstInput) setTimeout(() => firstInput.focus(), 100);
    }

    /** Escape HTML per sicurezza */
    function escapeHtml(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function insertDrawingObject(type, opts) {
        opts = opts || {};
        const ss = window.spreadsheet;
        if (!ss) return null;

        const sheetArea = document.getElementById('sheet-area');
        if (!sheetArea) return null;

        const el = document.createElement('div');
        el.className = 'drawing-object';

        // Posizione: sulla cella selezionata, o viewport center
        const viewport = document.getElementById('spreadsheet-viewport');
        let posLeft, posTop;
        if (ss.selectedCell) {
            const cellPos = getCellPosition(ss.selectedCell);
            if (cellPos) {
                posLeft = cellPos.left;
                posTop = cellPos.top;
            }
        }
        const scrollLeft = viewport ? viewport.scrollLeft : 0;
        const scrollTop = viewport ? viewport.scrollTop : 0;
        if (posLeft === undefined) posLeft = scrollLeft + 120;
        if (posTop === undefined) posTop = scrollTop + 60;

        const drawData = {
            id: null, // generato da registerDrawingObject
            type: type,
            name: opts.name || getDrawingName(type),
            src: opts.src || '', // per immagini
            shapeType: opts.shapeType || '', // per forme geometriche (triangle, circle, diamond, arrow)
            left: opts.left !== undefined ? opts.left : posLeft,
            top: opts.top !== undefined ? opts.top : posTop,
            width: opts.width || 120,
            height: opts.height || 80,
            zIndex: opts.zIndex || 200,
            fillColor: opts.fillColor || getDefaultFill(type),
            borderColor: opts.borderColor || '#333',
            borderWidth: opts.borderWidth || 2,
            opacity: opts.opacity !== undefined ? opts.opacity : 1,
            borderRadius: opts.borderRadius !== undefined ? opts.borderRadius : (type === 'shape' ? 4 : 0),
            rotation: opts.rotation || 0,
            content: opts.content || '',
            html: opts.html || '',
            css: opts.css || '',
            color: opts.color || '#333',
            fontSize: opts.fontSize || (type === 'wordart' ? 28 : 14),
            fontWeight: opts.fontWeight || (type === 'wordart' ? 'bold' : 'normal'),
            fontStyle: opts.fontStyle || '',
            fontFamily: opts.fontFamily || 'Calibri',
            textAlign: opts.textAlign || 'center',
            padding: opts.padding || 8,
            boxShadow: opts.boxShadow || '',
            contentEditable: opts.contentEditable !== undefined ? opts.contentEditable : (type === 'text' || type === 'wordart'),
            smartArtLayout: opts.smartArtLayout || '',
            smartArtTexts: opts.smartArtTexts || null,
            embeddedApp: opts.embeddedApp || '',
            embeddedHref: opts.embeddedHref || '',
            embeddedName: opts.embeddedName || ''
        };

        // Costruisci HTML in base al tipo
        const styles = {
            position: 'absolute',
            left: drawData.left + 'px',
            top: drawData.top + 'px',
            width: drawData.width + 'px',
            height: drawData.height + 'px',
            cursor: 'move',
            zIndex: drawData.zIndex,
            userSelect: 'none',
            backgroundColor: drawData.fillColor,
            border: drawData.borderWidth + 'px solid ' + drawData.borderColor,
            borderRadius: drawData.borderRadius + 'px',
            opacity: drawData.opacity,
            transform: drawData.rotation ? 'rotate(' + drawData.rotation + 'deg)' : '',
            boxShadow: drawData.boxShadow || '0 2px 8px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: drawData.textAlign === 'center' ? 'center' : drawData.textAlign === 'left' ? 'flex-start' : 'flex-end',
            padding: drawData.padding + 'px',
            color: drawData.color,
            fontSize: drawData.fontSize + 'px',
            fontWeight: drawData.fontWeight,
            fontStyle: drawData.fontStyle,
            fontFamily: drawData.fontFamily,
            overflow: 'hidden',
            textAlign: drawData.textAlign || 'center',
            boxSizing: 'border-box'
        };

        if (drawData.css) {
            styles.cssText = drawData.css;
        }

        // Applica stili
        for (const prop in styles) {
            if (prop !== 'cssText') {
                el.style[prop] = styles[prop];
            }
        }

        // Contenuto specifico per tipo
        switch (type) {
            case 'image':
                if (opts.src) {
                    el.innerHTML = '<img src="' + opts.src + '" style="width:100%;height:100%;object-fit:contain;pointer-events:none;">';
                    el.style.backgroundColor = 'transparent';
                    el.style.border = 'none';
                    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                }
                break;

            case 'text':
                el.innerHTML = drawData.content || 'Testo';
                el.contentEditable = false;
                el.style.alignItems = 'flex-start';
                el.style.justifyContent = 'flex-start';
                el.style.whiteSpace = 'pre-wrap';
                el.style.wordBreak = 'break-word';
                el.style.cursor = 'move';
                break;

            case 'wordart':
                el.innerHTML = drawData.content || 'WordArt';
                el.contentEditable = true;
                el.style.fontSize = (drawData.fontSize || 28) + 'px';
                el.style.fontWeight = 'bold';
                el.style.fontFamily = 'Impact, Arial Black, sans-serif';
                el.style.color = drawData.color || '#0078d4';
                el.style.textShadow = '2px 2px 4px rgba(0,0,0,0.3)';
                el.style.background = 'linear-gradient(135deg, ' + (drawData.fillColor || '#e8f0fe') + ', ' + (drawData.fillColor || '#cce4f7') + ')';
                el.style.justifyContent = 'center';
                el.style.alignItems = 'center';
                el.style.cursor = 'move';
                break;

            case 'shape':
                if (drawData.shapeType === 'line') {
                    // La linea è una barra colorata: spessore = height, lunghezza = width
                    el.innerHTML = '';
                    el.style.background = drawData.fillColor || '#333';
                    el.style.border = 'none';
                    el.style.borderRadius = (drawData.borderRadius || 2) + 'px';
                    el.style.height = (drawData.height || 4) + 'px';
                    el.style.padding = '0';
                    el.style.boxShadow = 'none';
                    break;
                }
                // Genera SVG con bordo corretto (invece di clipPath che taglia i bordi)
                var svg = getShapeSvg(drawData);
                if (svg) {
                    el.innerHTML = svg;
                    drawData.html = svg; // salva per restore
                } else {
                    el.innerHTML = drawData.content || '';
                }
                el.style.background = 'transparent';
                el.style.border = 'none';
                break;

            case 'smartart':
                // SmartArt inserisce SVG tramite opts.html (dopo lo switch)
                el.style.background = 'transparent';
                el.style.border = 'none';
                break;

            default:
                if (drawData.content) el.innerHTML = drawData.content;
                break;
        }

        if (opts.html) {
            el.innerHTML = opts.html;
        }

        // Registra nel foglio
        const id = ss.registerDrawingObject(drawData);
        drawData.id = id;
        el.dataset.drawId = id;
        el.title = (drawData.name || 'Oggetto') + ' — Clic destro per opzioni, doppio click per modificare';

        // Rendi draggable con contesto
        makeDraggableWithContext(el, drawData);

        // makeDraggableWithContext chiama applyDrawStyles che riapplica backgroundColor/border;
        // per immagini e forme SVG, il div deve rimanere trasparente senza bordo
        // (eccetto le linee, che sono barre colorate visibili)
        if (type === 'image' || type === 'smartart' || (type === 'shape' && drawData.shapeType !== 'line')) {
            el.style.background = 'transparent';
            el.style.border = 'none';
        }

        sheetArea.appendChild(el);
        ss.setModified(true);
        ss.saveState();
        ss.updateStatus((drawData.name || 'Oggetto') + ' inserito');

        return el;
    }

    /**
     * Inserisce un oggetto SmartArt
     */
    function insertSmartArt(layoutType) {
        const layouts = {
            'list': { name: 'Elenco semplice', w: 360, h: 240 },
            'process': { name: 'Processo', w: 420, h: 160 },
            'cycle': { name: 'Ciclo', w: 360, h: 280 },
            'hierarchy': { name: 'Gerarchia', w: 380, h: 260 },
            'pyramid': { name: 'Piramide', w: 260, h: 260 },
            'matrix': { name: 'Matrice', w: 320, h: 270 }
        };
        const layout = layouts[layoutType] || layouts.list;
        const texts = getDefaultSmartArtTexts(layoutType);
        const svg = getSmartArtSvg(layoutType, texts);

        const opts = {
            name: 'SmartArt - ' + layout.name,
            width: layout.w,
            height: layout.h,
            html: svg,
            fillColor: 'transparent',
            borderColor: 'transparent',
            borderWidth: 0,
            borderRadius: 0,
            smartArtLayout: layoutType,
            smartArtTexts: texts,
            boxShadow: '0 2px 12px rgba(0,0,0,0.12)'
        };

        const el = insertDrawingObject('smartart', opts);
        if (el) {
            el.style.background = 'transparent';
            el.style.border = 'none';
        }
        return el;
    }

    function getDrawingName(type) {
        const names = {
            'image': 'Immagine',
            'text': 'Casella di testo',
            'wordart': 'WordArt',
            'shape': 'Forma',
            'smartart': 'SmartArt'
        };
        return names[type] || 'Oggetto grafico';
    }

    function getDefaultFill(type) {
        const fills = {
            'image': 'transparent',
            'text': '#ffffff',
            'wordart': '#e8f0fe',
            'shape': '#4472C4',
            'smartart': 'transparent'
        };
        return fills[type] || '#ffffff';
    }

    // ========================================================================
    // CREATORI SPECIFICI
    // ========================================================================

    /**
     * Inserisce un'immagine dal file system
     */
    function insertImage() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const opts = {
                    name: file.name,
                    src: event.target.result,
                    width: 200,
                    height: 150
                };
                insertDrawingObject('image', opts);
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    /**
     * Inserisce una casella di testo
     */
    function insertTextBox() {
        const opts = {
            name: 'Casella di testo',
            content: 'Testo',
            width: 180,
            height: 60,
            fillColor: '#ffffff',
            borderColor: '#666',
            borderWidth: 1,
            fontSize: 12,
            color: '#333',
            textAlign: 'left',
            padding: 8,
            fontFamily: 'Calibri',
            contentEditable: true,
            boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
        };
        insertDrawingObject('text', opts);
    }

    /**
     * Inserisce un WordArt
     */
    function insertWordArt() {
        const opts = {
            name: 'WordArt',
            content: 'Testo WordArt',
            width: 200,
            height: 60,
            fillColor: '#e8f0fe',
            borderColor: '#0078d4',
            borderWidth: 1,
            fontSize: 28,
            color: '#0078d4',
            fontWeight: 'bold',
            fontFamily: 'Impact, Arial Black, sans-serif',
            textAlign: 'center',
            contentEditable: true,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        };
        insertDrawingObject('wordart', opts);
    }

    /**
     * Inserisce una forma geometrica
     */
    function insertShape(shapeType, shapeName) {
        const opts = {
            name: shapeName || 'Forma',
            shapeType: shapeType || 'rectangle',
            width: 100,
            height: 100,
            fillColor: '#4472C4',
            borderColor: '#2b5a9a',
            borderWidth: 2,
            borderRadius: shapeType === 'circle' ? 0 : 4,
            opacity: 1
        };
        insertDrawingObject('shape', opts);
    }

    // ========================================================================
    // GESTIONE GRAFICI (CHART)
    // ========================================================================

    /**
     * Mostra dialog per creare grafico
     */
    function showChartDialog(chartType) {
        const ss = window.spreadsheet;
        if (!ss) return;

        // Se esiste excelAdvanced, delega a lui
        if (window.excelAdvanced && typeof window.excelAdvanced.createChart === 'function') {
            const typeMap = {
                'column': 'colonne',
                'line': 'linee',
                'pie': 'torta',
                'bar': 'barre',
                'area': 'area'
            };
            window.excelAdvanced.createChart(typeMap[chartType] || 'colonne');
            return;
        }

        // Altrimenti dialog base
        const overlay = document.createElement('div');
        overlay.id = 'chart-dialog-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const typeLabels = {
            'column': 'Grafico a colonne',
            'line': 'Grafico a linee',
            'pie': 'Grafico a torta',
            'bar': 'Grafico a barre',
            'area': 'Grafico ad area'
        };

        overlay.innerHTML = `
            <div style="background:#fff;border-radius:8px;padding:24px;min-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h3 style="margin:0;font-size:16px;">Inserisci grafico</h3>
                    <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#chart-dialog-modal').remove()">✕</button>
                </div>
                <p style="font-size:13px;color:#666;margin-bottom:16px;">Tipo: <b>${typeLabels[chartType] || chartType}</b></p>
                <div style="margin-bottom:16px;">
                    <label style="display:block;margin-bottom:4px;font-size:12px;">Titolo del grafico:</label>
                    <input type="text" id="chart-title" value="${typeLabels[chartType] || 'Grafico'}" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
                </div>
                <div style="margin-bottom:16px;">
                    <label style="font-size:12px;display:block;margin-bottom:4px;">Intervallo dati (es. A1:B6):</label>
                    <input type="text" id="chart-range" placeholder="A1:B6" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;">
                    <button id="chart-detect" style="margin-top:4px;padding:4px 10px;background:#f3f3f3;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:11px;">Rileva selezione</button>
                </div>
                <div style="margin-bottom:16px;">
                    <label style="font-size:12px;">Etichette righe: <input type="checkbox" id="chart-labels" checked></label>
                </div>
                <div style="text-align:right;">
                    <button id="chart-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                    <button id="chart-create" style="padding:6px 16px;background:#0078d4;color:#fff;border:none;border-radius:4px;cursor:pointer;">Crea</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        overlay.querySelector('#chart-detect').onclick = () => {
            if (ss.selectedRange && ss.selectedRange.start && ss.selectedRange.end) {
                overlay.querySelector('#chart-range').value = ss.selectedRange.start + ':' + ss.selectedRange.end;
            } else if (ss.selectedCell) {
                overlay.querySelector('#chart-range').placeholder = 'Nessun range selezionato';
            }
        };

        overlay.querySelector('#chart-cancel').onclick = () => overlay.remove();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        overlay.querySelector('#chart-create').onclick = () => {
            const title = overlay.querySelector('#chart-title').value || 'Grafico';
            const range = overlay.querySelector('#chart-range').value;
            const hasLabels = overlay.querySelector('#chart-labels').checked;

            if (!range) {
                ss.updateStatus('Specificare un intervallo di dati');
                return;
            }

            // Crea il grafico tramite excelAdvanced se disponibile
            if (window.excelAdvanced && typeof window.excelAdvanced.createChart === 'function') {
                window.excelAdvanced.createChart(chartType, title, range, hasLabels);
            } else {
                // Crea un grafico semplice inline
                createSimpleChart(chartType, title, range, hasLabels);
            }
            overlay.remove();
        };
    }

    /**
     * Crea un grafico semplice inline
     */
    function createSimpleChart(chartType, title, range, hasLabels) {
        const ss = window.spreadsheet;
        if (!ss) return;

        // Leggi dati dal range
        const cells = [];
        const parts = range.split(':');
        if (parts.length !== 2) {
            ss.updateStatus('Range non valido: ' + range);
            return;
        }

        const startCoord = ss.getCellCoordinates(parts[0].trim());
        const endCoord = ss.getCellCoordinates(parts[1].trim());

        const dataRows = [];
        for (let r = startCoord.row; r <= endCoord.row; r++) {
            const rowData = [];
            for (let c = startCoord.col; c <= endCoord.col; c++) {
                const ref = ss.numberToColumn(c) + (r + 1);
                const val = ss.getCellValue(ref);
                rowData.push(val);
            }
            dataRows.push(rowData);
        }

        // Costruisci HTML del grafico usando SVG
        const chartWidth = 400;
        const chartHeight = 250;
        const padding = { top: 30, right: 20, bottom: 40, left: 50 };
        const plotW = chartWidth - padding.left - padding.right;
        const plotH = chartHeight - padding.top - padding.bottom;

        let svgContent = '';
        const colors = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#9B2335'];

        if (chartType === 'column' || chartType === 'bar') {
            const values = dataRows.slice(hasLabels ? 1 : 0).map(r => parseFloat(r[r.length - 1]) || 0);
            const labels = hasLabels ? dataRows.slice(1).map(r => r[0]) : dataRows.map((r, i) => r[0] || 'S' + (i + 1));
            const maxVal = Math.max(...values, 1);
            const barWidth = Math.min(40, (plotW / values.length) - 8);

            values.forEach((v, i) => {
                const barH = (v / maxVal) * plotH;
                const x = padding.left + (i * (plotW / values.length)) + 4;
                const y = padding.top + plotH - barH;
                svgContent += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" fill="${colors[i % colors.length]}" rx="2">
                    <title>${labels[i]}: ${v}</title>
                </rect>`;
                svgContent += `<text x="${x + barWidth/2}" y="${padding.top + plotH + 14}" text-anchor="middle" font-size="9" fill="#555">${labels[i]}</text>`;
                svgContent += `<text x="${x + barWidth/2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#333">${v}</text>`;
            });

            // Linea di base
            svgContent += `<line x1="${padding.left}" y1="${padding.top + plotH}" x2="${padding.left + plotW}" y2="${padding.top + plotH}" stroke="#ccc" stroke-width="1"/>`;
        } else if (chartType === 'line') {
            const values = dataRows.slice(hasLabels ? 1 : 0).map(r => parseFloat(r[r.length - 1]) || 0);
            const labels = hasLabels ? dataRows.slice(1).map(r => r[0]) : dataRows.map((r, i) => r[0] || 'S' + (i + 1));
            const maxVal = Math.max(...values, 1);
            const stepX = plotW / Math.max(values.length - 1, 1);
            const points = values.map((v, i) => ({
                x: padding.left + (i * stepX),
                y: padding.top + plotH - (v / maxVal) * plotH
            }));

            let pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
            svgContent += `<path d="${pathD}" fill="none" stroke="#4472C4" stroke-width="2" stroke-linejoin="round"/>`;

            // Pallini e label
            points.forEach((p, i) => {
                svgContent += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#4472C4" stroke="#fff" stroke-width="1.5">
                    <title>${labels[i]}: ${values[i]}</title>
                </circle>`;
                svgContent += `<text x="${p.x}" y="${padding.top + plotH + 14}" text-anchor="middle" font-size="9" fill="#555">${labels[i]}</text>`;
            });

            svgContent += `<line x1="${padding.left}" y1="${padding.top + plotH}" x2="${padding.left + plotW}" y2="${padding.top + plotH}" stroke="#ccc" stroke-width="1"/>`;
        } else if (chartType === 'pie') {
            const values = dataRows.slice(hasLabels ? 1 : 0).map(r => parseFloat(r[r.length - 1]) || 0);
            const labels = hasLabels ? dataRows.slice(1).map(r => r[0]) : dataRows.map((r, i) => r[0] || 'S' + (i + 1));
            const total = values.reduce((a, b) => a + b, 0) || 1;
            const cx = chartWidth / 2;
            const cy = chartHeight / 2 + 10;
            const radius = Math.min(plotW, plotH) / 2 - 10;

            let startAngle = -Math.PI / 2;
            values.forEach((v, i) => {
                const sliceAngle = (v / total) * 2 * Math.PI;
                const endAngle = startAngle + sliceAngle;
                const x1 = cx + radius * Math.cos(startAngle);
                const y1 = cy + radius * Math.sin(startAngle);
                const x2 = cx + radius * Math.cos(endAngle);
                const y2 = cy + radius * Math.sin(endAngle);
                const largeArc = sliceAngle > Math.PI ? 1 : 0;
                const path = `M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${radius},${radius} 0 ${largeArc},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
                svgContent += `<path d="${path}" fill="${colors[i % colors.length]}" stroke="#fff" stroke-width="1.5">
                    <title>${labels[i]}: ${v} (${((v/total)*100).toFixed(1)}%)</title>
                </path>`;
                // Etichetta
                const midAngle = startAngle + sliceAngle / 2;
                const lx = cx + (radius * 0.65) * Math.cos(midAngle);
                const ly = cy + (radius * 0.65) * Math.sin(midAngle);
                if (v > 0) {
                    svgContent += `<text x="${lx}" y="${ly + 3}" text-anchor="middle" font-size="8" fill="#fff" font-weight="bold">${(v/total*100).toFixed(0)}%</text>`;
                }
                startAngle = endAngle;
            });

            // Legenda
            let legendX = 20;
            const legendY = chartHeight - 5;
            labels.forEach((label, i) => {
                svgContent += `<rect x="${legendX}" y="${legendY}" width="8" height="8" fill="${colors[i % colors.length]}" rx="1"/>`;
                svgContent += `<text x="${legendX + 12}" y="${legendY + 7}" font-size="8" fill="#555">${label}</text>`;
                legendX += 12 + label.length * 5 + 10;
            });
        } else if (chartType === 'area') {
            const values = dataRows.slice(hasLabels ? 1 : 0).map(r => parseFloat(r[r.length - 1]) || 0);
            const labels = hasLabels ? dataRows.slice(1).map(r => r[0]) : dataRows.map((r, i) => r[0] || 'S' + (i + 1));
            const maxVal = Math.max(...values, 1);
            const stepX = plotW / Math.max(values.length - 1, 1);
            const points = values.map((v, i) => ({
                x: padding.left + (i * stepX),
                y: padding.top + plotH - (v / maxVal) * plotH
            }));

            let areaD = 'M' + points[0].x.toFixed(1) + ',' + (padding.top + plotH) + ' ';
            points.forEach(p => { areaD += 'L' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ' '; });
            areaD += 'L' + points[points.length - 1].x.toFixed(1) + ',' + (padding.top + plotH) + ' Z';
            svgContent += `<path d="${areaD}" fill="#4472C4" fill-opacity="0.3" stroke="#4472C4" stroke-width="2"/>`;

            points.forEach((p, i) => {
                svgContent += `<text x="${p.x}" y="${padding.top + plotH + 14}" text-anchor="middle" font-size="9" fill="#555">${labels[i]}</text>`;
            });
        }

        const svg = `<svg width="${chartWidth}" height="${chartHeight}" xmlns="http://www.w3.org/2000/svg" style="font-family:'Segoe UI',sans-serif;">
            <text x="${chartWidth/2}" y="16" text-anchor="middle" font-size="12" font-weight="bold" fill="#333">${title}</text>
            ${svgContent}
        </svg>`;

        const chartOpts = {
            name: 'Grafico: ' + title,
            html: svg,
            width: chartWidth + 20,
            height: chartHeight + 20,
            fillColor: '#ffffff',
            borderColor: '#ccc',
            borderWidth: 1,
            padding: 0
        };

        insertDrawingObject('', chartOpts);
        ss.updateStatus('Grafico creato: ' + title);
    }

    // ========================================================================
    // GESTIONE FORME GEOMETRICHE (DRAWING TAB)
    // ========================================================================

    /**
     * Mostra un selettore di forme
     */
    function showShapePicker(onSelect) {
        const shapes = [
            { id: 'rectangle', name: 'Rettangolo', icon: '▬' },
            { id: 'circle', name: 'Cerchio', icon: '●' },
            { id: 'triangle', name: 'Triangolo', icon: '▲' },
            { id: 'diamond', name: 'Rombo', icon: '◆' },
            { id: 'arrow', name: 'Freccia', icon: '➤' },
            { id: 'rounded-rect', name: 'Rettangolo arrotondato', icon: '▭' }
        ];

        const overlay = document.createElement('div');
        overlay.id = 'shape-picker-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.3);min-width:280px;';

        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <strong style="font-size:15px;">Inserisci forma</strong>
                <button style="border:none;background:none;font-size:18px;cursor:pointer;" onclick="this.closest('#shape-picker-modal').remove()">✕</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                ${shapes.map(s => `
                    <div class="shape-option" data-shape="${s.id}" style="display:flex;flex-direction:column;align-items:center;padding:12px 8px;border:1px solid #ddd;border-radius:6px;cursor:pointer;transition:all 0.15s;">
                        <span style="font-size:28px;margin-bottom:4px;">${s.icon}</span>
                        <span style="font-size:11px;color:#555;">${s.name}</span>
                    </div>
                `).join('')}
            </div>`;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        dialog.querySelectorAll('.shape-option').forEach(opt => {
            opt.addEventListener('mouseenter', () => opt.style.borderColor = '#0078d4');
            opt.addEventListener('mouseleave', () => opt.style.borderColor = '#ddd');
            opt.addEventListener('click', () => {
                const shapeId = opt.dataset.shape;
                onSelect(shapeId);
                overlay.remove();
            });
        });
    }

    // ========================================================================
    // SMARTART PICKER
    // ========================================================================

    function showSmartArtPicker(onSelect) {
        const layouts = [
            { id: 'list', name: 'Elenco semplice', icon: '☰', desc: 'Elementi impilati verticalmente' },
            { id: 'process', name: 'Processo', icon: '➡', desc: 'Fasi sequenziali con frecce' },
            { id: 'cycle', name: 'Ciclo', icon: '🔄', desc: 'Processo ciclico continuo' },
            { id: 'hierarchy', name: 'Gerarchia', icon: '🏛', desc: 'Struttura organizzativa ad albero' },
            { id: 'pyramid', name: 'Piramide', icon: '△', desc: 'Relazioni proporzionali' },
            { id: 'matrix', name: 'Matrice', icon: '⊞', desc: 'Classificazione 2x2' }
        ];

        const overlay = document.createElement('div');
        overlay.id = 'smartart-picker-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.3);min-width:500px;max-width:560px;';

        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <strong style="font-size:16px;">Scegli un elemento grafico SmartArt</strong>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;line-height:1;" onclick="this.closest('#smartart-picker-modal').remove()">✕</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
                ${layouts.map(l => `
                    <div class="smartart-option" data-layout="${l.id}" style="display:flex;flex-direction:column;align-items:center;padding:16px 8px;border:1px solid #e0e0e0;border-radius:8px;cursor:pointer;transition:all 0.15s;background:#fafafa;">
                        <span style="font-size:32px;margin-bottom:6px;">${l.icon}</span>
                        <span style="font-size:12px;font-weight:600;color:#333;text-align:center;">${l.name}</span>
                        <span style="font-size:10px;color:#888;text-align:center;margin-top:2px;">${l.desc}</span>
                    </div>
                `).join('')}
            </div>`;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        dialog.querySelectorAll('.smartart-option').forEach(opt => {
            opt.addEventListener('mouseenter', () => { opt.style.borderColor = '#0078d4'; opt.style.background = '#f0f7ff'; });
            opt.addEventListener('mouseleave', () => { opt.style.borderColor = '#e0e0e0'; opt.style.background = '#fafafa'; });
            opt.addEventListener('click', () => {
                const layoutId = opt.dataset.layout;
                if (typeof onSelect === 'function') onSelect(layoutId);
                overlay.remove();
            });
        });
    }

    // ========================================================================
    // ICONE SVG
    // ========================================================================

    /** Libreria di icone SVG pronte all'uso */
    const ICONS_DATA = [
        // Business
        { id: 'bar-chart', category: 'Business', color: '#4472C4', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="16" width="4" height="5" rx="0.5" fill="#4472C4"/><rect x="10" y="10" width="4" height="11" rx="0.5" fill="#5B9BD5"/><rect x="17" y="4" width="4" height="17" rx="0.5" fill="#A9D18E"/></svg>' },
        { id: 'pie-chart', category: 'Business', color: '#4472C4', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" fill="#5B9BD5"/><path d="M12 3a9 9 0 0 1 9 9" fill="#4472C4"/><circle cx="12" cy="12" r="3" fill="#FFC000"/></svg>' },
        { id: 'briefcase', category: 'Business', color: '#5B9BD5', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="7" width="20" height="13" rx="2" fill="#4472C4"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>' },
        { id: 'dollar', category: 'Business', color: '#70AD47', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" fill="#70AD47"/><path d="M12 6v12M8 9.5h5.5a2 2 0 0 1 0 4H8m4 0h4a2 2 0 0 1 0 4h-6" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>' },
        { id: 'document', category: 'Business', color: '#5B9BD5', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><path d="M5 3h8l6 6v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#5B9BD5"/><path d="M13 3v6h6" fill="none" stroke="#fff" stroke-width="1"/><path d="M7 12h10M7 16h10M7 20h6" stroke="#fff" stroke-width="1.3" stroke-linecap="round" fill="none"/></svg>' },
        { id: 'folder', category: 'Business', color: '#FFC000', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z" fill="#FFC000"/><path d="M3 8h18" stroke="#E6A800" stroke-width="1.5" fill="none"/></svg>' },
        // Comunicazione
        { id: 'mail', category: 'Comunicazione', color: '#70AD47', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="5" width="20" height="14" rx="2" fill="#70AD47"/><path d="M2 7l10 6 10-6" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
        { id: 'phone', category: 'Comunicazione', color: '#4472C4', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="2" width="12" height="20" rx="2" fill="#4472C4"/><circle cx="12" cy="18" r="1.5" fill="#fff"/><path d="M8 5h8" stroke="#fff" stroke-width="1" stroke-linecap="round"/></svg>' },
        { id: 'chat', category: 'Comunicazione', color: '#70AD47', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><path d="M21 12a9 9 0 0 1-13.5 7.5L3 21l1.5-4.5A9 9 0 1 1 21 12z" fill="#70AD47"/><path d="M8 10h8M8 14h5" stroke="#fff" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>' },
        { id: 'globe', category: 'Comunicazione', color: '#5B9BD5', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" fill="#5B9BD5"/><ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="#fff" stroke-width="1.3"/><path d="M3 12h18" stroke="#fff" stroke-width="1.3" fill="none"/></svg>' },
        { id: 'users', category: 'Comunicazione', color: '#4472C4', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="8" r="4" fill="#4472C4"/><path d="M3 21v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3" fill="#4472C4" opacity="0.8"/><circle cx="16" cy="8" r="3" fill="#5B9BD5"/><path d="M15 21v-2a4 4 0 0 1 2-3.7" fill="none" stroke="#5B9BD5" stroke-width="1.8" stroke-linecap="round"/></svg>' },
        { id: 'bell', category: 'Comunicazione', color: '#FFC000', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" fill="#FFC000"/><path d="M13.7 20a2 2 0 0 1-3.4 0" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>' },
        // Tecnologia
        { id: 'monitor', category: 'Tecnologia', color: '#5B9BD5', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="3" width="20" height="14" rx="1.5" fill="#5B9BD5"/><path d="M8 21h8M12 17v4" stroke="#fff" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>' },
        { id: 'printer', category: 'Tecnologia', color: '#4472C4', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="2" width="14" height="5" rx="0.5" fill="#5B9BD5"/><rect x="4" y="9" width="16" height="8" rx="1" fill="#4472C4"/><path d="M7 17v4h10v-4" fill="none" stroke="#fff" stroke-width="1.3"/><rect x="7" y="12" width="10" height="2" rx="0.5" fill="#fff" opacity="0.5"/></svg>' },
        { id: 'cloud', category: 'Tecnologia', color: '#5B9BD5', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><path d="M18 10.2A6 6 0 0 0 6.2 12 4 4 0 0 0 7 20h10.5a4.5 4.5 0 1 0 .5-9.8z" fill="#5B9BD5"/></svg>' },
        { id: 'camera', category: 'Tecnologia', color: '#70AD47', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="6" width="20" height="15" rx="2" fill="#70AD47"/><circle cx="12" cy="13" r="4" fill="#fff"/><circle cx="12" cy="13" r="2.5" fill="#70AD47"/><path d="M17 6l-1-3H8L7 6" fill="none" stroke="#70AD47" stroke-width="1.5" stroke-linecap="round"/></svg>' },
        { id: 'database', category: 'Tecnologia', color: '#4472C4', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="5" rx="8" ry="3" fill="#4472C4"/><path d="M4 5v5c0 1.7 3.6 3 8 3s8-1.3 8-3V5" fill="none" stroke="#5B9BD5" stroke-width="1.3"/><path d="M4 10v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5" fill="none" stroke="#A9D18E" stroke-width="1.3"/></svg>' },
        { id: 'gear', category: 'Tecnologia', color: '#ED7D31', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="3" fill="#ED7D31"/><path d="M12 1l1.5 3.2a7 7 0 0 1 2.5 1L19 3.5l1.5 3-2.3 2a7 7 0 0 1 0 3l2.3 2-1.5 3-3-1.7a7 7 0 0 1-2.5 1L12 23l-1.5-3.2a7 7 0 0 1-2.5-1L5 20.5l-1.5-3 2.3-2a7 7 0 0 1 0-3L3.5 6.5 5 3.5l3 1.7a7 7 0 0 1 2.5-1z" fill="none" stroke="#ED7D31" stroke-width="1.8" stroke-linecap="round"/></svg>' },
        // Varie
        { id: 'star', category: 'Varie', color: '#FFC000', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l2.4 7.2H22l-6.4 4.6 2.4 7.2L12 16.6 6 21l2.4-7.2L2 9.2h7.6z" fill="#FFC000"/></svg>' },
        { id: 'check', category: 'Varie', color: '#70AD47', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" fill="#70AD47"/><path d="M8 12l3 3 5-6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
        { id: 'search', category: 'Varie', color: '#5B9BD5', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="7" fill="none" stroke="#5B9BD5" stroke-width="2"/><path d="M16 16l4 4" stroke="#5B9BD5" stroke-width="2" stroke-linecap="round" fill="none"/></svg>' },
        { id: 'lock', category: 'Varie', color: '#4472C4', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="11" width="14" height="10" rx="1.5" fill="#4472C4"/><path d="M8 11V7c0-2.2 1.8-4 4-4s4 1.8 4 4v4" fill="none" stroke="#4472C4" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16" r="1.5" fill="#fff"/></svg>' },
        { id: 'calendar', category: 'Varie', color: '#ED7D31', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="17" rx="2" fill="#ED7D31"/><path d="M3 9h18" stroke="#fff" stroke-width="1.5"/><path d="M8 2v4M16 2v4" stroke="#ED7D31" stroke-width="1.5" stroke-linecap="round"/><text x="12" y="19" text-anchor="middle" fill="#fff" font-size="9" font-weight="bold" font-family="sans-serif">17</text></svg>' },
        { id: 'clock', category: 'Varie', color: '#5B9BD5', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" fill="#5B9BD5"/><path d="M12 7v5l4 2" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
        { id: 'lightbulb', category: 'Varie', color: '#FFC000', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><path d="M9 18c0 2 1 4 3 4s3-2 3-4" fill="#E6A800"/><path d="M9 15a6 6 0 1 1 6 0c0 2-1 3-1 3h-4s-1-1-1-3z" fill="#FFC000"/><path d="M10 21h4" stroke="#fff" stroke-width="1" stroke-linecap="round"/></svg>' },
        { id: 'bookmark', category: 'Varie', color: '#4472C4', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><path d="M5 3h14v18l-7-5-7 5V3z" fill="#4472C4"/><path d="M5 3h14v18l-7-5-7 5V3z" fill="none" stroke="#3A6AB5" stroke-width="0.5"/></svg>' },
        { id: 'home', category: 'Varie', color: '#70AD47', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><path d="M3 12l9-9 9 9" fill="none" stroke="#70AD47" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10v10a1 1 0 0 0 1 1h3v-5h6v5h3a1 1 0 0 0 1-1V10" fill="#70AD47" opacity="0.3"/><rect x="8" y="16" width="8" height="5" fill="#70AD47" opacity="0.5"/></svg>' },
        { id: 'heart', category: 'Varie', color: '#ED7D31', svg: '<svg viewBox="0 0 24 24" width="100%" height="100%" style="display:block;" xmlns="http://www.w3.org/2000/svg"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z" fill="#ED7D31"/></svg>' }
    ];

    /** Mostra il selettore di icone */
    function showIconPicker(onSelect) {
        const overlay = document.createElement('div');
        overlay.id = 'icon-picker-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const categories = [...new Set(ICONS_DATA.map(ic => ic.category))];
        let activeCat = categories[0];

        const renderIcons = (cat) => {
            return ICONS_DATA.filter(ic => ic.category === cat).map(ic => `
                <div class="icon-option" data-id="${ic.id}" style="display:flex;flex-direction:column;align-items:center;padding:8px;border:1px solid #e8e8e8;border-radius:6px;cursor:pointer;background:#fff;transition:all 0.15s;">
                    <div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                        ${ic.svg}
                    </div>
                </div>
            `).join('');
        };

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:20px;min-width:420px;max-width:520px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <strong style="font-size:16px;">Inserisci icona</strong>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#icon-picker-modal').remove()">✕</button>
            </div>
            <div id="icon-categories" style="display:flex;gap:4px;margin-bottom:12px;border-bottom:1px solid #e0e0e0;padding-bottom:8px;">
                ${categories.map(c => `<button class="cat-btn" data-cat="${c}" style="padding:4px 12px;border:1px solid #ddd;background:${c === activeCat ? '#0078d4' : '#f5f5f5'};color:${c === activeCat ? '#fff' : '#333'};border-radius:12px;cursor:pointer;font-size:11px;font-weight:600;transition:all 0.15s;">${c}</button>`).join('')}
            </div>
            <div id="icon-grid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;max-height:300px;overflow-y:auto;padding:4px;">
                ${renderIcons(activeCat)}
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        // Categorie
        dialog.querySelectorAll('.cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.cat;
                dialog.querySelectorAll('.cat-btn').forEach(b => {
                    b.style.background = b.dataset.cat === cat ? '#0078d4' : '#f5f5f5';
                    b.style.color = b.dataset.cat === cat ? '#fff' : '#333';
                });
                dialog.querySelector('#icon-grid').innerHTML = renderIcons(cat);
            });
        });

        // Selezione icona — uso delega eventi su #icon-grid così funziona anche dopo cambio categoria
        dialog.querySelector('#icon-grid').addEventListener('click', (e) => {
            const opt = e.target.closest('.icon-option');
            if (!opt) return;
            const id = opt.dataset.id;
            const icon = ICONS_DATA.find(ic => ic.id === id);
            if (icon && typeof onSelect === 'function') onSelect(icon);
            overlay.remove();
        });
        // Aggiungi anche hover via delega
        dialog.querySelector('#icon-grid').addEventListener('mouseover', (e) => {
            const opt = e.target.closest('.icon-option');
            if (!opt) return;
            opt.style.borderColor = '#0078d4';
            opt.style.background = '#f0f7ff';
        });
        dialog.querySelector('#icon-grid').addEventListener('mouseout', (e) => {
            const opt = e.target.closest('.icon-option');
            if (!opt) return;
            opt.style.borderColor = '#e8e8e8';
            opt.style.background = '#fff';
        });
    }

    /** Inserisce un'icona nel foglio */
    function insertIcon(iconData) {
        const ss = window.spreadsheet;
        if (!ss) return;

        insertDrawingObject('', {
            name: 'Icona: ' + iconData.id,
            html: '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;">' + iconData.svg + '</div>',
            width: 80,
            height: 80,
            fillColor: 'transparent',
            borderColor: 'transparent',
            borderWidth: 0,
            padding: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        });
        ss.updateStatus('Icona inserita');
    }

    // ========================================================================
    // MODELLI 3D
    // ========================================================================

    /** Libreria di modelli 3D in stile isometrico */
    const MODEL3D_DATA = [
        // Geometrici
        { id: 'cube', category: 'Geometrici', name: 'Cubo', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50 24 L74 38 L50 52 L26 38 Z" fill="#5B9BD5"/><path d="M26 38 L50 52 L50 80 L26 66 Z" fill="#4472C4"/><path d="M50 52 L74 38 L74 66 L50 80 Z" fill="#3A6AB5"/></svg>' },
        { id: 'sphere', category: 'Geometrici', name: 'Sfera', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="sph" cx="35%" cy="32%"><stop offset="0%" stop-color="#7FBAFF"/><stop offset="100%" stop-color="#4472C4"/></radialGradient></defs><circle cx="50" cy="52" r="28" fill="url(#sph)"/><ellipse cx="38" cy="40" rx="10" ry="7" fill="rgba(255,255,255,0.35)"/><ellipse cx="60" cy="65" rx="6" ry="4" fill="rgba(0,0,0,0.08)"/></svg>' },
        { id: 'cylinder', category: 'Geometrici', name: 'Cilindro', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="cyl" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#3A6AB5"/><stop offset="30%" stop-color="#5B9BD5"/><stop offset="70%" stop-color="#5B9BD5"/><stop offset="100%" stop-color="#3A6AB5"/></linearGradient></defs><rect x="22" y="38" width="56" height="32" fill="url(#cyl)"/><ellipse cx="50" cy="38" rx="28" ry="10" fill="#7FBAFF"/><ellipse cx="50" cy="70" rx="28" ry="10" fill="#3A6AB5" opacity="0.3"/></svg>' },
        { id: 'cone', category: 'Geometrici', name: 'Cono', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="cone" cx="40%" cy="20%"><stop offset="0%" stop-color="#7FBAFF"/><stop offset="100%" stop-color="#4472C4"/></radialGradient></defs><path d="M50 18 L22 72 L78 72 Z" fill="url(#cone)"/><ellipse cx="50" cy="72" rx="28" ry="8" fill="#3A6AB5" opacity="0.35"/></svg>' },
        { id: 'pyramid', category: 'Geometrici', name: 'Piramide', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50 20 L26 68 L50 76 Z" fill="#4472C4"/><path d="M50 20 L74 68 L50 76 Z" fill="#5B9BD5"/><path d="M26 68 L50 76 L74 68" fill="#3A6AB5" opacity="0.6"/></svg>' },
        { id: 'hex-prism', category: 'Geometrici', name: 'Prisma esagonale', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><polygon points="50,22 74,34 74,56 50,68 26,56 26,34" fill="#5B9BD5"/><polygon points="50,68 74,56 74,76 50,88 26,76 26,56" fill="#4472C4"/><polygon points="26,56 50,68 50,88 26,76" fill="#3A6AB5"/></svg>' },
        { id: 'torus', category: 'Geometrici', name: 'Toro', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="tor" cx="35%" cy="30%"><stop offset="0%" stop-color="#A9D18E"/><stop offset="100%" stop-color="#70AD47"/></radialGradient></defs><ellipse cx="50" cy="50" rx="24" ry="12" fill="none" stroke="#70AD47" stroke-width="10" opacity="0.3"/><ellipse cx="50" cy="48" rx="24" ry="12" fill="none" stroke="url(#tor)" stroke-width="10"/></svg>' },
        { id: 'diamond-3d', category: 'Geometrici', name: 'Ottagono 3D', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><polygon points="50,24 68,24 78,38 50,38 32,38 22,38" fill="#5B9BD5"/><polygon points="50,38 78,38 78,70 68,84 50,84 32,84 22,70 22,38" fill="#4472C4"/></svg>' },
        // Oggetti
        { id: 'dice', category: 'Oggetti', name: 'Dado', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M30 28 L50 18 L70 28 L50 38 Z" fill="#fff" stroke="#ddd" stroke-width="0.5"/><circle cx="40" cy="27" r="2.5" fill="#333"/><circle cx="50" cy="30" r="2.5" fill="#333"/><circle cx="60" cy="33" r="2.5" fill="#333"/><path d="M30 28 L50 38 L50 62 L30 52 Z" fill="#f5f5f5" stroke="#ddd" stroke-width="0.5"/><circle cx="40" cy="48" r="2.5" fill="#333"/><circle cx="38" cy="38" r="2.5" fill="#333"/><path d="M50 38 L70 28 L70 52 L50 62 Z" fill="#eee" stroke="#ddd" stroke-width="0.5"/><circle cx="60" cy="45" r="2.5" fill="#333"/></svg>' },
        { id: 'gift', category: 'Oggetti', name: 'Regalo', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M30 30 L50 20 L70 30 L50 40 Z" fill="#FFC000"/><path d="M30 30 L50 40 L50 60 L30 50 Z" fill="#E6A800"/><path d="M50 40 L70 30 L70 50 L50 60 Z" fill="#D49B00"/><path d="M50 20 L50 40" stroke="#ED7D31" stroke-width="3" stroke-linecap="round"/><path d="M38 30 L62 30" stroke="#ED7D31" stroke-width="2"/><path d="M50 40 L50 58" stroke="#ED7D31" stroke-width="3"/><path d="M38 42 L62 42" stroke="#ED7D31" stroke-width="2"/><circle cx="50" cy="20" r="4" fill="#ED7D31"/></svg>' },
        { id: 'house', category: 'Oggetti', name: 'Casa', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50 18 L30 42 L50 50 Z" fill="#ED7D31"/><path d="M50 18 L70 42 L50 50 Z" fill="#E06B1E"/><path d="M30 42 L50 50 L50 80 L30 70 Z" fill="#5B9BD5"/><path d="M50 50 L70 42 L70 70 L50 80 Z" fill="#4472C4"/><path d="M44 57 L50 60 L50 80 L44 77 Z" fill="#fff" opacity="0.8"/><circle cx="48" cy="71" r="1.5" fill="#333"/></svg>' },
        { id: 'rocket', category: 'Oggetti', name: 'Razzo', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5B9BD5"/><stop offset="100%" stop-color="#4472C4"/></linearGradient></defs><path d="M42 50 L42 78 L50 84 L58 78 L58 50 Z" fill="url(#rock)"/><path d="M42 50 L50 18 L58 50 Z" fill="#5B9BD5"/><circle cx="50" cy="42" r="6" fill="#fff" opacity="0.8"/><circle cx="50" cy="42" r="3.5" fill="#4472C4"/><path d="M42 72 L32 82 L42 78 Z" fill="#ED7D31"/><path d="M58 72 L68 82 L58 78 Z" fill="#E06B1E"/><path d="M45 84 L50 94 L55 84 Z" fill="#FFC000" opacity="0.8"/></svg>' },
        { id: 'trophy', category: 'Oggetti', name: 'Trofeo', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M35 32 L35 52 C35 56, 42 60, 50 60 C58 60, 65 56, 65 52 L65 32 Z" fill="#FFC000"/><path d="M32 30 L68 30 L65 40 L35 40 Z" fill="#E6A800"/><path d="M35 36 C28 36, 28 48, 35 48" fill="none" stroke="#FFC000" stroke-width="3" stroke-linecap="round"/><path d="M65 36 C72 36, 72 48, 65 48" fill="none" stroke="#FFC000" stroke-width="3" stroke-linecap="round"/><path d="M46 60 L46 70 L54 70 L54 60 Z" fill="#E6A800"/><path d="M38 70 L62 70 L55 78 L45 78 Z" fill="#FFC000"/><path d="M50 34 L52 38 L56 38 L53 42 L54 46 L50 43 L46 46 L47 42 L44 38 L48 38 Z" fill="#fff"/></svg>' },
        // Paesaggio
        { id: 'tree', category: 'Paesaggio', name: 'Albero', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M46 55 L46 82 L54 82 L54 55 Z" fill="#A0522D"/><path d="M30 55 L50 30 L70 55 Z" fill="#70AD47"/><path d="M36 42 L50 20 L64 42 Z" fill="#5B9B3A"/><path d="M50 20 L58 32 L50 35 Z" fill="#A9D18E" opacity="0.5"/></svg>' },
        { id: 'mountain', category: 'Paesaggio', name: 'Montagna', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M10 80 L50 20 L50 80 Z" fill="#70AD47"/><path d="M50 20 L90 80 L50 80 Z" fill="#4A8A2E"/><path d="M50 20 L56 35 L50 38 L44 35 Z" fill="#fff" opacity="0.9"/></svg>' },
        { id: 'crystal', category: 'Paesaggio', name: 'Cristallo', svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50 16 L28 42 L40 72 L50 60 Z" fill="#5B9BD5" opacity="0.7"/><path d="M50 16 L72 42 L60 72 L50 60 Z" fill="#4472C4" opacity="0.8"/><path d="M40 72 L50 86 L56 80 L50 60 Z" fill="#3A6AB5" opacity="0.6"/><path d="M50 86 L60 72 L50 60 Z" fill="#2B5598" opacity="0.5"/><path d="M50 16 L32 40 L40 60 L50 45 Z" fill="#fff" opacity="0.15"/></svg>' }
    ];

    /** Mostra il selettore di modelli 3D */
    function showModel3DPicker(onSelect) {
        const overlay = document.createElement('div');
        overlay.id = 'model3d-picker-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const categories = [...new Set(MODEL3D_DATA.map(m => m.category))];
        let activeCat = categories[0];

        const renderModels = (cat) => {
            return MODEL3D_DATA.filter(m => m.category === cat).map(m => `
                <div class="model3d-option" data-id="${m.id}" style="display:flex;flex-direction:column;align-items:center;padding:6px;border:1px solid #e8e8e8;border-radius:6px;cursor:pointer;background:#fff;transition:all 0.15s;">
                    <div style="width:72px;height:72px;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                        ${m.svg}
                    </div>
                    <span style="font-size:9px;color:#666;margin-top:4px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:72px;">${m.name}</span>
                </div>
            `).join('');
        };

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:20px;min-width:420px;max-width:500px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <strong style="font-size:16px;">Inserisci modello 3D</strong>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#model3d-picker-modal').remove()">✕</button>
            </div>
            <div id="model3d-categories" style="display:flex;gap:4px;margin-bottom:12px;border-bottom:1px solid #e0e0e0;padding-bottom:8px;">
                ${categories.map(c => `<button class="m3d-cat-btn" data-cat="${c}" style="padding:4px 12px;border:1px solid #ddd;background:${c === activeCat ? '#0078d4' : '#f5f5f5'};color:${c === activeCat ? '#fff' : '#333'};border-radius:12px;cursor:pointer;font-size:11px;font-weight:600;transition:all 0.15s;">${c}</button>`).join('')}
            </div>
            <div id="model3d-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-height:360px;overflow-y:auto;padding:4px;">
                ${renderModels(activeCat)}
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        // Categorie
        dialog.querySelectorAll('.m3d-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.cat;
                dialog.querySelectorAll('.m3d-cat-btn').forEach(b => {
                    b.style.background = b.dataset.cat === cat ? '#0078d4' : '#f5f5f5';
                    b.style.color = b.dataset.cat === cat ? '#fff' : '#333';
                });
                dialog.querySelector('#model3d-grid').innerHTML = renderModels(cat);
            });
        });

        // Selezione modello — delegation sulla griglia
        const grid = dialog.querySelector('#model3d-grid');
        grid.addEventListener('mouseover', (e) => {
            const opt = e.target.closest('.model3d-option');
            if (opt) { opt.style.borderColor = '#0078d4'; opt.style.background = '#f0f7ff'; }
        });
        grid.addEventListener('mouseout', (e) => {
            const opt = e.target.closest('.model3d-option');
            if (opt) { opt.style.borderColor = '#e8e8e8'; opt.style.background = '#fff'; }
        });
        grid.addEventListener('click', (e) => {
            const opt = e.target.closest('.model3d-option');
            if (!opt) return;
            const id = opt.dataset.id;
            const model = MODEL3D_DATA.find(m => m.id === id);
            if (model && typeof onSelect === 'function') onSelect(model);
            overlay.remove();
        });
    }

    /** Inserisce un modello 3D nel foglio */
    function insertModel3D(modelData) {
        const ss = window.spreadsheet;
        if (!ss) return;

        insertDrawingObject('', {
            name: modelData.name,
            html: '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:8px;box-sizing:border-box;">' + modelData.svg + '</div>',
            width: 160,
            height: 160,
            fillColor: 'transparent',
            borderColor: 'transparent',
            borderWidth: 0,
            boxShadow: '0 2px 12px rgba(0,0,0,0.12)'
        });
        ss.updateStatus('Modello 3D inserito: ' + modelData.name);
    }

    /** Crea un grafico direttamente dal range selezionato, senza dialog */
    function createDirectChart(chartType, label) {
        const ss = window.spreadsheet;
        if (!ss) return;
        const sel = ss.selectedRange;
        if (!sel || sel.start === sel.end) {
            ss.updateStatus('Seleziona un intervallo di celle con dati numerici');
            return;
        }
        const range = sel.start + ':' + sel.end;
        const typeLabels = {
            'column': 'Grafico a colonne', 'line': 'Grafico a linee',
            'pie': 'Grafico a torta', 'bar': 'Grafico a barre', 'area': 'Grafico ad area'
        };
        createSimpleChart(chartType, label || typeLabels[chartType] || 'Grafico', range, false);
    }

    // ========================================================================
    // GRAFICO CONSIGLIATO
    // ========================================================================

    /**
     * Analizza l'intervallo selezionato e propone i tipi di grafico più adatti,
     * come la funzione "Grafici consigliati" di Excel.
     */
    function showRecommendedCharts() {
        const ss = window.spreadsheet;
        if (!ss) return;
        const sel = ss.selectedRange;
        if (!sel || sel.start === sel.end) {
            ss.updateStatus('Seleziona un intervallo di dati per ricevere grafici consigliati');
            return;
        }

        // Leggi i dati del range selezionato
        const startCoord = ss.getCellCoordinates(sel.start);
        const endCoord = ss.getCellCoordinates(sel.end);
        const r1 = Math.min(startCoord.row, endCoord.row);
        const r2 = Math.max(startCoord.row, endCoord.row);
        const c1 = Math.min(startCoord.col, endCoord.col);
        const c2 = Math.max(startCoord.col, endCoord.col);

        const grid = [];
        for (let r = r1; r <= r2; r++) {
            const row = [];
            for (let c = c1; c <= c2; c++) {
                row.push(ss.getCellValue(ss.numberToColumn(c) + (r + 1)));
            }
            grid.push(row);
        }

        const isNum = (v) => v !== '' && v != null && !isNaN(parseFloat(v)) && isFinite(v);
        const looksLikeDate = (v) => typeof v === 'string' && /^\s*\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?\s*$/.test(v);
        const monthNames = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic',
                            'gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
        const looksLikeMonth = (v) => typeof v === 'string' && monthNames.includes(v.trim().toLowerCase().slice(0, 3)) === false ? monthNames.includes((v||'').trim().toLowerCase()) : true;

        // Rileva se la prima riga è una riga di intestazioni (testo sopra dati numerici)
        let hasHeaderRow = false;
        if (grid.length > 1) {
            const firstRowText = grid[0].filter((v, i) => i > 0 && !isNum(v) && v !== '').length;
            const secondRowNum = grid[1].filter((v, i) => i > 0 && isNum(v)).length;
            hasHeaderRow = firstRowText > 0 && secondRowNum > 0;
        }

        const dataRows = hasHeaderRow ? grid.slice(1) : grid;
        const numDataPoints = dataRows.length;

        // Colonna delle categorie = prima colonna (se non numerica) altrimenti indici
        const firstColVals = dataRows.map(r => r[0]);
        const firstColNumeric = firstColVals.every(v => isNum(v));
        const firstColDates = firstColVals.some(v => looksLikeDate(v)) ||
                              firstColVals.filter(v => monthNames.includes((v||'').toString().trim().toLowerCase())).length >= Math.max(2, numDataPoints - 1);
        const firstColSequential = firstColNumeric && firstColVals.length > 2 &&
            firstColVals.every((v, i) => i === 0 || parseFloat(v) >= parseFloat(firstColVals[i - 1]));

        // Conta le serie numeriche (colonne con valori numerici, escludendo la colonna categorie)
        const numCols = c2 - c1 + 1;
        let numericSeries = 0;
        for (let c = (firstColNumeric ? 0 : 1); c < numCols; c++) {
            const colVals = dataRows.map(r => r[c]);
            if (colVals.filter(isNum).length >= Math.ceil(colVals.length / 2)) numericSeries++;
        }
        if (numericSeries === 0) numericSeries = 1;

        // Costruisci i punteggi per ciascun tipo
        const recs = [];
        const add = (type, name, reason, score) => recs.push({ type, name, reason, score });

        // Colonne raggruppate: il default più sicuro per confrontare valori tra categorie
        add('column', 'Istogramma a colonne',
            numericSeries > 1 ? 'Confronta più serie di valori tra le categorie' : 'Confronta i valori tra le diverse categorie',
            numDataPoints <= 12 ? 70 : 40);

        // Barre: utile con molte categorie o etichette lunghe
        const longLabels = firstColVals.some(v => (v || '').toString().length > 10);
        add('bar', 'Barre orizzontali',
            longLabels ? 'Ideale per etichette di categoria lunghe' : 'Confronta i valori con barre orizzontali',
            (longLabels ? 65 : 35) + (numDataPoints > 8 ? 10 : 0));

        // Linee: andamento nel tempo / dati sequenziali
        add('line', 'Grafico a linee',
            (firstColDates || firstColSequential) ? 'Mostra l\'andamento dei valori nel tempo' : 'Evidenzia tendenze su molti punti dati',
            (firstColDates || firstColSequential ? 80 : 30) + (numDataPoints > 12 ? 25 : 0));

        // Area: come le linee ma enfatizza il volume cumulato
        add('area', 'Grafico ad area',
            'Evidenzia l\'entità dell\'andamento nel tempo',
            (firstColDates || firstColSequential ? 55 : 20));

        // Torta: una sola serie con poche categorie (composizione di un totale)
        add('pie', 'Grafico a torta',
            'Mostra la proporzione di ogni voce sul totale',
            (numericSeries === 1 && numDataPoints >= 2 && numDataPoints <= 6 && !firstColDates) ? 85 : 10);

        recs.sort((a, b) => b.score - a.score);
        const topType = recs[0].type;

        // Costruisci il dialog
        const overlay = document.createElement('div');
        overlay.id = 'recommended-charts-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const iconFor = { column: '📊', bar: '📊', line: '📈', area: '📈', pie: '🥧' };
        const summary = `${numDataPoints} categorie · ${numericSeries} serie di valori` +
            (firstColDates ? ' · dati temporali' : '') + (hasHeaderRow ? ' · con intestazioni' : '');

        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:0;min-width:560px;max-width:620px;box-shadow:0 8px 32px rgba(0,0,0,0.3);overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #e5e5e5;background:#217346;color:#fff;">
                <strong style="font-size:15px;">💡 Grafici consigliati</strong>
                <button onclick="this.closest('#recommended-charts-modal').remove()" style="border:none;background:none;font-size:20px;cursor:pointer;color:#fff;">✕</button>
            </div>
            <div style="padding:8px 18px;background:#f3f9f5;font-size:12px;color:#555;border-bottom:1px solid #e5e5e5;">
                Analisi dati selezionati (${sel.start}:${sel.end}): <strong>${summary}</strong>
            </div>
            <div style="padding:14px 18px;display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow:auto;">
                ${recs.map((rec, i) => `
                    <button class="rec-chart-btn" data-type="${rec.type}" style="display:flex;align-items:center;gap:14px;padding:12px 14px;border:1px solid ${rec.type === topType ? '#217346' : '#ddd'};background:${rec.type === topType ? '#eef7f0' : '#fff'};border-radius:6px;cursor:pointer;text-align:left;transition:background 0.15s;">
                        <span style="font-size:26px;">${iconFor[rec.type]}</span>
                        <span style="flex:1;">
                            <span style="display:block;font-size:14px;font-weight:600;color:#222;">${rec.name}${i === 0 ? ' <span style="background:#217346;color:#fff;font-size:10px;padding:1px 6px;border-radius:8px;vertical-align:middle;">CONSIGLIATO</span>' : ''}</span>
                            <span style="display:block;font-size:12px;color:#666;margin-top:2px;">${rec.reason}</span>
                        </span>
                    </button>
                `).join('')}
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelectorAll('.rec-chart-btn').forEach(btn => {
            btn.addEventListener('mouseenter', () => { if (btn.dataset.type !== topType) btn.style.background = '#f5f5f5'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = btn.dataset.type === topType ? '#eef7f0' : '#fff'; });
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                overlay.remove();
                const labels = { column: 'Grafico a colonne', bar: 'Grafico a barre', line: 'Grafico a linee', area: 'Grafico ad area', pie: 'Grafico a torta' };
                createSimpleChart(type, labels[type] || 'Grafico', sel.start + ':' + sel.end, hasHeaderRow);
            });
        });
    }

    // ========================================================================
    // REPORT DI POWER BI — handoff verso il Clone Power BI
    // ========================================================================

    /**
     * Estrae l'intervallo selezionato e apre il Clone Power BI passando i dati.
     * Se non c'è selezione utilizza l'intera area dati del foglio.
     */
    function openInPowerBI() {
        const ss = window.spreadsheet;
        if (!ss) return;

        // Determina il range: selezione multipla oppure area dati attorno alla cella attiva
        let r1, r2, c1, c2;
        const sel = ss.selectedRange;
        if (sel && sel.start !== sel.end) {
            const a = ss.getCellCoordinates(sel.start), b = ss.getCellCoordinates(sel.end);
            r1 = Math.min(a.row, b.row); r2 = Math.max(a.row, b.row);
            c1 = Math.min(a.col, b.col); c2 = Math.max(a.col, b.col);
        } else {
            // espandi attorno alla cella attiva fino alle celle vuote (region corrente)
            const base = ss.getCellCoordinates(ss.selectedCell || 'A1');
            const nonEmpty = (r, c) => {
                const v = ss.getCellValue(ss.numberToColumn(c) + (r + 1));
                return v !== '' && v != null;
            };
            if (!nonEmpty(base.row, base.col)) {
                ss.updateStatus('Seleziona un intervallo di dati da inviare a Power BI');
                return;
            }
            r1 = r2 = base.row; c1 = c2 = base.col;
            while (r1 > 0 && nonEmpty(r1 - 1, c1)) r1--;
            while (nonEmpty(r2 + 1, c1)) r2++;
            while (c1 > 0 && nonEmpty(r1, c1 - 1)) c1--;
            while (nonEmpty(r1, c2 + 1)) c2++;
        }

        // Costruisci headers + rows
        const headers = [];
        for (let c = c1; c <= c2; c++) {
            const v = ss.getCellValue(ss.numberToColumn(c) + (r1 + 1));
            headers.push(v !== '' && v != null ? String(v) : ss.numberToColumn(c));
        }
        const rows = [];
        for (let r = r1 + 1; r <= r2; r++) {
            const row = [];
            for (let c = c1; c <= c2; c++) row.push(ss.getCellValue(ss.numberToColumn(c) + (r + 1)));
            rows.push(row);
        }

        if (rows.length === 0) {
            ss.updateStatus('Servono almeno una riga di intestazione e una di dati per Power BI');
            return;
        }

        const handoff = {
            name: (ss.fileName || 'Dati Excel').replace(/\.[^.]+$/, ''),
            headers: headers,
            rows: rows,
            source: 'excel'
        };
        try {
            localStorage.setItem('powerbi_handoff', JSON.stringify(handoff));
        } catch (e) {
            ss.updateStatus('Impossibile preparare i dati per Power BI');
            return;
        }
        ss.updateStatus('Apertura di Power BI con ' + rows.length + ' righe di dati...');
        window.open('../powerbi-clone/index.html', '_blank');
    }

    // ========================================================================
    // COLLEGAMENTO AL FOGLIO ATTIVO
    // ========================================================================

    /**
     * Seleziona tutte le celle
     */
    function selectAllCells() {
        const ss = window.spreadsheet;
        if (ss) ss.selectAll();
    }

    // ========================================================================
    // SIMBOLO
    // ========================================================================

    /** Libreria di simboli */
    const SYMBOLS_DATA = [
        { char: '•', name: 'Pallino', category: 'Punteggiatura' },
        { char: '…', name: 'Puntini', category: 'Punteggiatura' },
        { char: '·', name: 'Punto medio', category: 'Punteggiatura' },
        { char: '©', name: 'Copyright', category: 'Simboli legali' },
        { char: '®', name: 'Registered', category: 'Simboli legali' },
        { char: '™', name: 'Trademark', category: 'Simboli legali' },
        { char: '§', name: 'Paragrafo', category: 'Simboli legali' },
        { char: '¶', name: 'Pilcrow', category: 'Simboli legali' },
        { char: '€', name: 'Euro', category: 'Valuta' },
        { char: '£', name: 'Sterlina', category: 'Valuta' },
        { char: '¥', name: 'Yen', category: 'Valuta' },
        { char: '¢', name: 'Cent', category: 'Valuta' },
        { char: '₽', name: 'Rublo', category: 'Valuta' },
        { char: '₹', name: 'Rupia', category: 'Valuta' },
        { char: '←', name: 'Freccia sinistra', category: 'Frecce' },
        { char: '→', name: 'Freccia destra', category: 'Frecce' },
        { char: '↑', name: 'Freccia su', category: 'Frecce' },
        { char: '↓', name: 'Freccia giù', category: 'Frecce' },
        { char: '↔', name: 'Freccia bidirezionale', category: 'Frecce' },
        { char: '↵', name: 'Invio', category: 'Frecce' },
        { char: '⇐', name: 'Doppia sinistra', category: 'Frecce' },
        { char: '⇒', name: 'Doppia destra', category: 'Frecce' },
        { char: '⇑', name: 'Doppia su', category: 'Frecce' },
        { char: '⇓', name: 'Doppia giù', category: 'Frecce' },
        { char: '✓', name: 'Spunta', category: 'Segni' },
        { char: '✗', name: 'Croce', category: 'Segni' },
        { char: '★', name: 'Stella piena', category: 'Stelle' },
        { char: '☆', name: 'Stella vuota', category: 'Stelle' },
        { char: '♥', name: 'Cuore', category: 'Stelle' },
        { char: '♦', name: 'Quadri', category: 'Stelle' },
        { char: '♣', name: 'Fiori', category: 'Stelle' },
        { char: '♠', name: 'Picche', category: 'Stelle' },
        { char: 'α', name: 'Alfa', category: 'Greco' },
        { char: 'β', name: 'Beta', category: 'Greco' },
        { char: 'γ', name: 'Gamma', category: 'Greco' },
        { char: 'δ', name: 'Delta', category: 'Greco' },
        { char: 'ε', name: 'Epsilon', category: 'Greco' },
        { char: 'π', name: 'Pi greco', category: 'Greco' },
        { char: 'σ', name: 'Sigma', category: 'Greco' },
        { char: 'φ', name: 'Phi', category: 'Greco' },
        { char: 'ω', name: 'Omega', category: 'Greco' },
        { char: '∑', name: 'Sigma sommatoria', category: 'Matematici' },
        { char: '∏', name: 'Pi produttoria', category: 'Matematici' },
        { char: '∫', name: 'Integrale', category: 'Matematici' },
        { char: '√', name: 'Radice', category: 'Matematici' },
        { char: '∞', name: 'Infinito', category: 'Matematici' },
        { char: '≈', name: 'Approssimativo', category: 'Matematici' },
        { char: '≠', name: 'Diverso', category: 'Matematici' },
        { char: '≤', name: 'Minore uguale', category: 'Matematici' },
        { char: '≥', name: 'Maggiore uguale', category: 'Matematici' },
        { char: '±', name: 'Più meno', category: 'Matematici' },
        { char: '∂', name: 'Derivata', category: 'Matematici' },
        { char: '°', name: 'Grado', category: 'Matematici' },
        { char: '∈', name: 'Appartiene', category: 'Matematici' },
        { char: '∩', name: 'Intersezione', category: 'Matematici' },
        { char: '∪', name: 'Unione', category: 'Matematici' },
        { char: '∅', name: 'Insieme vuoto', category: 'Matematici' },
        { char: '∠', name: 'Angolo', category: 'Matematici' },
        { char: '¼', name: 'Un quarto', category: 'Frazioni' },
        { char: '½', name: 'Un mezzo', category: 'Frazioni' },
        { char: '¾', name: 'Tre quarti', category: 'Frazioni' },
        { char: '²', name: 'Quadrato', category: 'Frazioni' },
        { char: '³', name: 'Cubo', category: 'Frazioni' },
    ];

    /** Mostra selettore simboli */
    function showSymbolPicker() {
        const overlay = document.createElement('div');
        overlay.id = 'symbol-picker-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const categories = [...new Set(SYMBOLS_DATA.map(s => s.category))];
        let activeCat = categories[0];

        const renderSymbols = (cat) => {
            return SYMBOLS_DATA.filter(s => s.category === cat).map(s => `
                <div class="symbol-option" data-char="${s.char}" style="display:flex;flex-direction:column;align-items:center;padding:8px;border:1px solid #e8e8e8;border-radius:6px;cursor:pointer;background:#fff;transition:all 0.15s;">
                    <div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:24px;color:#333;font-family:serif;">
                        ${s.char}
                    </div>
                    <span style="font-size:9px;color:#666;margin-top:2px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60px;">${s.name}</span>
                </div>
            `).join('');
        };

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:20px;min-width:360px;max-width:480px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <strong style="font-size:16px;">Inserisci simbolo</strong>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#symbol-picker-modal').remove()">✕</button>
            </div>
            <div id="symbol-categories" style="display:flex;gap:4px;margin-bottom:12px;flex-wrap:wrap;border-bottom:1px solid #e0e0e0;padding-bottom:8px;">
                ${categories.map(c => `<button class="sym-cat-btn" data-cat="${c}" style="padding:4px 10px;border:1px solid #ddd;background:${c === activeCat ? '#0078d4' : '#f5f5f5'};color:${c === activeCat ? '#fff' : '#333'};border-radius:12px;cursor:pointer;font-size:10px;font-weight:600;transition:all 0.15s;">${c}</button>`).join('')}
            </div>
            <div id="symbol-grid" style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;max-height:320px;overflow-y:auto;padding:4px;">
                ${renderSymbols(activeCat)}
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        // Categorie
        dialog.querySelectorAll('.sym-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cat = btn.dataset.cat;
                dialog.querySelectorAll('.sym-cat-btn').forEach(b => {
                    b.style.background = b.dataset.cat === cat ? '#0078d4' : '#f5f5f5';
                    b.style.color = b.dataset.cat === cat ? '#fff' : '#333';
                });
                dialog.querySelector('#symbol-grid').innerHTML = renderSymbols(cat);
            });
        });

        // Selezione simbolo — delegation
        const grid = dialog.querySelector('#symbol-grid');
        grid.addEventListener('mouseover', (e) => {
            const opt = e.target.closest('.symbol-option');
            if (opt) { opt.style.borderColor = '#0078d4'; opt.style.background = '#f0f7ff'; }
        });
        grid.addEventListener('mouseout', (e) => {
            const opt = e.target.closest('.symbol-option');
            if (opt) { opt.style.borderColor = '#e8e8e8'; opt.style.background = '#fff'; }
        });
        grid.addEventListener('click', (e) => {
            const opt = e.target.closest('.symbol-option');
            if (!opt) return;
            const char = opt.dataset.char;
            const ss = window.spreadsheet;
            if (ss && ss.selectedCell) {
                // Inserisce nella cella selezionata
                const cellRef = ss.selectedCell;
                const cell = ss.data[cellRef];
                const currentValue = cell && cell.value ? cell.value : '';
                const formulaInput = document.getElementById('formula-input');
                if (formulaInput && document.activeElement === formulaInput) {
                    formulaInput.value += char;
                    ss.setCellValue(cellRef, formulaInput.value);
                } else {
                    ss.setCellValue(cellRef, currentValue + char);
                    ss.editCell(cellRef);
                }
                ss.updateStatus('Simbolo inserito in ' + cellRef);
            } else {
                // Crea una casella di testo con il simbolo
                insertDrawingObject('text', {
                    name: 'Simbolo: ' + char,
                    content: char,
                    width: 60,
                    height: 60,
                    fontSize: 28,
                    textAlign: 'center',
                    fontFamily: 'serif',
                    fillColor: '#ffffff',
                    borderColor: '#ccc',
                    borderWidth: 1,
                    contentEditable: true
                });
            }
            overlay.remove();
        });
    }

    // ========================================================================
    // INTESTAZIONE E PIÈ DI PAGINA
    // ========================================================================

    /** Mostra dialog per impostare intestazione e piè di pagina */
    function showHeaderFooterDialog() {
        const ss = window.spreadsheet;
        if (!ss) return;

        // Inizializza pageSettings se non esiste
        if (!ss.pageSettings) {
            ss.pageSettings = { headerLeft: '', headerCenter: '', headerRight: '', footerLeft: '', footerCenter: '', footerRight: '' };
        }
        const ps = ss.pageSettings;

        const overlay = document.createElement('div');
        overlay.id = 'header-footer-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:24px;min-width:520px;max-width:560px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';

        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <strong style="font-size:16px;">Intestazione e piè di pagina</strong>
                <button id="hf-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>

            <div style="margin-bottom:16px;">
                <div style="font-size:12px;font-weight:600;color:#555;margin-bottom:8px;">INTESTAZIONE</div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px;">
                    <div><label style="font-size:10px;color:#888;">Sinistra</label><input id="hf-hl" value="${escapeHtml(ps.headerLeft)}" style="width:100%;padding:4px 6px;border:1px solid #ccc;border-radius:3px;font-size:11px;box-sizing:border-box;"></div>
                    <div><label style="font-size:10px;color:#888;">Centro</label><input id="hf-hc" value="${escapeHtml(ps.headerCenter)}" style="width:100%;padding:4px 6px;border:1px solid #ccc;border-radius:3px;font-size:11px;box-sizing:border-box;"></div>
                    <div><label style="font-size:10px;color:#888;">Destra</label><input id="hf-hr" value="${escapeHtml(ps.headerRight)}" style="width:100%;padding:4px 6px;border:1px solid #ccc;border-radius:3px;font-size:11px;box-sizing:border-box;"></div>
                </div>
            </div>

            <div style="margin-bottom:16px;">
                <div style="font-size:12px;font-weight:600;color:#555;margin-bottom:8px;">PIÈ DI PAGINA</div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:12px;">
                    <div><label style="font-size:10px;color:#888;">Sinistra</label><input id="hf-fl" value="${escapeHtml(ps.footerLeft)}" style="width:100%;padding:4px 6px;border:1px solid #ccc;border-radius:3px;font-size:11px;box-sizing:border-box;"></div>
                    <div><label style="font-size:10px;color:#888;">Centro</label><input id="hf-fc" value="${escapeHtml(ps.footerCenter)}" style="width:100%;padding:4px 6px;border:1px solid #ccc;border-radius:3px;font-size:11px;box-sizing:border-box;"></div>
                    <div><label style="font-size:10px;color:#888;">Destra</label><input id="hf-fr" value="${escapeHtml(ps.footerRight)}" style="width:100%;padding:4px 6px;border:1px solid #ccc;border-radius:3px;font-size:11px;box-sizing:border-box;"></div>
                </div>
            </div>

            <div style="background:#f5f5f5;border:1px solid #e0e0e0;border-radius:4px;padding:8px 12px;margin-bottom:16px;font-size:10px;color:#888;">
                <strong>Suggerimenti:</strong> usa &amp;p per numero pagina, &amp;P per pagine totali, &amp;d per data, &amp;t per ora, &amp;f per nome file, &amp;tab per nome foglio
            </div>

            <div style="display:flex;justify-content:flex-end;gap:8px;">
                <button id="hf-annulla" style="padding:6px 16px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:12px;">Annulla</button>
                <button id="hf-ok" style="padding:6px 16px;border:1px solid #217346;background:#217346;color:#fff;border-radius:4px;cursor:pointer;font-size:12px;">Applica</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        dialog.querySelector('#hf-close').onclick = close;
        dialog.querySelector('#hf-annulla').onclick = close;
        dialog.querySelector('#hf-ok').onclick = () => {
            ps.headerLeft = dialog.querySelector('#hf-hl').value;
            ps.headerCenter = dialog.querySelector('#hf-hc').value;
            ps.headerRight = dialog.querySelector('#hf-hr').value;
            ps.footerLeft = dialog.querySelector('#hf-fl').value;
            ps.footerCenter = dialog.querySelector('#hf-fc').value;
            ps.footerRight = dialog.querySelector('#hf-fr').value;
            ss.setModified(true);
            ss.saveState();
            ss.updateStatus('Intestazione e piè di pagina aggiornati');
            close();
        };
    }

    // ========================================================================
    // EQUAZIONE
    // ========================================================================

    /** Template di equazioni predefinite */
    const EQUATION_TEMPLATES = [
        {
            name: 'Teorema di Pitagora',
            latex: 'a² + b² = c²',
            html: 'a<sup>2</sup> + b<sup>2</sup> = c<sup>2</sup>'
        },
        {
            name: 'Formula quadratica',
            latex: 'x = (-b ± √(b² - 4ac)) / 2a',
            html: 'x = <span style="font-size:0.9em;">−b ± √(b<sup>2</sup> − 4ac)</span> / <span style="font-size:0.9em;">2a</span>'
        },
        {
            name: 'Frazione',
            latex: 'a / b',
            html: '<span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;font-size:0.85em;"><span style="border-bottom:1.5px solid #333;padding:0 8px 2px;">a</span><span style="padding:2px 8px 0;">b</span></span>'
        },
        {
            name: 'Sommatoria',
            latex: 'Σ(i=1 to n) i²',
            html: '<span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;font-size:0.85em;"><span style="font-size:0.7em;">n</span><span style="font-size:1.3em;line-height:1;">∑</span><span style="font-size:0.7em;">i=1</span></span> i<sup>2</sup>'
        },
        {
            name: 'Integrale',
            latex: '∫ f(x) dx',
            html: '<span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;font-size:0.85em;"><span style="font-size:0.7em;">b</span><span style="font-size:1.5em;line-height:1;">∫</span><span style="font-size:0.7em;">a</span></span> f(x) dx'
        },
        {
            name: 'Derivata',
            latex: "dy/dx = f'(x)",
            html: '<span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;font-size:0.85em;"><span>dy</span><span style="border-top:1.5px solid #333;padding-top:2px;">dx</span></span> = f&prime;(x)'
        },
        {
            name: 'Limite',
            latex: 'lim(x→0) sin(x)/x = 1',
            html: 'lim <span style="font-size:0.75em;vertical-align:sub;">x→0</span> <span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;font-size:0.85em;"><span>sin(x)</span><span style="border-top:1.5px solid #333;padding-top:2px;">x</span></span> = 1'
        },
        {
            name: 'Radice quadrata',
            latex: '√(x + y)',
            html: '<span style="display:inline-flex;align-items:center;font-size:1.1em;"><span style="font-size:1.2em;line-height:1;">√</span><span style="border-top:1.5px solid #333;padding:0 6px 1px;margin-top:4px;">x + y</span></span>'
        },
        {
            name: 'Esponente',
            latex: 'e^(iπ) + 1 = 0',
            html: 'e<sup>iπ</sup> + 1 = 0'
        },
        {
            name: 'Logaritmo',
            latex: 'log_b(a) = c',
            html: 'log<sub style="font-size:0.75em;">b</sub>(a) = c'
        },
        {
            name: 'Vettore',
            latex: 'v = (x, y, z)',
            html: '<b>v</b> = (x, y, z)'
        },
        {
            name: 'Matrice 2×2',
            latex: '[a b; c d]',
            html: '<span style="display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;border-left:1.5px solid #333;border-right:1.5px solid #333;padding:0 6px;margin:0 2px;font-size:0.85em;"><span style="padding:2px 0;">a b</span><span style="border-top:1px solid #333;padding:2px 0;">c d</span></span>'
        },
    ];

    /** Mostra dialog per inserire equazioni */
    function showEquationDialog() {
        const overlay = document.createElement('div');
        overlay.id = 'equation-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:24px;min-width:520px;max-width:600px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <strong style="font-size:16px;">Inserisci equazione</strong>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#equation-modal').remove()">✕</button>
            </div>
            <div id="eq-preview" style="background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px;padding:20px;margin-bottom:16px;text-align:center;font-size:22px;font-family:'Times New Roman',serif;font-style:italic;min-height:60px;display:flex;align-items:center;justify-content:center;color:#333;">
                Seleziona un template
            </div>
            <div style="font-size:11px;font-weight:600;color:#888;margin-bottom:8px;">TEMPLATI</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-height:320px;overflow-y:auto;padding:2px;">
                ${EQUATION_TEMPLATES.map((eq, i) => `
                    <div class="eq-template" data-idx="${i}" style="display:flex;flex-direction:column;align-items:center;padding:10px 6px;border:1px solid #e8e8e8;border-radius:6px;cursor:pointer;background:#fff;transition:all 0.15s;">
                        <div style="font-family:'Times New Roman',serif;font-style:italic;font-size:16px;color:#444;line-height:1.5;text-align:center;">${eq.html}</div>
                        <span style="font-size:9px;color:#888;margin-top:4px;">${eq.name}</span>
                    </div>
                `).join('')}
            </div>
            <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
                <button id="eq-cancel" style="padding:6px 16px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:12px;">Annulla</button>
                <button id="eq-insert" style="padding:6px 16px;border:none;background:#217346;color:#fff;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">Inserisci</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        let selectedHtml = '';
        const preview = dialog.querySelector('#eq-preview');

        // Click template
        dialog.querySelectorAll('.eq-template').forEach(tpl => {
            tpl.addEventListener('click', () => {
                dialog.querySelectorAll('.eq-template').forEach(t => {
                    t.style.borderColor = '#e8e8e8';
                    t.style.background = '#fff';
                });
                tpl.style.borderColor = '#217346';
                tpl.style.background = '#f0faf4';
                const idx = parseInt(tpl.dataset.idx);
                selectedHtml = EQUATION_TEMPLATES[idx].html;
                preview.innerHTML = selectedHtml;
            });
        });

        dialog.querySelector('#eq-cancel').onclick = () => overlay.remove();
        dialog.querySelector('#eq-insert').onclick = () => {
            if (!selectedHtml) return;
            const name = 'Equazione';
            const fullHtml = `<div style="font-family:'Times New Roman',serif;font-style:italic;font-size:20px;color:#333;text-align:center;padding:12px;line-height:1.8;">${selectedHtml}</div>`;
            insertDrawingObject('', {
                name: name,
                eqHtml: selectedHtml,
                html: fullHtml,
                width: 280,
                height: 80,
                fillColor: '#ffffff',
                borderColor: '#d6d6d6',
                borderWidth: 1,
                borderRadius: 4,
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                padding: 8
            });
            const ss = window.spreadsheet;
            if (ss) ss.updateStatus('Equazione inserita');
            overlay.remove();
        };
    }

    /** Mostra dialog per modificare un'equazione esistente */
    function showEquationEditor(drawId, drawData) {
        if (!drawData) return;
        const overlay = document.createElement('div');
        overlay.id = 'equation-editor-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const currentHtml = drawData.eqHtml || '';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:24px;min-width:560px;max-width:640px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <strong style="font-size:16px;">Modifica equazione</strong>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#equation-editor-modal').remove()">✕</button>
            </div>
            <div style="margin-bottom:12px;font-size:11px;font-weight:600;color:#888;">ANTEPRIMA</div>
            <div id="eq-editor-preview" style="background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px;padding:20px;margin-bottom:16px;text-align:center;font-size:22px;font-family:'Times New Roman',serif;font-style:italic;min-height:60px;display:flex;align-items:center;justify-content:center;color:#333;">
                ${currentHtml || '...'}
            </div>
            <div style="margin-bottom:12px;">
                <div style="font-size:11px;font-weight:600;color:#888;margin-bottom:6px;">EDITOR</div>
                <textarea id="eq-editor-source" style="width:100%;min-height:60px;padding:8px 10px;border:1px solid #ccc;border-radius:4px;font-family:Consolas,monospace;font-size:13px;resize:vertical;box-sizing:border-box;">${escapeHtml(currentHtml)}</textarea>
                <div style="font-size:10px;color:#888;margin-top:4px;">Modifica l'HTML dell'equazione direttamente. Usa &lt;sup&gt; per apici, &lt;sub&gt; per pedici.</div>
            </div>
            <div style="font-size:11px;font-weight:600;color:#888;margin-bottom:8px;">TEMPLATI — clicca per sostituire</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-height:200px;overflow-y:auto;padding:2px;margin-bottom:16px;">
                ${EQUATION_TEMPLATES.map((eq, i) => `
                    <div class="eq-editor-tpl" data-idx="${i}" style="display:flex;flex-direction:column;align-items:center;padding:8px 4px;border:1px solid #e8e8e8;border-radius:6px;cursor:pointer;background:#fff;transition:all 0.15s;">
                        <div style="font-family:'Times New Roman',serif;font-style:italic;font-size:14px;color:#444;line-height:1.4;text-align:center;">${eq.html}</div>
                        <span style="font-size:9px;color:#888;margin-top:2px;">${eq.name}</span>
                    </div>
                `).join('')}
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button id="eqe-cancel" style="padding:6px 16px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:12px;">Annulla</button>
                <button id="eqe-update" style="padding:6px 16px;border:none;background:#217346;color:#fff;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">Aggiorna</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        const preview = dialog.querySelector('#eq-editor-preview');
        const source = dialog.querySelector('#eq-editor-source');

        // Live preview al digitare
        source.addEventListener('input', () => {
            preview.innerHTML = source.value || '...';
        });

        // Click template — sostituisce il contenuto
        dialog.querySelectorAll('.eq-editor-tpl').forEach(tpl => {
            tpl.addEventListener('click', () => {
                dialog.querySelectorAll('.eq-editor-tpl').forEach(t => {
                    t.style.borderColor = '#e8e8e8';
                    t.style.background = '#fff';
                });
                tpl.style.borderColor = '#217346';
                tpl.style.background = '#f0faf4';
                const idx = parseInt(tpl.dataset.idx);
                const tplHtml = EQUATION_TEMPLATES[idx].html;
                source.value = tplHtml;
                preview.innerHTML = tplHtml;
                // Scroll in alto per vedere l'anteprima
                dialog.scrollTop = 0;
            });
        });

        dialog.querySelector('#eqe-cancel').onclick = () => overlay.remove();
        dialog.querySelector('#eqe-update').onclick = () => {
            const newHtml = source.value.trim();
            if (!newHtml) return;
            const fullHtml = `<div style="font-family:'Times New Roman',serif;font-style:italic;font-size:20px;color:#333;text-align:center;padding:12px;line-height:1.8;">${newHtml}</div>`;
            // Aggiorna il drawing object
            const el = document.querySelector(`.drawing-object[data-draw-id="${drawId}"]`);
            if (el) {
                el.innerHTML = fullHtml;
            }
            const ss = window.spreadsheet;
            if (ss && ss.updateDrawingObject) {
                ss.updateDrawingObject(drawId, {
                    eqHtml: newHtml,
                    html: fullHtml,
                    content: ''
                });
                ss.saveState();
                ss.updateStatus('Equazione aggiornata');
            }
            overlay.remove();
        };
    }

    // ========================================================================
    // OGGETTO (OLE — integrazione con le altre app della suite)
    // ========================================================================

    /** Mappa delle app della suite per l'incorporamento OLE */
    const OLE_APPS = [
        { id: 'word', name: 'Documento Word', icon: 'W', color: '#2564c1', href: '../word-clone/index.html', desc: 'Elaborazione testi' },
        { id: 'powerpoint', name: 'Presentazione PowerPoint', icon: 'P', color: '#d04423', href: '../powerpoint-clone/index.html', desc: 'Presentazioni' },
        { id: 'onenote', name: 'Blocco appunti OneNote', icon: 'N', color: '#7b1fa2', href: '../onenote-clone/index.html', desc: 'Blocco appunti' },
        { id: 'outlook', name: 'Email Outlook', icon: 'M', color: '#0078d4', href: '../outlook-clone/index.html', desc: 'Posta elettronica' },
        { id: 'onedrive', name: 'File OneDrive', icon: 'D', color: '#0078d4', href: '../onedrive-clone/index.html', desc: 'File e archiviazione' }
    ];

    /** Apre un'app della suite in un iframe modale per l'incorporamento */
    function openAppForEmbed(appInfo) {
        const overlay = document.createElement('div');
        overlay.id = 'app-embed-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:30000;';

        const frame = document.createElement('div');
        frame.style.cssText = 'background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.35);display:flex;flex-direction:column;width:90vw;height:90vh;max-width:1200px;';

        frame.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 16px;background:${appInfo.color};color:#fff;flex-shrink:0;">
                <strong style="font-size:14px;">${appInfo.icon} ${appInfo.name}</strong>
                <div style="display:flex;gap:6px;">
                    <button id="embed-cancel" style="padding:4px 14px;border:1px solid rgba(255,255,255,0.3);background:transparent;color:#fff;border-radius:4px;cursor:pointer;font-size:12px;">Annulla</button>
                    <button id="embed-confirm" style="padding:4px 14px;border:none;background:rgba(255,255,255,0.9);color:${appInfo.color};border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">Incorpora</button>
                </div>
            </div>
            <div style="flex:1;position:relative;">
                <iframe src="${appInfo.href}" style="width:100%;height:100%;border:none;" title="${appInfo.name}"></iframe>
            </div>
        `;

        overlay.appendChild(frame);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        frame.querySelector('#embed-cancel').onclick = () => overlay.remove();
        frame.querySelector('#embed-confirm').onclick = () => {
            overlay.remove();
            // Crea l'oggetto incorporato nel foglio
            insertEmbeddedApp(appInfo);
        };
    }

    /** Inserisce un oggetto che rappresenta un'app incorporata */
    function insertEmbeddedApp(appInfo) {
        const ss = window.spreadsheet;
        if (!ss) return;

        // SVG icona dell'app come anteprima
        const iconSvg = `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="8" width="64" height="64" rx="12" fill="${appInfo.color}"/>
            <text x="40" y="52" text-anchor="middle" fill="#fff" font-size="36" font-weight="bold" font-family="Arial,sans-serif">${appInfo.icon}</text>
        </svg>`;

        const html = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;padding:12px;box-sizing:border-box;cursor:pointer;" title="Doppio click per modificare">
            <div style="width:64px;height:64px;margin-bottom:6px;">${iconSvg}</div>
            <div style="font-size:11px;color:#555;font-weight:600;text-align:center;">${appInfo.name}</div>
            <div style="font-size:9px;color:#999;margin-top:2px;">Doppio click per aprire</div>
        </div>`;

        const el = insertDrawingObject('', {
            name: 'Oggetto: ' + appInfo.name,
            html: html,
            width: 200,
            height: 160,
            fillColor: '#f8f9fa',
            borderColor: appInfo.color,
            borderWidth: 2,
            borderRadius: 8,
            boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
            padding: 0,
            embeddedApp: appInfo.id,
            embeddedHref: appInfo.href,
            embeddedName: appInfo.name
        });

        if (el) {
            // Doppio click riapre l'app
            el.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                openAppForEmbed(appInfo);
            });
        }

        ss.updateStatus('Oggetto ' + appInfo.name + ' incorporato');
    }

    /** Mostra dialog con solo le app Office da incorporare */
    function showOfficeAppsDialog() {
        const overlay = document.createElement('div');
        overlay.id = 'office-apps-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:24px;min-width:400px;max-width:480px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <strong style="font-size:16px;">Office componenti aggiuntivi</strong>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#office-apps-modal').remove()">✕</button>
            </div>
            <div style="font-size:11px;color:#888;margin-bottom:16px;">Seleziona un'applicazione Office da incorporare nel foglio. L'app verrà aperta in una finestra modale; al termine clicca "Incorpora".</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                ${OLE_APPS.map(a => `
                    <div class="office-app-option" data-ole="${a.id}" style="display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #e8e8e8;border-radius:8px;cursor:pointer;background:#fff;transition:all 0.15s;">
                        <div style="width:44px;height:44px;border-radius:8px;background:${a.color}20;display:flex;align-items:center;justify-content:center;font-size:20px;color:${a.color};font-weight:bold;flex-shrink:0;">${a.icon}</div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:13px;font-weight:600;color:#333;">${a.name}</div>
                            <div style="font-size:10px;color:#888;margin-top:2px;">${a.desc}</div>
                        </div>
                        <div style="font-size:16px;color:#ccc;">›</div>
                    </div>
                `).join('')}
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        dialog.querySelectorAll('.office-app-option').forEach(opt => {
            opt.addEventListener('mouseenter', () => { opt.style.borderColor = '#0078d4'; opt.style.background = '#f0f7ff'; });
            opt.addEventListener('mouseleave', () => { opt.style.borderColor = '#e8e8e8'; opt.style.background = '#fff'; });
            opt.addEventListener('click', () => {
                const app = OLE_APPS.find(a => a.id === opt.dataset.ole);
                if (app) openAppForEmbed(app);
                overlay.remove();
            });
        });
    }

    /** Mostra dialog per inserire oggetti */
    function showObjectDialog() {
        const overlay = document.createElement('div');
        overlay.id = 'object-dialog-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const objects = [
            { id: 'textbox', name: 'Casella di testo', icon: 'T', desc: 'Testo formattabile nel foglio', color: '#4472C4', action: insertTextBox },
            { id: 'wordart', name: 'WordArt', icon: 'A', desc: 'Testo decorativo con effetti', color: '#0078d4', action: insertWordArt },
            { id: 'shape', name: 'Forma', icon: '◆', desc: 'Forme geometriche predefinite', color: '#70AD47', action: () => showShapePicker((shapeId) => {
                const shapeNames = {
                    'rectangle': 'Rettangolo', 'circle': 'Cerchio', 'triangle': 'Triangolo',
                    'diamond': 'Rombo', 'arrow': 'Freccia', 'rounded-rect': 'Rettangolo arrotondato'
                };
                insertShape(shapeId, shapeNames[shapeId] || 'Forma');
            })},
            { id: 'image', name: 'Immagine', icon: '🖼️', desc: 'Inserisci un\'immagine dal computer', color: '#ED7D31', action: insertImage },
            { id: 'icon', name: 'Icone', icon: '⭐', desc: 'Libreria di icone integrate', color: '#FFC000', action: () => showIconPicker(insertIcon) },
            { id: 'model3d', name: 'Modello 3D', icon: '🧊', desc: 'Illustrazioni 3D isometriche', color: '#5B9BD5', action: () => showModel3DPicker(insertModel3D) },
            { id: 'smartart', name: 'SmartArt', icon: '📊', desc: 'Diagrammi e organigrammi', color: '#A5A5A5', action: () => showSmartArtPicker((lt) => insertSmartArt(lt)) },
            { id: 'chart', name: 'Grafico', icon: '📈', desc: 'Grafico dai dati selezionati', color: '#4472C4', action: () => {
                if (window.excelAdvanced && window.excelAdvanced.createChart) {
                    window.excelAdvanced.createChart();
                } else {
                    showChartDialog('column');
                }
            }},
            { id: 'symbol', name: 'Simbolo', icon: 'Ω', desc: 'Caratteri speciali e simboli', color: '#9B2335', action: () => showSymbolPicker() },
            // Separatore visivo — riga di app della suite
        ];

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:24px;min-width:480px;max-width:560px;box-shadow:0 8px 32px rgba(0,0,0,0.3);';
        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <strong style="font-size:16px;">Inserisci oggetto</strong>
                <button style="border:none;background:none;font-size:20px;cursor:pointer;" onclick="this.closest('#object-dialog-modal').remove()">✕</button>
            </div>
            <div style="font-size:11px;font-weight:600;color:#888;margin-bottom:8px;">OGGETTI DEL FOGLIO</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
                ${objects.map(o => `
                    <div class="object-option" data-id="${o.id}" style="display:flex;align-items:center;gap:12px;padding:10px;border:1px solid #e8e8e8;border-radius:6px;cursor:pointer;background:#fff;transition:all 0.15s;">
                        <div style="width:36px;height:36px;border-radius:6px;background:${o.color}15;display:flex;align-items:center;justify-content:center;font-size:16px;color:${o.color};flex-shrink:0;">${o.icon}</div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:12px;font-weight:600;color:#333;">${o.name}</div>
                            <div style="font-size:10px;color:#888;margin-top:1px;">${o.desc}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div style="font-size:11px;font-weight:600;color:#888;margin-bottom:8px;border-top:1px solid #eee;padding-top:12px;">INCORPORA DA ALTRA APP</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                ${OLE_APPS.map(a => `
                    <div class="object-option ole-option" data-ole="${a.id}" style="display:flex;align-items:center;gap:12px;padding:10px;border:1px solid #e8e8e8;border-radius:6px;cursor:pointer;background:#fff;transition:all 0.15s;">
                        <div style="width:36px;height:36px;border-radius:6px;background:${a.color}15;display:flex;align-items:center;justify-content:center;font-size:16px;color:${a.color};font-weight:bold;flex-shrink:0;">${a.icon}</div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:12px;font-weight:600;color:#333;">${a.name}</div>
                            <div style="font-size:10px;color:#888;margin-top:1px;">${a.desc}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        // Hover e click — oggetti del foglio
        dialog.querySelectorAll('.object-option:not(.ole-option)').forEach(opt => {
            opt.addEventListener('mouseenter', () => { opt.style.borderColor = '#0078d4'; opt.style.background = '#f0f7ff'; });
            opt.addEventListener('mouseleave', () => { opt.style.borderColor = '#e8e8e8'; opt.style.background = '#fff'; });
            opt.addEventListener('click', () => {
                const obj = objects.find(o => o.id === opt.dataset.id);
                if (obj) obj.action();
                overlay.remove();
            });
        });

        // Hover e click — app della suite (OLE)
        dialog.querySelectorAll('.ole-option').forEach(opt => {
            opt.addEventListener('mouseenter', () => { opt.style.borderColor = '#0078d4'; opt.style.background = '#f0f7ff'; });
            opt.addEventListener('mouseleave', () => { opt.style.borderColor = '#e8e8e8'; opt.style.background = '#fff'; });
            opt.addEventListener('click', () => {
                const app = OLE_APPS.find(a => a.id === opt.dataset.ole);
                if (app) openAppForEmbed(app);
                overlay.remove();
            });
        });
    }

    // ========================================================================
    // INIZIALIZZAZIONE RIBBON
    // ========================================================================

    function initRibbon() {
        // === TAB INSERISCI ===

        // Immagine
        document.querySelectorAll('#insert-tab .ribbon-button[title*="Immagine"]').forEach(btn => {
            btn.addEventListener('click', insertImage);
        });

        // Forme
        document.querySelectorAll('#insert-tab .ribbon-button[title*="Forme"]').forEach(btn => {
            btn.addEventListener('click', () => showShapePicker((shapeId) => {
                const shapeNames = {
                    'rectangle': 'Rettangolo',
                    'circle': 'Cerchio',
                    'triangle': 'Triangolo',
                    'diamond': 'Rombo',
                    'arrow': 'Freccia',
                    'rounded-rect': 'Rettangolo arrotondato'
                };
                insertShape(shapeId, shapeNames[shapeId] || 'Forma');
            }));
        });

        // Casella di testo
        document.querySelectorAll('#insert-tab .ribbon-button[title*="Casella di testo"]').forEach(btn => {
            btn.addEventListener('click', insertTextBox);
        });

        // WordArt
        document.querySelectorAll('#insert-tab .ribbon-button[title*="WordArt"]').forEach(btn => {
            btn.addEventListener('click', insertWordArt);
        });

        // Grafici
        document.querySelectorAll('#insert-tab .ribbon-button[title*="rafico" i]').forEach(btn => {
            let chartType = null, fallbackType = 'column', chartLabel = '';

            if (btn.title.includes('consigliato') || btn.textContent.includes('consigliato')) {
                // "Grafico consigliato": analizza i dati e propone i tipi più adatti
                btn.addEventListener('click', showRecommendedCharts);
                return;
            }

            if (btn.title.includes('colonne') || btn.textContent.includes('Colonne')) {
                chartType = 'colonne'; fallbackType = 'column'; chartLabel = 'Grafico a colonne';
            } else if (btn.title.includes('linee') || btn.textContent.includes('Linee')) {
                chartType = 'linee'; fallbackType = 'line'; chartLabel = 'Grafico a linee';
            } else if (btn.title.includes('torta') || btn.textContent.includes('Torta')) {
                chartType = 'torta'; fallbackType = 'pie'; chartLabel = 'Grafico a torta';
            } else if (btn.title.includes('barre') || btn.textContent.includes('Barre')) {
                chartType = 'barre'; fallbackType = 'bar'; chartLabel = 'Grafico a barre';
            } else if (btn.title.includes('area') || btn.textContent.includes('Area')) {
                chartType = 'area'; fallbackType = 'area'; chartLabel = 'Grafico ad area';
            }

            if (chartType) {
                btn.addEventListener('click', () => createDirectChart(fallbackType, chartLabel));
            } else if (btn.title.includes('Altri') || btn.textContent.includes('Altri')) {
                btn.addEventListener('click', () => createDirectChart('column', 'Altri grafici'));
            } else {
                // Bottone generico "Grafico" — mostra selettore tipo
                btn.addEventListener('click', () => {
                    if (window.excelAdvanced && typeof window.excelAdvanced.showChartTypeDialog === 'function') {
                        window.excelAdvanced.showChartTypeDialog();
                    } else {
                        showChartDialog('column');
                    }
                });
            }
        });

        // Icone
        document.querySelectorAll('#insert-tab .ribbon-button[title*="Icone"]').forEach(btn => {
            btn.addEventListener('click', () => showIconPicker(insertIcon));
        });

        // Modello 3D
        document.querySelectorAll('#insert-tab .ribbon-button[title*="Modello 3D"]').forEach(btn => {
            btn.addEventListener('click', () => showModel3DPicker(insertModel3D));
        });

        // Tabella pivot — delegato a excelAdvanced.createPivotTable()
        document.querySelectorAll('#insert-tab .ribbon-button[title*="pivot"]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (window.excelAdvanced && typeof window.excelAdvanced.createPivotTable === 'function') {
                    window.excelAdvanced.createPivotTable();
                } else {
                    const ss = window.spreadsheet;
                    if (ss) ss.updateStatus('Tabella pivot - Funzione non disponibile');
                }
            });
        });

        // SmartArt
        document.querySelectorAll('#insert-tab .ribbon-button[title*="SmartArt"]').forEach(btn => {
            btn.addEventListener('click', () => {
                showSmartArtPicker((layoutType) => {
                    insertSmartArt(layoutType);
                });
            });
        });

        // Equazione
        document.querySelectorAll('#insert-tab .ribbon-button[title*="Equazione"]').forEach(btn => {
            btn.addEventListener('click', () => showEquationDialog());
        });

        // Simbolo
        document.querySelectorAll('#insert-tab .ribbon-button[title*="Simbolo"]').forEach(btn => {
            btn.addEventListener('click', () => showSymbolPicker());
        });

        // Intestazione e piè di pagina
        document.querySelectorAll('#insert-tab .ribbon-button[title*="Intestazione"]').forEach(btn => {
            btn.addEventListener('click', () => showHeaderFooterDialog());
        });

        // Oggetto
        document.querySelectorAll('#insert-tab .ribbon-button[title*="Oggetto"]').forEach(btn => {
            btn.addEventListener('click', () => showObjectDialog());
        });

        // Office componenti aggiuntivi
        document.querySelectorAll('#insert-tab .ribbon-button[title*="Office componenti"]').forEach(btn => {
            btn.addEventListener('click', () => showOfficeAppsDialog());
        });

        // App componenti aggiuntivi
        document.querySelectorAll('#insert-tab .ribbon-button[title*="App componenti"]').forEach(btn => {
            btn.addEventListener('click', () => showObjectDialog());
        });

        // Filtri avanzati (deve precedere "Filtri" per la specificità del titolo)
        document.querySelectorAll('#insert-tab .ribbon-button[title*="Filtri avanzati"]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (window.excelAdvanced && typeof window.excelAdvanced.showAdvancedFilter === 'function') {
                    window.excelAdvanced.showAdvancedFilter();
                }
            });
        });

        // Filtri (filtro automatico sulla colonna) — esclude "Filtri avanzati"
        document.querySelectorAll('#insert-tab .ribbon-button[title*="Filtri"]').forEach(btn => {
            if ((btn.getAttribute('title') || '').includes('avanzati')) return;
            btn.addEventListener('click', () => {
                if (window.excelAdvanced && typeof window.excelAdvanced.toggleFilter === 'function') {
                    window.excelAdvanced.toggleFilter();
                }
            });
        });

        // Report di Power BI — invia i dati selezionati al Clone Power BI
        document.querySelectorAll('#insert-tab .ribbon-button[title*="Power BI"]').forEach(btn => {
            btn.addEventListener('click', openInPowerBI);
        });

        // === TAB DISEGNO ===

        // Forme nel tab Disegno
        document.querySelectorAll('#drawing-tab .ribbon-button[title*="Forme"]').forEach(btn => {
            btn.addEventListener('click', () => showShapePicker((shapeId) => {
                const shapeNames = {
                    'rectangle': 'Rettangolo',
                    'circle': 'Cerchio',
                    'triangle': 'Triangolo',
                    'diamond': 'Rombo',
                    'arrow': 'Freccia',
                    'rounded-rect': 'Rettangolo arrotondato'
                };
                insertShape(shapeId, shapeNames[shapeId] || 'Forma');
            }));
        });

        // Linee nel tab Disegno
        document.querySelectorAll('#drawing-tab .ribbon-button[title*="Linee"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const opts = {
                    name: 'Linea',
                    width: 120,
                    height: 4,
                    fillColor: '#333',
                    borderColor: '#333',
                    borderWidth: 0,
                    borderRadius: 2,
                    content: '',
                    shapeType: 'line',
                    padding: 0,
                    boxShadow: ''
                };
                insertDrawingObject('shape', opts);
            });
        });

        // Testo nel tab Disegno
        document.querySelectorAll('#drawing-tab .ribbon-button[title*="Testo"]').forEach(btn => {
            btn.addEventListener('click', insertTextBox);
        });

        // === TAB REVISIONE ===
        // Gli handler della tab Revisione (Commenti, Note, Proteggi, Ortografia, Thesaurus,
        // Accessibilità, Consenti modifica intervalli) sono gestiti INTERAMENTE da
        // excel-advanced.js (bindReviewEvents). In precedenza erano duplicati anche qui, ma
        // con un modello dati divergente (format.comment/format.note stringa vs data.comments
        // array + data.note): il doppio binding apriva due modali sovrapposti che scrivevano su
        // campi diversi. Rimossi per lasciare excel-advanced.js come unica fonte.

        // === TAB DATI ===
        // Tutti gli handler della tab Dati (Da file, Da database/Web/query, Aggiorna tutto,
        // Proprietà, Modifica collegamenti, Ordina A→Z/Z→A/personalizzato, Filtro/Cancella/
        // Riapplica/Avanzato, Analisi dati, Simulazione, Foglio previsione, Raggruppa/Separa/
        // Subtotali) sono gestiti da excel-advanced.js (bindDataToolsEvents). In precedenza
        // "Da file" era duplicato qui, causando l'apertura di DUE file picker. Rimosso.

        // === TAB VISUALIZZA ===
        // Tutti gli handler della tab Visualizza sono gestiti da excel-advanced.js
        // (bindViewEvents): Normale, Layout di pagina, Anteprima interruzioni,
        // Visualizzazioni personalizzate, Griglia, Intestazioni, Barra della formula,
        // Barra di stato, Regola, Zoom, Adatta alla selezione, 100%, Nuova finestra,
        // Organizza tutto, Nascondi, Mostra, Dividi, Blocca riquadri, Sposta, Macro.
        // Evitiamo binding duplicati qui che causerebbero doppio scatto.

        // === TAB FORMULE ===

        // Inserisci funzione — apre il browser funzioni
        document.querySelectorAll('#formulas-tab .ribbon-button[title*="Inserisci funzione"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => showFunctionBrowser('Tutte'));
        });

        // Somma automatica (Formule)
        document.querySelectorAll('#formulas-tab .ribbon-button[title*="Funzione automatica"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (ss) ss.autoSum();
            });
        });

        // Ultima utilizzata
        document.querySelectorAll('#formulas-tab .ribbon-button[title*="Ultima utilizzata"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => showFunctionBrowser('Recenti'));
        });

        // Categorie funzioni
        const catMap = {
            'Finanziarie': 'Finanziarie',
            'Logiche': 'Logiche',
            'Testo': 'Testo',
            'Data': 'Data e ora',
            'Ricerca': 'Ricerca e riferimento',
            'Matematiche': 'Matematiche e trigonometria',
            'Altre': 'Altre'
        };
        Object.keys(catMap).forEach(cat => {
            document.querySelectorAll(`#formulas-tab .ribbon-button[title*="${cat}"]`).forEach(btn => {
                if (btn.hasAttribute('data-ribbon-bound')) return;
                btn.setAttribute('data-ribbon-bound', '1');
                btn.addEventListener('click', () => showFunctionBrowser(catMap[cat]));
            });
        });

        // Gestione nomi — Name Manager reale
        document.querySelectorAll('#formulas-tab .ribbon-button[title*="Gestione nomi"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => showNameManager());
        });

        // Definisci nome
        document.querySelectorAll('#formulas-tab .ribbon-button[title*="Definisci nome"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (!ss || !ss.selectedCell) return;
                showInputDialog('Definisci nome', 'Nome del range:', 'Nome1', 'es. "Vendite2024"', (name) => {
                    if (name === null || name.trim() === '') return;
                    const ref = ss.selectedCell;
                    if (!ss._namedRanges) ss._namedRanges = {};
                    ss._namedRanges[name.toUpperCase()] = ref;
                    ss.updateStatus('Range definito: ' + name + ' = ' + ref);
                });
            });
        });

        // Usa nella formula
        document.querySelectorAll('#formulas-tab .ribbon-button[title*="Usa nella formula"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (!ss) return;
                const names = ss._namedRanges ? Object.keys(ss._namedRanges) : [];
                if (names.length === 0) {
                    ss.updateStatus('Nessun nome definito');
                    return;
                }
                // Crea una dialog con select dei nomi definiti
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';
                const list = names.map(n => `<option value="${n}">${n} → ${ss._namedRanges[n]}</option>`).join('');
                overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:24px;min-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
                    <h3 style="margin:0 0 8px;font-size:16px;color:#333;">Usa nella formula</h3>
                    <p style="font-size:12px;color:#666;margin:0 0 16px;">Seleziona un nome definito da inserire nella formula:</p>
                    <select id="name-select" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;background:#fff;margin-bottom:16px;box-sizing:border-box;">${list}</select>
                    <div style="display:flex;justify-content:flex-end;gap:8px;">
                        <button id="dlg-ok" style="padding:7px 20px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">Inserisci</button>
                        <button id="dlg-cancel" style="padding:7px 20px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:13px;">Annulla</button>
                    </div>
                </div>`;
                document.body.appendChild(overlay);
                overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
                overlay.querySelector('#dlg-cancel').onclick = () => overlay.remove();
                overlay.querySelector('#dlg-ok').onclick = () => {
                    const val = overlay.querySelector('#name-select').value;
                    overlay.remove();
                    if (val && ss._namedRanges[val]) {
                        ss.editCell(ss.selectedCell, '=' + val);
                    }
                };
                overlay.querySelector('#name-select').onkeydown = (e) => {
                    if (e.key === 'Enter') overlay.querySelector('#dlg-ok').click();
                    if (e.key === 'Escape') overlay.querySelector('#dlg-cancel').click();
                };
                overlay.querySelector('#name-select').focus();
            });
        });

        // Crea dalla selezione — crea nomi definiti dalle etichette
        document.querySelectorAll('#formulas-tab .ribbon-button[title*="Crea dalla selezione"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => showCreateNamesDialog());
        });

        // Calcola adesso
        document.querySelectorAll('#formulas-tab .ribbon-button[title*="Calcola adesso"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (ss && ss.recalculate) {
                    ss.recalculate();
                    ss.updateStatus('Ricalcolato');
                }
            });
        });

        // Calcola foglio
        document.querySelectorAll('#formulas-tab .ribbon-button[title*="Calcola foglio"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (ss && ss.recalculate) {
                    ss.recalculate();
                    ss.updateStatus('Foglio ricalcolato');
                }
            });
        });

        // Opzioni di calcolo — dialog Automatico/Manuale (rispettata davvero dal motore)
        document.querySelectorAll('#formulas-tab .ribbon-button[title*="Opzioni di calcolo"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => showCalcOptionsDialog());
        });

        // === TAB LAYOUT DI PAGINA ===

        // Margini — preset + personalizzati
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Margini"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => showMarginsDialog());
        });

        // Orientamento — interfaccia visiva Verticale/Orizzontale
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Orientamento"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => showOrientationDialog());
        });

        // Dimensione — selettore formato carta
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Dimensione"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (!ss) return;
                const current = localStorage.getItem('excel_paper') || 'A4';
                const sizes = ['A3', 'A4', 'A5', 'Lettera', 'Legale', 'Tabloid'];
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';
                overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:240px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
                    <h3 style="margin:0 0 12px;font-size:15px;">Formato carta</h3>
                    ${sizes.map(s => `<div style="padding:6px 10px;margin-bottom:2px;border-radius:4px;cursor:pointer;${s===current?'background:#e8f5e9;font-weight:600;':''}" data-size="${s}">${s}</div>`).join('')}
                    <div style="display:flex;justify-content:flex-end;margin-top:10px;gap:8px;">
                        <button id="paper-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
                        <button id="paper-cancel" style="padding:6px 16px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                    </div>
                </div>`;
                document.body.appendChild(overlay);
                overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
                overlay.querySelector('#paper-cancel').onclick = () => overlay.remove();
                overlay.querySelectorAll('[data-size]').forEach(el => el.onclick = () => {
                    overlay.querySelectorAll('[data-size]').forEach(x => {x.style.background='';x.style.fontWeight='';});
                    el.style.background = '#e8f5e9'; el.style.fontWeight = '600';
                });
                overlay.querySelector('#paper-ok').onclick = () => {
                    const sel = overlay.querySelector('[style*="background: #e8f5e9"]');
                    const size = sel ? sel.dataset.size : 'A4';
                    localStorage.setItem('excel_paper', size);
                    ss.updateStatus('Formato carta: ' + size);
                    overlay.remove();
                };
            });
        });

        // Area di stampa — imposta/cancella (range selezionato + indicatore tratteggiato)
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Area di stampa"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (!ss) return;
                if (!ss._printArea) {
                    const range = (ss.selectedRange && ss.selectedRange.start !== ss.selectedRange.end)
                        ? `${ss.selectedRange.start}:${ss.selectedRange.end}` : (ss.selectedCell || 'A1');
                    ss._printArea = range;
                    drawPrintAreaIndicator();
                    ss.updateStatus('Area di stampa impostata: ' + range);
                } else {
                    delete ss._printArea;
                    const ind = document.getElementById('print-area-indicator');
                    if (ind) ind.remove();
                    ss.updateStatus('Area di stampa rimossa');
                }
            });
        });

        // Interruzioni — inserisci/rimuovi interruzione di pagina alla riga corrente
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Interruzioni"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (!ss || !ss.selectedCell) return;
                const coords = ss.getCellCoordinates(ss.selectedCell);
                if (!ss._pageBreaks) ss._pageBreaks = [];
                const idx = ss._pageBreaks.indexOf(coords.row);
                if (idx === -1) {
                    ss._pageBreaks.push(coords.row);
                    ss.updateStatus('Interruzione di pagina inserita alla riga ' + (coords.row + 1));
                } else {
                    ss._pageBreaks.splice(idx, 1);
                    ss.updateStatus('Interruzione di pagina rimossa dalla riga ' + (coords.row + 1));
                }
            });
        });

        // Sfondo — selettore colore
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Sfondo"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (!ss) return;
                const current = localStorage.getItem('excel_sheet_bg') || '';
                showColorDialog('Sfondo foglio', current, (color) => {
                    if (color === null) return;
                    const sheet = document.getElementById('spreadsheet-viewport');
                    if (sheet) {
                        if (color.trim()) {
                            sheet.style.backgroundColor = color;
                            localStorage.setItem('excel_sheet_bg', color);
                            ss.updateStatus('Sfondo foglio: ' + color);
                        } else {
                            sheet.style.backgroundColor = '';
                            localStorage.removeItem('excel_sheet_bg');
                            ss.updateStatus('Sfondo foglio rimosso');
                        }
                    }
                });
            });
        });

        // Porta in primo piano / secondo piano
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="primo piano"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const sel = document.querySelector('.drawing-object[style*="outline: 2px dashed"]') ||
                    document.querySelector('.drawing-object:hover');
                if (sel) {
                    const maxZ = Math.max(200, ...Array.from(document.querySelectorAll('.drawing-object'))
                        .map(d => parseInt(d.style.zIndex) || 200));
                    sel.style.zIndex = maxZ + 1;
                    const drawId = sel.dataset.drawId;
                    if (drawId && window.spreadsheet) {
                        window.spreadsheet.updateDrawingObject(drawId, { zIndex: maxZ + 1 });
                    }
                } else {
                    const ss = window.spreadsheet;
                    if (ss) ss.updateStatus('Seleziona un oggetto grafico');
                }
            });
        });

        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="secondo piano"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const sel = document.querySelector('.drawing-object[style*="outline: 2px dashed"]') ||
                    document.querySelector('.drawing-object:hover');
                if (sel) {
                    const currentZ = parseInt(sel.style.zIndex) || 200;
                    const newZ = Math.max(1, currentZ - 1);
                    sel.style.zIndex = newZ;
                    const drawId = sel.dataset.drawId;
                    if (drawId && window.spreadsheet) {
                        window.spreadsheet.updateDrawingObject(drawId, { zIndex: newZ });
                    }
                } else {
                    const ss = window.spreadsheet;
                    if (ss) ss.updateStatus('Seleziona un oggetto grafico');
                }
            });
        });

        // === TAB CONDIVIDI ===

        document.querySelectorAll('#share-tab .ribbon-button[title*="Condividi"]').forEach(btn => {
            btn.addEventListener('click', () => showShareDialog());
        });
        document.querySelectorAll('#share-tab .ribbon-button[title*="Crea una copia"]').forEach(btn => {
            btn.addEventListener('click', () => createCopyOfWorkbook());
        });
        document.querySelectorAll('#share-tab .ribbon-button[title*="Copia collegamento"]').forEach(btn => {
            btn.addEventListener('click', () => copyWorkbookLink());
        });
        document.querySelectorAll('#share-tab .ribbon-button[title*="Collegamento a questo foglio"]').forEach(btn => {
            btn.addEventListener('click', () => copySheetCellLink());
        });

        // === TAB GUIDA ===

        document.querySelectorAll('#help-tab .ribbon-button[title*="Guida"]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (window.excelMenu) window.excelMenu.showHelp();
            });
        });
        document.querySelectorAll('#help-tab .ribbon-button[title*="Formazione"]').forEach(btn => {
            btn.addEventListener('click', () => window.open('guida.html#formazione', '_blank'));
        });
        document.querySelectorAll('#help-tab .ribbon-button[title*="Community"]').forEach(btn => {
            btn.addEventListener('click', () => window.open('guida.html#community', '_blank'));
        });
        document.querySelectorAll('#help-tab .ribbon-button[title*="Commenti"]').forEach(btn => {
            btn.addEventListener('click', () => window.open('guida.html#commenti', '_blank'));
        });

        // === GESTIONE ALTRI BOTTONI SPARSI ===

        // Cancella (Home → Modifica): gestito da excel-functions.js (clearContents).
        // Rimosso il duplicato che faceva scattare clearCell più volte.

        // Bottone modifica (title bar) - già gestito in initExternalEvents

        // ====================================================================
        // NUOVE FUNZIONALITÀ AGGIUNTIVE
        // ====================================================================

        // === Trova e seleziona (Home): gestito da excel-functions.js (showFindDialog).
        // Rimosso il duplicato che apriva due finestre di ricerca. ===

        // Griglia / Intestazioni / Barra della formula della tab Visualizza:
        // gestite da excel-advanced.js (toggleGridlines/toggleHeaders + formula-bar).
        // Rimossi i duplicati che annullavano il toggle (doppio scatto).

        // === Ruota oggetti (Layout di pagina) ===
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Ruota"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const sel = document.querySelector('.drawing-object[style*="outline: 2px dashed"]')
                    || document.querySelectorAll('.drawing-object')[0];
                if (!sel) {
                    const ss = window.spreadsheet;
                    if (ss) ss.updateStatus('Seleziona un oggetto grafico');
                    return;
                }
                const drawId = sel.dataset.drawId;
                const current = parseInt(sel.dataset.rotation) || 0;
                const newRot = (current + 45) % 360;
                sel.dataset.rotation = newRot;
                sel.style.transform = 'rotate(' + newRot + 'deg)';
                if (drawId && window.spreadsheet && window.spreadsheet.updateDrawingObject) {
                    window.spreadsheet.updateDrawingObject(drawId, { rotation: newRot });
                    window.spreadsheet.saveState();
                }
                const ss = window.spreadsheet;
                if (ss) ss.updateStatus('Ruotato di ' + newRot + '°');
            });
        });

        // === Allinea oggetti (Layout di pagina) ===
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Allinea"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const sel = document.querySelector('.drawing-object[style*="outline: 2px dashed"]');
                if (!sel) {
                    const ss = window.spreadsheet;
                    if (ss) ss.updateStatus('Seleziona un oggetto grafico');
                    return;
                }
                const parent = sel.parentElement;
                if (!parent) return;
                const pRect = parent.getBoundingClientRect();
                const sRect = sel.getBoundingClientRect();
                // Allinea al centro del contenitore
                const centerX = (pRect.width - sel.offsetWidth) / 2;
                const centerY = (pRect.height - sel.offsetHeight) / 2;
                sel.style.left = Math.max(0, centerX) + 'px';
                sel.style.top = Math.max(0, centerY) + 'px';
                const drawId = sel.dataset.drawId;
                if (drawId && window.spreadsheet && window.spreadsheet.updateDrawingObject) {
                    const left = parseInt(sel.style.left) || 0;
                    const top = parseInt(sel.style.top) || 0;
                    window.spreadsheet.updateDrawingObject(drawId, { left, top });
                    window.spreadsheet.saveState();
                }
                const ss = window.spreadsheet;
                if (ss) ss.updateStatus('Oggetto allineato al centro');
            });
        });

        // === Larghezza stampa (Layout) ===
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Larghezza"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (!ss) return;
                const cur = localStorage.getItem('excel_print_width') || 'automatico';
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';
                overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:24px;min-width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
                    <h3 style="margin:0 0 16px;font-size:16px;color:#333;">Larghezza stampa</h3>
                    <div style="margin-bottom:12px;">
                        <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:4px;">Adatta alla larghezza</label>
                        <select id="w-type" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;">
                            <option value="automatico" ${cur==='automatico'?'selected':''}>Automatico</option>
                            <option value="pagine" ${cur!=='automatico'?'selected':''}>Specifica numero pagine</option>
                        </select>
                    </div>
                    <div id="w-pages" style="margin-bottom:16px;${cur==='automatico'?'display:none;':''}">
                        <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:4px;">Numero pagine</label>
                        <input id="w-value" type="number" min="1" max="99" value="${cur!=='automatico'?cur:'1'}" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;" placeholder="es. 1, 2, 3...">
                        <div style="font-size:11px;color:#888;margin-top:4px;">Il foglio verrà ridimensionato per adattarsi al numero di pagine specificato in larghezza.</div>
                    </div>
                    <div style="display:flex;justify-content:flex-end;gap:8px;">
                        <button id="w-ok" style="padding:7px 20px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">OK</button>
                        <button id="w-cancel" style="padding:7px 20px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:13px;">Annulla</button>
                    </div>
                </div>`;
                document.body.appendChild(overlay);
                overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
                overlay.querySelector('#w-cancel').onclick = () => overlay.remove();
                overlay.querySelector('#w-type').onchange = () => {
                    overlay.querySelector('#w-pages').style.display = overlay.querySelector('#w-type').value === 'pagine' ? '' : 'none';
                };
                overlay.querySelector('#w-ok').onclick = () => {
                    const type = overlay.querySelector('#w-type').value;
                    if (type === 'automatico') {
                        localStorage.setItem('excel_print_width', 'automatico');
                        ss.updateStatus('Larghezza stampa: Automatico');
                    } else {
                        const val = parseInt(overlay.querySelector('#w-value').value);
                        if (val > 0 && val < 100) {
                            localStorage.setItem('excel_print_width', val);
                            ss.updateStatus('Larghezza stampa: ' + val + ' pagina/e');
                        } else {
                            ss.updateStatus('Inserisci un numero valido tra 1 e 99');
                            return;
                        }
                    }
                    overlay.remove();
                };
            });
        });

        // === Altezza stampa (Layout) ===
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Altezza"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (!ss) return;
                const cur = localStorage.getItem('excel_print_height') || 'automatico';
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';
                overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:24px;min-width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
                    <h3 style="margin:0 0 16px;font-size:16px;color:#333;">Altezza stampa</h3>
                    <div style="margin-bottom:12px;">
                        <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:4px;">Adatta all'altezza</label>
                        <select id="h-type" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;">
                            <option value="automatico" ${cur==='automatico'?'selected':''}>Automatico</option>
                            <option value="pagine" ${cur!=='automatico'?'selected':''}>Specifica numero pagine</option>
                        </select>
                    </div>
                    <div id="h-pages" style="margin-bottom:16px;${cur==='automatico'?'display:none;':''}">
                        <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:4px;">Numero pagine</label>
                        <input id="h-value" type="number" min="1" max="99" value="${cur!=='automatico'?cur:'1'}" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;" placeholder="es. 1, 2, 3...">
                        <div style="font-size:11px;color:#888;margin-top:4px;">Il foglio verrà ridimensionato per adattarsi al numero di pagine specificato in altezza.</div>
                    </div>
                    <div style="display:flex;justify-content:flex-end;gap:8px;">
                        <button id="h-ok" style="padding:7px 20px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">OK</button>
                        <button id="h-cancel" style="padding:7px 20px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:13px;">Annulla</button>
                    </div>
                </div>`;
                document.body.appendChild(overlay);
                overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
                overlay.querySelector('#h-cancel').onclick = () => overlay.remove();
                overlay.querySelector('#h-type').onchange = () => {
                    overlay.querySelector('#h-pages').style.display = overlay.querySelector('#h-type').value === 'pagine' ? '' : 'none';
                };
                overlay.querySelector('#h-ok').onclick = () => {
                    const type = overlay.querySelector('#h-type').value;
                    if (type === 'automatico') {
                        localStorage.setItem('excel_print_height', 'automatico');
                        ss.updateStatus('Altezza stampa: Automatico');
                    } else {
                        const val = parseInt(overlay.querySelector('#h-value').value);
                        if (val > 0 && val < 100) {
                            localStorage.setItem('excel_print_height', val);
                            ss.updateStatus('Altezza stampa: ' + val + ' pagina/e');
                        } else {
                            ss.updateStatus('Inserisci un numero valido tra 1 e 99');
                            return;
                        }
                    }
                    overlay.remove();
                };
            });
        });

        // === Scala (Layout) ===
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Scala"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (!ss) return;
                const current = localStorage.getItem('excel_scale') || '100';
                showInputDialog('Scala stampa', 'Percentuale di scala (10-400%)', current, 'es. 100, 150, 200', (val) => {
                    if (val === null || val === '') return;
                    const pct = Math.max(10, Math.min(400, parseInt(val)));
                    if (!isNaN(pct) && pct >= 10 && pct <= 400) {
                        localStorage.setItem('excel_scale', pct);
                        ss.updateStatus('Scala: ' + pct + '%');
                    } else {
                        ss.updateStatus('Valore non valido. Inserisci un numero tra 10 e 400');
                    }
                });
            });
        });

        // === Opzioni foglio — Griglia (Layout) ===
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Griglia"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (window.excelAdvanced && window.excelAdvanced.toggleGridlines) {
                    window.excelAdvanced.toggleGridlines();
                } else if (ss) {
                    const grid = document.getElementById('spreadsheet');
                    if (grid) { grid.classList.toggle('hide-gridlines'); ss.updateStatus('Griglia ' + (grid.classList.contains('hide-gridlines') ? 'nascosta' : 'mostrata')); }
                }
            });
        });

        // === Opzioni foglio — Intestazioni (Layout) ===
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Intestazioni"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                if (window.excelAdvanced && window.excelAdvanced.toggleHeaders) {
                    window.excelAdvanced.toggleHeaders();
                } else {
                    const colH = document.getElementById('column-headers');
                    const rowH = document.getElementById('row-headers');
                    const corner = document.getElementById('corner-header');
                    if (!colH) return;
                    const hidden = colH.style.display === 'none';
                    colH.style.display = hidden ? '' : 'none';
                    rowH.style.display = hidden ? '' : 'none';
                    if (corner) corner.style.display = hidden ? '' : 'none';
                    const ss = window.spreadsheet;
                    if (ss) ss.updateStatus(hidden ? 'Intestazioni visibili' : 'Intestazioni nascoste');
                }
            });
        });

        // === Raggruppa/Separa oggetti (Layout di pagina) ===
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Raggruppa"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (!ss || !ss.drawingObjects) return;
                // Oggetti attualmente selezionati (outline tratteggiato)
                const selectedEls = [...document.querySelectorAll('.drawing-object[style*="dashed"]')];
                if (selectedEls.length < 2) { ss.updateStatus('Seleziona almeno 2 oggetti (Ctrl+click) per raggrupparli'); return; }
                const groupId = 'g' + Date.now();
                selectedEls.forEach(el => {
                    const dd = ss.drawingObjects.find(x => String(x.id) === el.dataset.drawId);
                    if (dd) { dd.groupId = groupId; ss.updateDrawingObject(dd.id, { groupId }); }
                });
                ss.saveState();
                ss.updateStatus(`${selectedEls.length} oggetti raggruppati`);
            });
        });

        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Separa"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (!ss || !ss.drawingObjects) return;
                const selectedEls = [...document.querySelectorAll('.drawing-object[style*="dashed"]')];
                // Trova i groupId coinvolti dalla selezione
                const groupIds = new Set();
                selectedEls.forEach(el => {
                    const dd = ss.drawingObjects.find(x => String(x.id) === el.dataset.drawId);
                    if (dd && dd.groupId) groupIds.add(dd.groupId);
                });
                if (groupIds.size === 0) { ss.updateStatus('Seleziona un oggetto raggruppato da separare'); return; }
                let n = 0;
                ss.drawingObjects.forEach(dd => {
                    if (dd.groupId && groupIds.has(dd.groupId)) { delete dd.groupId; n++; }
                });
                ss.setModified(true);
                ss.saveState();
                ss.updateStatus(`${n} oggetti separati`);
            });
        });

        // === Stampa titoli (Layout) ===
        document.querySelectorAll('#page-layout-tab .ribbon-button[title*="Stampa titoli"]').forEach(btn => {
            if (btn.hasAttribute('data-ribbon-bound')) return;
            btn.setAttribute('data-ribbon-bound', '1');
            btn.addEventListener('click', () => {
                const ss = window.spreadsheet;
                if (!ss || !ss.selectedCell) return;
                const ref = ss.selectedCell;
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';
                overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
                    <h3 style="margin:0 0 12px;font-size:15px;">Stampa titoli</h3>
                    <div style="margin-bottom:10px;">
                        <label style="font-size:12px;font-weight:600;">Righe da ripetere in alto:</label>
                        <input id="print-rows" style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:4px;margin-top:4px;font-size:13px;" placeholder="es. $1:$1" value="${localStorage.getItem('excel_print_rows')||''}">
                    </div>
                    <div style="margin-bottom:14px;">
                        <label style="font-size:12px;font-weight:600;">Colonne da ripetere a sinistra:</label>
                        <input id="print-cols" style="width:100%;padding:6px 8px;border:1px solid #ccc;border-radius:4px;margin-top:4px;font-size:13px;" placeholder="es. $A:$A" value="${localStorage.getItem('excel_print_cols')||''}">
                    </div>
                    <div style="display:flex;justify-content:flex-end;gap:8px;">
                        <button id="print-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
                        <button id="print-cancel" style="padding:6px 16px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                    </div>
                </div>`;
                document.body.appendChild(overlay);
                overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
                overlay.querySelector('#print-cancel').onclick = () => overlay.remove();
                overlay.querySelector('#print-ok').onclick = () => {
                    const rows = overlay.querySelector('#print-rows').value.trim();
                    const cols = overlay.querySelector('#print-cols').value.trim();
                    if (rows) localStorage.setItem('excel_print_rows', rows);
                    if (cols) localStorage.setItem('excel_print_cols', cols);
                    ss.updateStatus('Titoli stampa ' + (rows||'nessuna riga') + ', ' + (cols||'nessuna colonna'));
                    overlay.remove();
                };
            });
        });

        // === Listener globale: evidenzia la voce di menu superiore ===
        document.querySelector('#ribbon-content')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.ribbon-button');
            if (!btn) return;
            const tab = btn.closest('.ribbon-tab');
            if (!tab) return;
            const tabMap = {
                'home-tab': 'home',
                'insert-tab': 'inserisci',
                'page-layout-tab': 'layout-di-pagina',
                'formulas-tab': 'formule',
                'data-tab': 'dati',
                'review-tab': 'revisione',
                'view-tab': 'visualizza',
                'share-tab': 'condividi',
                'help-tab': 'guida',
                'drawing-tab': 'disegno'
            };
            const slug = tabMap[tab.id];
            if (slug && window.excelMenu && window.excelMenu.setActiveMenuItem) {
                window.excelMenu.setActiveMenuItem(slug);
            }
        });

        // === Segna come inizializzato ===
        document.querySelector('#ribbon-container')?.setAttribute('data-ribbon-init', 'true');
    }

    // ========================================================================
    // TROVA E SOSTITUISCI
    // ========================================================================

    /** Mostra dialog di trova e sostituisci */
    function showFindDialog() {
        const ss = window.spreadsheet;
        if (!ss) return;

        const overlay = document.createElement('div');
        overlay.id = 'find-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.3);display:flex;align-items:flex-start;justify-content:center;padding-top:80px;z-index:10000;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:20px;min-width:400px;max-width:460px;box-shadow:0 8px 32px rgba(0,0,0,0.25);';
        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                <strong style="font-size:15px;">Trova e sostituisci</strong>
                <button style="border:none;background:none;font-size:18px;cursor:pointer;color:#999;" onclick="this.closest('#find-modal').remove()">✕</button>
            </div>
            <div style="margin-bottom:10px;">
                <label style="font-size:11px;font-weight:600;color:#555;">Trova</label>
                <input id="find-input" type="text" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;" placeholder="Testo da cercare...">
            </div>
            <div style="margin-bottom:14px;">
                <label style="font-size:11px;font-weight:600;color:#555;">Sostituisci con</label>
                <input id="replace-input" type="text" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;" placeholder="Testo sostitutivo (lascia vuoto per solo trova)">
            </div>
            <div style="display:flex;gap:8px;margin-bottom:12px;">
                <button id="find-next" style="flex:1;padding:7px 0;border:1px solid #217346;background:#217346;color:#fff;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">Trova successivo</button>
                <button id="find-replace" style="flex:1;padding:7px 0;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:12px;">Sostituisci</button>
                <button id="find-replace-all" style="flex:1;padding:7px 0;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:12px;">Sostituisci tutto</button>
            </div>
            <div id="find-status" style="font-size:11px;color:#888;text-align:center;min-height:16px;"></div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        const findInput = dialog.querySelector('#find-input');
        const replaceInput = dialog.querySelector('#replace-input');
        const status = dialog.querySelector('#find-status');

        // Trova celle
        let lastFoundIdx = -1;
        let matchedRefs = [];

        function searchCells() {
            const q = findInput.value.trim().toLowerCase();
            if (!q) { matchedRefs = []; lastFoundIdx = -1; return; }
            matchedRefs = [];
            for (const cellRef in ss.data) {
                const cellData = ss.data[cellRef];
                const val = (cellData.value || cellData.formula || '').toString().toLowerCase();
                if (val.includes(q)) {
                    matchedRefs.push(cellRef);
                }
            }
            // Ordina per riga/colonna
            matchedRefs.sort((a, b) => {
                const ca = ss.getCellCoordinates(a);
                const cb = ss.getCellCoordinates(b);
                return ca.row !== cb.row ? ca.row - cb.row : ca.col - cb.col;
            });
        }

        function showResult(ref) {
            if (ref) {
                ss.selectCell(ref);
                ss.updateStatus('Trovato: ' + ref);
                status.textContent = 'Trovato in ' + ref + ' (' + (lastFoundIdx + 1) + ' di ' + matchedRefs.length + ')';
            } else {
                status.textContent = 'Nessun risultato';
                ss.updateStatus('Nessuna corrispondenza trovata');
            }
        }

        dialog.querySelector('#find-next').onclick = () => {
            searchCells();
            if (matchedRefs.length === 0) {
                status.textContent = 'Nessuna corrispondenza';
                return;
            }
            lastFoundIdx = (lastFoundIdx + 1) % matchedRefs.length;
            showResult(matchedRefs[lastFoundIdx]);
        };

        dialog.querySelector('#find-replace').onclick = () => {
            const replace = replaceInput.value;
            searchCells();
            if (matchedRefs.length === 0) {
                status.textContent = 'Nessuna corrispondenza';
                return;
            }
            if (lastFoundIdx < 0 || lastFoundIdx >= matchedRefs.length) {
                lastFoundIdx = 0;
            }
            const ref = matchedRefs[lastFoundIdx];
            const cellData = ss.data[ref];
            if (cellData) {
                const q = findInput.value.trim();
                const oldVal = cellData.value || '';
                if (typeof oldVal === 'string' && oldVal.includes(q)) {
                    cellData.value = oldVal.replace(q, replace);
                    cellData.computedValue = cellData.value;
                    ss.updateCellDisplay(ref);
                    ss.setModified(true);
                    ss.saveState();
                    status.textContent = 'Sostituito in ' + ref;
                    // Trova il prossimo
                    lastFoundIdx++;
                    if (lastFoundIdx >= matchedRefs.length) lastFoundIdx = 0;
                    showResult(matchedRefs[lastFoundIdx]);
                }
            }
        };

        dialog.querySelector('#find-replace-all').onclick = () => {
            const replace = replaceInput.value;
            searchCells();
            let count = 0;
            const q = findInput.value.trim();
            matchedRefs.forEach(ref => {
                const cellData = ss.data[ref];
                if (cellData) {
                    const oldVal = cellData.value || '';
                    if (typeof oldVal === 'string' && oldVal.includes(q)) {
                        cellData.value = oldVal.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace);
                        cellData.computedValue = cellData.value;
                        ss.updateCellDisplay(ref);
                        count++;
                    }
                }
            });
            if (count > 0) {
                ss.setModified(true);
                ss.saveState();
                ss.recalculate();
            }
            status.textContent = count + ' sostituzion' + (count === 1 ? 'e' : 'i effettuate');
            ss.updateStatus(count + ' cell' + (count === 1 ? 'a' : 'e') + ' aggiornata' + (count === 1 ? '' : 'e'));
        };

        // Invio nel campo trova attiva "Trova successivo"
        findInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') dialog.querySelector('#find-next').click(); });
        replaceInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') dialog.querySelector('#find-replace').click(); });

        setTimeout(() => findInput.focus(), 100);
    }

    // ========================================================================
    // DIALOG INPUT RIUTILIZZABILE
    // ========================================================================

    /** Input dialog professionale — sostituisce prompt() */
    function showInputDialog(title, label, defaultValue, placeholder, callback) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:24px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
            <h3 style="margin:0 0 16px;font-size:16px;color:#333;">${title}</h3>
            <div style="margin-bottom:16px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:4px;">${label}</label>
                <input id="dlg-input" type="text" value="${String(defaultValue == null ? '' : defaultValue).replace(/"/g,'&quot;')}" style="width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;" placeholder="${placeholder||''}">
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;">
                <button id="dlg-ok" style="padding:7px 20px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">OK</button>
                <button id="dlg-cancel" style="padding:7px 20px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:13px;">Annulla</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); if (callback) callback(null); } };
        overlay.querySelector('#dlg-cancel').onclick = () => { overlay.remove(); if (callback) callback(null); };
        overlay.querySelector('#dlg-ok').onclick = () => {
            const val = overlay.querySelector('#dlg-input').value;
            overlay.remove();
            if (callback) callback(val);
        };
        overlay.querySelector('#dlg-input').onkeydown = (e) => { if (e.key === 'Enter') overlay.querySelector('#dlg-ok').click(); if (e.key === 'Escape') overlay.querySelector('#dlg-cancel').click(); };
        setTimeout(() => overlay.querySelector('#dlg-input').focus(), 100);
    }

    // ========================================================================
    // CONDIVISIONE (TAB CONDIVIDI)
    // ========================================================================

    /** Nome file corrente (senza asterisco di modifica) */
    function currentFileName() {
        const t = document.getElementById('docTitle');
        return (t ? t.value : 'Cartel1').replace('*', '').trim() || 'Cartel1';
    }

    /** URL base della cartella di lavoro corrente, con il nome file come parametro */
    function workbookUrl() {
        const base = window.location.origin + window.location.pathname;
        return base + '?file=' + encodeURIComponent(currentFileName());
    }

    /** Copia testo negli appunti, con fallback per browser/contesti senza Clipboard API */
    function copyToClipboard(text, okMsg) {
        const notify = () => {
            if (window.excelMenu && window.excelMenu.showNotification) {
                window.excelMenu.showNotification(okMsg || 'Copiato negli appunti', 'success');
            } else if (window.spreadsheet) {
                window.spreadsheet.updateStatus(okMsg || 'Copiato negli appunti');
            }
        };
        const fallback = () => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
            document.body.appendChild(ta);
            ta.focus(); ta.select();
            try { document.execCommand('copy'); } catch (e) {}
            ta.remove();
            notify();
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(notify).catch(fallback);
        } else {
            fallback();
        }
    }

    /** Dialog di condivisione con link, email e livello di permesso */
    function showShareDialog() {
        const url = workbookUrl();
        const fileName = currentFileName();
        const overlay = document.createElement('div');
        overlay.id = 'share-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:12px;padding:24px;width:440px;max-width:92%;box-shadow:0 12px 40px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:17px;color:#1a1a2e;">Condividi "${fileName}"</h3>
                <button id="sh-close" style="border:none;background:none;font-size:22px;cursor:pointer;color:#999;">&times;</button>
            </div>
            <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:4px;">Invita persone (email)</label>
            <input id="sh-email" type="email" placeholder="nome@esempio.com" style="width:100%;padding:9px 10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:13px;">
            <div style="display:flex;align-items:center;gap:8px;margin:10px 0 16px;">
                <label style="font-size:12px;color:#555;">Autorizzazione:</label>
                <select id="sh-perm" style="flex:1;padding:7px;border:1px solid #ccc;border-radius:6px;font-size:13px;">
                    <option value="edit">Può modificare</option>
                    <option value="view">Può visualizzare</option>
                </select>
                <button id="sh-send" style="padding:8px 16px;background:#217346;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">Invia</button>
            </div>
            <div style="border-top:1px solid #eee;padding-top:14px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:4px;">Collegamento alla cartella di lavoro</label>
                <div style="display:flex;gap:8px;">
                    <input id="sh-link" type="text" readonly value="${url}" style="flex:1;padding:9px 10px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font-size:12px;background:#f7f7f7;color:#444;">
                    <button id="sh-copy" style="padding:8px 16px;background:#0078d4;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;white-space:nowrap;">Copia link</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('#sh-close').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('#sh-copy').onclick = () => copyToClipboard(url, 'Collegamento copiato negli appunti');
        overlay.querySelector('#sh-send').onclick = () => {
            const email = overlay.querySelector('#sh-email').value.trim();
            const perm = overlay.querySelector('#sh-perm').value === 'edit' ? 'modifica' : 'visualizzazione';
            if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                overlay.querySelector('#sh-email').style.borderColor = '#d32f2f';
                overlay.querySelector('#sh-email').focus();
                return;
            }
            close();
            if (window.excelMenu && window.excelMenu.showNotification) {
                window.excelMenu.showNotification('Invito di ' + perm + ' inviato a ' + email, 'success');
            }
        };
        setTimeout(() => overlay.querySelector('#sh-email').focus(), 100);
    }

    /** Crea una copia della cartella di lavoro corrente (salvata in localStorage) */
    function createCopyOfWorkbook() {
        const ss = window.spreadsheet;
        if (!ss) return;
        const baseName = currentFileName();
        const copyName = 'Copia di ' + baseName;
        try {
            const data = ss.exportData();
            localStorage.setItem('excel-file-' + copyName, JSON.stringify(data));
            if (window.excelMenu && window.excelMenu.showNotification) {
                window.excelMenu.showNotification('Copia creata: "' + copyName + '" (disponibile in File ▸ Apri)', 'success');
            }
            ss.updateStatus('Copia creata: ' + copyName);
        } catch (e) {
            if (window.excelMenu && window.excelMenu.showNotification) {
                window.excelMenu.showNotification('Impossibile creare la copia: ' + e.message, 'error');
            }
        }
    }

    /** Copia negli appunti il collegamento alla cartella di lavoro */
    function copyWorkbookLink() {
        copyToClipboard(workbookUrl(), 'Collegamento alla cartella di lavoro copiato');
    }

    /** Copia negli appunti un collegamento al foglio e alla cella/intervallo selezionato */
    function copySheetCellLink() {
        const ss = window.spreadsheet;
        const fileName = currentFileName();
        let ref = 'A1';
        let sheetName = 'Foglio1';
        if (ss) {
            const r = ss.selectedRange;
            ref = (r && r.start) ? (r.start === r.end ? r.start : r.start + ':' + r.end) : (ss.selectedCell || 'A1');
        }
        const activeTab = document.querySelector('.sheet-tab.active');
        if (activeTab) sheetName = activeTab.textContent.replace('×', '').trim() || sheetName;
        const link = workbookUrl() + '#' + encodeURIComponent(sheetName) + '!' + ref;
        copyToClipboard(link, 'Collegamento a ' + sheetName + '!' + ref + ' copiato');
    }

    /** Color picker dialog professionale con campioni colore */
    function showColorDialog(title, currentColor, callback) {
        const colors = [
            '#000000','#444444','#666666','#999999','#cccccc','#eeeeee','#f3f3f3','#ffffff',
            '#c00000','#ff0000','#ff6600','#ffff00','#92d050','#00b050','#00b0f0','#0070c0',
            '#002060','#7030a0','#e81b7a','#ff4081','#ff9800','#ffeb3b','#8bc34a','#4caf50',
            '#2196f3','#3f51b5','#673ab7','#9c27b0','#795548','#607d8b','#cddc39','#009688'
        ];
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:24px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.25);">
            <h3 style="margin:0 0 16px;font-size:16px;color:#333;">${title}</h3>
            <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin-bottom:16px;">
                ${colors.map(c => `<div data-color="${c}" style="width:32px;height:32px;border-radius:4px;cursor:pointer;background:${c};border:2px solid ${c===currentColor?'#217346':'transparent'};box-sizing:border-box;${c==='#ffffff'?'outline:1px solid #ddd;':''}"></div>`).join('')}
            </div>
            <div style="margin-bottom:14px;">
                <label style="display:block;font-size:12px;font-weight:600;color:#555;margin-bottom:4px;">O inserisci valore esadecimale:</label>
                <input id="dlg-color" type="text" value="${currentColor||'#000000'}" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;box-sizing:border-box;font-family:monospace;" placeholder="#RRGGBB">
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px;">
                <button id="clr-ok" style="padding:7px 20px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;">OK</button>
                <button id="clr-cancel" style="padding:7px 20px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:13px;">Annulla</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); if (callback) callback(null); } };
        overlay.querySelector('#clr-cancel').onclick = () => { overlay.remove(); if (callback) callback(null); };
        overlay.querySelectorAll('[data-color]').forEach(el => el.onclick = () => {
            overlay.querySelectorAll('[data-color]').forEach(x => x.style.borderColor = 'transparent');
            el.style.borderColor = '#217346';
            overlay.querySelector('#dlg-color').value = el.dataset.color;
        });
        overlay.querySelector('#clr-ok').onclick = () => {
            const val = overlay.querySelector('#dlg-color').value.trim();
            overlay.remove();
            if (callback) callback(val);
        };
        setTimeout(() => overlay.querySelector('#dlg-color').focus(), 100);
    }

    // ========================================================================
    // BROWSER FUNZIONI
    // ========================================================================

    /** Catalogo completo delle funzioni disponibili */
    const FUNCTION_CATALOG = [
        // --- Matematiche e trigonometria ---
        { name: 'SOMMA', cat: 'Matematiche e trigonometria', args: '(num1; num2; ...)', desc: 'Somma tutti i numeri in un intervallo' },
        { name: 'MEDIA', cat: 'Matematiche e trigonometria', args: '(num1; num2; ...)', desc: 'Calcola la media aritmetica' },
        { name: 'MAX', cat: 'Matematiche e trigonometria', args: '(num1; num2; ...)', desc: 'Restituisce il valore massimo' },
        { name: 'MIN', cat: 'Matematiche e trigonometria', args: '(num1; num2; ...)', desc: 'Restituisce il valore minimo' },
        { name: 'CONTA.NUMERI', cat: 'Matematiche e trigonometria', args: '(val1; val2; ...)', desc: 'Conta le celle con numeri' },
        { name: 'PRODOTTO', cat: 'Matematiche e trigonometria', args: '(num1; num2; ...)', desc: 'Moltiplica tutti i numeri' },
        { name: 'ABS', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'Restituisce il valore assoluto' },
        { name: 'ARROTONDA', cat: 'Matematiche e trigonometria', args: '(num; decimali)', desc: 'Arrotonda un numero' },
        { name: 'ARROTONDA.PER.ECC', cat: 'Matematiche e trigonometria', args: '(num; decimali)', desc: 'Arrotonda per eccesso' },
        { name: 'ARROTONDA.PER.DIF', cat: 'Matematiche e trigonometria', args: '(num; decimali)', desc: 'Arrotonda per difetto' },
        { name: 'INT', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'Arrotonda per difetto all\'intero' },
        { name: 'POTENZA', cat: 'Matematiche e trigonometria', args: '(base; esponente)', desc: 'Eleva a potenza' },
        { name: 'RADQ', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'Radice quadrata' },
        { name: 'RESTO', cat: 'Matematiche e trigonometria', args: '(num; divisore)', desc: 'Resto della divisione' },
        { name: 'PI.GRECO', cat: 'Matematiche e trigonometria', args: '()', desc: 'Restituisce π' },
        { name: 'CASUALE', cat: 'Matematiche e trigonometria', args: '()', desc: 'Numero casuale tra 0 e 1' },
        { name: 'CASUALE.TRA', cat: 'Matematiche e trigonometria', args: '(min; max)', desc: 'Numero casuale in un intervallo' },
        { name: 'SEN', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'Seno (radianti)' },
        { name: 'COS', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'Coseno (radianti)' },
        { name: 'TAN', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'Tangente (radianti)' },
        { name: 'ASEN', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'Arcoseno' },
        { name: 'ACOS', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'Arcotangente' },
        { name: 'ATAN', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'Arcocoseno' },
        { name: 'ATAN2', cat: 'Matematiche e trigonometria', args: '(x; y)', desc: 'Arcocoseno da coordinate' },
        { name: 'GRADI', cat: 'Matematiche e trigonometria', args: '(rad)', desc: 'Converte radianti in gradi' },
        { name: 'RADIANTI', cat: 'Matematiche e trigonometria', args: '(gradi)', desc: 'Converte gradi in radianti' },
        { name: 'LOG', cat: 'Matematiche e trigonometria', args: '(num; base)', desc: 'Logaritmo in base specificata' },
        { name: 'LN', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'Logaritmo naturale' },
        { name: 'EXP', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'e elevato alla potenza' },
        { name: 'LOG10', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'Logaritmo in base 10' },
        { name: 'SEGNO', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'Segno del numero (-1, 0, 1)' },
        { name: 'PARI', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'Arrotonda al pari successivo' },
        { name: 'DISPARI', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'Arrotonda al dispari successivo' },
        { name: 'QUOZIENTE', cat: 'Matematiche e trigonometria', args: '(num; divisore)', desc: 'Parte intera della divisione' },
        { name: 'MCD', cat: 'Matematiche e trigonometria', args: '(num1; num2; ...)', desc: 'Massimo comune divisore' },
        { name: 'MCM', cat: 'Matematiche e trigonometria', args: '(num1; num2; ...)', desc: 'Minimo comune multiplo' },
        { name: 'FATTORIALE', cat: 'Matematiche e trigonometria', args: '(num)', desc: 'Fattoriale di un numero' },
        { name: 'COMBINAZIONE', cat: 'Matematiche e trigonometria', args: '(n; k)', desc: 'Coefficiente binomiale' },
        { name: 'SOMMA.PRODOTTO', cat: 'Matematiche e trigonometria', args: '(range1; range2; ...)', desc: 'Somma dei prodotti degli intervalli' },
        { name: 'SOMMA.Q', cat: 'Matematiche e trigonometria', args: '(num1; num2; ...)', desc: 'Somma dei quadrati' },
        { name: 'ARROT.PER.ECC', cat: 'Matematiche e trigonometria', args: '(num; significato)', desc: 'Arrotonda per eccesso al multiplo' },
        { name: 'ARROT.PER.DIF', cat: 'Matematiche e trigonometria', args: '(num; significato)', desc: 'Arrotonda per difetto al multiplo' },
        { name: 'SEQUENZA', cat: 'Matematiche e trigonometria', args: '(righe; [colonne]; [inizio]; [passo])', desc: 'Genera una sequenza di numeri' },
        { name: 'SOMMA.SE', cat: 'Matematiche e trigonometria', args: '(range; criteri; [somma_range])', desc: 'Somma in base a un criterio' },
        // --- Logiche ---
        { name: 'SE', cat: 'Logiche', args: '(test; se_vero; [se_falso])', desc: 'Restituisce un valore in base a una condizione' },
        { name: 'E', cat: 'Logiche', args: '(logico1; logico2; ...)', desc: 'Restituisce VERO se tutti i valori sono veri' },
        { name: 'O', cat: 'Logiche', args: '(logico1; logico2; ...)', desc: 'Restituisce VERO se almeno un valore è vero' },
        { name: 'NON', cat: 'Logiche', args: '(logico)', desc: 'Inverte il valore logico' },
        { name: 'SE.ERRORE', cat: 'Logiche', args: '(valore; valore_se_errore)', desc: 'Gestisce tutti gli errori' },
        { name: 'ANNULLA.ERRORI', cat: 'Logiche', args: '(valore; valore_se_nd)', desc: 'Gestisce errore #N/D' },
        { name: 'SE.PIU', cat: 'Logiche', args: '(test1; val1; test2; val2; ...)', desc: 'SE con più condizioni' },
        { name: 'SWITCH', cat: 'Logiche', args: '(espressione; val1; risult1; ...)', desc: 'Confronta con più valori' },
        { name: 'SCEGLI', cat: 'Logiche', args: '(indice; val1; val2; ...)', desc: 'Sceglie da un elenco' },
        // --- Testo ---
        { name: 'CONCATENA', cat: 'Testo', args: '(testo1; testo2; ...)', desc: 'Concatena stringhe di testo' },
        { name: 'SINISTRA', cat: 'Testo', args: '(testo; [num_caratteri])', desc: 'Estrae i primi caratteri' },
        { name: 'DESTRA', cat: 'Testo', args: '(testo; [num_caratteri])', desc: 'Estrae gli ultimi caratteri' },
        { name: 'STRINGA.ESTRAI', cat: 'Testo', args: '(testo; inizio; num)', desc: 'Estrae una sotto-stringa' },
        { name: 'LUNGHEZZA', cat: 'Testo', args: '(testo)', desc: 'Restituisce la lunghezza del testo' },
        { name: 'MAIUSC', cat: 'Testo', args: '(testo)', desc: 'Converte in maiuscolo' },
        { name: 'MINUSC', cat: 'Testo', args: '(testo)', desc: 'Converte in minuscolo' },
        { name: 'RIMPIAZZA', cat: 'Testo', args: '(testo; vecchio; nuovo)', desc: 'Sostituisce testo' },
        { name: 'SOSTITUISCI', cat: 'Testo', args: '(testo; inizio; num; nuovo)', desc: 'Sostituisce in posizione' },
        { name: 'ANNULLA.SPAZI', cat: 'Testo', args: '(testo)', desc: 'Rimuove spazi extra' },
        { name: 'TESTO', cat: 'Testo', args: '(valore)', desc: 'Converte in testo' },
        { name: 'VALORE', cat: 'Testo', args: '(testo)', desc: 'Converte testo in numero' },
        { name: 'TROVA', cat: 'Testo', args: '(cercato; testo; [inizio])', desc: 'Trova la posizione di un testo' },
        { name: 'RIPETI', cat: 'Testo', args: '(testo; volte)', desc: 'Ripete il testo' },
        { name: 'CODICE', cat: 'Testo', args: '(testo)', desc: 'Codice ASCII del primo carattere' },
        { name: 'CARATTERE', cat: 'Testo', args: '(codice)', desc: 'Carattere da codice ASCII' },
        { name: 'IDENTICO', cat: 'Testo', args: '(testo1; testo2)', desc: 'Confronta due testi' },
        { name: 'FISSO', cat: 'Testo', args: '(num; decimali)', desc: 'Formatta numero con decimali fissi' },
        { name: 'INIZIALE.MAIUSCOLA', cat: 'Testo', args: '(testo)', desc: 'Maiuscola all\'inizio di ogni parola' },
        { name: 'STRINGA.NUMERO', cat: 'Testo', args: '(testo)', desc: 'Converte testo in numero' },
        // --- Data e ora ---
        { name: 'OGGI', cat: 'Data e ora', args: '()', desc: 'Data odierna' },
        { name: 'ADESSO', cat: 'Data e ora', args: '()', desc: 'Data e ora correnti' },
        { name: 'ANNO', cat: 'Data e ora', args: '(data)', desc: 'Estrae l\'anno' },
        { name: 'MESE', cat: 'Data e ora', args: '(data)', desc: 'Estrae il mese' },
        { name: 'GIORNO', cat: 'Data e ora', args: '(data)', desc: 'Estrae il giorno' },
        { name: 'ORA', cat: 'Data e ora', args: '(data)', desc: 'Estrae l\'ora' },
        { name: 'MINUTO', cat: 'Data e ora', args: '(data)', desc: 'Estrae il minuto' },
        { name: 'SECONDO', cat: 'Data e ora', args: '(data)', desc: 'Estrae il secondo' },
        { name: 'GIORNO.SETTIMANA', cat: 'Data e ora', args: '(data)', desc: 'Giorno della settimana' },
        { name: 'NUM.SETTIMANA', cat: 'Data e ora', args: '(data)', desc: 'Numero della settimana' },
        { name: 'DATA', cat: 'Data e ora', args: '(anno; mese; giorno)', desc: 'Crea una data' },
        { name: 'DATA.DIFFERENZA', cat: 'Data e ora', args: '(data1; data2; unità)', desc: 'Differenza tra date' },
        { name: 'FINE.MESE', cat: 'Data e ora', args: '(data; mesi)', desc: 'Ultimo giorno del mese' },
        // --- Ricerca e riferimento ---
        { name: 'CERCA.VERT', cat: 'Ricerca e riferimento', args: '(valore; range; col; [esatto])', desc: 'Cerca verticalmente' },
        { name: 'CERCA.ORIZZ', cat: 'Ricerca e riferimento', args: '(valore; range; riga)', desc: 'Cerca orizzontalmente' },
        { name: 'INDICE', cat: 'Ricerca e riferimento', args: '(range; riga; [colonna])', desc: 'Restituisce il valore in posizione' },
        { name: 'CONFRONTA', cat: 'Ricerca e riferimento', args: '(valore; range; [tipo])', desc: 'Trova posizione in un intervallo' },
        { name: 'RIGA', cat: 'Ricerca e riferimento', args: '([riferimento])', desc: 'Numero di riga di un riferimento' },
        { name: 'COLONNA', cat: 'Ricerca e riferimento', args: '([riferimento])', desc: 'Numero di colonna di un riferimento' },
        { name: 'RIGHE', cat: 'Ricerca e riferimento', args: '(range)', desc: 'Numero di righe in un intervallo' },
        { name: 'COLONNE', cat: 'Ricerca e riferimento', args: '(range)', desc: 'Numero di colonne in un intervallo' },
        { name: 'SCARTO', cat: 'Ricerca e riferimento', args: '(rif; righe; colonne; [alt]; [larg])', desc: 'Restituisce un riferimento offset' },
        { name: 'INDIRETTO', cat: 'Ricerca e riferimento', args: '(testo_rif; [a1])', desc: 'Riferimento da testo' },
        { name: 'COLLEGAMENTO.IPERTESTUALE', cat: 'Ricerca e riferimento', args: '(link; [testo])', desc: 'Crea un collegamento ipertestuale' },
        { name: 'MATR.TRASPOSTA', cat: 'Ricerca e riferimento', args: '(range)', desc: 'Traspone un intervallo' },
        { name: 'UNIQUE', cat: 'Ricerca e riferimento', args: '(range)', desc: 'Restituisce valori unici' },
        // --- Statistiche ---
        { name: 'CONTA.VALORI', cat: 'Altre', args: '(val1; val2; ...)', desc: 'Conta celle non vuote' },
        { name: 'CONTA.VUOTE', cat: 'Altre', args: '(range)', desc: 'Conta celle vuote' },
        { name: 'CONTA.SE', cat: 'Altre', args: '(range; criteri)', desc: 'Conta in base a un criterio' },
        { name: 'MEDIA.SE', cat: 'Altre', args: '(range; criteri; [media_range])', desc: 'Media in base a un criterio' },
        { name: 'MEDIANA', cat: 'Altre', args: '(num1; num2; ...)', desc: 'Mediana di un insieme di numeri' },
        { name: 'MODA', cat: 'Altre', args: '(num1; num2; ...)', desc: 'Moda di un insieme di numeri' },
        { name: 'DEV.ST', cat: 'Altre', args: '(num1; num2; ...)', desc: 'Deviazione standard campionaria' },
        { name: 'VAR', cat: 'Altre', args: '(num1; num2; ...)', desc: 'Varianza campionaria' },
        { name: 'GRANDE', cat: 'Altre', args: '(range; k)', desc: 'K-esimo valore più grande' },
        { name: 'PICCOLO', cat: 'Altre', args: '(range; k)', desc: 'K-esimo valore più piccolo' },
        { name: 'RANGO', cat: 'Altre', args: '(val; range)', desc: 'Posizione in graduatoria' },
        { name: 'PERCENTILE', cat: 'Altre', args: '(range; k)', desc: 'Percentile di un insieme' },
        // --- Informazione ---
        { name: 'VAL.NUMERO', cat: 'Altre', args: '(valore)', desc: 'VERO se è un numero' },
        { name: 'VAL.TESTO', cat: 'Altre', args: '(valore)', desc: 'VERO se è testo' },
        { name: 'VAL.VUOTO', cat: 'Altre', args: '(valore)', desc: 'VERO se è vuoto' },
        { name: 'VAL.ERRORE', cat: 'Altre', args: '(valore)', desc: 'VERO se è un errore' },
        { name: 'VAL.LOGICO', cat: 'Altre', args: '(valore)', desc: 'VERO se è logico' },
        { name: 'N', cat: 'Altre', args: '(valore)', desc: 'Converte in numero' },
        { name: 'TIPO', cat: 'Altre', args: '(valore)', desc: 'Tipo di dato' },
        // --- Finanziarie ---
        { name: 'RATA', cat: 'Finanziarie', args: '(tasso; periodi; va; [vf]; [tipo])', desc: 'Rate di un prestito' },
        { name: 'VA', cat: 'Finanziarie', args: '(tasso; periodi; rata; [vf]; [tipo])', desc: 'Valore attuale' },
        { name: 'VF', cat: 'Finanziarie', args: '(tasso; periodi; rata; [va]; [tipo])', desc: 'Valore futuro' },
        { name: 'INTERESSI', cat: 'Finanziarie', args: '(tasso; per; periodi; va)', desc: 'Interessi di un pagamento' },
        { name: 'P.RATA', cat: 'Finanziarie', args: '(tasso; per; periodi; va)', desc: 'Quota capitale di un pagamento' },
        { name: 'NPER', cat: 'Finanziarie', args: '(tasso; rata; va)', desc: 'Numero di periodi' },
        { name: 'TASSO', cat: 'Finanziarie', args: '(periodi; rata; va)', desc: 'Tasso di interesse' },
        // --- Aggiunte: multi-criterio ---
        { name: 'SOMMA.PIÙ.SE', cat: 'Matematiche e trigonometria', args: '(somma_range; range1; crit1; ...)', desc: 'Somma con più criteri' },
        { name: 'CONTA.PIÙ.SE', cat: 'Altre', args: '(range1; crit1; ...)', desc: 'Conta con più criteri' },
        { name: 'MEDIA.PIÙ.SE', cat: 'Altre', args: '(media_range; range1; crit1; ...)', desc: 'Media con più criteri' },
        { name: 'MAX.PIÙ.SE', cat: 'Altre', args: '(max_range; range1; crit1; ...)', desc: 'Massimo con più criteri' },
        { name: 'MIN.PIÙ.SE', cat: 'Altre', args: '(min_range; range1; crit1; ...)', desc: 'Minimo con più criteri' },
        { name: 'SUBTOTALE', cat: 'Matematiche e trigonometria', args: '(num_funzione; range)', desc: 'Subtotale (somma, media, conta...)' },
        // --- Aggiunte: testo ---
        { name: 'RICERCA', cat: 'Testo', args: '(cercato; testo; [inizio])', desc: 'Trova posizione (non distingue maiuscole)' },
        { name: 'TESTO.UNISCI', cat: 'Testo', args: '(delim; ignora_vuoti; testo1; ...)', desc: 'Unisce testi con delimitatore' },
        { name: 'LIBERA', cat: 'Testo', args: '(testo)', desc: 'Rimuove caratteri non stampabili' },
        { name: 'VALUTA', cat: 'Testo', args: '(num; [decimali])', desc: 'Formatta come valuta' },
        { name: 'T', cat: 'Testo', args: '(valore)', desc: 'Restituisce il testo se è testo' },
        // --- Aggiunte: matematiche ---
        { name: 'TRONCA', cat: 'Matematiche e trigonometria', args: '(num; [decimali])', desc: 'Tronca a interi/decimali' },
        { name: 'ARROTONDA.MULTIPLO', cat: 'Matematiche e trigonometria', args: '(num; multiplo)', desc: 'Arrotonda al multiplo' },
        { name: 'MEDIA.GEOMETRICA', cat: 'Altre', args: '(num1; num2; ...)', desc: 'Media geometrica' },
        // --- Aggiunte: statistiche ---
        { name: 'DEV.ST.POP', cat: 'Altre', args: '(num1; num2; ...)', desc: 'Deviazione standard di popolazione' },
        { name: 'VAR.POP', cat: 'Altre', args: '(num1; num2; ...)', desc: 'Varianza di popolazione' },
        { name: 'QUARTILE', cat: 'Altre', args: '(range; quarto)', desc: 'Quartile (0-4)' },
        // --- Aggiunte: informazione ---
        { name: 'VAL.PARI', cat: 'Altre', args: '(num)', desc: 'VERO se il numero è pari' },
        { name: 'VAL.DISPARI', cat: 'Altre', args: '(num)', desc: 'VERO se il numero è dispari' },
        { name: 'VAL.NON.DISP', cat: 'Altre', args: '(valore)', desc: 'VERO se è errore #N/D' },
        { name: 'NON.DISP', cat: 'Altre', args: '()', desc: 'Restituisce l\'errore #N/D' },
        // --- Aggiunte: data ---
        { name: 'ORARIO', cat: 'Data e ora', args: '(ore; minuti; secondi)', desc: 'Crea un orario' },
        { name: 'DATA.VALORE', cat: 'Data e ora', args: '(testo_data)', desc: 'Converte testo in numero seriale data' },
        { name: 'GIORNI', cat: 'Data e ora', args: '(data_fine; data_inizio)', desc: 'Giorni tra due date' },
        { name: 'GIORNO.LAVORATIVO', cat: 'Data e ora', args: '(data; giorni)', desc: 'Data dopo N giorni lavorativi' },
        { name: 'GIORNI.LAVORATIVI.TOT', cat: 'Data e ora', args: '(inizio; fine)', desc: 'Giorni lavorativi tra due date' },
        // --- Aggiunte: ricerca ---
        { name: 'CERCA.X', cat: 'Ricerca e riferimento', args: '(cercato; range_ric; range_ris; [se_assente])', desc: 'Ricerca moderna (XLOOKUP)' },
        { name: 'CERCA', cat: 'Ricerca e riferimento', args: '(cercato; range_ric; [range_ris])', desc: 'Ricerca semplice' },
    ];

    // Preset margini in cm {top,bottom,left,right}
    const MARGIN_PRESETS = {
        normale: { top: 2.54, bottom: 2.54, left: 1.91, right: 1.91 },
        largo:   { top: 2.54, bottom: 2.54, left: 3.18, right: 3.18 },
        stretto: { top: 1.91, bottom: 1.91, left: 0.64, right: 0.64 }
    };

    /** Restituisce i margini attivi in cm (preset o personalizzati) */
    function getActiveMargins() {
        const id = localStorage.getItem('excel_margins') || 'normale';
        if (id === 'personalizzati') {
            try { const c = JSON.parse(localStorage.getItem('excel_margins_custom')); if (c) return c; } catch (e) {}
            return MARGIN_PRESETS.normale;
        }
        return MARGIN_PRESETS[id] || MARGIN_PRESETS.normale;
    }

    /** Dialog Orientamento con anteprime visive Verticale/Orizzontale */
    function showOrientationDialog() {
        const ss = window.spreadsheet;
        if (!ss) return;
        const current = localStorage.getItem('excel_orientation') || 'verticale';
        const overlay = document.createElement('div');
        overlay.id = 'orientation-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';
        // Anteprime: foglio con qualche "riga" di testo simulata
        const sheetLines = '<div style="height:2px;background:#bbb;margin:3px 6px;border-radius:1px;"></div>'.repeat(4);
        const card = (id, label, w, h) => `<div class="or-card" data-or="${id}" style="cursor:pointer;border:2px solid ${current===id?'#217346':'#ddd'};background:${current===id?'#e8f5e9':'#fff'};border-radius:8px;padding:16px;display:flex;flex-direction:column;align-items:center;gap:10px;width:130px;">
            <div style="width:${w}px;height:${h}px;background:#fff;border:1px solid #999;box-shadow:0 1px 4px rgba(0,0,0,0.15);padding-top:6px;">${sheetLines}</div>
            <div style="font-size:13px;font-weight:600;color:#333;">${label}</div>
        </div>`;
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:22px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <h3 style="margin:0 0 16px;font-size:15px;text-align:center;">Orientamento pagina</h3>
            <div style="display:flex;gap:16px;">
                ${card('verticale','Verticale',64,86)}
                ${card('orizzontale','Orizzontale',86,64)}
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:18px;gap:8px;">
                <button id="or-cancel" style="padding:6px 16px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="or-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        let chosen = current;
        overlay.querySelectorAll('.or-card').forEach(c => c.onclick = () => {
            chosen = c.dataset.or;
            overlay.querySelectorAll('.or-card').forEach(x => { x.style.borderColor = '#ddd'; x.style.background = '#fff'; });
            c.style.borderColor = '#217346'; c.style.background = '#e8f5e9';
        });
        overlay.querySelector('#or-cancel').onclick = () => overlay.remove();
        overlay.querySelector('#or-ok').onclick = () => {
            localStorage.setItem('excel_orientation', chosen);
            ss.updateStatus('Orientamento: ' + (chosen === 'verticale' ? 'Verticale' : 'Orizzontale'));
            overlay.remove();
        };
    }

    /** Disegna un indicatore tratteggiato sopra l'area di stampa nel foglio */
    function drawPrintAreaIndicator() {
        const ss = window.spreadsheet;
        const grid = document.getElementById('spreadsheet');
        if (!ss || !grid || !ss._printArea) return;
        const old = document.getElementById('print-area-indicator');
        if (old) old.remove();
        const parts = String(ss._printArea).split(':');
        const a = ss.getCellCoordinates(parts[0]);
        const b = parts[1] ? ss.getCellCoordinates(parts[1]) : a;
        if (!a || !b) return;
        const r1 = Math.min(a.row, b.row), r2 = Math.max(a.row, b.row);
        const c1 = Math.min(a.col, b.col), c2 = Math.max(a.col, b.col);
        const left = ss.getColLeft(c1), top = ss.getRowTop(r1);
        let width = 0, height = 0;
        for (let c = c1; c <= c2; c++) width += ss.getColWidth(c);
        for (let r = r1; r <= r2; r++) height += ss.getRowHeight(r);
        const ind = document.createElement('div');
        ind.id = 'print-area-indicator';
        ind.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;border:2px dashed #217346;pointer-events:none;z-index:3;box-sizing:border-box;`;
        grid.appendChild(ind);
    }

    /** Dialog Margini: preset Normale/Largo/Stretto + Personalizzati con 4 campi */
    function showMarginsDialog() {
        const ss = window.spreadsheet;
        if (!ss) return;
        const current = localStorage.getItem('excel_margins') || 'normale';
        let custom = MARGIN_PRESETS.normale;
        try { const c = JSON.parse(localStorage.getItem('excel_margins_custom')); if (c) custom = c; } catch (e) {}
        const overlay = document.createElement('div');
        overlay.id = 'margins-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:10000;';
        const presetRow = (id, label, desc) => `<label style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border:1px solid ${current===id?'#217346':'#ddd'};background:${current===id?'#e8f5e9':'#fff'};border-radius:4px;margin-bottom:4px;cursor:pointer;">
            <input type="radio" name="mg-preset" value="${id}" ${current===id?'checked':''} style="margin-top:2px;">
            <span><span style="font-weight:600;font-size:13px;">${label}</span><br><span style="font-size:10px;color:#888;">${desc}</span></span>
        </label>`;
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <h3 style="margin:0 0 14px;font-size:15px;">Margini pagina</h3>
            <div style="display:flex;flex-direction:column;gap:0;">
                ${presetRow('normale','Normale','Sup/Inf: 2,54 cm · Sin/Des: 1,91 cm')}
                ${presetRow('largo','Largo','Sup/Inf: 2,54 cm · Sin/Des: 3,18 cm')}
                ${presetRow('stretto','Stretto','Sup/Inf: 1,91 cm · Sin/Des: 0,64 cm')}
                ${presetRow('personalizzati','Personalizzati','Imposta i margini manualmente (cm)')}
            </div>
            <div id="mg-custom" style="display:${current==='personalizzati'?'grid':'none'};grid-template-columns:1fr 1fr;gap:8px;margin:10px 0 4px;padding:10px;background:#f7f7f7;border-radius:4px;">
                <label style="font-size:12px;">Superiore<input id="mg-top" type="number" step="0.1" min="0" value="${custom.top}" style="width:100%;padding:5px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;"></label>
                <label style="font-size:12px;">Inferiore<input id="mg-bottom" type="number" step="0.1" min="0" value="${custom.bottom}" style="width:100%;padding:5px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;"></label>
                <label style="font-size:12px;">Sinistro<input id="mg-left" type="number" step="0.1" min="0" value="${custom.left}" style="width:100%;padding:5px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;"></label>
                <label style="font-size:12px;">Destro<input id="mg-right" type="number" step="0.1" min="0" value="${custom.right}" style="width:100%;padding:5px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;"></label>
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:12px;gap:8px;">
                <button id="mg-cancel" style="padding:6px 16px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="mg-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('#mg-cancel').onclick = () => overlay.remove();
        overlay.querySelectorAll('input[name="mg-preset"]').forEach(r => r.onchange = () => {
            overlay.querySelector('#mg-custom').style.display = overlay.querySelector('input[name="mg-preset"]:checked').value === 'personalizzati' ? 'grid' : 'none';
        });
        overlay.querySelector('#mg-ok').onclick = () => {
            const sel = overlay.querySelector('input[name="mg-preset"]:checked').value;
            localStorage.setItem('excel_margins', sel);
            if (sel === 'personalizzati') {
                const c = {
                    top: parseFloat(overlay.querySelector('#mg-top').value) || 0,
                    bottom: parseFloat(overlay.querySelector('#mg-bottom').value) || 0,
                    left: parseFloat(overlay.querySelector('#mg-left').value) || 0,
                    right: parseFloat(overlay.querySelector('#mg-right').value) || 0
                };
                localStorage.setItem('excel_margins_custom', JSON.stringify(c));
                ss.updateStatus(`Margini personalizzati: ${c.top}/${c.bottom}/${c.left}/${c.right} cm`);
            } else {
                ss.updateStatus('Margini: ' + sel.charAt(0).toUpperCase() + sel.slice(1));
            }
            overlay.remove();
        };
    }

    /** Name Manager: elenco, aggiunta, modifica, eliminazione, navigazione dei nomi definiti */
    function showNameManager() {
        const ss = window.spreadsheet;
        if (!ss) return;
        if (!ss._namedRanges) ss._namedRanges = {};
        const overlay = document.createElement('div');
        overlay.id = 'name-manager-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        const render = () => {
            const names = Object.keys(ss._namedRanges);
            overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:480px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h3 style="margin:0;font-size:16px;">Gestione nomi</h3>
                    <button id="nm-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
                </div>
                <div style="border:1px solid #ddd;border-radius:4px;max-height:240px;overflow-y:auto;margin-bottom:12px;">
                    <div style="display:flex;font-size:11px;font-weight:bold;background:#f3f3f3;padding:6px 10px;border-bottom:1px solid #ddd;"><span style="flex:1;">Nome</span><span style="flex:1;">Riferimento</span><span style="width:120px;text-align:right;">Azioni</span></div>
                    ${names.length ? names.map(n => `<div style="display:flex;align-items:center;font-size:13px;padding:6px 10px;border-bottom:1px solid #f0f0f0;">
                        <span style="flex:1;font-weight:600;color:#217346;">${n}</span>
                        <span style="flex:1;color:#555;">${ss._namedRanges[n]}</span>
                        <span style="width:120px;text-align:right;">
                            <button class="nm-goto" data-n="${n}" title="Vai" style="border:none;background:#eef;border-radius:3px;cursor:pointer;padding:2px 7px;margin-left:3px;">↗</button>
                            <button class="nm-edit" data-n="${n}" title="Modifica" style="border:none;background:#efe;border-radius:3px;cursor:pointer;padding:2px 7px;margin-left:3px;">✎</button>
                            <button class="nm-del" data-n="${n}" title="Elimina" style="border:none;background:#fee;border-radius:3px;cursor:pointer;padding:2px 7px;margin-left:3px;">🗑</button>
                        </span>
                    </div>`).join('') : '<div style="padding:16px;text-align:center;color:#999;">Nessun nome definito</div>'}
                </div>
                <div style="display:flex;gap:6px;align-items:center;border-top:1px solid #eee;padding-top:12px;">
                    <input id="nm-name" placeholder="Nome" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px;">
                    <input id="nm-ref" placeholder="Riferimento (es. A1:A10)" value="${ss.selectedRange && ss.selectedRange.start !== ss.selectedRange.end ? ss.selectedRange.start + ':' + ss.selectedRange.end : (ss.selectedCell || '')}" style="flex:1.4;padding:6px;border:1px solid #ccc;border-radius:4px;">
                    <button id="nm-add" style="padding:6px 14px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">Aggiungi</button>
                </div>
            </div>`;
            overlay.querySelector('#nm-close').onclick = () => overlay.remove();
            overlay.querySelector('#nm-add').onclick = () => {
                const nm = overlay.querySelector('#nm-name').value.trim();
                const rf = overlay.querySelector('#nm-ref').value.trim().toUpperCase();
                if (!nm || !rf) { ss.updateStatus('Inserisci nome e riferimento'); return; }
                if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(nm)) { ss.updateStatus('Nome non valido (lettere, cifre, _ )'); return; }
                ss._namedRanges[nm.toUpperCase()] = rf;
                ss.setModified(true); ss.recalculate(); render();
                ss.updateStatus('Nome "' + nm + '" definito');
            };
            overlay.querySelectorAll('.nm-del').forEach(b => b.onclick = () => { delete ss._namedRanges[b.dataset.n]; ss.recalculate(); render(); ss.updateStatus('Nome eliminato'); });
            overlay.querySelectorAll('.nm-goto').forEach(b => b.onclick = () => { const ref = ss._namedRanges[b.dataset.n].split(':')[0]; ss.selectCell(ref); overlay.remove(); });
            overlay.querySelectorAll('.nm-edit').forEach(b => b.onclick = () => {
                overlay.querySelector('#nm-name').value = b.dataset.n;
                overlay.querySelector('#nm-ref').value = ss._namedRanges[b.dataset.n];
            });
        };
        render();
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    /** Crea nomi definiti dalle etichette della riga superiore e/o colonna sinistra della selezione */
    function showCreateNamesDialog() {
        const ss = window.spreadsheet;
        if (!ss || !ss.selectedRange) return;
        const a = ss.getCellCoordinates(ss.selectedRange.start);
        const b = ss.getCellCoordinates(ss.selectedRange.end);
        const r1 = Math.min(a.row, b.row), r2 = Math.max(a.row, b.row);
        const c1 = Math.min(a.col, b.col), c2 = Math.max(a.col, b.col);
        if (r1 === r2 && c1 === c2) { ss.updateStatus('Seleziona un intervallo con etichette'); return; }
        const sanitize = (s) => String(s).trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
        const overlay = document.createElement('div');
        overlay.id = 'create-names-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Crea nomi dalla selezione</h3>
                <button id="cn-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <p style="font-size:12px;color:#666;margin:0 0 12px;">Crea i nomi usando le etichette in:</p>
            <label style="display:flex;align-items:center;margin-bottom:8px;cursor:pointer;"><input type="checkbox" id="cn-top" checked style="margin-right:8px;"> Riga superiore</label>
            <label style="display:flex;align-items:center;margin-bottom:16px;cursor:pointer;"><input type="checkbox" id="cn-left" style="margin-right:8px;"> Colonna sinistra</label>
            <div style="text-align:right;">
                <button id="cn-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="cn-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('#cn-close').onclick = close;
        overlay.querySelector('#cn-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('#cn-ok').onclick = () => {
            if (!ss._namedRanges) ss._namedRanges = {};
            let created = 0;
            const useTop = overlay.querySelector('#cn-top').checked;
            const useLeft = overlay.querySelector('#cn-left').checked;
            const L = (c) => ss.numberToColumn(c);
            if (useTop && r1 < r2) {
                // Etichette nella riga superiore: un nome per colonna, dati nelle righe sottostanti
                for (let c = c1; c <= c2; c++) {
                    if (useLeft && c === c1) continue; // angolo: colonna delle etichette di riga
                    const label = sanitize(ss.getCellValue(L(c) + (r1 + 1)));
                    if (!label) continue;
                    ss._namedRanges[label.toUpperCase()] = `${L(c)}${r1 + 2}:${L(c)}${r2 + 1}`;
                    created++;
                }
            }
            if (useLeft && c1 < c2) {
                // Etichette nella colonna sinistra: un nome per riga, dati nelle colonne a destra
                for (let r = r1; r <= r2; r++) {
                    if (useTop && r === r1) continue; // angolo: riga delle etichette di colonna
                    const label = sanitize(ss.getCellValue(L(c1) + (r + 1)));
                    if (!label) continue;
                    ss._namedRanges[label.toUpperCase()] = `${L(c1 + 1)}${r + 1}:${L(c2)}${r + 1}`;
                    created++;
                }
            }
            ss.recalculate(); ss.setModified(true);
            ss.updateStatus(`${created} nomi creati dalla selezione`);
            close();
        };
    }

    /** Opzioni di calcolo: Automatico / Manuale (onorato dal motore via ss._autoCalc) */
    function showCalcOptionsDialog() {
        const ss = window.spreadsheet;
        if (!ss) return;
        const isManual = ss._autoCalc === false;
        const overlay = document.createElement('div');
        overlay.id = 'calc-options-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:8px;padding:20px;min-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;font-size:16px;">Opzioni di calcolo</h3>
                <button id="co-close" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <label style="display:flex;align-items:center;margin-bottom:8px;cursor:pointer;"><input type="radio" name="co-mode" value="auto" ${isManual ? '' : 'checked'} style="margin-right:8px;"> Automatico</label>
            <label style="display:flex;align-items:center;margin-bottom:16px;cursor:pointer;"><input type="radio" name="co-mode" value="manual" ${isManual ? 'checked' : ''} style="margin-right:8px;"> Manuale (ricalcola con "Calcola adesso" o F9)</label>
            <div style="text-align:right;">
                <button id="co-cancel" style="padding:6px 16px;margin-right:8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;">Annulla</button>
                <button id="co-ok" style="padding:6px 16px;background:#217346;color:#fff;border:none;border-radius:4px;cursor:pointer;">OK</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('#co-close').onclick = close;
        overlay.querySelector('#co-cancel').onclick = close;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.querySelector('#co-ok').onclick = () => {
            const mode = overlay.querySelector('input[name="co-mode"]:checked').value;
            ss._autoCalc = (mode === 'auto');
            if (ss._autoCalc) ss.recalculate();
            ss.updateStatus(ss._autoCalc ? 'Calcolo automatico' : 'Calcolo manuale');
            close();
        };
    }

    /** Mostra browser funzioni con ricerca e inserimento */
    function showFunctionBrowser(category) {
        const ss = window.spreadsheet;
        if (!ss) return;

        // Raccogli funzioni recenti da localStorage
        let recentFns = [];
        try {
            recentFns = JSON.parse(localStorage.getItem('excel_recent_functions') || '[]');
        } catch(e) {}

        const overlay = document.createElement('div');
        overlay.id = 'fn-browser-modal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:10000;';

        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:8px;padding:20px;min-width:520px;max-width:600px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.25);';

        // Filtra funzioni per categoria
        let filtered = FUNCTION_CATALOG;
        if (category === 'Recenti') {
            filtered = FUNCTION_CATALOG.filter(f => recentFns.includes(f.name));
            if (filtered.length === 0) filtered = FUNCTION_CATALOG.slice(0, 10);
        } else if (category !== 'Tutte') {
            filtered = FUNCTION_CATALOG.filter(f => f.cat === category);
        }

        const catNames = ['Tutte', 'Recenti', 'Matematiche e trigonometria', 'Logiche', 'Testo', 'Data e ora', 'Ricerca e riferimento', 'Finanziarie', 'Altre'];

        dialog.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <strong style="font-size:15px;">Inserisci funzione</strong>
                <button style="border:none;background:none;font-size:18px;cursor:pointer;color:#999;" onclick="this.closest('#fn-browser-modal').remove()">✕</button>
            </div>
            <div style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;">
                ${catNames.map(c => `<span class="fn-cat-tag" data-cat="${c}" style="padding:3px 10px;border-radius:12px;font-size:11px;cursor:pointer;${c === category ? 'background:#217346;color:#fff;font-weight:600;' : 'background:#f0f0f0;color:#555;'}">${c === 'Tutte' ? 'Tutte' : c.split(' ')[0]}</span>`).join('')}
            </div>
            <div style="margin-bottom:10px;">
                <input id="fn-search" type="text" style="width:100%;padding:7px 10px;border:1px solid #ccc;border-radius:4px;font-size:12px;box-sizing:border-box;" placeholder="Cerca funzione...">
            </div>
            <div id="fn-list" style="flex:1;overflow-y:auto;border:1px solid #eee;border-radius:4px;min-height:180px;">
                ${filtered.map(f => `
                    <div class="fn-item" data-fn="${f.name}" data-args="${f.args}" style="display:flex;align-items:center;padding:6px 10px;border-bottom:1px solid #f5f5f5;cursor:pointer;transition:background 0.1s;">
                        <span style="font-weight:600;font-size:12px;color:#217346;width:140px;flex-shrink:0;">${f.name}</span>
                        <span style="font-size:10px;color:#888;width:80px;flex-shrink:0;">${f.cat.split(' ')[0]}</span>
                        <span style="font-size:11px;color:#555;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.desc}</span>
                        <span style="font-size:10px;color:#aaa;margin-left:4px;flex-shrink:0;">${f.args}</span>
                    </div>
                `).join('')}
            </div>
            <div id="fn-preview" style="margin-top:8px;padding:6px 10px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:4px;font-size:11px;color:#888;min-height:20px;">
                Seleziona una funzione per vedere i dettagli
            </div>
            <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end;">
                <button id="fn-cancel" style="padding:6px 16px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:12px;">Annulla</button>
                <button id="fn-insert" style="padding:6px 16px;border:none;background:#217346;color:#fff;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">Inserisci</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        let selectedFn = null;
        const list = dialog.querySelector('#fn-list');

        // Click su funzione
        list.addEventListener('click', (e) => {
            const item = e.target.closest('.fn-item');
            if (!item) return;
            list.querySelectorAll('.fn-item').forEach(i => i.style.background = '');
            item.style.background = '#e8f5e9';
            selectedFn = { name: item.dataset.fn, args: item.dataset.args };
            dialog.querySelector('#fn-preview').innerHTML = `<strong style="color:#217346;">=${selectedFn.name}${selectedFn.args}</strong> — ${item.querySelector('span:last-child').textContent}`;
        });

        // Doppio click inserisce direttamente
        list.addEventListener('dblclick', (e) => {
            const item = e.target.closest('.fn-item');
            if (item) { selectedFn = { name: item.dataset.fn, args: item.dataset.args }; insertFn(); }
        });

        // Filtro in tempo reale
        dialog.querySelector('#fn-search').addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            const items = list.querySelectorAll('.fn-item');
            items.forEach(item => {
                const name = item.dataset.fn.toLowerCase();
                item.style.display = (!q || name.includes(q)) ? '' : 'none';
            });
            // Update count
            const visible = list.querySelectorAll('.fn-item[style*="display: none"]');
            const total = items.length - visible.length;
            dialog.querySelector('#fn-preview').textContent = total + ' funzion' + (total === 1 ? 'e trovata' : 'i trovate');
        });

        // Categorie
        dialog.querySelectorAll('.fn-cat-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                overlay.remove();
                showFunctionBrowser(tag.dataset.cat);
            });
        });

        function insertFn() {
            if (!selectedFn) {
                const first = list.querySelector('.fn-item');
                if (first) selectedFn = { name: first.dataset.fn, args: first.dataset.args };
            }
            if (!selectedFn) return;
            // Salva nei recenti
            if (!recentFns.includes(selectedFn.name)) {
                recentFns.unshift(selectedFn.name);
                if (recentFns.length > 15) recentFns.pop();
                try { localStorage.setItem('excel_recent_functions', JSON.stringify(recentFns)); } catch(e) {}
            }
            const formula = '=' + selectedFn.name + '(';
            ss.editCell(ss.selectedCell, formula);
            // Posiziona cursore DOPO la parentesi aperta
            setTimeout(() => {
                const input = document.getElementById('formula-input');
                if (input) {
                    const cursorPos = formula.length;
                    input.setSelectionRange(cursorPos, cursorPos);
                    input.focus();
                }
            }, 50);
            ss.updateStatus('Funzione ' + selectedFn.name + ' inserita');
            overlay.remove();
        }

        dialog.querySelector('#fn-cancel').onclick = () => overlay.remove();
        dialog.querySelector('#fn-insert').onclick = insertFn;

        setTimeout(() => dialog.querySelector('#fn-search').focus(), 100);
    }

    // ========================================================================
    // GESTIONE EVENTI AGGIUNTIVI
    // ========================================================================

    // Previeni la perdita di selezione durante il click sui bottoni ribbon
    // Deseleziona gli oggetti grafici cliccando fuori
    document.addEventListener('mousedown', (e) => {
        const btn = e.target.closest('.ribbon-button, .ribbon-combo, .menu-item');
        if (btn) {
            // Non fare nulla, lascia che l'evento passi
        }
        // Se click fuori da un drawing-object, rimuovi resize handle
        if (!e.target.closest('.drawing-object') && !e.target.closest('.drawing-context-menu')) {
            document.querySelectorAll('.drawing-object').forEach(d => {
                d.style.outline = '';
                d.style.outlineOffset = '';
            });
            document.querySelectorAll('.resize-handle').forEach(h => h.remove());
        }
    }, true);

    // ========================================================================
    // AVVIO
    // ========================================================================

    // Inizializza al caricamento del DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRibbon);
    } else {
        initRibbon();
    }

    // Esponi funzioni drawing per accesso da altri script (es. spreadsheet.js restoreDrawingObjects)
    window.makeDraggableWithContext = makeDraggableWithContext;
    window.makeDraggable = makeDraggable;
    window.showDrawingContextMenu = showDrawingContextMenu;
    window.insertDrawingObject = insertDrawingObject;
    // Esponi anche le altre funzioni utili pubblicamente
    window.insertImage = insertImage;
    window.insertTextBox = insertTextBox;
    window.insertWordArt = insertWordArt;
    window.insertShape = insertShape;
    window.showChartDialog = showChartDialog;
    window.showRecommendedCharts = showRecommendedCharts;
    window.openInPowerBI = openInPowerBI;
    window.createDirectChart = createDirectChart;
    window.createSimpleChart = createSimpleChart;
    window.showShapePicker = showShapePicker;
    window.showSmartArtPicker = showSmartArtPicker;
    window.insertSmartArt = insertSmartArt;
    window.editSmartArtTexts = editSmartArtTexts;
    window.selectAllCells = selectAllCells;
    window.showIconPicker = showIconPicker;
    window.insertIcon = insertIcon;
    window.OLE_APPS = OLE_APPS;
    window.openAppForEmbed = openAppForEmbed;

})();
