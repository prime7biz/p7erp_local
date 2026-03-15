# AI Tool Module Master Plan

## 1. Executive Overview

### What the AI Tool module is
AI Tool is an internal ERP intelligence module that adds secure, tenant-scoped AI capabilities on top of existing ERP data and workflows. It is not a public chatbot and not a direct SQL generator. It is a controlled orchestration layer that can classify user intent, invoke approved ERP tools, and return structured answers with full traceability.

### Business objective inside ERP
- Reduce decision latency by turning ERP data into actionable answers quickly.
- Improve operational visibility for merchandising, inventory, production, approvals, and finance.
- Provide consistent executive summaries and guided analysis without bypassing ERP controls.
- Create a long-term foundation for forecasting and controlled automation.

### Why it should be phased
- ERP AI touches security, permissions, and cross-module data access, so blast radius is high if done in one step.
- Read-only intelligence can deliver value early while de-risking architecture.
- Each phase can be validated against tenant isolation, RBAC, and auditability before moving to higher-risk capabilities like automation.

---

## 2. Current Codebase Integration Assessment

### Current backend architecture integration points
- API composition is centralized in `backend/app/main.py` via `app.include_router(...)`.
- Tenant and auth dependencies are already standardized:
  - `backend/app/common/auth.py` (`get_current_user`)
  - `backend/app/common/tenant.py` (`require_tenant`)
- Most routers enforce tenant safety with explicit checks (`if user.tenant_id != tenant.id: ...`), commonly implemented as `_ensure_tenant(...)`.
- Existing modules are router-first, with light service layering in most areas; AI module should keep compatibility with this style while introducing cleaner service/repository boundaries.

### Current frontend integration points
- Protected app routes are under `frontend/src/app/AppProtectedRouter.tsx`.
- Sidebar is centralized in `frontend/src/app/sidebarConfig.tsx`.
- AI navigation already exists:
  - `/app/ai/assistant`
  - `/app/ai/automation`
  - `/app/ai/predictions`
- Current AI assistant page is a placeholder:
  - `frontend/src/pages/app/ai/AiAssistantPage.tsx`
- API layer is centralized and typed in:
  - `frontend/src/api/client.ts`
  - It already injects `X-Tenant-Id` and `Authorization` headers.

### Existing auth / tenant / RBAC dependencies
- Tenant resolution: `X-Tenant-Id` header plus `require_tenant`.
- User resolution: JWT bearer token (`get_current_user`).
- RBAC pattern currently relies mostly on role-name checks (`admin`, `manager`, etc.) in routers.
- `Role.permissions` exists as JSON but is not consistently enforced as a centralized policy engine.

### Existing services/endpoints reusable for AI Phase 1
- Dashboard:
  - `/api/v1/dashboard/kpi`
  - `/api/v1/dashboard/ai-insights`
  - `/api/v1/dashboard/recent-orders`
  - `/api/v1/dashboard/tasks`
- Orders/search:
  - `/api/v1/orders` with search/status/date filters
- Inventory:
  - `/api/v1/inventory/stock-summary`
  - `/api/v1/inventory/reconciliation/overview`
- Manufacturing:
  - `/api/v1/manufacturing/execution/dashboard`
  - `/api/v1/manufacturing/tna/dashboard/summary`
- Finance:
  - `/api/v1/finance/reports/day-book`
  - `/api/v1/finance/cash-forecast/summary`
  - `/api/v1/finance/purchase-workflow/ap-overview`
- HR approvals:
  - `/api/v1/hr/payroll/approvals`

### Risks in integrating AI into current structure
- Manual tenant checks can be missed if AI tools are added quickly without guardrails.
- Role checks are duplicated and inconsistent across modules.
- Without tool-level policy and audit correlation IDs, tracing AI behavior will be difficult.
- Direct prompt-to-query logic could become unsafe if not constrained by a tool registry.
- Mixed response formats across modules can create unstable AI output contracts.

---

## 3. Design Principles

1. Tenant isolation first.
2. RBAC and policy checks at multiple layers (router + orchestration + tool).
3. Full auditability for every AI request and tool invocation.
4. Safe tool-based orchestration only (no uncontrolled prompt-to-SQL execution).
5. Read-only first, controlled automation later.
6. Modular boundaries to support future forecasting and automation without rewrites.
7. Typed contracts for API requests/responses.
8. Explainable outputs with data-source traceability.
9. Enterprise UX (trust, clarity, predictable states), not public-chat style gimmicks.
10. Extensible architecture: provider abstraction, retrieval adapters, forecast adapters.

