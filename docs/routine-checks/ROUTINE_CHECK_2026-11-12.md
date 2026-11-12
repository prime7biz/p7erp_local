# Routine check — 2026-11-12 (whole application, report only)

Scope: whole Prime7 ERP, sampled audit. Areas: bugs, security, tenant data isolation, lazy loading, slowness,
data efficiency, UI modernization. **No application code was changed.** Every finding below is a proposal; each fix
needs its own planned change (CRITICAL mode for anything touching posting, valuation or tenancy).

Severity: **P1** fix soon, **P2** plan in the next cycle, **P3** clean-up / hardening.
"Uncommitted" = found in files changed in the current working tree (not yet on `main`).

## Summary

- **Tests:** frontend lint, TypeScript and 408 unit tests pass; backend 1,307 pass and **1 fails** because of the
  uncommitted overtime work (RC-01). Committed code is green.
- **Tenant isolation:** no cross-tenant data found (82 checked relations, 0 bad rows); all 375 tenant tables have an
  RLS policy; no raw SQL injection paths; external portals, MCP tools, governed AI and file downloads are correctly
  scoped. No exploit-level finding, so nothing was written to the private folder.
- **Main risks:** float maths inside system voucher posting (RC-03), a GRN receiving path that hides batch errors
  (RC-04), high-severity frontend dependency advisories (RC-02), and module permissions that are not enforced unless
  RBAC mode is switched on (RC-05).
- **Speed / data:** the Help button downloads the whole tutorial library (251 kB compressed) on every signed-in page
  (RC-08); alert scans and some dashboards run one query per row (RC-07); pages fetch without a shared cache (RC-10).
- **UI:** half the pages still use their own title instead of the shared header; report pages clip wide tables on
  phones (RC-11).

## Findings

