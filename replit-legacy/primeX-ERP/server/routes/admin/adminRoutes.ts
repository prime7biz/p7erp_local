import { parseIntParam } from "../../utils/parseParams";
import { Router, Request, Response } from "express";
import { authenticateAdmin, requireAdminRole } from "../../middleware/adminAuth";
import { adminStorage } from "../../database/admin/adminStorage";
import * as backupService from "../../services/backupService";
import bcrypt from "bcrypt";

const router = Router();

router.use(authenticateAdmin);

router.get("/metrics", async (req: Request, res: Response) => {
  try {
    const metrics = await adminStorage.getDashboardMetrics();
    res.json(metrics);
  } catch (error: any) {
    console.error("Metrics error:", error);
    res.status(500).json({ message: "Failed to fetch metrics" });
  }
});

router.get("/tenants", async (req: Request, res: Response) => {
  try {
    const tenants = await adminStorage.getAllTenants();
    res.json(tenants);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch tenants" });
  }
});

router.get("/tenants/:id", async (req: Request, res: Response) => {
  try {
    const tenant = await adminStorage.getTenantDetails(parseIntParam(req.params.id, "id"));
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    res.json(tenant);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch tenant" });
  }
});

router.patch("/tenants/:id/status", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const { isActive } = req.body;
    const tenant = await adminStorage.updateTenantStatus(parseIntParam(req.params.id, "id"), isActive);
    const admin = (req as any).admin;
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: isActive ? "tenant_activated" : "tenant_suspended",
      entityType: "tenant",
      entityId: parseIntParam(req.params.id, "id"),
      tenantId: parseIntParam(req.params.id, "id"),
      ipAddress: req.ip,
    });
    res.json(tenant);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to update tenant status" });
  }
});

router.post("/tenants/:id/approve", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const tenantId = parseIntParam(req.params.id, "id");
    const admin = (req as any).admin;
    
    const tenant = await adminStorage.approveTenant(tenantId, admin.id);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: "tenant_approved",
      entityType: "tenant",
      entityId: tenantId,
      tenantId: tenantId,
      details: { companyCode: tenant.companyCode, tenantName: tenant.name },
      ipAddress: req.ip,
    });
    
    try {
      const owner = await adminStorage.getTenantOwnerEmail(tenantId);
      if (owner?.email) {
        const { sendApprovalNotification } = await import("../../services/emailService");
        await sendApprovalNotification(owner.email, {
          companyName: tenant.name,
          companyCode: tenant.companyCode || '',
          ownerName: owner.firstName || 'Tenant Owner',
        });
      }
    } catch (emailErr) {
      console.error("Failed to send approval email:", emailErr);
    }
    
    res.json({ message: "Tenant approved successfully", tenant });
  } catch (error: any) {
    console.error("Approve tenant error:", error);
    res.status(500).json({ message: "Failed to approve tenant" });
  }
});

router.post("/tenants/:id/reject", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const tenantId = parseIntParam(req.params.id, "id");
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: "Rejection reason is required" });
    
    const admin = (req as any).admin;
    const tenant = await adminStorage.rejectTenant(tenantId, reason);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: "tenant_rejected",
      entityType: "tenant",
      entityId: tenantId,
      tenantId: tenantId,
      details: { reason, companyCode: tenant.companyCode },
      ipAddress: req.ip,
    });
    
    try {
      const owner = await adminStorage.getTenantOwnerEmail(tenantId);
      if (owner?.email) {
        const { sendRejectionNotification } = await import("../../services/emailService");
        await sendRejectionNotification(owner.email, {
          companyName: tenant.name,
          ownerName: owner.firstName || 'Tenant Owner',
          reason,
        });
      }
    } catch (emailErr) {
      console.error("Failed to send rejection email:", emailErr);
    }
    
    res.json({ message: "Tenant rejected", tenant });
  } catch (error: any) {
    console.error("Reject tenant error:", error);
    res.status(500).json({ message: "Failed to reject tenant" });
  }
});

