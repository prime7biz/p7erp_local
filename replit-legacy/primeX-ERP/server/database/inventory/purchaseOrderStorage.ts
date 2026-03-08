import { db } from "../../db";
import { purchaseOrders, purchaseOrderItems, vendors, items, itemUnits, billOfMaterials, bomComponents } from "@shared/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";

export const purchaseOrderStorage = {
  async getAllPurchaseOrders(tenantId: number, filters?: { status?: string; supplierId?: number; startDate?: string; endDate?: string }) {
    const conditions: any[] = [eq(purchaseOrders.tenantId, tenantId)];
    if (filters?.status) conditions.push(eq(purchaseOrders.status, filters.status));
    if (filters?.supplierId) conditions.push(eq(purchaseOrders.supplierId, filters.supplierId));
    if (filters?.startDate) conditions.push(gte(purchaseOrders.orderDate, filters.startDate));
    if (filters?.endDate) conditions.push(lte(purchaseOrders.orderDate, filters.endDate));

    const results = await db
      .select({
        po: purchaseOrders,
        vendorName: vendors.vendorName,
      })
      .from(purchaseOrders)
      .leftJoin(vendors, eq(purchaseOrders.supplierId, vendors.id))
      .where(and(...conditions))
      .orderBy(desc(purchaseOrders.createdAt));

    return results.map((r) => ({ ...r.po, vendorName: r.vendorName }));
  },

  async getPurchaseOrderById(id: number, tenantId: number) {
    const [po] = await db
      .select({
        po: purchaseOrders,
        vendorName: vendors.vendorName,
      })
      .from(purchaseOrders)
      .leftJoin(vendors, eq(purchaseOrders.supplierId, vendors.id))
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)));

    if (!po) return undefined;

    const poItems = await db
      .select({
        item: purchaseOrderItems,
        itemName: items.name,
        itemCode: items.itemCode,
        unitName: itemUnits.name,
      })
      .from(purchaseOrderItems)
      .leftJoin(items, eq(purchaseOrderItems.itemId, items.id))
      .leftJoin(itemUnits, eq(purchaseOrderItems.unitId, itemUnits.id))
      .where(eq(purchaseOrderItems.poId, id))
      .orderBy(purchaseOrderItems.id);

    return {
      ...po.po,
      vendorName: po.vendorName,
      items: poItems.map((i) => ({ ...i.item, itemName: i.itemName, itemCode: i.itemCode, unitName: i.unitName })),
    };
  },

  async getNextPoNumber(tenantId: number) {
    const result = await db
      .select({ poNumber: purchaseOrders.poNumber })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.tenantId, tenantId))
      .orderBy(desc(purchaseOrders.id))
      .limit(1);

    if (result.length === 0) return "PO-00001";

    const lastNumber = result[0].poNumber;
    const numPart = parseInt(lastNumber.replace("PO-", ""), 10);
    return `PO-${String(numPart + 1).padStart(5, "0")}`;
  },

  async createPurchaseOrder(data: any, tenantId: number) {
    const [result] = await db
      .insert(purchaseOrders)
      .values({ ...data, tenantId })
      .returning();
    return result;
  },

  async updatePurchaseOrder(id: number, data: any, tenantId: number) {
    const [result] = await db
      .update(purchaseOrders)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)))
      .returning();
    return result;
  },

  async deletePurchaseOrder(id: number, tenantId: number) {
    const [po] = await db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)));

    if (!po) return false;
    if (po.status !== "draft") throw new Error("Only draft purchase orders can be deleted");

    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.poId, id));
    await db.delete(purchaseOrders).where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)));
    return true;
  },

  async approvePurchaseOrder(id: number, userId: number, tenantId: number) {
    const [result] = await db
      .update(purchaseOrders)
      .set({ status: "approved", approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.tenantId, tenantId)))
      .returning();
    return result;
  },

  async createPurchaseOrderItem(data: any) {
    const [result] = await db.insert(purchaseOrderItems).values(data).returning();
    return result;
  },

  async updatePurchaseOrderItem(id: number, data: any) {
    const [result] = await db
      .update(purchaseOrderItems)
      .set(data)
      .where(eq(purchaseOrderItems.id, id))
      .returning();
    return result;
  },

  async deletePurchaseOrderItem(id: number) {
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.id, id));
    return true;
  },

  async getPurchaseOrderItems(poId: number, tenantId: number) {
    return await db
      .select({
        item: purchaseOrderItems,
        itemName: items.name,
        itemCode: items.itemCode,
        unitName: itemUnits.name,
      })
      .from(purchaseOrderItems)
      .leftJoin(items, eq(purchaseOrderItems.itemId, items.id))
      .leftJoin(itemUnits, eq(purchaseOrderItems.unitId, itemUnits.id))
      .where(and(eq(purchaseOrderItems.poId, poId), eq(purchaseOrderItems.tenantId, tenantId)));
  },

  async generatePOFromBOM(bomId: number, quantity: number, tenantId: number, userId: number) {
    const [bom] = await db
      .select()
      .from(billOfMaterials)
      .where(and(eq(billOfMaterials.id, bomId), eq(billOfMaterials.tenantId, tenantId)));

    if (!bom) throw new Error("BOM not found");

    const components = await db
      .select()
      .from(bomComponents)
      .where(eq(bomComponents.bomId, bomId));

    if (components.length === 0) throw new Error("BOM has no components");

    const poItems = components.map((comp) => {
      const componentQty = parseFloat(comp.quantity || "1");
      const wastage = parseFloat(comp.wastagePercentage || "0");
      const totalQty = componentQty * quantity * (1 + wastage / 100);
      const unitCost = parseFloat(comp.costPerUnit || "0");

      return {
        itemId: comp.componentItemId,
        quantity: String(Math.ceil(totalQty)),
        unitId: comp.unitId,
        unitPrice: comp.costPerUnit || "0",
        lineTotal: String(Math.ceil(totalQty) * unitCost),
        tenantId,
      };
    });

    return poItems;
  },
};
