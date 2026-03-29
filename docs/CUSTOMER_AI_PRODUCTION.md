# Customer AI — production hardening & traceability (Prime7 ERP)

This document covers **governance**, **resilience**, **suggestion-batch persistence**, **operational trace batches**, **server-side apply / audit**, **retention cleanup**, and **integration tests** for Customer AI.

## Shared master-data AI runtime (foundation)

Customer AI still owns **batch tables**, **RBAC**, and **`/customers/ai/*`** routes. Shared **low-level** helpers live in **`app/modules/master_data_ai/`** so future Supplier AI can reuse them without copy-paste:

| File | Role |
|------|------|
| `sanitization.py` | Untrusted text + NL query guards |
| `gateway.py` | `invoke_structured_llm` (timeout/retry; same log event names as pre-extraction) |
| `request_context.py` | Correlation id for tracing / audit |
| `audit_labels.py` | `customer_ai_event_label` for human-readable audit rows |

Customer AI wires these through thin shims: **`customer_ai_gateway.py`**, **`customer_ai_context.py`**. Overview and field strategy: **`docs/SUPPLIER_AI_FOUNDATION.md`** (§4).

## Parity by action (current)

| Action | Suggestion batch / trace row | Review & apply in UI | Server audit |
|--------|-----------------------------|----------------------|--------------|
| **Extract** | Yes — field items, `action_type=extract` | Yes — main column `AutofillReviewPanel` | Batch generated, mark, apply, discard, finalize |
| **Enrich** | Yes — field items, `action_type=enrich` | Yes — same panel pattern as extract | Same as extract |
| **Validate** | Yes — **trace** row only (`action_type=validate`, no items) | Read-only in side panel (issues list) | `CUSTOMER_AI_VALIDATE` + trace batch log |
| **Dedupe** | Yes — trace (`action_type=dedupe`) | Read-only in side panel | `CUSTOMER_AI_DEDUPE` + trace batch log |
| **Summary** | Yes — trace (`action_type=summary`), excerpt only in `meta_json` | Read-only in side panel | `CUSTOMER_AI_SUMMARY` + trace batch log |
| **Next actions** | Yes — trace (`action_type=next_actions`), titles only in `meta_json` | Read-only in side panel | `CUSTOMER_AI_NEXT_ACTIONS` + trace batch log |

Field-level **apply / skip / reject / apply-all-high / discard batch** apply only to **extract** and **enrich** batches. Trace batches return `suggestion_batch_id` for correlation and discard, but **cannot** be passed to `mark-decisions` or `apply-suggestions` (HTTP 400 `BATCH_NOT_FIELD_SUGGESTIONS`).

## Gap assessment (historical)

- Extraction and enrich returned suggestions only in the HTTP response; **no durable batch** tied to tenant/user.
- **Apply / skip / reject** for extracted fields was **browser-only** on create; on edit, **Apply** did not persist until **Save**, and there was **no field-level server audit** of what was accepted.
- Validate / dedupe / summary had no **durable operational result** row for supervisors.

## Target design: batches and traces

### Tables (Alembic `130_customer_ai_suggestion_batches`)

- **`customer_ai_suggestion_batches`**: one row per AI run. `action_type` is either a **field suggestion** type (`extract`, `enrich`) or an **operational trace** type (`validate`, `dedupe`, `summary`, `next_actions`). Trace rows use `status=completed`, **no** child items, and bounded `meta_json`.
- **`customer_ai_suggestion_items`**: one row per field for **extract/enrich** only (`field_key` camelCase, `suggested_value`, `confidence`, `source`, `disposition`, …).

### Allowed apply fields

Server allowlist is `customer_ai_batches.ALLOWED_FORM_KEYS`. **Never** `customer_code`, `id`, `tenant_id`, timestamps.

## API surface (`/api/v1/customers/ai/...`)

| Endpoint | Purpose |
|----------|---------|
| `POST .../extract` | Multimodal extract; `suggestion_batch_id` for field batch. |
| `POST .../enrich` | Enrich; `suggestion_batch_id` for field batch. |
| `POST .../validate` | Rules validation; optional `customer_id`; `suggestion_batch_id` = **trace** row. |
| `POST .../dedupe` | Duplicate scan; `suggestion_batch_id` = trace. |
| `POST .../summary` | LLM summary; `suggestion_batch_id` = trace (excerpt in meta, not full raw). |
| `POST .../next-actions` | LLM next actions; `suggestion_batch_id` = trace. |
| `POST .../suggestion-batch/mark-decisions` | **Extract/enrich only** — record apply/skip/reject intent. |
| `POST .../suggestion-batch/apply-suggestions` | **Extract/enrich only** — persist to customer row. |
| `POST .../suggestion-batch/discard` | Any batch type (field or trace). |
| `POST .../suggestion-batch/link-customer` | Attach `customer_id` when null. |
| `POST .../suggestion-batch/finalize-after-create` | **Extract/enrich only** — after `POST /customers`. |
| `GET .../audit-log` | `ai_audit_logs` with `prompt_category=customer_ai`; includes `event_label`, actor username, compact counts when present. |

