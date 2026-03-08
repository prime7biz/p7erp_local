import { db } from "../../db";
import { FiscalYear, InsertFiscalYear, fiscalYears, AccountingPeriod, InsertAccountingPeriod, accountingPeriods } from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";

export const fiscalYearStorage = {
  /**
   * Get all fiscal years for a tenant
   */
  async getAllFiscalYears(tenantId: number, activeOnly: boolean = false): Promise<FiscalYear[]> {
    try {
      const conditions = [eq(fiscalYears.tenantId, tenantId)];
      if (activeOnly) {
        conditions.push(eq(fiscalYears.isClosed, false));
      }
      return await db.select().from(fiscalYears).where(and(...conditions)).orderBy(fiscalYears.startDate);
    } catch (error) {
      console.error("Error in getAllFiscalYears:", error);
      throw error;
    }
  },

  /**
   * Get a fiscal year by ID
   */
  async getFiscalYearById(id: number, tenantId: number): Promise<FiscalYear | undefined> {
    try {
      const [fiscalYear] = await db
        .select()
        .from(fiscalYears)
        .where(and(
          eq(fiscalYears.id, id),
          eq(fiscalYears.tenantId, tenantId)
        ));
      
      return fiscalYear;
    } catch (error) {
      console.error("Error in getFiscalYearById:", error);
      throw error;
    }
  },

  /**
   * Get the current active fiscal year
   */
  async getCurrentFiscalYear(tenantId: number): Promise<FiscalYear | undefined> {
    try {
      const [currentFiscalYear] = await db
        .select()
        .from(fiscalYears)
        .where(and(
          eq(fiscalYears.tenantId, tenantId),
          eq(fiscalYears.isCurrent, true)
        ));
      
      return currentFiscalYear;
    } catch (error) {
      console.error("Error in getCurrentFiscalYear:", error);
      throw error;
    }
  },

  /**
   * Create a new fiscal year
   */
  async createFiscalYear(fiscalYear: InsertFiscalYear): Promise<FiscalYear> {
    try {
      const [newFiscalYear] = await db
        .insert(fiscalYears)
        .values(fiscalYear)
        .returning();
      
      return newFiscalYear;
    } catch (error) {
      console.error("Error in createFiscalYear:", error);
      throw error;
    }
  },

  /**
   * Update a fiscal year
   */
  async updateFiscalYear(id: number, tenantId: number, data: Partial<InsertFiscalYear>): Promise<FiscalYear> {
    try {
      const [updatedFiscalYear] = await db
        .update(fiscalYears)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(fiscalYears.id, id),
          eq(fiscalYears.tenantId, tenantId)
        ))
        .returning();
      
      return updatedFiscalYear;
    } catch (error) {
      console.error("Error in updateFiscalYear:", error);
      throw error;
    }
  },

  /**
   * Close a fiscal year
   */
  async closeFiscalYear(id: number, tenantId: number): Promise<FiscalYear> {
    try {
      const [closedFiscalYear] = await db
        .update(fiscalYears)
        .set({
          isClosed: true,
          updatedAt: new Date()
        })
        .where(and(
          eq(fiscalYears.id, id),
          eq(fiscalYears.tenantId, tenantId)
        ))
        .returning();
      
      return closedFiscalYear;
    } catch (error) {
      console.error("Error in closeFiscalYear:", error);
      throw error;
    }
  },

  /**
   * Delete a fiscal year
   */
  async deleteFiscalYear(id: number, tenantId: number): Promise<boolean> {
    try {
      const [deleted] = await db
        .delete(fiscalYears)
        .where(and(
          eq(fiscalYears.id, id),
          eq(fiscalYears.tenantId, tenantId)
        ))
        .returning();
      
      return !!deleted;
    } catch (error) {
      console.error("Error in deleteFiscalYear:", error);
      throw error;
    }
  },

  /**
   * Get all accounting periods for a fiscal year
   */
  async getAccountingPeriods(fiscalYearId: number, tenantId: number): Promise<AccountingPeriod[]> {
    try {
      return await db
        .select()
        .from(accountingPeriods)
        .where(and(
          eq(accountingPeriods.fiscalYearId, fiscalYearId),
          eq(accountingPeriods.tenantId, tenantId)
        ))
        .orderBy(accountingPeriods.startDate);
    } catch (error) {
      console.error("Error in getAccountingPeriods:", error);
      throw error;
    }
  },

  /**
   * Get an accounting period by ID
   */
  async getAccountingPeriodById(id: number, tenantId: number): Promise<AccountingPeriod | undefined> {
    try {
      const [period] = await db
        .select()
        .from(accountingPeriods)
        .where(and(
          eq(accountingPeriods.id, id),
          eq(accountingPeriods.tenantId, tenantId)
        ));
      
      return period;
    } catch (error) {
      console.error("Error in getAccountingPeriodById:", error);
      throw error;
    }
  },

  /**
   * Get the current accounting period
   */
  async getCurrentAccountingPeriod(tenantId: number): Promise<AccountingPeriod | undefined> {
    try {
      // Get current date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];
      
      const [currentPeriod] = await db
        .select()
        .from(accountingPeriods)
        .where(and(
          eq(accountingPeriods.tenantId, tenantId),
          lte(accountingPeriods.startDate, today),
          gte(accountingPeriods.endDate, today)
        ));
      
      return currentPeriod;
    } catch (error) {
      console.error("Error in getCurrentAccountingPeriod:", error);
      throw error;
    }
  },

  /**
   * Create a new accounting period
   */
  async createAccountingPeriod(period: InsertAccountingPeriod): Promise<AccountingPeriod> {
    try {
      const [newPeriod] = await db
        .insert(accountingPeriods)
        .values(period)
        .returning();
      
      return newPeriod;
    } catch (error) {
      console.error("Error in createAccountingPeriod:", error);
      throw error;
    }
  },

  /**
   * Update an accounting period
   */
  async updateAccountingPeriod(id: number, tenantId: number, data: Partial<InsertAccountingPeriod>): Promise<AccountingPeriod> {
    try {
      const [updatedPeriod] = await db
        .update(accountingPeriods)
        .set({
          ...data,
          updatedAt: new Date()
        })
        .where(and(
          eq(accountingPeriods.id, id),
          eq(accountingPeriods.tenantId, tenantId)
        ))
        .returning();
      
      return updatedPeriod;
    } catch (error) {
      console.error("Error in updateAccountingPeriod:", error);
      throw error;
    }
  },

  /**
   * Close an accounting period
   */
  async closeAccountingPeriod(id: number, tenantId: number): Promise<AccountingPeriod> {
    try {
      const [closedPeriod] = await db
        .update(accountingPeriods)
        .set({
          isClosed: true,
          updatedAt: new Date()
        })
        .where(and(
          eq(accountingPeriods.id, id),
          eq(accountingPeriods.tenantId, tenantId)
        ))
        .returning();
      
      return closedPeriod;
    } catch (error) {
      console.error("Error in closeAccountingPeriod:", error);
      throw error;
    }
  },

  /**
   * Delete an accounting period
   */
  async deleteAccountingPeriod(id: number, tenantId: number): Promise<boolean> {
    try {
      const [deleted] = await db
        .delete(accountingPeriods)
        .where(and(
          eq(accountingPeriods.id, id),
          eq(accountingPeriods.tenantId, tenantId)
        ))
        .returning();
      
      return !!deleted;
    } catch (error) {
      console.error("Error in deleteAccountingPeriod:", error);
      throw error;
    }
  }
};