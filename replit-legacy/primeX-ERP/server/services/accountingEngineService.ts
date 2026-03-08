import { db } from '../db';
import {
  vouchers, voucherItems, voucherTypes, voucherStatus,
  accountingPeriods, ledgerPostings, voucherApprovalHistory,
  auditLogs, fiscalYears
} from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { ERPError, ERP_ERROR_CODES, isVoucherImmutable, validateVoucherBalance, checkIdempotency, saveIdempotencyResult } from './transactionSafetyService';
import { SequentialIdGenerator } from '../utils/sequentialIdGenerator';

// ===== PERIOD LOCK ENFORCEMENT =====

export async function checkPeriodLock(
  tenantId: number, 
  voucherDate: string,
  options?: { allowOverride?: boolean; overrideReason?: string; overrideBy?: number }
): Promise<{ locked: boolean; period?: any; overrideApplied?: boolean }> {
  const [period] = await db.select().from(accountingPeriods)
    .where(and(
      eq(accountingPeriods.tenantId, tenantId),
      sql`${accountingPeriods.startDate} <= ${voucherDate}`,
      sql`${accountingPeriods.endDate} >= ${voucherDate}`,
      eq(accountingPeriods.isClosed, true)
    ))
    .limit(1);

  if (!period) {
    return { locked: false };
  }

  if (options?.allowOverride && options.overrideReason && options.overrideBy) {
    await db.insert(auditLogs).values({
      tenantId,
      entityType: 'accounting_period',
      entityId: period.id,
      action: 'PERIOD_LOCK_OVERRIDE',
      performedBy: options.overrideBy,
      newValues: {
        overrideReason: options.overrideReason,
        voucherDate,
        periodName: period.name,
        periodStart: period.startDate,
        periodEnd: period.endDate,
      },
    });
    return { locked: false, period, overrideApplied: true };
  }

  return { locked: true, period };
}

// ===== VOUCHER LIFECYCLE ENFORCEMENT =====

export async function enforceVoucherImmutability(voucherId: number, tenantId: number): Promise<void> {
  const [voucher] = await db.select({
    id: vouchers.id,
    isPosted: vouchers.isPosted,
    isCancelled: vouchers.isCancelled,
    workflowStatus: vouchers.workflowStatus,
  }).from(vouchers)
    .where(and(eq(vouchers.id, voucherId), eq(vouchers.tenantId, tenantId)));

  if (!voucher) {
    throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Voucher not found', 404);
  }

  if (voucher.isPosted || voucher.workflowStatus === 'POSTED') {
    throw new ERPError(
      ERP_ERROR_CODES.IMMUTABLE_POSTED,
      'Posted vouchers cannot be modified. Use reversal + correction to make changes.',
      403,
      { voucherId, workflowStatus: voucher.workflowStatus }
    );
  }

  if (voucher.isCancelled || voucher.workflowStatus === 'CANCELLED') {
    throw new ERPError(
      ERP_ERROR_CODES.IMMUTABLE_POSTED,
      'Cancelled vouchers cannot be modified.',
      403,
      { voucherId, workflowStatus: voucher.workflowStatus }
    );
  }
}

// ===== REVERSAL & CORRECTION PATTERN (Tally-like) =====

interface ReversalResult {
  reversalVoucher: any;
  correctedVoucher?: any;
  message: string;
}

