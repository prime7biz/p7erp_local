# Gap Analysis — evidence-backed comparison matrix

Audit date: 2026-11-03. Companion to [CURRENT_STATE.md](CURRENT_STATE.md). Backlog items referenced as `E<n>.<m>` are in [BACKLOG.md](BACKLOG.md).

## How to read this document

**Status:** `VC` Verified complete · `VP` Verified partial · `VA` Verified absent within inspected scope · `DEF` Defective · `NV` Not verified · `NA` Not applicable.
**Evidence type:** `S` static code · `R` runtime reproduction (local container, rolled-back transaction) · `T` existing test · `D` documentation only.
**Confidence:** H / M / L. **Priority:** P0 (financial integrity, data loss, tenant leakage, incorrect inventory/payroll, production-blocking) · P1 (essential workflow/control gap) · P2 (efficiency/visibility/usability) · P3 (advanced optimization).
**Action:** retain · improve · refactor · build · integrate · retire.

Unless marked `R`, a `DEF` finding is a **potential defect found in code**, not a reproduced failure. Line numbers are approximate.
Security findings are summarized here; exploit-level detail is held privately by the core team (not in this repository).

---

## 0. Remediation status (updated 2026-11-04, stage 1 — local code, not deployed)

| ID | Status now | Evidence | Remaining |
|---|---|---|---|
| OPS-01 | Resolved locally (tooling + truthful UI) | Backup/restore scripts; local drill PASS; `tests/test_settings_backup_status.py` | Production schedule, off-site copy, production drill |
| SEC-03 | Resolved in code (8 root causes + incidental writers + defensive readers) | `tests/test_tenant_ownership_regressions.py` (9 tests, incl. the 4 formerly reproduced cases) | Production data scan; CI sweep for unchecked `*_id` fields (E1.2) |
| HR-04 | Resolved in code (fail-closed `hr.payroll.manage`) | `tests/test_hr_pay_setup_authz.py` | Access migration before deploy |
| HR-02 | Partially resolved: edits gated, locked-period protection, audit entry; leave types gated | same test file | Device adapter (HR-06), OT/proration (HR-03) |
| HR-06 | Resolved in code (2026-11-06): devices with hashed per-device API keys, raw punch store (migration 280, idempotent on device + employee + time), CSV / JSON / ZKTeco ATTLOG import and `X-Device-Key` push, entries rebuilt per shift rules; manual / regularized / locked days untouched | `tests/test_attendance_devices.py`, `tests/test_attendance_device_adapters.py` | Native ZKTeco ADMS (`/iclock`) needs a bridge; no separate device-PIN column (PIN = employee code) |
| HR-03 (part) | OT from salary (2026-11-06): flag `payroll_ot_from_salary_enabled` (default off), base ÷ `hr_ot_hours_per_month` (208) × rule / `hr_ot_multiplier` (2), salary per work date, daily cap, mode frozen per run; HR Settings screen (weekend days, OT) | `tests/test_payroll_ot_from_salary.py`, `tests/test_hr_settings.py` | BD rule-set sign-off, late deductions, golden cases |
| SEC-01 / SEC-02 | Observation tooling only | `backend/scripts/rbac_access_report.py` | Role mapping per tenant, then shadow → enforce |
| BD-03 | Partially resolved (link ownership validated) | code | Retire legacy route |
| SEC-01 | Mechanism added (stage 2): platform default `RBAC_DEFAULT_MODE` (off), Roles-page notice; tenant default unchanged | `tests/test_security_round2_auth.py` | Shadow → enforce per tenant after role review |
| SEC-02 | Resolved in code (stage 2): every module router carries its key; route inventory test | `tests/test_route_permission_inventory.py` | Effective once a tenant leaves RBAC "off" |
| SEC-05 | Mechanism added (stage 2): tenant flag `strict_sensitive_permissions` | `tests/test_security_round2_auth.py` | Enable per tenant after granting roles |
| SEC-06, SEC-07, SEC-09, SEC-08, OPS-03 (Watchtower) | Resolved in code (stage 2) | see [STAGE2_SECURITY_REMEDIATION.md](STAGE2_SECURITY_REMEDIATION.md) | OPS-03 CI gate; SEC-04 deferred |
| All other findings | Unchanged | — | See [STAGE1_REMEDIATION.md](STAGE1_REMEDIATION.md) §7 for the next batch |

The overall tenant-isolation assessment remains **Verified partial**: the reviewed candidates are fixed, but the
heuristic does not cover every query or writer, and production data has not been scanned.

## 1. Priority summary

| Priority | Findings |
|---|---|
| **P0** | OPS-01, SEC-01, SEC-03, FIN-01, FIN-02, FIN-03, FIN-04, FIN-05, INV-01, INV-02, INV-03, INV-04, COM-01, HR-01, HR-03, HR-04 |
| **P1** | MER-01, MER-02, MER-03, MER-05, MER-07, MER-08, MER-13, MER-14, COM-02, COM-03, COM-04, INV-05, INV-06, INV-08, INV-09, INV-10, INV-11, INV-17, INV-20, GATE-01, PRD-01, PRD-02, PRD-03, PRD-04, PRD-09, PRD-10, PRD-13, QA-01, FIN-06, FIN-07, FIN-09, FIN-13, FIN-18, HR-02, HR-05, HR-09, BD-03, SEC-02, SEC-04, SEC-05, SEC-09, SEC-10, SEC-11, SEC-13, OPS-02, OPS-03 |
| **P2** | MER-04, MER-06, MER-09, MER-10, MER-11, COM-05, COM-06, COM-08, COM-09, INV-07, INV-12, INV-13, INV-14, INV-15, INV-16, INV-18, INV-19, PRD-05, PRD-06, PRD-08, PRD-11, PRD-12, QA-02, QA-03, QA-04, FIN-08, FIN-10, FIN-11, FIN-12, FIN-14, FIN-15, FIN-17, HR-06, HR-07, HR-08, BD-01, BD-02, BD-04, SEC-06, SEC-07, SEC-08, SEC-12, OPS-04, OPS-05, OPS-06, AI-02, IOT-01 |
| **P3** | PRD-07, FIN-16, AI-03, IOT-02 |

---

## 2. Module comparison matrices

### A. Buying house and merchandising

