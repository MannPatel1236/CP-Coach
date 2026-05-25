#!/bin/bash
set -e

# Detect cloud/production — skip local PG if any cloud indicator is present
if [ -n "$DATABASE_URL" ] || [ -n "$SKIP_LOCAL_DB" ] || [ "$RENDER" = "true" ]; then
  echo "Cloud/production mode detected. Skipping local PostgreSQL."
  PORT_NUM=${PORT:-8000}
  echo "Starting server on port $PORT_NUM..."
  exec uvicorn main:app --host 0.0.0.0 --port "$PORT_NUM"
fi

# Local Docker development: wait for the local `db` service (max 30s)
echo "Waiting for postgres..."
WAIT=0
while [ $WAIT -lt 30 ] && ! pg_isready -h db -U cpuser -d cpcoach 2>/dev/null; do
  echo "Postgres not ready, waiting... (${WAIT}s)"
  sleep 2
  WAIT=$((WAIT + 2))
done

if ! pg_isready -h db -U cpuser -d cpcoach 2>/dev/null; then
  echo "Local PostgreSQL not available after 30s. Starting server anyway (cloud mode fallback)."
  exec uvicorn main:app --host 0.0.0.0 --port 8000
fi
echo "Postgres ready. Running schema..."
if [ -z "$POSTGRES_PASSWORD" ] || [ -z "$POSTGRES_USER" ]; then
  echo "ERROR: POSTGRES_PASSWORD and POSTGRES_USER must be set for local DB init"
  exit 1
fi
PGPASSWORD="$POSTGRES_PASSWORD" psql -h db -U "$POSTGRES_USER" -d cpcoach -f /app/db/schema.sql
echo "Schema applied. Starting server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