| ID | Area | Sev | Where | What | Suggested fix | Effort |
|---|---|---|---|---|---|---|
| RC-01 | Bug (uncommitted) | P1 | `backend/app/modules/hr_payroll/payroll_calculation_service.py:101`, `hr_payroll/schemas.py` (`PayrollEmployeeCalcPreviewOut`) | New `overtime_enabled` preview field is not in the API schema, so the API drops it. Fails `tests/test_benchmark_piece_rate.py::test_preview_api_schema_exposes_every_preview_field`. | Add `overtime_enabled: bool = True` to the response schema before committing. | XS |
| RC-02 | Security (dependencies) | P1 | `frontend/package.json` | `npm audit --omit=dev`: 3 high, 6 moderate. `react-router` / `react-router-dom` (open redirect via backslash or `//` in links and `useNavigate`; most other advisories target server rendering, which P7 does not use), `d3-color` ReDoS. `glob` / `minimatch` only via `write-excel-file`. | Run the non-breaking `npm audit fix` for react-router and d3-color, then lint/test/build. Upgrading `write-excel-file` to 4.x is breaking; plan separately. | S |
| RC-03 | Financial integrity | P1 | `finance/auto_posting_service.py:204-214`; `production/wip_voucher_service.py:33,50,113-136`; `facility/posting_hooks.py:66-205`; `facility/gl_service.py:98,205`; `facility/accrual_service.py:75,151` | `create_system_voucher` checks balance in `Decimal`, but then stores each line through `float` rounded to 2 places and computes base-currency amounts with `float` maths; there is no base-currency balance check. WIP vouchers check balance in `float`; facility utilisation balances are kept as `float`. Breaks the "money is Decimal" rule; multi-line FX vouchers can end up off by rounding. | CRITICAL-mode change: keep `Decimal` end to end, quantize once, check base debits = base credits, add a multi-line FX regression test. | M |
| RC-04 | Inventory integrity / DB session | P1 | `inventory/router.py:3422-3442` (GRN receive) | If `create_batch_on_grn` fails, the error is only logged and receiving continues: stock is received without its batch record, and a database error leaves the transaction broken for the rest of the request. | Let the error fail the receipt (or use a savepoint and then fail), plus a test. | S |
| RC-05 | Authorization (config) | P1 to verify | `backend/app/config.py:61` (`rbac_default_mode = "off"`), `common/permissions.py:1035` | Module permission keys are a no-op for tenants in RBAC mode `off`, which is the default. Locally 3 of 4 tenants are `off`. This is the documented roll-out design (`docs/RBAC_GO_LIVE_RUNBOOK.md`). | Confirm the live `RBAC_DEFAULT_MODE` and each live tenant's `rbac_enforcement` flag; move tenants to `shadow`, then `enforce`. | S |
| RC-06 | DB session safety | P2 | `production/planning_router.py:760-790` (`except Exception: pass`), `orders/pipeline_service.py:225`, `inventory/serial_tracking_service.py:136` (bulk import loop), `ai_tool/ai_turnover_prediction_service.py:59`, `ai_tool/automation.py:299` | Database errors are caught without `safe_async_session_rollback(db)` and the same session keeps being used, which causes `InFailedSQLTransactionError` later in the request. | Add the rollback (or a savepoint) in each block. | S |
| RC-07 | Slowness (N+1 queries) | P2 | `merch/alert_rules.py:302,328,407,433,604,666,727`; `inventory/grn_qc_router.py:277,286` (`GET /quality/dashboard`); `production/crew_router.py:1295`; `finance/router.py:3621,4031`; `inventory/stock_hierarchy_router.py:418,627` | One query per row inside loops. Alert rules do this per order and then per BOM line on every scheduled scan for every tenant. Repo-wide 141 loops make a DB call per row (many are small write-path validations, which are fine). | Batch-load with `IN (...)` or joins, starting with the alert rules and dashboards. | M |
| RC-08 | Lazy loading / data use | P2 | `frontend/src/components/shell/PageHelpButton.tsx:20-62` | The header Help button imports the whole tutorial library (`tutorialRegistry` chunk: 850 kB, 251 kB compressed) shortly after every signed-in page opens, only to decide whether to show itself. Costly on phones. | Generate a small route-to-article index at build time; load full articles only on the Help pages or when the button is opened. | S |
| RC-09 | Tenant isolation (when RLS is on) | P2 | `backend/app/workers/platform_worker.py:77-118` | The data-migration import job writes tenant rows without `bind_session_tenant`, so it will fail once `RLS_SESSION_TENANT_ENABLED` is switched on. | Call `bind_session_tenant(db, tenant_id)` before `run_import`. | XS |
| RC-10 | Data efficiency | P2 | `frontend/src/pages/**` | React Query is used in only 5 files; 296 of 480 page files fetch inside `useEffect` with no shared cache, so the same lists reload on every visit (customers fetched directly in 16 files, orders in 29). A `useMasterData` hook exists but is not used consistently. | Adopt React Query (already installed) for master lists first, then high-traffic lists. | L |
| RC-11 | UI / mobile | P2 | `frontend/src/pages/app/reports/*` (14 of 18 pages, e.g. `ReportGrnPage.tsx:47-53`) | Report tables sit inside `overflow-hidden`, so wide columns are cut off on phones instead of scrolling. Not covered by `docs/MOBILE_RESPONSIVE_AUDIT.md`. Other candidates (verify on a phone): `CustomersPage`, `OrdersPage`, `QuotationsPage`, `InquiriesPage`, `StylesPage`, `PartiesPage`, `LotTraceabilityPage`, `commercial/CommissionPage`, `inventory/quality/QualityDashboardPage`. | Use `overflow-x-auto` or the shared mobile list, and add `/app/reports/*` to the mobile audit route list. | S |
| RC-12 | Posting idempotency | P2 | `facility/accrual_service.py:111-160` (`reverse_accrual`); `facility/router.py:626-645` | Accrual reversal has no row lock, so a double submit can create two reversal drafts. The monthly accrual run is protected by the unique key `(tenant_id, facility_utilization_id, accrual_month)`, but a concurrent run returns a 500 instead of a clear message. | Lock the accrual row (`with_for_update`) before the guard, catch the unique-key error, add double-submit tests. | S |
| RC-13 | Tooling | P3 | `backend/scripts/rbac_access_report.py:59` | The report lists almost every route prefix as "ungated" (for example 222 finance routes). This is a false alarm: it looks for the text `require_internal_permission`, but the real dependency is `require_any_internal_permission.<locals>._dep`. The route-inventory test (passing) is the reliable check. | Detect the `permission_keys` attribute, as `tests/test_route_permission_inventory.py` does. | XS |
| RC-14 | Tenant isolation (latent) | P3 | `finance/party_ledger_service.py:238`, `finance/party_ledger_bill_service.py:381`, `hr_payroll/service.py:417`, `production/crew_router.py:585`, `inventory/router.py:3358`, `inventory/idt_service.py:51`, `production/knitting_finance_service.py:87` | Helpers load a record by id with no tenant check (the same pattern as KI-01). Every current caller passes an id that was already tenant-checked, so nothing is reachable today. | Add a `tenant_id` parameter and filter when each file is next touched. | S |
| RC-15 | Isolation consistency | P3 | 19 modules with 5+ write routes (`orders`, `quotations`, `inquiries`, `customers`, `logistics`, most HR packages...) | These modules don't use the shared `ensure_owned`; they use their own tenant-filtered loaders. `orders` was checked and validates correctly. | Move to `ensure_owned` gradually so reviews can rely on one pattern. | M |
| RC-16 | Slowness (indexes) | P3 | DB | 13 tenant tables have no `tenant_id` index (`alert_comment`, `alert_escalation_log`, `alert_history`, `alert_saved_view`, `lay_plans`, `lemonsqueezy_webhook_events`, `line_balance_workstations`, `operation_bulletin_ops`, `physical_inventory_lines`, `process_order_cost_lines`, `production_material_issue_lines`, `supplier_quotation_lines`, `vendor_bill_lines`). No index on `vouchers.voucher_class_id`, `users.role_id`, or `warehouse_id` on PO/GRN/challan items. 342 FK columns have no leading index (mostly `created_by`-style), which makes tenant deletion slow (1.6 s locally). `alert_scan_log` "last finished" lookup took 405 ms because index `(tenant_id, started_at)` does not cover `status, finished_at`. | One additive index migration (use `CREATE INDEX CONCURRENTLY` on live). | S |
| RC-17 | Data efficiency (indexes) | P3 | DB | Same-column duplicate indexes: `items` (`ix_items_tenant_id_item_code` + `uq_items_tenant_item_code`), `hr_employees.user_id`, `mfg_work_orders` (two unique keys), `tenant_production_settings`, `external_roles.code`, `payroll_statutory_configs`. (B-tree + trigram pairs are not duplicates.) Local index-usage statistics were recently reset, so "unused index" data is not reliable here. | Drop only after checking `pg_stat_user_indexes` on production (needs approval). | S |
| RC-18 | Bounded lists | P3 | `settings/router.py:243,386`; `trade_case/router.py:379,576`; `manufacturing/{quality,tna,master_data,samples,execution}_router.py`; `currency/router.py:65`; `finance/router.py:5625`; `tna_unified/router.py:91`; `users/router.py:21`; `roles/router.py:21` | About 20 tenant endpoints accept page sizes of 1,000 to 10,000, above `MAX_PAGE_SIZE = 500` (`reports/router.py:58` is a documented exception). | Cap at `MAX_PAGE_SIZE` where the UI paginates. | S |
| RC-19 | Data growth | P3 | `alert_scan_log` | About 917 rows per tenant per day; already the largest table (28 MB of 132 MB locally). The retention purge works (oldest row 2026-10-16). | Log only scans that found or changed something, or keep one summary row per scan run. | S |
| RC-20 | UI modernization | P3 | `frontend/src/pages/app/**` | 130 of 291 pages draw their own `<h1>` instead of `AppPageHeader` (reports 17/18, production 18/18, manufacturing 13/14). 24 non-HR pages use browser `alert` / `confirm` popups. Only 6 of 113 form pages use `useUnsavedChangesGuard`. Leftover `dark:` classes on a light-only app: `InquiryCreatePage`, `operations/ControlTowerPage`, `production/ProductionLinePlanPage`. Very large page files: `FollowupPage` 98 KB, `InventoryItemsPage` 91 KB, `production/ProductionSetupPage` 88 KB. | Module-by-module UI pass: shared header, confirm dialog component, unsaved guard on create/edit forms, split the largest pages. | L |
| RC-21 | Test hygiene | P3 | `backend/tests/conftest.py:88-102` | The integration session does not use `join_transaction_mode="create_savepoint"`, so tests that call `commit()` write into the local dev database (visible in `pg_stat_statements`: test tenants created and deleted). | Add the savepoint mode and check that the suite still passes. | S |
| RC-22 | Secrets hygiene | P3 | `backend/scripts/seed_lakhsma.py:31`, `app/seeds/phase1_demo.py:96`, `app/seeds/financier_portal_demo.py:53`, `scripts/verify_hr_*.py` | Demo seed passwords are committed to the public repo. Fine for local demo data. | Confirm no live tenant or user still uses these passwords. | XS |