| ID | Current behavior | Evidence | Type / Conf | Status | Business impact | Action / Pri | Depends on | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| MER-01 | Orders created from quotations start `NEW`; `NEW` can only go to `CANCELLED`, so they never reach the commercially locked statuses; change requests refuse with `CHANGE_REQUEST_NOT_REQUIRED` | `backend/app/common/workflow.py` L48–55; `modules/orders/router.py` ~L976; `orders/commercial_fields.py` ~L8 | S / H | DEF | Confirmed orders remain silently editable (qty, delivery, commission); lock and change-request controls are bypassed in the main flow. Tests seed `CONFIRMED` directly, hiding it | refactor / P1 | data check of live order statuses (OPEN_QUESTIONS Q4) | `NEW→CONFIRMED` transition with approval; orders converted from quotations reach lock; backfill plan for existing `NEW` orders; test from-quotation → confirm → PATCH blocked |
| MER-02 | Quotation revise copies header only and collides with unique `(tenant, inquiry_id)` index | `quotations/router.py` `revise_quotation` ~L491–542; migration 070 ~L54 | S / H | DEF | Revision fails for inquiry-linked quotations; costing history lost | refactor / P1 | — | Revision creates versioned child with all cost lines and parent link; old version superseded; test added |
| MER-03 | Order amendments are client-asserted rows (`old_value`, `status` default APPROVED) that don't change the order; amendment number `max+1` without lock | `orders/router.py` `create_order_amendment` ~L1155–1186 | S / H | DEF | Misleading audit trail; duplicate numbers | refactor / P1 | MER-01, FIN-06 | Amendments go through change-request service; server computes old value; unique number |
| MER-04 | Samples: single revision, internal status only, no buyer evidence; gate PO only if `sample_approval_gates_for_po` (default off) | `merch/routers/samples.py` ~L56, ~L575–632; `merch/execution_gates.py` ~L60 | S / H | VP | Buyer approval not evidenced; resubmission cycle missing | improve / P2 | — | Sample rounds with attachments, approver identity, comments; gate configurable per tenant |
| MER-05 | BOM versioning fields never written; FROZEN terminal; no unique active BOM per order; price edits after freeze allowed with override | `models/merch.py` Bom ~L283; `merch/bom_prefill_service.py` ~L56; `merch/routers/boms.py` ~L152, ~L327, ~L391–435 | S / H | VA (revisions) / DEF (uniqueness) | No approved-revision history; concurrent duplicate active BOMs; cost drift after freeze | build / P1 | — | Revise-from-frozen creates `version_no+1` with `revision_of_bom_id`; partial unique index active BOM per order; post-freeze edits only via revision |
| MER-06 | No tech pack, measurement spec, size-wise consumption models | grep across `models/` | S / M | VA | Merchandisers keep specs outside ERP | build / P2 | MER-05 | Tech-pack header + measurement chart per style revision |
| MER-07 | Tenant type and `trade_enabled` enforced only in frontend sidebar; `tenant_can_access_*` helpers unused | `common/tenant.py` ~L72–77; `frontend/src/components/shell/sidebarNavUtils.ts` | S / H | DEF | Hidden modules reachable by API | improve / P1 | SEC-01 | Backend dependency rejects module routes for disallowed tenant types; tests |
| MER-08 | Quotation submit/approve/send lack approver permission; self-approval possible; BOM submit ungated | `quotations/router.py` ~L419–467; `merch/routers/boms.py` ~L546, ~L585 | S / H | VP | No separation of duties on price commitments | improve / P1 | FIN-06 pattern | Approval requires permission and approver ≠ preparer (configurable) |
| MER-09 | No distinction between manufacturer, buying-house agent, principal trader, CMT; only intermediary kinds and commission fields | `parties/router.py` ~L139; commission fields on inquiry/quotation/order | S / M | VA | Ownership, revenue vs commission, payables and inventory treatment cannot differ by model | build / P2 | business decision Q2 | `trade_model` on order/trade case driving revenue/commission/ownership rules |
| MER-10 | Buyer claims / chargebacks not modelled | grep | S / M | VA | Claims handled off-system; no AR/credit-note link | build / P2 | COM-04 | Claim record → approval → credit note/settlement |
| MER-11 | TNA milestones sync from events only if `tna_event_sync` (default off) | `merch/followup_sync_service.py` ~L48 | S / H | VP | T&A not driven by actual events by default | improve / P2 | — | Flag enabled per tenant after UAT; dashboards show event-driven completion |
| MER-12 | Commission engine: Decimal, row locks, rate precedence, TDS/VDS, draft voucher | `modules/commission/service.py` ~L53–196; `router.py` ~L483–930 | S, T / H | VC | Strong | **retain** | — | — |
| MER-13 | `PATCH /trade-cases/{id}` sets stage/status directly, bypassing transitions, required documents, and `trade.transition` | `modules/trade_case/router.py` `update_trade_case` ~L279–310 | S / H | DEF | Workflow and document controls bypassable | refactor / P1 | — | PATCH rejects stage/status; transitions only via transition endpoint; test |
| MER-14 | `TradeCase` money columns mapped as Python float (DB Numeric after migration 072); margin computed in float | `models/trade.py` ~L55–61 | S / H | DEF | Rounding errors in margin reporting | refactor / P1 | — | Mapped `Decimal` with `Numeric`; Decimal arithmetic; regression test |

### B. Commercial and export/import

