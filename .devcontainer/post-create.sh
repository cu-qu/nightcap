#!/usr/bin/env bash
set -euo pipefail

cd /workspace/backend

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created backend/.env from .env.example"
fi

if [[ ! -f /workspace/mobile/.env ]]; then
  cp /workspace/mobile/.env.example /workspace/mobile/.env
  echo "Created mobile/.env from .env.example"
fi

echo "Waiting for PostgreSQL..."
until pg_isready -h "${DJANGO_DB_HOST:-db}" -p "${DJANGO_DB_PORT:-5432}" -U "${DJANGO_DB_USER:-postgres}" >/dev/null 2>&1; do
  sleep 1
done

echo "Running migrations..."
python manage.py migrate --noinput

echo "Seeding base data..."
python manage.py setup_base_data

echo "Installing Expo dependencies..."
cd /workspace/mobile
npm install --no-fund --no-audit

echo "Dev container setup complete."
