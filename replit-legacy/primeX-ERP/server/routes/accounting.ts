import { parseIntParam } from "../utils/parseParams";
import { Router } from "express";
import { accountTypeStorage } from "../database/accounting/accountTypeStorage";
import { accountGroupStorage } from "../database/accounting/accountGroupStorage";
import { chartOfAccountsStorage } from "../database/accounting/chartOfAccountsStorage";
import { fiscalYearStorage } from "../database/accounting/fiscalYearStorage";
import { journalStorage } from "../database/accounting/journalStorage";
import { financialReportingStorage } from "../database/accounting/financialReportingStorage";
import { db } from "../db";
import { chartOfAccounts, bankAccounts, accountGroups } from "@shared/schema";
import { sql, eq, and } from "drizzle-orm";
import {
  getDayBook,
  getLedgerReport,
  getTrialBalance,
  getProfitAndLoss,
  getBalanceSheet,
  getCashBankBook,
  getOpeningBalancesByFiscalYear,
  upsertOpeningBalance,
  deleteOpeningBalance,
  getArApAging,
} from "../database/accounting/financialReportingStorage";
import { isAuthenticated } from "../middleware/auth";
import { postingBridge } from "../services/postingBridge";
import { insertPostingProfileSchema, insertPostingProfileLineSchema, voucherTypes } from "@shared/schema";
import { createVoucherType, getAllVoucherTypes } from "../database/accounting/voucherStorage";

async function syncBankAccountFromLedger(ledger: any, tenantId: number) {
  const details = (ledger.bankAccountDetails || {}) as Record<string, any>;
  const existing = await db.select().from(bankAccounts)
    .where(and(eq(bankAccounts.glAccountId, ledger.id), eq(bankAccounts.tenantId, tenantId)));

  if (existing.length > 0) {
    await db.update(bankAccounts)
      .set({
        accountName: ledger.name,
        bankName: details.bankName || ledger.name,
        accountNumber: details.accountNumber || null,
        branchName: details.branch || null,
        swiftCode: details.swiftCode || null,
        routingNumber: details.routingNumber || null,
        currency: ledger.accountCurrencyCode || "BDT",
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(bankAccounts.id, existing[0].id));
  } else {
    await db.insert(bankAccounts).values({
      tenantId,
      accountName: ledger.name,
      bankName: details.bankName || ledger.name,
      accountNumber: details.accountNumber || null,
      branchName: details.branch || null,
      swiftCode: details.swiftCode || null,
      routingNumber: details.routingNumber || null,
      currency: ledger.accountCurrencyCode || "BDT",
      glAccountId: ledger.id,
      isActive: true,
      openingBalance: ledger.openingBalance || "0",
      currentBalance: ledger.balance || "0",
    });
  }
}

async function deactivateBankAccountForLedger(ledgerId: number, tenantId: number) {
  await db.update(bankAccounts)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(bankAccounts.glAccountId, ledgerId), eq(bankAccounts.tenantId, tenantId)));
}

const router = Router();

// All routes require authentication
router.use(isAuthenticated);

// Account Types routes
router.get("/account-types", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const accountTypes = await accountTypeStorage.getAllAccountTypes(tenantId);
    res.json(accountTypes);
  } catch (error) {
    console.error("Error fetching account types:", error);
    res.status(500).json({ message: "Failed to fetch account types" });
  }
});

router.post("/account-types", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const accountType = await accountTypeStorage.createAccountType({
      ...req.body,
      tenantId,
    });
    res.status(201).json(accountType);
  } catch (error) {
    console.error("Error creating account type:", error);
    res.status(500).json({ message: "Failed to create account type" });
  }
});

router.get("/account-types/:id", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const accountType = await accountTypeStorage.getAccountTypeById(id, tenantId);
    
    if (!accountType) {
      return res.status(404).json({ message: "Account type not found" });
    }
    
    res.json(accountType);
  } catch (error) {
    console.error("Error fetching account type:", error);
    res.status(500).json({ message: "Failed to fetch account type" });
  }
});

router.put("/account-types/:id", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const updatedAccountType = await accountTypeStorage.updateAccountType(id, tenantId, req.body);
    
    if (!updatedAccountType) {
      return res.status(404).json({ message: "Account type not found" });
    }
    
    res.json(updatedAccountType);
  } catch (error) {
    console.error("Error updating account type:", error);
    res.status(500).json({ message: "Failed to update account type" });
  }
});

router.delete("/account-types/:id", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const success = await accountTypeStorage.deleteAccountType(id, tenantId);
    
    if (!success) {
      return res.status(404).json({ message: "Account type not found" });
    }
    
    res.json({ message: "Account type deleted successfully" });
  } catch (error) {
    console.error("Error deleting account type:", error);
    res.status(500).json({ message: "Failed to delete account type" });
  }
});

// Chart of Accounts routes
router.get("/chart-of-accounts", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const showInactive = req.query.showInactive === 'true';
    const accounts = await chartOfAccountsStorage.getAllAccounts(tenantId, !showInactive);
    res.json(accounts);
  } catch (error) {
    console.error("Error fetching chart of accounts:", error);
    res.status(500).json({ message: "Failed to fetch chart of accounts" });
  }
});

