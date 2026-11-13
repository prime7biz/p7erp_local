"""Manufacturing Intelligence (Phase 1): read-only capacity, line loading, readiness and delivery views.

Rules for this package (see docs/manufacturing-intelligence/09-technical-architecture.md):
- GET endpoints only. No database writes (no add / flush / commit / delete) and no calls to the
  write paths of production, merchandising or inventory services.
- Every query is filtered by tenant_id.
- Quantities and minutes are Decimal and are returned as decimal strings.
"""
