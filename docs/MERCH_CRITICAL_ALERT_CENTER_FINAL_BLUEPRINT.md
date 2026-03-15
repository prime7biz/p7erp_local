# Advanced Critical Alert Center – Final Blueprint

**Product:** P7 ERP · **Module:** Merchandising · **Route:** `/app/merchandising/alerts`  
**Purpose:** Enterprise-grade operational control center for merchandising risk, order delay, shipment failure, costing exception, approval blockage, material shortage, TNA slippage, and commercial dependency monitoring.

This document is the **consolidated output** of the Architect and four specialized sub-agents. It serves as the single development blueprint for implementation.

---

## 1. Architect Summary

### Scope

- **In scope:** A full Advanced Critical Alert Center page that aggregates, prioritizes, and drives action on merchandising alerts. Alerts are **persisted**, have a **lifecycle** (New → Acknowledged → In Progress → … → Resolved), support **comments**, **assignment**, **snooze**, and **escalation**. The page includes KPIs, advanced filters, table/card views, a detail drawer, bulk actions, and (optionally) saved views and user settings.
- **Out of scope for MVP:** AI-assisted summaries, predictive delay scores, and tenant-defined custom alert templates (can be Phase 2/3).
- **Existing workflow:** All current merchandising flows (orders, quotations, follow-ups, pipeline, wastage report) remain unchanged. The alert center **consumes** existing data and **adds** a rule engine and alert persistence layer.

### Architecture

- **Information hierarchy:** (1) Page header with counts and actions → (2) KPI band (Critical / High / Medium / Low / Total) → (3) Filters → (4) View switcher → (5) Main content (table or cards) → (6) Detail drawer on row/card click.
- **Data flow:** Backend runs rule engine (event + scheduled) → writes/updates `alert_instance` with deduplication by natural key → API serves list (filtered, sorted, paginated) and detail → frontend uses URL for filters, React state for selection/drawer, React Query for server state.
- **State model:** Alerts have status (New, Acknowledged, In Progress, Waiting on Buyer, Waiting on Supplier, Resolved, Closed, Snoozed, Escalated). Severity can be Critical/High/Medium/Low/Informational. Priority score (see §11) drives sort order.
- **Performance:** Server-side filter/sort/pagination; list API returns summary counts; drawer detail and lazy sections (timeline, comments, related) loaded on demand; scheduled scan every 15 min so list is precomputed.
- **Permission model:** Role-aware visibility (my alerts, team alerts, escalated, management-only high risk) enforced in API; frontend shows/hides filters and views by role.

### API Contract (high level)

- **List:** `GET /api/v1/merch/alerts` with query params for severity, status, alert_type, buyer_id, order_id, date range, owner_id, sort, page, page_size. Response: `{ items, total, page, page_size }` plus optional inline summary.
- **Detail:** `GET /api/v1/merch/alerts/{id}` for drawer (summary, linked order, root cause, recommended action, assignee, status).
- **Mutations:** PATCH status, POST snooze, POST assign, POST escalate, POST comment; GET comments, GET history.
- **Summary:** `GET /api/v1/merch/alerts/summary` with same filters for KPI band.
- **Scan:** `POST /api/v1/merch/alerts/scan` to run rule engine on demand.
- **Saved views (optional):** GET/POST/DELETE alert views (filter presets).

### Sub-Agent Outputs Merged

- **Domain (Sub-Agent 1):** Alert taxonomy A–H + 8 extra garments-specific types; severity rules; aging and escalation for follow-up, TNA, margin; action flow and tenant-configurable thresholds. → See `docs/CRITICAL_ALERT_CENTER_BLUEPRINT_DOMAIN.md`.
- **UX/UI (Sub-Agent 2):** Six-section layout; responsive (desktop/tablet/mobile); components (KPI cards, filters, table, cards, drawer, bulk toolbar, empty/loading/error); severity and status colors; design tokens. → See `docs/ALERTS_CENTER_UX_UI_SPEC.md`.
- **Frontend (Sub-Agent 3):** Component tree (page, header, KPI, toolbar, table/cards, drawer, modals); state (URL + React + React Query); reusable widgets (SeverityBadge, StatusBadge, AgingIndicator, etc.); table columns and drawer sections (core vs lazy). → See `docs/MERCH_ALERT_CENTER_FRONTEND_BLUEPRINT.md`.
- **Backend (Sub-Agent 4):** Data model (alert_definition, alert_instance, alert_history, alert_comment, alert_related_entity, etc.); API list; hybrid rule engine; deduplication; APScheduler jobs; notification hook payload; indexes. → See `docs/ALERT_ENGINE_BACKEND_BLUEPRINT.md`.