function sanitizeAccountData(data: any) {
  if (data.yearlyInterestRate === "" || data.yearlyInterestRate === undefined) {
    data.yearlyInterestRate = null;
  }
  if (data.supplierCreditLimit === "" || data.supplierCreditLimit === undefined) {
    data.supplierCreditLimit = null;
  }
  if (data.openingBalance === "") {
    data.openingBalance = "0";
  }
  return data;
}

router.post("/chart-of-accounts", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { groupId, accountTypeId: _ignored, ...rest } = req.body;
    sanitizeAccountData(rest);

    if (!groupId) {
      return res.status(400).json({ message: "groupId is required" });
    }

    const group = await accountGroupStorage.getAccountGroupById(groupId, tenantId);
    if (!group) {
      return res.status(404).json({ message: "Account group not found" });
    }

    const natureToCode: Record<string, string> = {
      "Asset": "ASSET",
      "Liability": "LIAB",
      "Equity": "EQTY",
      "Income": "REV",
      "Expense": "EXP",
    };
    const typeCode = natureToCode[group.nature];
    if (!typeCode) {
      return res.status(400).json({ message: `Unknown group nature: ${group.nature}` });
    }

    const accountType = await accountTypeStorage.getAccountTypeByCode(typeCode, tenantId);
    if (!accountType) {
      return res.status(400).json({ message: `Account type with code "${typeCode}" not found for this tenant` });
    }

    const account = await chartOfAccountsStorage.createAccount({
      ...rest,
      groupId,
      accountTypeId: accountType.id,
      tenantId,
    });

    if (account.isBankAccount) {
      await syncBankAccountFromLedger(account, tenantId);
    }

    res.status(201).json(account);
  } catch (error) {
    console.error("Error creating account:", error);
    res.status(500).json({ message: "Failed to create account" });
  }
});

router.get("/chart-of-accounts/next-account-number", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const result = await db.execute(
      sql`SELECT MAX(CAST(account_number AS INTEGER)) as max_num FROM chart_of_accounts WHERE tenant_id = ${tenantId} AND account_number ~ '^[0-9]+$'`
    );
    const maxNum = result.rows?.[0]?.max_num;
    const nextNumber = maxNum ? (parseInt(String(maxNum)) + 10).toString() : "1000";
    res.json({ nextAccountNumber: nextNumber });
  } catch (error) {
    console.error("Error fetching next account number:", error);
    res.status(500).json({ message: "Failed to fetch next account number" });
  }
});

router.get("/chart-of-accounts/material-suppliers", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const suppliers = await chartOfAccountsStorage.getMaterialSuppliers(tenantId);
    const result = suppliers.map(s => ({
      id: s.id,
      name: s.name,
      accountNumber: s.accountNumber,
      supplierContactPerson: s.supplierContactPerson,
      supplierPhone: s.supplierPhone,
      supplierEmail: s.supplierEmail,
      supplierAddress: s.supplierAddress,
      supplierCity: s.supplierCity,
      supplierCountry: s.supplierCountry,
      supplierTaxId: s.supplierTaxId,
      supplierPaymentTerms: s.supplierPaymentTerms,
      supplierCreditLimit: s.supplierCreditLimit,
      balance: s.balance,
      groupId: s.groupId,
    }));
    res.json(result);
  } catch (error) {
    console.error("Error fetching material suppliers:", error);
    res.status(500).json({ message: "Failed to fetch material suppliers" });
  }
});

router.get("/chart-of-accounts/bank-ledgers", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const ledgers = await db.select().from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.tenantId, tenantId),
        eq(chartOfAccounts.isBankAccount, true),
        eq(chartOfAccounts.isActive, true)
      ));

    const linked = await db.select({ glAccountId: bankAccounts.glAccountId })
      .from(bankAccounts)
      .where(and(
        eq(bankAccounts.tenantId, tenantId),
        eq(bankAccounts.isActive, true)
      ));
    const linkedIds = new Set(linked.map(l => l.glAccountId));

    const result = ledgers.map(l => ({
      ...l,
      isLinkedToBanking: linkedIds.has(l.id),
    }));
    res.json(result);
  } catch (error) {
    console.error("Error fetching bank ledgers:", error);
    res.status(500).json({ message: "Failed to fetch bank ledgers" });
  }
});

router.get("/chart-of-accounts/:id", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const account = await chartOfAccountsStorage.getAccountById(id, tenantId);
    
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }
    
    res.json(account);
  } catch (error) {
    console.error("Error fetching account:", error);
    res.status(500).json({ message: "Failed to fetch account" });
  }
});

