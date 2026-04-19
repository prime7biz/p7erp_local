# Merchandising rebuild — master progress

**Status legend:** `pending` | `in_progress` | `done` | `blocked`

| Phase | Objective | Status |
|-------|-----------|--------|
| 1 | Stabilization & safety (tenant audit, tests, rules docs) | done |
| 1.5 | Contract freeze (API + UI baseline for refactors) | done |
| 2 | Merch router split (backward-compatible paths) | done |
| 3A | Money/FX validation layer (no DB migration) | done |
| 3B | Header numeric migration (`merch.py`) | done |
| 3C | Costing numeric migration (`costing.py`) | done |
| 4 | Commercial governance hardening + timeline | done |
| 5 | Quotation AI extract (E2E) | done |
| 6 | Sample / tech-pack MVP | done |
| 7 | Control tower (single summary API + UI) | done |
| 8 | BOM authority + planning handoff | done |
| 9 | Reporting & analytics | done |
| 10 | Final hardening + docs | done |

## Files touched (running log)

- `MERCHANDISING_RULES.md` — permanent discipline rules
- `MERCHANDISING_REBUILD_MASTER_PLAN.md` — this file
- `backend/tests/merch_fixtures.py` — shared seeds
- `backend/tests/test_merch_tenant_isolation.py`
- `backend/tests/test_bom_workflow_integration.py`
- `backend/tests/test_quotation_ai_extract_integration.py` — extract → suggestion batch mapping
- `docs/MERCHANDISING_API_CONTRACT_BASELINE.md`
- `POST /api/v1/quotations/ai/extract` + `QuotationAiPanel` `FileImportCard`
- `GET /api/v1/merch/control-tower/summary`, `merch_control_tower_service.py`, `MerchControlTowerPage`, sidebar **Merch control tower**
- `app/common/money_schema.py` — Pydantic `BeforeValidator`s; inquiry + quotation header/line schemas wired (Phase 3A)
- `backend/tests/test_money_schema_wiring.py`
- `GET /api/v1/merch/reports/catalog` — stable index of merch KPI/report API + UI paths; `exports.py` (Phase 9).
- `GET /api/v1/orders/{id}/commercial-timeline`, `GET /api/v1/quotations/{id}/commercial-timeline` — commercial change-control audit timeline (Phase 4).
- `merch_sample_requests` / `merch_sample_comments` (migration `171`), `GET/POST /merch/samples*` (Phase 6).
- Order pipeline `BOM_CREATED` completeness: non-legacy order BOM **approved or frozen** (Phase 8).
- `backend/app/modules/merch/routers/alerts.py` — persisted alerts + `GET /merch/critical-alerts` (lazy import of wastage report)
- `backend/app/modules/merch/routers/wastage.py` — `/merch/reports/wastage*`; `bom_utils.py`, `material_helpers.py`
- `backend/app/modules/merch/routers/styles.py`, `classic_boms.py`, `consumption.py`, `followups.py`, `tna.py`, `consumption_recon.py` — former monolith routes
- `backend/app/modules/merch/router.py` — thin re-export only (no `APIRouter` routes)
- `backend/alembic/versions/166_inquiries_money_numeric.py` — `inquiries` money columns
- `backend/alembic/versions/167_quotations_style_fob_money_numeric.py` — `quotations` header money + `garment_styles.target_fob`
- `backend/alembic/versions/168_bom_items_consumption_plan_qty_numeric.py` — `bom_items` consumption/wastage, `consumption_plan_items.required_qty`
- `backend/alembic/versions/169_quotation_costing_lines_numeric.py` — quotation costing **line** tables (`quotation_materials`, `quotation_manufacturing`, `quotation_other_costs`, `quotation_size_ratios`, `quotation_cost_summary`); ORM `Decimal` + API string formatters (`format_money` / `format_rate` / `format_pct`)
- `backend/alembic/versions/170_items_and_currency_exchange_rates_numeric.py` — `items.default_cost` → `Numeric(18,4)`; `currency_exchange_rates.exchange_rate` → `Numeric(18,6)`; currency API + inventory item create/update use `line_money_from_input` / `line_rate_from_input` + `format_*` for JSON

## Phase 2 — router split (complete)

- **Composition:** `routers/__init__.py` mounts domain routers under `/merch` (except `boms.py` which already prefixes `/merch/order-boms`, and `merch_control_tower.py` which prefixes `/merch`).
- **Modules:** `styles.py`, `classic_boms.py` (`/merch/boms*`), `consumption.py` (material requirement + consumption plans), `followups.py`, `tna.py`, `consumption_recon.py`, `alerts.py` (persisted alerts + `GET /merch/critical-alerts`), `wastage.py`, `pipeline.py`, `merch_control_tower.py`, `boms.py` (order-boms), `samples.py`, `exports.py` (`/merch/reports/catalog`).
- **Shared:** `bom_utils.py`, `material_helpers.py` (fabric/trim/other grouping).
- **Thin `router.py`:** re-exports `get_order_material_requirement` only; schemas live on domain modules and `schemas.py` re-exports them.

