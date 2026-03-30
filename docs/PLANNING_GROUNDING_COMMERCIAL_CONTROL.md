# Planning data grounding + commercial change-control

Foundation phase before **advanced costing AI**. This doc covers scope, APIs, RBAC, safety boundaries, and how to test (Docker).

## Goals

1. **Planning grounding** — One deterministic, explainable snapshot per order combining ATP/CTP, production readiness chain, line-board overlap heuristics, dependency checks, and delivery-window context.
2. **Commercial change-control** — Sensitive commercial fields on **locked** orders and quotations cannot be edited via normal PATCH/PUT; operators use **change requests** (propose → approve/reject → apply) with audit trails.

## What this phase does **not** do

- No auto-changes to shipment/ex-factory dates, prices, FX, quantities, status, or costing by AI.
- No finite-capacity APS; line overlap remains a **date-window heuristic**.
- No bypass of approvals for protected fields on locked entities.

## Planning grounding

### Signal sources

| Signal | Source |
|--------|--------|
| `material_atp_ctp` | `promise_checks.run_order_promise_check` (BOM vs stock, CTP on delivery date) |
| `production_readiness_chain` | `readiness_service.get_order_chain_readiness` |
| `line_capacity_context` | `order_simulation_service.scan_capacity_bottlenecks_for_order` |
| `dependency_completeness` | Derived (quotation, style, BOM, TNA, line config flags) |
| `delivery_window` | Order header `delivery_date` vs today |

### API

- `GET /api/v1/orders/{order_id}/planning-grounding` — full `PlanningGroundingSnapshot` JSON.
- `GET /api/v1/orders/planning-grounding-summary?order_ids=1,2,3` — compact rows: `order_id`, `overall_readiness`, `pending_change_requests` (count of pending commercial CRs for that order).

### RBAC

- `orders.view_planning_grounding` — explicit `false` in `roles.permissions` denies (missing key ⇒ allow). Role names `admin`, `manager`, `owner`, `super_admin`, `superadmin` bypass granular checks.

## Commercial change-control

### Locked statuses

- **Order:** `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`
- **Quotation:** `APPROVED`, `SENT`, `CONVERTED`

### Protected fields

- **Order:** `delivery_date`, `quantity`, `commission_mode`, `commission_type`, `commission_value`, `shipping_term`
- **Quotation:** `target_price`, `target_price_currency`, `exchange_rate`, `quoted_price`, `currency`, `total_amount`, `shipping_term`, `commission_*`, `projected_quantity`, `projected_delivery_date`, `valid_until`

### Direct edit behavior

- **Unlocked** order/quotation: PATCH behaves as before for those fields.
- **Locked** order: PATCH that touches any protected field → **409** with `code: COMMERCIAL_CHANGE_REQUIRED` and `fields` list.
- **Locked** quotation: **PUT** full update → **409** (use change requests per field, revise quotation, or workflow permitting status move).

### Change-request API

| Method | Path | Action |
|--------|------|--------|
| POST | `/api/v1/change-requests` | Create (body: `entity_type`, `entity_id`, `field_key`, `new_value`, `reason`, optional `source`) |
| GET | `/api/v1/change-requests/pending-summary` | `{ pending_approval_count }` |
| GET | `/api/v1/change-requests/{id}` | Detail |
| GET | `/api/v1/orders/{order_id}/change-requests` | List (optional `status`, `limit`, `offset`) |
| GET | `/api/v1/quotations/{quotation_id}/change-requests` | List |
| POST | `/api/v1/change-requests/{id}/approve` | Body optional `{ note }` |
| POST | `/api/v1/change-requests/{id}/reject` | Body optional `{ note }` |
| POST | `/api/v1/change-requests/{id}/apply` | Apply approved change to live row |
| POST | `/api/v1/change-requests/{id}/cancel` | Cancel pending |

Lifecycle: `pending_approval` → `approved` | `rejected` | `cancelled`; `approved` → `applied`. Double apply → **409**.

Creating a change request when the entity is **not** locked → **400** (`CHANGE_REQUEST_NOT_REQUIRED`).

### RBAC keys (`roles.permissions`)

| Key | Purpose |
|-----|---------|
| `commercial.propose_change` | Create / cancel pending |
| `commercial.approve_change` | Approve |
| `commercial.reject_change` | Reject |
| `commercial.apply_change` | Apply approved |
| `commercial.view_changes` | List/detail |
| `orders.view_planning_grounding` | Planning grounding endpoints |

Missing key ⇒ allow; explicit `false` ⇒ deny. Admin-style role names bypass granular keys.

### Audit

- Domain events use `log_ai_event` with `prompt_category="commercial_change_control"` (e.g. `COMMERCIAL_CHANGE_PROPOSED`, `COMMERCIAL_CHANGE_APPLIED`, …) and structured `details_json`.
- HTTP traffic may still be logged via existing request audit middleware.

### Order AI apply

- On commercially **locked** orders, AI batch apply **skips** protected commercial fields and returns `requires_change_request[]` with `field_key` and `message` in `POST .../orders/ai/suggestion-batch/apply-suggestions`.

## Database

- Table: `commercial_change_requests` (Alembic revision **136**).
- Run migrations inside the backend container:  
  `docker compose exec backend alembic upgrade head`  
  (service name may differ; use your compose file.)

## Tests (Docker)

From repo root, with `DATABASE_URL` set for the backend container (see `backend/tests/conftest.py`):

```bash
docker compose exec backend pytest backend/tests/test_planning_grounding_integration.py backend/tests/test_commercial_change_request_integration.py -v
```

## Frontend

- **Order detail:** `PlanningGroundingCard`, `ChangeRequestPanel` (order).
- **Orders list:** Grounding pill + pending CR count (summary endpoint).
- **Quotation workspace:** `ChangeRequestPanel` (quotation).
- **Dashboard:** Pending commercial approvals count card.

## Known limitations

- Grounding uses `order.style_ref` ↔ `garment_styles.style_code` while ATP may use `quotation.style_id` — alignment is documented in snapshot `limitations`.
- Quotation **line-level** costing rows are not individually change-controlled in this phase; locked quotations block **full PUT** only.
- Role-name bypass for commercial keys matches existing AI RBAC patterns; tighten if your org needs stricter separation of duties.

## Before starting advanced costing AI

After this phase: you have **grounded planning signals** and **reviewable commercial mutations** on locked deals. Recommended next gate before costing AI: **normalize quotation money fields** (many are still string-typed) and tighten FX/currency invariants in the schema layer.
