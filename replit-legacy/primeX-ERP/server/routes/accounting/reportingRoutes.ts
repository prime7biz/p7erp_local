import { parseIntParam } from "../../utils/parseParams";
import { Router } from "express";
import { requirePermission } from "../../middleware/rbacMiddleware";
import { db } from "../../db";
import { ledgerPostings, chartOfAccounts, vouchers } from "@shared/schema";
import { eq, and, sql, gte, lte, asc } from "drizzle-orm";
import {
  REPORTING_RULES, validateDateRange, validateAsOfDate,
  getAccountMovements, getAccountMovementsAsOf, getGroupsForTenant
} from "../../accounting/reporting/rules";
import { buildGroupTree, GroupNode, computeAccountBalance, classifyCashFlowItem } from "../../accounting/reporting/statementRules";

const router = Router();

router.get("/trial-balance", requirePermission("accounting:reports:read"), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const startDate = req.query.start as string;
    const endDate = req.query.end as string;
    const override = req.query.override === "true";

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "start and end query parameters are required" });
    }

    const validation = validateDateRange(startDate, endDate);
    if (!validation.valid && !override) {
      return res.status(400).json({ error: validation.error });
    }

    const movements = await getAccountMovements(tenantId, startDate, endDate);
    const groups = await getGroupsForTenant(tenantId);

    const rows: Array<{
      accountId: number;
      accountNumber: string;
      accountName: string;
      groupId: number;
      groupName: string;
      groupPath: string;
      openingDr: number;
      openingCr: number;
      periodDr: number;
      periodCr: number;
      closingDr: number;
      closingCr: number;
    }> = [];

    for (const acct of movements) {
      const openingNet = acct.openingDebit - acct.openingCredit;
      const closingNet = openingNet + acct.periodDebit - acct.periodCredit;

      if (acct.periodDebit === 0 && acct.periodCredit === 0 && openingNet === 0) continue;

      rows.push({
        accountId: acct.accountId,
        accountNumber: acct.accountNumber,
        accountName: acct.accountName,
        groupId: acct.groupId,
        groupName: acct.groupName,
        groupPath: acct.groupName,
        openingDr: openingNet > 0 ? Math.round(openingNet * 100) / 100 : 0,
        openingCr: openingNet < 0 ? Math.round(Math.abs(openingNet) * 100) / 100 : 0,
        periodDr: Math.round(acct.periodDebit * 100) / 100,
        periodCr: Math.round(acct.periodCredit * 100) / 100,
        closingDr: closingNet > 0 ? Math.round(closingNet * 100) / 100 : 0,
        closingCr: closingNet < 0 ? Math.round(Math.abs(closingNet) * 100) / 100 : 0,
      });
    }

    const totals = {
      openingDr: Math.round(rows.reduce((s, r) => s + r.openingDr, 0) * 100) / 100,
      openingCr: Math.round(rows.reduce((s, r) => s + r.openingCr, 0) * 100) / 100,
      periodDr: Math.round(rows.reduce((s, r) => s + r.periodDr, 0) * 100) / 100,
      periodCr: Math.round(rows.reduce((s, r) => s + r.periodCr, 0) * 100) / 100,
      closingDr: Math.round(rows.reduce((s, r) => s + r.closingDr, 0) * 100) / 100,
      closingCr: Math.round(rows.reduce((s, r) => s + r.closingCr, 0) * 100) / 100,
    };

    res.json({ startDate, endDate, rows, totals, accountCount: rows.length });
  } catch (error) {
    console.error("Error in trial balance:", error);
    res.status(500).json({ error: "Failed to generate trial balance" });
  }
});

