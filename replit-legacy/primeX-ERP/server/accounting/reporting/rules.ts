import { db } from "../../db";
import { ledgerPostings, ledgerOpeningBalances, chartOfAccounts, accountGroups, accountTypes, vouchers } from "@shared/schema";
import { eq, and, sql, gte, lte, lt, asc, desc } from "drizzle-orm";

export const REPORTING_RULES = {
  ONLY_POSTED: true,
  DATE_RANGE_INCLUSIVE: true,
  MAX_RANGE_DAYS: 730,
  DEFAULT_PAGE_SIZE: 500,
  MAX_PAGE_SIZE: 5000,
  CURRENCY: "BDT",
  CURRENCY_SYMBOL: "BDT",
  DECIMAL_PRECISION: 2,
};

export function validateDateRange(startDate: string, endDate: string): { valid: boolean; error?: string } {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return { valid: false, error: "Dates must be in YYYY-MM-DD format" };
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { valid: false, error: "Invalid date values" };
  }
  if (end < start) {
    return { valid: false, error: "End date must be >= start date" };
  }
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > REPORTING_RULES.MAX_RANGE_DAYS) {
    return { valid: false, error: `Date range cannot exceed ${REPORTING_RULES.MAX_RANGE_DAYS} days (${Math.round(REPORTING_RULES.MAX_RANGE_DAYS/365)} years). Use override=true to bypass.` };
  }
  return { valid: true };
}

export function validateAsOfDate(asOfDate: string): { valid: boolean; error?: string } {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(asOfDate)) {
    return { valid: false, error: "Date must be in YYYY-MM-DD format" };
  }
  const date = new Date(asOfDate);
  if (isNaN(date.getTime())) {
    return { valid: false, error: "Invalid date value" };
  }
  return { valid: true };
}

export interface AccountMovement {
  accountId: number;
  accountNumber: string;
  accountName: string;
  accountTypeName: string;
  groupId: number;
  groupName: string;
  groupNature: string;
  parentGroupId: number | null;
  normalBalance: string;
  periodDebit: number;
  periodCredit: number;
  openingDebit: number;
  openingCredit: number;
}

export async function getAccountMovements(
  tenantId: number,
  startDate: string,
  endDate: string
): Promise<AccountMovement[]> {
  const accountRows = await db
    .select({
      accountId: chartOfAccounts.id,
      accountNumber: chartOfAccounts.accountNumber,
      accountName: chartOfAccounts.name,
      accountTypeName: accountTypes.name,
      groupId: chartOfAccounts.groupId,
      groupName: accountGroups.name,
      groupNature: accountGroups.nature,
      parentGroupId: accountGroups.parentGroupId,
      normalBalance: chartOfAccounts.normalBalance,
    })
    .from(chartOfAccounts)
    .innerJoin(accountTypes, eq(chartOfAccounts.accountTypeId, accountTypes.id))
    .innerJoin(accountGroups, eq(chartOfAccounts.groupId, accountGroups.id))
    .where(eq(chartOfAccounts.tenantId, tenantId))
    .orderBy(asc(chartOfAccounts.accountNumber));

  const periodPostings = await db
    .select({
      accountId: ledgerPostings.accountId,
      debitTotal: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.debitAmount} AS numeric)), 0)`,
      creditTotal: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.creditAmount} AS numeric)), 0)`,
    })
    .from(ledgerPostings)
    .innerJoin(vouchers, eq(ledgerPostings.voucherId, vouchers.id))
    .where(
      and(
        eq(ledgerPostings.tenantId, tenantId),
        gte(ledgerPostings.postingDate, startDate),
        lte(ledgerPostings.postingDate, endDate),
        eq(vouchers.isPosted, true)
      )
    )
    .groupBy(ledgerPostings.accountId);

  const openingPostings = await db
    .select({
      accountId: ledgerPostings.accountId,
      debitTotal: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.debitAmount} AS numeric)), 0)`,
      creditTotal: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.creditAmount} AS numeric)), 0)`,
    })
    .from(ledgerPostings)
    .innerJoin(vouchers, eq(ledgerPostings.voucherId, vouchers.id))
    .where(
      and(
        eq(ledgerPostings.tenantId, tenantId),
        lt(ledgerPostings.postingDate, startDate),
        eq(vouchers.isPosted, true)
      )
    )
    .groupBy(ledgerPostings.accountId);

  const periodMap = new Map<number, { debit: number; credit: number }>();
  for (const p of periodPostings) {
    periodMap.set(p.accountId, {
      debit: parseFloat(p.debitTotal),
      credit: parseFloat(p.creditTotal),
    });
  }

  const openingMap = new Map<number, { debit: number; credit: number }>();
  for (const p of openingPostings) {
    openingMap.set(p.accountId, {
      debit: parseFloat(p.debitTotal),
      credit: parseFloat(p.creditTotal),
    });
  }

  const openingBalanceRows = await db
    .select({
      accountId: ledgerOpeningBalances.accountId,
      openingDebit: ledgerOpeningBalances.openingDebit,
      openingCredit: ledgerOpeningBalances.openingCredit,
    })
    .from(ledgerOpeningBalances)
    .where(eq(ledgerOpeningBalances.tenantId, tenantId));

  const lobMap = new Map<number, { debit: number; credit: number }>();
  for (const ob of openingBalanceRows) {
    const existing = lobMap.get(ob.accountId) || { debit: 0, credit: 0 };
    existing.debit += parseFloat(ob.openingDebit || "0");
    existing.credit += parseFloat(ob.openingCredit || "0");
    lobMap.set(ob.accountId, existing);
  }

  return accountRows.map((row) => {
    const period = periodMap.get(row.accountId) || { debit: 0, credit: 0 };
    const opening = openingMap.get(row.accountId) || { debit: 0, credit: 0 };
    const lob = lobMap.get(row.accountId) || { debit: 0, credit: 0 };
    return {
      accountId: row.accountId,
      accountNumber: row.accountNumber,
      accountName: row.accountName,
      accountTypeName: row.accountTypeName,
      groupId: row.groupId,
      groupName: row.groupName,
      groupNature: row.groupNature,
      parentGroupId: row.parentGroupId,
      normalBalance: row.normalBalance || "debit",
      periodDebit: period.debit,
      periodCredit: period.credit,
      openingDebit: opening.debit + lob.debit,
      openingCredit: opening.credit + lob.credit,
    };
  });
}

