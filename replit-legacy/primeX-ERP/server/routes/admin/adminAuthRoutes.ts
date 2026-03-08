import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { adminStorage } from "../../database/admin/adminStorage";
import { createAdminToken, authenticateAdmin } from "../../middleware/adminAuth";
import { adminLoginSchema } from "@shared/schema";
import { getAuthCookieOptions, getClearCookieOptions } from "../../utils/cookies";

const router = Router();

router.post("/login", async (req: Request, res: Response) => {
  try {
    const parsed = adminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid credentials", errors: parsed.error.errors });
    }
    const { email, password } = parsed.data;
    const admin = await adminStorage.getAdminByEmail(email);
    if (!admin || !admin.isActive) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const passwordMatch = await bcrypt.compare(password, admin.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const token = createAdminToken({ adminId: admin.id, email: admin.email, role: admin.role });
    await adminStorage.updateAdmin(admin.id, { lastLogin: new Date() });
    await adminStorage.createAuditLog({ adminId: admin.id, action: "admin_login", ipAddress: req.ip || "unknown" });
    
    res.cookie("admin_token", token, getAuthCookieOptions('admin_token'));
    const { password: _, ...adminWithoutPassword } = admin;
    res.json({ message: "Admin login successful", admin: adminWithoutPassword });
  } catch (error: any) {
    console.error("Admin login error:", error);
    res.status(500).json({ message: "Login failed" });
  }
});

router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie("admin_token", getClearCookieOptions('admin_token'));
  res.json({ message: "Logged out" });
});

router.get("/me", authenticateAdmin, async (req: Request, res: Response) => {
  const admin = (req as any).admin;
  const { password: _, ...adminData } = admin;
  res.json(adminData);
});

router.post("/seed", async (req: Request, res: Response) => {
  try {
    const existingAdmins = await adminStorage.getAllAdmins();
    if (existingAdmins.length > 0) {
      return res.status(400).json({ message: "Admin users already exist" });
    }
    const hashedPassword = await bcrypt.hash("admin123", 10);
    const admin = await adminStorage.createAdmin({
      email: "superadmin@prime7erp.com",
      password: hashedPassword,
      firstName: "Super",
      lastName: "Admin",
      role: "super_admin",
      isActive: true,
    });
    res.json({ message: "Super admin created", email: "superadmin@prime7erp.com", password: "admin123" });
  } catch (error: any) {
    console.error("Seed error:", error);
    res.status(500).json({ message: "Failed to seed admin" });
  }
});

export default router;
