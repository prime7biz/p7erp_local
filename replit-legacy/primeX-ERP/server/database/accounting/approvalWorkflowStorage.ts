import { db } from "../../db";
import { approvalRules, voucherApprovalHistory, vouchers, voucherStatus, voucherTypes, users } from "../../../shared/schema";
import { eq, and, lte, or, gte, isNull, desc, asc, sql, inArray } from "drizzle-orm";

export const approvalWorkflowStorage = {
  async getApprovalRules(tenantId: number) {
    return db.select().from(approvalRules)
      .where(eq(approvalRules.tenantId, tenantId))
      .orderBy(asc(approvalRules.approvalLevel));
  },

  async getApplicableRules(tenantId: number, voucherTypeId: number, amount: number) {
    return db.select().from(approvalRules)
      .where(and(
        eq(approvalRules.tenantId, tenantId),
        eq(approvalRules.isActive, true),
        or(
          isNull(approvalRules.voucherTypeId),
          eq(approvalRules.voucherTypeId, voucherTypeId)
        ),
        lte(approvalRules.minAmount, String(amount)),
        or(
          isNull(approvalRules.maxAmount),
          gte(approvalRules.maxAmount, String(amount))
        )
      ))
      .orderBy(asc(approvalRules.approvalLevel));
  },

  async createApprovalRule(data: any) {
    const [rule] = await db.insert(approvalRules).values(data).returning();
    return rule;
  },

  async updateApprovalRule(id: number, tenantId: number, data: any) {
    const [rule] = await db.update(approvalRules)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(approvalRules.id, id), eq(approvalRules.tenantId, tenantId)))
      .returning();
    return rule;
  },

  async deleteApprovalRule(id: number, tenantId: number) {
    return db.delete(approvalRules)
      .where(and(eq(approvalRules.id, id), eq(approvalRules.tenantId, tenantId)));
  },

  async getApprovalQueue(tenantId: number, filters?: { statusCode?: string; voucherTypeId?: number }) {
    const pendingStatuses = await db.select().from(voucherStatus)
      .where(and(
        eq(voucherStatus.tenantId, tenantId),
        or(
          eq(voucherStatus.code, "SUBMITTED"),
          eq(voucherStatus.code, "CHECKED"),
          eq(voucherStatus.code, "RECOMMENDED")
        )
      ));

    const statusIds = pendingStatuses.map(s => s.id);
    if (statusIds.length === 0) return [];

    const results = await db.select({
      id: vouchers.id,
      voucherNumber: vouchers.voucherNumber,
      voucherDate: vouchers.voucherDate,
      voucherTypeId: vouchers.voucherTypeId,
      voucherTypeName: voucherTypes.name,
      statusId: vouchers.statusId,
      statusName: voucherStatus.name,
      statusColor: voucherStatus.color,
      amount: vouchers.amount,
      description: vouchers.description,
      reference: vouchers.reference,
      preparedById: vouchers.preparedById,
      preparedByName: sql<string>`COALESCE(CONCAT(${users.firstName}, ' ', ${users.lastName}), ${users.username})`,
      createdAt: vouchers.createdAt,
    })
    .from(vouchers)
    .leftJoin(users, eq(vouchers.preparedById, users.id))
    .leftJoin(voucherStatus, eq(vouchers.statusId, voucherStatus.id))
    .leftJoin(voucherTypes, eq(vouchers.voucherTypeId, voucherTypes.id))
    .where(and(
      eq(vouchers.tenantId, tenantId),
      eq(vouchers.isCancelled, false),
      inArray(vouchers.statusId, statusIds)
    ))
    .orderBy(desc(vouchers.createdAt));

    return results;
  },

  async canUserApprove(voucherId: number, userId: number, tenantId: number): Promise<{ canApprove: boolean; reason?: string }> {
    const voucher = await db.select().from(vouchers)
      .where(and(eq(vouchers.id, voucherId), eq(vouchers.tenantId, tenantId)))
      .limit(1);

    if (!voucher[0]) return { canApprove: false, reason: "Voucher not found" };

    const rules = await this.getApplicableRules(tenantId, voucher[0].voucherTypeId, parseFloat(String(voucher[0].amount)));
    const hasMakerChecker = rules.some(r => r.makerCheckerEnabled);

    if (hasMakerChecker && voucher[0].preparedById === userId) {
      return { canApprove: false, reason: "Creator cannot approve their own voucher (maker-checker policy)" };
    }

    return { canApprove: true };
  },
};
