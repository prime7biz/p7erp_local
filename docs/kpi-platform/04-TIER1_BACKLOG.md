# 04 — Tier-1 Backlog (~45 core KPIs)

Each row: **ADAPT** (wrap existing), **NEW** (facts exist), **BLOCKED** (missing/unsafe data).

## D1 — Sales / merch / sampling / costing

| Code | Mode | Acceptance |
|---|---|---|
| MKT-02 Enquiry-to-order conversion | NEW | Valid enquiry set defined; duplicates excluded; tenant filter |
| MKT-03 Quotation win rate | NEW | Closed set = accepted+rejected; open excluded |
| MKT-04 Order-book value | ADAPT | Open orders value; FX to base |
| MKT-08 Buyer retention | NEW | Active = ≥1 order in period |
| MER-06 T&A milestone adherence | NEW | Followup actions on/before due / due |
| MER-07 Critical-path delay days | NEW | Sum positive delays on critical flags if present else all overdue |
| MER-08 Order risk exposure | ADAPT | Merch/MI risk value / open value |
| SMP-01 Sample on-time submission | NEW | Sample due vs submitted |
| SMP-02 Sample first-pass approval | NEW | First approval without resubmit |
| SMP-03 Sample approval cycle time | NEW | Days request→approval |
| CST-01 Costing turnaround | NEW | Quotation create→submit |
| CST-03 Cost variance % | ADAPT | MI CAC vs quoted where available |
| CST-04 CM variance | ADAPT | Alert/CM fields |

## D2 — Supply / inventory

| Code | Mode | Acceptance |
|---|---|---|
| PRC-02 Supplier OTIF | ADAPT | supplier_lateness on_time_rate |
| PRC-05 Supplier defect rate | NEW | GRN QC reject / inspected |
| PRC-04 Purchase price variance | NEW | PO vs item standard when present |
| INV-01 Material readiness | ADAPT | MI readiness |
| INV-02 Fabric readiness | NEW | Fabric BOM lines covered |
| INV-03 Trim readiness | NEW | Trim BOM lines covered |
| INV-04 Inventory accuracy | NEW | Last count match rate or NO_DATA |
| INV-07 Inventory days | ADAPT | ratio_service |
| INV-08 Dead-stock % | NEW | No movement > N days / value |

## D3 — PPC / cut / sew / quality

| Code | Mode | Acceptance |
|---|---|---|
| PPC-01 Capacity utilisation | ADAPT | MI |
| PPC-02 Capacity booking load | ADAPT | MI |
| PPC-03 Production plan attainment | NEW | Hourly good / plan |
| PPC-04 Schedule adherence | NEW | TNA on-time % |
| CUT-01 Fabric utilisation | NEW | Marker fields or NO_DATA |
| CUT-03 Cut plan attainment | NEW | Cut tickets |
| CUT-05 Cutting re-cut rate | NEW | Re-cut reason or NO_DATA |
| SEW-01 Sewing efficiency | ADAPT | empirical_efficiency |
| SEW-02 Operator efficiency | NEW | If operator grain else NO_DATA |
| SEW-04 Earned minutes | ADAPT | Same |
| SEW-08 Hourly target attainment | NEW | Hourly vs target |
| QA-01 RFT | BLOCKED | Until QA-04 structured checks |
| QA-02 DHU | BLOCKED | Until defect counts reliable |
| QA-05 Reject rate | NEW | hourly reject / produced |
| QA-07 Final inspection pass rate | NEW | Final check_type filter if usable else NO_DATA |
| QA-12 CAPA closure on time | NEW | CAPA due dates if present |

## D4 — Commercial / finance (CRITICAL)

| Code | Mode | Acceptance |
|---|---|---|
| COM-01 Shipment OTIF | NEW | Uses commitment revision when C2 on; else LATEST_DATE_BASIS labelled |
| COM-02 On-time ex-factory | NEW | Shipment vs committed |
| COM-04 Documentation first-pass accuracy | NEW | Doc correction flags or NO_DATA |
| COM-05 Document cycle time | NEW | Timestamp delta |
| COM-07 Export proceeds ageing | NEW | Receipt − invoice basis |
| COM-12 Bond entitlement utilisation | ADAPT | BD bond registers |
| FINA-01 Gross margin % | ADAPT | ratio_service |
| FINA-02 Contribution margin % | ADAPT | mgmt / CAC |
| FINA-04 Order profitability | ADAPT | MI CAC |
| FINA-06 DSO | ADAPT | receivable days |
| FINA-08 Cash conversion cycle | NEW | Compose DIO+DSO−DPO |
| FINA-09 Overdue AR % | ADAPT | control tower |

Money KPIs reconcile to posted GL; no posting behaviour change. Finance adapters are read-only. Any commercial path that touches PI↔Order links must `ensure_owned` on parent PI/Order (link table has no `tenant_id`).

## D5 — HR / agent

| Code | Mode | Acceptance |
|---|---|---|
| HR-01 Attendance rate | NEW | Attendance scheduled |
| HR-02 Absenteeism | NEW | Complement |
| HR-03 Employee turnover | NEW | Separations / avg HC |
| HR-05 Overtime ratio | NEW | OT / regular; BD effective rules |
| HR-06 Payroll accuracy | NEW | Correction count or NO_DATA |
| HR-09 Training completion | NEW | Onboarding required tasks |
| AGT-01 Commission earned | ADAPT | Commission engine |
| AGT-02 Commission billed | ADAPT | Entries |
| AGT-03 Commission realisation % | NEW | Received / due |
| AGT-04 Commission DSO | NEW | AR days |
| AGT-05 Sourcing conversion | NEW | Opportunity→order |
| AGT-08 Supplier OTIF portfolio | ADAPT | Weighted supplier OTIF |

## Blocked list (do not fake)

- QA-01 RFT, QA-02 DHU until QC hardening.
- ESG-* until energy/HSE facts.
- MNT OEE until downtime capture.
- MKT-01 CRM leads until lead entity.
- COM-01 gaming-proof mode until C2 live.

## Wave exit

Each wave: pytest green (tenant isolation, permission, zero denom, cancellations), qa-engineer review. D4 also plan-auditor + security-auditor (Auto; Premium only if user opts in).
