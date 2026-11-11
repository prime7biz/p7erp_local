<#
.SYNOPSIS
  Run the production frontend (Nginx + installable mobile app) locally next to the dev backend.

.DESCRIPTION
  Builds the frontend on this PC with VITE_PWA_ENABLED=true, packs it into an image made from the
  final stage of frontend/Dockerfile.prod (read from that file, so both stay the same), and starts it
  as container "p7-pwa-local" on http://localhost:8090, using the backend of `docker compose up`.

  The frontend is built on Windows instead of inside Docker because antivirus HTTPS scanning can
  break `npm ci` inside Docker (docs/BUILD_VERIFICATION.md). Test guide:
  docs/mobile-feasibility/LOCAL-AND-PHONE-TEST-GUIDE.md

.EXAMPLE
  ./scripts/mobile-app-local-test.ps1 -Version local-1
  ./scripts/mobile-app-local-test.ps1 -Version local-2 -Previous local-1   # simulate the next deploy
  ./scripts/mobile-app-local-test.ps1 -Stop
#>
param(
  [string]$Version = "local-1",
  [string]$Previous = "",
  [int]$Port = 8090,
  [switch]$Stop
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$container = "p7-pwa-local"
$imageRepo = "p7-pwa-local"

if ($Stop) {
  docker rm -f $container 2>$null | Out-Null
  Write-Host "Stopped $container."
  exit 0
}

$network = (docker network ls --format "{{.Name}}" | Where-Object { $_ -like "*p7erp_local_default" } | Select-Object -First 1)
if (-not $network) { throw "Start the dev stack first: docker compose up -d (network *_default not found)." }

Write-Host "==> Building frontend $Version with the mobile app switched on"
Push-Location (Join-Path $repo "frontend")
try {
  $env:VITE_PWA_ENABLED = "true"
  $env:VITE_APP_VERSION = $Version
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
} finally {
  Remove-Item Env:VITE_PWA_ENABLED, Env:VITE_APP_VERSION -ErrorAction SilentlyContinue
  Pop-Location
}

$ctx = Join-Path $env:TEMP "p7-pwa-local-context"
Remove-Item -Recurse -Force $ctx -ErrorAction SilentlyContinue
New-Item -ItemType Directory $ctx | Out-Null
Copy-Item -Recurse (Join-Path $repo "frontend/dist") (Join-Path $ctx "dist")
Copy-Item (Join-Path $repo "frontend/nginx.prod.conf") $ctx
$assets = Get-ChildItem -File (Join-Path $ctx "dist/assets") | ForEach-Object { "assets/" + $_.Name } | Sort-Object
[IO.File]::WriteAllText((Join-Path $ctx "release-assets.txt"), (($assets -join "`n") + "`n"))

# Final stage of frontend/Dockerfile.prod, with the build stage replaced by the files built above.
$lines = Get-Content (Join-Path $repo "frontend/Dockerfile.prod")
$start = ($lines | Select-String -SimpleMatch "AS previous").LineNumber
if (-not $start) { throw "Could not find the 'AS previous' stage in frontend/Dockerfile.prod" }
$final = $lines[($start - 1)..($lines.Count - 1)] |
  ForEach-Object { $_ -replace "COPY --from=build /app/dist ", "COPY dist " -replace "COPY --from=build /app/release-assets.txt ", "COPY release-assets.txt " }
$header = @("# syntax=docker/dockerfile:1", "ARG PREVIOUS_FRONTEND_IMAGE=nginx:1.27-alpine")
[IO.File]::WriteAllText((Join-Path $ctx "Dockerfile"), (($header + $final) -join "`n") + "`n")

$previousImage = if ($Previous) { "${imageRepo}:$Previous" } else { "nginx:1.27-alpine" }
Write-Host "==> Building image ${imageRepo}:$Version (previous release files from $previousImage)"
docker build -t "${imageRepo}:$Version" --build-arg "PREVIOUS_FRONTEND_IMAGE=$previousImage" $ctx
if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

docker rm -f $container 2>$null | Out-Null
docker run -d --name $container --network $network -p "${Port}:80" "${imageRepo}:$Version" | Out-Null
Write-Host ""
Write-Host "Running $Version on http://localhost:$Port  (stop with: ./scripts/mobile-app-local-test.ps1 -Stop)"
Write-Host "Check: http://localhost:$Port/version.json"