router.post("/tenants/:id/suspend", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const tenantId = parseIntParam(req.params.id, "id");
    const { reason } = req.body;
    const admin = (req as any).admin;
    
    const tenant = await adminStorage.suspendTenant(tenantId, reason || 'Suspended by admin');
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: "tenant_suspended",
      entityType: "tenant",
      entityId: tenantId,
      tenantId: tenantId,
      details: { reason },
      ipAddress: req.ip,
    });
    
    res.json({ message: "Tenant suspended", tenant });
  } catch (error: any) {
    console.error("Suspend tenant error:", error);
    res.status(500).json({ message: "Failed to suspend tenant" });
  }
});

router.get("/tenants/:id/users", async (req: Request, res: Response) => {
  try {
    const users = await adminStorage.getTenantUsers(parseIntParam(req.params.id, "id"));
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch tenant users" });
  }
});

router.patch("/tenants/:id", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const { name, domain, logo } = req.body;
    const tenant = await adminStorage.updateTenant(parseIntParam(req.params.id, "id"), { name, domain, logo });
    const admin = (req as any).admin;
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: "tenant_updated",
      entityType: "tenant",
      entityId: parseIntParam(req.params.id, "id"),
      tenantId: parseIntParam(req.params.id, "id"),
      details: { name, domain },
      ipAddress: req.ip,
    });
    res.json(tenant);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to update tenant" });
  }
});

router.patch("/tenants/:id/users/:userId", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const tenantId = parseIntParam(req.params.id, "id");
    const userId = parseIntParam(req.params.userId, "userId");
    const { isActive, firstName, lastName, email, phone } = req.body;
    const user = await adminStorage.updateTenantUser(tenantId, userId, { isActive, firstName, lastName, email, phone });
    const admin = (req as any).admin;
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: "tenant_user_updated",
      entityType: "user",
      entityId: userId,
      tenantId: tenantId,
      details: req.body,
      ipAddress: req.ip,
    });
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to update user" });
  }
});

router.post("/tenants/:id/users/:userId/reset-password", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const tenantId = parseIntParam(req.params.id, "id");
    const userId = parseIntParam(req.params.userId, "userId");
    const newPassword = req.body.password || "changeme123";
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await adminStorage.resetTenantUserPassword(tenantId, userId, hashedPassword);
    const admin = (req as any).admin;
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: "user_password_reset",
      entityType: "user",
      entityId: userId,
      tenantId: tenantId,
      ipAddress: req.ip,
    });
    res.json({ message: "Password reset successfully" });
  } catch (error: any) {
    res.status(500).json({ message: "Failed to reset password" });
  }
});

router.get("/tenants/:id/subscription", async (req: Request, res: Response) => {
  try {
    const sub = await adminStorage.getTenantSubscription(parseIntParam(req.params.id, "id"));
    res.json(sub || null);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch subscription" });
  }
});

router.patch("/tenants/:id/subscription", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const tenantId = parseIntParam(req.params.id, "id");
    const { plan, status, startDate, endDate } = req.body;
    const sub = await adminStorage.updateTenantSubscription(tenantId, {
      plan,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    const admin = (req as any).admin;
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: "subscription_updated",
      entityType: "subscription",
      tenantId: tenantId,
      details: { plan, status },
      ipAddress: req.ip,
    });
    res.json(sub);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to update subscription" });
  }
});

router.get("/tenants/:id/data-stats", async (req: Request, res: Response) => {
  try {
    const stats = await adminStorage.getTenantDataStats(parseIntParam(req.params.id, "id"));
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch data stats" });
  }
});

router.post("/tenants/:id/backup", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const backup = await adminStorage.createDataBackup(parseIntParam(req.params.id, "id"));
    const admin = (req as any).admin;
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: "data_backup_created",
      entityType: "tenant",
      entityId: parseIntParam(req.params.id, "id"),
      tenantId: parseIntParam(req.params.id, "id"),
      details: { backupId: backup.backupId, totalRecords: backup.totalRecords },
      ipAddress: req.ip,
    });
    res.json(backup);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to create backup" });
  }
});

router.get("/tenants/:id/backup/list", async (req: Request, res: Response) => {
  try {
    const tenantId = parseIntParam(req.params.id, "id");
    const backups = await backupService.listBackups(tenantId);
    res.json(backups);
  } catch (error: any) {
    console.error("List backups error:", error);
    res.status(500).json({ message: "Failed to list backups" });
  }
});

