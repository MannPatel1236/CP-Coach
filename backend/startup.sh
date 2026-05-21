#!/bin/bash
set -e
if [ -n "$DATABASE_URL" ]; then
  echo "DATABASE_URL detected. Assuming cloud environment."
  PORT_NUM=${PORT:-8000}
  echo "Starting server on port $PORT_NUM..."
  exec uvicorn main:app --host 0.0.0.0 --port "$PORT_NUM"
fi

echo "Waiting for postgres..."
until pg_isready -h db -U cpuser -d cpcoach 2>/dev/null; do
  echo "Postgres not ready, waiting..."
  sleep 2
done
echo "Postgres ready. Running schema..."
PGPASSWORD=cppass psql -h db -U cpuser -d cpcoach -f /app/db/schema.sql
echo "Schema applied. Starting server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000