---

## 4. Target Module Architecture

### AI UI layer
- Chat workspace with session history, quick actions, and structured response cards.
- Clear permission and data-source indicators.
- Designed for future tabs: Reports, Forecasts, Automation.

### Session / conversation layer
- Tenant-bound sessions and messages.
- Session metadata (title, last activity, model/provider).
- User-scoped retrieval of historical conversations.

### Intent classification layer
- Categorize prompt into:
  - `search_query`
  - `report_request`
  - `summary_request`
  - `forecast_request`
  - `help_request`
  - `action_request`
  - `unsupported_request`
- Include confidence score and fallback path for low-confidence intents.

### Tool registry layer
- Central list of allowed ERP tools with metadata:
  - tool id/name
  - intent compatibility
  - required permission(s)
  - tenant constraints
  - max result size/time budget
  - read/write flag
  - confirmation requirement

### Tool execution / orchestration layer
- Pipeline:
  1. validate tenant/user/session
  2. classify intent
  3. policy filter available tools
  4. execute selected tool(s) safely
  5. normalize response payload
  6. persist message + audit trace
- Handles blocked requests and partial failures gracefully.

### Knowledge / document retrieval layer
- Phase 1: design-only abstraction.
- Future:
  - connect approved internal docs (SOP, runbooks, policies)
  - tenant-aware document segmentation and access rules
  - source citations in responses

### Analytics / forecast layer
- Phase 1: stubs/interfaces only.
- Future:
  - forecast adapters by domain (orders, cashflow, production)
  - confidence/assumptions metadata
  - scenario comparisons

### Audit / observability layer
- Request-level and tool-level event logs.
- Correlation by `request_id`, `session_id`, `message_id`.
- Track blocked attempts, latency, and error reason categories.

### Action / automation layer
- Future-only in this plan (not Phase 1 execution).
- Requires:
  - policy gates
  - confirmation tokens
  - dry-run support
  - idempotency keys
  - approval workflow compatibility

### Security / policy guard layer
- Shared guard component with:
  - tenant checks
  - role/permission checks
  - tool allowlist
  - sensitive action policy
  - output redaction/masking hooks

---

## 5. Recommended Database Design

### Build now (Phase 1)
1. `ai_sessions`
   - tenant/user ownership, title/status, provider/model metadata, timestamps.
2. `ai_messages`
   - role (`user|assistant|system|tool`), content, structured content JSON, token usage, timestamps.
3. `ai_tool_invocations`
   - tool name, input/output JSON, status, error, latency, correlation fields.
4. `ai_audit_logs`
   - event stream for intent detection, tool selection, blocked attempts, and lifecycle events.
5. `ai_saved_prompts` (or `ai_quick_actions`)
   - tenant-scoped quick actions/templates for standard use-cases.

### Build later
6. `ai_report_runs` (Phase 3)
   - report templates, parameters, output refs, generation status.
7. `ai_forecast_runs` (Phase 4)
   - model config, scenario params, assumptions, output metrics.
8. `ai_automation_rules` (Phase 6)
   - trigger rules, policy constraints, required approvals, execution logs.

### Recommended key design notes
- Every table includes `tenant_id`.
- Tenant-scoped unique constraints where needed.
- Indexes on `tenant_id`, `created_at`, and key lookup columns (`session_id`, `status`, `tool_name`).
- Keep status fields as constrained strings initially for consistency with current project style.

---

## 6. Backend Module Structure (FastAPI)

Recommended path: `backend/app/modules/ai_tool/`

```
backend/app/modules/ai_tool/
  __init__.py
  router.py                 # Phase 1
  schemas.py                # Phase 1
  service.py                # Phase 1 orchestration entry
  intents.py                # Phase 1 rule-based classifier
  tool_registry.py          # Phase 1 allowlisted tools
  tools/
    __init__.py
    dashboard_tools.py      # Phase 1
    approvals_tools.py      # Phase 1
    orders_tools.py         # Phase 1
    inventory_tools.py      # Phase 1
    production_tools.py     # Phase 1
    finance_tools.py        # Phase 1 (if data available)
  repository.py             # Phase 1 DB persistence/read
  authz.py                  # Phase 1 policy checks
  audit.py                  # Phase 1 audit helpers
  llm_provider/
    __init__.py
    base.py                 # Phase 2 foundation
    stub_provider.py        # Phase 1 safe fallback
  retrieval/
    __init__.py
    base.py                 # Phase 5
  forecast/
    __init__.py
    base.py                 # Phase 4
```

