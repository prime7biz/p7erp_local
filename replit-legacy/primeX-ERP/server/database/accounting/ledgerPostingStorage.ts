import { db } from "../../db";
import { ledgerPostings, vouchers, voucherItems, chartOfAccounts, fiscalYears } from "../../../shared/schema";
import { eq, and, sql, lte, asc } from "drizzle-orm";

export async function createPostingsForVoucher(
  voucherId: number,
  tenantId: number,
  postedById: number
): Promise<void> {
  const [voucher] = await db
    .select()
    .from(vouchers)
    .where(and(eq(vouchers.id, voucherId), eq(vouchers.tenantId, tenantId)));

  if (!voucher) {
    throw new Error("Voucher not found");
  }

  const items = await db
    .select()
    .from(voucherItems)
    .where(and(eq(voucherItems.voucherId, voucherId), eq(voucherItems.tenantId, tenantId)))
    .orderBy(voucherItems.lineNumber);

  if (items.length === 0) {
    throw new Error("Voucher has no items");
  }

  const [currentFiscalYear] = await db
    .select()
    .from(fiscalYears)
    .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)));

  const fiscalYearId = currentFiscalYear?.id || voucher.fiscalYearId;

  const postingDate = voucher.postingDate || voucher.voucherDate;

  const postingRecords = items.map((item) => ({
    tenantId,
    voucherId,
    voucherItemId: item.id,
    accountId: item.accountId,
    postingDate,
    debitAmount: item.debitAmount || "0",
    creditAmount: item.creditAmount || "0",
    narration: item.description || voucher.description || "",
    postedById,
    fiscalYearId,
    accountingPeriodId: voucher.accountingPeriodId,
  }));

  await db.insert(ledgerPostings).values(postingRecords);

  await db
    .update(vouchers)
    .set({ isPosted: true, postingDate })
    .where(and(eq(vouchers.id, voucherId), eq(vouchers.tenantId, tenantId)));
}

export async function deletePostingsForVoucher(
  voucherId: number,
  tenantId: number,
  cancelledById?: number,
  cancellationReason?: string
): Promise<void> {
  await db
    .delete(ledgerPostings)
    .where(and(eq(ledgerPostings.voucherId, voucherId), eq(ledgerPostings.tenantId, tenantId)));

  await db
    .update(vouchers)
    .set({
      isPosted: false,
      isCancelled: true,
      cancelledById: cancelledById || null,
      cancellationDate: new Date(),
      cancellationReason: cancellationReason || "Posting cancelled",
    })
    .where(and(eq(vouchers.id, voucherId), eq(vouchers.tenantId, tenantId)));
}

export async function getPostingsForVoucher(
  voucherId: number,
  tenantId: number
) {
  return await db
    .select({
      id: ledgerPostings.id,
      voucherId: ledgerPostings.voucherId,
      voucherItemId: ledgerPostings.voucherItemId,
      accountId: ledgerPostings.accountId,
      accountNumber: chartOfAccounts.accountNumber,
      accountName: chartOfAccounts.name,
      postingDate: ledgerPostings.postingDate,
      debitAmount: ledgerPostings.debitAmount,
      creditAmount: ledgerPostings.creditAmount,
      narration: ledgerPostings.narration,
      postedById: ledgerPostings.postedById,
      fiscalYearId: ledgerPostings.fiscalYearId,
      createdAt: ledgerPostings.createdAt,
    })
    .from(ledgerPostings)
    .leftJoin(chartOfAccounts, eq(ledgerPostings.accountId, chartOfAccounts.id))
    .where(and(eq(ledgerPostings.voucherId, voucherId), eq(ledgerPostings.tenantId, tenantId)))
    .orderBy(ledgerPostings.id);
}

export async function getPostingsForAccount(
  accountId: number,
  tenantId: number,
  startDate?: string,
  endDate?: string
) {
  const conditions = [
    eq(ledgerPostings.accountId, accountId),
    eq(ledgerPostings.tenantId, tenantId),
  ];

  if (startDate) {
    conditions.push(sql`${ledgerPostings.postingDate} >= ${startDate}`);
  }
  if (endDate) {
    conditions.push(sql`${ledgerPostings.postingDate} <= ${endDate}`);
  }

  return await db
    .select({
      id: ledgerPostings.id,
      voucherId: ledgerPostings.voucherId,
      voucherNumber: vouchers.voucherNumber,
      voucherDate: vouchers.voucherDate,
      accountId: ledgerPostings.accountId,
      accountNumber: chartOfAccounts.accountNumber,
      accountName: chartOfAccounts.name,
      postingDate: ledgerPostings.postingDate,
      debitAmount: ledgerPostings.debitAmount,
      creditAmount: ledgerPostings.creditAmount,
      narration: ledgerPostings.narration,
      createdAt: ledgerPostings.createdAt,
    })
    .from(ledgerPostings)
    .leftJoin(vouchers, eq(ledgerPostings.voucherId, vouchers.id))
    .leftJoin(chartOfAccounts, eq(ledgerPostings.accountId, chartOfAccounts.id))
    .where(and(...conditions))
    .orderBy(asc(ledgerPostings.postingDate));
}

export async function getAccountBalance(
  accountId: number,
  tenantId: number,
  asOfDate?: string
): Promise<{ debitTotal: number; creditTotal: number; balance: number }> {
  const conditions = [
    eq(ledgerPostings.accountId, accountId),
    eq(ledgerPostings.tenantId, tenantId),
  ];

  if (asOfDate) {
    conditions.push(lte(ledgerPostings.postingDate, asOfDate));
  }

  const [result] = await db
    .select({
      debitTotal: sql<string>`COALESCE(SUM(${ledgerPostings.debitAmount}), 0)`,
      creditTotal: sql<string>`COALESCE(SUM(${ledgerPostings.creditAmount}), 0)`,
    })
    .from(ledgerPostings)
    .where(and(...conditions));

  const debitTotal = parseFloat(result?.debitTotal || "0");
  const creditTotal = parseFloat(result?.creditTotal || "0");

  return {
    debitTotal,
    creditTotal,
    balance: debitTotal - creditTotal,
  };
}

export async function getTrialBalance(
  tenantId: number,
  asOfDate?: string
): Promise<Array<{
  accountId: number;
  accountNumber: string;
  accountName: string;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}>> {
  const conditions = [eq(ledgerPostings.tenantId, tenantId)];

  if (asOfDate) {
    conditions.push(lte(ledgerPostings.postingDate, asOfDate));
  }

  const results = await db
    .select({
      accountId: ledgerPostings.accountId,
      accountNumber: chartOfAccounts.accountNumber,
      accountName: chartOfAccounts.name,
      debitTotal: sql<string>`COALESCE(SUM(${ledgerPostings.debitAmount}), 0)`,
      creditTotal: sql<string>`COALESCE(SUM(${ledgerPostings.creditAmount}), 0)`,
    })
    .from(ledgerPostings)
    .innerJoin(chartOfAccounts, eq(ledgerPostings.accountId, chartOfAccounts.id))
    .where(and(...conditions))
    .groupBy(ledgerPostings.accountId, chartOfAccounts.accountNumber, chartOfAccounts.name)
    .orderBy(chartOfAccounts.accountNumber);

  return results.map((row) => {
    const debitTotal = parseFloat(row.debitTotal || "0");
    const creditTotal = parseFloat(row.creditTotal || "0");
    return {
      accountId: row.accountId,
      accountNumber: row.accountNumber || "",
      accountName: row.accountName || "",
      debitTotal,
      creditTotal,
      balance: debitTotal - creditTotal,
    };
  });
}