---

## 2. Sub-Agent 1 Findings – Domain & Workflow

- **Alert taxonomy (A–H):** Order & TNA (5 types), Costing/Quotation (5), Sampling (4), Material Readiness (5), Commercial/Document (4), Production & Shipment (5), Communication/Follow-up (4), Data Quality (5). Each with trigger condition, table/field, severity, and recommended action.
- **Additional types:** Lab-dip by color, size set delay, trim card approval, PP sample overdue, fabric booking before lab-dip, multiple amendments, buyer handover delay, duplicate follow-up same day.
- **Risk & escalation:** Three worked examples (follow-up overdue, order missing TNA, quotation margin below threshold) with aging, escalation SLA, and countdown.
- **Severity rules:** Critical = delivery/money/quality at risk now or within ~2 weeks; High = will become critical in ~2–4 weeks or blocks milestone; Medium/Low/Informational defined.
- **Action flow:** State transitions and who can do what (New → Acknowledged → In Progress → Waiting on Buyer/Supplier → Resolved; Snoozed, Escalated).
- **Tenant-configurable:** 16 keys (e.g. margin_below_pct, quotation_pending_days, followup_overdue_critical_days, wastage_threshold_pct, tna_days_before_delivery, escalation_ack_sla_days).

**Full detail:** `docs/CRITICAL_ALERT_CENTER_BLUEPRINT_DOMAIN.md`

---

## 3. Sub-Agent 2 Findings – UX/UI

- **Layout:** Header (title, counts, last scan, Refresh, Run scan, Save view, Export, Settings) → KPI band (5 cards) → collapsible filter panel → view switcher (Table | Cards | Split) → main content → right drawer (400px).
- **Responsive:** Desktop ≥1024px full layout; tablet 768–1023px simplified columns, drawer overlay or bottom sheet; mobile &lt;768px cards only, filters in modal, detail full-screen or bottom sheet.
- **Components:** KPI cards, filter chips, dropdowns, table (sticky header, optional sticky column, row expand), card grid, drawer sections (Summary, Timeline, Comments, Related, Actions), bulk toolbar, empty/loading/error/no-results.
- **Color:** Severity = red / orange / amber / blue / gray (50 bg + 700 text); status separate (New=blue, In progress=amber, Resolved=gray).
- **Copy:** “No alerts”, “No matching alerts” + Clear filters, skeleton for loading, “Couldn’t load alerts” + Retry.
- **Tokens:** 8px cards, 6px buttons; sm/md/lg shadows; typography and spacing specified.

**Full detail:** `docs/ALERTS_CENTER_UX_UI_SPEC.md`

---

## 4. Sub-Agent 3 Findings – Frontend Engineering

- **Component tree:** MerchCriticalAlertsPage → AlertsPageHeader, AlertsKpiBand, AlertsToolbar (FilterPanel, ViewSwitcher, SavedViewsDropdown), AlertsBulkToolbar, AlertsTable | AlertsCardGrid, AlertsDetailDrawer, SaveViewModal, AlertSettingsModal.
- **State:** Filters/pagination/sort in URL; selectedIds, drawerAlertId, viewMode in React state; alerts, summary, saved views via React Query.
- **Widgets:** SeverityBadge, StatusBadge, AgingIndicator, SLACountdown, AssigneeAvatar, AlertTypeIcon (props defined).
- **Table:** Columns (checkbox, severity, priority, title, type, buyer, order no, style, shipment date, owner, status, aging, last update, root cause, recommended action, actions); server-side sort; multi-select; sticky first/last columns; inline Assign/Snooze/Resolve.
- **Drawer:** Core (summary, order, root cause, action, assignment, status actions) with detail; lazy: Timeline, Comments, History, RelatedAlerts, EscalationControls.
- **Route:** `/app/merchandising/alerts`; optional `?detail=id`; settings via modal.

**Full detail:** `docs/MERCH_ALERT_CENTER_FRONTEND_BLUEPRINT.md`

---

## 5. Sub-Agent 4 Findings – Backend & Rules

