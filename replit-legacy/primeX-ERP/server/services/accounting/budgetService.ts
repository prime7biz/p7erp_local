import { db } from "../../db";
import { fiscalYearService } from "./fiscalYearService";
import { chartOfAccountsService } from "./chartOfAccountsService";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

// Define the budget and budget line interfaces
interface Budget {
  id: number;
  name: string;
  description: string | null;
  fiscalYearId: number;
  status: string;
  isActive: boolean;
  tenantId: number;
  createdAt: Date;
  updatedAt: Date;
}

interface BudgetLine {
  id: number;
  budgetId: number;
  accountId: number;
  periodId: number;
  amount: string;
  notes: string | null;
  tenantId: number;
  createdAt: Date;
  updatedAt: Date;
}

// Validation schema for budgets
const budgetSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional().nullable(),
  fiscalYearId: z.number().int().positive("Fiscal year ID is required"),
  status: z.enum(["Draft", "Approved", "Closed"], {
    errorMap: () => ({ message: "Status must be Draft, Approved, or Closed" })
  }).default("Draft"),
  isActive: z.boolean().default(true),
  tenantId: z.number().int().positive()
});

// Validation schema for budget lines
const budgetLineSchema = z.object({
  budgetId: z.number().int().positive("Budget ID is required"),
  accountId: z.number().int().positive("Account ID is required"),
  periodId: z.number().int().positive("Period ID is required"),
  amount: z.string().min(1, "Amount is required"),
  notes: z.string().optional().nullable(),
  tenantId: z.number().int().positive()
});

