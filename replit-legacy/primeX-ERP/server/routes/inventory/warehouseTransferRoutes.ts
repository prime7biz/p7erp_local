import { parseIntParam } from "../../utils/parseParams";
import express, { Request, Response } from 'express';
import { db } from '../../db';
import { warehouseTransfers, warehouseTransferItems, stockLedger, warehouses } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { generateDocumentNumber } from '../../utils/documentNumberGenerator';
import { getCurrentStock, getWeightedAverageRate } from '../../services/stockLedgerService';

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

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { status } = req.query as Record<string, string>;

    const conditions: any[] = [eq(warehouseTransfers.tenantId, tenantId)];
    if (status) conditions.push(eq(warehouseTransfers.status, status));

    const transfers = await db.select().from(warehouseTransfers)
      .where(and(...conditions))
      .orderBy(desc(warehouseTransfers.createdAt));

    res.json(transfers);
  } catch (error: any) {
    console.error('Warehouse transfers list error:', error);
    res.status(500).json({ message: error.message || 'Failed to get warehouse transfers' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid transfer ID' });

    const [transfer] = await db.select().from(warehouseTransfers)
      .where(and(eq(warehouseTransfers.id, id), eq(warehouseTransfers.tenantId, tenantId)));
    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });

    const transferItems = await db.select().from(warehouseTransferItems)
      .where(and(eq(warehouseTransferItems.transferId, id), eq(warehouseTransferItems.tenantId, tenantId)));

    res.json({ ...transfer, items: transferItems });
  } catch (error: any) {
    console.error('Warehouse transfer detail error:', error);
    res.status(500).json({ message: error.message || 'Failed to get warehouse transfer' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const { items: transferItemsData, ...headerData } = req.body;

    const transferNumber = await generateDocumentNumber({
      prefix: 'TRF',
      tableName: 'warehouse_transfers',
      columnName: 'transfer_number',
      tenantId,
    });

    const [transfer] = await db.insert(warehouseTransfers).values({
      ...headerData,
      transferNumber,
      tenantId,
      createdBy: userId,
      status: 'DRAFT',
    }).returning();

    if (transferItemsData && Array.isArray(transferItemsData) && transferItemsData.length > 0) {
      const itemValues = transferItemsData.map((item: any) => ({
        transferId: transfer.id,
        itemId: item.itemId,
        itemCode: item.itemCode || null,
        itemName: item.itemName || '',
        transferQty: String(item.transferQty || 0),
        receivedQty: '0',
        unitId: item.unitId || null,
        unitName: item.unitName || null,
        rate: String(item.rate || 0),
        value: String(item.value || 0),
        remarks: item.remarks || null,
        tenantId,
      }));
      await db.insert(warehouseTransferItems).values(itemValues);
    }

    const createdItems = await db.select().from(warehouseTransferItems)
      .where(eq(warehouseTransferItems.transferId, transfer.id));

    res.status(201).json({ ...transfer, items: createdItems });
  } catch (error: any) {
    console.error('Create warehouse transfer error:', error);
    res.status(500).json({ message: error.message || 'Failed to create warehouse transfer' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid transfer ID' });

    const [existing] = await db.select().from(warehouseTransfers)
      .where(and(eq(warehouseTransfers.id, id), eq(warehouseTransfers.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Transfer not found' });
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ message: 'Can only update DRAFT transfers' });
    }

    const { transferNumber, tenantId: _, createdAt, updatedAt, id: _id, items: transferItemsData, ...updateData } = req.body;

    const [updated] = await db.update(warehouseTransfers).set({
      ...updateData,
      updatedAt: new Date(),
    }).where(and(eq(warehouseTransfers.id, id), eq(warehouseTransfers.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Update warehouse transfer error:', error);
    res.status(500).json({ message: error.message || 'Failed to update warehouse transfer' });
  }
});

router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid transfer ID' });

    const [transfer] = await db.select().from(warehouseTransfers)
      .where(and(eq(warehouseTransfers.id, id), eq(warehouseTransfers.tenantId, tenantId)));
    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });

    const [updated] = await db.update(warehouseTransfers).set({
      status: 'APPROVED',
      approvedBy: userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(warehouseTransfers.id, id), eq(warehouseTransfers.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Approve warehouse transfer error:', error);
    res.status(500).json({ message: error.message || 'Failed to approve warehouse transfer' });
  }
});

router.post('/:id/ship', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid transfer ID' });

    const [transfer] = await db.select().from(warehouseTransfers)
      .where(and(eq(warehouseTransfers.id, id), eq(warehouseTransfers.tenantId, tenantId)));
    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });
    if (transfer.status !== 'APPROVED') {
      return res.status(400).json({ message: 'Can only ship APPROVED transfers' });
    }

    const transferItems = await db.select().from(warehouseTransferItems)
      .where(and(eq(warehouseTransferItems.transferId, id), eq(warehouseTransferItems.tenantId, tenantId)));

    for (const item of transferItems) {
      const qty = parseFloat(item.transferQty);
      const currentBalance = await getCurrentStock(item.itemId, transfer.sourceWarehouseId, tenantId);
      const valuationData = await getWeightedAverageRate(item.itemId, transfer.sourceWarehouseId, tenantId);
      const rate = parseFloat(item.rate || '0') > 0 ? parseFloat(item.rate || '0') : valuationData.rate;
      const newBalance = currentBalance - qty;

      await db.insert(stockLedger).values({
        docType: 'WAREHOUSE_TRANSFER_OUT',
        docId: transfer.id,
        docNumber: transfer.transferNumber,
        postingDate: transfer.transferDate,
        itemId: item.itemId,
        itemName: item.itemName,
        warehouseId: transfer.sourceWarehouseId,
        qtyIn: '0',
        qtyOut: String(qty),
        balanceQty: String(newBalance),
        rate: String(rate),
        valuationRate: String(rate),
        valueOut: String(qty * rate),
        balanceValue: String(newBalance * rate),
        remarks: `Stock transferred out via ${transfer.transferNumber}`,
        isReversed: false,
        tenantId,
        createdBy: userId,
      });
    }

    const [updated] = await db.update(warehouseTransfers).set({
      status: 'SHIPPED',
      shippedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(warehouseTransfers.id, id), eq(warehouseTransfers.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Ship warehouse transfer error:', error);
    res.status(500).json({ message: error.message || 'Failed to ship warehouse transfer' });
  }
});

router.post('/:id/receive', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid transfer ID' });

    const [transfer] = await db.select().from(warehouseTransfers)
      .where(and(eq(warehouseTransfers.id, id), eq(warehouseTransfers.tenantId, tenantId)));
    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });
    if (transfer.status !== 'SHIPPED') {
      return res.status(400).json({ message: 'Can only receive SHIPPED transfers' });
    }

    const transferItems = await db.select().from(warehouseTransferItems)
      .where(and(eq(warehouseTransferItems.transferId, id), eq(warehouseTransferItems.tenantId, tenantId)));

    const { receivedItems } = req.body;

    for (const item of transferItems) {
      const receivedQty = receivedItems
        ? parseFloat(receivedItems.find((ri: any) => ri.itemId === item.itemId)?.receivedQty || item.transferQty)
        : parseFloat(item.transferQty);

      const valuationData = await getWeightedAverageRate(item.itemId, transfer.sourceWarehouseId, tenantId);
      const rate = parseFloat(item.rate || '0') > 0 ? parseFloat(item.rate || '0') : valuationData.rate;
      const currentBalance = await getCurrentStock(item.itemId, transfer.destinationWarehouseId, tenantId);
      const newBalance = currentBalance + receivedQty;

      await db.insert(stockLedger).values({
        docType: 'WAREHOUSE_TRANSFER_IN',
        docId: transfer.id,
        docNumber: transfer.transferNumber,
        postingDate: new Date().toISOString().split('T')[0],
        itemId: item.itemId,
        itemName: item.itemName,
        warehouseId: transfer.destinationWarehouseId,
        qtyIn: String(receivedQty),
        qtyOut: '0',
        balanceQty: String(newBalance),
        rate: String(rate),
        valuationRate: String(rate),
        valueIn: String(receivedQty * rate),
        balanceValue: String(newBalance * rate),
        remarks: `Stock transferred in via ${transfer.transferNumber}`,
        isReversed: false,
        tenantId,
        createdBy: userId,
      });

      await db.update(warehouseTransferItems).set({
        receivedQty: String(receivedQty),
      }).where(eq(warehouseTransferItems.id, item.id));
    }

    const [updated] = await db.update(warehouseTransfers).set({
      status: 'RECEIVED',
      receivedAt: new Date(),
      receivedBy: userId,
      updatedAt: new Date(),
    }).where(and(eq(warehouseTransfers.id, id), eq(warehouseTransfers.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Receive warehouse transfer error:', error);
    res.status(500).json({ message: error.message || 'Failed to receive warehouse transfer' });
  }
});

export default router;
