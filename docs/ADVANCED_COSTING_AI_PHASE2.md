# Advanced costing AI — Phase 2 (review-mode line suggestions)

## Scope

- **Generate** deterministic costing **line** suggestions from the same rules engine used in Phase 1 (`build_costing_intelligence_bundle`).
- **Persist** suggestions in `quotation_costing_suggestion_batches` / `quotation_costing_suggestion_items`.
- **Apply** only after explicit user action; **never** auto-apply.
- **Never** write header roll-ups (`material_cost`, `manufacturing_cost`, `other_cost`, `total_cost`, `cost_per_piece`, `profit_percentage`, `quoted_price`, `total_amount`).

## Safety rules

| Rule | Enforcement |
|------|-------------|
| Header roll-ups | Not in allowed line field maps; apply filters `field_changes_json`. |
| Commercially locked quotation | Line **apply** is **blocked** (no silent mutation). Use **Revise** to draft before editing lines. |
| Change requests | Existing `commercial_change_request` flow applies to **header** protected fields only; line-level locked quotes do not auto-create CRs. |
| Audit | `QUOTATION_COSTING_SUGGESTIONS_*` actions under `prompt_category=quotation_costing_ai`. |

## Feature flags

- **Global:** `QUOTATION_AI_COSTING_PHASE2_ENABLED` (default `false` in `Settings`).
- **Per-tenant:** `tenants.feature_flags["quotation_ai_costing_phase2_enabled"]` — explicit `false` disables.
- **Phase 1** must remain enabled globally for Phase 2 routes (Phase 2 checks both).

## API (FastAPI)

Base: `/api/v1/quotations/ai`

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/costing-suggestions` | Generate batch + items (`QuotationCostingAiRequest`) |
| POST | `/costing-suggestions/mark-decisions` | Stage apply/reject/skip |
| POST | `/costing-suggestions/apply` | Apply decisions |
| POST | `/costing-suggestions/discard` | Discard batch |
| GET | `/costing-suggestions/{batch_id}` | Load batch |

**RBAC:** `costing_intelligence` for generate/get; `apply_suggestions` / `discard_suggestions` for apply/discard/mark.

## Frontend

- `QuotationCostingSuggestionsPanel` on quotation workspace (aside).
- Hook: `useQuotationCostingSuggestions`.

## Tests (Docker)

```bash
docker compose exec backend pytest tests/test_quotation_costing_suggestions_integration.py -v
```

## Limitations

- Suggestions are **rules-based** (no LLM) in this phase.
- Locked quotations: apply returns `requires_revision` and `blocked_items`; lines unchanged.
