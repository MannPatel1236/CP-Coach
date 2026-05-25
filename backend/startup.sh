#!/bin/bash
set -e

# Skip local Postgres setup when DATABASE_URL is set (production/cloud) or SKIP_LOCAL_DB is explicit
if [ -n "$DATABASE_URL" ] || [ -n "$SKIP_LOCAL_DB" ]; then
  echo "Cloud/production mode detected. Skipping local PostgreSQL."
  PORT_NUM=${PORT:-8000}
  echo "Starting server on port $PORT_NUM..."
  exec uvicorn main:app --host 0.0.0.0 --port "$PORT_NUM"
fi

# Local Docker development: wait for the local `db` service
echo "Waiting for postgres..."
until pg_isready -h db -U cpuser -d cpcoach 2>/dev/null; do
  echo "Postgres not ready, waiting..."
  sleep 2
done
echo "Postgres ready. Running schema..."
if [ -z "$POSTGRES_PASSWORD" ] || [ -z "$POSTGRES_USER" ]; then
  echo "ERROR: POSTGRES_PASSWORD and POSTGRES_USER must be set for local DB init"
  exit 1
fi
PGPASSWORD="$POSTGRES_PASSWORD" psql -h db -U "$POSTGRES_USER" -d cpcoach -f /app/db/schema.sql
echo "Schema applied. Starting server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
