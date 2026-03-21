# P7 ERP — Pre-Production Architectural Audit

**Date:** 2026-03-21
**Scope:** Backend (FastAPI / SQLAlchemy), Frontend (React / TypeScript), Database (PostgreSQL via Alembic)
**Methodology:** Static analysis across four pillars — Data Integrity, Performance, Security, Silent Failures

---

## Summary Matrix

| # | Finding | Severity | Pillar | Exploitability |
|---|---------|----------|--------|----------------|
| 1 | Race condition on GL account balance updates | **Critical** (resolved — see §1) | Data Integrity | Automatic under concurrent use |
| 2 | Missing `UNIQUE` constraints on 11 document-code columns | **Critical** (resolved — see §2) | Data Integrity | Automatic under concurrent use |
| 3 | Unbounded queries on most list endpoints + N+1 patterns | **High** (resolved — see §3) | Performance | Guaranteed at ~50K+ rows |
| 4 | Decentralized tenant isolation with no central enforcement | **High** (resolved — see §4) | Security | Requires authenticated attacker |
| 5 | No ErrorBoundary, no 401 interceptor, widespread silent catches | **High** (resolved — see §5) | Silent Failures | Guaranteed on token expiry or API errors |

---


---

## Finding #2 — Missing Unique Constraints on Document Codes

**Severity: CRITICAL**
**Pillar: Data Integrity & Concurrency**
**Files:** `backend/app/models/inventory.py`, `backend/app/models/manufacturing.py` (MRP work orders)

### What is wrong

Eleven document-code columns have a single-column `Index` but lack a tenant-scoped `UniqueConstraint`. The affected tables are:

| Table | Code Column |
|---|---|
| `warehouses` | `warehouse_code` |
| `stock_groups` | `group_code` |
| `vendors` | `vendor_code` |
| `purchase_orders` | `po_code` |
| `goods_receiving` | `grn_code` |
| `delivery_challans` | `challan_code` |
| `enhanced_gate_passes` | `gate_pass_code` |
| `warehouse_transfers` | `transfer_code` |
| `stock_adjustments` | `adjust_code` |
| `manufacturing_orders` | `mo_number` |
| `process_orders` | `process_number` |

If two users create a Purchase Order at the exact same moment and the application-level counter generates the same code (e.g. `PO-2026-0451`), both rows will be inserted successfully. You now have two POs with the same number. Every downstream reference — GRNs, invoices, payments — becomes ambiguous.

**Contrast:** The merch module correctly defines `UniqueConstraint("tenant_id", "inquiry_code")`, `UniqueConstraint("tenant_id", "quotation_code")`, and `UniqueConstraint("tenant_id", "order_code")`. The inventory and manufacturing modules missed this pattern.

**Impact:** Duplicate document numbers, broken reference chains, ambiguous audit trails, and confusion in printed documents sent to suppliers and buyers.

### Status — implemented (2026-03-21)

- **Models:** `UniqueConstraint("tenant_id", "<code>")` added on all tables listed above in `inventory.py`, plus `mfg_work_orders` (`mo_number`) in `manufacturing.py`.
- **Migration:** `backend/alembic/versions/082_coa_version_and_inventory_code_uniques.py` creates matching DB constraints.
- **Before running `alembic upgrade` on production:** Check for duplicate `(tenant_id, code)` pairs (SQL in fix plan). Fix or merge duplicates first or the migration will fail.
- **Step 4 (API, 2026-03-21):** `backend/app/common/db_errors.py` maps `IntegrityError` from unique violations (`uq_*`, PostgreSQL `23505`, duplicate key) to HTTP **409** with detail `Duplicate document code`. Applied to inventory document create flows (warehouses, stock groups, vendors, PO, GRN, delivery challans, gate passes, process orders, manufacturing orders, warehouse transfers, stock adjustments) and manufacturing work-order create (`POST`/`generate-work-orders`), plus `POST /parties/intermediaries` (tenant `code`). **Merch (2026-03-21):** `flush_handling_duplicate_document_code()` on first flush after insert for **`POST /inquiries`**, **`POST /quotations`** (create + from-inquiry + revision), **`POST /orders`** (create + from-quotation).
- **ORM ↔ DB parity (2026-03-21):** SQLAlchemy models **`PurchaseOrder`**, **`DeliveryChallan`**, **`ProcessOrder`**, and **`WarehouseTransfer`** in `inventory.py` now declare **`UniqueConstraint`** names matching migration `082` (avoids autogenerate drift). **Re-audit fix (2026-03-21):** `DeliveryChallan.__table_args__` was missing — now added (`uq_delivery_challans_tenant_challan_code`).
- **Manufacturing execution (re-audit 2026-03-21):** `POST /work-orders` in `execution_router.py` now uses `flush_handling_duplicate_document_code` after `db.add()` to catch duplicate `mo_number` as HTTP **409**.

