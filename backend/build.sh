#!/usr/bin/env bash
set -o errexit

echo "Installing dependencies..."
pip install -r requirements.txt

export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-config.settings.production}"
if [ -z "${ALLOWED_HOSTS:-}" ]; then
  export ALLOWED_HOSTS="${RAILWAY_PUBLIC_DOMAIN:-.up.railway.app}"
fi

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Running migrations..."
python manage.py migrate --noinput

echo "Seeding data..."
python manage.py setup_base_data

echo "Build complete."
