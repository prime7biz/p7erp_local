# 13 - Phase 2 implementation plan

Mode: CRITICAL. Author: `architect` agent (2026-11-12). Owner decisions: doc 11. Verification constraints: doc 10.
Status: under `plan-auditor` review (findings and resolutions appended in section 15).

## 1. Goal and non-goals

Deliver all of Phase 2 behind three strict, default-OFF flags: material allocation (reservation taxonomy, lockstep
readers, open-PO supply, pegging, admin/manager-only reassignment), plan revisions on existing line bookings,
tentative inquiry / quotation demand, dated employee / machine line assignments, route stages (external lead-time
stages), and style standard SMV. With every flag OFF, all existing outputs stay byte-identical.

Non-goals: no stock movement, valuation or voucher from reservations; no subcontractor capacity; no knitting /
dye-batch pegging (deferred); no change to `line_reservation_service` or `crew_router` behaviour; no cost / finance;
AI never writes.

## 2. Evidence

| Fact | Evidence |
|---|---|
| Alembic head is 294 | `backend/alembic/versions/294_stock_group_stock_nature.py:26-27` |
| `stock_reservations` model: status `String(16)`, `reserved_qty` annotated float | `backend/app/models/inventory.py:388-417` |
| No writer of `stock_reservations` exists | only model, readers, migrations 162 / 249 |
| Availability reader | `inventory/stock_availability_service.py:41-176` (reservations L90-109, open PO L111-161) |
| MRP readers | `inventory/mrp_engine_service.py:204-227`, `:230-237` |
| Reorder readers | `inventory/reorder_service.py:32-46`, `:73-76` |
| Promise check | `orders/promise_checks.py:105-112` |
| Legacy readiness | `production/readiness_service.py:189-196` |
| Phase 1 readiness | `mfg_intelligence/readiness_service.py:179-459` |
| Item availability endpoint | `inventory/router.py:2105-2133` |
| Usable received per PO line | `inventory/router.py:408-429`; accepted defaults to received at GRN create `:3223-3225` |
| Quarantine / rejected warehouses excluded | `inventory/grn_qc_service.py:566-580` |
| Advisory lock (tenant, item) | `inventory/stock_locks.py:19-22` |
| Line booking row | `models/production.py:352-384` |
| Legacy booking defects / TNA sync | `production/line_reservation_service.py:114-117`, `:175-193`, `:206-223` |
| Legacy plan-board writers (no lock version) | `production/planning_router.py:188-228`, `:303-336` |
| Phase 1 router / flags | `mfg_intelligence/router.py`, `flags.py`; mount `main.py:523` |
| SMV hierarchy | `mfg_intelligence/smv_resolver.py:39-117` |
| Strict flag helper | `common/tenant_feature_keys.py:231-234` |
| Guarded settings toggle pattern | `settings/router.py:86-89`, `:176-197` |
| Role helpers | `common/permissions.py:890-907`, `:910` (`HR_SETUP_BYPASS_ROLES`) |
| Permission keys | `production.planning.{read,write,edit,approve}`, `inventory.items.{read,write,edit,approve}` (`permissions.py:766`, `:776`) |
| RLS migration pattern / test | `alembic/versions/291_hr_employee_tax_profiles.py:30-48`; `tests/test_rls_policies.py:112`, `:148` |
| Celery pattern | `workers/medical_certificate_expiry_worker.py:24-92`; `common/celery_app.py:49-87` |
| Concurrency test pattern | `tests/test_facility_accrual_concurrency.py:147-200` |
| Supplier ETA | `models/supplier_portal.py:36-50`; kinds CONFIRMED / DECLINED / SHIP_DATE / NOTE |
| Attendance "present" | PRESENT, LATE, HALF_DAY (`hr_attendance/router.py:570`) |
| Templates / actions / TNA generator | `models/merch.py:528-604`; `merch/routers/tna.py:666-686`; `orders/router.py:271` |
| Order cancel path | `orders/router.py:1081-1120` |

## 3. Business rules

