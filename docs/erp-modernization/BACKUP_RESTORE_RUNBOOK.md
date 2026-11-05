# Backup and restore runbook

Owner: platform operator. Applies to local Docker Compose and the production server.
Tools added on 2026-11-03 (remediation stage 1). No credentials are stored in these scripts; PostgreSQL tools
run inside the `postgres` container using that container's own `POSTGRES_USER` / `POSTGRES_DB`.

## Tools

| Script | Platform | Purpose |
|---|---|---|
| `scripts/db_backup.sh` | Linux server (bash + Docker Compose) | `pg_dump` custom-format backup, archive verification, SHA-256, retention, status row in `backup_jobs`, optional off-site hook |
| `scripts/db_backup.ps1` | Windows / local | Same behaviour (binary-safe copy via `docker compose cp`) |
| `scripts/db_restore_test.sh` | Linux server | Restore drill into a throwaway container with no network; compares Alembic version and exact per-table row counts with the source |
| `scripts/db_restore_test.ps1` | Windows / local | Same behaviour |

Dumps are written to `./backups/db/` (git-ignored). Restore reports go to `./backups/db/restore_reports/` and contain
only table names, counts, sizes and checksums.

## Daily backup (production)

```bash
cd /home/primeadmin/p7erp_local
COMPOSE_FILE=docker-compose.prod.yml BACKUP_DIR=/var/backups/p7erp RETENTION_DAYS=14 \
  POST_BACKUP_HOOK=/usr/local/bin/p7erp-offsite-copy \
  bash scripts/db_backup.sh
```

- Schedule with cron or a systemd timer (e.g. 02:30 daily). Keep `BACKUP_DIR` outside the repository, owned by the
  operator account, mode `700`.
- `POST_BACKUP_HOOK` is any executable that receives the dump path (for example an `rclone copy` to encrypted
  off-site storage). It is **not configured yet** — off-site storage is an outstanding decision.
- Each run inserts a `backup_jobs` row (`running` → `completed` with size + checksum, or `failed`). Tenant admins see
  this in **Settings → Backup & Restore**. Set `REGISTER_IN_APP=false` to skip registration.

## Restore drill (monthly, and before risky migrations)

```bash
COMPOSE_FILE=docker-compose.prod.yml BACKUP_DIR=/var/backups/p7erp bash scripts/db_restore_test.sh
```

Pass criteria: `pg_restore_exit=0`, restored Alembic version equals source, `table_rows_mismatched_lines=0`
(small differences are expected only if the live database changed after the dump; re-run against an idle copy if needed).
Record the `restore_seconds` value as the measured restore time.

## Real restore (incident)

1. Stop writers: `docker compose -f docker-compose.prod.yml stop backend worker beat frontend`.
2. Keep the current database: rename it (`ALTER DATABASE p7erp RENAME TO p7erp_before_restore_<date>`) instead of dropping it.
3. Create an empty database with the original name, then
   `docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d p7erp --no-owner --exit-on-error /tmp/<dump>`
   (copy the dump into the container first with `docker compose cp`).
4. Run `docker compose exec backend alembic current` — must show the expected head.
5. Start services, run the smoke checks in `docs/DEPLOYMENT_PROCESS.md`, then announce.
6. Keep `p7erp_before_restore_<date>` until the business confirms; it is the rollback.

## Evidence — local drill on 2026-11-03

| Run | Dump | Restore | Validation | Result |
|---|---|---|---|---|
| PowerShell scripts (Windows host) | 3,784,950 bytes, SHA-256 recorded, 3.3 s | `pg_restore` exit 0 in **27.7 s** into an isolated `--network none` container | Alembic 243 = 243; 356 public tables; 94,065 rows; per-table counts identical (0 mismatches) | PASS |
| Bash scripts (run from a `docker:27-cli` container against the same Compose project) | 3,785,036 bytes, 3 s | exit 0 in **29 s** | Alembic 243 = 243; 0 per-table mismatches | PASS |
| Failure path | First PowerShell attempt failed on a stderr-handling bug | — | Partial dump deleted; `backup_jobs` row marked `failed` with a credential-free message | Failure correctly reported, then fixed |

Local RPO with a daily schedule ≈ 24 h; measured local RTO for the database restore step ≈ 30 s (dataset of ~94k rows).
**Production RPO/RTO are not measured** — see "Outstanding" below.

## In-app backup behaviour

- **Settings → Backup & Restore** (tenant admins) now reads real `backup_jobs` rows and shows one of
  `Requested`, `Running`, `Completed`, `Failed`, `Unavailable`. "Request backup" records a request only.
- In-app restore returns HTTP 501 with an explanation; restores are operator-run (above).
- The platform-admin "full backup" job now records `failed` with a clear message when `pg_dump` is not installed in the
  API container (it is not), instead of hanging in `running`.

## Outstanding (production)

- Confirm whether any host-level backup already exists and when it was last restored.
- Install the cron/systemd schedule on the server and configure the off-site hook (encrypted storage, retention).
- Run the restore drill on the production host (ideally against a copy) and record production RPO/RTO.
- Decide whether to add `postgresql-client` to the API image (enables the platform-admin backup button) or keep
  backups host-side only (recommended).
