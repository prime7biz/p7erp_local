# Alert Engine – Backend & Rules Blueprint (Sub-Agent 4)

**Context:** Existing `GET /api/v1/merch/critical-alerts` returns followup-overdue + wastage alerts (no persistence). This blueprint defines the full alert engine: persisted alerts, rules, lifecycle, comments, assignments, escalation.

**Stack:** FastAPI, SQLAlchemy async, PostgreSQL. All tenant-scoped tables include `tenant_id`.

---

## 1. DATA MODEL

### 1.1 alert_definition

Stores rule metadata and configuration (what kind of alert, severity default, whether enabled).

| Column           | Type         | Nullable | Notes                          |
|------------------|--------------|----------|--------------------------------|
| id               | SERIAL       | NO       | PK                             |
| tenant_id        | INTEGER      | NO       | FK → tenants.id                |
| rule_key         | VARCHAR(64)  | NO       | Unique per tenant (e.g. `followup_overdue`, `wastage_vs_bom`, `tna_task_overdue`) |
| name             | VARCHAR(255) | NO       | Display name                   |
| description      | TEXT         | YES      |                                |
| severity_default | VARCHAR(16)  | NO       | `critical`, `warning`, `info`  |
| entity_type      | VARCHAR(32)  | NO       | Primary entity (order, followup, style, …) |
| is_system        | BOOLEAN      | NO       | True = built-in, not deletable  |
| is_enabled       | BOOLEAN      | NO       | Default true                   |
| config_json      | JSONB        | YES      | Rule-specific params (e.g. wastage_threshold_pct) |
| created_at       | TIMESTAMPTZ  | NO       |                                |
| updated_at       | TIMESTAMPTZ  | NO       |                                |

**Unique:** `(tenant_id, rule_key)`.

---

### 1.2 alert_rule

Extends or overrides alert_definition per tenant (optional; can merge into alert_definition if preferred). Use if you want “rule versions” or tenant-specific rule config separate from definition.

| Column           | Type         | Nullable | Notes                |
|------------------|--------------|----------|----------------------|
| id               | SERIAL       | NO       | PK                   |
| tenant_id        | INTEGER      | NO       | FK → tenants.id      |
| definition_id    | INTEGER      | NO       | FK → alert_definition.id |
| name_override    | VARCHAR(255) | YES      |                      |
| is_enabled       | BOOLEAN      | NO       |                      |
| config_override  | JSONB        | YES      | Override definition config |
| priority         | INTEGER      | YES      | Order of evaluation  |
| created_at       | TIMESTAMPTZ  | NO       |                      |
| updated_at       | TIMESTAMPTZ  | NO       |                      |

**Alternative:** Single table `alert_definition` with tenant_id and config_json is enough for most cases; `alert_rule` can be omitted and config stored in `alert_definition` per tenant.

---

### 1.3 alert_instance

One row per active (or recently closed) alert occurrence.

| Column            | Type         | Nullable | Notes                              |
|-------------------|--------------|----------|------------------------------------|
| id                | SERIAL       | NO       | PK                                 |
| tenant_id         | INTEGER      | NO       | FK → tenants.id                    |
| definition_id     | INTEGER      | NO       | FK → alert_definition.id           |
| natural_key       | VARCHAR(255) | NO       | Dedup key: tenant_id + rule_key + entity_type + entity_id + scope (see §4) |
| title             | VARCHAR(512) | NO       |                                    |
| description       | TEXT         | YES      |                                    |
| severity          | VARCHAR(16)  | NO       | `critical`, `warning`, `info`      |
| status            | VARCHAR(32)  | NO       | `open`, `acknowledged`, `snoozed`, `resolved`, `escalated`, `closed` |
| alert_type        | VARCHAR(64)  | NO       | Copy of rule_key for quick filter  |
| source            | VARCHAR(32)  | NO       | `system`, `manual`                 |
| assigned_to_id    | INTEGER      | YES      | FK → users.id                      |
| created_by_id     | INTEGER      | YES      | FK → users.id (if manual)          |
| acknowledged_at   | TIMESTAMPTZ  | YES      |                                    |
| acknowledged_by_id| INTEGER      | YES      | FK → users.id                      |
| resolved_at       | TIMESTAMPTZ  | YES      |                                    |
| resolved_by_id    | INTEGER      | YES      | FK → users.id                      |
| snoozed_until     | TIMESTAMPTZ  | YES      |                                    |
| escalated_at      | TIMESTAMPTZ  | YES      |                                    |
| escalation_level  | INTEGER      | YES      | 1, 2, …                            |
| created_at        | TIMESTAMPTZ  | NO       |                                    |
| updated_at        | TIMESTAMPTZ  | NO       |                                    |

