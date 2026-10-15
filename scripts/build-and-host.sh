#!/usr/bin/env bash
# Build Content Studio, migrate its own database, reload pm2 + nginx.
# Does not seed users and does not migrate the student app.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '[studio-build-and-host] %s\n' "$*"; }

node_at_least() {
  local major minor
  IFS=. read -r major minor _ <<<"$(node -p "process.versions.node")"
  if (( major > 22 || (major == 22 && minor >= 13) )); then
    return 0
  fi
  return 1
}

# Next production load order, first match wins for DATABASE_MODE.
database_mode() {
  local file line
  if [[ -n "${DATABASE_MODE:-}" ]]; then
    printf '%s' "$DATABASE_MODE"
    return
  fi
  for file in \
    "$ROOT/.env.production.local" \
    "$ROOT/.env.local" \
    "$ROOT/.env.production" \
    "$ROOT/.env"
  do
    [[ -f "$file" ]] || continue
    line="$(grep -E '^DATABASE_MODE=' "$file" | tail -n 1 || true)"
    if [[ -n "$line" ]]; then
      printf '%s' "${line#DATABASE_MODE=}"
      return
    fi
  done
  printf '%s' "sqlite"
}

if ! command -v node >/dev/null 2>&1; then
  log "ERROR: node not found. Install Node 22.13 or newer."
  exit 1
fi

if ! node_at_least; then
  log "ERROR: Node $(node -p "process.versions.node") is too old. Install Node 22.13 or newer."
  exit 1
fi

if [[ ! -f "$ROOT/.env.production.local" && ! -f "$ROOT/.env.local" && ! -f "$ROOT/.env.production" && ! -f "$ROOT/.env" ]]; then
  log "WARNING: no env file. Copy .env.production.example to .env.production before a shared deploy."
fi

MODE="$(database_mode)"
MODE="${MODE//\"/}"
MODE="${MODE//\'/}"

if [[ "$MODE" == "postgres" ]]; then
  log "PostgreSQL mode. Migrations touch cms_* tables only. Demo users are not seeded."
elif [[ "$MODE" == "sqlite" ]]; then
  log "SQLite mode. This script will not init or seed the demo database."
else
  log "ERROR: DATABASE_MODE must be postgres or sqlite (got ${MODE})."
  exit 1
fi

if [[ ! -d "$ROOT/node_modules" ]]; then
  log "Installing npm dependencies…"
  npm install
fi

if ! swapon --show 2>/dev/null | grep -q .; then
  log "WARNING: no swap. On a 4G VM, Next builds often OOM-kill SSH."
  log "  Fix once (TeachCode repo): sudo /root/TeachCodeWithGenAI/scripts/ensure-swap.sh"
fi

log "Typecheck…"
npm run typecheck

# Free RAM for the compiler. Studio returns 502 briefly; student API stays up.
STOPPED_PM2=()
if command -v pm2 >/dev/null 2>&1; then
  for app in teachcode-studio teachcode-web; do
    if pm2 describe "$app" >/dev/null 2>&1; then
      log "Stopping $app for the build…"
      pm2 stop "$app" >/dev/null
      STOPPED_PM2+=("$app")
    fi
  done
fi

export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=1536"
log "Building Next.js…"
export NODE_ENV=production
npm run build

if [[ "$MODE" == "postgres" ]]; then
  log "Applying Studio migrations…"
  npm run db:migrate
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "ERROR: pm2 not found. Install with: npm i -g pm2"
  exit 1
fi

log "Starting/reloading pm2…"
mkdir -p /var/log/teachcode-studio
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy \
  SOCKS_PROXY SOCKS5_PROXY socks_proxy socks5_proxy GIT_HTTP_PROXY GIT_HTTPS_PROXY \
  || true
pm2 startOrReload "$ROOT/deploy/ecosystem.config.cjs" --update-env
if ((${#STOPPED_PM2[@]})); then
  for app in "${STOPPED_PM2[@]}"; do
    if [[ "$app" != "teachcode-studio" ]] && pm2 describe "$app" >/dev/null 2>&1; then
      pm2 start "$app" >/dev/null || true
    fi
  done
fi
pm2 save

NGINX_ENABLED="/etc/nginx/sites-enabled/teachcode-studio"
if [[ -w /etc/nginx/sites-enabled ]] || [[ "$(id -u)" -eq 0 ]]; then
  rm -f "$NGINX_ENABLED" /etc/nginx/sites-available/teachcode-studio
  nginx -t
  systemctl reload nginx
  log "retired public port 8080; Studio is https://codewithAI.hku.hk/studio/"
else
  log "WARNING: cannot update nginx (need root). Skipping port 8080 retirement."
fi

log "Health check…"

wait_http_ok() {
  local url="$1"
  local label="$2"
  local attempts="${3:-20}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -sf "$url" >/dev/null; then
      log "$label OK"
      return 0
    fi
    sleep 1
  done
  log "$label FAILED"
  return 1
}

wait_http_ok "http://127.0.0.1:3010/studio/api/v1/content/courses" "Studio content API :3010" 25 || true

log "Done. Public: https://codewithAI.hku.hk/studio/  (student app reads http://127.0.0.1:3010/studio)"
