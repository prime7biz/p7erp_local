import { chartOfAccountsStorage } from "../../database/accounting/chartOfAccountsStorage";
import { accountTypeService } from "./accountTypeService";
import { z } from "zod";

// Validation schema for chart of accounts
const chartOfAccountSchema = z.object({
  accountNumber: z.string().min(1, "Account number is required").max(20),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional().nullable(),
  accountTypeId: z.number().int().positive("Account type ID is required"),
  parentAccountId: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().default(true),
  isCashAccount: z.boolean().default(false),
  isBankAccount: z.boolean().default(false),
  isControlAccount: z.boolean().default(false),
  currentBalance: z.string().default("0"),
  openingBalance: z.string().default("0"),
  tax: z.string().optional().nullable(),
  taxPercentage: z.string().optional().nullable(),
  revalued: z.boolean().default(false),
  tenantId: z.number().int().positive()
});

export const chartOfAccountsService = {
  /**
   * Get all chart of accounts for a tenant
   */
  async getAllAccounts(tenantId: number, activeOnly: boolean = false) {
    return chartOfAccountsStorage.getAllAccounts(tenantId, activeOnly);
  },

  /**
   * Get an account by ID
   */
  async getAccountById(id: number, tenantId: number) {
    return chartOfAccountsStorage.getAccountById(id, tenantId);
  },

  /**
   * Get an account by account number
   */
  async getAccountByNumber(accountNumber: string, tenantId: number) {
    return chartOfAccountsStorage.getAccountByNumber(accountNumber, tenantId);
  },

  /**
   * Create a new account with validation
   */
  async createAccount(data: any) {
    // Validate the account data
    const validatedData = chartOfAccountSchema.parse(data);
    
    // Check if account with same number already exists
    const existingAccount = await chartOfAccountsStorage.getAccountByNumber(
      validatedData.accountNumber, 
      validatedData.tenantId
    );
    
    if (existingAccount) {
      throw new Error(`Account with number ${validatedData.accountNumber} already exists`);
    }
    
    // Check if account type exists
    const accountType = await accountTypeService.getAccountTypeById(
      validatedData.accountTypeId, 
      validatedData.tenantId
    );
    
    if (!accountType) {
      throw new Error("Invalid account type");
    }
    
    // If parent account is specified, check if it exists
    if (validatedData.parentAccountId) {
      const parentAccount = await chartOfAccountsStorage.getAccountById(
        validatedData.parentAccountId, 
        validatedData.tenantId
      );
      
      if (!parentAccount) {
        throw new Error("Invalid parent account");
      }
    }
    
    return chartOfAccountsStorage.createAccount(validatedData);
  },

  /**
   * Update an account with validation
   */
  async updateAccount(id: number, tenantId: number, data: any) {
    // Validate the update data (partial validation)
    const validatedData = chartOfAccountSchema.partial().parse(data);
    
    // Check if account exists
    const existingAccount = await chartOfAccountsStorage.getAccountById(id, tenantId);
    if (!existingAccount) {
      throw new Error("Account not found");
    }
    
    // If account number is being changed, check if new number already exists
    if (validatedData.accountNumber && validatedData.accountNumber !== existingAccount.accountNumber) {
      const accountWithNumber = await chartOfAccountsStorage.getAccountByNumber(
        validatedData.accountNumber, 
        tenantId
      );
      
      if (accountWithNumber && accountWithNumber.id !== id) {
        throw new Error(`Account with number ${validatedData.accountNumber} already exists`);
      }
    }
    
    // If account type is being changed, check if new type exists
    if (validatedData.accountTypeId && validatedData.accountTypeId !== existingAccount.accountTypeId) {
      const accountType = await accountTypeService.getAccountTypeById(
        validatedData.accountTypeId, 
        tenantId
      );
      
      if (!accountType) {
        throw new Error("Invalid account type");
      }
    }
    
    // If parent account is being changed, check if new parent exists
    if (validatedData.parentAccountId && validatedData.parentAccountId !== existingAccount.parentAccountId) {
      // Prevent circular references by checking if the new parent is not a child of this account
      if (validatedData.parentAccountId === id) {
        throw new Error("An account cannot be its own parent");
      }
      
      const parentAccount = await chartOfAccountsStorage.getAccountById(
        validatedData.parentAccountId, 
        tenantId
      );
      
      if (!parentAccount) {
        throw new Error("Invalid parent account");
      }
      
      // TODO: Check for circular references in the account hierarchy
    }
    
    return chartOfAccountsStorage.updateAccount(id, tenantId, validatedData);
  },

  /**
   * Delete an account
   */
  async deleteAccount(id: number, tenantId: number) {
    // Check if account exists
    const existingAccount = await chartOfAccountsStorage.getAccountById(id, tenantId);
    if (!existingAccount) {
      throw new Error("Account not found");
    }
    
    // Check if account has child accounts
    const childAccounts = await chartOfAccountsStorage.getChildAccounts(id, tenantId);
    if (childAccounts.length > 0) {
      throw new Error("Cannot delete account with child accounts");
    }
    
    // TODO: Check if account is used in any journals or transactions
    
    return chartOfAccountsStorage.deleteAccount(id, tenantId);
  },

  /**
   * Get all root level accounts (no parent)
   */
  async getRootAccounts(tenantId: number, activeOnly: boolean = false) {
    return chartOfAccountsStorage.getRootAccounts(tenantId, activeOnly);
  },

  /**
   * Get child accounts for a parent account
   */
  async getChildAccounts(parentId: number, tenantId: number, activeOnly: boolean = false) {
    return chartOfAccountsStorage.getChildAccounts(parentId, tenantId, activeOnly);
  },

  /**
   * Get accounts by type
   */
  async getAccountsByType(accountTypeId: number, tenantId: number, activeOnly: boolean = false) {
    return chartOfAccountsStorage.getAccountsByType(accountTypeId, tenantId, activeOnly);
  },

  /**
   * Get cash and bank accounts
   */
  async getCashAndBankAccounts(tenantId: number) {
    return chartOfAccountsStorage.getCashAndBankAccounts(tenantId);
  },

  /**
   * Update account balance
   */
  async updateAccountBalance(id: number, tenantId: number, amount: string) {
    // Check if account exists
    const existingAccount = await chartOfAccountsStorage.getAccountById(id, tenantId);
    if (!existingAccount) {
      throw new Error("Account not found");
    }
    
    return chartOfAccountsStorage.updateAccountBalance(id, tenantId, amount);
  },

  /**
   * Initialize default chart of accounts for a new tenant
   */
  async initializeDefaultChartOfAccounts(tenantId: number) {
    // First ensure account types are initialized
    await accountTypeService.initializeDefaultAccountTypes(tenantId);
    
    // Get all account types
    const accountTypes = await accountTypeService.getAllAccountTypes(tenantId);
    
    // Map of account type codes to their IDs
    const accountTypeMap: Record<string, number> = {};
    accountTypes.forEach(type => {
      accountTypeMap[type.code] = type.id;
    });
    
    // Map to store created accounts by their temporary code (for parent references)
    const accountMap: Record<string, number> = {};
    
    // Define default accounts structure for garment manufacturing
    const defaultAccounts = [
      // ASSETS
      { code: "1000", accountNumber: "1000", name: "Assets", description: "All assets", accountTypeId: accountTypeMap["CA"], parentAccountId: null },
      
      // Current Assets
      { code: "1100", accountNumber: "1100", name: "Current Assets", description: "Short-term assets", accountTypeId: accountTypeMap["CA"], parentAccountId: "1000" },
      { code: "1110", accountNumber: "1110", name: "Cash on Hand", description: "Physical cash", accountTypeId: accountTypeMap["CE"], parentAccountId: "1100", isCashAccount: true },
      { code: "1120", accountNumber: "1120", name: "Cash in Bank", description: "Bank accounts", accountTypeId: accountTypeMap["CE"], parentAccountId: "1100", isBankAccount: true },
      { code: "1130", accountNumber: "1130", name: "Accounts Receivable", description: "Amounts owed by customers", accountTypeId: accountTypeMap["AR"], parentAccountId: "1100" },
      { code: "1140", accountNumber: "1140", name: "Inventory", description: "All inventory items", accountTypeId: accountTypeMap["INV"], parentAccountId: "1100" },
      { code: "1141", accountNumber: "1141", name: "Raw Materials", description: "Fabrics, buttons, zippers, etc.", accountTypeId: accountTypeMap["INV"], parentAccountId: "1140" },
      { code: "1142", accountNumber: "1142", name: "Work in Progress", description: "Partially completed garments", accountTypeId: accountTypeMap["INV"], parentAccountId: "1140" },
      { code: "1143", accountNumber: "1143", name: "Finished Goods", description: "Completed garments ready for sale", accountTypeId: accountTypeMap["INV"], parentAccountId: "1140" },
      { code: "1150", accountNumber: "1150", name: "Prepaid Expenses", description: "Expenses paid in advance", accountTypeId: accountTypeMap["CA"], parentAccountId: "1100" },
      
      // Fixed Assets
      { code: "1200", accountNumber: "1200", name: "Fixed Assets", description: "Long-term assets", accountTypeId: accountTypeMap["FA"], parentAccountId: "1000" },
      { code: "1210", accountNumber: "1210", name: "Land", description: "Land owned", accountTypeId: accountTypeMap["FA"], parentAccountId: "1200" },
      { code: "1220", accountNumber: "1220", name: "Buildings", description: "Buildings owned", accountTypeId: accountTypeMap["FA"], parentAccountId: "1200" },
      { code: "1230", accountNumber: "1230", name: "Machinery and Equipment", description: "Production machinery", accountTypeId: accountTypeMap["ME"], parentAccountId: "1200" },
      { code: "1231", accountNumber: "1231", name: "Sewing Machines", description: "Sewing machines", accountTypeId: accountTypeMap["ME"], parentAccountId: "1230" },
      { code: "1232", accountNumber: "1232", name: "Cutting Equipment", description: "Cutting machines and equipment", accountTypeId: accountTypeMap["ME"], parentAccountId: "1230" },
      { code: "1233", accountNumber: "1233", name: "Pressing Equipment", description: "Pressing machines", accountTypeId: accountTypeMap["ME"], parentAccountId: "1230" },
      { code: "1240", accountNumber: "1240", name: "Office Equipment", description: "Computers, furniture, etc.", accountTypeId: accountTypeMap["FA"], parentAccountId: "1200" },
      { code: "1250", accountNumber: "1250", name: "Vehicles", description: "Company vehicles", accountTypeId: accountTypeMap["FA"], parentAccountId: "1200" },
      { code: "1260", accountNumber: "1260", name: "Accumulated Depreciation", description: "Accumulated depreciation on fixed assets", accountTypeId: accountTypeMap["FA"], parentAccountId: "1200" },
      
      // LIABILITIES
      { code: "2000", accountNumber: "2000", name: "Liabilities", description: "All liabilities", accountTypeId: accountTypeMap["CL"], parentAccountId: null },
      
      // Current Liabilities
      { code: "2100", accountNumber: "2100", name: "Current Liabilities", description: "Short-term debts", accountTypeId: accountTypeMap["CL"], parentAccountId: "2000" },
      { code: "2110", accountNumber: "2110", name: "Accounts Payable", description: "Amounts owed to suppliers", accountTypeId: accountTypeMap["AP"], parentAccountId: "2100" },
      { code: "2120", accountNumber: "2120", name: "Accrued Liabilities", description: "Expenses incurred but not yet paid", accountTypeId: accountTypeMap["AL"], parentAccountId: "2100" },
      { code: "2130", accountNumber: "2130", name: "Wages Payable", description: "Salaries and wages owed to employees", accountTypeId: accountTypeMap["CL"], parentAccountId: "2100" },
      { code: "2140", accountNumber: "2140", name: "Taxes Payable", description: "Taxes owed", accountTypeId: accountTypeMap["CL"], parentAccountId: "2100" },
      { code: "2150", accountNumber: "2150", name: "Short-term Loans", description: "Loans due within one year", accountTypeId: accountTypeMap["CL"], parentAccountId: "2100" },
      
      // Long-term Liabilities
      { code: "2200", accountNumber: "2200", name: "Long-term Liabilities", description: "Debts due beyond one year", accountTypeId: accountTypeMap["LTL"], parentAccountId: "2000" },
      { code: "2210", accountNumber: "2210", name: "Long-term Loans", description: "Loans due beyond one year", accountTypeId: accountTypeMap["LM"], parentAccountId: "2200" },
      { code: "2220", accountNumber: "2220", name: "Mortgages Payable", description: "Mortgages on property", accountTypeId: accountTypeMap["LM"], parentAccountId: "2200" },
      
      // EQUITY
      { code: "3000", accountNumber: "3000", name: "Equity", description: "Owner's equity", accountTypeId: accountTypeMap["CAP"], parentAccountId: null },
      { code: "3100", accountNumber: "3100", name: "Capital", description: "Owner's investment", accountTypeId: accountTypeMap["CAP"], parentAccountId: "3000" },
      { code: "3200", accountNumber: "3200", name: "Retained Earnings", description: "Accumulated profits", accountTypeId: accountTypeMap["RE"], parentAccountId: "3000" },
      
      // REVENUE
      { code: "4000", accountNumber: "4000", name: "Revenue", description: "All income", accountTypeId: accountTypeMap["SR"], parentAccountId: null },
      { code: "4100", accountNumber: "4100", name: "Sales Revenue", description: "Income from sales", accountTypeId: accountTypeMap["SR"], parentAccountId: "4000" },
      { code: "4110", accountNumber: "4110", name: "Export Sales", description: "Revenue from international sales", accountTypeId: accountTypeMap["ES"], parentAccountId: "4100" },
      { code: "4120", accountNumber: "4120", name: "Domestic Sales", description: "Revenue from local sales", accountTypeId: accountTypeMap["DS"], parentAccountId: "4100" },
      { code: "4200", accountNumber: "4200", name: "Other Income", description: "Revenue from other sources", accountTypeId: accountTypeMap["OI"], parentAccountId: "4000" },
      
      // EXPENSES
      { code: "5000", accountNumber: "5000", name: "Expenses", description: "All expenses", accountTypeId: accountTypeMap["OE"], parentAccountId: null },
      
      // Cost of Goods Sold
      { code: "5100", accountNumber: "5100", name: "Cost of Goods Sold", description: "Direct costs of producing goods", accountTypeId: accountTypeMap["COGS"], parentAccountId: "5000" },
      { code: "5110", accountNumber: "5110", name: "Material Costs", description: "Fabric and material costs", accountTypeId: accountTypeMap["MC"], parentAccountId: "5100" },
      { code: "5120", accountNumber: "5120", name: "Direct Labor", description: "Production worker wages", accountTypeId: accountTypeMap["LC"], parentAccountId: "5100" },
      { code: "5130", accountNumber: "5130", name: "Manufacturing Overhead", description: "Indirect production costs", accountTypeId: accountTypeMap["MO"], parentAccountId: "5100" },
      
      // Operating Expenses
      { code: "5200", accountNumber: "5200", name: "Operating Expenses", description: "Expenses for business operations", accountTypeId: accountTypeMap["OE"], parentAccountId: "5000" },
      { code: "5210", accountNumber: "5210", name: "Salaries and Wages", description: "Non-production employee costs", accountTypeId: accountTypeMap["AE"], parentAccountId: "5200" },
      { code: "5220", accountNumber: "5220", name: "Rent Expense", description: "Rent for facilities", accountTypeId: accountTypeMap["AE"], parentAccountId: "5200" },
      { code: "5230", accountNumber: "5230", name: "Utilities", description: "Electricity, water, etc.", accountTypeId: accountTypeMap["AE"], parentAccountId: "5200" },
      { code: "5240", accountNumber: "5240", name: "Sales and Marketing", description: "Promotional expenses", accountTypeId: accountTypeMap["SE"], parentAccountId: "5200" },
      { code: "5250", accountNumber: "5250", name: "Shipping and Delivery", description: "Costs to ship products", accountTypeId: accountTypeMap["SE"], parentAccountId: "5200" },
      { code: "5260", accountNumber: "5260", name: "Depreciation Expense", description: "Depreciation of assets", accountTypeId: accountTypeMap["DEP"], parentAccountId: "5200" },
      { code: "5270", accountNumber: "5270", name: "Insurance Expense", description: "Insurance costs", accountTypeId: accountTypeMap["AE"], parentAccountId: "5200" },
      { code: "5280", accountNumber: "5280", name: "Office Supplies", description: "Consumable office items", accountTypeId: accountTypeMap["AE"], parentAccountId: "5200" },
      { code: "5290", accountNumber: "5290", name: "Professional Fees", description: "Accounting, legal, etc.", accountTypeId: accountTypeMap["AE"], parentAccountId: "5200" },
      
      // Other Expenses
      { code: "5300", accountNumber: "5300", name: "Other Expenses", description: "Miscellaneous expenses", accountTypeId: accountTypeMap["OE"], parentAccountId: "5000" },
      { code: "5310", accountNumber: "5310", name: "Interest Expense", description: "Interest on loans", accountTypeId: accountTypeMap["OE"], parentAccountId: "5300" },
      { code: "5320", accountNumber: "5320", name: "Tax Expense", description: "Business taxes", accountTypeId: accountTypeMap["TAX"], parentAccountId: "5300" }
    ];

    // Function to resolve parent account ID
    const resolveParentId = (parentCode: string | null): number | null => {
      if (!parentCode) return null;
      return accountMap[parentCode] || null;
    };

    // Create accounts in multiple passes to handle parent references
    // First pass: create top-level accounts (no parent)
    for (const account of defaultAccounts.filter(a => a.parentAccountId === null)) {
      try {
        const newAccount = await chartOfAccountsStorage.createAccount({
          accountNumber: account.accountNumber,
          name: account.name,
          description: account.description,
          accountTypeId: account.accountTypeId,
          parentAccountId: null,
          isCashAccount: account.isCashAccount || false,
          isBankAccount: account.isBankAccount || false,
          isControlAccount: account.isControlAccount || false,
          isActive: true,
          tenantId
        });
        
        accountMap[account.code] = newAccount.id;
      } catch (error) {
        console.error(`Error creating top-level account ${account.accountNumber}:`, error);
      }
    }

    // Second pass: create accounts with parents
    for (const account of defaultAccounts.filter(a => a.parentAccountId !== null)) {
      try {
        // Skip if account with same number already exists
        const existing = await chartOfAccountsStorage.getAccountByNumber(account.accountNumber, tenantId);
        if (!existing) {
          const parentId = resolveParentId(account.parentAccountId as string);
          
          const newAccount = await chartOfAccountsStorage.createAccount({
            accountNumber: account.accountNumber,
            name: account.name,
            description: account.description,
            accountTypeId: account.accountTypeId,
            parentAccountId: parentId,
            isCashAccount: account.isCashAccount || false,
            isBankAccount: account.isBankAccount || false,
            isControlAccount: account.isControlAccount || false,
            isActive: true,
            tenantId
          });
          
          accountMap[account.code] = newAccount.id;
        }
      } catch (error) {
        console.error(`Error creating child account ${account.accountNumber}:`, error);
      }
    }

    return true;
  }
};