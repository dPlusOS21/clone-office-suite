// Registro centrale delle app della suite e dei loro "marcatori" di funzionalità.
// I marcatori sono stringhe che DEVONO essere presenti nel sorgente: servono da
// guardia contro regressioni (se una funzione chiave sparisce, il test fallisce).
//
// Aggiungendo una nuova app o una nuova funzionalità importante, aggiorna qui.

export const APPS = [
  {
    id: 'hub',
    name: 'Hub / Launcher',
    file: 'index.html',
    extraFiles: ['js/auth.js', 'shared/app-launcher.js'],
    markers: ['app-access', 'paypal.com/donate', 'auth.js'],
    hasGuide: false,
  },
  {
    id: 'word',
    name: 'Clone-Word',
    file: 'word-clone/index.html',
    markers: ['function addComment', 'function applyHeaderFooter', 'auth.js'],
    hasGuide: true,
  },
  {
    id: 'excel',
    name: 'Clone-Excel',
    file: 'excel-clone/index.html',
    extraFiles: [
      'excel-clone/js/spreadsheet.js',
      'excel-clone/js/excel-functions.js',
      'excel-clone/js/excel-clone.js',
    ],
    markers: ['function initAuth', 'auth.js'],
    hasGuide: true,
  },
  {
    id: 'powerpoint',
    name: 'Clone-PowerPoint',
    file: 'powerpoint-clone/index.html',
    markers: ['function addSlide', 'function addShape', 'auth.js'],
    hasGuide: true,
  },
  {
    id: 'onenote',
    name: 'Clone-OneNote',
    file: 'onenote-clone/index.html',
    markers: ['function addPage', 'function applyZoom', 'function changeNotebookColor', 'auth.js'],
    hasGuide: true,
  },
  {
    id: 'outlook',
    name: 'Clone-Outlook',
    file: 'outlook-clone/index.html',
    markers: ['function addCalendarEvent', 'function applyDarkMode', 'function archiveCurrentEmail', 'auth.js'],
    hasGuide: true,
  },
  {
    id: 'onedrive',
    name: 'Clone-OneDrive',
    file: 'onedrive-clone/index.html',
    markers: ['function apiCall', 'function deletePermanent', 'auth.js'],
    hasGuide: true,
  },
  {
    id: 'powerbi',
    name: 'Clone-Power BI',
    file: 'powerbi-clone/index.html',
    markers: ['function addVisual', 'function bindCrossFilter', 'function changeVisualType', 'auth.js'],
    hasGuide: true,
  },
  {
    id: 'access',
    name: 'Clone-Access',
    file: 'access-clone/index.html',
    markers: [
      'function openRelationships',
      'function renderDesign',
      'function printAccessReport',
      'function sendToPowerBI',
      'function toggleRelFullscreen',
      'auth.js',
    ],
    hasGuide: true,
  },
];

// Cartella radice del progetto (clone-tests/ è dentro la root)
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..', '..');
