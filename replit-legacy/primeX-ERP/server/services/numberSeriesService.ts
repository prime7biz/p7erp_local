import { db } from '../db';
import { numberSeries } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { ERPError } from './transactionSafetyService';
import type { NumberSeries } from '@shared/schema';

function getCurrentPeriod(resetPolicy: string, dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  const year = d.getFullYear().toString();
  if (resetPolicy === 'YEARLY') return year;
  if (resetPolicy === 'MONTHLY') return `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return '';
}

function formatNumber(prefix: string, num: number, padding: number): string {
  return `${prefix}${String(num).padStart(padding, '0')}`;
}

export async function generateNextNumber(
  tenantId: number,
  docType: string,
  options?: { requestId?: string; date?: string }
): Promise<string> {
  const [series] = await db.select().from(numberSeries).where(
    and(
      eq(numberSeries.tenantId, tenantId),
      eq(numberSeries.docType, docType),
      eq(numberSeries.isActive, true)
    )
  );

  if (!series) {
    throw new ERPError('CONFIG_INCOMPLETE', `No number series configured for document type: ${docType}`, 400);
  }

  const padding = series.padding ?? 6;
  const resetPolicy = series.resetPolicy ?? 'NEVER';

  if (resetPolicy === 'YEARLY' || resetPolicy === 'MONTHLY') {
    const newPeriod = getCurrentPeriod(resetPolicy, options?.date);
    if (series.currentPeriod !== newPeriod) {
      const [updated] = await db.update(numberSeries)
        .set({
          nextNumber: 2,
          currentPeriod: newPeriod,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(numberSeries.id, series.id),
            eq(numberSeries.tenantId, tenantId)
          )
        )
        .returning();
      return formatNumber(series.prefix, 1, padding);
    }
  }

  const result = await db.execute(
    sql`UPDATE number_series SET next_number = next_number + 1, updated_at = NOW() WHERE id = ${series.id} AND tenant_id = ${tenantId} RETURNING next_number`
  ) as any;

  const rows = result?.rows || result;
  const updated = Array.isArray(rows) ? rows[0] : rows;
  const allocatedNumber = (updated?.next_number ?? series.nextNumber + 1) - 1;
  return formatNumber(series.prefix, allocatedNumber, padding);
}

export async function getNumberSeries(tenantId: number): Promise<NumberSeries[]> {
  return db.select().from(numberSeries).where(eq(numberSeries.tenantId, tenantId));
}

export async function upsertNumberSeries(
  tenantId: number,
  data: { docType: string; prefix: string; padding?: number; resetPolicy?: string }
): Promise<any> {
  const [result] = await db.insert(numberSeries)
    .values({
      tenantId,
      docType: data.docType,
      prefix: data.prefix,
      padding: data.padding ?? 6,
      resetPolicy: data.resetPolicy ?? 'NEVER',
      nextNumber: 1,
    })
    .onConflictDoUpdate({
      target: [numberSeries.tenantId, numberSeries.docType],
      set: {
        prefix: data.prefix,
        padding: data.padding ?? 6,
        resetPolicy: data.resetPolicy ?? 'NEVER',
        updatedAt: new Date(),
      },
    })
    .returning();
  return result;
}

export async function previewNextNumber(tenantId: number, docType: string): Promise<string> {
  const [series] = await db.select().from(numberSeries).where(
    and(
      eq(numberSeries.tenantId, tenantId),
      eq(numberSeries.docType, docType),
      eq(numberSeries.isActive, true)
    )
  );

  if (!series) {
    throw new ERPError('CONFIG_INCOMPLETE', `No number series configured for document type: ${docType}`, 400);
  }

  const padding = series.padding ?? 6;
  const resetPolicy = series.resetPolicy ?? 'NEVER';

  if (resetPolicy === 'YEARLY' || resetPolicy === 'MONTHLY') {
    const newPeriod = getCurrentPeriod(resetPolicy);
    if (series.currentPeriod !== newPeriod) {
      return formatNumber(series.prefix, 1, padding);
    }
  }

  return formatNumber(series.prefix, series.nextNumber, padding);
}
