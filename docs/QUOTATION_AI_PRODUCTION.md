# Quotation AI — Production Implementation

## Overview

Quotation AI adds AI-assisted enrichment, validation, deduplication, summary, and next-action suggestions to the quotation module. It follows the same proven architecture used by Customer AI, Vendor AI, and Inquiry AI.

**Key constraint:** AI never directly writes calculated costing fields (material_cost, manufacturing_cost, total_cost, cost_per_piece, profit_percentage, quoted_price, total_amount, other_cost). Costing line tables (materials, manufacturing, other costs, size ratios) remain entirely manual/existing-workflow controlled.

## Reuse Map

| Layer | Reused from | Quotation AI file |
|-------|-------------|-------------------|
| ORM | inquiry_ai_suggestion.py | `models/quotation_ai_suggestion.py` |
| Batches | inquiry_ai_batches.py | `modules/quotations/quotation_ai_batches.py` |
| RBAC | inquiry_ai_authz.py | `modules/quotations/quotation_ai_authz.py` |
| Schemas | inquiry_ai_schemas.py | `modules/quotations/quotation_ai_schemas.py` |
| Prompts | inquiry_ai_prompts.py | `modules/quotations/quotation_ai_prompts.py` |
| Service | inquiry_ai_service.py | `modules/quotations/quotation_ai_service.py` |
| Router | inquiry_ai_router.py | `modules/quotations/quotation_ai_router.py` |
| Audit labels | audit_labels.py | `master_data_ai/audit_labels.py` (extended) |
| Frontend hook | useInquiryAi.ts | `hooks/useQuotationAi.ts` |
| Frontend panel | InquiryAiPanel.tsx | `components/quotations/QuotationAiPanel.tsx` |
| Frontend audit | InquiryAiAuditHistory.tsx | `components/quotations/QuotationAiAuditHistory.tsx` |

## Action Types

| Action | Type | Batch kind | LLM? |
|--------|------|-----------|------|
| Enrich | field-suggestion | enrich | Yes |
| Validate | trace-only | validate | No (rules engine) |
| Dedupe | trace-only | dedupe | No (DB similarity) |
| Summary | trace-only | summary | Yes |
| Next-actions | trace-only | next_actions | Yes |

## Field Scope

### Allowlisted (AI may suggest)

- `style_ref`, `department`, `projected_quantity`
- `projected_delivery_date`, `quotation_date`, `valid_until`
- `target_price`, `target_price_currency`, `exchange_rate`
- `shipping_term`, `commission_mode`, `commission_type`, `commission_value`
- `currency`, `notes`
- `customer_id`, `style_id`, `customer_intermediary_id` (FK validated on apply)

### Protected / Calculated (AI apply always rejects)

- `material_cost`, `manufacturing_cost`, `other_cost`, `total_cost`
- `cost_per_piece`, `profit_percentage`, `quoted_price`, `total_amount`
- `status`, `version_no`, `quotation_code`, `inquiry_id`, `tenant_id`

### Costing Safety Rules

1. AI suggestions are **header-only** — costing line items (materials, manufacturing, other costs, size ratios) are never modified by AI.
2. The `accumulate_quotation_update` function explicitly exits if `field_key in PROTECTED_FIELDS`.
3. The `apply_suggestions_to_quotation` function double-checks both `ALLOWED_FORM_KEYS` and `PROTECTED_FIELDS` before writing.
4. Status transitions remain governed by `QUOTATION_TRANSITIONS` workflow rules.
5. `inquiry_id` is immutable via AI — only set during inquiry-to-quotation conversion.

## RBAC Keys

| Key | Action |
|-----|--------|
| `quotations.ai.enrich` | Enrich from context |
| `quotations.ai.validate` | Validate / costing readiness |
| `quotations.ai.dedupe` | Find overlapping quotations |
| `quotations.ai.summary` | Generate summary |
| `quotations.ai.next_actions` | Next-action ideas |
| `quotations.ai.audit` | View AI audit log |
| `quotations.ai.apply_suggestions` | Mark / apply / finalize |
| `quotations.ai.discard_suggestions` | Discard suggestion batch |

Missing key => allowed. Explicit `false` denies. Admin/manager/owner always allowed.

## AI Indicators

The `list_quotations` endpoint accepts `ai_indicators=1` to return a lightweight `QuotationAiIndicatorsOut` (no LLM call) with:
- `completeness_score` (0-100): header fill rate
- `costing_readiness_score` (0-100): style + qty + target price + costing lines + currency
- `flags`: list of missing/warning items

Displayed as a "C-ready" column in the quotations list page.

## Frontend Integration

- **QuotationWorkspacePage** sidebar: `QuotationAiPanel` + `QuotationAiAuditHistory`
- **QuotationsPage** table: "C-ready" column showing `costing_readiness_score`
- **useQuotationAi hook**: mirrors `useInquiryAi` — manages enrich, validate, dedupe, summary, next-actions state

## Database Migration

```
Alembic revision 134 (depends on 133)
Tables: quotation_ai_suggestion_batches, quotation_ai_suggestion_items
```

Run migration:
```bash
docker compose exec backend alembic upgrade head
```

## Test Commands

```bash
# Install test deps (if not already installed)
docker compose exec backend pip install -q 'pytest>=8.3,<9' 'pytest-asyncio>=0.24,<1'

# Run quotation AI tests
docker compose exec backend pytest tests/test_quotation_ai_integration.py -v
```

10 tests covering:
1. Tenant isolation on batch load
2. Discard blocks apply (409)
3. Trace batch rejects mark decisions (400)
4. Non-allowlisted field skipped on apply
5. **Calculated costing field rejected on apply** (critical safety test)
6. Allowlisted field (department) successfully applied
7. Validate persists trace batch
8. Dedupe persists trace batch
9. Finalize-after-create writes audit log
10. RBAC denies apply_suggestions when role has explicit `false`

## Limitations

- No document extraction endpoint for quotations (quotations are typically created from inquiries or manually; document extraction may be added in a future phase).
- Costing line suggestions (e.g., "add this material at this price") are out of scope for this phase.
- AI cannot trigger status transitions or inquiry-to-quotation conversion.

## Next Phase Readiness

Order AI and costing-intelligence features can start next. The Quotation AI architecture provides:
- Proven batch pattern for suggestion management
- Protected-field enforcement that can be extended to Order fields
- Audit trail infrastructure reusable for any entity
- RBAC pattern extensible to `orders.ai.*` keys