Model path:
- `backend/app/models/ai_tool.py`
- export in `backend/app/models/__init__.py`

Migration path:
- `backend/alembic/versions/045_ai_tool_foundation.py` (or next available number)

### Phase mapping
- Phase 1: `router`, `schemas`, `service`, `intents`, `tool_registry`, `tools/*`, `repository`, `authz`, `audit`, base tables.
- Phase 2: `llm_provider/base.py` integration evolution.
- Phase 3+: report/forecast/retrieval/automation adapters.

---

## 7. Frontend Module Structure (React + TypeScript)

Recommended path: `frontend/src/pages/app/ai/`

```
frontend/src/pages/app/ai/
  AiAssistantPage.tsx                 # Phase 1 main workspace
  components/
    AiSessionList.tsx                 # Phase 1
    AiChatThread.tsx                  # Phase 1
    AiPromptInput.tsx                 # Phase 1
    AiQuickActions.tsx                # Phase 1
    AiResponseCard.tsx                # Phase 1
    AiStateNotice.tsx                 # Phase 1
  hooks/
    useAiSessions.ts                  # Phase 1
    useAiChat.ts                      # Phase 1
  types.ts                            # Phase 1 typed UI contracts
  utils/
    aiFormatting.ts                   # Phase 1 formatting helpers
```

API client integration:
- Extend `frontend/src/api/client.ts` with typed AI endpoints:
  - list/create sessions
  - list messages
  - submit prompt
  - list quick actions

Route/menu:
- Keep existing route and sidebar entries to avoid UX disruption.
- Upgrade `/app/ai/assistant` page from placeholder to production-safe MVP UI.

Future extensions:
- `AiReportsPage.tsx` (Phase 3)
- `AiForecastsPage.tsx` (Phase 4)
- `AiAutomationPage.tsx` expansion (Phase 6)
- Optional `AiAuditPage.tsx` for support/admin observability.

---

## 8. Phase-by-Phase Roadmap

## Phase 1: Foundation + Read-Only AI Chat

### Objective
Deliver a safe, tenant-aware AI assistant that answers from approved read-only ERP tools.

### Scope
- Session/message persistence.
- Intent classification (rule-based).
- Tool registry and orchestrator.
- Read-only tools for dashboard, approvals, orders, inventory, production, finance summary.
- UI chat with quick actions and response cards.

### Backend tasks
- Create AI module and tables.
- Add session/message APIs.
- Implement orchestrator and policy checks.
- Implement Phase 1 tool functions using existing domain queries.
- Add AI audit logging.

### Frontend tasks
- Build AI assistant page layout (session list + chat + quick actions).
- Integrate with typed API methods.
- Add loading/error/empty states.
- Show data source tags in responses.

### Database changes
- `ai_sessions`, `ai_messages`, `ai_tool_invocations`, `ai_audit_logs`, `ai_saved_prompts`.

### Security considerations
- Strict tenant checks in every AI endpoint and tool function.
- Role/permission checks before tool execution.
- Block unsupported/sensitive prompts and log them.

### Dependencies
- Existing dashboard/orders/inventory/manufacturing/finance routers/models.

### Risks
- Inconsistent role naming and permission patterns across legacy modules.
- Performance hit if tool queries are not bounded.

### Acceptance criteria
- Tenant A cannot access Tenant B AI sessions or data.
- All AI requests produce audit events.
- Quick actions return structured responses consistently.

---

## Phase 2: Natural Language ERP Search

### Objective
Improve retrieval quality for broad ERP search questions while preserving strict safety.

### Scope
- Better intent/entity extraction.
- Query planner limited to allowlisted fields/filters.
- Cross-module read search with ranking.

