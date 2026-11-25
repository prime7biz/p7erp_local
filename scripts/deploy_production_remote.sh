#!/usr/bin/env bash
# Run on the live server as primeadmin (manual SSH; see docs/DEPLOYMENT_PROCESS.md).
# Usage: ./scripts/deploy_production_remote.sh v1.25.1
#
# Application-only release. It never pulls or recreates postgres, redis, ollama or watchtower.
# Order:
#   lock -> pull new images -> check infrastructure -> stop beat and drain Celery
#   -> stop worker -> write image pins -> start backend (applies migrations)
#   -> start worker and beat -> replace frontend -> verify.
#
# Failure rules:
#   * Stopped before the image pins change: beat and worker are restarted on the current release,
#     then the script exits 1. Nothing else changed.
#   * Pins changed and NO migration could have run (database already at the release head): the
#     previous pins from .env.previous-release are restored automatically.
#   * A migration ran, or its status is unknown: nothing is restarted automatically. The script
#     prints the recovery steps. Old code must never run against a migrated schema.
#
# A short restart of the backend is expected. Health checks and host Nginx reduce the impact;
# this script does not promise zero downtime.
set -euo pipefail

TAG="${1:-}"
if [[ -z "${TAG}" ]]; then
  echo "ERROR: missing release tag (e.g. v1.25.1)" >&2
  exit 1
fi
if [[ ! "${TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9]+)*$ ]]; then
  echo "ERROR: release tag must look like v1.25.1 (got '${TAG}')" >&2
  exit 1
fi

APP_DIR="${DEPLOY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
COMPOSE_FILE="docker-compose.prod.yml"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/p7erp-deploy.lock}"
DRAIN_TIMEOUT_SECONDS="${DRAIN_TIMEOUT_SECONDS:-900}"
DEPLOY_POLL_SECONDS="${DEPLOY_POLL_SECONDS:-5}"
DEPLOY_HEALTH_ATTEMPTS="${DEPLOY_HEALTH_ATTEMPTS:-36}"
NEW_BACKEND="prime7biz/p7erp-backend:${TAG}"
NEW_FRONTEND="prime7biz/p7erp-frontend:${TAG}"

cd "${APP_DIR}"

dc() { docker compose -f "${COMPOSE_FILE}" "$@"; }

for tool in docker flock; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "ERROR: ${tool} not found in PATH" >&2
    exit 1
  fi
done
if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose plugin not available" >&2
  exit 1
fi

# Only one deploy may run on this server at a time.
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "ERROR: another deploy is already running on this server (lock: ${LOCK_FILE})." >&2
  exit 1
fi

echo "==> Deploy ${TAG} in ${APP_DIR} (user=$(whoami))"
echo "    Expect a short backend restart. Infrastructure containers are not touched."

echo "==> git fetch + fast-forward main"
git fetch origin main
git checkout main
git pull --ff-only origin main

touch .env

# --- helpers ---------------------------------------------------------------------------------

read_env_value() {  # file key -> value (empty if missing)
  grep "^$2=" "$1" 2>/dev/null | tail -n1 | cut -d= -f2- || true
}

write_release_pins() {  # backend frontend version: atomic replace of the three pin lines
  local backend="$1" frontend="$2" version="$3" tmp
  tmp="${APP_DIR}/.env.tmp.$$"
  grep -v -E '^(BACKEND_IMAGE|FRONTEND_IMAGE|APP_VERSION)=' .env > "${tmp}" || true
  printf 'BACKEND_IMAGE=%s\nFRONTEND_IMAGE=%s\nAPP_VERSION=%s\n' "${backend}" "${frontend}" "${version}" >> "${tmp}"
  chmod --reference=.env "${tmp}" 2>/dev/null || chmod 600 "${tmp}"
  mv -f "${tmp}" .env
}

is_running() {  # service -> success when the container exists and is running
  local cid
  cid="$(dc ps -a -q "$1" 2>/dev/null | head -n1 || true)"
  [[ -n "${cid}" && "$(docker inspect -f '{{.State.Running}}' "${cid}" 2>/dev/null || true)" == "true" ]]
}

service_health() {  # service -> healthy|unhealthy|starting|running|stopped|missing
  local cid
  cid="$(dc ps -a -q "$1" 2>/dev/null | head -n1 || true)"
  if [[ -z "${cid}" ]]; then
    echo "missing"
    return 0
  fi
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{if .State.Running}}running{{else}}stopped{{end}}{{end}}' "${cid}" 2>/dev/null || echo "unknown"
}

db_revision() {  # prints the revision applied in the database, or nothing if unreadable
  dc exec -T backend alembic current 2>/dev/null | awk 'NF {print $1; exit}' || true
}

image_head_revision() {  # image -> the single Alembic head shipped in that image
  docker run --rm --entrypoint alembic "$1" heads 2>/dev/null | awk 'NF {print $1; exit}' || true
}

backend_is_healthy() {
  dc exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5)" >/dev/null 2>&1
}

