# Clone Office Suite — Test

Test di **regressione** della suite. Da eseguire **prima di ogni aggiornamento del
repository** (git push): se sono tutti verdi, le modifiche non hanno rotto nulla.

> Questa cartella contiene **solo i test**, non una copia della suite. I test
> puntano ai file reali del progetto nella cartella superiore.

## Cosa verifica

| Livello | File | Dipendenze | Cosa controlla |
|--------|------|-----------|----------------|
| 1. Lint PHP | `01-php-lint.sh` | PHP CLI | Sintassi di **tutti** i `.php` del progetto |
| 2. Statico | `02-static-checks.mjs` | Node | File presenti, **marcatori di funzionalità** di ogni app, guide, JSON validi, modalità demo, fix timezone |
| 3. Browser | `03-browser-smoke.mjs` | Node + Chrome + puppeteer-core | Ogni app si carica in **demo** senza errori JS, niente overlay di accesso, titolo presente |

I livelli 1 e 2 girano **senza rete e senza browser** (sempre disponibili). Il
livello 3 si attiva solo se Chrome e `puppeteer-core` sono presenti, altrimenti
viene saltato senza far fallire la suite.

## Uso

```bash
cd clone-tests
npm install            # solo la prima volta (scarica puppeteer-core per i test browser)
npm test               # esegue tutti i test
npm run test:static    # solo lint PHP + statici (veloce, niente Chrome)
```

In alternativa, direttamente:

```bash
./run-tests.sh             # tutti i test
./run-tests.sh --static    # salta i test browser
```

Variabili d'ambiente opzionali:

- `CHROME_PATH` — percorso di Chrome (default `/usr/bin/google-chrome`)
- `TEST_PORT` — porta del server PHP avviato per i test browser (default `8771`)

## Aggiungere nuovi controlli

Modifica `lib/apps.mjs`: aggiungi l'app o nuovi **marcatori** (stringhe che
devono restare presenti nel sorgente, es. il nome di una funzione chiave). Così
un test fallisce se quella funzionalità viene rimossa per errore.
