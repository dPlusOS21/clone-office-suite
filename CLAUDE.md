# CLAUDE.md — Clone Office Suite

Guida per chi (Claude) lavora su questo repository. Tienila aggiornata quando
cambiano struttura, convenzioni o flussi importanti.

## Cos'è
Suite web che clona 8 app Microsoft Office + un backend PHP/SQLite condiviso:
Word, Excel, PowerPoint, OneNote, Outlook, OneDrive, Power BI, Access.
Ogni app è essenzialmente un grande file HTML + JS (vanilla, nessun framework).

## Principi di lavoro (richiesti dall'utente)
- **Rispondi sempre in italiano.**
- **Fedeltà alla versione originale online**: comportamenti e grafica devono
  somigliare il più possibile all'app Microsoft reale.
- **Verifica con risultati VISIBILI**: non dire "fatto" senza prova. Per il
  browser si usa `php -S` + `puppeteer-core` (vedi *Test*).
- **Esegui SEMPRE la suite `clone-tests` prima di `git push`.**
- Ricorda all'utente **Ctrl+Shift+R** (ricarica senza cache) dopo modifiche JS/CSS.
- Commit/push solo quando l'utente lo chiede. Messaggi commit in italiano, e
  termina con la riga `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Struttura
```
index.html              Hub di avvio (launcher app)
buy.html                Pagina acquisto (email PayPal)
<app>-clone/index.html  Ogni app; alcune hanno js/ e css/ dedicati
<app>-clone/guida.html  Guida utente per ogni app
js/auth.js              Auth condivisa (CloneOfficeAuth) + helper demo
backend/                api.php (auth/admin/licenze/sessioni/feedback),
                        config.php (PDO SQLite, initDatabase), admin-dashboard.php
data/                   DB e file utente — NON in git (creati al primo avvio)
clone-tests/            SOLO test (vedi sotto). node_modules in .gitignore
```

## Backend / Auth
- `backend/config.php`: `initDatabase()` crea le tabelle con `CREATE TABLE IF NOT
  EXISTS` e `data/` con `mkdir` → **installazione ex novo automatica**.
- **Il primo utente registrato diventa admin** (`api.php`: `$role = $userCount==0 ? 'admin':'user'`).
- Login via chiave segreta (`?action=recovery`). Admin di sviluppo: vedi
  `Utente Admin.txt` (gitignored). Chiave admin nota: `6FWU-L4AF-YNYP-L4BM`.
- Storage file per-utente: `data/users/<id>/<app>/` con `basename()` anti-traversal;
  ogni endpoint chiama `requireAuth()` (401 se non autenticato).
- **Admin esente dal limite dispositivi** (`api.php` case `session-start`).

## Modalità DEMO (host statico)
Su GitHub Pages / `file://` il PHP non gira. `js/auth.js` rileva l'host statico
(o `window.AUTH_FORCE_DEMO`) e imposta `window.CLONE_OFFICE_DEMO = true`, entrando
come *Ospite* con salvataggio locale (localStorage).
- Le funzioni "Salva/Apri dal server" DEVONO chiamare
  `window.cloneOfficeDemoNotice('<azione>')` all'inizio: se ritorna `true`
  (siamo in demo) mostra un avviso e si interrompe, evitando il fetch a un PHP
  inesistente (che darebbe `Unexpected token '<'`). Già applicato a Excel, Word,
  PowerPoint, OneNote, Power BI, Access.

## Test (`clone-tests/`)
`./clone-tests/run-tests.sh` (usa `--static` per saltare il browser). Avvia da solo
un `php -S` su `TEST_PORT` (default 8771). Sequenza:
1. `01` lint PHP · `02` check statici
2. `03` browser smoke (0 errori JS) · `04` auth backend (401)
3. `05` e2e salva→elenca→ELIMINA · `06` e2e salva→APRI (round-trip)
4. `07` editing Excel (editor in-cella, formule relative, punta-e-clicca, bordi)

Browser: `puppeteer-core` + `/usr/bin/google-chrome` headless. I test forzano la
demo con `window.AUTH_FORCE_DEMO=true`. **`clone-tests/` contiene SOLO test** —
non metterci codice dell'app.

## Excel — note sul motore (più complesso degli altri)
File in `excel-clone/js/`: `spreadsheet.js` (motore celle/formule), `excel-functions.js`
(formattazione, bordi), `excel-menu.js` (menu/file/server), `ribbon-actions.js`,
`excel-functions.js`. Globali: `window.spreadsheet`, `window.excelFunctions`.
- **Editing in-cella**: `startCellEdit(ref, char, mode, focusEditor)` crea un
  `<input id="cell-editor">` sovrapposto alla cella; `commitCellEdit(move)` /
  `cancelCellEdit()`. La **barra della formula** (`#formula-input`) e l'editor
  in-cella restano **sincronizzati** ed editabili in contemporanea
  (`_activeEditorEl` traccia quello attivo).
- **"Punta e clicca"**: in editing di una formula, il `mousedown` su una cella in
  contesto-riferimento (`_isPointModeContext`) inserisce il riferimento
  (`_startPointSelection`/`_insertReference`) invece di spostare la selezione.
- **Riferimenti relativi nel paste**: `adjustFormulaReferences(formula, dCol, dRow)`
  trasla i riferimenti relativi (conserva quelli assoluti con `$`); usata in
  `paste()` solo per azione `copy` (non `cut`).
- **Evidenziazione riferimenti**: `_renderFormulaHighlights()` disegna riquadri
  colorati `.formula-ref-hl` sui range della formula in editing.
- **Bordi**: `excelFunctions.applyBorderType(type, style, color)` è range-aware
  (esterni vs interni orizzontali/verticali). `updateCellDisplay` assegna SEMPRE i
  bordi (anche '' per rimuoverli → torna la griglia). Il selettore bordi visuale
  (campioni di linea, colore, anteprime live) è `_renderBorderPicker(host, onApply)`,
  **condiviso** tra `showBorderMenu()` (ribbon) e il tab "Bordo" di `showFormatDialog()`
  (click destro → Formato celle), così le due interfacce sono identiche.

## Memoria persistente
Vedi `~/.claude/.../memory/MEMORY.md`. File chiave: `uniformita-suite`,
`security-tests-https`, `access-clone`, `admin-key-db`, `excel-clone-verifica`.
