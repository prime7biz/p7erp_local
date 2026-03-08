import { parseIntParam } from "../utils/parseParams";
import { Router } from "express";
import { isAuthenticated } from "../middleware/auth";
import { requirePermission } from "../middleware/rbacMiddleware";
import { safeErrorMessage } from "../utils/parseParams";
import { z } from "zod";
import {
  insertVoucherTypeSchema,
  insertVoucherStatusSchema,
  insertVoucherWorkflowSchema,
  insertVoucherSchema,
  insertVoucherItemSchema,
  insertVoucherApprovalHistorySchema,
  insertApprovalRuleSchema,
  voucherStatus,
  fiscalYears,
  vouchers,
  voucherItems,
  billAllocations,
  billReferences,
  parties,
  chartOfAccounts,
} from "../../shared/schema";
import * as voucherStorage from "../database/accounting/voucherStorage";
import { approvalWorkflowStorage } from "../database/accounting/approvalWorkflowStorage";
import {
  createPostingsForVoucher,
  deletePostingsForVoucher,
  getPostingsForVoucher,
  getPostingsForAccount,
  getAccountBalance,
  getTrialBalance,
} from "../database/accounting/ledgerPostingStorage";
import { SequentialIdGenerator } from "../utils/sequentialIdGenerator";
import { initializeDocumentWorkflow } from "../services/workflowInstanceService";
import { requireLock } from "../middleware/lockMiddleware";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { logAudit } from "../services/auditService";
import { ERPError, ERP_ERROR_CODES, formatERPError, isVoucherImmutable, checkIdempotency, saveIdempotencyResult } from '../services/transactionSafetyService';
import { enforceVoucherImmutability, createVoucherReversal, idempotentPostVoucher, checkPeriodLock } from '../services/accountingEngineService';
import { immutabilityGuard } from '../middleware/immutabilityGuard';
import { assignVerificationCode } from '../services/verificationService';

const router = Router();

// Middleware to ensure requests are authenticated
router.use(isAuthenticated);

// Apply immutability guard for voucher modifications (PUT/PATCH/DELETE on /:id)
router.use('/:id', immutabilityGuard('voucher'));

// Helper function to get tenant ID from user session
const getTenantId = (req: any): number => {
  const user = req.user;
  if (!user || !user.tenantId) {
    throw new Error("Tenant ID not found in user session");
  }
  return user.tenantId;
};

// Helper function to get user ID from user session
const getUserId = (req: any): number => {
  const user = req.user;
  if (!user || !user.id) {
    throw new Error("User ID not found in user session");
  }
  return user.id;
};

