# Merchandising rebuild — non-negotiable rules

Use this file together with `MERCHANDISING_REBUILD_MASTER_PLAN.md` and the audit reports when changing merchandising code.

## 1. Tenant isolation

- Every tenant-facing read/write must filter by `tenant_id` (or join through tenant-owned parents).
- Never load or mutate business rows by primary key alone without verifying `row.tenant_id == tenant.id` (or equivalent).
- Aggregates, exports, dashboards, AI audit reads, and change requests must all be tenant-scoped.

## 2. Database performance

- Avoid N+1 queries; use selective columns and joins.
- Paginate heavy lists (`MAX_PAGE_SIZE` and list endpoints).
- Control tower and report endpoints must aggregate **server-side** in bounded queries.
- Add indexes when new query patterns need them.

## 3. Full-stack wiring

- New capabilities ship with: model (if any) → schema → service → router → `client.ts` → hook/page → loading/error/empty states → permissions.

## 4. UI quality during build

- Screens must be usable and consistent with the rest of the ERP when merged (not “placeholder” unless explicitly temporary).

## 5. Backward compatibility

- Preserve `/api/v1/...` paths and response shapes unless a versioned migration is agreed.
- Merch router refactors move code only; URLs and contracts stay the same.

## 6. Garment-realistic workflows

- Flows should match buying-house / manufacturing merchandising (inquiry → quote → order → BOM → production handoff, TNA, samples).

## 7. Governed AI

- AI apply paths must respect: tenant, role/capability, commercial locks, and audit logging. No silent bypass of change-control.

## 8. Tests

- Add or extend tests for: cross-tenant denial, commercial locks, money math (when touched), BOM workflow, and critical API wiring.

---

*Aligned with Merchandising Module Rebuild Plan v2.*
