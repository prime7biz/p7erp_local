# Prime7ERP Modernization Audit — index and executive summary

Audit date: 2026-11-03 · Scope: full repository (backend, frontend, infrastructure, CI) · Method: static inspection by five parallel
workstreams (merchandising/commercial, procurement/inventory, production/quality, finance/HR, platform/security/AI) reconciled by a lead
reviewer, plus targeted spot checks and limited runtime probes against the **local** development database. No application code, schema,
dependency, infrastructure, or production data was changed.

## Documents

| Document | Contents |
|---|---|
| [CURRENT_STATE.md](CURRENT_STATE.md) | Stack, system map, component status, 12 reconstructed workflows with diagrams and break points, operational→GL map |
| [GAP_ANALYSIS.md](GAP_ANALYSIS.md) | Evidence matrix per module (A–I), platform/security (sanitized), IoT/AI readiness, data-model assessment, retain list |
| [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) | Modular-monolith decision, domain boundaries, core services, data-model changes, isolation defence in depth, integrations, AI cards |
| [UPGRADE_ROADMAP.md](UPGRADE_ROADMAP.md) | Phases 0–6 with migration, compatibility, rollout, rollback, tests, reconciliation, training, exit criteria |
| [BACKLOG.md](BACKLOG.md) | Epics E0–E9 with tasks, files, schema/API impact, acceptance criteria, risks, effort ranges |
| [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) | Business decisions, production evidence, compliance validation, not-verified list |
| [STAGE1_REMEDIATION.md](STAGE1_REMEDIATION.md) | Stage 1 changes by audit ID, tests, permission observe-vs-enforce decisions, next batch |
| [BACKUP_RESTORE_RUNBOOK.md](BACKUP_RESTORE_RUNBOOK.md) | Backup, restore drill, incident restore, local evidence |
| `private/` (git-ignored, not in repository) | Exploit-level security findings and the full tenant-isolation candidate classification. Held by the core team only |

## Remediation status

**Stage 1 (2026-11-04, local code only — not committed, pushed or deployed):** recovery tooling and truthful backup
status (OPS-01), all confirmed tenant-ownership defects plus incidental writers (SEC-03), fail-closed pay-setup and
attendance/leave-type authorization (HR-04, HR-02), and read-only RBAC and cross-tenant scan tooling. Details,
tests, access-migration plan, outstanding production checks and the next batch:
[STAGE1_REMEDIATION.md](STAGE1_REMEDIATION.md); operator procedures: [BACKUP_RESTORE_RUNBOOK.md](BACKUP_RESTORE_RUNBOOK.md).
Statuses per finding: [GAP_ANALYSIS.md](GAP_ANALYSIS.md) §0.

## Executive findings

1. **The platform is a sound base.** It is a FastAPI + PostgreSQL modular monolith with broad RMG coverage: merchandising,
   commercial, inventory, production, finance, HR, portals and governed AI. It has a working CI pipeline that runs real-database
   tests. A rewrite or a move to microservices is **not** justified.
2. **The ledgers do not yet protect themselves.** Several posting and quantity paths can produce wrong books or stock:
   - Multi-currency amounts are summed without base-currency conversion (FIN-01).
   - BTB LC vouchers are booked at rate 1 (FIN-02).
   - Payroll posts net pay only (FIN-03).
   - Posted system vouchers can be un-posted (FIN-04).
   - GRNI and AP accounts don't clear (FIN-05).
   - Quantities are truncated to 4 significant digits (INV-01).
   - GRN costing ignores FX (INV-02).
   - Stock-out paths are unlocked (INV-03).
   - Split invoices double-count shipped quantity (INV-04).
   - The same order can be allocated to several sales PIs (COM-01).
3. **Tenant isolation is "Verified partial".** It is enforced by hand in each handler. Reviewers classified all 167 heuristic candidates and
   confirmed **8 root causes of cross-tenant defects**. In each, an endpoint stores another tenant's record id without validation; **4 were
   reproduced at runtime**. These defects are not proof that every other path is safe (see Limitations).
