#!/usr/bin/env bash
set -euo pipefail

port_open() {
  python - <<PY
import socket
s = socket.socket()
s.settimeout(0.3)
try:
    s.connect(("127.0.0.1", int("${1}")))
except OSError:
    raise SystemExit(1)
finally:
    s.close()
PY
}

cd /workspace/backend

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

if [[ ! -f /workspace/mobile/.env ]]; then
  cp /workspace/mobile/.env.example /workspace/mobile/.env
fi

until pg_isready -h "${DJANGO_DB_HOST:-db}" -p "${DJANGO_DB_PORT:-5432}" -U "${DJANGO_DB_USER:-postgres}" >/dev/null 2>&1; do
  sleep 1
done

python manage.py migrate --noinput

# Leave port 8002 free for Run and Debug → Django: runserver (debug)
if pgrep -f "manage.py runserver 0.0.0.0:8002" >/dev/null 2>&1; then
  echo "Django runserver already running at http://localhost:8002"
else
  echo "Django is not started. Use Run and Debug → Django: runserver (debug)"
fi

cd /workspace/mobile
if port_open 8082; then
  echo "Expo already listening on 8082"
else
  nohup npx expo start --port 8082 --host lan >/tmp/nightcap-mobile.log 2>&1 &
  echo "Expo Metro started at http://localhost:8082"
  echo "Logs: /tmp/nightcap-mobile.log"
fi

cat <<'EOF'

NightCap is up
API:   start via Run and Debug → Django: runserver (debug) (http://localhost:8002)
Docs:  http://localhost:8002/api/docs/
Expo:  http://localhost:8082

EOF
