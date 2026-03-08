import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { adminUsers } from "@shared/schema";
import { eq } from "drizzle-orm";

function getAdminJwtSecret(): string {
  const s = process.env.ADMIN_JWT_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("ADMIN_JWT_SECRET missing");
    return "dev-only-admin-secret";
  }
  return s;
}

export interface AdminJwtPayload {
  adminId: number;
  email: string;
  role: string;
}

export function createAdminToken(payload: AdminJwtPayload): string {
  return jwt.sign(payload, getAdminJwtSecret(), { expiresIn: "12h" });
}

export async function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.admin_token || (
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : null
    );

    if (!token) {
      return res.status(401).json({ message: "Admin authentication required" });
    }

    const decoded = jwt.verify(token, getAdminJwtSecret()) as AdminJwtPayload;
    
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, decoded.adminId));
    
    if (!admin || !admin.isActive) {
      return res.status(401).json({ message: "Invalid admin token" });
    }

    (req as any).admin = admin;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired admin token" });
  }
}

export function requireAdminRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const admin = (req as any).admin;
    if (!admin) {
      return res.status(401).json({ message: "Admin authentication required" });
    }
    if (roles.length > 0 && !roles.includes(admin.role)) {
      return res.status(403).json({ message: "Insufficient admin permissions" });
    }
    next();
  };
}
