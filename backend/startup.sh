#!/bin/bash
set -e
echo "Waiting for postgres..."
until pg_isready -h db -U cpuser -d cpcoach 2>/dev/null; do
  echo "Postgres not ready, waiting..."
  sleep 2
done
echo "Postgres ready. Running schema..."
PGPASSWORD=cppass psql -h db -U cpuser -d cpcoach -f /app/db/schema.sql
echo "Schema applied. Starting server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
