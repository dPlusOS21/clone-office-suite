#!/usr/bin/env bash
# Genera un certificato SSL self-signed per lo sviluppo locale (HTTPS).
# Crea: ssl/cert.pem (certificato) + ssl/key.pem (chiave privata) + ssl/server.pem (combinato).
#
# NB: la chiave privata e il certificato NON vanno mai pubblicati (sono in .gitignore).
# Per la produzione usa un certificato vero (es. Let's Encrypt) o l'HTTPS del tuo hosting.
set -eu
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAYS="${1:-825}"

if ! command -v openssl >/dev/null 2>&1; then
  echo "✗ openssl non disponibile."; exit 1
fi

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$DIR/key.pem" -out "$DIR/cert.pem" -days "$DAYS" \
  -subj "/C=IT/ST=Italia/L=Locale/O=Clone Office Suite/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null

cat "$DIR/cert.pem" "$DIR/key.pem" > "$DIR/server.pem"
chmod 600 "$DIR/key.pem" "$DIR/server.pem"

echo "✔ Certificato generato (valido $DAYS giorni):"
echo "   $DIR/cert.pem  (certificato)"
echo "   $DIR/key.pem   (chiave privata — NON pubblicare)"
echo "   $DIR/server.pem (combinato, per socat/stunnel)"
echo ""
echo "È self-signed: il browser mostrerà un avviso la prima volta (accetta l'eccezione)."