| ID | Current behavior | Evidence | Type / Conf | Status | Business impact | Action / Pri | Depends on | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| COM-01 | Same order can be placed on several ISSUED export PIs; duplicate order ids in one request create duplicate links; PI creatable directly as ISSUED; PI amount not reconciled; link table lacks `tenant_id`, qty, value | `commercial/router.py` `create_proforma_invoice` ~L924–1027 (~L977 `status=body.status`), update ~L1080–1102; `models/commercial.py` ProformaInvoiceOrder ~L158 | S / H | DEF | Double billing / double financing exposure | build / P0 | data check of duplicates (Q5) | Allocation table with qty/value per order line; server rejects over-allocation; status only via finalize; backfill from links; reconciliation report = 0 duplicates |
| COM-02 | Contract/LC amendments overwrite `amount`, `expiry`, `status`; no history | `commercial/router.py` `update_master_contract` ~L788–825 | S / H | VA | No audit trail of LC value/expiry changes; exposure history lost | build / P1 | — | Amendment records (sequence, field deltas, bank ref, effective date); header reflects latest; history report |
| COM-03 | BTB↔contract single FK; cap hard-coded 70% summing all BTB LCs incl. cancelled, mixed currency, float, unlocked; supplier/sales PI direction partly validated; BTB amount editable after vouchers | `commercial/router.py` ~L102, `_enforce_btb_lc_utilization_cap` ~L422–455, `create_btb_lc` ~L2004–2092, `update_btb_lc` ~L2100–2186 | S / H | DEF | Over-utilization undetected; wrong headroom | build / P1 | FX rates (FIN-09) | `btb_contract_allocations` with base-currency amounts; status-aware, locked cap; configurable per bank/contract |
| COM-04 | Export bill, bank submission, discrepancies, negotiation, proceeds realization, short realization, bank charges posting absent; BTB acceptance supports one import bill | `commercial/` grep; `maturity_engine.py`, `exposure_service.py` read-only | S / M | VA | Realization and LC settlement tracked off-system; no FX gain/loss | build / P1 | FIN-01, FIN-09 | Export bill lifecycle with realization allocations, charges and FX difference postings |
| COM-05 | Loan facility module exists (`modules/facility`) with utilization, accrual, repayment, GL drafts | `modules/facility/*` | S / M | VP | Bank facility tracking partly available | improve / P2 | COM-03 | Facility utilization linked to BTB/export allocations |
| COM-06 | Contract / PI / BTB `reference` not unique | migrations (index only) | S / H | VA | Duplicate LC numbers | improve / P2 | data cleanup | Unique `(tenant, type, reference)` after dedupe |
| COM-07 | Shipment / expiry / presentation-date conflict checks | not inspected in depth | — | NV | — | — | — | Evidence needed: search for date validations in commercial router |
| COM-08 | Bangladesh registers: UD + amendments, bond import/export entries, utilization, Mushak 6.1/6.2 derived registers; CSV/XLSX export; warnings only | `compliance/bd_router.py`, `bd_registers_service.py` | S, T / H | VP | Useful foundation | **retain** + improve / P2 | — | See BD-* |
| COM-09 | Exposure split (non-accepted LC vs accepted bills vs booked payables): maturity tranches exist but are read-only; LC opening does **not** post expense/payable (correct) | `commercial/router.py` `create_btb_lc` ~L2069; `exposure_service.py` | S / M | VP | Contingent vs actual liability not reported distinctly | build / P2 | COM-03, COM-04 | Exposure report: opened-not-accepted (memo), accepted (liability), paid |
| COM-10 | Forced-loan / overdue exposure tracking | not found | S / L | NV | — | — | — | Evidence needed |

### C. Procurement, MRP, inventory

| ID | Current behavior | Evidence | Type / Conf | Status | Business impact | Action / Pri | Depends on | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| INV-01 | PO/GRN quantities formatted with `.4g` (4 significant digits): 12,345.6 → 12,350 | `merch/bom_procurement_service.py` L228, L305; `inventory/router.py` L2982, L3010, L3031–3032, L3121 | S / H | DEF | Silent quantity corruption for fabric lines ≥10,000 | refactor / P0 | reconciliation of affected rows | Decimal quantities end-to-end; data scan lists affected POs/GRNs; unit test 12,345.6 round-trips |
| INV-02 | GRN valuation ignores PO currency/`exchange_rate_to_base` | `inventory/router.py` `_apply_grn_receive_goods` ~L3063–3323 | S / H | DEF | Foreign-currency purchases valued in BDT 1:1 — inventory and GRNI misstated | refactor / P0 | FIN-01 | Base-currency unit cost at GRN; reconciliation of historic USD GRNs |
| INV-03 | No lock on material issue, consumption issue, transfer post, adjustment post, physical count post, IDT; IDT no availability check; material issue ignores negative-stock policy | `inventory/router.py` ~L4690, ~L5692, ~L6238, ~L6375; `idt_service.create_idt` ~L111–228; locks only at ~L4106 | S / H | DEF | Oversell/negative stock; double posting under concurrency | refactor / P0 | E3 stock service | All stock-out paths use one locked service with policy check; concurrency test passes |
| INV-04 | Split commercial invoices: each customer/currency group receives all challan items; consolidated challans count lines once per linked order | `commercial/commercial_invoice_service.py` ~L159, ~L207, ~L484–498 | S / H | DEF | Over-invoicing/AR overstatement | refactor / P0 | — | Items partitioned per group; shipped-vs-invoiced test with split and consolidated challans |
| INV-05 | MRP: single bucket; on-order filter misses `FULLY_RECEIVED`, counts DRAFT and full line qty; released planned orders double counted; reruns duplicate rows; release unlocked; stale `Item.current_stock` | `inventory/mrp_engine_service.py` ~L201–248, ~L292–456; `stock_valuation_service.refresh_item_stock_caches` ~L231 | S / H | DEF | Systematic under-planning | refactor / P1 | INV-06, INV-08 | Netting uses ledger balance, open PO qty (ordered − received), reservations; idempotent reruns |
| INV-06 | `StockReservation` read by availability/MRP/reorder but never written | `models/inventory.py` ~L311; no writers | S / H | VA | Several orders compete for the same stock | build / P1 | INV-08 | Reservation service (create/release/consume) used by readiness and issue |
| INV-07 | No purchase requisition, RFQ, supplier quotation comparison | `models/*` | S / H | VA | Sourcing decisions not auditable | build / P2 | — | Requisition → RFQ → comparison → PO with approval |
| INV-08 | Three different on-hand formulas plus parallel caches (`stock_batches.current_qty`, `Item.current_stock`, snapshot table) | `inventory/router.py` `_on_hand_qty` ~L430, `_stock_summary_rows` ~L448; `stock_availability_service`; `stock_snapshot_service` ~L65 | S / H | DEF | Inconsistent stock figures across screens | refactor / P1 | — | One balance function; caches derived; reconciliation report shows 0 variance |
| INV-09 | IDT partial receipts overwrite received qty while each adds an IN movement; loss recomputed against total | `inventory/idt_service.receive_idt` ~L244 | S / H | DEF | Wrong loss and stock | refactor / P1 | — | Cumulative receipts; test with two partial receipts |
| INV-10 | Return to supplier only via finance debit note; stock OUT without FIFO consumption or tenant checks; credits Purchase Return not Inventory | `finance/advanced_voucher_service.py` `create_note_voucher` ~L356–381 | S / H | DEF | FIFO layers and GL inventory diverge | build / P1 | INV-03 | Return-to-vendor document posting stock via stock service and GL Inventory/GRNI |
| INV-11 | QC HOLD marks inspection COMPLETED (stock stranded); issues from quarantine possible except IDT; rejected qty only flags debit note | `inventory/grn_qc_service.py` ~L226–432; `stock_availability_service.py` ~L59 | S / H | DEF | Uninspected stock consumed | refactor / P1 | INV-03 | Stock status dimension; issue blocked from non-usable status; re-inspection of HOLD |
| INV-12 | No GRN reversal/cancel after RECEIVED | `inventory/router.py` | S / M | VA | Errors corrected by ad-hoc adjustments | build / P2 | INV-03, FIN-04 | Reversal posts compensating movements and GL |
| INV-13 | No bins, roll, shade; lot free text | `models/inventory.py`; `CutTicketFabricLot.roll_numbers` text | S / H | VA | Fabric shade/roll control off-system | build / P2 | INV-08 | Roll/lot/shade entities on GRN and issue to cutting |
| INV-14 | No customer-owned or subcontractor-held stock; consignment is vendor-owned table outside ledger | `models/inventory.py`; `ConsignmentStock` | S / H | VA | Cannot track CMT/buyer-supplied material or stock at subcontractor | build / P2 | INV-08, MER-09 | Ownership + location dimensions in ledger |
| INV-15 | UOM conversion fields unused in PO/GRN/issue | `models/costing.py` ~L136 | S / H | VA | Unit mismatches (yards vs kg) handled manually | build / P2 | — | Conversion applied at document lines with base UOM ledger |
| INV-16 | Landed cost absent | grep | S / H | VA | Import costs not capitalized | build / P2 | INV-02 | Landed-cost allocation updates FIFO layers |
| INV-17 | Physical count posts `counted − expected` with expected snapshotted at session creation | `inventory/router.py` ~L6613–6663 | S / H | DEF | Wrong adjustments if movements occur during count | refactor / P1 | INV-03 | Expected recomputed at post or movements frozen |
| INV-18 | Wastage transactions analytics only (no stock/GL) | `models/wastage.py`; `merch/routers/wastage.py` ~L456 | S / H | VP | Scrap value not accounted | improve / P2 | INV-03 | Scrap issue/sale documents with stock and GL |
| INV-19 | Packing lists not reconciled to challan/order qty; shipments tied only to trade cases | `logistics/router.py` ~L390–535; `models/trade.py` ~L114 | S / H | VP | Shipment documents can disagree with stock | improve / P2 | GATE-01 | Packing qty must equal challan qty by order line |
| INV-20 | PO status changes without approval permission; APPROVED→DRAFT allowed | `inventory/router.py` `update_purchase_order_status` ~L2700 | S / H | DEF | Purchase commitments not controlled | improve / P1 | FIN-06 | PO approval permission + maker/checker |

