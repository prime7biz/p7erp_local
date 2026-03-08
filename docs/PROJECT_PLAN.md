# P7 ERP – Project plan

High-level plan for P7 ERP. Detailed parity and routes: see [REFERENCE_PARITY.md](./REFERENCE_PARITY.md).

## Goal

Multi-tenant SaaS ERP for garments (manufacturing and buying house). Match **PrimeX** (reference in `replit-legacy/primeX-ERP/`) in structure and behavior, using **FastAPI + React** stack.

## Phases

| Phase | Focus |
|-------|--------|
| **Phase 1** | Auth (company code + username login), public pages (Features, Pricing, Contact, About), full app sidebar with all sections and placeholder routes. Register: tenant with `company_code`. |
| **Phase 2** | Core merchandising: Customers, Inquiries, Quotations, Orders – backend + frontend matching reference flows. |
| **Phase 3** | Inventory (items, warehouses, PO, GRN, stock), then Manufacturing (samples, TNA, production), then Quality, then Finance/Accounts. |
| **Phase 4** | Commercial (export cases, PI, BTB LCs), HR, Reports, remaining settings and workflows. |

## Implementation order

1. **Scaffold** all app routes (placeholder pages) to match reference sidebar.
2. **Fill modules** one by one: backend API under `backend/app/modules/`, frontend under `frontend/src/`; follow reference flows.

## Key docs

- `README.md` – run instructions, structure.
- `docs/REFERENCE_PARITY.md` – auth, public routes, app sidebar, backend modules, reference sources.
- `docs/session_plan_legacy.md` – reference (PrimeX) session tasks (e.g. quotation fixes).
