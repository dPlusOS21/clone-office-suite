#!/usr/bin/env bash
# ---------------------------------------------------------------
# Avvia in locale la Clone Office Suite (con backend PHP)
# Uso:  ./start.sh [porta]      (porta predefinita: 8000)
# ---------------------------------------------------------------
set -e

# Va nella cartella dello script (root del progetto)
cd "$(dirname "$0")"

PORT="${1:-8000}"
HOST="localhost"
URL="http://$HOST:$PORT/index.html"

# Verifica che PHP sia disponibile
if ! command -v php >/dev/null 2>&1; then
    echo "ERRORE: PHP non è installato. Installa con:  sudo apt install php-cli"
    exit 1
fi

# Controlla che la porta sia libera
if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":$PORT "; then
    echo "ERRORE: la porta $PORT è già in uso. Avvia con un'altra porta, es:  ./start.sh 8001"
    exit 1
fi

echo "============================================="
echo " Clone Office Suite"
echo " Server avviato su: $URL"
echo " Excel:  http://$HOST:$PORT/excel-clone/index.html"
echo " Premi CTRL+C per fermare il server."
echo "============================================="

# Apre il browser dopo un breve ritardo (non blocca il server)
( sleep 1; xdg-open "$URL" >/dev/null 2>&1 || true ) &

# Avvia il server PHP integrato sulla root del progetto
exec php -S "$HOST:$PORT"
