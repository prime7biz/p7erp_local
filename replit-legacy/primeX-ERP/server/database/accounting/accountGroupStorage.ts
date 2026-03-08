import { db } from "../../db";
import { AccountGroup, InsertAccountGroup, accountGroups, chartOfAccounts } from "../../../shared/schema";
import { eq, and, asc } from "drizzle-orm";

export const accountGroupStorage = {
  async getAllAccountGroups(tenantId: number): Promise<AccountGroup[]> {
    try {
      return await db
        .select()
        .from(accountGroups)
        .where(eq(accountGroups.tenantId, tenantId))
        .orderBy(asc(accountGroups.sortOrder), asc(accountGroups.name));
    } catch (error) {
      console.error("Error in getAllAccountGroups:", error);
      throw error;
    }
  },

  async getAccountGroupById(id: number, tenantId: number): Promise<AccountGroup | undefined> {
    try {
      const [group] = await db
        .select()
        .from(accountGroups)
        .where(and(
          eq(accountGroups.id, id),
          eq(accountGroups.tenantId, tenantId)
        ));
      return group;
    } catch (error) {
      console.error("Error in getAccountGroupById:", error);
      throw error;
    }
  },

  async createAccountGroup(data: InsertAccountGroup): Promise<AccountGroup> {
    try {
      const [newGroup] = await db
        .insert(accountGroups)
        .values(data)
        .returning();
      return newGroup;
    } catch (error) {
      console.error("Error in createAccountGroup:", error);
      throw error;
    }
  },

  async updateAccountGroup(id: number, tenantId: number, data: Partial<InsertAccountGroup>): Promise<AccountGroup | undefined> {
    try {
      const [updated] = await db
        .update(accountGroups)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(and(
          eq(accountGroups.id, id),
          eq(accountGroups.tenantId, tenantId)
        ))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error in updateAccountGroup:", error);
      throw error;
    }
  },

  async deleteAccountGroup(id: number, tenantId: number): Promise<boolean> {
    try {
      const childGroups = await db
        .select()
        .from(accountGroups)
        .where(and(
          eq(accountGroups.parentGroupId, id),
          eq(accountGroups.tenantId, tenantId)
        ));

      if (childGroups.length > 0) {
        throw new Error("Cannot delete group with child groups");
      }

      const linkedAccounts = await db
        .select()
        .from(chartOfAccounts)
        .where(and(
          eq(chartOfAccounts.groupId, id),
          eq(chartOfAccounts.tenantId, tenantId)
        ));

      if (linkedAccounts.length > 0) {
        throw new Error("Cannot delete group with linked accounts");
      }

      const [deleted] = await db
        .delete(accountGroups)
        .where(and(
          eq(accountGroups.id, id),
          eq(accountGroups.tenantId, tenantId)
        ))
        .returning();

      return !!deleted;
    } catch (error) {
      console.error("Error in deleteAccountGroup:", error);
      throw error;
    }
  },

  async getGroupHierarchy(tenantId: number): Promise<any[]> {
    try {
      const allGroups = await db
        .select()
        .from(accountGroups)
        .where(eq(accountGroups.tenantId, tenantId))
        .orderBy(asc(accountGroups.sortOrder), asc(accountGroups.name));

      const allLedgers = await db
        .select()
        .from(chartOfAccounts)
        .where(eq(chartOfAccounts.tenantId, tenantId));

      const ledgersByGroupId = new Map<number, any[]>();
      for (const ledger of allLedgers) {
        if (ledger.groupId) {
          if (!ledgersByGroupId.has(ledger.groupId)) {
            ledgersByGroupId.set(ledger.groupId, []);
          }
          ledgersByGroupId.get(ledger.groupId)!.push(ledger);
        }
      }

      const groupMap = new Map<number, any>();
      const roots: any[] = [];

      for (const group of allGroups) {
        groupMap.set(group.id, {
          ...group,
          children: [],
          ledgers: ledgersByGroupId.get(group.id) || [],
        });
      }

      for (const group of allGroups) {
        const node = groupMap.get(group.id)!;
        if (group.parentGroupId && groupMap.has(group.parentGroupId)) {
          groupMap.get(group.parentGroupId)!.children.push(node);
        } else {
          roots.push(node);
        }
      }

      return roots;
    } catch (error) {
      console.error("Error in getGroupHierarchy:", error);
      throw error;
    }
  },

  async seedDefaultGroups(tenantId: number): Promise<AccountGroup[]> {
    try {
      const existing = await db
        .select()
        .from(accountGroups)
        .where(eq(accountGroups.tenantId, tenantId));

      if (existing.length > 0) {
        return existing;
      }

      const primaryGroups = [
        { name: "Capital Account", code: "CAPITAL", nature: "Equity", sortOrder: 1 },
        { name: "Loans (Liability)", code: "LOANS_LIABILITY", nature: "Liability", sortOrder: 3 },
        { name: "Current Liabilities", code: "CURRENT_LIABILITIES", nature: "Liability", sortOrder: 6 },
        { name: "Current Assets", code: "CURRENT_ASSETS", nature: "Asset", sortOrder: 9 },
        { name: "Fixed Assets", code: "FIXED_ASSETS", nature: "Asset", sortOrder: 16 },
        { name: "Investments", code: "INVESTMENTS", nature: "Asset", sortOrder: 17 },
        { name: "Direct Expenses", code: "DIRECT_EXPENSES", nature: "Expense", affectsGrossProfit: true, sortOrder: 18 },
        { name: "Indirect Expenses", code: "INDIRECT_EXPENSES", nature: "Expense", sortOrder: 20 },
        { name: "Direct Income", code: "DIRECT_INCOME", nature: "Income", affectsGrossProfit: true, sortOrder: 21 },
        { name: "Indirect Income", code: "INDIRECT_INCOME", nature: "Income", sortOrder: 23 },
      ];

      const insertedPrimary = await db
        .insert(accountGroups)
        .values(
          primaryGroups.map((g) => ({
            tenantId,
            name: g.name,
            code: g.code,
            nature: g.nature,
            affectsGrossProfit: g.affectsGrossProfit || false,
            isDefault: true,
            sortOrder: g.sortOrder,
            parentGroupId: null,
          }))
        )
        .returning();

      const parentMap = new Map<string, number>();
      for (const g of insertedPrimary) {
        parentMap.set(g.code, g.id);
      }

      const childGroups = [
        { name: "Reserves & Surplus", code: "RESERVES", nature: "Equity", parentCode: "CAPITAL", sortOrder: 2 },
        { name: "Secured Loans", code: "SECURED_LOANS", nature: "Liability", parentCode: "LOANS_LIABILITY", sortOrder: 4 },
        { name: "Unsecured Loans", code: "UNSECURED_LOANS", nature: "Liability", parentCode: "LOANS_LIABILITY", sortOrder: 5 },
        { name: "Duties & Taxes", code: "DUTIES_TAXES", nature: "Liability", parentCode: "CURRENT_LIABILITIES", sortOrder: 7 },
        { name: "Sundry Creditors", code: "SUNDRY_CREDITORS", nature: "Liability", parentCode: "CURRENT_LIABILITIES", sortOrder: 8 },
        { name: "Cash-in-Hand", code: "CASH_IN_HAND", nature: "Asset", parentCode: "CURRENT_ASSETS", sortOrder: 10 },
        { name: "Bank Accounts", code: "BANK_ACCOUNTS", nature: "Asset", parentCode: "CURRENT_ASSETS", sortOrder: 11 },
        { name: "Sundry Debtors", code: "SUNDRY_DEBTORS", nature: "Asset", parentCode: "CURRENT_ASSETS", sortOrder: 12 },
        { name: "Stock-in-Hand", code: "STOCK_IN_HAND", nature: "Asset", parentCode: "CURRENT_ASSETS", sortOrder: 13 },
        { name: "Deposits (Asset)", code: "DEPOSITS_ASSET", nature: "Asset", parentCode: "CURRENT_ASSETS", sortOrder: 14 },
        { name: "Loans & Advances (Asset)", code: "LOANS_ADVANCES_ASSET", nature: "Asset", parentCode: "CURRENT_ASSETS", sortOrder: 15 },
        { name: "Manufacturing Expenses", code: "MFG_EXPENSES", nature: "Expense", parentCode: "DIRECT_EXPENSES", affectsGrossProfit: true, sortOrder: 19 },
        { name: "Sales Account", code: "SALES", nature: "Income", parentCode: "DIRECT_INCOME", affectsGrossProfit: true, sortOrder: 22 },
        { name: "Purchase Account", code: "PURCHASE", nature: "Expense", parentCode: "DIRECT_EXPENSES", affectsGrossProfit: true, sortOrder: 24 },
      ];

      const insertedChildren = await db
        .insert(accountGroups)
        .values(
          childGroups.map((g) => ({
            tenantId,
            name: g.name,
            code: g.code,
            nature: g.nature,
            parentGroupId: parentMap.get(g.parentCode)!,
            affectsGrossProfit: g.affectsGrossProfit || false,
            isDefault: true,
            sortOrder: g.sortOrder,
          }))
        )
        .returning();

      return [...insertedPrimary, ...insertedChildren];
    } catch (error) {
      console.error("Error in seedDefaultGroups:", error);
      throw error;
    }
  },
};
