import { db, executeQuery } from './db';
import { and, eq } from 'drizzle-orm';
import { 
  quotationMaterials, 
  quotationManufacturing, 
  quotationOtherCosts 
} from '@shared/schema';

// Add these methods to the DatabaseStorage class

export async function deleteAllQuotationMaterials(quotationId: number, tenantId: number): Promise<boolean> {
  return await executeQuery(async () => {
    const result = await db.delete(quotationMaterials)
      .where(and(
        eq(quotationMaterials.quotationId, quotationId),
        eq(quotationMaterials.tenantId, tenantId)
      ));
    return true; // Return true even if no records were deleted
  });
}

export async function deleteAllQuotationManufacturing(quotationId: number, tenantId: number): Promise<boolean> {
  return await executeQuery(async () => {
    const result = await db.delete(quotationManufacturing)
      .where(and(
        eq(quotationManufacturing.quotationId, quotationId),
        eq(quotationManufacturing.tenantId, tenantId)
      ));
    return true; // Return true even if no records were deleted
  });
}

export async function deleteAllQuotationOtherCosts(quotationId: number, tenantId: number): Promise<boolean> {
  return await executeQuery(async () => {
    const result = await db.delete(quotationOtherCosts)
      .where(and(
        eq(quotationOtherCosts.quotationId, quotationId),
        eq(quotationOtherCosts.tenantId, tenantId)
      ));
    return true; // Return true even if no records were deleted
  });
}