4. **Access control is off by default.** Module-level RBAC is disabled unless a tenant opts in (SEC-01). Fine-grained permissions fail open
   (SEC-05). Some routers have no module gate, including some that return sensitive summaries (SEC-02).
5. **Data-loss exposure.** The tenant "backup/restore" feature only writes log rows. No working application backup path was found
   in the repository (OPS-01).
6. **Key workflows break between modules:**
   - Orders converted from quotations cannot reach the locked state (MER-01).
   - Reservations are never written (INV-06).
   - Production progress is never rolled up (PRD-02).
   - The CAPA shipment hold cannot fire (PRD-01).
   - AQL is absent (QA-01).
   - Export bill and realization are absent (COM-04).
   - The gate pass is a status label only (GATE-01).
7. **Payroll is not Bangladesh-ready.** The statutory engine implements Indian rules (HR-01). Overtime multipliers and absence
   deductions are not applied (HR-03). Pay setup is editable without manager or period-lock checks (HR-04).

## Security classification summary (sanitized)

| Category | Count |
|---|---:|
| Platform-global lookup with verified platform-admin authorization | 30 |
| Directly tenant-scoped | 16 |
| Indirectly tenant-scoped through a verified relationship | 98 |
| Confirmed isolation defect (grouped into 8 root causes) | 21 |
| Needs further review (both have no current callers) | 2 |
| **Total candidates** | **167** |

Evidence:
- **Static:** for every candidate, reviewers traced the referenced foreign-key writers.
- **Runtime:** 4 root causes were reproduced through API or service calls inside one rolled-back transaction on the local database. Zero residual rows were verified afterwards.
- **Existing isolation tests:** 11 passed. They do not cover the defective paths.

Architectural risks (no RLS, RBAC off by default, fail-open keys) and unresolved candidates outside the heuristic are tracked separately in the private file. They are summarized in GAP_ANALYSIS section J.

## Answers to the audit questions

**1. How does the application actually work?**
Tenant users work through a React SPA against one FastAPI service.
- **Request handling:** each handler filters by tenant manually.
- **Status machines:** defined centrally in `backend/app/common/workflow.py`.
- **GL postings:** produced by several independent paths. Inventory postings are immediate; commercial postings are drafts; payroll is posted directly.
- **Stock:** a movement ledger with FIFO layers.
- **Production:** two separate execution stacks.
- **AI:** advisory, with human confirmation.

See [CURRENT_STATE.md](CURRENT_STATE.md).

**2. Where does it diverge from the target workflow?**
- Commercial: no allocations, amendments or realization.
- Material: no reservations, quarantine bypass is possible, MRP is not time-phased.
- Production: no stage quantity ledger, and the capacity formulas are wrong.
- Quality: no AQL.
- Finance: no base-currency TB, no maker-checker, no FX postings.
- Payroll: BD rules missing.
- Gate pass: no reconciliation.

See [GAP_ANALYSIS.md](GAP_ANALYSIS.md).

**3. What is strong enough to retain?**
- Commission engine.
- Voucher workflow and locked reversal.
- Inventory GL idempotency and FIFO service.
- Delivery-challan posting.
- Commercial-invoice and receipt idempotency.
- Import-PI rules.
- BD registers.
- Leave locking and payslip scoping.
- Scan-station idempotency and offline queue.
- External portal token separation.
- Login hardening and upload safety.
- Schedulers and CI.
- The governed-AI pattern.

See GAP_ANALYSIS section 4.

**4. What must change first, and why?**
1. Backups, because nothing else is safe to change without them.
2. Cross-tenant FK validation, because of leakage.
3. Ledger and stock integrity (P0 list), because the errors compound with every transaction.
4. RBAC in shadow mode, then enforce.

