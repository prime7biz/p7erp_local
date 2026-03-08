import { db } from "../../db";
import { 
  FinancialStatementTemplate,
  financialStatementTemplates,
  FinancialStatementSection,
  financialStatementSections,
  FinancialStatementSectionAccount,
  financialStatementSectionAccounts,
  FinancialInsight,
  financialInsights,
  ledgerPostings,
  ledgerOpeningBalances,
  vouchers,
  voucherItems,
  voucherTypes,
  chartOfAccounts,
  accountTypes,
  accountGroups,
  fiscalYears,
} from "@shared/schema";
import { eq, and, desc, asc, gte, lte, sql, sum, inArray } from "drizzle-orm";

export interface DayBookEntry {
  voucherId: number;
  voucherDate: string;
  voucherNumber: string;
  voucherType: string;
  voucherTypeCode: string;
  narration: string | null;
  amount: string;
  items: Array<{
    accountId: number;
    accountName: string;
    accountNumber: string;
    description: string | null;
    debitAmount: string;
    creditAmount: string;
  }>;
}

export interface LedgerEntry {
  id: number;
  postingDate: string;
  voucherNumber: string;
  voucherType: string;
  narration: string | null;
  debitAmount: string;
  creditAmount: string;
  runningBalance: number;
}

export interface TrialBalanceEntry {
  accountId: number;
  accountNumber: string;
  accountName: string;
  accountTypeName: string;
  debitTotal: number;
  creditTotal: number;
  closingBalance: number;
}

export interface TrialBalanceGroup {
  groupId: number;
  groupName: string;
  nature: string;
  level: number;
  parentGroupId: number | null;
  accounts: TrialBalanceEntry[];
  subGroups: TrialBalanceGroup[];
  totalDebit: number;
  totalCredit: number;
}

export interface BSGroupNode {
  groupId: number;
  groupName: string;
  level: number;
  accounts: Array<{ accountId: number; accountName: string; balance: number }>;
  subGroups: BSGroupNode[];
  total: number;
}

export interface BalanceSheetResult {
  assets: BSGroupNode[];
  liabilities: BSGroupNode[];
  totalAssets: number;
  totalLiabilities: number;
  difference: number;
}

export interface PLGroupNode {
  groupId: number;
  groupName: string;
  level: number;
  accounts: Array<{ accountId: number; accountName: string; amount: number }>;
  subGroups: PLGroupNode[];
  total: number;
}

export interface ProfitAndLossResult {
  directIncome: PLGroupNode[];
  purchaseAccounts: PLGroupNode[];
  directExpenses: PLGroupNode[];
  indirectIncome: PLGroupNode[];
  indirectExpenses: PLGroupNode[];
  grossProfit: number;
  netProfit: number;
  totalDirectIncome: number;
  totalPurchases: number;
  totalDirectExpenses: number;
  totalIndirectIncome: number;
  totalIndirectExpenses: number;
}

export interface BalanceSheetItem {
  accountId: number;
  accountName: string;
  accountNumber: string;
  groupName: string | null;
  balance: number;
}

export interface CashBankEntry {
  id: number;
  postingDate: string;
  voucherNumber: string;
  voucherType: string;
  narration: string | null;
  debitAmount: string;
  creditAmount: string;
  runningBalance: number;
}

export async function getDayBook(
  tenantId: number,
  startDate: string,
  endDate: string,
  voucherTypeCode?: string
): Promise<DayBookEntry[]> {
  try {
    const conditions: any[] = [
      eq(vouchers.tenantId, tenantId),
      eq(vouchers.isPosted, true),
      gte(vouchers.voucherDate, startDate),
      lte(vouchers.voucherDate, endDate),
    ];

    if (voucherTypeCode) {
      conditions.push(eq(voucherTypes.code, voucherTypeCode));
    }

    const voucherRows = await db
      .select({
        voucherId: vouchers.id,
        voucherDate: vouchers.voucherDate,
        voucherNumber: vouchers.voucherNumber,
        voucherType: voucherTypes.name,
        voucherTypeCode: voucherTypes.code,
        narration: vouchers.description,
        amount: vouchers.amount,
      })
      .from(vouchers)
      .innerJoin(voucherTypes, eq(vouchers.voucherTypeId, voucherTypes.id))
      .where(and(...conditions))
      .orderBy(asc(vouchers.voucherDate), asc(vouchers.voucherNumber));

    if (voucherRows.length === 0) return [];

    const voucherIds = voucherRows.map((v) => v.voucherId);

    const itemRows = await db
      .select({
        voucherId: voucherItems.voucherId,
        accountId: voucherItems.accountId,
        accountName: chartOfAccounts.name,
        accountNumber: chartOfAccounts.accountNumber,
        description: voucherItems.description,
        debitAmount: voucherItems.debitAmount,
        creditAmount: voucherItems.creditAmount,
      })
      .from(voucherItems)
      .innerJoin(chartOfAccounts, eq(voucherItems.accountId, chartOfAccounts.id))
      .where(
        and(
          eq(voucherItems.tenantId, tenantId),
          inArray(voucherItems.voucherId, voucherIds)
        )
      )
      .orderBy(asc(voucherItems.lineNumber));

    const itemsByVoucher = new Map<number, typeof itemRows>();
    for (const item of itemRows) {
      const existing = itemsByVoucher.get(item.voucherId) || [];
      existing.push(item);
      itemsByVoucher.set(item.voucherId, existing);
    }

    return voucherRows.map((v) => ({
      voucherId: v.voucherId,
      voucherDate: v.voucherDate,
      voucherNumber: v.voucherNumber,
      voucherType: v.voucherType,
      voucherTypeCode: v.voucherTypeCode,
      narration: v.narration,
      amount: v.amount,
      items: (itemsByVoucher.get(v.voucherId) || []).map((item) => ({
        accountId: item.accountId,
        accountName: item.accountName,
        accountNumber: item.accountNumber,
        description: item.description,
        debitAmount: item.debitAmount || "0",
        creditAmount: item.creditAmount || "0",
      })),
    }));
  } catch (error) {
    console.error("Error in getDayBook:", error);
    throw error;
  }
}

