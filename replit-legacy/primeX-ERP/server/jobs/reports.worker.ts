import PgBoss from 'pg-boss';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import path from 'path';
import { generateReportPdf, getReportsDir, ensureReportsDir, PdfReportData } from './pdfGenerator';

export const REPORT_PDF_QUEUE = 'report-pdf-generation';

export interface ReportPdfJobData {
  reportId: number;
  tenantId: number;
  userId: number;
  reportFileId: number;
  fileName: string;
}

export function registerReportWorker(boss: PgBoss): void {
  (boss as any).work(REPORT_PDF_QUEUE, async (job: any) => {
    const jobData = Array.isArray(job) ? job[0] : job;
    const { reportId, tenantId, userId, reportFileId, fileName } = jobData.data;
    const jobId = jobData.id;
    console.log(`[reports.worker] Processing PDF job ${jobId} for report ${reportId}`);
    
    try {
      await db.execute(sql`
        UPDATE report_files SET status = 'processing', updated_at = NOW()
        WHERE id = ${reportFileId} AND tenant_id = ${tenantId}
      `);
      
      const reportResult = await db.execute(sql`
        SELECT 
          gr.name,
          gr.report_type,
          gr.category,
          gr.module,
          gr.results,
          u.username as generated_by,
          t.name as tenant_name
        FROM generated_reports gr
        LEFT JOIN users u ON gr.created_by = u.id
        LEFT JOIN tenants t ON gr.tenant_id = t.id
        WHERE gr.id = ${reportId} AND gr.tenant_id = ${tenantId}
      `);
      
      if (reportResult.rows.length === 0) {
        throw new Error(`Report ${reportId} not found for tenant ${tenantId}`);
      }
      
      const report = reportResult.rows[0] as any;
      
      if (!report.results || (Array.isArray(report.results) && report.results.length === 0)) {
        throw new Error('Report has no data to generate PDF');
      }
      
      let insights: any[] = [];
      try {
        const insightsResult = await db.execute(sql`
          SELECT insights FROM report_insights WHERE report_id = ${reportId}
        `);
        if (insightsResult.rows.length > 0 && (insightsResult.rows[0] as any).insights) {
          insights = (insightsResult.rows[0] as any).insights;
        }
      } catch (e) {
        console.log(`[reports.worker] No insights available for report ${reportId}`);
      }
      
      const pdfData: PdfReportData = {
        reportName: report.name || 'Untitled Report',
        reportType: report.report_type || 'custom',
        category: report.category || 'General',
        module: report.module || 'System',
        generatedBy: report.generated_by || 'System',
        tenantName: report.tenant_name || 'Unknown',
        data: Array.isArray(report.results) ? report.results : [],
        insights,
      };
      
      ensureReportsDir();
      const outputPath = path.join(getReportsDir(), fileName);
      
      const { fileSize } = await generateReportPdf(pdfData, outputPath);
      
      await db.execute(sql`
        UPDATE report_files 
        SET 
          status = 'completed',
          file_size = ${fileSize},
          file_path = ${outputPath},
          expires_at = NOW() + INTERVAL '7 days',
          updated_at = NOW()
        WHERE id = ${reportFileId} AND tenant_id = ${tenantId}
      `);
      
      console.log(`[reports.worker] PDF generated successfully: ${fileName} (${fileSize} bytes)`);
    } catch (error: any) {
      console.error(`[reports.worker] PDF generation failed for job ${jobId}:`, error);
      
      await db.execute(sql`
        UPDATE report_files 
        SET 
          status = 'failed',
          error_message = ${error.message || 'Unknown error'},
          updated_at = NOW()
        WHERE id = ${reportFileId} AND tenant_id = ${tenantId}
      `);
      
      throw error;
    }
  });
  
  console.log(`[reports.worker] Registered worker for queue: ${REPORT_PDF_QUEUE}`);
}
