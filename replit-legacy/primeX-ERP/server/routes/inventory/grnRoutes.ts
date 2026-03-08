import { parseIntParam } from "../../utils/parseParams";
import { Router } from "express";
import { grnStorage } from "../../database/inventory/grnStorage";
import { isAuthenticated } from "../../middleware/auth";
import { requirePermission } from "../../middleware/rbacMiddleware";
import { db } from "../../db";
import { goodsReceivingNotes, grnItems } from "@shared/schema";
import { logAudit } from "../../services/auditService";
import { eq, and, sql } from "drizzle-orm";
import { checkIdempotency, saveIdempotencyResult } from "../../services/transactionSafetyService";

const router = Router();

router.use(isAuthenticated);

router.get("/next-number", requirePermission('purchase:grn:read'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const nextNumber = await grnStorage.getNextGrnNumber(tenantId);
    res.json({ nextNumber });
  } catch (error) {
    console.error("Error getting next GRN number:", error);
    res.status(500).json({ message: "Failed to get next GRN number" });
  }
});

router.get("/", requirePermission('purchase:grn:read'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const filters = {
      status: req.query.status as string | undefined,
      vendorId: req.query.vendorId ? parseInt(req.query.vendorId as string) : undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    };
    const grns = await grnStorage.getAllGRNs(tenantId, filters);
    res.json(grns);
  } catch (error) {
    console.error("Error fetching GRNs:", error);
    res.status(500).json({ message: "Failed to fetch GRNs" });
  }
});

router.get("/:id", requirePermission('purchase:grn:read'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const grn = await grnStorage.getGRNById(id, tenantId);
    if (!grn) {
      return res.status(404).json({ message: "GRN not found" });
    }
    res.json(grn);
  } catch (error) {
    console.error("Error fetching GRN:", error);
    res.status(500).json({ message: "Failed to fetch GRN" });
  }
});

router.post("/", requirePermission('purchase:grn:create'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { items: itemsData, ...headerData } = req.body;

    const requestId = req.headers['x-request-id'] as string | undefined;
    if (requestId) {
      const idempotencyResult = await checkIdempotency(tenantId, requestId, 'CREATE_GRN');
      if (idempotencyResult.exists) {
        return res.status(idempotencyResult.statusCode || 200).json(idempotencyResult.cachedResponse);
      }
    }

    if (headerData.grnNumber) {
      const [existing] = await db.select({ id: goodsReceivingNotes.id })
        .from(goodsReceivingNotes)
        .where(and(
          eq(goodsReceivingNotes.tenantId, tenantId),
          eq(goodsReceivingNotes.grnNumber, headerData.grnNumber)
        ));
      if (existing) {
        return res.status(409).json({ message: `GRN number '${headerData.grnNumber}' already exists` });
      }
    }

    const grnId = await db.transaction(async (tx) => {
      const [grn] = await tx
        .insert(goodsReceivingNotes)
        .values({ ...headerData, tenantId })
        .returning();

      if (itemsData && Array.isArray(itemsData)) {
        for (const item of itemsData) {
          await tx.insert(grnItems).values({
            ...item,
            grnId: grn.id,
            tenantId,
          });
        }
      }

      return grn.id;
    });

    const fullGrn = await grnStorage.getGRNById(grnId, tenantId);

    logAudit({ tenantId, entityType: 'grn', entityId: grnId, action: 'CREATE', performedBy: (req.user as any)?.id || 0, newValues: { grnNumber: headerData.grnNumber, vendorId: headerData.vendorId, warehouseId: headerData.warehouseId }, ipAddress: req.ip, userAgent: req.headers['user-agent'] as string });

    if (requestId) {
      await saveIdempotencyResult(tenantId, requestId, 'CREATE_GRN', String(grnId), 201, fullGrn);
    }

    res.status(201).json(fullGrn);
  } catch (error: any) {
    console.error("Error creating GRN:", error);
    if (error?.code === '23505' || error?.constraint?.includes('tenant_grn_number')) {
      return res.status(409).json({ message: "Duplicate GRN number. Please use a unique GRN number." });
    }
    res.status(500).json({ message: "Failed to create GRN" });
  }
});