### D. Production and planning

| ID | Current behavior | Evidence | Type / Conf | Status | Business impact | Action / Pri | Depends on | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| PRD-01 | CAPA/NCR creation never sets `order_id`; the `capa_blocks_challan` gate looks CAPAs up by `order_id`, so it never blocks | `manufacturing/quality_router.py` `create_ncr` ~L346–376, `create_capa` ~L424–451; `merch/execution_gates.py` ~L80–111 | S / H | DEF | Shipment-hold control silently ineffective | refactor / P1 | — | CAPA carries order; gate test blocks challan post |
| PRD-02 | No over-production guard; no stage quantity ledger; `SewingLineStyleConfig.completed_qty` never written by app code yet read by plan board and financier OTD | `production/hourly_router.py` ~L63–171; `financier_portal/contract_command/otd_engine.py` ~L52 | S / H | DEF | Progress and financier OTD figures wrong | build / P1 | — | Stage ledger (input/good/rework/reject/transfer); plan completion derived; cap vs order qty with tolerance |
| PRD-03 | Capacity: reservation SMV = OB total ÷ order qty; advisory multiplies machines × operators; heatmap puts all minutes on start date | `production/line_reservation_service.py` ~L100–136; `planning_advisory_service.py` ~L88–91; `control_tower/service.py` ~L137–193 | S / H | DEF | Misleading load/utilization | refactor / P1 | — | Correct formulas with unit tests; heatmap spreads minutes over working days |
| PRD-04 | Hourly entries keyed by department/date/hour/line/machine (not shift/order); no unique constraint; no validation of negatives/hour bounds/good+reject vs input | `production/hourly_router.py` `upsert_hourly` ~L63–171 | S / H | DEF | Lost or duplicated production records | refactor / P1 | — | Key includes shift + order; DB unique; validation; test |
| PRD-05 | Bundle generation restarts barcode numbering → second call 500; default fake bundle when no lines | `production/cutting_router.py` ~L74–120 (numbering restart verified in code; unique-constraint 500 not reproduced) | S / H | DEF | Cutting room disruption | refactor / P2 | — | Continue numbering; require lines |
| PRD-06 | Line balancing round-robin (`i % n`), ignores precedence/machine type | `production/line_balance_service.py` ~L12–62 | S / H | DEF | Unusable balancing output | refactor / P2 | — | Greedy precedence-aware balancing with tests |
| PRD-07 | Changeover absent; skills/machine availability unused in planning | grep | S / H | VA | Planning ignores real constraints | build / P3 | PRD-03 | — |
| PRD-08 | Dyeing create/list only; washing only a name; knitting coherent behind flag | `production/dyeing_router.py` ~L23–97; `knitting_router.py` | S / H | VP | Depends on business scope (Q3) | build / P2 | Q3 | — |
| PRD-09 | Work-order completion uses any completed op's `qty_out`; returns can cumulatively exceed issue; status can jump any state | `manufacturing/execution_router.py` ~L228–355, ~L480–526 | S / H | DEF | Incorrect WIP/material accountability | refactor / P1 | INV-03 | Last-step output drives completion; cumulative return ≤ issued; transition map |
| PRD-10 | Readiness uses latest style BOM, not the order BOM | `production/readiness_service.py` ~L173–241 | S / H | DEF | Wrong material readiness | refactor / P1 | INV-06 | Order BOM authoritative |
| PRD-11 | Two execution stacks (production vs manufacturing) not reconciled | modules | S / H | VP | Duplicate data entry; inconsistent KPIs | refactor / P2 | PRD-02 | One execution model chosen; other becomes view/adapter |
| PRD-12 | Manufacturing cost snapshot uses `qty_issued × default_cost`; no period-end WIP valuation or variance | `manufacturing/costing_hooks_router.py` ~L41–58, ~L141–170 | S / H | DEF | Costing disagrees with inventory | improve / P2 | FIN-17 | Uses FIFO movement values |
| PRD-13 | `release_work_orders` swallows exception without rollback then commits | `production/planning_router.py` ~L750–782 | S / H | DEF | Poisoned transaction → 500 / lost release | refactor / P1 | — | `safe_async_session_rollback` on except; test |

