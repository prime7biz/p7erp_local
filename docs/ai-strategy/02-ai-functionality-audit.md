# 02 - Existing AI Functionality Audit

Part of the Prime7 AI strategy set. Index: [`AI_DEVELOPMENT_MASTER_PLAN.md`](../../AI_DEVELOPMENT_MASTER_PLAN.md).

**Audit date:** 2026-11-04
**Method:** Each feature was traced from frontend page or component, through the API route, to the backend service and its data source. Only features found in code are listed. Hypothetical features are not included.

**Status key**

| Status | Meaning |
|---|---|
| Fully implemented | UI, API, service and tenant data all connected (may still need an LLM key at runtime) |
| Partial | Works, but narrow scope, heuristic only, flag-gated, or thin UI |
| Experimental | Lab or demo style surface, feature-flagged |
| Docs-only | Static content or test stub only |

**Important:** "AI" in this codebase covers three different things. Keeping them apart avoids overstating what exists:

1. **LLM features** - call OpenRouter, Ollama, Gemini or a paid model (chat, narratives, extraction, planning text).
2. **Heuristic / rule "AI"** - deterministic scoring on real ERP data, labelled as AI in the UI (defect risk, turnover risk, anomalies, forecasts).
3. **Deterministic operations engines** - MRP and reorder. These are not AI and should not be marketed as AI.

---

## 1. Existing AI Functionality Matrix