### Backend tasks
- Enhance classifier and parser.
- Add searchable view models and constrained query builder.
- Add response rationale metadata.
- Practical note: in current schema, "repeated late vendors" is implemented safely from `purchase_orders` (`supplier_name`, `expected_date`, `status`) as a proxy signal for vendor lateness.

### Frontend tasks
- Search-focused UX (filters, relevance indicators, expandable records).

### Database changes
- Optional search indexes/materialized views for heavy entities.

### Security considerations
- Field-level filtering/masking.
- Query complexity limits.

### Dependencies
- Stable Phase 1 contracts and telemetry.

### Risks
- Search drift and false positives.

### Acceptance criteria
- High precision on common search intents.
- No unauthorized fields returned.

---

## Phase 3: AI Report Generator

### Objective
Generate reusable executive summaries and operational reports from ERP data.

### Scope
- Report run requests, async processing, downloadable outputs.
- Saved report templates per tenant.

### Backend tasks
- Add `ai_report_runs`.
- Report rendering pipeline (JSON + optional PDF/export integration).
- Practical note: buyer-wise profitability is implemented in this phase as a transparent proxy summary (quotation value minus commission proxy), with explicit narrative disclaimer until full COGS integration.
- Practical note: pending approvals by department is derived from HR leave approvals by employee department plus payroll approval queue totals.

### Frontend tasks
- Report builder panel and run history.
- Report status and result viewer.

### Database changes
- `ai_report_runs` and related artifacts metadata.

### Security considerations
- Report output redaction and permission-aware field visibility.

### Dependencies
- Reliable tool invocation framework from Phase 1.

### Risks
- Large report performance and timeout management.

### Acceptance criteria
- Users can generate and rerun report templates safely.

---

## Phase 4: Forecasting and Projections

### Objective
Provide practical forecasts for orders, production, and cashflow with assumptions.

### Scope
- Forecast adapters and scenario inputs.
- Explainability metadata (assumptions, confidence).

### Backend tasks
- Add `ai_forecast_runs`.
- Integrate simple baseline forecasting methods first.

### Frontend tasks
- Scenario inputs and comparison view.
- Chart-ready forecast cards.

### Database changes
- `ai_forecast_runs` and scenario parameter storage.

### Security considerations
- Prevent forecasts from exposing restricted finance/HR values.

### Dependencies
- Historical data quality and Phase 3 reporting groundwork.

### Risks
- Misinterpretation of low-confidence forecasts.

### Acceptance criteria
- Forecasts include confidence and assumption disclosures.

#### Phase 4 implementation notes (2026-03-13)
- Added deterministic, adapter-based baseline forecasts (no free-form AI numeric generation).
- Implemented `ai_forecast_runs` persistence with assumptions, parameters, confidence, and narrative explanation.
- Initial forecast templates:
  - Cash Flow Projection (finance permission)
  - Inventory Shortage Forecast (inventory permission)
  - Production Output Forecast (production permission)
  - Shipment Delay Risk Projection (orders permission)
  - Receivable Risk Outlook (finance permission)
  - Capacity Shortfall Projection (production permission)
- Forecast UI now includes direct request controls (prompt + horizon/date filters), and recent forecast runs with confidence disclosure.

---

## Phase 5: Document AI / Knowledge Retrieval

### Objective
Enable policy/SOP-aware responses with traceable citations.

### Scope
- Retrieval layer for approved internal docs.
- Tenant and role-aware document access.

### Backend tasks
- Retrieval adapter interfaces.
- Document indexing and citation mapping.

### Frontend tasks
- Response citations and source viewer.

### Database changes
- Document index metadata tables (if needed).

### Security considerations
- Access controls per document class.
- PII-sensitive content masking.

### Dependencies
- Document repository and governance policy.

### Risks
- Stale or conflicting documentation sources.

### Acceptance criteria
- Responses include reliable citations and access-safe snippets.

#### Phase 5 implementation notes (2026-03-13)
- Added knowledge retrieval persistence tables:
  - `ai_knowledge_documents`
  - `ai_knowledge_chunks`
- Implemented retrieval architecture:
  - ingestion abstraction (`retrieval/ingestion.py`)
  - retrieval adapter interface + SQL keyword adapter (`retrieval/base.py`, `retrieval/adapters.py`)
  - orchestrator for knowledge querying and source attribution (`knowledge.py`)
