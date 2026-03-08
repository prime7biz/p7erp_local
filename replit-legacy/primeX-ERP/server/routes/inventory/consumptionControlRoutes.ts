import { parseIntParam } from "../../utils/parseParams";
import express, { Request, Response } from 'express';
import { db } from '../../db';
import {
  orderBomSnapshots, orderBomSnapshotItems,
  materialReservations, consumptionChangeRequests, consumptionChangeItems,
  orderMaterials, orders, items, stockLedger, itemUnits, purchaseOrderItems
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { generateDocumentNumber } from '../../utils/documentNumberGenerator';
import { getCurrentStock, getWeightedAverageRate } from '../../services/stockLedgerService';
import { ERPError, ERP_ERROR_CODES, formatERPError, checkIdempotency, saveIdempotencyResult, checkNegativeStock } from '../../services/transactionSafetyService';

const router = express.Router();

const getTenantId = (req: Request): number => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new Error("Tenant ID not found");
  return tenantId;
};

const getUserId = (req: Request): number => {
  const userId = req.user?.id;
  if (!userId) throw new Error("User ID not found");
  return userId;
};

router.post('/finalize-order/:orderId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const orderId = parseIntParam(req.params.orderId, "orderId");
    if (isNaN(orderId)) return res.status(400).json({ message: 'Invalid order ID' });

    const requestId = req.body.requestId || req.headers['x-request-id'];
    if (requestId) {
      const idempotencyResult = await checkIdempotency(tenantId, requestId, 'FINALIZE_ORDER');
      if (idempotencyResult.exists) {
        return res.status(idempotencyResult.statusCode || 200).json(idempotencyResult.cachedResponse);
      }
    }

    const result = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(
        sql`SELECT * FROM orders WHERE id = ${orderId} AND tenant_id = ${tenantId} FOR UPDATE`
      );
      const order = lockResult.rows[0];
      if (!order) return { error: 'Order not found', status: 404 };

      const existingSnapshots = await tx.select().from(orderBomSnapshots)
        .where(and(eq(orderBomSnapshots.orderId, orderId), eq(orderBomSnapshots.tenantId, tenantId)));
      if (existingSnapshots.length > 0) {
        return { error: 'BOM snapshot already exists for this order. Cannot finalize again.', status: 400 };
      }

      const materials = await tx.select().from(orderMaterials)
        .where(and(eq(orderMaterials.orderId, orderId), eq(orderMaterials.tenantId, tenantId)));

      if (materials.length === 0) {
        return { error: 'No materials found for this order. Add materials before finalizing.', status: 400 };
      }

      const totalEstimatedCost = materials.reduce((sum, m) => sum + parseFloat(m.totalCost || '0'), 0);

      const [snapshot] = await tx.insert(orderBomSnapshots).values({
        orderId,
        snapshotVersion: 1,
        isLocked: true,
        lockedAt: new Date(),
        lockedBy: userId,
        totalEstimatedCost: String(totalEstimatedCost),
        notes: `Finalized by user ${userId}`,
        tenantId,
      }).returning();

      const snapshotItems = [];
      const reservations = [];
      const skippedMaterials = [];

      for (const mat of materials) {
        const totalRequiredQty = parseFloat(mat.quantityNeeded || '0');
        const unitPrice = parseFloat(mat.unitPrice || '0');

        let itemDetails: any = null;
        if (mat.itemId) {
          const [foundItem] = await tx.select().from(items).where(eq(items.id, mat.itemId));
          itemDetails = foundItem;
          if (!foundItem) {
            skippedMaterials.push({ materialType: mat.materialType, reason: `Item ID ${mat.itemId} not found in inventory` });
            continue;
          }
        } else {
          skippedMaterials.push({ materialType: mat.materialType, reason: 'No inventory item linked' });
          continue;
        }

        let unitName: string | null = null;
        if (mat.unitId) {
          const [unit] = await tx.select().from(itemUnits).where(eq(itemUnits.id, mat.unitId));
          unitName = unit?.name || null;
        }

        const [snapshotItem] = await tx.insert(orderBomSnapshotItems).values({
          snapshotId: snapshot.id,
          itemId: mat.itemId,
          itemCode: itemDetails?.itemCode || null,
          itemName: itemDetails?.name || mat.materialType || 'Unknown',
          materialType: mat.materialType,
          requiredQty: String(totalRequiredQty),
          wastagePercent: '0',
          totalRequiredQty: String(totalRequiredQty),
          unitId: mat.unitId,
          unitName,
          estimatedRate: String(unitPrice),
          estimatedCost: String(totalRequiredQty * unitPrice),
          tenantId,
        }).returning();
        snapshotItems.push(snapshotItem);

        const [reservation] = await tx.insert(materialReservations).values({
          orderId,
          snapshotId: snapshot.id,
          itemId: mat.itemId,
          warehouseId: null,
          reservedQty: String(totalRequiredQty),
          issuedQty: '0',
          remainingQty: String(totalRequiredQty),
          unitId: mat.unitId,
          status: 'ACTIVE',
          tenantId,
        }).returning();
        reservations.push(reservation);
      }

      if (snapshotItems.length === 0) {
        return {
          error: `Cannot finalize: all ${materials.length} material(s) are missing linked inventory items. Please link materials to inventory items first.`,
          status: 400,
        };
      }

      await tx.update(orders)
        .set({ orderStatus: 'confirmed', updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));

      return { snapshot, snapshotItems, reservations, skippedMaterials };
    });

    if ('error' in result) {
      return res.status(result.status || 500).json({ message: result.error });
    }

    const skippedCount = result.skippedMaterials?.length || 0;
    const responseBody = {
      ...result,
      message: skippedCount > 0
        ? `Order finalized. BOM locked with ${result.snapshotItems.length} items. ${skippedCount} material(s) skipped (no linked inventory item).`
        : 'Order finalized successfully. BOM locked and material reservations created.',
    };

    if (requestId) {
      await saveIdempotencyResult(tenantId, requestId, 'FINALIZE_ORDER', String(orderId), 201, responseBody);
    }

    res.status(201).json(responseBody);
  } catch (error: any) {
    console.error('Finalize order error:', error);
    if (error instanceof ERPError) {
      return res.status(error.httpStatus).json(formatERPError(error));
    }
    res.status(500).json({ message: error.message || 'Failed to finalize order' });
  }
});

