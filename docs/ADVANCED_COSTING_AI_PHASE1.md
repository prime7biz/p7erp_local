# Advanced costing AI — Phase 1 (read-only cost intelligence)

## Scope

Phase 1 adds **deterministic, audited, tenant-scoped** costing intelligence for quotations. It does **not** call an LLM and does **not** write costing lines, roll-ups, quoted prices, margins, FX, or status.

Use cases:

- Cost completeness checklist (missing materials / CM / other costs, quantity, style context, size ratios)
- Anomaly scan (negative amounts, header vs line roll-up drift, mixed line currencies)
- Margin risk explanation (quoted vs `total_cost` from governed header fields)
- FX sensitivity (header FX rules + currency mix)
- Compact costing summary and rule-based next actions
- Separate audit trail under `prompt_category = quotation_costing_ai`

## Centralized configuration

All thresholds and scoring weights live in **`backend/app/modules/quotations/quotation_costing_intelligence_config.py`** (single module). Examples:

| Area | Constants |
|------|-----------|
| Header vs line drift | `HEADER_LINE_DRIFT_MIN_ABS`, `HEADER_LINE_DRIFT_RELATIVE` (5%) |
| Margin pressure | `MARGIN_PRESSURE_HIGH_BELOW_PCT` (3%), `MARGIN_PRESSURE_MEDIUM_BELOW_PCT` (10%) |
| Size ratio sum | `SIZE_RATIO_SUM_LOW` / `SIZE_RATIO_SUM_HIGH` (99.5–100.5) |
| Completeness score | `COMPLETENESS_PREREQ_TOTAL` (6 equal prerequisites) |
| Confidence penalties | `CONFIDENCE_PENALTY_PER_HIGH_ANOMALY`, `…_MEDIUM_…`, `…_COMPLETENESS_ITEM`, `CONFIDENCE_PENALTY_CAP` |
| Urgency | `URGENT_COSTING_CONFIDENCE_BELOW` (45), `ANOMALY_MEDIUM_COUNT_FOR_HIGH_SEVERITY` (2) |
| Confidence basis | `CONFIDENCE_FULL_BASIS_MIN_SCORE` (70) when `signal_scope` is `full_costing` |
| List indicators | `HEADER_COMPLETENESS_FIELD_COUNT`, `COSTING_READINESS_CHECK_COUNT` |

Human-readable labels for UI are in the same file as **`REASON_CODE_LABELS`** (mirrored on the frontend in `frontend/src/lib/quotationCostingReasonLabels.ts`).

## Machine-readable `reason_codes`

The bundle aggregates a deduplicated **`reason_codes`** array (snake_case). Line-level items expose **`reason_code`** (and **`code`**, same value, for compatibility). Examples:

| reason_code | Typical trigger |
|-------------|-----------------|
| `missing_material_rows` | No meaningful material lines |
| `missing_manufacturing_rows` | No meaningful CM lines |
| `missing_other_cost_rows` | No meaningful other-cost lines |
| `negative_line_amount` | Negative amount on a line |
| `header_line_total_mismatch` | Header material/mfg vs line sums beyond tolerance |
| `mixed_line_currencies` | Line currencies differ from document currency |
| `missing_fx_assumption` | Header FX validation issues |
| `low_margin_buffer` | Margin pressure band is high |
| `incomplete_quantity_linkage` | Missing projected qty or size-ratio gaps |
| `incomplete_inquiry_context` | No linked inquiry |
| `incomplete_style_context` | No style id/ref |
| `size_ratio_sum_drift` | Size ratio % sum outside band |
| `header_total_cost_missing` | Header `total_cost` missing/zero |
| `urgent_costing_review` | Urgent composite rule fired |

Additional codes may be added while staying in this naming style.

## Signal metadata (`signal_scope`, `confidence_basis`, `source_mode`)

| Field | Values | Meaning |
|-------|--------|---------|
| `signal_scope` | `header_only` \| `full_costing` | List indicators use **`header_only`** (no lines loaded). Detail with `ai_indicators=1` uses **`full_costing`**. |
| `confidence_basis` | `partial` \| `full` | **`partial`** when scope is header-only, or when costing confidence score is below `CONFIDENCE_FULL_BASIS_MIN_SCORE` (full scope only). |
| `source_mode` | `deterministic_only` | Always rules engine; no LLM. |
| `limited_confidence` | bool | True when `confidence_basis` is `partial`. |

POST costing endpoints always run with **`full_costing`** (full lines loaded server-side).

## Feature flag

| Layer | Behavior |
|-------|----------|
| **Global** | Env **`QUOTATION_AI_COSTING_PHASE1_ENABLED`** (default `true`). If `false`, all Phase 1 **POST** routes return **403** with `code: QUOTATION_COSTING_PHASE1_DISABLED`. |
| **Tenant** | JSON **`tenants.feature_flags["quotation_ai_costing_phase1_enabled"]`**. If present and **`false`**, Phase 1 POST routes are off for that tenant even when global is on. Missing key ⇒ follow global. |

