# P7 ERP Backend API Surface Review Report

**Generated:** 2026-07-19 17:01
**Total Router Files:** 98
**Backend Modules:** 47
**Frontend Page Entries:** 108

## Summary Table

| Module | Router Files | Prefixes | Total Endpoints | Frontend Pages? | Maturity |
|--------|-------------|----------|-----------------|-----------------|----------|
| admin | 12 | /ai, /auth, /backup, /billing, /dashboard, /monitoring, /security, /settings, /support, /tenants, /tenants/{tenant_id}/users | 111 | Partial | High |
| ai_extract | 1 | /ai-extract | 2 | Partial | Low |
| ai_tool | 1 | /ai-tool | 40 | Partial | Medium |
| announcements | 1 | /announcements | 1 | No | Low |
| audit | 1 | /audit | 1 | Partial | Low |
| auth | 1 | /auth | 7 | No | Low |
| billing_lemonsqueezy | 1 | /billing/lemonsqueezy | 2 | No | Low |
| commercial | 1 | /commercial | 25 | Yes | Medium |
| compliance | 1 | /compliance | 7 | No | Low |
| control_tower | 1 | /control-tower | 4 | Partial | Low |
| costing | 1 | /costing | 4 | Partial | Low |
| currency | 1 | /currency | 6 | Partial | Low |
| customers | 2 | /customers | 23 | Yes | Medium |
| dashboard | 1 | /dashboard | 14 | Partial | Low |
| data_migration | 1 | /data-migration | 3 | No | Low |
| erp_ai_phases | 1 | /erp-ai | 7 | Partial | Low |
| facility | 1 | /facility | 26 | Partial | Medium |
| files | 1 | /files | 1 | No | Low |
| finance | 1 | /finance | 130 | Yes | High |
| hr | 1 | /hr | 26 | Yes | Medium |
| hr_attendance | 1 | /hr/attendance | 24 | Partial | Medium |
| hr_ess | 1 | /hr/ess | 9 | Partial | Low |
| hr_leave | 1 | /hr/leave | 17 | Partial | Medium |
| hr_payroll | 1 | /hr/payroll | 29 | Partial | Medium |
| hr_performance | 1 | /hr/performance | 13 | Partial | Low |
| hr_recruitment | 1 | /hr/recruitment | 16 | Partial | Medium |
| hr_reports | 1 | /hr/reports | 4 | Partial | Low |
| inquiries | 2 | /inquiries | 20 | Yes | Medium |
| inventory | 2 | /inventory | 133 | Yes | High |
| logistics | 1 | /logistics | 4 | Yes | Low |
| manufacturing | 8 | /manufacturing/costing, /manufacturing/execution, /manufacturing/master, /manufacturing/planning, /manufacturing/quality, /manufacturing/samples, /manufacturing/tna | 63 | Yes | High |
| merch | 15 | /merch, /merch/order-boms | 149 | Yes | High |
| orders | 3 | /orders | 50 | Yes | High |
| parties | 1 | /parties | 9 | Yes | Low |
| production | 16 | /production, /production/costs, /production/cutting, /production/departments, /production/dyeing, /production/hourly, /production/ie, /production/knitting, /production/quality, /production/skills | 116 | Yes | High |
| quotations | 2 | /quotations | 38 | Yes | Medium |
| reports | 1 | /reports | 5 | Yes | Low |
| roles | 1 | /roles | 1 | No | Low |
| settings | 1 | /settings | 20 | Partial | Medium |
| staff_invite | 1 | N/A | 3 | No | Low |
| support | 1 | /support | 4 | Yes | Low |
| tenant | 1 | /tenants | 2 | No | Low |
| tna_unified | 1 | /tna-unified | 3 | Partial | Low |
| trade_case | 1 | /trade-cases | 15 | Partial | Medium |
| users | 1 | /users | 2 | No | Low |
| master_data_ai | 0 | N/A | 0 | No | No Router |
| mcp_server | 0 | N/A | 0 | No | No Router |

## Detailed Endpoint List by Module

### admin

**File:** `admin\ai_router.py`  
**Prefix:** `/ai`  
**Endpoints:** 27

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/usage` | `ai_usage_summary` | - |
| GET | `/usage/{tid}` | `ai_usage_tenant` | - |
| GET | `/usage/export` | `export_usage_csv` | - |
| GET | `/budgets` | `list_budgets` | - |
| PUT | `/budgets/{tenant_id}` | `put_budget` | - |
| POST | `/budgets/{tenant_id}/reset` | `reset_budget` | - |
| POST | `/kill-switch` | `kill_switch` | - |
| GET | `/costs` | `costs_report` | - |
| GET | `/usage-by-tenant` | `ai_usage_by_tenant` | Aggregate AI audit activity: requests, tokens, tool calls (from audit JSON). |
| GET | `/cost-by-tenant` | `ai_cost_by_tenant` | - |
| GET | `/top-modules` | `ai_top_modules` | - |
| GET | `/tool-history` | `ai_tool_history` | - |
| GET | `/blocked-requests` | `ai_blocked_requests` | - |
| GET | `/approval-queue` | `ai_approval_queue` | - |
| GET | `/task-stats` | `ai_task_stats` | - |
| GET | `/forecast-history` | `ai_forecast_history` | - |
| GET | `/vector-health` | `ai_vector_health` | - |
| GET | `/feedback` | `admin_ai_feedback_list` | - |
| POST | `/feedback/{feedback_id}/review` | `admin_ai_feedback_review` | - |
| GET | `/permission-policies` | `admin_list_ai_permission_policies` | - |
| POST | `/permission-policies` | `admin_create_ai_permission_policy` | - |
| DELETE | `/permission-policies/{policy_id}` | `admin_delete_ai_permission_policy` | - |
| GET | `/task-policies` | `admin_list_ai_task_policies` | - |
| POST | `/task-policies` | `admin_create_ai_task_policy` | - |
| DELETE | `/task-policies/{policy_id}` | `admin_delete_ai_task_policy` | - |
| GET | `/ingestion-jobs` | `admin_list_ai_ingestion_jobs` | - |
| POST | `/ingestion-jobs/trigger` | `admin_trigger_ai_ingestion_job` | Run a checksum-aware full reindex for one source type; records AiIngestionJob. |

**File:** `admin\auth_router.py`  
**Prefix:** `/auth`  
**Endpoints:** 3

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/login` | `admin_login` | - |
| GET | `/me` | `admin_me` | - |
| POST | `/change-password` | `admin_change_password` | - |

**File:** `admin\backup_router.py`  
**Prefix:** `/backup`  
**Endpoints:** 9

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/full` | `trigger_full_backup` | - |
| POST | `/tenant/{tenant_id}` | `trigger_tenant_backup` | - |
| GET | `/jobs` | `list_jobs` | - |
| GET | `/jobs/{job_id}/download` | `download_job` | - |
| POST | `/jobs/{job_id}/restore` | `restore_job` | Restore requires matching confirmation token (set in env in production). |
| GET | `/schedules` | `list_schedules` | - |
| POST | `/schedules` | `create_schedule` | - |
| PATCH | `/schedules/{sid}` | `patch_schedule` | - |
| DELETE | `/schedules/{sid}` | `delete_schedule` | - |

**File:** `admin\billing_router.py`  
**Prefix:** `/billing`  
**Endpoints:** 15

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/plans` | `list_plans` | - |
| POST | `/plans` | `create_plan` | - |
| PATCH | `/plans/{pid}` | `patch_plan` | - |
| GET | `/subscriptions` | `list_subscriptions` | - |
| PUT | `/tenants/{tid}/subscription` | `put_subscription` | - |
| POST | `/tenants/{tid}/subscription/cancel` | `cancel_sub` | - |
| GET | `/invoices` | `list_invoices` | - |
| POST | `/invoices` | `create_invoice` | - |
| PATCH | `/invoices/{iid}` | `patch_invoice` | - |
| POST | `/invoices/{iid}/send` | `send_invoice` | - |
| POST | `/invoices/{iid}/mark-paid` | `mark_paid` | - |
| POST | `/invoices/{iid}/void` | `void_invoice` | - |
| GET | `/payments` | `list_payments` | - |
| GET | `/revenue` | `revenue` | - |
| GET | `/revenue/export` | `revenue_export` | - |

