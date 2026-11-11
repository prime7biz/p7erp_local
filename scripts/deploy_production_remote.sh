#!/usr/bin/env bash
# Run on the live server as primeadmin (manual SSH; see docs/DEPLOYMENT_PROCESS.md).
# Usage: ./scripts/deploy_production_remote.sh v1.7.0
set -euo pipefail

TAG="${1:-}"
if [[ -z "${TAG}" ]]; then
  echo "ERROR: missing release tag (e.g. v1.7.0)" >&2
  exit 1
fi
if [[ ! "${TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9]+)*$ ]]; then
  echo "ERROR: release tag must look like v1.7.0 (got '${TAG}')" >&2
  exit 1
fi

APP_DIR="${DEPLOY_PATH:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "${APP_DIR}"

echo "==> Deploy ${TAG} in ${APP_DIR} (user=$(whoami))"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not found in PATH" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: docker compose plugin not available" >&2
  exit 1
fi

echo "==> git fetch + fast-forward main"
git fetch origin main
git checkout main
git pull --ff-only origin main

touch .env
# Remember the running release so a failed deploy can be rolled back by hand (see the message below).
# Not restored automatically: the new backend may already have migrated the database.
prev_backend=$(grep '^BACKEND_IMAGE=' .env | tail -n1 | cut -d= -f2- || true)
prev_frontend=$(grep '^FRONTEND_IMAGE=' .env | tail -n1 | cut -d= -f2- || true)
prev_version=$(grep '^APP_VERSION=' .env | tail -n1 | cut -d= -f2- || true)
if [[ -n "${prev_backend}" && -n "${prev_frontend}" ]]; then
  {
    echo "BACKEND_IMAGE=${prev_backend}"
    echo "FRONTEND_IMAGE=${prev_frontend}"
    echo "APP_VERSION=${prev_version}"
  } > .env.previous-release
  echo "==> previous release saved in .env.previous-release (${prev_version:-unknown})"
fi

print_rollback_help() {
  if [[ -f .env.previous-release ]]; then
    echo "    Roll back to the previous release (only if its code accepts the current database):" >&2
    echo "      ./scripts/deploy_production_remote.sh $(grep '^APP_VERSION=' .env.previous-release | cut -d= -f2-)" >&2
  fi
}

sed -i '/^BACKEND_IMAGE=/d;/^FRONTEND_IMAGE=/d;/^APP_VERSION=/d' .env
{
  echo "BACKEND_IMAGE=prime7biz/p7erp-backend:${TAG}"
  echo "FRONTEND_IMAGE=prime7biz/p7erp-frontend:${TAG}"
  echo "APP_VERSION=${TAG}"
} >> .env

echo "==> docker compose pull"
docker compose -f docker-compose.prod.yml pull

echo "==> docker compose up -d"
docker compose -f docker-compose.prod.yml up -d

echo "==> wait for backend /health"
ready=0
for i in $(seq 1 36); do
  if docker compose -f docker-compose.prod.yml exec -T backend python -c \
    "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5)" \
    >/dev/null 2>&1; then
    ready=1
    break
  fi
  echo "   waiting for backend (${i}/36)..."
  sleep 5
done
if [[ "${ready}" -ne 1 ]]; then
  echo "ERROR: backend did not become healthy in time" >&2
  docker compose -f docker-compose.prod.yml ps
  docker compose -f docker-compose.prod.yml logs --tail=80 backend || true
  print_rollback_help
  exit 1
fi

echo "==> check running versions"
backend_version=$(docker compose -f docker-compose.prod.yml exec -T backend python -c \
  "import json, urllib.request; print(json.load(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5)).get('version', ''))" \
  2>/dev/null | tr -d '\r' || true)
if ! docker compose -f docker-compose.prod.yml exec -T frontend wget -qO /dev/null http://127.0.0.1/ >/dev/null 2>&1; then
  echo "ERROR: frontend container is not serving pages" >&2
  docker compose -f docker-compose.prod.yml ps
  print_rollback_help
  exit 1
fi
frontend_version=$(docker compose -f docker-compose.prod.yml exec -T frontend wget -qO- http://127.0.0.1/version.json \
  2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' || true)
echo "    backend=${backend_version:-?} frontend=${frontend_version:-?} expected=${TAG}"
if [[ "${backend_version}" != "${TAG}" ]]; then
  echo "ERROR: backend reports version '${backend_version}', expected '${TAG}'" >&2
  print_rollback_help
  exit 1
fi
if [[ -z "${frontend_version}" ]]; then
  echo "WARNING: frontend has no version.json (image built before the mobile app work); skipped" >&2
elif [[ "${frontend_version}" != "${TAG}" ]]; then
  echo "ERROR: frontend reports version '${frontend_version}', expected '${TAG}'" >&2
  print_rollback_help
  exit 1
fi

echo "==> alembic current"
docker compose -f docker-compose.prod.yml exec -T backend alembic current

echo "==> deploy complete: ${TAG}"