export async function getLedgerReport(
  tenantId: number,
  accountId: number,
  startDate: string,
  endDate: string,
  fiscalYearId?: number
): Promise<{ openingBalance: number; entries: LedgerEntry[] }> {
  try {
    const [coaAccount] = await db
      .select({ openingBalance: chartOfAccounts.openingBalance })
      .from(chartOfAccounts)
      .where(
        and(
          eq(chartOfAccounts.tenantId, tenantId),
          eq(chartOfAccounts.id, accountId)
        )
      );
    const coaOpeningBal = parseFloat(coaAccount?.openingBalance || "0");

    const [openingRow] = await db
      .select({
        totalDebit: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.debitAmount} AS numeric)), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.creditAmount} AS numeric)), 0)`,
      })
      .from(ledgerPostings)
      .where(
        and(
          eq(ledgerPostings.tenantId, tenantId),
          eq(ledgerPostings.accountId, accountId),
          sql`${ledgerPostings.postingDate} < ${startDate}`
        )
      );

    let ledgerOpeningBal =
      parseFloat(openingRow?.totalDebit || "0") - parseFloat(openingRow?.totalCredit || "0");

    let obDebit = 0;
    let obCredit = 0;

    if (fiscalYearId) {
      const [obRow] = await db
        .select({
          openingDebit: ledgerOpeningBalances.openingDebit,
          openingCredit: ledgerOpeningBalances.openingCredit,
        })
        .from(ledgerOpeningBalances)
        .where(
          and(
            eq(ledgerOpeningBalances.tenantId, tenantId),
            eq(ledgerOpeningBalances.accountId, accountId),
            eq(ledgerOpeningBalances.fiscalYearId, fiscalYearId)
          )
        );

      if (obRow) {
        obDebit = parseFloat(obRow.openingDebit || "0");
        obCredit = parseFloat(obRow.openingCredit || "0");
      }
    }

    const openingBalance = Math.round((coaOpeningBal + ledgerOpeningBal + obDebit - obCredit) * 100) / 100;

    const rows = await db
      .select({
        id: ledgerPostings.id,
        postingDate: ledgerPostings.postingDate,
        voucherNumber: vouchers.voucherNumber,
        voucherType: voucherTypes.name,
        narration: ledgerPostings.narration,
        debitAmount: ledgerPostings.debitAmount,
        creditAmount: ledgerPostings.creditAmount,
      })
      .from(ledgerPostings)
      .innerJoin(vouchers, eq(ledgerPostings.voucherId, vouchers.id))
      .innerJoin(voucherTypes, eq(vouchers.voucherTypeId, voucherTypes.id))
      .where(
        and(
          eq(ledgerPostings.tenantId, tenantId),
          eq(ledgerPostings.accountId, accountId),
          gte(ledgerPostings.postingDate, startDate),
          lte(ledgerPostings.postingDate, endDate)
        )
      )
      .orderBy(asc(ledgerPostings.postingDate), asc(ledgerPostings.createdAt));

    let runningBalance = openingBalance;
    const entries: LedgerEntry[] = [];

    if (obDebit > 0 || obCredit > 0) {
      entries.push({
        id: 0,
        postingDate: startDate,
        voucherNumber: "OB",
        voucherType: "Opening Balance",
        narration: "Opening Balance for Fiscal Year",
        debitAmount: obDebit.toFixed(2),
        creditAmount: obCredit.toFixed(2),
        runningBalance: openingBalance,
      });
    }

    for (const row of rows) {
      const debit = parseFloat(row.debitAmount || "0");
      const credit = parseFloat(row.creditAmount || "0");
      runningBalance += debit - credit;
      entries.push({
        id: row.id,
        postingDate: row.postingDate,
        voucherNumber: row.voucherNumber,
        voucherType: row.voucherType,
        narration: row.narration,
        debitAmount: row.debitAmount,
        creditAmount: row.creditAmount,
        runningBalance: Math.round(runningBalance * 100) / 100,
      });
    }

    return { openingBalance, entries };
  } catch (error) {
    console.error("Error in getLedgerReport:", error);
    throw error;
  }
}

async function loadAccountsWithBalances(tenantId: number, natureFilter?: string[]) {
  const conditions: any[] = [eq(chartOfAccounts.tenantId, tenantId)];
  if (natureFilter && natureFilter.length > 0) {
    conditions.push(sql`${accountGroups.nature} IN (${sql.join(natureFilter.map(n => sql`${n}`), sql`, `)})`);
  }

  const rows = await db
    .select({
      accountId: chartOfAccounts.id,
      accountNumber: chartOfAccounts.accountNumber,
      accountName: chartOfAccounts.name,
      openingBalance: chartOfAccounts.openingBalance,
      groupId: chartOfAccounts.groupId,
      accountTypeName: accountTypes.name,
      groupName: accountGroups.name,
      groupNature: accountGroups.nature,
      parentGroupId: accountGroups.parentGroupId,
    })
    .from(chartOfAccounts)
    .innerJoin(accountTypes, eq(chartOfAccounts.accountTypeId, accountTypes.id))
    .innerJoin(accountGroups, eq(chartOfAccounts.groupId, accountGroups.id))
    .where(and(...conditions))
    .orderBy(asc(chartOfAccounts.accountNumber));

  const postingRows = await db
    .select({
      accountId: ledgerPostings.accountId,
      debitTotal: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.debitAmount} AS numeric)), 0)`,
      creditTotal: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.creditAmount} AS numeric)), 0)`,
    })
    .from(ledgerPostings)
    .where(eq(ledgerPostings.tenantId, tenantId))
    .groupBy(ledgerPostings.accountId);

  const postingMap = new Map<number, { debit: number; credit: number }>();
  for (const p of postingRows) {
    postingMap.set(p.accountId, {
      debit: parseFloat(p.debitTotal),
      credit: parseFloat(p.creditTotal),
    });
  }

  return rows.map(row => {
    const ob = parseFloat(row.openingBalance || "0");
    const posting = postingMap.get(row.accountId) || { debit: 0, credit: 0 };
    return {
      ...row,
      openingBalanceNum: ob,
      postingDebit: posting.debit,
      postingCredit: posting.credit,
    };
  });
}

async function loadGroupsForTenant(tenantId: number, natureFilter?: string[]) {
  const conditions: any[] = [eq(accountGroups.tenantId, tenantId)];
  if (natureFilter && natureFilter.length > 0) {
    conditions.push(sql`${accountGroups.nature} IN (${sql.join(natureFilter.map(n => sql`${n}`), sql`, `)})`);
  }
  return await db
    .select()
    .from(accountGroups)
    .where(and(...conditions))
    .orderBy(asc(accountGroups.sortOrder));
}

function buildTrialBalanceTree(
  groups: any[],
  accountsByGroup: Map<number, TrialBalanceEntry[]>,
  parentId: number | null,
  level: number
): TrialBalanceGroup[] {
  const children = groups.filter(g =>
    parentId === null ? g.parentGroupId === null : g.parentGroupId === parentId
  );

  return children.map(group => {
    const subGroups = buildTrialBalanceTree(groups, accountsByGroup, group.id, level + 1);
    const accounts = accountsByGroup.get(group.id) || [];

    let totalDebit = accounts.reduce((s, a) => s + a.debitTotal, 0);
    let totalCredit = accounts.reduce((s, a) => s + a.creditTotal, 0);
    for (const sg of subGroups) {
      totalDebit += sg.totalDebit;
      totalCredit += sg.totalCredit;
    }

    return {
      groupId: group.id,
      groupName: group.name,
      nature: group.nature,
      level,
      parentGroupId: group.parentGroupId,
      accounts,
      subGroups,
      totalDebit: Math.round(totalDebit * 100) / 100,
      totalCredit: Math.round(totalCredit * 100) / 100,
    };
  }).filter(g => g.totalDebit !== 0 || g.totalCredit !== 0 || g.accounts.length > 0 || g.subGroups.length > 0);
}

export async function getTrialBalance(
  tenantId: number,
  asOfDate?: string,
  fiscalYearId?: number
): Promise<TrialBalanceGroup[]> {
  try {
    const allAccounts = await loadAccountsWithBalances(tenantId);
    const allGroups = await loadGroupsForTenant(tenantId);

    const accountsByGroup = new Map<number, TrialBalanceEntry[]>();

    for (const acct of allAccounts) {
      const ob = acct.openingBalanceNum;
      const netBalance = ob + acct.postingDebit - acct.postingCredit;

      let debitTotal = 0;
      let creditTotal = 0;
      if (netBalance > 0) {
        debitTotal = Math.round(netBalance * 100) / 100;
      } else if (netBalance < 0) {
        creditTotal = Math.round(Math.abs(netBalance) * 100) / 100;
      }

      if (debitTotal === 0 && creditTotal === 0) continue;

      const entry: TrialBalanceEntry = {
        accountId: acct.accountId,
        accountNumber: acct.accountNumber,
        accountName: acct.accountName,
        accountTypeName: acct.accountTypeName,
        debitTotal,
        creditTotal,
        closingBalance: Math.round(netBalance * 100) / 100,
      };

      const existing = accountsByGroup.get(acct.groupId) || [];
      existing.push(entry);
      accountsByGroup.set(acct.groupId, existing);
    }

    return buildTrialBalanceTree(allGroups, accountsByGroup, null, 0);
  } catch (error) {
    console.error("Error in getTrialBalance:", error);
    throw error;
  }
}

function isDescendantOf(groupId: number, ancestorId: number, groupMap: Map<number, any>): boolean {
  let current = groupMap.get(groupId);
  while (current) {
    if (current.id === ancestorId) return true;
    if (!current.parentGroupId) return false;
    current = groupMap.get(current.parentGroupId);
  }
  return false;
}

function buildPLGroupTree(
  groups: any[],
  accountsByGroup: Map<number, Array<{ accountId: number; accountName: string; amount: number }>>,
  parentId: number | null,
  level: number
): PLGroupNode[] {
  const children = groups.filter(g =>
    parentId === null ? g.parentGroupId === null : g.parentGroupId === parentId
  );

  return children.map(group => {
    const subGroups = buildPLGroupTree(groups, accountsByGroup, group.id, level + 1);
    const accounts = accountsByGroup.get(group.id) || [];

    let total = accounts.reduce((s, a) => s + a.amount, 0);
    for (const sg of subGroups) {
      total += sg.total;
    }

    return {
      groupId: group.id,
      groupName: group.name,
      level,
      accounts,
      subGroups,
      total: Math.round(total * 100) / 100,
    };
  }).filter(g => g.total !== 0 || g.accounts.length > 0 || g.subGroups.length > 0);
}

export async function getProfitAndLoss(
  tenantId: number,
  startDate: string,
  endDate: string
): Promise<ProfitAndLossResult> {
  try {
    const allAccounts = await loadAccountsWithBalances(tenantId, ['Income', 'Expense']);
    const allGroups = await loadGroupsForTenant(tenantId, ['Income', 'Expense']);

    const groupMap = new Map<number, any>();
    for (const g of allGroups) {
      groupMap.set(g.id, g);
    }

    const PURCHASE_GROUP_ID = 138;
    const DIRECT_EXPENSE_GROUP_ID = 136;
    const DIRECT_INCOME_GROUP_ID = 132;
    const INDIRECT_INCOME_GROUP_ID = 134;
    const INDIRECT_EXPENSE_GROUP_ID = 139;

    const accountsByGroup = new Map<number, Array<{ accountId: number; accountName: string; amount: number }>>();

    for (const acct of allAccounts) {
      const ob = acct.openingBalanceNum;
      let amount: number;
      if (acct.groupNature === 'Income') {
        amount = Math.round((-ob + acct.postingCredit - acct.postingDebit) * 100) / 100;
      } else {
        amount = Math.round((ob + acct.postingDebit - acct.postingCredit) * 100) / 100;
      }
      if (amount === 0) continue;

      const entry = { accountId: acct.accountId, accountName: acct.accountName, amount };
      const existing = accountsByGroup.get(acct.groupId) || [];
      existing.push(entry);
      accountsByGroup.set(acct.groupId, existing);
    }

    const purchaseGroups = allGroups.filter(g => g.id === PURCHASE_GROUP_ID || isDescendantOf(g.id, PURCHASE_GROUP_ID, groupMap));
    const directExpenseGroups = allGroups.filter(g => {
      if (g.id === PURCHASE_GROUP_ID || isDescendantOf(g.id, PURCHASE_GROUP_ID, groupMap)) return false;
      return g.id === DIRECT_EXPENSE_GROUP_ID || isDescendantOf(g.id, DIRECT_EXPENSE_GROUP_ID, groupMap);
    });
    const directIncomeGroups = allGroups.filter(g => g.id === DIRECT_INCOME_GROUP_ID || isDescendantOf(g.id, DIRECT_INCOME_GROUP_ID, groupMap));
    const indirectIncomeGroups = allGroups.filter(g => g.id === INDIRECT_INCOME_GROUP_ID || isDescendantOf(g.id, INDIRECT_INCOME_GROUP_ID, groupMap));
    const indirectExpenseGroups = allGroups.filter(g => g.id === INDIRECT_EXPENSE_GROUP_ID || isDescendantOf(g.id, INDIRECT_EXPENSE_GROUP_ID, groupMap));

    const purchaseAccounts = buildPLGroupTree(purchaseGroups, accountsByGroup, DIRECT_EXPENSE_GROUP_ID, 0)
      .filter(g => g.groupId === PURCHASE_GROUP_ID);
    const directExpenseTree = buildPLGroupTree(directExpenseGroups, accountsByGroup, null, 0)
      .map(g => ({ ...g, subGroups: g.subGroups }));
    const directIncomeTree = buildPLGroupTree(directIncomeGroups, accountsByGroup, null, 0);
    const indirectIncomeTree = buildPLGroupTree(indirectIncomeGroups, accountsByGroup, null, 0);
    const indirectExpenseTree = buildPLGroupTree(indirectExpenseGroups, accountsByGroup, null, 0);

    function sumTree(nodes: PLGroupNode[]): number {
      return nodes.reduce((s, n) => s + n.total, 0);
    }

    const totalDirectIncome = Math.round(sumTree(directIncomeTree) * 100) / 100;
    const totalPurchases = Math.round(sumTree(purchaseAccounts) * 100) / 100;
    const totalDirectExpenses = Math.round(sumTree(directExpenseTree) * 100) / 100;
    const totalIndirectIncome = Math.round(sumTree(indirectIncomeTree) * 100) / 100;
    const totalIndirectExpenses = Math.round(sumTree(indirectExpenseTree) * 100) / 100;

    const grossProfit = Math.round((totalDirectIncome - totalPurchases - totalDirectExpenses) * 100) / 100;
    const netProfit = Math.round((grossProfit + totalIndirectIncome - totalIndirectExpenses) * 100) / 100;

    return {
      directIncome: directIncomeTree,
      purchaseAccounts,
      directExpenses: directExpenseTree,
      indirectIncome: indirectIncomeTree,
      indirectExpenses: indirectExpenseTree,
      grossProfit,
      netProfit,
      totalDirectIncome,
      totalPurchases,
      totalDirectExpenses,
      totalIndirectIncome,
      totalIndirectExpenses,
    };
  } catch (error) {
    console.error("Error in getProfitAndLoss:", error);
    throw error;
  }
}

function buildBSGroupTree(
  groups: any[],
  accountsByGroup: Map<number, Array<{ accountId: number; accountName: string; balance: number }>>,
  parentId: number | null,
  level: number
): BSGroupNode[] {
  const children = groups.filter(g =>
    parentId === null ? g.parentGroupId === null : g.parentGroupId === parentId
  );

  return children.map(group => {
    const subGroups = buildBSGroupTree(groups, accountsByGroup, group.id, level + 1);
    const accounts = accountsByGroup.get(group.id) || [];

    let total = accounts.reduce((s, a) => s + a.balance, 0);
    for (const sg of subGroups) {
      total += sg.total;
    }

    return {
      groupId: group.id,
      groupName: group.name,
      level,
      accounts,
      subGroups,
      total: Math.round(total * 100) / 100,
    };
  }).filter(g => g.total !== 0 || g.accounts.length > 0 || g.subGroups.length > 0);
}

export async function getBalanceSheet(
  tenantId: number,
  asOfDate: string
): Promise<BalanceSheetResult> {
  try {
    const allAccounts = await loadAccountsWithBalances(tenantId, ['Asset', 'Liability', 'Equity']);
    const allGroups = await loadGroupsForTenant(tenantId, ['Asset', 'Liability', 'Equity']);

    const assetAccountsByGroup = new Map<number, Array<{ accountId: number; accountName: string; balance: number }>>();
    const liabAccountsByGroup = new Map<number, Array<{ accountId: number; accountName: string; balance: number }>>();

    for (const acct of allAccounts) {
      const ob = acct.openingBalanceNum;
      let balance: number;
      if (acct.groupNature === 'Asset') {
        balance = Math.round((ob + acct.postingDebit - acct.postingCredit) * 100) / 100;
      } else {
        balance = Math.round((-ob + acct.postingCredit - acct.postingDebit) * 100) / 100;
      }
      if (balance === 0) continue;

      const entry = { accountId: acct.accountId, accountName: acct.accountName, balance };

      if (acct.groupNature === 'Asset') {
        const existing = assetAccountsByGroup.get(acct.groupId) || [];
        existing.push(entry);
        assetAccountsByGroup.set(acct.groupId, existing);
      } else {
        const existing = liabAccountsByGroup.get(acct.groupId) || [];
        existing.push(entry);
        liabAccountsByGroup.set(acct.groupId, existing);
      }
    }

    const assetGroups = allGroups.filter(g => g.nature === 'Asset');
    const liabGroups = allGroups.filter(g => g.nature === 'Liability' || g.nature === 'Equity');

    const assets = buildBSGroupTree(assetGroups, assetAccountsByGroup, null, 0);
    const liabilities = buildBSGroupTree(liabGroups, liabAccountsByGroup, null, 0);

    const totalAssets = Math.round(assets.reduce((s, n) => s + n.total, 0) * 100) / 100;
    const totalLiabilities = Math.round(liabilities.reduce((s, n) => s + n.total, 0) * 100) / 100;
    const difference = Math.round((totalAssets - totalLiabilities) * 100) / 100;

    return { assets, liabilities, totalAssets, totalLiabilities, difference };
  } catch (error) {
    console.error("Error in getBalanceSheet:", error);
    throw error;
  }
}

export async function getCashBankBook(
  tenantId: number,
  accountId: number,
  startDate: string,
  endDate: string
): Promise<{ openingBalance: number; entries: CashBankEntry[] }> {
  try {
    const [openingRow] = await db
      .select({
        totalDebit: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.debitAmount} AS numeric)), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.creditAmount} AS numeric)), 0)`,
      })
      .from(ledgerPostings)
      .where(
        and(
          eq(ledgerPostings.tenantId, tenantId),
          eq(ledgerPostings.accountId, accountId),
          sql`${ledgerPostings.postingDate} < ${startDate}`
        )
      );

    const openingBalance =
      parseFloat(openingRow?.totalDebit || "0") - parseFloat(openingRow?.totalCredit || "0");

    const rows = await db
      .select({
        id: ledgerPostings.id,
        postingDate: ledgerPostings.postingDate,
        voucherNumber: vouchers.voucherNumber,
        voucherType: voucherTypes.name,
        narration: ledgerPostings.narration,
        debitAmount: ledgerPostings.debitAmount,
        creditAmount: ledgerPostings.creditAmount,
      })
      .from(ledgerPostings)
      .innerJoin(vouchers, eq(ledgerPostings.voucherId, vouchers.id))
      .innerJoin(voucherTypes, eq(vouchers.voucherTypeId, voucherTypes.id))
      .where(
        and(
          eq(ledgerPostings.tenantId, tenantId),
          eq(ledgerPostings.accountId, accountId),
          gte(ledgerPostings.postingDate, startDate),
          lte(ledgerPostings.postingDate, endDate)
        )
      )
      .orderBy(asc(ledgerPostings.postingDate), asc(ledgerPostings.createdAt));

    let runningBalance = openingBalance;
    const entries: CashBankEntry[] = rows.map((row) => {
      const debit = parseFloat(row.debitAmount || "0");
      const credit = parseFloat(row.creditAmount || "0");
      runningBalance += debit - credit;
      return {
        id: row.id,
        postingDate: row.postingDate,
        voucherNumber: row.voucherNumber,
        voucherType: row.voucherType,
        narration: row.narration,
        debitAmount: row.debitAmount,
        creditAmount: row.creditAmount,
        runningBalance: Math.round(runningBalance * 100) / 100,
      };
    });

    return { openingBalance: Math.round(openingBalance * 100) / 100, entries };
  } catch (error) {
    console.error("Error in getCashBankBook:", error);
    throw error;
  }
}