- **Data model:** alert_definition (rule_key, severity_default, entity_type, config_json, is_system, is_enabled), alert_instance (natural_key, status, severity, assigned_to_id, snoozed_until, escalation fields), alert_history, alert_comment, alert_assignment (optional), alert_rule (optional), alert_subscription, alert_scan_log, alert_related_entity (polymorphic), alert_escalation_log; all with tenant_id.
- **API:** GET list (filters, pagination, sort), GET detail, PATCH status, POST snooze/assign/escalate, GET/POST comments, GET history, GET summary, POST scan, GET/PATCH rules, GET scan-logs, optional saved views.
- **Rule engine:** Hybrid: event on Order/Followup/TNA save for immediate; cron every 15 min for batch (wastage, catch-all). Examples: followup_overdue, wastage_vs_bom, tna_task_overdue.
- **Deduplication:** natural_key = (tenant_id, rule_key, entity_type, entity_id[, scope]); upsert; re-open closed if condition still true.
- **Jobs:** APScheduler; alert_scan 15 min, escalation_check 1 hr, cleanup_resolved daily.
- **Notification:** Hook payload (event, alert_id, severity, title, assignee_id, deep_link, etc.) on create/escalate.
- **Indexes:** (tenant_id, status, severity), (tenant_id, assigned_to_id), (tenant_id, created_at), (tenant_id, natural_key) UNIQUE, (entity_type, entity_id) on related_entity.

**Full detail:** `docs/ALERT_ENGINE_BACKEND_BLUEPRINT.md`

---

## 6. Consolidated Final Blueprint

- **Page:** Single route `/app/merchandising/alerts`. Header + KPI + Filters + View switcher + Table/Cards + Drawer. Bulk toolbar when rows selected. Save view and Settings via modals.
- **Backend:** New alert_* tables; list/detail/summary/mutation/scan/rules APIs under `/api/v1/merch/alerts` (or `/api/v1/alerts` with tenant context). Rule engine hybrid; natural_key dedup; APScheduler for scan and escalation.
- **Frontend:** Extend or replace current MerchCriticalAlertsPage with new component tree; URL-driven filters; React Query for list/detail/summary; reusable alert widgets; drawer with core + lazy sections.
- **Roles:** Merchandiser (my alerts, assign, snooze, resolve), senior/manager (team, escalate, rules visibility), commercial/production (cross-functional alerts as configured), management (high-risk view). Enforce in API by tenant + role.

---

## 7. Recommended DB Changes

| Table | Purpose |
|-------|--------|
| **alert_definition** | rule_key, name, severity_default, entity_type, is_system, is_enabled, config_json (tenant_id, unique rule_key per tenant). |
| **alert_instance** | definition_id, natural_key (unique), title, description, severity, status, alert_type, assigned_to_id, snoozed_until, resolved_at, escalated_at, escalation_level, created_at, updated_at, tenant_id. |
| **alert_history** | alert_id, user_id, action, field_name, old_value, new_value, created_at, tenant_id. |
| **alert_comment** | alert_id, user_id, body, is_internal, created_at, updated_at, tenant_id. |
| **alert_related_entity** | alert_id, entity_type (order, quotation, inquiry, style, bom, followup, pi, lc, sample, purchase_order, vendor, user), entity_id, role, tenant_id. |
| **alert_scan_log** | tenant_id, rule_key, trigger, started_at, finished_at, status, instances_created/updated, error_message. |
| **alert_escalation_log** | alert_id, from_level, to_level, assigned_to_id, reason, created_by_id, created_at, tenant_id. |
| **alert_subscription** | user_id, rule_key, severity_min, channel, is_active, tenant_id. |
| **alert_saved_view** (optional) | user_id, name, description, filter_json, is_default, tenant_id. |

**Schema note:** Commercial documents (ProformaInvoice, BtbLc, ExportCase) do not currently have `order_id`. For “order ready, no PI/LC” alerts, add `order_id` (or a join table) in a separate migration if not present.

---

## 8. Recommended API List

