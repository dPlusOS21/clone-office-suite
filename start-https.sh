#!/usr/bin/env bash
# Avvia la suite in HTTPS in locale (transazioni cifrate).
#
# Il server PHP integrato non supporta il TLS, quindi usiamo socat come
# terminatore TLS davanti a PHP:
#     browser --HTTPS--> socat (porta 8443) --HTTP--> php -S (porta 8000)
#
# Uso:  ./start-https.sh            # https://localhost:8443
#       ./start-https.sh 9443 9000  # porte HTTPS e HTTP personalizzate
set -eu
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTTPS_PORT="${1:-8443}"
HTTP_PORT="${2:-8000}"
CERT="$DIR/ssl/server.pem"

command -v php   >/dev/null 2>&1 || { echo "✗ PHP non installato (sudo apt install php-cli)."; exit 1; }
command -v socat >/dev/null 2>&1 || { echo "✗ socat non installato (sudo apt install socat)."; exit 1; }

# Genera il certificato se manca
[ -f "$CERT" ] || { echo "→ Genero il certificato SSL..."; bash "$DIR/ssl/make-cert.sh"; }

# Avvia PHP solo in locale (non esposto: lo raggiunge solo socat)
php -S 127.0.0.1:"$HTTP_PORT" -t "$DIR" >/dev/null 2>&1 &
PHP_PID=$!
trap 'kill $PHP_PID 2>/dev/null' EXIT

echo "✔ Suite in HTTPS:  https://localhost:$HTTPS_PORT/index.html"
echo "  (certificato self-signed: accetta l'avviso del browser la prima volta)"
echo "  Premi Ctrl+C per fermare."
socat OPENSSL-LISTEN:"$HTTPS_PORT",cert="$CERT",verify=0,reuseaddr,fork TCP:127.0.0.1:"$HTTP_PORT"
