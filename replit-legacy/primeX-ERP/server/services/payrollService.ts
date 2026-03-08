import { db } from '../db';
import { eq, and, sql, desc, sum } from 'drizzle-orm';
import { ERPError, ERP_ERROR_CODES, checkIdempotency, saveIdempotencyResult } from './transactionSafetyService';
import { checkPeriodLock } from './accountingEngineService';
import { SequentialIdGenerator } from '../utils/sequentialIdGenerator';
import {
  payrollRuns, payslips, salaryStructures, employeeAdvances, employees, payrollAccountingConfig,
  vouchers, voucherItems, voucherTypes, voucherStatus, fiscalYears, auditLogs
} from '@shared/schema';

export async function createPayrollRun(
  tenantId: number,
  data: { payrollMonth: string; startDate: string; endDate: string; createdBy: number }
): Promise<any> {
  if (!/^\d{4}-\d{2}$/.test(data.payrollMonth)) {
    throw new ERPError(ERP_ERROR_CODES.INVALID_STATE_TRANSITION, 'payrollMonth must be in YYYY-MM format', 400);
  }

  const [existing] = await db.select().from(payrollRuns)
    .where(and(eq(payrollRuns.tenantId, tenantId), eq(payrollRuns.payrollMonth, data.payrollMonth)));

  if (existing) {
    throw new ERPError(ERP_ERROR_CODES.DUPLICATE_REQUEST, `Payroll run already exists for ${data.payrollMonth}`, 409);
  }

  const [run] = await db.insert(payrollRuns).values({
    tenantId,
    payrollMonth: data.payrollMonth,
    startDate: data.startDate,
    endDate: data.endDate,
    status: 'DRAFT',
    createdBy: data.createdBy,
  }).returning();

  await db.insert(auditLogs).values({
    tenantId,
    entityType: 'payroll_run',
    entityId: run.id,
    action: 'CREATED',
    performedBy: data.createdBy,
    newValues: { payrollMonth: data.payrollMonth, status: 'DRAFT' },
  });

  return run;
}

export async function generatePayslips(
  tenantId: number,
  payrollRunId: number
): Promise<{ count: number; totalGross: number; totalDeductions: number; totalNet: number }> {
  const [run] = await db.select().from(payrollRuns)
    .where(and(eq(payrollRuns.tenantId, tenantId), eq(payrollRuns.id, payrollRunId)));

  if (!run) {
    throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Payroll run not found', 404);
  }

  await db.delete(payslips)
    .where(and(eq(payslips.tenantId, tenantId), eq(payslips.payrollRunId, payrollRunId)));

  const activeEmployees = await db.select().from(employees)
    .where(and(eq(employees.tenantId, tenantId), eq(employees.isActive, true)));

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;
  let count = 0;

  for (const emp of activeEmployees) {
    const [structure] = await db.select().from(salaryStructures)
      .where(and(
        eq(salaryStructures.tenantId, tenantId),
        eq(salaryStructures.employeeId, emp.id),
        eq(salaryStructures.isActive, true),
        sql`${salaryStructures.effectiveFrom} <= ${run.endDate}`,
        sql`(${salaryStructures.effectiveTo} IS NULL OR ${salaryStructures.effectiveTo} >= ${run.startDate})`
      ))
      .orderBy(desc(salaryStructures.effectiveFrom))
      .limit(1);

    if (!structure) continue;

    const basic = parseFloat(structure.basic || '0');
    const houseRent = parseFloat(structure.houseRent || '0');
    const medical = parseFloat(structure.medical || '0');
    const conveyance = parseFloat(structure.conveyance || '0');
    const otherAllowances = parseFloat(structure.otherAllowances || '0');
    const grossPay = basic + houseRent + medical + conveyance + otherAllowances;

    const tax = parseFloat(structure.taxDeduction || '0');
    const pf = parseFloat(structure.pfDeduction || '0');
    const other = parseFloat(structure.otherDeductions || '0');
    let deductions = tax + pf + other;

    const activeAdvances = await db.select().from(employeeAdvances)
      .where(and(
        eq(employeeAdvances.tenantId, tenantId),
        eq(employeeAdvances.employeeId, emp.id),
        eq(employeeAdvances.status, 'ACTIVE')
      ));

    let advanceRecovery = 0;
    for (const adv of activeAdvances) {
      const monthly = parseFloat(adv.monthlyDeductionAmount || '0');
      const outstanding = parseFloat(adv.outstandingAmount || '0');
      advanceRecovery += Math.min(monthly, outstanding);
    }

    const netPay = grossPay - deductions - advanceRecovery;

    await db.insert(payslips).values({
      tenantId,
      payrollRunId,
      employeeId: emp.id,
      grossPay: String(grossPay),
      totalDeductions: String(deductions),
      netPay: String(netPay),
      advanceRecovery: String(advanceRecovery),
      earningsBreakdown: { basic, houseRent, medical, conveyance, otherAllowances },
      deductionsBreakdown: { tax, pf, other, advanceRecovery },
      status: 'GENERATED',
    });

    totalGross += grossPay;
    totalDeductions += deductions + advanceRecovery;
    totalNet += netPay;
    count++;
  }

  await db.update(payrollRuns).set({
    totalGross: String(totalGross),
    totalDeductions: String(totalDeductions),
    totalNet: String(totalNet),
    employeeCount: count,
    updatedAt: new Date(),
  }).where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.tenantId, tenantId)));

  return { count, totalGross, totalDeductions, totalNet };
}