| Method | Path | Purpose |
|--------|------|--------|
| GET | `/api/v1/merch/alerts` | List alerts (query: severity, status, alert_type, buyer_id, order_id, date_from, date_to, owner_id, entity_type, entity_id, sort, page, page_size). |
| GET | `/api/v1/merch/alerts/summary` | KPI counts (same filters as list). |
| GET | `/api/v1/merch/alerts/{id}` | Alert detail for drawer. |
| PATCH | `/api/v1/merch/alerts/{id}` | Update title/description/severity (optional). |
| PATCH | `/api/v1/merch/alerts/{id}/status` | Set status (acknowledged, resolved, closed). |
| POST | `/api/v1/merch/alerts/{id}/snooze` | Body: snoozed_until. |
| POST | `/api/v1/merch/alerts/{id}/assign` | Body: assigned_to_id. |
| POST | `/api/v1/merch/alerts/{id}/escalate` | Body: to_level, assigned_to_id?, reason. |
| GET | `/api/v1/merch/alerts/{id}/comments` | Paginated comments. |
| POST | `/api/v1/merch/alerts/{id}/comments` | Add comment. |
| GET | `/api/v1/merch/alerts/{id}/history` | Audit log for alert. |
| POST | `/api/v1/merch/alerts/scan` | Trigger rule scan. |
| GET | `/api/v1/merch/alerts/rules` | List alert definitions (and tenant overrides). |
| PATCH | `/api/v1/merch/alerts/rules/{definition_id}` | Update is_enabled, config_json. |
| GET | `/api/v1/merch/alerts/scan-logs` | List scan runs (paginated). |
| GET/POST/DELETE | `/api/v1/merch/alerts/views` | Saved filter presets (optional). |

Keep existing `GET /api/v1/merch/critical-alerts` for backward compatibility during migration (return data from new alert_instance or deprecate after frontend is cut over).

---

## 9. Recommended Frontend Component Tree

```
MerchCriticalAlertsPage
├── AlertsPageHeader          (title, counts, last scan, Refresh, Run scan, Save view, Export, Settings)
├── AlertsKpiBand             (Critical, High, Medium, Low, Total)
├── AlertsToolbar
│   ├── AlertsFilterPanel     (severity, category, date, status, buyer, owner; collapsible)
│   ├── AlertsViewSwitcher    (Table | Cards | Split)
│   └── AlertsSavedViewsDropdown
├── AlertsBulkToolbar         (when selectedIds.length > 0: Assign, Snooze, Resolve, Clear)
├── AlertsTable | AlertsCardGrid
├── AlertsDetailDrawer        (Summary, Order, RootCause, Action, Assignment, Status; lazy: Timeline, Comments, History, Related, Escalation)
├── SaveViewModal
└── AlertSettingsModal
```

**Reusable widgets (e.g. under `@/components/alerts/` or `@/components/merch/`):**  
SeverityBadge, StatusBadge, AgingIndicator, SLACountdown, AssigneeAvatar, AlertTypeIcon.

---

## 10. Recommended Page Sections

| # | Section | Content |
|---|---------|--------|
| 1 | Top Header | Page title “Critical Alerts”, subtitle, counts (critical · high · total), last scan time, Refresh, Run scan, Save view, Export, Settings. |
| 2 | KPI Band | 5 cards: Critical, High, Medium, Low, Total (with optional severity accent color). |
| 3 | Smart Filter Panel | Severity, Category (alert type), Date range, Status, Buyer, Owner; collapsible; active filters as chips; Clear filters. |
| 4 | View Switcher | Table | Cards | Split (right-aligned). |
| 5 | Main Content | Table (with sticky header, checkbox, severity, title, type, buyer, order no, style, shipment date, owner, status, aging, last update, actions) or Card grid; row/card click → open drawer. |
| 6 | Bulk Action Toolbar | Visible when selection non-empty: Assign, Snooze, Resolve, Export selection, Clear selection. |
| 7 | Right Drawer | Alert summary, linked order, root cause, recommended action, assignment, status actions; tabs/sections: Timeline, Comments, History, Related alerts, Escalation (lazy-loaded). |

---

## 11. Recommended Severity / Scoring Logic

### Severity (from rules + aging)

- **Critical:** Delivery/money/quality at risk now or within ~2 weeks (e.g. delivery in past, TNA missing with delivery &lt;14 days, follow-up &gt;7 days overdue, margin &lt;5%, wastage &gt;25%).
- **High:** Will become critical in ~2–4 weeks or blocks key milestone (TNA overdue tasks, sample overdue, BOM/consumption missing, PO overdue, NCR open).
- **Medium:** Process gap or delay in normal cycle (quotation pending/expired, sample due soon, PI not confirmed).
- **Low:** Housekeeping (inquiry no quotation, sample not assigned, no follow-up N days).
- **Informational:** No immediate action (e.g. duplicate follow-up).

