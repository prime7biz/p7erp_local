import { financialReportingStorage } from "../../database/accounting/financialReportingStorage";
import { chartOfAccountsService } from "./chartOfAccountsService";
import { journalService } from "./journalService";
import { fiscalYearService } from "./fiscalYearService";
import { db } from "../../db";
import { eq, and, desc, between } from "drizzle-orm";
import { parse, format, subMonths, addMonths } from "date-fns";
import { z } from "zod";
import OpenAI from "openai";

// Initialize OpenAI client if API key is available
let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// Validation schema for financial statement templates
const financialStatementTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  type: z.enum(["BalanceSheet", "IncomeStatement", "CashFlow", "Custom"], {
    errorMap: () => ({ message: "Type must be BalanceSheet, IncomeStatement, CashFlow, or Custom" })
  }),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  format: z.enum(["Standard", "Detailed", "Condensed"], {
    errorMap: () => ({ message: "Format must be Standard, Detailed, or Condensed" })
  }).default("Standard"),
  tenantId: z.number().int().positive()
});

// Validation schema for financial statement sections
const financialStatementSectionSchema = z.object({
  templateId: z.number().int().positive("Template ID is required"),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional().nullable(),
  type: z.enum(["Header", "Group", "Total", "Calculation"], {
    errorMap: () => ({ message: "Type must be Header, Group, Total, or Calculation" })
  }),
  formula: z.string().optional().nullable(),
  displayOrder: z.number().int().nonnegative().default(0),
  isNegative: z.boolean().default(false),
  parentSectionId: z.number().int().positive().optional().nullable(),
  tenantId: z.number().int().positive()
});

// Validation schema for section account mappings
const sectionAccountSchema = z.object({
  sectionId: z.number().int().positive("Section ID is required"),
  accountId: z.number().int().positive("Account ID is required"),
  isNegative: z.boolean().default(false),
  tenantId: z.number().int().positive()
});