## Remediation ledger (2026-11-12, plan "Resolve routine findings")

Status: **RESOLVED** = code + tests done and verified; **OPEN** = remaining work or a separately approved
production step. Nothing is committed or deployed; every change is in the working tree.

| ID | Status | What changed | Evidence (tests) | Next step / rollback |
|---|---|---|---|---|
| RC-01 | RESOLVED | `overtime_enabled` in `PayrollEmployeeCalcPreviewOut` and copied by the preview endpoint | `test_benchmark_piece_rate.py` (schema + endpoint-copies-every-field), payroll suites | revert |
| RC-02 | RESOLVED | `react-router-dom` 7.18.5, `d3-color` override ^3.1.0, `write-excel-file` 4.1.1 (`/browser` entry, `.toBlob()`) | `npm audit --omit=dev`: 0; `exportRows.test.ts` (real .xlsx) | revert lockfile |
| RC-03 | RESOLVED | System vouchers Decimal end to end (4 dp amounts, 6 dp rate, half-up, base-currency balance check, reject never auto-balance); WIP, facility, knitting, vendor-bill, commercial callers | `test_system_voucher_decimal_integrity.py` (8) + facility/payroll/voucher suites; Premium security audit PASS | posted vouchers: forward fix only |
| RC-04 | RESOLVED | GRN batch / serial failures fail the whole receipt | `test_grn_batch_atomicity.py` (batch + serial, cross-tenant 404, RBAC 403) | revert |
| RC-05 | OPEN (operational) | Report script fixed (RC-13); no default change in code | runbook `docs/RBAC_GO_LIVE_RUNBOOK.md` | pilot tenant `shadow` 24-48 h -> review `rbac_shadow_denial` -> approve `enforce`; rollback flag `off` |
| RC-06 | RESOLVED | Savepoints / rollback at all 5 catch sites; generic AI error text | `test_caught_db_error_recovery.py` (5) | revert |
| RC-07 | OPEN (backlog) | Alert consumption rules + GRN QC dashboard batched (constant queries); AST baseline of remaining loops | `test_alert_rule_query_counts.py`, `test_grn_qc_query_counts.py`, `test_db_loop_budget.py` (172 functions left) | batch remaining list/report loops, shrink `db_loop_baseline.py` |
| RC-08 | RESOLVED | Help button loads a 17.9 kB (gzip) generated index, not the 251 kB library | `helpIndex.test.ts`, `PageHelpButton.test.tsx`, build output | `npm run generate:help-index` after editing tutorials |
| RC-09 | RESOLVED | Data-import worker pinned to its tenant (bookkeeping in bypass) | `test_worker_tenant_isolation.py` | revert |
| RC-10 | OPEN (backlog) | Finance pick-lists (accounts, groups, cost centres, bank accounts) shared + cached on 14 dropdown pages (balance screens stay live); invalidated on finance, customer, vendor, payroll, facility, commercial, stock-group and settings writes; changes made in another browser tab show after at most 5 minutes | `masterData.finance.test.ts` | next: users, trade cases, HR lists |
| RC-11 | RESOLVED | All 18 report pages scroll wide tables on phones | `reportPagesLayout.test.ts` | live phone capture when `CAPTURE_PASSWORD` is set |
| RC-12 | RESOLVED | Accrual reversal locks `(id, tenant_id)` before the guard; monthly duplicate skipped only on its unique key | `test_facility_accrual_concurrency.py` (two real sessions) | revert |
| RC-13 | RESOLVED | RBAC report reads `permission_keys` | `test_rbac_access_report.py` | revert |
| RC-14 | RESOLVED | Tenant scope on party-ledger, payroll, crew, IDT, job-work (KI-01), GRN fallback, knitting, facility helpers | `test_latent_helper_tenant_scope.py` (5) | revert |
| RC-15 | OPEN (backlog) | Write-id manifest (772 fields: 6 reviewed with cross-tenant tests, 193 `handler-calls-ensure_owned` = handler-level heuristic, NOT verified per field, 574 unreviewed); new fields always start `unreviewed` | `test_write_id_ownership.py` | verify module by module, lower both ceilings |
| RC-16 | RESOLVED (local) | Migration 292: 13 `tenant_id` indexes + alert-scan index (56 ms -> 0.28 ms after migration) | `test_migration_292_indexes.py`; local `upgrade -> downgrade 291 -> upgrade` passed, 0 invalid indexes, `rls_status_report` "No tenant_id index: 0" | production run needs approval; rollback `alembic downgrade 291`. Depends on migration 291 (other in-progress HR work) |
| RC-17 | OPEN (needs approval) | Nothing dropped | - | approve read-only production `pg_stat_user_indexes` review over a business cycle, then one-index-per-migration drops |
| RC-18 | RESOLVED | 21 tenant list limits capped at `MAX_PAGE_SIZE`; named exceptions documented | `test_list_page_caps.py` | revert |
| RC-19 | RESOLVED (code) / OPEN (rollout) | Tenant flag `alert_scan_compact_log` (default OFF): one `__scan__` row per run | `test_alert_scan_compact_log.py` (>= 80% fewer rows) | pilot one tenant, then enable tenant by tenant; rollback flag off |
| RC-20 | OPEN (backlog) | Reports module on shared header; no browser popups left in app pages outside HR (ConfirmDialog / toasts); `dark:` removed from pages; ratchet test | `uiConventionsBudget.test.ts` (113 raw-title pages ceiling) | next: production, manufacturing, commercial/finance headers; unsaved guards; split the 3 largest pages; popups still in HR pages, Settings pages (Users, Roles, Currency, Data import, Bulk onboarding, Overview), `VendorDetailDrawer`, `useWeeklyReports`; 108 `dark:` classes in shared components |
| RC-21 | RESOLVED | Integration session uses savepoints; residue report after each run | `test_db_session_isolation.py`; "No tenants left behind" | revert |
| RC-22 | RESOLVED (code) / OPEN (live check) | Seeds refuse published demo passwords outside development; read-only checker | `test_demo_credentials_guard.py`; `scripts/check_demo_passwords.py` | run the checker on live; rotate any hits + "Sign out devices" |