### E. Quality

| ID | Current behavior | Evidence | Type / Conf | Status | Impact | Action / Pri | Acceptance criteria |
|---|---|---|---|---|---|---|---|
| QA-01 | No AQL anywhere (no standard/version, inspection level, lot-size table, sample size, Ac/Re) | grep; only AI knowledge text `ai_tool/knowledge.py` ~L68 | S / H | VA | Final inspection decisions off-system | build / P1 | Configurable AQL plan (standard version, level, lot→code letter→sample size, Ac/Re per defect class); result computed from counts, not percentages |
| QA-02 | Measurement checks absent | grep | S / H | VA | — | build / P2 | Measurement spec vs actual with tolerance |
| QA-03 | No reinspection link; CAPA close without verification | `manufacturing/quality_router.py` ~L391–481 | S / H | VA | — | build / P2 | Reinspection references original lot; CAPA verify step |
| QA-04 | Production QC `check_type` free text; pass+fail not checked vs checked; defect codes JSON not linked to master | `production/quality_router.py` ~L142–204 | S / H | VP | Unreliable QC KPIs | improve / P2 | Enumerated stages; validation; FK to defect master |
| QA-05 | GRN QC qty balance enforced; vendor scorecard | `inventory/grn_qc_service.py` | S, T / H | VC (qty) | — | **retain** | — |

### F. Finance and accounting

| ID | Current behavior | Evidence | Type / Conf | Status | Impact | Action / Pri | Depends on | Acceptance criteria |
|---|---|---|---|---|---|---|---|---|
| FIN-01 | Trial balance and account balance updates aggregate `VoucherLine.amount` (transaction currency), not `base_amount` | `finance/router.py` `_posted_movement_by_account` ~L3048–3078, `_apply_voucher_impact` ~L1304; `auto_posting_service._apply_voucher_impact` ~L54 | S / H | DEF | Multi-currency entries misstate BDT TB/statements | refactor / P0 | verify `base_amount` populated (Q6) | TB in base currency; per-currency sub-totals; reconciliation old vs new per account |
| FIN-02 | BTB LC opening/acceptance/realization vouchers created without currency/rate → BDT at 1.0 | `commercial/router.py` ~L2222–2416; `finance/auto_posting_service.py` ~L232 | S / H | DEF | USD LC amounts booked as BDT | refactor / P0 | FIN-01 | Currency + rate passed; test USD LC voucher base amount |
| FIN-03 | Payroll post books net pay only (Dr expense / Cr payable); deductions/employer contributions not booked; voucher POSTED without applying balances; no lock/unique posting | `hr_payroll/router.py` `post_run` ~L886–1005 (L936–1002); `_create_statutory_remittance_voucher` ~L267–384 | S / H | DEF | Salary expense understated; statutory payables missing; balances inconsistent | refactor / P0 | FIN-06 | Gross expense, deductions to liabilities, employer cost; locked idempotent post; balances applied |
| FIN-04 | `cancel_posted_voucher` permitted on system vouchers (no `_require_manual_voucher_edit`), leaving source records posted; special vouchers lack debit=credit check; posting does not re-check balance; memorandum conversion applies to any voucher | `finance/router.py` ~L143, ~L6198; `advanced_voucher_router.py` ~L682–753; `advanced_voucher_service.py` ~L554 | S / H | DEF | Posted ledger editable; unbalanced books possible | refactor / P0 | — | System vouchers reversible only via reversal; balance validated at post; conversions restricted |
| FIN-05 | Vendor bill debits system GRNI code while GRN may credit a different GRNI account; payment run debits auto-created supplier AP accounts not AP-trade; inventory GL posts skip silently when accounts/period missing; QC-rejected goods leave GRNI residue | `finance/router.py` ~L7239–7474, ~L5149, ~L1249; `services/inventory_gl_service.py` ~L71–195 | S / H | DEF | GRNI/AP never clear; stock vs GL drift unreported | refactor / P0 | E3, FIN-08 | Single account resolver; skipped-post queue + report; GRNI and AP reconcile to 0 in test scenario |
| FIN-06 | No maker/checker on vouchers, payment runs, payroll, leave | `finance/router.py` `_require_manager_or_admin` ~L270; payroll ~L773–886 | S / H | VA | Fraud/error risk | build / P1 | SEC-01 | Configurable SoD: preparer ≠ approver ≠ poster for defined documents |
| FIN-07 | Period lock not checked by TDS, stock-transfer vouchers, post-dated activation, memo conversions; reopen without reason/audit; calendar fiscal year only; no year-end close | `finance/router.py` `_assert_open_period` ~L1358, reopen ~L6478; `fiscal_year_calendar` ~L20 | S / H | VP | Back-dated changes; July–June FY unsupported | improve / P1 | — | All posting paths call period check; reopen requires reason + audit; FY start configurable |
| FIN-08 | Five AP/AR sub-ledgers not reconciled | `OutstandingBill`, `BillReference`, `VendorBill`, `party_ledger`, PI/CI allocations | S / M | VP | Ageing and balances disagree | refactor / P2 | FIN-05 | One open-item ledger per party; others become views |
| FIN-09 | FX revaluation report-only; no realized/unrealized postings (accounts seeded) | `finance/router.py` ~L3787; `system_coa_templates` ~L187/251 | S / H | VP | FX P&L missing | build / P1 | FIN-01 | Settlement FX difference + period-end revaluation journals with reversal |
| FIN-10 | Cash forecast synthetic (averages, fixed multipliers) | `finance/router.py` `generate_cash_forecast` ~L3508 | S / H | DEF | Misleading if used | refactor / P2 | COM-04, FIN-08 | Forecast from open AR/AP, LC maturities, payroll calendar with stated assumptions |
| FIN-11 | Fixed assets / depreciation absent | grep | S / H | VA | — | build / P2 | — | Asset register + depreciation run |
| FIN-12 | Tenant = legal entity; no company layer; no intercompany | models | S / H | VA | Group with several factories cannot consolidate | build / P2 | Q1 | Decision first |
| FIN-13 | Float arithmetic in voucher create/update; `create_system_voucher` stores 2-dp strings after Decimal balance check | `finance/router.py` ~L2401, ~L2582; `auto_posting_service.py` ~L219–264 | S / H | DEF | Rounding imbalances | refactor / P1 | — | Decimal end-to-end; 4-dp storage; balance re-check after rounding |
| FIN-14 | Bank reconciliation matches only payment runs | `finance/router.py` ~L4549–5017 | S / H | VP | Manual reconciliation for receipts/payments | improve / P2 | — | Match any bank voucher line |
| FIN-15 | GST (Indian-style) tax engine; BD Mushak registers not linked to vouchers; VDS/AIT only in commission | `finance/gst_tax_router.py`, `tax_calculation_service.py`; `compliance/bd_router.py` | S / M | VP | BD VAT workflow incomplete | improve / P2 | Q7 | BD VAT configuration validated by tax adviser |
| FIN-16 | Voucher number unique in DB (migration 042) but not declared on model | `models/finance.py` | S / H | VP | Model drift | improve / P3 | — | Model matches schema |
| FIN-17 | No standard vs actual cost, variance, or period-end WIP/FG valuation | grep | S / M | VA | Contract profitability approximate | build / P2 | PRD-02 | Cost roll-up per order with variance postings |
| FIN-18 | Multiple vendor bills can be drafted from the same GRN; post unlocked | `finance/router.py` ~L7240, ~L7412 | S / H | DEF | Duplicate payables | refactor / P1 | — | Unique open bill per GRN line qty; locked post |
| FIN-19 | Voucher status workflow, reversal with row/account locks, inventory GL idempotency table, budget enforcement | `finance/router.py` ~L123, ~L6235, ~L1313–1339; `models/inventory.py` ~L510 | S, T / H | VC | Strong base | **retain** | — | — |

