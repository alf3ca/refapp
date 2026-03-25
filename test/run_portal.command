#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PORT=5000
URL="http://localhost:${PORT}/"

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

EXISTING_PID="$(lsof -i TCP:${PORT} -sTCP:LISTEN -t | head -n 1 || true)"
if [ -n "$EXISTING_PID" ]; then
  echo "Stopping existing server on port ${PORT} (PID: ${EXISTING_PID})..."
  kill "$EXISTING_PID" || true
  sleep 0.5
fi

echo "Starting referee portal server..."
npm start > portal.log 2>&1 &

for _ in {1..20}; do
  if curl -s "http://localhost:${PORT}/login" >/dev/null; then
    break
  fi
  sleep 0.5
done

echo "Opening ${URL}"
open "${URL}"

echo "Done. If needed, check logs in portal.log"
