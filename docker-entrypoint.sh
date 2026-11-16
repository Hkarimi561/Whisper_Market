#!/bin/sh
# Wait for PostgreSQL, apply migrations, then start the game server.
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] applying database migrations (waiting for the database if needed)…"
  tries=0
  until node_modules/.bin/prisma migrate deploy; do
    tries=$((tries + 1))
    if [ "$tries" -ge 40 ]; then
      echo "[entrypoint] database is not reachable after $tries attempts, giving up" >&2
      exit 1
    fi
    echo "[entrypoint] database not ready (attempt $tries), retrying in 3s…"
    sleep 3
  done
else
  echo "[entrypoint] DATABASE_URL is not set: starting without persistence"
fi

echo "[entrypoint] starting Whisper Market"
exec node_modules/.bin/tsx server.ts
