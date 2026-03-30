# Cost benchmarking engine (Phase 13)

## Scope

- **Advisory only** — compares the current quotation’s header costing ratios and cost-per-piece to **tenant-scoped** historical quotations.
- **No writes** to quotations, costing lines, or prices.
- **Deterministic** statistics (min / max / avg / p25 / p75); optional narrative could be added later without changing numbers.

## Similarity (rule-based)

Peers must:

- Same `tenant_id`
- Status in `APPROVED`, `SENT`, `CONVERTED`
- Created within `months_back` (default 12)
- Optional: same `department`, same `currency`, `projected_quantity` within ±50% (when quantity set)
- Optional: `same_customer_only` narrows to the same `customer_id`

## Metrics

- Material / manufacturing / other **share of total_cost**
- **Cost per piece** (total_cost / projected_quantity)
- **Margin %** (header `profit_percentage` when present)

## Classifications

Deviation vs peer **average**: thresholds approximate **normal** (&lt;5%), **slightly_** (5–12%), **high/low** (12–25%), **abnormal** (&gt;25%).  
`insufficient_data` when fewer than **3** peers match.

## Feature flags

- **Global:** `QUOTATION_AI_COST_BENCHMARK_ENABLED` (default `false`).
- **Per-tenant:** `tenants.feature_flags["quotation_ai_cost_benchmark_enabled"]`.

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/quotations/ai/cost-benchmark` | Run benchmark |
| GET | `/api/v1/quotations/ai/cost-benchmark-history` | Recent audit rows |

Audit action: `QUOTATION_COST_BENCHMARK` (`prompt_category=quotation_costing_ai`).

## List badges

`GET /api/v1/quotations?ai_indicators=1&benchmark_hint=1` returns `ai_indicators.cost_benchmark_label` when a prior benchmark audit exists (feature enabled).

## Tests (Docker)

```bash
docker compose exec backend pytest tests/test_quotation_cost_benchmark_integration.py -v
```

## Limitations

- Uses **header** fields only (not rolled-up line recompute).
- Mixed currencies: peers filtered by header `currency` when set; cross-FX normalization is future work.
