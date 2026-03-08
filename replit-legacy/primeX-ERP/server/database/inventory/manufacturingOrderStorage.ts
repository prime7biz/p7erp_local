import { db } from "../../db";
import { manufacturingOrders, manufacturingStages, items, itemUnits, processingUnits } from "@shared/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";

export const manufacturingOrderStorage = {
  async getAllManufacturingOrders(tenantId: number, filters?: { status?: string; startDate?: string; endDate?: string }) {
    const conditions: any[] = [eq(manufacturingOrders.tenantId, tenantId)];
    if (filters?.status) conditions.push(eq(manufacturingOrders.status, filters.status));
    if (filters?.startDate) conditions.push(gte(manufacturingOrders.plannedStartDate, filters.startDate));
    if (filters?.endDate) conditions.push(lte(manufacturingOrders.plannedEndDate, filters.endDate));

    const results = await db
      .select({
        mo: manufacturingOrders,
        itemName: items.name,
        itemCode: items.itemCode,
      })
      .from(manufacturingOrders)
      .leftJoin(items, eq(manufacturingOrders.finishedItemId, items.id))
      .where(and(...conditions))
      .orderBy(desc(manufacturingOrders.createdAt));

    return results.map((r) => ({ ...r.mo, itemName: r.itemName, itemCode: r.itemCode }));
  },

  async getManufacturingOrderById(id: number, tenantId: number) {
    const [mo] = await db
      .select({
        mo: manufacturingOrders,
        itemName: items.name,
        itemCode: items.itemCode,
      })
      .from(manufacturingOrders)
      .leftJoin(items, eq(manufacturingOrders.finishedItemId, items.id))
      .where(and(eq(manufacturingOrders.id, id), eq(manufacturingOrders.tenantId, tenantId)));

    if (!mo) return undefined;

    const stages = await db
      .select({
        stage: manufacturingStages,
        processingUnitName: processingUnits.name,
      })
      .from(manufacturingStages)
      .leftJoin(processingUnits, eq(manufacturingStages.processingUnitId, processingUnits.id))
      .where(eq(manufacturingStages.manufacturingOrderId, id))
      .orderBy(manufacturingStages.stageNumber);

    return {
      ...mo.mo,
      itemName: mo.itemName,
      itemCode: mo.itemCode,
      stages: stages.map((s) => ({ ...s.stage, processingUnitName: s.processingUnitName })),
    };
  },

  async getNextMoNumber(tenantId: number) {
    const result = await db
      .select({ moNumber: manufacturingOrders.moNumber })
      .from(manufacturingOrders)
      .where(eq(manufacturingOrders.tenantId, tenantId))
      .orderBy(desc(manufacturingOrders.id))
      .limit(1);

    if (result.length === 0) return "MO-00001";

    const lastNumber = result[0].moNumber;
    const numPart = parseInt(lastNumber.replace("MO-", ""), 10);
    return `MO-${String(numPart + 1).padStart(5, "0")}`;
  },

  async createManufacturingOrder(data: any, tenantId: number) {
    const [result] = await db
      .insert(manufacturingOrders)
      .values({ ...data, tenantId })
      .returning();
    return result;
  },

  async updateManufacturingOrder(id: number, data: any, tenantId: number) {
    const [result] = await db
      .update(manufacturingOrders)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(manufacturingOrders.id, id), eq(manufacturingOrders.tenantId, tenantId)))
      .returning();
    return result;
  },

  async startManufacturingOrder(id: number, tenantId: number) {
    const [result] = await db
      .update(manufacturingOrders)
      .set({
        status: "in_progress",
        actualStartDate: new Date().toISOString().split("T")[0],
        updatedAt: new Date(),
      })
      .where(and(eq(manufacturingOrders.id, id), eq(manufacturingOrders.tenantId, tenantId)))
      .returning();
    return result;
  },

  async completeManufacturingOrder(id: number, tenantId: number) {
    const stages = await db
      .select()
      .from(manufacturingStages)
      .where(eq(manufacturingStages.manufacturingOrderId, id));

    let totalMaterialCost = 0;
    let totalProcessingCost = 0;
    let totalOverheadCost = 0;
    let totalProcessLoss = 0;

    for (const stage of stages) {
      totalMaterialCost += parseFloat(stage.materialCost || "0");
      totalProcessingCost += parseFloat(stage.processingCost || "0");
      totalOverheadCost += parseFloat(stage.overheadCost || "0");
      totalProcessLoss += parseFloat(stage.processLoss || "0");
    }

    const totalCost = totalMaterialCost + totalProcessingCost + totalOverheadCost;

    const [mo] = await db
      .select()
      .from(manufacturingOrders)
      .where(and(eq(manufacturingOrders.id, id), eq(manufacturingOrders.tenantId, tenantId)));

    const completedQty = parseFloat(mo?.completedQuantity || "0") || parseFloat(mo?.plannedQuantity || "1");
    const costPerUnit = completedQty > 0 ? totalCost / completedQty : 0;
    const plannedQty = parseFloat(mo?.plannedQuantity || "1");
    const processLossPercentage = plannedQty > 0 ? (totalProcessLoss / plannedQty) * 100 : 0;

    const [result] = await db
      .update(manufacturingOrders)
      .set({
        status: "completed",
        actualEndDate: new Date().toISOString().split("T")[0],
        totalMaterialCost: String(totalMaterialCost),
        totalProcessingCost: String(totalProcessingCost),
        totalOverheadCost: String(totalOverheadCost),
        totalCost: String(totalCost),
        costPerUnit: String(costPerUnit),
        totalProcessLoss: String(totalProcessLoss),
        processLossPercentage: String(processLossPercentage),
        updatedAt: new Date(),
      })
      .where(and(eq(manufacturingOrders.id, id), eq(manufacturingOrders.tenantId, tenantId)))
      .returning();

    return result;
  },

  async createManufacturingStage(data: any) {
    const [result] = await db.insert(manufacturingStages).values(data).returning();
    return result;
  },

  async updateManufacturingStage(id: number, data: any) {
    const [result] = await db
      .update(manufacturingStages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(manufacturingStages.id, id))
      .returning();
    return result;
  },

  async completeStage(id: number, tenantId: number) {
    const [stage] = await db
      .select()
      .from(manufacturingStages)
      .where(and(eq(manufacturingStages.id, id), eq(manufacturingStages.tenantId, tenantId)));

    if (!stage) throw new Error("Stage not found");

    const inputQty = parseFloat(stage.inputQuantity || "0");
    const outputQty = parseFloat(stage.outputQuantity || "0");
    const processLoss = inputQty - outputQty;
    const processLossPercentage = inputQty > 0 ? (processLoss / inputQty) * 100 : 0;

    const totalStageCost =
      parseFloat(stage.materialCost || "0") +
      parseFloat(stage.processingCost || "0") +
      parseFloat(stage.overheadCost || "0");

    const [result] = await db
      .update(manufacturingStages)
      .set({
        status: "completed",
        processLoss: String(processLoss),
        processLossPercentage: String(processLossPercentage),
        totalStageCost: String(totalStageCost),
        actualEndDate: new Date().toISOString().split("T")[0],
        updatedAt: new Date(),
      })
      .where(eq(manufacturingStages.id, id))
      .returning();

    return result;
  },

  async getManufacturingStages(moId: number, tenantId: number) {
    return await db
      .select({
        stage: manufacturingStages,
        processingUnitName: processingUnits.name,
      })
      .from(manufacturingStages)
      .leftJoin(processingUnits, eq(manufacturingStages.processingUnitId, processingUnits.id))
      .where(and(eq(manufacturingStages.manufacturingOrderId, moId), eq(manufacturingStages.tenantId, tenantId)))
      .orderBy(manufacturingStages.stageNumber);
  },

  async createDefaultStages(moId: number, tenantId: number) {
    const defaultStages = [
      { stageNumber: 1, stageName: "Yarn Sourcing", stageType: "yarn_sourcing" },
      { stageNumber: 2, stageName: "Knitting", stageType: "knitting" },
      { stageNumber: 3, stageName: "Dyeing", stageType: "dyeing" },
      { stageNumber: 4, stageName: "Printing", stageType: "printing" },
      { stageNumber: 5, stageName: "Cutting", stageType: "cutting" },
      { stageNumber: 6, stageName: "Sewing", stageType: "sewing" },
      { stageNumber: 7, stageName: "Washing", stageType: "washing" },
      { stageNumber: 8, stageName: "Finishing & Packing", stageType: "finishing" },
      { stageNumber: 9, stageName: "Quality Check", stageType: "quality_check" },
    ];

    const createdStages = [];
    for (const stage of defaultStages) {
      const [result] = await db
        .insert(manufacturingStages)
        .values({
          manufacturingOrderId: moId,
          ...stage,
          status: "pending",
          tenantId,
        })
        .returning();
      createdStages.push(result);
    }

    return createdStages;
  },
};