export async function getAccountMovementsAsOf(
  tenantId: number,
  asOfDate: string
): Promise<AccountMovement[]> {
  const accountRows = await db
    .select({
      accountId: chartOfAccounts.id,
      accountNumber: chartOfAccounts.accountNumber,
      accountName: chartOfAccounts.name,
      accountTypeName: accountTypes.name,
      groupId: chartOfAccounts.groupId,
      groupName: accountGroups.name,
      groupNature: accountGroups.nature,
      parentGroupId: accountGroups.parentGroupId,
      normalBalance: chartOfAccounts.normalBalance,
    })
    .from(chartOfAccounts)
    .innerJoin(accountTypes, eq(chartOfAccounts.accountTypeId, accountTypes.id))
    .innerJoin(accountGroups, eq(chartOfAccounts.groupId, accountGroups.id))
    .where(eq(chartOfAccounts.tenantId, tenantId))
    .orderBy(asc(chartOfAccounts.accountNumber));

  const closingPostings = await db
    .select({
      accountId: ledgerPostings.accountId,
      debitTotal: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.debitAmount} AS numeric)), 0)`,
      creditTotal: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.creditAmount} AS numeric)), 0)`,
    })
    .from(ledgerPostings)
    .innerJoin(vouchers, eq(ledgerPostings.voucherId, vouchers.id))
    .where(
      and(
        eq(ledgerPostings.tenantId, tenantId),
        lte(ledgerPostings.postingDate, asOfDate),
        eq(vouchers.isPosted, true)
      )
    )
    .groupBy(ledgerPostings.accountId);

  const closingMap = new Map<number, { debit: number; credit: number }>();
  for (const p of closingPostings) {
    closingMap.set(p.accountId, {
      debit: parseFloat(p.debitTotal),
      credit: parseFloat(p.creditTotal),
    });
  }

  const openingBalanceRows = await db
    .select({
      accountId: ledgerOpeningBalances.accountId,
      openingDebit: ledgerOpeningBalances.openingDebit,
      openingCredit: ledgerOpeningBalances.openingCredit,
    })
    .from(ledgerOpeningBalances)
    .where(eq(ledgerOpeningBalances.tenantId, tenantId));

  const lobMap = new Map<number, { debit: number; credit: number }>();
  for (const ob of openingBalanceRows) {
    const existing = lobMap.get(ob.accountId) || { debit: 0, credit: 0 };
    existing.debit += parseFloat(ob.openingDebit || "0");
    existing.credit += parseFloat(ob.openingCredit || "0");
    lobMap.set(ob.accountId, existing);
  }

  return accountRows.map((row) => {
    const closing = closingMap.get(row.accountId) || { debit: 0, credit: 0 };
    const lob = lobMap.get(row.accountId) || { debit: 0, credit: 0 };
    return {
      accountId: row.accountId,
      accountNumber: row.accountNumber,
      accountName: row.accountName,
      accountTypeName: row.accountTypeName,
      groupId: row.groupId,
      groupName: row.groupName,
      groupNature: row.groupNature,
      parentGroupId: row.parentGroupId,
      normalBalance: row.normalBalance || "debit",
      periodDebit: closing.debit + lob.debit,
      periodCredit: closing.credit + lob.credit,
      openingDebit: 0,
      openingCredit: 0,
    };
  });
}

export async function getGroupsForTenant(tenantId: number, natureFilter?: string[]) {
  const conditions: any[] = [eq(accountGroups.tenantId, tenantId)];
  if (natureFilter && natureFilter.length > 0) {
    conditions.push(
      sql`${accountGroups.nature} IN (${sql.join(
        natureFilter.map((n) => sql`${n}`),
        sql`, `
      )})`
    );
  }
  return await db
    .select()
    .from(accountGroups)
    .where(and(...conditions))
    .orderBy(asc(accountGroups.sortOrder));
}