| ERP Module | Existing AI Feature | Implementation Status | Business Value | Missing Capability | Recommended Action |
|---|---|---|---|---|---|
| 1 Merchandising / orders | Inquiry AI: extract, enrich, validate, dedupe, summary, next actions, suggestion batch apply (`inquiries/inquiry_ai_router.py`, `inquiry_ai_service.py`, `inquiry_ai_authz.py`; UI `InquiryAiPanel`) | Fully implemented | Faster inquiry capture; fewer duplicates | No style/BOM proposal from inquiry | Retain |
| 1 | Order AI: extract, enrich, validate, execution-validate, planning risk, ATP/CTP, capacity, what-if, summary (`orders/order_ai_router.py`, `order_ai_service.py`; UI `OrderAiPanel`) | Fully implemented (rules + LLM advisory) | Early detection of risky orders | No calibrated delivery-risk score | Retain; feed into unified order-risk score (doc 09, blueprint 7) |
| 1 | Customer AI: extract, enrich, validate, dedupe, NL search (`customers/customer_ai_router.py`; UI `CustomerAiPanel`) | Fully implemented | Clean master data | Buyer performance metrics | Retain; add buyer scorecard (P2) |
| 1 | Sample AI plan, propose then human apply (`merch/sample_ai_service.py`, `merch/routers/samples.py`; UI `MerchSampleDetailPage.tsx`) | Fully implemented (LLM + fallback template) | Faster sample planning | No link to factory calendar | Retain |
| 1 | TNA / follow-up delay insights (`tna_unified/followup_ai_service.py`, `/tna-unified/ai/followup-insights`; UI Dashboard `ErpAiPhasesDashboardSection`) | Fully implemented (heuristic) | Flags late milestones | No dedicated TNA risk page | Promote into order-risk heatmap (P1) |
| 1 | Chat pipelines `order_risk`, `tna_delay` (`ai_tool/analysis/pipelines/`) | Fully implemented (SQL) | Ad-hoc analysis in chat | Only reachable through chat | Reuse logic in module screens |
| 2 BOM / costing | Quotation costing AI: completeness, anomaly, margin risk, FX sensitivity, suggestions, benchmarks (`quotations/quotation_costing_ai_service.py`, `quotation_cost_benchmark_service.py`; UI `QuotationAiPanel`, `useQuotationAi.ts`) | Fully implemented (rules) | Prevents under-priced quotes | No learned price model | Retain; add actual-vs-quoted feedback loop (P2) |
| 2 | Quotation document extract (`quotation_ai_service.py` + `ai_extract`) | Fully implemented | Less re-typing | - | Retain |
| 2 | Chat BOM tools: similar-style BOM, item suggestions (`ai_tool/tools/bom_tools.py`) | Fully implemented (retrieval) | Faster BOM drafting | No BOM screen integration | Surface in BOM editor (P2) |
| 2 | Chat pipelines `costing`, `margin`, `wastage` | Fully implemented | Margin leak analysis | Chat only | Surface on order/BOM pages |
| 3 Inventory | Inventory shortage forecast (moving average, optional sklearn) (`ai_tool/forecasting.py`, `forecast/adapters.py`; UI `/app/ai/predictions`) | Fully implemented (heuristic) | Stock-out warning | Not tied to production start dates | Link to MRP + line plan (P1) |
| 3 | Inventory variance pipeline (`analysis/pipelines/inventory_variance.py`) | Fully implemented | Shrinkage detection | Chat only | Surface in inventory analytics |
| 3 | High wastage vs BOM anomaly (`ai_tool/anomaly.py`) | Fully implemented (rule) | Fabric loss alerts | - | Retain |
| 3 | MRP explode / planned orders (`inventory/mrp_engine_service.py`) | Not AI (deterministic) | Material planning | - | Keep; do not label as AI |
| 3 | Reorder suggestions (`inventory/reorder_service.py`) | Not AI (threshold rules) | Replenishment | - | Keep; use as AI input |
| 4 Procurement | Vendor AI: extract, enrich, validate, dedupe (`inventory/vendor_ai_router.py`; UI `VendorDetailDrawer`) | Fully implemented | Clean vendor master | Supplier performance score | Add supplier scorecard (P2) |
| 4 | Chat purchase tools (`ai_tool/tools/purchase_tools.py`) | Fully implemented (read) | Find shortages, suggest vendors | No PO drafting | L3 PO draft later (P3) |
| 5 Production planning | Gemini planning: analyze pipeline, suggest allocation, predict move, optimise board, risk alerts, AI settings (`production/gemini_planning_service.py`, `planning_router.py`; UI `ProductionPlanningPage`) | Fully implemented (needs LLM key) | Planner productivity | Numeric optimiser; LLM gives text only | Add deterministic completion forecast (P1) |
| 5 | Predictive heuristics: defect risk, line balance, maintenance (`production/predictive_heuristic_service.py`) | Fully implemented (heuristic, `source=heuristic`) | Shop-floor early warnings | Not ML (by design) | Retain; label honestly |
| 5 | Production output / capacity shortfall forecast (`forecast/adapters.py`) | Fully implemented (heuristic) | Capacity warning | Line-level detail | Retain |
| 6 Cutting / sewing / finishing / packing | Sewing efficiency forecast (`production/efficiency_ai_service.py`) | Fully implemented (needs LLM) | Realistic targets | Cutting and finishing models | Replace LLM numbers with EWMA (P1) |
| 6 | Shipping document extract (`ai_extract` `/shipping-doc`; UI `LogisticsPage.tsx`) | Fully implemented | Less data entry | Auto-link to packing list | Retain |
| 6 | Cutting room AI | **Not found** | - | Marker/lay efficiency analytics | Add fabric consumption loop (P2) |
| 7 Quality | Defect-risk suggestions (`predictive_heuristic_service.py`; UI `QualityDashboardPage.tsx`) | Fully implemented (heuristic) | Focus QC effort | CAPA root-cause assist | P3 |
| 7 | NCR counts in anomaly scan (`anomaly.py`) | Partial | Signal only | - | Retain |
| 8 Export LC / contracts | LC document extract to review form (`ai_extract` `/lc`, `ai_extract/commercial_doc_analysis.py`; UI `MasterContractsPage.tsx`) | Fully implemented | Fast LC capture | LC vs shipment discrepancy check | Add discrepancy rules (P2) |
| 9 Back-to-Back LC / import | No AI feature. Only `btb_lc_count` shown in financier narrative (`ai_confidence_service.py`) | **Partial - display only** | Minimal | Import doc extraction; cash coverage of maturities | **Add BTB maturity vs cash coverage (P1)** |
| 9 | Rule alerts (not AI): `merch/alert_rules.py:rule_btb_lc_maturity_due_or_overdue` (date window, default 7 days) and `rule_master_contract_btb_utilization_risk`; report page `ReportBtbMaturityPage.tsx`; ladder `finance/exposure_service.py:build_maturity_ladder` | Fully implemented (rules) | Maturity reminders | Does not compare maturities with projected cash | Extend, do not rebuild (doc 09, blueprint 4) |
| 10 Commercial / shipping | Shipping doc extract | Fully implemented | Data entry speed | Auto-fill commercial invoice | P2 |
| 10 | Shipment delay forecast (`forecast/adapters.py`) | Fully implemented (heuristic) | Late shipment warning | No actual sail dates captured | Improve with completion forecast (P1) |
| 11 Finance | Cash-flow forecast + optional LLM narrative (`ai_tool/finance_forecast_service.py:build_finance_forecast`; UI `FinanceForecastTab`) | Fully implemented | Liquidity outlook | Based on payment runs/FX receipts, not full GL | Seed from AR/AP + BTB ladder (P1) |
| 11 | Finance read-only insights (`finance/finance_ai_readonly_service.py`) | Fully implemented (heuristic) | Voucher anomalies | Margin is a proxy | Retain |
| 11 | Receivable risk forecast, `finance_exceptions` pipeline, chat finance tools | Fully implemented (read) | AR focus | No AI voucher posting (correct) | Retain |
| 12 HR | Attendance pattern analysis (`ai_tool/ai_attendance_analysis_service.py`; UI `/app/hr/ai-insights`) | Fully implemented, feature-flagged | Absenteeism warning | - | Retain |
| 12 | Turnover risk scoring (`ai_turnover_prediction_service.py`) | Fully implemented (rule weights), flagged | Retention focus | No outcome tracking | Track accuracy (P2) |
| 12 | Payroll anomaly (`ai_payroll_anomaly_service.py`) | Fully implemented (heuristic), flagged | Catch payroll errors | - | Retain |
| 12 | Compliance risk (`ai_compliance_risk_service.py`) | Fully implemented (heuristic), flagged | Audit readiness | - | Retain |
| 12 | HR document extract (CV, NID, medical, birth) (`ai_extract` `/hr/*`; UI `/app/hr/employees/ai-onboard`) | Fully implemented | Faster onboarding | - | Retain |
| 13 Dashboards | Executive AI brief (`dashboard/ai_services.py`; UI `Dashboard.tsx` + `AiBriefRenderer.tsx`) | Fully implemented | Daily management view | Degrades without LLM | Retain; add deterministic fallback text |
| 13 | Weekly AI reports (`ai_tool/weekly_report_service.py`; UI `/app/ai/weekly-reports`) | Fully implemented | Weekly summary | Skips if no text provider (`skipped_no_gemini`) | Retain |
| 13 | Report templates (`ai_tool/reporting.py`) | Fully implemented | Ad-hoc reports | Buyer profitability is a proxy | Fix with cost-centre profitability (P2) |
| 13 | ERP AI Phases dashboard section (`erp_ai_phases/*`) | Experimental | Demo of phases | Overlaps other screens | Consolidate (P2) |
| 14 Workflow / approvals | Chat approvals read tools (`ai_tool/tools/approvals_tools.py`) | Fully implemented (read) | See pending approvals | - | Retain |
| 14 | AI Automation propose/confirm drafts (`ai_tool/automation.py`; UI `/app/ai/automation`) | Fully implemented (draft-only) | Safe reminders and notes | Blocks approve/post by design | Retain |
| 14 | Approval artifacts approve/reject/commit/rollback (`ai_tool/artifacts/`) | Fully implemented (commit goes to simulation) | Scaffold for L4 | Real commit | Unify approvals (P2) |
| 14 | Governance proposals (`erp_ai_phases/governance_service.py`; UI `AiGovernanceInbox.tsx`) | Experimental, flag `ai_controlled_automation_enabled` | Admin oversight | No execution | Merge with artifacts (P2) |
| 15 AI assistant | Chat sessions with router, tools, triage, escalation, provenance, feedback (`ai_tool/service.py`; UI `/app/ai/assistant`, `GlobalAiChatWidget.tsx`) | Fully implemented | Natural-language ERP access | Free-text questions outside tool coverage | Expand read tools (P1) |
| 15 | Knowledge query (`ai_tool/knowledge.py`, `retrieval/*`) | Fully implemented | SOP answers | Thin tenant corpus | Tenant doc upload + ingestion job (P2) |
| 15 | AI Predictions hub (`/app/ai/predictions`) | Fully implemented | Central forecasts | Shop-floor predictions live elsewhere | Retain |
| 15 | Safe copilot intents (`erp_ai_phases/copilot_service.py`) | Experimental | Fixed count queries | Duplicates chat tools | Consolidate into chat (P2) |
| 15 | Financier AI confidence narrative (`ai_confidence_service.py`; UI `FinancierAiConfidencePage`) | Fully implemented (template, no LLM) | Lender confidence | - | Retain |
| 15 | AI disclaimer page (`AiDisclaimerPage.tsx`) | Docs-only | Legal | - | Retain |
| 15 | Platform admin AI ops: usage, budgets, kill switch (`admin/ai_router.py`) | Fully implemented (admin) | Cost control | No USD cost data | Populate cost telemetry (P0) |

