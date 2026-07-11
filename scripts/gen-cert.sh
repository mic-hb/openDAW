#!/usr/bin/env bash
# Generate a self-signed cert for openDAW local dev.
# The browser will show a "not secure" warning that can be bypassed
# by clicking "Advanced" → "Proceed to localhost (unsafe)".
# For a trusted cert, install mkcert (https://github.com/FiloSottile/mkcert)
# and run `mkcert -install && mkcert localhost` instead.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p certs
if [[ -f certs/localhost.pem && -f certs/localhost-key.pem ]]; then
  echo "certs already exist, skipping"
  exit 0
fi
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout certs/localhost-key.pem \
  -out certs/localhost.pem \
  -days 825 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" 2>/dev/null
echo "Generated certs/localhost.pem and certs/localhost-key.pem"