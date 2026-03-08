import { db } from "../db";
import { vouchers, voucherItems, postingProfiles, postingProfileLines, voucherTypes } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface SourceDocument {
  tenantId: number;
  originModule: string;
  originType: string;
  originId: number;
  originRef: string;
  date: string;
  description: string;
  amount: number;
  currencyCode?: string;
  exchangeRate?: number;
  lines: SourceDocumentLine[];
  preparedById: number;
  fiscalYearId: number;
  accountingPeriodId?: number;
}

export interface SourceDocumentLine {
  accountId: number;
  description?: string;
  debitAmount: number;
  creditAmount: number;
  costCenterId?: number;
  projectId?: number;
  entityType?: string;
  entityId?: number;
  reference?: string;
}

export class AccountingPostingBridge {
  static async createVoucherFromSource(doc: SourceDocument): Promise<any> {
    return await db.transaction(async (tx) => {
      const existing = await tx.select({ id: vouchers.id })
        .from(vouchers)
        .where(and(
          eq(vouchers.tenantId, doc.tenantId),
          eq(vouchers.originModule, doc.originModule),
          eq(vouchers.originType, doc.originType),
          eq(vouchers.originId, doc.originId),
        ))
        .limit(1);

      if (existing.length > 0) {
        throw new Error(`Voucher already exists for ${doc.originModule}/${doc.originType}/${doc.originId}`);
      }

      const [profile] = await tx.select()
        .from(postingProfiles)
        .where(and(
          eq(postingProfiles.tenantId, doc.tenantId),
          eq(postingProfiles.originModule, doc.originModule),
          eq(postingProfiles.originType, doc.originType),
          eq(postingProfiles.isActive, true),
        ))
        .limit(1);

      let voucherTypeId: number;
      if (profile) {
        voucherTypeId = profile.voucherTypeId;
      } else {
        const [jvType] = await tx.select()
          .from(voucherTypes)
          .where(and(
            eq(voucherTypes.tenantId, doc.tenantId),
            eq(voucherTypes.code, "JV")
          ))
          .limit(1);
        if (!jvType) throw new Error("No Journal voucher type found");
        voucherTypeId = jvType.id;
      }

      const { voucherStatus } = await import("@shared/schema");
      const [draftStatus] = await tx.select()
        .from(voucherStatus)
        .where(and(
          eq(voucherStatus.tenantId, doc.tenantId),
          eq(voucherStatus.code, "DRAFT")
        ))
        .limit(1);

      if (!draftStatus) throw new Error("No Draft status found");

      const { SequentialIdGenerator } = await import("../utils/sequentialIdGenerator");
      const [vType] = await tx.select().from(voucherTypes)
        .where(eq(voucherTypes.id, voucherTypeId)).limit(1);
      const voucherNumber = await SequentialIdGenerator.generateVoucherId(
        doc.tenantId, vType?.code || "JV"
      );

      const [voucher] = await tx.insert(vouchers).values({
        voucherNumber,
        voucherTypeId,
        voucherDate: doc.date,
        fiscalYearId: doc.fiscalYearId,
        accountingPeriodId: doc.accountingPeriodId,
        statusId: draftStatus.id,
        description: doc.description,
        amount: String(doc.amount),
        currencyCode: doc.currencyCode || "BDT",
        exchangeRate: doc.exchangeRate ? String(doc.exchangeRate) : "1",
        originModule: doc.originModule,
        originType: doc.originType,
        originId: doc.originId,
        originRef: doc.originRef,
        preparedById: doc.preparedById,
        tenantId: doc.tenantId,
      }).returning();

      const items = [];
      for (let i = 0; i < doc.lines.length; i++) {
        const line = doc.lines[i];
        const [item] = await tx.insert(voucherItems).values({
          voucherId: voucher.id,
          lineNumber: i + 1,
          accountId: line.accountId,
          description: line.description,
          debitAmount: String(line.debitAmount),
          creditAmount: String(line.creditAmount),
          costCenterId: line.costCenterId,
          projectId: line.projectId,
          entityType: line.entityType,
          entityId: line.entityId,
          reference: line.reference,
          tenantId: doc.tenantId,
        }).returning();
        items.push(item);
      }

      return { voucher, items };
    });
  }

  static async getPostingProfile(tenantId: number, originModule: string, originType: string) {
    const [profile] = await db.select()
      .from(postingProfiles)
      .where(and(
        eq(postingProfiles.tenantId, tenantId),
        eq(postingProfiles.originModule, originModule),
        eq(postingProfiles.originType, originType),
        eq(postingProfiles.isActive, true),
      ))
      .limit(1);

    if (!profile) return null;

    const lines = await db.select()
      .from(postingProfileLines)
      .where(eq(postingProfileLines.profileId, profile.id));

    return { ...profile, lines };
  }
}
