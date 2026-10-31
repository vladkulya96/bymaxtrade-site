#!/bin/sh
# Builds the zip for an Apache/cPanel host (Hostko): the contents of site/ at the zip root,
# including .htaccess, without _headers (that file is only for Netlify/Cloudflare).
# Usage: scripts/make-hosting-zip.sh [output.zip]   (default: releases/maxtrade-site-hosting-YYYY-MM-DD.zip)
set -e
cd "$(dirname "$0")/.."
mkdir -p releases
OUT="${1:-releases/maxtrade-site-hosting-$(date +%F).zip}"
case "$OUT" in /*) ;; *) OUT="$(pwd)/$OUT";; esac
[ -e "$OUT" ] && { echo "exists: $OUT (choose another name)"; exit 1; }
(cd site && zip -qr -X "$OUT" . -x '_headers' -x '.DS_Store')
echo "built $OUT"
