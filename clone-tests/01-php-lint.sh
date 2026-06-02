#!/usr/bin/env bash
# Lint di TUTTI i file PHP del progetto (php -l). Nessuna dipendenza esterna.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v php >/dev/null 2>&1; then
  echo "⚠ PHP non disponibile: lint PHP SALTATO."
  exit 0
fi

echo "── Lint PHP (php -l) ──"
fail=0
count=0
while IFS= read -r f; do
  count=$((count+1))
  out="$(php -l "$f" 2>&1)"
  if ! echo "$out" | grep -q "No syntax errors"; then
    echo "✗ $f"
    echo "    $out"
    fail=$((fail+1))
  fi
done < <(find "$ROOT" -path "$ROOT/data" -prune -o -path "*/node_modules/*" -prune -o -name "*.php" -print)

echo ""
if [ "$fail" -eq 0 ]; then
  echo "PHP: $count file, 0 errori di sintassi."
else
  echo "PHP: $fail file con errori su $count."
  exit 1
fi
