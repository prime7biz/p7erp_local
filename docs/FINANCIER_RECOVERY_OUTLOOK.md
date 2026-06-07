# Financier recovery outlook

## Purpose

Bank-facing **loan recovery** signals per financed order. Combines:

- **Outstanding principal** from linked facility utilizations
- **Proceeds proxy** = FOB × order qty × sewing % (or 100% if shipped)
- **Coverage ratio** = proceeds proxy ÷ outstanding principal
- **Recovery band** and **score** with plain-language **drivers**

## API (external JWT, `/api/external/financier`)

Requires `financier_advanced_portal_enabled`, `credit_monitoring` scope, and `financier_party_id`.

| Method | Path |
|--------|------|
| GET | `/recovery-outlook` |
| GET | `/orders/{id}/recovery-outlook` |
| GET | `/reports/recovery_summary` |

## Bands

| Band | Typical coverage |
|------|------------------|
| `strong` | ≥ 1.5 |
| `adequate` | ≥ 1.0 |
| `watch` | ≥ 0.7 |
| `at_risk` | &lt; 0.7 |

## Frontend

- `/portal/financier/recovery-outlook` — list view
- Order detail → **Finance & recovery** tab
- Dashboard → **Recovery at a glance** strip (credit scope)

## Alerts

- `RECOVERY_COVERAGE_LOW` — coverage &lt; 1.0 near delivery
- `RECOVERY_AT_RISK` — band `at_risk`
- `PRODUCTION_STALLED` — sewing lag vs delivery window
