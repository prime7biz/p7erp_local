import { db } from "../../db";
import { goodsReceivingNotes, grnItems, vendors, warehouses, items, itemUnits, purchaseOrderItems, itemStock, stockGroups } from "@shared/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";

export const grnStorage = {
  async getAllGRNs(tenantId: number, filters?: { status?: string; vendorId?: number; startDate?: string; endDate?: string }) {
    const conditions: any[] = [eq(goodsReceivingNotes.tenantId, tenantId)];
    if (filters?.status) conditions.push(eq(goodsReceivingNotes.status, filters.status));
    if (filters?.vendorId) conditions.push(eq(goodsReceivingNotes.vendorId, filters.vendorId));
    if (filters?.startDate) conditions.push(gte(goodsReceivingNotes.receivingDate, filters.startDate));
    if (filters?.endDate) conditions.push(lte(goodsReceivingNotes.receivingDate, filters.endDate));

    const results = await db
      .select({
        grn: goodsReceivingNotes,
        vendorName: vendors.vendorName,
        warehouseName: warehouses.name,
      })
      .from(goodsReceivingNotes)
      .leftJoin(vendors, eq(goodsReceivingNotes.vendorId, vendors.id))
      .leftJoin(warehouses, eq(goodsReceivingNotes.warehouseId, warehouses.id))
      .where(and(...conditions))
      .orderBy(desc(goodsReceivingNotes.createdAt));

    return results.map((r) => ({ ...r.grn, vendorName: r.vendorName, warehouseName: r.warehouseName }));
  },

  async getGRNById(id: number, tenantId: number) {
    const [grn] = await db
      .select({
        grn: goodsReceivingNotes,
        vendorName: vendors.vendorName,
        warehouseName: warehouses.name,
      })
      .from(goodsReceivingNotes)
      .leftJoin(vendors, eq(goodsReceivingNotes.vendorId, vendors.id))
      .leftJoin(warehouses, eq(goodsReceivingNotes.warehouseId, warehouses.id))
      .where(and(eq(goodsReceivingNotes.id, id), eq(goodsReceivingNotes.tenantId, tenantId)));

    if (!grn) return undefined;

    const grnItemsList = await db
      .select({
        grnItem: grnItems,
        itemName: items.name,
        itemCode: items.itemCode,
        unitName: itemUnits.name,
      })
      .from(grnItems)
      .leftJoin(items, eq(grnItems.itemId, items.id))
      .leftJoin(itemUnits, eq(grnItems.unitId, itemUnits.id))
      .where(eq(grnItems.grnId, id))
      .orderBy(grnItems.id);

    return {
      ...grn.grn,
      vendorName: grn.vendorName,
      warehouseName: grn.warehouseName,
      items: grnItemsList.map((i) => ({ ...i.grnItem, itemName: i.itemName, itemCode: i.itemCode, unitName: i.unitName })),
    };
  },

  async getNextGrnNumber(tenantId: number) {
    const result = await db
      .select({ grnNumber: goodsReceivingNotes.grnNumber })
      .from(goodsReceivingNotes)
      .where(eq(goodsReceivingNotes.tenantId, tenantId))
      .orderBy(desc(goodsReceivingNotes.id))
      .limit(1);

    if (result.length === 0) return "GRN-00001";

    const lastNumber = result[0].grnNumber;
    const numPart = parseInt(lastNumber.replace("GRN-", ""), 10);
    return `GRN-${String(numPart + 1).padStart(5, "0")}`;
  },

  async createGRN(data: any, tenantId: number) {
    const [result] = await db
      .insert(goodsReceivingNotes)
      .values({ ...data, tenantId })
      .returning();
    return result;
  },

  async updateGRN(id: number, data: any, tenantId: number) {
    const [result] = await db
      .update(goodsReceivingNotes)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(goodsReceivingNotes.id, id), eq(goodsReceivingNotes.tenantId, tenantId)))
      .returning();
    return result;
  },

  async validateGLAccountsForGRN(grnId: number, tenantId: number): Promise<{ valid: boolean; errors: string[] }> {
    const grnItemsList = await db
      .select({
        itemId: grnItems.itemId,
        itemName: items.name,
        stockGroupId: items.stockGroupId,
      })
      .from(grnItems)
      .leftJoin(items, eq(grnItems.itemId, items.id))
      .where(eq(grnItems.grnId, grnId));

    const errors: string[] = [];
    const checkedGroups = new Map<number, { name: string; hasInventory: boolean; hasCogs: boolean }>();

    for (const item of grnItemsList) {
      if (!item.stockGroupId) {
        errors.push(`Item '${item.itemName || `ID ${item.itemId}`}' is not assigned to any Stock Group. Assign a Stock Group in Inventory > Items.`);
        continue;
      }

      if (checkedGroups.has(item.stockGroupId)) {
        const cached = checkedGroups.get(item.stockGroupId)!;
        if (!cached.hasInventory || !cached.hasCogs) {
          const missing = [];
          if (!cached.hasInventory) missing.push("Inventory");
          if (!cached.hasCogs) missing.push("COGS");
          errors.push(`Cannot complete GRN: Stock Group '${cached.name}' missing ${missing.join("/")} GL accounts. Configure in Inventory > Stock Groups.`);
        }
        continue;
      }

      const [sg] = await db
        .select({
          id: stockGroups.id,
          name: stockGroups.name,
          inventoryAccountId: stockGroups.inventoryAccountId,
          cogsAccountId: stockGroups.cogsAccountId,
        })
        .from(stockGroups)
        .where(eq(stockGroups.id, item.stockGroupId));

      if (!sg) {
        errors.push(`Item '${item.itemName || `ID ${item.itemId}`}' references Stock Group ID ${item.stockGroupId} which does not exist.`);
        checkedGroups.set(item.stockGroupId, { name: `ID ${item.stockGroupId}`, hasInventory: false, hasCogs: false });
        continue;
      }

      const hasInventory = !!sg.inventoryAccountId;
      const hasCogs = !!sg.cogsAccountId;
      checkedGroups.set(item.stockGroupId, { name: sg.name, hasInventory, hasCogs });

      if (!hasInventory || !hasCogs) {
        const missing = [];
        if (!hasInventory) missing.push("Inventory");
        if (!hasCogs) missing.push("COGS");
        errors.push(`Cannot complete GRN: Stock Group '${sg.name}' missing ${missing.join("/")} GL accounts. Configure in Inventory > Stock Groups.`);
      }
    }

    const uniqueErrors = [...new Set(errors)];
    return { valid: uniqueErrors.length === 0, errors: uniqueErrors };
  },

  async completeGRN(id: number, tenantId: number) {
    const grn = await this.getGRNById(id, tenantId);
    if (!grn) throw new Error("GRN not found");
    if (grn.status === "completed") throw new Error("GRN is already completed");

    const glValidation = await this.validateGLAccountsForGRN(id, tenantId);
    if (!glValidation.valid) {
      throw new Error(glValidation.errors.join(" | "));
    }

    const grnItemsList = await db
      .select()
      .from(grnItems)
      .where(eq(grnItems.grnId, id));

    for (const item of grnItemsList) {
      const acceptedQty = parseFloat(item.acceptedQuantity || item.receivedQuantity || "0");

      const [existingStock] = await db
        .select()
        .from(itemStock)
        .where(
          and(
            eq(itemStock.itemId, item.itemId),
            eq(itemStock.warehouseId, grn.warehouseId),
            eq(itemStock.tenantId, tenantId),
          ),
        );

      if (existingStock) {
        const newQty = parseFloat(existingStock.quantity || "0") + acceptedQty;
        const newAvailable = parseFloat(existingStock.availableQuantity || "0") + acceptedQty;
        await db
          .update(itemStock)
          .set({
            quantity: String(newQty),
            availableQuantity: String(newAvailable),
            unitCost: item.unitCost,
            updatedAt: new Date(),
          })
          .where(eq(itemStock.id, existingStock.id));
      } else {
        await db.insert(itemStock).values({
          itemId: item.itemId,
          variantId: item.variantId,
          warehouseId: grn.warehouseId,
          quantity: String(acceptedQty),
          availableQuantity: String(acceptedQty),
          unitCost: item.unitCost,
          tenantId,
        });
      }

      if (item.purchaseOrderItemId) {
        const [poItem] = await db
          .select()
          .from(purchaseOrderItems)
          .where(eq(purchaseOrderItems.id, item.purchaseOrderItemId));

        if (poItem) {
          const newReceived = parseFloat(poItem.receivedQuantity || "0") + acceptedQty;
          await db
            .update(purchaseOrderItems)
            .set({
              receivedQuantity: String(newReceived),
            })
            .where(eq(purchaseOrderItems.id, item.purchaseOrderItemId));
        }
      }
    }

    const [result] = await db
      .update(goodsReceivingNotes)
      .set({ status: "completed", updatedAt: new Date() })
      .where(and(eq(goodsReceivingNotes.id, id), eq(goodsReceivingNotes.tenantId, tenantId)))
      .returning();

    return result;
  },

  async createGRNItem(data: any) {
    const [result] = await db.insert(grnItems).values(data).returning();
    return result;
  },

  async updateGRNItem(id: number, data: any) {
    const [result] = await db
      .update(grnItems)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(grnItems.id, id))
      .returning();
    return result;
  },

  async deleteGRNItem(id: number) {
    await db.delete(grnItems).where(eq(grnItems.id, id));
    return true;
  },

  async getGRNItems(grnId: number, tenantId: number) {
    return await db
      .select({
        grnItem: grnItems,
        itemName: items.name,
        itemCode: items.itemCode,
        unitName: itemUnits.name,
      })
      .from(grnItems)
      .leftJoin(items, eq(grnItems.itemId, items.id))
      .leftJoin(itemUnits, eq(grnItems.unitId, itemUnits.id))
      .where(and(eq(grnItems.grnId, grnId), eq(grnItems.tenantId, tenantId)));
  },
};
