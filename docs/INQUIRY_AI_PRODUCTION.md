# Inquiry AI (production notes)

Inquiry AI follows the same architecture as **Customer AI** and **Vendor (supplier) AI**: field-suggestion batches (extract / enrich), trace-only batches (validate / dedupe / summary / next_actions), review-first apply, RBAC, tenant isolation, `AiAuditLog` rows with `prompt_category=inquiry_ai`, and retention aligned with `customer_ai_batch_retention_days`.

## Reuse map

| Capability | Customer AI | Vendor AI | Inquiry AI |
|------------|-------------|-----------|------------|
| Batch tables + items | `customer_ai_suggestion_*` | `vendor_ai_suggestion_*` | `inquiry_ai_suggestion_*` |
| Apply / discard / finalize | `customer_ai_batches` | `vendor_ai_batches` | `inquiry_ai_batches` |
| Gateway + sanitization | `master_data_ai` | same | same |
| Audit labels | `customer_ai_event_label` | `vendor_ai_event_label` | `inquiry_ai_event_label` |
| HTTP routes | `/customers/ai/*` | `/inventory/vendors/ai/*` | `/inquiries/ai/*` |

Mounting: the inquiry AI router is included on the inquiries router with prefix `/ai` **before** `GET /inquiries/{inquiry_id}` so `ai` is not parsed as an ID.

## Action types

- **Field suggestions (persistent items):** `extract`, `enrich` — support mark decisions, apply (existing inquiry or after create via finalize), discard.
- **Trace results (no field items to apply):** `validate`, `dedupe`, `summary`, `next_actions` — stored as completed batches with `meta_json` and audit entries.

## Allowlisted apply fields

Aligned with `inquiry_ai_batches.ALLOWED_FORM_KEYS`: `style_ref`, `season`, `department`, `quantity`, `target_price`, `target_price_currency`, `currency`, `exchange_rate`, `expected_delivery_date`, `shipping_term`, `commission_mode`, `commission_type`, `commission_value`, `notes`, `customer_id`, `style_id`, `customer_intermediary_id`.

## Protected / non-AI fields

- **Never auto-written by extract/enrich batches without user review:** `inquiry_code`, `tenant_id`, `status` (workflow transitions stay manual / existing APIs), `created_at`.
- **Quotation conversion** remains unchanged; AI does not create quotations.

## RBAC keys (`roles.permissions`)

Flat keys (explicit `false` denies; missing key allows, same as other AI modules):

- `inquiries.ai.extract`, `enrich`, `validate`, `dedupe`, `summary`, `next_actions`, `audit`, `apply_suggestions`, `discard_suggestions`

Optional nested: `inquiries.ai: { "extract": true, ... }`.

Admin-like role names (`admin`, `manager`, `owner`, …) bypass per-key checks but still require `can_use_ai_module`.

## Frontend

- **Create / edit:** `InquiryCreatePage` uses `useInquiryAi`, document extract via `POST /inquiries/ai/extract`, enrich panel, Autofill review, finalize-after-create on first save.
- **Detail:** `InquiryDetailPage` — `InquiryAiPanel` + `InquiryAiAuditHistory`.
- **List:** `InquiriesPage` requests `ai_indicators=1` for rules-based **Q-ready** column (no LLM).

## Tests

```bash
docker compose exec backend pytest tests/test_inquiry_ai_integration.py -v
```

## Known limitations

- **Summary / next_actions** require a configured LLM provider; validate/dedupe/trace rules work without it.
- List indicators are **deterministic** (completeness / quotation readiness / flags), not model-generated.
- **Quotation AI** can start after this phase: quotation entities and CRUD should mirror the same batch/trace pattern when you add it.