### Priority score (for sort order)

Compute a **priority score** per alert so the list can be sorted by “what to do first”:

- **Formula (suggested):**  
  `priority_score = (severity_weight × 100) − aging_days + (sla_urgency_bonus)`

- **Severity weight:** Critical=5, High=4, Medium=3, Low=2, Informational=1.
- **aging_days:** Days since created (or since due_date for overdue) so older = slightly lower score (so same severity, newer first) or **negative** so older = higher score (older = more urgent). Recommendation: **older = more urgent** → add `+ min(aging_days, 30)` so up to 30 days aging increases score.
- **sla_urgency_bonus:** If SLA countdown &lt; 2 days, add +20; if &lt; 0 (breach), add +40.

**Example:**  
Critical (5×100) + 10 days aging (+10) + SLA in 1 day (+20) → 530.  
High (4×100) + 2 days aging (+2) → 402.  
Sort **descending** by priority_score so 530 appears before 402.

**Implementation:** Backend can compute `priority_score` when writing/updating alert_instance (or in list query with a computed column) and return it; frontend sorts by it by default.

---

## 12. Recommended Phased Build Plan

### Phase 1 (MVP) – Foundation and first alerts

- **Backend:** Create alert_definition, alert_instance, alert_history, alert_related_entity; implement 3–5 rules: followup_overdue, wastage_vs_bom, order_missing_tna (if TNA linked to order), quotation_pending_too_long, order_missing_delivery_date. List, detail, summary APIs; status/snooze/assign mutations; natural_key dedup; scheduled scan every 15 min (APScheduler).
- **Frontend:** New page layout (header, KPI, filters, table, drawer); SeverityBadge, StatusBadge; table with sort, multi-select, inline actions; detail drawer with summary, order link, root cause, action, assign, status. No saved views yet.
- **Goal:** Merchandisers see persisted alerts, filter by severity/status, open detail, assign/snooze/resolve. Existing `/merch/critical-alerts` can still return same data from new tables or redirect.

### Phase 2 – Full taxonomy and UX

- **Backend:** Add remaining alert types (A–H + garments extras); escalation (status Escalated, escalation_log, escalation_check job); comments and history APIs; optional saved views table and endpoints; notification hook (payload only, no email yet).
- **Frontend:** Card view and view switcher; bulk toolbar (assign, snooze, resolve); drawer lazy sections (timeline, comments, history, related alerts, escalation); Save view modal and dropdown; AlertSettingsModal (default view, columns); priority_score in list and default sort.
- **Goal:** Full alert set, escalation, collaboration (comments), saved views, polished UX.

### Phase 3 – Configuration and intelligence

- **Backend:** Tenant-configurable thresholds (config_json in alert_definition or tenant settings); role-based visibility (my/team/escalated); alert_subscription for notification preferences; optional webhook for external notifications.
- **Frontend:** Settings for notification prefs; role-aware filters (My alerts, Team, Escalated); optional AI placeholders (e.g. “Suggested action” from rule only, no ML yet).
- **Optional later:** AI root-cause hints, next-best-action, predictive delay score, tenant-defined alert templates.

---

## 13. Risks / Edge Cases

- **Commercial–order link:** ProformaInvoice, BtbLc, ExportCase lack order_id. Either add order_id (or join table) or use reference convention (e.g. order_code) for “order ready, no PI/LC” alerts; document the convention.
- **TNA–order link:** ManufacturingTnaPlan must have order_id (or equivalent) for “order missing TNA” and “TNA overdue” rules; verify in manufacturing model and add if missing.
- **Scale:** Many tenants and many orders → scan job could be heavy. Mitigate: per-tenant scan, limit rules per run, index (tenant_id, status, severity, created_at), pagination and summary-only when possible.
- **Duplicate noise:** Same logical issue (e.g. one overdue follow-up) must produce one alert (natural_key); re-open closed only when condition still true to avoid flapping.
- **Permissions:** Enforce tenant_id and role on every alert API; “my alerts” = assigned_to_id = current user; “team” = same department or configured team; “escalated” = status = escalated and visible to managers.
- **Snooze and scan:** When snoozed_until is in the future, rule engine should not create a new instance (same natural_key); when snoozed_until passes, either job or next scan re-opens the alert.

---

## 14. Cursor’s Own Improvement Suggestions