**Indexes:** See §7.

---

### 1.4 alert_history

One row per status/assignment/important change for audit trail.

| Column      | Type         | Nullable | Notes                    |
|-------------|--------------|----------|--------------------------|
| id          | SERIAL       | NO       | PK                       |
| tenant_id   | INTEGER      | NO       | FK → tenants.id          |
| alert_id    | INTEGER      | NO       | FK → alert_instance.id   |
| user_id     | INTEGER      | YES      | FK → users.id            |
| action      | VARCHAR(64)  | NO       | e.g. `status_change`, `assigned`, `snoozed`, `escalated`, `comment` |
| field_name  | VARCHAR(64)  | YES      | e.g. `status`, `assigned_to_id` |
| old_value   | TEXT         | YES      | Serialized (e.g. string or JSON) |
| new_value   | TEXT         | YES      | Serialized               |
| created_at  | TIMESTAMPTZ  | NO       |                          |

---

### 1.5 alert_comment

Comments on an alert (user-facing thread).

| Column     | Type         | Nullable | Notes           |
|------------|--------------|----------|-----------------|
| id         | SERIAL       | NO       | PK              |
| tenant_id  | INTEGER      | NO       | FK → tenants.id |
| alert_id   | INTEGER      | NO       | FK → alert_instance.id |
| user_id    | INTEGER      | NO       | FK → users.id   |
| body       | TEXT         | NO       |                 |
| is_internal| BOOLEAN      | NO       | Default false   |
| created_at | TIMESTAMPTZ  | NO       |                 |
| updated_at | TIMESTAMPTZ  | NO       |                 |

---

### 1.6 alert_assignment

History of assignments (who was assigned when). Optional if assignment changes are fully captured in alert_history with field_name = `assigned_to_id`; use if you need a dedicated assignment log.

| Column     | Type         | Nullable | Notes           |
|------------|--------------|----------|-----------------|
| id         | SERIAL       | NO       | PK              |
| tenant_id  | INTEGER      | NO       | FK → tenants.id |
| alert_id   | INTEGER      | NO       | FK → alert_instance.id |
| user_id    | INTEGER      | NO       | FK → users.id   |
| assigned_by_id | INTEGER  | YES      | FK → users.id   |
| assigned_at| TIMESTAMPTZ  | NO       |                 |
| unassigned_at | TIMESTAMPTZ | YES      |                 |

---

### 1.7 alert_subscription

User/role subscriptions for notification (e.g. “notify me for critical order alerts”).

| Column       | Type         | Nullable | Notes                    |
|--------------|--------------|----------|--------------------------|
| id           | SERIAL       | NO       | PK                       |
| tenant_id    | INTEGER      | NO       | FK → tenants.id          |
| user_id      | INTEGER      | NO       | FK → users.id            |
| rule_key     | VARCHAR(64)  | YES      | Null = all rules         |
| severity_min | VARCHAR(16)  | YES      | Minimum severity         |
| channel      | VARCHAR(32)  | NO       | e.g. `in_app`, `email`, `webhook` |
| is_active    | BOOLEAN      | NO       | Default true             |
| created_at   | TIMESTAMPTZ  | NO       |                          |
| updated_at   | TIMESTAMPTZ  | NO       |                          |

