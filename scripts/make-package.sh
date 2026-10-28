#!/bin/sh
# Builds the zip for the web master: the contents of site/ at the zip root plus the docs.
set -e
cd "$(dirname "$0")/.."
OUT="$(pwd)/${1:-maxtrade-age-of-sail-package.zip}"
case "$1" in /*) OUT="$1";; esac
rm -f "$OUT"
(cd site && zip -qr -X "$OUT" .)
zip -q -j "$OUT" docs/01_INSTRUCTION_RU.docx docs/02_SI_TEXTS_FOR_PROOFREADING.docx docs/README.txt
echo "built $OUT"
