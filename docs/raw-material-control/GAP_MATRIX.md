# Raw Material Control — Gap matrix

Sources: `docs/erp-modernization/GAP_ANALYSIS.md`, code inspection 2026-11-23, Cursor plan `rm_goods_control_40e9ba51`.

Status: **Open** | **Phase N** | **Done** | **Out of scope**

| ID | Track | Summary | Evidence (verified) | Phase | Status |
|----|-------|---------|---------------------|-------|--------|
| INV-01 | A/B | Qty `.4g` corruption | Fixed via `qty_format.py` | — | Done |
| INV-02 | C | GRN ignores PO FX | Fixed: `_apply_grn_receive_goods` × PO `exchange_rate_to_base`; `resolve_in_unit_cost` GRN fallback; scan script `scripts/scan_grn_fx_valuation.py` | 0.5 | Done |
| INV-03 residual | B | PMI / consumption issue race | Fixed: `_lock_layers_and_assert_issue_qty` on PMI + consumption-control issue | 0.5 | Done |
| FIN-05 | C | VendorBill GRNI ≠ GRN resolver | Fixed: `post_vendor_bill` buckets by `resolve_inventory_accounts` GRNI | 0.5 | Done |
| RMC-05-01 | C | VendorBill from-grn used foreign amounts vs base GRNI | Fixed: `create_vendor_bill_draft_from_grn` uses `accepted_value` or `unit_price × PO.exchange_rate_to_base`; test `test_usd_po_vendor_bill_post_clears_grni_in_base` | 0.5 | Done |
| RMC-05-02 | C | VendorBill post race / double-post | Fixed: `post_vendor_bill` locks row `with_for_update` | 0.5 | Done |
| INV-10 | C | DN stock OUT without FIFO | Fixed: `finalize_movement_fifo` + Inventory credit at FIFO value | 0.5 | Done |
| RMC-05-03 | C | DN Inventory credit used invoice ≠ FIFO | Fixed: Inventory Cr = FIFO; invoice variance → Purchase Return; test `test_debit_note_invoice_below_fifo_splits_purchase_return_variance` | 0.5 | Done |
| INV-11 | B | QC HOLD / issue from quarantine | `qc_guard.assert_item_not_on_qc_hold` on PMI; draft DN API | 3 | Done |
| INV-13 | B | No roll/shade entities | `material_rolls` + GRN shade/width + PMI shade 409 | 7 | Done |
| INV-16 | C | No landed cost | `material_landed_cost_*` bumps FIFO `unit_cost` (one ALLOCATED/GRN; refuse after issue); allocate posts Dr Inventory / Cr user-picked account as one balanced JOURNAL voucher in the same transaction (needs finance.access + open period) | 7 | Done |
| INV-18 | B | Wastage analytics-only | `material_leftover_returns` + leftover service | 4 | Done |
| FIN-18 | C | Duplicate VendorBill drafts per GRN | from-grn locks GRN + replays existing non-cancelled bill | 8 | Done |
| FIN-08 | C | Dual AP ledgers | — | Out of scope (program) | Open elsewhere |
| Style tags | A/B | PO/GRN/movement lack style/colourway | Migration 320 + PO/GRN/movement columns; propagate on receive | 2A | Done |
| Shared-style alloc | A | No FIFO-layer per-order allocation | `material_layer_allocations` (mig 321) + allocate API | 2B | Done |
| UD ledger | A/C | UD not linked to PO/GRN/issue | `ud_material_utilization_events` append-only | 2B | Done |
| Job-work chain | A/B | No style/final customer/MSC on contract | Migration 320 + confirm gate when `material_inbound_v2` | 2A | Done |
| Reuse/BTB warn | A/C | Soft buy warnings | `buy_warn_service` + `POST /material-control/buy-preview` | 2A | Done |
| Hard BTB block | A/C | Optional hard block | `material_commitment_block_v1` in buy_warn | 8 | Done (policy OFF) |
| Job-work zero value | all | Guard test before new writers | `tests/test_job_work_zero_value_invariant.py` | 0.5 | Done |
| Gate/Challan class chain | B | Class 3/4→2→1 pre-release | `challan_gate_class_chain.py` + recommend/approve routes | 4 | Done |
| Principal claim | C | Payable for customer-material damage | `principal_material_claims` (mig 323) | 5 | Done |
| Bond transfer JW | B | Job-work bond transfer table | `job_work_bond_transfers` qty-only (mig 323) | 5 | Done |
| RTV/exchange | C | First-class RTV doc | `material_rtv_documents` (mig 324) | 6 | Done |
| Watchlist | A | 5-leak cost-saving watchlist | All five buckets live (remnants, GRNI, over-buy, QC, process loss) | 7 | Done |
| Supplier scorecard | B/C | QC pass/reject by vendor | `GET /material-control/supplier-scorecard` + hub tab | 3 | Done |
| Hub UX | A/B/C | Screens scattered | Phase 1–7 hub tabs under Inventory | 1 | Done |
| Soft 3-way | C | PO vs GRN vs VendorBill match | `GET /material-control/three-way-match` warn-only | Hub | Done |

## Knitting `jobwork_customer` (read-only finding, 2026-11-23)

Verified in `inventory/router.py` Process Order receive (~L5618): when knitting family and `process_method == "jobwork_customer"`, **output** unit cost is forced to `0.0` before `finalize_movement_fifo` (good).

**Residual risk:** the **input OUT** still runs normal FIFO consumption earlier in the same receive path. If customer yarn was previously received into valued stock (e.g. NON_PO GRN that fell back to `items.default_cost`), that valued layer can be consumed and WIP/GL can still move. Inbound Job Work CMT correctly uses a separate zero-value ledger; knitting jobwork_customer does **not**. Do not change knitting without owner approval — track as a follow-up finding, not a Phase 0.5 fix.

## Security remediation (2026-11-23)

After CRITICAL FAIL (`MC-SEC-01` DN finance bypass, `MC-SEC-02` RTV idempotency race): debit-note create from Material Control now requires `finance.access` + `credit_debit_note_enabled` + soft `finance.debit_note.create`; migration **325** adds partial unique `request_id` indexes on RTV/bond/claim with lock+replay; UD/allocation related ids `ensure_owned`; claim settle is terminal; PMI QC hold is flag-gated.

Phase 7 lite security follow-up: PMI `roll_id` bound to item/warehouse; one ALLOCATED landed-cost per GRN (mig **327**); allocate refuses after any GRN layer issue; unshaded roll rejected when shade required. Landed-cost GL (SEC-P7-03) now done: allocate requires `credit_account_id`, posts Dr inventory (stock-group account per item) / Cr that account via `create_system_voucher` (source `MATERIAL_LANDED_COST`, ref `LC:<doc id>`), guarded by the locked doc status + one-ALLOCATED-per-GRN index.

```text
docker compose exec -T backend pytest tests/test_material_control_security_remediation.py \
  tests/test_material_rtv.py tests/test_job_work_bond_transfer.py -q
```

## Phase 0.5 acceptance tests (Docker)

Closed 2026-11-23 after security re-audit **PASS WITH FINDINGS** (RMC-05-01/02/03 fixed; residuals info/low deferred).

```text
docker compose exec backend pytest \
  tests/test_grn_fx_valuation.py \
  tests/test_pmi_concurrent_issue.py \
  tests/test_vendor_bill_grni_resolver.py \
  tests/test_debit_note_fifo_stock.py \
  tests/test_job_work_zero_value_invariant.py \
  tests/test_material_control_hub.py -q
```
