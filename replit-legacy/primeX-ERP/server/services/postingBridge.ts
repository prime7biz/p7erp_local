import { db } from "../db";
import { vouchers, voucherItems, postingProfiles, postingProfileLines, voucherTypes, chartOfAccounts } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { SequentialIdGenerator } from "../utils/sequentialIdGenerator";

export interface SourceDocument {
  tenantId: number;
  originModule: string;
  originType: string;
  originId: number;
  originRef: string;
  date: string;
  fiscalYearId: number;
  accountingPeriodId?: number;
  description: string;
  preparedById: number;
  lines: SourceDocumentLine[];
  entityType?: string;
  entityId?: number;
  currencyCode?: string;
  exchangeRate?: number;
}

export interface SourceDocumentLine {
  accountId: number;
  debitAmount: number;
  creditAmount: number;
  description?: string;
  costCenterId?: number;
  projectId?: number;
  entityType?: string;
  entityId?: number;
  reference?: string;
}

export const postingBridge = {
  async createVoucherFromSource(source: SourceDocument, statusId: number): Promise<any> {
    const existing = await db.select({ id: vouchers.id })
      .from(vouchers)
      .where(and(
        eq(vouchers.tenantId, source.tenantId),
        eq(vouchers.originModule, source.originModule),
        eq(vouchers.originType, source.originType),
        eq(vouchers.originId, source.originId),
      ))
      .limit(1);

    if (existing.length > 0) {
      throw new Error(`Duplicate: Voucher already exists for ${source.originModule}/${source.originType}/${source.originId}`);
    }

    const [profile] = await db.select()
      .from(postingProfiles)
      .where(and(
        eq(postingProfiles.tenantId, source.tenantId),
        eq(postingProfiles.originModule, source.originModule),
        eq(postingProfiles.originType, source.originType),
        eq(postingProfiles.isActive, true),
      ))
      .limit(1);

    let voucherTypeId: number;
    if (profile) {
      voucherTypeId = profile.voucherTypeId;
    } else {
      const [jv] = await db.select().from(voucherTypes)
        .where(and(
          eq(voucherTypes.tenantId, source.tenantId),
          eq(voucherTypes.code, "JV")
        )).limit(1);
      voucherTypeId = jv?.id || 1;
    }

    const [vType] = await db.select().from(voucherTypes)
      .where(eq(voucherTypes.id, voucherTypeId)).limit(1);
    const voucherTypeCode = vType?.code || "JV";

    const voucherNumber = await SequentialIdGenerator.generateVoucherId(source.tenantId, voucherTypeCode);

    const totalDebit = source.lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredit = source.lines.reduce((sum, l) => sum + l.creditAmount, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`Source document is not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`);
    }

    const [voucher] = await db.insert(vouchers).values({
      voucherNumber,
      voucherTypeId,
      voucherDate: source.date,
      fiscalYearId: source.fiscalYearId,
      accountingPeriodId: source.accountingPeriodId,
      statusId,
      description: source.description,
      preparedById: source.preparedById,
      amount: String(totalDebit),
      originModule: source.originModule,
      originType: source.originType,
      originId: source.originId,
      originRef: source.originRef,
      entityType: source.entityType,
      entityId: source.entityId,
      currencyCode: source.currencyCode || "USD",
      exchangeRate: source.exchangeRate ? String(source.exchangeRate) : "1",
      tenantId: source.tenantId,
    }).returning();

    const items = [];
    for (let i = 0; i < source.lines.length; i++) {
      const line = source.lines[i];
      const [item] = await db.insert(voucherItems).values({
        voucherId: voucher.id,
        lineNumber: i + 1,
        accountId: line.accountId,
        description: line.description || source.description,
        debitAmount: String(line.debitAmount),
        creditAmount: String(line.creditAmount),
        costCenterId: line.costCenterId,
        projectId: line.projectId,
        entityType: line.entityType,
        entityId: line.entityId,
        reference: line.reference,
        tenantId: source.tenantId,
      }).returning();
      items.push(item);
    }

    return { voucher, items };
  },

  async getPostingProfiles(tenantId: number) {
    return db.select().from(postingProfiles)
      .where(eq(postingProfiles.tenantId, tenantId));
  },

  async getPostingProfileWithLines(profileId: number, tenantId: number) {
    const [profile] = await db.select().from(postingProfiles)
      .where(and(eq(postingProfiles.id, profileId), eq(postingProfiles.tenantId, tenantId)));

    if (!profile) return null;

    const lines = await db.select().from(postingProfileLines)
      .where(eq(postingProfileLines.profileId, profileId));

    return { profile, lines };
  },

  async createPostingProfile(data: any) {
    const [profile] = await db.insert(postingProfiles).values(data).returning();
    return profile;
  },

  async createPostingProfileLine(data: any) {
    const [line] = await db.insert(postingProfileLines).values(data).returning();
    return line;
  },

  async updatePostingProfile(id: number, tenantId: number, data: any) {
    const [profile] = await db.update(postingProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(postingProfiles.id, id), eq(postingProfiles.tenantId, tenantId)))
      .returning();
    return profile;
  },

  async deletePostingProfile(id: number, tenantId: number) {
    return db.delete(postingProfiles)
      .where(and(eq(postingProfiles.id, id), eq(postingProfiles.tenantId, tenantId)));
  },
};
