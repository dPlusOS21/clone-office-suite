// Test BROWSER (smoke) — carica ogni app in un Chrome headless, in modalità demo
// (window.AUTH_FORCE_DEMO), e verifica che:
//   - la pagina si carichi senza errori JS gravi (pageerror / console.error);
//   - la modalità demo si attivi (window.CLONE_OFFICE_DEMO === true);
//   - non resti visibile l'overlay "Accesso richiesto";
//   - il titolo del documento non sia vuoto.
//
// Richiede puppeteer-core (vedi package.json) e Google Chrome installato.
// Salta automaticamente (senza fallire) se puppeteer-core non è installato.

import { APPS } from './lib/apps.mjs';

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8771';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';

let puppeteer;
try { puppeteer = (await import('puppeteer-core')).default; }
catch {
  console.log('⚠ puppeteer-core non installato: test browser SALTATI (esegui `npm install` in clone-tests).');
  process.exit(0);
}

// Rumore di console accettabile (non indica un bug dell'app).
const IGNORE = [
  /favicon/i,
  /ERR_(CONNECTION|EMPTY_RESPONSE|FAILED|ABORTED)/i, // fetch backend assenti in demo
  /Failed to load resource/i,
  /ResizeObserver loop/i,
  /net::ERR/i,
  /the server responded with a status of 4/i,
];
const ignore = (t) => IGNORE.some((re) => re.test(t));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
});

let fail = 0;
const lines = [];

for (const app of APPS) {
  const page = await browser.newPage();
  const errors = [];
  await page.evaluateOnNewDocument(() => { window.AUTH_FORCE_DEMO = true; });
  page.on('pageerror', (e) => { if (!ignore(e.message)) errors.push('JS: ' + e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !ignore(m.text())) errors.push('console: ' + m.text()); });

  const url = `${BASE}/${app.file}`;
  let demo = false, title = '', blocker = false;
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise((r) => setTimeout(r, 600)); // lascia girare init
    demo = await page.evaluate(() => window.CLONE_OFFICE_DEMO === true);
    title = await page.title();
    blocker = await page.evaluate(() => {
      const b = document.querySelector('[id*=blocker],[id*=auth-blocker]');
      if (!b) return false;
      const s = getComputedStyle(b);
      return s.display !== 'none' && s.visibility !== 'hidden' && b.offsetParent !== null;
    });
  } catch (e) {
    errors.push('navigazione: ' + e.message);
  }

  const problems = [];
  if (!demo) problems.push('demo non attiva');
  if (!title) problems.push('titolo vuoto');
  if (blocker) problems.push('overlay accesso ancora visibile');
  problems.push(...errors);

  if (problems.length) {
    fail++;
    lines.push(`✗ [${app.id}] ${app.name}`);
    problems.slice(0, 6).forEach((p) => lines.push('    - ' + p));
  } else {
    lines.push(`✓ [${app.id}] ${app.name} — demo OK, 0 errori`);
  }
  await page.close();
}

await browser.close();

console.log('── Test browser (smoke, modalità demo) ──\n');
console.log(lines.join('\n'));
console.log(`\nBrowser: ${APPS.length - fail}/${APPS.length} app OK`);
if (fail) process.exit(1);
