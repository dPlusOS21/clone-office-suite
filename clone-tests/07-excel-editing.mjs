// Test FUNZIONALE dell'editing di Excel (fedeltà alla versione originale).
// Verifica, su excel-clone in modalità demo (nessun backend necessario):
//   1) Editor IN-CELLA: digitando, il testo è visibile nella cella (non solo
//      nella barra della formula) e viene confermato con Invio.
//   2) Copia/incolla con RIFERIMENTI RELATIVI traslati (=A1*2 → =A2*2).
//   3) "Punta e clicca": durante una formula, cliccare una cella inserisce il
//      riferimento (=A1+A2) invece di spostare la selezione.
//   4) Evidenziazione dei RIFERIMENTI della formula in editing (riquadri).
//   5) BORDI range-aware: "tutti i bordi" vs "esterni" sulla selezione.
//
// Si auto-salta (exit 0) se puppeteer-core o Chrome non sono disponibili.

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8771';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';

let puppeteer;
try { puppeteer = (await import('puppeteer-core')).default; }
catch { console.log('⚠ puppeteer-core assente: test editing Excel SALTATO.'); process.exit(0); }

console.log('── Test editing Excel (in-cella, formule relative, punta-e-clicca, bordi) ──\n');

let browser;
try { browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] }); }
catch { console.log('⚠ Chrome non avviabile: test editing Excel SALTATO.'); process.exit(0); }

let fail = 0;
const ok = (name, cond) => { console.log(`${cond ? '✓' : '✗'} ${name}`); if (!cond) fail++; };

