#!/usr/bin/env bash
# Restore drill: restore a P7 ERP dump into a THROWAWAY isolated PostgreSQL container and validate it.
# It never touches the live database (the source DB is only read for comparison counts).
#
# Steps: start pgvector container (no published ports, no network) -> pg_restore -> compare alembic version,
# table count and per-table row counts against the source -> write a report -> remove the container.
#
# Usage (from repo root):
#   COMPOSE_FILE=docker-compose.prod.yml bash scripts/db_restore_test.sh [path/to/p7erp_XXXX.dump]
# Env:
#   COMPOSE_FILE   compose file of the SOURCE database (default docker-compose.yml)
#   PG_SERVICE     postgres service (default postgres)
#   BACKUP_DIR     where dumps live (default ./backups/db); latest dump used if no argument
#   PG_IMAGE       image for the drill (default pgvector/pgvector:pg16)
#   COMPARE_SOURCE true|false — compare row counts with the source DB (default true; differences are
#                  expected if the source changed after the dump was taken)
set -Eeuo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
PG_SERVICE="${PG_SERVICE:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-./backups/db}"
PG_IMAGE="${PG_IMAGE:-pgvector/pgvector:pg16}"
COMPARE_SOURCE="${COMPARE_SOURCE:-true}"

dump="${1:-$(ls -1t "$BACKUP_DIR"/p7erp_*.dump 2>/dev/null | head -n1 || true)}"
[[ -n "$dump" && -f "$dump" ]] || { echo "No dump found (BACKUP_DIR=$BACKUP_DIR)" >&2; exit 2; }

name="p7erp_restore_drill_$(date -u +%Y%m%d%H%M%S)"
report_dir="${BACKUP_DIR}/restore_reports"
mkdir -p "$report_dir"
report="${report_dir}/${name}.txt"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

exact_counts() {  # $1 = command prefix that runs psql reading SQL from stdin
  "$@" <<'SQL'
SELECT format('%s|%s', t.tablename,
  (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', t.tablename), false, true, '')))[1]::text)
FROM pg_tables t WHERE t.schemaname = 'public' ORDER BY t.tablename;
SQL
}

pw="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
docker run -d --name "$name" --network none -e POSTGRES_PASSWORD="$pw" -e POSTGRES_DB=restore_check "$PG_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -U postgres -d restore_check >/dev/null 2>&1 && break
  sleep 1
done
sleep 2

start_s="$(date +%s)"
docker cp "$dump" "$name":/tmp/restore.dump
set +e
docker exec "$name" pg_restore -U postgres -d restore_check --no-owner --no-privileges --exit-on-error /tmp/restore.dump
rc=$?
set -e
restore_s=$(( $(date +%s) - start_s ))

drill_psql() { docker exec -i "$name" psql -U postgres -d restore_check -qtA -v ON_ERROR_STOP=1; }
src_psql() { docker compose -f "$COMPOSE_FILE" exec -T "$PG_SERVICE" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qtA -v ON_ERROR_STOP=1'; }

restored_version="$(echo "SELECT version_num FROM alembic_version;" | drill_psql | tr -d '[:space:]' || true)"
restored_tables="$(echo "SELECT count(*) FROM pg_tables WHERE schemaname='public';" | drill_psql | tr -d '[:space:]' || true)"
exact_counts drill_psql >"${report}.restored_counts"

status="PASS"
[[ "$rc" -eq 0 && -n "$restored_version" ]] || status="FAIL"
diff_note="not compared"
if [[ "$COMPARE_SOURCE" == "true" ]]; then
  src_version="$(echo "SELECT version_num FROM alembic_version;" | src_psql | tr -d '[:space:]')"
  exact_counts src_psql >"${report}.source_counts"
  mismatches="$(diff "${report}.source_counts" "${report}.restored_counts" | grep -c '^[<>]' || true)"
  diff_note="source_version=${src_version} table_rows_mismatched_lines=${mismatches}"
  [[ "$src_version" == "$restored_version" ]] || status="FAIL"
fi

{
  echo "restore_drill=${name}"
  echo "dump=$(basename "$dump") dump_bytes=$(stat -c %s "$dump") dump_sha256=$(sha256sum "$dump" | awk '{print $1}')"
  echo "pg_restore_exit=${rc} restore_seconds=${restore_s}"
  echo "restored_alembic_version=${restored_version} restored_public_tables=${restored_tables}"
  echo "comparison: ${diff_note}"
  echo "result=${status}"
} | tee "$report"
rm -f "${report}.source_counts" "${report}.restored_counts"
[[ "$status" == "PASS" ]]