router.put("/chart-of-accounts/:id", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const { accountTypeId: _ignored, ...rest } = req.body;
    sanitizeAccountData(rest);

    let updateData: any = { ...rest };

    if (rest.groupId) {
      const group = await accountGroupStorage.getAccountGroupById(rest.groupId, tenantId);
      if (!group) {
        return res.status(404).json({ message: "Account group not found" });
      }

      const natureToCode: Record<string, string> = {
        "Asset": "ASSET",
        "Liability": "LIAB",
        "Equity": "EQTY",
        "Income": "REV",
        "Expense": "EXP",
      };
      const typeCode = natureToCode[group.nature];
      if (!typeCode) {
        return res.status(400).json({ message: `Unknown group nature: ${group.nature}` });
      }

      const accountType = await accountTypeStorage.getAccountTypeByCode(typeCode, tenantId);
      if (!accountType) {
        return res.status(400).json({ message: `Account type with code "${typeCode}" not found for this tenant` });
      }

      updateData.accountTypeId = accountType.id;
    }

    const updatedAccount = await chartOfAccountsStorage.updateAccount(id, tenantId, updateData);
    
    if (!updatedAccount) {
      return res.status(404).json({ message: "Account not found" });
    }

    if (updatedAccount.isBankAccount) {
      await syncBankAccountFromLedger(updatedAccount, tenantId);
    } else {
      await deactivateBankAccountForLedger(id, tenantId);
    }
    
    res.json(updatedAccount);
  } catch (error) {
    console.error("Error updating account:", error);
    res.status(500).json({ message: "Failed to update account" });
  }
});

router.get("/chart-of-accounts/:id/entry-count", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const result = await chartOfAccountsStorage.getAccountEntryCount(id, tenantId);
    res.json(result);
  } catch (error) {
    console.error("Error fetching account entry count:", error);
    res.status(500).json({ message: "Failed to fetch account entry count" });
  }
});

router.delete("/chart-of-accounts/:id", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");

    const { entryCount, details } = await chartOfAccountsStorage.getAccountEntryCount(id, tenantId);
    if (entryCount > 0) {
      const parts: string[] = [];
      if (details.voucherItems > 0) parts.push(`${details.voucherItems} voucher items`);
      if (details.ledgerPostings > 0) parts.push(`${details.ledgerPostings} ledger postings`);
      if (details.openingBalances > 0) parts.push(`${details.openingBalances} opening balances`);
      if (details.journalLines > 0) parts.push(`${details.journalLines} journal lines`);
      if (details.postingProfileLines > 0) parts.push(`${details.postingProfileLines} posting profile lines`);
      if (details.childAccounts > 0) parts.push(`${details.childAccounts} child accounts`);
      return res.status(400).json({
        message: `Cannot delete ledger account. It has ${entryCount} entries across ${parts.join(", ")}. Please delete or move all entries first.`
      });
    }

    const success = await chartOfAccountsStorage.deleteAccount(id, tenantId);
    
    if (!success) {
      return res.status(404).json({ message: "Account not found" });
    }
    
    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ message: "Failed to delete account" });
  }
});

router.get("/chart-of-accounts/by-account-type/:accountTypeId", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const accountTypeId = parseIntParam(req.params.accountTypeId, "accountTypeId");
    const activeOnly = req.query.activeOnly === 'true';
    
    const accounts = await chartOfAccountsStorage.getAccountsByType(accountTypeId, tenantId, activeOnly);
    res.json(accounts);
  } catch (error) {
    console.error("Error fetching accounts by type:", error);
    res.status(500).json({ message: "Failed to fetch accounts by type" });
  }
});

router.get("/chart-of-accounts/root-accounts", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const activeOnly = req.query.activeOnly === 'true';
    
    const accounts = await chartOfAccountsStorage.getRootAccounts(tenantId, activeOnly);
    res.json(accounts);
  } catch (error) {
    console.error("Error fetching root accounts:", error);
    res.status(500).json({ message: "Failed to fetch root accounts" });
  }
});

router.get("/chart-of-accounts/:parentId/children", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const parentId = parseIntParam(req.params.parentId, "parentId");
    const activeOnly = req.query.activeOnly === 'true';
    
    const accounts = await chartOfAccountsStorage.getChildAccounts(parentId, tenantId, activeOnly);
    res.json(accounts);
  } catch (error) {
    console.error("Error fetching child accounts:", error);
    res.status(500).json({ message: "Failed to fetch child accounts" });
  }
});

router.get("/cash-and-bank-accounts", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const accounts = await chartOfAccountsStorage.getCashAndBankAccounts(tenantId);
    res.json(accounts);
  } catch (error) {
    console.error("Error fetching cash and bank accounts:", error);
    res.status(500).json({ message: "Failed to fetch cash and bank accounts" });
  }
});

// Fiscal Years routes
router.get("/fiscal-years", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const fiscalYears = await fiscalYearStorage.getAllFiscalYears(tenantId);
    res.json(fiscalYears);
  } catch (error) {
    console.error("Error fetching fiscal years:", error);
    res.status(500).json({ message: "Failed to fetch fiscal years" });
  }
});

router.get("/fiscal-years/current", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const currentFiscalYear = await fiscalYearStorage.getCurrentFiscalYear(tenantId);
    
    if (!currentFiscalYear) {
      return res.status(404).json({ message: "No active fiscal year found" });
    }
    
    res.json(currentFiscalYear);
  } catch (error) {
    console.error("Error fetching current fiscal year:", error);
    res.status(500).json({ message: "Failed to fetch current fiscal year" });
  }
});