export const financialReportingStorage = {
  /**
   * Get all financial statement templates
   */
  async getAllTemplates(tenantId: number, activeOnly: boolean = false): Promise<FinancialStatementTemplate[]> {
    try {
      const conditions: any[] = [eq(financialStatementTemplates.tenantId, tenantId)];
      
      if (activeOnly) {
        conditions.push(eq(financialStatementTemplates.isActive, true));
      }
      
      return await db.select().from(financialStatementTemplates)
        .where(and(...conditions))
        .orderBy(financialStatementTemplates.name);
    } catch (error) {
      console.error("Error in getAllTemplates:", error);
      throw error;
    }
  },

  /**
   * Get a financial statement template by ID
   */
  async getTemplateById(id: number, tenantId: number): Promise<FinancialStatementTemplate | undefined> {
    try {
      const [template] = await db
        .select()
        .from(financialStatementTemplates)
        .where(and(
          eq(financialStatementTemplates.id, id),
          eq(financialStatementTemplates.tenantId, tenantId)
        ));
      
      return template;
    } catch (error) {
      console.error("Error in getTemplateById:", error);
      throw error;
    }
  },

  /**
   * Get the default template for a specific type (Balance Sheet, Income Statement, etc.)
   */
  async getDefaultTemplate(type: string, tenantId: number): Promise<FinancialStatementTemplate | undefined> {
    try {
      const [template] = await db
        .select()
        .from(financialStatementTemplates)
        .where(and(
          eq(financialStatementTemplates.type, type),
          eq(financialStatementTemplates.tenantId, tenantId),
          eq(financialStatementTemplates.isDefault, true),
          eq(financialStatementTemplates.isActive, true)
        ));
      
      return template;
    } catch (error) {
      console.error("Error in getDefaultTemplate:", error);
      throw error;
    }
  },

  /**
   * Create a new financial statement template
   */
  async createTemplate(template: any): Promise<FinancialStatementTemplate> {
    try {
      const [newTemplate] = await db
        .insert(financialStatementTemplates)
        .values(template)
        .returning();
      
      return newTemplate;
    } catch (error) {
      console.error("Error in createTemplate:", error);
      throw error;
    }
  },

  /**
   * Update a financial statement template
   */
  async updateTemplate(id: number, tenantId: number, data: any): Promise<FinancialStatementTemplate> {
    try {
      const [updatedTemplate] = await db
        .update(financialStatementTemplates)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(financialStatementTemplates.id, id),
          eq(financialStatementTemplates.tenantId, tenantId)
        ))
        .returning();
      
      return updatedTemplate;
    } catch (error) {
      console.error("Error in updateTemplate:", error);
      throw error;
    }
  },

  /**
   * Delete a financial statement template
   */
  async deleteTemplate(id: number, tenantId: number): Promise<boolean> {
    try {
      // Start a transaction to delete template and all associated sections
      return await db.transaction(async (tx) => {
        // First get all sections to delete their accounts
        const sections = await tx
          .select()
          .from(financialStatementSections)
          .where(and(
            eq(financialStatementSections.templateId, id),
            eq(financialStatementSections.tenantId, tenantId)
          ));
        
        // Delete section accounts
        for (const section of sections) {
          await tx
            .delete(financialStatementSectionAccounts)
            .where(and(
              eq(financialStatementSectionAccounts.sectionId, section.id),
              eq(financialStatementSectionAccounts.tenantId, tenantId)
            ));
        }
        
        // Delete sections
        await tx
          .delete(financialStatementSections)
          .where(and(
            eq(financialStatementSections.templateId, id),
            eq(financialStatementSections.tenantId, tenantId)
          ));
        
        // Delete template
        const [deleted] = await tx
          .delete(financialStatementTemplates)
          .where(and(
            eq(financialStatementTemplates.id, id),
            eq(financialStatementTemplates.tenantId, tenantId)
          ))
          .returning();
        
        return !!deleted;
      });
    } catch (error) {
      console.error("Error in deleteTemplate:", error);
      throw error;
    }
  },

  /**
   * Get all sections for a template
   */
  async getTemplateSections(templateId: number, tenantId: number): Promise<FinancialStatementSection[]> {
    try {
      return await db
        .select()
        .from(financialStatementSections)
        .where(and(
          eq(financialStatementSections.templateId, templateId),
          eq(financialStatementSections.tenantId, tenantId)
        ))
        .orderBy(asc(financialStatementSections.displayOrder));
    } catch (error) {
      console.error("Error in getTemplateSections:", error);
      throw error;
    }
  },

  /**
   * Get a section by ID
   */
  async getSectionById(id: number, tenantId: number): Promise<FinancialStatementSection | undefined> {
    try {
      const [section] = await db
        .select()
        .from(financialStatementSections)
        .where(and(
          eq(financialStatementSections.id, id),
          eq(financialStatementSections.tenantId, tenantId)
        ));
      
      return section;
    } catch (error) {
      console.error("Error in getSectionById:", error);
      throw error;
    }
  },

  /**
   * Create a new section
   */
  async createSection(section: any): Promise<FinancialStatementSection> {
    try {
      const [newSection] = await db
        .insert(financialStatementSections)
        .values(section)
        .returning();
      
      return newSection;
    } catch (error) {
      console.error("Error in createSection:", error);
      throw error;
    }
  },

  /**
   * Update a section
   */
  async updateSection(id: number, tenantId: number, data: any): Promise<FinancialStatementSection> {
    try {
      const [updatedSection] = await db
        .update(financialStatementSections)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(financialStatementSections.id, id),
          eq(financialStatementSections.tenantId, tenantId)
        ))
        .returning();
      
      return updatedSection;
    } catch (error) {
      console.error("Error in updateSection:", error);
      throw error;
    }
  },

  /**
   * Delete a section
   */
  async deleteSection(id: number, tenantId: number): Promise<boolean> {
    try {
      return await db.transaction(async (tx) => {
        // First delete section accounts
        await tx
          .delete(financialStatementSectionAccounts)
          .where(and(
            eq(financialStatementSectionAccounts.sectionId, id),
            eq(financialStatementSectionAccounts.tenantId, tenantId)
          ));
        
        // Delete section
        const [deleted] = await tx
          .delete(financialStatementSections)
          .where(and(
            eq(financialStatementSections.id, id),
            eq(financialStatementSections.tenantId, tenantId)
          ))
          .returning();
        
        return !!deleted;
      });
    } catch (error) {
      console.error("Error in deleteSection:", error);
      throw error;
    }
  },

  /**
   * Get all accounts for a section
   */
  async getSectionAccounts(sectionId: number, tenantId: number): Promise<FinancialStatementSectionAccount[]> {
    try {
      return await db
        .select()
        .from(financialStatementSectionAccounts)
        .where(and(
          eq(financialStatementSectionAccounts.sectionId, sectionId),
          eq(financialStatementSectionAccounts.tenantId, tenantId)
        ));
    } catch (error) {
      console.error("Error in getSectionAccounts:", error);
      throw error;
    }
  },

  /**
   * Create a section account mapping
   */
  async createSectionAccount(sectionAccount: any): Promise<FinancialStatementSectionAccount> {
    try {
      const [newSectionAccount] = await db
        .insert(financialStatementSectionAccounts)
        .values(sectionAccount)
        .returning();
      
      return newSectionAccount;
    } catch (error) {
      console.error("Error in createSectionAccount:", error);
      throw error;
    }
  },

  /**
   * Delete a section account mapping
   */
  async deleteSectionAccount(id: number, tenantId: number): Promise<boolean> {
    try {
      const [deleted] = await db
        .delete(financialStatementSectionAccounts)
        .where(and(
          eq(financialStatementSectionAccounts.id, id),
          eq(financialStatementSectionAccounts.tenantId, tenantId)
        ))
        .returning();
      
      return !!deleted;
    } catch (error) {
      console.error("Error in deleteSectionAccount:", error);
      throw error;
    }
  },

  /**
   * Get all financial insights
   */
  async getAllInsights(
    tenantId: number, 
    options: { 
      limit?: number, 
      offset?: number, 
      insightType?: string, 
      fromDate?: string, 
      toDate?: string 
    } = {}
  ): Promise<FinancialInsight[]> {
    try {
      const conditions: any[] = [eq(financialInsights.tenantId, tenantId)];
      
      if (options.insightType) {
        conditions.push(eq(financialInsights.insightType, options.insightType));
      }
      
      if (options.fromDate) {
        conditions.push(gte(financialInsights.periodStart, options.fromDate));
      }
      
      if (options.toDate) {
        conditions.push(lte(financialInsights.periodEnd, options.toDate));
      }
      
      let query = db.select().from(financialInsights)
        .where(and(...conditions))
        .orderBy(desc(financialInsights.createdAt))
        .$dynamic();
      
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      if (options.offset) {
        query = query.offset(options.offset);
      }
      
      return await query;
    } catch (error) {
      console.error("Error in getAllInsights:", error);
      throw error;
    }
  },

  /**
   * Get a financial insight by ID
   */
  async getInsightById(id: number, tenantId: number): Promise<FinancialInsight | undefined> {
    try {
      const [insight] = await db
        .select()
        .from(financialInsights)
        .where(and(
          eq(financialInsights.id, id),
          eq(financialInsights.tenantId, tenantId)
        ));
      
      return insight;
    } catch (error) {
      console.error("Error in getInsightById:", error);
      throw error;
    }
  },

  /**
   * Create a new financial insight
   */
  async createInsight(insight: any): Promise<FinancialInsight> {
    try {
      const [newInsight] = await db
        .insert(financialInsights)
        .values(insight)
        .returning();
      
      return newInsight;
    } catch (error) {
      console.error("Error in createInsight:", error);
      throw error;
    }
  },

  /**
   * Delete a financial insight
   */
  async deleteInsight(id: number, tenantId: number): Promise<boolean> {
    try {
      const [deleted] = await db
        .delete(financialInsights)
        .where(and(
          eq(financialInsights.id, id),
          eq(financialInsights.tenantId, tenantId)
        ))
        .returning();
      
      return !!deleted;
    } catch (error) {
      console.error("Error in deleteInsight:", error);
      throw error;
    }
  }
};