---

### 1.8 alert_scan_log

Log of each rule/scan run (for debugging and idempotency).

| Column        | Type         | Nullable | Notes                |
|---------------|--------------|----------|----------------------|
| id            | SERIAL       | NO       | PK                   |
| tenant_id     | INTEGER      | NO       | FK → tenants.id      |
| rule_key      | VARCHAR(64)  | NO       |                      |
| trigger       | VARCHAR(32)  | NO       | `scheduled`, `event`, `manual` |
| started_at    | TIMESTAMPTZ  | NO       |                      |
| finished_at   | TIMESTAMPTZ  | YES      |                      |
| status        | VARCHAR(32)  | NO       | `running`, `completed`, `failed` |
| instances_created | INTEGER  | YES      |                      |
| instances_updated | INTEGER  | YES      |                      |
| error_message | TEXT         | YES      |                      |

---

### 1.9 alert_related_entity

Polymorphic link from an alert to one or more entities (e.g. order, followup, style).

| Column      | Type         | Nullable | Notes                                                                 |
|-------------|--------------|----------|-----------------------------------------------------------------------|
| id          | SERIAL       | NO       | PK                                                                   |
| tenant_id   | INTEGER      | NO       | FK → tenants.id                                                       |
| alert_id    | INTEGER      | NO       | FK → alert_instance.id                                               |
| entity_type | VARCHAR(32)  | NO       | Enum: `order`, `quotation`, `inquiry`, `style`, `bom`, `followup`, `pi`, `lc`, `shipment`, `sample`, `purchase_order`, `vendor`, `user` |
| entity_id   | INTEGER      | NO       | PK of the related entity in its table                                |
| role        | VARCHAR(32)  | YES      | e.g. `primary`, `related` (for multiple links)                       |
| created_at  | TIMESTAMPTZ  | NO       |                                                                      |

**Index:** `(entity_type, entity_id)` for “all alerts for this order/style/…” (§7).

---

### 1.10 alert_escalation_log

Log each escalation step (e.g. level 1 → 2, with target user/role).

| Column         | Type         | Nullable | Notes                |
|----------------|--------------|----------|----------------------|
| id             | SERIAL       | NO       | PK                   |
| tenant_id      | INTEGER      | NO       | FK → tenants.id      |
| alert_id       | INTEGER      | NO       | FK → alert_instance.id |
| from_level     | INTEGER      | YES      |                      |
| to_level       | INTEGER      | NO       |                      |
| assigned_to_id | INTEGER      | YES      | FK → users.id        |
| reason         | TEXT         | YES      |                      |
| created_at     | TIMESTAMPTZ  | NO       |                      |
| created_by_id  | INTEGER      | YES      | FK → users.id        |

---

## 2. API ENDPOINTS

Base path: `/api/v1/alerts` (or `/api/v1/merch/alerts` if kept under merch). All require auth and tenant context.

### 2.1 Alert list (paginated, filterable, sortable)

- **GET** `/api/v1/alerts`
  - **Query params:**
    - `buyer_id` (integer, optional) – filter by order’s buyer/customer (join via order_id in alert_related_entity).
    - `order_id` (integer, optional) – filter by primary related order.
    - `severity` (string, optional) – `critical` \| `warning` \| `info` (or multi: `severity=critical&severity=warning`).
    - `status` (string, optional) – `open`, `acknowledged`, `snoozed`, `resolved`, `escalated`, `closed` (multi allowed).
    - `alert_type` (string, optional) – rule_key, e.g. `followup_overdue`, `wastage_vs_bom`.
    - `date_from` (date, optional) – filter by `alert_instance.created_at >= date_from`.
    - `date_to` (date, optional) – filter by `alert_instance.created_at <= date_to`.
    - `owner_id` / `assigned_to_id` (integer, optional) – filter by assigned user.
    - `entity_type` (string, optional) – filter by primary related entity type.
    - `entity_id` (integer, optional) – filter by primary related entity id.
    - `page` (integer, default 1), `page_size` (integer, default 20, max 100).
    - `sort` (string, optional) – e.g. `-created_at`, `severity`, `-updated_at`.
  - **Response:** `{ "items": [...], "total": N, "page": 1, "page_size": 20 }`.