---

## 2. End-to-end traces (representative)

| Feature | Frontend | API | Service | Data / model |
|---|---|---|---|---|
| AI Assistant chat | `pages/app/ai/AiAssistantPage.tsx`, `components/GlobalAiChatWidget.tsx` | `POST /api/v1/ai-tool/sessions/{id}/messages` | `ai_tool/service.py:process_prompt` | Tenant-scoped tools + tier-1 LLM |
| Quotation costing AI | `components/quotations/QuotationAiPanel.tsx`, `hooks/useQuotationAi.ts` | `/api/v1/quotations/ai/costing-*` | `quotation_costing_ai_service.py` | Quotation cost lines (rules) |
| Production planning AI | `pages/app/manufacturing/ProductionPlanningPage.tsx` | `/api/v1/production/planning/ai/*` | `gemini_planning_service.py` + `pipeline_service.py` | Pipeline data + `generate_text_for_tenant` |
| LC extract | `MasterContractsPage.tsx` via `useCommercialDocExtraction("lc")` | `POST /api/v1/ai-extract/lc` | `ai_extract/service.py` + `commercial_doc_analysis.py` | Gemini multimodal; in-memory only |
| HR insights | `pages/app/hr/HrAiInsightsPage.tsx` | `/api/v1/ai-tool/hr/*` | `ai_*_service.py` | HR tables (heuristic) |
| Financier confidence | `pages/portal/financier/FinancierAiConfidencePage.tsx` | `/api/external/.../ai/confidence-narrative` | `ai_confidence_service.py` | Facility and finance aggregates |