## Phase 3A — money validation (no migration)

- **`format_rate` / `format_pct`** on `app/common/money.py`.
- **`MoneyStrOpt` / `RateStrOpt` / `PctStrOpt`** on `InquiryCreate`, `InquiryUpdate`, `QuotationCreate`, `QuotationUpdate`, `QuotationFullUpdate`.
- **Costing lines:** `MoneyLineStr`, `RateLineStr`, `PctLineStr`, `FabricFactorLineStr` (coerce bad legacy values to safe defaults so GET/PUT stay robust).

## Phase 3B — header numeric migration (done)

- **`inquiries`:** `166` — `target_price`, `exchange_rate`; ORM + string JSON.
- **`quotations` header + `garment_styles.target_fob`:** `167` — Numeric headers; router/schemas use `parse_money` / `format_*`.
- **`bom_items` / `consumption_plan_items`:** `168` — consumption and wastage numeric; sync helpers updated.
- **Apply:** `docker compose exec backend alembic upgrade head`.

## Phase 3C — costing numeric migration (done)

- **Quotation costing lines + summary:** `169`.
- **Items + tenant FX rates:** `170` — `Item.default_cost` (`Numeric(18,4)`), `CurrencyExchangeRate.exchange_rate` (`Numeric(18,6)`); `/currency/exchange-rates*` uses `line_rate_from_input` + `format_rate`; inventory items use `line_money_from_input` + `format_money` on responses; `fifo_inventory._q`, inventory/manufacturing `_to_float` accept `Decimal`.
- **Bugfix:** finance `_lookup_exchange_rate` now reads `latest.exchange_rate` (was invalid `.rate`).

## Decisions taken

- Phase 1: Merch `router.py` uses `db.get` followed by `tenant_id` checks on primary entities; spot-audit documented; cross-tenant HTTP tests added for `/merch/boms` and `/merch/styles`.
- `boms.py` eligible-orders: `GarmentStyle` loaded after `Quotation` must be tenant-checked (fix applied if style could diverge).

## Open risks

- Post Phase 2, further refactors can extract Pydantic models into dedicated `schemas_*.py` files (optional cleanup).
- Numeric migrations (3B/3C) require data cleanup for empty/invalid strings.

## Test checklist (phase 1)

- [x] `pytest tests/test_merch_tenant_isolation.py -q`
- [x] `pytest tests/test_bom_workflow_integration.py -q`
- [x] `pytest tests/test_commercial_change_request_integration.py -q` (existing)
- [x] `pytest tests/test_commercial_timeline_integration.py tests/test_merch_samples_integration.py tests/test_merch_reports_http_integration.py -q` (phases 4 / 6 / 9)

## Rollback notes

- Phase 3 migrations: keep `downgrade()` reversing column types; backup DB before upgrade in production.

## Phase 1.5 — compatibility baseline

See **`docs/MERCHANDISING_API_CONTRACT_BASELINE.md`** for must-not-break paths and UI expectations.

## Phase 5 — quotation document extract

- **Backend:** `POST /api/v1/quotations/ai/extract` (multipart: `file`, optional `quotation_id`) → `QuotationAiExtractWrapResponse`; uses `extract_inquiry_form` multimodal path; persists `extract` suggestion batch via `create_batch_from_extraction`; audit `QUOTATION_AI_EXTRACT`.
- **Frontend:** `api.quotationAiExtract`, `useQuotationAi.runExtractDocument`, `FileImportCard` on quotation workspace AI panel; suggestions merge into existing apply flow (commercial lock still enforced on apply).

## Phase 7 — merchandising control tower

- **Backend:** `GET /api/v1/merch/control-tower/summary` — `merch_control_tower_service.build_merch_control_tower_summary` (COUNT-heavy queries + capped drift scan vs `list_commercial_discrepancies`).
- **Frontend:** `/app/merchandising/control-tower`, sidebar **Merch control tower**; Help article `merch-pipeline` updated.

## Phases 4, 6, 8, 9, 10 — stability-first closeout (2026-04-10)

- **4 — Commercial timeline:** order + quotation detail surfaces; tests `test_commercial_timeline_integration.py`, extended lock enforcement.
- **6 — Samples:** migration `171`, `/merch/samples*`, `/app/merchandising/samples`, control tower `sample_pending`.
- **8 — BOM authority:** pipeline `_has_bom` requires approved/frozen non-legacy order BOM; UI labels + optional webhook on freeze.
- **9 — Reporting:** `GET /merch/reports/catalog`, `ReportsOverviewPage` + `ReportsHubPage` merch shortcuts, `test_merch_reports_http_integration.py`.
- **10 — Hardening:** `styles.py` missing `Response` import caused bogus query param `response` on `GET /merch/styles` and `GET /merch/styles/summary-report` — fixed (`starlette.responses.Response`). Docs: contract baseline, exec summary, `AGENTS.md`, tutorials **Reports hub**.
