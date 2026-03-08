import { Router, Request, Response } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../../db";
import {
  orderDeliveries,
  orderDeliveryLines,
  orders,
  styleComponents,
  styleColorways,
  styleBoms,
  styleBomLines,
} from "@shared/schema";
import { requirePermission } from "../../middleware/rbacMiddleware";

const deliveryRoutes = Router({ mergeParams: true });

// GET /api/orders/:orderId/deliveries — List all deliveries for an order
deliveryRoutes.get("/", requirePermission('sales:sales_order:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const orderId = Number(req.params.orderId);
    if (isNaN(orderId)) return res.status(400).json({ message: "Invalid order ID" });

    const results = await db.execute(sql`
      SELECT d.*,
        (SELECT COUNT(*)::int FROM order_delivery_lines WHERE order_delivery_id = d.id) as line_count,
        (SELECT COALESCE(SUM(net_qty), 0)::int FROM order_delivery_lines WHERE order_delivery_id = d.id) as total_qty
      FROM order_deliveries d
      WHERE d.tenant_id = ${tenantId} AND d.order_id = ${orderId}
      ORDER BY d.delivery_no
    `);

    res.json(results.rows);
  } catch (error) {
    console.error("Error fetching deliveries:", error);
    res.status(500).json({ message: "Failed to fetch deliveries" });
  }
});

// POST /api/orders/:orderId/deliveries — Create a new delivery
deliveryRoutes.post("/", requirePermission('sales:sales_order:create'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const orderId = Number(req.params.orderId);
    if (isNaN(orderId)) return res.status(400).json({ message: "Invalid order ID" });

    const order = await db.select().from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
      .limit(1);

    if (order.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    const maxResult = await db.execute(sql`
      SELECT COALESCE(MAX(delivery_no), 0) + 1 as next_no
      FROM order_deliveries
      WHERE tenant_id = ${tenantId} AND order_id = ${orderId}
    `);
    const nextDeliveryNo = Number(maxResult.rows[0]?.next_no) || 1;

    const { exFactoryDate, shipDate, destination, incoterm, remarks, status } = req.body;

    const [created] = await db.insert(orderDeliveries).values({
      tenantId,
      orderId,
      deliveryNo: nextDeliveryNo,
      exFactoryDate: exFactoryDate || null,
      shipDate: shipDate || null,
      destination: destination || null,
      incoterm: incoterm || null,
      remarks: remarks || null,
      status: status || "PLANNED",
    }).returning();

    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating delivery:", error);
    res.status(500).json({ message: "Failed to create delivery" });
  }
});

// GET /api/orders/:orderId/deliveries/:id — Get delivery with its lines
deliveryRoutes.get("/:id", requirePermission('sales:sales_order:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const orderId = Number(req.params.orderId);
    const deliveryId = Number(req.params.id);
    if (isNaN(orderId) || isNaN(deliveryId)) return res.status(400).json({ message: "Invalid ID" });

    const [delivery] = await db.select().from(orderDeliveries)
      .where(and(
        eq(orderDeliveries.id, deliveryId),
        eq(orderDeliveries.tenantId, tenantId),
        eq(orderDeliveries.orderId, orderId),
      ));

    if (!delivery) return res.status(404).json({ message: "Delivery not found" });

    const lines = await db.execute(sql`
      SELECT odl.*,
        sc.name as component_name,
        scw.color_name as colorway_name
      FROM order_delivery_lines odl
      LEFT JOIN style_components sc ON sc.id = odl.component_id
      LEFT JOIN style_colorways scw ON scw.id = odl.colorway_id
      WHERE odl.order_delivery_id = ${deliveryId} AND odl.tenant_id = ${tenantId}
      ORDER BY odl.id
    `);

    res.json({ ...delivery, lines: lines.rows });
  } catch (error) {
    console.error("Error fetching delivery:", error);
    res.status(500).json({ message: "Failed to fetch delivery" });
  }
});

