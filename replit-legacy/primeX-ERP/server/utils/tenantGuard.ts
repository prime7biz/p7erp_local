import { and, eq, SQL } from "drizzle-orm";
import { PgColumn } from "drizzle-orm/pg-core";

export function tenantWhere(tenantIdColumn: PgColumn, tenantId: number, ...extraConditions: (SQL | undefined)[]): SQL {
  const conditions = [eq(tenantIdColumn, tenantId), ...extraConditions.filter(Boolean)] as SQL[];
  return and(...conditions)!;
}

export function requireTenantId(tenantId: number | undefined | null): number {
  if (!tenantId) {
    throw new TenantError("Tenant context is required for this operation");
  }
  return tenantId;
}

export class TenantError extends Error {
  public readonly code = "TENANT_GUARD_VIOLATION";
  public readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "TenantError";
  }
}
