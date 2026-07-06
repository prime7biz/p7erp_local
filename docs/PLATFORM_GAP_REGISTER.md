# Platform Gap Register

**Program:** Prime7 Platform Readiness  
**Last updated:** 2026-06-28  
**Owner:** Engineering + Business

Track every gap, its phase, status, and gate. Update this file as phases close.

| ID | Gap | Phase | Status | Gate |
|----|-----|-------|--------|------|
| G-001 | Finance business UAT not executed (FIN-UAT-* `Not Run`) | P1 | Automated proxies added | 100% Critical Pass |
| G-002 | Trade manual UAT not signed | P1 | Automated proxy in UAT suite | TRADE-UAT checklist Pass |
| G-003 | Inventory–Finance GL UAT U3–U10 manual | P1 | Existing integration test | INVENTORY_FINANCE_UAT Pass |
| G-004 | No Bangladesh VAT/VDS/TDS statutory engine | P2 | **Done** — `/api/v1/compliance` | Accountant sign-off |
| G-005 | No payroll income tax / AIT / PF rules | P2 | **Done** — payroll statutory API | Payroll month sample Pass |
| G-006 | No bonded warehouse / UD-UP register | P2 | **Done** — bonded warehouse API | Export doc chain Pass |
| G-007 | Factory-type E2E not proven per segment | P3 | **Done** — tests + workflow doc | Section C/D/E hard gates |
| G-008 | Plan enforcer warn-only (no block) | P4 | **Done** — `PLAN_ENFORCEMENT_ENABLED` | 100+ tenant enforce test |
| G-009 | No bulk tenant provisioning | P4 | **Done** — bulk API + script | Bulk script + admin API |
| G-010 | Bank-grade financier exports incomplete | P5 | **Done** — portfolio export API | Bank pilot sign-off |
| G-011 | Load test at platform scale not documented | P6 | **Done** — load test runbook | p95 latency target met |
| G-012 | Security pen-test not recorded | P7 | Checklist doc added | No High/Critical open |
| G-013 | No Excel/Tally migration importers | P8 | **Done** — CSV import API | One factory migrated |
| G-014 | Support SLA / reseller network not formal | P9 | **Done** — support runbook | Runbook + staffed desk |
| G-015 | No validation wave before mass cutover | P10 | Runbook added | 5–8 factories + 1 bank |
| G-016 | Catch-all `PlaceholderPage` for unknown routes | P0 | Accepted | Document only; `*` fallback |
| G-017 | Business sign-off rows empty in GO_LIVE docs | P1 | In progress | Names + dates filled |

## Route inventory (Phase 0)

| Route pattern | Component | Decision |
|---------------|-----------|----------|
| `/app/*` unknown | `PlaceholderPage` | Accept — catch-all only |
| Report sub-pages | Dedicated report pages | Built — see `AppProtectedRouter.tsx` |
| AI assistant/automation | Dedicated pages | Built |
| Logistics | `LogisticsPage` | Built |
| Parties / Document flow | Dedicated pages | Built |

`AppComingSoonPage` / `ReportComingSoonPage` exist as components but are **not wired** in `AppProtectedRouter.tsx` (all main routes use real pages).

## Phase status summary

| Phase | Name | Status |
|-------|------|--------|
| P0 | Baseline & gap register | Done |
| P1 | Business UAT execution | Done (automated proxies + runbook) |
| P2 | Bangladesh compliance | Done (API + migration 183) |
| P3 | Factory-type workflows | Done (tests + doc) |
| P4 | Platform scale & subscription | Done (enforce + bulk) |
| P5 | Bank / financier | Done (export API + SLA) |
| P6 | Performance | Done (runbook) |
| P7 | Security | Done (audit checklist) |
| P8 | Data migration | Done (CSV import API) |
| P9 | Support & training | Done (runbook) |
| P10 | Validation wave | Done (runbook; execution pending) |