## RBAC (optional `roles.permissions`)

Keys: `customers.ai.extract`, `enrich`, `validate`, `dedupe`, `summary`, `next_actions`, `nl_search`, `audit`, `customers.ai.apply_suggestions`, `customers.ai.discard_suggestions`.

Missing key ⇒ allow; explicit `false` ⇒ deny. Role names `admin`, `manager`, `owner`, `super_admin`, `superadmin` bypass per-key checks for Customer AI (but still need `can_use_ai_module` / `ai.read` unless the role is in the global AI allowlist).

## Frontend behavior

- **Edit customer**: two review tables when both exist — **Extract** and **Enrichment** — same controls. Each uses its own `extractionBatchId` / `enrichBatchId` for mark/apply. **Clear AI results** discards **all** active batch IDs (extract, enrich, and trace batches from validate/dedupe/summary/next).
- **Create customer**: same dual review; **finalize-after-create** runs for **each** of extract and enrich batch IDs when present.
- **Validate** on edit sends `customer_id` so trace rows link to the customer.
- **Customer AI activity** drawer on the detail page shows **event labels**, **actor username**, **batch id**, and compact counts (issues, matches, facts, actions, applied fields) when the audit payload includes them.

## Retention / cleanup

- On creation, batches get `expires_at` = **now + N days**. **N** defaults to **90** and is configurable via **`CUSTOMER_AI_BATCH_RETENTION_DAYS`** (see `app.config.Settings`).
- **Hard delete** expired batches (and cascading items) with:

  `docker compose exec backend python scripts/cleanup_customer_ai_suggestion_batches.py`

  Use `--dry-run` to count only.

- **Not deleted** by this script: **`ai_audit_logs`** (immutable audit trail).

## Integration tests (DB-backed)

File: `backend/tests/test_customer_ai_integration.py`.

- Requires **`DATABASE_URL`** (PostgreSQL). Run inside the backend container after **`docker compose build backend`** so `pytest` / `pytest-asyncio` from `requirements.txt` are installed:

  `docker compose exec backend pytest tests/test_customer_ai_integration.py -v`

- Covers: tenant isolation on batch load, discard → apply conflict, trace batch rejects mark/apply, allowlist skip for unsafe fields, enrich apply end-to-end, validate + dedupe trace rows, finalize audit log, RBAC deny for apply/audit, cleanup dry-run.

Unit tests without DB remain in `tests/test_customer_ai_batches.py` and `tests/test_customer_ai_hardening.py`.

## Manual QA (additions)

1. Extract + enrich on **edit** → apply one field from each table → reload customer; values persisted.
2. **Create** with both batches → save → two finalize calls succeed; audit shows finalize entries.
3. **Discard** → subsequent apply/mark on that batch → **409** or **400** as designed.
4. Role with `customers.ai.apply_suggestions: false` cannot apply (403).
5. Validate → audit/history shows validation trace batch id and issue count when present.
6. Run cleanup `--dry-run` on a dev DB with backdated `expires_at` → non-zero “would delete”.

## Known limitations

- **Summary / next-actions** still depend on the configured LLM; trace rows record excerpts/titles, not full raw model output (by design).
- **Scheduled** cleanup is not wired to Celery/cron in-repo; use the script or an external scheduler.
- **Dedupe “merge”** is not implemented; trace `meta_json` includes `merge_ready: true` and structured candidates to support a future merge workflow.

## Recommended admin settings

- Set **`CUSTOMER_AI_BATCH_RETENTION_DAYS`** to match your retention policy (e.g. 90–365).
- Restrict **`customers.ai.discard_suggestions`** and **`customers.ai.apply_suggestions`** for roles that should only view AI output.
- Use **`customers.ai.audit: false`** only for roles that must not see AI activity lists.

## Replication to Supplier / Inquiry / Quotation

The pattern is **ready to replicate**: (1) tenant-scoped batch + item tables (or shared generic “AI suggestion batch” with `resource_type`), (2) field allowlist per module, (3) trace rows for non-field outcomes, (4) `log_ai_event` with `prompt_category` and structured `details_json`, (5) RBAC keys per module, (6) frontend **one review component** + multiple batch IDs. Customer-specific pieces are allowlists, schemas, and routers — not the core batch/trace/audit mechanics.

## Async jobs follow-up

With batches + server apply + traces, **async jobs** remain optional for latency, not for auditability.
