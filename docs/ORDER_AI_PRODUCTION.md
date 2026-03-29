# Order AI — Production Implementation

## Overview

Order AI adds review-first AI assistance on top of the merchandising execution order module: PO/document extraction, context enrichment, rule-based validation and execution readiness, duplicate/overlap hints, summaries, and next-action ideas. It mirrors Customer AI, Vendor AI, Inquiry AI, and Quotation AI so operators see one consistent pattern.

**Key constraint:** Orders sit after quotation approval and drive execution. AI must not change protected workflow or commercial identifiers (`order_code`, `status`, `quotation_id`, `customer_id`, etc.). Trace actions (`validate`, `dedupe`, `summary`, `next_actions`) never apply field patches.

## Reuse Map

| Layer | Reused from | Order AI file |
|-------|-------------|----------------|
| ORM pattern | quotation_ai_suggestion | `models/order_ai_suggestion.py` |
| Batches / allowlist | quotation_ai_batches | `modules/orders/order_ai_batches.py` |
| RBAC | quotation_ai_authz | `modules/orders/order_ai_authz.py` |
| Schemas | quotation_ai_schemas | `modules/orders/order_ai_schemas.py` |
| Prompts | quotation_ai_prompts | `modules/orders/order_ai_prompts.py` |
| Service | quotation_ai_service | `modules/orders/order_ai_service.py` |
| Router | quotation_ai_router | `modules/orders/order_ai_router.py` |
| Document extract | ai_extract (quotation/order) | `modules/ai_extract/*` |
| Audit labels | master_data_ai | `modules/master_data_ai/audit_labels.py` |
| Frontend hook | useQuotationAi / useInquiryAi | `hooks/useOrderAi.ts` |
| Frontend panel | QuotationAiPanel | `components/orders/OrderAiPanel.tsx` |
| Frontend audit | QuotationAiAuditHistory | `components/orders/OrderAiAuditHistory.tsx` |

## Action Types

| Action | Type | Batch kind | Typical LLM? |
|--------|------|------------|--------------|
| Extract | field-suggestion | extract | Yes (document extract pipeline) |
| Enrich | field-suggestion | enrich | Yes |
| Validate | trace-only | validate | No (rules + scores) |
| Dedupe | trace-only | dedupe | No (DB similarity) |
| Summary | trace-only | summary | Yes |
| Next-actions | trace-only | next_actions | Yes |

## Field Scope

### Allowlisted (AI may suggest / apply after review)

- `style_ref`, `customer_intermediary_id`, `shipping_term`
- `commission_mode`, `commission_type`, `commission_value`
- `order_date`, `delivery_date`, `quantity`, `remarks`

### Protected / system-controlled (never applied by AI)

- `order_code`, `tenant_id`, `id`
- `status`
- `quotation_id`, `customer_id`

### Amendment-sensitive

Any change to commercial dates, quantity, or remarks after confirmation should follow normal amendment / approval practice. AI only proposes values; users and existing workflows commit changes.

## Execution Safety Rules

1. AI does not call order status transitions or create downstream production/commercial documents.
2. Apply endpoints use allowlist-only writes and reject protected keys even if the model returns them.
3. Discarded batches cannot be applied.
4. `finalize-after-create` links pre-create batches to the new order id and audits the merge (create flow).
5. List/detail may include `ai_indicators` (no extra LLM call) for completeness, execution readiness, duplicate risk, and flags — informational only; they do not block workflow.

## RBAC Keys

| Key | Capability |
|-----|------------|
| `orders.ai.extract` | Extract from document |
| `orders.ai.enrich` | Enrich from context |
| `orders.ai.validate` | Validate / readiness |
| `orders.ai.dedupe` | Overlap check |
| `orders.ai.summary` | Summary |
| `orders.ai.next_actions` | Next actions |
| `orders.ai.audit` | Audit log |
| `orders.ai.apply_suggestions` | Mark / apply / finalize |
| `orders.ai.discard_suggestions` | Discard batch |

Missing key ⇒ allowed. Explicit `false` denies. Admin/manager/owner-style roles are allow-all for these checks.

## API Surface (FastAPI)

Under `/api/v1/orders/ai/`:

- `POST .../extract` (multipart)
- `POST .../enrich`, `validate`, `dedupe`, `summary`, `next-actions`
- `GET .../audit-log`
- Suggestion batch: `mark-decisions`, `apply-suggestions`, `discard`, `link-order`, `finalize-after-create`

## Frontend Integration

- **OrderCreatePage:** sidebar `OrderAiPanel` (create mode; summary/next hidden), merge extraction into form (≥55% confidence), finalize batches after successful create.
- **OrderDetailPage:** full panel + audit history; optional “apply enrich ≥85%” with conflict skip; refresh order after apply.
- **OrdersPage:** `listOrders({ ai_indicators: 1 })` and an “Exec AI” column (E% / C% + dup risk hint).

## Database Migration

Alembic revision **135** (depends on **134**): `order_ai_suggestion_batches`, `order_ai_suggestion_items`.

```bash
docker compose exec backend alembic upgrade head
```

## Tests

DB-backed integration tests:

```bash
docker compose exec backend python -m pytest tests/test_order_ai_integration.py -v
```

Coverage includes tenant isolation, RBAC deny, allowlist-only apply, protected field rejection, discard blocking apply, trace batches, finalize-after-create audit, and related flows.

## Known Limitations

- Extract quality depends on document clarity and the configured extract provider (e.g. Gemini).
- Dedupe is heuristic similarity, not legal deduplication.
- Next-actions are suggestions only; TNA/follow-up records are not auto-created in this phase.
- Deep costing intelligence and production-planning AI are out of scope here; start those only after stable order execution telemetry and clear data contracts.

## What to Build Next (Recommendation)

Prefer **production-planning / ATP-CTP alignment AI** (read-only recommendations tied to existing promise checks) before advanced **costing intelligence**, unless finance mandates costing-first — costing AI needs locked definitions for overhead, currency, and revision rules to avoid conflicting with approved quotations.
