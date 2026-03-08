import { accountTypeStorage } from "../../database/accounting/accountTypeStorage";
import { z } from "zod";

// Validation schema for account types
const accountTypeSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  code: z.string().min(1, "Code is required").max(20),
  category: z.enum([
    "Asset", 
    "Liability", 
    "Equity", 
    "Revenue", 
    "Expense"
  ], {
    errorMap: () => ({ message: "Category must be Asset, Liability, Equity, Revenue or Expense" })
  }),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  tenantId: z.number().int().positive()
});

export const accountTypeService = {
  /**
   * Get all account types for a tenant
   */
  async getAllAccountTypes(tenantId: number, activeOnly: boolean = false) {
    return accountTypeStorage.getAllAccountTypes(tenantId, activeOnly);
  },

  /**
   * Get an account type by ID
   */
  async getAccountTypeById(id: number, tenantId: number) {
    return accountTypeStorage.getAccountTypeById(id, tenantId);
  },

  /**
   * Create a new account type with validation
   */
  async createAccountType(data: any) {
    // Validate the account type data
    const validatedData = accountTypeSchema.parse(data);
    
    // Check if account type with same code already exists
    const existingType = await accountTypeStorage.getAccountTypeByCode(
      validatedData.code, 
      validatedData.tenantId
    );
    
    if (existingType) {
      throw new Error(`Account type with code ${validatedData.code} already exists`);
    }
    
    return accountTypeStorage.createAccountType(validatedData);
  },

  /**
   * Update an account type with validation
   */
  async updateAccountType(id: number, tenantId: number, data: any) {
    // Validate the update data (partial validation)
    const validatedData = accountTypeSchema.partial().parse(data);
    
    // Check if account type exists
    const existingType = await accountTypeStorage.getAccountTypeById(id, tenantId);
    if (!existingType) {
      throw new Error("Account type not found");
    }
    
    // If code is being changed, check if new code already exists
    if (validatedData.code && validatedData.code !== existingType.code) {
      const typeWithCode = await accountTypeStorage.getAccountTypeByCode(
        validatedData.code, 
        tenantId
      );
      
      if (typeWithCode && typeWithCode.id !== id) {
        throw new Error(`Account type with code ${validatedData.code} already exists`);
      }
    }
    
    return accountTypeStorage.updateAccountType(id, tenantId, validatedData);
  },

  /**
   * Delete an account type
   */
  async deleteAccountType(id: number, tenantId: number) {
    // Check if account type exists
    const existingType = await accountTypeStorage.getAccountTypeById(id, tenantId);
    if (!existingType) {
      throw new Error("Account type not found");
    }
    
    // TODO: Check if account type is used by any chart of accounts
    
    return accountTypeStorage.deleteAccountType(id, tenantId);
  },

  /**
   * Get account types by category
   */
  async getAccountTypesByCategory(category: string, tenantId: number) {
    // Validate category
    if (!['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].includes(category)) {
      throw new Error("Invalid category. Must be one of: Asset, Liability, Equity, Revenue, Expense");
    }
    
    return accountTypeStorage.getAccountTypesByCategory(category, tenantId);
  },

  /**
   * Initialize default account types for a new tenant
   */
  async initializeDefaultAccountTypes(tenantId: number) {
    // Default account types for garment manufacturing
    const defaultTypes = [
      // Asset account types
      { name: "Current Assets", code: "CA", category: "Asset", description: "Short-term assets that are expected to be converted to cash within one year", tenantId },
      { name: "Cash and Equivalents", code: "CE", category: "Asset", description: "Cash on hand and in bank accounts", tenantId },
      { name: "Accounts Receivable", code: "AR", category: "Asset", description: "Amounts owed to the company by customers", tenantId },
      { name: "Inventory", code: "INV", category: "Asset", description: "Raw materials, work in progress, and finished goods", tenantId },
      { name: "Fixed Assets", code: "FA", category: "Asset", description: "Long-term tangible assets such as land, buildings, and equipment", tenantId },
      { name: "Machinery and Equipment", code: "ME", category: "Asset", description: "Production machinery and equipment", tenantId },
      
      // Liability account types
      { name: "Current Liabilities", code: "CL", category: "Liability", description: "Short-term debts that are due within one year", tenantId },
      { name: "Accounts Payable", code: "AP", category: "Liability", description: "Amounts owed by the company to vendors", tenantId },
      { name: "Accrued Liabilities", code: "AL", category: "Liability", description: "Expenses that have been incurred but not yet paid", tenantId },
      { name: "Long-term Liabilities", code: "LTL", category: "Liability", description: "Debts due beyond one year", tenantId },
      { name: "Loans and Mortgages", code: "LM", category: "Liability", description: "Long-term borrowings", tenantId },
      
      // Equity account types
      { name: "Capital", code: "CAP", category: "Equity", description: "Owner's or shareholders' investment in the business", tenantId },
      { name: "Retained Earnings", code: "RE", category: "Equity", description: "Accumulated profits reinvested in the business", tenantId },
      
      // Revenue account types
      { name: "Sales Revenue", code: "SR", category: "Revenue", description: "Income from sales of garments and products", tenantId },
      { name: "Export Sales", code: "ES", category: "Revenue", description: "Income from international sales", tenantId },
      { name: "Domestic Sales", code: "DS", category: "Revenue", description: "Income from domestic sales", tenantId },
      { name: "Other Income", code: "OI", category: "Revenue", description: "Income from sources other than primary business operations", tenantId },
      
      // Expense account types
      { name: "Cost of Goods Sold", code: "COGS", category: "Expense", description: "Direct costs of producing goods sold", tenantId },
      { name: "Material Costs", code: "MC", category: "Expense", description: "Costs of fabric, thread, buttons, and other materials", tenantId },
      { name: "Labor Costs", code: "LC", category: "Expense", description: "Wages and benefits for production workers", tenantId },
      { name: "Manufacturing Overhead", code: "MO", category: "Expense", description: "Indirect costs of production", tenantId },
      { name: "Operating Expenses", code: "OE", category: "Expense", description: "Expenses related to business operations", tenantId },
      { name: "Selling Expenses", code: "SE", category: "Expense", description: "Costs related to marketing and selling products", tenantId },
      { name: "Administrative Expenses", code: "AE", category: "Expense", description: "Office and administrative costs", tenantId },
      { name: "Depreciation", code: "DEP", category: "Expense", description: "Allocation of asset costs over useful life", tenantId },
      { name: "Taxes", code: "TAX", category: "Expense", description: "Income and other taxes", tenantId }
    ];

    // Create all default account types
    for (const type of defaultTypes) {
      try {
        // Skip if account type with same code already exists
        const existing = await accountTypeStorage.getAccountTypeByCode(type.code, tenantId);
        if (!existing) {
          await accountTypeStorage.createAccountType(type);
        }
      } catch (error) {
        console.error(`Error creating default account type ${type.code}:`, error);
        // Continue with other types even if one fails
      }
    }

    return true;
  }
};