#!/usr/bin/env bash
set -euo pipefail

cd /app

if [[ ! -f .env ]]; then
  cp .env.docker.example .env
fi

until pg_isready -h "${DJANGO_DB_HOST:-db}" -p "${DJANGO_DB_PORT:-5432}" -U "${DJANGO_DB_USER:-postgres}" >/dev/null 2>&1; do
  sleep 1
done

python manage.py migrate --noinput

if ! pgrep -f "manage.py runserver 0.0.0.0:8000" >/dev/null 2>&1; then
  nohup python manage.py runserver 0.0.0.0:8000 > /tmp/django-runserver.log 2>&1 &
  echo "Django runserver started at http://localhost:8000"
  echo "Logs: /tmp/django-runserver.log"
else
  echo "Django runserver already running."
fi