router.post("/tenants/:id/backup/generate", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const tenantId = parseIntParam(req.params.id, "id");
    const admin = (req as any).admin;
    const result = await backupService.generateBackup(tenantId, admin.id, false);
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: "backup_generated",
      entityType: "tenant",
      entityId: tenantId,
      tenantId: tenantId,
      details: { backupId: result.backupId, sizeBytes: result.sizeBytes },
      ipAddress: req.ip,
    });
    res.json(result);
  } catch (error: any) {
    console.error("Generate backup error:", error);
    res.status(500).json({ message: "Failed to generate backup" });
  }
});

router.get("/tenants/:id/backup/:backupId/download", async (req: Request, res: Response) => {
  try {
    const tenantId = parseIntParam(req.params.id, "id");
    const backupId = parseIntParam(req.params.backupId, "backupId");
    const filePath = await backupService.downloadBackup(backupId, tenantId);
    if (!filePath) return res.status(404).json({ message: "Backup file not found" });
    res.download(filePath);
  } catch (error: any) {
    console.error("Download backup error:", error);
    res.status(500).json({ message: "Failed to download backup" });
  }
});

router.delete("/tenants/:id/backup/:backupId", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const tenantId = parseIntParam(req.params.id, "id");
    const backupId = parseIntParam(req.params.backupId, "backupId");
    const admin = (req as any).admin;
    const deleted = await backupService.deleteBackup(backupId, tenantId);
    if (!deleted) return res.status(404).json({ message: "Backup not found" });
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: "backup_deleted",
      entityType: "tenant",
      entityId: tenantId,
      tenantId: tenantId,
      details: { backupId },
      ipAddress: req.ip,
    });
    res.json({ message: "Backup deleted successfully" });
  } catch (error: any) {
    console.error("Delete backup error:", error);
    res.status(500).json({ message: "Failed to delete backup" });
  }
});

router.get("/tenants/:id/contacts", async (req: Request, res: Response) => {
  try {
    const contacts = await adminStorage.getTenantContactInfo(parseIntParam(req.params.id, "id"));
    res.json(contacts);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch contacts" });
  }
});

router.delete("/tenants/:id", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const tenantId = parseIntParam(req.params.id, "id");
    const tenant = await adminStorage.getTenantDetails(tenantId);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    
    await adminStorage.deleteTenant(tenantId);
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: "tenant_deleted",
      entityType: "tenant",
      entityId: tenantId,
      details: { tenantName: tenant.name },
      ipAddress: req.ip,
    });
    res.json({ message: "Tenant deleted successfully" });
  } catch (error: any) {
    console.error("Delete tenant error:", error);
    res.status(500).json({ message: "Failed to delete tenant" });
  }
});

router.get("/tickets", async (req: Request, res: Response) => {
  try {
    const { status, priority, tenantId } = req.query;
    const tickets = await adminStorage.getTickets({
      status: status as string,
      priority: priority as string,
      tenantId: tenantId ? parseInt(tenantId as string) : undefined,
    });
    res.json(tickets);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch tickets" });
  }
});

router.get("/tickets/:id", async (req: Request, res: Response) => {
  try {
    const ticket = await adminStorage.getTicketById(parseIntParam(req.params.id, "id"));
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    res.json(ticket);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch ticket" });
  }
});

router.patch("/tickets/:id", async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const ticket = await adminStorage.updateTicket(parseIntParam(req.params.id, "id"), req.body);
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: "ticket_updated",
      entityType: "ticket",
      entityId: parseIntParam(req.params.id, "id"),
      details: req.body,
      ipAddress: req.ip,
    });
    res.json(ticket);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to update ticket" });
  }
});

router.post("/tickets/:id/comments", async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const comment = await adminStorage.addTicketComment({
      ticketId: parseIntParam(req.params.id, "id"),
      authorType: "admin",
      authorId: admin.id,
      content: req.body.content,
      isInternal: req.body.isInternal || false,
    });
    res.json(comment);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to add comment" });
  }
});