export async function createVoucherReversal(
  originalVoucherId: number,
  tenantId: number,
  userId: number,
  reversalDate: string,
  reversalReason: string,
  correctionData?: {
    voucherDate: string;
    description?: string;
    items: Array<{
      accountId: number;
      description: string;
      debitAmount: string;
      creditAmount: string;
    }>;
  }
): Promise<ReversalResult> {
  return await db.transaction(async (tx) => {
    const [original] = await tx.select().from(vouchers)
      .where(and(eq(vouchers.id, originalVoucherId), eq(vouchers.tenantId, tenantId)));

    if (!original) {
      throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Original voucher not found', 404);
    }

    if (!original.isPosted) {
      throw new ERPError(
        ERP_ERROR_CODES.INVALID_STATE_TRANSITION,
        'Only POSTED vouchers can be reversed. Edit the voucher directly if it is still in DRAFT/APPROVED.',
        400
      );
    }

    if (original.isReversal) {
      throw new ERPError(
        ERP_ERROR_CODES.INVALID_STATE_TRANSITION,
        'Reversal vouchers cannot be reversed again.',
        400
      );
    }

    if (original.reversalVoucherId) {
      throw new ERPError(
        ERP_ERROR_CODES.ALREADY_PROCESSED,
        'This voucher has already been reversed.',
        400,
        { reversalVoucherId: original.reversalVoucherId }
      );
    }

    const originalItems = await tx.select().from(voucherItems)
      .where(and(eq(voucherItems.voucherId, originalVoucherId), eq(voucherItems.tenantId, tenantId)))
      .orderBy(voucherItems.lineNumber);

    if (originalItems.length === 0) {
      throw new ERPError(ERP_ERROR_CODES.UNBALANCED_VOUCHER, 'Original voucher has no line items', 400);
    }

    const periodCheck = await checkPeriodLock(tenantId, reversalDate);
    if (periodCheck.locked) {
      throw new ERPError(
        ERP_ERROR_CODES.PERIOD_LOCKED,
        `Cannot create reversal in locked period: ${periodCheck.period?.name}`,
        403,
        { period: periodCheck.period }
      );
    }

    const [voucherType] = await tx.select().from(voucherTypes)
      .where(eq(voucherTypes.id, original.voucherTypeId));

    const [draftStatus] = await tx.select().from(voucherStatus)
      .where(and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'DRAFT')));
    
    const [postedStatus] = await tx.select().from(voucherStatus)
      .where(and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'POSTED')));

    const statusId = postedStatus?.id || draftStatus?.id || original.statusId;

    const [currentFY] = await tx.select().from(fiscalYears)
      .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)));

    const reversalNumber = await SequentialIdGenerator.generateVoucherId(tenantId, voucherType?.code || 'JV');

    const [reversalVoucher] = await tx.insert(vouchers).values({
      voucherNumber: reversalNumber,
      voucherTypeId: original.voucherTypeId,
      voucherDate: reversalDate,
      postingDate: reversalDate,
      fiscalYearId: currentFY?.id || original.fiscalYearId,
      statusId,
      description: `REVERSAL of ${original.voucherNumber}: ${reversalReason}`,
      amount: original.amount,
      currencyCode: original.currencyCode,
      exchangeRate: original.exchangeRate,
      baseCurrencyAmount: original.baseCurrencyAmount,
      preparedById: userId,
      isPosted: true,
      postedById: userId,
      postedDate: new Date(),
      isReversal: true,
      originalVoucherId: originalVoucherId,
      reversalReason,
      originModule: original.originModule,
      originType: original.originType ? `REVERSAL_${original.originType}` : 'REVERSAL',
      originId: original.originId,
      originRef: original.originRef,
      tenantId,
      workflowStatus: 'POSTED',
    }).returning();

    for (let i = 0; i < originalItems.length; i++) {
      const oi = originalItems[i];
      await tx.insert(voucherItems).values({
        voucherId: reversalVoucher.id,
        lineNumber: i + 1,
        accountId: oi.accountId,
        description: `Reversal: ${oi.description || ''}`,
        debitAmount: oi.creditAmount || '0',
        creditAmount: oi.debitAmount || '0',
        tenantId,
      });
    }

    const reversalPostings = originalItems.map((item, idx) => {
      const hasFc = item.fcCurrencyCode && item.fcCurrencyCode.trim() !== '';
      let debit: string;
      let credit: string;

      if (hasFc) {
        debit = item.baseCurrencyCreditAmount && parseFloat(item.baseCurrencyCreditAmount) !== 0
          ? item.baseCurrencyCreditAmount
          : '0';
        credit = item.baseCurrencyDebit && parseFloat(item.baseCurrencyDebit) !== 0
          ? item.baseCurrencyDebit
          : '0';

        if (debit === '0' && credit === '0') {
          const rate = parseFloat(item.itemExchangeRate || original.exchangeRate || '0');
          if (rate > 0) {
            const fcCredit = parseFloat(item.fcCreditAmount || '0');
            const fcDebit = parseFloat(item.fcDebitAmount || '0');
            if (fcCredit > 0) debit = (fcCredit * rate).toFixed(2);
            if (fcDebit > 0) credit = (fcDebit * rate).toFixed(2);
          }
        }

        if (debit === '0' && credit === '0') {
          throw new ERPError(
            ERP_ERROR_CODES.UNBALANCED_VOUCHER,
            `Reversal line ${idx + 1} (account ${item.accountId}): Foreign currency item has no valid base currency amount and no exchange rate to compute reversal.`,
            400,
            { lineNumber: idx + 1, accountId: item.accountId, fcCurrencyCode: item.fcCurrencyCode }
          );
        }
      } else {
        debit = item.creditAmount || '0';
        credit = item.debitAmount || '0';
      }

      return {
        tenantId,
        voucherId: reversalVoucher.id,
        voucherItemId: reversalVoucher.id * 1000 + idx,
        accountId: item.accountId,
        postingDate: reversalDate,
        debitAmount: debit,
        creditAmount: credit,
        narration: `Reversal of ${original.voucherNumber}`,
        postedById: userId,
        fiscalYearId: currentFY?.id || original.fiscalYearId,
      };
    });
    
    if (reversalPostings.length > 0) {
      await tx.insert(ledgerPostings).values(reversalPostings);
    }

    await tx.update(vouchers)
      .set({ reversalVoucherId: reversalVoucher.id })
      .where(eq(vouchers.id, originalVoucherId));

    await tx.insert(auditLogs).values({
      tenantId,
      entityType: 'voucher',
      entityId: originalVoucherId,
      action: 'REVERSAL_CREATED',
      performedBy: userId,
      newValues: {
        reversalVoucherId: reversalVoucher.id,
        reversalVoucherNumber: reversalVoucher.voucherNumber,
        reversalDate,
        reversalReason,
      },
    });

    let correctedVoucher = undefined;
    if (correctionData) {
      const balance = validateVoucherBalance(correctionData.items);
      if (!balance.balanced) {
        throw new ERPError(
          ERP_ERROR_CODES.UNBALANCED_VOUCHER,
          `Corrected voucher is not balanced. Debit: ${balance.totalDebit}, Credit: ${balance.totalCredit}`,
          400,
          balance
        );
      }

      const correctionNumber = await SequentialIdGenerator.generateVoucherId(tenantId, voucherType?.code || 'JV');
      
      const correctionStatusId = draftStatus?.id || original.statusId;

      const [newVoucher] = await tx.insert(vouchers).values({
        voucherNumber: correctionNumber,
        voucherTypeId: original.voucherTypeId,
        voucherDate: correctionData.voucherDate,
        fiscalYearId: currentFY?.id || original.fiscalYearId,
        statusId: correctionStatusId,
        description: correctionData.description || `Correction for ${original.voucherNumber}`,
        amount: String(balance.totalDebit),
        currencyCode: original.currencyCode,
        exchangeRate: original.exchangeRate,
        preparedById: userId,
        originalVoucherId: originalVoucherId,
        originModule: original.originModule,
        originType: original.originType ? `CORRECTION_${original.originType}` : 'CORRECTION',
        originId: original.originId,
        originRef: original.originRef,
        tenantId,
        workflowStatus: 'DRAFT',
      }).returning();

      for (let i = 0; i < correctionData.items.length; i++) {
        const ci = correctionData.items[i];
        await tx.insert(voucherItems).values({
          voucherId: newVoucher.id,
          lineNumber: i + 1,
          accountId: ci.accountId,
          description: ci.description,
          debitAmount: ci.debitAmount,
          creditAmount: ci.creditAmount,
          tenantId,
        });
      }

      await tx.update(vouchers)
        .set({ correctedVoucherId: newVoucher.id })
        .where(eq(vouchers.id, originalVoucherId));

      correctedVoucher = newVoucher;

      await tx.insert(auditLogs).values({
        tenantId,
        entityType: 'voucher',
        entityId: originalVoucherId,
        action: 'CORRECTION_CREATED',
        performedBy: userId,
        newValues: {
          correctedVoucherId: newVoucher.id,
          correctedVoucherNumber: newVoucher.voucherNumber,
        },
      });
    }

    return {
      reversalVoucher,
      correctedVoucher,
      message: correctedVoucher
        ? `Reversal ${reversalVoucher.voucherNumber} created and posted. Correction ${correctedVoucher.voucherNumber} created as DRAFT.`
        : `Reversal ${reversalVoucher.voucherNumber} created and posted.`,
    };
  });
}

