// Test FUNZIONALE end-to-end: ciclo "SALVA → APRI" sul server con utente
// AUTENTICATO. Per ogni app a file salva un payload con un MARCATORE univoco,
// poi lo ricarica dal server e verifica che il contenuto ritorni identico.
//
// Complementare a 05 (che copre salva→elenca→ELIMINA): qui si verifica che il
// salvataggio persista DAVVERO e che l'apertura restituisca il contenuto giusto,
// per tutte le app con storage a file: Word, Excel, PowerPoint, OneNote, Power BI.
//
// Si auto-salta (exit 0) se non riesce ad autenticarsi.

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8771';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const SECRET = process.env.TEST_SECRET_KEY || '6FWU-L4AF-YNYP-L4BM';

let puppeteer;
try { puppeteer = (await import('puppeteer-core')).default; }
catch { console.log('⚠ puppeteer-core assente: e2e salva/apri SALTATO.'); process.exit(0); }

// Ogni app: come salvare (POST) e come ricaricare. `pick` estrae dalla risposta
// di load una stringa in cui cercare il marcatore.
const APPS = [
  {
    id: 'word',
    save: { url: 'word-clone/save.php', body: (n, m) => ({ filename: n, content: `<p>${m}</p>`, format: 'json' }) },
    load: { url: 'word-clone/load_document.php', method: 'POST', body: (n) => ({ filename: n + '.json', filetype: 'json' }), pick: (j) => JSON.stringify(j.content ?? '') },
  },
  {
    id: 'excel',
    save: { url: 'excel-clone/php/save.php', body: (n, m) => ({ filename: n, content: { marker: m } }) },
    load: { url: 'excel-clone/php/load.php', method: 'POST', body: (n) => ({ filename: n }), pick: (j) => JSON.stringify(j.content ?? '') },
  },
  {
    id: 'powerpoint',
    save: { url: 'powerpoint-clone/save.php', body: (n, m) => ({ filename: n, data: { marker: m } }) },
    load: { url: 'powerpoint-clone/load_presentation.php', method: 'POST', body: (n) => ({ filename: n + '.json' }), pick: (j) => JSON.stringify(j.content ?? '') },
  },
  {
    id: 'onenote',
    save: { url: 'onenote-clone/save.php', body: (n, m) => ({ filename: n, data: { marker: m } }) },
    load: { url: 'onenote-clone/load_notebook.php', method: 'POST', body: (n) => ({ filename: n + '.json' }), pick: (j) => JSON.stringify(j.content ?? '') },
  },
  {
    id: 'powerbi',
    save: { url: 'powerbi-clone/save.php', body: (n, m) => ({ filename: n, data: { marker: m } }) },
    load: { url: 'powerbi-clone/load_report.php', method: 'GET', qs: (n) => `?file=${encodeURIComponent(n + '.json')}`, pick: (j) => JSON.stringify(j.data ?? '') },
  },
  {
    id: 'access',
    save: { url: 'access-clone/save.php', body: (n, m) => ({ filename: n, data: { marker: m, tables: {} } }) },
    load: { url: 'access-clone/load_database.php', method: 'POST', body: (n) => ({ filename: n + '.json' }), pick: (j) => JSON.stringify(j.data ?? '') },
  },
];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
function done(code) { browser.close().then(() => process.exit(code)); }

await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
const logged = await page.evaluate(async (base, secret) => {
  const r = await fetch(base + '/backend/api.php?action=recovery', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'include', body: JSON.stringify({ secret_key: secret }),
  });
  return !!(await r.json().catch(() => ({})))?.user;
}, BASE, SECRET);

if (!logged) { console.log('⚠ e2e salva/apri SALTATO: login non riuscito (imposta TEST_SECRET_KEY).'); done(0); }

console.log('── Test e2e: SALVA → APRI (round-trip contenuto, utente autenticato) ──\n');

let fail = 0;
const lines = [];

for (const a of APPS) {
  const name = `rt_${a.id}_${Date.now()}`;
  const marker = `MARK_${a.id}_${Math.random().toString(36).slice(2, 10)}`;

  // 1) SALVA
  const saved = await page.evaluate(async (url, body) => {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(body),
    });
    return (await r.json().catch(() => ({}))).success === true;
  }, `${BASE}/${a.save.url}`, a.save.body(name, marker));
  if (!saved) { fail++; lines.push(`✗ [${a.id}] SALVA fallito`); continue; }

  // 2) APRI (ricarica) e verifica il marcatore
  const ok = await page.evaluate(async (cfg, base, nm, mk) => {
    const url = base + '/' + cfg.url + (cfg.qs ? cfg.qs : '');
    const opt = { method: cfg.method, credentials: 'include' };
    if (cfg.method === 'POST') { opt.headers = { 'Content-Type': 'application/json' }; opt.body = cfg.bodyJson; }
    const r = await fetch(url, opt);
    const j = await r.json().catch(() => ({}));
    if (j.success !== true) return { ok: false, why: 'load.success=false' };
    return { ok: true, j };
  }, {
    url: a.load.url, method: a.load.method,
    qs: a.load.qs ? a.load.qs(name) : '',
    bodyJson: a.load.method === 'POST' ? JSON.stringify(a.load.body(name)) : null,
  }, BASE, name, marker);

  if (!ok.ok) { fail++; lines.push(`✗ [${a.id}] APRI fallito (${ok.why || 'errore'})`); continue; }
  const haystack = a.load.pick(ok.j);
  if (haystack.includes(marker)) lines.push(`✓ [${a.id}] salva → apri OK (contenuto integro)`);
  else { fail++; lines.push(`✗ [${a.id}] contenuto NON integro dopo l'apertura (marcatore mancante)`); }
}

console.log(lines.join('\n'));
console.log(`\nE2E salva/apri: ${APPS.length - fail}/${APPS.length} app OK`);
done(fail ? 1 : 0);
