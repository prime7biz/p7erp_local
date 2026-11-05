# 10 - Executive Summary

Part of the Prime7 AI strategy set. Index: [`AI_DEVELOPMENT_MASTER_PLAN.md`](../../AI_DEVELOPMENT_MASTER_PLAN.md).

**Audit date:** 2026-11-04
**Basis:** Read-only code investigation by six specialist passes (architecture, functional audit, business process, agentic design, ML and infrastructure, security and testing). No production data, secrets or live services were accessed. Items that depend on a running system are marked "Runtime-verify" in the detailed documents.

---

## The short answer

Prime7 already has a **real and fairly mature AI layer**: chat with ERP data, document extraction, planning assistance, forecasts, anomaly detection and approval scaffolding, all tenant-scoped. Most of its "intelligence" is rules and simple statistics, which is the right choice for this data. The next step is **not** more chatbots or machine learning. It is to tighten a few safety gaps, measure accuracy, and turn existing data into a small set of proactive monitors that prevent late shipments, line stoppages and liquidity problems.

---

## 1. What AI capabilities does Prime7 ERP actually have today?

| Area | What exists (verified in code) |
|---|---|
| AI assistant | Chat sessions with intent detection, read-only ERP tools, local/cloud model triage, paid escalation with user approval, source citations, feedback (`backend/app/modules/ai_tool/service.py`) |
| Document AI | LC, shipping, customer, inquiry, quotation and HR document extraction into forms, in memory only (`backend/app/modules/ai_extract/`) |
| CRM / merchandising | Inquiry, order, customer, quotation and vendor AI panels (extract, validate, dedupe, summarise, next actions); sample plan proposals; TNA delay insights |
| Costing | Quotation completeness, anomaly, margin and FX risk rules; peer cost benchmarks |
| Production | LLM planning assistant; heuristic defect, line-balance and maintenance warnings; efficiency text forecast |
| Finance | Heuristic cash forecast with optional narrative; voucher anomaly insights |
| HR | Attendance patterns, turnover risk, payroll anomalies, compliance risk (feature-flagged) |
| Management | Executive brief on dashboard; weekly AI reports |
| Search | Hybrid vector (pgvector) + keyword search over ERP notes and knowledge documents |
| Governance | Rate limits, daily quota, prompt screening, audit log, approval artifacts, automation that only creates drafts |

What it does **not** have: AI that can actually save ERP transactions (those tools are simulations), BTB/import AI, cutting-room AI, trained ML models, and any measurement of prediction accuracy.

## 2. How well are those capabilities implemented, integrated, secured and functioning?

- **Integration: good.** Features are wired end to end from screen to service to tenant data. They degrade gracefully when no model key is configured.
- **Security: good foundation, a few gaps.** Tenant checks are consistent; analysis SQL must contain the tenant filter; the model never writes SQL; AI cannot post money, stock or payroll. Gaps: rate limits are per worker process (production runs two), finance AI tools default to allowed for any AI user, a latent default of tenant 1 in one unused wrapper, and almost no tests of the guard functions themselves (doc 07).
- **Reliability: moderate.** Timeouts, retries and a circuit breaker exist. Background AI jobs are placeholders, so long work runs inside web requests.
- **Accuracy: unknown.** No feature stores its predictions alongside actual outcomes, so no accuracy can be reported.
- **Cost visibility: missing.** The cost column exists but is never filled.
- **Documentation: out of date** in places (older status docs understate what is built).

## 3. What important AI capabilities are missing?

1. **Proactive monitors that combine modules**: a single order-risk score, completion forecasts based on real output, material shortage against line start dates, and BTB maturities against available cash.
2. **Accuracy measurement** for every score and forecast.
3. **A single tool registry and approval inbox**, required before AI can safely do real work.
4. **Supplier and buyer scorecards**, style and LC profitability by cost centre.
5. **Some data capture**: structured payment terms, shipment actual dates, operator-level output. These block certain analytics until captured.

