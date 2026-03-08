import { startBoss, stopBoss, registerJobProcessors, scheduleRecurringJobs, EXCEPTION_SCAN_QUEUE, RECONCILIATION_REPORT_QUEUE, CASHFLOW_UPDATE_QUEUE, INTEREST_ACCRUAL_QUEUE, TENANT_BACKUP_QUEUE } from './boss';
import { registerReportWorker, REPORT_PDF_QUEUE } from './reports.worker';
import { db } from '../db';
import { sql } from 'drizzle-orm';

export async function initJobQueue(): Promise<void> {
  try {
    const boss = await startBoss();
    
    await boss.createQueue(REPORT_PDF_QUEUE);
    registerReportWorker(boss);
    
    await boss.createQueue(EXCEPTION_SCAN_QUEUE);
    await boss.createQueue(RECONCILIATION_REPORT_QUEUE);
    await boss.createQueue(CASHFLOW_UPDATE_QUEUE);
    await boss.createQueue(INTEREST_ACCRUAL_QUEUE);
    await boss.createQueue(TENANT_BACKUP_QUEUE);
    await registerJobProcessors(boss);
    await scheduleRecurringJobs(boss);
    
    await scheduleCleanupTask(boss);
    
    console.log('[jobs] Job queue system initialized successfully');
    
    process.on('SIGTERM', async () => {
      console.log('[jobs] Shutting down job queue...');
      await stopBoss();
    });
    
    process.on('SIGINT', async () => {
      console.log('[jobs] Shutting down job queue...');
      await stopBoss();
    });
  } catch (error) {
    console.error('[jobs] Failed to initialize job queue:', error);
  }
}

async function scheduleCleanupTask(boss: any): Promise<void> {
  const CLEANUP_QUEUE = 'report-files-cleanup';
  
  try {
    await boss.createQueue(CLEANUP_QUEUE);
    
    await boss.work(CLEANUP_QUEUE, async () => {
      console.log('[cleanup] Running expired report files cleanup...');
      try {
        const expired = await db.execute(sql`
          SELECT id, file_path FROM report_files
          WHERE expires_at < NOW() AND status = 'completed'
        `);
        
        if (expired.rows.length > 0) {
          const fs = await import('fs');
          for (const row of expired.rows) {
            const file = row as any;
            try {
              if (file.file_path && fs.existsSync(file.file_path)) {
                fs.unlinkSync(file.file_path);
              }
            } catch (e) {
              console.error(`[cleanup] Failed to delete file ${file.file_path}:`, e);
            }
          }
          
          await db.execute(sql`
            UPDATE report_files SET status = 'expired', updated_at = NOW()
            WHERE expires_at < NOW() AND status = 'completed'
          `);
          
          console.log(`[cleanup] Cleaned up ${expired.rows.length} expired report files`);
        } else {
          console.log('[cleanup] No expired files to clean up');
        }
      } catch (error) {
        console.error('[cleanup] Cleanup task failed:', error);
        throw error;
      }
    });
    
    await boss.schedule(CLEANUP_QUEUE, '0 3 * * *', {}, { tz: 'UTC' });
    console.log('[cleanup] Scheduled daily cleanup at 03:00 UTC');
  } catch (err: any) {
    console.error('[cleanup] Failed to schedule cleanup:', err.message || err);
  }
}

export { REPORT_PDF_QUEUE } from './reports.worker';
export { getBoss } from './boss';
