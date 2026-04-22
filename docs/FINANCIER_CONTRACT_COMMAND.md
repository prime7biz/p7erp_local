# Financier Contract Command Center

## Purpose

Bank-facing view anchored on **master export contracts** (`MasterContract`) visible through the financier party’s linked BTB LCs / facilities. Surfaces:

- **OTD** (on-time delivery) score per order and average for the contract  
- **BTB maturity safety** vs a rough inflow proxy  
- **Cashability** (8-week planned CM from quotation CM lines vs actual CM from posted vouchers on the contract cost center with `cost_nature = CM`)  
- **Composite** score (weighted mix + tenant health)  
- **Timeline** ribbon (13 lifecycle nodes)  
- Optional **AI narrative** (`/financier/contracts/{id}/narrative`) with governance metadata  

## API (external JWT, `/api/external`)

Requires `financier_advanced_portal_enabled`, credit monitoring scope, and `financier_party_id` linkage for party-scoped data.

| Method | Path |
|--------|------|
| GET | `/financier/contracts` |
| GET | `/financier/contracts/{id}` |
| GET | `/financier/contracts/{id}/timeline` |
| GET | `/financier/contracts/{id}/orders` |
| GET | `/financier/contracts/{id}/raw-materials` |
| GET | `/financier/contracts/{id}/production` |
| GET | `/financier/contracts/{id}/cash-ladder` |
| GET | `/financier/contracts/{id}/risk` |
| GET | `/financier/contracts/{id}/narrative` |
| POST | `/financier/contracts/{id}/what-if` body: `{ etd_shift_days, rm_accel_pct }` |

## Data isolation

All queries filter by `tenant_id` and financier party scope (`linked_btb_lc_ids_for_party` → `master_contract_id`). Cache keys: `(tenant_id, party_id, contract_id, as_of)`.

## Ledger: CM vs material

- `chart_of_accounts.cost_nature`: `MATERIAL` | `CM` | `OTHER` | `NON_OPERATING` (nullable).  
- `voucher_lines.cost_nature_override` optional per line.  
- Backfill: `docker compose exec backend python scripts/backfill_account_cost_nature.py` (working directory is `backend/` in the container).

## RM procurement guard

Tenant flag `require_master_contract_for_rm` in `tenants.feature_flags` (toggle in **Settings → Configuration**). When true:

- Creating a **PO** or **GRN** against orders without `master_contract_id` (or BTB without master) returns **409** with `ORDER_REQUIRES_MASTER_CONTRACT` / `BTB_REQUIRES_MASTER_CONTRACT`.

## Frontend

Routes: `/portal/financier/contracts`, `/portal/financier/contracts/:contractId`.

## Demo data

After `seed_lakhsma_interconnected_demo.py` and `seed_financier_full_demo.py`, master contracts linked to demo BTBs appear in the contract list for the seeded financier principal (e.g. company code `LAKH806201`).