router.get('/snapshot/:orderId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const orderId = parseIntParam(req.params.orderId, "orderId");
    if (isNaN(orderId)) return res.status(400).json({ message: 'Invalid order ID' });

    const [snapshot] = await db.select().from(orderBomSnapshots)
      .where(and(eq(orderBomSnapshots.orderId, orderId), eq(orderBomSnapshots.tenantId, tenantId)));

    if (!snapshot) return res.status(404).json({ message: 'No BOM snapshot found for this order' });

    const snapshotItemsList = await db.select().from(orderBomSnapshotItems)
      .where(and(eq(orderBomSnapshotItems.snapshotId, snapshot.id), eq(orderBomSnapshotItems.tenantId, tenantId)));

    res.json({ ...snapshot, items: snapshotItemsList });
  } catch (error: any) {
    console.error('Get snapshot error:', error);
    res.status(500).json({ message: error.message || 'Failed to get BOM snapshot' });
  }
});

router.post('/issue-material', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { orderId, itemId, warehouseId, issueQty, remarks } = req.body;

    if (!orderId || !itemId || !issueQty) {
      return res.status(400).json({ message: 'orderId, itemId, and issueQty are required' });
    }

    const requestId = req.body.requestId || req.headers['x-request-id'];
    if (requestId) {
      const idempotencyResult = await checkIdempotency(tenantId, requestId, 'ISSUE_MATERIAL');
      if (idempotencyResult.exists) {
        return res.status(idempotencyResult.statusCode || 200).json(idempotencyResult.cachedResponse);
      }
    }

    const qty = parseFloat(String(issueQty));

    const txResult = await db.transaction(async (tx) => {
      const lockResult = await tx.execute(
        sql`SELECT * FROM material_reservations 
            WHERE order_id = ${orderId} AND item_id = ${itemId} AND tenant_id = ${tenantId} AND status = 'ACTIVE'
            FOR UPDATE`
      );

      if (!lockResult.rows || lockResult.rows.length === 0) {
        return { error: 'No active reservation found for this order and item', status: 404 };
      }

      const reservation = lockResult.rows[0] as any;
      const remainingQty = parseFloat(reservation.remaining_qty || '0');
      const currentIssuedQty = parseFloat(reservation.issued_qty || '0');

      if (qty > remainingQty) {
        return {
          error: 'Issue quantity exceeds remaining reservation. Submit a Change Request for approval.',
          status: 403,
          details: { remainingQty, requestedQty: qty },
        };
      }

      const [item] = await tx.select().from(items)
        .where(and(eq(items.id, itemId), eq(items.tenantId, tenantId)));

      const stockCheck = await checkNegativeStock(itemId, warehouseId || null, tenantId, qty, {
        allowOverride: req.body.allowNegativeStock === true,
        overrideReason: req.body.overrideReason,
        overrideBy: userId,
      });

      if (!stockCheck.allowed) {
        return {
          error: `Insufficient stock. Current: ${stockCheck.currentStock}, Required: ${qty}, Resulting: ${stockCheck.resultingStock}`,
          status: 403,
          stockError: true,
          details: { currentStock: stockCheck.currentStock, resultingStock: stockCheck.resultingStock, requiresOverride: true },
        };
      }

      const currentBalance = await getCurrentStock(itemId, warehouseId || null, tenantId);
      const valuationData = await getWeightedAverageRate(itemId, warehouseId || null, tenantId);
      const valuationRate = valuationData.rate;
      const newBalance = currentBalance - qty;
      const newBalanceValue = newBalance * valuationRate;

      const [updRes] = await tx.update(materialReservations)
        .set({
          issuedQty: String(currentIssuedQty + qty),
          remainingQty: String(remainingQty - qty),
          updatedAt: new Date(),
        })
        .where(eq(materialReservations.id, reservation.id))
        .returning();

      await tx.insert(stockLedger).values({
        docType: 'PRODUCTION_ISSUE',
        docId: orderId,
        docNumber: `PI-ORD-${orderId}`,
        postingDate: new Date().toISOString().split('T')[0],
        itemId,
        itemCode: item?.itemCode || null,
        itemName: item?.name || 'Unknown',
        warehouseId: warehouseId || null,
        warehouseName: null,
        qtyIn: '0',
        qtyOut: String(qty),
        balanceQty: String(newBalance),
        rate: String(valuationRate),
        valuationRate: String(valuationRate),
        valueIn: '0',
        valueOut: String(qty * valuationRate),
        balanceValue: String(newBalanceValue),
        unit: item?.unit || null,
        batchNumber: null,
        partyId: null,
        partyName: null,
        remarks: remarks || `Production issue for order ${orderId}`,
        isReversed: false,
        tenantId,
        createdBy: userId,
      });

      return { reservation: updRes };
    });

    if ('error' in txResult) {
      if (txResult.stockError) {
        return res.status(txResult.status).json(formatERPError(new ERPError(
          ERP_ERROR_CODES.NEGATIVE_STOCK,
          txResult.error,
          403,
          txResult.details
        )));
      }
      return res.status(txResult.status || 500).json({ message: txResult.error, ...txResult.details });
    }

    const updatedReservation = txResult.reservation;

    const responseBody = {
      reservation: updatedReservation,
      message: 'Material issued successfully',
    };

    if (requestId) {
      await saveIdempotencyResult(tenantId, requestId, 'ISSUE_MATERIAL', String(orderId), 200, responseBody);
    }

    res.json(responseBody);
  } catch (error: any) {
    console.error('Issue material error:', error);
    if (error instanceof ERPError) {
      return res.status(error.httpStatus).json(formatERPError(error));
    }
    res.status(500).json({ message: error.message || 'Failed to issue material' });
  }
});