export interface ArApAgingEntry {
  accountId: number;
  accountName: string;
  accountNumber: string;
  currentAmount: string;
  days31to60: string;
  days61to90: string;
  over90: string;
  total: string;
}

export async function getArApAging(
  tenantId: number,
  type: 'receivable' | 'payable',
  asOfDate: string
): Promise<ArApAgingEntry[]> {
  try {
    const typeFilter = type === 'receivable'
      ? sql`(ag.name ILIKE '%debtors%' OR ag.name ILIKE '%receivable%' OR at.name = 'Asset')`
      : sql`(ag.name ILIKE '%creditors%' OR ag.name ILIKE '%payable%' OR at.name = 'Liability')`;

    const agingFilter = type === 'receivable'
      ? sql`(ag.name ILIKE '%debtors%' OR ag.name ILIKE '%receivable%')`
      : sql`(ag.name ILIKE '%creditors%' OR ag.name ILIKE '%payable%')`;

    const result = await db.execute(sql`
      WITH account_balances AS (
        SELECT 
          lp.account_id,
          coa.name as account_name,
          coa.account_number,
          SUM(CASE WHEN (${asOfDate}::date - v.voucher_date::date) BETWEEN 0 AND 30 
              THEN COALESCE(lp.debit_amount, 0) - COALESCE(lp.credit_amount, 0) ELSE 0 END) as current_amount,
          SUM(CASE WHEN (${asOfDate}::date - v.voucher_date::date) BETWEEN 31 AND 60 
              THEN COALESCE(lp.debit_amount, 0) - COALESCE(lp.credit_amount, 0) ELSE 0 END) as days_31_60,
          SUM(CASE WHEN (${asOfDate}::date - v.voucher_date::date) BETWEEN 61 AND 90 
              THEN COALESCE(lp.debit_amount, 0) - COALESCE(lp.credit_amount, 0) ELSE 0 END) as days_61_90,
          SUM(CASE WHEN (${asOfDate}::date - v.voucher_date::date) > 90 
              THEN COALESCE(lp.debit_amount, 0) - COALESCE(lp.credit_amount, 0) ELSE 0 END) as over_90,
          SUM(COALESCE(lp.debit_amount, 0) - COALESCE(lp.credit_amount, 0)) as total
        FROM ledger_postings lp
        JOIN chart_of_accounts coa ON lp.account_id = coa.id
        JOIN vouchers v ON lp.voucher_id = v.id
        LEFT JOIN account_groups ag ON coa.group_id = ag.id
        LEFT JOIN account_types at ON coa.account_type_id = at.id
        WHERE lp.tenant_id = ${tenantId}
          AND v.voucher_date <= ${asOfDate}::date
          AND ${agingFilter}
        GROUP BY lp.account_id, coa.name, coa.account_number
        HAVING SUM(COALESCE(lp.debit_amount, 0) - COALESCE(lp.credit_amount, 0)) != 0
      )
      SELECT * FROM account_balances ORDER BY total DESC
    `);

    const rows = (result as any).rows || result || [];
    return rows.map((row: any) => ({
      accountId: row.account_id,
      accountName: row.account_name,
      accountNumber: row.account_number,
      currentAmount: String(row.current_amount || '0'),
      days31to60: String(row.days_31_60 || '0'),
      days61to90: String(row.days_61_90 || '0'),
      over90: String(row.over_90 || '0'),
      total: String(row.total || '0'),
    }));
  } catch (error) {
    console.error("Error in getArApAging:", error);
    throw error;
  }
}