- Added source-aware, retrieval-based responses in AI chat for help/document intents.
- Added API endpoints for document listing and direct knowledge query:
  - `GET /api/v1/ai-tool/knowledge/documents`
  - `POST /api/v1/ai-tool/knowledge/query`
- Added frontend Document Q&A panel and source citation rendering in response cards.
- Enforced tenant-safe scope and per-document permission key filtering.

---

## Phase 6: Controlled Workflow Automation

### Objective
Add confirmation-based, permission-controlled AI actions (non-autonomous by default).

### Scope
- Draft action proposals.
- Explicit user confirmation and optional approval gates.

### Backend tasks
- `ai_automation_rules`.
- Action executor with dry-run + idempotency.

### Frontend tasks
- Confirmation modals, risk labels, and audit previews.

### Database changes
- Automation rule and execution history tables.

### Security considerations
- Dual authorization for sensitive actions.
- Strict allowlist and rollback strategy.

### Dependencies
- Mature policy layer and robust auditability.

### Risks
- Incorrect action execution if policies are incomplete.

### Acceptance criteria
- No automation executes without explicit policy and confirmation.

#### Phase 6 implementation notes (2026-03-13)
- Added controlled automation persistence:
  - `ai_automation_rules`
  - `ai_action_runs`
- Implemented action framework:
  - action proposal detection (draft-safe actions only)
  - policy/rule guard with permission checks
  - explicit token confirmation before execution
  - blocked action logging for restricted/sensitive requests
- Added safe supported actions:
  - draft note/task text
  - draft reminder/follow-up proposal
  - draft message/email text
  - draft business summary text
- Added APIs:
  - `GET /api/v1/ai-tool/actions/runs`
  - `POST /api/v1/ai-tool/actions/propose`
  - `POST /api/v1/ai-tool/actions/{action_run_id}/confirm`
- Added frontend controlled automation panel with proposal preview, risk label, and explicit confirmation token step.

---

## Phase 7: Advanced Anomaly Detection / BI

### Objective
Deliver proactive business anomaly alerts and root-cause guidance.

### Scope
- Detect unusual trends in inventory, approvals, production, cashflow.
- Explain likely drivers with evidence links.

### Backend tasks
- Detection jobs and anomaly scoring.

### Frontend tasks
- Alert dashboard and anomaly drill-down cards.

### Database changes
- Anomaly event storage.

### Security considerations
- Avoid exposing cross-functional sensitive details in shared alerts.

### Dependencies
- Data quality, historical depth, and observability maturity.

### Risks
- Alert fatigue from noisy signals.

### Acceptance criteria
- Useful anomaly precision/recall for defined business events.

#### Phase 7 implementation notes (2026-03-13)
- Added anomaly event persistence table:
  - `ai_anomaly_events`
- Implemented explicit anomaly detection service (`anomaly.py`) with auditable rules:
  - delayed open order ratio
  - negative margin quotation ratio
  - low stock coverage cluster
  - process bottleneck signals (downtime/NCR/follow-up load)
  - receivable overdue ratio (permission-gated)
- Added anomaly generation/list endpoints:
  - `POST /api/v1/ai-tool/anomalies/generate`
  - `GET /api/v1/ai-tool/anomalies/events`
- Integrated anomaly insights into chat for anomaly/risk/bottleneck prompts.
- Added frontend anomaly insight panel with rule/severity cards and rerun trigger.
- Marked logic output as scheduler-ready (`scheduler_ready=true`) for future background jobs.

---

## Phase 8: Hardening, Observability, Optimization

### Objective
Enterprise stabilization for scale, reliability, and compliance.

### Scope
- Performance tuning, caching, queueing, retries, SLA metrics.
- Robust monitoring dashboards and incident playbooks.

### Backend tasks
- Rate limiting, request budgets, tracing, circuit breakers.

### Frontend tasks
- Better resilience UI and progressive loading.

### Database changes
- Partitioning/archival strategy for high-volume AI logs.

### Security considerations
- Periodic penetration testing and governance audit.

### Dependencies
- Sufficient production traffic telemetry.

### Risks
- Growing log volume and latency under peak usage.

### Acceptance criteria
- Stable performance and observability against defined SLOs.