Tenant isolation on every query; `ensure_owned` for every client id; only existing permission keys; admin/manager-only
reassignment and four-eyes enforced in handlers (apply even when RBAC is off); reservations never create movements,
valuation or vouchers; `order_id` stays nullable; confirmed demand = status NEW / CONFIRMED / IN_PROGRESS; FIRM and
HARD only for confirmed orders; migrations additive and nullable with RLS in the same migration and working downgrade.

## 4. Migrations (head 294 -> 299)

All use `SET LOCAL lock_timeout='10s'`; new CHECKs `NOT VALID` then validated.

| Rev | Changes |
|---|---|
| 295 `295_mfg_reservation_taxonomy.py` | `stock_reservations`: `reservation_kind String(16)`, `reservation_source String(24)`, `expires_at`, `bom_item_id` (FK SET NULL), `lock_version` (default 0, nullable); checks kind allowlist and `status <> 'ACTIVE' OR reservation_kind IS NOT NULL`; partial indexes on ACTIVE rows by (tenant, item) and (tenant, order, bom_item) |
| 296 `296_mfg_material_supply_peggings.py` | table `mfg_material_supply_peggings` + RLS |
| 297 `297_mfg_booking_revisions.py` | `sewing_line_style_configs`: `inquiry_id`, `quotation_id` (FK SET NULL), `demand_class`, `confidence_pct Numeric(5,2)`, `expires_at`, `schedule_version`, `lock_version` (default 0), `source_smv_type`; checks; partial indexes. `tenant_production_settings.mfg_planning_config JSON`. Tables `mfg_plan_revisions`, `mfg_plan_revision_items` + RLS |
| 298 `298_mfg_line_assignments.py` | tables `production_employee_line_assignments`, `production_machine_line_assignments` + RLS |
| 299 `299_mfg_routes_style_smv.py` | `followup_action_templates`: `product_type`, `sourcing_mode`, `route_code`, `gate_class`, `predecessor_codes JSON`, `lag_days`, `stage_kind`, `stage_position`, `lead_time_days`; `order_followup_actions`: `route_code`, `stage_kind`, `stage_position`, `gate_class`, `lead_time_days`; `garment_styles`: `standard_smv Numeric(10,4) > 0`, `standard_smv_source`, `standard_smv_confidence`, `standard_smv_approved_by` (FK users SET NULL), `standard_smv_updated_at`; allowlist checks; index (tenant, route_code) |

New table columns:
- `mfg_material_supply_peggings`: id, tenant_id, purchase_order_item_id, purchase_order_id, item_id, order_id,
  bom_item_id, peg_kind (HARD / TENTATIVE), pegged_qty Numeric(18,4) > 0, status (ACTIVE / RELEASED / CONSUMED),
  expires_at, reason, release_reason, lock_version, created_by_user_id, released_by_user_id, released_at, timestamps.
- `mfg_plan_revisions`: id, tenant_id, revision_no, status (PROPOSED / APPLIED / REJECTED / CANCELLED), title,
  reason NOT NULL, request_id, proposed_by_user_id, proposed_at, decided_by_user_id, decided_at, decision_note,
  applied_at, impact_json, lock_version, timestamps; unique (tenant, revision_no); unique partial (tenant, request_id).
- `mfg_plan_revision_items`: id, tenant_id, revision_id, action (CREATE / UPDATE / CANCEL), config_id, before_json,
  after_json, before_lock_version, applied_config_id, sort_order.
- `production_employee_line_assignments`: id, tenant_id, employee_id, sewing_line_id, shift_id, role, valid_from,
  valid_to, is_active, notes, lock_version, created_by_user_id, updated_by_user_id, timestamps.
- `production_machine_line_assignments`: same shape with machine_id (`department_machines`), no role / shift.

Overlap of assignments is prevented in the service under row locks (no `btree_gist`).

## 5. Backend files

- Models: `StockReservation` columns + `reserved_qty: Mapped[Decimal]`; `SewingLineStyleConfig` columns;
  `TenantProductionSettings.mfg_planning_config`; merch template / action / style columns; new `models/mfg_planning.py`.
