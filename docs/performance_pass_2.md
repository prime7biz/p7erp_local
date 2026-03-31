# Performance pass 2 (2026-03-30)

## What changed

### A) Stock summary — database-side pagination

- **`GET /api/v1/inventory/stock-summary`** now applies filters (`search`, `warehouse_id`, `hide_zero`), sort (`sort`, `sort_dir`), **`LIMIT`/`OFFSET`**, and **filtered total count** in SQL via `_stock_summary_page_sql` in [`backend/app/modules/inventory/router.py`](../backend/app/modules/inventory/router.py).
- Legacy **`_stock_summary_rows`** remains for other inventory reports (valuation, by-group, etc.) that still load the full tenant summary in Python — **not** changed in this pass to limit regression risk.
- Semantics aligned with the previous endpoint: same movement bucketing (IN vs not-IN), substring search on item code/name, `hide_zero` using **rounded** on-hand to 3 decimals.

### B) Remote search selectors (reuse)

- New hook [`frontend/src/hooks/useRemotePaginatedSearch.ts`](../frontend/src/hooks/useRemotePaginatedSearch.ts): debounced query, paged fetch, stale-response isolation (separate sequence for “replace list” vs “append”), optional **hydrate-by-id**.
- New UI [`frontend/src/components/app/RemoteSearchSelect.tsx`](../frontend/src/components/app/RemoteSearchSelect.tsx).
- Shared API adapters [`frontend/src/lib/remoteSelectFetchers.ts`](../frontend/src/lib/remoteSelectFetchers.ts) for **inventory items**, **vendors**, **orders** (paginated list).
- **Backend**
  - `GET /api/v1/inventory/items`: optional **`search`** (code/name, case-insensitive contains).
  - `GET /api/v1/inventory/items/{item_id}`: **single item** for selector hydration and BOM cost lookups.

### C) Screens updated (drop 500-cap `<select>` masters)

- [`frontend/src/pages/app/BomBuilderPage.tsx`](../frontend/src/pages/app/BomBuilderPage.tsx): add/edit line **item** selector, draft PO **vendor** selector; BOM line **default_cost** resolved per linked `item_id` via `getInventoryItem` (no full catalog load).
- [`frontend/src/pages/app/ManufacturingOrdersPage.tsx`](../frontend/src/pages/app/ManufacturingOrdersPage.tsx): **finished item** selector; KPI low-stock still uses a **fixed sample** of stock summary (see deferred).
- [`frontend/src/pages/app/ConsumptionPlansPage.tsx`](../frontend/src/pages/app/ConsumptionPlansPage.tsx): **order** picker uses `listOrdersPaginated` + search.

### D) CSV export safety

- [`frontend/src/lib/exportPagedCsv.ts`](../frontend/src/lib/exportPagedCsv.ts): shared walker with **max rows**, **max iterations**, **total drift detection**, **stuck offset**, **repeated page** heuristic.
- [`frontend/src/pages/app/StockSummaryPage.tsx`](../frontend/src/pages/app/StockSummaryPage.tsx): uses helper; shows a **warning banner** when export is truncated or guarded.

### E) Indexes

- Alembic [`backend/alembic/versions/142_performance_pass2_items_mo_indexes.py`](../backend/alembic/versions/142_performance_pass2_items_mo_indexes.py):
  - `ix_items_tenant_id_item_code` — tenant-scoped item list / sort.
  - `ix_manufacturing_orders_tenant_id_id` — tenant filter + `id` ordering for MO list.

### F) Client / API clarity

- `listInventoryItemsPaginated` accepts **`search`**; `getInventoryItem` added.
- JSDoc on `listConsumptionPlans` vs `listConsumptionPlansWithTotal` in [`frontend/src/api/client.ts`](../frontend/src/api/client.ts).

## Intentionally deferred

- **Materialized on-hand** or rolling snapshot table for stock (biggest win for very large movement history; needs design + backfill).
- Refactoring **all** `_stock_summary_rows` consumers to SQL (valuation, FIFO summaries, dashboards).
- **Proforma** remote typeahead: `GET /commercial/proforma-invoices` still has no text search / total header — add when a form needs it.
- **Customer** selectors: already use `q` + `listCustomersPaginated`; no change this pass.
- **PostgreSQL-only** `DESC` index on `manufacturing_orders(id)` — optional follow-up if profiling shows sort cost.

## Risk by area

| Area | Risk | Mitigation |
|------|------|------------|
| Stock summary SQL | Medium — sort / null warehouse / rounding vs old Python | Matched prior rules; `NULLS LAST` on warehouse name; rounded on-hand for `hide_zero` |
| New `GET /items/{id}` | Low | Standard read; tenant-scoped |
| Remote selectors | Low–medium | Hydrate-by-id; load-more; existing list APIs |
| BOM cost column | Low | Fetches only `item_id`s present on current BOM |
| Export helper | Low | Caps + user-visible notice |
| New indexes | Low | Conventional btree; downgrade drops them |

## Recommended next targets

1. Replace **full `_stock_summary_rows`** downstream endpoints with SQL or cached snapshots.
2. Add **search + `X-Total-Count`** (or paginated JSON) for **proforma** lists used in document flow.
3. **MO KPI “low stock”**: dedicated small endpoint or SQL `COUNT` with threshold instead of sampling.
4. Optional **pg_trgm** / full-text on `items.name` if `ILIKE %q%` becomes hot at scale.

## Verification (Docker)

```bash
docker compose exec backend pytest tests/test_inventory_vendor_schemas.py -q
docker compose exec backend alembic upgrade head
```

Frontend: `npm run lint` in `frontend/` for touched files.