export async function approvePayrollRun(
  tenantId: number,
  payrollRunId: number,
  approvedBy: number
): Promise<any> {
  const [run] = await db.select().from(payrollRuns)
    .where(and(eq(payrollRuns.tenantId, tenantId), eq(payrollRuns.id, payrollRunId)));

  if (!run) {
    throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Payroll run not found', 404);
  }

  if (run.status !== 'DRAFT') {
    throw new ERPError(ERP_ERROR_CODES.INVALID_STATE_TRANSITION, `Cannot approve payroll run in ${run.status} status. Must be DRAFT.`, 400);
  }

  const [updated] = await db.update(payrollRuns).set({
    status: 'APPROVED',
    approvedBy,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.tenantId, tenantId))).returning();

  await db.insert(auditLogs).values({
    tenantId,
    entityType: 'payroll_run',
    entityId: payrollRunId,
    action: 'APPROVED',
    performedBy: approvedBy,
    newValues: { status: 'APPROVED' },
  });

  return updated;
}

export async function postPayrollRun(
  tenantId: number,
  payrollRunId: number,
  postedBy: number,
  requestId: string
): Promise<any> {
  const idem = await checkIdempotency(tenantId, requestId, 'PAYROLL_POST');
  if (idem.exists) {
    return { success: true, fromCache: true, message: 'Already posted (idempotent)', data: idem.cachedResponse };
  }

  const [run] = await db.select().from(payrollRuns)
    .where(and(eq(payrollRuns.tenantId, tenantId), eq(payrollRuns.id, payrollRunId)));

  if (!run) {
    throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Payroll run not found', 404);
  }

  if (run.status !== 'APPROVED') {
    throw new ERPError(ERP_ERROR_CODES.INVALID_STATE_TRANSITION, `Cannot post payroll run in ${run.status} status. Must be APPROVED.`, 400);
  }

  const periodCheck = await checkPeriodLock(tenantId, run.endDate!);
  if (periodCheck.locked) {
    throw new ERPError(ERP_ERROR_CODES.PERIOD_LOCKED, `Cannot post payroll - period is locked: ${periodCheck.period?.name}`, 403, { period: periodCheck.period });
  }

  const [config] = await db.select().from(payrollAccountingConfig)
    .where(eq(payrollAccountingConfig.tenantId, tenantId));

  if (!config || !config.salaryExpenseLedgerId || !config.salaryPayableLedgerId) {
    throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Payroll accounting config not found or incomplete. Configure salary expense and payable ledgers.', 400);
  }

  const slips = await db.select().from(payslips)
    .where(and(eq(payslips.tenantId, tenantId), eq(payslips.payrollRunId, payrollRunId)));

  let totalTax = 0;
  let totalPf = 0;
  for (const slip of slips) {
    const bd = slip.deductionsBreakdown as any;
    if (bd) {
      totalTax += parseFloat(bd.tax || '0');
      totalPf += parseFloat(bd.pf || '0');
    }
  }

  const totalGross = parseFloat(run.totalGross || '0');
  const totalNet = parseFloat(run.totalNet || '0');

  const result = await db.transaction(async (tx) => {
    const voucherNumber = await SequentialIdGenerator.generateVoucherId(tenantId, 'JV');

    const [jvType] = await tx.select().from(voucherTypes)
      .where(and(eq(voucherTypes.tenantId, tenantId), eq(voucherTypes.code, 'JV')));
    const [postedStatus] = await tx.select().from(voucherStatus)
      .where(and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'POSTED')));
    const [currentFY] = await tx.select().from(fiscalYears)
      .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)));

    if (!jvType) throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'JV voucher type not found for tenant', 400);
    if (!postedStatus) throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'POSTED voucher status not found for tenant', 400);
    if (!currentFY) throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'No active fiscal year found for tenant', 400);

    const [voucher] = await tx.insert(vouchers).values({
      voucherNumber,
      voucherTypeId: jvType.id,
      voucherDate: run.endDate!,
      postingDate: run.endDate!,
      fiscalYearId: currentFY.id,
      statusId: postedStatus.id,
      description: `Payroll accrual for ${run.payrollMonth}`,
      amount: String(totalGross),
      preparedById: postedBy,
      isPosted: true,
      postedById: postedBy,
      postedDate: new Date(),
      workflowStatus: 'POSTED',
      originModule: 'PAYROLL',
      originType: 'PAYROLL_ACCRUAL',
      originId: payrollRunId,
      originRef: `PR-${run.payrollMonth}`,
      tenantId,
    }).returning();

    let lineNumber = 1;

    await tx.insert(voucherItems).values({
      voucherId: voucher.id,
      lineNumber: lineNumber++,
      accountId: config.salaryExpenseLedgerId!,
      description: `Salary expense - ${run.payrollMonth}`,
      debitAmount: String(totalGross),
      creditAmount: '0',
      tenantId,
    });

    await tx.insert(voucherItems).values({
      voucherId: voucher.id,
      lineNumber: lineNumber++,
      accountId: config.salaryPayableLedgerId!,
      description: `Salary payable - ${run.payrollMonth}`,
      debitAmount: '0',
      creditAmount: String(totalNet),
      tenantId,
    });

    if (totalTax > 0 && config.taxPayableLedgerId) {
      await tx.insert(voucherItems).values({
        voucherId: voucher.id,
        lineNumber: lineNumber++,
        accountId: config.taxPayableLedgerId,
        description: `Tax payable - ${run.payrollMonth}`,
        debitAmount: '0',
        creditAmount: String(totalTax),
        tenantId,
      });
    }

    if (totalPf > 0 && config.pfPayableLedgerId) {
      await tx.insert(voucherItems).values({
        voucherId: voucher.id,
        lineNumber: lineNumber++,
        accountId: config.pfPayableLedgerId,
        description: `PF payable - ${run.payrollMonth}`,
        debitAmount: '0',
        creditAmount: String(totalPf),
        tenantId,
      });
    }

    await tx.update(payrollRuns).set({
      status: 'POSTED',
      accrualVoucherId: voucher.id,
      postedBy,
      postedAt: new Date(),
      requestId,
      updatedAt: new Date(),
    }).where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.tenantId, tenantId)));

    await tx.update(payslips).set({ status: 'POSTED' })
      .where(and(eq(payslips.tenantId, tenantId), eq(payslips.payrollRunId, payrollRunId)));

    await tx.insert(auditLogs).values({
      tenantId,
      entityType: 'payroll_run',
      entityId: payrollRunId,
      action: 'POSTED',
      performedBy: postedBy,
      newValues: { status: 'POSTED', accrualVoucherId: voucher.id, voucherNumber },
    });

    return { run: { ...run, status: 'POSTED', accrualVoucherId: voucher.id }, voucher };
  });

  await saveIdempotencyResult(tenantId, requestId, 'PAYROLL_POST', String(payrollRunId), 200, result);

  return { success: true, message: 'Payroll run posted with accrual voucher', data: result };
}

