// Test STATICI (nessun browser, nessuna rete) — sempre eseguibili.
// Verifica per ogni app:
//   - il file principale esiste e non è vuoto;
//   - i file extra dichiarati esistono;
//   - tutti i "marcatori" di funzionalità sono presenti nel sorgente;
//   - la guida (guida.html) esiste dove prevista;
// Inoltre valida che tutti i file .json del progetto siano JSON ben formati.

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { APPS, ROOT } from './lib/apps.mjs';

let pass = 0, fail = 0;
const fails = [];
function ok(msg) { pass++; }
function ko(msg) { fail++; fails.push(msg); }
function check(cond, msg) { cond ? ok(msg) : ko(msg); }

console.log('── Test statici (struttura e marcatori funzionalità) ──\n');

for (const app of APPS) {
  const path = join(ROOT, app.file);
  if (!existsSync(path)) { ko(`[${app.id}] file mancante: ${app.file}`); continue; }
  const src = readFileSync(path, 'utf8');
  check(src.length > 500, `[${app.id}] ${app.file} non vuoto`);

  for (const m of app.markers) {
    check(src.includes(m), `[${app.id}] marcatore presente: "${m}"`);
  }
  for (const ef of (app.extraFiles || [])) {
    const efp = join(ROOT, ef);
    check(existsSync(efp) && statSync(efp).size > 0, `[${app.id}] file extra: ${ef}`);
  }
  if (app.hasGuide) {
    const guide = join(ROOT, app.file.replace(/index\.html$/, 'guida.html'));
    check(existsSync(guide), `[${app.id}] guida.html presente`);
  }
}

// ── Validazione JSON ──
function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'data', '.claude'].includes(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.name.endsWith('.json')) acc.push(full);
  }
  return acc;
}
for (const jf of walk(ROOT)) {
  try { JSON.parse(readFileSync(jf, 'utf8')); ok(`JSON valido: ${relative(ROOT, jf)}`); }
  catch (e) { ko(`JSON NON valido: ${relative(ROOT, jf)} (${e.message})`); }
}

// ── Modalità demo presente in auth.js ──
const authSrc = readFileSync(join(ROOT, 'js/auth.js'), 'utf8');
check(authSrc.includes('CLONE_OFFICE_DEMO'), '[auth] modalità demo presente');
check(authSrc.includes('AUTH_FORCE_DEMO'), '[auth] override AUTH_FORCE_DEMO presente');

// ── Fix timezone (evita crash date()) ──
const cfgSrc = readFileSync(join(ROOT, 'backend/config.php'), 'utf8');
check(cfgSrc.includes('date_default_timezone_set'), '[backend] timezone di default impostato');

console.log(`\nStatici: ${pass} OK, ${fail} FALLITI`);
if (fail) { console.log('\nFALLIMENTI:'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
