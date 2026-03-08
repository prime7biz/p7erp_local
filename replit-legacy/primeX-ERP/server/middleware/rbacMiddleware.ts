import { Request, Response, NextFunction } from 'express';
import { checkPermission, getUserRoles } from '../services/permissionService';

export function requirePermission(...permissionKeys: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const tenantId = req.tenantId;
      if (!userId || !tenantId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      for (const key of permissionKeys) {
        const result = await checkPermission(userId, tenantId, key);
        if (!result.allowed) {
          return res.status(403).json({
            success: false,
            message: `Permission denied: requires all of [${permissionKeys.join(', ')}]. Missing: ${key}`,
            code: 'PERMISSION_DENIED',
          });
        }
      }
      next();
    } catch (error: any) {
      console.error('RBAC check error:', error);
      return res.status(500).json({ message: 'Permission check failed' });
    }
  };
}

export function requireAnyPermission(...permissionKeys: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const tenantId = req.tenantId;
      if (!userId || !tenantId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      for (const key of permissionKeys) {
        const result = await checkPermission(userId, tenantId, key);
        if (result.allowed) {
          return next();
        }
      }

      return res.status(403).json({
        success: false,
        message: `Permission denied: requires any of [${permissionKeys.join(', ')}]`,
        code: 'PERMISSION_DENIED',
      });
    } catch (error: any) {
      console.error('RBAC check error:', error);
      return res.status(500).json({ message: 'Permission check failed' });
    }
  };
}

export function requireRole(...roleNames: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const tenantId = req.tenantId;
      if (!userId || !tenantId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const userRoles = await getUserRoles(userId, tenantId);
      const userRoleNames = userRoles.map((r) => r.name);
      const hasRole = roleNames.some((rn) => userRoleNames.includes(rn));

      if (!hasRole) {
        return res.status(403).json({
          success: false,
          message: `Permission denied: requires any role of [${roleNames.join(', ')}]`,
          code: 'PERMISSION_DENIED',
        });
      }

      next();
    } catch (error: any) {
      console.error('RBAC role check error:', error);
      return res.status(500).json({ message: 'Role check failed' });
    }
  };
}
