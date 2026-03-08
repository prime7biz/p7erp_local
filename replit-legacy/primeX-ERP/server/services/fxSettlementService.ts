import { db } from '../db';
import { fxReceipts, fxSettlements, btbLcs, exportCases } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export async function recordFxReceipt(tenantId: number, userId: number, data: {
  exportCaseId?: number;
  receiptDate: string;
  bankAccountId?: number;
  amount: string;
  currency: string;
  exchangeRate?: string;
  bdtAmount?: string;
  bankCharges?: string;
  netAmount?: string;
  bankReference?: string;
}) {
  const amount = parseFloat(data.amount);
  const exRate = data.exchangeRate ? parseFloat(data.exchangeRate) : 0;
  const bdtAmt = data.bdtAmount ? parseFloat(data.bdtAmount) : amount * exRate;
  const charges = data.bankCharges ? parseFloat(data.bankCharges) : 0;
  const net = data.netAmount ? parseFloat(data.netAmount) : bdtAmt - charges;

  const [receipt] = await db.insert(fxReceipts).values({
    tenantId,
    exportCaseId: data.exportCaseId || null,
    receiptDate: data.receiptDate,
    bankAccountId: data.bankAccountId || null,
    amount: data.amount,
    currency: data.currency,
    exchangeRate: exRate.toFixed(4),
    bdtAmount: bdtAmt.toFixed(2),
    bankCharges: charges.toFixed(2),
    netAmount: net.toFixed(2),
    bankReference: data.bankReference || null,
    status: 'RECEIVED',
    createdBy: userId,
  }).returning();
  return receipt;
}

export async function createSettlement(tenantId: number, fxReceiptId: number, settlements: Array<{
  btbLcId?: number;
  settlementType: string;
  amount: string;
  currency?: string;
  settlementDate: string;
  remarks?: string;
}>) {
  const results = [];
  for (const s of settlements) {
    const [settlement] = await db.insert(fxSettlements).values({
      tenantId,
      fxReceiptId,
      btbLcId: s.btbLcId || null,
      settlementType: s.settlementType,
      amount: s.amount,
      currency: s.currency || null,
      settlementDate: s.settlementDate,
      remarks: s.remarks || null,
    }).returning();
    results.push(settlement);

    if (s.btbLcId && s.settlementType === 'BTB_PAYMENT') {
      await db.update(btbLcs)
        .set({ status: 'PAID', updatedAt: new Date() })
        .where(and(eq(btbLcs.id, s.btbLcId), eq(btbLcs.tenantId, tenantId)));
    }
  }

  const allSettlements = await db.select().from(fxSettlements)
    .where(eq(fxSettlements.fxReceiptId, fxReceiptId));
  const totalSettled = allSettlements.reduce((sum, s) => sum + parseFloat(s.amount || '0'), 0);
  
  const [receipt] = await db.select().from(fxReceipts).where(eq(fxReceipts.id, fxReceiptId));
  const receiptNet = parseFloat(receipt?.netAmount || '0');
  
  if (totalSettled >= receiptNet) {
    await db.update(fxReceipts).set({ status: 'SETTLED' }).where(eq(fxReceipts.id, fxReceiptId));
  } else {
    await db.update(fxReceipts).set({ status: 'ALLOCATED' }).where(eq(fxReceipts.id, fxReceiptId));
  }

  return results;
}

export async function getSettlementSummary(tenantId: number, exportCaseId: number) {
  const receipts = await db.select().from(fxReceipts)
    .where(and(eq(fxReceipts.tenantId, tenantId), eq(fxReceipts.exportCaseId, exportCaseId)));

  const receiptIds = receipts.map(r => r.id);
  let settlements: any[] = [];
  if (receiptIds.length > 0) {
    for (const rid of receiptIds) {
      const s = await db.select().from(fxSettlements)
        .where(eq(fxSettlements.fxReceiptId, rid));
      settlements.push(...s);
    }
  }

  const totalReceived = receipts.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);
  const totalBdt = receipts.reduce((sum, r) => sum + parseFloat(r.bdtAmount || '0'), 0);
  const totalCharges = receipts.reduce((sum, r) => sum + parseFloat(r.bankCharges || '0'), 0);
  const totalSettled = settlements.reduce((sum, s) => sum + parseFloat(s.amount || '0'), 0);

  const byType: Record<string, number> = {};
  settlements.forEach(s => {
    byType[s.settlementType] = (byType[s.settlementType] || 0) + parseFloat(s.amount || '0');
  });

  return {
    totalReceived,
    totalBdt,
    totalCharges,
    totalSettled,
    unsettledBalance: totalBdt - totalCharges - totalSettled,
    byType,
    receipts,
    settlements,
  };
}

export async function listFxReceipts(tenantId: number, filters?: { exportCaseId?: number; status?: string }) {
  const results = await db.select().from(fxReceipts)
    .where(eq(fxReceipts.tenantId, tenantId))
    .orderBy(desc(fxReceipts.receiptDate));

  let filtered = results;
  if (filters?.exportCaseId) filtered = filtered.filter(r => r.exportCaseId === filters.exportCaseId);
  if (filters?.status) filtered = filtered.filter(r => r.status === filters.status);
  return filtered;
}

export async function getFxReceiptDetail(tenantId: number, id: number) {
  const [receipt] = await db.select().from(fxReceipts)
    .where(and(eq(fxReceipts.id, id), eq(fxReceipts.tenantId, tenantId)));
  if (!receipt) throw new Error('FX Receipt not found');

  const settlements = await db.select().from(fxSettlements)
    .where(eq(fxSettlements.fxReceiptId, id));

  const exportCase = receipt.exportCaseId ? await db.select().from(exportCases)
    .where(eq(exportCases.id, receipt.exportCaseId)).then(r => r[0]) : null;

  const totalSettled = settlements.reduce((sum, s) => sum + parseFloat(s.amount || '0'), 0);
  const unsettledBalance = parseFloat(receipt.netAmount || '0') - totalSettled;

  return { ...receipt, settlements, exportCase, totalSettled, unsettledBalance };
}

export async function getUnsettledBalance(tenantId: number) {
  const receipts = await db.select().from(fxReceipts)
    .where(and(eq(fxReceipts.tenantId, tenantId), sql`${fxReceipts.status} != 'SETTLED'`));

  let totalUnsettled = 0;
  for (const r of receipts) {
    const settlements = await db.select().from(fxSettlements)
      .where(eq(fxSettlements.fxReceiptId, r.id));
    const settled = settlements.reduce((sum, s) => sum + parseFloat(s.amount || '0'), 0);
    totalUnsettled += parseFloat(r.netAmount || '0') - settled;
  }
  return { totalUnsettled, pendingReceipts: receipts.length };
}
