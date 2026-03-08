import { parseIntParam } from "../utils/parseParams";
import express, { Request, Response } from 'express';
import { db } from '../db';
import { stockLedger, stockAdjustments, stockAdjustmentItems, items } from '@shared/schema';
import { eq, and, desc, sql, count, ilike, gte, lte } from 'drizzle-orm';
import { getCurrentStock, getWeightedAverageRate, getItemMovementHistory, getStockSummary, postStockFromAdjustment } from '../services/stockLedgerService';
import { generateDocumentNumber } from '../utils/documentNumberGenerator';
import { logAudit } from '../services/auditService';

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

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { warehouseId } = req.query as Record<string, string>;

    const result = await getStockSummary(tenantId, warehouseId ? parseInt(warehouseId) : undefined);
    res.json(result.rows || []);
  } catch (error: any) {
    console.error('Stock summary error:', error);
    res.status(500).json({ message: error.message || 'Failed to get stock summary' });
  }
});

router.get('/items/:itemId/current', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const itemId = parseIntParam(req.params.itemId, "itemId");
    if (isNaN(itemId)) return res.status(400).json({ message: 'Invalid item ID' });

    const { warehouseId } = req.query as Record<string, string>;
    const currentQty = await getCurrentStock(itemId, warehouseId ? parseInt(warehouseId) : undefined, tenantId);
    const valuation = await getWeightedAverageRate(itemId, warehouseId ? parseInt(warehouseId) : undefined, tenantId);

    const [item] = await db.select().from(items).where(and(eq(items.id, itemId), eq(items.tenantId, tenantId)));

    res.json({
      itemId,
      currentQty,
      valuationRate: valuation.rate,
      currentValue: currentQty * valuation.rate,
      minStockLevel: item?.minStockLevel ? parseFloat(item.minStockLevel) : 0,
      reorderPoint: item?.reorderPoint ? parseFloat(item.reorderPoint) : 0,
      maxStockLevel: item?.maxStockLevel ? parseFloat(item.maxStockLevel || '0') : 0,
      isBelowReorder: currentQty <= (item?.reorderPoint ? parseFloat(item.reorderPoint) : 0),
      isBelowMinimum: currentQty <= (item?.minStockLevel ? parseFloat(item.minStockLevel) : 0),
    });
  } catch (error: any) {
    console.error('Current stock error:', error);
    res.status(500).json({ message: error.message || 'Failed to get current stock' });
  }
});

router.get('/items/:itemId/ledger', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const itemId = parseIntParam(req.params.itemId, "itemId");
    if (isNaN(itemId)) return res.status(400).json({ message: 'Invalid item ID' });

    const { warehouseId, limit = '200' } = req.query as Record<string, string>;
    const entries = await getItemMovementHistory(
      itemId, tenantId,
      warehouseId ? parseInt(warehouseId) : undefined,
      parseInt(limit)
    );

    res.json(entries);
  } catch (error: any) {
    console.error('Item ledger error:', error);
    res.status(500).json({ message: error.message || 'Failed to get item ledger' });
  }
});

router.get('/alerts/low-stock', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const result = await db.execute(sql`
      WITH stock_levels AS (
        SELECT 
          sl.item_id,
          MAX(sl.item_name) as item_name,
          MAX(sl.item_code) as item_code,
          MAX(sl.unit) as unit,
          COALESCE(SUM(CAST(sl.qty_in AS numeric)), 0) - COALESCE(SUM(CAST(sl.qty_out AS numeric)), 0) as current_qty
        FROM stock_ledger sl
        WHERE sl.tenant_id = ${tenantId} AND sl.is_reversed = false
        GROUP BY sl.item_id
      )
      SELECT 
        s.item_id, s.item_name, s.item_code, s.unit, s.current_qty,
        COALESCE(CAST(i.min_stock_level AS numeric), 0) as min_stock_level,
        COALESCE(CAST(i.reorder_point AS numeric), 0) as reorder_point,
        CASE 
          WHEN s.current_qty <= COALESCE(CAST(i.min_stock_level AS numeric), 0) THEN 'CRITICAL'
          WHEN s.current_qty <= COALESCE(CAST(i.reorder_point AS numeric), 0) THEN 'LOW'
          ELSE 'OK'
        END as alert_level
      FROM stock_levels s
      JOIN items i ON s.item_id = i.id
      WHERE s.current_qty <= COALESCE(CAST(i.reorder_point AS numeric), 0)
        AND i.is_stockable = true
      ORDER BY 
        CASE 
          WHEN s.current_qty <= COALESCE(CAST(i.min_stock_level AS numeric), 0) THEN 1
          ELSE 2
        END,
        s.current_qty ASC
    `);

    res.json(result.rows || []);
  } catch (error: any) {
    console.error('Low stock alerts error:', error);
    res.status(500).json({ message: error.message || 'Failed to get low stock alerts' });
  }
});

