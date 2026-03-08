import { Request } from "express";
import { eq, and, SQL } from "drizzle-orm";
import { PgColumn } from "drizzle-orm/pg-core";

export class TenantScopeError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = "TenantScopeError";
    this.statusCode = statusCode;
  }
}

export function requireTenant(req: Request): number {
  const tenantId = req.tenantId ?? (req as any).user?.tenantId;
  if (!tenantId || typeof tenantId !== "number") {
    throw new TenantScopeError("Tenant context required");
  }
  return tenantId;
}

export function withTenantFilter(
  tenantColumn: PgColumn,
  tenantId: number,
  ...extraConditions: (SQL | undefined)[]
): SQL {
  const conditions = [eq(tenantColumn, tenantId), ...extraConditions.filter(Boolean)] as SQL[];
  if (conditions.length === 1) return conditions[0];
  return and(...conditions)!;
}

export function assertTenantWrite<T extends Record<string, any>>(
  payload: T,
  tenantId: number
): T & { tenantId: number } {
  const sanitized = { ...payload };
  delete (sanitized as any).tenantId;
  return { ...sanitized, tenantId };
}
