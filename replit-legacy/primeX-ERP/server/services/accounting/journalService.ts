import { journalStorage } from "../../database/accounting/journalStorage";
import { chartOfAccountsService } from "./chartOfAccountsService";
import { fiscalYearService } from "./fiscalYearService";
import { z } from "zod";
import { parse, isValid } from "date-fns";

// Validation schema for journal entries
const journalSchema = z.object({
  journalNumber: z.string().optional(),
  reference: z.string().optional(),
  journalDate: z.string().refine(val => {
    const date = parse(val, 'yyyy-MM-dd', new Date());
    return isValid(date);
  }, { message: "Journal date must be a valid date in the format YYYY-MM-DD" }),
  description: z.string().optional(),
  journalTypeId: z.number().int().positive("Journal type ID is required"),
  fiscalYearId: z.number().int().positive("Fiscal year ID is required"),
  periodId: z.number().int().positive("Accounting period ID is required"),
  currencyId: z.number().int().optional(),
  exchangeRate: z.string().default("1"),
  totalDebit: z.string(),
  totalCredit: z.string(),
  status: z.enum(["Draft", "Posted", "Reversed"], {
    errorMap: () => ({ message: "Status must be Draft, Posted, or Reversed" })
  }).default("Draft"),
  notes: z.string().optional(),
  createdBy: z.number().int().positive(),
  postedBy: z.number().int().optional(),
  reversedBy: z.number().int().optional(),
  tenantId: z.number().int().positive()
});

// Validation schema for journal lines
const journalLineSchema = z.object({
  journalId: z.number().int().positive().optional(),
  accountId: z.number().int().positive("Account ID is required"),
  description: z.string().optional(),
  debitAmount: z.string().default("0"),
  creditAmount: z.string().default("0"),
  reference: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  taxAmount: z.string().optional(),
  taxAccountId: z.number().int().optional(),
  tenantId: z.number().int().positive()
}).refine(data => {
  // Either debit or credit amount should be greater than 0, but not both
  const debit = parseFloat(data.debitAmount || "0");
  const credit = parseFloat(data.creditAmount || "0");
  return (debit > 0 && credit === 0) || (credit > 0 && debit === 0);
}, {
  message: "Either debit or credit amount should be greater than 0, but not both",
  path: ["debitAmount", "creditAmount"]
});

// Validation schema for journal types
const journalTypeSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  code: z.string().min(1, "Code is required").max(20),
  description: z.string().optional(),
  isSystem: z.boolean().default(false),
  isActive: z.boolean().default(true),
  tenantId: z.number().int().positive()
});

