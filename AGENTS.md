# P7 ERP – Project memory for AI agents

Use this file and `.cursor/rules/` when working on this repo (e.g. on another machine or new chat).

## Project

- **Name:** P7 ERP  
- **Repo:** https://github.com/prime7biz/p7erp_local  
- **Stack:** Python (FastAPI) backend, React (TypeScript) frontend.  
- **Reference:** PrimeX in `replit-legacy/primeX-ERP/` – match structure and behavior where applicable.

## User / conventions

- User is a **beginner at programming**; prefer clear directory structure and simple, well-explained code.
- Keep **directory structure clear**: `backend/`, `frontend/`, `docs/`, `replit-legacy/`.
- **Table row actions:** Use a single combined "Actions" dropdown per row (see `.cursor/rules/action-buttons.mdc`). Do not use separate Edit/Delete icon buttons.

## Merchandising module rebuild

- **Discipline rules:** `MERCHANDISING_RULES.md` (tenant isolation, performance, full-stack wiring, backward compatibility, governed AI, tests).
- **Living progress:** `MERCHANDISING_REBUILD_MASTER_PLAN.md` (phase status, decisions, risks).
- **Audit:** `MERCHANDISING_MODULE_AUDIT_REPORT.md`, `MERCHANDISING_MODULE_EXEC_SUMMARY.md`.
- **Tests:** `backend/tests/test_merch_tenant_isolation.py`, `test_bom_workflow_integration.py`, `test_commercial_lock_enforcement.py`, `test_commercial_change_request_integration.py`, `test_merch_control_tower.py`, `test_commercial_timeline_integration.py`, `test_merch_samples_integration.py`, `test_merch_reports_http_integration.py`, shared seeds `backend/tests/merch_fixtures.py`.

## Where to look