router.get('/reservations/:orderId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const orderId = parseIntParam(req.params.orderId, "orderId");
    if (isNaN(orderId)) return res.status(400).json({ message: 'Invalid order ID' });

    const reservationsList = await db.select().from(materialReservations)
      .where(and(eq(materialReservations.orderId, orderId), eq(materialReservations.tenantId, tenantId)));

    const enriched = [];
    for (const r of reservationsList) {
      let itemDetails: any = null;
      if (r.itemId) {
        const [foundItem] = await db.select().from(items).where(and(eq(items.id, r.itemId), eq(items.tenantId, tenantId)));
        itemDetails = foundItem || null;
      }
      enriched.push({ ...r, item: itemDetails });
    }

    res.json(enriched);
  } catch (error: any) {
    console.error('Get reservations error:', error);
    res.status(500).json({ message: error.message || 'Failed to get reservations' });
  }
});

router.post('/change-request', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { orderId, reason, changeType, items: changeItems } = req.body;

    if (!orderId || !reason || !changeType || !changeItems || changeItems.length === 0) {
      return res.status(400).json({ message: 'orderId, reason, changeType, and items are required' });
    }

    const [snapshot] = await db.select().from(orderBomSnapshots)
      .where(and(eq(orderBomSnapshots.orderId, orderId), eq(orderBomSnapshots.tenantId, tenantId)));

    const crNumber = await generateDocumentNumber({
      prefix: 'CCR',
      tableName: 'consumption_change_requests',
      columnName: 'cr_number',
      tenantId,
    });

    const [changeRequest] = await db.insert(consumptionChangeRequests).values({
      crNumber,
      orderId,
      snapshotId: snapshot?.id || null,
      reason,
      changeType,
      status: 'PENDING',
      requestedBy: userId,
      tenantId,
    }).returning();

    const createdItems = [];
    for (const ci of changeItems) {
      const deltaQty = parseFloat(String(ci.newQty)) - parseFloat(String(ci.previousQty));
      const [item] = await db.insert(consumptionChangeItems).values({
        changeRequestId: changeRequest.id,
        itemId: ci.itemId,
        itemName: ci.itemName || 'Unknown',
        previousQty: String(ci.previousQty),
        newQty: String(ci.newQty),
        deltaQty: String(deltaQty),
        unitName: ci.unitName || null,
        reason: ci.reason || null,
        tenantId,
      }).returning();
      createdItems.push(item);
    }

    res.status(201).json({
      ...changeRequest,
      items: createdItems,
      message: 'Change request created successfully',
    });
  } catch (error: any) {
    console.error('Create change request error:', error);
    res.status(500).json({ message: error.message || 'Failed to create change request' });
  }
});

