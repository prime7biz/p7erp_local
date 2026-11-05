# Backlog — epics and tasks

Audit date: 2026-11-03. Phases per [UPGRADE_ROADMAP.md](UPGRADE_ROADMAP.md); finding IDs per [GAP_ANALYSIS.md](GAP_ANALYSIS.md).

**Effort sizes** (one experienced engineer, including tests and review, excluding UAT wait time):
`S` ≤ 3 days · `M` 1–2 weeks · `L` 3–6 weeks · `XL` > 6 weeks (split before starting).
Assumptions: existing test fixtures reusable; no external vendor dependency unless stated; ranges widen if data cleanup reveals volume.
Paths are relative to `backend/app/` unless shown otherwise.

## Stage 1 progress (2026-11-04, local code, not deployed)

| Task | Status |
|---|---|
| E0.1 Real backups + restore drill | Done locally (scripts + PASS drill); production rollout outstanding |
| E0.2 Truthful tenant backup UI | Done |
| E0.3 Platform backup job truthfulness | Done (records `failed` when `pg_dump` is absent); decision on installing the client in the image open |
| E0.6 RBAC shadow report | Report script done; shadow-mode rollout per tenant outstanding |
| E0.7 Reconciliation scripts | Not started (first item of stage 2) |
| E0.8 Cross-tenant FK scan | Done (script, 82 relations); local result 0; production run outstanding |
| E1.1 Ownership helper + confirmed writers | Done (+ incidental writers, defensive readers) |
| E1.2 CI sweep for unchecked `*_id` fields | Not started |
| E1.3 Serial trace attribute bug with tenant check | Done |
| E7.1 Guard pay setup and run lines | Done (fail-closed key `hr.payroll.manage`) |
| E7.2 Attendance edits / leave types | Done (keys `hr.attendance.manage`, `hr.leave.types.manage`; locked-period protection; audit entry) |

Next batch: [STAGE1_REMEDIATION.md](STAGE1_REMEDIATION.md) §7.

---

## E0 — Safety net (Phase 0)

| ID | Task | Findings | Modules / files | Schema / API | Acceptance criteria | Risks | Effort |
|---|---|---|---|---|---|---|---|
| E0.1 | Real database backups: scheduled `pg_dump` (or base backup + WAL) to mounted volume + off-site copy; restore runbook; quarterly drill | OPS-01 | `docker-compose.prod.yml`, `scripts/`, `docs/` | none | Restore of last night's backup into staging passes smoke tests; RPO/RTO recorded | Disk space; credential handling for off-site | M |
| E0.2 | Tenant Settings backup/restore: hide or relabel until real; stop reporting "success" | OPS-01 | `modules/settings/router.py` ~L693–792; frontend settings page | response keeps shape, status truthful | UI never claims a backup that did not run | User confusion during change | S |
| E0.3 | Platform backup job: install client in image, write to volume, implement restore or remove button | OPS-01 | `backend/Dockerfile`, `modules/admin/backup_service.py`, `backup_router.py` | none | Job produces downloadable dump; failure surfaces in admin UI | Image size | S–M |
| E0.4 | Error tracking + request IDs + structured logs | OPS-02 | `main.py`, `common/request_logger.py` | new env vars with safe defaults | Exceptions visible with tenant/request id (no PII payloads) | Data leakage to vendor — scrub | M |
| E0.5 | CI-gated image publish; remove duplicate build workflow; scope/remove Watchtower | OPS-03 | `.github/workflows/*.yml`, `docker-compose.prod.yml` | none | Failing test blocks push; Ollama not auto-updated | Deploy habit change | S |
| E0.6 | RBAC shadow report per tenant | SEC-01 | `common/permissions.py`, `tenant_feature_keys.py` | tenant flag `rbac_enforcement=shadow` | Report of would-be denials per role/route for 2 weeks | Log volume | S |
| E0.7 | Read-only reconciliation scripts (FIN-01/02, INV-01/02, COM-01, MER-01, INV-08, MER-05, COM-06) | many | `backend/scripts/` | none | Scripts run in container, output CSV, no writes (verified by read-only DB role) | Long queries — run off-peak | M |
| E0.8 | Production cross-tenant FK scan (relations listed in private findings) | SEC-03 | `backend/scripts/` | none | Counts per relation archived; non-zero rows triaged | Requires authorized operator | S |
| E0.9 | Owner decisions: repo visibility, AI provider policy | SEC-10, SEC-11 | — | — | Decisions recorded in OPEN_QUESTIONS | — | S |