### 2.2 Single alert

- **GET** `/api/v1/alerts/{alert_id}`  
  - Returns alert_instance + related_entities + latest comments (or comment count). 404 if not in tenant.

### 2.3 Create / update alert

- **POST** `/api/v1/alerts` – Create manual alert (optional; if only system-generated, omit or restrict to admin).
  - Body: definition_id or rule_key, title, description, severity, related entity_type + entity_id.
- **PATCH** `/api/v1/alerts/{alert_id}` – Update title/description/severity (optional; system alerts might be read-only for body).

### 2.4 Status and lifecycle

- **PATCH** `/api/v1/alerts/{alert_id}/status` – Set status (`acknowledged`, `resolved`, `closed`). Record in alert_history.
- **POST** `/api/v1/alerts/{alert_id}/snooze` – Body: `snoozed_until` (ISO datetime). Set status to `snoozed`, record history.
- **POST** `/api/v1/alerts/{alert_id}/assign` – Body: `assigned_to_id`. Update assigned_to_id, record in alert_history (and optionally alert_assignment).
- **POST** `/api/v1/alerts/{alert_id}/escalate` – Body: `to_level`, `assigned_to_id`, `reason`. Update instance, insert alert_escalation_log and alert_history.

### 2.5 Comments and history

- **GET** `/api/v1/alerts/{alert_id}/comments` – Paginated list of alert_comment.
- **POST** `/api/v1/alerts/{alert_id}/comments` – Add comment (body, is_internal optional). Optionally record action in alert_history.
- **GET** `/api/v1/alerts/{alert_id}/history` – List alert_history for this alert (paginated).

### 2.6 Summary / KPIs

- **GET** `/api/v1/alerts/summary`  
  - Query params: same filters as list (severity, status, alert_type, date_from, date_to, owner_id, etc.) to scope summary.
  - Response: e.g. `{ "by_severity": { "critical": N, "warning": M, "info": K }, "by_status": {...}, "total": T }` and optionally counts by alert_type.

### 2.7 Scan and rules (admin / system)

- **POST** `/api/v1/alerts/scan` – Trigger full rule scan (or per rule_key). Idempotent via natural_key; creates/updates/reopens alert_instances. Returns scan_log id and status.
- **GET** `/api/v1/alerts/rules` – List alert_definition (and alert_rule if used) for tenant.
- **PATCH** `/api/v1/alerts/rules/{definition_id}` – Update is_enabled, config_json (and name/description if allowed). Only for non-system or system with override.
- **GET** `/api/v1/alerts/scan-logs` – List alert_scan_log with filters (tenant, rule_key, date_from, date_to), paginated.

### 2.8 Saved views (optional)

- **GET** `/api/v1/alerts/views` – List saved filter presets (if you add an `alert_saved_view` table: user_id, name, filter_json).
- **POST** `/api/v1/alerts/views` – Save view (name, filter_json).
- **DELETE** `/api/v1/alerts/views/{view_id}` – Delete saved view.

*(If saved views are deferred, omit these endpoints and add later.)*

---

## 3. RULE ENGINE STRATEGY

**Recommendation: Hybrid (Option C)** – event-triggered for immediate feedback + scheduled job for batch and catch-all.