router.get("/ledger/:accountId", requirePermission("accounting:reports:read"), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const accountId = parseIntParam(req.params.accountId, "accountId");
    if (isNaN(accountId)) {
      return res.status(400).json({ error: "Invalid account ID" });
    }

    const startDate = req.query.start as string;
    const endDate = req.query.end as string;
    const override = req.query.override === "true";
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || REPORTING_RULES.DEFAULT_PAGE_SIZE, REPORTING_RULES.MAX_PAGE_SIZE);

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "start and end query parameters are required" });
    }

    const validation = validateDateRange(startDate, endDate);
    if (!validation.valid && !override) {
      return res.status(400).json({ error: validation.error });
    }

    const [account] = await db
      .select({ id: chartOfAccounts.id, name: chartOfAccounts.name, accountNumber: chartOfAccounts.accountNumber, normalBalance: chartOfAccounts.normalBalance })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.tenantId, tenantId), eq(chartOfAccounts.id, accountId)));

    if (!account) {
      return res.status(404).json({ error: "Account not found in this tenant" });
    }

    const [openingRow] = await db
      .select({
        totalDebit: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.debitAmount} AS numeric)), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.creditAmount} AS numeric)), 0)`,
      })
      .from(ledgerPostings)
      .innerJoin(vouchers, eq(ledgerPostings.voucherId, vouchers.id))
      .where(
        and(
          eq(ledgerPostings.tenantId, tenantId),
          eq(ledgerPostings.accountId, accountId),
          eq(vouchers.isPosted, true),
          sql`${ledgerPostings.postingDate} < ${startDate}`
        )
      );

    const openingDebit = parseFloat(openingRow?.totalDebit || "0");
    const openingCredit = parseFloat(openingRow?.totalCredit || "0");
    const openingNet = openingDebit - openingCredit;
    const opening = {
      debit: Math.round(openingDebit * 100) / 100,
      credit: Math.round(openingCredit * 100) / 100,
      balance: Math.round(Math.abs(openingNet) * 100) / 100,
      balanceType: openingNet >= 0 ? "Dr" as const : "Cr" as const,
    };

    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(ledgerPostings)
      .innerJoin(vouchers, eq(ledgerPostings.voucherId, vouchers.id))
      .where(
        and(
          eq(ledgerPostings.tenantId, tenantId),
          eq(ledgerPostings.accountId, accountId),
          eq(vouchers.isPosted, true),
          gte(ledgerPostings.postingDate, startDate),
          lte(ledgerPostings.postingDate, endDate)
        )
      );
    const totalEntries = Number(countRow?.count || 0);
    const totalPages = Math.ceil(totalEntries / pageSize);
    const offset = (page - 1) * pageSize;

    const rows = await db
      .select({
        id: ledgerPostings.id,
        postingDate: ledgerPostings.postingDate,
        voucherId: ledgerPostings.voucherId,
        voucherNumber: vouchers.voucherNumber,
        narration: ledgerPostings.narration,
        debitAmount: ledgerPostings.debitAmount,
        creditAmount: ledgerPostings.creditAmount,
      })
      .from(ledgerPostings)
      .innerJoin(vouchers, eq(ledgerPostings.voucherId, vouchers.id))
      .where(
        and(
          eq(ledgerPostings.tenantId, tenantId),
          eq(ledgerPostings.accountId, accountId),
          eq(vouchers.isPosted, true),
          gte(ledgerPostings.postingDate, startDate),
          lte(ledgerPostings.postingDate, endDate)
        )
      )
      .orderBy(asc(ledgerPostings.postingDate), asc(ledgerPostings.createdAt))
      .limit(pageSize)
      .offset(offset);

    let runningBalance = openingNet;
    if (page > 1) {
      const allPrior = await db
        .select({
          totalDebit: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.debitAmount} AS numeric)), 0)`,
          totalCredit: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.creditAmount} AS numeric)), 0)`,
        })
        .from(ledgerPostings)
        .innerJoin(vouchers, eq(ledgerPostings.voucherId, vouchers.id))
        .where(
          and(
            eq(ledgerPostings.tenantId, tenantId),
            eq(ledgerPostings.accountId, accountId),
            eq(vouchers.isPosted, true),
            gte(ledgerPostings.postingDate, startDate),
            lte(ledgerPostings.postingDate, endDate)
          )
        );
    }

    const entries = rows.map((row) => {
      const debit = parseFloat(row.debitAmount || "0");
      const credit = parseFloat(row.creditAmount || "0");
      runningBalance += debit - credit;
      const absBalance = Math.round(Math.abs(runningBalance) * 100) / 100;
      return {
        date: row.postingDate,
        voucherId: row.voucherId,
        voucherNo: row.voucherNumber,
        narration: row.narration,
        debit: Math.round(debit * 100) / 100,
        credit: Math.round(credit * 100) / 100,
        runningBalance: absBalance,
        runningBalanceType: runningBalance >= 0 ? "Dr" as const : "Cr" as const,
      };
    });

    const [closingRow] = await db
      .select({
        totalDebit: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.debitAmount} AS numeric)), 0)`,
        totalCredit: sql<string>`COALESCE(SUM(CAST(${ledgerPostings.creditAmount} AS numeric)), 0)`,
      })
      .from(ledgerPostings)
      .where(
        and(
          eq(ledgerPostings.tenantId, tenantId),
          eq(ledgerPostings.accountId, accountId),
          gte(ledgerPostings.postingDate, startDate),
          lte(ledgerPostings.postingDate, endDate)
        )
      );

    const periodDebit = parseFloat(closingRow?.totalDebit || "0");
    const periodCredit = parseFloat(closingRow?.totalCredit || "0");
    const closingNet = openingNet + periodDebit - periodCredit;
    const closing = {
      debit: Math.round((openingDebit + periodDebit) * 100) / 100,
      credit: Math.round((openingCredit + periodCredit) * 100) / 100,
      balance: Math.round(Math.abs(closingNet) * 100) / 100,
      balanceType: closingNet >= 0 ? "Dr" as const : "Cr" as const,
    };

    res.json({
      accountId: account.id,
      accountName: account.name,
      accountNumber: account.accountNumber,
      startDate,
      endDate,
      opening,
      entries,
      closing,
      pagination: { page, pageSize, totalEntries, totalPages },
    });
  } catch (error) {
    console.error("Error in ledger report:", error);
    res.status(500).json({ error: "Failed to generate ledger report" });
  }
});