**File:** `admin\dashboard_router.py`  
**Prefix:** `/dashboard`  
**Endpoints:** 3

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/summary` | `dashboard_summary` | - |
| POST | `/ai-analyze` | `ai_analyze_server` | On-demand Gemini analysis of current server snapshot (global budget). |
| GET | `/maintenance-tasks` | `maintenance_tasks` | Describe scheduled platform jobs (implemented in `app.modules.admin.tasks`). Not triggered from this |

**File:** `admin\monitoring_router.py`  
**Prefix:** `/monitoring`  
**Endpoints:** 8

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/audit` | `cross_tenant_audit` | - |
| GET | `/audit/export` | `export_audit_csv` | - |
| GET | `/usage` | `usage_daily_list` | - |
| GET | `/usage/{tid}` | `usage_tenant` | - |
| GET | `/system/health` | `system_health` | - |
| GET | `/system/resources` | `system_resources` | Host CPU / memory (process-local) and SQLAlchemy pool stats. |
| GET | `/system/db-stats` | `db_stats` | SELECT relname AS table_name,                    pg_total_relation_size(quote_ident(relname)::regcla |
| GET | `/system/slow-queries` | `slow_queries` | Top statements by mean time from pg_stat_statements (requires extension + shared_preload_libraries). |

**File:** `admin\router.py`  
**Prefix:** `N/A`  
**Endpoints:** 0

*No endpoints found (possibly a sub-router or imports only).*

**File:** `admin\security_router.py`  
**Prefix:** `/security`  
**Endpoints:** 10

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/admins` | `list_admins` | - |
| POST | `/admins` | `create_admin` | - |
| PATCH | `/admins/{aid}` | `patch_admin` | - |
| DELETE | `/admins/{aid}` | `deactivate_admin_user` | - |
| GET | `/rate-limits` | `list_rate_limits` | - |
| PUT | `/rate-limits/{tenant_id}` | `put_rate_limit` | - |
| GET | `/audit` | `platform_audit_log` | - |
| GET | `/impersonation-sessions` | `list_impersonation_sessions` | - |
| GET | `/sessions` | `list_admin_sessions` | - |
| POST | `/sessions/{sid}/revoke` | `revoke_admin_session` | - |

**File:** `admin\settings_router.py`  
**Prefix:** `/settings`  
**Endpoints:** 2

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `` | `get_settings` | - |
| PUT | `` | `put_platform_settings` | - |

**File:** `admin\support_router.py`  
**Prefix:** `/support`  
**Endpoints:** 16

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/tenants/{tid}/config` | `tenant_config` | - |
| GET | `/tenants/{tid}/data-summary` | `data_summary` | - |
| GET | `/tenants/{tid}/errors` | `tenant_errors` | - |
| GET | `/tenants/{tid}/notes` | `list_notes` | - |
| POST | `/tenants/{tid}/notes` | `add_note` | - |
| PATCH | `/notes/{nid}` | `patch_note` | - |
| DELETE | `/notes/{nid}` | `delete_note` | - |
| GET | `/announcements` | `list_announcements` | - |
| POST | `/announcements` | `create_announcement` | - |
| PATCH | `/announcements/{aid}` | `patch_announcement` | - |
| DELETE | `/announcements/{aid}` | `delete_announcement` | - |
| GET | `/tickets` | `list_support_tickets` | - |
| GET | `/tickets/{tid}` | `get_support_ticket` | - |
| POST | `/tickets` | `create_support_ticket` | - |
| PATCH | `/tickets/{tid}` | `patch_support_ticket` | - |
| POST | `/tickets/{tid}/messages` | `add_ticket_message` | - |

**File:** `admin\tenant_router.py`  
**Prefix:** `/tenants`  
**Endpoints:** 12

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `` | `list_tenants` | - |
| GET | `/{tenant_id}` | `get_tenant` | - |
| POST | `` | `create_tenant_admin` | Create tenant (admin-initiated). Same default roles as public tenant create. |
| POST | `/bulk` | `bulk_create_tenants` | Platform batch tenant onboarding: create many factories with optional plan assignment. |
| GET | `/bulk-status/{job_id}` | `bulk_create_job_status` | - |
| PATCH | `/{tenant_id}` | `patch_tenant` | - |
| POST | `/{tenant_id}/suspend` | `suspend_tenant` | - |
| POST | `/{tenant_id}/reactivate` | `reactivate_tenant` | - |
| DELETE | `/{tenant_id}` | `soft_delete_tenant` | - |
| GET | `/{tenant_id}/health` | `tenant_health` | - |
| GET | `/{tenant_id}/stats` | `tenant_stats` | - |
| GET | `/{tenant_id}/entitlements` | `tenant_entitlements` | Effective limits: subscription plan merged with tenant feature_flags (for UI; enforcement stays in a |

**File:** `admin\user_router.py`  
**Prefix:** `/tenants/{tenant_id}/users`  
**Endpoints:** 6

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `` | `list_users` | - |
| GET | `/{user_id}` | `get_user` | - |
| POST | `/{user_id}/reset-password` | `reset_password` | - |
| POST | `/{user_id}/deactivate` | `deactivate_user` | - |
| POST | `/{user_id}/activate` | `activate_user` | - |
| POST | `/{user_id}/impersonate` | `impersonate` | Issue a short-lived tenant JWT for support. Logged in impersonation_sessions. |

### ai_extract

**File:** `ai_extract\router.py`  
**Prefix:** `/ai-extract`  
**Endpoints:** 2

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/customer-form` | `extract_customer` | - |
| POST | `/inquiry-form` | `extract_inquiry` | - |

### ai_tool

**File:** `ai_tool\router.py`  
**Prefix:** `/ai-tool`  
**Endpoints:** 40

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/weekly-reports/status` | `weekly_reports_status` | - |
| GET | `/quick-actions` | `list_quick_actions` | - |
| POST | `/sessions` | `create_session` | - |
| GET | `/sessions` | `list_sessions` | - |
| GET | `/sessions/{session_id}/messages` | `list_messages` | - |
| POST | `/sessions/{session_id}/messages` | `send_message` | - |
| POST | `/sessions/{session_id}/approve-escalation` | `approve_escalation` | - |
| GET | `/report-runs` | `list_report_runs` | - |
| POST | `/report-runs/generate` | `generate_report` | - |
| GET | `/forecast-runs` | `list_forecast_runs` | - |
| GET | `/forecast-runs/summary` | `get_forecast_runs_summary` | - |
| GET | `/forecast-templates` | `list_forecast_templates` | - |
| GET | `/forecast-runs/{run_id}` | `get_forecast_run` | - |
| POST | `/forecast-runs/generate` | `generate_forecast` | - |
| DELETE | `/forecast-runs/{run_id}` | `delete_forecast_run` | - |
| POST | `/tasks` | `create_ai_system_task` | - |
| GET | `/tasks` | `list_ai_system_tasks` | - |
| GET | `/tasks/{task_id}` | `get_ai_system_task` | - |
| POST | `/tasks/{task_id}/approve` | `approve_ai_system_task` | - |
| POST | `/tasks/{task_id}/cancel` | `cancel_ai_system_task` | - |
| GET | `/knowledge/documents` | `list_knowledge_documents` | - |
| POST | `/knowledge/query` | `query_knowledge` | - |
| GET | `/actions/runs` | `list_action_runs` | - |
| POST | `/actions/propose` | `propose_action` | - |
| POST | `/actions/{action_run_id}/confirm` | `confirm_action` | - |
| GET | `/anomalies/events` | `list_anomaly_events` | - |
| POST | `/anomalies/generate` | `generate_anomaly_insights` | - |
| GET | `/weekly-reports` | `weekly_reports_list` | - |
| GET | `/weekly-reports/{report_id}` | `weekly_report_get` | - |
| POST | `/weekly-reports/generate` | `weekly_report_generate` | - |
| POST | `/data-quality-scan` | `data_quality_scan` | Scan for common data issues + optional Gemini narrative. |
| GET | `/automation/rules` | `list_automation_rules` | List tenant AI automation rules (ensures default templates exist). |
| GET | `/ops/overview` | `ops_overview` | - |
| POST | `/feedback` | `submit_ai_feedback` | - |
| GET | `/artifacts` | `list_ai_artifacts` | - |
| GET | `/artifacts/{artifact_id}` | `get_ai_artifact` | - |
| POST | `/artifacts/{artifact_id}/approve` | `approve_ai_artifact` | - |
| POST | `/artifacts/{artifact_id}/reject` | `reject_ai_artifact` | - |
| POST | `/artifacts/{artifact_id}/commit` | `commit_ai_artifact` | - |
| POST | `/artifacts/{artifact_id}/rollback` | `rollback_ai_artifact` | - |

### announcements

**File:** `announcements\router.py`  
**Prefix:** `/announcements`  
**Endpoints:** 1

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/active` | `active_announcements` | - |

### audit

**File:** `audit\router.py`  
**Prefix:** `/audit`  
**Endpoints:** 1

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `` | `list_audit_logs` | List audit logs for the current tenant. Requires auth. |

### auth

**File:** `auth\router.py`  
**Prefix:** `/auth`  
**Endpoints:** 7

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/resolve-tenant` | `resolve_tenant_public` | Public: validate company code and return non-sensitive tenant info for the unified login UI. |
| POST | `/login` | `login` | Login: company_code (or companyCode) + username + password. Accepts raw JSON; no Pydantic body to av |
| POST | `/accept-staff-invite` | `accept_staff_invite_public` | Public: accept staff invitation and return internal JWT (same as login). |
| POST | `/register` | `register` | Register a new user under a tenant with admin-controlled access by default. |
| POST | `/forgot-password` | `forgot_password` | - |
| POST | `/reset-password` | `reset_password` | - |
| GET | `/me` | `me` | Return current user and tenant (name, tenant_type). Call with Bearer token and X-Tenant-Id. |

### billing_lemonsqueezy

**File:** `billing_lemonsqueezy\router.py`  
**Prefix:** `/billing/lemonsqueezy`  
**Endpoints:** 2

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/checkout` | `create_lemon_squeezy_checkout` | Create a hosted checkout URL; `custom_data` is filled with tenant_id and user_id for webhooks. |
| POST | `/webhooks/lemonsqueezy` | `lemon_squeezy_webhook` | Verify HMAC, persist idempotency row, upsert subscription for order/subscription events. |

### commercial

**File:** `commercial\router.py`  
**Prefix:** `/commercial`  
**Endpoints:** 25

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/export-cases` | `list_export_cases` | - |
| GET | `/export-cases/{case_id}` | `get_export_case` | - |
| POST | `/export-cases` | `create_export_case` | - |
| PATCH | `/export-cases/{case_id}` | `update_export_case` | - |
| GET | `/master-contracts` | `list_master_contracts` | - |
| GET | `/master-contracts/{contract_id}` | `get_master_contract` | - |
| POST | `/master-contracts` | `create_master_contract` | - |
| PATCH | `/master-contracts/{contract_id}` | `update_master_contract` | - |
| GET | `/proforma-invoices` | `list_proforma_invoices` | - |
| GET | `/proforma-invoices/issued-export-order-ids` | `list_issued_export_proforma_order_ids` | Order IDs already linked to an ISSUED EXPORT (customer) proforma — exclude from new PIs. |
| GET | `/proforma-invoices/{invoice_id}` | `get_proforma_invoice` | - |
| POST | `/proforma-invoices` | `create_proforma_invoice` | - |
| PATCH | `/proforma-invoices/{invoice_id}` | `update_proforma_invoice` | - |
| GET | `/proforma-invoices/{invoice_id}/for-print` | `get_proforma_invoice_for_print` | - |
| DELETE | `/proforma-invoices/{invoice_id}` | `delete_proforma_invoice` | Delete a proforma invoice. Only DRAFT can be deleted. |
| POST | `/proforma-invoices/{invoice_id}/finalize` | `finalize_proforma_invoice` | - |
| GET | `/verify` | `verify_proforma_invoice` | Public endpoint (no auth): verify a proforma invoice by verification token. |
| GET | `/btb-lcs` | `list_btb_lcs` | - |
| GET | `/btb-lcs/{lc_id}` | `get_btb_lc` | - |
| POST | `/btb-lcs` | `create_btb_lc` | - |
| PATCH | `/btb-lcs/{lc_id}` | `update_btb_lc` | - |
| GET | `/btb-lcs/{lc_id}/accounting` | `get_btb_lc_accounting` | - |
| POST | `/btb-lcs/{lc_id}/record-opening` | `record_btb_lc_opening` | - |
| POST | `/btb-lcs/{lc_id}/record-documents-acceptance` | `record_btb_lc_documents_acceptance` | - |
| POST | `/btb-lcs/{lc_id}/record-realization` | `record_btb_lc_realization` | - |

### compliance

**File:** `compliance\router.py`  
**Prefix:** `/compliance`  
**Endpoints:** 7

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/tax-config` | `list_tax_config` | - |
| POST | `/tax-config` | `upsert_tax_config` | - |
| POST | `/tax/calculate-line` | `calculate_line_tax` | - |
| GET | `/bonded-warehouse` | `list_bonded_entries` | - |
| POST | `/bonded-warehouse` | `create_bonded_entry` | - |
| POST | `/payroll/statutory-calculate` | `payroll_statutory_calculate` | - |
| GET | `/reports/vat-summary` | `vat_summary_report` | Advisory VAT summary placeholder — extend with posted bill lines in future. |

### control_tower

**File:** `control_tower\router.py`  
**Prefix:** `/control-tower`  
**Endpoints:** 4

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/summary` | `control_tower_summary` | - |
| GET | `/order/{order_id}/timeline` | `control_tower_order_timeline` | - |
| GET | `/master-lc/{master_contract_id}/snapshot` | `control_tower_master_lc_snapshot` | - |
| GET | `/capacity-heatmap` | `control_tower_capacity_heatmap` | - |

### costing

**File:** `costing\router.py`  
**Prefix:** `/costing`  
**Endpoints:** 4

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/item-categories` | `list_item_categories` | List item categories for the current tenant (for material costing). |
| GET | `/item-units` | `list_item_units` | List item units for the current tenant (Yard, Kg, Pcs, etc.). |
| GET | `/items` | `list_items` | - |
| GET | `/currencies` | `list_currencies` | List currencies (global master, used for quotation target/quoted price). |

### currency

**File:** `currency\router.py`  
**Prefix:** `/currency`  
**Endpoints:** 6

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/exchange-rates` | `list_exchange_rates` | List all exchange rates for the current tenant (newest first per pair). |
| GET | `/exchange-rates/{from_code}/{to_code}` | `get_exchange_rate_pair` | Get the latest active exchange rate for a currency pair. |
| POST | `/exchange-rates` | `create_exchange_rate` | Create a new exchange rate. Same pair+date can be updated by creating again (upsert not enforced). |
| PUT | `/exchange-rates/{rate_id}` | `update_exchange_rate` | Update an exchange rate by ID. |
| DELETE | `/exchange-rates/{rate_id}` | `delete_exchange_rate` | Delete an exchange rate by ID. |
| GET | `/live-rates` | `get_live_rates` | Fetch live rates from open.er-api.com (no key). On failure return fallback rates (PrimeX parity). |

### customers

**File:** `customers\customer_ai_router.py`  
**Prefix:** `N/A`  
**Endpoints:** 13

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/extract` | `customer_ai_extract` | - |
| POST | `/enrich` | `customer_ai_enrich` | - |
| POST | `/validate` | `customer_ai_validate` | - |
| POST | `/dedupe` | `customer_ai_dedupe` | - |
| POST | `/summary` | `customer_ai_summary` | - |
| POST | `/next-actions` | `customer_ai_next_actions` | - |
| GET | `/nl-search` | `customer_ai_nl_search` | - |
| GET | `/audit-log` | `customer_ai_audit_log` | - |
| POST | `/suggestion-batch/mark-decisions` | `customer_ai_suggestion_mark_decisions` | - |
| POST | `/suggestion-batch/apply-suggestions` | `customer_ai_suggestion_apply` | - |
| POST | `/suggestion-batch/discard` | `customer_ai_suggestion_discard` | - |
| POST | `/suggestion-batch/link-customer` | `customer_ai_suggestion_link` | - |
| POST | `/suggestion-batch/finalize-after-create` | `customer_ai_suggestion_finalize_create` | - |

**File:** `customers\router.py`  
**Prefix:** `/customers`  
**Endpoints:** 10

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/facets` | `customer_facets` | - |
| GET | `` | `list_customers` | List customers for the current tenant (capped). Prefer GET /customers/paginated for UI lists. |
| GET | `/paginated` | `list_customers_paginated` | - |
| POST | `/upload-logo` | `upload_customer_logo` | - |
| GET | `/{customer_id}/related` | `customer_related` | - |
| GET | `/{customer_id}/health` | `customer_health` | - |
| GET | `/{customer_id}` | `get_customer` | Get a customer by ID. |
| POST | `` | `create_customer` | Create a new customer. |
| PATCH | `/{customer_id}` | `update_customer` | Update a customer. |
| DELETE | `/{customer_id}` | `delete_customer` | Delete a customer. |

### dashboard

**File:** `dashboard\router.py`  
**Prefix:** `/dashboard`  
**Endpoints:** 14

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/kpi` | `get_kpis` | Return high-level KPI cards for the main dashboard (honest counts). |
| GET | `/attention-summary` | `attention_summary` | Needs-attention strip: approvals, TNA, alerts, promise/commercial risks. |
| GET | `/order-status-breakdown` | `order_status_breakdown` | Counts of orders by status for charts and summary cards. |
| GET | `/customer-map` | `customer_map` | Simple customer count per country for the global map section. |
| GET | `/ai-insights` | `ai_insights` | Rule-based 'AI' insights for now; can be backed by a real AI service later. |
| GET | `/ai-brief` | `ai_brief` | Executive KPI snapshot + Gemini narrative brief. |
| GET | `/ai-profitability` | `ai_profitability` | Quotation/trade margin signals + Gemini narrative. |
| GET | `/production-trends` | `production_trends` | Orders created by month (honest label; legacy output/target keys kept). |
| GET | `/recent-orders` | `recent_orders` | Latest orders with customer names. |
| GET | `/tasks` | `dashboard_tasks` | Task list sourced from open order follow-ups. |
| GET | `/employee-summary` | `employee_summary` | HR employee counts for dashboard widget. |
| GET | `/payroll-summary` | `payroll_summary` | Placeholder parity endpoint for dashboard widget (Payroll module pending). |
| GET | `/revenue-trend` | `revenue_trend` | Quoted amounts by month (quotations — not posted GL revenue). |
| GET | `/ai/executive-brief` | `dashboard_executive_ai_brief` | Phase 18: read-only executive snapshot (risk signals + heuristic opportunities). |

### data_migration

**File:** `data_migration\router.py`  
**Prefix:** `/data-migration`  
**Endpoints:** 3

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/templates` | `list_import_templates` | - |
| POST | `/import` | `import_csv` | - |
| GET | `/import-status/{job_id}` | `import_job_status` | - |

### erp_ai_phases

**File:** `erp_ai_phases\router.py`  
**Prefix:** `/erp-ai`  
**Endpoints:** 7

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/document/validate` | `document_validate` | - |
| POST | `/copilot/safe-query` | `copilot_safe_query` | - |
| POST | `/governance/proposals` | `governance_propose` | - |
| POST | `/governance/proposals/{proposal_id}/approve` | `governance_approve` | - |
| POST | `/governance/proposals/{proposal_id}/reject` | `governance_reject` | - |
| POST | `/governance/proposals/{proposal_id}/rollback` | `governance_rollback` | - |
| GET | `/governance/proposals` | `governance_list` | List controlled automation proposals for the tenant. Read for any authenticated user when the phase  |

### facility

**File:** `facility\router.py`  
**Prefix:** `/facility`  
**Endpoints:** 26

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/financier-principals` | `list_financier_principals` | - |
| GET | `/facilities` | `list_facilities` | - |
| POST | `/facilities` | `create_facility` | - |
| GET | `/facilities/{facility_id}` | `get_facility` | - |
| PATCH | `/facilities/{facility_id}` | `patch_facility` | - |
| DELETE | `/facilities/{facility_id}` | `delete_facility` | - |
| GET | `/facilities/{facility_id}/utilizations` | `list_utilizations` | - |
| POST | `/facilities/{facility_id}/utilizations` | `create_utilization` | - |
| GET | `/utilizations/{utilization_id}` | `get_utilization` | - |
| PATCH | `/utilizations/{utilization_id}` | `patch_utilization` | - |
| POST | `/utilizations/{utilization_id}/regenerate-schedule` | `regenerate_schedule` | - |
| POST | `/utilizations/{utilization_id}/activate` | `activate_utilization` | - |
| DELETE | `/utilizations/{utilization_id}` | `delete_utilization` | - |
| GET | `/utilizations/{utilization_id}/schedule` | `get_schedule` | - |
| GET | `/utilizations/{utilization_id}/transactions` | `util_transactions` | - |
| GET | `/facilities/{facility_id}/transactions` | `facility_transactions` | - |
| POST | `/calculate-emi` | `calculate_emi` | - |
| GET | `/summary` | `facility_summary` | - |
| POST | `/run-monthly-accrual` | `api_run_accrual` | - |
| POST | `/accruals/{accrual_id}/reverse` | `api_reverse_accrual` | - |
| GET | `/utilizations/{utilization_id}/accruals` | `list_accruals` | - |
| GET | `/upcoming-obligations` | `upcoming_obligations` | - |
| POST | `/utilizations/{utilization_id}/record-payment-draft` | `record_payment_draft` | - |
| POST | `/generate-due-vouchers` | `api_gen_due` | - |
| POST | `/update-overdue-status` | `api_overdue` | - |
| POST | `/snapshots/generate` | `generate_facility_snapshots` | Freeze month-end facility payloads for lender packs / financier portal. |

### files

**File:** `files\router.py`  
**Prefix:** `/files`  
**Endpoints:** 1

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/{module_name}/{filename}` | `download_tenant_file` | Serve a file from MEDIA_ROOT/{tenant_id}/{module}/{filename}.     Tenant is taken only from JWT — ne |

### finance

**File:** `finance\router.py`  
**Prefix:** `/finance`  
**Endpoints:** 130

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/account-groups` | `list_account_groups` | - |
| GET | `/account-groups/hierarchy` | `list_account_groups_hierarchy` | Return account groups as a tree (Group → Type → hierarchy) for tree UX and reports. |
| POST | `/account-groups` | `create_account_group` | - |
| PATCH | `/account-groups/{group_id}` | `update_account_group` | - |
| DELETE | `/account-groups/{group_id}` | `delete_account_group` | - |
| POST | `/account-groups/seed` | `seed_account_groups` | Seed default account groups if none exist. Idempotent. |
| POST | `/system-coa/seed` | `seed_system_coa_for_tenant` | Idempotent: add missing system groups, ledgers, and accounting_system_mappings. |
| GET | `/chart-of-accounts` | `list_chart_of_accounts` | - |
| GET | `/chart-of-accounts/{account_id}` | `get_chart_of_account` | - |
| POST | `/chart-of-accounts` | `create_chart_account` | - |
| PATCH | `/chart-of-accounts/{account_id}` | `update_chart_account` | - |
| DELETE | `/chart-of-accounts/{account_id}` | `delete_chart_account` | - |
| GET | `/account-groups/{group_id}/reporting-impact` | `get_account_group_reporting_impact` | Return which reports reference this account group (read-only). |
| GET | `/coa-config` | `get_coa_config` | - |
| PUT | `/coa-config` | `put_coa_config` | - |
| GET | `/coa/export` | `coa_export` | Export Chart of Accounts (groups and accounts) as CSV. |
| POST | `/coa/import` | `coa_import` | Import Chart of Accounts from CSV. conflict: skip existing, update existing, or abort on first confl |
| GET | `/vouchers/types` | `list_voucher_types` | - |
| POST | `/vouchers/types` | `upsert_voucher_type` | - |
| GET | `/vouchers` | `list_vouchers` | - |
| POST | `/vouchers/duplicate-risk-check` | `duplicate_voucher_risk_check` | Soft duplicate check before save: compares fingerprint to already-posted vouchers. |
| GET | `/vouchers/{voucher_id}` | `get_voucher` | - |
| POST | `/vouchers` | `create_voucher` | - |
| PATCH | `/vouchers/{voucher_id}` | `update_voucher` | - |
| DELETE | `/vouchers/{voucher_id}` | `delete_voucher` | - |
| POST | `/vouchers/{voucher_id}/status` | `update_voucher_status` | - |
| GET | `/reports/day-book` | `day_book_report` | - |
| GET | `/reports/trial-balance` | `trial_balance_report` | - |
| GET | `/reports/financial-statements` | `financial_statements` | - |
| GET | `/reports/cash-flow-statement` | `cash_flow_statement` | - |
| GET | `/cash-forecast/scenarios` | `list_cash_forecast_scenarios` | - |
| POST | `/cash-forecast/scenarios` | `create_cash_forecast_scenario` | - |
| DELETE | `/cash-forecast/scenarios/{scenario_id}` | `delete_cash_forecast_scenario` | - |
| PUT | `/cash-forecast/scenarios/{scenario_id}` | `update_cash_forecast_scenario` | - |
| POST | `/cash-forecast/scenarios/{scenario_id}/generate` | `generate_cash_forecast` | - |
| GET | `/cash-forecast/summary` | `cash_forecast_summary` | - |
| GET | `/fx-receipts` | `list_fx_receipts` | - |
| POST | `/fx-receipts` | `create_fx_receipt` | - |
| POST | `/fx-receipts/{receipt_id}/settle` | `settle_fx_receipt` | - |
| GET | `/fx-receipts/unsettled-summary` | `unsettled_fx_summary` | - |
| GET | `/multi-currency/revaluation-summary` | `multi_currency_revaluation_summary` | - |
| GET | `/bills` | `list_bills` | - |
| POST | `/bills` | `create_bill` | - |
| POST | `/purchase-workflow/create-payable-from-po/{po_id}` | `create_payable_from_purchase_order` | - |
| POST | `/purchase-workflow/create-payable-from-grn/{grn_id}` | `create_payable_from_goods_receiving` | - |
| POST | `/bills/{bill_id}/settle` | `settle_bill` | - |
| GET | `/bills/aging` | `bills_aging` | - |
| GET | `/cost-centers` | `list_cost_centers` | - |
| GET | `/cost-centers/dashboard` | `cost_center_dashboard` | - |
| GET | `/cost-centers/{center_id:int}` | `get_cost_center` | - |
| POST | `/cost-centers` | `create_cost_center` | - |
| PATCH | `/cost-centers/{center_id:int}` | `update_cost_center` | - |
| GET | `/budgets` | `list_budgets` | - |
| POST | `/budgets` | `create_budget` | - |
| PUT | `/budgets/{budget_id}` | `update_budget` | - |
| DELETE | `/budgets/{budget_id}` | `delete_budget` | - |
| GET | `/budgets/{budget_id}/vs-actual` | `budget_vs_actual` | - |
| GET | `/banking/accounts` | `list_bank_accounts` | - |
| POST | `/banking/accounts` | `create_bank_account` | - |
| PATCH | `/banking/accounts/{account_id}` | `update_bank_account` | - |
| GET | `/banking/reconciliation` | `list_bank_reconciliations` | - |
| POST | `/banking/reconciliation` | `create_bank_reconciliation` | - |
| POST | `/banking/reconciliation/{recon_id}/resolve` | `resolve_bank_reconciliation` | - |
| POST | `/banking/reconciliation/{recon_id}/finalize` | `finalize_bank_reconciliation` | - |
| GET | `/banking/reconciliation/{recon_id}/match-logs` | `list_bank_statement_match_logs` | - |
| GET | `/banking/reconciliation/{recon_id}/match-logs/export-csv` | `export_bank_statement_match_logs_csv` | - |
| GET | `/banking/reconciliation/{recon_id}/statement-lines` | `list_statement_lines` | - |
| GET | `/banking/reconciliation/{recon_id}/summary` | `reconciliation_summary` | - |
| POST | `/banking/reconciliation/{recon_id}/statement-lines` | `import_statement_lines` | - |
| POST | `/banking/reconciliation/{recon_id}/statement-lines/import-csv` | `import_statement_lines_csv` | - |
| POST | `/banking/reconciliation/{recon_id}/statement-lines/{line_id}/match` | `manual_match_statement_line` | - |
| POST | `/banking/reconciliation/{recon_id}/statement-lines/{line_id}/unmatch` | `manual_unmatch_statement_line` | - |
| POST | `/banking/reconciliation/{recon_id}/auto-match` | `auto_match_statement_lines` | - |
| GET | `/banking/payment-runs` | `list_payment_runs` | - |
| POST | `/banking/payment-runs` | `create_payment_run` | - |
| POST | `/banking/payment-runs/{run_id}/execute` | `execute_payment_run` | - |
| GET | `/banking/payment-runs/{run_id}/advice` | `payment_run_advice` | - |
| GET | `/banking/settlement-audit` | `settlement_audit` | - |
| GET | `/banking/settlement-audit-presets` | `list_settlement_audit_presets` | - |
| POST | `/banking/settlement-audit-presets` | `save_settlement_audit_preset` | - |
| DELETE | `/banking/settlement-audit-presets/{preset_id}` | `delete_settlement_audit_preset` | - |
| GET | `/banking/settlement-audit/export.csv` | `settlement_audit_export_csv` | - |
| GET | `/purchase-workflow/ap-overview` | `purchase_ap_overview` | - |
| GET | `/profitability/style/{style_id}` | `style_profitability` | - |
| GET | `/profitability/lc/{order_id}` | `lc_profitability` | - |
| GET | `/profitability/variance/{order_id}` | `costing_variance` | - |
| GET | `/vouchers/{voucher_id}/print` | `voucher_print` | - |
| GET | `/vouchers/verify/{verification_id}` | `verify_voucher_signature` | - |
| POST | `/vouchers/backfill-signatures` | `backfill_voucher_signatures` | - |
| GET | `/accounting-periods` | `list_accounting_periods` | - |
| POST | `/accounting-periods` | `create_accounting_period` | - |
| POST | `/accounting-periods/{period_id}/close` | `close_accounting_period` | - |
| GET | `/vouchers/meta/types` | `voucher_types_meta` | - |
| GET | `/vouchers/meta/statuses` | `voucher_statuses_meta` | - |
| GET | `/vouchers/meta/workflow` | `voucher_workflow_meta` | - |
| GET | `/vouchers/meta/approval-rules` | `voucher_approval_rules_meta` | - |
| GET | `/vouchers/{voucher_id}/available-actions` | `voucher_available_actions` | - |
| POST | `/vouchers/{voucher_id}/post` | `post_voucher` | - |
| POST | `/vouchers/{voucher_id}/cancel-posting` | `cancel_posted_voucher` | - |
| POST | `/vouchers/{voucher_id}/reverse` | `reverse_voucher` | - |
| POST | `/bills/{bill_id}/allocate` | `allocate_bill_against_voucher` | - |
| POST | `/bills/auto-create-from-voucher/{voucher_id}` | `auto_create_bill_from_voucher` | - |
| POST | `/banking/payment-runs/{run_id}/approve` | `approve_payment_run` | - |
| POST | `/banking/payment-runs/{run_id}/process` | `process_payment_run` | - |
| POST | `/accounting-periods/{period_id}/reopen` | `reopen_accounting_period` | - |
| GET | `/accounting-periods/check-lock` | `check_period_lock` | - |
| DELETE | `/accounting-periods/{period_id}` | `delete_accounting_period` | - |
| GET | `/voucher-reports/summary` | `voucher_report_summary` | - |
| GET | `/reports/ledger-activity` | `ledger_activity_report` | - |
| GET | `/voucher-reports/monthly` | `voucher_report_monthly` | - |
| GET | `/voucher-reports/top-preparers` | `voucher_report_top_preparers` | - |
| GET | `/bill-references` | `list_bill_references` | - |
| POST | `/bill-references` | `create_bill_reference` | - |
| GET | `/bill-references/{bill_ref_id}` | `get_bill_reference_detail` | - |
| POST | `/bill-references/allocate` | `allocate_bill_wise` | - |
| POST | `/bill-references/auto-create/{voucher_id}` | `auto_create_bill_refs_from_voucher` | Auto-create bill references for all lines hitting bill-wise enabled accounts. |
| GET | `/bill-references/report/outstanding` | `bill_wise_outstanding_report` | - |
| GET | `/bill-references/report/aging` | `bill_wise_aging_report` | - |
| GET | `/ai/readonly-insights` | `finance_ai_readonly_insights` | Phase 17: read-only voucher activity series and simple anomaly hints. |
| GET | `/business-overview` | `finance_business_overview` | - |
| GET | `/business-overview/health-score` | `finance_business_health_score` | - |
| GET | `/business-overview/deterministic-summary` | `finance_business_overview_deterministic` | - |
| GET | `/business-overview/ai-narrative` | `finance_business_overview_ai` | - |
| POST | `/vendor-bills/from-grn/{grn_id}` | `create_vendor_bill_draft_from_grn` | - |
| GET | `/vendor-bills` | `list_vendor_bills` | - |
| GET | `/vendor-bills/{bill_id}` | `get_vendor_bill` | - |
| PATCH | `/vendor-bills/{bill_id}` | `patch_vendor_bill` | - |
| POST | `/vendor-bills/{bill_id}/post` | `post_vendor_bill` | Book AP: clear GRNI (goods received not billed) and credit trade payables. |
| GET | `/exposure/master-lc/{master_contract_id}` | `finance_exposure_master_lc` | - |
| GET | `/maturity-ladder` | `finance_maturity_ladder` | - |

### hr

**File:** `hr\router.py`  
**Prefix:** `/hr`  
**Endpoints:** 26

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/departments` | `list_departments` | - |
| POST | `/departments` | `create_department` | - |
| PATCH | `/departments/{department_id}` | `update_department` | - |
| DELETE | `/departments/{department_id}` | `delete_department` | - |
| GET | `/designations` | `list_designations` | - |
| POST | `/designations` | `create_designation` | - |
| PATCH | `/designations/{designation_id}` | `update_designation` | - |
| DELETE | `/designations/{designation_id}` | `delete_designation` | - |
| GET | `/employees` | `list_employees` | - |
| GET | `/employees/{employee_id}` | `get_employee` | - |
| POST | `/employees` | `create_employee` | - |
| PATCH | `/employees/{employee_id}` | `update_employee` | - |
| POST | `/employees/{employee_id}/activate` | `activate_employee` | - |
| POST | `/employees/{employee_id}/deactivate` | `deactivate_employee` | - |
| GET | `/dashboard-data` | `hr_dashboard_data` | - |
| GET | `/sections` | `list_sections` | - |
| POST | `/sections` | `create_section` | - |
| PATCH | `/sections/{section_id}` | `update_section` | - |
| GET | `/employees/{employee_id}/documents` | `list_employee_documents` | - |
| POST | `/employees/{employee_id}/documents` | `create_employee_document` | - |
| GET | `/employees/{employee_id}/status-history` | `list_employee_status_history` | - |
| POST | `/employees/{employee_id}/status-history` | `create_employee_status_history` | - |
| GET | `/employees/export` | `export_employees` | - |
| POST | `/employees/import` | `import_employees` | - |
| GET | `/compliance-checks` | `list_compliance_checks` | - |
| POST | `/compliance-checks` | `create_compliance_check` | - |

### hr_attendance

**File:** `hr_attendance\router.py`  
**Prefix:** `/hr/attendance`  
**Endpoints:** 24

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/shifts` | `list_shifts` | - |
| POST | `/shifts` | `create_shift` | - |
| PATCH | `/shifts/{shift_id}` | `update_shift` | - |
| GET | `/rosters` | `list_rosters` | - |
| POST | `/rosters` | `create_roster` | - |
| PATCH | `/rosters/{roster_id}` | `update_roster` | - |
| GET | `/holidays` | `list_holidays` | - |
| POST | `/holidays` | `create_holiday` | - |
| PATCH | `/holidays/{holiday_id}` | `update_holiday` | - |
| GET | `/entries` | `list_entries` | - |
| POST | `/entries` | `create_entry` | - |
| PATCH | `/entries/{entry_id}` | `update_entry` | - |
| GET | `/regularizations` | `list_regularizations` | - |
| GET | `/summary` | `attendance_summary` | - |
| POST | `/regularizations` | `create_regularization` | - |
| POST | `/regularizations/{request_id}/approve` | `approve_regularization` | - |
| POST | `/regularizations/{request_id}/reject` | `reject_regularization` | - |
| GET | `/overtime-rules` | `list_overtime_rules` | - |
| POST | `/overtime-rules` | `create_overtime_rule` | - |
| PATCH | `/overtime-rules/{rule_id}` | `update_overtime_rule` | - |
| GET | `/overtime` | `list_overtime_entries` | - |
| POST | `/overtime` | `create_overtime_entry` | - |
| POST | `/overtime/{entry_id}/approve` | `approve_overtime_entry` | - |
| POST | `/entries/bulk` | `bulk_create_entries` | - |

### hr_ess

**File:** `hr_ess\router.py`  
**Prefix:** `/hr/ess`  
**Endpoints:** 9

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/my-profile` | `my_profile` | - |
| PATCH | `/my-profile` | `update_my_profile` | - |
| PATCH | `/my-profile/preferences` | `update_preferences` | - |
| GET | `/my-leave-requests` | `my_leave_requests` | - |
| POST | `/my-leave-requests` | `create_my_leave_request` | - |
| GET | `/my-attendance-summary` | `my_attendance_summary` | - |
| GET | `/my-payslips` | `my_payslips` | - |
| GET | `/my-tickets` | `my_tickets` | - |
| POST | `/my-tickets` | `create_my_ticket` | - |

### hr_leave

**File:** `hr_leave\router.py`  
**Prefix:** `/hr/leave`  
**Endpoints:** 17

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/types` | `list_leave_types` | - |
| POST | `/types` | `create_leave_type` | - |
| PATCH | `/types/{leave_type_id}` | `update_leave_type` | - |
| GET | `/policies` | `list_leave_policies` | - |
| POST | `/policies` | `create_leave_policy` | - |
| PATCH | `/policies/{policy_id}` | `update_leave_policy` | - |
| GET | `/balances` | `list_leave_balances` | - |
| POST | `/balances/upsert` | `upsert_leave_balance` | - |
| GET | `/requests` | `list_leave_requests` | - |
| POST | `/requests` | `create_leave_request` | - |
| PATCH | `/requests/{request_id}` | `update_leave_request` | - |
| POST | `/requests/{request_id}/submit` | `submit_leave_request` | - |
| POST | `/requests/{request_id}/approve` | `approve_leave_request` | - |
| POST | `/requests/{request_id}/reject` | `reject_leave_request` | - |
| POST | `/balances/carry-forward` | `carry_forward_balances` | Roll prior-year closing balances into the next year (simplified). |
| POST | `/encashment` | `leave_encashment` | - |
| GET | `/calendar-data` | `leave_calendar_data` | - |

### hr_payroll

**File:** `hr_payroll\router.py`  
**Prefix:** `/hr/payroll`  
**Endpoints:** 29

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/components` | `list_components` | - |
| POST | `/components` | `create_component` | - |
| PATCH | `/components/{component_id}` | `update_component` | - |
| GET | `/structures` | `list_structures` | - |
| POST | `/structures` | `create_structure` | - |
| GET | `/structures/{structure_id}/lines` | `list_structure_lines` | - |
| POST | `/structures/{structure_id}/lines` | `create_structure_line` | - |
| GET | `/periods` | `list_periods` | - |
| POST | `/periods` | `create_period` | - |
| POST | `/periods/{period_id}/finalize` | `finalize_period` | - |
| GET | `/runs` | `list_runs` | - |
| POST | `/runs` | `create_run` | - |
| GET | `/runs/{run_id}/lines` | `list_run_lines` | - |
| POST | `/runs/{run_id}/lines/upsert` | `upsert_run_line` | - |
| POST | `/runs/{run_id}/finalize` | `finalize_run` | - |
| POST | `/runs/{run_id}/approve` | `approve_run` | - |
| POST | `/runs/{run_id}/post` | `post_run` | - |
| POST | `/runs/{run_id}/generate-payslips` | `generate_payslips` | - |
| GET | `/approvals` | `list_approvals` | - |
| PATCH | `/approvals/{approval_id}/decision` | `decide_approval` | - |
| GET | `/payslips` | `list_payslips` | - |
| GET | `/accounting-config` | `get_payroll_accounting_config` | - |
| PUT | `/accounting-config` | `upsert_payroll_accounting_config` | - |
| GET | `/advances` | `list_advances` | - |
| POST | `/advances` | `create_advance` | - |
| GET | `/bonuses` | `list_bonuses` | - |
| POST | `/bonuses` | `create_bonus` | - |
| GET | `/payslips/{payslip_id}/pdf` | `download_payslip_pdf` | - |
| GET | `/runs/{run_id}/bank-file` | `download_bank_file` | - |

### hr_performance

**File:** `hr_performance\router.py`  
**Prefix:** `/hr/performance`  
**Endpoints:** 13

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/cycles` | `list_cycles` | - |
| POST | `/cycles` | `create_cycle` | - |
| PATCH | `/cycles/{cycle_id}` | `update_cycle` | - |
| POST | `/cycles/{cycle_id}/status` | `update_cycle_status` | - |
| GET | `/goals` | `list_goals` | - |
| POST | `/goals` | `create_goal` | - |
| PATCH | `/goals/{goal_id}` | `update_goal` | - |
| POST | `/goals/{goal_id}/submit` | `submit_goal` | - |
| GET | `/reviews` | `list_reviews` | - |
| POST | `/reviews` | `create_review` | - |
| PATCH | `/reviews/{review_id}` | `update_review` | - |
| POST | `/reviews/{review_id}/submit` | `submit_review` | - |
| GET | `/dashboard` | `performance_dashboard` | - |

### hr_recruitment

**File:** `hr_recruitment\router.py`  
**Prefix:** `/hr/recruitment`  
**Endpoints:** 16

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/requisitions` | `list_requisitions` | - |
| POST | `/requisitions` | `create_requisition` | - |
| PATCH | `/requisitions/{requisition_id}` | `update_requisition` | - |
| POST | `/requisitions/{requisition_id}/status` | `update_requisition_status` | - |
| GET | `/candidates` | `list_candidates` | - |
| POST | `/candidates` | `create_candidate` | - |
| PATCH | `/candidates/{candidate_id}` | `update_candidate` | - |
| POST | `/candidates/{candidate_id}/stage` | `update_candidate_stage` | - |
| GET | `/interviews` | `list_interviews` | - |
| POST | `/interviews` | `create_interview` | - |
| PATCH | `/interviews/{interview_id}` | `update_interview` | - |
| POST | `/interviews/{interview_id}/status` | `update_interview_status` | - |
| GET | `/offers` | `list_offers` | - |
| POST | `/offers` | `create_offer` | - |
| PATCH | `/offers/{offer_id}` | `update_offer` | - |
| POST | `/offers/{offer_id}/status` | `update_offer_status` | - |

### hr_reports

**File:** `hr_reports\router.py`  
**Prefix:** `/hr/reports`  
**Endpoints:** 4

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/summary` | `report_summary` | - |
| GET | `/attendance` | `report_attendance` | - |
| GET | `/leave` | `report_leave` | - |
| GET | `/payroll` | `report_payroll` | - |

### inquiries

**File:** `inquiries\inquiry_ai_router.py`  
**Prefix:** `N/A`  
**Endpoints:** 12

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/extract` | `inquiry_ai_extract` | - |
| POST | `/enrich` | `inquiry_ai_enrich` | - |
| POST | `/validate` | `inquiry_ai_validate` | - |
| POST | `/dedupe` | `inquiry_ai_dedupe` | - |
| POST | `/summary` | `inquiry_ai_summary` | - |
| POST | `/next-actions` | `inquiry_ai_next_actions` | - |
| GET | `/audit-log` | `inquiry_ai_audit_log` | - |
| POST | `/suggestion-batch/mark-decisions` | `inquiry_ai_suggestion_mark_decisions` | - |
| POST | `/suggestion-batch/apply-suggestions` | `inquiry_ai_suggestion_apply` | - |
| POST | `/suggestion-batch/discard` | `inquiry_ai_suggestion_discard` | - |
| POST | `/suggestion-batch/link-inquiry` | `inquiry_ai_suggestion_link` | - |
| POST | `/suggestion-batch/finalize-after-create` | `inquiry_ai_suggestion_finalize_create` | - |

**File:** `inquiries\router.py`  
**Prefix:** `/inquiries`  
**Endpoints:** 8

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `` | `list_inquiries` | - |
| GET | `/paginated` | `list_inquiries_paginated` | - |
| POST | `` | `create_inquiry` | - |
| GET | `/{inquiry_id}` | `get_inquiry` | - |
| PATCH | `/{inquiry_id}` | `update_inquiry` | - |
| DELETE | `/{inquiry_id}` | `delete_inquiry` | - |
| PATCH | `/{inquiry_id}/status` | `update_inquiry_status` | - |
| GET | `/{inquiry_id}/trace` | `get_inquiry_trace` | - |

### inventory

**File:** `inventory\router.py`  
**Prefix:** `/inventory`  
**Endpoints:** 121

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/item-categories` | `list_item_categories` | - |
| POST | `/item-categories` | `create_item_category` | - |
| PATCH | `/item-categories/{category_id}` | `update_item_category` | - |
| DELETE | `/item-categories/{category_id}` | `delete_item_category` | - |
| GET | `/item-subcategories` | `list_item_subcategories` | - |
| POST | `/item-subcategories` | `create_item_subcategory` | - |
| PATCH | `/item-subcategories/{subcategory_id}` | `update_item_subcategory` | - |
| DELETE | `/item-subcategories/{subcategory_id}` | `delete_item_subcategory` | - |
| GET | `/item-units` | `list_item_units` | - |
| POST | `/item-units` | `create_item_unit` | - |
| PATCH | `/item-units/{unit_id}` | `update_item_unit` | - |
| DELETE | `/item-units/{unit_id}` | `delete_item_unit` | - |
| GET | `/items` | `list_items` | - |
| GET | `/items/{item_id}` | `get_item` | - |
| GET | `/items/{item_id}/availability` | `get_item_availability` | - |
| POST | `/items` | `create_item` | - |
| PATCH | `/items/{item_id}` | `update_item` | - |
| DELETE | `/items/{item_id}` | `delete_item` | - |
| GET | `/warehouses` | `list_warehouses` | - |
| POST | `/warehouses` | `create_warehouse` | - |
| PATCH | `/warehouses/{warehouse_id}` | `update_warehouse` | - |
| DELETE | `/warehouses/{warehouse_id}` | `delete_warehouse` | - |
| GET | `/stock-groups` | `list_stock_groups` | - |
| POST | `/stock-groups` | `create_stock_group` | - |
| PATCH | `/stock-groups/{group_id}` | `update_stock_group` | - |
| DELETE | `/stock-groups/{group_id}` | `delete_stock_group` | - |
| GET | `/vendors` | `list_vendors` | - |
| GET | `/vendors/{vendor_id}` | `get_vendor` | - |
| POST | `/vendors` | `create_vendor` | - |
| PATCH | `/vendors/{vendor_id}` | `update_vendor` | - |
| DELETE | `/vendors/{vendor_id}` | `delete_vendor` | - |
| GET | `/purchase-orders` | `list_purchase_orders` | - |
| GET | `/purchase-orders/{po_id}` | `get_purchase_order` | - |
| POST | `/purchase-orders` | `create_purchase_order` | - |
| PATCH | `/purchase-orders/{po_id}/status` | `update_purchase_order_status` | - |
| GET | `/lot-trace` | `trace_lot_number` | Trace a lot from GRN receipt lines through stock movements (same tenant). |
| GET | `/goods-receiving` | `list_goods_receiving` | - |
| GET | `/goods-receiving/{grn_id}` | `get_goods_receiving` | - |
| POST | `/goods-receiving` | `create_goods_receiving` | - |
| POST | `/goods-receiving/{grn_id}/receive` | `receive_goods` | - |
| GET | `/purchase-orders/{po_id}/receipt-progress` | `purchase_order_receipt_progress` | - |
| GET | `/material-control/order/{order_id}/variance` | `order_material_variance` | - |
| GET | `/stock-movements` | `list_stock_movements_ledger` | - |
| POST | `/goods-receiving/{grn_id}/acknowledge` | `acknowledge_goods_receiving` | - |
| GET | `/goods-receiving/{grn_id}/print-data` | `goods_receiving_print_data` | Payload for internal GRN print and vendor acknowledgement. |
| GET | `/stock-summary` | `stock_summary` | - |
| GET | `/stock-valuation` | `stock_valuation` | - |
| POST | `/fifo-rebuild` | `fifo_rebuild` | - |
| GET | `/stock-summary/by-group` | `stock_summary_by_group` | - |
| GET | `/stock-summary/by-warehouse` | `stock_summary_by_warehouse` | - |
| GET | `/stock-summary/wip` | `stock_summary_wip` | - |
| GET | `/stock-summary/overview` | `stock_summary_overview` | - |
| GET | `/reconciliation/stock-vs-gl` | `reconciliation_stock_vs_gl` | - |
| GET | `/reconciliation/wip-vs-gl` | `reconciliation_wip_vs_gl` | - |
| GET | `/stock-dashboard` | `stock_dashboard` | - |
| GET | `/stock-ledger` | `stock_ledger` | - |
| GET | `/delivery-challans` | `list_delivery_challans` | - |
| POST | `/delivery-challans` | `create_delivery_challan` | - |
| POST | `/delivery-challans/{challan_id}/status` | `update_delivery_challan_status` | - |
| GET | `/enhanced-gate-passes` | `list_enhanced_gate_passes` | - |
| POST | `/enhanced-gate-passes` | `create_enhanced_gate_pass` | - |
| POST | `/enhanced-gate-passes/{gate_pass_id}/status` | `update_enhanced_gate_pass_status` | - |
| GET | `/production-material-issues` | `list_production_material_issues` | - |
| POST | `/production-material-issues` | `create_and_post_production_material_issue` | - |
| GET | `/process-orders` | `list_process_orders` | - |
| GET | `/process-orders/{process_order_id}` | `get_process_order` | - |
| POST | `/process-orders` | `create_process_order` | - |
| PUT | `/process-orders/{process_order_id}` | `update_process_order` | - |
| POST | `/process-orders/{process_order_id}/issue` | `issue_process_order` | - |
| POST | `/process-orders/{process_order_id}/receive` | `receive_process_order` | - |
| POST | `/process-orders/{process_order_id}/cost-lines` | `add_process_order_cost_line` | - |
| POST | `/process-orders/{process_order_id}/approve` | `approve_process_order` | - |
| GET | `/manufacturing-orders` | `list_manufacturing_orders` | - |
| GET | `/manufacturing-orders/{mo_id}` | `get_manufacturing_order` | - |
| GET | `/manufacturing-orders/{mo_id}/stages` | `list_manufacturing_stages` | - |
| POST | `/manufacturing-orders` | `create_manufacturing_order` | - |
| POST | `/manufacturing-orders/{mo_id}/start` | `start_manufacturing_order` | - |
| POST | `/manufacturing-orders/{mo_id}/hold` | `hold_manufacturing_order` | - |
| POST | `/manufacturing-orders/{mo_id}/resume` | `resume_manufacturing_order` | - |
| POST | `/manufacturing-orders/{mo_id}/complete` | `complete_manufacturing_order` | - |
| POST | `/manufacturing-orders/stages/{stage_id}/start` | `start_manufacturing_stage` | - |
| POST | `/manufacturing-orders/stages/{stage_id}/complete` | `complete_manufacturing_stage` | - |
| POST | `/manufacturing-orders/stages/{stage_id}/skip` | `skip_manufacturing_stage` | - |
| PUT | `/manufacturing-orders/stages/{stage_id}` | `update_manufacturing_stage` | - |
| POST | `/consumption-control/finalize-order/{order_id}` | `finalize_consumption_order` | - |
| GET | `/consumption-control/snapshot/{order_id}` | `consumption_snapshot` | - |
| GET | `/consumption-control/reservations/{order_id}` | `consumption_reservations` | - |
| POST | `/consumption-control/issue-material` | `issue_consumption_material` | - |
| GET | `/reconciliation/overview` | `reconciliation_overview` | - |
| GET | `/consumption-control/change-requests` | `list_consumption_change_requests` | - |
| POST | `/consumption-control/change-request` | `create_consumption_change_request` | - |
| POST | `/consumption-control/change-requests/{request_id}/approve` | `approve_consumption_change_request` | - |
| POST | `/consumption-control/change-requests/{request_id}/reject` | `reject_consumption_change_request` | - |
| GET | `/warehouse-transfers` | `list_warehouse_transfers` | - |
| POST | `/warehouse-transfers` | `create_warehouse_transfer` | - |
| POST | `/warehouse-transfers/{transfer_id}/post` | `post_warehouse_transfer` | - |
| GET | `/stock-adjustments` | `list_stock_adjustments` | - |
| POST | `/stock-adjustments` | `create_stock_adjustment` | - |
| POST | `/stock-adjustments/{adjustment_id}/post` | `post_stock_adjustment` | - |
| GET | `/physical-inventory-sessions` | `list_physical_inventory_sessions` | - |
| POST | `/physical-inventory-sessions` | `create_physical_inventory_session` | - |
| POST | `/physical-inventory-sessions/{session_id}/post` | `post_physical_inventory_session` | - |
| POST | `/purchase-orders/bulk-status` | `bulk_purchase_order_status` | - |
| POST | `/goods-receiving/bulk-receive` | `bulk_receive_grn` | - |
| GET | `/orders/{order_id}/material-readiness` | `order_material_readiness` | BOM vs stock readiness for a sales order (production planning). |
| GET | `/documents/verify/{verification_id}` | `verify_inventory_document_by_verification_id` | - |
| POST | `/documents/backfill-signatures` | `inventory_documents_backfill_signatures` | - |
| GET | `/delivery-challans/{challan_id}` | `get_delivery_challan` | - |
| GET | `/delivery-challans/{challan_id}/gl-postings` | `delivery_challan_gl_postings` | - |
| GET | `/delivery-challans/{challan_id}/print-data` | `delivery_challan_print_data` | - |
| GET | `/enhanced-gate-passes/{gate_pass_id}` | `get_enhanced_gate_pass` | - |
| GET | `/enhanced-gate-passes/{gate_pass_id}/gl-postings` | `gate_pass_gl_postings` | - |
| GET | `/enhanced-gate-passes/{gate_pass_id}/print-data` | `gate_pass_print_data` | - |
| GET | `/goods-receiving/{grn_id}/gl-postings` | `grn_gl_postings` | - |
| GET | `/production-material-issues/{issue_id}` | `get_production_material_issue` | - |
| GET | `/production-material-issues/{issue_id}/gl-postings` | `pmi_gl_postings` | - |
| GET | `/production-material-issues/{issue_id}/print-data` | `pmi_print_data` | - |
| GET | `/process-orders/{process_order_id}/gl-postings` | `process_order_gl_postings` | - |
| GET | `/process-orders/{process_order_id}/print-data` | `process_order_print_data` | - |
| GET | `/warehouse-transfers/{transfer_id}/gl-postings` | `warehouse_transfer_gl_postings` | - |
| GET | `/warehouse-transfers/{transfer_id}/print-data` | `warehouse_transfer_print_data` | - |

**File:** `inventory\vendor_ai_router.py`  
**Prefix:** `N/A`  
**Endpoints:** 12

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/extract` | `vendor_ai_extract` | - |
| POST | `/enrich` | `vendor_ai_enrich` | - |
| POST | `/validate` | `vendor_ai_validate` | - |
| POST | `/dedupe` | `vendor_ai_dedupe` | - |
| POST | `/summary` | `vendor_ai_summary` | - |
| POST | `/next-actions` | `vendor_ai_next_actions` | - |
| GET | `/audit-log` | `vendor_ai_audit_log` | - |
| POST | `/suggestion-batch/mark-decisions` | `vendor_ai_suggestion_mark_decisions` | - |
| POST | `/suggestion-batch/apply-suggestions` | `vendor_ai_suggestion_apply` | - |
| POST | `/suggestion-batch/discard` | `vendor_ai_suggestion_discard` | - |
| POST | `/suggestion-batch/link-vendor` | `vendor_ai_suggestion_link` | - |
| POST | `/suggestion-batch/finalize-after-create` | `vendor_ai_suggestion_finalize_create` | - |

### logistics

**File:** `logistics\router.py`  
**Prefix:** `/logistics`  
**Endpoints:** 4

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/shipments` | `list_shipments` | - |
| GET | `/shipments/{shipment_id}` | `get_shipment` | - |
| POST | `/shipments` | `create_shipment` | - |
| PATCH | `/shipments/{shipment_id}` | `update_shipment` | - |

### manufacturing

**File:** `manufacturing\costing_hooks_router.py`  
**Prefix:** `/manufacturing/costing`  
**Endpoints:** 3

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/work-orders/{work_order_id}/actual-cost` | `get_actual_cost` | - |
| GET | `/work-orders/{work_order_id}/variance` | `get_cost_variance` | - |
| POST | `/work-orders/{work_order_id}/freeze-cost-snapshot` | `freeze_cost_snapshot` | - |

**File:** `manufacturing\execution_router.py`  
**Prefix:** `/manufacturing/execution`  
**Endpoints:** 19

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/work-orders` | `list_work_orders` | - |
| POST | `/work-orders` | `create_work_order` | - |
| POST | `/work-orders/{work_order_id}/status` | `update_work_order_status` | - |
| GET | `/work-orders/{work_order_id}/operations` | `list_work_order_operations` | - |
| POST | `/operations/{work_order_operation_id}/start` | `start_operation` | - |
| POST | `/operations/{work_order_operation_id}/complete` | `complete_operation` | - |
| POST | `/material-issues` | `create_material_issue` | - |
| GET | `/material-returns` | `list_material_returns` | List material returns for the tenant, optionally filtered by work order. |
| POST | `/material-returns` | `create_material_return` | - |
| POST | `/operations/assignments` | `assign_operation` | - |
| POST | `/operations/downtime` | `log_downtime` | - |
| GET | `/operations/downtime` | `list_downtime` | - |
| POST | `/operations/downtime/{downtime_id}/end` | `end_downtime` | - |
| GET | `/dashboard` | `execution_dashboard` | - |
| GET | `/operations/queue` | `operation_queue` | - |
| GET | `/dashboard/downtime-reasons` | `downtime_reason_summary` | - |
| GET | `/dashboard/downtime-trend` | `downtime_trend` | - |
| POST | `/operations/{work_order_operation_id}/hold` | `hold_operation` | - |
| POST | `/operations/{work_order_operation_id}/resume` | `resume_operation` | - |

**File:** `manufacturing\master_data_router.py`  
**Prefix:** `/manufacturing/master`  
**Endpoints:** 12

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/work-centers` | `list_work_centers` | - |
| POST | `/work-centers` | `create_work_center` | - |
| PATCH | `/work-centers/{work_center_id}` | `update_work_center` | - |
| GET | `/operations` | `list_operations` | - |
| POST | `/operations` | `create_operation` | - |
| PATCH | `/operations/{operation_id}` | `update_operation` | - |
| GET | `/routing-templates` | `list_routing_templates` | - |
| POST | `/routing-templates` | `create_routing_template` | - |
| PATCH | `/routing-templates/{routing_id}` | `update_routing_template` | - |
| GET | `/routing-templates/{routing_id}/steps` | `list_routing_steps` | - |
| POST | `/routing-templates/{routing_id}/steps` | `add_routing_step` | - |
| PATCH | `/routing-templates/{routing_id}/steps/{step_id}` | `update_routing_step` | - |

**File:** `manufacturing\planning_router.py`  
**Prefix:** `/manufacturing/planning`  
**Endpoints:** 6

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/production-plans` | `list_production_plans` | - |
| POST | `/production-plans` | `create_production_plan` | - |
| POST | `/production-plans/{plan_id}/generate-work-orders` | `generate_work_orders` | - |
| POST | `/mrp/runs` | `run_mrp` | - |
| GET | `/mrp/runs/{run_id}/recommendations` | `get_mrp_recommendations` | - |
| GET | `/capacity/loads` | `get_capacity_loads` | - |

**File:** `manufacturing\quality_router.py`  
**Prefix:** `/manufacturing/quality`  
**Endpoints:** 9

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/dashboard` | `get_quality_dashboard` | - |
| GET | `/checks` | `list_quality_checks` | - |
| POST | `/checks` | `create_quality_check` | - |
| GET | `/ncrs` | `list_ncrs` | - |
| POST | `/ncrs` | `create_ncr` | - |
| POST | `/ncrs/{ncr_id}/status` | `update_ncr_status` | - |
| GET | `/capas` | `list_capas` | - |
| POST | `/capas` | `create_capa` | - |
| POST | `/capas/{capa_id}/status` | `update_capa_status` | - |

**File:** `manufacturing\router.py`  
**Prefix:** `N/A`  
**Endpoints:** 0

*No endpoints found (possibly a sub-router or imports only).*

**File:** `manufacturing\samples_router.py`  
**Prefix:** `/manufacturing/samples`  
**Endpoints:** 4

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/requests` | `list_sample_requests` | - |
| POST | `/requests` | `create_sample_request` | - |
| PATCH | `/requests/{sample_id}` | `update_sample_request` | - |
| POST | `/requests/{sample_id}/status` | `update_sample_status` | - |

**File:** `manufacturing\tna_router.py`  
**Prefix:** `/manufacturing/tna`  
**Endpoints:** 10

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/templates` | `list_templates` | - |
| POST | `/templates` | `create_template` | - |
| GET | `/templates/{template_id}/tasks` | `list_template_tasks` | - |
| POST | `/templates/{template_id}/tasks` | `add_template_task` | - |
| GET | `/plans` | `list_plans` | - |
| GET | `/plans/{plan_id}` | `get_plan` | - |
| POST | `/plans` | `create_plan` | - |
| GET | `/plans/{plan_id}/tasks` | `list_plan_tasks` | - |
| PATCH | `/plan-tasks/{task_id}` | `update_plan_task` | - |
| GET | `/dashboard/summary` | `dashboard_summary` | - |

### merch

**File:** `merch\router.py`  
**Prefix:** `N/A`  
**Endpoints:** 0

*No endpoints found (possibly a sub-router or imports only).*

**File:** `merch\routers\__init__.py`  
**Prefix:** `N/A`  
**Endpoints:** 0

*No endpoints found (possibly a sub-router or imports only).*

**File:** `merch\routers\alerts.py`  
**Prefix:** `N/A`  
**Endpoints:** 17

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/alert-definitions` | `list_alert_definitions` | Tenant-scoped alert rule definitions (enable/disable and JSON config per rule). |
| PATCH | `/alert-definitions/{definition_id}` | `patch_alert_definition` | - |
| GET | `/alerts` | `list_alerts` | - |
| GET | `/alerts/summary` | `get_alerts_summary` | - |
| GET | `/alerts/views` | `list_alert_views` | List saved filter views for current user. |
| GET | `/alerts/{alert_id}` | `get_alert_detail` | Single alert for detail drawer. |
| PATCH | `/alerts/{alert_id}/status` | `update_alert_status` | Update alert status (acknowledged, in_progress, resolved, etc.). |
| POST | `/alerts/{alert_id}/snooze` | `snooze_alert` | Snooze alert until given datetime. |
| POST | `/alerts/{alert_id}/assign` | `assign_alert` | Assign alert to a user. |
| POST | `/alerts/scan` | `run_alerts_scan` | Start alert rule scan for current tenant (runs in background; returns immediately). |
| GET | `/alerts/{alert_id}/comments` | `list_alert_comments` | List comments for an alert (lazy-loaded in drawer). |
| POST | `/alerts/{alert_id}/comments` | `add_alert_comment` | Add a comment to an alert. |
| GET | `/alerts/{alert_id}/history` | `list_alert_history` | Timeline/history for an alert (lazy-loaded in drawer). |
| POST | `/alerts/{alert_id}/escalate` | `escalate_alert` | Escalate alert to a level and optionally assign. |
| POST | `/alerts/views` | `create_alert_view` | Save current filter state as a named view. |
| DELETE | `/alerts/views/{view_id}` | `delete_alert_view` | Delete a saved view. |
| GET | `/critical-alerts` | `get_critical_alerts` | Legacy aggregate: overdue simple follow-ups plus high-wastage rows from the wastage report. |

**File:** `merch\routers\boms.py`  
**Prefix:** `/merch/order-boms`  
**Endpoints:** 17

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/eligible-orders` | `list_eligible_orders_for_bom` | - |
| POST | `/from-order` | `create_bom_from_order` | - |
| GET | `/by-order/{order_id}` | `get_bom_by_order` | - |
| GET | `/{bom_id}/detail` | `get_order_bom_detail` | - |
| PATCH | `/{bom_id}/lines/{line_id}` | `patch_bom_line` | - |
| POST | `/{bom_id}/lines` | `add_bom_line` | - |
| DELETE | `/{bom_id}/lines/{line_id}` | `delete_bom_line` | - |
| POST | `/{bom_id}/submit` | `submit_order_bom` | - |
| POST | `/{bom_id}/approve` | `approve_order_bom` | - |
| POST | `/{bom_id}/reject` | `reject_order_bom` | - |
| POST | `/{bom_id}/freeze` | `freeze_order_bom` | - |
| POST | `/lines/{line_id}/purchase-order` | `create_po_from_line` | - |
| POST | `/{bom_id}/generate-purchase-orders-bulk` | `bulk_generate_pos` | - |
| GET | `/lines/{line_id}/suggested-vendors` | `suggested_vendors_for_line` | - |
| GET | `/lines/{line_id}/purchase-orders` | `list_pos_for_line` | - |
| GET | `/lines/{line_id}/procurement-status` | `line_procurement_status` | - |
| POST | `/lines/{line_id}/refresh-vendor-price` | `refresh_vendor_suggested_price` | Set vendor_suggested_price from latest PO for item+vendor. |

**File:** `merch\routers\classic_boms.py`  
**Prefix:** `N/A`  
**Endpoints:** 12

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/boms` | `list_boms` | - |
| POST | `/boms` | `create_bom` | - |
| GET | `/boms/{bom_id}` | `get_bom` | - |
| PATCH | `/boms/{bom_id}` | `update_bom` | - |
| DELETE | `/boms/{bom_id}` | `delete_bom` | - |
| POST | `/boms/{bom_id}/submit` | `submit_bom` | - |
| POST | `/boms/{bom_id}/approve` | `approve_bom` | - |
| POST | `/boms/{bom_id}/freeze` | `freeze_bom` | - |
| POST | `/boms/{bom_id}/items` | `create_bom_item` | - |
| PATCH | `/boms/{bom_id}/items/{item_id}` | `update_bom_item` | - |
| DELETE | `/boms/{bom_id}/items/{item_id}` | `delete_bom_item` | - |
| POST | `/boms/{bom_id}/generate-purchase-order` | `generate_purchase_order_from_bom` | Create a draft purchase order from BOM lines that have item_id set. Qty = quantity × base_consumptio |

**File:** `merch\routers\consumption.py`  
**Prefix:** `N/A`  
**Endpoints:** 9

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/orders/{order_id}/material-requirement` | `get_order_material_requirement` | Explode BOM for the order's style by order quantity; return required vs available stock per item (no |
| GET | `/consumption-plans` | `list_consumption_plans` | - |
| POST | `/consumption-plans` | `create_consumption_plan` | - |
| GET | `/consumption-plans/{plan_id}` | `get_consumption_plan` | - |
| PATCH | `/consumption-plans/{plan_id}` | `update_consumption_plan` | - |
| DELETE | `/consumption-plans/{plan_id}` | `delete_consumption_plan` | - |
| POST | `/consumption-plans/{plan_id}/items` | `create_consumption_plan_item` | - |
| PATCH | `/consumption-plans/{plan_id}/items/{item_id}` | `update_consumption_plan_item` | - |
| DELETE | `/consumption-plans/{plan_id}/items/{item_id}` | `delete_consumption_plan_item` | - |

**File:** `merch\routers\consumption_recon.py`  
**Prefix:** `N/A`  
**Endpoints:** 6

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/consumption-reconciliation/dashboard` | `get_consumption_reconciliation_dashboard` | - |
| GET | `/consumption-reconciliation/trends` | `get_consumption_reconciliation_trends` | Monthly aggregates of consumption reconciliation variance (capped at CONSUMPTION_RECON_DASHBOARD_MAX |
| GET | `/consumption-reconciliation/dashboard/export` | `get_consumption_reconciliation_dashboard_export` | - |
| GET | `/consumption-reconciliation/{order_id}/movements/{item_id}` | `get_consumption_reconciliation_movements` | OUT stock movements tied to the governed BOM lines for one order line item. |
| GET | `/consumption-reconciliation/{order_id}` | `get_consumption_reconciliation` | BOM-based planned vs StockMovement actuals for one order. Planned = order_qty × BOM base × (1 + wast |
| GET | `/consumption-reconciliation/{order_id}/export` | `get_consumption_reconciliation_export` | Export consumption reconciliation for one order as Excel (order info + items + summary). |

**File:** `merch\routers\exports.py`  
**Prefix:** `N/A`  
**Endpoints:** 1

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/reports/catalog` | `get_merch_reports_catalog` | Static catalog of merchandising-related analytics endpoints and UI routes (for hubs / docs). |

**File:** `merch\routers\followups.py`  
**Prefix:** `N/A`  
**Endpoints:** 4

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/followups` | `list_followups` | - |
| POST | `/followups` | `create_followup` | - |
| PATCH | `/followups/{followup_id}` | `update_followup` | - |
| DELETE | `/followups/{followup_id}` | `delete_followup` | - |

**File:** `merch\routers\merch_control_tower.py`  
**Prefix:** `/merch`  
**Endpoints:** 1

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/control-tower/summary` | `merch_control_tower_summary` | - |

**File:** `merch\routers\pipeline.py`  
**Prefix:** `N/A`  
**Endpoints:** 3

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/pipeline` | `get_pipeline_summary` | - |
| GET | `/pipeline/full` | `get_pipeline_full` | Advanced pipeline: stages with win probability + all items grouped by stage for Kanban/list views. |
| GET | `/pipeline/analytics` | `get_pipeline_analytics` | - |

**File:** `merch\routers\samples.py`  
**Prefix:** `N/A`  
**Endpoints:** 23

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/samples` | `list_samples` | - |
| GET | `/samples/by-style/{style_id}` | `list_samples_by_style` | - |
| GET | `/samples/by-order/{order_id}` | `list_samples_by_order` | - |
| GET | `/samples/{sample_id}` | `get_sample` | - |
| GET | `/samples/{sample_id}/metrics` | `get_sample_metrics` | - |
| POST | `/samples` | `create_sample` | - |
| PATCH | `/samples/{sample_id}` | `update_sample` | - |
| GET | `/samples/{sample_id}/tasks` | `list_sample_tasks` | - |
| POST | `/samples/{sample_id}/tasks` | `create_sample_task` | - |
| PATCH | `/samples/{sample_id}/tasks/{task_id}` | `update_sample_task` | - |
| DELETE | `/samples/{sample_id}/tasks/{task_id}` | `delete_sample_task` | - |
| GET | `/samples/{sample_id}/cost-lines` | `list_sample_cost_lines` | - |
| POST | `/samples/{sample_id}/cost-lines` | `create_sample_cost_line` | - |
| PATCH | `/samples/{sample_id}/cost-lines/{line_id}` | `update_sample_cost_line` | - |
| DELETE | `/samples/{sample_id}/cost-lines/{line_id}` | `delete_sample_cost_line` | - |
| GET | `/samples/{sample_id}/material-lines` | `list_sample_material_lines` | - |
| POST | `/samples/{sample_id}/material-lines` | `create_sample_material_line` | - |
| PATCH | `/samples/{sample_id}/material-lines/{line_id}` | `update_sample_material_line` | - |
| DELETE | `/samples/{sample_id}/material-lines/{line_id}` | `delete_sample_material_line` | - |
| POST | `/samples/{sample_id}/ai/plan-proposal` | `sample_ai_plan_proposal` | - |
| POST | `/samples/{sample_id}/ai/plan-apply` | `sample_ai_plan_apply` | - |
| GET | `/samples/{sample_id}/comments` | `list_sample_comments` | - |
| POST | `/samples/{sample_id}/comments` | `add_sample_comment` | - |

**File:** `merch\routers\styles.py`  
**Prefix:** `N/A`  
**Endpoints:** 21

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/styles` | `list_styles` | - |
| POST | `/styles` | `create_style` | - |
| GET | `/styles/summary-report` | `list_style_summary_report` | - |
| GET | `/styles/{style_id}` | `get_style` | - |
| PATCH | `/styles/{style_id}` | `update_style` | - |
| POST | `/styles/{style_id}/upload-picture` | `upload_style_picture` | - |
| DELETE | `/styles/{style_id}` | `delete_style` | - |
| GET | `/styles/{style_id}/summary` | `get_style_summary` | - |
| GET | `/styles/{style_id}/timeline` | `list_style_timeline` | - |
| GET | `/styles/{style_id}/components` | `list_style_components` | - |
| POST | `/styles/{style_id}/components` | `create_style_component` | - |
| PATCH | `/styles/{style_id}/components/{component_id}` | `update_style_component` | - |
| DELETE | `/styles/{style_id}/components/{component_id}` | `delete_style_component` | - |
| GET | `/styles/{style_id}/colorways` | `list_style_colorways` | - |
| POST | `/styles/{style_id}/colorways` | `create_style_colorway` | - |
| PATCH | `/styles/{style_id}/colorways/{colorway_id}` | `update_style_colorway` | - |
| DELETE | `/styles/{style_id}/colorways/{colorway_id}` | `delete_style_colorway` | - |
| GET | `/styles/{style_id}/size-scales` | `list_style_size_scales` | - |
| POST | `/styles/{style_id}/size-scales` | `create_style_size_scale` | - |
| PATCH | `/styles/{style_id}/size-scales/{scale_id}` | `update_style_size_scale` | - |
| DELETE | `/styles/{style_id}/size-scales/{scale_id}` | `delete_style_size_scale` | - |

**File:** `merch\routers\tna.py`  
**Prefix:** `N/A`  
**Endpoints:** 21

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/followup-templates` | `list_followup_templates` | - |
| GET | `/followup-templates/{template_id}` | `get_followup_template` | - |
| POST | `/followup-templates` | `create_followup_template` | - |
| PATCH | `/followup-templates/{template_id}` | `update_followup_template` | - |
| DELETE | `/followup-templates/{template_id}` | `delete_followup_template` | - |
| GET | `/followup-actions` | `list_followup_actions` | - |
| GET | `/followup-actions/summary` | `get_followup_actions_summary` | - |
| GET | `/followup-actions/search` | `search_followup_actions` | - |
| GET | `/followup-actions/order/{order_id}/timeline` | `get_followup_actions_timeline` | - |
| POST | `/followup-actions/generate` | `generate_followup_actions` | Generate TNA action lines for an order from templates. Planned dates = delivery_date - default_days_ |
| GET | `/followup-actions/overdue` | `list_overdue_followup_actions` | - |
| GET | `/followup-actions/{action_id}/rejection-history` | `get_followup_action_rejection_history` | - |
| POST | `/followup-actions/{action_id}/rejection-history` | `add_followup_action_rejection_log` | - |
| GET | `/followup-actions/{action_id}` | `get_followup_action` | - |
| GET | `/followup-actions/{action_id}/comments` | `get_followup_action_comments` | - |
| POST | `/followup-actions/{action_id}/comments` | `create_followup_action_comment` | - |
| POST | `/followup-actions` | `create_followup_action` | - |
| PATCH | `/followup-actions/{action_id}` | `update_followup_action` | - |
| POST | `/followup-actions/{action_id}/complete` | `complete_followup_action` | - |
| POST | `/followup-actions/{action_id}/reopen` | `reopen_followup_action` | - |
| DELETE | `/followup-actions/{action_id}` | `delete_followup_action` | - |

**File:** `merch\routers\wastage.py`  
**Prefix:** `N/A`  
**Endpoints:** 14

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/reports/wastage` | `get_wastage_report` | - |
| GET | `/reports/wastage/summary` | `get_wastage_summary` | Aggregate wastage: KPIs (total value, fabric/trim avg %, above-threshold count) and by_style. |
| GET | `/reports/wastage/reasons` | `get_wastage_reasons` | List wastage reason codes for the tenant (for filters and reason breakdown). Seeds from default taxo |
| GET | `/reports/wastage/trends` | `get_wastage_trends` | Trends: wastage value grouped by month, buyer, or material group (category). |
| POST | `/reports/wastage/transactions` | `create_wastage_transaction` | Record a wastage transaction for an order (process stage and optional reason). |
| GET | `/reports/wastage/export` | `export_wastage_report` | - |
| GET | `/reports/wastage/thresholds` | `list_wastage_thresholds` | List wastage threshold rules for the tenant (for badge and config). |
| POST | `/reports/wastage/thresholds` | `create_wastage_threshold` | Create a wastage threshold rule (tenant, buyer, order_type, or material_type scope). |
| GET | `/reports/wastage/views` | `list_wastage_views` | List saved filter views for wastage report (current user). |
| POST | `/reports/wastage/views` | `create_wastage_view` | Save current filter state as a named wastage report view. |
| DELETE | `/reports/wastage/views/{view_id}` | `delete_wastage_view` | Delete a saved wastage report view. |
| GET | `/reports/wastage/management-summary` | `get_wastage_management_summary` | Management summary: top 10 orders, top 10 materials, top reasons, month-over-month, suggested action |
| POST | `/reports/wastage/refresh-summary` | `refresh_wastage_order_summary` | Recompute and store wastage order summaries for the tenant (optional date range). Used for managemen |
| GET | `/reports/wastage/order/{order_id}` | `get_wastage_order_detail` | Detail for one order: BOM lines with planned/actual/variance and linked alert IDs. |

### orders

**File:** `orders\change_request_router.py`  
**Prefix:** `N/A`  
**Endpoints:** 11

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/change-requests` | `post_change_request` | - |
| GET | `/change-requests/pending-summary` | `get_pending_summary` | - |
| GET | `/change-requests/{cr_id}` | `get_one_change_request` | - |
| GET | `/orders/{order_id}/change-requests` | `list_order_change_requests` | - |
| GET | `/orders/{order_id}/commercial-timeline` | `get_order_commercial_timeline` | - |
| GET | `/quotations/{quotation_id}/change-requests` | `list_quotation_change_requests` | - |
| GET | `/quotations/{quotation_id}/commercial-timeline` | `get_quotation_commercial_timeline` | - |
| POST | `/change-requests/{cr_id}/approve` | `post_approve` | - |
| POST | `/change-requests/{cr_id}/reject` | `post_reject` | - |
| POST | `/change-requests/{cr_id}/apply` | `post_apply` | - |
| POST | `/change-requests/{cr_id}/cancel` | `post_cancel` | - |

**File:** `orders\order_ai_router.py`  
**Prefix:** `N/A`  
**Endpoints:** 21

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/extract` | `order_ai_extract` | - |
| POST | `/enrich` | `order_ai_enrich` | - |
| POST | `/validate` | `order_ai_validate` | - |
| POST | `/validate-execution` | `order_ai_validate_execution` | - |
| POST | `/planning-risk-check` | `order_ai_planning_risk_check` | - |
| POST | `/atp-ctp-summary` | `order_ai_atp_ctp_summary` | - |
| POST | `/dedupe` | `order_ai_dedupe` | - |
| POST | `/summary` | `order_ai_summary` | - |
| POST | `/next-actions` | `order_ai_next_actions` | - |
| POST | `/capacity-bottleneck-scan` | `order_ai_capacity_bottleneck_scan` | - |
| POST | `/what-if-simulation` | `order_ai_what_if_simulation` | - |
| POST | `/promise-sensitivity-check` | `order_ai_promise_sensitivity_check` | - |
| POST | `/planning-summary` | `order_ai_execution_planning_summary` | - |
| GET | `/audit-log` | `order_ai_audit_log` | - |
| GET | `/planning-audit-log` | `order_ai_planning_audit_log` | - |
| GET | `/simulation-audit-log` | `order_ai_simulation_audit_log` | - |
| POST | `/suggestion-batch/mark-decisions` | `order_ai_suggestion_mark_decisions` | - |
| POST | `/suggestion-batch/apply-suggestions` | `order_ai_suggestion_apply` | - |
| POST | `/suggestion-batch/discard` | `order_ai_suggestion_discard` | - |
| POST | `/suggestion-batch/link-order` | `order_ai_suggestion_link` | - |
| POST | `/suggestion-batch/finalize-after-create` | `order_ai_suggestion_finalize_create` | - |

**File:** `orders\router.py`  
**Prefix:** `/orders`  
**Endpoints:** 18

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `` | `list_orders` | - |
| GET | `/paginated` | `list_orders_paginated` | - |
| POST | `` | `create_order` | - |
| GET | `/promise-summary` | `get_orders_promise_summary` | - |
| GET | `/planning-grounding-summary` | `get_planning_grounding_summary` | - |
| GET | `/{order_id}/materials` | `get_order_materials` | PrimeX-style alias: same payload as GET /api/v1/merch/orders/{order_id}/material-requirement. |
| GET | `/{order_id}` | `get_order` | - |
| GET | `/{order_id}/commercial-alignment` | `get_order_commercial_alignment` | Read-only quotation↔order commercial comparison (no mutations). |
| GET | `/{order_id}/promise-check` | `get_order_promise_check` | - |
| GET | `/{order_id}/planning-grounding` | `get_order_planning_grounding` | - |
| PATCH | `/{order_id}` | `update_order` | - |
| DELETE | `/{order_id}` | `delete_order` | - |
| POST | `/from-quotation/{quotation_id}` | `create_order_from_quotation` | Convert a quotation into a basic order, similar to the reference workflow. |
| GET | `/{order_id}/milestones` | `get_order_milestones` | - |
| PATCH | `/{order_id}/pipeline-settings` | `patch_order_pipeline_settings` | - |
| PATCH | `/{order_id}/status` | `update_order_status` | - |
| GET | `/{order_id}/amendments` | `list_order_amendments` | - |
| POST | `/{order_id}/amendments` | `create_order_amendment` | - |

### parties

**File:** `parties\router.py`  
**Prefix:** `/parties`  
**Endpoints:** 9

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/intermediaries` | `list_intermediaries` | - |
| POST | `/intermediaries` | `create_intermediary` | - |
| GET | `/intermediaries/{intermediary_id}` | `get_intermediary` | - |
| PATCH | `/intermediaries/{intermediary_id}` | `update_intermediary` | - |
| DELETE | `/intermediaries/{intermediary_id}` | `delete_intermediary` | - |
| GET | `/customer-intermediaries` | `list_customer_intermediaries` | - |
| POST | `/customer-intermediaries` | `create_customer_intermediary` | - |
| PATCH | `/customer-intermediaries/{link_id}` | `update_customer_intermediary` | - |
| DELETE | `/customer-intermediaries/{link_id}` | `delete_customer_intermediary` | - |

### production

**File:** `production\costing_router.py`  
**Prefix:** `/production/costs`  
**Endpoints:** 8

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/daily` | `post_daily_cost` | - |
| GET | `/cm-analysis` | `cm_analysis` | - |
| POST | `/cm-recalc` | `cm_recalc` | Recompute CM actuals from sewing hourly output and daily production cost (pooled by output share). |
| GET | `/cm-alerts` | `cm_alerts` | - |
| GET | `/overhead-config` | `list_overhead_config` | - |
| PUT | `/overhead-config` | `upsert_overhead_config` | - |
| POST | `/wip-journal` | `create_wip_journal` | - |
| GET | `/wip-journal` | `list_wip` | - |

**File:** `production\crew_router.py`  
**Prefix:** `/production`  
**Endpoints:** 16

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/crew-roles` | `list_crew_roles` | - |
| POST | `/crew-roles` | `create_crew_role` | - |
| PATCH | `/crew-roles/{crew_role_id}` | `update_crew_role` | - |
| DELETE | `/crew-roles/{crew_role_id}` | `delete_crew_role` | - |
| GET | `/hr-available` | `get_hr_available` | - |
| GET | `/hr-employees` | `list_hr_employees_for_picker` | - |
| GET | `/sewing-lines/{line_id}/crew-template` | `get_line_crew_template` | - |
| PUT | `/sewing-lines/{line_id}/crew-template` | `put_line_crew_template` | - |
| GET | `/units/{department_type}/crew-template` | `get_unit_crew_template` | - |
| PUT | `/units/{department_type}/crew-template` | `put_unit_crew_template` | - |
| GET | `/crew-daily` | `get_crew_daily` | - |
| POST | `/crew-daily/init-from-template` | `init_crew_daily_from_template` | - |
| PUT | `/crew-daily` | `put_crew_daily` | - |
| GET | `/crew-daily/substitute-suggestions` | `crew_substitute_suggestions` | Flag named roles where the assignee is on approved leave; suggest substitutes from the same pool. |
| POST | `/crew-daily/sync-attendance` | `sync_crew_attendance` | - |
| GET | `/crew-daily/filters` | `crew_daily_filter_defaults` | - |

**File:** `production\cutting_router.py`  
**Prefix:** `/production/cutting`  
**Endpoints:** 8

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/marker-plans` | `create_marker` | - |
| GET | `/marker-plans` | `list_markers` | - |
| POST | `/cut-tickets/{ticket_id}/generate-bundles` | `generate_bundles` | Generate bundles from JSON lines: [{size, color, qty_in_bundle, bundle_count?}] or default one bundl |
| GET | `/bundles/lookup/{barcode}` | `lookup_bundle` | - |
| POST | `/bundles/issue` | `issue_bundles` | - |
| GET | `/bundles/barcode-pdf/{cut_ticket_id}` | `bundles_pdf` | - |
| POST | `/lay-plans` | `create_lay` | - |
| POST | `/cut-tickets` | `create_cut_ticket` | - |

**File:** `production\dashboard_router.py`  
**Prefix:** `/production`  
**Endpoints:** 1

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/dashboard` | `production_dashboard` | - |

**File:** `production\dept_router.py`  
**Prefix:** `/production/departments`  
**Endpoints:** 2

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/plans` | `list_plans` | - |
| POST | `/plans` | `create_plan` | - |

**File:** `production\dyeing_router.py`  
**Prefix:** `/production/dyeing`  
**Endpoints:** 4

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/recipes` | `list_recipes` | - |
| POST | `/recipes` | `create_recipe` | - |
| GET | `/batches` | `list_batches` | - |
| POST | `/batches` | `create_batch` | - |

**File:** `production\hourly_router.py`  
**Prefix:** `/production/hourly`  
**Endpoints:** 3

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/upsert` | `upsert_hourly` | - |
| GET | `/sheet` | `get_sheet` | - |
| GET | `/summary` | `summary` | - |

**File:** `production\ie_router.py`  
**Prefix:** `/production/ie`  
**Endpoints:** 5

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/operations` | `list_ie_operations` | - |
| POST | `/operations` | `create_ie_operation` | - |
| POST | `/bulletins` | `create_ob` | - |
| GET | `/bulletins` | `list_obs` | - |
| POST | `/line-balance` | `line_balance` | - |

**File:** `production\knitting_router.py`  
**Prefix:** `/production/knitting`  
**Endpoints:** 14

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/plans` | `list_plans` | - |
| POST | `/plans` | `create_plan` | - |
| GET | `/charge-rates` | `list_charge_rates` | - |
| POST | `/charge-rates` | `create_charge_rate` | - |
| PATCH | `/charge-rates/{rate_id}` | `patch_charge_rate` | - |
| GET | `/charge-preview` | `charge_preview` | - |
| GET | `/work-orders` | `list_work_orders` | - |
| POST | `/work-orders` | `create_work_order` | - |
| GET | `/work-orders/{wo_id}` | `get_work_order` | - |
| PATCH | `/work-orders/{wo_id}` | `patch_work_order` | - |
| POST | `/work-orders/{wo_id}/link-documents` | `link_work_order_documents` | Associate inventory delivery challan / gate pass QR documents with this WO (create docs from Invento |
| POST | `/work-orders/{wo_id}/process-order` | `create_linked_process_order` | Create a drafting knitting process order wired to yarns → greige; complete issue/receive in Inventor |
| POST | `/work-orders/{wo_id}/refresh-status` | `refresh_work_order_status_from_process_order` | - |
| GET | `/dashboard-stats` | `knitting_dashboard_stats` | - |

**File:** `production\lines_router.py`  
**Prefix:** `/production`  
**Endpoints:** 6

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/sewing-lines` | `list_sewing_lines` | - |
| POST | `/sewing-lines` | `create_sewing_line` | - |
| PATCH | `/sewing-lines/{line_id}` | `update_sewing_line` | - |
| DELETE | `/sewing-lines/{line_id}` | `delete_sewing_line` | - |
| GET | `/machines` | `list_machines` | - |
| POST | `/machines` | `create_machine` | - |

**File:** `production\planning_router.py`  
**Prefix:** `/production`  
**Endpoints:** 21

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/plan-board` | `get_plan_board` | - |
| POST | `/plan-board/assign` | `assign_style` | - |
| POST | `/reservations/propose` | `reservations_propose` | - |
| POST | `/reservations/{config_id}/confirm-soft` | `reservations_confirm_soft` | - |
| POST | `/reservations/{config_id}/confirm-firm` | `reservations_confirm_firm` | - |
| POST | `/reservations/{config_id}/release` | `reservations_release` | - |
| POST | `/replan/material-delay` | `replan_material_delay` | - |
| PUT | `/plan-board/{config_id}/move` | `move_config` | - |
| GET | `/plan-board/suggest` | `suggest_plan` | - |
| GET | `/plan-board/readiness/{order_id}` | `readiness` | - |
| GET | `/planning/pipeline` | `get_planning_pipeline` | - |
| GET | `/planning/pipeline/{order_id}/readiness` | `get_planning_order_readiness` | - |
| POST | `/planning/ai/analyze` | `ai_analyze_pipeline` | - |
| POST | `/planning/ai/suggest-allocation` | `ai_suggest_allocation` | - |
| POST | `/planning/ai/predict-move` | `ai_predict_move` | - |
| POST | `/planning/ai/optimize` | `ai_optimize` | - |
| GET | `/planning/ai/risk-alerts` | `ai_risk_alerts` | - |
| GET | `/planning/ai/efficiency-forecast` | `ai_efficiency_forecast` | 30-day hourly production aggregates + Gemini narrative for next-week focus. |
| POST | `/planning/advisory/capacity-sequencing` | `planning_advisory_capacity_sequencing` | Phase 14: deterministic advisory capacity proxy vs sequencing hints (no mutations). |
| GET | `/planning/ai/settings` | `get_ai_planning_settings` | - |
| PUT | `/planning/ai/settings` | `put_ai_planning_settings` | - |

**File:** `production\quality_router.py`  
**Prefix:** `/production/quality`  
**Endpoints:** 6

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/defect-codes` | `list_defect_codes` | - |
| POST | `/defect-codes` | `create_defect_code` | - |
| DELETE | `/defect-codes/{code_id}` | `delete_defect_code` | - |
| GET | `/checks` | `list_qc_checks` | - |
| PUT | `/checks` | `upsert_qc_check` | - |
| DELETE | `/checks/{check_id}` | `delete_qc_check` | - |

**File:** `production\roster_router.py`  
**Prefix:** `/production`  
**Endpoints:** 6

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/roster-weekly` | `list_roster_weekly` | - |
| PUT | `/roster-weekly/cell` | `upsert_roster_cell` | - |
| POST | `/roster-weekly/generate-daily` | `generate_daily_from_roster` | Copy roster cells for the weekday of target_date into line_crew_daily (merge). |
| GET | `/line-crew-sheet/status` | `get_line_crew_sheet_status` | - |
| POST | `/line-crew-sheet/status` | `update_line_crew_sheet_status` | - |
| GET | `/employees/{employee_id}/production-profile` | `employee_production_profile` | - |

**File:** `production\router.py`  
**Prefix:** `N/A`  
**Endpoints:** 0

*No endpoints found (possibly a sub-router or imports only).*

**File:** `production\settings_router.py`  
**Prefix:** `/production`  
**Endpoints:** 12

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/factory-profiles` | `list_factory_profiles` | - |
| GET | `/settings` | `get_production_settings` | - |
| PUT | `/settings` | `update_production_settings` | - |
| GET | `/shifts` | `list_shifts` | - |
| POST | `/shifts` | `create_shift` | - |
| PATCH | `/shifts/{shift_id}` | `update_shift` | - |
| DELETE | `/shifts/{shift_id}` | `delete_shift` | - |
| GET | `/calendar` | `list_calendar` | - |
| GET | `/calendar/country-holidays` | `preview_country_holidays` | - |
| POST | `/calendar/import-holidays` | `import_country_holidays` | - |
| POST | `/calendar` | `upsert_calendar` | - |
| DELETE | `/calendar/{override_id}` | `delete_calendar` | - |

**File:** `production\skills_router.py`  
**Prefix:** `/production/skills`  
**Endpoints:** 4

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `` | `list_worker_skills` | - |
| POST | `` | `create_worker_skill` | - |
| PATCH | `/{skill_id}` | `patch_worker_skill` | - |
| DELETE | `/{skill_id}` | `delete_worker_skill` | - |

### quotations

**File:** `quotations\quotation_ai_router.py`  
**Prefix:** `N/A`  
**Endpoints:** 26

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/extract` | `quotation_ai_extract` | - |
| POST | `/enrich` | `quotation_ai_enrich` | - |
| POST | `/validate` | `quotation_ai_validate` | - |
| POST | `/dedupe` | `quotation_ai_dedupe` | - |
| POST | `/summary` | `quotation_ai_summary` | - |
| POST | `/next-actions` | `quotation_ai_next_actions` | - |
| GET | `/audit-log` | `quotation_ai_audit_log` | - |
| POST | `/cost-completeness-check` | `quotation_costing_completeness_check` | - |
| POST | `/costing-anomaly-scan` | `quotation_costing_anomaly_scan` | - |
| POST | `/margin-risk-explanation` | `quotation_costing_margin_risk` | - |
| POST | `/fx-sensitivity-summary` | `quotation_costing_fx_sensitivity` | - |
| POST | `/costing-summary` | `quotation_costing_summary` | - |
| POST | `/costing-next-actions` | `quotation_costing_next_actions` | - |
| POST | `/costing-suggestions` | `quotation_costing_suggestions_generate` | - |
| POST | `/costing-suggestions/mark-decisions` | `quotation_costing_suggestions_mark` | - |
| POST | `/costing-suggestions/apply` | `quotation_costing_suggestions_apply` | - |
| POST | `/costing-suggestions/discard` | `quotation_costing_suggestions_discard` | - |
| GET | `/costing-suggestions/{batch_id}` | `quotation_costing_suggestions_get` | - |
| POST | `/cost-benchmark` | `quotation_cost_benchmark` | - |
| GET | `/cost-benchmark-history` | `quotation_cost_benchmark_history` | - |
| GET | `/costing-audit-log` | `quotation_costing_audit_log` | - |
| POST | `/suggestion-batch/mark-decisions` | `quotation_ai_suggestion_mark_decisions` | - |
| POST | `/suggestion-batch/apply-suggestions` | `quotation_ai_suggestion_apply` | - |
| POST | `/suggestion-batch/discard` | `quotation_ai_suggestion_discard` | - |
| POST | `/suggestion-batch/link-quotation` | `quotation_ai_suggestion_link` | - |
| POST | `/suggestion-batch/finalize-after-create` | `quotation_ai_suggestion_finalize_create` | - |

**File:** `quotations\router.py`  
**Prefix:** `/quotations`  
**Endpoints:** 12

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `` | `list_quotations` | - |
| GET | `/paginated` | `list_quotations_paginated` | - |
| POST | `/{quotation_id}/submit` | `submit_quotation` | - |
| POST | `/{quotation_id}/approve` | `approve_quotation` | - |
| POST | `/{quotation_id}/send` | `send_quotation` | - |
| POST | `/{quotation_id}/revise` | `revise_quotation` | - |
| POST | `/from-inquiry/{inquiry_id}` | `create_quotation_from_inquiry` | Convert an inquiry into a basic quotation, similar to the reference workflow. |
| POST | `` | `create_quotation` | - |
| GET | `/{quotation_id}` | `get_quotation` | Get quotation by ID with full cost breakdown (materials, manufacturing, other costs, size ratios). |
| PATCH | `/{quotation_id}` | `update_quotation` | - |
| PUT | `/{quotation_id}` | `full_update_quotation` | Full update: header + materials, manufacturing, other costs, size ratios. Recomputes cost totals. |
| DELETE | `/{quotation_id}` | `delete_quotation` | - |

### reports

**File:** `reports\router.py`  
**Prefix:** `/reports`  
**Endpoints:** 5

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/tenant-overview` | `tenant_overview` | Simple overview report for the current tenant. |
| GET | `/customer-performance` | `customer_performance` | Very lightweight customer performance report (orders per customer). |
| GET | `/purchase-orders` | `report_purchase_orders` | List purchase orders for report (PO code, supplier, dates, status). |
| GET | `/grn` | `report_grn` | List goods receiving notes for report. |
| GET | `/sales-orders` | `report_sales_orders` | List sales orders (Order) with customer name for report. |

### roles

**File:** `roles\router.py`  
**Prefix:** `/roles`  
**Endpoints:** 1

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `` | `list_roles` | List roles for the current tenant. |

### settings

**File:** `settings\router.py`  
**Prefix:** `/settings`  
**Endpoints:** 20

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/config` | `get_settings_config` | - |
| PUT | `/config` | `update_settings_config` | - |
| GET | `/permissions-registry` | `get_permissions_registry` | Return the canonical permission tree for the Roles UI (admin only). |
| GET | `/roles` | `list_settings_roles` | - |
| POST | `/roles` | `create_settings_role` | - |
| PATCH | `/roles/{role_id}` | `update_settings_role` | - |
| DELETE | `/roles/{role_id}` | `delete_settings_role` | - |
| GET | `/users` | `list_settings_users` | - |
| POST | `/users` | `create_settings_user` | - |
| PATCH | `/users/{target_user_id}` | `update_settings_user` | - |
| POST | `/users/{target_user_id}/deactivate` | `deactivate_settings_user` | - |
| POST | `/users/{target_user_id}/activate` | `activate_settings_user` | - |
| DELETE | `/users/{target_user_id}` | `delete_settings_user` | - |
| GET | `/audit` | `list_settings_audit_logs` | - |
| GET | `/backup/history` | `list_backup_history` | - |
| POST | `/backup/restore/{backup_log_id}` | `trigger_backup_restore` | - |
| GET | `/backup/status` | `get_backup_status` | - |
| POST | `/backup/trigger` | `trigger_backup` | - |
| GET | `/pricing` | `get_settings_pricing` | Stub: return current plan/subscription for the tenant. |
| GET | `/cheque-templates` | `list_settings_cheque_templates` | Stub: list cheque templates for the tenant (empty until implemented). |

### staff_invite

**File:** `staff_invite\router.py`  
**Prefix:** `N/A`  
**Endpoints:** 3

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `/users/invite` | `invite_staff_user` | - |
| GET | `/users/invitations` | `list_staff_invite_rows` | - |
| DELETE | `/users/invitations/{invitation_id}` | `cancel_staff_invite` | - |

### support

**File:** `support\router.py`  
**Prefix:** `/support`  
**Endpoints:** 4

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/tickets` | `list_tenant_tickets` | - |
| GET | `/tickets/{tid}` | `get_tenant_ticket` | - |
| POST | `/tickets` | `create_tenant_ticket` | - |
| POST | `/tickets/{tid}/messages` | `add_tenant_message` | - |

### tenant

**File:** `tenant\router.py`  
**Prefix:** `/tenants`  
**Endpoints:** 2

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| POST | `` | `create_tenant` | Create a new tenant (e.g. for sign-up). No auth required for public sign-up flow. |
| GET | `/me` | `get_my_tenant` | Return current tenant (from X-Tenant-Id). Use after login to show tenant name and type in UI. |

### tna_unified

**File:** `tna_unified\router.py`  
**Prefix:** `/tna-unified`  
**Endpoints:** 3

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `/actions` | `list_unified_actions` | - |
| GET | `/summary` | `get_unified_summary` | - |
| GET | `/ai/followup-insights` | `tna_followup_ai_insights` | Phase 15: advisory delay risk and ownership gaps (no mutations). |

### trade_case

**File:** `trade_case\router.py`  
**Prefix:** `/trade-cases`  
**Endpoints:** 15

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `` | `list_trade_cases` | - |
| GET | `/document-counts` | `trade_document_and_shipment_counts` | Per trade_case_id: document count and shipment count (for Document Flow and dashboards). |
| POST | `` | `create_trade_case` | - |
| GET | `/{trade_case_id}` | `get_trade_case` | - |
| PATCH | `/{trade_case_id}` | `update_trade_case` | - |
| GET | `/{trade_case_id}/stages` | `list_trade_case_stages` | - |
| POST | `/stages` | `create_trade_case_stage` | - |
| GET | `/{trade_case_id}/stage-log` | `list_trade_case_stage_log` | - |
| POST | `/{trade_case_id}/transition` | `transition_trade_case` | - |
| POST | `/{trade_case_id}/documents` | `upload_trade_document` | - |
| GET | `/{trade_case_id}/documents` | `list_trade_documents` | - |
| DELETE | `/{trade_case_id}/documents/{document_id}` | `delete_trade_document` | Delete a trade document. Allowed only when the trade case status is DRAFT. |
| GET | `/{trade_case_id}/documents/{document_id}/download` | `download_trade_document` | - |
| GET | `/{trade_case_id}/margin` | `get_trade_case_margin` | - |
| GET | `/dashboard/summary` | `get_trade_dashboard_summary` | - |

### users

**File:** `users\router.py`  
**Prefix:** `/users`  
**Endpoints:** 2

| Method | Path | Function | Description |
|--------|------|----------|-------------|
| GET | `` | `list_users` | List users for the current tenant. |
| GET | `/me` | `get_me` | Get current user with role. X-Tenant-Id must match user's tenant. |


## Modules Without Routers (Backend-only)

- `master_data_ai`
- `mcp_server`

## Frontend-Backend Coverage Analysis

### Backend modules WITH frontend pages

- **admin** (111 endpoints) — Partial
- **ai_extract** (2 endpoints) — Partial
- **ai_tool** (40 endpoints) — Partial
- **audit** (1 endpoints) — Partial
- **commercial** (25 endpoints) — Yes
- **control_tower** (4 endpoints) — Partial
- **costing** (4 endpoints) — Partial
- **currency** (6 endpoints) — Partial
- **customers** (23 endpoints) — Yes
- **dashboard** (14 endpoints) — Partial
- **erp_ai_phases** (7 endpoints) — Partial
- **facility** (26 endpoints) — Partial
- **finance** (130 endpoints) — Yes
- **hr** (26 endpoints) — Yes
- **hr_attendance** (24 endpoints) — Partial
- **hr_ess** (9 endpoints) — Partial
- **hr_leave** (17 endpoints) — Partial
- **hr_payroll** (29 endpoints) — Partial
- **hr_performance** (13 endpoints) — Partial
- **hr_recruitment** (16 endpoints) — Partial
- **hr_reports** (4 endpoints) — Partial
- **inquiries** (20 endpoints) — Yes
- **inventory** (133 endpoints) — Yes
- **logistics** (4 endpoints) — Yes
- **manufacturing** (63 endpoints) — Yes
- **merch** (149 endpoints) — Yes
- **orders** (50 endpoints) — Yes
- **parties** (9 endpoints) — Yes
- **production** (116 endpoints) — Yes
- **quotations** (38 endpoints) — Yes
- **reports** (5 endpoints) — Yes
- **settings** (20 endpoints) — Partial
- **support** (4 endpoints) — Yes
- **tna_unified** (3 endpoints) — Partial
- **trade_case** (15 endpoints) — Partial

### Backend modules WITHOUT frontend pages

- **announcements** (1 endpoints)
- **auth** (7 endpoints)
- **billing_lemonsqueezy** (2 endpoints)
- **compliance** (7 endpoints)
- **data_migration** (3 endpoints)
- **files** (1 endpoints)
- **roles** (1 endpoints)
- **staff_invite** (3 endpoints)
- **tenant** (2 endpoints)
- **users** (2 endpoints)

### Frontend pages without clear backend module

- **accountgroups**
- **accountingperiods**
- **accounts**
- **advanceoptions**
- **allapprovals**
- **appcomingsoon**
- **arapagingreport**
- **bankaccounts**
- **bankreconciliation**
- **bombuilder**
- **budgets**
- **cashflowcalendar**
- **cashflowreport**
- **cashforecast**
- **chartofaccounts**
- **consumptioncontrol**
- **consumptionplans**
- **consumptionreconciliation**
- **costcenters**
- **crm**
- **customercreate**
- **customerdetail**
- **customeredit**
- **daybook**
- **deliverychallan**
- **deliverychallandetail**
- **deliverychallans**
- **enhancedgatepasses**
- **financialstatements**
- **flow**
- **followup**
- **fxreceipts**
- **gatepass**
- **gatepassdetail**
- **goodsreceiving**
- **groupsummary**
- **inquiry**
- **inquirycreate**
- **inquirydetail**
- **ledgeractivity**
- **lottraceability**
- **operations**
- **ordercreate**
- **orderdetail**
- **outstandingbills**
- **paymentadvice**
- **paymentruns**
- **pipelineanalytics**
- **placeholder**
- **profitability**
- **purchaseworkflow**
- **quotationdetail**
- **ratioanalysis**
- **stockadjustments**
- **stockgroups**
- **stockledger**
- **stocksummary**
- **stockvaluation**
- **style**
- **styledetail**
- **styles**
- **trialbalance**
- **tutorials**
- **vendors**
- **voucher**
- **voucheranalytics**
- **voucherapprovals**
- **voucherdetail**
- **voucherprint**
- **vouchers**
- **warehousetransfers**
- **wastagereport**
