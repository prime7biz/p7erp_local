<#
.SYNOPSIS
  Restore drill (Windows / local): restore a P7 ERP dump into a THROWAWAY isolated PostgreSQL container
  and validate it. Same behaviour as scripts/db_restore_test.sh. Never writes to the live database.

.DESCRIPTION
  Starts pgvector/pgvector:pg16 with --network none (no ports), runs pg_restore, compares the Alembic
  version, table count and exact per-table row counts with the source DB, writes a report under
  <BackupDir>\restore_reports, then removes the container. Reports contain only table names and counts.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\db_restore_test.ps1
#>
param(
  [string]$DumpPath = "",
  [string]$ComposeFile = "docker-compose.yml",
  [string]$PgService = "postgres",
  [string]$BackupDir = ".\backups\db",
  [string]$PgImage = "pgvector/pgvector:pg16",
  [bool]$CompareSource = $true
)
# Native tools write progress to stderr; failures are detected via $LASTEXITCODE, not stderr text.
$ErrorActionPreference = "Continue"

$countSql = @"
SELECT format('%s|%s', t.tablename,
  (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', t.tablename), false, true, '')))[1]::text)
FROM pg_tables t WHERE t.schemaname = 'public' ORDER BY t.tablename;
"@

if (-not $DumpPath) {
  $latest = Get-ChildItem $BackupDir -Filter "p7erp_*.dump" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) { Write-Error "No dump found in $BackupDir"; exit 2 }
  $DumpPath = $latest.FullName
}

$name = "p7erp_restore_drill_" + (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
$reportDir = Join-Path $BackupDir "restore_reports"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$report = Join-Path $reportDir "$name.txt"

function Drill-Psql([string]$Sql) {
  $out = $Sql | docker exec -i $name psql -U postgres -d restore_check -qtA -v ON_ERROR_STOP=1
  return ($out | Out-String).Trim()
}
function Source-Psql([string]$Sql) {
  $out = $Sql | docker compose -f $ComposeFile exec -T $PgService sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -qtA -v ON_ERROR_STOP=1'
  return ($out | Out-String).Trim()
}

$bytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$pw = ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""

try {
  docker run -d --name $name --network none -e "POSTGRES_PASSWORD=$pw" -e POSTGRES_DB=restore_check $PgImage | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "could not start drill container" }
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    docker exec $name pg_isready -U postgres -d restore_check 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "drill container not ready" }
  Start-Sleep -Seconds 2

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  docker cp $DumpPath "${name}:/tmp/restore.dump" 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "could not copy dump into drill container" }
  docker exec $name pg_restore -U postgres -d restore_check --no-owner --no-privileges --exit-on-error /tmp/restore.dump
  $rc = $LASTEXITCODE
  $sw.Stop()

  $restoredVersion = Drill-Psql "SELECT version_num FROM alembic_version;"
  $restoredTables = Drill-Psql "SELECT count(*) FROM pg_tables WHERE schemaname='public';"
  $restoredCounts = (Drill-Psql $countSql) -split "`r?`n"
  $restoredRows = ($restoredCounts | ForEach-Object { [int64](($_ -split '\|')[1]) } | Measure-Object -Sum).Sum

  $status = if ($rc -eq 0 -and $restoredVersion) { "PASS" } else { "FAIL" }
  $cmp = "not compared"
  if ($CompareSource) {
    $srcVersion = Source-Psql "SELECT version_num FROM alembic_version;"
    $srcCounts = (Source-Psql $countSql) -split "`r?`n"
    $mismatch = @(Compare-Object $srcCounts $restoredCounts).Count
    $cmp = "source_version=$srcVersion source_tables=$($srcCounts.Count) table_count_lines_mismatched=$mismatch"
    if ($srcVersion -ne $restoredVersion) { $status = "FAIL" }
  }

  $dumpItem = Get-Item $DumpPath
  $lines = @(
    "restore_drill=$name",
    "dump=$($dumpItem.Name) dump_bytes=$($dumpItem.Length) dump_sha256=$((Get-FileHash -Algorithm SHA256 $DumpPath).Hash.ToLower())",
    ("pg_restore_exit={0} restore_seconds={1:N1}" -f $rc, $sw.Elapsed.TotalSeconds),
    "restored_alembic_version=$restoredVersion restored_public_tables=$restoredTables restored_total_rows=$restoredRows",
    "comparison: $cmp",
    "result=$status"
  )
  $lines | Set-Content -Encoding ascii $report
  $lines | ForEach-Object { Write-Output $_ }
  if ($status -ne "PASS") { exit 1 }
}
finally {
  docker rm -f $name 2>$null | Out-Null
}
