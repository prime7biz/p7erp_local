#!/usr/bin/env bash
# Mocked tests for scripts/deploy_production_remote.sh.
# No real Docker, no SSH, no server: a fake `docker` (plus fake `git` / `flock`) records every call
# and models Celery, the database revision, backend health and infrastructure health.
#
# Run from the repo root inside the backend image (Linux, has bash, sed, grep):
#   docker run --rm --entrypoint bash -v "<repo>:/repo" -w /repo p7erp_local-backend scripts/tests/deploy_production_remote.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="${HERE}/../deploy_production_remote.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
PASS=0
FAIL=0

mkdir -p "${WORK}/bin"

cat > "${WORK}/bin/docker" <<'STUB'
#!/usr/bin/env bash
# Fake docker. Behaviour comes from env vars and state files in STUB_DIR.
S="${STUB_DIR:?}"
app_version() { grep '^APP_VERSION=' .env 2>/dev/null | tail -n1 | cut -d= -f2-; }
echo "docker $*" >> "${S}/log.txt"

if [[ "$1" == "compose" && "$2" == "version" ]]; then exit 0; fi
if [[ "$1" == "pull" ]]; then exit 0; fi
if [[ "$1" == "run" ]]; then echo "${STUB_NEW_HEAD:-}"; exit 0; fi
if [[ "$1" == "inspect" ]]; then
  fmt="$3"; cid="$4"; svc="${cid#cid-}"
  if [[ "${fmt}" == *Health* ]]; then
    case " ${STUB_UNHEALTHY:-} " in *" ${svc} "*) echo unhealthy ;; *) echo healthy ;; esac
  else
    if grep -qx "${svc}" "${S}/stopped.txt"; then echo false; else echo true; fi
  fi
  exit 0
fi

if [[ "$1" == "compose" ]]; then
  shift 3   # compose -f <file>
  case "$1" in
    ps)
      echo "cid-${*: -1}"; exit 0 ;;
    stop)
      echo "${*: -1}" >> "${S}/stopped.txt"; exit 0 ;;
    up)
      for svc in "${@:4}"; do
        grep -vx "${svc}" "${S}/stopped.txt" > "${S}/stopped.tmp" 2>/dev/null || true
        mv "${S}/stopped.tmp" "${S}/stopped.txt"
      done
      if printf '%s\n' "${@:4}" | grep -qx backend; then
        if [[ -n "${STUB_MIGRATE_TAG:-}" && "$(app_version)" == "${STUB_MIGRATE_TAG}" ]]; then
          echo "${STUB_NEW_HEAD}" > "${S}/db_rev.txt"
        fi
      fi
      exit 0 ;;
    exec)
      svc="$3"; cmd="${*:4}"; rc=0
      case "${svc}" in
        backend)
          case "${cmd}" in
            *"alembic current"*) cat "${S}/db_rev.txt" ;;
            *json*) app_version ;;
            *urlopen*) [[ "$(app_version)" != "${STUB_BAD_TAG:-__none__}" ]] || rc=1 ;;
          esac ;;
        worker)
          first="$(head -n1 "${S}/tasks.txt" 2>/dev/null || true)"
          if [[ -n "${first}" ]]; then sed -i '1d' "${S}/tasks.txt"; echo "${first}"; else echo 0; fi ;;
        frontend)
          case "${cmd}" in *version.json*) echo "{\"version\":\"$(app_version)\"}" ;; esac ;;
      esac
      exit "${rc}" ;;
  esac
  exit 0
fi
exit 0
STUB
chmod +x "${WORK}/bin/docker"

printf '#!/usr/bin/env bash\nexit 0\n' > "${WORK}/bin/git"
printf '#!/usr/bin/env bash\nexit 0\n' > "${WORK}/bin/flock"
chmod +x "${WORK}/bin/git" "${WORK}/bin/flock"

check() {  # description, command...
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "    PASS: ${desc}"
    PASS=$((PASS + 1))
  else
    echo "    FAIL: ${desc}"
    FAIL=$((FAIL + 1))
  fi
}

# run_scenario NAME [ENV=VALUE ...]
# Starting state comes from the globals START_DB_REV (default 338) and START_TASKS (default 0 = no busy tasks).
# Sets DIR (scenario folder), RC (exit code) and OUT (combined output).
run_scenario() {
  local name="$1"
  shift
  DIR="${WORK}/${name}"
  mkdir -p "${DIR}"
  printf 'BACKEND_IMAGE=prime7biz/p7erp-backend:v1.24.0\nFRONTEND_IMAGE=prime7biz/p7erp-frontend:v1.24.0\nAPP_VERSION=v1.24.0\nPOSTGRES_PASSWORD=keep-me\n' > "${DIR}/.env"
  : > "${DIR}/log.txt"
  : > "${DIR}/stopped.txt"
  printf '%s\n' "${START_DB_REV:-338}" > "${DIR}/db_rev.txt"
  if [[ "${START_TASKS:-0}" == "busy" ]]; then
    for _ in $(seq 1000); do echo 1; done > "${DIR}/tasks.txt"
  else
    : > "${DIR}/tasks.txt"
  fi
  OUT="$(env PATH="${WORK}/bin:${PATH}" DEPLOY_PATH="${DIR}" STUB_DIR="${DIR}" \
    DEPLOY_LOCK_FILE="${DIR}/lock" DEPLOY_POLL_SECONDS=0 DEPLOY_HEALTH_ATTEMPTS=2 \
    DRAIN_TIMEOUT_SECONDS=0 "$@" bash "${SCRIPT}" v1.25.1 2>&1)"
  RC=$?
  printf '%s\n' "${OUT}" > "${DIR}/out.txt"
}

