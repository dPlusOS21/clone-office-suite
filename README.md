# Clone Office Suite

Una **suite Office completa** che gira interamente nel browser, in stile Microsoft 365 online, con backend PHP per autenticazione, licenze, archiviazione e dashboard amministrativa. Interfaccia in **italiano**.

> ⚠️ Progetto dimostrativo/didattico: replica l'aspetto e molte funzionalità delle app Microsoft Office online, ma non è affiliato né collegato a Microsoft.

## 🌐 Demo online

La suite è pubblicata con **GitHub Pages** e si può **provare direttamente dal browser**:

➡️ **https://dplusos21.github.io/clone-office-suite/**

In demo (hosting statico) il backend PHP non è attivo: l'accesso è automatico come *Ospite* e i dati vengono salvati nel **browser** (localStorage). Per tutte le funzioni server (account, salvataggio sul server, dashboard admin, invio email dei feedback) serve eseguire il progetto su un server PHP (vedi *Avvio rapido*).

## ❤️ Sostieni il progetto

Se ti è utile o ti piace, puoi offrire un caffè / fare una **donazione** via PayPal:

➡️ **[Dona con PayPal](https://www.paypal.com/donate?business=deplano.d%40gmail.com&item_name=Sostieni+Clone+Office+Suite&currency_code=EUR)** · oppure dal pulsante **Dona** nella home della suite.

---

## 🧩 Applicazioni incluse

| App | Cartella | Descrizione |
|-----|----------|-------------|
| **Hub / Launcher** | `index.html` | Pagina iniziale con tutte le app, ricerca e launcher a waffle. |
| **Clone-Word** | `word-clone/` | Editor di testo: caratteri, stili, paragrafi, tabelle, immagini, layout pagina, revisione, Trova/Sostituisci, righelli, modalità documento. |
| **Clone-Excel** | `excel-clone/` | Foglio di calcolo: oltre 100 funzioni, formattazione, grafici, oggetti, export, pulsante "Report Power BI". |
| **Clone-PowerPoint** | `powerpoint-clone/` | Presentazioni: 11 tab, diapositive, forme, transizioni e animazioni reali, Vista Relatore, show personalizzato, disegno, export PDF/PNG/HTML. |
| **Clone-OneNote** | `onenote-clone/` | Blocco appunti: blocchi → sezioni → pagine, scrittura, tag/To-Do, disegno, tema bianco fedele a OneNote online. |
| **Clone-Outlook** | `outlook-clone/` | Posta (IMAP/SMTP), cartelle, contatti, calendario, command bar in stile Outlook online, tema scuro. |
| **Clone-OneDrive** | `onedrive-clone/` | Archiviazione file: carica/scarica, cartelle, sposta/copia, preferiti, recenti, cestino. |
| **Clone-Power BI** | `powerbi-clone/` | Dashboard interattive: visualizzazioni, slicer, cross-filtering, persistenza, mobile. |
| **Clone-Access** | `access-clone/` | Database: tabelle (foglio dati + struttura campi), query, maschere, report, diagramma relazioni; export CSV e analisi in Power BI. |

Ogni app desktop ha una **Guida dedicata** (`<app>/guida.html`) con ricerca, sezioni e modulo "Commenti e suggerimenti" che invia un feedback al backend.

---

## 🚀 Avvio rapido (locale)

Requisito: **PHP CLI** (`sudo apt install php-cli`).

```bash
./start.sh            # porta predefinita 8000
./start.sh 8001       # porta alternativa
```

Poi apri **http://localhost:8000/index.html**. In alternativa, manualmente dalla root del progetto:

```bash
php -S localhost:8000
```

> Il server PHP integrato serve sia i file statici delle app sia il backend (`backend/api.php`). Servire dalla **root del progetto** è importante perché le app usano percorsi relativi verso `../backend/` e `../js/`.

### 🔒 Avvio in HTTPS (transazioni cifrate)

Per servire la suite in **HTTPS** in locale (login e dati cifrati end-to-end):

```bash
./start-https.sh          # https://localhost:8443
```

Lo script genera al primo avvio un certificato **self-signed** (`ssl/`) e usa
`socat` come terminatore TLS davanti a PHP (`sudo apt install socat` se manca).
Il browser mostrerà un avviso di certificato non attendibile la prima volta:
è normale per i certificati self-signed, accetta l'eccezione.

In **produzione** usa un certificato vero (es. Let's Encrypt) o l'HTTPS del tuo
hosting; il `.htaccess` incluso **forza il redirect a HTTPS** (escluso localhost).
La chiave privata del certificato è in `.gitignore` e **non** viene pubblicata.

---

## 🧪 Test (cartella `clone-tests/`)

La cartella [`clone-tests/`](clone-tests/) contiene **solo i test di regressione**
(nessuna copia della suite). Vanno eseguiti **prima di ogni aggiornamento del
repository**: se sono tutti verdi, le modifiche non hanno rotto nulla.

```bash
cd clone-tests
npm install        # solo la prima volta (puppeteer-core per i test browser)
npm test           # lint PHP + statici + browser + sicurezza + e2e
npm run test:static  # solo lint PHP + statici (veloce, senza Chrome)
```

Cosa verifica:

1. **Lint PHP** — sintassi di tutti i file `.php`.
2. **Statici** — presenza file/guide, marcatori di funzionalità di ogni app, JSON validi, modalità demo, fix timezone.
3. **Browser (smoke)** — ogni app si carica in demo senza errori JS, niente overlay di accesso.
4. **Sicurezza backend** — gli endpoint per-utente **rifiutano** le richieste non autenticate (401).
5. **E2E** — ciclo reale *salva → elenca → elimina* (click vero sul pulsante) per Excel, OneNote, PowerPoint.

---

## 🔐 Autenticazione e licenze

- Sistema di login condiviso (`js/auth.js`) basato su **chiave segreta** + QR; backend in `backend/api.php` (SQLite).
- Il **primo utente registrato diventa amministratore**.
- Ogni app è protetta da un overlay "Accesso richiesto" finché non si effettua l'accesso.
- Admin attuale (ambiente di sviluppo): vedi `Utente Admin.txt`.

### Dashboard amministrativa
`backend/admin-dashboard.php` (link "Dashboard" mostrato nel widget account agli admin). Schede:
- **Utenti**, **Licenze**, **Sessioni attive**
- **Impostazioni** → email destinatario dei feedback + elenco feedback ricevuti
- Pulsante **Indietro** (torna alla pagina di provenienza)

---

## ✉️ Feedback dalle guide → email

I moduli "Commenti e suggerimenti" delle guide inviano in POST a `backend/api.php?action=send-feedback`:
- il feedback viene **salvato** nella tabella `feedback` (sempre, anche offline → fallback `localStorage`);
- se l'admin ha impostato un destinatario (Dashboard ▸ Impostazioni), viene inviata una **email via `mail()` di PHP**.

> Il recapito reale dipende da un MTA configurato sul server. In locale il feedback resta comunque registrato e visibile in dashboard.

---

## 🗂️ Struttura del progetto

```
microsoft-clone/
├── index.html              # Hub / launcher delle app
├── start.sh                # Avvio server PHP locale (HTTP)
├── start-https.sh          # Avvio server locale in HTTPS (TLS via socat)
├── ssl/                    # Generatore certificato self-signed (make-cert.sh)
├── clone-tests/            # Test di regressione (lint, statici, browser, sicurezza, e2e)
├── buy.html                # Pagina acquisto licenze
├── js/auth.js              # Sistema di autenticazione condiviso
├── shared/                 # Risorse condivise (app-launcher, ecc.)
├── backend/
│   ├── api.php             # API REST (auth, admin, licenze, sessioni, feedback)
│   ├── config.php          # DB SQLite + init tabelle + helper (settings, feedback)
│   ├── storage.php         # Archiviazione per-utente, quote
│   ├── admin-dashboard.php # Dashboard admin (utenti/licenze/sessioni/impostazioni)
│   ├── auth-handler.php    # Conferma autenticazione da QR
│   └── diagnostica.php     # Pagina di diagnostica
├── data/                   # DB SQLite (clone_office.db) + storage utenti
├── word-clone/        (index.html + guida.html)
├── excel-clone/       (index.html + js/ + guida.html)
├── powerpoint-clone/  (index.html + js/ + guida.html)
├── onenote-clone/     (index.html + guida.html + save/load PHP)
├── outlook-clone/     (index.html + guida.html + api.php + db.php + SQLite)
├── onedrive-clone/    (index.html + guida.html + api.php + files/ + trash/)
├── powerbi-clone/     (index.html + guida.html + save/load/list/delete PHP)
└── access-clone/      (index.html + guida.html; database in localStorage)
```

---

## 🎨 Note di stile / fedeltà

Le app puntano a somigliare alle versioni **online** di Office:
- **Word**: tema chiaro Office, barra blu (#2b579a), icone Fluent colorate, gallery Stili, righelli; etichette dei gruppi del ribbon **in basso** come in Word online.
- **Excel**: tema **verde Excel** (#217346) coerente su barra del titolo, tab attivo, selezione celle, intestazioni e controlli zoom della barra di stato; gruppi Home, icone colorate.
- **PowerPoint**: ribbon a riga singola, icone colorate.
- **OneNote**: chrome **bianco** con accenti viola, **G/C/S**, "Dimmi cosa vuoi fare", Modifica/Condividi; icone del ribbon **monocromatiche** (come l'originale, NON colorate).
- **Outlook**: barra blu, riga menu (File/Home/Visualizza/Guida) e **command bar** (Nuovo messaggio, Elimina, Archivia, Segnala, Sposta in, Rispondi a tutti, …) con icone monocromatiche; tema scuro opzionale.
- **OneDrive**: barra comandi blu, viste elenco/griglia.

I selettori di colore e gli input usano **interfacce eleganti** integrate (niente popup/`prompt`/color picker nativi del sistema).

---

## 🔐 Sicurezza e isolamento tra utenti

Ogni utente vede **solo i propri dati**:

- **App a file** (Word, Excel, PowerPoint, OneNote, Power BI, Access, OneDrive): i file sono salvati in `data/users/<id>/<app>/`, una directory **separata per utente**. Tutti gli endpoint richiedono autenticazione (`requireAuth`) e usano `basename()` sui nomi file per impedire il *path traversal*.
- **Outlook**: usa un **database SQLite per-utente** (`data/users/<id>/outlook/outlook_data.db`). Così account email, messaggi e contatti di un utente non sono **mai** visibili a un altro. L'API Outlook ora richiede l'autenticazione (prima era accessibile in modo anonimo su un DB condiviso — vedi *Correzioni*).
- L'isolamento è verificato dal test di sicurezza in `clone-tests/` (endpoint protetti → **401** senza sessione).

---

## 🩹 Correzioni recenti

- **Salvataggio/apertura uniformi su tutte le app** — ogni app ora **salva e apre sia in locale che sul server**. Verificato da test e2e di *round-trip* (salva → riapri, contenuto integro) su Word, Excel, PowerPoint, OneNote, Power BI e Access.
  - **Word** — la finestra "Salva/Apri sul server" è ora una **modale uniforme** (come Excel/OneNote/PowerPoint): nome **precompilato** dal titolo del documento, elenco file **caricato automaticamente** e **aggiornato** subito dopo salvataggio/eliminazione (niente più pulsante "Aggiorna elenco"); su mobile l'ultimo file non viene più tagliato.
  - **Access** — aggiunto il **salvataggio/apertura su server** (prima solo `localStorage`): nuovi endpoint per-utente `save.php`, `load_database.php`, `list_databases.php`, `delete_database.php`. I comandi (Salva/Apri su server, **Backup** e **Ripristina** su file, Esporta CSV) sono ora sotto il **tab File** (prima il tab File apriva erroneamente la guida).
  - **Power BI** — aggiunto **Backup su file (.json)** (menu *Esporta*) e **Apri da file…** (finestra *Apri report*), oltre al salvataggio sul server e all'export PNG già presenti.
  - Nomi dei backup descrittivi: `<nome>_backup_<timestamp>.json`.
- **Barra superiore uniforme su tutte le app** — stessa **sequenza** di pulsanti a destra: *…funzioni dell'app → Account → Acquista Clone Office → Guida (?) → Schermo intero*. Aggiunti dove mancavano (Excel/OneNote: Guida; Excel/OneDrive/Power BI: Schermo intero; ovunque: Acquista). Rimossi i **cerchi avatar "DD" non cliccabili** (PowerPoint, Outlook) e i finti controlli finestra `− □ ×` di Excel.
- **Pagina principale su mobile** — l'header dell'hub mostrava 4 pulsanti (Dona/Acquista/Tema/Account) che su schermi stretti tagliavano l'Account a destra: ora su mobile i pulsanti diventano **solo icona**, così l'Account resta sempre visibile.
- **Limite dispositivi per l'amministratore** — l'admin non è più soggetto al limite di sessioni/dispositivi della licenza (poteva ricevere "Limite dispositivi raggiunto" anche in locale).
- **Sicurezza / isolamento dati (Outlook)** — l'API Outlook non richiedeva autenticazione e usava un database **condiviso** fra tutti gli utenti: un utente poteva vedere account ed email altrui. Ora richiede `requireAuth` e ogni utente ha un **database fisicamente separato** (`data/users/<id>/outlook/`).
- **Eliminazione file dal server (Excel, OneNote, PowerPoint)** — il pulsante *Elimina* nella finestra "Apri dal server" aveva un apice doppio (`"`) dentro l'attributo `onclick="…"`: l'attributo veniva troncato e al click **non accadeva nulla** (nessun avviso, file non eliminato). Corretto; l'elenco ora si **aggiorna** dopo l'eliminazione. Coperto da un test e2e che clicca il pulsante reale.
- **Crash/Warning PHP su `date()`** — impostato il fuso orario di default (`Europe/Rome`) in `backend/config.php` e in `outlook-clone/api.php`, evitando l'avviso PHP che poteva corrompere l'output JSON delle API (stesso problema affrontato dalla PR #1, qui risolto alla radice mantenendo l'orario locale).
- **HTTPS** — aggiunto avvio cifrato locale (`start-https.sh` + `ssl/`) e redirect a HTTPS nel `.htaccess` per la produzione.
- **Fedeltà grafica Excel/Word** — Excel reso interamente a **tema verde** (#217346): barra del titolo (prima era blu), tab attivo, selezione celle, pulsanti vista e cursore dello **zoom** nella barra di stato. Word: etichette dei gruppi del ribbon spostate **in basso** come nella versione online.

---

## 💾 Persistenza dati

- **Auth/licenze/sessioni/feedback/impostazioni**: SQLite `data/clone_office.db`.
- **File utente** (documenti salvati sul server): `data/users/<id>/<app>/`.
- **OneNote / Power BI / Access / Outlook / OneDrive**: ciascuno con il proprio salvataggio (PHP dedicati per-utente o DB SQLite locale dell'app). Access salva l'intero database come JSON in `data/users/<id>/access/` e mantiene anche una copia in `localStorage`.
- **Stato UI** e preferenze (tema, zoom, bozze): `localStorage` del browser.

---

## ⌨️ Suggerimenti d'uso

- Premi **F1** nelle app (dove disponibile) per aprire la Guida; oppure usa il pulsante/tab **Guida**.
- Dopo aver aggiornato il codice, ricarica con **Ctrl+Shift+R** per evitare la cache del browser.
- Per testare l'invio email dei feedback: imposta l'indirizzo in **Dashboard ▸ Impostazioni**.

---

## 🛠️ Tecnologie

HTML/CSS/JavaScript vanilla (nessun framework) · PHP + SQLite (PDO) · Font Awesome · html2pdf/html2canvas (export) · API Web (Selection, Pointer Events, CSS Custom Highlight).

---

## 📄 Licenza

Distribuito con licenza **MIT** — vedi il file [LICENSE](LICENSE).

© 2026 **Daniele Deplano**. Sei libero di usare, modificare e distribuire il software, **a condizione di mantenere la nota di copyright e di licenza** (quindi l'attribuzione all'autore originale) in tutte le copie o parti sostanziali del software.
