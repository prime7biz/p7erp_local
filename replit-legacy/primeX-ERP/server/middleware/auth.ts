import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { storage } from "../storage";
import { getJwtSecret } from "../utils/jwtSecret";

declare global {
  namespace Express {
    interface Request {
      user?: any;
      tenantId?: number;
    }
  }
}

export interface JwtPayload {
  userId: number;
  tenantId: number;
  roleId?: number;
  role?: string;
  isSuperUser: boolean;
}

export function createToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "24h" });
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.token || (
      req.headers.authorization?.startsWith("Bearer ") 
        ? req.headers.authorization.split(" ")[1] 
        : null
    );

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;

    const user = await storage.getUserById(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const tenant = await storage.getTenantById(decoded.tenantId);

    req.user = {
      ...user,
      tenant: tenant || { id: decoded.tenantId, name: 'Unknown', domain: 'unknown', isActive: true }
    };
    req.tenantId = decoded.tenantId;
    
    next();

  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function apiAuthenticate(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith('/api/')) {
    return next();
  }
  
  if (
    req.path === '/api/auth/login' || 
    req.path === '/api/auth/register' || 
    req.path === '/api/auth/logout' ||
    req.path === '/api/auth/demo-login' ||
    req.path.startsWith('/api/admin/') ||
    req.path.match(/\.(ico|png|jpg|jpeg|gif|svg|css|js|woff|woff2|ttf|eot)$/)
  ) {
    return next();
  }
  
  return authenticate(req, res, next);
}

export function requireRole(role: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.isSuperUser) {
      return next();
    }

    const roleLevelMap: Record<string, number> = {
      admin: 1,
      director: 2,
      general_manager: 3,
      manager: 4,
      approver: 5,
      recommender: 6,
      officer: 7,
      accounts_poster: 7,
      data_entry: 8,
      auditor: 9,
    };

    const requiredLevelMap: Record<string, number> = {
      admin: 1,
      manager: 4,
      user: 10,
    };

    let userLevel = 10;
    if (req.user.roleId) {
      try {
        const userRole = await storage.getRoleById(req.user.roleId);
        if (userRole) {
          userLevel = roleLevelMap[userRole.name] ?? userRole.level ?? 10;
        }
      } catch (err) {
        console.error("[requireRole] Error looking up role:", err);
      }
    }

    const requiredLevel = requiredLevelMap[role] ?? 10;

    if (userLevel > requiredLevel) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    next();
  };
}

export function requireSameTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.tenantId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const resourceTenantId = parseInt(req.params.tenantId, 10);
  
  if (resourceTenantId !== req.tenantId) {
    return res.status(403).json({ message: "Access denied to this tenant's resources" });
  }

  next();
}

export const isAuthenticated = authenticate;

export async function getCurrentUser(req: Request) {
  if (!req.user) {
    throw new Error("User not authenticated");
  }
  return req.user;
}