router.get("/profit-loss", requirePermission("accounting:reports:read"), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const startDate = req.query.start as string;
    const endDate = req.query.end as string;
    const override = req.query.override === "true";

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "start and end query parameters are required" });
    }
    const validation = validateDateRange(startDate, endDate);
    if (!validation.valid && !override) {
      return res.status(400).json({ error: validation.error });
    }

    const movements = await getAccountMovements(tenantId, startDate, endDate);
    const groups = await getGroupsForTenant(tenantId, ["Income", "Expense"]);

    const incomeGroups = groups.filter(g => g.nature === "Income");
    const expenseGroups = groups.filter(g => g.nature === "Expense");

    const incomeAccountsByGroup = new Map<number, GroupNode["accounts"]>();
    const expenseAccountsByGroup = new Map<number, GroupNode["accounts"]>();

    for (const acct of movements) {
      if (acct.groupNature !== "Income" && acct.groupNature !== "Expense") continue;

      const balance = computeAccountBalance(acct, "period");
      if (balance === 0) continue;

      const entry = {
        accountId: acct.accountId,
        accountName: acct.accountName,
        accountNumber: acct.accountNumber,
        debit: Math.round(acct.periodDebit * 100) / 100,
        credit: Math.round(acct.periodCredit * 100) / 100,
        balance,
      };

      const map = acct.groupNature === "Income" ? incomeAccountsByGroup : expenseAccountsByGroup;
      const existing = map.get(acct.groupId) || [];
      existing.push(entry);
      map.set(acct.groupId, existing);
    }

    const income = buildGroupTree(incomeGroups, incomeAccountsByGroup, null, 0);
    const expenses = buildGroupTree(expenseGroups, expenseAccountsByGroup, null, 0);

    const totalIncome = Math.round(income.reduce((s, n) => s + n.total, 0) * 100) / 100;
    const totalExpenses = Math.round(expenses.reduce((s, n) => s + n.total, 0) * 100) / 100;
    const netProfit = Math.round((totalIncome - totalExpenses) * 100) / 100;

    res.json({
      startDate,
      endDate,
      income: { total: totalIncome, groups: income },
      expenses: { total: totalExpenses, groups: expenses },
      netProfit,
    });
  } catch (error) {
    console.error("Error in profit & loss:", error);
    res.status(500).json({ error: "Failed to generate profit & loss report" });
  }
});