router.put("/:id", requirePermission('purchase:grn:edit'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const grn = await grnStorage.updateGRN(id, req.body, tenantId);
    if (!grn) {
      return res.status(404).json({ message: "GRN not found" });
    }
    res.json(grn);
  } catch (error) {
    console.error("Error updating GRN:", error);
    res.status(500).json({ message: "Failed to update GRN" });
  }
});

router.post("/:id/complete", requirePermission('purchase:grn:edit'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;
    const id = parseIntParam(req.params.id, "id");

    const requestId = req.headers['x-request-id'] as string | undefined;
    if (requestId) {
      const idempotencyResult = await checkIdempotency(tenantId, requestId, 'COMPLETE_GRN');
      if (idempotencyResult.exists) {
        return res.status(idempotencyResult.statusCode || 200).json(idempotencyResult.cachedResponse);
      }
    }

    const lockResult = await db.execute(
      sql`SELECT status FROM goods_receiving_notes WHERE id = ${id} AND tenant_id = ${tenantId} FOR UPDATE`
    );
    if (!lockResult.rows || lockResult.rows.length === 0) {
      return res.status(404).json({ message: "GRN not found" });
    }
    if ((lockResult.rows[0] as any).status === 'completed') {
      return res.status(400).json({ message: "GRN is already completed" });
    }

    const grn = await grnStorage.completeGRN(id, tenantId);
    logAudit({ tenantId, entityType: 'grn', entityId: id, action: 'COMPLETE', performedBy: userId, newValues: { status: 'completed', grnNumber: grn.grnNumber }, ipAddress: req.ip, userAgent: req.headers['user-agent'] as string });

    if (requestId) {
      await saveIdempotencyResult(tenantId, requestId, 'COMPLETE_GRN', String(id), 200, grn);
    }

    res.json(grn);
  } catch (error: any) {
    console.error("Error completing GRN:", error);
    const isValidationError = error.message?.includes("Cannot complete GRN:") || 
                               error.message?.includes("not assigned to any Stock Group") ||
                               error.message?.includes("GRN is already completed") ||
                               error.message?.includes("GRN not found");
    const statusCode = isValidationError ? 400 : 500;
    res.status(statusCode).json({ message: error.message || "Failed to complete GRN" });
  }
});

router.post("/:id/items", requirePermission('purchase:grn:edit'), async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const grnId = parseIntParam(req.params.id, "id");
    const item = await grnStorage.createGRNItem({
      ...req.body,
      grnId,
      tenantId,
    });
    res.status(201).json(item);
  } catch (error) {
    console.error("Error adding GRN item:", error);
    res.status(500).json({ message: "Failed to add GRN item" });
  }
});

router.put("/items/:itemId", requirePermission('purchase:grn:edit'), async (req, res) => {
  try {
    const itemId = parseIntParam(req.params.itemId, "itemId");
    const item = await grnStorage.updateGRNItem(itemId, req.body);
    if (!item) {
      return res.status(404).json({ message: "GRN item not found" });
    }
    res.json(item);
  } catch (error) {
    console.error("Error updating GRN item:", error);
    res.status(500).json({ message: "Failed to update GRN item" });
  }
});

router.delete("/items/:itemId", requirePermission('purchase:grn:delete'), async (req, res) => {
  try {
    const itemId = parseIntParam(req.params.itemId, "itemId");
    await grnStorage.deleteGRNItem(itemId);
    res.json({ message: "GRN item deleted successfully" });
  } catch (error) {
    console.error("Error deleting GRN item:", error);
    res.status(500).json({ message: "Failed to delete GRN item" });
  }
});

export default router;
