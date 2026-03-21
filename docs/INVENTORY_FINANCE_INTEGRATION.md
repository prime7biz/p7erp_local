# Inventory–Finance Integration (FIFO)

Technical baseline for stock valuation, GL posting, and reporting integration.

## Source of truth

- **Quantity:** `stock_movements` (IN / OUT) by `item_id`, `warehouse_id`.
- **FIFO value:** `inventory_cost_layers` (one layer per inbound `stock_movements.id` with `qty_remaining`).
- **Posted accounting:** `vouchers` + `voucher_lines` with `status = POSTED`, linked via `inventory_gl_postings` for idempotency.

## Event matrix (valuation + GL)

| Event | Stock movement | FIFO | GL (when accounts configured) |
|-------|----------------|------|-------------------------------|
| GRN receive | IN per line | Layer at PO unit price or `items.default_cost` | Dr `stock_groups.inventory_account_id` or `coa_config.inventory_stock_account_id`, Cr `grni_account_id` or `inventory_clearing_account_id` |
| Delivery challan POSTED | OUT per line | Consume FIFO layers | Dr `cogs_account_id` or fallback stock COA, Cr inventory account |
| Process order issue | OUT input | Consume FIFO | Dr `wip_account_id` (output item’s group), Cr input inventory account |
| Process order receive | IN output | Layer at (input cost + processing) / output qty | Dr output inventory, Cr WIP |
| Stock adjustment + | IN | Layer at `default_cost` | Dr inventory, Cr adjustment account |
| Stock adjustment − | OUT | Consume FIFO | Dr adjustment, Cr inventory |
| Physical count variance | IN or OUT | Same as adjustment | Same as adjustment |
| Warehouse transfer | OUT + IN | OUT consumes; IN layer at transferred unit cost | None (same legal entity) |
| Consumption issue (order) | OUT | Consume FIFO | Dr COGS (item group), Cr inventory |

## Idempotency

- Table `inventory_gl_postings`: unique `(tenant_id, source_system, source_id, action)`.
- FIFO layers: unique `source_movement_id` (one layer per inbound movement).

## API contracts (summary)

- `GET /api/v1/inventory/stock-summary/by-group` — grouped by stock group (items with `stock_group_id`).
- `GET /api/v1/inventory/stock-summary/by-warehouse` — grouped by warehouse.
- `GET /api/v1/inventory/stock-summary/wip` — open process orders (ISSUED): input value from issued OUT `movement_value`.
- `GET /api/v1/inventory/stock-summary/overview` — totals RM/FG/WIP/grand (by group naming heuristic: optional; default totals by positive stock value + WIP).
- `GET /api/v1/inventory/reconciliation/stock-vs-gl` — FIFO total vs sum of configured inventory asset accounts (or CoA default).
- `GET /api/v1/inventory/reconciliation/wip-vs-gl` — WIP from open process orders vs WIP GL accounts (sum accounts under groups linked from `stock_groups.wip_account_id` or name match).

## Migration order

1. `087_inventory_finance_fifo_gl.py` — columns, `inventory_cost_layers`, `inventory_gl_postings`, stock group GL FKs, `items.stock_group_id`.
2. Application deploy — run `POST /api/v1/inventory/fifo-rebuild` (manager/admin) once per tenant after upgrade, or run `scripts/backfill_inventory_fifo.py`.

## Rollback

- Downgrade migration removes new tables/columns; GL vouchers already posted remain (manual reversal if needed).

## Acceptance gates

- Trial balance balances after inventory postings.
- Stock summary valuation matches sum of layer `qty_remaining * unit_cost` (within rounding).
- No duplicate vouchers for the same source document + action.
