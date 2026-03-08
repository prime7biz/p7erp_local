import { fiscalYearStorage } from "../../database/accounting/fiscalYearStorage";
import { z } from "zod";
import { add, parse, format, compareAsc, isValid } from "date-fns";

// Validation schema for fiscal years
const fiscalYearSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  startDate: z.string().refine(val => {
    const date = parse(val, 'yyyy-MM-dd', new Date());
    return isValid(date);
  }, { message: "Start date must be a valid date in the format YYYY-MM-DD" }),
  endDate: z.string().refine(val => {
    const date = parse(val, 'yyyy-MM-dd', new Date());
    return isValid(date);
  }, { message: "End date must be a valid date in the format YYYY-MM-DD" }),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  isClosed: z.boolean().default(false),
  tenantId: z.number().int().positive()
}).refine(data => {
  const startDate = parse(data.startDate, 'yyyy-MM-dd', new Date());
  const endDate = parse(data.endDate, 'yyyy-MM-dd', new Date());
  return compareAsc(startDate, endDate) <= 0;
}, {
  message: "End date must be greater than or equal to start date",
  path: ["endDate"]
});

// Validation schema for accounting periods
const accountingPeriodSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  fiscalYearId: z.number().int().positive("Fiscal year ID is required"),
  startDate: z.string().refine(val => {
    const date = parse(val, 'yyyy-MM-dd', new Date());
    return isValid(date);
  }, { message: "Start date must be a valid date in the format YYYY-MM-DD" }),
  endDate: z.string().refine(val => {
    const date = parse(val, 'yyyy-MM-dd', new Date());
    return isValid(date);
  }, { message: "End date must be a valid date in the format YYYY-MM-DD" }),
  periodType: z.enum(["Monthly", "Quarterly", "Semi-Annual", "Annual", "Custom"], {
    errorMap: () => ({ message: "Period type must be Monthly, Quarterly, Semi-Annual, Annual, or Custom" })
  }),
  periodNumber: z.number().int().min(1, "Period number must be at least 1"),
  isClosed: z.boolean().default(false),
  isAdjustment: z.boolean().default(false),
  tenantId: z.number().int().positive()
}).refine(data => {
  const startDate = parse(data.startDate, 'yyyy-MM-dd', new Date());
  const endDate = parse(data.endDate, 'yyyy-MM-dd', new Date());
  return compareAsc(startDate, endDate) <= 0;
}, {
  message: "End date must be greater than or equal to start date",
  path: ["endDate"]
});