router.get('/adjustments', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const adjustments = await db.select().from(stockAdjustments)
      .where(eq(stockAdjustments.tenantId, tenantId))
      .orderBy(desc(stockAdjustments.createdAt));
    res.json(adjustments);
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to get adjustments' });
  }
});

router.get('/adjustments/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid adjustment ID' });

    const [adjustment] = await db.select().from(stockAdjustments)
      .where(and(eq(stockAdjustments.id, id), eq(stockAdjustments.tenantId, tenantId)));
    if (!adjustment) return res.status(404).json({ message: 'Adjustment not found' });

    const adjItems = await db.select().from(stockAdjustmentItems)
      .where(and(eq(stockAdjustmentItems.adjustmentId, id), eq(stockAdjustmentItems.tenantId, tenantId)));

    res.json({ ...adjustment, items: adjItems });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to get adjustment' });
  }
});

router.post('/adjustments', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const { adjustmentDate, adjustmentType, warehouseId, reason, notes, items: adjItems } = req.body;

    if (!adjustmentDate || !adjustmentType) {
      return res.status(400).json({ message: 'Adjustment date and type are required' });
    }

    const adjustmentNumber = await generateDocumentNumber({
      prefix: 'ADJ',
      tableName: 'stock_adjustments',
      columnName: 'adjustment_number',
      tenantId,
    });

    const [adjustment] = await db.insert(stockAdjustments).values({
      adjustmentNumber,
      adjustmentDate,
      adjustmentType,
      warehouseId: warehouseId || null,
      reason: reason || null,
      notes: notes || null,
      workflowStatus: 'DRAFT',
      tenantId,
      createdBy: userId,
    }).returning();

    if (adjItems && Array.isArray(adjItems) && adjItems.length > 0) {
      const itemValues = adjItems.map((item: any) => ({
        adjustmentId: adjustment.id,
        itemId: item.itemId,
        itemCode: item.itemCode || null,
        itemName: item.itemName || '',
        currentQty: String(item.currentQty || 0),
        adjustedQty: String(item.adjustedQty || 0),
        differenceQty: String(item.differenceQty || 0),
        rate: String(item.rate || 0),
        value: String(item.value || 0),
        unit: item.unit || null,
        reason: item.reason || null,
        tenantId,
      }));
      await db.insert(stockAdjustmentItems).values(itemValues);
    }

    res.status(201).json(adjustment);
  } catch (error: any) {
    console.error('Create adjustment error:', error);
    res.status(500).json({ message: error.message || 'Failed to create adjustment' });
  }
});

router.post('/adjustments/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid adjustment ID' });

    const [adjustment] = await db.select().from(stockAdjustments)
      .where(and(eq(stockAdjustments.id, id), eq(stockAdjustments.tenantId, tenantId)));
    if (!adjustment) return res.status(404).json({ message: 'Adjustment not found' });
    if (adjustment.workflowStatus !== 'DRAFT') {
      return res.status(400).json({ message: 'Can only approve DRAFT adjustments' });
    }

    const adjItems = await db.select().from(stockAdjustmentItems)
      .where(and(eq(stockAdjustmentItems.adjustmentId, id), eq(stockAdjustmentItems.tenantId, tenantId)));

    await postStockFromAdjustment(
      adjustment.id,
      adjustment.adjustmentNumber,
      adjustment.adjustmentDate,
      adjItems,
      adjustment.warehouseId,
      tenantId,
      userId
    );

    const [updated] = await db.update(stockAdjustments)
      .set({ workflowStatus: 'APPROVED', approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(stockAdjustments.id, id))
      .returning();

    logAudit({ tenantId, entityType: 'stock_adjustment', entityId: id, action: 'APPROVE', performedBy: userId, newValues: { workflowStatus: 'APPROVED', adjustmentNumber: adjustment.adjustmentNumber }, ipAddress: req.ip });

    res.json(updated);
  } catch (error: any) {
    console.error('Approve adjustment error:', error);
    res.status(500).json({ message: error.message || 'Failed to approve adjustment' });
  }
});

router.get('/ledger', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { dateFrom, dateTo, itemId, warehouseId, docType, page = '1', limit = '100' } = req.query as Record<string, string>;

    const conditions: any[] = [eq(stockLedger.tenantId, tenantId)];
    if (dateFrom) conditions.push(gte(stockLedger.postingDate, dateFrom));
    if (dateTo) conditions.push(lte(stockLedger.postingDate, dateTo));
    if (itemId) conditions.push(eq(stockLedger.itemId, parseInt(itemId)));
    if (warehouseId) conditions.push(eq(stockLedger.warehouseId, parseInt(warehouseId)));
    if (docType) conditions.push(eq(stockLedger.docType, docType));

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const entries = await db.select().from(stockLedger)
      .where(and(...conditions))
      .orderBy(desc(stockLedger.postingDate), desc(stockLedger.id))
      .limit(parseInt(limit))
      .offset(offset);

    const [countResult] = await db.select({ count: count() }).from(stockLedger).where(and(...conditions));

    res.json({
      entries,
      total: countResult?.count || 0,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error: any) {
    console.error('Stock ledger error:', error);
    res.status(500).json({ message: error.message || 'Failed to get stock ledger' });
  }
});