---

## Finding #3 — Unbounded List Queries Across Most Endpoints

**Severity: HIGH**
**Pillar: Performance at Scale**
**Files:** Most `backend/app/modules/*/router.py` files

### What is wrong

The vast majority of list endpoints execute `SELECT ... WHERE tenant_id = :id` with **no `LIMIT` clause and no server-side pagination**. Confirmed unbounded endpoints include:

- `GET /customers` — all customers
- `GET /inventory/items` — all items
- `GET /inventory/vendors` — all vendors
- `GET /inventory/warehouses`, `/stock-groups`, `/item-categories`, `/item-units`
- `GET /reports/customer-performance` — all customers with aggregated order counts
- `GET /users`, `GET /roles`
- `GET /parties/intermediaries`
- Multiple HR report endpoints
- Manufacturing planning and TNA list endpoints
- `GET /dashboard/revenue-trend` — all quotations for trend calculation

When a tenant accumulates 100K+ items or 50K+ stock movements, these endpoints will:

1. Force PostgreSQL to do full sequential scans (the `tenant_id` index helps, but returning 100K rows is still expensive).
2. Serialize the entire result set into JSON in the FastAPI process, consuming memory proportional to the result size.
3. Transfer a multi-megabyte JSON payload to the browser.
4. Force the browser to parse and render the entire dataset.

The `StockLedgerPage` correctly implements offset/limit pagination (`PAGE_SIZE = 100`). This pattern should be the standard, not the exception.

Additionally, the N+1 pattern in `orders/router.py` (`_run_promise_check`) issues per-order, per-BOM-line queries to `Item` and `StockMovement`. At scale, a promise check across 200 orders with 50 BOM lines each generates ~10,000 individual queries.

**Impact:** Progressively degrading response times, eventual request timeouts, high memory consumption on the API server, and potential cascading failures if the connection pool is exhausted.

### Status — resolved (2026-03-21, re-audit pass)

