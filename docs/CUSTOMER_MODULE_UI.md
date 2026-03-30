# Customer module — UI and backend wiring

## Scope

- List: paginated customers with server-driven facets (`GET /api/v1/customers/facets`, `GET /api/v1/customers/paginated`).
- Detail: profile, AI insights, **related inquiries / quotations / orders** (`GET /api/v1/customers/{id}/related`), health (`GET /api/v1/customers/{id}/health`), optional AR aging by party name (`GET /api/v1/finance/bills/aging`).

## Frontend

- Shared layout: `AppPageHeader`, `WorkflowSummaryStrip`, `LinkedRecordsSection` under `frontend/src/components/app/`.
- Pages: `CustomersPage.tsx`, `CustomerDetailPage.tsx`.

## Rules

- KPIs and filters on the list are **backend-driven** (no hard-coded customer counts).
- Related records come **only** from `/customers/{id}/related` (tenant-scoped on the server).

## Tests

```bash
docker compose exec backend pytest tests/test_customer_module_wiring_integration.py -v
```

## Limitations

- Receivable aging still matches finance `party_name` (string); there is no `customer_id` on `OutstandingBill` yet.
