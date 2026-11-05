#!/usr/bin/env bash
# PostgreSQL backup for P7 ERP (Linux server / any host with Docker Compose).
#
# What it does:
#   1. Records a "running" row in backup_jobs so Settings → Backup shows real status.
#   2. Runs pg_dump (custom format) INSIDE the postgres container, streaming to the host.
#   3. Verifies the archive is readable (pg_restore --list), computes size + SHA-256.
#   4. Marks the backup_jobs row "completed" (or "failed"), deletes dumps older than RETENTION_DAYS.
#   5. Optionally runs POST_BACKUP_HOOK "<file>" (e.g. an rclone/S3 copy you configure) for an off-site copy.
#
# Credentials: none are stored here. pg_dump/psql run inside the postgres container using its own
# POSTGRES_USER / POSTGRES_DB environment (local socket). Dumps contain business data: keep BACKUP_DIR
# outside the Git repo or in an ignored folder (default ./backups/db is git-ignored), chmod 700.
#
# Usage (from repo root):
#   COMPOSE_FILE=docker-compose.prod.yml bash scripts/db_backup.sh
# Env:
#   COMPOSE_FILE      compose file (default docker-compose.yml)
#   PG_SERVICE        postgres service name (default postgres)
#   BACKUP_DIR        output directory (default ./backups/db)
#   RETENTION_DAYS    delete local dumps older than this (default 14)
#   REGISTER_IN_APP   true|false — write status rows to backup_jobs (default true)
#   POST_BACKUP_HOOK  optional command; receives the dump path as $1
set -Eeuo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
PG_SERVICE="${PG_SERVICE:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-./backups/db}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
REGISTER_IN_APP="${REGISTER_IN_APP:-true}"

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }
psql_c() {
  dc exec -T "$PG_SERVICE" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -qtA' <<<"$1"
}

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" || true

ts="$(date -u +%Y%m%dT%H%M%SZ)"
name="p7erp_${ts}.dump"
final="${BACKUP_DIR}/${name}"
partial="${final}.partial"
job_id=""

register_start() {
  [[ "$REGISTER_IN_APP" == "true" ]] || return 0
  job_id="$(psql_c "INSERT INTO backup_jobs (backup_type, status, started_at, created_at)
    VALUES ('full', 'running', now() at time zone 'utc', now() at time zone 'utc') RETURNING id;" | tr -d '[:space:]')" || job_id=""
}

register_end() {
  local status="$1" size="${2:-NULL}" sum="${3:-}" msg="${4:-}"
  [[ "$REGISTER_IN_APP" == "true" && -n "$job_id" ]] || return 0
  local sum_sql="NULL" msg_sql="NULL"
  [[ -n "$sum" ]] && sum_sql="'${sum}'"
  [[ -n "$msg" ]] && msg_sql="'${msg//\'/}'"
  psql_c "UPDATE backup_jobs SET status='${status}', file_name='${name}', size_bytes=${size},
    checksum=${sum_sql}, error_message=${msg_sql}, completed_at=now() at time zone 'utc',
    expires_at=(now() at time zone 'utc') + interval '${RETENTION_DAYS} days' WHERE id=${job_id};" >/dev/null || true
}

on_error() {
  rm -f "$partial"
  register_end "failed" "NULL" "" "Backup script failed (see server log)."
  echo "BACKUP FAILED" >&2
}
trap on_error ERR

start_s="$(date +%s)"
register_start

dc exec -T "$PG_SERVICE" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-password' >"$partial"
dc exec -T "$PG_SERVICE" pg_restore --list <"$partial" >/dev/null

mv "$partial" "$final"
size="$(stat -c %s "$final")"
sum="$(sha256sum "$final" | awk '{print $1}')"
echo "$sum  $name" >"${final}.sha256"
register_end "completed" "$size" "$sum" ""

find "$BACKUP_DIR" -maxdepth 1 -name 'p7erp_*.dump*' -type f -mtime +"$RETENTION_DAYS" -delete || true

if [[ -n "${POST_BACKUP_HOOK:-}" ]]; then
  "$POST_BACKUP_HOOK" "$final"
fi

echo "BACKUP OK file=${final} size_bytes=${size} sha256=${sum} seconds=$(( $(date +%s) - start_s ))"
