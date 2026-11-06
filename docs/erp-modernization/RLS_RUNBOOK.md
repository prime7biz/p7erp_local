# PostgreSQL Row-Level Security (RLS) — runbook (finding SEC-04)

**Status:** built, **off by default**. Deploying it changes nothing until you finish the steps
in section 5. Companion docs: [GAP_ANALYSIS.md](GAP_ANALYSIS.md) (SEC-04),
[TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) §5 (layer 3), [../PERF_ROLLBACK_RUNBOOK.md](../PERF_ROLLBACK_RUNBOOK.md).

---

## 1. What RLS does (plain words)

Today every API handler must remember to add `WHERE tenant_id = <my tenant>`. If one handler
forgets, one company can see another company's rows. RLS is a second lock **inside PostgreSQL**:
even when a query forgets the filter, the database only returns rows of the tenant that the
current transaction says it works for.

How the pieces fit:

| Piece | Where | What it does |
|---|---|---|
| Policy `p7_tenant_isolation` | migration `270_tenant_rls_policies.py` | On every table with a `tenant_id` column. A row is visible / writable only if `app.rls_bypass = 'on'`, **or** `tenant_id = app.tenant_id`, **or** (nullable columns only) `tenant_id IS NULL` (shared rows). With no setting at all, the role sees **no** tenant rows (fail closed). |
| Session context | `backend/app/common/rls.py`, listener in `backend/app/database.py` | When `RLS_SESSION_TENANT_ENABLED=true`, every transaction starts with `app.rls_bypass='on'`. After authentication the session is pinned: `app.tenant_id=<id>`, `app.rls_bypass='off'`. Uses `set_config(..., true)` = `SET LOCAL`, so it is per transaction and works with PgBouncer transaction pooling. Re-applied at the start of every new transaction (after `commit()`). |
| App role `p7erp_app` | `backend/scripts/create_rls_app_role.sql` | PostgreSQL **skips** policies for the table owner and superusers. Our app connects as the owner today, so the policies are not enforced. `p7erp_app` only has SELECT/INSERT/UPDATE/DELETE → policies apply to it. |
| `DATABASE_URL_APP` | `backend/app/config.py`, `select_runtime_database_url()` in `database.py` | Runtime URL for the API + Celery engine, **used only while the flag is on**. Alembic, backups and scripts with their own engine keep `DATABASE_URL` (owner). |
| Status report | `backend/scripts/rls_status_report.py` | Read-only: which role the app uses, whether policies are enforced, tables missing a policy, tables without a `tenant_id` index. |

Request flow with the flag on:

```
request → get_db (new transaction: app.rls_bypass='on')
        → get_current_user loads the user (bypass: tenant not known yet)
        → bind_session_tenant(db, user.tenant_id)  → app.tenant_id=7, app.rls_bypass='off'
        → handler queries: Postgres hides every row whose tenant_id <> 7
        → end of request: rls_request_scope clears the pin
```

## 2. Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `RLS_SESSION_TENANT_ENABLED` | `false` | Send tenant / bypass settings on every transaction. Alone (owner URL) it enforces nothing — useful to measure overhead. |
| `DATABASE_URL_APP` | empty | `postgresql://p7erp_app:<password>@postgres:5432/<db>` — non-owner role. Ignored (warning in log) while the flag is `false`. |

Both are passed through in `docker-compose.yml` and `docker-compose.prod.yml` (backend, worker, beat).
`DATABASE_URL` is unchanged and must stay the **owner** (migrations run as the owner).

## 3. Which code runs in bypass vs pinned to a tenant

| Context | Mode | Code |
|---|---|---|
| Staff request after login | tenant | `app/common/auth.py` `get_current_user`, `get_current_user_optional` |
| Customer / financier / supplier portal | tenant | `app/external_access/tokens.py` `get_current_external_principal` |
| Platform admin (`/api/v1/admin/*`) | bypass | `app/modules/admin/auth.py` `get_current_admin_allow_mfa_enrolment` |
| Login, register, password reset, public / QR verify pages, health | bypass (default for an unauthenticated session) | no change needed |
| Celery per-tenant loops (party ledger, statutory remittance, stock, MIS, inventory analytics, medical certificates, GST, advanced vouchers) | tenant, re-pinned for each tenant in the loop | `app/workers/*_worker.py` (`bind_session_tenant` as the first line of the loop) |
| In-process / beat per-tenant jobs (merch + trade alert scan, weekly AI report) | tenant | `app/common/scheduled_jobs.py` `_run_per_tenant` |
| Manual merch alert scan (background task) | tenant | `app/modules/merch/routers/alerts.py` `_run_scan_background` |
| MCP tools (artifact, search, analysis, forecast, system task) | tenant | `app/modules/mcp_server/tools.py` |
| Platform jobs (bulk tenant create, data-migration import), system COA seed, platform maintenance, tenant list queries, request / external audit logging, seeds, startup tasks | bypass (default) | no change needed |
| Alembic migrations, backups (`scripts/db_backup.sh`) | owner connection → policies skipped | `DATABASE_URL` / `POSTGRES_USER` |