export async function payPayrollRun(
  tenantId: number,
  payrollRunId: number,
  paidBy: number,
  requestId: string,
  paymentMethod: string
): Promise<any> {
  const idem = await checkIdempotency(tenantId, requestId, 'PAYROLL_PAY');
  if (idem.exists) {
    return { success: true, fromCache: true, message: 'Already paid (idempotent)', data: idem.cachedResponse };
  }

  const [run] = await db.select().from(payrollRuns)
    .where(and(eq(payrollRuns.tenantId, tenantId), eq(payrollRuns.id, payrollRunId)));

  if (!run) {
    throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Payroll run not found', 404);
  }

  if (run.status !== 'POSTED') {
    throw new ERPError(ERP_ERROR_CODES.INVALID_STATE_TRANSITION, `Cannot pay payroll run in ${run.status} status. Must be POSTED.`, 400);
  }

  const [config] = await db.select().from(payrollAccountingConfig)
    .where(eq(payrollAccountingConfig.tenantId, tenantId));

  if (!config || !config.salaryPayableLedgerId) {
    throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Payroll accounting config not found or incomplete', 400);
  }

  const creditLedgerId = paymentMethod === 'CASH' ? config.cashLedgerId : config.bankLedgerId;
  if (!creditLedgerId) {
    throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, `${paymentMethod === 'CASH' ? 'Cash' : 'Bank'} ledger not configured in payroll accounting config`, 400);
  }

  const totalNet = parseFloat(run.totalNet || '0');

  const slips = await db.select().from(payslips)
    .where(and(eq(payslips.tenantId, tenantId), eq(payslips.payrollRunId, payrollRunId)));

  const result = await db.transaction(async (tx) => {
    const voucherNumber = await SequentialIdGenerator.generateVoucherId(tenantId, 'PAYMENT');

    const [jvType] = await tx.select().from(voucherTypes)
      .where(and(eq(voucherTypes.tenantId, tenantId), eq(voucherTypes.code, 'JV')));
    const [postedStatus] = await tx.select().from(voucherStatus)
      .where(and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'POSTED')));
    const [currentFY] = await tx.select().from(fiscalYears)
      .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)));

    if (!jvType) throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'JV voucher type not found for tenant', 400);
    if (!postedStatus) throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'POSTED voucher status not found for tenant', 400);
    if (!currentFY) throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'No active fiscal year found for tenant', 400);

    const [voucher] = await tx.insert(vouchers).values({
      voucherNumber,
      voucherTypeId: jvType.id,
      voucherDate: run.endDate!,
      postingDate: run.endDate!,
      fiscalYearId: currentFY.id,
      statusId: postedStatus.id,
      description: `Payroll payment for ${run.payrollMonth} via ${paymentMethod}`,
      amount: String(totalNet),
      preparedById: paidBy,
      isPosted: true,
      postedById: paidBy,
      postedDate: new Date(),
      workflowStatus: 'POSTED',
      originModule: 'PAYROLL',
      originType: 'PAYROLL_PAYMENT',
      originId: payrollRunId,
      originRef: `PP-${run.payrollMonth}`,
      tenantId,
    }).returning();

    await tx.insert(voucherItems).values({
      voucherId: voucher.id,
      lineNumber: 1,
      accountId: config.salaryPayableLedgerId!,
      description: `Salary payable cleared - ${run.payrollMonth}`,
      debitAmount: String(totalNet),
      creditAmount: '0',
      tenantId,
    });

    await tx.insert(voucherItems).values({
      voucherId: voucher.id,
      lineNumber: 2,
      accountId: creditLedgerId,
      description: `${paymentMethod} payment - ${run.payrollMonth}`,
      debitAmount: '0',
      creditAmount: String(totalNet),
      tenantId,
    });

    await tx.update(payrollRuns).set({
      status: 'PAID',
      paymentVoucherId: voucher.id,
      paidAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.tenantId, tenantId)));

    await tx.update(payslips).set({ status: 'PAID' })
      .where(and(eq(payslips.tenantId, tenantId), eq(payslips.payrollRunId, payrollRunId)));

    for (const slip of slips) {
      const recovery = parseFloat(slip.advanceRecovery || '0');
      if (recovery <= 0) continue;

      const advances = await tx.select().from(employeeAdvances)
        .where(and(
          eq(employeeAdvances.tenantId, tenantId),
          eq(employeeAdvances.employeeId, slip.employeeId),
          eq(employeeAdvances.status, 'ACTIVE')
        ));

      let remaining = recovery;
      for (const adv of advances) {
        if (remaining <= 0) break;
        const outstanding = parseFloat(adv.outstandingAmount || '0');
        const monthly = parseFloat(adv.monthlyDeductionAmount || '0');
        const deduct = Math.min(remaining, monthly, outstanding);
        const newOutstanding = outstanding - deduct;
        const newRecovered = parseFloat(adv.totalRecovered || '0') + deduct;

        await tx.update(employeeAdvances).set({
          outstandingAmount: String(newOutstanding),
          totalRecovered: String(newRecovered),
          status: newOutstanding <= 0 ? 'CLOSED' : 'ACTIVE',
          updatedAt: new Date(),
        }).where(eq(employeeAdvances.id, adv.id));

        remaining -= deduct;
      }
    }

    await tx.insert(auditLogs).values({
      tenantId,
      entityType: 'payroll_run',
      entityId: payrollRunId,
      action: 'PAID',
      performedBy: paidBy,
      newValues: { status: 'PAID', paymentVoucherId: voucher.id, paymentMethod },
    });

    return { run: { ...run, status: 'PAID', paymentVoucherId: voucher.id }, voucher };
  });

  await saveIdempotencyResult(tenantId, requestId, 'PAYROLL_PAY', String(payrollRunId), 200, result);

  return { success: true, message: 'Payroll run paid successfully', data: result };
}

