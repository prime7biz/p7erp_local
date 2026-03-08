import { Router, Request, Response } from "express";
import { createPayrollRun, generatePayslips, approvePayrollRun, postPayrollRun, payPayrollRun, getPayrollRunTrace, createAdvance, closeAdvance } from '../../services/payrollService';
import { db } from '../../db';
import { payrollRuns, payslips, employeeAdvances, salaryStructures } from '@shared/schema';
import { eq, and, count, desc } from 'drizzle-orm';

const router = Router();

// Helper functions to extract tenantId and userId from authenticated request
const getTenantId = (req: Request): number => {
  const tenantId = (req as any).tenantId;
  if (!tenantId) throw new Error("Tenant ID not found");
  return tenantId;
};

const getUserId = (req: Request): number => {
  const userId = (req as any).userId;
  if (!userId) throw new Error("User ID not found");
  return userId;
};

// =====================================================
// PAYROLL RUNS
// =====================================================

// POST /runs - Create draft payroll run
router.post('/runs', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { payrollMonth, startDate, endDate } = req.body;

    const run = await createPayrollRun(tenantId, {
      payrollMonth,
      startDate,
      endDate,
      createdBy: userId,
    });

    res.json({ success: true, data: run });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error creating payroll run:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// GET /runs - List payroll runs for tenant
router.get('/runs', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const runs = await db.select().from(payrollRuns)
      .where(eq(payrollRuns.tenantId, tenantId))
      .orderBy(desc(payrollRuns.createdAt));

    res.json({ success: true, data: runs });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error listing payroll runs:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// GET /runs/:id - Get single payroll run with payslip count
router.get('/runs/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.tenantId, tenantId), eq(payrollRuns.id, parseInt(id))));

    if (!run) {
      return res.status(404).json({ success: false, message: 'Payroll run not found' });
    }

    const [countResult] = await db.select({ count: count() }).from(payslips)
      .where(and(eq(payslips.tenantId, tenantId), eq(payslips.payrollRunId, parseInt(id))));

    res.json({ success: true, data: { ...run, payslipCount: countResult.count } });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error getting payroll run:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// POST /runs/:id/generate - Generate payslips for a run
router.post('/runs/:id/generate', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const result = await generatePayslips(tenantId, parseInt(id));

    res.json({ success: true, message: 'Payslips generated successfully', data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error generating payslips:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// POST /runs/:id/approve - Approve run
router.post('/runs/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;

    const run = await approvePayrollRun(tenantId, parseInt(id), userId);

    res.json({ success: true, message: 'Payroll run approved', data: run });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error approving payroll run:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// POST /runs/:id/post - Post run (creates accrual voucher)
router.post('/runs/:id/post', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ success: false, message: 'requestId is required for idempotency' });
    }

    const result = await postPayrollRun(tenantId, parseInt(id), userId, requestId);

    res.json({ success: true, message: 'Payroll run posted successfully', data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error posting payroll run:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// POST /runs/:id/pay - Pay run (creates payment voucher)
router.post('/runs/:id/pay', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { id } = req.params;
    const { requestId, paymentMethod = 'BANK' } = req.body;

    if (!requestId) {
      return res.status(400).json({ success: false, message: 'requestId is required for idempotency' });
    }

    const result = await payPayrollRun(tenantId, parseInt(id), userId, requestId, paymentMethod);

    res.json({ success: true, message: 'Payroll run paid successfully', data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error paying payroll run:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// GET /runs/:id/trace - Full trace (payslips + vouchers + audit)
router.get('/runs/:id/trace', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const trace = await getPayrollRunTrace(tenantId, parseInt(id));

    res.json({ success: true, data: trace });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error getting payroll run trace:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// GET /runs/:id/payslips - Get payslips for a run
router.get('/runs/:id/payslips', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const payslipsList = await db.select().from(payslips)
      .where(and(eq(payslips.tenantId, tenantId), eq(payslips.payrollRunId, parseInt(id))))
      .orderBy(desc(payslips.createdAt));

    res.json({ success: true, data: payslipsList });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error getting payslips:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// =====================================================
// ADVANCES
// =====================================================

// POST /advances - Create employee advance
router.post('/advances', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { employeeId, advanceDate, amount, monthlyDeductionAmount, reason, bankOrCashLedgerId } = req.body;

    const advance = await createAdvance(tenantId, {
      employeeId,
      advanceDate,
      amount,
      monthlyDeductionAmount,
      reason,
      createdBy: userId,
      bankOrCashLedgerId,
    });

    res.json({ success: true, data: advance });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error creating advance:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// GET /advances - List advances (optional filters: employeeId, status)
router.get('/advances', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { employeeId, status } = req.query;

    let query = db.select().from(employeeAdvances)
      .where(eq(employeeAdvances.tenantId, tenantId));

    if (employeeId) {
      query = db.select().from(employeeAdvances)
        .where(and(eq(employeeAdvances.tenantId, tenantId), eq(employeeAdvances.employeeId, parseInt(employeeId as string))));
    }

    if (status) {
      query = db.select().from(employeeAdvances)
        .where(and(
          eq(employeeAdvances.tenantId, tenantId),
          eq(employeeAdvances.status, status as string)
        ));
    }

    if (employeeId && status) {
      query = db.select().from(employeeAdvances)
        .where(and(
          eq(employeeAdvances.tenantId, tenantId),
          eq(employeeAdvances.employeeId, parseInt(employeeId as string)),
          eq(employeeAdvances.status, status as string)
        ));
    }

    const advances = await query.orderBy(desc(employeeAdvances.createdAt));

    res.json({ success: true, data: advances });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error listing advances:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// POST /advances/:id/close - Close an advance
router.post('/advances/:id/close', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const advance = await closeAdvance(tenantId, parseInt(id));

    res.json({ success: true, message: 'Advance closed successfully', data: advance });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error closing advance:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// =====================================================
// SALARY STRUCTURES
// =====================================================

// POST /salary-structures - Create salary structure
router.post('/salary-structures', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { employeeId, basic, houseRent, medical, conveyance, otherAllowances, taxDeduction, pfDeduction, otherDeductions, effectiveFrom, effectiveTo, isActive } = req.body;

    const [structure] = await db.insert(salaryStructures).values({
      tenantId,
      employeeId,
      basic,
      houseRent,
      medical,
      conveyance,
      otherAllowances,
      taxDeduction,
      pfDeduction,
      otherDeductions,
      effectiveFrom,
      effectiveTo,
      isActive: isActive !== false,
    }).returning();

    res.json({ success: true, data: structure });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error creating salary structure:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// GET /salary-structures - List salary structures (optional filter: employeeId)
router.get('/salary-structures', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { employeeId } = req.query;

    let query = db.select().from(salaryStructures)
      .where(eq(salaryStructures.tenantId, tenantId));

    if (employeeId) {
      query = db.select().from(salaryStructures)
        .where(and(eq(salaryStructures.tenantId, tenantId), eq(salaryStructures.employeeId, parseInt(employeeId as string))));
    }

    const structures = await query.orderBy(desc(salaryStructures.effectiveFrom));

    res.json({ success: true, data: structures });
  } catch (error: any) {
    if (error.name === 'ERPError') {
      return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    }
    console.error('Error listing salary structures:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

export default router;
