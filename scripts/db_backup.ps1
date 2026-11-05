<#
.SYNOPSIS
  PostgreSQL backup for P7 ERP on Windows / local Docker Compose (same behaviour as scripts/db_backup.sh).

.DESCRIPTION
  1. Records a "running" row in backup_jobs so Settings -> Backup shows real status.
  2. Runs pg_dump (custom format) inside the postgres container, verifies it with pg_restore --list,
     copies it to the host with "docker compose cp" (binary-safe), and removes the temp copy.
  3. Writes size + SHA-256, marks backup_jobs "completed" (or "failed"), prunes old dumps.
  No credentials are stored or printed: pg tools use the container's POSTGRES_USER / POSTGRES_DB.
  Dumps contain business data. The default folder .\backups\db is git-ignored.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\db_backup.ps1
#>
param(
  [string]$ComposeFile = "docker-compose.yml",
  [string]$PgService = "postgres",
  [string]$BackupDir = ".\backups\db",
  [int]$RetentionDays = 14,
  [bool]$RegisterInApp = $true
)
# Native tools write progress to stderr; failures are detected via $LASTEXITCODE, not stderr text.
$ErrorActionPreference = "Continue"

function Invoke-Psql([string]$Sql) {
  $out = $Sql | docker compose -f $ComposeFile exec -T $PgService sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1 -qtA'
  if ($LASTEXITCODE -ne 0) { throw "psql failed" }
  return ($out | Out-String).Trim()
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$ts = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$name = "p7erp_$ts.dump"
$final = Join-Path $BackupDir $name
$inContainer = "/tmp/$name"
$jobId = $null
$sw = [System.Diagnostics.Stopwatch]::StartNew()

try {
  if ($RegisterInApp) {
    $jobId = Invoke-Psql "INSERT INTO backup_jobs (backup_type, status, started_at, created_at) VALUES ('full','running', now() at time zone 'utc', now() at time zone 'utc') RETURNING id;"
  }
  docker compose -f $ComposeFile exec -T $PgService sh -c "pg_dump -U `$POSTGRES_USER -d `$POSTGRES_DB --format=custom --no-password --file=$inContainer"
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
  docker compose -f $ComposeFile exec -T $PgService pg_restore --list $inContainer | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "archive verification failed" }
  docker compose -f $ComposeFile cp "${PgService}:$inContainer" $final 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "copy from container failed" }

  $size = (Get-Item $final).Length
  $sum = (Get-FileHash -Algorithm SHA256 $final).Hash.ToLower()
  "$sum  $name" | Set-Content -Encoding ascii "$final.sha256"
  if ($jobId) {
    Invoke-Psql "UPDATE backup_jobs SET status='completed', file_name='$name', size_bytes=$size, checksum='$sum', completed_at=now() at time zone 'utc', expires_at=(now() at time zone 'utc') + interval '$RetentionDays days' WHERE id=$jobId;" | Out-Null
  }
  Get-ChildItem $BackupDir -Filter "p7erp_*.dump*" -File |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
    Remove-Item -Force
  Write-Output ("BACKUP OK file={0} size_bytes={1} sha256={2} seconds={3:N1}" -f $final, $size, $sum, $sw.Elapsed.TotalSeconds)
}
catch {
  if (Test-Path "$final") { Remove-Item -Force "$final" }
  if ($jobId) {
    try { Invoke-Psql "UPDATE backup_jobs SET status='failed', file_name='$name', error_message='Backup script failed (see operator log).', completed_at=now() at time zone 'utc' WHERE id=$jobId;" | Out-Null } catch {}
  }
  Write-Error "BACKUP FAILED: $($_.Exception.Message)"
  exit 1
}
finally {
  docker compose -f $ComposeFile exec -T $PgService rm -f $inContainer 2>$null | Out-Null
}