wait_for_backend() {
  local i
  for ((i = 1; i <= DEPLOY_HEALTH_ATTEMPTS; i++)); do
    if backend_is_healthy; then
      return 0
    fi
    echo "   waiting for backend (${i}/${DEPLOY_HEALTH_ATTEMPTS})..."
    sleep "${DEPLOY_POLL_SECONDS}"
  done
  return 1
}

backend_version() {
  dc exec -T backend python -c "import json, urllib.request; print(json.load(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5)).get('version', ''))" 2>/dev/null \
    | tr -d '\r' | awk 'NF {print $1; exit}' || true
}

frontend_version() {
  dc exec -T frontend wget -qO- http://127.0.0.1/version.json 2>/dev/null \
    | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' | head -n1 || true
}

# Counts running plus prefetched Celery tasks on live workers. Prints a number or "unknown".
read -r -d '' CELERY_COUNT_PY <<'PY' || true
from app.common.celery_app import celery_app
i = celery_app.control.inspect(timeout=5)
a = i.active()
r = i.reserved()
if a is None or r is None:
    print("unknown")
else:
    print(sum(len(v) for v in a.values()) + sum(len(v) for v in r.values()))
PY

celery_busy_count() {
  dc exec -T worker python -c "${CELERY_COUNT_PY}" 2>/dev/null | awk 'NF {print $1; exit}' || true
}

wait_for_celery_drain() {
  if ! is_running worker; then
    echo "   worker is not running; nothing to drain"
    return 0
  fi
  local deadline count
  deadline=$((SECONDS + DRAIN_TIMEOUT_SECONDS))
  while :; do
    count="$(celery_busy_count)"
    if [[ "${count}" == "0" ]]; then
      echo "   no running or reserved Celery tasks"
      return 0
    fi
    echo "   Celery busy: ${count:-unknown} (timeout ${DRAIN_TIMEOUT_SECONDS}s)"
    if (( SECONDS >= deadline )); then
      return 1
    fi
    sleep "${DEPLOY_POLL_SECONDS}"
  done
}

# --- previous release (saved before anything changes) ----------------------------------------

PREV_PINS_AVAILABLE=0
prev_backend="$(read_env_value .env BACKEND_IMAGE)"
prev_frontend="$(read_env_value .env FRONTEND_IMAGE)"
prev_version="$(read_env_value .env APP_VERSION)"
if [[ -n "${prev_backend}" && -n "${prev_frontend}" ]]; then
  tmp=".env.previous-release.tmp.$$"
  printf 'BACKEND_IMAGE=%s\nFRONTEND_IMAGE=%s\nAPP_VERSION=%s\n' "${prev_backend}" "${prev_frontend}" "${prev_version}" > "${tmp}"
  mv -f "${tmp}" .env.previous-release
  PREV_PINS_AVAILABLE=1
  echo "==> previous release saved in .env.previous-release (${prev_version:-unknown})"
else
  echo "WARNING: no previous release pins in .env; automatic rollback will not be available." >&2
fi

restore_previous_pins() {
  write_release_pins \
    "$(read_env_value .env.previous-release BACKEND_IMAGE)" \
    "$(read_env_value .env.previous-release FRONTEND_IMAGE)" \
    "$(read_env_value .env.previous-release APP_VERSION)"
}

# --- failure handling after the pins changed -----------------------------------------------

MIGRATION_REQUIRED="unknown"
DB_REV_BEFORE=""
NEW_HEAD=""

release_failed() {
  local reason="$1"
  echo "ERROR: ${reason}" >&2
  if [[ "${MIGRATION_REQUIRED}" == "false" && "${PREV_PINS_AVAILABLE}" == "1" ]]; then
    # Database was already at the release head, so no migration could have changed the schema.
    echo "==> no migration was needed: restoring the previous release automatically" >&2
    if ! restore_previous_pins; then
      echo "CRITICAL: could not restore .env from .env.previous-release. Fix .env by hand before starting services." >&2
      exit 1
    fi
    if ! dc up -d --no-deps backend worker beat frontend; then
      echo "CRITICAL: could not start the previous release. Run: docker compose -f ${COMPOSE_FILE} up -d --no-deps backend worker beat frontend" >&2
      exit 1
    fi
    if wait_for_backend; then
      echo "==> previous release (${prev_version:-unknown}) is running again" >&2
    else
      echo "CRITICAL: the previous release did not become healthy. Investigate on the server." >&2
    fi
    exit 1
  fi
  cat >&2 <<EOF
==> STOP: automatic rollback is NOT safe for this release.
    migration_required=${MIGRATION_REQUIRED}; database revision before: ${DB_REV_BEFORE:-unknown}; release head: ${NEW_HEAD:-unknown}.
    Worker and beat are left stopped on purpose, so old code cannot run against a migrated schema.
    Recovery (on the server, as primeadmin):
      1. Check state:            docker compose -f ${COMPOSE_FILE} ps
      2. Restore the pre-release database backup (docs/erp-modernization/BACKUP_RESTORE_RUNBOOK.md).
      3. Copy BACKEND_IMAGE, FRONTEND_IMAGE and APP_VERSION from .env.previous-release into .env.
      4. Start the previous application services:
         docker compose -f ${COMPOSE_FILE} up -d --no-deps backend worker beat frontend
EOF
  exit 1
}