router.get("/balance-sheet", requirePermission("accounting:reports:read"), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const asOfDate = (req.query.asOf as string) || new Date().toISOString().split("T")[0];

    const validation = validateAsOfDate(asOfDate);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const movements = await getAccountMovementsAsOf(tenantId, asOfDate);
    const groups = await getGroupsForTenant(tenantId, ["Asset", "Liability", "Equity"]);

    const assetGroups = groups.filter(g => g.nature === "Asset");
    const liabilityGroups = groups.filter(g => g.nature === "Liability");
    const equityGroups = groups.filter(g => g.nature === "Equity");

    const assetAccountsByGroup = new Map<number, GroupNode["accounts"]>();
    const liabilityAccountsByGroup = new Map<number, GroupNode["accounts"]>();
    const equityAccountsByGroup = new Map<number, GroupNode["accounts"]>();

    for (const acct of movements) {
      if (!["Asset", "Liability", "Equity"].includes(acct.groupNature)) continue;

      let balance: number;
      if (acct.groupNature === "Asset") {
        balance = Math.round((acct.periodDebit - acct.periodCredit) * 100) / 100;
      } else {
        balance = Math.round((acct.periodCredit - acct.periodDebit) * 100) / 100;
      }
      if (balance === 0) continue;

      const entry = {
        accountId: acct.accountId,
        accountName: acct.accountName,
        accountNumber: acct.accountNumber,
        debit: Math.round(acct.periodDebit * 100) / 100,
        credit: Math.round(acct.periodCredit * 100) / 100,
        balance,
      };

      if (acct.groupNature === "Asset") {
        const existing = assetAccountsByGroup.get(acct.groupId) || [];
        existing.push(entry);
        assetAccountsByGroup.set(acct.groupId, existing);
      } else if (acct.groupNature === "Liability") {
        const existing = liabilityAccountsByGroup.get(acct.groupId) || [];
        existing.push(entry);
        liabilityAccountsByGroup.set(acct.groupId, existing);
      } else {
        const existing = equityAccountsByGroup.get(acct.groupId) || [];
        existing.push(entry);
        equityAccountsByGroup.set(acct.groupId, existing);
      }
    }

    const assets = buildGroupTree(assetGroups, assetAccountsByGroup, null, 0);
    const liabilities = buildGroupTree(liabilityGroups, liabilityAccountsByGroup, null, 0);
    const equity = buildGroupTree(equityGroups, equityAccountsByGroup, null, 0);

    const totalAssets = Math.round(assets.reduce((s, n) => s + n.total, 0) * 100) / 100;
    const totalLiabilities = Math.round(liabilities.reduce((s, n) => s + n.total, 0) * 100) / 100;
    const totalEquity = Math.round(equity.reduce((s, n) => s + n.total, 0) * 100) / 100;
    const diff = Math.round((totalAssets - totalLiabilities - totalEquity) * 100) / 100;

    res.json({
      asOfDate,
      assets: { total: totalAssets, groups: assets },
      liabilities: { total: totalLiabilities, groups: liabilities },
      equity: { total: totalEquity, groups: equity },
      checks: { assetsEqLiabPlusEquityDiff: diff },
    });
  } catch (error) {
    console.error("Error in balance sheet:", error);
    res.status(500).json({ error: "Failed to generate balance sheet" });
  }
});

