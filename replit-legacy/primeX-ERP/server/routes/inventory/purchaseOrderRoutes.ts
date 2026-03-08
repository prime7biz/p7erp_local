import { parseIntParam } from "../../utils/parseParams";
import { Router } from "express";
import { purchaseOrderStorage } from "../../database/inventory/purchaseOrderStorage";
import { isAuthenticated } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbacMiddleware";
import { initializeDocumentWorkflow } from "../../services/workflowInstanceService";
import { requireLock } from "../../middleware/lockMiddleware";
import { db } from "../../db";
import { purchaseOrders, purchaseOrderItems } from "@shared/schema";
import { logAudit } from "../../services/auditService";
import { eq, and } from "drizzle-orm";
import { checkIdempotency, saveIdempotencyResult } from "../../services/transactionSafetyService";

const router = Router();

router.use(isAuthenticated);

router.get("/next-number", requirePermission('purchase:purchase_order:read'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const nextNumber = await purchaseOrderStorage.getNextPoNumber(tenantId);
    res.json({ nextNumber });
  } catch (error) {
    console.error("Error getting next PO number:", error);
    res.status(500).json({ message: "Failed to get next PO number" });
  }
});

router.get("/", requirePermission('purchase:purchase_order:read'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const filters = {
      status: req.query.status as string | undefined,
      supplierId: req.query.supplierId ? parseInt(req.query.supplierId as string) : undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    };
    const orders = await purchaseOrderStorage.getAllPurchaseOrders(tenantId, filters);
    res.json(orders);
  } catch (error) {
    console.error("Error fetching purchase orders:", error);
    res.status(500).json({ message: "Failed to fetch purchase orders" });
  }
});

router.get("/:id", requirePermission('purchase:purchase_order:read'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const order = await purchaseOrderStorage.getPurchaseOrderById(id, tenantId);
    if (!order) {
      return res.status(404).json({ message: "Purchase order not found" });
    }
    res.json(order);
  } catch (error) {
    console.error("Error fetching purchase order:", error);
    res.status(500).json({ message: "Failed to fetch purchase order" });
  }
});

router.post("/", requirePermission('purchase:purchase_order:create'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { items: itemsData, ...headerData } = req.body;

    const requestId = req.headers['x-request-id'] as string | undefined;
    if (requestId) {
      const idempotencyResult = await checkIdempotency(tenantId, requestId, 'CREATE_PO');
      if (idempotencyResult.exists) {
        return res.status(idempotencyResult.statusCode || 200).json(idempotencyResult.cachedResponse);
      }
    }

    if (headerData.poNumber) {
      const [existing] = await db.select({ id: purchaseOrders.id })
        .from(purchaseOrders)
        .where(and(
          eq(purchaseOrders.tenantId, tenantId),
          eq(purchaseOrders.poNumber, headerData.poNumber)
        ));
      if (existing) {
        return res.status(409).json({ message: `Purchase order number '${headerData.poNumber}' already exists` });
      }
    }

    const orderId = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(purchaseOrders)
        .values({ ...headerData, createdBy: userId, tenantId })
        .returning();

      if (itemsData && Array.isArray(itemsData)) {
        for (const item of itemsData) {
          await tx.insert(purchaseOrderItems).values({
            ...item,
            poId: order.id,
            tenantId,
          });
        }
      }

      return order.id;
    });

    const fullOrder = await purchaseOrderStorage.getPurchaseOrderById(orderId, tenantId);

    logAudit({ tenantId, entityType: 'purchase_order', entityId: orderId, action: 'CREATE', performedBy: userId, newValues: { poNumber: headerData.poNumber, supplierId: headerData.supplierId, totalAmount: headerData.totalAmount }, ipAddress: req.ip, userAgent: req.headers['user-agent'] as string });

    let workflowWarning: string | undefined;
    try {
      await initializeDocumentWorkflow(tenantId, 'purchase_order', orderId);
    } catch (wfError: any) {
      workflowWarning = `Workflow initialization failed: ${wfError.message || 'Unknown error'}`;
      console.warn(`[PO ${orderId}] ${workflowWarning}`, wfError);
    }

    const response: any = { ...fullOrder };
    if (workflowWarning) {
      response._warnings = [workflowWarning];
    }

    if (requestId) {
      await saveIdempotencyResult(tenantId, requestId, 'CREATE_PO', String(orderId), 201, response);
    }

    res.status(201).json(response);
  } catch (error: any) {
    console.error("Error creating purchase order:", error);
    if (error?.code === '23505' || error?.constraint?.includes('tenant_po_number')) {
      return res.status(409).json({ message: "Duplicate purchase order number. Please use a unique PO number." });
    }
    res.status(500).json({ message: "Failed to create purchase order" });
  }
});

