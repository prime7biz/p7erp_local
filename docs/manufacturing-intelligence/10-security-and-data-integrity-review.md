# 10 - Security and data integrity review (architecture verification report)

Verifier: Claude Opus 4.8 (project agent `architect-premium`), two rounds, read-only, with file evidence.
Architect: GPT 5.6 SoL. Explorer: Gemini 4 Carbon.

## 1. Round 1 verdict: APPROVE WITH CONDITIONS

| ID | Sev | Finding | Resolution |
|---|---|---|---|
| F1 | CRITICAL | Writing `stock_reservations` would change ATP, promise, MRP and reorder for the whole tenant even with the new flag OFF (readers default `exclude_reserved=True`, subtract SOFT + HARD) | New rows use `status='ACTIVE'` + `reservation_kind`; legacy readers only read SOFT / HARD; golden test F-T1; no writers in Phase 1 |
| F2 | CRITICAL | SOFT and HARD treated identically by every reader | One taxonomy (HARD_ATP / TENTATIVE / INFORMATIONAL); all readers updated in lockstep behind one flag; tentative never reduces hard ATP |
| F3 | CRITICAL | Pegging would double-count inbound already counted as in-transit | Single `open_po_supply_service`; pegging only partitions `on_order_net`; invariant test F-T2 |
| F4 | MAJOR | Capacity = machines x operators x minutes | Operator-minute formula; machines a separate constraint |
| F5 | MAJOR | SMV per piece divided by order qty | `smv_per_piece = ob.total_smv`; total = qty x SMV |
| F6 | MAJOR | MRP on-order gross and includes fully received | Net of receipts over truly open lines (Phase 2, owner approves status set) |
| F7 | MAJOR | Readiness uses latest style BOM | Active Order BOM; style = STYLE_ESTIMATE |
| F8 | MAJOR | Double de-rating in hybrid | De-rate deterministic once; empirical not de-rated again |
| F9 | MAJOR | Shift minutes averaged | Sum shifts; UNKNOWN when missing |
| F10 | MINOR | "Confirmed" ambiguous | Owner decision: legacy status NEW / CONFIRMED / IN_PROGRESS |
| F11 | MINOR | Over-engineering (~12 tables) | Phase 1 zero tables; reuse follow-up templates, Control Tower, alerts, `ai_agent_decisions` |
| F12 | MINOR | Bug vs policy mixed | Separate lists (doc 02); corrected values shown beside legacy |
| F13 | MINOR | `reserved_qty` typed float | Decimal annotation in Phase 2 |
| F14 | MINOR | RLS / permission gates implicit | Explicit acceptance gates |

## 2. Round 2 verdict: APPROVED WITH MINOR CONDITIONS

Spot checks performed by the verifier:
- `stock_reservations.status` has no CHECK or enum (migration 162) - `ACTIVE` is legal.
- No other readers of `stock_reservations` exist beyond availability, MRP and reorder.
- Advisory locks: reuse two-integer `(tenant_id, item_id)` form from `inventory/stock_locks.py`; it lives in a
  separate lock space from `background_lock` single-bigint ids 771001-771005.
- `require_internal_permission("production.planning.read")` is counted by the route inventory test.
- Phase 1 can be zero-write if it never calls `auto_advance_order_pipeline` (writes `pipeline_status`) or
  `maybe_auto_propose_line_booking` (inserts reservation rows).

New issues and their closure:

| ID | Sev | Issue | Closure |
|---|---|---|---|
| N1 | MAJOR | `pipeline_status >= ORDER_CONFIRMED` over-includes drafts and cancelled orders (default value, stage always complete) | Owner decided confirmed = `Order.status` in NEW, CONFIRMED, IN_PROGRESS; test with DRAFT, CANCELLED and COMPLETED orders |
| N2 | MINOR | 3-part advisory key does not fit native lock forms | Phase 2 uses `stock_locks.py` two-int lock + row locks |
| N3 | MINOR | Phase 1 write-freedom can be broken transitively | Read-only test asserts no domain-table writes |

## 3. Implementation conditions (merge gates)

1. Confirmed-demand rule implemented and tested (N1) - Phase 1.
2. F-T1 golden test green with mixed legacy and ACTIVE rows before any Phase 2 writer merges.
3. New router carries `production.planning.read`; route inventory test extended.
4. Phase 1 zero-write proven by test.
5. N2 carried into Phase 2 locking design.
6. OB `total_smv` per-piece confirmed (proved in `ie_router.py:108`).

## 4. Standing security rules for this program

- Tenant isolation: every query filters `tenant_id`; client ids validated; other tenants' ids look like "not found".
- New tenant tables ship with an RLS policy in the same migration (`tests/test_rls_policies.py`).
- Never loosen a permission; finance data fail-closed; UI hiding is not a control.
- Money and quantities as Decimal; no new voucher posting; posted vouchers immutable.
- AI recommendations never change schedules, POs, payroll, financing or shipments without an authorised user.
- No raw SQL with interpolation; sort / filter fields allowlisted; list sizes bounded.