- **Shared helpers:** `backend/app/common/pagination.py` (`MAX_PAGE_SIZE` = 500, `total_pages`, `safe_page`, `clamp_page_size`).
- **`GET /customers` (legacy list):** Now uses **`limit`** (default 500, max 500) and **`offset`**; prefer **`GET /customers/paginated`** for UI lists (frontend `listCustomers()` already uses paginated fetch-all).
- **Inventory:** Paginated JSON for `GET /inventory/items`, `/vendors`, `/purchase-orders`, `/goods-receiving`. Masters (`warehouses`, `stock-groups`, `item-categories`, `item-subcategories`, `item-units`) use a **5000-row safety cap** via `limit` query param. **Re-audit (2026-03-21):** Added `limit`/`offset` to `GET /delivery-challans`, `/enhanced-gate-passes`, `/process-orders`, `/stock-summary`, `/stock-valuation`, `/warehouse-transfers`, `/stock-adjustments`, `/consumption-control/change-requests`.
- **Parties:** `GET /parties/intermediaries` enforces **`limit`** (default **500**, max **500**). `GET /parties/customer-intermediaries` adds **`offset`** and the same cap.
- **Orders:** `_run_promise_check` batches **Item** and **StockMovement** loads instead of per–BOM-line queries.
- **Dashboard:** `revenue-trend` limits quotations to **last 730 days** and **8000** rows max.
- **Users / roles:** `GET /users` and `GET /roles` use ordered `LIMIT` (defaults 500 / 500).
- **Reports:** `customer-performance` uses `limit` (default 5000, max 10000).
- **Frontend:** `fetchAllPaginated()` in `client.ts` keeps heavy list helpers returning **flat arrays** by fetching pages server-side.
- **HR reports (`GET /hr/reports/summary`):** Uses **SQL `COUNT` / `EXTRACT`** instead of loading all employees, attendance rows, and payroll runs into memory (2026-03-21).
- **Unified TNA:** `GET /tna-unified/actions` applies **SQL `LIMIT`** on merch join (`8000`) and manufacturing tasks (`8000`) before Python filters; `GET /tna-unified/summary` uses **aggregate counts** (no full-table scans).
- **HR (2026-03-21):** Shared caps **`HR_LIST_DEFAULT_LIMIT` / `HR_LIST_MAX_LIMIT`** in `backend/app/common/pagination.py` (default **5000**, max **20000**). List-style GETs in **`hr_attendance`**, **`hr_leave`**, **`hr_payroll`**, **`hr_reports`** (attendance/leave/payroll detail reports), **`hr_performance`**, **`hr_recruitment`**, and **`hr_ess`** accept **`limit` + `offset`** (and some **`entries_limit` / `requests_limit` / `lines_limit`** where aggregation needs an extra bound). Core **`hr/router`** departments/designations/employees already used offset/limit.
- **Finance (re-audit 2026-03-21):** Added `limit`/`offset` to **18 endpoints**: `account-groups` (+ hierarchy), `chart-of-accounts`, `vouchers`, `voucher-types`, `fx-receipts`, `bills`, `bills/aging`, `cost-centers`, `budgets`, `banking/accounts`, `banking/reconciliation` (+ match-logs + statement-lines), `payment-runs`, `accounting-periods`, `bill-references`, `cash-forecast/scenarios`. Small/bounded tables default to **500** (max 5000); high-growth tables default to **5000** (max 20000).
- **Manufacturing (re-audit 2026-03-21):** Added `limit`/`offset` to `quality/checks`, `quality/ncrs`, `quality/capas`, `master/work-centers`, `master/operations`, `master/routing-templates`, `master/routing-templates/{id}/steps`, `tna/templates`, `tna/templates/{id}/tasks`, `tna/plans`, `tna/plans/{id}/tasks`, `samples/requests`.
- **Other modules (re-audit 2026-03-21):** Added `limit`/`offset` to `costing/items` (+ categories + units), `currency/exchange-rates`, `settings/users` (+ roles), `trade_case/{id}/stage-log` (+ documents).
- **Remaining:** Optional UI-driven pagination on screens; optional SQL aggregate rewrites for very large datasets.

---

## Finding #4 — Tenant Boundary Enforcement is Decentralized and Fragile

**Severity: HIGH**
**Pillar: Security & Isolation**
**Files:** `backend/app/common/tenant.py`, all router files

### What is wrong

The `require_tenant` dependency resolves a tenant from the `X-Tenant-Id` header but does **not** validate that the header matches the authenticated user's `tenant_id`. Each endpoint must independently perform:

```python
if user.tenant_id != tenant.id:
    raise HTTPException(status_code=403, ...)
```

This means tenant isolation relies on every developer, in every endpoint, remembering to add this check. If one endpoint omits it, a user can set `X-Tenant-Id: 999` in the header and access another tenant's data.

Specific gaps identified:

1. **`GET /users/me` role lookup** — queries `Role` by `role_id` without filtering by `tenant_id`. A manipulated `role_id` on the user record could leak role details from another tenant.
2. **`POST /auth/register` bootstrap path** — when a tenant has zero users, anyone can register as admin by supplying `tenant_id` in the request body. This is a takeover vector for newly provisioned (or reset) tenants.
3. **`db.get()` pattern** — used extensively to load records by primary key. Most callers check `row.tenant_id == tenant.id` afterwards, but the pattern is opt-in. A single missed check is a cross-tenant data leak.

**Impact:** A single omitted check in any future endpoint exposes another tenant's full dataset — orders, financials, HR data — to an authenticated attacker.

### Status — implemented (2026-03-21)

