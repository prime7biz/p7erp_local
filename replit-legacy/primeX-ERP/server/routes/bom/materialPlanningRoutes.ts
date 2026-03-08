import { Router, Request, Response } from "express";
import { db } from "../../db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { orderBomSnapshotItems, orderBomSnapshots, orders } from "@shared/schema";

const router = Router();

router.get('/requirements', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const { from, to } = req.query;

    let query = db
      .select({
        itemId: orderBomSnapshotItems.itemId,
        itemName: orderBomSnapshotItems.itemName,
        materialType: orderBomSnapshotItems.materialType,
        unitName: orderBomSnapshotItems.unitName,
        totalRequiredQty: sql<string>`SUM(CAST(${orderBomSnapshotItems.totalRequiredQty} AS numeric))`,
        orderCount: sql<number>`COUNT(DISTINCT ${orderBomSnapshots.orderId})`,
      })
      .from(orderBomSnapshotItems)
      .innerJoin(orderBomSnapshots, eq(orderBomSnapshotItems.snapshotId, orderBomSnapshots.id))
      .innerJoin(orders, eq(orderBomSnapshots.orderId, orders.id))
      .where(
        and(
          eq(orderBomSnapshotItems.tenantId, tenantId),
          eq(orderBomSnapshots.isLocked, true),
          ...(from ? [gte(orders.deliveryDate, from as string)] : []),
          ...(to ? [lte(orders.deliveryDate, to as string)] : [])
        )
      )
      .groupBy(
        orderBomSnapshotItems.itemId,
        orderBomSnapshotItems.itemName,
        orderBomSnapshotItems.materialType,
        orderBomSnapshotItems.unitName
      );

    const results = await query;

    return res.json({ success: true, data: results });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error fetching material requirements:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

export default router;
