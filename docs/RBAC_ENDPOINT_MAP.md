# RBAC Endpoint Map (Internal App)

This map documents the module-level access keys used for internal route/API protection.

## Module Access Keys

- `inventory.access` -> Inventory APIs and inventory app routes
- `production.access` -> Production/quality APIs and production app routes
- `finance.access` -> Finance APIs and accounts/banking/finance app routes
- `facility.access` -> Facility APIs and facility app routes
- `settings.access` -> Settings APIs and settings app routes

## Backend Wiring

- Inventory router: `backend/app/modules/inventory/router.py`
- Production aggregate router: `backend/app/modules/production/router.py`
- Finance router: `backend/app/modules/finance/router.py`
- Facility router: `backend/app/modules/facility/router.py`
- Settings router: `backend/app/modules/settings/router.py`

## Enforcement Mode

RBAC mode is read from `tenants.feature_flags.rbac_enforcement`:

- `off` -> permission dependency allows all requests
- `shadow` -> permission dependency logs denial metadata and allows requests
- `enforce` -> permission dependency denies with HTTP 403 when permission is missing

The mode logic is implemented in `backend/app/common/permissions.py`.