// PUT /api/orders/:orderId/deliveries/:id — Update delivery header
deliveryRoutes.put("/:id", requirePermission('sales:sales_order:edit'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const orderId = Number(req.params.orderId);
    const deliveryId = Number(req.params.id);
    if (isNaN(orderId) || isNaN(deliveryId)) return res.status(400).json({ message: "Invalid ID" });

    const [existing] = await db.select().from(orderDeliveries)
      .where(and(
        eq(orderDeliveries.id, deliveryId),
        eq(orderDeliveries.tenantId, tenantId),
        eq(orderDeliveries.orderId, orderId),
      ));

    if (!existing) return res.status(404).json({ message: "Delivery not found" });

    const { exFactoryDate, shipDate, destination, incoterm, remarks, status } = req.body;

    const updateData: Record<string, any> = {};
    if (exFactoryDate !== undefined) updateData.exFactoryDate = exFactoryDate;
    if (shipDate !== undefined) updateData.shipDate = shipDate;
    if (destination !== undefined) updateData.destination = destination;
    if (incoterm !== undefined) updateData.incoterm = incoterm;
    if (remarks !== undefined) updateData.remarks = remarks;
    if (status !== undefined) updateData.status = status;
    updateData.updatedAt = new Date();

    const [updated] = await db.update(orderDeliveries)
      .set(updateData)
      .where(and(
        eq(orderDeliveries.id, deliveryId),
        eq(orderDeliveries.tenantId, tenantId),
      ))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error updating delivery:", error);
    res.status(500).json({ message: "Failed to update delivery" });
  }
});

// DELETE /api/orders/:orderId/deliveries/:id — Delete delivery (cascade deletes lines)
deliveryRoutes.delete("/:id", requirePermission('sales:sales_order:edit'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const orderId = Number(req.params.orderId);
    const deliveryId = Number(req.params.id);
    if (isNaN(orderId) || isNaN(deliveryId)) return res.status(400).json({ message: "Invalid ID" });

    const [existing] = await db.select().from(orderDeliveries)
      .where(and(
        eq(orderDeliveries.id, deliveryId),
        eq(orderDeliveries.tenantId, tenantId),
        eq(orderDeliveries.orderId, orderId),
      ));

    if (!existing) return res.status(404).json({ message: "Delivery not found" });

    await db.delete(orderDeliveries)
      .where(and(
        eq(orderDeliveries.id, deliveryId),
        eq(orderDeliveries.tenantId, tenantId),
      ));

    res.json({ message: "Delivery deleted successfully" });
  } catch (error) {
    console.error("Error deleting delivery:", error);
    res.status(500).json({ message: "Failed to delete delivery" });
  }
});

// GET /api/orders/:orderId/deliveries/:deliveryId/lines — Get lines for a delivery
deliveryRoutes.get("/:deliveryId/lines", requirePermission('sales:sales_order:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const deliveryId = Number(req.params.deliveryId);
    if (isNaN(deliveryId)) return res.status(400).json({ message: "Invalid delivery ID" });

    const lines = await db.execute(sql`
      SELECT odl.*,
        sc.name as component_name,
        scw.color_name as colorway_name
      FROM order_delivery_lines odl
      LEFT JOIN style_components sc ON sc.id = odl.component_id
      LEFT JOIN style_colorways scw ON scw.id = odl.colorway_id
      WHERE odl.order_delivery_id = ${deliveryId} AND odl.tenant_id = ${tenantId}
      ORDER BY odl.id
    `);

    res.json(lines.rows);
  } catch (error) {
    console.error("Error fetching delivery lines:", error);
    res.status(500).json({ message: "Failed to fetch delivery lines" });
  }
});

