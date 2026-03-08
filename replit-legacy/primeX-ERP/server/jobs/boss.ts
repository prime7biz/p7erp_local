import PgBoss from 'pg-boss';
import { detectExceptions } from '../services/exceptionsService';
import { getStockVsGLReconciliation, getWIPVsGLReconciliation } from '../services/reconciliationService';
import { getCashflowCalendar } from '../services/cashflowCalendarService';
import { processInterestAccruals } from '../services/interestAccrualService';
import { generateBackup, cleanupOldAutoBackups } from '../services/backupService';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { tenantSettings } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { logAudit } from '../services/auditService';

let boss: PgBoss | null = null;

export const EXCEPTION_SCAN_QUEUE = 'exception-scan';
export const RECONCILIATION_REPORT_QUEUE = 'reconciliation-report';
export const CASHFLOW_UPDATE_QUEUE = 'cashflow-update';
export const INTEREST_ACCRUAL_QUEUE = 'interest-accrual';
export const TENANT_BACKUP_QUEUE = 'tenant-backup';

export function getBoss(): PgBoss {
  if (!boss) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set for job queue');
    }
    boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      expireInMinutes: 60,
      archiveCompletedAfterSeconds: 86400,
      deleteAfterDays: 7,
      monitorStateIntervalSeconds: 30,
    });

    boss.on('error', (error) => {
      console.error('[pg-boss] Error:', error);
    });
  }
  return boss;
}

export async function startBoss(): Promise<PgBoss> {
  const instance = getBoss();
  await instance.start();
  console.log('[pg-boss] Job queue started successfully');
  return instance;
}

export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true, timeout: 10000 });
    console.log('[pg-boss] Job queue stopped');
    boss = null;
  }
}

async function getTenantIds(): Promise<number[]> {
  try {
    const result = await db.execute(sql`SELECT id FROM tenants WHERE is_active = true`);
    return (result.rows as any[]).map(r => r.id);
  } catch {
    return [1];
  }
}