try {
  const page = await browser.newPage();
  const jsErrors = [];
  page.on('pageerror', (e) => jsErrors.push(e.message));
  await page.evaluateOnNewDocument(() => { window.AUTH_FORCE_DEMO = true; });
  await page.goto(`${BASE}/excel-clone/index.html`, { waitUntil: 'networkidle2', timeout: 25000 });
  await new Promise((r) => setTimeout(r, 800));

  const clickCell = async (ref) => {
    const el = await page.$(`[data-cell="${ref}"]`);
    const box = await el.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };

  // 1) Editor in-cella
  await clickCell('B2');
  await page.keyboard.type('Ciao');
  const editorShown = await page.evaluate(() => {
    const ed = document.getElementById('cell-editor');
    return !!(ed && ed.style.display !== 'none' && ed.value === 'Ciao');
  });
  await page.keyboard.press('Enter');
  const committed = await page.evaluate(() => window.spreadsheet.getCellValue('B2'));
  ok('editor in-cella mostra il testo digitato', editorShown);
  ok('Invio conferma il valore nella cella', committed === 'Ciao');

  // 2) Riferimenti relativi nel copia/incolla
  await clickCell('A1'); await page.keyboard.type('10'); await page.keyboard.press('Enter');
  await clickCell('A2'); await page.keyboard.type('20'); await page.keyboard.press('Enter');
  await clickCell('B1'); await page.keyboard.type('=A1*2'); await page.keyboard.press('Enter');
  await clickCell('B1');
  await page.keyboard.down('Control'); await page.keyboard.press('KeyC'); await page.keyboard.up('Control');
  await clickCell('B2');
  await page.keyboard.down('Control'); await page.keyboard.press('KeyV'); await page.keyboard.up('Control');
  await new Promise((r) => setTimeout(r, 150));
  const pf = await page.evaluate(() => window.spreadsheet.data['B2'].formula);
  const pv = await page.evaluate(() => window.spreadsheet.getCellValue('B2'));
  ok('formula incollata trasla i riferimenti relativi (=A1*2 → =A2*2)', pf === '=A2*2');
  ok('valore incollato ricalcolato (A2*2 = 40)', pv === '40');

  // 3) Punta e clicca
  await clickCell('D1'); await page.keyboard.type('=');
  await clickCell('A1');
  const r1 = await page.evaluate(() => document.getElementById('cell-editor').value);
  await page.keyboard.type('+');
  await clickCell('A2');
  const r2 = await page.evaluate(() => document.getElementById('cell-editor').value);
  await page.keyboard.press('Enter');
  const dv = await page.evaluate(() => window.spreadsheet.getCellValue('D1'));
  ok('clic su cella inserisce il riferimento nella formula (=A1)', r1 === '=A1');
  ok('clic successivo aggiunge il riferimento (=A1+A2)', r2 === '=A1+A2');
  ok('formula "punta e clicca" calcola (10+20 = 30)', dv === '30');

  // 4) Evidenziazione riferimenti in editing
  await clickCell('A5'); await page.keyboard.type('=SOMMA(A1:A2)'); await page.keyboard.press('Enter');
  await clickCell('A5'); await page.keyboard.press('F2');
  await new Promise((r) => setTimeout(r, 120));
  const hlCount = await page.evaluate(() => document.querySelectorAll('.formula-ref-hl').length);
  await page.keyboard.press('Escape');
  const hlCleared = await page.evaluate(() => document.querySelectorAll('.formula-ref-hl').length);
  ok('editing di una formula evidenzia il range referenziato', hlCount >= 1);
  ok('le evidenziazioni si rimuovono all\'uscita dall\'editing', hlCleared === 0);

  // 5) Bordi range-aware
  const allB = await page.evaluate(() => {
    const s = window.spreadsheet; s.selectCell('A1'); s.selectedRange = { start: 'A1', end: 'B2' };
    window.excelFunctions.applyBorderType('all');
    const bd = s.data['A1'].format.borders;
    return bd.top.style !== 'none' && bd.bottom.style !== 'none' && bd.left.style !== 'none' && bd.right.style !== 'none';
  });
  const outer = await page.evaluate(() => {
    const s = window.spreadsheet; s.selectedRange = { start: 'A1', end: 'B2' };
    window.excelFunctions.applyBorderType('none');
    window.excelFunctions.applyBorderType('outer');
    const a1 = s.data['A1'].format.borders;
    // l'angolo in alto a sinistra ha solo top+left, NON i lati interni
    return a1.top.style !== 'none' && a1.left.style !== 'none' && a1.right.style === 'none' && a1.bottom.style === 'none';
  });
  ok('"tutti i bordi" applica i 4 lati su ogni cella', allB);
  ok('"bordi esterni" applica solo il perimetro (range-aware)', outer);

  // 5b) Rimozione bordi ("Nessun bordo")
  const removed = await page.evaluate(() => {
    const s = window.spreadsheet; s.selectCell('A1'); s.selectedRange = { start: 'A1', end: 'A1' };
    window.excelFunctions.applyBorderType('all', 'thin', '#000000');
    window.excelFunctions.applyBorderType('none');
    const bd = s.data['A1'].format.borders;
    const el = document.querySelector('[data-cell="A1"]');
    return bd.top.style === 'none' && (el.style.borderTop === '' || el.style.borderTop === 'none');
  });
  ok('"Nessun bordo" rimuove i bordi applicati', removed);

  // 5d) Coerenza: il tab "Bordo" di Formato celle usa lo stesso selettore visuale
  const fcBorder = await page.evaluate(() => {
    window.excelFunctions.showFormatDialog();
    const tab = [...document.querySelectorAll('.fc-tab')].find((t) => t.textContent.trim() === 'Bordo');
    if (!tab) return { same: false };
    tab.click();
    const host = document.getElementById('fc-border-host');
    const same = !!(host && host.querySelector('.bp-color') && host.querySelectorAll('.border-preset').length >= 8 && host.querySelector('.bstyle'));
    document.getElementById('format-cells-modal')?.remove();
    return { same };
  });
  ok('Formato celle ▸ Bordo usa lo stesso selettore visuale del ribbon', fcBorder.same);

  // 5c) Stile linea (spessore/tratteggio) rispettato
  const dashed = await page.evaluate(() => {
    const s = window.spreadsheet; s.selectCell('C5'); s.selectedRange = { start: 'C5', end: 'C5' };
    window.excelFunctions.applyBorderType('all', 'dashed', '#ff0000');
    const el = document.querySelector('[data-cell="C5"]');
    return /dashed/.test(el.style.borderTop);
  });
  ok('stile linea (tratteggiata) applicato ai bordi', dashed);

  ok('nessun errore JavaScript durante l\'editing', jsErrors.length === 0);
  if (jsErrors.length) jsErrors.forEach((e) => console.log('   JS: ' + e));
} finally {
  await browser.close();
}

console.log(`\nEditing Excel: ${fail === 0 ? 'OK' : fail + ' verifiche fallite'}`);
process.exit(fail === 0 ? 0 : 1);