## E1 — Tenant isolation and access control (Phases 1–2)

| ID | Task | Findings | Modules / files | Schema / API | Acceptance criteria | Risks | Effort |
|---|---|---|---|---|---|---|---|
| E1.1 | Shared ownership helper `owned(db, Model, id, tenant_id)`; apply to every confirmed writer (8 root causes) and the incidental writer list | SEC-03 | Exact files/functions in private findings (merchandising, production, inventory, facility, manufacturing) | new 404/400 on invalid ids | Regression test per root cause (the 4 runtime probes become permanent tests and pass); reader sites add defensive tenant checks | Legitimate legacy data with cross-tenant links breaks reads → handle per E0.8 triage | M–L |
| E1.2 | CI test: every persisted Pydantic `*_id` body field has an ownership check (AST/introspection allow-list) | SEC-03, SEC-04 | `backend/tests/` | none | CI fails on new unchecked FK field | False positives need allow-list | M |
| E1.3 | Fix a latent functional bug in one affected read path **only together with** its tenant check (detail in private findings) | SEC-03 | private findings | none | Affected list/trace pages no 500; invalid ids rejected | Fixing the bug alone would open a leak | S |
| E1.4 | Module gates on all routers; sensitive summary endpoints require domain permissions (route list in private findings) | SEC-02 | `main.py` + routers listed privately | 403 for unauthorized | Route inventory test: no router without dependency | Users lose some dashboard tiles | M |
| E1.5 | Backend tenant-type and `trade_enabled` enforcement | MER-07 | `common/tenant.py`, router mounts | 403/404 | Tests per tenant type | Tenants with type mismatch in data | S–M |
| E1.6 | Fail-closed keys for finance/HR/approval permissions; role templates | SEC-05 | `common/permissions.py`, settings roles UI | role JSON migration | Explicit grants required; migration grants current behaviour to existing roles explicitly | Over-restriction | M |
| E1.7 | RBAC enforce rollout per tenant | SEC-01 | tenant flags | none | Shadow denials reviewed and resolved before enforce | Support load | S per tenant |
| E1.8 | Rate-limit keying, file access permissions, inactive-tenant handling (detail in private findings) | SEC-06, SEC-07 | `common/`, `modules/files/` | none | Tests | — | S–M |
| E1.9 | MFA (TOTP) for platform admins; optional for tenant admins | SEC-09 | `modules/admin/auth.py`, auth | new tables | Admin login requires TOTP | Lockout recovery process | M |
| E1.10 | Composite `(tenant_id, id)` keys and composite FKs on high-risk relations | SEC-04 | migrations | constraints | Applied after E0.8 clean; downgrade works | Migration locks on large tables — run off-peak | L |
| E1.11 | AI/MCP authorization tightening: per-user permission filtering for retrieval and tools; human approval bound to a distinct approver (detail in private findings) | SEC-08, AI-02 | `ai_tool/`, `mcp_server/`, `erp_ai_phases/` | none | Tests: users only reach tools/data their role allows; proposer cannot approve | — | M |
| E1.12 | Container and web hardening checklist (detail in private findings) | SEC-12 | `backend/Dockerfile`, `frontend/nginx.prod.conf`, `docker-compose.prod.yml` | none | Checklist verified on server | Changes must match host nginx | S–M |

## E2 — Ledger and posting integrity (Phases 1–2)