// Fiscal Year Periods routes
router.get("/fiscal-years/:yearId/periods", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const yearId = parseIntParam(req.params.yearId, "yearId");
    const periods = await fiscalYearStorage.getAccountingPeriods(yearId, tenantId);
    res.json(periods);
  } catch (error) {
    console.error("Error fetching accounting periods:", error);
    res.status(500).json({ message: "Failed to fetch accounting periods" });
  }
});

router.get("/fiscal-years/:yearId", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const yearId = parseIntParam(req.params.yearId, "yearId");
    const fiscalYear = await fiscalYearStorage.getFiscalYearById(yearId, tenantId);
    if (!fiscalYear) {
      return res.status(404).json({ message: "Fiscal year not found" });
    }
    res.json(fiscalYear);
  } catch (error) {
    console.error("Error fetching fiscal year:", error);
    res.status(500).json({ message: "Failed to fetch fiscal year" });
  }
});

// Journal Entry routes - Use the dedicated module
import journalRoutes from "./accounting/journalRoutes";
router.use("/journals", journalRoutes);

router.get("/dashboard/summary", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const period = req.query.period as string || 'month';

    const now = new Date();
    let currentStart: string, currentEnd: string, previousStart: string, previousEnd: string;

    if (period === 'day') {
      currentStart = currentEnd = now.toISOString().split("T")[0];
      const prev = new Date(now); prev.setDate(prev.getDate() - 1);
      previousStart = previousEnd = prev.toISOString().split("T")[0];
    } else if (period === 'week') {
      const dayOfWeek = now.getDay();
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - dayOfWeek);
      currentStart = weekStart.toISOString().split("T")[0];
      currentEnd = now.toISOString().split("T")[0];
      const prevWeekEnd = new Date(weekStart); prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
      const prevWeekStart = new Date(prevWeekEnd); prevWeekStart.setDate(prevWeekStart.getDate() - 6);
      previousStart = prevWeekStart.toISOString().split("T")[0];
      previousEnd = prevWeekEnd.toISOString().split("T")[0];
    } else if (period === 'quarter') {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      currentStart = new Date(now.getFullYear(), qMonth, 1).toISOString().split("T")[0];
      currentEnd = now.toISOString().split("T")[0];
      const prevQEnd = new Date(now.getFullYear(), qMonth, 0);
      const prevQStart = new Date(prevQEnd.getFullYear(), prevQEnd.getMonth() - 2, 1);
      previousStart = prevQStart.toISOString().split("T")[0];
      previousEnd = prevQEnd.toISOString().split("T")[0];
    } else if (period === 'year') {
      currentStart = new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];
      currentEnd = now.toISOString().split("T")[0];
      previousStart = new Date(now.getFullYear() - 1, 0, 1).toISOString().split("T")[0];
      previousEnd = new Date(now.getFullYear() - 1, 11, 31).toISOString().split("T")[0];
    } else {
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      currentEnd = now.toISOString().split("T")[0];
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1);
      previousStart = prevMonthStart.toISOString().split("T")[0];
      previousEnd = prevMonthEnd.toISOString().split("T")[0];
    }

    const { getAccountMovements, getAccountMovementsAsOf } = await import("../accounting/reporting/rules");

    const currentMovements = await getAccountMovements(tenantId, currentStart, currentEnd);
    const previousMovements = await getAccountMovements(tenantId, previousStart, previousEnd);

    let curRevenue = 0, curExpense = 0, prevRevenue = 0, prevExpense = 0;
    for (const acct of currentMovements) {
      if (acct.groupNature === "Income") curRevenue += acct.periodCredit - acct.periodDebit;
      else if (acct.groupNature === "Expense") curExpense += acct.periodDebit - acct.periodCredit;
    }
    for (const acct of previousMovements) {
      if (acct.groupNature === "Income") prevRevenue += acct.periodCredit - acct.periodDebit;
      else if (acct.groupNature === "Expense") prevExpense += acct.periodDebit - acct.periodCredit;
    }

    const curProfit = curRevenue - curExpense;
    const prevProfit = prevRevenue - prevExpense;

    const asOfMovements = await getAccountMovementsAsOf(tenantId, currentEnd);
    let curCash = 0;
    for (const acct of asOfMovements) {
      const lowerName = acct.accountName.toLowerCase();
      if ((lowerName.includes("cash") || lowerName.includes("bank") || lowerName.includes("petty cash")) && acct.groupNature === "Asset") {
        curCash += acct.periodDebit - acct.periodCredit;
      }
    }

    const prevAsOfMovements = await getAccountMovementsAsOf(tenantId, previousEnd);
    let prevCash = 0;
    for (const acct of prevAsOfMovements) {
      const lowerName = acct.accountName.toLowerCase();
      if ((lowerName.includes("cash") || lowerName.includes("bank") || lowerName.includes("petty cash")) && acct.groupNature === "Asset") {
        prevCash += acct.periodDebit - acct.periodCredit;
      }
    }

    const pctChange = (cur: number, prev: number) => prev === 0 ? 0 : Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;

    const round2 = (v: number) => Math.round(v * 100) / 100;

    const summary = {
      revenue: { current: round2(curRevenue), previous: round2(prevRevenue), change: pctChange(curRevenue, prevRevenue) },
      expenses: { current: round2(curExpense), previous: round2(prevExpense), change: pctChange(curExpense, prevExpense) },
      profit: { current: round2(curProfit), previous: round2(prevProfit), change: pctChange(curProfit, prevProfit) },
      cashBalance: { current: round2(curCash), previous: round2(prevCash), change: pctChange(curCash, prevCash) },
      period
    };

    res.json(summary);
  } catch (error) {
    console.error("Error fetching dashboard summary:", error);
    res.status(500).json({ message: "Failed to fetch dashboard summary" });
  }
});