- Flags: `mfg_material_allocation_v1`, `mfg_integrated_planning_v1`, `mfg_plan_four_eyes` (strict, not default-on).
- `common/permissions.py`: `assert_manager_role_only(db, user, tenant_id)` (admin / manager / owner / super_admin,
  no permission-key bypass).
- Inventory (writes): `open_po_supply_service.py` (open statuses APPROVED / PARTIALLY_RECEIVED; usable received;
  ETA chain: supplier SHIP_DATE / CONFIRMED unless newest is DECLINED -> PO expected_date -> order_date + item lead
  time -> UNKNOWN; + receipt buffer), `reservation_service.py` (central taxonomy, hard / tentative sums with
  consumption netting, create / release / reassign, `compute_items_availability_v1`, lock scope),
  `pegging_service.py`, `material_allocation_service.py` (preview / confirm per order and run; priority:
  IN_PROGRESS > firm by earliest firm row start > firm by delivery_date > tentative by confidence; `state_token`),
  `allocation_reconcile_service.py` (conflicts read-only; lifecycle for job and cancel hook; peg conflicts never
  auto-fixed).
- Orders: cancel hook in `update_order_status` (savepoint, never fails the cancel); promise check passes
  `own_order_id`.
- Merch: route fields on template schemas and copied by TNA generators; `style_standard_smv_service.py`.
- Production (writes): `plan_revision_service.py` (propose / approve-and-apply / reject / cancel; SMV per piece =
  OB total_smv; total = qty x SMV; FIRM TNA sync as legacy; legacy material threshold not applied - impact warning
  instead), `line_assignment_service.py`, `booking_lifecycle_service.py`.
- `mfg_intelligence`: flags helpers; `scenario.py` (dataclass rows, never ORM); additive kwargs on line loading,
  capacity, SMV resolver (level 3 = approved standard_smv), delivery; `assignment_capacity.py`;
  `allocation_readiness_service.py` (`compute_material_v3`); `impact_service.py`; `tentative_demand_service.py`;
  `route_stage_service.py`; routers `allocation_router.py`, `planning_router.py`, `assignments_router.py`;
  `schemas_phase2.py`.
- Settings: four-eyes needs >= 2 admin / manager users; allocation needs `manufacturing_intelligence_v1`; audit.
- Worker: `workers/mfg_planning_worker.py`.

## 6. Reader changes (flag `mfg_material_allocation_v1`; OFF = current body unchanged)

- usable_on_hand = legacy on-hand loop; hard_reserved = legacy HARD + effective ACTIVE HARD_ATP;
  tentative_reserved = legacy SOFT + ACTIVE TENTATIVE not expired; free_inbound = on_order_net - hard_pegged_eff;
  ATP_hard = usable_on_hand - hard_reserved + free_inbound; ATP_stressed = ATP_hard - tentative_reserved -
  tentative_pegged_eff.
