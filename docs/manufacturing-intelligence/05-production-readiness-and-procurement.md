# 05 - Production readiness and procurement synchronization

## 1. Readiness gate catalog

| Gate | Track | Class | Evidence (existing tables) | Phase |
|---|---|---|---|---|
| Commercial confirmation | Commercial | Mandatory | `orders.status` NEW / CONFIRMED / IN_PROGRESS | 1 |
| Order BOM approved / frozen | Material | Mandatory | `boms` active with `order_id`, status APPROVED / FROZEN | 1 (flag) |
| Material availability | Material | Mandatory | Order BOM requirement vs `compute_items_availability` (unchanged) | 1 |
| Technical approvals | Technical | Mandatory if template says so | `order_followup_actions` (lab dip, fit, PP, bulk fabric) | 1 |
| Samples | Technical | Informational | `merch_sample_requests` | 1 |
| Line allocation | Production | Mandatory | `sewing_line_style_configs` FIRM_BOOKED / IN_PROGRESS | 1 |
| Approved OB / SMV | Technical | Informational in P1 | `operation_bulletins` | 1 |
| Upstream knitting / dyeing | Material | Mandatory where routed | `knitting_work_orders`, `dye_batches`, process orders | 2 |
| Skilled manpower / machine profile | Production | Mandatory | Assignments (new) | 2 |
| Finance coverage | Finance | Owner decides block vs warn | Phase 3 | 3 |
| Shipment booking / documents | Logistics | Informational | Trade case, export case | 2 |

Readiness is **not** an arbitrary weighted percentage. The response lists blockers (mandatory, not ready)
separately from informational progress, gives the responsible department and, where evidence allows, an
expected ready date.

## 2. Material requirement authority

- Use the **active Order BOM** (`boms.order_id = order.id AND is_active`, unique index `uq_boms_tenant_order_active`)
  with status APPROVED or FROZEN. Requirement per line = `bom_items.required_gross_qty` when present, else
  `order_qty x net x (1 + wastage% + process_loss%)`.
- If only a style BOM exists, the material result is labelled **STYLE_ESTIMATE**, is informational and can never
  make the order fully ready.
- Controlled by flag `mfg_order_bom_readiness_v2` (default OFF). When OFF, the legacy readiness result
  (latest style BOM) is returned unchanged.

## 3. Phase 1 limitation (stated in every response)

Phase 1 uses the existing availability calculation (`stock_availability_service.compute_items_availability`).
That calculation checks each order **in isolation** against all stock and all open POs for the item, so several
orders can each look ready using the same stock. Phase 1 marks this with reason
`SHARED_SUPPLY_NOT_ALLOCATED`. Phase 2 fixes it.

## 4. Phase 2 reservation taxonomy (closes verifier findings F1-F3)

Existing table `stock_reservations` keeps its `status` column. Existing readers
(`stock_availability_service.py:98`, `mrp_engine_service.py:234`, `reorder_service.py:41`) only read
`status IN ('SOFT','HARD')`. Migration 162 created `status` as a plain string (no CHECK, no enum).

- New writers always write `status = 'ACTIVE'` (lifecycle ACTIVE / RELEASED / CONSUMED / EXPIRED) plus new nullable
  columns `reservation_kind` (HARD_ATP, TENTATIVE, INFORMATIONAL), `reservation_source`, `expires_at`,
  `bom_item_id`, `lock_version`.
- With `mfg_material_allocation_v1` OFF, every existing reader ignores ACTIVE rows, so ATP, promise, readiness,
  MRP and reorder stay **byte-identical** (golden test F-T1), even after the flag is switched off again.
- With the flag ON, a central service maps legacy HARD to HARD_ATP and SOFT to TENTATIVE, and all readers change in
  one release: hard ATP subtracts HARD_ATP only; tentative appears only in "stressed" views.
- Quantities are `Decimal` (`StockReservation.reserved_qty` annotation changes from float to Decimal; column is
  already `Numeric(18,4)`).

## 5. Single inbound-supply source (Phase 2)

New `backend/app/modules/inventory/open_po_supply_service.py` used by availability, MRP, reorder and pegging:

- `usable_received = sum(accepted_qty)` (received qty only under an approved legacy fallback)
- `line_on_order_net = max(0, ordered_qty - usable_received)` for truly open PO lines (status set = owner decision)
- `on_order_net = sum(line_on_order_net)`

Pegging (`mfg_material_supply_peggings`) only **partitions** `on_order_net`:

- `free_inbound = max(0, on_order_net - hard_pegged)`
- `stressed_free_inbound = max(0, on_order_net - hard_pegged - tentative_pegged)`
- Invariant: `free_inbound + hard_pegged = on_order_net` (test F-T2).
- A receipt that shrinks supply below existing pegs raises an allocation conflict for the planner.

Locking: reuse the two-integer advisory lock in `inventory/stock_locks.py` `(tenant_id, item_id)` (separate lock
space from `background_lock` ids 771001-771005) plus `FOR UPDATE` row locks for warehouse granularity; pegging locks
the `PurchaseOrderItem` row. Reservations create no stock movement and no valuation entry.

Lifecycle: cancellation releases; quantity reduction releases the excess; increase allocates the delta; BOM revision
diffs old and new lines; tentative expiry sets EXPIRED; every transition is idempotent.

## 6. ETA chain and latest safe purchase date (Phase 2)

ETA source priority: supplier portal commitment > revised PO date > `PurchaseOrder.expected_date` >
supplier quotation `delivery_days` > `Item.lead_time_days` > tenant default > UNKNOWN.

`latest_safe_purchase_date = required_usable_date - supplier_lead_working_days - transit_days - GRN_QC_days - safety_buffer`

In-house fabric: `latest_yarn_release = cut_need_date - knitting_days - dyeing_days - testing_days - transfer_buffer`.
All in working days; missing durations return a range with low confidence.

## 7. Upstream and special supply (Phase 2)

- Knitting / dyeing batches are finite-capacity supply stages; outsourced stages use supplier ETA and reliability.
- Subcontract / CMT sewing: separate external capacity, never added to own lines.
- Wash, print, embroidery: lead-time stages in readiness and delivery prediction.
- Multi-factory transfers: transfer lead time and receiving confirmation.
- Buyer-nominated suppliers: no automatic vendor substitution.
- Consignment / buyer-supplied trims: separate ownership; not company purchase cost.

## 8. Double-counting safeguards (summary)

| Risk | Phase 1 | Phase 2 |
|---|---|---|
| Same stock counted for many orders | Flagged `SHARED_SUPPLY_NOT_ALLOCATED` | Hard reservations under lock |
| Open PO counted by many orders | Flagged | Pegging partitions net supply |
| Fully received PO counted as incoming | Not used by Phase 1 | Net open supply service |
| Inquiry later becomes order | Not included | Lineage dedupe inquiry -> quotation -> order |
