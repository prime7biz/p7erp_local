import { db } from "../../db";
import { ChartOfAccount, InsertChartOfAccount, chartOfAccounts, voucherItems, ledgerPostings, ledgerOpeningBalances, journalLines, postingProfileLines } from "@shared/schema";
import { eq, and, isNull, sql, count } from "drizzle-orm";

export const chartOfAccountsStorage = {
  /**
   * Get all chart of accounts for a tenant
   */
  async getAllAccounts(tenantId: number, activeOnly: boolean = false): Promise<ChartOfAccount[]> {
    try {
      const conditions = [eq(chartOfAccounts.tenantId, tenantId)];
      if (activeOnly) {
        conditions.push(eq(chartOfAccounts.isActive, true));
      }
      return await db.select().from(chartOfAccounts)
        .where(and(...conditions))
        .orderBy(chartOfAccounts.accountNumber);
    } catch (error) {
      console.error("Error in getAllAccounts:", error);
      throw error;
    }
  },

  /**
   * Get an account by ID
   */
  async getAccountById(id: number, tenantId: number): Promise<ChartOfAccount | undefined> {
    try {
      const [account] = await db
        .select()
        .from(chartOfAccounts)
        .where(and(
          eq(chartOfAccounts.id, id),
          eq(chartOfAccounts.tenantId, tenantId)
        ));
      
      return account;
    } catch (error) {
      console.error("Error in getAccountById:", error);
      throw error;
    }
  },

  /**
   * Get an account by account number
   */
  async getAccountByNumber(accountNumber: string, tenantId: number): Promise<ChartOfAccount | undefined> {
    try {
      const [account] = await db
        .select()
        .from(chartOfAccounts)
        .where(and(
          eq(chartOfAccounts.accountNumber, accountNumber),
          eq(chartOfAccounts.tenantId, tenantId)
        ));
      
      return account;
    } catch (error) {
      console.error("Error in getAccountByNumber:", error);
      throw error;
    }
  },

  /**
   * Create a new account
   */
  async createAccount(account: InsertChartOfAccount): Promise<ChartOfAccount> {
    try {
      const [newAccount] = await db
        .insert(chartOfAccounts)
        .values(account)
        .returning();
      
      return newAccount;
    } catch (error) {
      console.error("Error in createAccount:", error);
      throw error;
    }
  },

  /**
   * Update an account
   */
  async updateAccount(id: number, tenantId: number, data: Partial<InsertChartOfAccount>): Promise<ChartOfAccount> {
    try {
      const [updatedAccount] = await db
        .update(chartOfAccounts)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(chartOfAccounts.id, id),
          eq(chartOfAccounts.tenantId, tenantId)
        ))
        .returning();
      
      return updatedAccount;
    } catch (error) {
      console.error("Error in updateAccount:", error);
      throw error;
    }
  },

  /**
   * Delete an account
   */
  async deleteAccount(id: number, tenantId: number): Promise<boolean> {
    try {
      const [deleted] = await db
        .delete(chartOfAccounts)
        .where(and(
          eq(chartOfAccounts.id, id),
          eq(chartOfAccounts.tenantId, tenantId)
        ))
        .returning();
      
      return !!deleted;
    } catch (error) {
      console.error("Error in deleteAccount:", error);
      throw error;
    }
  },

  /**
   * Get all root level accounts (no parent)
   */
  async getRootAccounts(tenantId: number, activeOnly: boolean = false): Promise<ChartOfAccount[]> {
    try {
      const conditions = [
        eq(chartOfAccounts.tenantId, tenantId),
        isNull(chartOfAccounts.parentAccountId)
      ];
      if (activeOnly) {
        conditions.push(eq(chartOfAccounts.isActive, true));
      }
      return await db.select().from(chartOfAccounts)
        .where(and(...conditions))
        .orderBy(chartOfAccounts.accountNumber);
    } catch (error) {
      console.error("Error in getRootAccounts:", error);
      throw error;
    }
  },

  /**
   * Get child accounts for a parent account
   */
  async getChildAccounts(parentId: number, tenantId: number, activeOnly: boolean = false): Promise<ChartOfAccount[]> {
    try {
      const conditions = [
        eq(chartOfAccounts.tenantId, tenantId),
        eq(chartOfAccounts.parentAccountId, parentId)
      ];
      if (activeOnly) {
        conditions.push(eq(chartOfAccounts.isActive, true));
      }
      return await db.select().from(chartOfAccounts)
        .where(and(...conditions))
        .orderBy(chartOfAccounts.accountNumber);
    } catch (error) {
      console.error("Error in getChildAccounts:", error);
      throw error;
    }
  },

  /**
   * Get accounts by type
   */
  async getAccountsByType(accountTypeId: number, tenantId: number, activeOnly: boolean = false): Promise<ChartOfAccount[]> {
    try {
      const conditions = [
        eq(chartOfAccounts.tenantId, tenantId),
        eq(chartOfAccounts.accountTypeId, accountTypeId)
      ];
      if (activeOnly) {
        conditions.push(eq(chartOfAccounts.isActive, true));
      }
      return await db.select().from(chartOfAccounts)
        .where(and(...conditions))
        .orderBy(chartOfAccounts.accountNumber);
    } catch (error) {
      console.error("Error in getAccountsByType:", error);
      throw error;
    }
  },

  /**
   * Get cash and bank accounts
   */
  async getCashAndBankAccounts(tenantId: number): Promise<ChartOfAccount[]> {
    try {
      return await db
        .select()
        .from(chartOfAccounts)
        .where(and(
          eq(chartOfAccounts.tenantId, tenantId),
          eq(chartOfAccounts.isActive, true),
          sql`(${chartOfAccounts.isCashAccount} = true OR ${chartOfAccounts.isBankAccount} = true)`
        ))
        .orderBy(chartOfAccounts.name);
    } catch (error) {
      console.error("Error in getCashAndBankAccounts:", error);
      throw error;
    }
  },

  /**
   * Update account balance
   */
  async updateAccountBalance(id: number, tenantId: number, amount: string): Promise<ChartOfAccount> {
    try {
      const [updatedAccount] = await db
        .update(chartOfAccounts)
        .set({
          balance: amount,
          updatedAt: new Date()
        })
        .where(and(
          eq(chartOfAccounts.id, id),
          eq(chartOfAccounts.tenantId, tenantId)
        ))
        .returning();
      
      return updatedAccount;
    } catch (error) {
      console.error("Error in updateAccountBalance:", error);
      throw error;
    }
  },

  async getAccountEntryCount(id: number, tenantId: number): Promise<{ entryCount: number; details: { voucherItems: number; ledgerPostings: number; openingBalances: number; journalLines: number; postingProfileLines: number; childAccounts: number } }> {
    try {
      const [viCount] = await db.select({ count: count() }).from(voucherItems).where(and(eq(voucherItems.accountId, id), eq(voucherItems.tenantId, tenantId)));
      const [lpCount] = await db.select({ count: count() }).from(ledgerPostings).where(and(eq(ledgerPostings.accountId, id), eq(ledgerPostings.tenantId, tenantId)));
      const [obCount] = await db.select({ count: count() }).from(ledgerOpeningBalances).where(and(eq(ledgerOpeningBalances.accountId, id), eq(ledgerOpeningBalances.tenantId, tenantId)));
      const [jlCount] = await db.select({ count: count() }).from(journalLines).where(and(eq(journalLines.accountId, id), eq(journalLines.tenantId, tenantId)));
      const [plCount] = await db.select({ count: count() }).from(postingProfileLines).where(and(eq(postingProfileLines.accountId, id), eq(postingProfileLines.tenantId, tenantId)));
      const [caCount] = await db.select({ count: count() }).from(chartOfAccounts).where(and(eq(chartOfAccounts.parentAccountId, id), eq(chartOfAccounts.tenantId, tenantId)));

      const details = {
        voucherItems: viCount.count,
        ledgerPostings: lpCount.count,
        openingBalances: obCount.count,
        journalLines: jlCount.count,
        postingProfileLines: plCount.count,
        childAccounts: caCount.count,
      };

      const entryCount = Object.values(details).reduce((sum, v) => sum + v, 0);

      return { entryCount, details };
    } catch (error) {
      console.error("Error in getAccountEntryCount:", error);
      throw error;
    }
  },

  async getMaterialSuppliers(tenantId: number): Promise<ChartOfAccount[]> {
    try {
      return await db
        .select()
        .from(chartOfAccounts)
        .where(and(
          eq(chartOfAccounts.tenantId, tenantId),
          eq(chartOfAccounts.isMaterialSupplier, true),
          eq(chartOfAccounts.isActive, true)
        ))
        .orderBy(chartOfAccounts.name);
    } catch (error) {
      console.error("Error in getMaterialSuppliers:", error);
      throw error;
    }
  }
};