export async function getPayrollRunTrace(
  tenantId: number,
  payrollRunId: number
): Promise<any> {
  const [run] = await db.select().from(payrollRuns)
    .where(and(eq(payrollRuns.tenantId, tenantId), eq(payrollRuns.id, payrollRunId)));

  if (!run) {
    throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Payroll run not found', 404);
  }

  const slips = await db.select().from(payslips)
    .where(and(eq(payslips.tenantId, tenantId), eq(payslips.payrollRunId, payrollRunId)));

  let accrualVoucher = null;
  if (run.accrualVoucherId) {
    const [v] = await db.select().from(vouchers)
      .where(and(eq(vouchers.id, run.accrualVoucherId), eq(vouchers.tenantId, tenantId)));
    if (v) {
      const items = await db.select().from(voucherItems)
        .where(and(eq(voucherItems.voucherId, v.id), eq(voucherItems.tenantId, tenantId)));
      accrualVoucher = { ...v, items };
    }
  }

  let paymentVoucher = null;
  if (run.paymentVoucherId) {
    const [v] = await db.select().from(vouchers)
      .where(and(eq(vouchers.id, run.paymentVoucherId), eq(vouchers.tenantId, tenantId)));
    if (v) {
      const items = await db.select().from(voucherItems)
        .where(and(eq(voucherItems.voucherId, v.id), eq(voucherItems.tenantId, tenantId)));
      paymentVoucher = { ...v, items };
    }
  }

  const audit = await db.select().from(auditLogs)
    .where(and(
      eq(auditLogs.tenantId, tenantId),
      eq(auditLogs.entityType, 'payroll_run'),
      eq(auditLogs.entityId, payrollRunId)
    ))
    .orderBy(desc(auditLogs.performedAt));

  return { run, payslips: slips, accrualVoucher, paymentVoucher, auditTrail: audit };
}