export const journalService = {
  /**
   * Get all journal types
   */
  async getAllJournalTypes(tenantId: number, activeOnly: boolean = false) {
    return journalStorage.getAllJournalTypes(tenantId, activeOnly);
  },

  /**
   * Get a journal type by ID
   */
  async getJournalTypeById(id: number, tenantId: number) {
    return journalStorage.getJournalTypeById(id, tenantId);
  },

  /**
   * Create a new journal type with validation
   */
  async createJournalType(data: any) {
    // Validate the journal type data
    const validatedData = journalTypeSchema.parse(data);
    
    // TODO: Check if journal type with same code already exists
    
    return journalStorage.createJournalType(validatedData);
  },

  /**
   * Update a journal type with validation
   */
  async updateJournalType(id: number, tenantId: number, data: any) {
    // Validate the update data (partial validation)
    const validatedData = journalTypeSchema.partial().parse(data);
    
    // Check if journal type exists
    const existingType = await journalStorage.getJournalTypeById(id, tenantId);
    if (!existingType) {
      throw new Error("Journal type not found");
    }
    
    // If it's a system journal type, prevent certain updates
    if (existingType.isSystem) {
      if (validatedData.code) {
        throw new Error("Cannot change the code of a system journal type");
      }
      
      if (validatedData.isSystem === false) {
        throw new Error("Cannot change the system status of a system journal type");
      }
    }
    
    return journalStorage.updateJournalType(id, tenantId, validatedData);
  },

  /**
   * Delete a journal type
   */
  async deleteJournalType(id: number, tenantId: number) {
    // Check if journal type exists
    const existingType = await journalStorage.getJournalTypeById(id, tenantId);
    if (!existingType) {
      throw new Error("Journal type not found");
    }
    
    // If it's a system journal type, prevent deletion
    if (existingType.isSystem) {
      throw new Error("Cannot delete a system journal type");
    }
    
    // TODO: Check if journal type is used by any journals
    
    return journalStorage.deleteJournalType(id, tenantId);
  },

  /**
   * Get all journals with optional filters
   */
  async getAllJournals(tenantId: number, options: any = {}) {
    return journalStorage.getAllJournals(tenantId, options);
  },

  /**
   * Get a journal by ID
   */
  async getJournalById(id: number, tenantId: number) {
    return journalStorage.getJournalById(id, tenantId);
  },

  /**
   * Get a journal with its lines
   */
  async getJournalWithLines(id: number, tenantId: number) {
    return journalStorage.getJournalWithLines(id, tenantId);
  },

  /**
   * Get the next journal number
   */
  async getNextJournalNumber(typeCode: string, tenantId: number) {
    return journalStorage.getNextJournalNumber(typeCode, tenantId);
  },

  /**
   * Create a new journal with its lines
   */
  async createJournal(journalData: any, linesData: any[]) {
    // Validate journal data
    let validatedJournalData = { ...journalData };
    
    // If journal number is not provided, generate it
    if (!validatedJournalData.journalNumber) {
      // Get the journal type to get its code
      const journalType = await journalStorage.getJournalTypeById(
        validatedJournalData.journalTypeId, 
        validatedJournalData.tenantId
      );
      
      if (!journalType) {
        throw new Error("Invalid journal type");
      }
      
      validatedJournalData.journalNumber = await journalStorage.getNextJournalNumber(
        journalType.code, 
        validatedJournalData.tenantId
      );
    }
    
    // Validate journal data with complete schema
    validatedJournalData = journalSchema.parse(validatedJournalData);
    
    // Check if fiscal year exists and is active
    const fiscalYear = await fiscalYearService.getFiscalYearById(
      validatedJournalData.fiscalYearId, 
      validatedJournalData.tenantId
    );
    
    if (!fiscalYear) {
      throw new Error("Invalid fiscal year");
    }
    
    if (fiscalYear.isClosed) {
      throw new Error("Cannot create journal for a closed fiscal year");
    }
    
    // Check if accounting period exists and is active
    const period = await fiscalYearService.getAccountingPeriodById(
      validatedJournalData.periodId, 
      validatedJournalData.tenantId
    );
    
    if (!period) {
      throw new Error("Invalid accounting period");
    }
    
    if (period.isClosed) {
      throw new Error("Cannot create journal for a closed accounting period");
    }
    
    // Check if the journal date is within the accounting period
    const journalDate = parse(validatedJournalData.journalDate, 'yyyy-MM-dd', new Date());
    const periodStartDate = parse(period.startDate, 'yyyy-MM-dd', new Date());
    const periodEndDate = parse(period.endDate, 'yyyy-MM-dd', new Date());
    
    if (journalDate < periodStartDate || journalDate > periodEndDate) {
      throw new Error("Journal date must be within the accounting period");
    }
    
    // Validate and process journal lines
    if (!linesData || linesData.length === 0) {
      throw new Error("Journal must have at least one line");
    }
    
    let totalDebit = 0;
    let totalCredit = 0;
    
    const validatedLines = [];
    
    for (const lineData of linesData) {
      // Validate line data
      const validatedLineData = journalLineSchema.parse({
        ...lineData,
        tenantId: validatedJournalData.tenantId
      });
      
      // Check if account exists
      const account = await chartOfAccountsService.getAccountById(
        validatedLineData.accountId, 
        validatedJournalData.tenantId
      );
      
      if (!account) {
        throw new Error(`Invalid account ID: ${validatedLineData.accountId}`);
      }
      
      // Update totals
      totalDebit += parseFloat(validatedLineData.debitAmount || "0");
      totalCredit += parseFloat(validatedLineData.creditAmount || "0");
      
      validatedLines.push(validatedLineData);
    }
    
    // Check if debits and credits balance
    if (Math.abs(totalDebit - totalCredit) > 0.001) { // Allow small rounding differences
      throw new Error("Journal debits and credits must balance");
    }
    
    // Update journal totals
    validatedJournalData.totalDebit = totalDebit.toString();
    validatedJournalData.totalCredit = totalCredit.toString();
    
    // Create the journal with its lines
    return journalStorage.createJournal(validatedJournalData, validatedLines);
  },

  /**
   * Update a journal and its lines
   */
  async updateJournal(id: number, tenantId: number, journalData: any, options: {
    newLines?: any[];
    updateLines?: { id: number, data: any }[];
    deleteLineIds?: number[];
  } = {}) {
    // Get the existing journal
    const existingJournal = await journalStorage.getJournalById(id, tenantId);
    if (!existingJournal) {
      throw new Error("Journal not found");
    }
    
    // Only draft journals can be updated
    if (existingJournal.status !== "Draft") {
      throw new Error("Only draft journals can be updated");
    }
    
    // Validate journal data (partial)
    const validatedJournalData = journalSchema.partial().parse(journalData);
    
    // If fiscal year is being changed, validate it
    if (validatedJournalData.fiscalYearId && validatedJournalData.fiscalYearId !== existingJournal.fiscalYearId) {
      const fiscalYear = await fiscalYearService.getFiscalYearById(
        validatedJournalData.fiscalYearId, 
        tenantId
      );
      
      if (!fiscalYear) {
        throw new Error("Invalid fiscal year");
      }
      
      if (fiscalYear.isClosed) {
        throw new Error("Cannot move journal to a closed fiscal year");
      }
    }
    
    // If period is being changed, validate it
    if (validatedJournalData.periodId && validatedJournalData.periodId !== existingJournal.periodId) {
      const period = await fiscalYearService.getAccountingPeriodById(
        validatedJournalData.periodId, 
        tenantId
      );
      
      if (!period) {
        throw new Error("Invalid accounting period");
      }
      
      if (period.isClosed) {
        throw new Error("Cannot move journal to a closed accounting period");
      }
      
      // Check if the journal date is within the new period
      const journalDate = parse(
        validatedJournalData.journalDate || existingJournal.journalDate, 
        'yyyy-MM-dd', 
        new Date()
      );
      const periodStartDate = parse(period.startDate, 'yyyy-MM-dd', new Date());
      const periodEndDate = parse(period.endDate, 'yyyy-MM-dd', new Date());
      
      if (journalDate < periodStartDate || journalDate > periodEndDate) {
        throw new Error("Journal date must be within the accounting period");
      }
    }
    
    // Process line changes
    const newLines = options.newLines || [];
    const updateLines = options.updateLines || [];
    const deleteLineIds = options.deleteLineIds || [];
    
    // Get all current lines
    const { lines: currentLines } = await journalStorage.getJournalWithLines(id, tenantId) || { lines: [] };
    
    // Validate new lines
    const validatedNewLines = [];
    for (const lineData of newLines) {
      const validatedLineData = journalLineSchema.parse({
        ...lineData,
        journalId: id,
        tenantId
      });
      
      // Check if account exists
      const account = await chartOfAccountsService.getAccountById(
        validatedLineData.accountId, 
        tenantId
      );
      
      if (!account) {
        throw new Error(`Invalid account ID: ${validatedLineData.accountId}`);
      }
      
      validatedNewLines.push(validatedLineData);
    }
    
    // Validate updated lines
    const validatedUpdateLines = [];
    for (const { id: lineId, data: lineData } of updateLines) {
      // Find the line in current lines
      const currentLine = currentLines.find(line => line.id === lineId);
      if (!currentLine) {
        throw new Error(`Line with ID ${lineId} not found`);
      }
      
      // Validate line data (partial)
      const validatedLineData = journalLineSchema.partial().parse(lineData);
      
      // If account is being changed, check if it exists
      if (validatedLineData.accountId && validatedLineData.accountId !== currentLine.accountId) {
        const account = await chartOfAccountsService.getAccountById(
          validatedLineData.accountId, 
          tenantId
        );
        
        if (!account) {
          throw new Error(`Invalid account ID: ${validatedLineData.accountId}`);
        }
      }
      
      validatedUpdateLines.push({ id: lineId, data: validatedLineData });
    }
    
    // Validate line deletion
    for (const lineId of deleteLineIds) {
      // Find the line in current lines
      const currentLine = currentLines.find(line => line.id === lineId);
      if (!currentLine) {
        throw new Error(`Line with ID ${lineId} not found`);
      }
    }
    
    // Calculate new totals after all changes
    let totalDebit = 0;
    let totalCredit = 0;
    
    // Calculate totals for existing lines that aren't being deleted or updated
    for (const line of currentLines) {
      if (!deleteLineIds.includes(line.id) && !updateLines.some(ul => ul.id === line.id)) {
        totalDebit += parseFloat(line.debitAmount || "0");
        totalCredit += parseFloat(line.creditAmount || "0");
      }
    }
    
    // Add totals for updated lines
    for (const { id: lineId, data: lineData } of validatedUpdateLines) {
      const currentLine = currentLines.find(line => line.id === lineId);
      
      // Use updated amounts if provided, otherwise use current amounts
      const debitAmount = lineData.debitAmount !== undefined ? lineData.debitAmount : currentLine.debitAmount;
      const creditAmount = lineData.creditAmount !== undefined ? lineData.creditAmount : currentLine.creditAmount;
      
      totalDebit += parseFloat(debitAmount || "0");
      totalCredit += parseFloat(creditAmount || "0");
    }
    
    // Add totals for new lines
    for (const line of validatedNewLines) {
      totalDebit += parseFloat(line.debitAmount || "0");
      totalCredit += parseFloat(line.creditAmount || "0");
    }
    
    // Check if debits and credits balance
    if (Math.abs(totalDebit - totalCredit) > 0.001) { // Allow small rounding differences
      throw new Error("Journal debits and credits must balance");
    }
    
    // Update journal totals
    validatedJournalData.totalDebit = totalDebit.toString();
    validatedJournalData.totalCredit = totalCredit.toString();
    
    // Update the journal with its lines
    return journalStorage.updateJournal(
      id, 
      tenantId, 
      validatedJournalData, 
      validatedNewLines, 
      validatedUpdateLines, 
      deleteLineIds
    );
  },

  /**
   * Post a journal
   */
  async postJournal(id: number, tenantId: number, userId: number) {
    // Get the journal with its lines
    const journalWithLines = await journalStorage.getJournalWithLines(id, tenantId);
    if (!journalWithLines) {
      throw new Error("Journal not found");
    }
    
    const { journal, lines } = journalWithLines;
    
    // Only draft journals can be posted
    if (journal.status !== "Draft") {
      throw new Error("Only draft journals can be posted");
    }
    
    // Check if the fiscal year is closed
    const fiscalYear = await fiscalYearService.getFiscalYearById(
      journal.fiscalYearId, 
      tenantId
    );
    
    if (!fiscalYear) {
      throw new Error("Invalid fiscal year");
    }
    
    if (fiscalYear.isClosed) {
      throw new Error("Cannot post journal to a closed fiscal year");
    }
    
    // Check if the accounting period is closed
    const period = await fiscalYearService.getAccountingPeriodById(
      journal.periodId, 
      tenantId
    );
    
    if (!period) {
      throw new Error("Invalid accounting period");
    }
    
    if (period.isClosed) {
      throw new Error("Cannot post journal to a closed accounting period");
    }
    
    // TODO: Update account balances based on journal lines
    
    // Post the journal
    return journalStorage.postJournal(id, tenantId, userId);
  },

  /**
   * Reverse a journal
   */
  async reverseJournal(id: number, tenantId: number, userId: number, reversalDate: string) {
    // Validate the reversal date
    if (!isValid(parse(reversalDate, 'yyyy-MM-dd', new Date()))) {
      throw new Error("Invalid reversal date format. Use YYYY-MM-DD");
    }
    
    // Get the journal with its lines
    const journalWithLines = await journalStorage.getJournalWithLines(id, tenantId);
    if (!journalWithLines) {
      throw new Error("Journal not found");
    }
    
    const { journal } = journalWithLines;
    
    // Only posted journals can be reversed
    if (journal.status !== "Posted") {
      throw new Error("Only posted journals can be reversed");
    }
    
    // Check if the fiscal year is closed
    const fiscalYear = await fiscalYearService.getFiscalYearById(
      journal.fiscalYearId, 
      tenantId
    );
    
    if (!fiscalYear) {
      throw new Error("Invalid fiscal year");
    }
    
    if (fiscalYear.isClosed) {
      throw new Error("Cannot reverse journal from a closed fiscal year");
    }
    
    // TODO: Update account balances based on reversed journal lines
    
    // Reverse the journal
    return journalStorage.reverseJournal(id, tenantId, userId, reversalDate);
  },

  /**
   * Delete a journal (draft only)
   */
  async deleteJournal(id: number, tenantId: number) {
    // Get the journal
    const journal = await journalStorage.getJournalById(id, tenantId);
    if (!journal) {
      throw new Error("Journal not found");
    }
    
    // Only draft journals can be deleted
    if (journal.status !== "Draft") {
      throw new Error("Only draft journals can be deleted");
    }
    
    return journalStorage.deleteJournal(id, tenantId);
  },

  /**
   * Get journal lines
   */
  async getJournalLines(journalId: number, tenantId: number) {
    return journalStorage.getJournalLines(journalId, tenantId);
  },

  /**
   * Initialize default journal types for a new tenant
   */
  async initializeDefaultJournalTypes(tenantId: number) {
    // Default journal types for garment manufacturing
    const defaultTypes = [
      { name: "General Journal", code: "GJ", description: "General journal entries", isSystem: true, tenantId },
      { name: "Sales Journal", code: "SJ", description: "Sales transactions", isSystem: true, tenantId },
      { name: "Purchase Journal", code: "PJ", description: "Purchase transactions", isSystem: true, tenantId },
      { name: "Cash Receipt Journal", code: "CR", description: "Cash receipts", isSystem: true, tenantId },
      { name: "Cash Disbursement Journal", code: "CD", description: "Cash payments", isSystem: true, tenantId },
      { name: "Payroll Journal", code: "PR", description: "Payroll transactions", isSystem: true, tenantId },
      { name: "Factory Overhead Journal", code: "FOH", description: "Factory overhead allocations", isSystem: true, tenantId },
      { name: "Inventory Journal", code: "INV", description: "Inventory transactions", isSystem: true, tenantId },
      { name: "Adjustment Journal", code: "ADJ", description: "Adjustment entries", isSystem: true, tenantId },
      { name: "Reversal Journal", code: "REV", description: "Reversal entries", isSystem: true, tenantId },
      { name: "Year-end Closing Journal", code: "YEC", description: "Year-end closing entries", isSystem: true, tenantId }
    ];

    // Create all default journal types
    for (const type of defaultTypes) {
      try {
        // Skip if journal type with same code already exists
        const existingTypes = await journalStorage.getAllJournalTypes(tenantId);
        const exists = existingTypes.some(t => t.code === type.code);
        
        if (!exists) {
          await journalStorage.createJournalType(type);
        }
      } catch (error) {
        console.error(`Error creating default journal type ${type.code}:`, error);
        // Continue with other types even if one fails
      }
    }

    return true;
  }
};