// POST /api/orders/:orderId/deliveries/:deliveryId/lines — Add/replace lines (bulk upsert)
deliveryRoutes.post("/:deliveryId/lines", requirePermission('sales:sales_order:create'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const orderId = Number(req.params.orderId);
    const deliveryId = Number(req.params.deliveryId);
    if (isNaN(orderId) || isNaN(deliveryId)) return res.status(400).json({ message: "Invalid ID" });

    const [delivery] = await db.select().from(orderDeliveries)
      .where(and(
        eq(orderDeliveries.id, deliveryId),
        eq(orderDeliveries.tenantId, tenantId),
        eq(orderDeliveries.orderId, orderId),
      ));
    if (!delivery) return res.status(404).json({ message: "Delivery not found" });

    const [order] = await db.select().from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));
    if (!order) return res.status(404).json({ message: "Order not found" });

    const { lines } = req.body;
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: "Lines array is required and must not be empty" });
    }

    for (const line of lines) {
      if (!line.qty || line.qty <= 0) {
        return res.status(400).json({ message: "Each line must have qty > 0" });
      }
      if (!line.styleId) {
        return res.status(400).json({ message: "Each line must have a styleId" });
      }
      if (!line.size) {
        return res.status(400).json({ message: "Each line must have a size" });
      }
      if (order.styleId && line.styleId !== order.styleId) {
        return res.status(400).json({ message: `styleId ${line.styleId} does not match order style ${order.styleId}` });
      }

      if (line.componentId) {
        const [comp] = await db.select().from(styleComponents)
          .where(and(
            eq(styleComponents.id, line.componentId),
            eq(styleComponents.styleId, line.styleId),
            eq(styleComponents.tenantId, tenantId),
          ));
        if (!comp) return res.status(400).json({ message: `Component ${line.componentId} does not belong to style ${line.styleId}` });
      }

      if (line.colorwayId) {
        const [cw] = await db.select().from(styleColorways)
          .where(and(
            eq(styleColorways.id, line.colorwayId),
            eq(styleColorways.styleId, line.styleId),
            eq(styleColorways.tenantId, tenantId),
          ));
        if (!cw) return res.status(400).json({ message: `Colorway ${line.colorwayId} does not belong to style ${line.styleId}` });
      }
    }

    const insertValues = lines.map((line: any) => {
      const packType = line.packType || "SINGLE";
      const pcsPerPack = line.pcsPerPack || 1;
      const netQty = packType === "PACK" ? line.qty * pcsPerPack : line.qty;

      return {
        tenantId,
        orderDeliveryId: deliveryId,
        styleId: line.styleId,
        componentId: line.componentId || null,
        colorwayId: line.colorwayId || null,
        size: line.size,
        qty: line.qty,
        packType,
        pcsPerPack,
        netQty,
      };
    });

    await db.transaction(async (tx) => {
      await tx.delete(orderDeliveryLines)
        .where(and(
          eq(orderDeliveryLines.orderDeliveryId, deliveryId),
          eq(orderDeliveryLines.tenantId, tenantId),
        ));

      await tx.insert(orderDeliveryLines).values(insertValues);
    });

    const inserted = await db.select().from(orderDeliveryLines)
      .where(and(
        eq(orderDeliveryLines.orderDeliveryId, deliveryId),
        eq(orderDeliveryLines.tenantId, tenantId),
      ));

    res.status(201).json(inserted);
  } catch (error) {
    console.error("Error upserting delivery lines:", error);
    res.status(500).json({ message: "Failed to upsert delivery lines" });
  }
});

// PUT /api/orders/:orderId/deliveries/:deliveryId/lines/:id — Update a single line
deliveryRoutes.put("/:deliveryId/lines/:id", requirePermission('sales:sales_order:edit'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const lineId = Number(req.params.id);
    const deliveryId = Number(req.params.deliveryId);
    if (isNaN(lineId) || isNaN(deliveryId)) return res.status(400).json({ message: "Invalid ID" });

    const [existing] = await db.select().from(orderDeliveryLines)
      .where(and(
        eq(orderDeliveryLines.id, lineId),
        eq(orderDeliveryLines.orderDeliveryId, deliveryId),
        eq(orderDeliveryLines.tenantId, tenantId),
      ));
    if (!existing) return res.status(404).json({ message: "Line not found" });

    const { styleId, componentId, colorwayId, size, qty, packType, pcsPerPack } = req.body;

    const updateData: Record<string, any> = {};
    if (styleId !== undefined) updateData.styleId = styleId;
    if (componentId !== undefined) updateData.componentId = componentId;
    if (colorwayId !== undefined) updateData.colorwayId = colorwayId;
    if (size !== undefined) updateData.size = size;
    if (qty !== undefined) updateData.qty = qty;
    if (packType !== undefined) updateData.packType = packType;
    if (pcsPerPack !== undefined) updateData.pcsPerPack = pcsPerPack;

    const finalQty = qty ?? existing.qty;
    const finalPackType = packType ?? existing.packType;
    const finalPcsPerPack = pcsPerPack ?? existing.pcsPerPack;
    updateData.netQty = finalPackType === "PACK" ? finalQty * (finalPcsPerPack || 1) : finalQty;
    updateData.updatedAt = new Date();

    const [updated] = await db.update(orderDeliveryLines)
      .set(updateData)
      .where(and(
        eq(orderDeliveryLines.id, lineId),
        eq(orderDeliveryLines.tenantId, tenantId),
      ))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("Error updating delivery line:", error);
    res.status(500).json({ message: "Failed to update delivery line" });
  }
});

// DELETE /api/orders/:orderId/deliveries/:deliveryId/lines/:id — Delete a single line
deliveryRoutes.delete("/:deliveryId/lines/:id", requirePermission('sales:sales_order:edit'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const lineId = Number(req.params.id);
    const deliveryId = Number(req.params.deliveryId);
    if (isNaN(lineId) || isNaN(deliveryId)) return res.status(400).json({ message: "Invalid ID" });

    const [existing] = await db.select().from(orderDeliveryLines)
      .where(and(
        eq(orderDeliveryLines.id, lineId),
        eq(orderDeliveryLines.orderDeliveryId, deliveryId),
        eq(orderDeliveryLines.tenantId, tenantId),
      ));
    if (!existing) return res.status(404).json({ message: "Line not found" });

    await db.delete(orderDeliveryLines)
      .where(and(
        eq(orderDeliveryLines.id, lineId),
        eq(orderDeliveryLines.tenantId, tenantId),
      ));

    res.json({ message: "Line deleted successfully" });
  } catch (error) {
    console.error("Error deleting delivery line:", error);
    res.status(500).json({ message: "Failed to delete delivery line" });
  }
});