List/detail **`ai_indicators`**: when disabled, Phase 1 numeric fields are zeroed/neutral and **`costing_phase1_enabled: false`**.

## Audit design (sanitized)

`AiAuditLog.details_json` for costing actions includes (among existing fields):

- **`action_type`** — short slug (e.g. `cost_completeness_check`, `costing_anomaly_scan`)
- **`result_status`** — e.g. `success`
- **`source_mode`** — `deterministic_only`
- **`reason_codes`** — bounded list (no free-text payloads)
- **`indicator_snapshot`** — scores/severity flags only (no line text)
- **`correlation_id`** — same as request/trace id when present
- **`request_fingerprint_sha256`** — hash of tenant id, quotation id, action type, and **line counts** only (no amounts or descriptions)

Raw quotation line content is **not** stored in audit details.

## Safety boundary

| Allowed | Not allowed |
|--------|-------------|
| Read quotation header + persisted lines | Mutate `quotation_materials`, `quotation_manufacturing`, `quotation_other_costs`, header totals |
| Return structured JSON | Auto-apply AI suggestions to costing |
| Log `AiAuditLog` rows | Bypass commercial lock / change control |

Outputs are **advisory**. When data is incomplete, messages state that confidence is limited.

## API (FastAPI)

Base path: `/api/v1/quotations/ai` (same router as quotation AI).

| Method | Path | Description |
|--------|------|-------------|
| POST | `/cost-completeness-check` | Body: `{ "quotation_id": n }` |
| POST | `/costing-anomaly-scan` | Same |
| POST | `/margin-risk-explanation` | Same |
| POST | `/fx-sensitivity-summary` | Same |
| POST | `/costing-summary` | Same |
| POST | `/costing-next-actions` | Same (distinct from existing `/next-actions` LLM route) |
| GET | `/costing-audit-log` | Query: `quotation_id`, `limit` — uses **audit** capability |

Responses include **`signal_scope`**, **`confidence_basis`**, **`source_mode`**, **`reason_codes`**, **`limited_confidence`** on costing payloads.

**Note:** The originally suggested path `POST .../next-actions` for costing would collide with the existing quotation **LLM** next-actions endpoint. The implementation uses **`/costing-next-actions`** instead.

## RBAC

- Primary permission key: `quotations.ai.costing_intelligence` (capability `costing_intelligence` in code).
- Costing audit log GET reuses **`audit`** (`quotations.ai.audit`) like the main quotation AI audit log.
- Same conventions as other quotation AI keys: missing permission ⇒ allow; explicit `false` denies; admin/manager-style role names still bypass per existing `quotation_ai_authz` rules.

## Indicators (list + detail)

`QuotationAiIndicatorsOut` includes Phase 1 fields plus metadata:

- `costing_phase1_enabled`, `signal_scope`, `confidence_basis`, `source_mode`, `reason_codes`, `limited_confidence`
- `cost_completeness_score`, `costing_confidence_score`
- `anomaly_severity`, `margin_pressure`, `fx_sensitivity`
- `missing_prerequisite_count`, `urgent_costing_review`, `costing_flags`

- **List:** `GET /api/v1/quotations?ai_indicators=1` — **`signal_scope: header_only`** (weaker, cheap).
- **Detail:** `GET /api/v1/quotations/{id}?ai_indicators=1` — **`signal_scope: full_costing`** with full line context.

## Tests (Docker)

```bash
docker compose exec backend pytest tests/test_quotation_costing_ai_integration.py tests/test_quotation_costing_intelligence_unit.py -v
```

Integration tests assert **no mutation** of protected quotation totals, margins, FX, status, version, and line counts across **each** costing POST route. Feature-flag **403** paths are covered.

## Frontend

- Workspace sidebar: **Costing intelligence** panel (Advisory, snapshot metadata, reason labels, trace viewer).
- Quotation list: compact chips including **Hdr** (header-based), **Lim** (limited confidence), **Off** when Phase 1 disabled.

## Rollout guidance

1. **Pilot:** Leave global default **on**; disable specific tenants with `feature_flags.quotation_ai_costing_phase1_enabled: false` until training is done.
2. **Freeze / incident:** Set **`QUOTATION_AI_COSTING_PHASE1_ENABLED=false`** for immediate global off (POST routes 403; indicators show Phase 1 off).
3. **Production:** Keep audit category `quotation_costing_ai` in log monitoring; watch `reason_codes` and `indicator_snapshot` distributions (no PII in snapshots).

## Limitations

- No historical benchmarking against other quotations (tenant-wide “outlier” analytics) in Phase 1.
- No LLM-generated narrative (avoids ungrounded prose).
- Header vs line roll-up checks use simple sums and configured tolerance; complex pricing formulas are not re-implemented server-side.

## Next phase recommendation

Do **not** start a **write-enabled** costing AI phase until:

1. Product defines explicit human approval for any non-header field writes.
2. Change-control rules for costing lines are specified (likely always change request when locked).
3. Regression tests cover PUT/PATCH parity with UI roll-ups.

Phase 2 could add **optional** LLM explanations **only** as short text constrained by the same structured bundle (still no free-form numeric claims).