- **Plans and parity:** `docs/REFERENCE_PARITY.md`, `docs/PROJECT_PLAN.md`, `docs/IMPLEMENTATION_ROADMAP.md`, `docs/session_plan_legacy.md`.
- **Inventory roadmap:** `docs/INVENTORY_MODULE_ADVANCEMENT_PLAN.md` – navigation fixes, backend robustness, transfers/adjustments, UX polish.
- **ERP UI wiring (shared headers + cross-module links):** `docs/ERP_UI_WIRING_PROGRAM.md`; shared components `frontend/src/components/app/` (`AppPageHeader`, `WorkflowSummaryStrip`, `LinkedRecordsSection`). Customer related-records isolation: `docker compose exec backend pytest tests/test_customer_module_wiring_integration.py -q`.
- **Inventory mobile lists:** `frontend/src/hooks/useInventoryListView.ts`, `frontend/src/components/inventory/InventoryMobileList.tsx` — narrow-only Table vs Cards, horizontal scroll for wide tables.
- **API load logging (audit):** `frontend/src/utils/logApiError.ts` — use instead of empty `.catch` handlers; see `docs/PRE_PRODUCTION_AUDIT.md` Finding #5.
- **List pagination / caps (audit):** `backend/app/common/pagination.py` (`MAX_PAGE_SIZE` = 500). Heavy lists use paginated endpoints or `limit`/`offset`; optional `BOOTSTRAP_REGISTRATION_KEY` gates first-user register (Finding #4).
- **DB performance program:** Baseline template `docs/perf_baseline_2026-05-13.md`; rollback runbook `docs/PERF_ROLLBACK_RUNBOOK.md`. Optional env `PERF_*` (slow-request logs, pool line on slow requests, session timeouts) in `backend/app/config.py`. Stock snapshot reads: `tenants.feature_flags.stock_snapshot_reads` (default off) + table `inventory_stock_balance_snapshots`; rebuild with `docker compose exec backend python scripts/rebuild_stock_balance_snapshot.py --tenant-id <id>`.
- **AI document → form autofill (no file persistence):** `docs/AI_FORM_EXTRACTION.md`; backend `backend/app/modules/ai_extract/`; frontend `frontend/src/components/ai-extract/`, `frontend/src/hooks/useDocumentExtraction.ts`.
- **Tier-1 LLM (OpenRouter + Ollama):** With Docker Ollama, **Ollama is chosen before OpenRouter** unless `OPENROUTER_TIER1_PREFERRED=true`. Use `OPENROUTER_TENANT_TEXT_ENABLED=true` to send **tenant text** features (dashboard brief, weekly report, planning narrative, etc.) through OpenRouter first (`generate_text_for_tenant`), with Gemini as optional fallback. Logs: filter for `openrouter_chat_completion` / `openrouter_request_failed`. See `docs/OPENROUTER.md`. Set `GEMINI_ENABLED=true` and `GEMINI_API_KEY` for Gemini-only paths (document extraction multimodal, etc.).
- **Production planning (Gemini):** Env `GEMINI_API_KEY`, optional `GEMINI_MODEL` (default `gemini-2.5-flash` in `config.py`). Pipeline & AI: `backend/app/modules/production/gemini_planning_service.py`, `pipeline_service.py`, `planning_router.py` (`/production/planning/*`). Tenant override JSON on `tenant_production_settings.ai_provider_config` (`enabled` / `model`); admin via `GET/PUT /api/v1/production/planning/ai/settings`. Frontend: `frontend/src/pages/app/manufacturing/ProductionPlanningPage.tsx` (tabs: Pipeline, What-if/MRP, Plan history), `frontend/src/components/production/planning/`, `frontend/src/hooks/useProductionPipeline.ts` & `useAIPlanningInsights.ts`. Legacy route `/app/production/advanced-planning` redirects to Planning.
- **Merchandising RBAC (optional JSON on `roles.permissions`):** keys like `merch.bom.approve`, `merch.bom.freeze`, `merch.po.generate`, `merch.alert.scan`, `merch.alert.assign`, `merch.alert.definitions`, `merch.tna.manage`, `merch.style.manage`, `merch.wastage.manage`. Missing key ⇒ allowed; explicit `false` denies. `merch.*` or `*` as true grants all merch permissions.
- **Trade RBAC (optional JSON on `roles.permissions`):** `trade.create`, `trade.transition`, `trade.document.upload`. Same convention as merch (missing ⇒ allow; explicit `false` denies; `trade.*` or `*` grants all trade keys). Per-tenant **feature flag:** `tenants.feature_flags.trade_enabled` — if `false`, Trade sidebar/routes hidden; see `docs/TRADE_MODULE_SOP.md` §14.
- **Material control & AP governance (optional JSON on `roles.permissions`):** boolean keys registered in `backend/app/common.permissions` — `bom.price_override`, `inventory.non_po_receipt_approve`, `inventory.over_receipt_approve`, `inventory.over_issue_approve`, `inventory.process_order_approve`, `finance.ap_posting_approve`. **Admin** and **manager** roles bypass these checks in code paths that use `assert_delegate_manager_or_permission`. Settings → Roles shows them under **Material control & finance governance** (from `GET /settings/permissions-registry` field `governance_toggle_keys`).
- **Build:** `docs/BUILD_VERIFICATION.md` – B1–B3 checklist (backend deps, env, frontend build). Frontend: `npm run lint` (ESLint) and `npm run lint:fix` in `frontend/`. **Docker images:** For day-to-day rebuilds, use `docker compose build` (cached layers; **do not** use `--no-cache` unless you need a full clean install). Helper: `scripts/docker-rebuild.ps1`. Details: *Faster Docker rebuilds* in `docs/BUILD_VERIFICATION.md`.
- **Deploy workflow:** `.cursor/rules/deployment-process.mdc` — say **"deploy"** (or **"release"** / **"push to live"**) for the full production release checklist (pre-flight → commit → push main → wait CI → tag `v*` → monitor deploy → smoke checks). Human runbook: `docs/DEPLOYMENT_PROCESS.md`; cutover: `docs/GO_LIVE_CUTOVER_RUNBOOK.md`.
- **Help & Tutorials (in-app):** Content in `frontend/src/data/tutorials/` (`tutorialSections.ts`, `types.ts`, `tutorialRegistry.ts`, `tutorialArticleEnrich.ts`); pages in `frontend/src/pages/app/tutorials/`; screenshots under `frontend/public/tutorials/`. Routes: `/app/tutorials`, `/app/tutorials/:articleId`. **Shipping user-visible navigation, workflows, UI patterns, or screen copy that the guides mention requires updating the matching tutorials in the same PR** (routes, summaries, visuals, `lastUpdated`) — see `.cursor/rules/tutorials-maintenance.mdc`.
- **Cursor rules:** `.cursor/rules/project.mdc` (project context, always apply); `.cursor/rules/docker-python.mdc` (backend Python only via Docker, local and production); `.cursor/rules/deployment-process.mdc` (say **deploy** for full production release); `.cursor/rules/tutorials-maintenance.mdc` (keep Help & Tutorials aligned when navigation or workflows change).
- **Run / structure:** `README.md`, `.env.example`, `docker-compose.yml`. Run backend commands with `docker compose exec` on the backend service—do not assume a working host `python`/`pip` for the app.
- **Lakhsma full-chain demo (customers → inquiries → quotations with costing lines → orders → PIs → sales contract + BTB LC):** run `docker compose exec backend python scripts/seed_lakhsma_interconnected_demo.py` (targets company code `LAKH806201` by default; override with `LAKHSMA_INTERCONNECTED_DEMO_COMPANY_CODE`; idempotent; marker customer `LKH-CUST-01`; re-run backfills missing quotation materials/CM/other/size ratios on `LKH-QUO-*`).
- **QR-verified inventory documents demo (10× delivery challan, gate pass, GRN, PMI, process order, warehouse transfer; codes `QR-DEMO-*`):** after interconnected + inventory demo data exists, run `docker compose exec backend python scripts/seed_document_qr_demo.py` (default `--company-code LAKH806201`; idempotent via `QR-DEMO-DC-01`). Optional: `POST /api/v1/finance/vouchers/backfill-signatures` for existing vouchers.
- **Financier portal “full” Lakhsma demo (rich data on every portal screen):** after Lakhsma interconnected seed, run `docker compose exec backend python scripts/seed_financier_full_demo.py --company-code LAKH806201` (idempotent; marker vendor `LKH-VEND-FABRIC-01`; includes base financier principal + `seed_financier_portal_demo` facility). See `docs/BUILD_VERIFICATION.md` and `pytest tests/test_financier_full_demo_seed.py`.
- **Marketing SEO:** `docs/SITEMAP_NOTE.md`, `docs/SEO_SEARCH_CONSOLE.md`; sitemap `frontend/scripts/generate-sitemap.ts`, static shells `frontend/scripts/inject-static-route-html.ts`, public path list `frontend/src/config/publicMarketingPaths.ts`, meta in `frontend/src/components/Seo.tsx`.
- **Finance UAT and go-live:**
  - `docs/FINANCE_UAT_CHECKLIST.md` – high-level test checklist
  - `docs/FINANCE_UAT_TEST_CASES.md` – numbered test cases (FIN-UAT-001+)
  - `docs/FINANCE_GO_LIVE_CRITERIA.md` – go/no-go gates and sign-off
  - `docs/FINANCE_CUTOVER_PLAN.md` – cutover runbook and rollback
  - `docs/FINANCE_OPERATIONS_SOP.md` – daily/weekly/month-end procedures
  - `docs/FINANCE_UAT_CLOSURE_REPORT.md` – engineering readiness closure
  - `docs/FINANCE_CHAT_HANDOFF_2026-03-11.md` – new-chat continuation handoff

## Auth and tenant

- Login: Company Code (or Tenant ID) + Username or Email + Password. Tenant resolved by `company_code`.
- All tenant-scoped data has `tenant_id`; APIs filter by tenant. Tenant types: `manufacturer` | `buying_house` | `both`.

## External access (customer & financier portals)

- **Separate from internal JWT:** External users use `/api/external/*` and `frontend/src/api/externalClient.ts` with `localStorage` keys `p7_ext_token`, `p7_ext_tenant_id`, `p7_ext_principal_type`. Internal app uses `p7_token` / `p7_tenant_id`.
- **Frontend routes:** `/portal/customer/login`, `/portal/customer/*` (dashboard, orders, approvals, shipments, notes); `/portal/financier/login`, `/portal/financier/*` (dashboard, order-book, order detail, pipeline, goods movement, financial summary, projections, alerts). Route guard: `frontend/src/components/external-access/ExternalAccessGuard.tsx`.
- **Internal admin (Settings):** `/app/settings/external-access` (feature flags), `/app/settings/external-access/customers`, `/app/settings/external-access/financiers`, `/app/settings/external-access/audit`. API: `/api/v1/settings/external-access/*` via `api` in `frontend/src/api/client.ts`.
- **Backend:** Package `backend/app/external_access/` (auth, admin, customer_portal, financier_portal), models in `backend/app/models/external_access.py`, migration seeds `external_roles`. Config: `external_jwt_expire_minutes`, `external_jwt_refresh_expire_days`, lockout settings in `backend/app/config.py`. Tenant flags on `tenants.feature_flags`: `customer_portal_enabled`, `financier_portal_enabled`, `customer_notes_enabled`, `financier_financial_summary_enabled`, `financier_projection_enabled`, `external_portal_document_downloads_enabled`.