router.get("/dashboard/metrics", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { getAccountMovements } = await import("../accounting/reporting/rules");

    const now = new Date();
    const months: Array<{ label: string; startDate: string; endDate: string }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const endD = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      months.push({
        label: d.toLocaleString("en-US", { month: "short" }),
        startDate: d.toISOString().split("T")[0],
        endDate: endD.toISOString().split("T")[0],
      });
    }

    const monthlyData: Array<{ month: string; income: number; expense: number; netProfit: number }> = [];
    const expenseByGroup = new Map<string, number>();

    for (const m of months) {
      const movements = await getAccountMovements(tenantId, m.startDate, m.endDate);
      let income = 0, expense = 0;
      for (const acct of movements) {
        if (acct.groupNature === "Income") income += acct.periodCredit - acct.periodDebit;
        else if (acct.groupNature === "Expense") {
          const amt = acct.periodDebit - acct.periodCredit;
          expense += amt;
          if (amt !== 0) {
            const existing = expenseByGroup.get(acct.groupName) || 0;
            expenseByGroup.set(acct.groupName, existing + amt);
          }
        }
      }
      monthlyData.push({
        month: m.label,
        income: Math.round(income * 100) / 100,
        expense: Math.round(expense * 100) / 100,
        netProfit: Math.round((income - expense) * 100) / 100,
      });
    }

    const cashFlowData: Array<{ month: string; inflow: number; outflow: number; netFlow: number }> = [];
    for (const m of months) {
      const movements = await getAccountMovements(tenantId, m.startDate, m.endDate);
      let inflow = 0, outflow = 0;
      for (const acct of movements) {
        const lowerName = acct.accountName.toLowerCase();
        if ((lowerName.includes("cash") || lowerName.includes("bank") || lowerName.includes("petty cash")) && acct.groupNature === "Asset") {
          inflow += acct.periodDebit;
          outflow += acct.periodCredit;
        }
      }
      cashFlowData.push({
        month: m.label,
        inflow: Math.round(inflow * 100) / 100,
        outflow: Math.round(outflow * 100) / 100,
        netFlow: Math.round((inflow - outflow) * 100) / 100,
      });
    }

    const expenseBreakdown = Array.from(expenseByGroup.entries())
      .filter(([, v]) => v !== 0)
      .map(([name, value]) => ({ name, value: Math.round(Math.abs(value) * 100) / 100 }))
      .sort((a, b) => b.value - a.value);

    res.json({ monthlyData, cashFlowData, expenseBreakdown });
  } catch (error) {
    console.error("Error fetching dashboard metrics:", error);
    res.status(500).json({ message: "Failed to fetch dashboard metrics" });
  }
});

router.get("/insights", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { getAccountMovements } = await import("../accounting/reporting/rules");

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split("T")[0];
    const endDate = now.toISOString().split("T")[0];

    const movements = await getAccountMovements(tenantId, startDate, endDate);

    let totalIncome = 0, totalExpense = 0;
    let topExpenseGroup = "", topExpenseAmount = 0;
    const expenseByGroup = new Map<string, number>();

    for (const acct of movements) {
      if (acct.groupNature === "Income") {
        totalIncome += acct.periodCredit - acct.periodDebit;
      } else if (acct.groupNature === "Expense") {
        const amt = acct.periodDebit - acct.periodCredit;
        totalExpense += amt;
        const existing = expenseByGroup.get(acct.groupName) || 0;
        expenseByGroup.set(acct.groupName, existing + amt);
      }
    }

    for (const [group, amount] of expenseByGroup.entries()) {
      if (amount > topExpenseAmount) {
        topExpenseAmount = amount;
        topExpenseGroup = group;
      }
    }

    const insights: any[] = [];
    const hasData = totalIncome > 0 || totalExpense > 0;

    if (!hasData) {
      return res.json([]);
    }

    const netProfit = totalIncome - totalExpense;
    const profitMargin = totalIncome > 0 ? Math.round((netProfit / totalIncome) * 100) : 0;

    insights.push({
      id: 1,
      type: profitMargin >= 0 ? "positive" : "warning",
      title: "Profitability Summary",
      description: `Net profit margin for the last 3 months is ${profitMargin}%. Total income: ৳${Math.round(totalIncome).toLocaleString()}, Total expenses: ৳${Math.round(totalExpense).toLocaleString()}.`,
      recommendations: profitMargin < 10
        ? ["Review expense categories for potential savings", "Focus on increasing revenue streams"]
        : ["Maintain current cost management practices", "Consider reinvesting surplus into growth"],
      confidence: 0.9,
      createdAt: new Date(),
    });

    if (topExpenseGroup) {
      const pct = totalExpense > 0 ? Math.round((topExpenseAmount / totalExpense) * 100) : 0;
      insights.push({
        id: 2,
        type: "info",
        title: "Top Expense Category",
        description: `"${topExpenseGroup}" is the largest expense category at ৳${Math.round(topExpenseAmount).toLocaleString()} (${pct}% of total expenses).`,
        recommendations: ["Review this category for potential cost optimization"],
        confidence: 0.95,
        createdAt: new Date(),
      });
    }

    res.json(insights);
  } catch (error) {
    console.error("Error fetching financial insights:", error);
    res.status(500).json({ message: "Failed to fetch financial insights" });
  }
});

