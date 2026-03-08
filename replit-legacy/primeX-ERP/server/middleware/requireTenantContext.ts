import { Request, Response, NextFunction } from "express";

export function requireTenantContext(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: "Authentication required",
      code: "AUTH_REQUIRED",
    });
  }

  if (!req.tenantId && !req.user.tenantId) {
    return res.status(403).json({
      error: "Tenant context is required for this operation",
      code: "TENANT_CONTEXT_MISSING",
    });
  }

  if (!req.tenantId) {
    req.tenantId = req.user.tenantId;
  }

  next();
}
