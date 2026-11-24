# Raw Material & Goods Control

One place for how Prime7 plans, buys, receives, issues, converts, and accounts for garment raw materials — for both **bought** stock and **customer free-issue** (inbound job work / subcontract).

## Start here

| Doc | Purpose |
|-----|---------|
| [MASTER_PLAN.md](./MASTER_PLAN.md) | Binding phase plan (A + B + C every phase), Style-first rules, hub IA, locked decisions |
| [GAP_MATRIX.md](./GAP_MATRIX.md) | Known INV/FIN/COM gaps × track × phase |
| Cursor plan | `~/.cursor/plans/rm_goods_control_40e9ba51.plan.md` (living detail; this folder is the repo contract) |

## Modes and flags

- All new behaviour is behind **strict `true` flags**, default **OFF**. Never add these keys to `DEFAULT_ON_FEATURE_FLAGS`.
- Phase 0.5 integrity fixes have **no flag** (correctness only).
- Existing Inbound Job Work stays behind `inbound_job_work_v1`.
- Phase flags (all strict OFF): `material_control_hub_v1`, `material_inbound_v2`, `material_alloc_ud_v1`, `material_conversion_v1`, `material_physical_v1`, `material_returns_v1`, `material_budget_plan_v1`, `material_commitment_block_v1`.

## Do not rebuild

- Do **not** invent a second stock ledger or second ATP engine.
- Do **not** put customer free-issue qty into `stock_movements`, FIFO, or inventory GL.
- Do **not** force `NOT NULL` on commercial chain FKs (`style_id`, `order_id`, MSC/PI links).
- Do **not** replace Process Order / Knitting `jobwork_customer` with Inbound Job Work in this program.
- Do **not** auto-enable any flag on live tenants.

## Code map (existing)

| Area | Path |
|------|------|
| Stock / GRN / PMI / ProcessOrder | `backend/app/modules/inventory/` |
| FIFO | `backend/app/services/fifo_inventory.py` |
| Inventory GL / accounts | `backend/app/services/inventory_gl_service.py`, `inventory_account_resolver.py` |
| VendorBill / GRNI | `backend/app/modules/finance/router.py` |
| Debit notes | `backend/app/modules/finance/advanced_voucher_service.py` |
| Material Control hub + ops (Phases 1–7) | `backend/app/modules/material_control/`, `frontend/src/pages/app/inventory/material-control/` |
| Layer alloc / UD / leftover / bond / claim / RTV models | `backend/app/models/material_control_alloc.py` (migrations 321–324) |
| Gate/Challan Class 3→2→1 chain | `backend/app/common/authority/challan_gate_class_chain.py` |
| BTB / MSC | `backend/app/modules/commercial/` |
| MFG allocation / pegs (separate from style layer alloc) | `backend/app/modules/inventory/reservation_service.py`, `pegging_service.py` |
| Inbound Job Work (zero value) | `backend/app/modules/job_work/` |
| UD / bond registers | `backend/app/models/compliance.py`, `backend/app/modules/compliance/` |
| Authority (legacy gate Class 1) | `backend/app/common/authority/gate_pass_workflow.py` |

## Build status (2026-11-23)

Phases **0 → 8** implemented behind default-OFF flags (migrations through **327**). Phase 7 lite closed: rolls/shade (`material_budget_plan_v1`) + landed cost (`material_landed_cost_v1`, one ALLOCATED per GRN).

## Rollback

- Feature flags OFF immediately.
- Schema: export new rows, then `alembic downgrade 325` (drops rolls + landed-cost tables / GRN shade columns) or `alembic downgrade 319` for full MC schema.
- Docs-only Phase 0: delete this folder.
