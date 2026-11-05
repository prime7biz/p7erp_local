# Open Questions — decisions and evidence still needed

Audit date: 2026-11-03. Each item names who should answer and what changes depending on the answer.

## A. Business decisions

| ID | Question | Owner | Why it matters | Blocks |
|---|---|---|---|---|
| Q1 | Does any customer group need **several legal entities** (separate books) under one login, with consolidation/intercompany? | Business owner, finance | Today one tenant = one legal entity (FIN-12). Adding an entity layer is a large change | E9 multi-entity |
| Q2 | Which **trade models** are actually used: manufacturer/exporter, buying house as agent (commission), buying house as principal trader, CMT/subcontract service? Per tenant? | Business owner, merch heads | Determines revenue vs commission recognition, payables, inventory ownership (MER-09, INV-14) | E5.7, E3.5 owner dimension |
| Q3 | Are **knitting, dyeing, washing** in scope for current/near-term tenants (in-house or subcontract)? | Business owner | Dyeing/washing are stubs (PRD-08) | Phase 4/6 scope |
| Q11 | Which **production execution model** is primary: line plan + hourly + bundles (`production`) or work orders + operations (`manufacturing`)? | Production heads, product owner | Two stacks are not reconciled (PRD-11) | E6.12, E6.2 |
| Q17 | BTB utilization limit: fixed 70% or **per bank / per contract**? Base currency for limit? | Commercial head, bank relationship | Current cap hard-coded (COM-03) | E4.4 |
| Q5 | Can one order (or order line) be split across **several sales PIs / contracts**? | Commercial head | Determines allocation granularity (COM-01) | E4.2 |

## B. Data and configuration evidence (read-only, production)

| ID | Question | How to answer | Blocks |
|---|---|---|---|
| Q4 | How many live orders are in `NEW` with downstream activity (BOM, PO, challan)? | E0.7 script | E5.1 backfill plan |
| Q6 | Is `voucher_lines.base_amount` populated correctly for historic foreign-currency lines? | E0.7 script | E2.1 |
| Q14 | Each tenant's `rbac_enforcement` and other `feature_flags` values in production | Read-only query by authorized operator | E1.7 rollout order |
| Q15 | Is there any **host-level** database backup today (outside the application)? Last successful restore? | Server operator | OPS-01 severity and Phase 0 sequencing |
| Q16 | Host nginx security headers; firewall on API port 8000; TLS config | Server operator | SEC-12 |
| Q18 | Do any production rows already contain **cross-tenant links** (relations listed in the private findings)? | E0.8 script | E1.10 composite FKs; incident assessment |
| Q19 | Quantity lines ≥ 10,000 affected by `.4g` rounding; foreign-currency GRNs valued 1:1 | E0.7 script | E3.1/E3.2 correction journals |

## C. Compliance and external validation

| ID | Question | Owner | Notes |
|---|---|---|---|
| Q7 | Authoritative sources and **effective dates** for: bond licence/UD/UP rules and formats, Bill of Entry data, EXP forms, Mushak 6.x registers, BGMEA/BKMEA document requirements, export realization reporting | Tenant compliance owner, customs/VAT adviser, bank | Audit did **not** assume any API availability or current legal requirement |
| Q8 | Bangladesh payroll parameters: minimum wage grades applicable per tenant, OT basis and rate, festival bonus rules, WPPF applicability, income-tax withholding — and whether any tenant currently uses the (Indian) statutory engine | HR head + labour-law/compliance adviser + accountant | Determines HR-01 severity (P0 if used) |
| Q12 | FX rate source for posting and revaluation (bank rate, central bank rate, contract rate) | Finance head, bank | E2.10, E4.4 |
| Q13 | AQL standard and version to follow (e.g. buyer-specified), and licensing of sample-size/acceptance tables | QA head | E6.9 |
| Q20 | Bank file / MFS formats per bank used for salary and supplier payments | Finance, banks | E7.7 |

## D. Security and platform decisions

| ID | Question | Owner | Notes |
|---|---|---|---|
| Q9 | Keep repository **public**, make it private, or scrub infrastructure details? | Owner | Repository confirmed public on 2026-11-03 |
| Q10 | Approved AI providers/models per data class (e.g. no tenant business data to free-tier hosted models; local model for HR data) | Owner, data protection lead | Default currently a free-tier OpenRouter model |
| Q21 | MFA scope: platform admins only, or tenant admins/finance approvers too | Owner | E1.9 |

## E. Not verified in this audit (evidence needed)

| Area | What was not verified | Evidence needed |
|---|---|---|
| Production behaviour | Actual usage, data quality, live flags, error rates | Read-only production queries, logs (Q4, Q6, Q14, Q18, Q19) |
| COM-07 | Shipment/expiry/presentation-date conflict validations | Code review of commercial date validations |
| COM-10 | Forced-loan / overdue exposure tracking | Requirement + code search |
| BD-05 | BGMEA/BKMEA and bank acknowledgement capture | Requirement + code search |
| Supplier portal | Depth of `supplier_portal` workflows | Code review + test |
| Financier portal | All 45 financier endpoints' scope checks (sampled only) | Endpoint-by-endpoint review |
| Season, style revision fields | Presence on style/order models | Model review |
| FIFO valuation details, party-ledger hooks, `hr_reports` maths, currency router | Partially read | Focused review |
| Tenant isolation overall | Only 167 heuristic candidates + incidental writers reviewed; `services/`, `common/`, `workers/` not scanned; `select()`-based reads not scanned | Systematic FK-writer sweep (E1.2) and read-path review |
| Security headers / firewall / TLS | Host configuration | Server inspection (Q16) |
| AI provider data retention | Third-party terms | Vendor terms review (Q10) |
| Mobile usability | Screens on mobile devices | Device testing; only scan station and inventory lists have mobile-specific code |

## E2. Added by remediation stage 1

| ID | Question | Owner | Notes |
|---|---|---|---|
| Q22 | Which non-manager roles per tenant legitimately maintain payroll setup, attendance edits or leave types (to receive `hr.payroll.manage`, `hr.attendance.manage`, `hr.leave.types.manage` before deploy)? | HR heads + tenant admins | Run `rbac_access_report.py`; locally 6 of 11 roles would lose access |
| Q23 | Off-site backup target (provider, encryption, retention) and who holds the keys | Owner + operator | Required for the `POST_BACKUP_HOOK` |
| Q24 | Install `postgresql-client` in the API image so the platform-admin backup button works, or keep backups host-side only? | Owner + operator | Recommendation: host-side only |
| Q25 | `.cursorignore` could not be created by the assistant (blocked by editor permissions); add it manually? | Owner | Suggested content in STAGE1 summary |

## F. Resolved during audit

| Item | Resolution |
|---|---|
| Where to keep exploit-level security detail given public repo | Git-ignored `docs/erp-modernization/private/`; public docs sanitized |
| Whether runtime checks may touch data | Only local compose DB, single rolled-back transaction; zero residual rows verified |