// Helper function to format currency values
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export const financialReportingService = {
  /**
   * Get all financial statement templates
   */
  async getAllTemplates(tenantId: number, activeOnly: boolean = false) {
    return financialReportingStorage.getAllTemplates(tenantId, activeOnly);
  },

  /**
   * Get a financial statement template by ID
   */
  async getTemplateById(id: number, tenantId: number) {
    return financialReportingStorage.getTemplateById(id, tenantId);
  },

  /**
   * Get the default template for a specific type
   */
  async getDefaultTemplate(type: string, tenantId: number) {
    return financialReportingStorage.getDefaultTemplate(type, tenantId);
  },

  /**
   * Create a new financial statement template with validation
   */
  async createTemplate(data: any) {
    // Validate the template data
    const validatedData = financialStatementTemplateSchema.parse(data);
    
    // If this is set as default, unset any existing default for this type
    if (validatedData.isDefault) {
      const defaultTemplate = await financialReportingStorage.getDefaultTemplate(
        validatedData.type, 
        validatedData.tenantId
      );
      
      if (defaultTemplate) {
        await financialReportingStorage.updateTemplate(
          defaultTemplate.id, 
          validatedData.tenantId, 
          { isDefault: false }
        );
      }
    }
    
    return financialReportingStorage.createTemplate(validatedData);
  },

  /**
   * Update a financial statement template with validation
   */
  async updateTemplate(id: number, tenantId: number, data: any) {
    // Validate the update data (partial validation)
    const validatedData = financialStatementTemplateSchema.partial().parse(data);
    
    // Check if template exists
    const existingTemplate = await financialReportingStorage.getTemplateById(id, tenantId);
    if (!existingTemplate) {
      throw new Error("Template not found");
    }
    
    // If this is being set as default, unset any existing default for this type
    if (validatedData.isDefault === true) {
      const templateType = validatedData.type || existingTemplate.type;
      const defaultTemplate = await financialReportingStorage.getDefaultTemplate(
        templateType, 
        tenantId
      );
      
      if (defaultTemplate && defaultTemplate.id !== id) {
        await financialReportingStorage.updateTemplate(
          defaultTemplate.id, 
          tenantId, 
          { isDefault: false }
        );
      }
    }
    
    return financialReportingStorage.updateTemplate(id, tenantId, validatedData);
  },

  /**
   * Delete a financial statement template
   */
  async deleteTemplate(id: number, tenantId: number) {
    // Check if template exists
    const existingTemplate = await financialReportingStorage.getTemplateById(id, tenantId);
    if (!existingTemplate) {
      throw new Error("Template not found");
    }
    
    // If this is a default template, prevent deletion
    if (existingTemplate.isDefault) {
      throw new Error("Cannot delete a default template");
    }
    
    return financialReportingStorage.deleteTemplate(id, tenantId);
  },

  /**
   * Get all sections for a template
   */
  async getTemplateSections(templateId: number, tenantId: number) {
    return financialReportingStorage.getTemplateSections(templateId, tenantId);
  },

  /**
   * Get a section by ID
   */
  async getSectionById(id: number, tenantId: number) {
    return financialReportingStorage.getSectionById(id, tenantId);
  },

  /**
   * Create a new section with validation
   */
  async createSection(data: any) {
    // Validate the section data
    const validatedData = financialStatementSectionSchema.parse(data);
    
    // Check if template exists
    const template = await financialReportingStorage.getTemplateById(
      validatedData.templateId, 
      validatedData.tenantId
    );
    
    if (!template) {
      throw new Error("Invalid template");
    }
    
    // If parent section is specified, validate it
    if (validatedData.parentSectionId) {
      const parentSection = await financialReportingStorage.getSectionById(
        validatedData.parentSectionId, 
        validatedData.tenantId
      );
      
      if (!parentSection) {
        throw new Error("Invalid parent section");
      }
      
      if (parentSection.templateId !== validatedData.templateId) {
        throw new Error("Parent section must belong to the same template");
      }
    }
    
    // Calculate highest display order if not provided
    if (validatedData.displayOrder === 0) {
      const sections = await financialReportingStorage.getTemplateSections(
        validatedData.templateId, 
        validatedData.tenantId
      );
      
      if (sections.length > 0) {
        const maxOrder = Math.max(...sections.map(s => s.displayOrder));
        validatedData.displayOrder = maxOrder + 10; // Leave gaps for manual reordering
      } else {
        validatedData.displayOrder = 10;
      }
    }
    
    return financialReportingStorage.createSection(validatedData);
  },

  /**
   * Update a section with validation
   */
  async updateSection(id: number, tenantId: number, data: any) {
    // Validate the update data (partial validation)
    const validatedData = financialStatementSectionSchema.partial().parse(data);
    
    // Check if section exists
    const existingSection = await financialReportingStorage.getSectionById(id, tenantId);
    if (!existingSection) {
      throw new Error("Section not found");
    }
    
    // If parent section is being changed, validate it
    if (validatedData.parentSectionId && validatedData.parentSectionId !== existingSection.parentSectionId) {
      // Prevent circular references
      if (validatedData.parentSectionId === id) {
        throw new Error("A section cannot be its own parent");
      }
      
      const parentSection = await financialReportingStorage.getSectionById(
        validatedData.parentSectionId, 
        tenantId
      );
      
      if (!parentSection) {
        throw new Error("Invalid parent section");
      }
      
      const templateId = validatedData.templateId || existingSection.templateId;
      if (parentSection.templateId !== templateId) {
        throw new Error("Parent section must belong to the same template");
      }
      
      // TODO: Check for circular references in the section hierarchy
    }
    
    return financialReportingStorage.updateSection(id, tenantId, validatedData);
  },

  /**
   * Delete a section
   */
  async deleteSection(id: number, tenantId: number) {
    // Check if section exists
    const existingSection = await financialReportingStorage.getSectionById(id, tenantId);
    if (!existingSection) {
      throw new Error("Section not found");
    }
    
    // Check if section has child sections
    const sections = await financialReportingStorage.getTemplateSections(
      existingSection.templateId, 
      tenantId
    );
    
    const childSections = sections.filter(s => s.parentSectionId === id);
    if (childSections.length > 0) {
      throw new Error("Cannot delete a section with child sections");
    }
    
    return financialReportingStorage.deleteSection(id, tenantId);
  },

  /**
   * Get all accounts for a section
   */
  async getSectionAccounts(sectionId: number, tenantId: number) {
    return financialReportingStorage.getSectionAccounts(sectionId, tenantId);
  },

  /**
   * Create a section account mapping
   */
  async createSectionAccount(data: any) {
    // Validate the section account data
    const validatedData = sectionAccountSchema.parse(data);
    
    // Check if section exists
    const section = await financialReportingStorage.getSectionById(
      validatedData.sectionId, 
      validatedData.tenantId
    );
    
    if (!section) {
      throw new Error("Invalid section");
    }
    
    // Check if account exists
    const account = await chartOfAccountsService.getAccountById(
      validatedData.accountId, 
      validatedData.tenantId
    );
    
    if (!account) {
      throw new Error("Invalid account");
    }
    
    // Check if this account is already mapped to this section
    const sectionAccounts = await financialReportingStorage.getSectionAccounts(
      validatedData.sectionId, 
      validatedData.tenantId
    );
    
    const existingMapping = sectionAccounts.find(sa => sa.accountId === validatedData.accountId);
    if (existingMapping) {
      throw new Error("This account is already mapped to this section");
    }
    
    return financialReportingStorage.createSectionAccount(validatedData);
  },

  /**
   * Delete a section account mapping
   */
  async deleteSectionAccount(id: number, tenantId: number) {
    return financialReportingStorage.deleteSectionAccount(id, tenantId);
  },

  /**
   * Get all financial insights
   */
  async getAllInsights(tenantId: number, options: any = {}) {
    return financialReportingStorage.getAllInsights(tenantId, options);
  },

  /**
   * Get a financial insight by ID
   */
  async getInsightById(id: number, tenantId: number) {
    return financialReportingStorage.getInsightById(id, tenantId);
  },

  /**
   * Generate a financial statement report
   */
  async generateFinancialStatement(templateId: number, tenantId: number, options: {
    asOfDate?: string; // For balance sheet
    startDate?: string; // For income statement and cash flow
    endDate?: string; // For income statement and cash flow
    fiscalYearId?: number;
    periodId?: number;
    compareWithPrevious?: boolean;
    format?: string;
  }) {
    // Validate required parameters
    if (!options.asOfDate && !(options.startDate && options.endDate) && !options.periodId) {
      throw new Error("Either asOfDate, periodId, or both startDate and endDate must be provided");
    }
    
    // Get the template
    const template = await financialReportingStorage.getTemplateById(templateId, tenantId);
    if (!template) {
      throw new Error("Template not found");
    }
    
    // Get the template sections
    const sections = await financialReportingStorage.getTemplateSections(templateId, tenantId);
    if (sections.length === 0) {
      throw new Error("Template has no sections");
    }
    
    // Get date parameters for the report
    let reportStartDate = options.startDate;
    let reportEndDate = options.endDate || options.asOfDate;
    
    if (options.periodId) {
      const period = await fiscalYearService.getAccountingPeriodById(options.periodId, tenantId);
      if (!period) {
        throw new Error("Invalid accounting period");
      }
      
      reportStartDate = period.startDate;
      reportEndDate = period.endDate;
    }
    
    // Prepare the report structure
    const report = {
      template: template,
      reportDate: new Date().toISOString(),
      startDate: reportStartDate,
      endDate: reportEndDate,
      sections: [] as any[]
    };
    
    // Process sections in display order
    const sortedSections = [...sections].sort((a, b) => a.displayOrder - b.displayOrder);
    const sectionValues = new Map<number, number>(); // Store calculated values for sections
    
    for (const section of sortedSections) {
      // Skip child sections for now, we'll process them with their parents
      if (section.parentSectionId) {
        continue;
      }
      
      const sectionReport = await this.processSection(
        section, 
        sections, 
        sectionValues, 
        reportStartDate, 
        reportEndDate, 
        tenantId, 
        options
      );
      
      report.sections.push(sectionReport);
    }
    
    return report;
  },

  /**
   * Process a section and its children for the financial statement
   */
  async processSection(
    section: any,
    allSections: any[],
    sectionValues: Map<number, number>,
    startDate: string,
    endDate: string,
    tenantId: number,
    options: any
  ) {
    const sectionReport = {
      ...section,
      value: 0,
      previousValue: 0,
      children: [] as any[],
      accounts: [] as any[]
    };
    
    // Process different section types
    switch (section.type) {
      case "Header":
        // Headers just group other sections, they don't have a value themselves
        break;
        
      case "Group":
        // For groups, sum up account values
        const sectionAccounts = await financialReportingStorage.getSectionAccounts(section.id, tenantId);
        
        if (sectionAccounts.length > 0) {
          const accountValues = await this.calculateAccountValues(
            sectionAccounts.map(sa => ({ 
              id: sa.accountId, 
              isNegative: sa.isNegative 
            })),
            startDate,
            endDate,
            tenantId
          );
          
          // Calculate section value from accounts
          let value = 0;
          for (const account of accountValues) {
            const multiplier = account.isNegative ? -1 : 1;
            value += account.value * multiplier;
            
            // Add account to section report if detailed format is requested
            if (options.format === "Detailed") {
              sectionReport.accounts.push({
                id: account.id,
                accountNumber: account.accountNumber,
                name: account.name,
                value: account.value * multiplier,
                formattedValue: formatCurrency(account.value * multiplier),
                previousValue: 0, // TODO: Calculate previous period values if needed
                formattedPreviousValue: formatCurrency(0)
              });
            }
          }
          
          sectionReport.value = section.isNegative ? -value : value;
        }
        break;
        
      case "Total":
        // For totals, we need to sum up other sections
        let totalValue = 0;
        
        // Get child sections
        const childSections = allSections.filter(s => s.parentSectionId === section.id);
        
        // Add up child section values
        for (const childSection of childSections) {
          const childValue = sectionValues.get(childSection.id) || 0;
          totalValue += childValue;
        }
        
        sectionReport.value = section.isNegative ? -totalValue : totalValue;
        break;
        
      case "Calculation":
        // For calculations, evaluate the formula
        if (section.formula) {
          // Replace section references in formula with their values
          let formula = section.formula;
          for (const [sectionId, value] of sectionValues.entries()) {
            formula = formula.replace(
              new RegExp(`\\[${sectionId}\\]`, 'g'), 
              value.toString()
            );
          }
          
          // Safely evaluate the formula
          try {
            const result = Function(`"use strict"; return (${formula})`)();
            sectionReport.value = section.isNegative ? -result : result;
          } catch (error) {
            sectionReport.value = 0;
            sectionReport.error = `Error evaluating formula: ${error.message}`;
          }
        }
        break;
    }
    
    // Format the value
    sectionReport.formattedValue = formatCurrency(sectionReport.value);
    
    // Previous period comparison if requested
    if (options.compareWithPrevious) {
      // TODO: Calculate previous period values
      sectionReport.formattedPreviousValue = formatCurrency(sectionReport.previousValue);
      
      // Calculate change
      sectionReport.change = sectionReport.value - sectionReport.previousValue;
      sectionReport.formattedChange = formatCurrency(sectionReport.change);
      
      // Calculate percentage change
      if (sectionReport.previousValue !== 0) {
        sectionReport.percentChange = (sectionReport.change / Math.abs(sectionReport.previousValue)) * 100;
        sectionReport.formattedPercentChange = `${sectionReport.percentChange.toFixed(2)}%`;
      } else {
        sectionReport.percentChange = sectionReport.value === 0 ? 0 : 100;
        sectionReport.formattedPercentChange = `${sectionReport.percentChange.toFixed(2)}%`;
      }
    }
    
    // Store the section value for later use
    sectionValues.set(section.id, sectionReport.value);
    
    // Process child sections
    const childSections = allSections.filter(s => s.parentSectionId === section.id)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    
    for (const childSection of childSections) {
      const childSectionReport = await this.processSection(
        childSection, 
        allSections, 
        sectionValues, 
        startDate, 
        endDate, 
        tenantId, 
        options
      );
      
      sectionReport.children.push(childSectionReport);
    }
    
    return sectionReport;
  },

  /**
   * Calculate account values for a given date range
   */
  async calculateAccountValues(
    accounts: { id: number, isNegative: boolean }[],
    startDate: string,
    endDate: string,
    tenantId: number
  ) {
    if (accounts.length === 0) {
      return [];
    }
    
    // For optimization, fetch all accounts at once
    const accountIds = accounts.map(a => a.id);
    const accountDetails = await chartOfAccountsService.getAllAccounts(tenantId);
    const accountDetailsMap = new Map(accountDetails.map(a => [a.id, a]));
    
    // Create a lookup for the isNegative flag
    const isNegativeMap = new Map(accounts.map(a => [a.id, a.isNegative]));
    
    // Query to get account balances
    const query = `
      SELECT 
        jl.account_id,
        SUM(CAST(jl.debit_amount AS DECIMAL(15,2)) - CAST(jl.credit_amount AS DECIMAL(15,2))) AS balance
      FROM journal_lines jl
      JOIN journals j ON j.id = jl.journal_id AND j.tenant_id = jl.tenant_id
      WHERE j.tenant_id = $1
        AND j.status = 'Posted'
        AND j.journal_date <= $2
        ${startDate ? 'AND j.journal_date >= $3' : ''}
        AND jl.account_id IN (${accountIds.join(',')})
      GROUP BY jl.account_id
    `;
    
    const params = [tenantId, endDate];
    if (startDate) {
      params.push(startDate);
    }
    
    // Execute the query
    const result = await db.execute(query, params);
    
    // Create a map of account balances
    const balances = new Map<number, number>();
    for (const row of result.rows) {
      balances.set(row.account_id, parseFloat(row.balance) || 0);
    }
    
    // Return the account values
    return accounts.map(account => {
      const accountDetail = accountDetailsMap.get(account.id);
      return {
        id: account.id,
        accountNumber: accountDetail?.accountNumber || '',
        name: accountDetail?.name || '',
        isNegative: account.isNegative,
        value: balances.get(account.id) || 0
      };
    });
  },

  /**
   * Generate a trial balance report
   */
  async generateTrialBalance(tenantId: number, options: {
    asOfDate?: string;
    startDate?: string;
    endDate?: string;
    fiscalYearId?: number;
    periodId?: number;
    accountTypeId?: number;
    includeZeroBalances?: boolean;
  }) {
    // Validate required parameters
    if (!options.asOfDate && !(options.startDate && options.endDate) && !options.periodId && !options.fiscalYearId) {
      throw new Error("Either asOfDate, periodId, fiscalYearId, or both startDate and endDate must be provided");
    }
    
    // Get date parameters for the report
    let reportStartDate = options.startDate;
    let reportEndDate = options.endDate || options.asOfDate;
    
    if (options.periodId) {
      const period = await fiscalYearService.getAccountingPeriodById(options.periodId, tenantId);
      if (!period) {
        throw new Error("Invalid accounting period");
      }
      
      reportStartDate = period.startDate;
      reportEndDate = period.endDate;
    } else if (options.fiscalYearId) {
      const fiscalYear = await fiscalYearService.getFiscalYearById(options.fiscalYearId, tenantId);
      if (!fiscalYear) {
        throw new Error("Invalid fiscal year");
      }
      
      reportStartDate = fiscalYear.startDate;
      reportEndDate = fiscalYear.endDate;
    }
    
    // Build query to get trial balance data
    const query = `
      WITH account_balances AS (
        SELECT 
          coa.id,
          coa.account_number,
          coa.name,
          at.id AS account_type_id,
          at.name AS account_type,
          at.category AS account_category,
          COALESCE(SUM(CASE WHEN j.journal_date < $2 THEN CAST(jl.debit_amount AS DECIMAL(15,2)) - CAST(jl.credit_amount AS DECIMAL(15,2)) ELSE 0 END), 0) AS opening_balance,
          COALESCE(SUM(CASE WHEN j.journal_date BETWEEN $2 AND $3 THEN CAST(jl.debit_amount AS DECIMAL(15,2)) ELSE 0 END), 0) AS period_debits,
          COALESCE(SUM(CASE WHEN j.journal_date BETWEEN $2 AND $3 THEN CAST(jl.credit_amount AS DECIMAL(15,2)) ELSE 0 END), 0) AS period_credits
        FROM chart_of_accounts coa
        JOIN account_types at ON at.id = coa.account_type_id AND at.tenant_id = coa.tenant_id
        LEFT JOIN journal_lines jl ON jl.account_id = coa.id AND jl.tenant_id = coa.tenant_id
        LEFT JOIN journals j ON j.id = jl.journal_id AND j.tenant_id = jl.tenant_id AND j.status = 'Posted'
        WHERE coa.tenant_id = $1
          ${options.accountTypeId ? 'AND at.id = $4' : ''}
        GROUP BY coa.id, coa.account_number, coa.name, at.id, at.name, at.category
      )
      SELECT 
        id,
        account_number,
        name,
        account_type_id,
        account_type,
        account_category,
        opening_balance,
        period_debits,
        period_credits,
        opening_balance + period_debits - period_credits AS closing_balance
      FROM account_balances
      ${options.includeZeroBalances ? '' : 'WHERE ABS(opening_balance) > 0.01 OR ABS(period_debits) > 0.01 OR ABS(period_credits) > 0.01'}
      ORDER BY account_category, account_number
    `;
    
    const params = [tenantId, reportStartDate, reportEndDate];
    if (options.accountTypeId) {
      params.push(options.accountTypeId);
    }
    
    // Execute the query
    const result = await db.execute(query, params);
    
    // Format the results
    const accounts = result.rows.map(row => ({
      id: row.id,
      accountNumber: row.account_number,
      name: row.name,
      accountTypeId: row.account_type_id,
      accountType: row.account_type,
      accountCategory: row.account_category,
      openingBalance: parseFloat(row.opening_balance),
      formattedOpeningBalance: formatCurrency(parseFloat(row.opening_balance)),
      periodDebits: parseFloat(row.period_debits),
      formattedPeriodDebits: formatCurrency(parseFloat(row.period_debits)),
      periodCredits: parseFloat(row.period_credits),
      formattedPeriodCredits: formatCurrency(parseFloat(row.period_credits)),
      closingBalance: parseFloat(row.closing_balance),
      formattedClosingBalance: formatCurrency(parseFloat(row.closing_balance))
    }));
    
    // Calculate totals
    const totals = {
      openingBalance: accounts.reduce((sum, a) => sum + a.openingBalance, 0),
      formattedOpeningBalance: formatCurrency(accounts.reduce((sum, a) => sum + a.openingBalance, 0)),
      periodDebits: accounts.reduce((sum, a) => sum + a.periodDebits, 0),
      formattedPeriodDebits: formatCurrency(accounts.reduce((sum, a) => sum + a.periodDebits, 0)),
      periodCredits: accounts.reduce((sum, a) => sum + a.periodCredits, 0),
      formattedPeriodCredits: formatCurrency(accounts.reduce((sum, a) => sum + a.periodCredits, 0)),
      closingBalance: accounts.reduce((sum, a) => sum + a.closingBalance, 0),
      formattedClosingBalance: formatCurrency(accounts.reduce((sum, a) => sum + a.closingBalance, 0))
    };
    
    // Group by account category
    const categories = [...new Set(accounts.map(a => a.accountCategory))];
    const accountsByCategory = categories.map(category => {
      const categoryAccounts = accounts.filter(a => a.accountCategory === category);
      return {
        category,
        accounts: categoryAccounts,
        totals: {
          openingBalance: categoryAccounts.reduce((sum, a) => sum + a.openingBalance, 0),
          formattedOpeningBalance: formatCurrency(categoryAccounts.reduce((sum, a) => sum + a.openingBalance, 0)),
          periodDebits: categoryAccounts.reduce((sum, a) => sum + a.periodDebits, 0),
          formattedPeriodDebits: formatCurrency(categoryAccounts.reduce((sum, a) => sum + a.periodDebits, 0)),
          periodCredits: categoryAccounts.reduce((sum, a) => sum + a.periodCredits, 0),
          formattedPeriodCredits: formatCurrency(categoryAccounts.reduce((sum, a) => sum + a.periodCredits, 0)),
          closingBalance: categoryAccounts.reduce((sum, a) => sum + a.closingBalance, 0),
          formattedClosingBalance: formatCurrency(categoryAccounts.reduce((sum, a) => sum + a.closingBalance, 0))
        }
      };
    });
    
    return {
      reportDate: new Date().toISOString(),
      startDate: reportStartDate,
      endDate: reportEndDate,
      accounts,
      accountsByCategory,
      totals
    };
  },

  /**
   * Generate a general ledger report
   */
  async generateGeneralLedger(tenantId: number, options: {
    startDate: string;
    endDate: string;
    accountId?: number;
    accountTypeId?: number;
  }) {
    // Validate required parameters
    if (!options.startDate || !options.endDate) {
      throw new Error("Both startDate and endDate are required");
    }
    
    // Build account filter
    let accountFilter = "";
    const params = [tenantId, options.startDate, options.endDate];
    
    if (options.accountId) {
      accountFilter = "AND coa.id = $4";
      params.push(options.accountId);
    } else if (options.accountTypeId) {
      accountFilter = "AND at.id = $4";
      params.push(options.accountTypeId);
    }
    
    // Query to get account balances and transactions
    const query = `
      WITH account_balances AS (
        SELECT 
          coa.id,
          coa.account_number,
          coa.name,
          at.id AS account_type_id,
          at.name AS account_type,
          at.category AS account_category,
          COALESCE(SUM(CASE WHEN j.journal_date < $2 THEN CAST(jl.debit_amount AS DECIMAL(15,2)) - CAST(jl.credit_amount AS DECIMAL(15,2)) ELSE 0 END), 0) AS opening_balance
        FROM chart_of_accounts coa
        JOIN account_types at ON at.id = coa.account_type_id AND at.tenant_id = coa.tenant_id
        LEFT JOIN journal_lines jl ON jl.account_id = coa.id AND jl.tenant_id = coa.tenant_id
        LEFT JOIN journals j ON j.id = jl.journal_id AND j.tenant_id = jl.tenant_id AND j.status = 'Posted'
        WHERE coa.tenant_id = $1 ${accountFilter}
        GROUP BY coa.id, coa.account_number, coa.name, at.id, at.name, at.category
      ),
      transactions AS (
        SELECT 
          coa.id AS account_id,
          j.journal_date,
          j.id AS journal_id,
          j.journal_number,
          j.description AS journal_description,
          jl.description AS line_description,
          CAST(jl.debit_amount AS DECIMAL(15,2)) AS debit_amount,
          CAST(jl.credit_amount AS DECIMAL(15,2)) AS credit_amount
        FROM chart_of_accounts coa
        JOIN account_types at ON at.id = coa.account_type_id AND at.tenant_id = coa.tenant_id
        JOIN journal_lines jl ON jl.account_id = coa.id AND jl.tenant_id = coa.tenant_id
        JOIN journals j ON j.id = jl.journal_id AND j.tenant_id = jl.tenant_id AND j.status = 'Posted'
        WHERE coa.tenant_id = $1
          AND j.journal_date BETWEEN $2 AND $3
          ${accountFilter}
        ORDER BY coa.account_number, j.journal_date, j.id
      )
      SELECT 
        ab.*,
        t.journal_date,
        t.journal_id,
        t.journal_number,
        t.journal_description,
        t.line_description,
        t.debit_amount,
        t.credit_amount
      FROM account_balances ab
      LEFT JOIN transactions t ON t.account_id = ab.id
      ORDER BY ab.account_category, ab.account_number, t.journal_date, t.journal_id
    `;
    
    // Execute the query
    const result = await db.execute(query, params);
    
    // Process the results
    const accounts = {};
    const ledger = [];
    
    for (const row of result.rows) {
      const accountId = row.id;
      
      // Initialize account if not already done
      if (!accounts[accountId]) {
        accounts[accountId] = {
          id: accountId,
          accountNumber: row.account_number,
          name: row.name,
          accountTypeId: row.account_type_id,
          accountType: row.account_type,
          accountCategory: row.account_category,
          openingBalance: parseFloat(row.opening_balance),
          formattedOpeningBalance: formatCurrency(parseFloat(row.opening_balance)),
          transactions: [],
          closingBalance: parseFloat(row.opening_balance), // Will be updated as we process transactions
          formattedClosingBalance: formatCurrency(parseFloat(row.opening_balance))
        };
      }
      
      // Add transaction if exists
      if (row.journal_id) {
        const debit = parseFloat(row.debit_amount) || 0;
        const credit = parseFloat(row.credit_amount) || 0;
        const balance = accounts[accountId].closingBalance + debit - credit;
        
        const transaction = {
          date: row.journal_date,
          journalId: row.journal_id,
          journalNumber: row.journal_number,
          journalDescription: row.journal_description,
          lineDescription: row.line_description,
          debit,
          formattedDebit: debit > 0 ? formatCurrency(debit) : '',
          credit,
          formattedCredit: credit > 0 ? formatCurrency(credit) : '',
          balance,
          formattedBalance: formatCurrency(balance)
        };
        
        accounts[accountId].transactions.push(transaction);
        accounts[accountId].closingBalance = balance;
        accounts[accountId].formattedClosingBalance = formatCurrency(balance);
      }
    }
    
    // Convert accounts object to array
    for (const accountId in accounts) {
      const account = accounts[accountId];
      ledger.push(account);
    }
    
    return {
      reportDate: new Date().toISOString(),
      startDate: options.startDate,
      endDate: options.endDate,
      ledger
    };
  },

  /**
   * Generate financial ratio analysis
   */
  async generateFinancialRatioAnalysis(tenantId: number, options: {
    asOfDate: string;
    compareToPrevious?: boolean;
    previousDate?: string;
  }) {
    // Validate required parameters
    if (!options.asOfDate) {
      throw new Error("asOfDate is required");
    }
    
    const asOfDate = options.asOfDate;
    const previousDate = options.previousDate || format(subMonths(parse(asOfDate, 'yyyy-MM-dd', new Date()), 12), 'yyyy-MM-dd');
    
    // Get balance sheet data
    const balanceSheetTemplate = await this.getDefaultTemplate("BalanceSheet", tenantId);
    if (!balanceSheetTemplate) {
      throw new Error("No default balance sheet template found");
    }
    
    const balanceSheet = await this.generateFinancialStatement(balanceSheetTemplate.id, tenantId, {
      asOfDate,
      compareWithPrevious: false
    });
    
    const previousBalanceSheet = options.compareToPrevious ? 
      await this.generateFinancialStatement(balanceSheetTemplate.id, tenantId, {
        asOfDate: previousDate,
        compareWithPrevious: false
      }) : null;
    
    // Get income statement data for the last 12 months
    const incomeStatementTemplate = await this.getDefaultTemplate("IncomeStatement", tenantId);
    if (!incomeStatementTemplate) {
      throw new Error("No default income statement template found");
    }
    
    const yearStartDate = format(subMonths(parse(asOfDate, 'yyyy-MM-dd', new Date()), 12), 'yyyy-MM-dd');
    
    const incomeStatement = await this.generateFinancialStatement(incomeStatementTemplate.id, tenantId, {
      startDate: yearStartDate,
      endDate: asOfDate,
      compareWithPrevious: false
    });
    
    const previousYearStartDate = format(subMonths(parse(previousDate, 'yyyy-MM-dd', new Date()), 12), 'yyyy-MM-dd');
    
    const previousIncomeStatement = options.compareToPrevious ? 
      await this.generateFinancialStatement(incomeStatementTemplate.id, tenantId, {
        startDate: previousYearStartDate,
        endDate: previousDate,
        compareWithPrevious: false
      }) : null;
    
    // Helper function to find a section value by name
    const findSectionValue = (sections: any[], name: string): number => {
      for (const section of sections) {
        if (section.name.toLowerCase().includes(name.toLowerCase())) {
          return section.value;
        }
        
        if (section.children && section.children.length > 0) {
          const childValue = findSectionValue(section.children, name);
          if (childValue !== 0) {
            return childValue;
          }
        }
      }
      
      return 0;
    };
    
    // Extract key financial values from the reports
    const totalAssets = findSectionValue(balanceSheet.sections, "total assets");
    const totalLiabilities = findSectionValue(balanceSheet.sections, "total liabilities");
    const totalEquity = findSectionValue(balanceSheet.sections, "total equity");
    const currentAssets = findSectionValue(balanceSheet.sections, "current assets");
    const currentLiabilities = findSectionValue(balanceSheet.sections, "current liabilities");
    const inventory = findSectionValue(balanceSheet.sections, "inventory");
    const cash = findSectionValue(balanceSheet.sections, "cash") + findSectionValue(balanceSheet.sections, "cash equivalent");
    const accountsReceivable = findSectionValue(balanceSheet.sections, "accounts receivable");
    const netIncome = findSectionValue(incomeStatement.sections, "net income");
    const revenue = findSectionValue(incomeStatement.sections, "revenue") || findSectionValue(incomeStatement.sections, "sales");
    const grossProfit = findSectionValue(incomeStatement.sections, "gross profit");
    const operatingIncome = findSectionValue(incomeStatement.sections, "operating income") || findSectionValue(incomeStatement.sections, "operating profit");
    const interestExpense = findSectionValue(incomeStatement.sections, "interest expense");
    const costOfGoodsSold = findSectionValue(incomeStatement.sections, "cost of goods sold");
    
    // Extract previous period values if comparing
    let prevTotalAssets = 0;
    let prevTotalLiabilities = 0;
    let prevCurrentAssets = 0;
    let prevCurrentLiabilities = 0;
    let prevInventory = 0;
    let prevCash = 0;
    let prevAccountsReceivable = 0;
    let prevNetIncome = 0;
    let prevRevenue = 0;
    let prevGrossProfit = 0;
    let prevOperatingIncome = 0;
    
    if (options.compareToPrevious && previousBalanceSheet && previousIncomeStatement) {
      prevTotalAssets = findSectionValue(previousBalanceSheet.sections, "total assets");
      prevTotalLiabilities = findSectionValue(previousBalanceSheet.sections, "total liabilities");
      prevCurrentAssets = findSectionValue(previousBalanceSheet.sections, "current assets");
      prevCurrentLiabilities = findSectionValue(previousBalanceSheet.sections, "current liabilities");
      prevInventory = findSectionValue(previousBalanceSheet.sections, "inventory");
      prevCash = findSectionValue(previousBalanceSheet.sections, "cash") + findSectionValue(previousBalanceSheet.sections, "cash equivalent");
      prevAccountsReceivable = findSectionValue(previousBalanceSheet.sections, "accounts receivable");
      prevNetIncome = findSectionValue(previousIncomeStatement.sections, "net income");
      prevRevenue = findSectionValue(previousIncomeStatement.sections, "revenue") || findSectionValue(previousIncomeStatement.sections, "sales");
      prevGrossProfit = findSectionValue(previousIncomeStatement.sections, "gross profit");
      prevOperatingIncome = findSectionValue(previousIncomeStatement.sections, "operating income") || findSectionValue(previousIncomeStatement.sections, "operating profit");
    }
    
    // Calculate financial ratios
    const ratios = {
      // Liquidity Ratios
      currentRatio: {
        name: "Current Ratio",
        description: "Measures a company's ability to pay short-term obligations",
        formula: "Current Assets / Current Liabilities",
        value: currentLiabilities !== 0 ? currentAssets / currentLiabilities : 0,
        previousValue: prevCurrentLiabilities !== 0 ? prevCurrentAssets / prevCurrentLiabilities : 0,
        changeAmount: 0,
        changePercent: 0,
        format: "decimal",
        interpretation: ""
      },
      quickRatio: {
        name: "Quick Ratio",
        description: "Measures a company's ability to pay short-term obligations with liquid assets",
        formula: "(Current Assets - Inventory) / Current Liabilities",
        value: currentLiabilities !== 0 ? (currentAssets - inventory) / currentLiabilities : 0,
        previousValue: prevCurrentLiabilities !== 0 ? (prevCurrentAssets - prevInventory) / prevCurrentLiabilities : 0,
        changeAmount: 0,
        changePercent: 0,
        format: "decimal",
        interpretation: ""
      },
      cashRatio: {
        name: "Cash Ratio",
        description: "Measures a company's ability to pay short-term obligations with cash",
        formula: "Cash / Current Liabilities",
        value: currentLiabilities !== 0 ? cash / currentLiabilities : 0,
        previousValue: prevCurrentLiabilities !== 0 ? prevCash / prevCurrentLiabilities : 0,
        changeAmount: 0,
        changePercent: 0,
        format: "decimal",
        interpretation: ""
      },
      
      // Solvency Ratios
      debtToEquity: {
        name: "Debt to Equity",
        description: "Measures the relative proportion of shareholder equity and debt used to finance assets",
        formula: "Total Liabilities / Total Equity",
        value: totalEquity !== 0 ? totalLiabilities / totalEquity : 0,
        previousValue: (prevTotalAssets - prevTotalLiabilities) !== 0 ? prevTotalLiabilities / (prevTotalAssets - prevTotalLiabilities) : 0,
        changeAmount: 0,
        changePercent: 0,
        format: "decimal",
        interpretation: ""
      },
      debtRatio: {
        name: "Debt Ratio",
        description: "Measures the proportion of assets financed by debt",
        formula: "Total Liabilities / Total Assets",
        value: totalAssets !== 0 ? totalLiabilities / totalAssets : 0,
        previousValue: prevTotalAssets !== 0 ? prevTotalLiabilities / prevTotalAssets : 0,
        changeAmount: 0,
        changePercent: 0,
        format: "decimal",
        interpretation: ""
      },
      interestCoverageRatio: {
        name: "Interest Coverage Ratio",
        description: "Measures a company's ability to pay interest on its debt",
        formula: "Operating Income / Interest Expense",
        value: interestExpense !== 0 ? operatingIncome / interestExpense : 0,
        previousValue: 0, // Need interest expense for previous period
        changeAmount: 0,
        changePercent: 0,
        format: "decimal",
        interpretation: ""
      },
      
      // Profitability Ratios
      grossProfitMargin: {
        name: "Gross Profit Margin",
        description: "Measures the percentage of revenue retained after direct costs",
        formula: "Gross Profit / Revenue",
        value: revenue !== 0 ? grossProfit / revenue : 0,
        previousValue: prevRevenue !== 0 ? prevGrossProfit / prevRevenue : 0,
        changeAmount: 0,
        changePercent: 0,
        format: "percentage",
        interpretation: ""
      },
      operatingProfitMargin: {
        name: "Operating Profit Margin",
        description: "Measures the percentage of revenue retained after operating expenses",
        formula: "Operating Income / Revenue",
        value: revenue !== 0 ? operatingIncome / revenue : 0,
        previousValue: prevRevenue !== 0 ? prevOperatingIncome / prevRevenue : 0,
        changeAmount: 0,
        changePercent: 0,
        format: "percentage",
        interpretation: ""
      },
      netProfitMargin: {
        name: "Net Profit Margin",
        description: "Measures the percentage of revenue retained after all expenses",
        formula: "Net Income / Revenue",
        value: revenue !== 0 ? netIncome / revenue : 0,
        previousValue: prevRevenue !== 0 ? prevNetIncome / prevRevenue : 0,
        changeAmount: 0,
        changePercent: 0,
        format: "percentage",
        interpretation: ""
      },
      returnOnAssets: {
        name: "Return on Assets (ROA)",
        description: "Measures how efficiently a company is using its assets to generate profit",
        formula: "Net Income / Total Assets",
        value: totalAssets !== 0 ? netIncome / totalAssets : 0,
        previousValue: prevTotalAssets !== 0 ? prevNetIncome / prevTotalAssets : 0,
        changeAmount: 0,
        changePercent: 0,
        format: "percentage",
        interpretation: ""
      },
      returnOnEquity: {
        name: "Return on Equity (ROE)",
        description: "Measures how efficiently a company is using its equity to generate profit",
        formula: "Net Income / Total Equity",
        value: totalEquity !== 0 ? netIncome / totalEquity : 0,
        previousValue: (prevTotalAssets - prevTotalLiabilities) !== 0 ? prevNetIncome / (prevTotalAssets - prevTotalLiabilities) : 0,
        changeAmount: 0,
        changePercent: 0,
        format: "percentage",
        interpretation: ""
      },
      
      // Efficiency Ratios
      assetTurnoverRatio: {
        name: "Asset Turnover Ratio",
        description: "Measures how efficiently a company is using its assets to generate revenue",
        formula: "Revenue / Total Assets",
        value: totalAssets !== 0 ? revenue / totalAssets : 0,
        previousValue: prevTotalAssets !== 0 ? prevRevenue / prevTotalAssets : 0,
        changeAmount: 0,
        changePercent: 0,
        format: "decimal",
        interpretation: ""
      },
      inventoryTurnoverRatio: {
        name: "Inventory Turnover Ratio",
        description: "Measures how many times inventory is sold and replaced over a period",
        formula: "Cost of Goods Sold / Average Inventory",
        value: inventory !== 0 ? costOfGoodsSold / inventory : 0,
        previousValue: prevInventory !== 0 ? 0 : 0, // Need COGS for previous period
        changeAmount: 0,
        changePercent: 0,
        format: "decimal",
        interpretation: ""
      },
      receivablesTurnoverRatio: {
        name: "Receivables Turnover Ratio",
        description: "Measures how efficiently a company is collecting revenue",
        formula: "Revenue / Average Accounts Receivable",
        value: accountsReceivable !== 0 ? revenue / accountsReceivable : 0,
        previousValue: prevAccountsReceivable !== 0 ? prevRevenue / prevAccountsReceivable : 0,
        changeAmount: 0,
        changePercent: 0,
        format: "decimal",
        interpretation: ""
      },
      daysInInventory: {
        name: "Days in Inventory",
        description: "Average number of days inventory is held before being sold",
        formula: "365 / Inventory Turnover Ratio",
        value: (inventory !== 0 && costOfGoodsSold !== 0) ? 365 / (costOfGoodsSold / inventory) : 0,
        previousValue: 0, // Need previous inventory turnover
        changeAmount: 0,
        changePercent: 0,
        format: "days",
        interpretation: ""
      },
      daysInReceivables: {
        name: "Days in Receivables",
        description: "Average number of days to collect receivables",
        formula: "365 / Receivables Turnover Ratio",
        value: (accountsReceivable !== 0 && revenue !== 0) ? 365 / (revenue / accountsReceivable) : 0,
        previousValue: (prevAccountsReceivable !== 0 && prevRevenue !== 0) ? 365 / (prevRevenue / prevAccountsReceivable) : 0,
        changeAmount: 0,
        changePercent: 0,
        format: "days",
        interpretation: ""
      }
    };
    
    // Calculate changes for each ratio
    for (const key in ratios) {
      if (options.compareToPrevious) {
        const ratio = ratios[key];
        ratio.changeAmount = ratio.value - ratio.previousValue;
        ratio.changePercent = ratio.previousValue !== 0 ? (ratio.changeAmount / Math.abs(ratio.previousValue)) * 100 : 0;
        
        // Format values
        if (ratio.format === "decimal") {
          ratio.formattedValue = ratio.value.toFixed(2);
          ratio.formattedPreviousValue = ratio.previousValue.toFixed(2);
          ratio.formattedChangeAmount = ratio.changeAmount.toFixed(2);
        } else if (ratio.format === "percentage") {
          ratio.formattedValue = (ratio.value * 100).toFixed(2) + "%";
          ratio.formattedPreviousValue = (ratio.previousValue * 100).toFixed(2) + "%";
          ratio.formattedChangeAmount = (ratio.changeAmount * 100).toFixed(2) + "%";
        } else if (ratio.format === "days") {
          ratio.formattedValue = Math.round(ratio.value) + " days";
          ratio.formattedPreviousValue = Math.round(ratio.previousValue) + " days";
          ratio.formattedChangeAmount = Math.round(ratio.changeAmount) + " days";
        }
        
        ratio.formattedChangePercent = ratio.changePercent.toFixed(2) + "%";
      } else {
        const ratio = ratios[key];
        
        // Format values
        if (ratio.format === "decimal") {
          ratio.formattedValue = ratio.value.toFixed(2);
        } else if (ratio.format === "percentage") {
          ratio.formattedValue = (ratio.value * 100).toFixed(2) + "%";
        } else if (ratio.format === "days") {
          ratio.formattedValue = Math.round(ratio.value) + " days";
        }
      }
      
      // Add basic interpretation
      if (key === "currentRatio") {
        if (ratios[key].value > 2) {
          ratios[key].interpretation = "Strong liquidity position";
        } else if (ratios[key].value > 1) {
          ratios[key].interpretation = "Adequate liquidity position";
        } else {
          ratios[key].interpretation = "Potential liquidity concerns";
        }
      } else if (key === "quickRatio") {
        if (ratios[key].value > 1) {
          ratios[key].interpretation = "Strong ability to meet short-term obligations";
        } else if (ratios[key].value > 0.5) {
          ratios[key].interpretation = "Adequate ability to meet short-term obligations";
        } else {
          ratios[key].interpretation = "May struggle to meet short-term obligations";
        }
      } else if (key === "debtToEquity") {
        if (ratios[key].value < 0.5) {
          ratios[key].interpretation = "Low leverage, conservative financing";
        } else if (ratios[key].value < 1.5) {
          ratios[key].interpretation = "Moderate leverage";
        } else {
          ratios[key].interpretation = "High leverage, potentially risky";
        }
      } else if (key === "grossProfitMargin") {
        if (ratios[key].value > 0.4) {
          ratios[key].interpretation = "Strong gross margins";
        } else if (ratios[key].value > 0.2) {
          ratios[key].interpretation = "Average gross margins";
        } else {
          ratios[key].interpretation = "Low gross margins";
        }
      } else if (key === "netProfitMargin") {
        if (ratios[key].value > 0.2) {
          ratios[key].interpretation = "Excellent net profit margin";
        } else if (ratios[key].value > 0.1) {
          ratios[key].interpretation = "Good net profit margin";
        } else if (ratios[key].value > 0.05) {
          ratios[key].interpretation = "Average net profit margin";
        } else if (ratios[key].value > 0) {
          ratios[key].interpretation = "Below average net profit margin";
        } else {
          ratios[key].interpretation = "Negative profitability";
        }
      }
    }
    
    // Group ratios by category
    const groupedRatios = {
      liquidityRatios: [ratios.currentRatio, ratios.quickRatio, ratios.cashRatio],
      solvencyRatios: [ratios.debtToEquity, ratios.debtRatio, ratios.interestCoverageRatio],
      profitabilityRatios: [ratios.grossProfitMargin, ratios.operatingProfitMargin, ratios.netProfitMargin, ratios.returnOnAssets, ratios.returnOnEquity],
      efficiencyRatios: [ratios.assetTurnoverRatio, ratios.inventoryTurnoverRatio, ratios.receivablesTurnoverRatio, ratios.daysInInventory, ratios.daysInReceivables]
    };
    
    // Generate AI insights if OpenAI is available
    let insights = null;
    if (openai) {
      try {
        // Generate insights using OpenAI
        const prompt = `
          Analyze the following financial ratios for a garment manufacturing company and provide 3-5 specific insights, focusing on strengths, areas for improvement, and actionable recommendations.
          
          Current Date: ${asOfDate}
          
          Financial Ratios:
          
          Liquidity Ratios:
          - Current Ratio: ${ratios.currentRatio.value.toFixed(2)}${options.compareToPrevious ? ` (previous: ${ratios.currentRatio.previousValue.toFixed(2)})` : ''}
          - Quick Ratio: ${ratios.quickRatio.value.toFixed(2)}${options.compareToPrevious ? ` (previous: ${ratios.quickRatio.previousValue.toFixed(2)})` : ''}
          - Cash Ratio: ${ratios.cashRatio.value.toFixed(2)}${options.compareToPrevious ? ` (previous: ${ratios.cashRatio.previousValue.toFixed(2)})` : ''}
          
          Solvency Ratios:
          - Debt to Equity: ${ratios.debtToEquity.value.toFixed(2)}${options.compareToPrevious ? ` (previous: ${ratios.debtToEquity.previousValue.toFixed(2)})` : ''}
          - Debt Ratio: ${ratios.debtRatio.value.toFixed(2)}${options.compareToPrevious ? ` (previous: ${ratios.debtRatio.previousValue.toFixed(2)})` : ''}
          - Interest Coverage Ratio: ${ratios.interestCoverageRatio.value.toFixed(2)}
          
          Profitability Ratios:
          - Gross Profit Margin: ${(ratios.grossProfitMargin.value * 100).toFixed(2)}%${options.compareToPrevious ? ` (previous: ${(ratios.grossProfitMargin.previousValue * 100).toFixed(2)}%)` : ''}
          - Operating Profit Margin: ${(ratios.operatingProfitMargin.value * 100).toFixed(2)}%${options.compareToPrevious ? ` (previous: ${(ratios.operatingProfitMargin.previousValue * 100).toFixed(2)}%)` : ''}
          - Net Profit Margin: ${(ratios.netProfitMargin.value * 100).toFixed(2)}%${options.compareToPrevious ? ` (previous: ${(ratios.netProfitMargin.previousValue * 100).toFixed(2)}%)` : ''}
          - Return on Assets: ${(ratios.returnOnAssets.value * 100).toFixed(2)}%${options.compareToPrevious ? ` (previous: ${(ratios.returnOnAssets.previousValue * 100).toFixed(2)}%)` : ''}
          - Return on Equity: ${(ratios.returnOnEquity.value * 100).toFixed(2)}%${options.compareToPrevious ? ` (previous: ${(ratios.returnOnEquity.previousValue * 100).toFixed(2)}%)` : ''}
          
          Efficiency Ratios:
          - Asset Turnover Ratio: ${ratios.assetTurnoverRatio.value.toFixed(2)}${options.compareToPrevious ? ` (previous: ${ratios.assetTurnoverRatio.previousValue.toFixed(2)})` : ''}
          - Inventory Turnover Ratio: ${ratios.inventoryTurnoverRatio.value.toFixed(2)}
          - Receivables Turnover Ratio: ${ratios.receivablesTurnoverRatio.value.toFixed(2)}${options.compareToPrevious ? ` (previous: ${ratios.receivablesTurnoverRatio.previousValue.toFixed(2)})` : ''}
          - Days in Inventory: ${Math.round(ratios.daysInInventory.value)} days
          - Days in Receivables: ${Math.round(ratios.daysInReceivables.value)} days${options.compareToPrevious ? ` (previous: ${Math.round(ratios.daysInReceivables.previousValue)} days)` : ''}
          
          Additional Financial Information:
          - Total Assets: ${formatCurrency(totalAssets)}
          - Total Liabilities: ${formatCurrency(totalLiabilities)}
          - Total Equity: ${formatCurrency(totalEquity)}
          - Net Income: ${formatCurrency(netIncome)}
          - Revenue: ${formatCurrency(revenue)}
          
          For each insight:
          1. Identify a key strength or weakness
          2. Explain the potential cause
          3. Recommend a specific, actionable step for management
          
          Respond in JSON format with an array of insights, each with "title", "analysis", and "recommendation" fields.
        `;
        
        // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        });
        
        insights = JSON.parse(response.choices[0].message.content);
      } catch (error) {
        console.error("Error generating AI insights:", error);
        insights = {
          insights: [
            {
              title: "Error Generating AI Insights",
              analysis: "There was an error connecting to the AI service.",
              recommendation: "Please try again later or check your OpenAI API key configuration."
            }
          ]
        };
      }
    } else {
      insights = {
        insights: [
          {
            title: "AI Insights Not Available",
            analysis: "The OpenAI API key is not configured.",
            recommendation: "To enable AI-powered financial insights, please add your OpenAI API key to the environment variables."
          }
        ]
      };
    }
    
    return {
      reportDate: new Date().toISOString(),
      asOfDate,
      previousDate: options.compareToPrevious ? previousDate : null,
      financialData: {
        totalAssets,
        formattedTotalAssets: formatCurrency(totalAssets),
        totalLiabilities,
        formattedTotalLiabilities: formatCurrency(totalLiabilities),
        totalEquity,
        formattedTotalEquity: formatCurrency(totalEquity),
        currentAssets,
        formattedCurrentAssets: formatCurrency(currentAssets),
        currentLiabilities,
        formattedCurrentLiabilities: formatCurrency(currentLiabilities),
        netIncome,
        formattedNetIncome: formatCurrency(netIncome),
        revenue,
        formattedRevenue: formatCurrency(revenue)
      },
      ratios: groupedRatios,
      insights: insights?.insights || []
    };
  },

  /**
   * Generate a financial forecast
   */
  async generateFinancialForecast(tenantId: number, options: {
    startDate: string;
    endPeriods: number;
    periodType: string;
    accountIds?: number[];
    growthRate?: number;
    seasonalityAdjustment?: boolean;
    useHistoricalTrend?: boolean;
    historicalPeriods?: number;
  }) {
    // Validate required parameters
    if (!options.startDate) {
      throw new Error("startDate is required");
    }
    
    if (!options.endPeriods || options.endPeriods <= 0) {
      throw new Error("endPeriods must be a positive number");
    }
    
    if (!["Monthly", "Quarterly", "Annual"].includes(options.periodType)) {
      throw new Error("periodType must be Monthly, Quarterly, or Annual");
    }
    
    // Default options
    const growthRate = options.growthRate || 3; // 3% default growth rate
    const seasonalityAdjustment = options.seasonalityAdjustment !== false;
    const useHistoricalTrend = options.useHistoricalTrend !== false;
    const historicalPeriods = options.historicalPeriods || 12; // Default to 12 periods of history
    
    // Get accounts to forecast
    let accounts = [];
    if (options.accountIds && options.accountIds.length > 0) {
      for (const accountId of options.accountIds) {
        const account = await chartOfAccountsService.getAccountById(accountId, tenantId);
        if (account) {
          accounts.push(account);
        }
      }
    } else {
      // Default to main P&L accounts
      accounts = await chartOfAccountsService.getAllAccounts(tenantId, true);
      
      // Filter for revenue and expense accounts
      const accountTypeCategories = new Set();
      for (const account of accounts) {
        if (account.accountTypeCategory === "Revenue" || account.accountTypeCategory === "Expense") {
          accountTypeCategories.add(account.accountTypeId);
        }
      }
      
      accounts = accounts.filter(account => 
        account.name.toLowerCase().includes("revenue") || 
        account.name.toLowerCase().includes("sales") || 
        account.name.toLowerCase().includes("income") ||
        account.name.toLowerCase().includes("expense") ||
        accountTypeCategories.has(account.accountTypeId)
      );
    }
    
    if (accounts.length === 0) {
      throw new Error("No accounts found for forecasting");
    }
    
    // Calculate historical data lookback period
    const startDate = parse(options.startDate, 'yyyy-MM-dd', new Date());
    let historicalStartDate;
    
    if (options.periodType === "Monthly") {
      historicalStartDate = subMonths(startDate, historicalPeriods);
    } else if (options.periodType === "Quarterly") {
      historicalStartDate = subMonths(startDate, historicalPeriods * 3);
    } else if (options.periodType === "Annual") {
      historicalStartDate = subMonths(startDate, historicalPeriods * 12);
    }
    
    const historicalStartDateStr = format(historicalStartDate, 'yyyy-MM-dd');
    
    // Get historical data for accounts
    const accountIds = accounts.map(a => a.id);
    
    // Query to get historical data by period
    let groupByPeriod = "DATE_TRUNC('month', j.journal_date)";
    if (options.periodType === "Quarterly") {
      groupByPeriod = "DATE_TRUNC('quarter', j.journal_date)";
    } else if (options.periodType === "Annual") {
      groupByPeriod = "DATE_TRUNC('year', j.journal_date)";
    }
    
    const query = `
      SELECT 
        jl.account_id,
        ${groupByPeriod} AS period_start,
        SUM(CAST(jl.debit_amount AS DECIMAL(15,2)) - CAST(jl.credit_amount AS DECIMAL(15,2))) AS amount
      FROM journal_lines jl
      JOIN journals j ON j.id = jl.journal_id AND j.tenant_id = jl.tenant_id
      WHERE j.tenant_id = $1
        AND j.status = 'Posted'
        AND j.journal_date >= $2
        AND j.journal_date < $3
        AND jl.account_id IN (${accountIds.join(',')})
      GROUP BY jl.account_id, ${groupByPeriod}
      ORDER BY jl.account_id, ${groupByPeriod}
    `;
    
    const historicalData = await db.execute(query, [tenantId, historicalStartDateStr, options.startDate]);
    
    // Process historical data
    const historicalByAccount = {};
    
    for (const row of historicalData.rows) {
      const accountId = row.account_id;
      const periodStart = new Date(row.period_start);
      const amount = parseFloat(row.amount);
      
      if (!historicalByAccount[accountId]) {
        historicalByAccount[accountId] = [];
      }
      
      historicalByAccount[accountId].push({
        periodStart,
        amount
      });
    }
    
    // Generate forecast periods
    const forecastPeriods = [];
    let currentDate = startDate;
    
    for (let i = 0; i < options.endPeriods; i++) {
      let periodEnd;
      
      if (options.periodType === "Monthly") {
        periodEnd = addMonths(currentDate, 1);
      } else if (options.periodType === "Quarterly") {
        periodEnd = addMonths(currentDate, 3);
      } else if (options.periodType === "Annual") {
        periodEnd = addMonths(currentDate, 12);
      }
      
      periodEnd = new Date(periodEnd.setDate(periodEnd.getDate() - 1)); // Last day of period
      
      forecastPeriods.push({
        periodStart: currentDate,
        periodEnd,
        periodName: format(currentDate, options.periodType === "Monthly" ? 'MMM yyyy' : 
                                         options.periodType === "Quarterly" ? "'Q'Q yyyy" : 
                                         'yyyy')
      });
      
      // Move to next period
      currentDate = new Date(periodEnd.setDate(periodEnd.getDate() + 1));
    }
    
    // Generate forecast for each account
    const forecast = {
      generatedAt: new Date().toISOString(),
      startDate: options.startDate,
      periodType: options.periodType,
      periods: forecastPeriods,
      accounts: []
    };
    
    for (const account of accounts) {
      const accountForecast = {
        id: account.id,
        accountNumber: account.accountNumber,
        name: account.name,
        historical: [],
        forecast: []
      };
      
      // Historical data
      const historical = historicalByAccount[account.id] || [];
      
      // Calculate average and trend from historical data
      let average = 0;
      let trend = 0;
      
      if (historical.length > 0) {
        average = historical.reduce((sum, h) => sum + h.amount, 0) / historical.length;
        
        if (useHistoricalTrend && historical.length > 1) {
          // Simple linear regression for trend
          const xValues = Array.from({length: historical.length}, (_, i) => i);
          const yValues = historical.map(h => h.amount);
          
          const xMean = xValues.reduce((sum, x) => sum + x, 0) / xValues.length;
          const yMean = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
          
          let numerator = 0;
          let denominator = 0;
          
          for (let i = 0; i < xValues.length; i++) {
            numerator += (xValues[i] - xMean) * (yValues[i] - yMean);
            denominator += Math.pow(xValues[i] - xMean, 2);
          }
          
          trend = denominator !== 0 ? numerator / denominator : 0;
        }
      }
      
      // Add historical data to account forecast
      for (const period of historical) {
        accountForecast.historical.push({
          periodStart: format(period.periodStart, 'yyyy-MM-dd'),
          periodName: format(period.periodStart, options.periodType === "Monthly" ? 'MMM yyyy' : 
                                                options.periodType === "Quarterly" ? "'Q'Q yyyy" : 
                                                'yyyy'),
          amount: period.amount,
          formattedAmount: formatCurrency(period.amount)
        });
      }
      
      // Generate forecast for each period
      for (let i = 0; i < forecastPeriods.length; i++) {
        const period = forecastPeriods[i];
        
        // Base forecast on average plus trend
        let forecastAmount = average;
        
        if (useHistoricalTrend) {
          forecastAmount += trend * (historical.length + i);
        }
        
        // Apply growth rate
        forecastAmount *= Math.pow(1 + growthRate / 100, i + 1);
        
        // Apply seasonality if enabled
        if (seasonalityAdjustment) {
          const monthIndex = period.periodStart.getMonth();
          
          // Simple seasonality factors based on month
          const seasonalityFactors = [
            0.9,  // January - Slower after holiday season
            0.85, // February - Typically slower month
            1.0,  // March - Start of Spring
            1.05, // April - Spring season
            1.1,  // May - Transition to Summer
            1.15, // June - Summer season
            1.05, // July - Mid Summer
            1.1,  // August - Back to school season
            1.2,  // September - Fall season
            1.15, // October - Pre-holiday
            1.25, // November - Holiday season begins
            1.3   // December - Peak holiday season
          ];
          
          // Adjust based on quarterization if period type is quarterly
          if (options.periodType === "Quarterly") {
            const quarterSeasonality = [
              (seasonalityFactors[0] + seasonalityFactors[1] + seasonalityFactors[2]) / 3, // Q1
              (seasonalityFactors[3] + seasonalityFactors[4] + seasonalityFactors[5]) / 3, // Q2
              (seasonalityFactors[6] + seasonalityFactors[7] + seasonalityFactors[8]) / 3, // Q3
              (seasonalityFactors[9] + seasonalityFactors[10] + seasonalityFactors[11]) / 3 // Q4
            ];
            
            const quarterIndex = Math.floor(monthIndex / 3);
            forecastAmount *= quarterSeasonality[quarterIndex];
          } else if (options.periodType === "Monthly") {
            forecastAmount *= seasonalityFactors[monthIndex];
          }
          // Annual doesn't get seasonality adjustment
        }
        
        // Add forecast to account
        accountForecast.forecast.push({
          periodStart: format(period.periodStart, 'yyyy-MM-dd'),
          periodEnd: format(period.periodEnd, 'yyyy-MM-dd'),
          periodName: period.periodName,
          amount: forecastAmount,
          formattedAmount: formatCurrency(forecastAmount)
        });
      }
      
      forecast.accounts.push(accountForecast);
    }
    
    return forecast;
  },

  /**
   * Create a financial insight from generated reports
   */
  async createFinancialInsight(data: any) {
    // Simple validation
    if (!data.title) {
      throw new Error("Title is required");
    }
    
    if (!data.description) {
      throw new Error("Description is required");
    }
    
    if (!data.tenantId) {
      throw new Error("Tenant ID is required");
    }
    
    // Create the insight
    return financialReportingStorage.createInsight(data);
  },

  /**
   * Initialize default financial statement templates
   */
  async initializeDefaultTemplates(tenantId: number) {
    try {
      // Check if default templates already exist
      const balanceSheetTemplate = await this.getDefaultTemplate("BalanceSheet", tenantId);
      const incomeStatementTemplate = await this.getDefaultTemplate("IncomeStatement", tenantId);
      const cashFlowTemplate = await this.getDefaultTemplate("CashFlow", tenantId);
      
      // Create default balance sheet template if it doesn't exist
      if (!balanceSheetTemplate) {
        const newTemplate = await this.createTemplate({
          name: "Default Balance Sheet",
          type: "BalanceSheet",
          description: "Default balance sheet template with standard sections",
          isActive: true,
          isDefault: true,
          format: "Standard",
          tenantId
        });
        
        // Create sections
        // Assets section
        const assetsSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Assets",
          description: "All assets",
          type: "Header",
          displayOrder: 10,
          tenantId
        });
        
        // Current assets
        const currentAssetsSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Current Assets",
          description: "Short-term assets",
          type: "Group",
          parentSectionId: assetsSection.id,
          displayOrder: 20,
          tenantId
        });
        
        // Fixed assets
        const fixedAssetsSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Fixed Assets",
          description: "Long-term assets",
          type: "Group",
          parentSectionId: assetsSection.id,
          displayOrder: 30,
          tenantId
        });
        
        // Total assets
        const totalAssetsSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Total Assets",
          description: "Sum of all assets",
          type: "Total",
          parentSectionId: assetsSection.id,
          displayOrder: 40,
          tenantId
        });
        
        // Liabilities section
        const liabilitiesSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Liabilities",
          description: "All liabilities",
          type: "Header",
          displayOrder: 50,
          tenantId
        });
        
        // Current liabilities
        const currentLiabilitiesSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Current Liabilities",
          description: "Short-term liabilities",
          type: "Group",
          parentSectionId: liabilitiesSection.id,
          displayOrder: 60,
          tenantId
        });
        
        // Long-term liabilities
        const longTermLiabilitiesSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Long-term Liabilities",
          description: "Long-term liabilities",
          type: "Group",
          parentSectionId: liabilitiesSection.id,
          displayOrder: 70,
          tenantId
        });
        
        // Total liabilities
        const totalLiabilitiesSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Total Liabilities",
          description: "Sum of all liabilities",
          type: "Total",
          parentSectionId: liabilitiesSection.id,
          displayOrder: 80,
          tenantId
        });
        
        // Equity section
        const equitySection = await this.createSection({
          templateId: newTemplate.id,
          name: "Equity",
          description: "All equity",
          type: "Header",
          displayOrder: 90,
          tenantId
        });
        
        // Equity accounts
        const equityAccountsSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Equity Accounts",
          description: "Equity accounts",
          type: "Group",
          parentSectionId: equitySection.id,
          displayOrder: 100,
          tenantId
        });
        
        // Total equity
        const totalEquitySection = await this.createSection({
          templateId: newTemplate.id,
          name: "Total Equity",
          description: "Sum of all equity",
          type: "Total",
          parentSectionId: equitySection.id,
          displayOrder: 110,
          tenantId
        });
        
        // Liabilities and equity
        const liabilitiesAndEquitySection = await this.createSection({
          templateId: newTemplate.id,
          name: "Total Liabilities and Equity",
          description: "Sum of liabilities and equity",
          type: "Calculation",
          formula: `[${totalLiabilitiesSection.id}] + [${totalEquitySection.id}]`,
          displayOrder: 120,
          tenantId
        });
      }
      
      // Create default income statement template if it doesn't exist
      if (!incomeStatementTemplate) {
        const newTemplate = await this.createTemplate({
          name: "Default Income Statement",
          type: "IncomeStatement",
          description: "Default income statement template with standard sections",
          isActive: true,
          isDefault: true,
          format: "Standard",
          tenantId
        });
        
        // Create sections
        // Revenue section
        const revenueSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Revenue",
          description: "All revenue",
          type: "Group",
          displayOrder: 10,
          tenantId
        });
        
        // Cost of goods sold
        const cogsSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Cost of Goods Sold",
          description: "Cost of goods sold",
          type: "Group",
          isNegative: true,
          displayOrder: 20,
          tenantId
        });
        
        // Gross profit
        const grossProfitSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Gross Profit",
          description: "Revenue minus cost of goods sold",
          type: "Calculation",
          formula: `[${revenueSection.id}] - [${cogsSection.id}]`,
          displayOrder: 30,
          tenantId
        });
        
        // Operating expenses
        const opexSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Operating Expenses",
          description: "All operating expenses",
          type: "Group",
          isNegative: true,
          displayOrder: 40,
          tenantId
        });
        
        // Operating income
        const operatingIncomeSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Operating Income",
          description: "Gross profit minus operating expenses",
          type: "Calculation",
          formula: `[${grossProfitSection.id}] - [${opexSection.id}]`,
          displayOrder: 50,
          tenantId
        });
        
        // Other income
        const otherIncomeSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Other Income",
          description: "Other income",
          type: "Group",
          displayOrder: 60,
          tenantId
        });
        
        // Other expenses
        const otherExpensesSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Other Expenses",
          description: "Other expenses",
          type: "Group",
          isNegative: true,
          displayOrder: 70,
          tenantId
        });
        
        // Income before taxes
        const incomeTaxesSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Income Before Taxes",
          description: "Operating income plus other income minus other expenses",
          type: "Calculation",
          formula: `[${operatingIncomeSection.id}] + [${otherIncomeSection.id}] - [${otherExpensesSection.id}]`,
          displayOrder: 80,
          tenantId
        });
        
        // Tax expense
        const taxExpenseSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Tax Expense",
          description: "Tax expense",
          type: "Group",
          isNegative: true,
          displayOrder: 90,
          tenantId
        });
        
        // Net income
        const netIncomeSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Net Income",
          description: "Income before taxes minus tax expense",
          type: "Calculation",
          formula: `[${incomeTaxesSection.id}] - [${taxExpenseSection.id}]`,
          displayOrder: 100,
          tenantId
        });
      }
      
      // Create default cash flow statement template if it doesn't exist
      if (!cashFlowTemplate) {
        const newTemplate = await this.createTemplate({
          name: "Default Cash Flow Statement",
          type: "CashFlow",
          description: "Default cash flow statement template with standard sections",
          isActive: true,
          isDefault: true,
          format: "Standard",
          tenantId
        });
        
        // Create sections
        // Operating activities
        const operatingSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Operating Activities",
          description: "Cash flows from operations",
          type: "Header",
          displayOrder: 10,
          tenantId
        });
        
        // Net income
        const netIncomeSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Net Income",
          description: "Net income from income statement",
          type: "Group",
          parentSectionId: operatingSection.id,
          displayOrder: 20,
          tenantId
        });
        
        // Adjustments
        const adjustmentsSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Adjustments to Reconcile Net Income",
          description: "Adjustments to net income",
          type: "Group",
          parentSectionId: operatingSection.id,
          displayOrder: 30,
          tenantId
        });
        
        // Changes in working capital
        const workingCapitalSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Changes in Working Capital",
          description: "Changes in working capital accounts",
          type: "Group",
          parentSectionId: operatingSection.id,
          displayOrder: 40,
          tenantId
        });
        
        // Net cash from operating activities
        const netCashOperatingSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Net Cash from Operating Activities",
          description: "Net cash provided by operating activities",
          type: "Total",
          parentSectionId: operatingSection.id,
          displayOrder: 50,
          tenantId
        });
        
        // Investing activities
        const investingSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Investing Activities",
          description: "Cash flows from investing",
          type: "Header",
          displayOrder: 60,
          tenantId
        });
        
        // Investing cash flows
        const investingCashFlowsSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Investing Cash Flows",
          description: "Cash flows related to investing",
          type: "Group",
          parentSectionId: investingSection.id,
          displayOrder: 70,
          tenantId
        });
        
        // Net cash from investing activities
        const netCashInvestingSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Net Cash from Investing Activities",
          description: "Net cash used in investing activities",
          type: "Total",
          parentSectionId: investingSection.id,
          displayOrder: 80,
          tenantId
        });
        
        // Financing activities
        const financingSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Financing Activities",
          description: "Cash flows from financing",
          type: "Header",
          displayOrder: 90,
          tenantId
        });
        
        // Financing cash flows
        const financingCashFlowsSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Financing Cash Flows",
          description: "Cash flows related to financing",
          type: "Group",
          parentSectionId: financingSection.id,
          displayOrder: 100,
          tenantId
        });
        
        // Net cash from financing activities
        const netCashFinancingSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Net Cash from Financing Activities",
          description: "Net cash provided by financing activities",
          type: "Total",
          parentSectionId: financingSection.id,
          displayOrder: 110,
          tenantId
        });
        
        // Net increase in cash
        const netIncreaseSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Net Increase in Cash",
          description: "Net increase in cash for the period",
          type: "Calculation",
          formula: `[${netCashOperatingSection.id}] + [${netCashInvestingSection.id}] + [${netCashFinancingSection.id}]`,
          displayOrder: 120,
          tenantId
        });
        
        // Beginning cash balance
        const beginningCashSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Beginning Cash Balance",
          description: "Cash at the beginning of the period",
          type: "Group",
          displayOrder: 130,
          tenantId
        });
        
        // Ending cash balance
        const endingCashSection = await this.createSection({
          templateId: newTemplate.id,
          name: "Ending Cash Balance",
          description: "Cash at the end of the period",
          type: "Calculation",
          formula: `[${beginningCashSection.id}] + [${netIncreaseSection.id}]`,
          displayOrder: 140,
          tenantId
        });
      }
      
      return {
        balanceSheetTemplate: balanceSheetTemplate || "Created",
        incomeStatementTemplate: incomeStatementTemplate || "Created",
        cashFlowTemplate: cashFlowTemplate || "Created"
      };
    } catch (error) {
      console.error("Error initializing default templates:", error);
      throw error;
    }
  }
};