export const fiscalYearService = {
  /**
   * Get all fiscal years for a tenant
   */
  async getAllFiscalYears(tenantId: number, activeOnly: boolean = false) {
    return fiscalYearStorage.getAllFiscalYears(tenantId, activeOnly);
  },

  /**
   * Get a fiscal year by ID
   */
  async getFiscalYearById(id: number, tenantId: number) {
    return fiscalYearStorage.getFiscalYearById(id, tenantId);
  },

  /**
   * Get the current active fiscal year
   */
  async getCurrentFiscalYear(tenantId: number) {
    return fiscalYearStorage.getCurrentFiscalYear(tenantId);
  },

  /**
   * Create a new fiscal year with validation
   */
  async createFiscalYear(data: any) {
    // Validate the fiscal year data
    const validatedData = fiscalYearSchema.parse(data);
    
    // Check if there's an overlapping fiscal year
    const overlappingFiscalYears = await this.checkOverlappingFiscalYears(
      validatedData.startDate,
      validatedData.endDate,
      validatedData.tenantId
    );
    
    if (overlappingFiscalYears.length > 0) {
      throw new Error("The date range overlaps with an existing fiscal year");
    }
    
    const newFiscalYear = await fiscalYearStorage.createFiscalYear(validatedData);
    
    // Optionally create accounting periods
    if (data.createPeriods) {
      await this.createAccountingPeriods(newFiscalYear, data.periodType || "Monthly");
    }
    
    return newFiscalYear;
  },

  /**
   * Update a fiscal year with validation
   */
  async updateFiscalYear(id: number, tenantId: number, data: any) {
    // Validate the update data (partial validation)
    const validatedData = fiscalYearSchema.partial().parse(data);
    
    // Check if fiscal year exists
    const existingFiscalYear = await fiscalYearStorage.getFiscalYearById(id, tenantId);
    if (!existingFiscalYear) {
      throw new Error("Fiscal year not found");
    }
    
    // If the fiscal year is closed, prevent updates
    if (existingFiscalYear.isClosed) {
      throw new Error("Cannot update a closed fiscal year");
    }
    
    // If dates are being changed, check for overlaps
    if (validatedData.startDate || validatedData.endDate) {
      const startDate = validatedData.startDate || existingFiscalYear.startDate;
      const endDate = validatedData.endDate || existingFiscalYear.endDate;
      
      const overlappingFiscalYears = await this.checkOverlappingFiscalYears(
        startDate,
        endDate,
        tenantId,
        id
      );
      
      if (overlappingFiscalYears.length > 0) {
        throw new Error("The date range overlaps with an existing fiscal year");
      }
    }
    
    return fiscalYearStorage.updateFiscalYear(id, tenantId, validatedData);
  },

  /**
   * Close a fiscal year
   */
  async closeFiscalYear(id: number, tenantId: number) {
    // Check if fiscal year exists
    const existingFiscalYear = await fiscalYearStorage.getFiscalYearById(id, tenantId);
    if (!existingFiscalYear) {
      throw new Error("Fiscal year not found");
    }
    
    // If the fiscal year is already closed, return it
    if (existingFiscalYear.isClosed) {
      return existingFiscalYear;
    }
    
    // Check if all periods are closed
    const periods = await fiscalYearStorage.getAccountingPeriods(id, tenantId);
    const openPeriods = periods.filter(p => !p.isClosed);
    
    if (openPeriods.length > 0) {
      throw new Error("Cannot close fiscal year with open accounting periods");
    }
    
    // TODO: Check for unposted journals within the fiscal year
    
    // TODO: Perform year-end closing entries if needed
    
    return fiscalYearStorage.closeFiscalYear(id, tenantId);
  },

  /**
   * Delete a fiscal year
   */
  async deleteFiscalYear(id: number, tenantId: number) {
    // Check if fiscal year exists
    const existingFiscalYear = await fiscalYearStorage.getFiscalYearById(id, tenantId);
    if (!existingFiscalYear) {
      throw new Error("Fiscal year not found");
    }
    
    // If the fiscal year is closed, prevent deletion
    if (existingFiscalYear.isClosed) {
      throw new Error("Cannot delete a closed fiscal year");
    }
    
    // Check if there are accounting periods
    const periods = await fiscalYearStorage.getAccountingPeriods(id, tenantId);
    if (periods.length > 0) {
      throw new Error("Cannot delete fiscal year with accounting periods");
    }
    
    // TODO: Check if there are journals or transactions for this fiscal year
    
    return fiscalYearStorage.deleteFiscalYear(id, tenantId);
  },

  /**
   * Get all accounting periods for a fiscal year
   */
  async getAccountingPeriods(fiscalYearId: number, tenantId: number) {
    return fiscalYearStorage.getAccountingPeriods(fiscalYearId, tenantId);
  },

  /**
   * Get an accounting period by ID
   */
  async getAccountingPeriodById(id: number, tenantId: number) {
    return fiscalYearStorage.getAccountingPeriodById(id, tenantId);
  },

  /**
   * Get the current accounting period
   */
  async getCurrentAccountingPeriod(tenantId: number) {
    return fiscalYearStorage.getCurrentAccountingPeriod(tenantId);
  },

  /**
   * Create a new accounting period with validation
   */
  async createAccountingPeriod(data: any) {
    // Validate the accounting period data
    const validatedData = accountingPeriodSchema.parse(data);
    
    // Check if fiscal year exists
    const fiscalYear = await fiscalYearStorage.getFiscalYearById(
      validatedData.fiscalYearId, 
      validatedData.tenantId
    );
    
    if (!fiscalYear) {
      throw new Error("Fiscal year not found");
    }
    
    // If the fiscal year is closed, prevent creating new periods
    if (fiscalYear.isClosed) {
      throw new Error("Cannot create accounting periods for a closed fiscal year");
    }
    
    // Check if the period is within the fiscal year
    const periodStartDate = parse(validatedData.startDate, 'yyyy-MM-dd', new Date());
    const periodEndDate = parse(validatedData.endDate, 'yyyy-MM-dd', new Date());
    const fiscalStartDate = parse(fiscalYear.startDate, 'yyyy-MM-dd', new Date());
    const fiscalEndDate = parse(fiscalYear.endDate, 'yyyy-MM-dd', new Date());
    
    if (compareAsc(periodStartDate, fiscalStartDate) < 0 || compareAsc(periodEndDate, fiscalEndDate) > 0) {
      throw new Error("Accounting period must be within the fiscal year date range");
    }
    
    // Check for overlapping periods
    const existingPeriods = await fiscalYearStorage.getAccountingPeriods(
      validatedData.fiscalYearId, 
      validatedData.tenantId
    );
    
    const overlapping = existingPeriods.some(period => {
      const periodStart = parse(period.startDate, 'yyyy-MM-dd', new Date());
      const periodEnd = parse(period.endDate, 'yyyy-MM-dd', new Date());
      
      // Check for overlap
      return (
        (compareAsc(periodStartDate, periodStart) >= 0 && compareAsc(periodStartDate, periodEnd) <= 0) ||
        (compareAsc(periodEndDate, periodStart) >= 0 && compareAsc(periodEndDate, periodEnd) <= 0) ||
        (compareAsc(periodStartDate, periodStart) <= 0 && compareAsc(periodEndDate, periodEnd) >= 0)
      );
    });
    
    if (overlapping) {
      throw new Error("The date range overlaps with an existing accounting period");
    }
    
    return fiscalYearStorage.createAccountingPeriod(validatedData);
  },

  /**
   * Update an accounting period with validation
   */
  async updateAccountingPeriod(id: number, tenantId: number, data: any) {
    // Validate the update data (partial validation)
    const validatedData = accountingPeriodSchema.partial().parse(data);
    
    // Check if accounting period exists
    const existingPeriod = await fiscalYearStorage.getAccountingPeriodById(id, tenantId);
    if (!existingPeriod) {
      throw new Error("Accounting period not found");
    }
    
    // If the period is closed, prevent updates
    if (existingPeriod.isClosed) {
      throw new Error("Cannot update a closed accounting period");
    }
    
    // Check if fiscal year is closed
    const fiscalYear = await fiscalYearStorage.getFiscalYearById(
      existingPeriod.fiscalYearId, 
      tenantId
    );
    
    if (!fiscalYear) {
      throw new Error("Fiscal year not found");
    }
    
    if (fiscalYear.isClosed) {
      throw new Error("Cannot update accounting periods for a closed fiscal year");
    }
    
    // If dates are being changed, validate against fiscal year
    if (validatedData.startDate || validatedData.endDate) {
      const startDate = validatedData.startDate || existingPeriod.startDate;
      const endDate = validatedData.endDate || existingPeriod.endDate;
      
      const periodStartDate = parse(startDate, 'yyyy-MM-dd', new Date());
      const periodEndDate = parse(endDate, 'yyyy-MM-dd', new Date());
      const fiscalStartDate = parse(fiscalYear.startDate, 'yyyy-MM-dd', new Date());
      const fiscalEndDate = parse(fiscalYear.endDate, 'yyyy-MM-dd', new Date());
      
      if (compareAsc(periodStartDate, fiscalStartDate) < 0 || compareAsc(periodEndDate, fiscalEndDate) > 0) {
        throw new Error("Accounting period must be within the fiscal year date range");
      }
      
      // Check for overlapping periods
      const existingPeriods = await fiscalYearStorage.getAccountingPeriods(
        existingPeriod.fiscalYearId, 
        tenantId
      );
      
      const overlapping = existingPeriods.some(period => {
        if (period.id === id) return false; // Skip the current period
        
        const periodStart = parse(period.startDate, 'yyyy-MM-dd', new Date());
        const periodEnd = parse(period.endDate, 'yyyy-MM-dd', new Date());
        
        // Check for overlap
        return (
          (compareAsc(periodStartDate, periodStart) >= 0 && compareAsc(periodStartDate, periodEnd) <= 0) ||
          (compareAsc(periodEndDate, periodStart) >= 0 && compareAsc(periodEndDate, periodEnd) <= 0) ||
          (compareAsc(periodStartDate, periodStart) <= 0 && compareAsc(periodEndDate, periodEnd) >= 0)
        );
      });
      
      if (overlapping) {
        throw new Error("The date range overlaps with an existing accounting period");
      }
    }
    
    return fiscalYearStorage.updateAccountingPeriod(id, tenantId, validatedData);
  },

  /**
   * Close an accounting period
   */
  async closeAccountingPeriod(id: number, tenantId: number) {
    // Check if accounting period exists
    const existingPeriod = await fiscalYearStorage.getAccountingPeriodById(id, tenantId);
    if (!existingPeriod) {
      throw new Error("Accounting period not found");
    }
    
    // If the period is already closed, return it
    if (existingPeriod.isClosed) {
      return existingPeriod;
    }
    
    // TODO: Check for unposted journals within the period
    
    // TODO: Perform period-end closing entries if needed
    
    return fiscalYearStorage.closeAccountingPeriod(id, tenantId);
  },

  /**
   * Delete an accounting period
   */
  async deleteAccountingPeriod(id: number, tenantId: number) {
    // Check if accounting period exists
    const existingPeriod = await fiscalYearStorage.getAccountingPeriodById(id, tenantId);
    if (!existingPeriod) {
      throw new Error("Accounting period not found");
    }
    
    // If the period is closed, prevent deletion
    if (existingPeriod.isClosed) {
      throw new Error("Cannot delete a closed accounting period");
    }
    
    // TODO: Check if there are journals or transactions for this period
    
    return fiscalYearStorage.deleteAccountingPeriod(id, tenantId);
  },

  /**
   * Helper function to check for overlapping fiscal years
   */
  async checkOverlappingFiscalYears(startDate: string, endDate: string, tenantId: number, excludeId?: number) {
    const allFiscalYears = await fiscalYearStorage.getAllFiscalYears(tenantId);
    
    const newStartDate = parse(startDate, 'yyyy-MM-dd', new Date());
    const newEndDate = parse(endDate, 'yyyy-MM-dd', new Date());
    
    return allFiscalYears.filter(fiscalYear => {
      // Skip the current fiscal year if excludeId is provided
      if (excludeId && fiscalYear.id === excludeId) return false;
      
      const existingStartDate = parse(fiscalYear.startDate, 'yyyy-MM-dd', new Date());
      const existingEndDate = parse(fiscalYear.endDate, 'yyyy-MM-dd', new Date());
      
      // Check for overlap
      return (
        (compareAsc(newStartDate, existingStartDate) >= 0 && compareAsc(newStartDate, existingEndDate) <= 0) ||
        (compareAsc(newEndDate, existingStartDate) >= 0 && compareAsc(newEndDate, existingEndDate) <= 0) ||
        (compareAsc(newStartDate, existingStartDate) <= 0 && compareAsc(newEndDate, existingEndDate) >= 0)
      );
    });
  },

  /**
   * Helper function to create accounting periods for a fiscal year
   */
  async createAccountingPeriods(fiscalYear: any, periodType: string) {
    const fiscalStartDate = parse(fiscalYear.startDate, 'yyyy-MM-dd', new Date());
    const fiscalEndDate = parse(fiscalYear.endDate, 'yyyy-MM-dd', new Date());
    
    let periodDuration: number;
    let periodName: string;
    
    switch (periodType) {
      case "Monthly":
        periodDuration = 1;
        periodName = "Month";
        break;
      case "Quarterly":
        periodDuration = 3;
        periodName = "Quarter";
        break;
      case "Semi-Annual":
        periodDuration = 6;
        periodName = "Half-Year";
        break;
      case "Annual":
        periodDuration = 12;
        periodName = "Annual";
        break;
      default:
        throw new Error(`Unsupported period type: ${periodType}`);
    }
    
    let currentStartDate = fiscalStartDate;
    let periodNumber = 1;
    
    while (compareAsc(currentStartDate, fiscalEndDate) <= 0) {
      // Calculate period end date
      let currentEndDate = add(currentStartDate, { months: periodDuration });
      // Subtract one day to avoid overlap
      currentEndDate = add(currentEndDate, { days: -1 });
      
      // Ensure the end date doesn't exceed the fiscal year end date
      if (compareAsc(currentEndDate, fiscalEndDate) > 0) {
        currentEndDate = fiscalEndDate;
      }
      
      // Create the period
      const period = {
        name: `${periodName} ${periodNumber}`,
        fiscalYearId: fiscalYear.id,
        startDate: format(currentStartDate, 'yyyy-MM-dd'),
        endDate: format(currentEndDate, 'yyyy-MM-dd'),
        periodType,
        periodNumber,
        isClosed: false,
        isAdjustment: false,
        tenantId: fiscalYear.tenantId
      };
      
      try {
        await fiscalYearStorage.createAccountingPeriod(period);
      } catch (error) {
        console.error(`Error creating period ${period.name}:`, error);
      }
      
      // Move to the next period
      currentStartDate = add(currentEndDate, { days: 1 });
      periodNumber++;
      
      // Stop if we've passed the fiscal year end date
      if (compareAsc(currentStartDate, fiscalEndDate) > 0) {
        break;
      }
    }
  },

  /**
   * Initialize a default fiscal year and accounting periods for a new tenant
   */
  async initializeDefaultFiscalYear(tenantId: number) {
    // Create a fiscal year for the current year (January to December)
    const currentYear = new Date().getFullYear();
    const startDate = `${currentYear}-01-01`;
    const endDate = `${currentYear}-12-31`;
    
    try {
      // Check if a fiscal year already exists for this tenant
      const existingFiscalYears = await fiscalYearStorage.getAllFiscalYears(tenantId);
      if (existingFiscalYears.length > 0) {
        return; // Fiscal years already exist, no need to create default
      }
      
      // Create the fiscal year
      const fiscalYear = await fiscalYearStorage.createFiscalYear({
        name: `Fiscal Year ${currentYear}`,
        startDate,
        endDate,
        description: `Default fiscal year for ${currentYear}`,
        isActive: true,
        isClosed: false,
        tenantId
      });
      
      // Create monthly accounting periods
      await this.createAccountingPeriods(fiscalYear, "Monthly");
      
      return fiscalYear;
    } catch (error) {
      console.error("Error initializing default fiscal year:", error);
      throw error;
    }
  }
};