### G. HR, payroll, compliance

| ID | Current behavior | Evidence | Type / Conf | Status | Impact | Action / Pri | Acceptance criteria |
|---|---|---|---|---|---|---|---|
| HR-01 | Statutory engine implements Indian PF/ESI/professional tax/gratuity; no Bangladesh income tax, WPPF, festival bonus rules | `hr_payroll/statutory_calculation_service.py`; router ~L1596 | S / H | DEF (for BD) | Wrong deductions if used for BD tenants | refactor / P0 (conditional on use, Q8) | Jurisdiction-configurable rules; BD rule set validated by compliance owner; Indian rules disabled for BD tenants |
| HR-02 | Attendance `update_entry` changes status/times without manager check, audit, or payroll-period lock; leave types editable by any user (can set `requires_approval=False`) | `hr_attendance/router.py` ~L405; `hr_leave/router.py` ~L259–301, ~L447 | S / H | DEF | Pay-affecting data alterable | refactor / P1 | Edits only via regularization with approval + audit; locked after payroll finalize |
| HR-03 | OT multipliers/daily max stored but not applied; OT = component rate × hours; absent/late not deducted; no joiner/leaver proration; PER_DAY ignores off-days | `hr_attendance/router.py` ~L643–722; `hr_payroll/formula_engine.py` ~L48; `payroll_calculation_service.py` ~L221 | S / H | DEF | Incorrect pay | refactor / P0 | BD OT basis configurable; proration; golden payroll test cases signed off |
| HR-04 | Payroll line upsert and pay setup (components, structures, periods, assignments) lack manager and period-lock checks | `hr_payroll/router.py` `upsert_run_line` ~L722, ~L404–600, ~L1468 | S / H | DEF | With RBAC off, any tenant user can change pay amounts | refactor / P0 | Permission + period lock enforced; audit |
| HR-05 | Piece rates, incentives, arrears, final settlement absent | grep | S / H | VA | Common RMG pay elements off-system | build / P1 | — |
| HR-06 | No biometric device adapter; bulk JSON only | `hr_attendance/router.py` ~L771 | S / H | VA | Manual attendance import | integrate / P2 | Adapter with raw punch store, dedupe, device identity |
| HR-07 | Bank file `employee_code,net_pay,BDT`; no account/routing; no MFS (bKash/Nagad); no status gate | `hr_payroll/router.py` ~L1410–1427 | S / H | VP | Manual payment prep | improve / P2 | Bank/MFS formats from approved runs only |
| HR-08 | BSCI/WRAP-style checklists, age/medical records; no grievance, welfare committee, training, safety incident registers | `hr_compliance/seed_data.py`, services | S / H | VP | Social compliance evidence partial | build / P2 | Registers with CAPA links |
| HR-09 | Employee advances stored as strings and never recovered via payroll; bonus declarations record-only | `models/hr_payroll.py` ~L192 | S / H | VA | Manual recovery | build / P1 | Advance schedule deducted in payroll |
| HR-10 | Leave balance reservation with row lock; payslips scoped to own employee; effective-dated structure assignments with overlap guard | `hr_leave/router.py` ~L115–162; `hr_payroll/router.py` ~L99–118; `hr_payroll/service.py` ~L66 | S, T / H | VC | Strong | **retain** | — |

### H. Gate pass and security

| ID | Current behavior | Evidence | Type / Conf | Status | Impact | Action / Pri | Acceptance criteria |
|---|---|---|---|---|---|---|---|
| GATE-01 | `EnhancedGatePass`: purpose, destination, vehicle, status, guard flag, optional challan; no lines, direction, returnable/overdue, seal, actual exit time, partial dispatch, cancellation; status settable at create; no transitions/permission; not required for challan; `challan_id` not tenant-validated | `models/inventory.py` ~L617; `inventory/router.py` ~L4363–4400 | S / H | DEF | Physical movements not reconciled with stock | build / P1 | Gate pass lines reconcile to challan/return/subcontract docs; approve → load → exit with timestamps; overdue returnables report |
| GATE-02 | Visitors, vehicle log, samples-out | grep | S / M | VA | — | build / P2 | — |

### I. Bangladesh compliance and integrations

Classification of integration status: **Implemented integration** — none found. **Document/file export** — BD registers CSV/XLSX (UI). **Manual submission** — all government/bank interactions. **Proposed** — see TARGET_ARCHITECTURE §6.