#### Phase 8 implementation notes (2026-03-13)
- Performed end-to-end consistency review across phases 1-7 and aligned APIs/models/docs.
- Added hardening safeguards:
  - session ownership checks on direct report/forecast/action/anomaly endpoints when `session_id` is supplied
  - normalized non-empty prompt validation in service layer
  - one-time confirmation token handling (token cleared after confirmation)
  - safer chat action payload (token hint only; no raw token in chat tool result)
  - tenant-safe order existence validation before draft follow-up creation
- Improved observability:
  - request completion audit event with duration and result count
  - direct endpoint completion latency logs for report/forecast/action/anomaly operations
- UX polish:
  - severity/status color cues in automation and anomaly panels
- Maintainability:
  - explicit helper functions for prompt/session checks to centralize policy behavior

---

## 9. Recommended MVP Scope

### Include in first working release
- AI Assistant page (session list + chat + quick actions + structured response cards).
- Tenant-safe session/message storage.
- Rule-based intent classification.
- Read-only tool registry with limited domain tools.
- Full AI audit trail (`request -> intent -> tool -> response`).
- Strong error handling and blocked-attempt logs.

### Defer from MVP
- Autonomous writes/approvals.
- Free-form SQL or dynamic DB execution.
- External document ingestion and vector search.
- Heavy forecast models.
- Email/notification dispatch by AI.

---

## 10. Security Checklist

- [x] Every AI endpoint requires authenticated user and tenant context.
- [x] Every AI table includes `tenant_id` and tenant-safe query filters.
- [x] Tool execution checks both tenant and role/permission before data access.
- [x] Prompt logging enabled (with bounded excerpts).
- [x] Tool call input/output logging enabled.
- [x] Blocked access attempts logged with reason.
- [x] Sensitive actions require explicit confirmation token.
- [ ] Cross-tenant leakage tests added (API-level negative tests).
- [~] Data masking strategy defined for finance/HR sensitive fields (partial; finance gating + bounded snippets).
- [ ] Rate limiting and abuse controls configured on AI endpoints.
- [x] Model output validation and schema normalization enforced via Pydantic contracts.
- [~] Timeouts and max-result limits applied per tool (partial; limits in most list/search paths).

---

## 11. Improvement Recommendations (Expert Review)

### What is missing in the initial idea
- A formal tool policy contract (required permissions, safety level, limits).
- Correlation IDs for complete traceability.
- Clear fallback behavior for unsupported/low-confidence intents.
- Data masking and output validation policy.

### Architecture improvements
- Add `ToolContext` and `ToolDefinition` abstractions now to avoid future refactor.
- Keep orchestration independent of LLM provider using a provider adapter interface.
- Add repository layer for AI tables to reduce router bloat and improve testability.

### Security improvements
- Enforce defense-in-depth checks in service/tool layers, not only controller layer.
- Add explicit blocked-attempt event types in `ai_audit_logs`.
- Define max query windows and row limits for each tool.

### UX improvements
- Show source module badges and confidence/rationale snippets.
- Provide prebuilt quick actions for common workflows.
- Keep response cards structured and skimmable for business users.

### Reporting/forecast readiness improvements
- Introduce `report_run` and `forecast_run` contracts early (interfaces + schema placeholders).
- Store assumptions and confidence fields from day one for future analytics trust.

### Maintainability improvements
- Avoid copying domain logic into AI module; call shared query/service functions where practical.
- Keep Phase tags in module docstrings/comments to guide gradual expansion.
- Add test harness for tool policy + tenant leakage checks early.

---

## Architect Review Adjustments

This section captures a critical architecture review after phases 1-8 implementation. These adjustments are practical and should be treated as the baseline before any "next phase" expansion.

### 1) Weaknesses in the current plan

- The roadmap is strong functionally but still light on **operational guardrails** (rate limits, circuit breaking, queue isolation) as mandatory gates.
- Security checklist tracks controls, but lacks a **must-pass security verification matrix** (negative tests, abuse tests, role-escape checks).
- Forecast/report quality expectations are broad, but do not yet require **backtesting and quality score thresholds** before business reliance.
- There is no explicit **data contract governance** section (metric definitions, semantic ownership, versioning) for long-term BI trust.
- Extension strategy mentions adapters, but not enough detail on **stable interfaces** for policies, query plans, and explanation payloads.

### 2) Scalability improvements (practical now)

