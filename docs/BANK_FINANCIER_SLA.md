# Bank / Financier SLA

For financial institutions using the financier portal.

## Service levels

| Tier | Uptime target | Support response |
|------|---------------|------------------|
| Standard | 99.5% monthly | 8 business hours |
| Bank partner | 99.9% monthly | 4 business hours |

## Data access

- Read-only financier portal (`/api/external/financier/*`)
- Scoped to `financier_party_id` and granted facilities
- Audit trail in `external_access_audit` tables

## Bank exports

- `GET /api/external/financier/bank-exports/portfolio-summary` — portfolio KPIs
- Financier portal: order book, BTB liabilities, goods movement, financial summary

## Incident escalation

1. Tenant admin opens `/app/support/tickets`
2. Platform admin reviews `/api/v1/admin/support`
3. Critical finance/data issues: escalate per contract

## Compliance

- Data processing agreement required before bank pilot
- AI narratives may require tenant approval when `external_ai_requires_approval=true`