| ID | Current behavior | Evidence | Type / Conf | Status | Action / Pri | Acceptance criteria |
|---|---|---|---|---|---|---|
| BD-01 | UD + amendment numbers, entitlement lines, bond import/export entries, utilization, Mushak 6.1/6.2 registers; register-only | `compliance/bd_router.py` docstring ~L7; `bd_registers_service.py` ~L44–111 | S, T / H | VP | **retain**, improve / P2 | — |
| BD-02 | Bond licence entity, UP, Bill of Entry, EXP form, BOM-consumption→UD declaration link absent | grep | S / H | VA | build / P2 | Requirements validated by compliance owner with authoritative sources and effective dates (Q7) |
| BD-03 | Legacy `create_bonded_entry` mounted without permission dependency/flag; links not tenant-validated | `compliance/router.py` ~L238; `main.py` ~L409 | S / H | DEF | retire / P1 | Route removed or gated; data migrated to BD registers |
| BD-04 | Over-utilization / consumed > imported are warnings only | `bd_registers_service.py` | S / H | VP | improve / P2 | Configurable block |
| BD-05 | BGMEA/BKMEA, EXP, bank acknowledgements capture | not found | S / L | NV | — | Evidence needed |

### J. Platform and security (sanitized)

| ID | Summary | Evidence (non-exploit) | Type / Conf | Status | Action / Pri | Acceptance criteria |
|---|---|---|---|---|---|---|
| SEC-01 | Module-level RBAC defaults to off for every tenant; router `*.access` gates are no-ops until a tenant flag is set | `common/tenant_feature_keys.py` ~L243–252; `common/permissions.py` ~L905 | S / H | DEF (config default) | improve / P0 (verify live) | Shadow-mode report reviewed; enforce enabled per tenant with role matrix |
| SEC-02 | Several routers are mounted without a module-level permission dependency, including some that return sensitive summaries | Route list in private findings | S / H | DEF | improve / P1 | Every router has an explicit module dependency; route inventory test |
| SEC-03 | **Confirmed cross-tenant isolation defects**: 8 root causes where write endpoints accept another tenant's record ids without validation, so foreign identifiers/names can surface to the caller or an external portal user. **4 reproduced at runtime** | Private findings file (merchandising, production, inventory and facility areas) | S + R / H | DEF | refactor / P0 | All writers validate referenced tenant; regression tests per root cause; production data scan for existing cross-tenant links = 0 or triaged |
| SEC-04 | Isolation is per-handler only (no RLS, no composite tenant FKs) | migrations | S / H | VP | build / P1 | Defence-in-depth control (see TARGET_ARCHITECTURE §5) |
| SEC-05 | Fine-grained permissions fail open (missing key ⇒ allowed) | `common/permissions.py` ~L849–862 | S / H | DEF | improve / P1 | Explicit grants for finance/HR/approval keys |
| SEC-06 | File access and suspended-tenant handling need tighter checks | Private findings | S / H | VP | improve / P2 | Module permission on downloads; inactive tenants blocked on all authenticated routes |
| SEC-07 | Tenant rate limiting design weakness | Private findings | S / H | DEF | improve / P2 | Limits keyed on the authenticated tenant |
| SEC-08 | AI/MCP authorization gaps (permission filtering and approval separation) | Private findings | S / H | VP | improve / P2 (P1 before any AI write) | Per-user permission filters; human approval bound to a distinct approver |
| SEC-09 | No MFA for staff or platform super-admins | grep | S / H | VA | build / P1 | TOTP for platform admins, optional for tenant admins |
| SEC-10 | GitHub repository is public | GitHub API 2026-11-03 | R / H | — | decision / P1 | Owner decision recorded (Q9) |
| SEC-11 | Default OpenRouter model is a free-tier model; tenant text features prefer it | `backend/app/config.py` | S / H | — | decision / P1 | Approved provider/model list per data class (Q10) |
| SEC-12 | Container, web-server and client token hardening items | Private findings | S / M | VP | improve / P2 | Host-level verification + hardening checklist |
| SEC-13 | Domain audit trail (before/after) absent for finance, inventory, HR, orders; only request-level logs | `models/audit.py`; `log_action` in 12 files | S / H | VA | build / P1 | Field-level audit on posting, pay, price, status changes |
| SEC-14 | External portal token separation, login lockout, reset tokens hashed, upload path safety, startup secret guards | `external_access/`, `auth/login_lockout.py`, `common/storage.py`, `config.py` ~L194–211 | S / H | VC | **retain** | — |
| OPS-01 | Tenant Settings backup/restore only write audit rows and report success; platform `pg_dump` missing from image and output not on a volume; no off-site backup script found | `settings/router.py` ~L693–792; `admin/backup_service.py`; `backend/Dockerfile` | S / H | DEF | build / P0 | Scheduled `pg_dump` to volume + off-site; restore drill documented with RPO/RTO; UI shows real status or is hidden |
| OPS-02 | No error tracking, metrics, or structured logs | grep | S / H | VA | build / P1 | Error tracking + request IDs + health split |
| OPS-03 | Images pushed without CI gate; Watchtower auto-updates unlabeled containers | `.github/workflows/deploy.yml`, `docker-build.yml`; `docker-compose.prod.yml` ~L212–222 | S / H | DEF | improve / P1 | Push only after CI success; Watchtower removed or label-scoped |
| OPS-04 | Request logger writes a row per authenticated request incl. GETs, fire-and-forget session, no retention | `common/request_logger.py` ~L107–182 | S / H | VP | improve / P2 | Retention/partitioning; sampling of reads |
| OPS-05 | Pool 20+30 per process × 2 workers + worker/beat may exceed Postgres max connections | `database.py` | S / M | VP | improve / P2 | Sizing documented; PgBouncer in prod |
| OPS-06 | Idempotency keys absent on voucher post, GRN, stock issue, payroll | various | S / H | VP | improve / P2 | Idempotency on posting endpoints |

### K. IoT and AI readiness