router.get("/billing", async (req: Request, res: Response) => {
  try {
    const { tenantId, status } = req.query;
    const records = await adminStorage.getBillingRecords({
      tenantId: tenantId ? parseInt(tenantId as string) : undefined,
      status: status as string,
    });
    res.json(records);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch billing records" });
  }
});

router.post("/billing", requireAdminRole("super_admin", "billing"), async (req: Request, res: Response) => {
  try {
    const record = await adminStorage.createBillingRecord(req.body);
    const admin = (req as any).admin;
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: "billing_created",
      entityType: "billing",
      entityId: record.id,
      tenantId: req.body.tenantId,
      ipAddress: req.ip,
    });
    res.json(record);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to create billing record" });
  }
});

router.patch("/billing/:id", requireAdminRole("super_admin", "billing"), async (req: Request, res: Response) => {
  try {
    const record = await adminStorage.updateBillingRecord(parseIntParam(req.params.id, "id"), req.body);
    const admin = (req as any).admin;
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: "billing_updated",
      entityType: "billing",
      entityId: parseIntParam(req.params.id, "id"),
      details: req.body,
      ipAddress: req.ip,
    });
    res.json(record);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to update billing record" });
  }
});

router.get("/billing/overdue", async (req: Request, res: Response) => {
  try {
    const records = await adminStorage.getOverdueBilling();
    res.json(records);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch overdue billing" });
  }
});

router.get("/audit-logs", async (req: Request, res: Response) => {
  try {
    const { adminId, tenantId, action, limit } = req.query;
    const logs = await adminStorage.getAuditLogs({
      adminId: adminId ? parseInt(adminId as string) : undefined,
      tenantId: tenantId ? parseInt(tenantId as string) : undefined,
      action: action as string,
      limit: limit ? parseInt(limit as string) : 100,
    });
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch audit logs" });
  }
});

router.get("/admins", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const admins = await adminStorage.getAllAdmins();
    const sanitized = admins.map(({ password, ...a }) => a);
    res.json(sanitized);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to fetch admins" });
  }
});

router.post("/admins", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const admin = await adminStorage.createAdmin({ ...req.body, password: hashedPassword });
    const { password, ...adminData } = admin;
    const currentAdmin = (req as any).admin;
    await adminStorage.createAuditLog({
      adminId: currentAdmin.id,
      action: "admin_created",
      entityType: "admin",
      entityId: admin.id,
      ipAddress: req.ip,
    });
    res.json(adminData);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to create admin" });
  }
});

// ============================================================
// Subscription Management
// ============================================================

router.get("/subscriptions/stats", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const stats = await adminStorage.getSubscriptionStats();
    res.json(stats);
  } catch (error: any) {
    console.error("Subscription stats error:", error);
    res.status(500).json({ message: "Failed to fetch subscription stats" });
  }
});

router.get("/subscriptions", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const subscriptions = await adminStorage.getAllSubscriptionsWithDetails();
    res.json(subscriptions);
  } catch (error: any) {
    console.error("Subscriptions error:", error);
    res.status(500).json({ message: "Failed to fetch subscriptions" });
  }
});

router.put("/subscriptions/:tenantId", requireAdminRole("super_admin"), async (req: Request, res: Response) => {
  try {
    const tenantId = parseIntParam(req.params.tenantId, "tenantId");
    const { plan } = req.body;
    const validPlans = ["trial", "starter", "growth", "professional", "business", "enterprise"];
    if (!plan || !validPlans.includes(plan)) {
      return res.status(400).json({ message: "Invalid plan. Must be one of: " + validPlans.join(", ") });
    }
    const sub = await adminStorage.changeTenantPlan(tenantId, plan);
    if (!sub) return res.status(404).json({ message: "Subscription not found for this tenant" });
    const admin = (req as any).admin;
    await adminStorage.createAuditLog({
      adminId: admin.id,
      action: "subscription_plan_changed",
      entityType: "subscription",
      entityId: sub.id,
      tenantId,
      details: { newPlan: plan },
      ipAddress: req.ip,
    });
    res.json(sub);
  } catch (error: any) {
    console.error("Update subscription error:", error);
    res.status(500).json({ message: "Failed to update subscription" });
  }
});

export default router;