Known issues: KI-01 is now fixed (RC-14). KI-02 is still open (out of this plan's scope).

Verification at the end of the program: backend full suite 1,412 passed / 0 failed (no tenants left
behind); focused remediation suites 94 passed after QA corrections; frontend `tsc` 0, `eslint` 0,
Vitest 80 files / 479 tests passed, `npm run build` passed (help index 17.9 kB gzip, app shell no longer
loads the tutorial library), `npm audit --omit=dev` 0 vulnerabilities; cross-tenant links 0, RLS
policies missing 0. Reviews: `security-auditor-premium` PASS with findings (all addressed or shown not
reproducible), `qa-engineer` FAIL then corrections (popup check, compact-log empty run, stronger
job-work / manifest / cache / BOM-version tests).

Shared files edited that also contain other uncommitted work: `backend/app/common/tenant_feature_keys.py`
(flag `alert_scan_compact_log`), `backend/app/modules/hr_payroll/service.py` (one tenant check).

## What was checked and found clean

- Raw SQL: no interpolated user input (`admin/backup_service.py:159` uses a hard-coded table list; `database.py:261` uses config integers).
- Cross-tenant links: `check_cross_tenant_links.py` — `checked=82 skipped=0 flagged_relations=0 flagged_rows=0`.
- RLS: `rls_status_report.py` — 375 tenant tables, 0 missing policies, none forced. Enforcement is off locally by design (`RLS_SESSION_TENANT_ENABLED=False`, owner role).
- Supplier / customer / financier portals: every route has a principal dependency; supplier queries filter by tenant and linked vendors, with the same 404 for "not yours" and "missing".
- MCP tools block a tenant mismatch and need approval before commits; governed-AI confirm re-detects findings on the server and checks `ai.agents.confirm`.
- File downloads: tenant comes only from the login token, paths are resolved by `FileStorageService`, and trade documents check tenant and case.
- Celery workers use `run_async`; scheduled per-tenant loops call `bind_session_tenant`.
- Knitting subcontract posting is protected by the process-order row lock (`_lock_process_order`).
- GRN creation validates the PO line's tenant (`inventory/router.py:3237-3244`).
- Frontend routes are lazy-loaded; the first page load only preloads React, Router, React Query and Helmet.

## Known issues (`docs/ai-development/KNOWN-ISSUES.md`)

| ID | Status today |
|---|---|
| KI-01 | Still open (`inventory/job_work_costing_service.py:108`, no callers) |
| KI-02 | Still open (`commercial/` still has no `with_for_update`) |
| KI-03 to KI-05 | Unchanged (design / business decisions) |
| KI-06, KI-07 | Open by user decision |
| KI-08 to KI-10 | Fixed (confirmed by passing tests) |

## Commands run and results

| Command | Result |
|---|---|
| `docker compose exec backend alembic current` / `heads` | `290 (head)` / `290 (head)` |
| `pg_stat_statements` top queries, FK / index / size / bloat catalog queries (read-only, `psql`) | See RC-16, RC-17, RC-19 |
| `docker compose exec backend python scripts/check_cross_tenant_links.py` | 0 flagged |
| `docker compose exec backend python scripts/rls_status_report.py` | 0 missing policies; 13 tables without `tenant_id` index |
| `docker compose exec backend python scripts/rbac_access_report.py` | 1 enforce / 3 off; "ungated" list is a false alarm (RC-13) |
| `npm audit --omit=dev` (frontend) | 9 advisories: 3 high, 6 moderate |
| `npx tsc -b` (frontend) | Pass |
| `npm run analyze` (frontend, writes only to git-ignored `dist/`) | Pass; one chunk over 500 kB (`tutorialRegistry`, RC-08) |
| `npm run lint` (frontend) | Pass |
| `npm run test` (frontend) | 70 files, 408 tests passed |
| `docker compose exec backend pytest -q` | 1,307 passed, 4 skipped, 1 failed (RC-01), 10 min 27 s |

`mobile-audit.mjs` was not run (`CAPTURE_PASSWORD` not set; it would also sign out the capture user's other session).
Mobile findings come from code inspection only.

The working tree changed during the audit: new uncommitted mobile UI files appeared (`GridMobileCards.tsx`,
`useMobileUiV2.ts`, page `*.mobile.test.tsx` files), and `frontend/public/sitemap.xml` had already been regenerated
(written 10:56, before this check started). RC-11 and RC-20 may be partly covered by that work; re-check them after
it is committed.