export async function getOpeningBalancesByFiscalYear(
  tenantId: number,
  fiscalYearId: number
) {
  try {
    return await db
      .select({
        id: ledgerOpeningBalances.id,
        tenantId: ledgerOpeningBalances.tenantId,
        accountId: ledgerOpeningBalances.accountId,
        fiscalYearId: ledgerOpeningBalances.fiscalYearId,
        openingDebit: ledgerOpeningBalances.openingDebit,
        openingCredit: ledgerOpeningBalances.openingCredit,
        notes: ledgerOpeningBalances.notes,
        createdAt: ledgerOpeningBalances.createdAt,
        updatedAt: ledgerOpeningBalances.updatedAt,
        accountNumber: chartOfAccounts.accountNumber,
        accountName: chartOfAccounts.name,
      })
      .from(ledgerOpeningBalances)
      .innerJoin(chartOfAccounts, eq(ledgerOpeningBalances.accountId, chartOfAccounts.id))
      .where(
        and(
          eq(ledgerOpeningBalances.tenantId, tenantId),
          eq(ledgerOpeningBalances.fiscalYearId, fiscalYearId)
        )
      )
      .orderBy(asc(chartOfAccounts.accountNumber));
  } catch (error) {
    console.error("Error in getOpeningBalancesByFiscalYear:", error);
    throw error;
  }
}