export default deliveryRoutes;

export const orderDeliveryExtras = Router({ mergeParams: true });

// GET /api/orders/:orderId/demand-summary
orderDeliveryExtras.get("/demand-summary", requirePermission('sales:sales_order:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const orderId = Number(req.params.orderId);
    if (isNaN(orderId)) return res.status(400).json({ message: "Invalid order ID" });

    const results = await db.execute(sql`
      SELECT
        sbl.item_id, sbl.item_description, sbl.uom, sbl.category,
        SUM(odl.net_qty * sbl.base_consumption::numeric) as total_required_qty,
        SUM(odl.net_qty * sbl.base_consumption::numeric * COALESCE(sbl.wastage_pct::numeric, 0) / 100) as wastage_qty
      FROM order_delivery_lines odl
      JOIN style_bom_lines sbl ON sbl.style_bom_id = (
        SELECT sb.id FROM style_boms sb
        WHERE sb.style_id = odl.style_id AND sb.status IN ('APPROVED', 'LOCKED')
        ORDER BY sb.version_no DESC LIMIT 1
      )
      WHERE odl.order_delivery_id IN (
        SELECT id FROM order_deliveries WHERE order_id = ${orderId} AND tenant_id = ${tenantId}
      )
      GROUP BY sbl.item_id, sbl.item_description, sbl.uom, sbl.category
    `);

    if (results.rows.length === 0) {
      return res.json({
        data: [],
        note: "No approved or locked BOM found for the order style, or no delivery lines exist."
      });
    }

    res.json({ data: results.rows });
  } catch (error) {
    console.error("Error fetching demand summary:", error);
    res.status(500).json({ message: "Failed to fetch demand summary" });
  }
});

// GET /api/orders/:orderId/breakdown-matrix
orderDeliveryExtras.get("/breakdown-matrix", requirePermission('sales:sales_order:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const orderId = Number(req.params.orderId);
    if (isNaN(orderId)) return res.status(400).json({ message: "Invalid order ID" });

    const deliveries = await db.select().from(orderDeliveries)
      .where(and(eq(orderDeliveries.tenantId, tenantId), eq(orderDeliveries.orderId, orderId)))
      .orderBy(orderDeliveries.deliveryNo);

    const allLines = await db.execute(sql`
      SELECT odl.*,
        sc.name as component_name,
        scw.color_name as colorway_name
      FROM order_delivery_lines odl
      LEFT JOIN style_components sc ON sc.id = odl.component_id
      LEFT JOIN style_colorways scw ON scw.id = odl.colorway_id
      WHERE odl.order_delivery_id IN (
        SELECT id FROM order_deliveries WHERE order_id = ${orderId} AND tenant_id = ${tenantId}
      )
      AND odl.tenant_id = ${tenantId}
      ORDER BY odl.id
    `);

    const linesByDelivery: Record<number, any[]> = {};
    const totalsByComponent: Record<string, number> = {};
    const totalsByColorway: Record<string, number> = {};
    const totalsBySize: Record<string, number> = {};
    let grandTotal = 0;

    for (const line of allLines.rows as any[]) {
      const dId = line.order_delivery_id;
      if (!linesByDelivery[dId]) linesByDelivery[dId] = [];
      linesByDelivery[dId].push(line);

      const netQty = Number(line.net_qty) || 0;
      grandTotal += netQty;

      const compKey = line.component_name || "No Component";
      totalsByComponent[compKey] = (totalsByComponent[compKey] || 0) + netQty;

      const cwKey = line.colorway_name || "No Colorway";
      totalsByColorway[cwKey] = (totalsByColorway[cwKey] || 0) + netQty;

      const sizeKey = line.size || "Unknown";
      totalsBySize[sizeKey] = (totalsBySize[sizeKey] || 0) + netQty;
    }

    const result = {
      deliveries: deliveries.map(d => ({
        deliveryNo: d.deliveryNo,
        exFactoryDate: d.exFactoryDate,
        status: d.status,
        lines: linesByDelivery[d.id] || [],
      })),
      totals: {
        byComponent: totalsByComponent,
        byColorway: totalsByColorway,
        bySize: totalsBySize,
        grand: grandTotal,
      },
    };

    res.json(result);
  } catch (error) {
    console.error("Error fetching breakdown matrix:", error);
    res.status(500).json({ message: "Failed to fetch breakdown matrix" });
  }
});