async function processExceptionScan(job: PgBoss.Job<{ tenantId?: number }>) {
  const startTime = Date.now();
  console.log('[exception-scan] Starting exception scan job...');
  try {
    const tenantIds = job.data?.tenantId ? [job.data.tenantId] : await getTenantIds();

    for (const tenantId of tenantIds) {
      try {
        const exceptions = await detectExceptions(tenantId);
        const critical = exceptions.filter(e => e.severity === 'CRITICAL').length;
        const high = exceptions.filter(e => e.severity === 'HIGH').length;
        console.log(`[exception-scan] Tenant ${tenantId}: ${exceptions.length} exceptions found (${critical} critical, ${high} high)`);
      } catch (err) {
        console.error(`[exception-scan] Error scanning tenant ${tenantId}:`, err);
      }
    }

    console.log(`[exception-scan] Completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('[exception-scan] Job failed:', error);
    throw error;
  }
}

async function processReconciliationReport(job: PgBoss.Job<{ tenantId?: number }>) {
  const startTime = Date.now();
  console.log('[reconciliation-report] Starting reconciliation report job...');
  try {
    const tenantIds = job.data?.tenantId ? [job.data.tenantId] : await getTenantIds();

    for (const tenantId of tenantIds) {
      try {
        const stockRecon = await getStockVsGLReconciliation(tenantId);
        const wipRecon = await getWIPVsGLReconciliation(tenantId);
        console.log(`[reconciliation-report] Tenant ${tenantId}: Stock variance=${stockRecon.summary.variance}, WIP variance=${wipRecon.summary.variance}`);
      } catch (err) {
        console.error(`[reconciliation-report] Error for tenant ${tenantId}:`, err);
      }
    }

    console.log(`[reconciliation-report] Completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('[reconciliation-report] Job failed:', error);
    throw error;
  }
}

async function processCashflowUpdate(job: PgBoss.Job<{ tenantId?: number; days?: number }>) {
  const startTime = Date.now();
  console.log('[cashflow-update] Starting cashflow projection update...');
  try {
    const tenantIds = job.data?.tenantId ? [job.data.tenantId] : await getTenantIds();
    const days = job.data?.days || 90;
    const today = new Date().toISOString().split('T')[0];

    for (const tenantId of tenantIds) {
      try {
        const cashflow = await getCashflowCalendar(tenantId, today, days);
        console.log(`[cashflow-update] Tenant ${tenantId}: Net cashflow=${cashflow.totals.netCashflow}, Receivables=${cashflow.totals.totalReceivables}, Payables=${cashflow.totals.totalPayables}`);
      } catch (err) {
        console.error(`[cashflow-update] Error for tenant ${tenantId}:`, err);
      }
    }

    console.log(`[cashflow-update] Completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('[cashflow-update] Job failed:', error);
    throw error;
  }
}

async function processInterestAccrual(job: PgBoss.Job<{}>) {
  const startTime = Date.now();
  console.log('[interest-accrual] Starting interest accrual job...');
  try {
    await processInterestAccruals();
    console.log(`[interest-accrual] Completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('[interest-accrual] Job failed:', error);
    throw error;
  }
}

async function processTenantBackup(job: PgBoss.Job<{}>) {
  const startTime = Date.now();
  console.log('[tenant-backup] Starting auto-backup job...');
  try {
    const tenantIds = await getTenantIds();
    const dayOfWeek = new Date().getDay();

    for (const tenantId of tenantIds) {
      try {
        const [settings] = await db.select({
          autoBackupEnabled: tenantSettings.autoBackupEnabled,
          autoBackupFrequency: tenantSettings.autoBackupFrequency,
        }).from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));

        if (!settings?.autoBackupEnabled) continue;
        if (settings.autoBackupFrequency === 'off') continue;
        if (settings.autoBackupFrequency === 'weekly' && dayOfWeek !== 0) continue;

        const result = await generateBackup(tenantId, null, true);
        await cleanupOldAutoBackups(tenantId, 7);
        console.log(`[tenant-backup] Tenant ${tenantId}: Backup created (${result.sizeBytes} bytes)`);
        logAudit({
          tenantId,
          entityType: 'backup',
          entityId: result.backupId,
          action: 'BACKUP_SUCCESS',
          performedBy: 0,
          newValues: { sizeBytes: result.sizeBytes, recordCounts: result.recordCounts, isAuto: true },
        });
      } catch (err) {
        console.error(`[tenant-backup] Error backing up tenant ${tenantId}:`, err);
        logAudit({
          tenantId,
          entityType: 'backup',
          entityId: 0,
          action: 'BACKUP_FAILED',
          performedBy: 0,
          newValues: { error: String(err), isAuto: true },
        });
      }
    }

    console.log(`[tenant-backup] Completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('[tenant-backup] Job failed:', error);
    throw error;
  }
}

export async function registerJobProcessors(bossInstance: PgBoss) {
  await bossInstance.work(EXCEPTION_SCAN_QUEUE, processExceptionScan);
  await bossInstance.work(RECONCILIATION_REPORT_QUEUE, processReconciliationReport);
  await bossInstance.work(CASHFLOW_UPDATE_QUEUE, processCashflowUpdate);
  await bossInstance.work(INTEREST_ACCRUAL_QUEUE, processInterestAccrual);
  await bossInstance.work(TENANT_BACKUP_QUEUE, processTenantBackup);
  console.log('[pg-boss] Registered job processors: exception-scan, reconciliation-report, cashflow-update, interest-accrual, tenant-backup');
}

export async function scheduleRecurringJobs(bossInstance: PgBoss) {
  try {
    await bossInstance.schedule(EXCEPTION_SCAN_QUEUE, '0 */6 * * *', {}, { tz: 'UTC' });
    console.log('[pg-boss] Scheduled exception-scan every 6 hours');
  } catch (err: any) {
    console.error('[pg-boss] Failed to schedule exception-scan:', err.message || err);
  }

  try {
    await bossInstance.schedule(RECONCILIATION_REPORT_QUEUE, '0 2 * * *', {}, { tz: 'UTC' });
    console.log('[pg-boss] Scheduled reconciliation-report daily at 02:00 UTC');
  } catch (err: any) {
    console.error('[pg-boss] Failed to schedule reconciliation-report:', err.message || err);
  }

  try {
    await bossInstance.schedule(CASHFLOW_UPDATE_QUEUE, '0 */8 * * *', {}, { tz: 'UTC' });
    console.log('[pg-boss] Scheduled cashflow-update every 8 hours');
  } catch (err: any) {
    console.error('[pg-boss] Failed to schedule cashflow-update:', err.message || err);
  }

  try {
    await bossInstance.schedule(INTEREST_ACCRUAL_QUEUE, '0 1 * * *', {}, { tz: 'UTC' });
    console.log('[pg-boss] Scheduled interest-accrual daily at 01:00 UTC');
  } catch (err: any) {
    console.error('[pg-boss] Failed to schedule interest-accrual:', err.message || err);
  }

  try {
    await bossInstance.schedule(TENANT_BACKUP_QUEUE, '30 3 * * *', {}, { tz: 'UTC' });
    console.log('[pg-boss] Scheduled tenant-backup daily at 03:30 UTC');
  } catch (err: any) {
    console.error('[pg-boss] Failed to schedule tenant-backup:', err.message || err);
  }
}