- Add a "production-readiness gate" requiring:
  - API rate limiting for AI routes
  - query budgets/timeouts per tool
  - queue separation for heavy jobs (reports/forecasts/anomaly generation)
- Add caching guidance:
  - short-lived cache for repeated summary reads
  - cache key includes tenant + permission scope + filter hash
- Add retention and partition policy:
  - archive older `ai_audit_logs`, `ai_tool_invocations`, and `ai_anomaly_events`
  - define retention windows by table class
- Add async job standard for heavy operations:
  - run record tables as source of truth
  - job status transitions + retry with idempotency key

### 3) Security improvements (practical now)

- Make confirmation tokens **hash-at-rest** (store token hash, never plaintext token).
- Add policy decision logging standard:
  - capture allow/deny reason code and evaluated rule id
- Add data egress policy:
  - field-level masking map by domain (finance/hr/highly sensitive)
  - max snippet/output lengths by route and tool
- Add "blocked by design" matrix for prohibited operations (silent approval, posting, destructive writes).
- Add mandatory negative test set:
  - cross-tenant ID probing
  - role downgrade/insufficient permission scenarios
  - stale/invalid confirmation tokens

### 4) UX improvements (practical now)

- Standardize response cards with:
  - confidence/reliability badge
  - data freshness timestamp
  - source module + rule code badge (where applicable)
- Add explicit distinction banner for result types:
  - transactional data vs knowledge retrieval vs forecast vs anomaly
- Add progressive disclosure:
  - short answer first
  - "why/how calculated" expandable details
- Add operator affordances:
  - copyable trace/request id
  - clear retry/resubmit actions for failed runs

### 5) Forecasting/reporting quality improvements

- Define minimum quality contract:
  - required assumptions
  - confidence score method
  - limitations section
- Add report/forecast metric dictionary and ownership:
  - each KPI/field has semantic definition and source tables
- Add forecast backtesting:
  - periodic actual-vs-forecast error tracking (MAE/MAPE-style)
  - confidence calibration checks
- Add report reproducibility:
  - persist exact input parameters + logic version + generation timestamp

### 6) Abstractions to add now (avoid heavy refactor later)

- **ToolContext**: tenant/user/role/request/session metadata passed to all tools.
- **PolicyDecision**: normalized allow/deny object (`allowed`, `reason_code`, `rule_id`, `obligations`).
- **QuerySpec**: constrained, typed query plan object instead of ad-hoc prompt parsing in each tool.
- **ExplanationContract**: shared schema for `summary`, `evidence`, `assumptions`, `limitations`, `confidence`.
- **RunLifecycle interface** for report/forecast/anomaly/action flows:
  - `create_run -> execute -> complete/fail -> audit`
- **Domain Adapter Boundary**:
  - AI module calls domain service/query adapters, not direct repeated SQL patterns everywhere.

### Adjustment acceptance gates (before next major phase)

- [ ] Rate limiting + timeout budgets active on AI endpoints.
- [ ] Confirmation token hashing implemented.
- [ ] Cross-tenant/RBAC negative tests passing.
- [ ] Explanation contract standardized across report/forecast/anomaly responses.
- [ ] Backtesting baseline for forecast quality established.
- [ ] Log retention/archival policy applied to high-volume AI tables.

---

## 12. Execution Order (Recommended)

1. **Architecture guardrails first**
   - finalize tool policy contract and intent categories.
2. **Database foundation**
   - add AI core tables and indexes with migration.
3. **Backend skeleton**
   - router + schemas + repository + service + audit components.
4. **Safe tools (read-only)**
   - implement and test bounded domain tools.
5. **Frontend assistant MVP**
   - session list/chat/quick actions/structured cards wired to API.
6. **Security hardening pass**
   - tenant/RBAC negative tests, blocked-attempt logging checks.
7. **Performance and observability pass**
   - latency metrics, rate limits, query limits.
8. **MVP release**
   - controlled rollout with tenant-level enable flag (recommended).
9. **Phase 2 planning checkpoint**
   - use production telemetry to scope natural-language search improvements.

---

## Suggested immediate next implementation slice

Safest high-value Phase 1 slice:
- Build AI sessions/messages + orchestration with **only 4-6 approved read-only tools**.
- Add full audit logs from day one.
- Keep AI assistant responses structured and source-linked.
- Defer all write actions and advanced forecasting until policy and observability mature.
