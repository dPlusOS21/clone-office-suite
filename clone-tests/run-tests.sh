#!/usr/bin/env bash
# Orchestratore dei test della Clone Office Suite.
# Esegue, in ordine:
#   1) Lint PHP            (sempre)
#   2) Test statici        (sempre, Node)
#   3) Test browser smoke  (se Chrome + puppeteer-core disponibili)
#
# Uso:
#   ./run-tests.sh            # tutti i test
#   ./run-tests.sh --static   # salta il browser (veloce, niente rete/Chrome)
#
# Esce con codice != 0 se un qualsiasi test fallisce: usalo PRIMA di
# aggiornare il repository (git push).
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
ONLY_STATIC=0
[ "${1:-}" = "--static" ] && ONLY_STATIC=1

RED=$'\e[31m'; GRN=$'\e[32m'; YEL=$'\e[33m'; BLD=$'\e[1m'; RST=$'\e[0m'
rc=0

echo "${BLD}═══ Clone Office Suite — Test Runner ═══${RST}"
echo ""

# 1) Lint PHP
bash "$DIR/01-php-lint.sh" || rc=1
echo ""

# 2) Test statici
if command -v node >/dev/null 2>&1; then
  node "$DIR/02-static-checks.mjs" || rc=1
else
  echo "${YEL}⚠ Node non disponibile: test statici e browser SALTATI.${RST}"
  ONLY_STATIC=1
fi
echo ""

# 3) Test browser
if [ "$ONLY_STATIC" -eq 0 ] && command -v node >/dev/null 2>&1; then
  PORT="${TEST_PORT:-8771}"
  PHP_OK=0
  if command -v php >/dev/null 2>&1; then
    php -S 127.0.0.1:"$PORT" -t "$ROOT" >/dev/null 2>&1 &
    PHP_PID=$!
    PHP_OK=1
    # attende che il server risponda
    for i in $(seq 1 20); do
      if curl -s -o /dev/null "http://127.0.0.1:$PORT/index.html"; then break; fi
      sleep 0.2
    done
  fi
  TEST_BASE_URL="http://127.0.0.1:$PORT" node "$DIR/03-browser-smoke.mjs" || rc=1
  echo ""
  if [ "$PHP_OK" -eq 1 ]; then
    TEST_BASE_URL="http://127.0.0.1:$PORT" node "$DIR/04-backend-auth.mjs" || rc=1
    echo ""
    TEST_BASE_URL="http://127.0.0.1:$PORT" node "$DIR/05-e2e-server-files.mjs" || rc=1
  else
    echo "${YEL}⚠ Test sicurezza backend e e2e saltati (PHP non disponibile).${RST}"
  fi
  if [ "$PHP_OK" -eq 1 ]; then kill "$PHP_PID" 2>/dev/null; fi
else
  [ "$ONLY_STATIC" -eq 1 ] && echo "${YEL}⚠ Browser smoke saltato (--static).${RST}"
fi

echo ""
if [ "$rc" -eq 0 ]; then
  echo "${GRN}${BLD}✔ TUTTI I TEST SUPERATI${RST}"
else
  echo "${RED}${BLD}✘ ALCUNI TEST FALLITI — non aggiornare il repository finché non sono verdi.${RST}"
fi
exit "$rc"