// Account Groups routes
router.get("/account-groups/with-nature-map", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const groups = await accountGroupStorage.getAllAccountGroups(tenantId);
    const allTypes = await accountTypeStorage.getAllAccountTypes(tenantId);

    const natureToCode: Record<string, string> = {
      "Asset": "ASSET",
      "Liability": "LIAB",
      "Equity": "EQTY",
      "Income": "REV",
      "Expense": "EXP",
    };

    const natureToTypeId: Record<string, number> = {};
    for (const [nature, code] of Object.entries(natureToCode)) {
      const found = allTypes.find((t) => t.code === code);
      if (found) {
        natureToTypeId[nature] = found.id;
      }
    }

    res.json({ groups, natureToTypeId });
  } catch (error) {
    console.error("Error fetching account groups with nature map:", error);
    res.status(500).json({ message: "Failed to fetch account groups with nature map" });
  }
});

router.get("/account-groups", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const groups = await accountGroupStorage.getAllAccountGroups(tenantId);
    res.json(groups);
  } catch (error) {
    console.error("Error fetching account groups:", error);
    res.status(500).json({ message: "Failed to fetch account groups" });
  }
});

router.get("/account-groups/hierarchy", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const hierarchy = await accountGroupStorage.getGroupHierarchy(tenantId);
    res.json(hierarchy);
  } catch (error) {
    console.error("Error fetching account group hierarchy:", error);
    res.status(500).json({ message: "Failed to fetch account group hierarchy" });
  }
});

router.post("/account-groups", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { name, code, parentGroupId, nature, affectsGrossProfit, sortOrder } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Group name is required" });
    }
    if (!code || !code.trim()) {
      return res.status(400).json({ message: "Group code is required" });
    }
    if (!nature) {
      return res.status(400).json({ message: "Group nature is required (Asset, Liability, Income, Expense, or Equity)" });
    }
    const group = await accountGroupStorage.createAccountGroup({
      name: name.trim(),
      code: code.trim(),
      parentGroupId: parentGroupId || null,
      nature,
      affectsGrossProfit: affectsGrossProfit ?? false,
      sortOrder: sortOrder ?? 0,
      tenantId,
    });
    res.status(201).json(group);
  } catch (error: any) {
    console.error("Error creating account group:", error);
    if (error?.code === '23505') {
      return res.status(400).json({ message: "An account group with this code already exists" });
    }
    res.status(500).json({ message: process.env.NODE_ENV === 'production' ? "Failed to create account group" : (error?.message || "Failed to create account group") });
  }
});

router.put("/account-groups/:id", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const updated = await accountGroupStorage.updateAccountGroup(id, tenantId, req.body);

    if (!updated) {
      return res.status(404).json({ message: "Account group not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating account group:", error);
    res.status(500).json({ message: "Failed to update account group" });
  }
});

router.delete("/account-groups/:id", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const success = await accountGroupStorage.deleteAccountGroup(id, tenantId);

    if (!success) {
      return res.status(404).json({ message: "Account group not found" });
    }

    res.json({ message: "Account group deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting account group:", error);
    if (error.message?.includes("Cannot delete group")) {
      return res.status(400).json({ message: process.env.NODE_ENV === 'production' ? "Cannot delete group with dependencies" : error.message });
    }
    res.status(500).json({ message: "Failed to delete account group" });
  }
});

router.post("/account-groups/seed", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const groups = await accountGroupStorage.seedDefaultGroups(tenantId);
    res.status(201).json(groups);
  } catch (error) {
    console.error("Error seeding account groups:", error);
    res.status(500).json({ message: "Failed to seed account groups" });
  }
});

// ============================================================
// Financial Report Routes
// ============================================================

function getDefaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
  return { startDate, endDate };
}

