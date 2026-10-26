#!/usr/bin/env bash
# pg_dump of the Studio database before a migration changes it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${STUDIO_BACKUP_DIR:-/var/backups/teachcode-studio}"

load_env() {
  local f="$1"
  if [[ -f "$f" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$f"
    set +a
  fi
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  load_env "$ROOT/.env.production.local"
  load_env "$ROOT/.env.local"
  load_env "$ROOT/.env.production"
  load_env "$ROOT/.env"
fi

if [[ "${DATABASE_MODE:-postgres}" == "sqlite" ]]; then
  echo "[studio-backup] ERROR: SQLite is not dumped by this script" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[studio-backup] ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/studio-premigrate.sql.gz"
TMP="$OUT.tmp"
trap 'rm -f "$TMP"' EXIT

echo "[studio-backup] replacing $OUT with the current database"
pg_dump "$DATABASE_URL" | gzip -c > "$TMP"
chmod 600 "$TMP"
mv -f "$TMP" "$OUT"
trap - EXIT
echo "[studio-backup] done"
