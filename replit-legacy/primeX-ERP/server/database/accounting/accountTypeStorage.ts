import { db } from "../../db";
import { AccountType, InsertAccountType, accountTypes } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export const accountTypeStorage = {
  /**
   * Get all account types for a tenant
   */
  async getAllAccountTypes(tenantId: number, activeOnly: boolean = false): Promise<AccountType[]> {
    try {
      let query = db.select().from(accountTypes).where(eq(accountTypes.tenantId, tenantId));
      
      if (activeOnly) {
        query = query.where(eq(accountTypes.isActive, true));
      }
      
      return await query.orderBy(accountTypes.category, accountTypes.name);
    } catch (error) {
      console.error("Error in getAllAccountTypes:", error);
      throw error;
    }
  },

  /**
   * Get an account type by ID
   */
  async getAccountTypeById(id: number, tenantId: number): Promise<AccountType | undefined> {
    try {
      const [accountType] = await db
        .select()
        .from(accountTypes)
        .where(and(
          eq(accountTypes.id, id),
          eq(accountTypes.tenantId, tenantId)
        ));
      
      return accountType;
    } catch (error) {
      console.error("Error in getAccountTypeById:", error);
      throw error;
    }
  },

  /**
   * Get an account type by code
   */
  async getAccountTypeByCode(code: string, tenantId: number): Promise<AccountType | undefined> {
    try {
      const [accountType] = await db
        .select()
        .from(accountTypes)
        .where(and(
          eq(accountTypes.code, code),
          eq(accountTypes.tenantId, tenantId)
        ));
      
      return accountType;
    } catch (error) {
      console.error("Error in getAccountTypeByCode:", error);
      throw error;
    }
  },

  /**
   * Create a new account type
   */
  async createAccountType(accountType: InsertAccountType): Promise<AccountType> {
    try {
      const [newAccountType] = await db
        .insert(accountTypes)
        .values(accountType)
        .returning();
      
      return newAccountType;
    } catch (error) {
      console.error("Error in createAccountType:", error);
      throw error;
    }
  },

  /**
   * Update an account type
   */
  async updateAccountType(id: number, tenantId: number, data: Partial<InsertAccountType>): Promise<AccountType> {
    try {
      const [updatedAccountType] = await db
        .update(accountTypes)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(accountTypes.id, id),
          eq(accountTypes.tenantId, tenantId)
        ))
        .returning();
      
      return updatedAccountType;
    } catch (error) {
      console.error("Error in updateAccountType:", error);
      throw error;
    }
  },

  /**
   * Delete an account type
   */
  async deleteAccountType(id: number, tenantId: number): Promise<boolean> {
    try {
      const [deleted] = await db
        .delete(accountTypes)
        .where(and(
          eq(accountTypes.id, id),
          eq(accountTypes.tenantId, tenantId)
        ))
        .returning();
      
      return !!deleted;
    } catch (error) {
      console.error("Error in deleteAccountType:", error);
      throw error;
    }
  },

  /**
   * Get account types by category
   */
  async getAccountTypesByCategory(category: string, tenantId: number): Promise<AccountType[]> {
    try {
      return await db
        .select()
        .from(accountTypes)
        .where(and(
          eq(accountTypes.category, category),
          eq(accountTypes.tenantId, tenantId),
          eq(accountTypes.isActive, true)
        ))
        .orderBy(accountTypes.name);
    } catch (error) {
      console.error("Error in getAccountTypesByCategory:", error);
      throw error;
    }
  }
};