router.get('/change-requests', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { orderId, status } = req.query as Record<string, string>;

    const conditions: any[] = [eq(consumptionChangeRequests.tenantId, tenantId)];
    if (orderId) conditions.push(eq(consumptionChangeRequests.orderId, parseInt(orderId)));
    if (status) conditions.push(eq(consumptionChangeRequests.status, status));

    const requests = await db.select().from(consumptionChangeRequests)
      .where(and(...conditions))
      .orderBy(desc(consumptionChangeRequests.createdAt));

    res.json(requests);
  } catch (error: any) {
    console.error('List change requests error:', error);
    res.status(500).json({ message: error.message || 'Failed to list change requests' });
  }
});

router.get('/change-requests/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid change request ID' });

    const [cr] = await db.select().from(consumptionChangeRequests)
      .where(and(eq(consumptionChangeRequests.id, id), eq(consumptionChangeRequests.tenantId, tenantId)));

    if (!cr) return res.status(404).json({ message: 'Change request not found' });

    const crItems = await db.select().from(consumptionChangeItems)
      .where(and(eq(consumptionChangeItems.changeRequestId, id), eq(consumptionChangeItems.tenantId, tenantId)));

    res.json({ ...cr, items: crItems });
  } catch (error: any) {
    console.error('Get change request error:', error);
    res.status(500).json({ message: error.message || 'Failed to get change request' });
  }
});

router.post('/change-requests/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid change request ID' });

    const [cr] = await db.select().from(consumptionChangeRequests)
      .where(and(eq(consumptionChangeRequests.id, id), eq(consumptionChangeRequests.tenantId, tenantId)));

    if (!cr) return res.status(404).json({ message: 'Change request not found' });
    if (cr.status !== 'PENDING') {
      return res.status(400).json({ message: 'Only PENDING change requests can be approved' });
    }

    const crItems = await db.select().from(consumptionChangeItems)
      .where(and(eq(consumptionChangeItems.changeRequestId, id), eq(consumptionChangeItems.tenantId, tenantId)));

    const updatedCr = await db.transaction(async (tx) => {
      const [updCr] = await tx.update(consumptionChangeRequests)
        .set({
          status: 'APPROVED',
          approvedBy: userId,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(consumptionChangeRequests.id, id))
        .returning();

      for (const ci of crItems) {
        const deltaQty = parseFloat(ci.deltaQty || '0');

        if (cr.snapshotId) {
          const [snapshotItem] = await tx.select().from(orderBomSnapshotItems)
            .where(and(
              eq(orderBomSnapshotItems.snapshotId, cr.snapshotId),
              eq(orderBomSnapshotItems.itemId, ci.itemId),
              eq(orderBomSnapshotItems.tenantId, tenantId)
            ));

          if (snapshotItem) {
            const currentTotal = parseFloat(snapshotItem.totalRequiredQty || '0');
            await tx.update(orderBomSnapshotItems)
              .set({ totalRequiredQty: String(currentTotal + deltaQty) })
              .where(eq(orderBomSnapshotItems.id, snapshotItem.id));
          }
        }

        const reservationsList = await tx.select().from(materialReservations)
          .where(and(
            eq(materialReservations.orderId, cr.orderId),
            eq(materialReservations.itemId, ci.itemId),
            eq(materialReservations.tenantId, tenantId),
            eq(materialReservations.status, 'ACTIVE')
          ));

        if (reservationsList.length > 0) {
          const reservation = reservationsList[0];
          const currentReserved = parseFloat(reservation.reservedQty || '0');
          const currentRemaining = parseFloat(reservation.remainingQty || '0');
          await tx.update(materialReservations)
            .set({
              reservedQty: String(currentReserved + deltaQty),
              remainingQty: String(currentRemaining + deltaQty),
              updatedAt: new Date(),
            })
            .where(eq(materialReservations.id, reservation.id));
        }
      }

      return updCr;
    });

    res.json({
      ...updatedCr,
      items: crItems,
      message: 'Change request approved and applied successfully',
    });
  } catch (error: any) {
    console.error('Approve change request error:', error);
    if (error instanceof ERPError) {
      return res.status(error.httpStatus).json(formatERPError(error));
    }
    res.status(500).json({ message: error.message || 'Failed to approve change request' });
  }
});