// Voucher Types Routes
router.get("/types", requirePermission('accounts:voucher:read'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const types = await voucherStorage.getAllVoucherTypes(tenantId);
    res.json(types);
  } catch (error: any) {
    console.error("Error fetching voucher types:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.get("/types/:id", requirePermission('accounts:voucher:read'), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = getTenantId(req);
    const type = await voucherStorage.getVoucherTypeById(id, tenantId);
    
    if (!type) {
      return res.status(404).json({ message: "Voucher type not found" });
    }
    
    res.json(type);
  } catch (error: any) {
    console.error("Error fetching voucher type:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.post("/types", requirePermission('accounts:voucher:create'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const data = insertVoucherTypeSchema.parse({
      ...req.body,
      tenantId,
    });
    
    const type = await voucherStorage.createVoucherType(data);
    res.status(201).json(type);
  } catch (error: any) {
    console.error("Error creating voucher type:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.put("/types/:id", requirePermission('accounts:voucher:edit'), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = getTenantId(req);
    const data = insertVoucherTypeSchema.partial().parse(req.body);
    
    const type = await voucherStorage.updateVoucherType(id, tenantId, data);
    
    if (!type) {
      return res.status(404).json({ message: "Voucher type not found" });
    }
    
    res.json(type);
  } catch (error: any) {
    console.error("Error updating voucher type:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Voucher Status Routes
router.get("/statuses", requirePermission('accounts:voucher:read'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const statuses = await voucherStorage.getAllVoucherStatuses(tenantId);
    res.json(statuses);
  } catch (error: any) {
    console.error("Error fetching voucher statuses:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.get("/statuses/:id", requirePermission('accounts:voucher:read'), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = getTenantId(req);
    const status = await voucherStorage.getVoucherStatusById(id, tenantId);
    
    if (!status) {
      return res.status(404).json({ message: "Voucher status not found" });
    }
    
    res.json(status);
  } catch (error: any) {
    console.error("Error fetching voucher status:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.post("/statuses", requirePermission('accounts:voucher:create'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const data = insertVoucherStatusSchema.parse({
      ...req.body,
      tenantId,
    });
    
    const status = await voucherStorage.createVoucherStatus(data);
    res.status(201).json(status);
  } catch (error: any) {
    console.error("Error creating voucher status:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.put("/statuses/:id", requirePermission('accounts:voucher:edit'), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = getTenantId(req);
    const data = insertVoucherStatusSchema.partial().parse(req.body);
    
    const status = await voucherStorage.updateVoucherStatus(id, tenantId, data);
    
    if (!status) {
      return res.status(404).json({ message: "Voucher status not found" });
    }
    
    res.json(status);
  } catch (error: any) {
    console.error("Error updating voucher status:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Voucher Workflow Routes
router.get("/workflows/by-type/:typeId", requirePermission('accounts:voucher:read'), async (req, res) => {
  try {
    const typeId = parseIntParam(req.params.typeId, "typeId");
    const tenantId = getTenantId(req);
    const workflows = await voucherStorage.getWorkflowsByVoucherType(typeId, tenantId);
    res.json(workflows);
  } catch (error: any) {
    console.error("Error fetching voucher workflows:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.post("/workflows", requirePermission('accounts:voucher:create'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const data = insertVoucherWorkflowSchema.parse({
      ...req.body,
      tenantId,
    });
    
    const workflow = await voucherStorage.createVoucherWorkflow(data);
    res.status(201).json(workflow);
  } catch (error: any) {
    console.error("Error creating voucher workflow:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.put("/workflows/:id", requirePermission('accounts:voucher:edit'), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = getTenantId(req);
    const data = insertVoucherWorkflowSchema.partial().parse(req.body);
    
    const workflow = await voucherStorage.updateVoucherWorkflow(id, tenantId, data);
    
    if (!workflow) {
      return res.status(404).json({ message: "Voucher workflow not found" });
    }
    
    res.json(workflow);
  } catch (error: any) {
    console.error("Error updating voucher workflow:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.delete("/workflows/:id", requirePermission('accounts:voucher:delete'), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = getTenantId(req);
    
    await voucherStorage.deleteVoucherWorkflow(id, tenantId);
    res.status(204).send();
  } catch (error: any) {
    console.error("Error deleting voucher workflow:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Approval Rules Routes
router.get("/approval-rules", requirePermission('accounts:voucher:read'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const rules = await approvalWorkflowStorage.getApprovalRules(tenantId);
    res.json(rules);
  } catch (error: any) {
    console.error("Error fetching approval rules:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.post("/approval-rules", requirePermission('accounts:voucher:create'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const data = insertApprovalRuleSchema.parse({
      ...req.body,
      tenantId,
    });
    const rule = await approvalWorkflowStorage.createApprovalRule(data);
    res.status(201).json(rule);
  } catch (error: any) {
    console.error("Error creating approval rule:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.put("/approval-rules/:id", requirePermission('accounts:voucher:edit'), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = getTenantId(req);
    const data = insertApprovalRuleSchema.partial().parse(req.body);
    const rule = await approvalWorkflowStorage.updateApprovalRule(id, tenantId, data);
    if (!rule) {
      return res.status(404).json({ message: "Approval rule not found" });
    }
    res.json(rule);
  } catch (error: any) {
    console.error("Error updating approval rule:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.delete("/approval-rules/:id", requirePermission('accounts:voucher:delete'), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = getTenantId(req);
    await approvalWorkflowStorage.deleteApprovalRule(id, tenantId);
    res.status(204).send();
  } catch (error: any) {
    console.error("Error deleting approval rule:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Approval Queue Route
router.get("/approval-queue", requirePermission('accounts:voucher:read'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const queue = await approvalWorkflowStorage.getApprovalQueue(tenantId);
    res.json(queue);
  } catch (error: any) {
    console.error("Error fetching approval queue:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Vouchers Routes
router.get("/", requirePermission('accounts:voucher:read'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    // Parse and validate filter parameters
    const filterSchema = z.object({
      voucherTypeId: z.string().optional().transform(val => val ? parseInt(val) : undefined),
      statusId: z.string().optional().transform(val => val ? parseInt(val) : undefined),
      isPosted: z.string().optional().transform(val => {
        if (val === undefined) return undefined;
        return val === "true";
      }),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      minAmount: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
      maxAmount: z.string().optional().transform(val => val ? parseFloat(val) : undefined),
      search: z.string().optional(),
    });
    
    const filters = filterSchema.parse(req.query);
    const vouchers = await voucherStorage.getAllVouchers(tenantId, filters);
    res.json(vouchers);
  } catch (error: any) {
    console.error("Error fetching vouchers:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "Validation error in filter parameters", errors: error.errors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.get("/dashboard", requirePermission('accounts:voucher:read'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    
    // Get voucher types with counts
    const typesWithCounts = await voucherStorage.getVoucherTypesWithCounts(tenantId);
    
    // Get voucher summary by period
    const periodicSummary = await voucherStorage.getVoucherSummaryByPeriod(tenantId, 'monthly', 12);
    
    res.json({
      voucherTypes: typesWithCounts,
      periodicSummary,
    });
  } catch (error: any) {
    console.error("Error fetching voucher dashboard data:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Ledger routes (must be before /:id to avoid being caught by the param route)
router.get("/ledger/account/:accountId", requirePermission('accounts:voucher:read'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const accountId = parseIntParam(req.params.accountId, "accountId");
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    const postings = await getPostingsForAccount(accountId, tenantId, startDate, endDate);
    res.json(postings);
  } catch (error: any) {
    console.error("Error fetching account postings:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.get("/ledger/account/:accountId/balance", requirePermission('accounts:voucher:read'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const accountId = parseIntParam(req.params.accountId, "accountId");
    const { asOfDate } = req.query as { asOfDate?: string };

    const balance = await getAccountBalance(accountId, tenantId, asOfDate);
    res.json(balance);
  } catch (error: any) {
    console.error("Error fetching account balance:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.get("/ledger/trial-balance", requirePermission('accounts:voucher:read'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { asOfDate } = req.query as { asOfDate?: string };

    const trialBalance = await getTrialBalance(tenantId, asOfDate);
    res.json(trialBalance);
  } catch (error: any) {
    console.error("Error fetching trial balance:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.get("/:id", requirePermission('accounts:voucher:read'), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = getTenantId(req);
    
    let voucher = await voucherStorage.getVoucherById(id, tenantId);
    
    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    if (!voucher.verificationCode) {
      const code = await assignVerificationCode('voucher', id).catch(() => null);
      if (code) voucher = { ...voucher, verificationCode: code };
    }
    
    const items = await voucherStorage.getVoucherItems(id, tenantId);
    const approvalHistory = await voucherStorage.getVoucherApprovalHistory(id, tenantId);

    const billAllocationsData = await db
      .select({
        id: billAllocations.id,
        billReferenceId: billAllocations.billReferenceId,
        voucherId: billAllocations.voucherId,
        voucherItemId: billAllocations.voucherItemId,
        allocationType: billAllocations.allocationType,
        amount: billAllocations.amount,
        partyId: billAllocations.partyId,
        accountId: billAllocations.accountId,
        allocationDate: billAllocations.allocationDate,
        notes: billAllocations.notes,
        billNumber: billReferences.billNumber,
        billDate: billReferences.billDate,
        billType: billReferences.billType,
        originalAmount: billReferences.originalAmount,
        pendingAmount: billReferences.pendingAmount,
        billStatus: billReferences.status,
        partyName: parties.name,
        accountName: chartOfAccounts.name,
        accountCode: chartOfAccounts.accountNumber,
      })
      .from(billAllocations)
      .leftJoin(billReferences, eq(billAllocations.billReferenceId, billReferences.id))
      .leftJoin(parties, eq(billAllocations.partyId, parties.id))
      .leftJoin(chartOfAccounts, eq(billAllocations.accountId, chartOfAccounts.id))
      .where(and(
        eq(billAllocations.voucherId, id),
        eq(billAllocations.tenantId, tenantId)
      ))
      .orderBy(billAllocations.id);

    res.json({
      voucher,
      items,
      approvalHistory,
      billAllocations: billAllocationsData,
    });
  } catch (error: any) {
    console.error("Error fetching voucher details:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.post("/", requirePermission('accounts:voucher:create'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    
    // Strict double-entry validation
    const validationItems = req.body.items || [];
    if (validationItems.length < 2) {
      return res.status(400).json({
        message: "Validation error",
        errors: { items: ["A voucher must have at least 2 line items for double-entry"] },
      });
    }

    let totalDebit = 0;
    let totalCredit = 0;
    let totalBaseDebit = 0;
    let totalBaseCredit = 0;
    const lineErrors: string[] = [];
    const headerCurrency = req.body.voucher?.currencyCode || null;
    const headerRate = parseFloat(req.body.voucher?.exchangeRate) || 1;
    const hasFc = headerCurrency && headerCurrency !== 'BDT';
    
    for (let i = 0; i < validationItems.length; i++) {
      const item = validationItems[i];
      const debit = parseFloat(item.debitAmount) || 0;
      const credit = parseFloat(item.creditAmount) || 0;
      
      if (debit < 0 || credit < 0) {
        lineErrors.push(`Line ${i + 1}: Negative amounts are not allowed`);
      }
      if (debit > 0 && credit > 0) {
        lineErrors.push(`Line ${i + 1}: A line cannot have both debit and credit amounts`);
      }
      if (debit === 0 && credit === 0) {
        lineErrors.push(`Line ${i + 1}: Each line must have either a debit or credit amount`);
      }
      if (!item.accountId) {
        lineErrors.push(`Line ${i + 1}: Account is required`);
      }
      
      totalDebit += debit;
      totalCredit += credit;

      if (hasFc) {
        const lineRate = parseFloat(item.itemExchangeRate) || headerRate;
        totalBaseDebit += parseFloat(item.baseCurrencyDebit || "0") || (debit * lineRate);
        totalBaseCredit += parseFloat(item.baseCurrencyCreditAmount || "0") || (credit * lineRate);
      }
    }
    
    if (lineErrors.length > 0) {
      return res.status(400).json({
        message: "Validation error",
        errors: { lines: lineErrors },
      });
    }
    
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return res.status(400).json({
        message: "Validation error",
        errors: { balance: [`Voucher is not balanced. Debit: ${totalDebit.toFixed(2)}, Credit: ${totalCredit.toFixed(2)}`] },
      });
    }
    
    if (hasFc && Math.abs(totalBaseDebit - totalBaseCredit) > 0.01) {
      return res.status(400).json({
        message: "Validation error",
        errors: { balance: [`Base currency amounts not balanced. Debit: ${totalBaseDebit.toFixed(2)}, Credit: ${totalBaseCredit.toFixed(2)}`] },
      });
    }

    // Default status to draft if not provided - always look up by code for tenant
    if (!req.body.voucher.statusId) {
      const draftStatus = await db.select().from(voucherStatus).where(
        and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'DRAFT'))
      ).limit(1);
      if (draftStatus.length > 0) {
        req.body.voucher.statusId = draftStatus[0].id;
      } else {
        return res.status(400).json({
          message: "Validation error",
          errors: { statusId: ["No DRAFT status found. Please seed voucher statuses first."] },
        });
      }
    }

    // Validate fiscal year is open
    if (req.body.voucher.fiscalYearId) {
      const fiscalYear = await db.select().from(fiscalYears).where(
        and(
          eq(fiscalYears.id, parseInt(req.body.voucher.fiscalYearId)),
          eq(fiscalYears.tenantId, tenantId)
        )
      ).limit(1);
      if (fiscalYear.length === 0) {
        return res.status(400).json({
          message: "Validation error",
          errors: { fiscalYearId: ["Fiscal year not found"] },
        });
      }
      if (fiscalYear[0].status === 'closed' || fiscalYear[0].isClosed) {
        return res.status(400).json({
          message: "Validation error",
          errors: { fiscalYearId: ["Cannot post to a closed fiscal year"] },
        });
      }
      // Validate voucher date is within fiscal year
      const voucherDate = new Date(req.body.voucher.voucherDate);
      const fyStart = new Date(fiscalYear[0].startDate);
      const fyEnd = new Date(fiscalYear[0].endDate);
      if (voucherDate < fyStart || voucherDate > fyEnd) {
        return res.status(400).json({
          message: "Validation error",
          errors: { voucherDate: [`Voucher date must be within fiscal year ${fiscalYear[0].name} (${fiscalYear[0].startDate} to ${fiscalYear[0].endDate})`] },
        });
      }
    }

    // Check for duplicate origin
    if (req.body.voucher.originModule && req.body.voucher.originType && req.body.voucher.originId) {
      const existing = await db.select({ id: vouchers.id }).from(vouchers).where(
        and(
          eq(vouchers.tenantId, tenantId),
          eq(vouchers.originModule, req.body.voucher.originModule),
          eq(vouchers.originType, req.body.voucher.originType),
          eq(vouchers.originId, req.body.voucher.originId)
        )
      ).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({
          message: "Duplicate posting",
          errors: { origin: ["A voucher already exists for this source document"] },
          existingVoucherId: existing[0].id,
        });
      }
    }

    // Get the voucher type from the request
    const voucherType = req.body.voucher.voucherTypeId ? 
      await voucherStorage.getVoucherTypeById(req.body.voucher.voucherTypeId, tenantId) : 
      null;
    
    // Generate sequential voucher ID
    const voucherTypeCode = voucherType?.code || "VOUCHER";
    const sequentialId = await SequentialIdGenerator.generateVoucherId(tenantId, voucherTypeCode);
    
    // Validate main voucher data
    const voucherData = insertVoucherSchema.parse({
      ...req.body.voucher,
      voucherNumber: sequentialId,
      amount: String(req.body.voucher.amount || "0"),
      tenantId,
      preparedById: userId,
    });
    
    // Validate voucher items
    const itemsSchema = z.array(
      insertVoucherItemSchema.omit({ voucherId: true, tenantId: true }).extend({
        lineNumber: z.number(),
      })
    );
    
    const voucherCurrencyCode = req.body.voucher.currencyCode || null;
    const voucherExchangeRate = parseFloat(req.body.voucher.exchangeRate) || 1;

    const rawItems = (req.body.items || []).map((item: any) => {
      const debit = parseFloat(item.debitAmount) || 0;
      const credit = parseFloat(item.creditAmount) || 0;
      const lineRate = parseFloat(item.itemExchangeRate) || voucherExchangeRate;
      const fcCode = item.fcCurrencyCode || voucherCurrencyCode || null;
      const isFc = fcCode && fcCode !== 'BDT';

      return {
        ...item,
        debitAmount: String(debit),
        creditAmount: String(credit),
        fcCurrencyCode: isFc ? fcCode : null,
        fcDebitAmount: isFc ? String(item.fcDebitAmount ?? debit) : "0",
        fcCreditAmount: isFc ? String(item.fcCreditAmount ?? credit) : "0",
        itemExchangeRate: isFc ? String(lineRate) : null,
        baseCurrencyDebit: isFc ? String(parseFloat(item.baseCurrencyDebit || "0") || (debit * lineRate)) : String(debit),
        baseCurrencyCreditAmount: isFc ? String(parseFloat(item.baseCurrencyCreditAmount || "0") || (credit * lineRate)) : String(credit),
      };
    });
    const itemsData = itemsSchema.parse(rawItems);
    
    // Start transaction to create voucher and its items
    const voucher = await voucherStorage.createVoucher(voucherData);
    
    // Create voucher items
    const items = [];
    for (const item of itemsData) {
      const newItem = await voucherStorage.createVoucherItem({
        ...item,
        voucherId: voucher.id,
        tenantId,
      });
      items.push(newItem);
    }
    
    // Create initial approval history entry
    const historyEntry = await voucherStorage.createVoucherApprovalHistory({
      voucherId: voucher.id,
      tenantId,
      fromStatusId: null,
      toStatusId: voucher.statusId,
      actionName: "Create",
      actionById: userId,
      comments: "Voucher created",
    });
    
    await initializeDocumentWorkflow(tenantId, 'voucher', voucher.id).catch(console.error);
    logAudit({ tenantId, entityType: 'voucher', entityId: voucher.id, action: 'CREATE', performedBy: userId, newValues: voucher, ipAddress: req.ip });

    const verificationCode = await assignVerificationCode('voucher', voucher.id).catch((err) => {
      console.error("Failed to assign verification code to voucher:", err);
      return null;
    });

    res.status(201).json({
      voucher: { ...voucher, verificationCode },
      items,
      approvalHistory: [historyEntry],
    });
  } catch (error: any) {
    console.error("Error creating voucher:", error);
    if (error.name === "ZodError") {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const path = issue.path.join(".");
        if (!fieldErrors[path]) fieldErrors[path] = [];
        fieldErrors[path].push(issue.message);
      }
      return res.status(400).json({ message: "Validation error", errors: fieldErrors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

router.put("/:id", requirePermission('accounts:voucher:edit'), requireLock('voucher'), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = getTenantId(req);
    
    // Check if voucher exists
    const existingVoucher = await voucherStorage.getVoucherById(id, tenantId);
    if (!existingVoucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }
    
    // Enforce voucher immutability (POSTED/CANCELLED)
    try {
      await enforceVoucherImmutability(id, tenantId);
    } catch (err: any) {
      if (err instanceof ERPError) {
        return res.status(err.httpStatus).json(formatERPError(err));
      }
      throw err;
    }
    
    // Strict double-entry validation
    if (req.body.items) {
      const validationItems = req.body.items || [];
      if (validationItems.length < 2) {
        return res.status(400).json({
          message: "Validation error",
          errors: { items: ["A voucher must have at least 2 line items for double-entry"] },
        });
      }

      let totalDebit = 0;
      let totalCredit = 0;
      const lineErrors: string[] = [];
      
      for (let i = 0; i < validationItems.length; i++) {
        const item = validationItems[i];
        const debit = parseFloat(item.debitAmount) || 0;
        const credit = parseFloat(item.creditAmount) || 0;
        
        if (debit < 0 || credit < 0) {
          lineErrors.push(`Line ${i + 1}: Negative amounts are not allowed`);
        }
        if (debit > 0 && credit > 0) {
          lineErrors.push(`Line ${i + 1}: A line cannot have both debit and credit amounts`);
        }
        if (debit === 0 && credit === 0) {
          lineErrors.push(`Line ${i + 1}: Each line must have either a debit or credit amount`);
        }
        if (!item.accountId) {
          lineErrors.push(`Line ${i + 1}: Account is required`);
        }
        
        totalDebit += debit;
        totalCredit += credit;
      }
      
      if (lineErrors.length > 0) {
        return res.status(400).json({
          message: "Validation error",
          errors: { lines: lineErrors },
        });
      }
      
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return res.status(400).json({
          message: "Validation error",
          errors: { balance: [`Voucher is not balanced. Debit: ${totalDebit.toFixed(2)}, Credit: ${totalCredit.toFixed(2)}`] },
        });
      }
    }
    
    // Validate voucher data
    const rawVoucher = req.body.voucher || {};
    if (rawVoucher.amount !== undefined) {
      rawVoucher.amount = String(rawVoucher.amount);
    }
    const voucherData = insertVoucherSchema.partial().parse(rawVoucher);
    
    // Update voucher and items atomically in a transaction
    const result = await db.transaction(async (tx) => {
      // Update the voucher header
      const [updatedVoucher] = await tx
        .update(vouchers)
        .set({ ...voucherData, updatedAt: new Date() })
        .where(and(eq(vouchers.id, id), eq(vouchers.tenantId, tenantId)))
        .returning();

      if (!updatedVoucher) {
        throw new Error("Voucher not found during update");
      }

      let finalItems: any[] = [];

      if (req.body.items) {
        const updateCurrency = rawVoucher.currencyCode || updatedVoucher.currencyCode || null;
        const updateRate = parseFloat(rawVoucher.exchangeRate || updatedVoucher.exchangeRate) || 1;
        const updateHasFc = updateCurrency && updateCurrency !== 'BDT';

        const itemsToProcess: any[] = req.body.items.map((item: any) => {
          const debit = parseFloat(item.debitAmount) || 0;
          const credit = parseFloat(item.creditAmount) || 0;
          const lineRate = parseFloat(item.itemExchangeRate) || updateRate;
          const fcCode = item.fcCurrencyCode || updateCurrency || null;
          const isFc = updateHasFc || (fcCode && fcCode !== 'BDT');
          return {
            ...item,
            debitAmount: String(debit),
            creditAmount: String(credit),
            fcCurrencyCode: isFc ? fcCode : null,
            fcDebitAmount: isFc ? String(item.fcDebitAmount ?? debit) : "0",
            fcCreditAmount: isFc ? String(item.fcCreditAmount ?? credit) : "0",
            itemExchangeRate: isFc ? String(lineRate) : null,
            baseCurrencyDebit: isFc ? String(parseFloat(item.baseCurrencyDebit || "0") || (debit * lineRate)) : String(debit),
            baseCurrencyCreditAmount: isFc ? String(parseFloat(item.baseCurrencyCreditAmount || "0") || (credit * lineRate)) : String(credit),
          };
        });

        // Collect the IDs of items being kept/updated (only valid positive integers)
        const newItemIds = itemsToProcess
          .map((item: any) => item.id)
          .filter((itemId: any) => typeof itemId === 'number' && itemId > 0);

        // Delete items that are no longer in the list
        const existingItems = await tx
          .select({ id: voucherItems.id })
          .from(voucherItems)
          .where(and(eq(voucherItems.voucherId, id), eq(voucherItems.tenantId, tenantId)));

        for (const existingItem of existingItems) {
          if (!newItemIds.includes(existingItem.id)) {
            await tx
              .delete(voucherItems)
              .where(and(eq(voucherItems.id, existingItem.id), eq(voucherItems.tenantId, tenantId)));
          }
        }

        // Update or create items
        for (const item of itemsToProcess) {
          const itemId = typeof item.id === 'number' && item.id > 0 ? item.id : null;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id: _dropId, ...itemFields } = item;

          if (itemId) {
            // Update existing item
            const [updated] = await tx
              .update(voucherItems)
              .set({ ...itemFields, voucherId: id, tenantId })
              .where(and(eq(voucherItems.id, itemId), eq(voucherItems.tenantId, tenantId)))
              .returning();
            if (updated) finalItems.push(updated);
          } else {
            // Create new item — never pass id so DB auto-assigns it
            const [created] = await tx
              .insert(voucherItems)
              .values({ ...itemFields, voucherId: id, tenantId })
              .returning();
            if (created) finalItems.push(created);
          }
        }
      } else {
        // No items in payload — return existing items unchanged
        finalItems = await tx
          .select()
          .from(voucherItems)
          .where(and(eq(voucherItems.voucherId, id), eq(voucherItems.tenantId, tenantId)));
      }

      return { voucher: updatedVoucher, items: finalItems };
    });

    res.json(result);
  } catch (error: any) {
    console.error("Error updating voucher:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Get available workflow actions for a voucher
router.get("/:id/available-actions", requirePermission('accounts:voucher:read'), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = getTenantId(req);
    
    const voucher = await voucherStorage.getVoucherById(id, tenantId);
    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    if (voucher.isPosted || voucher.isCancelled) {
      return res.json([]);
    }
    
    const workflows = await voucherStorage.getWorkflowsByVoucherType(voucher.voucherTypeId, tenantId);
    
    const availableActions = workflows
      .filter((w: any) => w.fromStatusId === voucher.statusId)
      .map((w: any) => ({
        id: w.id,
        actionName: w.actionName,
        toStatusId: w.toStatusId,
        requiredRole: w.requiredRole,
        description: w.description,
      }));
    
    res.json(availableActions);
  } catch (error: any) {
    console.error("Error fetching available actions:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// Change voucher status (approve, reject, etc.)
router.post("/:id/change-status", requirePermission('accounts:voucher:edit'), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    
    // Validate request data
    const statusSchema = z.object({
      statusId: z.number(),
      actionName: z.string(),
      comments: z.string().optional(),
    });
    
    const { statusId, actionName, comments } = statusSchema.parse(req.body);
    
    // Period lock check for posting actions
    if (actionName.toLowerCase() === 'post') {
      const voucher = await voucherStorage.getVoucherById(id, tenantId);
      if (voucher) {
        const periodCheck = await checkPeriodLock(tenantId, voucher.voucherDate as string, {
          allowOverride: req.body.overrideReason ? true : false,
          overrideReason: req.body.overrideReason,
          overrideBy: userId,
        });
        if (periodCheck.locked) {
          return res.status(403).json(formatERPError(new ERPError(
            ERP_ERROR_CODES.PERIOD_LOCKED,
            `Cannot post voucher - period is locked: ${periodCheck.period?.name}`,
            403,
            { period: periodCheck.period }
          )));
        }
      }
    }

    // Change voucher status
    const result = await voucherStorage.changeVoucherStatus(
      id,
      tenantId,
      statusId,
      userId,
      actionName,
      comments
    );
    logAudit({ tenantId, entityType: 'voucher', entityId: id, action: `STATUS_CHANGE_${actionName.toUpperCase()}`, performedBy: userId, metadata: { actionName, toStatusId: statusId, comments }, ipAddress: req.ip });
    
    res.json(result);
  } catch (error: any) {
    console.error("Error changing voucher status:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// POST /api/accounting/vouchers/:id/post - Post a voucher (create ledger postings)
router.post("/:id/post", requirePermission('accounts:voucher:post'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const voucherId = parseIntParam(req.params.id, "id");
    const requestId = req.body.requestId || req.headers['x-request-id'] as string;

    const result = await idempotentPostVoucher(voucherId, tenantId, userId, requestId);
    
    logAudit({ tenantId, entityType: 'voucher', entityId: voucherId, action: 'POST', performedBy: userId, metadata: { status: 'POSTED', fromCache: result.fromCache }, ipAddress: req.ip });

    const updatedVoucher = await voucherStorage.getVoucherById(voucherId, tenantId);
    res.json({ message: result.message, voucher: updatedVoucher || result.voucher, fromCache: result.fromCache });
  } catch (error: any) {
    console.error("Error posting voucher:", error);
    if (error instanceof ERPError) {
      return res.status(error.httpStatus).json(formatERPError(error));
    }
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: safeErrorMessage(error, "Internal server error") });
  }
});

// POST /api/accounting/vouchers/:id/cancel-posting - Cancel a posted voucher
router.post("/:id/cancel-posting", requirePermission('accounts:voucher:cancel'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const voucherId = parseIntParam(req.params.id, "id");

    const voucher = await voucherStorage.getVoucherById(voucherId, tenantId);
    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    if (!voucher.isPosted) {
      return res.status(400).json({ message: "Voucher is not posted" });
    }

    await deletePostingsForVoucher(voucherId, tenantId, userId, req.body.reason || "Posting cancelled");

    const updatedVoucher = await voucherStorage.getVoucherById(voucherId, tenantId);
    res.json({ message: "Voucher posting cancelled successfully", voucher: updatedVoucher });
  } catch (error: any) {
    console.error("Error cancelling voucher posting:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// POST /api/accounting/vouchers/:id/reverse - Create reversal (Tally-like pattern)
router.post("/:id/reverse", requirePermission('accounts:voucher:post'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const voucherId = parseIntParam(req.params.id, "id");
    const { reversalDate, reversalReason, correctionData, requestId } = req.body;

    if (!reversalReason) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'reversalReason is required' });
    }

    // Idempotency check
    if (requestId) {
      const idem = await checkIdempotency(tenantId, requestId, 'VOUCHER_REVERSAL');
      if (idem.exists) {
        return res.json({ success: true, ...idem.cachedResponse, fromCache: true });
      }
    }

    const result = await createVoucherReversal(
      voucherId, tenantId, userId,
      reversalDate || new Date().toISOString().split('T')[0],
      reversalReason,
      correctionData
    );

    logAudit({ tenantId, entityType: 'voucher', entityId: voucherId, action: 'REVERSE', performedBy: userId, metadata: { reversalVoucherId: result.reversalVoucher.id, reversalReason }, ipAddress: req.ip });

    if (requestId) {
      await saveIdempotencyResult(tenantId, requestId, 'VOUCHER_REVERSAL', String(voucherId), 200, result);
    }

    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Error reversing voucher:", error);
    if (error instanceof ERPError) {
      return res.status(error.httpStatus).json(formatERPError(error));
    }
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: safeErrorMessage(error, "Internal server error") });
  }
});

// GET /api/accounting/vouchers/:id/postings - Get ledger postings for a voucher
router.get("/:id/postings", requirePermission('accounts:voucher:read'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const voucherId = parseIntParam(req.params.id, "id");

    const postings = await getPostingsForVoucher(voucherId, tenantId);
    res.json(postings);
  } catch (error: any) {
    console.error("Error fetching voucher postings:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// POST /:id/approve - Approve a voucher with maker-checker check
router.post("/:id/approve", requirePermission('accounts:voucher:approve'), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { comments } = req.body || {};

    const voucher = await voucherStorage.getVoucherById(id, tenantId);
    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    if (voucher.isPosted) {
      return res.status(400).json({ message: "Voucher is already posted" });
    }
    if (voucher.isCancelled) {
      return res.status(400).json({ message: "Cancelled vouchers cannot be approved" });
    }

    const canApproveResult = await approvalWorkflowStorage.canUserApprove(id, userId, tenantId);
    if (!canApproveResult.canApprove) {
      return res.status(403).json({ message: canApproveResult.reason });
    }

    const approvedStatus = await db.select().from(voucherStatus).where(
      and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, "APPROVED"))
    ).limit(1);

    if (approvedStatus.length === 0) {
      return res.status(400).json({ message: "Approved status not configured for this tenant" });
    }

    const fromStatusId = voucher.statusId;
    const toStatusId = approvedStatus[0].id;

    const updatedVoucher = await voucherStorage.updateVoucher(id, tenantId, {
      statusId: toStatusId,
      approvedById: userId,
      approvedDate: new Date(),
    } as any);

    await voucherStorage.createVoucherApprovalHistory({
      voucherId: id,
      tenantId,
      fromStatusId,
      toStatusId,
      actionName: "Approve",
      actionById: userId,
      comments: comments || "Voucher approved",
    });
    logAudit({ tenantId, entityType: 'voucher', entityId: id, action: 'APPROVE', performedBy: userId, metadata: { status: 'APPROVED' }, ipAddress: req.ip });

    res.json({ message: "Voucher approved successfully", voucher: updatedVoucher });
  } catch (error: any) {
    console.error("Error approving voucher:", error);
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

// POST /:id/reject - Reject a voucher with reason
router.post("/:id/reject", requirePermission('accounts:voucher:reject'), async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const rejectSchema = z.object({
      reason: z.string().min(1, "Rejection reason is required"),
      comments: z.string().optional(),
    });

    const { reason, comments } = rejectSchema.parse(req.body);

    const voucher = await voucherStorage.getVoucherById(id, tenantId);
    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    if (voucher.isPosted) {
      return res.status(400).json({ message: "Posted vouchers cannot be rejected" });
    }
    if (voucher.isCancelled) {
      return res.status(400).json({ message: "Cancelled vouchers cannot be rejected" });
    }

    const rejectedStatus = await db.select().from(voucherStatus).where(
      and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, "REJECTED"))
    ).limit(1);

    if (rejectedStatus.length === 0) {
      return res.status(400).json({ message: "Rejected status not configured for this tenant" });
    }

    const fromStatusId = voucher.statusId;
    const toStatusId = rejectedStatus[0].id;

    const updatedVoucher = await voucherStorage.updateVoucher(id, tenantId, {
      statusId: toStatusId,
      rejectedById: userId,
      rejectedDate: new Date(),
      rejectionReason: reason,
    } as any);

    await voucherStorage.createVoucherApprovalHistory({
      voucherId: id,
      tenantId,
      fromStatusId,
      toStatusId,
      actionName: "Reject",
      actionById: userId,
      comments: comments || reason,
    });
    logAudit({ tenantId, entityType: 'voucher', entityId: id, action: 'REJECT', performedBy: userId, metadata: { status: 'REJECTED', reason }, ipAddress: req.ip });

    res.json({ message: "Voucher rejected", voucher: updatedVoucher });
  } catch (error: any) {
    console.error("Error rejecting voucher:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    res.status(500).json({ message: safeErrorMessage(error, "Internal server error") });
  }
});

export default router;