- **Event-triggered (on save/update):**
  - **Order / Followup:** On Order or Followup create/update, run rules: `followup_overdue` (e.g. due_date < today, status != DONE). Emit alerts for that entity only.
  - **Quotation / Inquiry:** On create/update, run rules tied to quotation/inquiry (e.g. quotation_expiry, inquiry_stale) if defined.
  - **TNA:** On ManufacturingTnaPlanTask update (or plan save), run `tna_task_overdue`: task.planned_date < today and status != `done`.
  - **Wastage:** Not ideal on every order save (expensive). Prefer scheduled run; optionally run on ConsumptionPlanItem or StockMovement (consumption) save for that order only if you want near-real-time wastage alerts.

- **Scheduled job (e.g. every 15 min):**
  - Run all enabled rules for the tenant (or per-rule_key in rotation). Covers: wastage vs BOM (join Order → ConsumptionPlan → ConsumptionPlanItem / StockMovement vs BOM expected), followup overdue, TNA overdue, and any future rules (PI/LC/shipment due, etc.). Ensures no missed alerts if an event was not emitted or logic is batch-only.

**Rule evaluation examples:**

- **followup_overdue:**  
  Join `Followup` where `tenant_id`, `status != 'DONE'`, `due_date IS NOT NULL`, `due_date < current_date`. Natural key e.g. `followup_overdue:followup:{id}`.

- **wastage_vs_bom:**  
  Use existing wastage report logic (Order → BOM/ConsumptionPlanItem/StockMovement CONSUMPTION_ISSUE), compute (actual - expected)/expected * 100; where above threshold (e.g. 15%), create alert. Natural key e.g. `wastage_vs_bom:order:{order_id}:item:{item_id}`.

- **tna_task_overdue:**  
  Join `ManufacturingTnaPlan` → `ManufacturingTnaPlanTask` where `tenant_id`, `planned_date < current_date`, `status != 'done'`. Natural key e.g. `tna_task_overdue:task:{task_id}` (or plan_id+task_id if multiple tasks per plan).

- **quotation_expiry (future):**  
  Quotation where valid_until or similar < today and status not in (converted, expired). Natural key e.g. `quotation_expiry:quotation:{id}`.

---

## 4. DEDUPLICATION

- **Natural key:** `(tenant_id, rule_key, entity_type, entity_id[, scope])`.
  - `scope` optional: e.g. for wastage, scope = `item_id` so key is `(tenant_id, wastage_vs_bom, order, order_id, item_<item_id>)`; for followup, scope = followup id.
  - Store in `alert_instance.natural_key` as a single string, e.g. `followup_overdue:followup:42` or `wastage_vs_bom:order:101:item:5`.

- **Strategy:**
  - **Upsert:** Before insert, SELECT by natural_key where status in (`open`, `acknowledged`, `snoozed`, `escalated`). If found: update title/description/severity/updated_at (and optionally reopen if it was closed and condition is still true). If not found: INSERT.
  - **Re-open closed:** If the same natural_key exists with status `resolved` or `closed`, optionally reopen: set status to `open`, clear resolved_at/resolved_by_id, update title/description and updated_at. This keeps one row per logical alert and avoids duplicate rows.

- **Idempotency:** Each scan run writes to alert_scan_log; within one run, process rules in deterministic order and upsert by natural_key so repeated runs do not create duplicates.

---

## 5. BACKGROUND JOBS

**Recommended tool: APScheduler** (in-process). Rationale: no extra broker (Celery requires Redis/RabbitMQ); simpler for single-instance deployment; sufficient for 15-min scan and hourly escalation. Use AsyncIOScheduler so async DB sessions work. If you later need multi-worker or heavy workloads, replace with Celery + Redis.

**Suggested jobs:**

| Job                  | Schedule        | Action                                                                 |
|----------------------|-----------------|------------------------------------------------------------------------|
| alert_scan           | Every 15 min    | For each tenant, run all enabled rules; upsert alert_instance; write alert_scan_log. |
| escalation_check    | Every hour      | Find alerts in `escalated` or with snoozed_until < now and not resolved; apply escalation policy (e.g. reassign, level++); call notification hook. |
| cleanup_resolved     | Daily (e.g. 02:00) | Delete or archive alert_instance where status in (`resolved`, `closed`) and resolved_at < now - 90 days. Optionally keep alert_history for audit. |