no_infra_touched() { ! grep -Eq '(stop|up|pull) .*(postgres|redis|ollama|watchtower)' "$1/log.txt"; }
env_pin_count() { grep -c '^BACKEND_IMAGE=' "$1/.env"; }

echo "Scenario 1a: release without migration succeeds"
run_scenario s1a STUB_NEW_HEAD=338
check "exit code 0 (got ${RC})" test "${RC}" -eq 0
check "backend pin points at v1.25.1" grep -qx 'BACKEND_IMAGE=prime7biz/p7erp-backend:v1.25.1' "${DIR}/.env"
check "unrelated secret kept in .env" grep -qx 'POSTGRES_PASSWORD=keep-me' "${DIR}/.env"
check "exactly one BACKEND_IMAGE line" test "$(env_pin_count "${DIR}")" -eq 1
check "no infrastructure service pulled, stopped or started" no_infra_touched "${DIR}"
check "beat and worker running at the end" test ! -s "${DIR}/stopped.txt"
check "output reports migration_required=false" grep -q 'migration_required=false' "${DIR}/out.txt"

echo "Scenario 1b: release with migration succeeds and reaches the release head"
START_DB_REV=337 run_scenario s1b STUB_NEW_HEAD=338 STUB_MIGRATE_TAG=v1.25.1
check "exit code 0 (got ${RC})" test "${RC}" -eq 0
check "database now at release head 338" grep -qx '338' "${DIR}/db_rev.txt"
check "output reports migration_required=true" grep -q 'migration_required=true' "${DIR}/out.txt"

echo "Scenario 2: Celery never drains -> abort before any change, beat restored"
START_TASKS=busy run_scenario s2 STUB_NEW_HEAD=338
check "exit code 1 (got ${RC})" test "${RC}" -eq 1
check "pins unchanged (still v1.24.0)" grep -qx 'APP_VERSION=v1.24.0' "${DIR}/.env"
check "worker never stopped for the release" bash -c "! grep -q 'stop --timeout 60 worker' '${DIR}/log.txt'"
check "beat restarted after the abort" grep -q 'up -d --no-deps worker beat' "${DIR}/log.txt"
check "nothing left stopped" test ! -s "${DIR}/stopped.txt"
check "no infrastructure service touched" no_infra_touched "${DIR}"

echo "Scenario 3: migration ran, backend unhealthy -> no automatic rollback, recovery printed"
START_DB_REV=337 run_scenario s3 STUB_NEW_HEAD=338 STUB_MIGRATE_TAG=v1.25.1 STUB_BAD_TAG=v1.25.1
check "exit code 1 (got ${RC})" test "${RC}" -eq 1
check "new pins kept (no automatic downgrade)" grep -qx 'APP_VERSION=v1.25.1' "${DIR}/.env"
check "worker and beat left stopped" bash -c "grep -qx worker '${DIR}/stopped.txt' && grep -qx beat '${DIR}/stopped.txt'"
check "recovery steps printed" grep -q 'automatic rollback is NOT safe' "${DIR}/out.txt"

echo "Scenario 4: no migration, backend unhealthy -> previous pins restored automatically"
run_scenario s4 STUB_NEW_HEAD=338 STUB_BAD_TAG=v1.25.1
check "exit code 1 (got ${RC})" test "${RC}" -eq 1
check "previous pins restored atomically" grep -qx 'BACKEND_IMAGE=prime7biz/p7erp-backend:v1.24.0' "${DIR}/.env"
check "secret kept after restore" grep -qx 'POSTGRES_PASSWORD=keep-me' "${DIR}/.env"
check "application services restarted on previous release" grep -q 'up -d --no-deps backend worker beat frontend' "${DIR}/log.txt"
check "nothing left stopped" test ! -s "${DIR}/stopped.txt"
check "output says previous release is running again" grep -q 'running again' "${DIR}/out.txt"

echo "Scenario 5: Ollama unhealthy -> stop before any change"
run_scenario s5 STUB_NEW_HEAD=338 STUB_UNHEALTHY=ollama
check "exit code 1 (got ${RC})" test "${RC}" -eq 1
check "beat never stopped" bash -c "! grep -q 'stop beat' '${DIR}/log.txt'"
check "pins unchanged" grep -qx 'APP_VERSION=v1.24.0' "${DIR}/.env"

echo
echo "Result: ${PASS} passed, ${FAIL} failed"
if [[ "${FAIL}" -ne 0 ]]; then
  exit 1
fi