router.post('/change-requests/:id/reject', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid change request ID' });

    const { rejectionReason } = req.body;

    const [cr] = await db.select().from(consumptionChangeRequests)
      .where(and(eq(consumptionChangeRequests.id, id), eq(consumptionChangeRequests.tenantId, tenantId)));

    if (!cr) return res.status(404).json({ message: 'Change request not found' });
    if (cr.status !== 'PENDING') {
      return res.status(400).json({ message: 'Only PENDING change requests can be rejected' });
    }

    const [updatedCr] = await db.update(consumptionChangeRequests)
      .set({
        status: 'REJECTED',
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: rejectionReason || null,
        updatedAt: new Date(),
      })
      .where(eq(consumptionChangeRequests.id, id))
      .returning();

    res.json({
      ...updatedCr,
      message: 'Change request rejected',
    });
  } catch (error: any) {
    console.error('Reject change request error:', error);
    res.status(500).json({ message: error.message || 'Failed to reject change request' });
  }
});

router.get('/procurement-check/:orderId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const orderId = parseIntParam(req.params.orderId, "orderId");
    if (isNaN(orderId)) return res.status(400).json({ message: 'Invalid order ID' });

    const { itemId, additionalQty } = req.query as Record<string, string>;
    if (!itemId || !additionalQty) {
      return res.status(400).json({ message: 'itemId and additionalQty query params are required' });
    }

    const parsedItemId = parseInt(itemId);
    const parsedAdditionalQty = parseFloat(additionalQty);

    const reservationsList = await db.select().from(materialReservations)
      .where(and(
        eq(materialReservations.orderId, orderId),
        eq(materialReservations.itemId, parsedItemId),
        eq(materialReservations.tenantId, tenantId),
        eq(materialReservations.status, 'ACTIVE')
      ));

    if (reservationsList.length === 0) {
      return res.status(404).json({ message: 'No active reservation found for this order and item' });
    }

    const reservation = reservationsList[0];
    const totalRequired = parseFloat(reservation.reservedQty || '0');

    let alreadyPurchased = 0;
    try {
      const poResult = await db.select({
        totalPurchased: sql<string>`COALESCE(SUM(CAST(poi.quantity AS numeric)), 0)`,
      })
      .from(purchaseOrderItems)
      .where(and(
        eq(purchaseOrderItems.itemId, parsedItemId),
        eq(purchaseOrderItems.tenantId, tenantId)
      ));
      alreadyPurchased = parseFloat(poResult[0]?.totalPurchased || '0');
    } catch {
      alreadyPurchased = 0;
    }

    const proposed = alreadyPurchased + parsedAdditionalQty;

    if (proposed > totalRequired) {
      return res.json({
        allowed: false,
        message: 'Exceeds approved consumption. Submit Change Request.',
        overage: proposed - totalRequired,
        totalRequired,
        alreadyPurchased,
        proposed,
      });
    }

    res.json({
      allowed: true,
      totalRequired,
      alreadyPurchased,
      proposed,
    });
  } catch (error: any) {
    console.error('Procurement check error:', error);
    res.status(500).json({ message: error.message || 'Failed to check procurement' });
  }
});

export default router;
