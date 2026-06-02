// Test FUNZIONALE end-to-end: ciclo "salva → elenca → ELIMINA dal server" con
// utente AUTENTICATO, cliccando i VERI pulsanti dell'interfaccia di ogni app.
//
// Nasce da un bug reale: il pulsante "Elimina" nella finestra "Apri dal server"
// di Excel/OneNote/PowerPoint aveva un apice DOPPIO dentro l'attributo
// onclick="..." (nel testo del confirm "Eliminare \"nome\"?"). Quel " chiudeva
// l'attributo a metà → l'handler diventava JS troncato → al click NON accadeva
// nulla (nessun avviso, file non eliminato). Gli smoke test non lo prendevano
// perché non esercitavano il click reale sul ciclo CRUD.
//
// Richiede: server PHP + backend + un utente reale (chiave segreta).
// Si auto-salta (exit 0) se non riesce ad autenticarsi (es. DB vuoto).

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8771';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const SECRET = process.env.TEST_SECRET_KEY || '6FWU-L4AF-YNYP-L4BM';

let puppeteer;
try { puppeteer = (await import('puppeteer-core')).default; }
catch { console.log('⚠ puppeteer-core assente: e2e file server SALTATO.'); process.exit(0); }

// App con elenco file sul server. openExpr viene valutato nel contesto pagina.
const TARGETS = [
  {
    id: 'word', appUrl: 'word-clone/index.html',
    saveUrl: 'word-clone/save.php', saveBody: (n) => ({ filename: n, content: '<p>e2e</p>', format: 'json' }),
    listUrl: 'word-clone/list_documents.php', listKey: 'documents',
    openExpr: 'typeof openServerOpenModal === "function" && openServerOpenModal()',
  },
  {
    id: 'excel', appUrl: 'excel-clone/index.html',
    saveUrl: 'excel-clone/php/save.php', saveBody: (n) => ({ filename: n, content: { t: 1 } }),
    listUrl: 'excel-clone/php/list_files.php', listKey: 'files',
    openExpr: 'window.excelMenu && window.excelMenu.openFromServer()',
  },
  {
    id: 'onenote', appUrl: 'onenote-clone/index.html',
    saveUrl: 'onenote-clone/save.php', saveBody: (n) => ({ filename: n, data: { t: 1 } }),
    listUrl: 'onenote-clone/list_notebooks.php', listKey: 'notebooks',
    openExpr: 'typeof loadFromServerList === "function" && loadFromServerList()',
  },
  {
    id: 'powerpoint', appUrl: 'powerpoint-clone/index.html',
    saveUrl: 'powerpoint-clone/save.php', saveBody: (n) => ({ filename: n, data: { t: 1 } }),
    listUrl: 'powerpoint-clone/list_presentations.php', listKey: 'presentations',
    openExpr: 'typeof loadFromServerList === "function" && loadFromServerList()',
  },
  {
    id: 'access', appUrl: 'access-clone/index.html',
    saveUrl: 'access-clone/save.php', saveBody: (n) => ({ filename: n, data: { tables: {} } }),
    listUrl: 'access-clone/list_databases.php', listKey: 'databases',
    openExpr: 'typeof accessOpenServer === "function" && accessOpenServer()',
  },
];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
page.on('dialog', async (d) => { await d.accept(); }); // accetta i confirm

function done(code) { browser.close().then(() => process.exit(code)); }

// Login (recovery) → cookie di sessione nel browser
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
const logged = await page.evaluate(async (base, secret) => {
  const r = await fetch(base + '/backend/api.php?action=recovery', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'include', body: JSON.stringify({ secret_key: secret }),
  });
  return !!(await r.json().catch(() => ({})))?.user;
}, BASE, SECRET);

if (!logged) { console.log('⚠ e2e file server SALTATO: login non riuscito (imposta TEST_SECRET_KEY).'); done(0); }

console.log('── Test e2e: salva → elenca → ELIMINA (click reale, utente autenticato) ──\n');

let fail = 0;
const lines = [];

for (const t of TARGETS) {
  const name = `e2e ${t.id} ${Date.now()}`;
  const base = name.replace(/[^a-zA-Z0-9_-]/g, '_'); // come la sanificazione PHP
  const safe = base + '.json';

  // 1) crea il file via endpoint
  const saved = await page.evaluate(async (url, body) => {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(body),
    });
    return (await r.json().catch(() => ({}))).success === true;
  }, `${BASE}/${t.saveUrl}`, t.saveBody(name));
  if (!saved) { fail++; lines.push(`✗ [${t.id}] salvataggio file di test fallito`); continue; }

  // 2) apri l'app autenticata e la finestra elenco file
  await page.goto(`${BASE}/${t.appUrl}`, { waitUntil: 'networkidle2', timeout: 25000 });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate((expr) => { try { eval(expr); } catch (e) {} }, t.openExpr);
  await new Promise((r) => setTimeout(r, 700));

  // 3) trova e clicca il pulsante Elimina di QUEL file
  const clicked = await page.evaluate((b) => {
    const btns = [...document.querySelectorAll('button')];
    const target = btns.find((x) => {
      const oc = x.getAttribute('onclick') || '';
      return /delete|elimina/i.test(oc) && oc.includes(b);
    });
    if (target) { target.click(); return true; }
    return false;
  }, base);
  if (!clicked) { fail++; lines.push(`✗ [${t.id}] pulsante Elimina non trovato/cliccabile`); continue; }

  await new Promise((r) => setTimeout(r, 1400)); // delete + refresh

  // 4) verifica che il file NON sia più nell'elenco del server
  const stillThere = await page.evaluate(async (url, key, fn) => {
    const r = await fetch(url, { credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    return (j[key] || []).some((f) => f.filename === fn);
  }, `${BASE}/${t.listUrl}`, t.listKey, safe);

  if (stillThere) { fail++; lines.push(`✗ [${t.id}] file ancora presente dopo l'eliminazione — DELETE non funziona`); }
  else { lines.push(`✓ [${t.id}] salva → elenca → elimina OK`); }
}

console.log(lines.join('\n'));
console.log(`\nE2E file server: ${TARGETS.length - fail}/${TARGETS.length} app OK`);
done(fail ? 1 : 0);