## 4. How can Prime7 become intelligent and proactive without unnecessary complexity or cost?

- **Rules and statistics for numbers; language models for words.** Forecasts, balances and costs come from code. Models explain, summarise and extract.
- **Extend what exists.** Add rules to the existing alert engine, reuse costing variance, MRP, exposure and party ledger services, and reuse the existing AI tables. Do not build a separate platform per module.
- **Cheapest adequate model.** Free or local small models for routine text; paid models only when a user approves; vision models only for documents.
- **Human approval for anything that matters.** AI prepares drafts; people post vouchers, commit LCs and change salaries. Always.
- **Measure before scaling.** Log predictions and outcomes, meter cost, and promote any machine learning only when it beats the simple rule on real data.

Target architecture: one AI gateway, one router, one permission-aware tool registry, shared engines (forecast, analysis, retrieval, extraction), one approval inbox, one alert engine, and shared telemetry (doc 04, doc 06).

## 5. What exact development tasks should be undertaken first, in what sequence, and why?

| Order | Task | Why first |
|---|---|---|
| 1 | Guardrail hardening: shared rate limits and circuit breaker in Redis, keyed by user and tenant; fail-closed finance/HR AI permissions; remove tenant defaults; refuse MCP calls without tenant context | Small, cheap, protects everything that follows |
| 2 | AI guard test pack | Locks in tenant isolation and approval rules before new features |
| 3 | Cost telemetry | Know what AI costs per tenant before usage grows |
| 4 | Honesty pass: show AI write results as previews; mark old docs superseded | Avoid users believing records were saved |
| 5 | Prediction-outcome log | Every new score is measurable from its first day |
| 6 | BTB maturity vs cash coverage alert | Highest financial risk; data already exists; extends an existing rule |
| 7 | Cost-variance alerts | Fast; reuses computed variances |
| 8 | Production completion and shipment delay forecast | Core input for order risk and shortage timing |
| 9 | Unified order-risk score and TNA heatmap; material shortage vs line start | The main proactive merchandising and production monitors |
| 10 | Daily executive briefing with number checking | Trusted daily view built from the monitors above |
| Then | Unified tool registry and approval inbox; real background AI jobs; supplier scorecard | Platform consolidation before any real AI execution |
| Later | Validated L4 actions for low-risk drafts; procurement agent; ML where data proves it helps | Only after approvals, tests and data are in place |

Indicative timing (one experienced developer, planning estimate only): wave 1 about 3-4 weeks, wave 2 about 8-10 weeks, wave 3 about 10-14 weeks.

---

## Decisions needed from the business

1. Approve or adjust the roadmap order (doc 08).
2. Confirm which roles should keep finance and HR data access through AI once those keys become explicit (blueprint 1).
3. Confirm default assumptions for the BTB cash coverage alert (default collection days, safety buffer).
4. Agree whether to capture structured payment terms and shipment actual dates (unblocks buyer DSO and shipment-to-cash forecasting).
5. Set per-plan AI usage limits once cost telemetry shows real numbers.

## Document map

| Doc | Content |
|---|---|
| [01](01-existing-ai-architecture.md) | Existing AI architecture with code references |
| [02](02-ai-functionality-audit.md) | Functionality matrix across 15 modules |
| [03](03-module-wise-ai-opportunities.md) | Opportunities by module with data availability |
| [04](04-agentic-erp-architecture.md) | Autonomy levels, tool registry, approvals |
| [05](05-ai-ml-feasibility.md) | Data readiness, method comparison, metrics |
| [06](06-infrastructure-and-cost.md) | Infrastructure reality, model routing, cost |
| [07](07-security-and-testing.md) | Security findings and test framework |
| [08](08-prioritized-development-roadmap.md) | Scored, prioritised roadmap |
| [09](09-top-10-feature-blueprints.md) | Ten implementation-ready blueprints |