**Implementation:** Register jobs in FastAPI lifespan (start scheduler, add jobs, yield; on shutdown, shutdown scheduler). Use a single shared AsyncSession per job run (or scoped session per tenant) and avoid long-held connections.

---

## 6. NOTIFICATION HOOKS

**Placeholder:** When an alert is **created** or **escalated**, call a hook (e.g. HTTP webhook or internal notification service). Do not block the main flow; fire-and-forget or enqueue.

**Event payload shape (JSON):**

```json
{
  "event": "alert.created" | "alert.escalated",
  "occurred_at": "2026-03-14T12:00:00Z",
  "tenant_id": 1,
  "alert_id": 42,
  "severity": "critical",
  "title": "Order #101 – Follow-up overdue",
  "description": "Order #101 overdue by 3 day(s)",
  "assignee_id": 5,
  "assignee_email": "user@example.com",
  "deep_link": "/app/alerts/42",
  "alert_type": "followup_overdue",
  "entity_type": "order",
  "entity_id": 101,
  "escalation_level": 1
}
```

- `assignee_id` / `assignee_email`: may be null if unassigned.
- `deep_link`: relative path or full URL to open the alert in the app.
- For `alert.escalated`, include `escalation_level` and optionally previous assignee.

---

## 7. AUDIT & INDEXING

### 7.1 alert_history

- One row per status/assignment/snooze/escalation change with `user_id`, `created_at`, `action`, `field_name`, `old_value`, `new_value` (as in §1.4). Optionally add `comment_id` when action = `comment`.

### 7.2 Indexes

- **alert_instance:**  
  - `(tenant_id, status, severity)` – list/filter by status and severity.  
  - `(tenant_id, assigned_to_id)` – “my alerts”.  
  - `(tenant_id, created_at)` – time-ordered list and date range filters.  
  - `(tenant_id, natural_key)` UNIQUE – deduplication and upsert.  
  - Optional: `(tenant_id, alert_type)` if many rules and heavy filter by type.

- **alert_related_entity:**  
  - `(entity_type, entity_id)` – “all alerts for this order/style/…”.  
  - `(alert_id)` – fetch entities for an alert (FK often indexed by default).

- **alert_history:**  
  - `(alert_id, created_at)` – history for an alert.

- **alert_comment:**  
  - `(alert_id, created_at)` – comments for an alert.

- **alert_scan_log:**  
  - `(tenant_id, started_at)` – list recent scans.

---

## Summary

- **Data model:** alert_definition, alert_instance, alert_history, alert_comment, alert_assignment (optional), alert_rule (optional), alert_subscription, alert_scan_log, alert_related_entity, alert_escalation_log; all tenant-scoped with `tenant_id`; polymorphic link via `alert_related_entity.entity_type` + `entity_id`.
- **API:** List (with buyer_id, order_id, severity, status, alert_type, date_from, date_to, owner_id, pagination, sort), get by id, create/update (optional), status, assign, snooze, escalate, comments, history, summary, scan, rules, scan-logs, saved views (optional).
- **Rule engine:** Hybrid (event on order/followup/TNA save + cron every 15 min); followup overdue, wastage vs BOM, TNA task overdue evaluated as described.
- **Deduplication:** Natural key (tenant_id, rule_key, entity_type, entity_id, scope) with upsert and optional re-open of closed.
- **Background jobs:** APScheduler; alert_scan 15 min, escalation_check 1 hr, cleanup_resolved daily.
- **Notification:** Hook with payload (alert_id, severity, title, assignee_id, deep_link, etc.) on create/escalate.
- **Audit:** alert_history per change; indexes on tenant_id+status+severity, tenant_id+assigned_to_id, tenant_id+created_at, natural_key, entity_type+entity_id.
