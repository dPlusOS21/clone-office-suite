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
├── start.sh                # Avvio server PHP locale
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
- **Word**: tema chiaro Office, icone Fluent colorate, gallery Stili, righelli.
- **Excel**: ribbon verde, gruppi Home, icone colorate.
- **PowerPoint**: ribbon a riga singola, icone colorate.
- **OneNote**: chrome **bianco** con accenti viola, **G/C/S**, "Dimmi cosa vuoi fare", Modifica/Condividi; icone del ribbon **monocromatiche** (come l'originale, NON colorate).
- **Outlook**: barra blu, riga menu (File/Home/Visualizza/Guida) e **command bar** (Nuovo messaggio, Elimina, Archivia, Segnala, Sposta in, Rispondi a tutti, …) con icone monocromatiche; tema scuro opzionale.
- **OneDrive**: barra comandi blu, viste elenco/griglia.

I selettori di colore e gli input usano **interfacce eleganti** integrate (niente popup/`prompt`/color picker nativi del sistema).

---

## 💾 Persistenza dati

- **Auth/licenze/sessioni/feedback/impostazioni**: SQLite `data/clone_office.db`.
- **File utente** (documenti salvati sul server): `data/users/<id>/<app>/`.
- **OneNote / Power BI / Outlook / OneDrive**: ciascuno con il proprio salvataggio (PHP dedicati o DB SQLite locale dell'app).
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