- `compute_items_availability` (+ `own_order_id` kwarg, adds back the order's own hard holds); item availability
  endpoint values only; promise check and both readiness services pass `own_order_id`; Phase 1 readiness uses
  `compute_material_v3` (ready = issued + own HARD holds of QC-accepted stock; open POs give expected date only;
  tentative = info); MRP `_on_order_qty` -> net open supply; MRP / reorder `_reserved_qty` -> hard only;
  delivery uses expected material date (`MATERIAL_EXPECTED_DATE_USED`); external PRE / POST sewing stages and
  subcontract sewing lead time (integrated flag).

## 7. API (prefix `/api/v1/mfg-intelligence`; router-level `production.planning.read`; `manufacturing_intelligence_v1`)

| Method / path | Extra permission | Flag |
|---|---|---|
| GET `/items/{item_id}/allocation-availability` | `inventory.items.read` | A |
| GET `/orders/{id}/materials/allocation` | `inventory.items.read` | A |
| POST `/orders/{id}/materials/allocate-preview` | `inventory.items.read` | A |
| POST `/orders/{id}/materials/allocate-confirm` | `inventory.items.approve` | A |
| POST `/materials/allocation-run/preview` / `confirm` | read / approve | A |
| POST `/materials/reservations/{id}/release`, `/materials/peggings/{id}/release` | `production.planning.approve` | A |
| POST `/materials/reassign` | `inventory.items.approve` + `assert_manager_role_only` | A |
| GET `/materials/conflicts` | `inventory.items.read` | A |
| GET `/bookings` | - | P |
| POST `/plan-revisions/preview`, POST `/plan-revisions` | `production.planning.write` | P |
| GET `/plan-revisions`, `/plan-revisions/{id}` | - | P |
| POST `/plan-revisions/{id}/approve`, `/reject` | `production.planning.approve` | P |
| POST `/plan-revisions/{id}/cancel` | `production.planning.write` | P |
| GET `/tentative-demand` | - | P |
| GET / PUT `/planning-settings` | PUT `production.planning.approve` | P |
| PUT `/styles/{id}/standard-smv` | `production.planning.approve` | P |
| Employee / machine line assignments CRUD | `production.planning.write` | P |

A = `mfg_material_allocation_v1`, P = `mfg_integrated_planning_v1`. Idempotency: allocation shortfall recomputed
under lock (replay creates nothing), `state_token` 409 on stale; release idempotent; revision `request_id`;
approve of APPLIED returns same result; `expected_lock_version` 409.

## 8. Transactions and locking

Lock order: orders (sorted) -> `lock_stock_items` -> reservations -> `PurchaseOrderItem` (sorted) -> pegs.
Allocation protects higher-priority unmet hard shortfall. Revision approve: lock revision, four-eyes check, lock
configs, compare `lock_version` and planning-field snapshot (legacy writers do not bump lock_version), apply, store
impact, one commit. Assignments: lock employee / machine row, overlap check. Audit: `log_action` + `record_doc_event`.
`safe_async_session_rollback` after caught DB errors.

## 9. Flags

`mfg_material_allocation_v1`, `mfg_integrated_planning_v1`, `mfg_plan_four_eyes` - strict, default OFF, Settings
toggles with guards and audit.

## 10. Celery job

`mfg.planning_lifecycle_daily` (24 h): per tenant with `bind_session_tenant`, skip when flags off; expire tentative
bookings; reconcile lifecycle; commit per tenant; fail-closed with rollback; `run_async`.

## 11. Tests

F-T1 golden flag-off (mixed legacy + ACTIVE rows, all readers, on->off round trip); F-T2 conservation; F-T3
concurrency (`real_db`); allocation API; reassign permissions (403 RBAC off and enforce); readiness v3; plan
revisions (409 stale incl. legacy move, four-eyes, idempotent request_id, permission denial, cross-tenant);
tentative demand; lifecycle job; line assignments; routes / style SMV; migrations round trip; RLS; route inventory;
read-only extension; settings guards; frontend logic + panels.

## 12. Order

Backend A: migrations + models + flags -> capture F-T1 golden snapshots BEFORE reader changes -> supply /
reservation / readers -> pegging / allocation / reconcile / cancel hook / router -> revisions / impact / tentative /
style SMV -> assignments / routes -> settings / worker / test extensions. Frontend B after API freeze: tabs in
`ManufacturingIntelligenceSection` (Overview | Materials | Plan changes | Tentative demand | People & machines),
Actions dropdowns, settings toggles, tutorials.

## 13. Risks and rollback

Risks: ATP leak (ACTIVE + F-T1); tentative reducing promise (hard only); inbound double count (single service, F-T2);
over-allocation (locks, F-T3); MRP with flag ON stops counting DRAFT POs (intended, release note); consumption netting
depends on OUT movements carrying `order_id` (verify); legacy writers do not bump lock_version (snapshot compare).
Rollback: flags off -> `alembic downgrade 294` (export ACTIVE reservations / pegs / revisions / assignments first) ->
`git revert`.

## 14. Owner questions (defaults used)

Reassignment roles include owner / super_admin (yes); low-priority order cannot take stock a higher-priority confirmed
order needs (no); no default stage probabilities (planner enters confidence); same-day operators from attendance,
HALF_DAY counts (yes); one active line assignment per employee per date range; tentative material holds only for
non-confirmed orders; doc 11 defaults; style SMV approval key `production.planning.approve`; release key
`production.planning.approve` only.

## 15. Plan audit (verdict REVISE) and binding resolutions

`plan-auditor` (2026-11-12) returned REVISE with 2 CRITICAL, 6 HIGH, 10 MEDIUM, 3 LOW findings. The resolutions
below **override** sections 4-12 where they differ. Implementers follow this section first.

| # | Finding | Resolution |
|---|---|---|
| 1 CRIT | Tentative / inquiry / quotation bookings written into `sewing_line_style_configs` would be seen by ~12 legacy readers even with flags OFF | **New table `mfg_tentative_line_bookings`** (tenant, line_id, inquiry_id XOR quotation_id, style_id, ob_id, shift_id, start_date, planned_end_date, planned_qty, smv_per_piece, source_smv_type, confidence_pct, expires_at, status ACTIVE / EXPIRED / CANCELLED / CONVERTED, converted_order_id, lock_version, created_by, timestamps, RLS). Legacy readers never see it. Migration 297 adds to `sewing_line_style_configs` only `lock_version`, `schedule_version`, `source_smv_type` (no inquiry / quotation / demand_class / confidence columns). Phase 1 line loading reads tentative bookings only when `mfg_integrated_planning_v1` is ON. Plan revisions CREATE only order-linked rows (DRAFT / SOFT_BOOKED / FIRM_BOOKED) exactly like today's booking APIs. F-T1 extended to line-booking readers with mixed rows. |
| 2 CRIT | Consumption netting by "any OUT with order_id" unsafe | Allowlist: OUT movement, same tenant / order / item, `reference_type` in (`PRODUCTION_MATERIAL_ISSUE` kind `PROD_ISSUE`, `CONSUMPTION_ISSUE`, `PROCESS_ORDER` kind `PROCESS_INPUT`, `MFG_ISSUE`), warehouse not quarantine / rejected, `created_at >= reserved_at`; match `bom_line_id` to the hold's `bom_item_id` when set, else order + item level; effective = max(0, reserved - consumed) in Decimal(4). Readiness v3 "issued" uses the same allowlist. Reconcile lists over-reserved / unnetted holds. (Verify exact reference_type strings in code before coding.) |
| 3 HIGH | Release then re-allocate bypasses admin / manager-only reassignment | Releasing a HARD_ATP hold or HARD peg of a confirmed order requires `assert_manager_role_only` + reason + audit. `production.planning.approve` alone may release only TENTATIVE / expired holds. Test: non-manager release of HARD = 403. |
| 4 HIGH | MRP would double-subtract an order's own holds | With the flag ON, MRP subtracts only hard holds of orders **not** in the run's gross-demand set. Test: a reserved order generates no extra planned orders. |
| 5 HIGH | Write routers inside `mfg_intelligence/` break the Phase 1 read-only test | `mfg_intelligence/` stays read-only. Write services live in owning modules (`inventory/`, `production/`, `merch/`). Write routers live in a **new package `backend/app/modules/mfg_planning/`** (same URL prefix `/api/v1/mfg-intelligence`, router-level `production.planning.read`). New GETs in `mfg_intelligence` are added to the read-only test's endpoint sweep. |
| 6 HIGH | `GET /planning-settings` would insert a settings row | Read-only: return defaults when no row exists; covered by the read-only test. |
| 7 HIGH | Two inconsistent "received" helpers | One rule in `open_po_supply_service`: usable received = QC-accepted qty on RECEIVED GRNs (QC off: accepted = received at GRN, release-noted); pending QC is inbound with an expected date, never on hand / ready; rejected qty stays open while PO is APPROVED / PARTIALLY_RECEIVED (owner to confirm). Hard reservations only from movement on-hand outside quarantine / rejected warehouses; reject quarantine warehouse ids explicitly. No swallowed exceptions. |
| 8 HIGH | Too big for one run | Backend in four runs: **R1** = migration 295 + models + flags + F-T1 golden + supply service + reservation service + lockstep readers; **R2** = 296 pegging + allocation + reconcile + cancel hooks + delete guard + allocation API; **R3** = 297 revisions + tentative table + impact + bookings API; **R4** = 298 assignments + 299 routes / style SMV + worker + settings guards. Then frontend. Each run ends green before the next starts. |
| 9 MED | F-T1 reader list incomplete | F-T1 also covers: `orders/router.py:626,822` promise users, `order_ai_service.py` promise users, `planning_grounding_service.py:55`, legacy readiness (feeds `suggest_service.py:53` and legacy FIRM gate), `calculate_projected_balance`, `compute_item_availability`, Phase 1 delivery. Release note lists them. |
| 10 MED | Long allocation runs block postings | Keep lock order; cancel hook takes no item locks; allocation run commits per order, max 200 orders / 200 items, `SET LOCAL lock_timeout='5s'`; deadlock test (allocation vs concurrent cancel). |
| 11 MED | Second status path / reopen / delete | Hook both `PATCH /orders/{id}` and `PATCH /orders/{id}/status`; reopening does not restore holds; readers treat holds of non-open orders as 0; delete guard blocks orders with active holds / pegs / revision items. |
| 12 MED | FK `ondelete` | Pegs: `order_id` RESTRICT (+ delete guard), `purchase_order_item_id` / `purchase_order_id` SET NULL (reconcile marks RELEASED). Revision items `config_id` SET NULL. Assignments: employee RESTRICT, line RESTRICT, machine RESTRICT. All `tenant_id` NOT NULL. |
| 13 MED | No DB uniqueness | Unique partial index `stock_reservations (tenant_id, order_id, bom_item_id, item_id, reservation_kind) WHERE status='ACTIVE'` (top-ups update the row); same for pegs (tenant, purchase_order_item_id, order_id, bom_item_id, peg_kind) WHERE status='ACTIVE'. |
| 14 MED | Later legacy writes overwrite applied revisions | Migration 297 adds a PostgreSQL trigger on `sewing_line_style_configs` that bumps `lock_version` when planning fields change (line_id, start_date, planned_end_date, planned_qty, reservation_status, shift_id, operator_count, target_efficiency_pct); downgrade drops it. Legacy last-writer-wins documented. |
| 15 MED | Copying legacy swallowed TNA sync | FIRM sync uses `begin_nested()` savepoint, same `is_line_allocation_confirm_enabled` gate, log on failure; never `safe_async_session_rollback` mid-approve. |
| 16 MED | Reassignment roles wider than owner rule | `{admin, manager}` only. Audit impersonator when impersonating. |
| 17 MED | Generic settings PUT bypasses guards | Guards enforced inside `PUT /settings/config` too: allocation needs `manufacturing_intelligence_v1`; four-eyes needs >= 2 active users who can approve plans (admin / manager role or `production.planning.approve: true`). |
| 18 MED | MRP and reorder change with flag ON | Accepted under owner rule (open = APPROVED / PARTIALLY_RECEIVED); DRAFT / SUBMITTED PO qty shown as an informational "pending PO" figure; flag resolved once per run. Release note. |
| 19 MED | Tentative material holds have no inquiry / quotation link | Tentative material holds only for DRAFT orders; inquiry / quotation demand affects line bookings only (material = warning). |
| 20 MED | Assignments expose HR data | Display fields only (code + name, like `/hr/employees/lookup`); attendance used only as counts; `ensure_owned` on employee, machine, line, shift. |
| 21 MED | Holds are advisory | Documented: issues are not blocked by holds; reconcile flags holds above usable on-hand. |
| 22 LOW | Flag lookup | `db.get(Tenant, tenant_id)` (identity map) + optional `allocation_v1` kwarg from callers. |
| 23 LOW | Nullable lock_version | `server_default 0`, NOT NULL is metadata-only on PG >= 11 for new columns; treat NULL as 0 otherwise. |
| 24 LOW | Index build locks | Acceptable at current sizes; runbook note. |

Owner confirmations still pending (defaults applied): rejected GRN quantity stays open while the PO is open; MRP /
reorder exclude DRAFT POs when the allocation flag is ON.
