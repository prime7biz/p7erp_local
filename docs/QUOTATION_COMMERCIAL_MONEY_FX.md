# Quotation commercial money and FX (governance foundation)

This document describes the **normalized semantics and validation rules** for quotation header money and FX after the commercial-normalization phase. It is the baseline for future advanced costing AI (which must not bypass these rules).

## Field map (header)

| Field | Role | Editable (draft) | Locked statuses |
|-------|------|-------------------|-----------------|
| `target_price` | Buyer reference price (stringly-typed in DB) | Yes (PUT) | Change request when `APPROVED` / `SENT` / `CONVERTED` |
| `target_price_currency` | Currency of buyer target | Yes | Same |
| `currency` | Document / costing currency for the quote | PATCH + PUT | Same |
| `exchange_rate` | FX from buyer target currency toward document currency (see UI copy) | Yes | Same |
| `profit_percentage` | Markup on **rolled-up factory `total_cost`** for auto `quoted_price` | Yes | Same |
| `quoted_price` | Offer price (manual or derived from cost + margin) | Yes | Same |
| `total_amount` | Summary offer total; aligned with `quoted_price` when the latter is set or auto-derived on PUT unless `total_amount` is sent explicitly | Yes (PATCH) | Same |
| `material_cost`, `manufacturing_cost`, `other_cost`, `total_cost`, `cost_per_piece` | **Calculated on PUT** when any of `materials` / `manufacturing` / `other_costs` keys are present | No (server-owned) | Full PUT blocked when locked |

**Note:** `profit_percentage` on **inquiry → quotation** conversion historically applied to inquiry target price; in the workspace, the same field drives margin on **factory total cost**. Operators should treat inquiry conversion as a starting point only.

## PUT rollup behavior

- If **none** of `materials`, `manufacturing`, `other_costs` are present in the JSON body, the server **does not** recompute header cost fields. This avoids zeroing stored rollups on partial saves.
- If **any** of those keys is present (including empty arrays), rollups run from the provided lines. Empty arrays clear that section and recompute totals from what remains.
- Amounts used in rollups are parsed **strictly**. Invalid numbers return **422** with `code: QUOTATION_MONEY_VALIDATION` and do **not** mutate costing lines.
- Only rows that the API would **persist** are included in validation and summation (same skip rules as insert: blank material rows, blank manufacturing `style_part`, blank other-cost `cost_head`).

## FX validation

When **document** `currency` and **buyer target** `target_price_currency` are both set and differ (case-insensitive), `exchange_rate` must parse as a number **greater than zero**. Otherwise the API returns **422** with `code: QUOTATION_FX_VALIDATION`.

## Currency normalization

`currency` and `target_price_currency` are trimmed and uppercased on PATCH/PUT.

## List API parity

`GET /api/v1/quotations` (`QuotationResponse`) includes `quotation_date`, `projected_delivery_date`, `target_price`, `target_price_currency`, and `exchange_rate` for dashboards and list indicators without a second round-trip.

## Protected fields and change control

See `backend/app/modules/orders/commercial_fields.py`. Direct PATCH only exposes a subset of fields; fields not on `QuotationUpdate` are changed via PUT (when unlocked) or **commercial change requests** when the quotation is commercially locked.

## Tests

- **Unit (no database):**  
  `docker compose exec backend pytest tests/test_quotation_commercial_money.py -v`
- **Integration (requires `DATABASE_URL` in container):**  
  `docker compose exec backend pytest tests/test_quotation_commercial_normalization_integration.py -v`

## Known limitations (before advanced costing AI)

- Line-level amounts are still summed **without** cross-currency normalization; mixed line currencies can make `total_cost` numerically inconsistent.
- Header `exchange_rate` is **not** applied in server rollup math; it is governed for consistency and AI/UI alignment.
- Order conversion still copies only a subset of commercial fields; pricing truth may remain on the quotation until a later phase.

## Readiness for advanced costing AI

After this phase, costing AI can rely on **stable validation**, **non-silent rollup parsing**, **FX header rules**, and **preserved rollups on partial PUTs**. Further work is still required for a single book currency, deterministic line FX into that currency, and order commercial snapshots before fully autonomous costing AI.