// ===== IDEMPOTENT POSTING =====

export async function idempotentPostVoucher(
  voucherId: number,
  tenantId: number,
  userId: number,
  requestId?: string
): Promise<{ success: boolean; voucher?: any; message: string; fromCache?: boolean }> {
  if (requestId) {
    const idem = await checkIdempotency(tenantId, requestId, 'VOUCHER_POST');
    if (idem.exists) {
      return { success: true, voucher: idem.cachedResponse, message: 'Already posted (idempotent)', fromCache: true };
    }
  }

  const result = await db.transaction(async (tx) => {
    const lockResult = await tx.execute(
      sql`SELECT id, is_posted, is_cancelled, voucher_date, workflow_status, tenant_id
          FROM vouchers WHERE id = ${voucherId} AND tenant_id = ${tenantId} FOR UPDATE`
    );

    if (lockResult.rows.length === 0) {
      throw new ERPError(ERP_ERROR_CODES.NOT_AUTHORIZED, 'Voucher not found', 404);
    }

    const locked = lockResult.rows[0] as any;

    if (locked.is_posted) {
      return { alreadyPosted: true };
    }

    if (locked.is_cancelled) {
      throw new ERPError(ERP_ERROR_CODES.INVALID_STATE_TRANSITION, 'Cancelled vouchers cannot be posted', 400);
    }

    const voucherDate = locked.voucher_date;
    const periodCheck = await checkPeriodLock(tenantId, voucherDate);
    if (periodCheck.locked) {
      throw new ERPError(
        ERP_ERROR_CODES.PERIOD_LOCKED,
        `Cannot post voucher dated ${voucherDate} - period is locked: ${periodCheck.period?.name}`,
        403,
        { period: periodCheck.period }
      );
    }

    const items = await tx.select().from(voucherItems)
      .where(and(eq(voucherItems.voucherId, voucherId), eq(voucherItems.tenantId, tenantId)))
      .orderBy(voucherItems.lineNumber);

    if (items.length === 0) {
      throw new ERPError(ERP_ERROR_CODES.UNBALANCED_VOUCHER, 'Voucher has no line items', 400);
    }

    const balance = validateVoucherBalance(items.map(i => ({ debitAmount: i.debitAmount || '0', creditAmount: i.creditAmount || '0' })));
    if (!balance.balanced) {
      throw new ERPError(
        ERP_ERROR_CODES.UNBALANCED_VOUCHER,
        `Voucher is not balanced. Debit: ${balance.totalDebit.toFixed(2)}, Credit: ${balance.totalCredit.toFixed(2)}`,
        400,
        balance
      );
    }

    const existingPostings = await tx.select({ id: ledgerPostings.id }).from(ledgerPostings)
      .where(and(eq(ledgerPostings.voucherId, voucherId), eq(ledgerPostings.tenantId, tenantId)))
      .limit(1);
    if (existingPostings.length > 0) {
      return { alreadyPosted: true };
    }

    const [postedStatus] = await tx.select().from(voucherStatus)
      .where(and(eq(voucherStatus.tenantId, tenantId), eq(voucherStatus.code, 'POSTED')));

    const [currentFY] = await tx.select().from(fiscalYears)
      .where(and(eq(fiscalYears.tenantId, tenantId), eq(fiscalYears.isCurrent, true)));

    const updateFields: any = {
      isPosted: true,
      postedById: userId,
      postedDate: new Date(),
      postingDate: voucherDate,
      workflowStatus: 'POSTED',
    };
    if (postedStatus) {
      updateFields.statusId = postedStatus.id;
    }

    const [updatedVoucher] = await tx.update(vouchers)
      .set(updateFields)
      .where(eq(vouchers.id, voucherId))
      .returning();

    const postingRecords = items.map((item, idx) => {
      const hasFc = item.fcCurrencyCode && item.fcCurrencyCode.trim() !== '';
      let debit: string;
      let credit: string;

      if (hasFc) {
        debit = item.baseCurrencyDebit && parseFloat(item.baseCurrencyDebit) !== 0
          ? item.baseCurrencyDebit
          : '0';
        credit = item.baseCurrencyCreditAmount && parseFloat(item.baseCurrencyCreditAmount) !== 0
          ? item.baseCurrencyCreditAmount
          : '0';

        if (debit === '0' && credit === '0') {
          const rate = parseFloat(item.itemExchangeRate || updatedVoucher.exchangeRate || '0');
          if (rate > 0) {
            const fcDebit = parseFloat(item.fcDebitAmount || '0');
            const fcCredit = parseFloat(item.fcCreditAmount || '0');
            if (fcDebit > 0) debit = (fcDebit * rate).toFixed(2);
            if (fcCredit > 0) credit = (fcCredit * rate).toFixed(2);
          }
        }

        if (debit === '0' && credit === '0') {
          throw new ERPError(
            ERP_ERROR_CODES.UNBALANCED_VOUCHER,
            `Line ${idx + 1} (account ${item.accountId}): Foreign currency item has no valid base currency amount and no exchange rate to compute it. Provide baseCurrencyDebit/baseCurrencyCreditAmount or set an exchange rate.`,
            400,
            { lineNumber: idx + 1, accountId: item.accountId, fcCurrencyCode: item.fcCurrencyCode }
          );
        }
      } else {
        debit = item.debitAmount || '0';
        credit = item.creditAmount || '0';
      }

      if (parseFloat(debit) === 0 && parseFloat(credit) === 0) {
        throw new ERPError(
          ERP_ERROR_CODES.UNBALANCED_VOUCHER,
          `Line ${idx + 1} (account ${item.accountId}): Both debit and credit resolve to zero. Cannot post a zero-value line.`,
          400,
          { lineNumber: idx + 1, accountId: item.accountId }
        );
      }

      return {
        tenantId,
        voucherId,
        voucherItemId: item.id,
        accountId: item.accountId,
        postingDate: voucherDate,
        debitAmount: debit,
        creditAmount: credit,
        narration: item.description || updatedVoucher.description || '',
        postedById: userId,
        fiscalYearId: currentFY?.id || updatedVoucher.fiscalYearId,
        accountingPeriodId: updatedVoucher.accountingPeriodId,
      };
    });

    await tx.insert(ledgerPostings).values(postingRecords);

    await tx.insert(voucherApprovalHistory).values({
      voucherId,
      tenantId,
      fromStatusId: locked.status_id || updatedVoucher.statusId,
      toStatusId: postedStatus?.id || updatedVoucher.statusId,
      actionName: 'POST',
      actionById: userId,
      comments: 'Voucher posted',
    });

    return { alreadyPosted: false, voucher: updatedVoucher };
  });

  if (result.alreadyPosted) {
    const existing = await db.select().from(vouchers)
      .where(and(eq(vouchers.id, voucherId), eq(vouchers.tenantId, tenantId)));
    const msg = 'Voucher is already posted';
    if (requestId) {
      await saveIdempotencyResult(tenantId, requestId, 'VOUCHER_POST', String(voucherId), 200, existing[0]);
    }
    return { success: true, voucher: existing[0], message: msg, fromCache: true };
  }

  if (requestId) {
    await saveIdempotencyResult(tenantId, requestId, 'VOUCHER_POST', String(voucherId), 200, result.voucher);
  }

  return { success: true, voucher: result.voucher, message: 'Voucher posted successfully' };
}
