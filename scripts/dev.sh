#!/usr/bin/env bash
# Install deps, build workspace packages, generate cert if missing, and
# start the openDAW studio dev server from inside this repo (apps/openDAW).
#
# Usage:  bash scripts/dev.sh [--no-build]
#
# Options:
#   --no-build   Skip `bun run build` (use only after the first build, or
#                when nothing in packages/ has changed).
set -euo pipefail
cd "$(dirname "$0")/.."

do_build=1
for arg in "$@"; do
  case "$arg" in
    --no-build) do_build=0 ;;
    -h|--help)
      sed -n '2,9p' "$0"
      exit 0
      ;;
  esac
done

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies (this can take a few minutes on first run)..."
  bun install
fi

if [[ ! -f certs/localhost.pem || ! -f certs/localhost-key.pem ]]; then
  bash scripts/gen-cert.sh
fi

# Pre-flight: warn if backend is unreachable. Dev server still starts
# (openDAW loads fine), but generation/LoRA/MIDI calls will fail until
# the backend is up. This avoids the bad UX of "I started the studio
# and it just hangs" without forcing a hard coupling.
API_TARGET="${AUTOMIDI_API_URL:-http://localhost:8000}"
if ! curl -sf -m 2 "${API_TARGET}/api/lora-checkpoint/status" >/dev/null 2>&1 \
   && ! curl -sf -m 2 "${API_TARGET}/api/health" >/dev/null 2>&1; then
    echo "⚠  AutoMIDI backend not reachable at ${API_TARGET}"
    echo "   Start it:  cd apps/backend && redis-server & uv run uvicorn main:app --reload"
    echo "   (The dev server still starts; generation calls will fail until backend is up.)"
fi

if [[ "$do_build" == "1" ]]; then
  echo "Building workspace packages (skipped on subsequent runs with --no-build)..."
  bun run build
fi

echo
echo "openDAW studio: https://localhost:8080"
echo "Press Ctrl+C to stop."
echo
exec bun run dev:studio