| ID | Task | Findings | Modules / files | Schema / API | Acceptance criteria | Risks | Effort |
|---|---|---|---|---|---|---|---|
| E2.1 | Base-currency TB and balances (`base_amount`), with per-currency sub-totals; comparison view for one close | FIN-01 | `modules/finance/router.py` ~L1304, ~L3048; `finance/auto_posting_service.py` ~L54 | report response adds fields (additive) | Multi-currency test; reconciliation per account explained | Historic lines with missing base_amount | M |
| E2.2 | BTB voucher currency + rate from LC; block BTB amount edit after vouchers exist | FIN-02, COM-03 | `modules/commercial/router.py` ~L2222–2416 | none | USD LC voucher base = amount × rate | Existing drafts need regeneration | S |
| E2.3 | Payroll posting: gross expense, deductions → liabilities, employer contributions; apply balances; row lock; unique posting per run | FIN-03 | `modules/hr_payroll/router.py` ~L886–1005, ~L267–384; `models/hr_payroll.py` | unique constraint on `PayrollPosting.payroll_run_id` (after dedupe) | Balanced voucher test with deductions; double-post test returns 409 | Account mapping per tenant | M |
| E2.4 | System vouchers reversible only; balance re-check at post; restrict memorandum conversion and special vouchers (balance + account ownership) | FIN-04 | `finance/router.py` ~L143, ~L6198, ~L2780; `advanced_voucher_router.py` ~L682–753; `advanced_voucher_service.py` ~L554 | 400 on invalid ops | Tests per path | Users relying on cancel-posting | M |
| E2.5 | Single GRNI/AP account resolver; payment run clears AP-trade; posting-exception queue with period-close block | FIN-05 | `services/inventory_gl_service.py`, `finance/router.py` ~L5149, ~L7412, `services/inventory_account_resolver.py` | new `posting_exceptions` table | GRN → bill → payment scenario leaves GRNI and AP at 0 | Historic residues need journal | M–L |
| E2.6 | Posting engine consolidation (wrap all GL writers) | FIN-04/05/13 | `finance/auto_posting_service.py` + all callers | generalized posting key table | All writers go through engine; replay of sample month gives identical TB | Large refactor — do incrementally per source | L–XL |
| E2.7 | Decimal arithmetic in voucher create/update and system voucher storage at 4 dp | FIN-13 | `finance/router.py` ~L2401, ~L2582; `auto_posting_service.py` ~L219–264 | none | Property tests on rounding | — | M |
| E2.8 | Period-lock coverage, reopen reason + audit, configurable fiscal year start, year-end close | FIN-07 | `finance/router.py`, `tds_service.py`, `advanced_voucher_service.py` | settings field | Tests per posting path | July–June migration for existing data | M |
| E2.9 | Vendor bill uniqueness per GRN line qty; locked post; tolerance-based 3-way match | FIN-18, FIN-05 | `finance/router.py` ~L7239–7474 | constraint after dedupe | Duplicate bill rejected; variance posted | — | M |
| E2.10 | FX settlement difference and period-end revaluation journals | FIN-09 | finance | none | Revaluation journal auto-reverses next period | Rate source (Q12) | M |
| E2.11 | Converge AP/AR open items (one ledger, others views) | FIN-08 | finance, party ledger | new view/tables | Ageing equals across screens | Large | L |
| E2.12 | Cash forecast rebuild from open items + LC maturities + payroll calendar | FIN-10 | finance | response additive | Assumptions shown in UI | — | M |

## E3 — Stock ledger and procurement (Phases 1, 4, 6)

