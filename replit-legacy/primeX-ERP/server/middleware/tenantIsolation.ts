import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { eq } from "drizzle-orm";
import { logAudit } from "../services/auditService";

export function enforceTenantIsolation(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        error: "Authentication required",
        code: "AUTH_REQUIRED"
      });
    }

    if (!req.user.tenantId) {
      return res.status(403).json({ 
        error: "Tenant access required",
        code: "TENANT_ACCESS_REQUIRED"
      });
    }

    if (req.user.tenant) {
      if (!req.user.tenant.isActive) {
        return res.status(403).json({ 
          error: "Tenant account is suspended",
          code: "TENANT_SUSPENDED"
        });
      }

      const tenantStatus = (req.user.tenant as any).status;
      if (tenantStatus && tenantStatus !== 'APPROVED') {
        return res.status(403).json({
          error: `Tenant account is ${tenantStatus.toLowerCase()}`,
          code: `TENANT_${tenantStatus}`
        });
      }
    }

    req.tenantId = req.user.tenantId;

    next();
  } catch (error) {
    console.error("Tenant isolation error:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      code: "TENANT_ISOLATION_ERROR"
    });
  }
}

export function validateTenantResource(resourceTenantId: number, req: Request): boolean {
  return resourceTenantId === req.tenantId;
}

export function validateResourceAccess(getTenantId: (req: Request) => Promise<number | null>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resourceTenantId = await getTenantId(req);
      
      if (!resourceTenantId) {
        return res.status(404).json({ 
          error: "Resource not found",
          code: "RESOURCE_NOT_FOUND"
        });
      }

      if (!validateTenantResource(resourceTenantId, req)) {
        logAudit({
          tenantId: req.tenantId || 0,
          entityType: 'security',
          entityId: 0,
          action: 'CROSS_TENANT_BREACH_BLOCKED',
          performedBy: req.user?.id || 0,
          newValues: {
            attemptedTenantId: resourceTenantId,
            userTenantId: req.tenantId,
            path: req.path,
            method: req.method,
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        });
        console.error(`[SECURITY] CRITICAL: Cross-tenant access blocked. User ${req.user?.id} (tenant ${req.tenantId}) attempted to access resource in tenant ${resourceTenantId}`);
        return res.status(403).json({ 
          error: "Access denied to resource",
          code: "CROSS_TENANT_ACCESS_DENIED"
        });
      }

      next();
    } catch (error) {
      console.error("Resource validation error:", error);
      return res.status(500).json({ 
        error: "Internal server error",
        code: "RESOURCE_VALIDATION_ERROR"
      });
    }
  };
}

export function validateQueryResultTenantIsolation<T extends { tenantId?: number; tenant_id?: number }>(
  rows: T[],
  expectedTenantId: number,
  req: Request
): T[] {
  const violations: T[] = [];
  const clean: T[] = [];

  for (const row of rows) {
    const rowTenantId = row.tenantId ?? (row as any).tenant_id;
    if (rowTenantId !== undefined && rowTenantId !== null && rowTenantId !== expectedTenantId) {
      violations.push(row);
    } else {
      clean.push(row);
    }
  }

  if (violations.length > 0) {
    console.error(`[SECURITY] CRITICAL: ${violations.length} rows with mismatched tenantId detected in query results for tenant ${expectedTenantId}`);
    logAudit({
      tenantId: expectedTenantId,
      entityType: 'security',
      entityId: 0,
      action: 'TENANT_DATA_LEAK_BLOCKED',
      performedBy: req.user?.id || 0,
      newValues: {
        violationCount: violations.length,
        expectedTenantId,
        path: req.path,
        method: req.method,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    return clean;
  }

  return rows;
}

export function addTenantFilter(query: any, tenantId: number) {
  return query.where(eq(query.tenant_id, tenantId));
}

export function sanitizeInput(input: any, type: 'string' | 'number' | 'email' | 'id'): any {
  if (input === null || input === undefined) {
    return null;
  }

  switch (type) {
    case 'string':
      return String(input).trim().slice(0, 1000);
    case 'number':
      const num = Number(input);
      return isNaN(num) ? null : num;
    case 'email':
      const email = String(input).trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email) ? email : null;
    case 'id':
      const id = Number(input);
      return isNaN(id) || id <= 0 ? null : id;
    default:
      return String(input).trim();
  }
}