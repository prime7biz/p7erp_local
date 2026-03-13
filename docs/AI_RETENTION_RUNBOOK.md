# AI Retention Runbook

## Purpose
Keep AI operational tables bounded and query performance stable while preserving tenant safety.

## Scope
Cleanup script currently targets:
- `ai_audit_logs`
- `ai_messages`
- `ai_tool_invocations`
- `ai_action_runs`
- `ai_anomaly_events`

## Safety Controls
- `--dry-run`: preview only, no deletes.
- `--tenant-id`: optional tenant-scoped cleanup.
- `--batch-size`: bounded delete chunk.
- `--max-delete`: hard stop across all tables.

## Recommended Procedure
1. Run dry-run first:
   - `python scripts/run_ai_retention_cleanup.py --dry-run --retention-days 180`
2. Review candidate counts and choose batch settings.
3. Run scoped pilot on one tenant:
   - `python scripts/run_ai_retention_cleanup.py --tenant-id <TENANT_ID> --retention-days 180 --batch-size 500 --max-delete 2000`
4. Verify:
   - `python scripts/verify_ai_retention_cleanup.py --tenant-id <TENANT_ID> --retention-days 180`
5. Run global cleanup in controlled windows:
   - `python scripts/run_ai_retention_cleanup.py --retention-days 180 --batch-size 500 --max-delete 5000`
6. Re-verify:
   - `python scripts/verify_ai_retention_cleanup.py --retention-days 180`

## Rollback
- If cleanup over-deletes, recover from latest database backup.
- Keep `max-delete` low initially and increase in stages.

## Notes
- This phase uses script-driven jobs (no background worker dependency).
- Run during low-traffic windows.