export async function createAdvance(
  tenantId: number,
  data: { employeeId: number; advanceDate: string; amount: number; monthlyDeductionAmount: number; reason?: string; createdBy: number; bankOrCashLedgerId?: number }
): Promise<any> {
  const [advance] = await db.insert(employeeAdvances).values({
    tenantId,
    employeeId: data.employeeId,
    advanceDate: data.advanceDate,
    amount: String(data.amount),
    monthlyDeductionAmount: String(data.monthlyDeductionAmount),
    outstandingAmount: String(data.amount),
    totalRecovered: '0',
    status: 'ACTIVE',
    reason: data.reason,
    createdBy: data.createdBy,
  }).returning();

  await db.insert(auditLogs).values({
    tenantId,
    entityType: 'employee_advance',
    entityId: advance.id,
    action: 'CREATED',
    performedBy: data.createdBy,
    newValues: { amount: data.amount, employeeId: data.employeeId, status: 'ACTIVE' },
  });

  const [config] = await db.select().from(payrollAccountingConfig)
    .where(eq(payrollAccountingConfig.tenantId, tenantId));

  if (config?.advanceReceivableLedgerId) {
    const creditLedgerId = data.bankOrCashLedgerId || config.bankLedgerId || config.cashLedgerId;

    if (creditLedgerId) {
      try {
        const [jvType] = await db.select().from(voucherTypes)
          .where(and(eq(voucherTypes.tenantId, tenantId), eq(voucherTypes.code, 'JV')));
        const [postedStatus] = await db.select().from(voucherStatus)
          .where(and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'POSTED')));
        const [currentFY] = await db.select().from(fiscalYears)
          .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)));

        if (jvType && postedStatus && currentFY) {
          const [emp] = await db.select().from(employees)
            .where(and(eq(employees.id, data.employeeId), eq(employees.tenantId, tenantId)));
          const empName = emp ? `${emp.firstName} ${emp.lastName}` : `Employee #${data.employeeId}`;

          const voucherNumber = await SequentialIdGenerator.generateVoucherId(tenantId, 'JV');

          const [voucher] = await db.insert(vouchers).values({
            voucherNumber,
            voucherTypeId: jvType.id,
            voucherDate: data.advanceDate,
            postingDate: data.advanceDate,
            fiscalYearId: currentFY.id,
            statusId: postedStatus.id,
            description: `Employee advance to ${empName} - ${data.reason || 'Advance'}`,
            amount: String(data.amount),
            preparedById: data.createdBy,
            isPosted: true,
            postedById: data.createdBy,
            postedDate: new Date(),
            workflowStatus: 'POSTED',
            originModule: 'PAYROLL',
            originType: 'EMPLOYEE_ADVANCE',
            originId: advance.id,
            originRef: `ADV-${advance.id}`,
            tenantId,
          }).returning();

          await db.insert(voucherItems).values({
            voucherId: voucher.id,
            lineNumber: 1,
            accountId: config.advanceReceivableLedgerId,
            description: `Advance receivable - ${empName}`,
            debitAmount: String(data.amount),
            creditAmount: '0',
            tenantId,
          });

          await db.insert(voucherItems).values({
            voucherId: voucher.id,
            lineNumber: 2,
            accountId: creditLedgerId,
            description: `Advance disbursement - ${empName}`,
            debitAmount: '0',
            creditAmount: String(data.amount),
            tenantId,
          });

          await db.insert(auditLogs).values({
            tenantId,
            entityType: 'employee_advance',
            entityId: advance.id,
            action: 'GL_VOUCHER_CREATED',
            performedBy: data.createdBy,
            newValues: { voucherId: voucher.id, voucherNumber, amount: data.amount },
          });
        }
      } catch (glError) {
        console.error('[ADVANCE] Failed to create GL voucher for advance:', glError);
      }
    }
  }

  return advance;
}

export async function closeAdvance(
  tenantId: number,
  advanceId: number
): Promise<any> {
  const [advance] = await db.select().from(employeeAdvances)
    .where(and(eq(employeeAdvances.tenantId, tenantId), eq(employeeAdvances.id, advanceId)));

  if (!advance) {
    throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Advance not found', 404);
  }

  const [updated] = await db.update(employeeAdvances).set({
    status: 'CLOSED',
    updatedAt: new Date(),
  }).where(and(eq(employeeAdvances.id, advanceId), eq(employeeAdvances.tenantId, tenantId))).returning();

  await db.insert(auditLogs).values({
    tenantId,
    entityType: 'employee_advance',
    entityId: advanceId,
    action: 'CLOSED',
    performedBy: advance.createdBy,
    newValues: { status: 'CLOSED' },
  });

  return updated;
}
