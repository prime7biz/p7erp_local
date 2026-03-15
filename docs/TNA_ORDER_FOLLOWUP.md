# TNA Order Follow-up (Advanced Follow-up)

## Overview

The Order Follow-up page is a TNA (Time and Action) driven system for garments merchandising: track order actions from confirmation to shipment (sampling, approvals, sourcing, production, inspection, commercial, shipment).

## Backend

- **Models:** `FollowupActionTemplate`, `OrderFollowupAction` in `backend/app/models/merch.py`
- **Migration:** `061_tna_followup_templates_and_actions.py` — creates `followup_action_templates` and `order_followup_actions`
- **Router:** `backend/app/modules/merch/router.py` — prefix `/merch`

### APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/followup-templates` | List templates (optional: phase, is_active). Seeds defaults if empty. |
| GET | `/followup-templates/{id}` | Get one template |
| POST | `/followup-templates` | Create template |
| PATCH | `/followup-templates/{id}` | Update template |
| DELETE | `/followup-templates/{id}` | Delete template |
| GET | `/followup-actions` | List actions (filters: order_id, status, phase, assigned_to_id, due_from, due_to, overdue_only) |
| GET | `/followup-actions/summary` | KPI counts (open, overdue, due_this_week, rejected, completed) |
| GET | `/followup-actions/search?q=` | Search by title, description, order code |
| GET | `/followup-actions/order/{order_id}/timeline` | Timeline for one order |
| POST | `/followup-actions/generate` | Generate TNA lines from template for an order (body: order_id, template_ids?) |
| GET | `/followup-actions/overdue` | Overdue actions for alerts |
| GET | `/followup-actions/{id}` | Get one action |
| POST | `/followup-actions` | Create action |
| PATCH | `/followup-actions/{id}` | Update action |
| POST | `/followup-actions/{id}/complete` | Mark completed |
| POST | `/followup-actions/{id}/reopen` | Reopen |
| DELETE | `/followup-actions/{id}` | Delete action |

All are tenant-scoped and require auth.

### Alerts

- **Rules** in `backend/app/modules/merch/alert_rules.py`:
  - **`tna_action_overdue`:** Fires when `OrderFollowupAction.planned_date < today`, status not in (completed, approved, cancelled), `is_active` true. Creates alert instances for overdue TNA actions.
  - **`tna_action_due_soon`:** Fires when `planned_date` is between today and today+N (config `tna_due_soon_days`, default 7), status open, `is_active` true. Creates alert instances for actions due in the next N days.
- Default definitions: "TNA action overdue" (high), "TNA action due soon" (medium); entity_type `followup_action`.
- **Alert scan:** Running the alert scan (via API or a scheduled job) evaluates these rules and creates/updates `AlertInstance` rows. Users see overdue and due-soon TNA actions in Critical Alerts.

## Frontend

- **Page:** `frontend/src/pages/app/FollowupPage.tsx`
- **Route:** Follow-up (sidebar)
- **Features:** KPI cards, filters, search, main TNA table, Add/Edit action modal, Generate TNA modal, order timeline panel, overdue alert card, legacy "Simple follow-ups" collapsible section.
- **Phase 2:** Export current action list to CSV (Export CSV button); Calendar view (Table/Calendar toggle) showing actions by planned date in a month grid with Prev/Next, click action to open Edit.
- **Phase 3:** Bulk shift planned dates (table checkboxes + "Shift dates (N)" button; modal: add/subtract days, apply to selected); Kanban view (Table/Calendar/Kanban toggle) — columns by phase, cards per action, click to edit.
- **Phase 4:** Buyer filter (client-side: filter actions by order’s customer); Assigned-to filter (API param) and Assigned column + dropdown in add/edit modal; timeline overdue highlight (red left border + "Overdue" badge).
- **Phase 5:** Manage TNA templates (collapsible section: table of templates, Add template, Edit, Delete; modal for create/edit with code, name, phase, sequence, default days before delivery, mandatory, active); Timeline "Next due" (first incomplete action shown at top of timeline with planned date and Overdue badge if applicable).
- **Phase 6:** Timeline shows order **delivery date** at top when available; table quick actions **Mark submitted** (sets status=submitted, actual_submission_date=today) and **Mark rejected** (modal: rejection reason + optional resubmission date, then status=rejected, is_rejected=true).
- **Phase 7:** **Due-date quick filters**: "Due today", "Due this week" (today–Sunday), "Overdue", "Clear dates" buttons in toolbar; **Timeline**: order code is a link to order detail, **Print timeline** button (browser print).

## Setup

1. **Migration:** From `backend/` run: `alembic upgrade head` (use your venv if applicable).
2. **First use:** Opening the Follow-up page loads templates; if none exist, default TNA steps are seeded (order confirmed, LC, proto/fit/size set/PP samples, lab dip, bulk fabric, accessories, fabric in-house, cutting, sewing, inspection, ex-factory, shipment docs, etc.).
3. **Generate TNA:** Pick an order with a delivery date, click "Generate TNA", then optionally choose templates or use all. Planned dates are set from delivery_date − default_days_before_delivery.

## Optional enhancements (Phase 8+)

- **PDF / Print:** Timeline has "Export PDF / Print timeline"; table view has "Print list" next to Export CSV. Both use browser print; CSS restricts printed content to the relevant area.
- **Buyer-specific templates:** `GET /followup-templates` accepts optional `buyer_id` (shows global + that buyer’s templates). Manage TNA templates has a Buyer dropdown to filter; Generate TNA modal shows templates for global + order’s buyer.
- **Rejection/resubmission history:** Table `followup_action_rejection_logs` (migration 062). GET/POST `/followup-actions/{id}/rejection-history`. Edit modal shows "Rejection history"; marking rejected appends a log entry.
- **Auto-reminders:** Alert rules `tna_action_overdue` and `tna_action_due_soon` (see Alerts above). "Due this week" KPI and "Due soon (7d)" filter surface due-soon actions.
- **Inline comments:** Table `followup_action_comments` (migration 063). GET/POST `/followup-actions/{id}/comments`. Edit modal has a comments section (load, list, add).
- **Production/commercial integration:** Actions have `milestone_type` (e.g. Ex-factory, Shipment, Cutting) and optional `external_id` (migration 064). Table shows Milestone column; Add/Edit modal has Milestone dropdown and External ID.

## Legacy

The original simple follow-ups (GET/POST/PATCH/DELETE `/followups`) remain. They appear in the "Simple follow-ups (legacy)" section at the bottom of the Follow-up page.
