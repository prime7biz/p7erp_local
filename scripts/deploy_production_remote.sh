#!/usr/bin/env bash
# Run on the live server as primeadmin (via GitHub Actions SSH + sudo).
# Usage: ./scripts/deploy_production_remote.sh v1.7.0
set -euo pipefail

TAG="${1:-}"
if [[ -z "${TAG}" ]]; then
  echo "ERROR: missing release tag (e.g. v1.7.0)" >&2
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
  exit 1
fi

echo "==> alembic current"
docker compose -f docker-compose.prod.yml exec -T backend alembic current

echo "==> deploy complete: ${TAG}"
