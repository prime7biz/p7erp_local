# 11 - Implementation roadmap

```mermaid
flowchart LR
  P0[Phase0_Docs] --> P1[Phase1_ReadOnlyVisibility]
  P1 --> P2[Phase2_PlanningAndAllocation]
  P2 --> P3[Phase3_CostFinance]
  P3 --> P4[Phase4_Predictive]
  P4 --> P5[Phase5_Optimization]
```

## Phase 0 - discovery and architecture (done 2026-11-12)

Audit, workflow mapping, gap analysis, architecture, two independent verifications, this documentation set.

## Phase 1 - urgent read-only visibility

Flags: `manufacturing_intelligence_v1`, `planning_math_v2`, `mfg_order_bom_readiness_v2` (strict, default OFF).

| # | Task | Files |
|---|---|---|
| 1.1 | Flag keys and helpers | `app/common/tenant_feature_keys.py`, `mfg_intelligence/flags.py` |
| 1.2 | Confirmed-demand rule | `mfg_intelligence/confirmed_demand.py` |
| 1.3 | Corrected capacity + legacy comparison | `capacity_service.py`, `legacy_comparison.py` |
| 1.4 | Line loading spread over working days (max 180 days) | `line_loading_service.py` |
| 1.5 | Readiness (Order BOM under flag, STYLE_ESTIMATE, blockers) | `readiness_service.py` |
| 1.6 | Deterministic delivery prediction vs ex-factory | `delivery_service.py` |
| 1.7 | Summary | `summary_service.py` |
| 1.8 | Router + mounting + permission | `router.py`, `app/routers.py` or `main.py` |
| 1.9 | Frontend panels in Control Tower | `frontend/src/components/control-tower/intelligence/*` |
| 1.10 | Help tutorial update | `frontend/src/data/tutorials/sections/*` |
| 1.11 | Tests | `backend/tests/test_mfg_intelligence_*.py`, frontend tests |

Acceptance: see doc 12. Rollback: switch the flags off; no data to repair.

## Phase 2 - integrated planning and material control

Prerequisite answers: hard-only ATP; inbound toward promise; open PO statuses; usable receipt definition;
allocation priority; supply reassignment; firm booking with incomplete materials; approvers; subcontract and
external-process scope; samples capacity; rework / earned SMV; material interchangeability; consignment /
buyer-supplied; slice granularity.

Tasks: reservation taxonomy + lockstep readers + F-T1; `open_po_supply_service` + pegging + F-T2; allocation
concurrency + F-T3; booking confidence / expiry / revisions / optimistic locking; employee and machine line
assignments; extend follow-up templates for routes; style standard SMV; ETA chain; booking UI (Actions dropdown);
inquiry / quotation tentative demand with stored probabilities; external process stages; scenario preview + confirm.

## Phase 3 - cost and finance intelligence

Classified cost facts, FX lineage, cost-to-complete, projected margin, schedule-driven cash requirement,
fail-closed finance permission, panel F. Fix cost-centre dashboard semantics only with approval.

## Phase 4 - predictive intelligence

Empirical capacity, supplier lateness, calibrated delivery probabilities, anomaly detection, bottleneck alerts via
the alert engine, recommendations via governed AI, outcome tracking, LLM explanations, panel G, AI agent read tools.

## Phase 5 - advanced planning

One engine for 90 / 120 / 150 / 180-day horizons (confirmed, tentative, probability-weighted, forecast demand;
base / optimistic / conservative / capacity-constrained / finance-constrained scenarios); heuristic scheduler;
optional lazy OR-Tools CP-SAT after benchmarks; snapshots only after measured need.

## Risk register (top 12)