| ID | Current behavior | Evidence | Status | Action / Pri |
|---|---|---|---|---|
| IOT-01 | Scan station: unique `client_key`, savepoint race handling, device vs server timestamps, offline queue in localStorage (5,000 cap), skew window; device id self-generated, not registered; scans don't roll up to hourly/bundle/plan | `models/shop_floor_scan.py`; `production/scan_router.py` ~L190–292; `frontend/src/pages/app/production/scan/scanQueue.ts` | VP (retain idempotency) | improve / P2 |
| IOT-02 | No MQTT/OPC UA/Modbus/telemetry ingestion, no edge buffer, no calibration records | grep | VA | build / P3 |
| AI-01 | AI inventory: document extraction (no file persistence), ERP assistant with tool registry, pgvector/BM25 retrieval, exception agents with human confirm, metric cards, planning narrative (advisory only), costing suggestions, controlled-action proposals (flag off), MCP (simulated commits) | `ai_extract/`, `ai_tool/`, `governed_ai/`, `erp_ai_phases/`, `production/gemini_planning_service.py` | VP | **retain** governed pattern |
| AI-02 | Retrieval permission filtering and approval separation incomplete (see SEC-08); AI budgets unlimited by default | `config.py` `AI_MONTHLY_BUDGET_LIMIT=0` | VP | improve / P2 |
| AI-03 | No golden-set evaluation harness | `ai_tool/policy_eval.py` only | VP | build / P3 |

**Why machine activity cannot equal accepted output:** a machine cycle/stitch count measures activity, not garments.
It includes rework passes, trial pieces, thread breaks, idle cycling and pieces later rejected at end-line QC; one garment
needs many operations on different machines; and counters drift without calibration. Accepted output must remain the
QC-accepted quantity recorded against bundle and operation, with machine data used only as a corroborating signal and for
utilization/maintenance analytics.

---

## 3. Central data model assessment

| Entity / capability | Representation found | Assessment |
|---|---|---|
| Tenant / legal entity / branch / site / warehouse / department | `tenants` = company; `branch_code` string on vouchers; warehouses; HR departments; production departments and sewing lines with `factory_unit` | Single legal entity per tenant; no site entity; multi-factory only via line attribute (FIN-12) |
| Buyer / supplier / buying house / partner factory / subcontractor | `customers`, `vendors`, `intermediaries` (BUYING_HOUSE/AGENT), process-order vendors | No partner-factory/subcontractor role distinction (MER-09) |
| Style / revision / colour / size / season / order line | `garment_styles`; orders with colour×size matrix (`order_matrix`); no style revision; season not verified | Order line granularity exists via matrix; style revisions absent |
| BOM revision / routing / operation / SAM / production order | Order BOM (no revisions), operation bulletins with SMV, manufacturing work orders + operations | Two routing models (PRD-11) |
| Roll / lot / shade / bundle / batch / carton / shipment | Batches per item+godown; lot free text; bundles; cartons; shipments (trade case only) | Roll/shade absent (INV-13) |
| Sales PI vs supplier PI | Same table with `direction` EXPORT/IMPORT; IMPORT rules enforced | Acceptable; keep separate validation paths |
| MSC/export LC, BTB LC, export bill, realization | Master contract (type SALES_CONTRACT/EXPORT_LC), BTB LC (single FK), no export bill | COM-03, COM-04 |
| GL / dimensions / commitments / liabilities | COA, cost centres (auto `MC-xxxx` per contract), vouchers; no commitment ledger | Commitments (open PO, opened BTB) not tracked as memo |

| Scenario | Supported? | Notes |
|---|---|---|
| Multiple styles/orders under one export contract | Yes (orders.master_contract_id) | No allocation qty/value |
| Repeat orders for the same style | Yes | Style revision absent |
| One order split across factories and deliveries | Partial | Deliveries via multiple challans; factories via line `factory_unit`; no order-line-to-factory allocation |
| Partial procurement / receipt / production / shipment / settlement | Partial | Partial GRN yes; process-order and IDT receipts defective; settlement partial via receipt allocations |
| Consolidated shipments | Partial | Many packing lists per shipment; consolidated challan invoicing defective (INV-04) |
| Shared materials with controlled allocation | No | Reservations absent (INV-06) |
| Customer-owned / subcontractor-held materials | No | INV-14 |
| Multiple legal entities with consolidation | No | FIN-12 |

### Intended Prime7ERP principles

| Principle | Current implementation | Consequence | Recommendation |
|---|---|---|---|
| Style and buyer order lines drive merchandising and production | Order drives BOM, PO, line plan; readiness uses style BOM | Inconsistent material readiness | Make order BOM authoritative (PRD-10) |
| MSC/export LC drives financing and contract profitability | Contract cost centre auto-created for legacy statuses only (OPEN/ACTIVE/CONFIRMED, not OPENED/ADVISED) | Some vouchers lack contract dimension | Fix status set; derive dimension automatically on all contract-linked postings |
| Sales PI links to orders | Link rows without qty/value | Over-allocation undetected | Allocation table (COM-01) |
| MSC/export LC links to sales PI/orders | `orders.master_contract_id` + PI contract link | One order ↔ one contract only | Keep single contract per order line unless business needs splits (Q5) |
| Supplier PI separate from sales PI | Same table, direction-specific rules | Acceptable | Retain; add direction check on BTB `proforma_invoice_id` |
| BTB LC links to MSC/export LC with explicit allocations | Single FK, cap on contract amount | Cannot split; wrong headroom | `btb_contract_allocations` (COM-03) |
| Commercial reporting dimensions populated automatically | Only BTB vouchers carry contract cost centre | Contract P&L incomplete | Posting engine stamps dimensions from source document |
| Department/factory overhead tracking | Cost centres + production cost inputs | Retain | — |
| Non-accepted LC exposure distinct from accepted bills and payables | LC opening posts nothing (correct); acceptance/realization draft vouchers in wrong currency | Exposure reporting incomplete | Memo exposure ledger + liability at acceptance (COM-09) |
| Posted transactions corrected by controlled reversal | Reversal exists, but cancel-posting and status regressions allow edits | Ledger integrity risk | FIN-04 |
| Do not post expense/payable merely because LC is opened | Complied with | — | Retain |

---

## 4. Retain list (strong enough to keep as-is or extend)

Commission engine (MER-12) · voucher workflow and locked reversal (FIN-19) · inventory GL idempotency table · FIFO layers
service (`services/fifo_inventory.py`) · delivery challan locked posting · commercial invoice and PI receipt idempotency ·
import-PI rules · BD registers (BD-01) · leave locking, payslip scoping, effective-dated pay assignments (HR-10) · GRN QC
quantity balance (QA-05) · scan idempotency and offline queue (IOT-01) · external portal token separation, login lockout,
upload path safety, startup secret guards (SEC-14) · Celery `run_async` + advisory-lock schedulers · CI running real-DB
pytest · governed-AI pattern (human confirm, flags default off for automation).
