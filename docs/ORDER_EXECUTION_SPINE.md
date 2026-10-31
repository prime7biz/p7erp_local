# Order execution spine (canonical path)

> **End users:** for a plain-language walkthrough (menus, checklist, who does what), read **[ORDER_WORKFLOW_USER_GUIDE.md](ORDER_WORKFLOW_USER_GUIDE.md)**.

## Purpose

After order confirmation, one **execution spine** connects merchandising, procurement, planning, shop floor, quality, and shipment. Individual screens stay specialist tools; the order is the single status source.

## Canonical happy path

```text
Order confirmed
  → Order BOM (approve / freeze)
  → Follow-up TNA (merch calendar — canonical)
  → Consumption plan / material requirement
  → Purchase order (from governed BOM)
  → GRN (RM in-house)
  → Line plan / reservation
  → Hourly / department production (order_id required when flag on)
  → QC / CAPA
  → Delivery challan (POSTED)
  → Payment → Completed
```

Pipeline stages (`orders.pipeline_status`) auto-advance from real documents via `auto_advance_order_pipeline` in `backend/app/modules/orders/pipeline_service.py`.

## Canonical vs secondary

| Concern | Canonical (use this) | Secondary (keep, do not duplicate edits) |
|---------|----------------------|------------------------------------------|
| TNA calendar | Merch Follow-up (`/app/followup`, `OrderFollowupAction`) | Manufacturing TNA plans (`/app/tna/*`) — link via `external_id` |
| Samples | Merch sample development (`/app/merchandising/samples`) | Manufacturing samples (`/app/samples/requests`) |
| BOM authority | Non-legacy **order** BOM APPROVED/FROZEN | Style/classic BOM (costing / reference) |
| Production milestone | Process order / work order **or** hourly with `order_id` (when wired) | Unlinked floor entries |

## Event sync (feature flag `tna_event_sync`)

When enabled, business events complete matching TNA milestones (`milestone_type` / template `code`):

| Event | Milestone codes |
|-------|-----------------|
| Merch sample approved (pp / lab dip / etc.) | `pp_approval`, `lab_dip_approval`, … |
| GRN received | `fabric_in_house`, `accessories_in_house` |
| Hourly cutting/sewing start | `cutting_start`, `sewing_start` |
| Delivery challan POSTED | `shipment_confirmation`, `ex_factory` |

Service: `backend/app/modules/merch/followup_sync_service.py`.

## Related feature flags (default off unless noted)

| Flag | Effect |
|------|--------|
| `tna_event_sync` | Auto-complete TNA from GRN / samples / challan / production |
| `require_order_id_on_shop_floor` | Hourly upsert requires `order_id` |
| `line_allocation_confirm_enabled` | Soft/firm line booking treated as confirmed allocation + TNA sync |
| `sample_approval_gates_for_po` | Block BOM→PO until key approval milestones done |
| `capa_blocks_challan` | Block challan POST when open CAPA exists for the order |

## UI entry points

- Order Detail — pipeline tracker + **Next required action**
- Merch Follow-up — canonical TNA calendar (system badge when auto-completed)
- Merch Control Tower — aggregates including OTD risk
- Production Planning — line reservation soft/firm confirm
