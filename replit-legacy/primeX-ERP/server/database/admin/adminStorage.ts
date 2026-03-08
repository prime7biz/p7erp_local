import { db } from "../../db";
import { adminUsers, tenants, subscriptions, subscriptionPlans, users, supportTickets, ticketComments, billingRecords, adminAuditLogs } from "@shared/schema";
import { eq, desc, asc, sql, and, count, gte, lte, isNull, or, like, ilike } from "drizzle-orm";
import type { AdminUser, InsertAdminUser, SupportTicket, InsertSupportTicket, TicketComment, InsertTicketComment, BillingRecord, InsertBillingRecord, AdminAuditLog, InsertAdminAuditLog } from "@shared/schema";

export const adminStorage = {

  // ============================================================
  // Admin Users
  // ============================================================

  async getAdminByEmail(email: string): Promise<AdminUser | undefined> {
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, email));
    return admin;
  },

  async getAdminById(id: number): Promise<AdminUser | undefined> {
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    return admin;
  },

  async createAdmin(data: InsertAdminUser): Promise<AdminUser> {
    const [admin] = await db.insert(adminUsers).values(data).returning();
    return admin;
  },

  async updateAdmin(id: number, data: Partial<AdminUser>): Promise<AdminUser> {
    const [admin] = await db
      .update(adminUsers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(adminUsers.id, id))
      .returning();
    return admin;
  },

  async getAllAdmins(): Promise<AdminUser[]> {
    return await db.select().from(adminUsers).orderBy(desc(adminUsers.createdAt));
  },

  // ============================================================
  // Tenants (Admin Overview)
  // ============================================================

  async getAllTenants() {
    return await db
      .select({
        id: tenants.id,
        name: tenants.name,
        domain: tenants.domain,
        logo: tenants.logo,
        isActive: tenants.isActive,
        companyCode: tenants.companyCode,
        status: tenants.status,
        approvedAt: tenants.approvedAt,
        approvedBy: tenants.approvedBy,
        rejectedReason: tenants.rejectedReason,
        createdAt: tenants.createdAt,
        updatedAt: tenants.updatedAt,
        subscriptionId: subscriptions.id,
        subscriptionPlan: subscriptions.plan,
        subscriptionStatus: subscriptions.status,
        subscriptionStartDate: subscriptions.startDate,
        subscriptionEndDate: subscriptions.endDate,
      })
      .from(tenants)
      .leftJoin(subscriptions, eq(tenants.id, subscriptions.tenantId))
      .orderBy(desc(tenants.createdAt));
  },

  async getTenantDetails(id: number) {
    const [tenant] = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        domain: tenants.domain,
        logo: tenants.logo,
        isActive: tenants.isActive,
        companyCode: tenants.companyCode,
        status: tenants.status,
        approvedAt: tenants.approvedAt,
        approvedBy: tenants.approvedBy,
        rejectedReason: tenants.rejectedReason,
        createdAt: tenants.createdAt,
        updatedAt: tenants.updatedAt,
        subscriptionId: subscriptions.id,
        subscriptionPlan: subscriptions.plan,
        subscriptionStatus: subscriptions.status,
        subscriptionStartDate: subscriptions.startDate,
        subscriptionEndDate: subscriptions.endDate,
      })
      .from(tenants)
      .leftJoin(subscriptions, eq(tenants.id, subscriptions.tenantId))
      .where(eq(tenants.id, id));

    if (!tenant) return undefined;

    const [usersCount] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.tenantId, id));

    return {
      ...tenant,
      usersCount: usersCount?.count ?? 0,
    };
  },

  async updateTenantStatus(id: number, isActive: boolean) {
    const [tenant] = await db
      .update(tenants)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    return tenant;
  },

  async getTenantUsers(tenantId: number) {
    return await db
      .select()
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .orderBy(desc(users.createdAt));
  },

  async updateTenant(id: number, data: { name?: string; domain?: string; logo?: string }) {
    const [tenant] = await db
      .update(tenants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    return tenant;
  },

  async approveTenant(id: number, adminId: number) {
    const [tenant] = await db
      .update(tenants)
      .set({ 
        status: 'APPROVED', 
        isActive: true,
        approvedAt: new Date(), 
        approvedBy: adminId,
        rejectedReason: null,
        updatedAt: new Date() 
      })
      .where(eq(tenants.id, id))
      .returning();
    return tenant;
  },

  async rejectTenant(id: number, reason: string) {
    const [tenant] = await db
      .update(tenants)
      .set({ 
        status: 'REJECTED', 
        isActive: false,
        rejectedReason: reason,
        approvedAt: null,
        approvedBy: null,
        updatedAt: new Date() 
      })
      .where(eq(tenants.id, id))
      .returning();
    return tenant;
  },

  async suspendTenant(id: number, reason: string) {
    const [tenant] = await db
      .update(tenants)
      .set({ 
        status: 'SUSPENDED', 
        isActive: false,
        rejectedReason: reason,
        updatedAt: new Date() 
      })
      .where(eq(tenants.id, id))
      .returning();
    return tenant;
  },

  async getTenantOwnerEmail(tenantId: number) {
    const [owner] = await db
      .select({ email: users.email, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.isSuperUser, true)))
      .limit(1);
    return owner;
  },

  async updateTenantUser(tenantId: number, userId: number, data: { isActive?: boolean; firstName?: string; lastName?: string; email?: string; phone?: string }) {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .returning();
    return user;
  },

  async resetTenantUserPassword(tenantId: number, userId: number, hashedPassword: string) {
    const [user] = await db
      .update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .returning();
    return user;
  },

  async getTenantSubscription(tenantId: number) {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId));
    return sub;
  },

  async updateTenantSubscription(tenantId: number, data: { plan?: string; status?: string; startDate?: Date; endDate?: Date }) {
    const [sub] = await db
      .update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.tenantId, tenantId))
      .returning();
    return sub;
  },

  async getTenantDataStats(tenantId: number) {
    const stats: Record<string, number> = {};
    
    const tableQueries = [
      { name: 'customers', query: sql`SELECT count(*)::int as cnt FROM customers WHERE tenant_id = ${tenantId}` },
      { name: 'inquiries', query: sql`SELECT count(*)::int as cnt FROM inquiries WHERE tenant_id = ${tenantId}` },
      { name: 'samples', query: sql`SELECT count(*)::int as cnt FROM samples WHERE tenant_id = ${tenantId}` },
      { name: 'purchase_orders', query: sql`SELECT count(*)::int as cnt FROM purchase_orders WHERE tenant_id = ${tenantId}` },
      { name: 'manufacturing_orders', query: sql`SELECT count(*)::int as cnt FROM manufacturing_orders WHERE tenant_id = ${tenantId}` },
      { name: 'chart_of_accounts', query: sql`SELECT count(*)::int as cnt FROM chart_of_accounts WHERE tenant_id = ${tenantId}` },
      { name: 'vouchers', query: sql`SELECT count(*)::int as cnt FROM vouchers WHERE tenant_id = ${tenantId}` },
      { name: 'employees', query: sql`SELECT count(*)::int as cnt FROM employees WHERE tenant_id = ${tenantId}` },
      { name: 'item_stock', query: sql`SELECT count(*)::int as cnt FROM item_stock WHERE tenant_id = ${tenantId}` },
    ];

    for (const { name, query } of tableQueries) {
      try {
        const result = await db.execute(query);
        stats[name] = parseInt((result as any).rows?.[0]?.cnt || '0');
      } catch {
        stats[name] = 0;
      }
    }
    return stats;
  },

  async createDataBackup(tenantId: number) {
    const stats = await this.getTenantDataStats(tenantId);
    const backupId = `backup_${tenantId}_${Date.now()}`;
    return {
      backupId,
      tenantId,
      createdAt: new Date().toISOString(),
      tables: stats,
      totalRecords: Object.values(stats).reduce((a, b) => a + b, 0),
      status: 'completed',
    };
  },

  async deleteTenant(id: number) {
    await db.delete(users).where(eq(users.tenantId, id));
    await db.delete(subscriptions).where(eq(subscriptions.tenantId, id));
    const [tenant] = await db.delete(tenants).where(eq(tenants.id, id)).returning();
    return tenant;
  },

  async getTenantContactInfo(tenantId: number) {
    const ownerUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        isSuperUser: users.isSuperUser,
      })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.isSuperUser, true)));
    
    return ownerUsers;
  },

  // ============================================================
  // Subscription Management
  // ============================================================

  async getSubscriptionStats() {
    const [tenantCount] = await db.select({ total: count() }).from(tenants);

    const planStats = await db
      .select({
        plan: subscriptions.plan,
        count: count(),
        monthlyPrice: subscriptionPlans.monthlyPrice,
      })
      .from(subscriptions)
      .leftJoin(subscriptionPlans, eq(subscriptions.plan, subscriptionPlans.name))
      .where(eq(subscriptions.status, 'active'))
      .groupBy(subscriptions.plan, subscriptionPlans.monthlyPrice);

    const [trialCount] = await db
      .select({ count: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'trial'));

    const [activeCount] = await db
      .select({ count: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'));

    let totalMonthlyRevenue = 0;
    const planDistribution: Record<string, number> = {};
    for (const stat of planStats) {
      planDistribution[stat.plan] = stat.count;
      totalMonthlyRevenue += (stat.monthlyPrice || 0) * stat.count;
    }

    return {
      totalTenants: tenantCount?.total ?? 0,
      activePaid: activeCount?.count ?? 0,
      trialUsers: trialCount?.count ?? 0,
      totalMonthlyRevenue,
      planDistribution,
    };
  },

  async changeTenantPlan(tenantId: number, planName: string) {
    const now = new Date();
    const endDate = new Date(now);
    if (planName === 'trial') {
      endDate.setFullYear(endDate.getFullYear() + 100);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    const [sub] = await db
      .update(subscriptions)
      .set({
        plan: planName,
        status: planName === 'trial' ? 'trial' : 'active',
        startDate: now,
        endDate,
        updatedAt: now,
      })
      .where(eq(subscriptions.tenantId, tenantId))
      .returning();
    return sub;
  },

  async getAllSubscriptionsWithDetails() {
    const results = await db
      .select({
        id: subscriptions.id,
        tenantId: subscriptions.tenantId,
        plan: subscriptions.plan,
        status: subscriptions.status,
        startDate: subscriptions.startDate,
        endDate: subscriptions.endDate,
        tenantName: tenants.name,
        companyCode: tenants.companyCode,
        isActive: tenants.isActive,
        planDisplayName: subscriptionPlans.displayName,
        monthlyPrice: subscriptionPlans.monthlyPrice,
        maxUsers: subscriptionPlans.maxUsers,
      })
      .from(subscriptions)
      .innerJoin(tenants, eq(subscriptions.tenantId, tenants.id))
      .leftJoin(subscriptionPlans, eq(subscriptions.plan, subscriptionPlans.name))
      .orderBy(desc(subscriptions.updatedAt));

    const subsWithUserCount = await Promise.all(
      results.map(async (sub) => {
        const [userCount] = await db
          .select({ count: count() })
          .from(users)
          .where(eq(users.tenantId, sub.tenantId));
        return { ...sub, usersCount: userCount?.count ?? 0 };
      })
    );

    return subsWithUserCount;
  },

  // ============================================================
  // Support Tickets
  // ============================================================

  async getTickets(filters?: { status?: string; priority?: string; tenantId?: number }) {
    const conditions = [];

    if (filters?.status) {
      conditions.push(eq(supportTickets.status, filters.status));
    }
    if (filters?.priority) {
      conditions.push(eq(supportTickets.priority, filters.priority));
    }
    if (filters?.tenantId) {
      conditions.push(eq(supportTickets.tenantId, filters.tenantId));
    }

    const query = db
      .select({
        id: supportTickets.id,
        tenantId: supportTickets.tenantId,
        userId: supportTickets.userId,
        assignedAdminId: supportTickets.assignedAdminId,
        subject: supportTickets.subject,
        description: supportTickets.description,
        status: supportTickets.status,
        priority: supportTickets.priority,
        category: supportTickets.category,
        closedAt: supportTickets.closedAt,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
        tenantName: tenants.name,
      })
      .from(supportTickets)
      .leftJoin(tenants, eq(supportTickets.tenantId, tenants.id));

    if (conditions.length > 0) {
      return await query.where(and(...conditions)).orderBy(desc(supportTickets.createdAt));
    }

    return await query.orderBy(desc(supportTickets.createdAt));
  },

  async getTicketById(id: number) {
    const [ticket] = await db
      .select({
        id: supportTickets.id,
        tenantId: supportTickets.tenantId,
        userId: supportTickets.userId,
        assignedAdminId: supportTickets.assignedAdminId,
        subject: supportTickets.subject,
        description: supportTickets.description,
        status: supportTickets.status,
        priority: supportTickets.priority,
        category: supportTickets.category,
        closedAt: supportTickets.closedAt,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
        tenantName: tenants.name,
      })
      .from(supportTickets)
      .leftJoin(tenants, eq(supportTickets.tenantId, tenants.id))
      .where(eq(supportTickets.id, id));

    if (!ticket) return undefined;

    const comments = await db
      .select()
      .from(ticketComments)
      .where(eq(ticketComments.ticketId, id))
      .orderBy(asc(ticketComments.createdAt));

    return { ...ticket, comments };
  },

  async createTicket(data: InsertSupportTicket): Promise<SupportTicket> {
    const [ticket] = await db.insert(supportTickets).values(data).returning();
    return ticket;
  },

  async updateTicket(id: number, data: Partial<SupportTicket>): Promise<SupportTicket> {
    const [ticket] = await db
      .update(supportTickets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(supportTickets.id, id))
      .returning();
    return ticket;
  },

  async addTicketComment(data: InsertTicketComment): Promise<TicketComment> {
    const [comment] = await db.insert(ticketComments).values(data).returning();
    return comment;
  },

  async getTicketComments(ticketId: number): Promise<TicketComment[]> {
    return await db
      .select()
      .from(ticketComments)
      .where(eq(ticketComments.ticketId, ticketId))
      .orderBy(asc(ticketComments.createdAt));
  },

  // ============================================================
  // Billing
  // ============================================================

  async getBillingRecords(filters?: { tenantId?: number; status?: string }) {
    const conditions = [];

    if (filters?.tenantId) {
      conditions.push(eq(billingRecords.tenantId, filters.tenantId));
    }
    if (filters?.status) {
      conditions.push(eq(billingRecords.status, filters.status));
    }

    const query = db
      .select({
        id: billingRecords.id,
        tenantId: billingRecords.tenantId,
        planName: billingRecords.planName,
        amount: billingRecords.amount,
        currency: billingRecords.currency,
        periodStart: billingRecords.periodStart,
        periodEnd: billingRecords.periodEnd,
        status: billingRecords.status,
        paymentMethod: billingRecords.paymentMethod,
        paymentReference: billingRecords.paymentReference,
        invoiceNumber: billingRecords.invoiceNumber,
        notes: billingRecords.notes,
        paidAt: billingRecords.paidAt,
        createdAt: billingRecords.createdAt,
        updatedAt: billingRecords.updatedAt,
        tenantName: tenants.name,
      })
      .from(billingRecords)
      .leftJoin(tenants, eq(billingRecords.tenantId, tenants.id));

    if (conditions.length > 0) {
      return await query.where(and(...conditions)).orderBy(desc(billingRecords.createdAt));
    }

    return await query.orderBy(desc(billingRecords.createdAt));
  },

  async createBillingRecord(data: InsertBillingRecord): Promise<BillingRecord> {
    const [record] = await db.insert(billingRecords).values(data).returning();
    return record;
  },

  async updateBillingRecord(id: number, data: Partial<BillingRecord>): Promise<BillingRecord> {
    const [record] = await db
      .update(billingRecords)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(billingRecords.id, id))
      .returning();
    return record;
  },

  async getOverdueBilling() {
    return await db
      .select({
        id: billingRecords.id,
        tenantId: billingRecords.tenantId,
        planName: billingRecords.planName,
        amount: billingRecords.amount,
        currency: billingRecords.currency,
        periodStart: billingRecords.periodStart,
        periodEnd: billingRecords.periodEnd,
        status: billingRecords.status,
        paymentMethod: billingRecords.paymentMethod,
        paymentReference: billingRecords.paymentReference,
        invoiceNumber: billingRecords.invoiceNumber,
        notes: billingRecords.notes,
        paidAt: billingRecords.paidAt,
        createdAt: billingRecords.createdAt,
        updatedAt: billingRecords.updatedAt,
        tenantName: tenants.name,
      })
      .from(billingRecords)
      .leftJoin(tenants, eq(billingRecords.tenantId, tenants.id))
      .where(
        and(
          eq(billingRecords.status, "overdue"),
          lte(billingRecords.periodEnd, new Date())
        )
      )
      .orderBy(asc(billingRecords.periodEnd));
  },

  // ============================================================
  // Audit Logs
  // ============================================================

  async createAuditLog(data: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const [log] = await db.insert(adminAuditLogs).values(data).returning();
    return log;
  },

  async getAuditLogs(filters?: { adminId?: number; tenantId?: number; action?: string; limit?: number }) {
    const conditions = [];

    if (filters?.adminId) {
      conditions.push(eq(adminAuditLogs.adminId, filters.adminId));
    }
    if (filters?.tenantId) {
      conditions.push(eq(adminAuditLogs.tenantId, filters.tenantId));
    }
    if (filters?.action) {
      conditions.push(eq(adminAuditLogs.action, filters.action));
    }

    const queryLimit = filters?.limit ?? 100;

    const query = db
      .select({
        id: adminAuditLogs.id,
        adminId: adminAuditLogs.adminId,
        action: adminAuditLogs.action,
        entityType: adminAuditLogs.entityType,
        entityId: adminAuditLogs.entityId,
        tenantId: adminAuditLogs.tenantId,
        details: adminAuditLogs.details,
        ipAddress: adminAuditLogs.ipAddress,
        createdAt: adminAuditLogs.createdAt,
        adminEmail: adminUsers.email,
        adminFirstName: adminUsers.firstName,
        adminLastName: adminUsers.lastName,
      })
      .from(adminAuditLogs)
      .leftJoin(adminUsers, eq(adminAuditLogs.adminId, adminUsers.id));

    if (conditions.length > 0) {
      return await query.where(and(...conditions)).orderBy(desc(adminAuditLogs.createdAt)).limit(queryLimit);
    }

    return await query.orderBy(desc(adminAuditLogs.createdAt)).limit(queryLimit);
  },

  // ============================================================
  // Dashboard Metrics
  // ============================================================

  async getDashboardMetrics() {
    const [tenantCounts] = await db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${tenants.isActive} = true)`,
        suspended: sql<number>`count(*) filter (where ${tenants.isActive} = false)`,
      })
      .from(tenants);

    const [userCount] = await db.select({ count: count() }).from(users);

    const [subscriptionCounts] = await db
      .select({
        active: sql<number>`count(*) filter (where ${subscriptions.status} = 'active')`,
        trial: sql<number>`count(*) filter (where ${subscriptions.status} = 'trial')`,
      })
      .from(subscriptions);

    const [ticketCount] = await db
      .select({ count: count() })
      .from(supportTickets)
      .where(
        or(
          eq(supportTickets.status, "open"),
          eq(supportTickets.status, "in_progress")
        )
      );

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [revenue] = await db
      .select({
        total: sql<number>`coalesce(sum(${billingRecords.amount}), 0)`,
      })
      .from(billingRecords)
      .where(
        and(
          eq(billingRecords.status, "paid"),
          gte(billingRecords.paidAt, monthStart)
        )
      );

    return {
      totalTenants: tenantCounts?.total ?? 0,
      activeTenants: tenantCounts?.active ?? 0,
      suspendedTenants: tenantCounts?.suspended ?? 0,
      totalUsers: userCount?.count ?? 0,
      activeSubscriptions: subscriptionCounts?.active ?? 0,
      trialSubscriptions: subscriptionCounts?.trial ?? 0,
      openTickets: ticketCount?.count ?? 0,
      monthlyRevenue: revenue?.total ?? 0,
    };
  },
};
