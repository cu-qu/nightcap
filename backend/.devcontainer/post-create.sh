#!/usr/bin/env bash
set -euo pipefail

cd /app

if [[ ! -f .env ]]; then
  cp .env.docker.example .env
  echo "Created .env from .env.docker.example"
fi

echo "Waiting for PostgreSQL..."
until pg_isready -h "${DJANGO_DB_HOST:-db}" -p "${DJANGO_DB_PORT:-5432}" -U "${DJANGO_DB_USER:-postgres}" >/dev/null 2>&1; do
  sleep 1
done

echo "Running migrations..."
python manage.py migrate --noinput

echo "Seeding base data..."
python manage.py setup_base_data

echo "Dev container setup complete."