| ID | Task | Findings | Modules / files | Schema / API | Acceptance criteria | Risks | Effort |
|---|---|---|---|---|---|---|---|
| E3.1 | Decimal quantities end-to-end; remove `.4g` | INV-01 | `merch/bom_procurement_service.py` L228/L305; `inventory/router.py` L2982–3121 | GRN qty columns string → Numeric (phased migration) | 12,345.6 round-trips; reconciliation of affected rows | String→Numeric conversion of bad data | M |
| E3.2 | GRN base-currency costing using PO rate | INV-02 | `inventory/router.py` `_apply_grn_receive_goods` | none | USD GRN FIFO value = qty × price × rate | Historic correction via journal | S–M |
| E3.3 | Locked stock-out helper applied to all issue/transfer/adjust/count/IDT paths with policy check | INV-03 | `inventory/router.py` ~L4106 (reuse), ~L4690, ~L5692, ~L6238, ~L6375; `idt_service.py` | none | Concurrency test: two parallel issues cannot exceed stock | Lock contention on hot items | M |
| E3.4 | Commercial invoice item partitioning for split and consolidated challans | INV-04 | `commercial/commercial_invoice_service.py` ~L159–498 | none | Split and consolidated tests | Existing over-invoiced drafts | S–M |
| E3.5 | Stock ledger service with status/owner/lot dimensions and single balance | INV-08, INV-11, INV-14 | inventory | movement columns additive | Variance report = 0 vs old formula on clean data | Broad change; pilot first | L–XL |
| E3.6 | Reservation writer (create/release/consume) used by readiness and issue | INV-06, PRD-10 | inventory, production readiness | none | Two orders cannot both see the same free stock | Business rules for priority | M–L |
| E3.7 | MRP netting fixes (open PO qty, statuses, idempotent runs, locked release) | INV-05 | `inventory/mrp_engine_service.py`, `mrp_idt_router.py` | none | Tests per defect | — | M |
| E3.8 | IDT/process-order partial receipts; return-to-vendor document; GRN reversal | INV-09, INV-10, INV-12 | `idt_service.py`, inventory router, finance debit note | new document type | Partial receipt and reversal tests balanced in stock and GL | — | L |
| E3.9 | Physical count recompute expected at post | INV-17 | inventory router ~L6613–6663 | none | Test with movement during count | — | S |
| E3.10 | PO approval permission + SoD; block APPROVED→DRAFT after commitments | INV-20 | inventory router ~L2700 | none | Tests | — | S |
| E3.11 | Roll/lot/shade, UOM conversion, landed cost, requisition/RFQ | INV-13/15/16/07 | inventory | new tables | Per feature | Scope confirmation | L each |

## E4 — Commercial spine (Phase 3)

| ID | Task | Findings | Modules / files | Schema / API | Acceptance criteria | Risks | Effort |
|---|---|---|---|---|---|---|---|
| E4.1 | Interim: server-side block of order on >1 issued export PI; status only via finalize; dedupe order ids | COM-01 | `commercial/router.py` ~L924–1102 | 409 on conflict | Tests | Existing duplicates (E0.7) | S |
| E4.2 | `sales_pi_allocations` with qty/value; backfill; PI amount reconciliation | COM-01 | `models/commercial.py`, commercial router | new table; optional request fields | Over-allocation rejected; backfill flagged | Backfill assumptions | L |
| E4.3 | Amendment history for contract/LC, BTB, order | COM-02, MER-03 | commercial, orders | new tables | Every value/expiry change has an amendment row | — | M |
| E4.4 | `btb_contract_allocations`, status/FX-aware locked cap, configurable cap per bank/contract | COM-03 | commercial | new table | Concurrency + mixed currency tests | Rate source | M–L |
| E4.5 | Export bill → submission → discrepancy → realization (partial/short) → charges → FX difference | COM-04 | new commercial submodule | new tables | Full lifecycle UAT balanced | Bank practice variations | L–XL |
| E4.6 | Exposure report (opened, accepted, paid; maturity) | COM-09 | commercial, finance | read API | Matches bank statement on sample | — | M |
| E4.7 | Reference uniqueness after dedupe | COM-06 | migrations | unique constraints | Applied with downgrade | — | S |
| E4.8 | Contract cost-centre auto-creation for canonical statuses; dimension stamping on all contract-linked postings | GAP §3 principles | `commercial/router.py` ~L707–734 | none | Contract P&L complete for sample | — | S–M |

