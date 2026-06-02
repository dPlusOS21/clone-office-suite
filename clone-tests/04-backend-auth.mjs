// Test SICUREZZA backend — isolamento dati tra utenti.
// Verifica che gli endpoint PHP che servono dati per-utente RIFIUTINO le
// richieste non autenticate (HTTP 401). È la guardia contro le regressioni
// del fix di isolamento (in particolare Outlook, che prima esponeva gli
// account/email di tutti gli utenti su un DB condiviso senza autenticazione).
//
// Richiede il server PHP attivo (lo avvia run-tests.sh).

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8771';

// endpoint protetti: { path, method, body, why }
const PROTECTED = [
  { path: 'outlook-clone/api.php', method: 'POST', body: { action: 'account_list' }, why: 'Outlook: elenco account' },
  { path: 'outlook-clone/api.php', method: 'POST', body: { action: 'email_list' }, why: 'Outlook: elenco email' },
  { path: 'outlook-clone/api.php', method: 'POST', body: { action: 'contact_list' }, why: 'Outlook: contatti' },
  { path: 'word-clone/save.php', method: 'POST', body: { filename: 't', content: 'x' }, why: 'Word: salvataggio' },
  { path: 'word-clone/load_document.php', method: 'POST', body: { filename: 't' }, why: 'Word: caricamento' },
  { path: 'word-clone/list_documents.php', method: 'GET', why: 'Word: elenco' },
  { path: 'excel-clone/php/list_files.php', method: 'GET', why: 'Excel: elenco file' },
  { path: 'onenote-clone/list_notebooks.php', method: 'GET', why: 'OneNote: elenco blocchi' },
  { path: 'powerbi-clone/list_reports.php', method: 'GET', why: 'Power BI: elenco report' },
  { path: 'powerpoint-clone/list_presentations.php', method: 'GET', why: 'PowerPoint: elenco' },
  { path: 'onedrive-clone/api.php', method: 'POST', body: { action: 'list', path: '' }, why: 'OneDrive: elenco file' },
  { path: 'access-clone/list_databases.php', method: 'GET', why: 'Access: elenco database' },
  { path: 'access-clone/save.php', method: 'POST', body: { filename: 't', data: {} }, why: 'Access: salvataggio' },
];

let fail = 0;
const lines = [];

for (const ep of PROTECTED) {
  let status = 0, isProtected = false, body = '';
  try {
    const opts = { method: ep.method };
    if (ep.method === 'POST') {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(ep.body || {});
    }
    // NIENTE cookie di sessione: simula un utente non autenticato / altro utente
    const r = await fetch(`${BASE}/${ep.path}`, opts);
    status = r.status;
    body = (await r.text()).slice(0, 200);
    // Protetto se 401/403, oppure JSON con success:false / errore di auth.
    let json = null;
    try { json = JSON.parse(body); } catch {}
    isProtected =
      status === 401 || status === 403 ||
      (json && json.success === false) ||
      /non autenticato|unauthorized|autenticazione/i.test(body);
  } catch (e) {
    body = 'fetch error: ' + e.message;
  }
  if (isProtected) {
    lines.push(`✓ ${ep.why} → bloccato (HTTP ${status})`);
  } else {
    fail++;
    lines.push(`✗ ${ep.why} → NON protetto (HTTP ${status}) ${body}`);
  }
}

console.log('── Test sicurezza backend (isolamento dati / auth obbligatoria) ──\n');
console.log(lines.join('\n'));
console.log(`\nSicurezza: ${PROTECTED.length - fail}/${PROTECTED.length} endpoint protetti`);
if (fail) process.exit(1);
