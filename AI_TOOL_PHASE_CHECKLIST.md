# AI Tool Phase Checklist

## Phase 1 - Foundation + Read-Only AI Chat
- [ ] Add DB tables: `ai_sessions`, `ai_messages`, `ai_tool_invocations`, `ai_audit_logs`, `ai_saved_prompts`
- [ ] Add backend module scaffold `backend/app/modules/ai_tool/`
- [ ] Add intent classifier (rule-based)
- [ ] Add tool registry with allowlisted read-only tools
- [ ] Add policy guard for tenant + role/permission checks
- [ ] Add session/message APIs
- [ ] Add AI audit lifecycle events
- [ ] Upgrade `AiAssistantPage` UI and connect API
- [ ] Add tenant leakage and blocked-access negative tests

## Phase 2 - Natural Language ERP Search
- [ ] Add constrained query planner/entity extractor
- [ ] Add ranked search response format
- [ ] Add field-level masking rules to search outputs
- [ ] Add performance limits for broad searches

## Phase 3 - AI Report Generator
- [ ] Add `ai_report_runs` schema
- [ ] Add report template and run APIs
- [ ] Add report builder UI and run history
- [ ] Add report output trace and security review

## Phase 4 - Forecasting and Projections
- [ ] Add `ai_forecast_runs` schema
- [ ] Add forecast adapters (orders/cashflow/production)
- [ ] Add assumptions/confidence metadata
- [ ] Add forecast scenario UI

## Phase 5 - Document AI / Knowledge Retrieval
- [ ] Add retrieval adapter interfaces
- [ ] Add document indexing and citation support
- [ ] Add doc-aware response cards and source viewer
- [ ] Validate tenant/role document access controls

## Phase 6 - Controlled Workflow Automation
- [ ] Add `ai_automation_rules` schema
- [ ] Add dry-run and confirmation token workflow
- [ ] Add idempotent action executor
- [ ] Add sensitive-action approval gates

## Phase 7 - Advanced Anomaly Detection / BI
- [ ] Add anomaly scoring jobs and event storage
- [ ] Add anomaly dashboard and drill-down
- [ ] Add precision/recall quality tracking

## Phase 8 - Hardening / Observability / Optimization
- [ ] Add rate limiting and request budgets
- [ ] Add tracing dashboards and incident alerts
- [ ] Add archival/partition strategy for AI logs
- [ ] Complete security and compliance hardening pass