router.get("/reports/day-book", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const defaults = getDefaultDateRange();
    const startDate = (req.query.startDate as string) || defaults.startDate;
    const endDate = (req.query.endDate as string) || defaults.endDate;
    const voucherType = req.query.voucherType as string | undefined;
    const result = await getDayBook(tenantId, startDate, endDate, voucherType);
    res.json(result);
  } catch (error) {
    console.error("Error fetching day book:", error);
    res.status(500).json({ message: "Failed to fetch day book report" });
  }
});

router.get("/reports/ledger/:accountId", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const accountId = parseIntParam(req.params.accountId, "accountId");
    if (isNaN(accountId)) {
      return res.status(400).json({ message: "Invalid account ID" });
    }
    const defaults = getDefaultDateRange();
    const startDate = (req.query.startDate as string) || defaults.startDate;
    const endDate = (req.query.endDate as string) || defaults.endDate;
    const fiscalYearId = req.query.fiscalYearId ? parseInt(req.query.fiscalYearId as string) : undefined;
    const result = await getLedgerReport(tenantId, accountId, startDate, endDate, fiscalYearId);
    res.json(result);
  } catch (error) {
    console.error("Error fetching ledger report:", error);
    res.status(500).json({ message: "Failed to fetch ledger report" });
  }
});

router.get("/reports/trial-balance", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const asOfDate = req.query.asOfDate as string | undefined;
    const fiscalYearId = req.query.fiscalYearId ? parseInt(req.query.fiscalYearId as string) : undefined;
    const result = await getTrialBalance(tenantId, asOfDate, fiscalYearId);
    res.json(result);
  } catch (error) {
    console.error("Error fetching trial balance:", error);
    res.status(500).json({ message: "Failed to fetch trial balance" });
  }
});

router.get("/reports/profit-and-loss", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const defaults = getDefaultDateRange();
    const startDate = (req.query.startDate as string) || defaults.startDate;
    const endDate = (req.query.endDate as string) || defaults.endDate;
    const result = await getProfitAndLoss(tenantId, startDate, endDate);
    res.json(result);
  } catch (error) {
    console.error("Error fetching profit and loss:", error);
    res.status(500).json({ message: "Failed to fetch profit and loss report" });
  }
});

router.get("/reports/balance-sheet", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split("T")[0];
    const result = await getBalanceSheet(tenantId, asOfDate);
    res.json(result);
  } catch (error) {
    console.error("Error fetching balance sheet:", error);
    res.status(500).json({ message: "Failed to fetch balance sheet" });
  }
});

router.get("/reports/cash-bank-book/:accountId", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const accountId = parseIntParam(req.params.accountId, "accountId");
    if (isNaN(accountId)) {
      return res.status(400).json({ message: "Invalid account ID" });
    }
    const defaults = getDefaultDateRange();
    const startDate = (req.query.startDate as string) || defaults.startDate;
    const endDate = (req.query.endDate as string) || defaults.endDate;
    const result = await getCashBankBook(tenantId, accountId, startDate, endDate);
    res.json(result);
  } catch (error) {
    console.error("Error fetching cash/bank book:", error);
    res.status(500).json({ message: "Failed to fetch cash/bank book report" });
  }
});

// ============================================================
// Opening Balances CRUD Routes
// ============================================================

router.get("/opening-balances/:fiscalYearId", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const fiscalYearId = parseIntParam(req.params.fiscalYearId, "fiscalYearId");
    if (isNaN(fiscalYearId)) {
      return res.status(400).json({ message: "Invalid fiscal year ID" });
    }
    const result = await getOpeningBalancesByFiscalYear(tenantId, fiscalYearId);
    res.json(result);
  } catch (error) {
    console.error("Error fetching opening balances:", error);
    res.status(500).json({ message: "Failed to fetch opening balances" });
  }
});

router.post("/opening-balances", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { accountId, fiscalYearId, openingDebit, openingCredit, notes } = req.body;

    if (!accountId || !fiscalYearId) {
      return res.status(400).json({ message: "accountId and fiscalYearId are required" });
    }

    const result = await upsertOpeningBalance({
      tenantId,
      accountId,
      fiscalYearId,
      openingDebit: openingDebit || "0",
      openingCredit: openingCredit || "0",
      notes,
    });
    res.status(201).json(result);
  } catch (error) {
    console.error("Error creating/updating opening balance:", error);
    res.status(500).json({ message: "Failed to create/update opening balance" });
  }
});

router.delete("/opening-balances/:id", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }
    const success = await deleteOpeningBalance(id, tenantId);
    if (!success) {
      return res.status(404).json({ message: "Opening balance not found" });
    }
    res.json({ message: "Opening balance deleted successfully" });
  } catch (error) {
    console.error("Error deleting opening balance:", error);
    res.status(500).json({ message: "Failed to delete opening balance" });
  }
});

router.get("/posting-profiles", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const profiles = await postingBridge.getPostingProfiles(tenantId);
    res.json(profiles);
  } catch (error) {
    console.error("Error fetching posting profiles:", error);
    res.status(500).json({ message: "Failed to fetch posting profiles" });
  }
});