| # | Risk | Impact | Control |
|---|---|---|---|
| R1 | New reservations leak into legacy ATP | Critical | ACTIVE status, F-T1 |
| R2 | Tentative demand reduces firm promise | High | Kind taxonomy, separate metrics |
| R3 | Pegged supply counted twice | High | Single net supply, F-T2 |
| R4 | Concurrent over-allocation | High | Locks, F-T3 |
| R5 | Wrong open-PO / receipt definition | High | Owner-approved policy |
| R6 | Capacity still inflated | High | Operator-minute formula, tests |
| R7 | Double de-rating | Medium | Separate pipelines |
| R8 | Missing shift / SMV hidden by defaults | High | UNKNOWN + missing_inputs |
| R9 | Wrong BOM authority | High | Flagged Order BOM rule |
| R10 | Confirmed demand misclassified | High | Owner rule + test |
| R11 | Finance / HR data leakage | Critical | Registered permissions, fail-closed keys |
| R12 | Over-engineered persistence | Medium | Zero tables in Phase 1 |

## Open questions by phase

- **Phase 1 enablement:** approve Order BOM as readiness authority; approve showing corrected numbers beside legacy;
  sign off KPI definitions (doc 08).
- **Phase 2:** listed above.
- **Phases 3-5:** FX source and date for forecasts; what counts as confirmed financing and who may see margins and
  cash gaps; optimizer objective weights and frozen near-term horizon.

Decided on 2026-11-12:
- Confirmed demand = `Order.status` NEW / CONFIRMED / IN_PROGRESS; `Order.delivery_date` = ex-factory date.
- Phase 1 sign-off: all three flags may be switched on for the owner's local test tenant (Order BOM as readiness
  authority and corrected numbers beside legacy are accepted for testing).
- Phase 2 promising: only hard (approved) reservations reduce promisable stock; tentative inquiry / quotation holds
  show as a warning only.
- Phase 2 allocation priority: running production first, then firm orders by cut date, then by ex-factory date,
  then tentative demand by probability.
- Phase 2 material readiness: only received and QC-accepted stock counts as ready; open POs contribute an expected
  date, not readiness.

Decided on 2026-11-12 (Phase 2 kick-off):
- Open PO supply = status APPROVED or PARTIALLY_RECEIVED, minus quantity already QC-accepted.
- Moving material reserved for one order to another: admin / manager roles only, audited with a reason.
- Plan revisions approved by `production.planning.approve`; optional four-eyes tenant switch (proposer cannot
  approve own change), OFF by default.
- A confirmed order may be FIRM-booked before materials are ready, with a visible warning and expected material date.
- Subcontract / CMT sewing and external wash / print / embroidery are lead-time stages only (no subcontractor capacity).
- Phase 2 is built in one go (allocation, planning, assignments, routes).

Decided on 2026-11-13 (owner: "use the industry standard for every decision"):
- Phase 3 cost and cash rules: doc 14 section 10 (contract-value revenue, document + usance realisation days,
  BTB-funded purchases paid only at BTB maturity, payroll on the 7th working day (BD Labour Act s.123),
  `finance.access` segregation, cost-per-minute overhead absorption as a labelled estimate, booked-rate FX).
- Confirmed financing = an opened / accepted LC or sanctioned facility limit with available balance; anything else
  is a financing need, not financing.
- Phase 5 scheduling: frozen near-term horizon 14 days (firm zone, changes only through approved plan revisions);
  objective order = on-time ex-factory first, then fewer style changeovers (same style / style family grouped on a
  line), then line utilisation, then overtime cost.
- The Phase 2 defaults below are the industry norm and are confirmed: samples use line capacity only when booked on a
  line (sample room otherwise); rework earns no SMV (earned minutes = good output only); buyer-supplied /
  consignment trims are never company stock; partial readiness by colour / size follows the cut plan (later slice).
  Material interchangeability: same item id, and fabric additionally the same shade / lot when lot tracking is on.

Previously open (now confirmed above): samples consume line capacity only when booked on a line; rework does not
add earned SMV; material interchangeability = same item id (colour / shade / lot matching later); consignment and
buyer-supplied trims are shown separately and never counted as company stock; partial readiness by order (colour /
size slices later).