1. **Priority score in API:** Expose `priority_score` and `sla_due_at` (or `sla_breach_at`) in list and detail so the frontend can sort and show “Due in 2 days” without recomputing.
2. **“Why this alert” explanation:** Each alert_instance should store a short `reason_text` (e.g. “Due date 2026-03-10, 4 days overdue”) generated by the rule so the drawer always shows a consistent explanation.
3. **Deep link to order/style:** In drawer and table, make order code and style code clickable (e.g. to `/app/orders/{id}`, `/app/merchandising/styles/{id}`) so users can jump to the source record.
4. **Resolved today / Overdue count in KPI:** Add two extra KPI tiles: “Resolved today” and “Overdue” (e.g. past SLA or due_date) so managers see progress and backlog at a glance.
5. **Audit trail for Resolved:** Require an optional “resolution note” when moving to Resolved; store in alert_history so there is a record of what was done.
6. **Tenant default assignee:** For certain rule_keys, allow tenant config “default_assignee_id” or “default_assignee_role” so new alerts are pre-assigned (e.g. all TNA alerts to production planner).
7. **Alert correlation:** When loading “Related alerts”, backend can return alerts sharing the same order_id or style_id; optionally show “3 other alerts for this order” in drawer.
8. **Export:** List API support for `format=csv` or `format=xlsx` with same filters so “Export” downloads the current view without a separate export endpoint.
9. **Missing but important scenarios:** (a) **Shipment date in past** with order not completed; (b) **LC amendment pending** (if BtbLc has amendment status); (c) **Inspection not booked** when order is in “ready to ship”; (d) **Pack list / invoice not ready** within X days of shipment; (e) **Repeated snooze without resolution** (e.g. snoozed 3+ times without status change → escalate or flag).
10. **Configurable by tenant admin:** All 16 tenant keys from Domain doc; plus which roles see “team” vs “my” vs “escalated”; default view (table/cards); which alert types are enabled per tenant; SLA days for escalation.

---

## 15. Final Recommendation – What to Build First

**Build first (Phase 1):**

1. **Backend:**  
   - Alembic migration for alert_definition, alert_instance, alert_history, alert_related_entity (and alert_scan_log).  
   - Seed alert_definition for: followup_overdue, wastage_vs_bom, order_missing_delivery_date, quotation_pending_too_long; add order_missing_tna if TNA has order_id.  
   - List (with filters, pagination, sort), detail, summary APIs.  
   - Mutations: status, snooze, assign.  
   - Rule runner (in-process): evaluate the 4–5 rules, upsert by natural_key.  
   - APScheduler: one job “alert_scan” every 15 min.  
   - No escalation, no comments yet (or comments only).

2. **Frontend:**  
   - Replace or heavily refactor MerchCriticalAlertsPage: header with counts and “Last scan”, Refresh and Run scan buttons.  
   - KPI band (Critical, High, Medium, Low, Total) from summary API.  
   - Filter panel (severity, status, optional date range).  
   - Table: severity, title, type, order no, style, shipment date, owner, status, aging, actions (Assign, Snooze, Resolve).  
   - Row click → drawer with summary, linked order (with link to order detail), root cause, recommended action, Assign and Status update.  
   - Use new list/detail/summary and mutation APIs; keep existing sidebar and route.

3. **Integration:**  
   - Optional: On Followup save (create/update), trigger a small “run rules for this followup” to create/update followup_overdue alert immediately instead of waiting for cron.

After Phase 1 is stable and used daily, add Phase 2 (full rules, comments, history, escalation, card view, bulk actions, saved views), then Phase 3 (tenant config, role visibility, notifications).

---

## Reference Documents

| Document | Content |
|----------|--------|
| `docs/CRITICAL_ALERT_CENTER_BLUEPRINT_DOMAIN.md` | Full alert taxonomy, escalation, severity, action flow, tenant config. |
| `docs/ALERTS_CENTER_UX_UI_SPEC.md` | Page layout, responsive, components, colors, copy, design tokens. |
| `docs/MERCH_ALERT_CENTER_FRONTEND_BLUEPRINT.md` | Component tree, state, widgets, table, drawer, API usage. |
| `docs/ALERT_ENGINE_BACKEND_BLUEPRINT.md` | Data model, API list, rule engine, dedup, jobs, notification, indexes. |

---

*End of Final Blueprint. Use this document plus the four reference docs for implementation. Keep existing merchandising workflows intact; the Alert Center is an additive control tower on top of current data and processes.*