router.get("/cash-flow", requirePermission("accounting:reports:read"), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const startDate = req.query.start as string;
    const endDate = req.query.end as string;
    const override = req.query.override === "true";

    if (!startDate || !endDate) {
      return res.status(400).json({ error: "start and end query parameters are required" });
    }
    const validation = validateDateRange(startDate, endDate);
    if (!validation.valid && !override) {
      return res.status(400).json({ error: validation.error });
    }

    const movements = await getAccountMovements(tenantId, startDate, endDate);
    const allGroups = await getGroupsForTenant(tenantId);

    const groupMap = new Map<number, any>();
    for (const g of allGroups) groupMap.set(g.id, g);

    const getGroupPath = (groupId: number): string => {
      const parts: string[] = [];
      let current = groupMap.get(groupId);
      while (current) {
        parts.unshift(current.name);
        current = current.parentGroupId ? groupMap.get(current.parentGroupId) : null;
      }
      return parts.join(" > ");
    };

    let netProfit = 0;
    for (const acct of movements) {
      if (acct.groupNature === "Income") {
        netProfit += acct.periodCredit - acct.periodDebit;
      } else if (acct.groupNature === "Expense") {
        netProfit -= acct.periodDebit - acct.periodCredit;
      }
    }
    netProfit = Math.round(netProfit * 100) / 100;

    const operating: Array<{ accountId: number; accountName: string; groupPath: string; amount: number }> = [];
    const investing: typeof operating = [];
    const financing: typeof operating = [];
    const nonCashAdjustments: typeof operating = [];

    for (const acct of movements) {
      if (acct.groupNature !== "Asset" && acct.groupNature !== "Liability" && acct.groupNature !== "Equity") continue;

      const periodMovement = acct.periodDebit - acct.periodCredit;
      if (periodMovement === 0) continue;

      const groupPath = getGroupPath(acct.groupId);
      const category = classifyCashFlowItem(groupPath, acct.groupNature);

      let cashImpact: number;
      if (acct.groupNature === "Asset") {
        cashImpact = -(periodMovement);
      } else {
        cashImpact = acct.periodCredit - acct.periodDebit;
      }
      cashImpact = Math.round(cashImpact * 100) / 100;

      const lowerName = acct.accountName.toLowerCase();
      if (lowerName.includes("cash") || lowerName.includes("bank") || lowerName.includes("petty cash")) continue;

      const item = { accountId: acct.accountId, accountName: acct.accountName, groupPath, amount: cashImpact };

      if (category === "investing") {
        investing.push(item);
      } else if (category === "financing") {
        financing.push(item);
      } else {
        const lowerGroupPath = groupPath.toLowerCase();
        if (lowerGroupPath.includes("depreciation") || lowerGroupPath.includes("amortization") || lowerGroupPath.includes("provision")) {
          nonCashAdjustments.push(item);
        } else {
          operating.push(item);
        }
      }
    }

    const totalNonCashAdj = Math.round(nonCashAdjustments.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    const totalOperatingWC = Math.round(operating.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    const totalOperating = Math.round((netProfit + totalNonCashAdj + totalOperatingWC) * 100) / 100;
    const totalInvesting = Math.round(investing.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    const totalFinancing = Math.round(financing.reduce((s, i) => s + i.amount, 0) * 100) / 100;
    const netCashFlow = Math.round((totalOperating + totalInvesting + totalFinancing) * 100) / 100;

    res.json({
      startDate,
      endDate,
      method: "indirect",
      operating: {
        description: "Cash Flow from Operating Activities",
        netProfit,
        nonCashAdjustments: { items: nonCashAdjustments, total: totalNonCashAdj },
        workingCapitalChanges: { items: operating, total: totalOperatingWC },
        total: totalOperating,
      },
      investing: {
        description: "Cash Flow from Investing Activities",
        items: investing,
        total: totalInvesting,
      },
      financing: {
        description: "Cash Flow from Financing Activities",
        items: financing,
        total: totalFinancing,
      },
      netCashFlow,
    });
  } catch (error) {
    console.error("Error in cash flow:", error);
    res.status(500).json({ error: "Failed to generate cash flow statement" });
  }
});

export default router;