**5. Which upgrades depend on data cleanup or foundational controls?**
- **Base-currency TB:** needs `base_amount` to be correct.
- **Composite tenant FKs:** need a clean cross-tenant scan.
- **Reference and BOM uniqueness:** need deduplication first.
- **PI allocation backfill:** needs the duplicate-allocation report.
- **`.4g` and FX corrections:** need affected-row reports and accountant-approved compensating journals.
- **Commercial spine, approvals, and audit:** depend on the posting engine and SoD service from Phase 2.

See the data cleanup table in UPGRADE_ROADMAP.

**6. How can implementation proceed without interrupting live operations?**
- Additive migrations, phased nullable → backfill → constraint.
- Tenant feature flags with warn-then-enforce.
- Read-only reconciliation before and after each fix.
- Compensating entries instead of silent edits.
- A pilot factory, and parallel runs for WIP and payroll.
- Image-pin plus `alembic downgrade` rollback.

See UPGRADE_ROADMAP "Operating rules".

**7. What remains unverified?**
- Production configuration and data quality: flags, `base_amount`, existing cross-tenant links, backups at host level.
- Host security settings.
- BD legal parameters and formats.
- Isolation beyond the reviewed candidates.
- Several secondary modules.

See [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) section E.

## Recommended first implementation phase

**Phase 0 (1–3 weeks)** comes first, before any application change:
1. Working backups with a timed restore drill.
2. Make the Settings backup UI truthful.
3. Error tracking.
4. CI-gated image publishing, with Watchtower scoped.
5. An RBAC shadow report per tenant.
6. Read-only reconciliation and cross-tenant scans on production, run by an authorized operator.
7. Owner decisions on repository visibility and the AI provider policy.

**Phase 1** then starts with the tenant-isolation writer fixes (E1.1, E1.3). They are small, low-risk and covered by the four
runtime probes, which become permanent regression tests. After that come the P0 ledger and stock fixes (E2.1–E2.5, E3.1–E3.4, E4.1, E5.1, E7.1).

## Coverage

| Depth | Modules (`backend/app/modules/*` unless noted) |
|---|---|
| Deep (workflow traced, defects verified) | commercial, orders, quotations, merch, inventory, finance, hr_payroll, hr_attendance, hr_leave, production, manufacturing, trade_case, commission, compliance, settings (backup), admin (auth, backup), facility (tenant links), `external_access` financier portal (sampled endpoints) |
| Medium (key paths inspected) | inquiries, logistics, ai_tool, ai_extract, governed_ai, erp_ai_phases, mcp_server, auth, files, dashboard, control_tower, hr_compliance, hr_ess, traceability, tna_unified (via follow-up sync), costing, currency, parties, customers (FK writers), hr (employee FK writers) |
| Inventory only (listed, not reviewed in depth) | announcements, audit, billing_lemonsqueezy, data_migration, global_search, hr_performance, hr_recruitment, hr_reports, marketing, master_data_ai, notifications, onboarding, reports, roles, saved_views, staff_invite, support, tenant, users |
| Infrastructure | `docker-compose*.yml`, Dockerfiles, nginx configs, `.github/workflows/*`, `scripts/deploy_production_remote.sh` |
| Frontend | routing, API client, auth storage, scan offline queue, i18n, sidebar gating (no page-by-page UX review) |

## Limitations

- **Mostly static evidence.** Except for the four runtime isolation probes and the existing-test run, every finding comes from reading code. A `DEF` status
  means a defect was found in code, not that a failure was reproduced.
- **No production access.** Live configuration, data quality, operational usage and host-level controls are unknown.
- **The isolation heuristic covered only part of the code.** It looked at `db.get` calls under `modules/` and `external_access/` only, and it has false positives and false negatives.
  Reviewing its 167 candidates does **not** establish that the application is tenant-safe.
- **Line numbers are approximate.** They will drift as the code changes.
- **No legal sources consulted.** Bangladesh legal and compliance requirements were not researched against authoritative sources. Every regulatory item needs owner validation (Q7, Q8).
- **Effort figures are ranges** based on stated assumptions, not estimates of record.