---

## 3. Explicit non-findings

| Claim someone might make | Reality |
|---|---|
| "Prime7 has BTB / import AI" | Not found. Only a BTB count in the financier narrative |
| "Prime7 has cutting-room AI" | Not found |
| "Shop-floor predictions use ML" | No. `predictive_heuristic_service.py` is heuristic by design |
| "AI can post vouchers / GRNs" | No. MCP write tools return `[SIMULATION]` |
| "Forecasting uses Prophet" | No. Prophet is installed but never imported |
| "MRP is AI" | No. It is a deterministic engine |

---

## 4. Cross-cutting guards (verified)

- Tenant checks: `ensure_tenant_access`, service-level `tenant_id` filters, `analysis/safe_query.py:tenant_scoped_query` requires a `:tenant_id` bind.
- AI gate: `require_ai_access` (role allowlist or `ai.read` / `ai.chat`).
- Soft permission keys: finance forecast, defect/maintenance/line-balance prediction, HR AI insights, AI extraction (`PERMISSION_AI_LC_EXTRACT`, `PERMISSION_AI_HR_EXTRACT`, `PERMISSION_AI_SHIPPING_EXTRACT`).
- Feature flags: HR AI suites, `ai_controlled_automation_enabled`, `erp_ai_phases/feature_flags.py`, OCR extraction flags.
- Automation blocks approve, post and delete style actions by keyword policy in `automation.py`.

## 5. Accuracy and usefulness

No accuracy measurements exist in the repository for any AI feature. Turnover, defect and delay scores are not compared with outcomes. `AiFeedback` collects ratings but nothing reports on them. Measuring accuracy is a P1 item in [08-prioritized-development-roadmap.md](08-prioritized-development-roadmap.md). (Verified absence; runtime data not inspected.)
