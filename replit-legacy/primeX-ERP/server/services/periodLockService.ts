import { db } from '../db';
import { accountingPeriods } from '@shared/schema';
import { eq, and, lte, gte } from 'drizzle-orm';
import { logAudit } from './auditService';

export interface PeriodCheckResult {
  blocked: boolean;
  code?: string;
  periodId?: number;
  periodName?: string;
  periodStart?: string;
  periodEnd?: string;
  postingDate?: string;
  message?: string;
}

export async function checkPeriodLock(
  tenantId: number,
  postingDate: string | Date
): Promise<PeriodCheckResult> {
  const dateStr = typeof postingDate === 'string' ? postingDate : postingDate.toISOString().split('T')[0];
  
  const closedPeriods = await db
    .select({
      id: accountingPeriods.id,
      name: accountingPeriods.name,
      startDate: accountingPeriods.startDate,
      endDate: accountingPeriods.endDate,
    })
    .from(accountingPeriods)
    .where(
      and(
        eq(accountingPeriods.tenantId, tenantId),
        eq(accountingPeriods.isClosed, true),
        lte(accountingPeriods.startDate, dateStr),
        gte(accountingPeriods.endDate, dateStr)
      )
    );

  if (closedPeriods.length > 0) {
    const period = closedPeriods[0];
    return {
      blocked: true,
      code: 'PERIOD_CLOSED',
      periodId: period.id,
      periodName: period.name,
      periodStart: period.startDate,
      periodEnd: period.endDate,
      postingDate: dateStr,
      message: `Cannot post voucher: posting date ${dateStr} falls within closed accounting period "${period.name}" (${period.startDate} to ${period.endDate}).`,
    };
  }

  return { blocked: false };
}

export async function closePeriod(
  tenantId: number,
  periodId: number,
  closedBy: number,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  const [period] = await db
    .select()
    .from(accountingPeriods)
    .where(and(eq(accountingPeriods.id, periodId), eq(accountingPeriods.tenantId, tenantId)));

  if (!period) {
    return { success: false, message: 'Period not found' };
  }

  if (period.isClosed) {
    return { success: false, message: 'Period is already closed' };
  }

  await db
    .update(accountingPeriods)
    .set({
      isClosed: true,
      closedBy,
      closedAt: new Date(),
      closedReason: reason || null,
      updatedAt: new Date(),
    })
    .where(and(eq(accountingPeriods.id, periodId), eq(accountingPeriods.tenantId, tenantId)));

  await logAudit({
    tenantId,
    entityType: 'accounting_period',
    entityId: periodId,
    action: 'CLOSE',
    performedBy: closedBy,
    oldValues: { isClosed: false },
    newValues: { isClosed: true, closedReason: reason },
  }).catch(console.error);

  return { success: true, message: `Period "${period.name}" closed successfully` };
}

export async function openPeriod(
  tenantId: number,
  periodId: number,
  openedBy: number,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  const [period] = await db
    .select()
    .from(accountingPeriods)
    .where(and(eq(accountingPeriods.id, periodId), eq(accountingPeriods.tenantId, tenantId)));

  if (!period) {
    return { success: false, message: 'Period not found' };
  }

  if (!period.isClosed) {
    return { success: false, message: 'Period is already open' };
  }

  await db
    .update(accountingPeriods)
    .set({
      isClosed: false,
      closedBy: null,
      closedAt: null,
      closedReason: null,
      updatedAt: new Date(),
    })
    .where(and(eq(accountingPeriods.id, periodId), eq(accountingPeriods.tenantId, tenantId)));

  await logAudit({
    tenantId,
    entityType: 'accounting_period',
    entityId: periodId,
    action: 'REOPEN',
    performedBy: openedBy,
    oldValues: { isClosed: true },
    newValues: { isClosed: false, reopenReason: reason },
  }).catch(console.error);

  return { success: true, message: `Period "${period.name}" reopened successfully` };
}
