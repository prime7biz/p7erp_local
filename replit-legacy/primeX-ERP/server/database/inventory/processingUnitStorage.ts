import { db } from "../../db";
import { processingUnits } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export const processingUnitStorage = {
  async getAllProcessingUnits(tenantId: number, filters?: { type?: string; isActive?: boolean }) {
    const conditions: any[] = [eq(processingUnits.tenantId, tenantId)];
    if (filters?.type) conditions.push(eq(processingUnits.type, filters.type));
    if (filters?.isActive !== undefined) conditions.push(eq(processingUnits.isActive, filters.isActive));

    return await db
      .select()
      .from(processingUnits)
      .where(and(...conditions))
      .orderBy(desc(processingUnits.createdAt));
  },

  async getProcessingUnitById(id: number, tenantId: number) {
    const [result] = await db
      .select()
      .from(processingUnits)
      .where(and(eq(processingUnits.id, id), eq(processingUnits.tenantId, tenantId)));
    return result;
  },

  async getNextUnitCode(tenantId: number) {
    const result = await db
      .select({ unitCode: processingUnits.unitCode })
      .from(processingUnits)
      .where(eq(processingUnits.tenantId, tenantId))
      .orderBy(desc(processingUnits.id))
      .limit(1);

    if (result.length === 0) return "PU-001";

    const lastCode = result[0].unitCode;
    const numPart = parseInt(lastCode.replace("PU-", ""), 10);
    return `PU-${String(numPart + 1).padStart(3, "0")}`;
  },

  async createProcessingUnit(data: any, tenantId: number) {
    const [result] = await db
      .insert(processingUnits)
      .values({ ...data, tenantId })
      .returning();
    return result;
  },

  async updateProcessingUnit(id: number, data: any, tenantId: number) {
    const [result] = await db
      .update(processingUnits)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(processingUnits.id, id), eq(processingUnits.tenantId, tenantId)))
      .returning();
    return result;
  },

  async deleteProcessingUnit(id: number, tenantId: number) {
    const [deleted] = await db
      .delete(processingUnits)
      .where(and(eq(processingUnits.id, id), eq(processingUnits.tenantId, tenantId)))
      .returning();
    return !!deleted;
  },

  async getProcessingUnitsByType(type: string, tenantId: number) {
    return await db
      .select()
      .from(processingUnits)
      .where(and(eq(processingUnits.type, type), eq(processingUnits.tenantId, tenantId), eq(processingUnits.isActive, true)))
      .orderBy(processingUnits.name);
  },
};
