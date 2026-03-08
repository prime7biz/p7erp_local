import { db } from '../db';
import { sql } from 'drizzle-orm';

interface NumberGeneratorOptions {
  prefix: string;
  tableName: string;
  columnName: string;
  tenantId: number;
  includeDate?: boolean;
  separator?: string;
}

export async function generateDocumentNumber(
  options: NumberGeneratorOptions,
  maxRetries = 5
): Promise<string> {
  const {
    prefix,
    tenantId,
    includeDate = true,
    separator = '-',
  } = options;

  const period = includeDate
    ? new Date().toISOString().slice(0, 7).replace('-', '')
    : 'ALL';
  const docType = prefix;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await db.execute(sql`
        INSERT INTO document_sequences (tenant_id, doc_type, period, last_sequence, updated_at)
        VALUES (${tenantId}, ${docType}, ${period}, 1, NOW())
        ON CONFLICT (tenant_id, doc_type, period)
        DO UPDATE SET last_sequence = document_sequences.last_sequence + 1, updated_at = NOW()
        RETURNING last_sequence
      `);

      const seq = (result.rows?.[0] as any)?.last_sequence || 1;
      const seqStr = String(seq).padStart(3, '0');

      const newNumber = includeDate
        ? `${prefix}${separator}${period}${separator}${seqStr}`
        : `${prefix}${separator}${seqStr}`;

      return newNumber;
    } catch (error: any) {
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `Failed to generate unique document number after ${maxRetries} attempts`
  );
}