# --- pre-change restore: beat and worker come back if we stop before the pins change --------

PRE_MUTATION=0
restore_before_pin_change() {
  local rc=$?
  if [[ "${PRE_MUTATION}" == "1" ]]; then
    echo "==> release stopped before the image pins changed; restarting worker and beat" >&2
    dc up -d --no-deps worker beat >&2 || true
    if ! is_running beat; then
      echo "CRITICAL: beat is NOT running. Start it: docker compose -f ${COMPOSE_FILE} up -d --no-deps beat" >&2
    fi
  fi
  exit "${rc}"
}
trap restore_before_pin_change EXIT

# --- 1. pull the new application images ------------------------------------------------------

echo "==> pull new application images (backend image also serves worker and beat)"
docker pull "${NEW_BACKEND}"
docker pull "${NEW_FRONTEND}"

# --- 2. infrastructure must be healthy before anything is touched ----------------------------

echo "==> check infrastructure (postgres, redis, ollama must be healthy)"
for svc in postgres redis ollama; do
  health="$(service_health "${svc}")"
  if [[ "${health}" != "healthy" ]]; then
    echo "ERROR: ${svc} is '${health}', not healthy. Release stopped before any change." >&2
    exit 1
  fi
  echo "    ${svc}: healthy"
done

# --- 3. migration state ----------------------------------------------------------------------

DB_REV_BEFORE="$(db_revision)"
NEW_HEAD="$(image_head_revision "${NEW_BACKEND}")"
if [[ -n "${DB_REV_BEFORE}" && -n "${NEW_HEAD}" ]]; then
  if [[ "${DB_REV_BEFORE}" == "${NEW_HEAD}" ]]; then
    MIGRATION_REQUIRED="false"
  else
    MIGRATION_REQUIRED="true"
  fi
fi
echo "    database revision: ${DB_REV_BEFORE:-unknown}; release head: ${NEW_HEAD:-unknown}; migration_required=${MIGRATION_REQUIRED}"

# --- 4. stop beat, drain Celery, stop worker (trap restores them if we stop early) -------------

PRE_MUTATION=1

echo "==> stop beat (no new scheduled jobs)"
dc stop beat

echo "==> drain Celery (timeout ${DRAIN_TIMEOUT_SECONDS}s)"
if ! wait_for_celery_drain; then
  echo "ERROR: Celery did not drain in time. Release stopped before any change; beat and worker are restored." >&2
  exit 1
fi

echo "==> stop worker"
dc stop --timeout 60 worker

# --- 5. change the image pins (atomic) -------------------------------------------------------

echo "==> write release pins to .env (atomic)"
write_release_pins "${NEW_BACKEND}" "${NEW_FRONTEND}" "${TAG}"
PRE_MUTATION=0

# --- 6. backend (applies migrations on start) -----------------------------------------------

echo "==> start backend (applies migrations on start)"
dc up -d --no-deps backend || release_failed "could not start the backend container"

echo "==> wait for backend /health"
wait_for_backend || release_failed "backend did not become healthy in time"

version="$(backend_version)"
if [[ "${version}" != "${TAG}" ]]; then
  release_failed "backend reports version '${version:-?}', expected '${TAG}'"
fi

DB_REV_AFTER="$(db_revision)"
if [[ -z "${NEW_HEAD}" || "${DB_REV_AFTER}" != "${NEW_HEAD}" ]]; then
  release_failed "database revision is '${DB_REV_AFTER:-unknown}', expected release head '${NEW_HEAD:-unknown}'"
fi
echo "    database revision: ${DB_REV_AFTER}"

# --- 7. worker, beat, frontend ---------------------------------------------------------------

echo "==> start worker and beat on the new release"
dc up -d --no-deps worker beat || release_failed "could not start worker and beat"
if ! is_running worker || ! is_running beat; then
  release_failed "worker or beat is not running after start"
fi

echo "==> replace frontend"
dc up -d --no-deps frontend || release_failed "could not start the frontend container"
if ! dc exec -T frontend wget -qO /dev/null http://127.0.0.1/ >/dev/null 2>&1; then
  release_failed "frontend container is not serving pages"
fi

frontend_ver="$(frontend_version)"
echo "    backend=${version} frontend=${frontend_ver:-?} expected=${TAG}"
if [[ -z "${frontend_ver}" ]]; then
  echo "WARNING: frontend has no version.json (image built before the mobile app work); skipped" >&2
elif [[ "${frontend_ver}" != "${TAG}" ]]; then
  release_failed "frontend reports version '${frontend_ver}', expected '${TAG}'"
fi

echo "==> alembic current"
dc exec -T backend alembic current

echo "==> deploy complete: ${TAG}"
