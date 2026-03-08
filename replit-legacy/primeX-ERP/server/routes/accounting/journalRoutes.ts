import { parseIntParam } from "../../utils/parseParams";
import { Router, Request, Response } from "express";
import { journalStorage } from "../../database/accounting/journalStorage";
import { fiscalYearStorage } from "../../database/accounting/fiscalYearStorage";
import { chartOfAccountsStorage } from "../../database/accounting/chartOfAccountsStorage";
import { z } from "zod";
import { db } from "../../db";
import { journals, journalLines, accountingPeriods, fiscalYears, journalTypes } from "@shared/schema";
import { and, eq, gte, lte, like, or, inArray } from "drizzle-orm";
import { requireTenant } from "../../utils/tenantScope";

const router = Router();

const journalDetailSchema = z.object({
  accountId: z.number({
    required_error: "Account is required",
  }),
  description: z.string().optional(),
  debitAmount: z.string().optional().default("0"),
  creditAmount: z.string().optional().default("0"),
  memo: z.string().optional().nullable(),
  lineNumber: z.number(),
});

const journalEntrySchema = z.object({
  reference: z.string().min(1, "Reference is required"),
  transactionDate: z.string({
    required_error: "Transaction date is required",
  }),
  description: z.string().min(2, "Description must be at least 2 characters"),
  type: z.string({
    required_error: "Journal type is required",
  }),
  fiscalYearId: z.number({
    required_error: "Fiscal year is required",
  }),
  fiscalPeriodId: z.number({
    required_error: "Fiscal period is required",
  }),
  details: z.array(journalDetailSchema).min(2, "At least two line items are required"),
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    
    const result = await journalStorage.getAllJournals(tenantId, page, limit);
    res.json(result);
  } catch (error) {
    console.error('Error fetching journals:', error);
    res.status(500).json({ message: 'Failed to fetch journals' });
  }
});

router.get('/recent', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const limit = parseInt(req.query.limit as string) || 10;
    
    const result = await journalStorage.getRecentJournals(tenantId, limit);
    res.json(result);
  } catch (error) {
    console.error('Error fetching recent journals:', error);
    res.status(500).json({ message: 'Failed to fetch recent journals' });
  }
});

router.get('/fiscal-years/current', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    
    const currentYear = await fiscalYearStorage.getCurrentFiscalYear(tenantId);
    if (!currentYear) {
      return res.status(404).json({ message: 'No current fiscal year found' });
    }
    res.json(currentYear);
  } catch (error) {
    console.error('Error fetching current fiscal year:', error);
    res.status(500).json({ message: 'Failed to fetch current fiscal year' });
  }
});

router.get('/fiscal-years/:yearId/periods', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const yearId = parseIntParam(req.params.yearId, "yearId");
    
    if (isNaN(yearId)) {
      return res.status(400).json({ message: 'Invalid fiscal year ID' });
    }
    
    const periods = await fiscalYearStorage.getAccountingPeriods(yearId, tenantId);
    res.json(periods);
  } catch (error) {
    console.error('Error fetching fiscal periods:', error);
    res.status(500).json({ message: 'Failed to fetch fiscal periods' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const id = parseIntParam(req.params.id, "id");
    
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid journal ID' });
    }
    
    const journal = await journalStorage.getJournalById(id, tenantId);
    if (!journal) {
      return res.status(404).json({ message: 'Journal entry not found' });
    }
    res.json(journal);
  } catch (error) {
    console.error('Error fetching journal:', error);
    res.status(500).json({ message: 'Failed to fetch journal entry' });
  }
});

router.post('/search', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const { startDate, endDate, reference, status, type } = req.body;
    
    const results = await journalStorage.searchJournals({
      tenantId,
      startDate,
      endDate,
      reference,
      status,
      type,
    });
    res.json(results);
  } catch (error) {
    console.error('Error searching journals:', error);
    res.status(500).json({ message: 'Failed to search journal entries' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const parsedBody = journalEntrySchema.safeParse(req.body);
    
    if (!parsedBody.success) {
      return res.status(400).json({ 
        message: 'Invalid journal entry data', 
        errors: parsedBody.error.errors 
      });
    }
    
    const data = parsedBody.data;
    const tenantId = requireTenant(req);
    const userId = req.user!.id;
    
    const totalDebits = data.details.reduce((sum, detail) => {
      return sum + parseFloat(detail.debitAmount || '0');
    }, 0);
    
    const totalCredits = data.details.reduce((sum, detail) => {
      return sum + parseFloat(detail.creditAmount || '0');
    }, 0);
    
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      return res.status(400).json({ 
        message: 'Journal entry must have equal debits and credits',
        totalDebits,
        totalCredits,
        difference: totalDebits - totalCredits
      });
    }
    
    const journalData = {
      journalDate: data.transactionDate,
      reference: data.reference,
      description: data.description,
      type: data.type,
      amount: totalDebits.toString(),
      status: 'draft' as const,
      fiscalYearId: data.fiscalYearId,
      periodId: data.fiscalPeriodId,
      tenantId,
      createdBy: userId,
    };
    
    const lines = data.details.map((detail) => ({
      accountId: detail.accountId,
      description: detail.description || "",
      debitAmount: detail.debitAmount || "0",
      creditAmount: detail.creditAmount || "0",
      sortOrder: detail.lineNumber,
      tenantId,
    }));
    
    const createdJournal = await journalStorage.createJournal(journalData as any, lines as any);
    res.status(201).json(createdJournal);
  } catch (error) {
    console.error('Error creating journal entry:', error);
    res.status(500).json({ message: 'Failed to create journal entry' });
  }
});

router.put('/:id/post', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const userId = req.user!.id;
    const id = parseIntParam(req.params.id, "id");
    
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid journal ID' });
    }
    
    const postedJournal = await journalStorage.postJournal(id, tenantId, userId);
    if (!postedJournal) {
      return res.status(404).json({ message: 'Journal entry not found' });
    }
    res.json(postedJournal);
  } catch (error) {
    console.error('Error posting journal entry:', error);
    res.status(500).json({ message: 'Failed to post journal entry' });
  }
});

router.put('/:id/void', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const userId = req.user!.id;
    const id = parseIntParam(req.params.id, "id");
    
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid journal ID' });
    }
    
    const reversedJournal = await journalStorage.reverseJournal(id, tenantId, userId);
    if (!reversedJournal) {
      return res.status(404).json({ message: 'Journal entry not found' });
    }
    res.json(reversedJournal);
  } catch (error) {
    console.error('Error voiding journal entry:', error);
    res.status(500).json({ message: 'Failed to void journal entry' });
  }
});

export default router;