## E5 — Merchandising controls (Phases 1–3)

| ID | Task | Findings | Modules / files | Schema / API | Acceptance criteria | Risks | Effort |
|---|---|---|---|---|---|---|---|
| E5.1 | Order status machine: `NEW→CONFIRMED→IN_PROGRESS→COMPLETED→CLOSED` with approval; backfill plan for existing NEW orders | MER-01 | `common/workflow.py`, `orders/router.py` | none | From-quotation order can be confirmed and is then locked | Users editing NEW orders lose that ability after confirm | S–M |
| E5.2 | Quotation revisions with full cost lines and parent link | MER-02 | `quotations/router.py` ~L491–542; migration | columns + index change | Revision test | Unique index change needs care | M |
| E5.3 | BOM revisions, active BOM uniqueness, hard freeze | MER-05 | `merch/routers/boms.py`, models | partial unique index | Tests | Duplicate active BOMs in data | M |
| E5.4 | Quotation/BOM approval permissions + SoD | MER-08 | quotations, merch | none | Tests | — | S |
| E5.5 | Trade case: remove stage/status from PATCH; Decimal money | MER-13, MER-14 | `trade_case/router.py`, `models/trade.py` | none | Tests | — | S |
| E5.6 | Sample rounds with evidence; buyer approval capture via portal | MER-04 | samples, customer portal | new table | — | — | M |
| E5.7 | Trade model (manufacturer / agent / principal / CMT) driving revenue, commission, ownership | MER-09 | orders, trade, finance | new field + rules | Per-model posting tests | Business decision Q2 | L |
| E5.8 | Tech pack + measurement spec per style revision | MER-06 | merch | new tables | — | — | M–L |
| E5.9 | Buyer claims → credit note | MER-10 | merch, finance | new table | — | — | M |

## E6 — Production and quality (Phase 4)

| ID | Task | Findings | Modules / files | Schema / API | Acceptance criteria | Risks | Effort |
|---|---|---|---|---|---|---|---|
| E6.1 | CAPA/NCR carry `order_id` (from work order); gate test | PRD-01 | `manufacturing/quality_router.py` ~L346–451; `merch/execution_gates.py` | none | Challan post blocked with open CAPA when flag on | — | S |
| E6.2 | Production quantity ledger + over-production guard + plan completion | PRD-02 | production, scan, hourly | new table | Derived WIP equals event sum; `completed_qty` updated | Volume | L |
| E6.3 | Hourly entry key (shift + order), unique constraint, validation | PRD-04 | `production/hourly_router.py` | unique index after dedupe | Tests | Duplicate rows in data | S–M |
| E6.4 | Capacity formula fixes; heatmap spreading | PRD-03 | `line_reservation_service.py`, `planning_advisory_service.py`, `control_tower/service.py` | none | Unit tests with known SMV/operators | — | S |
| E6.5 | Work-order completion, cumulative return cap, status transitions | PRD-09 | `manufacturing/execution_router.py` | none | Tests | — | S–M |
| E6.6 | Readiness uses order BOM + reservations | PRD-10 | `production/readiness_service.py` | none | Tests | — | S |
| E6.7 | `release_work_orders` rollback fix; replace `except: pass` with outbox | PRD-13 | `production/planning_router.py` ~L750–782 | none | Test simulating failure | — | S |
| E6.8 | Bundle numbering continuation, require lines, quantity checks vs plies × ratio | PRD-05 | `production/cutting_router.py` | none | Second generate works | — | S |
| E6.9 | AQL plans (standard version, level, code letters, sample size, Ac/Re by defect class) and final inspection lots | QA-01 | new quality submodule | new tables | Test vectors from the licensed standard tables pass | Licensing of standard tables | M–L |
| E6.10 | Measurement checks, reinspection, CAPA verification | QA-02, QA-03 | quality | new tables | — | — | M |
| E6.11 | Gate pass lines, direction, returnable/overdue, seal, actual exit; reconciliation to challan/returns/subcontract | GATE-01 | `models/inventory.py` ~L617; inventory router ~L4363 | new table/columns | Exit without approved lines blocked; overdue returnable report | Guard workflow training | M–L |
| E6.12 | Choose single execution model; adapter for the other | PRD-11 | production, manufacturing | — | Decision Q11 recorded | — | L |
| E6.13 | Line balancing algorithm; skills/machine use; changeover | PRD-06, PRD-07 | production | — | — | — | L |