router.put("/:id", requirePermission('purchase:purchase_order:edit'), requireLock('purchase_order'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const order = await purchaseOrderStorage.updatePurchaseOrder(id, req.body, tenantId);
    if (!order) {
      return res.status(404).json({ message: "Purchase order not found" });
    }
    res.json(order);
  } catch (error) {
    console.error("Error updating purchase order:", error);
    res.status(500).json({ message: "Failed to update purchase order" });
  }
});

router.delete("/:id", requirePermission('purchase:purchase_order:delete'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const deleted = await purchaseOrderStorage.deletePurchaseOrder(id, tenantId);
    if (!deleted) {
      return res.status(404).json({ message: "Purchase order not found" });
    }
    res.json({ message: "Purchase order deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting purchase order:", error);
    if (error.message?.includes("Only draft")) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: "Failed to delete purchase order" });
  }
});

router.post("/:id/approve", requirePermission('purchase:purchase_order:approve'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const id = parseIntParam(req.params.id, "id");
    const order = await purchaseOrderStorage.approvePurchaseOrder(id, userId, tenantId);
    if (!order) {
      return res.status(404).json({ message: "Purchase order not found" });
    }
    logAudit({ tenantId, entityType: 'purchase_order', entityId: id, action: 'APPROVE', performedBy: userId, newValues: { status: 'approved', approvedBy: userId }, ipAddress: req.ip, userAgent: req.headers['user-agent'] as string });
    res.json(order);
  } catch (error) {
    console.error("Error approving purchase order:", error);
    res.status(500).json({ message: "Failed to approve purchase order" });
  }
});

router.post("/generate-from-bom", requirePermission('purchase:purchase_order:create'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const { bomId, quantity, supplierId } = req.body;

    if (!bomId || !quantity) {
      return res.status(400).json({ message: "bomId and quantity are required" });
    }

    const poItems = await purchaseOrderStorage.generatePOFromBOM(bomId, quantity, tenantId, userId);
    res.json({ items: poItems, supplierId });
  } catch (error: any) {
    console.error("Error generating PO from BOM:", error);
    res.status(500).json({ message: error.message || "Failed to generate PO from BOM" });
  }
});

router.post("/:id/items", requirePermission('purchase:purchase_order:edit'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const poId = parseIntParam(req.params.id, "id");
    const item = await purchaseOrderStorage.createPurchaseOrderItem({
      ...req.body,
      poId: poId,
      tenantId,
    });
    res.status(201).json(item);
  } catch (error) {
    console.error("Error adding PO item:", error);
    res.status(500).json({ message: "Failed to add purchase order item" });
  }
});

router.put("/items/:itemId", requirePermission('purchase:purchase_order:edit'), async (req, res) => {
  try {
    const itemId = parseIntParam(req.params.itemId, "itemId");
    const item = await purchaseOrderStorage.updatePurchaseOrderItem(itemId, req.body);
    if (!item) {
      return res.status(404).json({ message: "Purchase order item not found" });
    }
    res.json(item);
  } catch (error) {
    console.error("Error updating PO item:", error);
    res.status(500).json({ message: "Failed to update purchase order item" });
  }
});

router.delete("/items/:itemId", requirePermission('purchase:purchase_order:delete'), async (req, res) => {
  try {
    const itemId = parseIntParam(req.params.itemId, "itemId");
    await purchaseOrderStorage.deletePurchaseOrderItem(itemId);
    res.json({ message: "Purchase order item deleted successfully" });
  } catch (error) {
    console.error("Error deleting PO item:", error);
    res.status(500).json({ message: "Failed to delete purchase order item" });
  }
});

export default router;
