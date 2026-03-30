# Commercial numéraire and cross-document snapshot

This note describes the **foundation layer** for quotation and order commercial money semantics (before advanced costing AI).

## Numéraire / book currency

- **Costing numéraire (document currency):** `quotations.currency` is the basis for line rollups and factory costing on the quotation. The same idea applies when an order is created from a quotation: the frozen snapshot records that document currency.
- **Reporting / book currency:** Shown in APIs as `commercial_book_currency`. By default it equals the document currency (or the frozen snapshot’s `document_currency` on orders). Tenants may set a fixed ISO code for cross-document reporting via `tenants.feature_flags.commercial_book_currency` (see `COMMERCIAL_BOOK_CURRENCY_FLAG_KEY` in `backend/app/modules/orders/commercial_numeraire.py`).
- **Buyer target currency:** `target_price_currency` plus optional header `exchange_rate` when target and document currencies differ. Validation lives in `quotation_commercial_money.validate_header_fx_rules` (no silent invalid FX).

## Order commercial snapshot

- Column: `orders.commercial_snapshot_json` (nullable for legacy rows).
- Populated when creating an order **from a quotation** (`build_order_commercial_snapshot_at_conversion`). It is a **frozen** copy of the quotation commercial header at conversion time, not auto-updated when the live quotation changes.

## Alignment API (read-only)

- `GET /api/v1/orders/{order_id}/commercial-alignment` returns:
  - `commercial_book_currency`, `costing_numeraire_description`
  - `frozen_at_conversion`, `live_quotation`, `order_execution`
  - `discrepancies` (drift between frozen snapshot, live quotation, and order execution fields)
  - `quotation_commercially_locked`, `quotation_status`
- The endpoint does **not** mutate orders or quotations.

## Governance: locks, change requests, quotation AI

- Commercially locked quotation statuses: `APPROVED`, `SENT`, `CONVERTED` (`QUOTATION_COMMERCIAL_LOCKED_STATUSES`).
- Protected commercial fields for quotations: `QUOTATION_PROTECTED_COMMERCIAL_FIELDS` in `backend/app/modules/orders/commercial_fields.py`.
- Quotation AI **apply** skips those fields when locked and returns `requires_change_request` items instead of writing the database.
- Order commercial lock and change requests use the same pattern for orders (`ORDER_*` in the same module).

## Tests (Docker)

```bash
docker compose exec backend pytest tests/test_quotation_commercial_money.py tests/test_quotation_ai_integration.py tests/test_commercial_snapshot_integration.py -v
```

## Limitations and next steps

- This phase does **not** add autonomous costing or auto-reconciliation of quotation vs order prices.
- Advanced costing AI should treat `commercial_snapshot_json` and alignment discrepancies as **context only** until a future phase explicitly allows governed writes.
