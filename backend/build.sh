#!/usr/bin/env bash
set -o errexit

echo "Installing dependencies..."
pip install -r requirements.txt

echo "Collecting static files..."
DJANGO_SETTINGS_MODULE=config.settings.production \
  ALLOWED_HOSTS="${ALLOWED_HOSTS:-.up.railway.app}" \
  python manage.py collectstatic --noinput

echo "Running migrations..."
python manage.py migrate --noinput

echo "Seeding data..."
python manage.py setup_base_data

echo "Build complete."