router.get('/report/valuation', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { warehouseId } = req.query as Record<string, string>;

    let result;
    if (warehouseId) {
      result = await db.execute(sql`
        WITH item_stock AS (
          SELECT 
            sl.item_id,
            MAX(sl.item_code) as item_code,
            MAX(sl.item_name) as item_name,
            sl.warehouse_id,
            MAX(sl.warehouse_name) as warehouse_name,
            MAX(sl.unit) as unit,
            COALESCE(SUM(CAST(sl.qty_in AS numeric)), 0) as total_qty_in,
            COALESCE(SUM(CAST(sl.qty_out AS numeric)), 0) as total_qty_out,
            COALESCE(SUM(CAST(sl.qty_in AS numeric)), 0) - COALESCE(SUM(CAST(sl.qty_out AS numeric)), 0) as balance_qty,
            COALESCE(SUM(CAST(sl.value_in AS numeric)), 0) as total_value_in,
            COALESCE(SUM(CAST(sl.value_out AS numeric)), 0) as total_value_out,
            COALESCE(SUM(CAST(sl.value_in AS numeric)), 0) - COALESCE(SUM(CAST(sl.value_out AS numeric)), 0) as balance_value
          FROM stock_ledger sl
          WHERE sl.tenant_id = ${tenantId} AND sl.is_reversed = false AND sl.warehouse_id = ${parseInt(warehouseId)}
          GROUP BY sl.item_id, sl.warehouse_id
        )
        SELECT 
          s.*,
          CASE WHEN s.balance_qty > 0 THEN s.balance_value / s.balance_qty ELSE 0 END as avg_rate,
          i.cost_method,
          COALESCE(CAST(i.default_cost AS numeric), 0) as default_cost,
          COALESCE(CAST(i.min_stock_level AS numeric), 0) as min_stock,
          COALESCE(CAST(i.reorder_point AS numeric), 0) as reorder_point
        FROM item_stock s
        LEFT JOIN items i ON s.item_id = i.id
        WHERE s.balance_qty != 0
        ORDER BY s.item_name
      `);
    } else {
      result = await db.execute(sql`
        WITH item_stock AS (
          SELECT 
            sl.item_id,
            MAX(sl.item_code) as item_code,
            MAX(sl.item_name) as item_name,
            sl.warehouse_id,
            MAX(sl.warehouse_name) as warehouse_name,
            MAX(sl.unit) as unit,
            COALESCE(SUM(CAST(sl.qty_in AS numeric)), 0) as total_qty_in,
            COALESCE(SUM(CAST(sl.qty_out AS numeric)), 0) as total_qty_out,
            COALESCE(SUM(CAST(sl.qty_in AS numeric)), 0) - COALESCE(SUM(CAST(sl.qty_out AS numeric)), 0) as balance_qty,
            COALESCE(SUM(CAST(sl.value_in AS numeric)), 0) as total_value_in,
            COALESCE(SUM(CAST(sl.value_out AS numeric)), 0) as total_value_out,
            COALESCE(SUM(CAST(sl.value_in AS numeric)), 0) - COALESCE(SUM(CAST(sl.value_out AS numeric)), 0) as balance_value
          FROM stock_ledger sl
          WHERE sl.tenant_id = ${tenantId} AND sl.is_reversed = false
          GROUP BY sl.item_id, sl.warehouse_id
        )
        SELECT 
          s.*,
          CASE WHEN s.balance_qty > 0 THEN s.balance_value / s.balance_qty ELSE 0 END as avg_rate,
          i.cost_method,
          COALESCE(CAST(i.default_cost AS numeric), 0) as default_cost,
          COALESCE(CAST(i.min_stock_level AS numeric), 0) as min_stock,
          COALESCE(CAST(i.reorder_point AS numeric), 0) as reorder_point
        FROM item_stock s
        LEFT JOIN items i ON s.item_id = i.id
        WHERE s.balance_qty != 0
        ORDER BY s.item_name
      `);
    }

    const rows = result.rows || [];
    const totalValue = rows.reduce((sum: number, r: any) => sum + parseFloat(r.balance_value || '0'), 0);
    const totalItems = rows.length;

    res.json({
      items: rows,
      summary: {
        totalItems,
        totalValue,
        reportDate: new Date().toISOString().split('T')[0],
      }
    });
  } catch (error: any) {
    console.error('Valuation report error:', error);
    res.status(500).json({ message: error.message || 'Failed to generate valuation report' });
  }
});

export default router;