## E7 — HR and payroll (Phases 1, 5)

| ID | Task | Findings | Modules / files | Schema / API | Acceptance criteria | Risks | Effort |
|---|---|---|---|---|---|---|---|
| E7.1 | Guard pay setup and run lines (permission + period lock + audit) | HR-04 | `hr_payroll/router.py` ~L404–600, ~L722, ~L1468 | none | Non-HR user 403; locked period 409 | — | S |
| E7.2 | Attendance edits only via regularization; audit; lock after finalize; leave-type admin only | HR-02 | `hr_attendance/router.py` ~L405; `hr_leave/router.py` ~L259–301 | none | Tests | — | S–M |
| E7.3 | Pay calculation: OT basis/multipliers, absence/late deductions, proration, off-days | HR-03 | `hr_payroll/payroll_calculation_service.py`, `formula_engine.py` | config tables | Golden cases signed off | Parameter validation (Q8) | M |
| E7.4 | Jurisdiction rule sets; BD statutory items; disable Indian set for BD tenants | HR-01 | `hr_payroll/statutory_calculation_service.py` | new tables | Compliance-owner sign-off | Legal parameters change — effective dating | L |
| E7.5 | Piece rate, incentives, arrears, final settlement, advance recovery | HR-05, HR-09 | hr_payroll | new tables | Per element tests | — | L |
| E7.6 | Attendance device adapter | HR-06 | new integration module | raw punch table | Duplicate punches deduped; device identity | Hardware protocol | M–L |
| E7.7 | Bank/MFS payment files from approved runs only | HR-07 | `hr_payroll/router.py` ~L1410 | none | Bank accepts sample file | Bank formats | M |
| E7.8 | Grievance, welfare, training, safety registers | HR-08 | hr_compliance | new tables | — | — | M |

## E8 — Platform and operations (Phases 2+)

| ID | Task | Findings | Modules / files | Acceptance criteria | Effort |
|---|---|---|---|---|---|
| E8.1 | Domain audit trail (before/after) on posting, price, qty, status, pay | SEC-13 | core services | Events present for listed actions | M–L |
| E8.2 | Approval/SoD service | FIN-06 | new common module | Policies configurable per document | M–L |
| E8.3 | Transactional outbox for side effects | PRD-13 pattern | common, workers | No `except: pass` side effects in posting paths | M |
| E8.4 | Request-log retention/partitioning; pool sizing; PgBouncer in prod | OPS-04, OPS-05 | `common/request_logger.py`, compose | Table growth bounded; connections within limits | M |
| E8.5 | Idempotency keys on posting endpoints | OPS-06 | finance, inventory, payroll | Replays return original result | M |
| E8.6 | Retire legacy compliance router after data migration | BD-03 | `compliance/router.py`, `main.py` | Route removed; data in BD registers | S–M |
| E8.7 | BD compliance additions (bond licence, UP, BOE, EXP, consumption link) per validated requirements | BD-02, BD-04 | `compliance/` | Compliance owner acceptance | L |

## E9 — Advanced (Phase 6)

Time-phased MRP · capacity scheduling · IoT gateway and device registry (IOT-02) · AI cards (TARGET_ARCHITECTURE §8) ·
multi-entity accounting (FIN-12) · fixed assets (FIN-11) · RLS evaluation (SEC-04 layer 3) · AI evaluation harness (AI-03).
Each to be sized after Phases 3–5 when data quality is known.