- **`require_tenant`** (`backend/app/common/tenant.py`) now depends on **`get_current_user`** and returns **403** if `X-Tenant-Id` ≠ `user.tenant_id`. All routes using `tenant: Tenant = Depends(require_tenant)` are protected without relying on per-handler `_ensure_tenant`.
- **`GET /users/me`** role query now scopes to `Role.tenant_id == tenant.id` **or** global roles (`Role.tenant_id IS NULL`).
- **Bootstrap registration (Finding #4 Step 4, 2026-03-21):** For **first user** (`POST /auth/register` when tenant has zero users), the caller must prove bootstrap intent using **one** of:
  1. **`tenants.bootstrap_token_hash`** — bcrypt hash of a one-time secret (same `hash_password()` as user passwords). The client sends the **plain** token in `X-Bootstrap-Key` or `bootstrap_key`. The hash is **cleared** after the first successful registration (one-time per tenant).
  2. **`BOOTSTRAP_REGISTRATION_KEY`** — same value in `X-Bootstrap-Key` or `bootstrap_key` (shared across tenants; does not clear the env key).
  If **neither** is configured, **production** (`APP_ENV` not `dev`/`development`/`local`/`test`/`testing`) returns **403**; **development** keeps frictionless first-user sign-up so local workflows still work.
- **Partial (Finding #4 Step 5, 2026-03-21):** **`AccountGroup`** in `commercial/router.py` `_validate_posting_account` rejects groups whose `tenant_id` ≠ caller tenant. **`ItemUnit`** loads in `ai_tool/tools/bom_tools.py` are batched with `tenant_id` filter. **`finance/router.py` (2026-03-21):** voucher **create** and **update** validate **`AccountGroup.tenant_id`**; **`POST /bill-references/auto-create/{voucher_id}`** rejects cross-tenant groups; **`GET /bill-references/{id}`** requires **`ChartOfAccount`** and allocation **`Voucher`** rows to match tenant; **payment run execute** rejects **`OutstandingBill`** rows that do not belong to the tenant (no silent skip). **`get_user_role_scoped_to_tenant()`** in `app/common/authz.py` (2026-03-21): manager/admin and similar checks no longer use raw `db.get(Role, user.role_id)` — role must match **`tenant_id`** or be a **global** role (`tenant_id` NULL). Used across finance, HR, inventory, manufacturing execution/TNA/samples, and `ai_tool/authz.py`.
- **Defense-in-depth sweep (re-audit 2026-03-21):** 9 secondary `db.get()` loads now validate `tenant_id`: **`MasterContract`** in `commercial/router.py` `_recompute_master_contract_utilization` (added `tenant_id` param + check); **`Intermediary`** in `parties/router.py` (after create + after update); **`ManufacturingTnaTemplateTask`** in `manufacturing/tna_router.py`; **`ItemUnit`** x2 in `merch/router.py` (BOM item + material requirement); **`GarmentStyle`** in `merch/router.py` `_order_context_for_action`; **`ItemCategory`** in `merch/alert_rules.py` `_is_trim_category`; **`Item`** in `inventory/router.py` (delivery challan line). All MEDIUM severity — parent entities were already tenant-checked; these add defense-in-depth.

---

## Finding #5 — No Global Error Boundary or 401 Interceptor on the Frontend

**Severity: HIGH**
**Pillar: Silent Failures**
**Files:** `frontend/src/api/client.ts`, `frontend/src/app/router.tsx`, various page files

### What is wrong

Three compounding issues create a fragile frontend:

**A. No React ErrorBoundary.** If any component throws during render (a common occurrence with unexpected `null`/`undefined` from API responses), the entire application crashes to a white screen. There is no fallback UI, no retry mechanism, and no error reporting.

**B. No global 401 handler.** When the JWT expires, subsequent API calls return 401. There is no fetch interceptor to catch this, clear auth state, and redirect to `/login`. The user sees a broken page with no explanation.

**C. Widespread silent `.catch(() => {})` patterns.** Previously, many pages swallowed API errors. **Addressed (2026-03-21):** shared helper `frontend/src/utils/logApiError.ts` and explicit `(e) => { logApiError("Scope.name", e); ... }` on secondary loads; user-visible warnings where filters/lists break (e.g. pipeline customer list, alerts saved views, wastage buyers, consumption order list, CoA config panel, account group reporting impact).

**Impact:** Users encounter blank screens, stale data, or phantom successes (they click "Save", the call fails silently, and they believe the operation succeeded).

### Status — resolved (2026-03-21, re-audit pass)

- **A (ErrorBoundary):** Implemented as `frontend/src/components/AppErrorBoundary.tsx`, wrapping `AuthProvider` + `AppRouter` in `frontend/src/App.tsx`.
- **B (401 handling):** Implemented in `frontend/src/api/client.ts` (`handleSessionExpiredUnauthorized`) — on **401** when a Bearer token was sent, auth is cleared; users on `/app/*` are redirected to `/login?reason=session_expired&next=…`. No redirect on `/login` or `/signup`; public routes only clear stale tokens.
- **C (silent catches):** Largely addressed via `logApiError` + fallbacks and inline warnings (see **C** above). **Inventory mutations** (`PurchaseOrdersPage`, `GoodsReceivingPage`, `InventoryItemsPage`) use **try/catch** + `setError` + `logApiError` on create/update/delete paths (fix plan Step 4).
- **Re-audit mutation coverage (2026-03-21):** Added **try/catch** + `logApiError` + `setError` to:
  - **`FollowupPage.tsx`** — 7 inline mutation handlers (complete/reopen/delete action, delete template, create/update/delete followup) + 3 `.catch()` on promise chains (create comment x2, load comments).
  - **`StyleDetailPage.tsx`** — 6 handlers (create/delete component, colorway, size scale).
  - **`ConsumptionPlansPage.tsx`** — 3 handlers (create plan, create/delete plan item).
  - **`Dashboard.tsx`** — `.catch()` on `getOrderPromiseSummary` promise.
- **Remaining:** Optional UX polish (toasts) on non-critical loads; `res.json().catch` fallbacks in `client.ts` are intentional for non-JSON error bodies.

---

# Detailed Fix Plan — Finding by Finding

Work through these in order. Each finding is broken into small, concrete steps.

---



## Fix Plan: Finding #2 — Missing Unique Constraints on Document Codes

**Estimated effort:** Medium (2–3 hours)
**Risk if skipped:** Duplicate document numbers under concurrent use

**Done in code (2026-03-21):** Migration `082_coa_version_and_inventory_code_uniques.py` + `UniqueConstraint` on models in `inventory.py` and `manufacturing.py` (`mfg_work_orders`). **You must still run Step 1** on each database before `alembic upgrade`. Steps 4–5 (API `IntegrityError` → 409, tests) are optional but recommended.

### Step 1: Check for existing duplicate data

Before adding constraints, run a SQL query against your database to find any existing duplicates:

```sql
SELECT tenant_id, po_code, COUNT(*)
FROM purchase_orders
GROUP BY tenant_id, po_code
HAVING COUNT(*) > 1;
```

Repeat for each table/column (Finding #2 + `mfg_work_orders.mo_number`). If duplicates exist, fix them manually first (rename or delete the duplicate).

### Step 2: Create a new Alembic migration

**Implemented:** `082_coa_version_and_inventory_code_uniques.py` (includes `chart_of_accounts.version` — see Finding #1). The pattern for each table is:

```python
op.create_unique_constraint(
    "uq_purchase_orders_tenant_po_code",
    "purchase_orders",
    ["tenant_id", "po_code"],
)
```

Constraints applied (12 inventory/MRP tables):

| Constraint Name | Table | Columns |
|---|---|---|
| `uq_warehouses_tenant_warehouse_code` | `warehouses` | `tenant_id`, `warehouse_code` |
| `uq_stock_groups_tenant_group_code` | `stock_groups` | `tenant_id`, `group_code` |
| `uq_vendors_tenant_vendor_code` | `vendors` | `tenant_id`, `vendor_code` |
| `uq_purchase_orders_tenant_po_code` | `purchase_orders` | `tenant_id`, `po_code` |
| `uq_goods_receiving_tenant_grn_code` | `goods_receiving` | `tenant_id`, `grn_code` |
| `uq_delivery_challans_tenant_challan_code` | `delivery_challans` | `tenant_id`, `challan_code` |
| `uq_enhanced_gate_passes_tenant_gate_pass_code` | `enhanced_gate_passes` | `tenant_id`, `gate_pass_code` |
| `uq_warehouse_transfers_tenant_transfer_code` | `warehouse_transfers` | `tenant_id`, `transfer_code` |
| `uq_stock_adjustments_tenant_adjust_code` | `stock_adjustments` | `tenant_id`, `adjust_code` |
| `uq_manufacturing_orders_tenant_mo_number` | `manufacturing_orders` | `tenant_id`, `mo_number` |
| `uq_process_orders_tenant_process_number` | `process_orders` | `tenant_id`, `process_number` |
| `uq_mfg_work_orders_tenant_mo_number` | `mfg_work_orders` | `tenant_id`, `mo_number` |

### Step 3: Update the SQLAlchemy models

**Implemented** in `inventory.py` / `manufacturing.py`. Example for `PurchaseOrder`:

```python
__table_args__ = (
    UniqueConstraint("tenant_id", "po_code", name="uq_purchase_orders_tenant_po_code"),
)
```

If `__table_args__` already exists, append to the existing tuple.

### Step 4: Handle the IntegrityError in the API

In the create endpoints for these documents, wrap the `db.flush()` or commit in a try/except for `IntegrityError` and return a clear 409 Conflict response like "Duplicate document code, please retry."

### Step 5: Test

1. Run the migration against a test database.
2. Attempt to insert two rows with the same `tenant_id` + code — confirm the database rejects it.

---

## Fix Plan: Finding #3 — Unbounded List Queries

**Estimated effort:** Large (4–8 hours across multiple endpoints)
**Risk if skipped:** Performance degradation and eventual timeouts at scale

### Step 1: Create a shared pagination helper

**File:** `backend/app/common/pagination.py` (new file)

Create a reusable dependency that extracts `page` and `page_size` from query parameters with sensible defaults:

```python
from fastapi import Query

def pagination_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    return {"offset": (page - 1) * page_size, "limit": page_size}
```

### Step 2: Apply pagination to the highest-traffic endpoints first

Prioritize these endpoints (highest row counts in production):

1. `GET /inventory/items`
2. `GET /inventory/vendors`
3. `GET /customers`
4. `GET /reports/customer-performance`

For each endpoint:

1. Add `pagination = Depends(pagination_params)` to the function signature.
2. Add `.offset(pagination["offset"]).limit(pagination["limit"])` to the query.
3. Optionally run a `SELECT COUNT(*)` query and return `{ "items": [...], "total": N, "page": P, "page_size": S }`.

### Step 3: Update the frontend pages to use pagination

For each page that currently loads all data:

1. Add `page` state and "Previous / Next" (or "Load more") controls.
2. Pass `?page=X&page_size=50` to the API call.
3. Reference `StockLedgerPage.tsx` as the existing working example.

### Step 4: Fix the N+1 in `_run_promise_check`

**File:** `backend/app/modules/orders/router.py`

Instead of loading each `Item` and `StockMovement` one-by-one inside the loop:

1. Collect all `item_id` values from the BOM lines upfront.
2. Run a single `SELECT ... WHERE item_id IN (:ids) AND tenant_id = :tid` query.
3. Build a dictionary `{ item_id: stock_balance }` from the results.
4. Loop over BOM lines and look up the dictionary instead of querying.

### Step 5: Add a safety-net default limit

As a safety net, consider adding a middleware or modifying `get_db` to log a warning if any query returns more than 5,000 rows. This catches any endpoint you missed.

---

## Fix Plan: Finding #4 — Centralize Tenant Isolation

**Estimated effort:** Medium (3–4 hours)
**Risk if skipped:** Cross-tenant data leak from a single developer mistake

**Done in code (2026-03-21):** Step 1 (`require_tenant` + `get_current_user`), Step 3 (`GET /users/me` role query with tenant or global role), and **Step 4** (bootstrap: `tenants.bootstrap_token_hash` + `BOOTSTRAP_REGISTRATION_KEY`, production requires one unless dev env; hash cleared after first admin). **Remaining:** Step 2 (optional cleanup of redundant checks), Step 5.

### Step 1: Move the tenant check into `require_tenant` itself

**File:** `backend/app/common/tenant.py`

Currently `require_tenant` only resolves the tenant from the header. Modify it so it also takes `current_user` as a dependency and validates:

```python
async def require_tenant(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Tenant:
    tenant_id = request.headers.get("X-Tenant-Id")
    if not tenant_id:
        raise HTTPException(400, "X-Tenant-Id header required")

    if int(tenant_id) != current_user.tenant_id:
        raise HTTPException(403, "Tenant mismatch")

    tenant = await db.get(Tenant, int(tenant_id))
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    return tenant
```

Now **no endpoint can forget** the check — it happens automatically.

### Step 2: Remove redundant per-endpoint checks

After Step 1, search the entire codebase for:

```python
if user.tenant_id != tenant.id:
```

These checks are now redundant (the dependency already enforces it). You can remove them to reduce noise, or keep them as defense-in-depth — your choice.

### Step 3: Fix the role lookup in `GET /users/me`

**File:** `backend/app/modules/users/router.py`

Add a `tenant_id` filter to the role query:

```python
select(Role).where(Role.id == current_user.role_id, Role.tenant_id == current_user.tenant_id)
```

### Step 4: Restrict the bootstrap registration path

**File:** `backend/app/modules/auth/router.py`

**Implemented (Option B):** `tenants.bootstrap_token_hash` (Alembic `083`) + optional `BOOTSTRAP_REGISTRATION_KEY` env; production requires one when the tenant has zero users; dev env allows neither for frictionless local sign-up. **Still optional:** Option A (CLI-only first user) for stricter ops.

### Step 5: Audit all `db.get()` calls

Search for all `db.get(` calls across the codebase. For each one, verify that the code checks `row.tenant_id == tenant.id` (or that the entity is not tenant-scoped, like `Currency`). Document any gaps and fix them.

---

## Fix Plan: Finding #5 — Frontend Error Handling

**Estimated effort:** Medium (3–4 hours)
**Risk if skipped:** White screens, phantom saves, confused users

**Done in code (2026-03-21):** Steps 1–3 largely complete: `AppErrorBoundary`, `handleSessionExpiredUnauthorized` in `client.ts`, and `logApiError` + non-silent catches across listed pages (see Finding #5 Status). **Step 4:** try/catch on inventory pages (`PurchaseOrdersPage`, `GoodsReceivingPage`, `InventoryItemsPage`) — **done**.

### Step 1: Add a global React ErrorBoundary

**Implemented:** `frontend/src/components/ErrorBoundary.tsx` (wired in `main.tsx`)

Create a class component that catches render errors:

```tsx
import { Component, ReactNode } from "react";

interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-gray-800">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              {this.state.error?.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

Then wrap your app in `frontend/src/main.tsx`:

```tsx
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

### Step 2: Add a global 401 interceptor in the API client

**File:** `frontend/src/api/client.ts`

Inside the `request()` function, after checking `!res.ok`, add:

```typescript
if (res.status === 401) {
  clearAuth();
  window.location.href = "/login";
  throw new ApiError("Session expired", 401);
}
```

This ensures that no matter which page the user is on, an expired token always redirects to login.

### Step 3: Replace all silent `.catch(() => {})` patterns

Search for `.catch(() =>` across the frontend. For each instance:

- If it is a data-loading call, replace the empty catch with a proper error state:

```typescript
// BEFORE (silent failure)
api.listCustomers().then(setCustomers).catch(() => {});

// AFTER (visible failure)
api.listCustomers().then(setCustomers).catch((err) => {
  console.error("Failed to load customers", err);
  setError("Failed to load customers");
});
```

Files to fix (in priority order):

1. `MerchPipelinePage.tsx`
2. `MerchCriticalAlertsPage.tsx` (3 instances)
3. `MasterContractsPage.tsx`
4. `BtbLcsPage.tsx`
5. `WastageReportPage.tsx`
6. `ChartOfAccountsPage.tsx`
7. `ConsumptionReconciliationPage.tsx`

### Step 4: Add try/catch to unprotected mutation handlers

**Implemented (2026-03-21).** Each page wraps API calls in try/catch, `setError(...)`, and `logApiError(scope, err)`:

| Page | Covered |
|---|---|
| `PurchaseOrdersPage.tsx` | Create PO; Approve / Close / Cancel (`patchPoStatus`) |
| `GoodsReceivingPage.tsx` | Create GRN; Receive to stock (`receiveGrn`) |
| `InventoryItemsPage.tsx` | Create category/subcategory/unit/warehouse/item; edit/delete unit/warehouse/item |

### Step 5: Test

1. Manually expire your JWT (or clear it from localStorage) and click around — you should be redirected to `/login`.
2. Disconnect your backend and load any page — you should see an error banner, not a white screen.
3. Open DevTools Console and confirm no unhandled promise rejections appear during normal use.

---

## Recommended Fix Order

| Order | Finding | Why this order |
|---|---|---|
| 1 | **#1 — GL race condition** | One-line fix, prevents financial data corruption |
| 2 | **#2 — Unique constraints** | Migration + model change, prevents duplicate documents |
| 3 | **#4 — Centralize tenant check** | Eliminates an entire class of security bugs |
| 4 | **#5 — Frontend error handling** | ErrorBoundary + 401 interceptor, improves user experience |
| 5 | **#3 — Pagination** | Largest effort, but only matters at scale |
