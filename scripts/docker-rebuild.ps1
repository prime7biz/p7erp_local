# P7 ERP – rebuild Compose images with Docker layer cache (fast day-to-day).
# Run from repo root:  .\scripts\docker-rebuild.ps1
# For a full clean rebuild (slow):  docker compose build --no-cache
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
docker compose build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker compose up -d
exit $LASTEXITCODE