## 4. Tables covered and excluded

- **Covered:** every base table with a `tenant_id` column when migration 270 runs (346 tables at
  revision 265). 11 of them have a **nullable** `tenant_id`; their `NULL` rows are *shared* (visible to every tenant, as today):
  `ai_knowledge_chunks`, `ai_knowledge_documents`, `ai_task_policies`, `backup_jobs`, `backup_schedules`,
  `hr_compliance_frameworks`, `hr_compliance_requirements`, `lemonsqueezy_webhook_events`,
  `platform_background_jobs`, `roles`, `support_tickets`.
- **Not covered — global / platform tables (no `tenant_id`):** `tenants` (login looks up the company code here), `platform_admins`,
  `admin_sessions`, `platform_admin_audit_logs`, `platform_announcements`, `platform_plans`, `platform_settings`,
  `currencies`, `external_roles`, `marketing_leads`, `alembic_version`.
- **Not covered — child tables without `tenant_id` (out of scope; protected only through their parent):**
  `inter_department_transfer_lines`, `proforma_invoice_orders`, `support_ticket_messages`, `external_principal_roles`.
- **New tables:** not covered automatically. Each migration that creates a `tenant_id` table must add the same policy
  (copy `_policy_expression` from migration 270). `tests/test_rls_policies.py::test_every_tenant_table_has_rls_policy` fails until it does.
- **No index starting with `tenant_id`** (policy check is a per-row filter there; all are small or line tables read through their parent):
  `lay_plans`, `alert_history`, `alert_comment`, `alert_escalation_log`, `alert_saved_view`, `lemonsqueezy_webhook_events`,
  `line_balance_workstations`, `operation_bulletin_ops`, `physical_inventory_lines`, `process_order_cost_lines`,
  `production_material_issue_lines`, `supplier_quotation_lines`, `vendor_bill_lines`. Re-check with the status report.

Performance: app queries already filter by `tenant_id`, so Postgres keeps using the `tenant_id` index; the policy adds one
comparison per row (the settings are read once per query). With the flag on, each transaction starts with one extra
`SELECT set_config(...)` and an authenticated request sends one more to pin the tenant — about 2 extra small statements per
request, constant (it does not grow with the number of rows). Query-count tests with fixed ceilings
(`test_perf_merch_equivalence::test_alert_list_query_count`, `test_perf_party_ledger_equivalence::test_party_ledger_query_count_does_not_grow_with_rows`)
therefore exceed their limit only in RLS test mode.

## 5. Enable in stages

Do each stage on **staging first**. Stop and roll back (section 6) if anything looks wrong.

### Stage 0 — deploy the code (no behaviour change)

Normal deploy. The container runs `alembic upgrade head`, which applies migration 270 (short lock per table;
it fails fast with `lock_timeout` 10 s instead of blocking traffic — re-run in a quiet moment if it does).
Check:

```powershell
docker compose exec backend alembic current          # 270 (or later)
docker compose exec backend python scripts/rls_status_report.py
```

Expect: `Policies ENFORCED for app : False`, `Missing policy : 0`.

### Stage 1 — session context on, still the owner (no enforcement)

In the server `.env`: `RLS_SESSION_TENANT_ENABLED=true` (leave `DATABASE_URL_APP` empty). Restart:

```bash
docker compose -f docker-compose.prod.yml up -d backend worker beat
```

Watch response times for a day (one extra round-trip per transaction). Nothing is filtered yet.

### Stage 2 — create the app role (staging)

Take a DB backup first (`scripts/db_backup.sh`). Then, as the owner:

```powershell
Get-Content backend/scripts/create_rls_app_role.sql | docker compose exec -T postgres `
  psql -U p7erp -d p7erp -v app_role=p7erp_app -v app_password='<strong-password>' -v owner_role=p7erp
```

The script is idempotent (run it again after a password change). It also sets default privileges so tables created by future
migrations are granted to `p7erp_app` automatically.

### Stage 3 — run the app as `p7erp_app` (staging)

In `.env`: `DATABASE_URL_APP=postgresql://p7erp_app:<strong-password>@postgres:5432/p7erp` (keep the flag `true`). Restart
backend, worker and beat as above. Check:

```bash
docker compose exec backend python scripts/rls_status_report.py   # Policies ENFORCED for app : True
```

Smoke test (DEPLOYMENT_PROCESS.md Phase 7): login, customers, inventory, vouchers, HR, trade, customer and financier portal,
platform admin tenant list, one Celery task (`docker compose exec worker celery -A app.common.celery_app.celery_app call party_ledger.daily_maintenance`).
Search the logs for `row-level security` errors.

Optional, on a staging copy only — the whole test suite in RLS mode:

```bash
docker compose exec -e RLS_SESSION_TENANT_ENABLED=true \
  -e DATABASE_URL_APP=postgresql://p7erp_app:<pw>@postgres:5432/<staging_copy_db> backend pytest -q
```

### Stage 4 — production

Repeat stages 1–3 on production with a fresh backup, during low traffic. Keep stage 1 running at least a day before stage 3.

**With PgBouncer** (local/staging only today): PgBouncer must know the `p7erp_app` user (its `userlist` / auth query);
otherwise point `DATABASE_URL_APP` straight at `postgres:5432`.

## 6. Rollback (fastest first)

1. **Stop enforcement, keep everything else:** remove `DATABASE_URL_APP` (or set `RLS_SESSION_TENANT_ENABLED=false`) in `.env`,
   then `docker compose -f docker-compose.prod.yml up -d backend worker beat`. The app connects as the owner again → policies skipped.
   No data change, takes effect on restart.
2. **Remove the policies:** `docker compose exec backend alembic downgrade 265` — drops `p7_tenant_isolation` and disables RLS on
   those tables. If later migrations exist (e.g. 271+), downgrade those first in order.
3. **Remove the role** (after 1), as the owner:

   ```sql
   REASSIGN OWNED BY p7erp_app TO p7erp;   -- normally owns nothing
   DROP OWNED BY p7erp_app;                -- removes its grants and default privileges
   DROP ROLE p7erp_app;
   ```

Code rollback: `git revert <sha>` of the RLS commits (the flag is off by default, so leaving the code in place is also safe).

## 7. Limitations (read before enabling)

- **Not a defence against SQL injection.** Any SQL the app can run can also call `set_config('app.rls_bypass','on')`. RLS catches
  *forgotten tenant filters*, not attackers who control SQL.
- **Unauthenticated requests run in bypass** (login needs to find the user before the tenant is known). Public endpoints that read
  tenant data (e.g. QR document verification) are protected only by their own code, as today.
- **Platform admin and cross-tenant jobs run in bypass** by design.
- **Shared (`tenant_id IS NULL`) rows** on the 11 nullable tables can be read and changed by any tenant session — same as today.
- **Foreign-key checks bypass RLS** (PostgreSQL design): a row can still *reference* another tenant's id. Ownership validation
  (`app/common/ownership.py`) and composite tenant FKs (BACKLOG E1.10) remain necessary.
- **Owner / superuser connections are never filtered**: alembic, backups, `psql` as `p7erp`. Do not run the app with
  `DATABASE_URL_APP` pointing at the owner and think it is protected — check the status report.
- **Restoring a dump as a different user** (e.g. `pg_restore --no-owner` as `postgres`) makes that user the owner; if the app then
  connects as a non-owner, policies apply. Re-run the role script on restored databases you want to run the app against.
- **Views / SECURITY DEFINER functions** would run as their owner and skip RLS. None exist today; keep it that way or add
  `security_invoker`.
- The platform admin **slow-query page** (`pg_stat_statements`) shows less detail for a non-superuser; optional:
  `GRANT pg_read_all_stats TO p7erp_app;`.
- New `tenant_id` tables need a policy in their own migration (test guard above).

## 8. Tests

```powershell
docker compose exec backend pytest tests/test_rls_policies.py -q
```

- Policies (under a throw-away non-owner role created inside the test transaction): tenant B cannot read, update or delete tenant A rows;
  inserts / updates into another tenant are rejected (`WITH CHECK`); no setting = no rows; bypass = all rows; owner is never filtered;
  nullable shared rows stay visible.
- Session context: flag off = no SQL and no change; flag on = pinning, re-apply on a new transaction, `get_current_user` pins the user's tenant.
- Guard: every `tenant_id` table has the policy and none is `FORCE`d.

`tests/conftest.py` RLS mode: when both `RLS_SESSION_TENANT_ENABLED=true` and `DATABASE_URL_APP` are set, the shared
`db_session_integration` fixture connects as the app role too, so the normal integration tests run with policies enforced.
