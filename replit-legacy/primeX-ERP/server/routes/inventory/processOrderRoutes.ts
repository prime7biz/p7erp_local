import { parseIntParam } from "../../utils/parseParams";
import express, { Request, Response } from 'express';
import { db } from '../../db';
import { processOrders, items, stockLedger, warehouses } from '@shared/schema';
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
    const { status, processType, orderId } = req.query as Record<string, string>;

    const conditions: any[] = [eq(processOrders.tenantId, tenantId)];
    if (status) conditions.push(eq(processOrders.status, status));
    if (processType) conditions.push(eq(processOrders.processType, processType));
    if (orderId) conditions.push(eq(processOrders.orderId, parseInt(orderId)));

    const orders = await db.select().from(processOrders)
      .where(and(...conditions))
      .orderBy(desc(processOrders.createdAt));

    res.json(orders);
  } catch (error: any) {
    console.error('Process orders list error:', error);
    res.status(500).json({ message: error.message || 'Failed to get process orders' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid process order ID' });

    const [po] = await db.select().from(processOrders)
      .where(and(eq(processOrders.id, id), eq(processOrders.tenantId, tenantId)));

    if (!po) return res.status(404).json({ message: 'Process order not found' });

    res.json(po);
  } catch (error: any) {
    console.error('Process order detail error:', error);
    res.status(500).json({ message: error.message || 'Failed to get process order' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const processNumber = await generateDocumentNumber({
      prefix: 'PRC',
      tableName: 'process_orders',
      columnName: 'process_number',
      tenantId,
    });

    const [created] = await db.insert(processOrders).values({
      ...req.body,
      processNumber,
      tenantId,
      createdBy: userId,
      status: 'DRAFT',
    }).returning();

    res.status(201).json(created);
  } catch (error: any) {
    console.error('Create process order error:', error);
    res.status(500).json({ message: error.message || 'Failed to create process order' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid process order ID' });

    const [existing] = await db.select().from(processOrders)
      .where(and(eq(processOrders.id, id), eq(processOrders.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Process order not found' });
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ message: 'Can only update DRAFT process orders' });
    }

    const { processNumber, tenantId: _, createdAt, updatedAt, id: _id, ...updateData } = req.body;

    const [updated] = await db.update(processOrders).set({
      ...updateData,
      updatedAt: new Date(),
    }).where(and(eq(processOrders.id, id), eq(processOrders.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Update process order error:', error);
    res.status(500).json({ message: error.message || 'Failed to update process order' });
  }
});

router.post('/:id/issue', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid process order ID' });

    const [po] = await db.select().from(processOrders)
      .where(and(eq(processOrders.id, id), eq(processOrders.tenantId, tenantId)));
    if (!po) return res.status(404).json({ message: 'Process order not found' });
    if (po.status !== 'DRAFT') {
      return res.status(400).json({ message: 'Can only issue materials from DRAFT process orders' });
    }

    const currentBalance = await getCurrentStock(po.inputItemId, po.warehouseId, tenantId);
    const inputQty = parseFloat(po.inputQty);
    const inputRate = parseFloat(po.inputRate || '0');
    const valuationData = await getWeightedAverageRate(po.inputItemId, po.warehouseId, tenantId);
    const rate = inputRate > 0 ? inputRate : valuationData.rate;
    const newBalance = currentBalance - inputQty;

    await db.insert(stockLedger).values({
      docType: 'PROCESS_ORDER_ISSUE',
      docId: po.id,
      docNumber: po.processNumber,
      postingDate: new Date().toISOString().split('T')[0],
      itemId: po.inputItemId,
      itemName: po.inputItemName,
      warehouseId: po.warehouseId,
      qtyIn: '0',
      qtyOut: String(inputQty),
      balanceQty: String(newBalance),
      rate: String(rate),
      valuationRate: String(rate),
      valueOut: String(inputQty * rate),
      balanceValue: String(newBalance * rate),
      remarks: `Material issued for process ${po.processNumber} (${po.processType})`,
      isReversed: false,
      tenantId,
      createdBy: userId,
    });

    const [updated] = await db.update(processOrders).set({
      status: 'ISSUED',
      issuedAt: new Date(),
      issuedBy: userId,
      inputRate: String(rate),
      totalInputValue: String(inputQty * rate),
      updatedAt: new Date(),
    }).where(and(eq(processOrders.id, id), eq(processOrders.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Issue process order error:', error);
    res.status(500).json({ message: error.message || 'Failed to issue process order' });
  }
});

router.post('/:id/receive', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid process order ID' });

    const [po] = await db.select().from(processOrders)
      .where(and(eq(processOrders.id, id), eq(processOrders.tenantId, tenantId)));
    if (!po) return res.status(404).json({ message: 'Process order not found' });
    if (po.status !== 'ISSUED') {
      return res.status(400).json({ message: 'Can only receive materials for ISSUED process orders' });
    }

    const { actualOutputQty, processingCharges = '0' } = req.body;
    const inputValue = parseFloat(po.inputQty) * parseFloat(po.inputRate || '0');
    const charges = parseFloat(processingCharges);
    const outputQty = parseFloat(actualOutputQty);
    const processLoss = parseFloat(po.inputQty) - outputQty;
    const outputRate = (inputValue + charges) / outputQty;

    const currentOutputBalance = await getCurrentStock(po.outputItemId, po.warehouseId, tenantId);
    const newOutputBalance = currentOutputBalance + outputQty;

    await db.insert(stockLedger).values({
      docType: 'PROCESS_ORDER_RECEIPT',
      docId: po.id,
      docNumber: po.processNumber,
      postingDate: new Date().toISOString().split('T')[0],
      itemId: po.outputItemId,
      itemName: po.outputItemName,
      warehouseId: po.warehouseId,
      qtyIn: String(outputQty),
      qtyOut: '0',
      balanceQty: String(newOutputBalance),
      rate: String(outputRate),
      valuationRate: String(outputRate),
      valueIn: String(outputQty * outputRate),
      balanceValue: String(newOutputBalance * outputRate),
      remarks: `Material received from process ${po.processNumber} (${po.processType})`,
      isReversed: false,
      tenantId,
      createdBy: userId,
    });

    const [updated] = await db.update(processOrders).set({
      actualOutputQty: String(outputQty),
      processLossQty: String(processLoss),
      actualWastagePercent: String((processLoss / parseFloat(po.inputQty)) * 100),
      processingCharges: processingCharges,
      outputRate: String(outputRate),
      totalInputValue: String(inputValue),
      totalOutputValue: String(outputQty * outputRate),
      processLossValue: String(processLoss * outputRate),
      status: 'RECEIVED',
      receivedAt: new Date(),
      receivedBy: userId,
      updatedAt: new Date(),
    }).where(and(eq(processOrders.id, id), eq(processOrders.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Receive process order error:', error);
    res.status(500).json({ message: error.message || 'Failed to receive process order' });
  }
});

router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid process order ID' });

    const [po] = await db.select().from(processOrders)
      .where(and(eq(processOrders.id, id), eq(processOrders.tenantId, tenantId)));
    if (!po) return res.status(404).json({ message: 'Process order not found' });

    const [updated] = await db.update(processOrders).set({
      status: 'APPROVED',
      approvedBy: userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(processOrders.id, id), eq(processOrders.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Approve process order error:', error);
    res.status(500).json({ message: error.message || 'Failed to approve process order' });
  }
});

export default router;