router.get("/posting-profiles/:id", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }
    const result = await postingBridge.getPostingProfileWithLines(id, tenantId);
    if (!result) {
      return res.status(404).json({ message: "Posting profile not found" });
    }
    res.json(result);
  } catch (error) {
    console.error("Error fetching posting profile:", error);
    res.status(500).json({ message: "Failed to fetch posting profile" });
  }
});

router.post("/posting-profiles", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { lines, ...profileData } = req.body;
    const validatedProfile = insertPostingProfileSchema.parse({
      ...profileData,
      tenantId,
    });
    const profile = await postingBridge.createPostingProfile(validatedProfile);

    if (lines && Array.isArray(lines)) {
      for (const line of lines) {
        const validatedLine = insertPostingProfileLineSchema.parse({
          ...line,
          profileId: profile.id,
          tenantId,
        });
        await postingBridge.createPostingProfileLine(validatedLine);
      }
    }

    const result = await postingBridge.getPostingProfileWithLines(profile.id, tenantId);
    res.status(201).json(result);
  } catch (error: any) {
    console.error("Error creating posting profile:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create posting profile" });
  }
});

router.put("/posting-profiles/:id", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }
    const { lines, ...profileData } = req.body;
    const profile = await postingBridge.updatePostingProfile(id, tenantId, profileData);
    if (!profile) {
      return res.status(404).json({ message: "Posting profile not found" });
    }
    const result = await postingBridge.getPostingProfileWithLines(id, tenantId);
    res.json(result);
  } catch (error) {
    console.error("Error updating posting profile:", error);
    res.status(500).json({ message: "Failed to update posting profile" });
  }
});

router.delete("/posting-profiles/:id", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }
    await postingBridge.deletePostingProfile(id, tenantId);
    res.json({ message: "Posting profile deleted successfully" });
  } catch (error) {
    console.error("Error deleting posting profile:", error);
    res.status(500).json({ message: "Failed to delete posting profile" });
  }
});

router.post("/bridge/create-voucher", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { statusId, ...sourceData } = req.body;

    if (!statusId) {
      return res.status(400).json({ message: "statusId is required" });
    }
    if (!sourceData.lines || !Array.isArray(sourceData.lines) || sourceData.lines.length === 0) {
      return res.status(400).json({ message: "At least one line is required" });
    }
    if (!sourceData.originModule || !sourceData.originType || !sourceData.originId) {
      return res.status(400).json({ message: "originModule, originType, and originId are required" });
    }
    if (!sourceData.date || !sourceData.fiscalYearId) {
      return res.status(400).json({ message: "date and fiscalYearId are required" });
    }

    const result = await postingBridge.createVoucherFromSource(
      { ...sourceData, tenantId, preparedById: sourceData.preparedById || userId },
      statusId
    );
    res.status(201).json(result);
  } catch (error: any) {
    console.error("Error creating voucher from source:", error);
    if (error.message?.startsWith("Duplicate:")) {
      return res.status(409).json({ message: process.env.NODE_ENV === 'production' ? "Duplicate voucher detected" : error.message });
    }
    if (error.message?.includes("not balanced")) {
      return res.status(400).json({ message: process.env.NODE_ENV === 'production' ? "Voucher is not balanced" : error.message });
    }
    res.status(500).json({ message: "Failed to create voucher from source document" });
  }
});

// ============================================================
// Voucher Types Extended Seed Route
// ============================================================

router.post("/voucher-types/seed-extended", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const existingTypes = await getAllVoucherTypes(tenantId);
    const existingCodes = new Set(existingTypes.map((t: any) => t.code));

    const extendedTypes = [
      { name: "Manufacturing Journal", code: "MJ", prefix: "MJ", isJournal: true, nextNumber: 1, tenantId },
      { name: "Payroll Journal", code: "PJ", prefix: "PJ", isJournal: true, nextNumber: 1, tenantId },
      { name: "Commercial/LC Journal", code: "LCJ", prefix: "LCJ", isJournal: true, nextNumber: 1, tenantId },
    ];

    const created = [];
    for (const vt of extendedTypes) {
      if (!existingCodes.has(vt.code)) {
        const result = await createVoucherType(vt);
        created.push(result);
      }
    }

    res.status(201).json({
      message: `Seeded ${created.length} new voucher types`,
      created,
      skipped: extendedTypes.length - created.length,
    });
  } catch (error) {
    console.error("Error seeding extended voucher types:", error);
    res.status(500).json({ message: "Failed to seed extended voucher types" });
  }
});

// ============================================================
// AR/AP Aging Report Route
// ============================================================

router.get("/reports/ar-ap-aging", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const type = (req.query.type as string) || "receivable";
    if (type !== "receivable" && type !== "payable") {
      return res.status(400).json({ message: "type must be 'receivable' or 'payable'" });
    }
    const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split("T")[0];
    const result = await getArApAging(tenantId, type, asOfDate);
    res.json(result);
  } catch (error) {
    console.error("Error fetching AR/AP aging report:", error);
    res.status(500).json({ message: "Failed to fetch AR/AP aging report" });
  }
});

export default router;