export const budgetService = {
  /**
   * Get all budgets for a tenant
   */
  async getAllBudgets(tenantId: number, options: {
    fiscalYearId?: number;
    status?: string;
    activeOnly?: boolean;
  } = {}): Promise<Budget[]> {
    try {
      let query = db.select().from({ b: 'budgets' }).where(eq('b.tenant_id', tenantId));
      
      if (options.fiscalYearId) {
        query = query.where(eq('b.fiscal_year_id', options.fiscalYearId));
      }
      
      if (options.status) {
        query = query.where(eq('b.status', options.status));
      }
      
      if (options.activeOnly) {
        query = query.where(eq('b.is_active', true));
      }
      
      const results = await query.orderBy('b.name');
      
      return results.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        fiscalYearId: row.fiscal_year_id,
        status: row.status,
        isActive: row.is_active,
        tenantId: row.tenant_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error("Error in getAllBudgets:", error);
      throw error;
    }
  },

  /**
   * Get a budget by ID
   */
  async getBudgetById(id: number, tenantId: number): Promise<Budget | undefined> {
    try {
      const [result] = await db
        .select()
        .from({ b: 'budgets' })
        .where(and(
          eq('b.id', id),
          eq('b.tenant_id', tenantId)
        ));
      
      if (!result) return undefined;
      
      return {
        id: result.id,
        name: result.name,
        description: result.description,
        fiscalYearId: result.fiscal_year_id,
        status: result.status,
        isActive: result.is_active,
        tenantId: result.tenant_id,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      };
    } catch (error) {
      console.error("Error in getBudgetById:", error);
      throw error;
    }
  },

  /**
   * Create a new budget with validation
   */
  async createBudget(data: any): Promise<Budget> {
    // Validate the budget data
    const validatedData = budgetSchema.parse(data);
    
    // Check if fiscal year exists
    const fiscalYear = await fiscalYearService.getFiscalYearById(
      validatedData.fiscalYearId, 
      validatedData.tenantId
    );
    
    if (!fiscalYear) {
      throw new Error("Invalid fiscal year");
    }
    
    try {
      const [result] = await db
        .insert('budgets')
        .values({
          name: validatedData.name,
          description: validatedData.description,
          fiscal_year_id: validatedData.fiscalYearId,
          status: validatedData.status,
          is_active: validatedData.isActive,
          tenant_id: validatedData.tenantId,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning();
      
      return {
        id: result.id,
        name: result.name,
        description: result.description,
        fiscalYearId: result.fiscal_year_id,
        status: result.status,
        isActive: result.is_active,
        tenantId: result.tenant_id,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      };
    } catch (error) {
      console.error("Error in createBudget:", error);
      throw error;
    }
  },

  /**
   * Update a budget with validation
   */
  async updateBudget(id: number, tenantId: number, data: any): Promise<Budget> {
    // Validate the update data (partial validation)
    const validatedData = budgetSchema.partial().parse(data);
    
    // Check if budget exists
    const existingBudget = await this.getBudgetById(id, tenantId);
    if (!existingBudget) {
      throw new Error("Budget not found");
    }
    
    // If status is being changed to "Approved" or "Closed", validate that it's allowed
    if (validatedData.status) {
      if (existingBudget.status === "Closed") {
        throw new Error("Cannot update a closed budget");
      }
      
      if (validatedData.status === "Approved" && existingBudget.status === "Draft") {
        // Ensure budget lines exist
        const budgetLines = await this.getBudgetLines(id, tenantId);
        if (budgetLines.length === 0) {
          throw new Error("Cannot approve a budget with no budget lines");
        }
      }
      
      if (validatedData.status === "Closed" && existingBudget.status !== "Approved") {
        throw new Error("Only approved budgets can be closed");
      }
    }
    
    // If fiscal year is being changed, validate it
    if (validatedData.fiscalYearId && validatedData.fiscalYearId !== existingBudget.fiscalYearId) {
      const fiscalYear = await fiscalYearService.getFiscalYearById(
        validatedData.fiscalYearId, 
        tenantId
      );
      
      if (!fiscalYear) {
        throw new Error("Invalid fiscal year");
      }
      
      // If the budget has lines, validate they're compatible with the new fiscal year
      const budgetLines = await this.getBudgetLines(id, tenantId);
      if (budgetLines.length > 0) {
        // Get the periods for the new fiscal year
        const periods = await fiscalYearService.getAccountingPeriods(
          validatedData.fiscalYearId, 
          tenantId
        );
        
        const periodIds = periods.map(p => p.id);
        
        // Check if all budget lines have compatible periods
        const incompatibleLines = budgetLines.filter(line => !periodIds.includes(line.periodId));
        
        if (incompatibleLines.length > 0) {
          throw new Error(
            `Cannot change fiscal year because ${incompatibleLines.length} budget lines have incompatible periods`
          );
        }
      }
    }
    
    try {
      const [result] = await db
        .update('budgets')
        .set({
          ...(validatedData.name && { name: validatedData.name }),
          ...(validatedData.description !== undefined && { description: validatedData.description }),
          ...(validatedData.fiscalYearId && { fiscal_year_id: validatedData.fiscalYearId }),
          ...(validatedData.status && { status: validatedData.status }),
          ...(validatedData.isActive !== undefined && { is_active: validatedData.isActive }),
          updated_at: new Date()
        })
        .where(and(
          eq('id', id),
          eq('tenant_id', tenantId)
        ))
        .returning();
      
      return {
        id: result.id,
        name: result.name,
        description: result.description,
        fiscalYearId: result.fiscal_year_id,
        status: result.status,
        isActive: result.is_active,
        tenantId: result.tenant_id,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      };
    } catch (error) {
      console.error("Error in updateBudget:", error);
      throw error;
    }
  },

  /**
   * Delete a budget
   */
  async deleteBudget(id: number, tenantId: number): Promise<boolean> {
    // Check if budget exists
    const existingBudget = await this.getBudgetById(id, tenantId);
    if (!existingBudget) {
      throw new Error("Budget not found");
    }
    
    // Only draft budgets can be deleted
    if (existingBudget.status !== "Draft") {
      throw new Error("Only draft budgets can be deleted");
    }
    
    try {
      return await db.transaction(async (tx) => {
        // Delete budget lines first
        await tx
          .delete('budget_lines')
          .where(and(
            eq('budget_id', id),
            eq('tenant_id', tenantId)
          ));
        
        // Delete the budget
        const result = await tx
          .delete('budgets')
          .where(and(
            eq('id', id),
            eq('tenant_id', tenantId)
          ))
          .returning();
        
        return result.length > 0;
      });
    } catch (error) {
      console.error("Error in deleteBudget:", error);
      throw error;
    }
  },

  /**
   * Get all budget lines for a budget
   */
  async getBudgetLines(budgetId: number, tenantId: number): Promise<BudgetLine[]> {
    try {
      const results = await db
        .select()
        .from({ bl: 'budget_lines' })
        .where(and(
          eq('bl.budget_id', budgetId),
          eq('bl.tenant_id', tenantId)
        ))
        .orderBy('bl.period_id', 'bl.account_id');
      
      return results.map(row => ({
        id: row.id,
        budgetId: row.budget_id,
        accountId: row.account_id,
        periodId: row.period_id,
        amount: row.amount,
        notes: row.notes,
        tenantId: row.tenant_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error("Error in getBudgetLines:", error);
      throw error;
    }
  },

  /**
   * Get a budget line by ID
   */
  async getBudgetLineById(id: number, tenantId: number): Promise<BudgetLine | undefined> {
    try {
      const [result] = await db
        .select()
        .from({ bl: 'budget_lines' })
        .where(and(
          eq('bl.id', id),
          eq('bl.tenant_id', tenantId)
        ));
      
      if (!result) return undefined;
      
      return {
        id: result.id,
        budgetId: result.budget_id,
        accountId: result.account_id,
        periodId: result.period_id,
        amount: result.amount,
        notes: result.notes,
        tenantId: result.tenant_id,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      };
    } catch (error) {
      console.error("Error in getBudgetLineById:", error);
      throw error;
    }
  },

  /**
   * Create a new budget line with validation
   */
  async createBudgetLine(data: any): Promise<BudgetLine> {
    // Validate the budget line data
    const validatedData = budgetLineSchema.parse(data);
    
    // Check if budget exists
    const budget = await this.getBudgetById(
      validatedData.budgetId, 
      validatedData.tenantId
    );
    
    if (!budget) {
      throw new Error("Invalid budget");
    }
    
    // Only draft budgets can have lines added
    if (budget.status !== "Draft") {
      throw new Error("Can only add lines to draft budgets");
    }
    
    // Check if account exists
    const account = await chartOfAccountsService.getAccountById(
      validatedData.accountId, 
      validatedData.tenantId
    );
    
    if (!account) {
      throw new Error("Invalid account");
    }
    
    // Check if period exists and belongs to the budget's fiscal year
    const period = await fiscalYearService.getAccountingPeriodById(
      validatedData.periodId, 
      validatedData.tenantId
    );
    
    if (!period) {
      throw new Error("Invalid accounting period");
    }
    
    if (period.fiscalYearId !== budget.fiscalYearId) {
      throw new Error("Accounting period must belong to the budget's fiscal year");
    }
    
    // Check if a budget line already exists for this account and period
    const existingLines = await this.getBudgetLines(validatedData.budgetId, validatedData.tenantId);
    const duplicateLine = existingLines.find(
      line => line.accountId === validatedData.accountId && line.periodId === validatedData.periodId
    );
    
    if (duplicateLine) {
      throw new Error("A budget line already exists for this account and period");
    }
    
    try {
      const [result] = await db
        .insert('budget_lines')
        .values({
          budget_id: validatedData.budgetId,
          account_id: validatedData.accountId,
          period_id: validatedData.periodId,
          amount: validatedData.amount,
          notes: validatedData.notes,
          tenant_id: validatedData.tenantId,
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning();
      
      return {
        id: result.id,
        budgetId: result.budget_id,
        accountId: result.account_id,
        periodId: result.period_id,
        amount: result.amount,
        notes: result.notes,
        tenantId: result.tenant_id,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      };
    } catch (error) {
      console.error("Error in createBudgetLine:", error);
      throw error;
    }
  },

  /**
   * Update a budget line with validation
   */
  async updateBudgetLine(id: number, tenantId: number, data: any): Promise<BudgetLine> {
    // Validate the update data (partial validation)
    const validatedData = budgetLineSchema.partial().parse(data);
    
    // Check if budget line exists
    const existingLine = await this.getBudgetLineById(id, tenantId);
    if (!existingLine) {
      throw new Error("Budget line not found");
    }
    
    // Check if budget exists and is in draft status
    const budget = await this.getBudgetById(existingLine.budgetId, tenantId);
    if (!budget) {
      throw new Error("Invalid budget");
    }
    
    // Only draft budgets can have lines updated
    if (budget.status !== "Draft") {
      throw new Error("Can only update lines in draft budgets");
    }
    
    // If account is being changed, validate it
    if (validatedData.accountId && validatedData.accountId !== existingLine.accountId) {
      const account = await chartOfAccountsService.getAccountById(
        validatedData.accountId, 
        tenantId
      );
      
      if (!account) {
        throw new Error("Invalid account");
      }
      
      // Check if a budget line already exists for this account and period
      const existingLines = await this.getBudgetLines(existingLine.budgetId, tenantId);
      const periodId = validatedData.periodId || existingLine.periodId;
      
      const duplicateLine = existingLines.find(
        line => line.id !== id && line.accountId === validatedData.accountId && line.periodId === periodId
      );
      
      if (duplicateLine) {
        throw new Error("A budget line already exists for this account and period");
      }
    }
    
    // If period is being changed, validate it
    if (validatedData.periodId && validatedData.periodId !== existingLine.periodId) {
      const period = await fiscalYearService.getAccountingPeriodById(
        validatedData.periodId, 
        tenantId
      );
      
      if (!period) {
        throw new Error("Invalid accounting period");
      }
      
      if (period.fiscalYearId !== budget.fiscalYearId) {
        throw new Error("Accounting period must belong to the budget's fiscal year");
      }
      
      // Check if a budget line already exists for this account and period
      const existingLines = await this.getBudgetLines(existingLine.budgetId, tenantId);
      const accountId = validatedData.accountId || existingLine.accountId;
      
      const duplicateLine = existingLines.find(
        line => line.id !== id && line.accountId === accountId && line.periodId === validatedData.periodId
      );
      
      if (duplicateLine) {
        throw new Error("A budget line already exists for this account and period");
      }
    }
    
    try {
      const [result] = await db
        .update('budget_lines')
        .set({
          ...(validatedData.accountId && { account_id: validatedData.accountId }),
          ...(validatedData.periodId && { period_id: validatedData.periodId }),
          ...(validatedData.amount && { amount: validatedData.amount }),
          ...(validatedData.notes !== undefined && { notes: validatedData.notes }),
          updated_at: new Date()
        })
        .where(and(
          eq('id', id),
          eq('tenant_id', tenantId)
        ))
        .returning();
      
      return {
        id: result.id,
        budgetId: result.budget_id,
        accountId: result.account_id,
        periodId: result.period_id,
        amount: result.amount,
        notes: result.notes,
        tenantId: result.tenant_id,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      };
    } catch (error) {
      console.error("Error in updateBudgetLine:", error);
      throw error;
    }
  },

  /**
   * Delete a budget line
   */
  async deleteBudgetLine(id: number, tenantId: number): Promise<boolean> {
    // Check if budget line exists
    const existingLine = await this.getBudgetLineById(id, tenantId);
    if (!existingLine) {
      throw new Error("Budget line not found");
    }
    
    // Check if budget is in draft status
    const budget = await this.getBudgetById(existingLine.budgetId, tenantId);
    if (!budget) {
      throw new Error("Invalid budget");
    }
    
    // Only draft budgets can have lines deleted
    if (budget.status !== "Draft") {
      throw new Error("Can only delete lines from draft budgets");
    }
    
    try {
      const result = await db
        .delete('budget_lines')
        .where(and(
          eq('id', id),
          eq('tenant_id', tenantId)
        ))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error("Error in deleteBudgetLine:", error);
      throw error;
    }
  },

  /**
   * Bulk import budget lines from CSV or JSON data
   */
  async importBudgetLines(budgetId: number, tenantId: number, data: any[]): Promise<{
    success: number;
    failed: number;
    errors: { row: number; error: string }[];
  }> {
    // Check if budget exists and is in draft status
    const budget = await this.getBudgetById(budgetId, tenantId);
    if (!budget) {
      throw new Error("Invalid budget");
    }
    
    // Only draft budgets can have lines imported
    if (budget.status !== "Draft") {
      throw new Error("Can only import lines to draft budgets");
    }
    
    // Get all accounts and periods for validation
    const accounts = await chartOfAccountsService.getAllAccounts(tenantId, true);
    const accountMap = new Map(accounts.map(account => [account.accountNumber, account.id]));
    
    const periods = await fiscalYearService.getAccountingPeriods(budget.fiscalYearId, tenantId);
    const periodMap = new Map(periods.map(period => [period.name, period.id]));
    
    // Get existing budget lines to check for duplicates
    const existingLines = await this.getBudgetLines(budgetId, tenantId);
    
    const results = {
      success: 0,
      failed: 0,
      errors: [] as { row: number; error: string }[]
    };
    
    // Process each row
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      try {
        // Validate required fields
        if (!row.accountNumber && !row.accountId) {
          throw new Error("Account number or ID is required");
        }
        
        if (!row.periodName && !row.periodId) {
          throw new Error("Period name or ID is required");
        }
        
        if (!row.amount) {
          throw new Error("Amount is required");
        }
        
        // Resolve account ID
        let accountId: number;
        if (row.accountId) {
          // Check if account exists
          const account = await chartOfAccountsService.getAccountById(row.accountId, tenantId);
          if (!account) {
            throw new Error(`Account with ID ${row.accountId} not found`);
          }
          accountId = account.id;
        } else {
          // Look up account by number
          const id = accountMap.get(row.accountNumber);
          if (!id) {
            throw new Error(`Account with number ${row.accountNumber} not found`);
          }
          accountId = id;
        }
        
        // Resolve period ID
        let periodId: number;
        if (row.periodId) {
          // Check if period exists and belongs to the budget's fiscal year
          const period = await fiscalYearService.getAccountingPeriodById(row.periodId, tenantId);
          if (!period) {
            throw new Error(`Period with ID ${row.periodId} not found`);
          }
          if (period.fiscalYearId !== budget.fiscalYearId) {
            throw new Error(`Period with ID ${row.periodId} does not belong to the budget's fiscal year`);
          }
          periodId = period.id;
        } else {
          // Look up period by name
          const id = periodMap.get(row.periodName);
          if (!id) {
            throw new Error(`Period with name ${row.periodName} not found`);
          }
          periodId = id;
        }
        
        // Check for duplicate
        const duplicate = existingLines.find(
          line => line.accountId === accountId && line.periodId === periodId
        );
        
        if (duplicate) {
          throw new Error(`A budget line already exists for this account and period`);
        }
        
        // Create the budget line
        await this.createBudgetLine({
          budgetId,
          accountId,
          periodId,
          amount: row.amount.toString(),
          notes: row.notes || null,
          tenantId
        });
        
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          row: i + 1, // 1-based row number for user-friendly reporting
          error: error.message
        });
      }
    }
    
    return results;
  },

  /**
   * Get budget vs. actual report for a period
   */
  async getBudgetVsActualReport(budgetId: number, tenantId: number, options: {
    periodId?: number;
    startDate?: string;
    endDate?: string;
    accountTypeId?: number;
  } = {}): Promise<any[]> {
    // Check if budget exists
    const budget = await this.getBudgetById(budgetId, tenantId);
    if (!budget) {
      throw new Error("Invalid budget");
    }
    
    try {
      // Build the SQL query for budget vs. actual report
      const query = `
        WITH budget_data AS (
          SELECT 
            bl.account_id,
            SUM(CAST(bl.amount AS DECIMAL(15,2))) AS budget_amount
          FROM budget_lines bl
          WHERE bl.budget_id = $1 AND bl.tenant_id = $2
          ${options.periodId ? 'AND bl.period_id = $3' : ''}
          GROUP BY bl.account_id
        ),
        actual_data AS (
          SELECT 
            jl.account_id,
            SUM(CAST(jl.debit_amount AS DECIMAL(15,2)) - CAST(jl.credit_amount AS DECIMAL(15,2))) AS actual_amount
          FROM journal_lines jl
          JOIN journals j ON j.id = jl.journal_id AND j.tenant_id = jl.tenant_id
          WHERE j.tenant_id = $2 AND j.status = 'Posted'
          ${options.startDate ? 'AND j.journal_date >= $4' : ''}
          ${options.endDate ? 'AND j.journal_date <= $5' : ''}
          GROUP BY jl.account_id
        )
        SELECT 
          coa.id AS account_id,
          coa.account_number,
          coa.name AS account_name,
          at.id AS account_type_id,
          at.name AS account_type,
          at.category AS account_category,
          COALESCE(bd.budget_amount, 0) AS budget_amount,
          COALESCE(ad.actual_amount, 0) AS actual_amount,
          COALESCE(bd.budget_amount, 0) - COALESCE(ad.actual_amount, 0) AS variance,
          CASE 
            WHEN COALESCE(bd.budget_amount, 0) = 0 THEN 0
            ELSE (COALESCE(ad.actual_amount, 0) / COALESCE(bd.budget_amount, 0)) * 100
          END AS percent_of_budget
        FROM chart_of_accounts coa
        JOIN account_types at ON at.id = coa.account_type_id AND at.tenant_id = coa.tenant_id
        LEFT JOIN budget_data bd ON bd.account_id = coa.id
        LEFT JOIN actual_data ad ON ad.account_id = coa.id
        WHERE coa.tenant_id = $2
        ${options.accountTypeId ? 'AND at.id = $6' : ''}
        ORDER BY coa.account_number
      `;
      
      // Build params array
      const params = [budgetId, tenantId];
      if (options.periodId) params.push(options.periodId);
      if (options.startDate) params.push(options.startDate);
      if (options.endDate) params.push(options.endDate);
      if (options.accountTypeId) params.push(options.accountTypeId);
      
      // Execute the query
      const result = await db.execute(query, params);
      
      return result.rows;
    } catch (error) {
      console.error("Error in getBudgetVsActualReport:", error);
      throw error;
    }
  },

  /**
   * Get budget trend report by period
   */
  async getBudgetTrendReport(budgetId: number, tenantId: number, options: {
    accountIds?: number[];
    accountTypeId?: number;
  } = {}): Promise<any[]> {
    // Check if budget exists
    const budget = await this.getBudgetById(budgetId, tenantId);
    if (!budget) {
      throw new Error("Invalid budget");
    }
    
    try {
      // Build the SQL query for budget trend report
      const query = `
        WITH periods AS (
          SELECT 
            ap.id,
            ap.name,
            ap.start_date,
            ap.end_date
          FROM accounting_periods ap
          WHERE ap.fiscal_year_id = $3 AND ap.tenant_id = $2
          ORDER BY ap.start_date
        ),
        budget_data AS (
          SELECT 
            bl.account_id,
            bl.period_id,
            CAST(bl.amount AS DECIMAL(15,2)) AS budget_amount
          FROM budget_lines bl
          WHERE bl.budget_id = $1 AND bl.tenant_id = $2
          ${options.accountIds && options.accountIds.length > 0 
            ? 'AND bl.account_id IN (' + options.accountIds.join(',') + ')' 
            : ''}
        ),
        actual_data AS (
          SELECT 
            jl.account_id,
            ap.id AS period_id,
            SUM(CAST(jl.debit_amount AS DECIMAL(15,2)) - CAST(jl.credit_amount AS DECIMAL(15,2))) AS actual_amount
          FROM journal_lines jl
          JOIN journals j ON j.id = jl.journal_id AND j.tenant_id = jl.tenant_id
          JOIN accounting_periods ap ON j.journal_date BETWEEN ap.start_date AND ap.end_date AND ap.tenant_id = j.tenant_id
          WHERE j.tenant_id = $2 AND j.status = 'Posted' AND ap.fiscal_year_id = $3
          ${options.accountIds && options.accountIds.length > 0 
            ? 'AND jl.account_id IN (' + options.accountIds.join(',') + ')' 
            : ''}
          GROUP BY jl.account_id, ap.id
        )
        SELECT 
          coa.id AS account_id,
          coa.account_number,
          coa.name AS account_name,
          at.id AS account_type_id,
          at.name AS account_type,
          at.category AS account_category,
          p.id AS period_id,
          p.name AS period_name,
          p.start_date,
          p.end_date,
          COALESCE(bd.budget_amount, 0) AS budget_amount,
          COALESCE(ad.actual_amount, 0) AS actual_amount,
          COALESCE(bd.budget_amount, 0) - COALESCE(ad.actual_amount, 0) AS variance,
          CASE 
            WHEN COALESCE(bd.budget_amount, 0) = 0 THEN 0
            ELSE (COALESCE(ad.actual_amount, 0) / COALESCE(bd.budget_amount, 0)) * 100
          END AS percent_of_budget
        FROM chart_of_accounts coa
        JOIN account_types at ON at.id = coa.account_type_id AND at.tenant_id = coa.tenant_id
        CROSS JOIN periods p
        LEFT JOIN budget_data bd ON bd.account_id = coa.id AND bd.period_id = p.id
        LEFT JOIN actual_data ad ON ad.account_id = coa.id AND ad.period_id = p.id
        WHERE coa.tenant_id = $2
        ${options.accountTypeId ? 'AND at.id = $4' : ''}
        ${options.accountIds && options.accountIds.length > 0 
          ? 'AND coa.id IN (' + options.accountIds.join(',') + ')' 
          : ''}
        ORDER BY coa.account_number, p.start_date
      `;
      
      // Build params array
      const params = [budgetId, tenantId, budget.fiscalYearId];
      if (options.accountTypeId) params.push(options.accountTypeId);
      
      // Execute the query
      const result = await db.execute(query, params);
      
      return result.rows;
    } catch (error) {
      console.error("Error in getBudgetTrendReport:", error);
      throw error;
    }
  },

  /**
   * Generate AI-powered budget suggestions based on historical data
   */
  async generateBudgetSuggestions(fiscalYearId: number, tenantId: number, options: {
    previousFiscalYearId?: number;
    growthRate?: number;
    seasonalityAdjustment?: boolean;
    includeOnlyActiveAccounts?: boolean;
  } = {}): Promise<any[]> {
    // Check if fiscal year exists
    const fiscalYear = await fiscalYearService.getFiscalYearById(fiscalYearId, tenantId);
    if (!fiscalYear) {
      throw new Error("Invalid fiscal year");
    }

    // Default options
    const growthRate = options.growthRate || 0;
    const seasonalityAdjustment = options.seasonalityAdjustment !== false;
    const includeOnlyActiveAccounts = options.includeOnlyActiveAccounts !== false;
    
    try {
      // Get periods for the fiscal year
      const periods = await fiscalYearService.getAccountingPeriods(fiscalYearId, tenantId);
      if (periods.length === 0) {
        throw new Error("Fiscal year has no accounting periods");
      }

      // Get active accounts
      const accounts = await chartOfAccountsService.getAllAccounts(
        tenantId, 
        includeOnlyActiveAccounts
      );

      // Get historical data
      let historicalData: any[] = [];
      
      if (options.previousFiscalYearId) {
        // If previous fiscal year is specified, use its data
        const previousYear = await fiscalYearService.getFiscalYearById(
          options.previousFiscalYearId, 
          tenantId
        );
        
        if (!previousYear) {
          throw new Error("Invalid previous fiscal year");
        }
        
        // Get previous year's budget if exists
        const previousYearBudgets = await this.getAllBudgets(tenantId, {
          fiscalYearId: options.previousFiscalYearId,
          status: "Approved"
        });
        
        if (previousYearBudgets.length > 0) {
          // Use the first approved budget from previous year
          const previousBudget = previousYearBudgets[0];
          const previousBudgetLines = await this.getBudgetLines(previousBudget.id, tenantId);
          
          // Map budget lines to historical data
          for (const line of previousBudgetLines) {
            historicalData.push({
              accountId: line.accountId,
              amount: parseFloat(line.amount),
              periodId: line.periodId
            });
          }
        } else {
          // Get actual transaction data from previous year
          const query = `
            SELECT 
              jl.account_id,
              ap.id AS period_id,
              SUM(CAST(jl.debit_amount AS DECIMAL(15,2)) - CAST(jl.credit_amount AS DECIMAL(15,2))) AS amount
            FROM journal_lines jl
            JOIN journals j ON j.id = jl.journal_id AND j.tenant_id = jl.tenant_id
            JOIN accounting_periods ap ON j.journal_date BETWEEN ap.start_date AND ap.end_date AND ap.tenant_id = j.tenant_id
            WHERE j.tenant_id = $1 AND j.status = 'Posted' AND ap.fiscal_year_id = $2
            GROUP BY jl.account_id, ap.id
          `;
          
          const result = await db.execute(query, [tenantId, options.previousFiscalYearId]);
          historicalData = result.rows;
        }
      } else {
        // If no previous fiscal year, use the last 12 months of transaction data
        const query = `
          SELECT 
            jl.account_id,
            EXTRACT(MONTH FROM j.journal_date) AS month,
            SUM(CAST(jl.debit_amount AS DECIMAL(15,2)) - CAST(jl.credit_amount AS DECIMAL(15,2))) AS amount
          FROM journal_lines jl
          JOIN journals j ON j.id = jl.journal_id AND j.tenant_id = jl.tenant_id
          WHERE j.tenant_id = $1 AND j.status = 'Posted' 
            AND j.journal_date >= NOW() - INTERVAL '1 year'
          GROUP BY jl.account_id, EXTRACT(MONTH FROM j.journal_date)
        `;
        
        const result = await db.execute(query, [tenantId]);
        
        // Map month-based data to periods
        const monthToPeriodMap = new Map();
        for (const period of periods) {
          const startDate = new Date(period.startDate);
          const endDate = new Date(period.endDate);
          
          // Get all months that fall within this period
          const startMonth = startDate.getMonth() + 1; // 1-based month
          const endMonth = endDate.getMonth() + 1; // 1-based month
          
          if (startMonth === endMonth) {
            monthToPeriodMap.set(startMonth, period.id);
          } else {
            // Handle periods that span multiple months
            let month = startMonth;
            while (month !== endMonth) {
              monthToPeriodMap.set(month, period.id);
              month = month % 12 + 1; // Wrap around to January after December
            }
            monthToPeriodMap.set(endMonth, period.id);
          }
        }
        
        // Transform month-based data to period-based
        for (const row of result.rows) {
          const periodId = monthToPeriodMap.get(row.month);
          if (periodId) {
            historicalData.push({
              accountId: row.account_id,
              periodId,
              amount: parseFloat(row.amount)
            });
          }
        }
      }
      
      // Generate budget suggestions
      const suggestions = [];
      
      for (const account of accounts) {
        for (const period of periods) {
          // Find historical data for this account and period
          const historicalAmount = historicalData.find(
            d => d.accountId === account.id && d.periodId === period.id
          )?.amount || 0;
          
          // Apply growth rate
          let suggestedAmount = historicalAmount * (1 + growthRate / 100);
          
          // Apply seasonality adjustment if enabled
          if (seasonalityAdjustment) {
            // Get month of the period
            const periodMonth = new Date(period.startDate).getMonth();
            
            // Simple seasonality factors
            const seasonalityFactors = [
              1.0,  // January
              1.0,  // February
              1.1,  // March (end of quarter)
              1.0,  // April
              1.0,  // May
              1.1,  // June (end of quarter)
              1.0,  // July
              1.0,  // August
              1.1,  // September (end of quarter)
              1.0,  // October
              1.0,  // November
              1.2   // December (end of year)
            ];
            
            suggestedAmount *= seasonalityFactors[periodMonth];
          }
          
          // Round to 2 decimal places
          suggestedAmount = Math.round(suggestedAmount * 100) / 100;
          
          suggestions.push({
            accountId: account.id,
            accountNumber: account.accountNumber,
            accountName: account.name,
            periodId: period.id,
            periodName: period.name,
            historicalAmount,
            suggestedAmount,
            reasoning: suggestedAmount > historicalAmount 
              ? `Increased by ${growthRate}% growth rate${seasonalityAdjustment ? ' with seasonal adjustment' : ''}`
              : `Based on historical data${seasonalityAdjustment ? ' with seasonal adjustment' : ''}`
          });
        }
      }
      
      return suggestions;
    } catch (error) {
      console.error("Error in generateBudgetSuggestions:", error);
      throw error;
    }
  }
};