# 00 — KPI Platform Audit Report

**Date:** 2026-11-19  
**Mode:** ADVANCED Phase A (docs only)  
**Alembic head at audit:** `313` (`313_authority_cutover_snapshots.py`)  
**Next migration id:** `314+` (re-check at implement time)

## 1. Architecture

| Layer | Stack | Entry |
|---|---|---|
| API | FastAPI async | `backend/app/main.py`, `config.py`, `database.py` |
| Auth / tenancy | JWT + `require_tenant` | `common/auth.py`, `common/tenant.py`, `common/ownership.py` |
| RBAC / authority | Role JSON + optional Class 1–4 | `common/permissions.py`, `common/authority/` |
| Flags | `tenants.feature_flags` JSON | `common/tenant_feature_keys.py` |
| ORM | SQLAlchemy 2 | `backend/app/models/` |
| Migrations | Alembic | `backend/alembic/versions/` |
| Jobs | Celery + Redis, UTC | `common/celery_app.py`, `workers/*_worker.py` |
| Frontend | React + Vite + TS | `frontend/src/` |

## 2. Tenant / company / factory

- **Tenant = company.** Table `tenants` (`models/tenant.py`): `company_code`, `tenant_type` (`manufacturer` | `buying_house` | `both`), `base_currency` (default BDT), optional `timezone`, `feature_flags`, soft-delete `deleted_at`.
- **No `factories` master.** Multi-factory is free-text `SewingLine.factory_unit` (`models/production.py`). KPI v1 scopes by tenant + module + authority + sensitivity. Factory master is a separate approved change.

## 3. Authority and RBAC

- Flag `user_authority_classes_v1` (strict, default OFF). Constants: SUPER, CLASS_1…CLASS_4; module codes in `common/authority/constants.py`.
- Soft RBAC: missing key ⇒ allow; explicit `false` ⇒ deny. Fail-closed keys use `explicit_permission_granted`.
- Change-request tables (migration 310) currently allow only `account_group` and `chart_of_account`. Reuse VERIFY → RECOMMEND → APPROVE → APPLY pattern for KPI historical corrections; each new resource type needs its own approval.
- Super Admin: `users.is_tenant_super_admin` protected in `authority/policy.py` / `user_admin.py`.

## 4. Existing KPI / dashboard surfaces

| Surface | Backend | Flag |
|---|---|---|
| Home dashboard | `modules/dashboard/kpi_service.py` | AI cards default ON |
| Merch control tower | `merch_control_tower_*`, `alert_rules.py` | merch access |
| Ops / MI control tower | `mfg_intelligence/*`, `mfg_planning/*` | `manufacturing_intelligence_v1` + nested |
| Finance control tower | `finance/control/` | `finance_control_tower_v2` |
| Management performance | `finance/mgmt_performance/` | `mgmt_performance_v1` |
| Ratio analysis | `finance/statements/ratio_service.py` | finance / MIS |
| Governed AI metrics | `governed_ai/metrics.py` (10 cards) | `ai_dashboard_cards_enabled` |
| HR manpower / SMV | `hr_manpower/` | `manpower_control_v1` |
| QC / TNA / stock dashboards | production / merch / inventory pages | various |

## 5. Domain facts (all tenant-scoped unless noted)

- **Merch:** Order, GarmentStyle, Inquiry, Quotation, Followup / TNA, MerchSample*, Bom*, OrderAmendment (advisory — does not mutate order), QuotationMaterial / costing lines.
- **Inventory:** Warehouse, PurchaseOrder, GoodsReceiving, StockMovement, Item / ItemUnit.
- **Production:** SewingLine (+ `factory_unit`), HourlyProductionEntry, CutTicket / bundles, ProductionQcCheck / ProductionDefectCode, SewingLineStyleConfig, OperationBulletin.
- **Finance:** Voucher / VoucherLine, VendorBill, OutstandingBill, PartyLedger*, ChartOfAccount, Budget, AccountingPeriod.
- **Commercial:** MasterContract, BtbLc, ProformaInvoice; PI↔Order link table **without** `tenant_id` (COM-01); Shipment (trade); CommissionShipment / CommissionEntry.
- **HR:** Employee, attendance*, payroll*.

## 6. Currency / UOM / timezone

- Base currency on tenant; FX `currency_exchange_rates` with `effective_date`. Money = `Numeric` / `Decimal`.
- UOM: `item_units` master + free-text `uom` on many rows.
- Default app timezone `Asia/Dhaka`; store UTC; Celery UTC.

## 7. Soft-delete and history

- Soft-delete mainly on `tenants.deleted_at`. Transactional rows use status / `is_active`.
- Posted vouchers immutable; correction = reversal voucher.
- `Order.delivery_date` overwritten in place — **no commitment history** (blocks gaming-proof OTIF).
- Style `standard_smv` overwritten in place; OB has `version_no` but no calendar effective-dating.
- HR salary assignments are effective-dated (stronger pattern to copy).

## 8. KPI-relevant gaps

| Gap | Impact |
|---|---|
| QA-04 QC free-text / unchecked pass+fail | DHU / RFT unreliable until hardened |
| No `order_commitment_revisions` | OTIF must use `LATEST_DATE_BASIS` until C2 |
| SMV not effective-dated | Efficiency history can drift after SMV change |
| PRD-03 / PRD-11 capacity / dual stacks | Utilization inconsistency unless MI flags on |
| Commission has calc, no KPI catalog | Agent realisation KPIs are NEW |
| No factory master | No true factory_scope |
| COM-01 PI↔Order no tenant_id | Link grain must use parent tenant checks |

## 9. Reusable components

- MI capacity / load / readiness / delivery / cost / cash services.
- Finance ratios, control cards, mgmt performance.
- Merch tower counts and alert registry.
- Governed AI metric catalog pattern (whitelist + compute).
- Authority Class workflow + RLS (`p7_tenant_isolation`).
- `safe_async_session_rollback`, `ensure_owned`, `MAX_PAGE_SIZE`.

## 10. Recommended migration path

1. Docs (this Phase A) → canonical map (B).
2. Registry tables + flag OFF (C1) wrapping EXISTING metrics.
3. Append-only commitment revisions (C2).
4. Tier-1 compute waves D1–D5; dashboards E–F; corrections G; security H; reconcile I; perf J; predictive K.
5. Never hardcode industry benchmarks; targets typed and effective-dated.

## Rollback

Docs only — remove `docs/kpi-platform/` if abandoned.