export async function upsertOpeningBalance(data: {
  tenantId: number;
  accountId: number;
  fiscalYearId: number;
  openingDebit: string;
  openingCredit: string;
  notes?: string;
}) {
  try {
    const [existing] = await db
      .select()
      .from(ledgerOpeningBalances)
      .where(
        and(
          eq(ledgerOpeningBalances.tenantId, data.tenantId),
          eq(ledgerOpeningBalances.accountId, data.accountId),
          eq(ledgerOpeningBalances.fiscalYearId, data.fiscalYearId)
        )
      );

    if (existing) {
      const [updated] = await db
        .update(ledgerOpeningBalances)
        .set({
          openingDebit: data.openingDebit,
          openingCredit: data.openingCredit,
          notes: data.notes,
          updatedAt: new Date(),
        })
        .where(eq(ledgerOpeningBalances.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(ledgerOpeningBalances)
        .values({
          tenantId: data.tenantId,
          accountId: data.accountId,
          fiscalYearId: data.fiscalYearId,
          openingDebit: data.openingDebit,
          openingCredit: data.openingCredit,
          notes: data.notes,
        })
        .returning();
      return created;
    }
  } catch (error) {
    console.error("Error in upsertOpeningBalance:", error);
    throw error;
  }
}

export async function deleteOpeningBalance(id: number, tenantId: number): Promise<boolean> {
  try {
    const [deleted] = await db
      .delete(ledgerOpeningBalances)
      .where(
        and(
          eq(ledgerOpeningBalances.id, id),
          eq(ledgerOpeningBalances.tenantId, tenantId)
        )
      )
      .returning();
    return !!deleted;
  } catch (error) {
    console.error("Error in deleteOpeningBalance:", error);
    throw error;
  }
}