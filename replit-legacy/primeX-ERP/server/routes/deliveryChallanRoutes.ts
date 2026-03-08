import { parseIntParam } from "../utils/parseParams";
import express, { Request, Response } from 'express';
import { db } from '../db';
import { deliveryChallans, deliveryChallanItems, parties, orders, customers, vouchers, enhancedGatePasses, enhancedGatePassItems } from '@shared/schema';
import { eq, and, ilike, sql, desc, or, count, gte, lte } from 'drizzle-orm';
import { generateDocumentNumber } from '../utils/documentNumberGenerator';
import { requireLock } from '../middleware/lockMiddleware';
import { postStockFromDeliveryChallan } from '../services/stockLedgerService';
import { assignVerificationCode } from '../services/verificationService';

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

    const [totalResult] = await db.select({ count: count() }).from(deliveryChallans).where(eq(deliveryChallans.tenantId, tenantId));

    const statuses = ['DRAFT', 'SUBMITTED', 'CHECKED', 'RECOMMENDED', 'APPROVED', 'POSTED', 'REJECTED'];
    const statusCounts: Record<string, number> = {};
    for (const status of statuses) {
      const [result] = await db.select({ count: count() }).from(deliveryChallans)
        .where(and(eq(deliveryChallans.tenantId, tenantId), eq(deliveryChallans.workflowStatus, status)));
      statusCounts[status] = result?.count || 0;
    }

    const totalValueResult = await db.select({ total: sql<string>`COALESCE(SUM(CAST(total_amount AS numeric)), 0)` })
      .from(deliveryChallans).where(eq(deliveryChallans.tenantId, tenantId));

    res.json({
      totalChallans: totalResult?.count || 0,
      statusCounts,
      totalValue: totalValueResult[0]?.total || "0",
    });
  } catch (error: any) {
    console.error('Delivery challan summary error:', error);
    res.status(500).json({ message: error.message || 'Failed to get summary' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { search, status, partyId, orderId, dateFrom, dateTo, page = '1', limit = '50' } = req.query as Record<string, string>;

    const conditions: any[] = [eq(deliveryChallans.tenantId, tenantId)];

    if (status && status !== 'all') {
      conditions.push(eq(deliveryChallans.workflowStatus, status));
    }
    if (partyId) {
      conditions.push(eq(deliveryChallans.partyId, parseInt(partyId)));
    }
    if (orderId) {
      conditions.push(eq(deliveryChallans.orderId, parseInt(orderId)));
    }
    if (dateFrom) {
      conditions.push(gte(deliveryChallans.challanDate, dateFrom));
    }
    if (dateTo) {
      conditions.push(lte(deliveryChallans.challanDate, dateTo));
    }
    if (search) {
      conditions.push(
        or(
          ilike(deliveryChallans.challanNumber, `%${search}%`),
          ilike(deliveryChallans.driverName, `%${search}%`),
          ilike(deliveryChallans.vehicleNumber, `%${search}%`)
        )
      );
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await db
      .select({
        challan: deliveryChallans,
        partyName: parties.name,
        partyCode: parties.partyCode,
      })
      .from(deliveryChallans)
      .leftJoin(parties, eq(deliveryChallans.partyId, parties.id))
      .where(and(...conditions))
      .orderBy(desc(deliveryChallans.createdAt))
      .limit(parseInt(limit))
      .offset(offset);

    const [countResult] = await db.select({ count: count() }).from(deliveryChallans).where(and(...conditions));

    const itemCounts = await db
      .select({
        challanId: deliveryChallanItems.challanId,
        itemCount: count(),
      })
      .from(deliveryChallanItems)
      .where(eq(deliveryChallanItems.tenantId, tenantId))
      .groupBy(deliveryChallanItems.challanId);

    const itemCountMap = new Map(itemCounts.map(ic => [ic.challanId, ic.itemCount]));

    const challanList = result.map(r => ({
      ...r.challan,
      partyName: r.partyName,
      partyCode: r.partyCode,
      itemsCount: itemCountMap.get(r.challan.id) || 0,
    }));

    res.json({
      challans: challanList,
      total: countResult?.count || 0,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error: any) {
    console.error('List delivery challans error:', error);
    res.status(500).json({ message: error.message || 'Failed to list delivery challans' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid challan ID' });

    const [result] = await db
      .select({
        challan: deliveryChallans,
        partyName: parties.name,
        partyCode: parties.partyCode,
        partyAddress: parties.address,
      })
      .from(deliveryChallans)
      .leftJoin(parties, eq(deliveryChallans.partyId, parties.id))
      .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)));

    if (!result) return res.status(404).json({ message: 'Delivery challan not found' });

    let challan = result.challan;
    if (!challan.verificationCode) {
      const code = await assignVerificationCode('delivery_challan', id).catch(() => null);
      if (code) challan = { ...challan, verificationCode: code };
    }

    const items = await db.select().from(deliveryChallanItems)
      .where(and(eq(deliveryChallanItems.challanId, id), eq(deliveryChallanItems.tenantId, tenantId)));

    res.json({
      ...challan,
      partyName: result.partyName,
      partyCode: result.partyCode,
      partyAddress: result.partyAddress,
      items,
    });
  } catch (error: any) {
    console.error('Get delivery challan error:', error);
    res.status(500).json({ message: error.message || 'Failed to get delivery challan' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const { challanDate, partyId, customerId, orderId, warehouseId,
      vehicleNumber, driverName, driverContact, transporterName,
      deliveryAddress, receiverName, receiverContact,
      totalQuantity, totalAmount, currency, notes, specialInstructions,
      workflowStatus, items, autoCreateGatePass, sourceDocType, sourceDocId } = req.body;

    if (!challanDate) {
      return res.status(400).json({ message: 'Challan date is required' });
    }

    const challanNumber = await generateDocumentNumber({
      prefix: 'DC',
      tableName: 'delivery_challans',
      columnName: 'challan_number',
      tenantId,
    });

    const [newChallan] = await db.insert(deliveryChallans).values({
      challanNumber,
      challanDate,
      partyId: partyId || null,
      customerId: customerId || null,
      orderId: orderId || null,
      warehouseId: warehouseId || null,
      vehicleNumber: vehicleNumber || null,
      driverName: driverName || null,
      driverContact: driverContact || null,
      transporterName: transporterName || null,
      deliveryAddress: deliveryAddress || null,
      receiverName: receiverName || null,
      receiverContact: receiverContact || null,
      totalQuantity: totalQuantity ? String(totalQuantity) : "0",
      totalAmount: totalAmount ? String(totalAmount) : "0",
      currency: currency || "BDT",
      workflowStatus: workflowStatus || "DRAFT",
      notes: notes || null,
      specialInstructions: specialInstructions || null,
      sourceDocType: sourceDocType || null,
      sourceDocId: sourceDocId || null,
      tenantId,
      createdBy: userId,
    }).returning();

    const challanVerificationCode = await assignVerificationCode('delivery_challan', newChallan.id).catch((err) => {
      console.error("Failed to assign verification code to delivery challan:", err);
      return null;
    });
    const newChallanWithCode = { ...newChallan, verificationCode: challanVerificationCode };

    if (items && Array.isArray(items) && items.length > 0) {
      const itemValues = items.map((item: any) => ({
        challanId: newChallan.id,
        itemId: item.itemId || null,
        itemName: item.itemName || 'Unnamed Item',
        itemCode: item.itemCode || null,
        description: item.description || null,
        quantity: String(item.quantity || 0),
        unit: item.unit || null,
        rate: item.rate ? String(item.rate) : null,
        amount: item.amount ? String(item.amount) : null,
        batchNumber: item.batchNumber || null,
        color: item.color || null,
        size: item.size || null,
        remarks: item.remarks || null,
        tenantId,
      }));
      await db.insert(deliveryChallanItems).values(itemValues);
    }

    if (autoCreateGatePass) {
      const [existingGP] = await db.select().from(enhancedGatePasses)
        .where(and(
          eq(enhancedGatePasses.linkedDocType, 'DELIVERY_CHALLAN'),
          eq(enhancedGatePasses.linkedDocId, newChallan.id),
          eq(enhancedGatePasses.tenantId, tenantId)
        ));

      if (existingGP) {
        return res.status(201).json({ challan: newChallanWithCode, linkedGatePass: existingGP });
      }

      const gatePassNumber = await generateDocumentNumber({
        prefix: 'GPO',
        tableName: 'enhanced_gate_passes',
        columnName: 'gate_pass_number',
        tenantId,
      });

      const [newGatePass] = await db.insert(enhancedGatePasses).values({
        gatePassNumber,
        gatePassDate: challanDate,
        gatePassType: 'GP_OUT',
        partyId: newChallan.partyId || null,
        orderId: newChallan.orderId || null,
        warehouseId: newChallan.warehouseId || null,
        vehicleNumber: newChallan.vehicleNumber || null,
        driverName: newChallan.driverName || null,
        driverContact: newChallan.driverContact || null,
        transporterName: newChallan.transporterName || null,
        deliveryChallanId: newChallan.id,
        linkedDocType: 'DELIVERY_CHALLAN',
        linkedDocId: newChallan.id,
        totalQuantity: newChallan.totalQuantity || "0",
        workflowStatus: "DRAFT",
        purpose: `Outward gate pass for Delivery Challan ${newChallan.challanNumber}`,
        tenantId,
        createdBy: userId,
      }).returning();

      const dcItems = await db.select().from(deliveryChallanItems)
        .where(and(eq(deliveryChallanItems.challanId, newChallan.id), eq(deliveryChallanItems.tenantId, tenantId)));

      if (dcItems.length > 0) {
        const gpItemValues = dcItems.map((item: any) => ({
          gatePassId: newGatePass.id,
          itemId: item.itemId || null,
          itemName: item.itemName || 'Unnamed Item',
          itemCode: item.itemCode || null,
          description: item.description || null,
          quantity: String(item.quantity || 0),
          unit: item.unit || null,
          batchNumber: item.batchNumber || null,
          remarks: item.remarks || null,
          condition: 'good',
          tenantId,
        }));
        await db.insert(enhancedGatePassItems).values(gpItemValues);

        await db.update(enhancedGatePasses)
          .set({ totalItems: dcItems.length })
          .where(eq(enhancedGatePasses.id, newGatePass.id));
      }

      if (!newChallan.sourceDocType) {
        await db.update(deliveryChallans)
          .set({ sourceDocType: 'GATE_PASS', sourceDocId: newGatePass.id, updatedAt: new Date() })
          .where(and(eq(deliveryChallans.id, newChallan.id), eq(deliveryChallans.tenantId, tenantId)));
      }

      return res.status(201).json({ challan: newChallanWithCode, linkedGatePass: newGatePass });
    }

    res.status(201).json(newChallanWithCode);
  } catch (error: any) {
    console.error('Create delivery challan error:', error);
    res.status(500).json({ message: error.message || 'Failed to create delivery challan' });
  }
});

router.put('/:id', requireLock('delivery_challan'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid challan ID' });

    const [existing] = await db.select().from(deliveryChallans)
      .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Delivery challan not found' });
    if (existing.workflowStatus !== 'DRAFT') {
      return res.status(400).json({ message: 'Can only edit challans in DRAFT status' });
    }

    const { challanDate, partyId, customerId, orderId, warehouseId,
      vehicleNumber, driverName, driverContact, transporterName,
      deliveryAddress, receiverName, receiverContact,
      totalQuantity, totalAmount, currency, notes, specialInstructions, items } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (challanDate !== undefined) updateData.challanDate = challanDate;
    if (partyId !== undefined) updateData.partyId = partyId;
    if (customerId !== undefined) updateData.customerId = customerId;
    if (orderId !== undefined) updateData.orderId = orderId;
    if (warehouseId !== undefined) updateData.warehouseId = warehouseId;
    if (vehicleNumber !== undefined) updateData.vehicleNumber = vehicleNumber;
    if (driverName !== undefined) updateData.driverName = driverName;
    if (driverContact !== undefined) updateData.driverContact = driverContact;
    if (transporterName !== undefined) updateData.transporterName = transporterName;
    if (deliveryAddress !== undefined) updateData.deliveryAddress = deliveryAddress;
    if (receiverName !== undefined) updateData.receiverName = receiverName;
    if (receiverContact !== undefined) updateData.receiverContact = receiverContact;
    if (totalQuantity !== undefined) updateData.totalQuantity = String(totalQuantity);
    if (totalAmount !== undefined) updateData.totalAmount = String(totalAmount);
    if (currency !== undefined) updateData.currency = currency;
    if (notes !== undefined) updateData.notes = notes;
    if (specialInstructions !== undefined) updateData.specialInstructions = specialInstructions;

    if (existing.sourceDocType) {
      updateData.isManuallyModified = true;
    }

    const [updated] = await db.update(deliveryChallans)
      .set(updateData)
      .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)))
      .returning();

    if (items && Array.isArray(items)) {
      await db.delete(deliveryChallanItems)
        .where(and(eq(deliveryChallanItems.challanId, id), eq(deliveryChallanItems.tenantId, tenantId)));

      if (items.length > 0) {
        const itemValues = items.map((item: any) => ({
          challanId: id,
          itemId: item.itemId || null,
          itemName: item.itemName || 'Unnamed Item',
          itemCode: item.itemCode || null,
          description: item.description || null,
          quantity: String(item.quantity || 0),
          unit: item.unit || null,
          rate: item.rate ? String(item.rate) : null,
          amount: item.amount ? String(item.amount) : null,
          batchNumber: item.batchNumber || null,
          color: item.color || null,
          size: item.size || null,
          remarks: item.remarks || null,
          tenantId,
        }));
        await db.insert(deliveryChallanItems).values(itemValues);
      }
    }

    res.json(updated);
  } catch (error: any) {
    console.error('Update delivery challan error:', error);
    res.status(500).json({ message: error.message || 'Failed to update delivery challan' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid challan ID' });

    const [existing] = await db.select().from(deliveryChallans)
      .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Delivery challan not found' });
    if (existing.workflowStatus !== 'DRAFT') {
      return res.status(400).json({ message: 'Can only delete challans in DRAFT status' });
    }

    await db.delete(deliveryChallanItems)
      .where(and(eq(deliveryChallanItems.challanId, id), eq(deliveryChallanItems.tenantId, tenantId)));
    await db.delete(deliveryChallans)
      .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)));

    res.json({ message: 'Delivery challan deleted successfully' });
  } catch (error: any) {
    console.error('Delete delivery challan error:', error);
    res.status(500).json({ message: error.message || 'Failed to delete delivery challan' });
  }
});

const WORKFLOW_TRANSITIONS: Record<string, { from: string; to: string }> = {
  submit: { from: 'DRAFT', to: 'SUBMITTED' },
  check: { from: 'SUBMITTED', to: 'CHECKED' },
  recommend: { from: 'CHECKED', to: 'RECOMMENDED' },
  approve: { from: 'RECOMMENDED', to: 'APPROVED' },
};

for (const [action, transition] of Object.entries(WORKFLOW_TRANSITIONS)) {
  router.post(`/:id/${action}`, async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const id = parseIntParam(req.params.id, "id");
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid challan ID' });

      const [existing] = await db.select().from(deliveryChallans)
        .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)));
      if (!existing) return res.status(404).json({ message: 'Delivery challan not found' });

      if (existing.workflowStatus !== transition.from) {
        return res.status(400).json({
          message: `Cannot ${action}. Current status is ${existing.workflowStatus}, expected ${transition.from}`,
        });
      }

      const [updated] = await db.update(deliveryChallans)
        .set({ workflowStatus: transition.to, updatedAt: new Date() })
        .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)))
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error(`Delivery challan ${action} error:`, error);
      res.status(500).json({ message: error.message || `Failed to ${action} delivery challan` });
    }
  });
}

router.post('/:id/post', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid challan ID' });

    const [existing] = await db.select().from(deliveryChallans)
      .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Delivery challan not found' });

    if (existing.workflowStatus !== 'APPROVED') {
      return res.status(400).json({ message: `Cannot post. Current status is ${existing.workflowStatus}, expected APPROVED` });
    }

    const [updated] = await db.update(deliveryChallans)
      .set({
        workflowStatus: 'POSTED',
        isPosted: true,
        postedById: userId,
        postedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)))
      .returning();

    let stockPostingResult = null;
    let stockPostingError = null;
    try {
      stockPostingResult = await postStockFromDeliveryChallan(id, tenantId, userId);
    } catch (stockErr: any) {
      console.error('Stock posting error:', stockErr);
      stockPostingError = stockErr.message || 'Stock posting failed';
    }

    res.json({ 
      ...updated, 
      stockPosted: !stockPostingError,
      stockPostingError: stockPostingError || undefined,
    });
  } catch (error: any) {
    console.error('Delivery challan post error:', error);
    res.status(500).json({ message: error.message || 'Failed to post delivery challan' });
  }
});

router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid challan ID' });

    const { reason } = req.body;

    const [existing] = await db.select().from(deliveryChallans)
      .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Delivery challan not found' });

    if (existing.workflowStatus === 'POSTED') {
      return res.status(400).json({ message: 'Cannot reject a posted challan' });
    }

    const [updated] = await db.update(deliveryChallans)
      .set({
        workflowStatus: 'REJECTED',
        notes: reason ? `${existing.notes || ''}\n[REJECTED]: ${reason}`.trim() : existing.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Delivery challan reject error:', error);
    res.status(500).json({ message: error.message || 'Failed to reject delivery challan' });
  }
});

router.post('/:id/create-invoice', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid challan ID' });

    const [existing] = await db.select().from(deliveryChallans)
      .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Delivery challan not found' });

    if (!existing.isPosted) {
      return res.status(400).json({ message: 'Challan must be posted before creating invoice' });
    }
    if (existing.invoiceCreated) {
      return res.status(400).json({ message: 'Invoice already created for this challan' });
    }

    const now = new Date();
    const voucherNumber = `INV-${existing.challanNumber.replace('DC-', '')}`;

    const [newVoucher] = await db.insert(vouchers).values({
      voucherNumber,
      voucherDate: now.toISOString().split('T')[0],
      voucherTypeId: 1,
      statusId: 1,
      fiscalYearId: 1,
      accountingPeriodId: 1,
      reference: existing.challanNumber,
      referenceDate: existing.challanDate,
      description: `Sales Invoice from Delivery Challan ${existing.challanNumber}`,
      amount: existing.totalAmount || "0",
      currencyCode: existing.currency || "BDT",
      exchangeRate: "1",
      tenantId,
      preparedById: userId,
      isPosted: false,
      isCancelled: false,
    } as any).returning();

    await db.update(deliveryChallans)
      .set({
        invoiceCreated: true,
        invoiceVoucherId: newVoucher.id,
        updatedAt: new Date(),
      })
      .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)));

    res.json({ message: 'Invoice created successfully', voucherId: newVoucher.id, voucherNumber });
  } catch (error: any) {
    console.error('Create invoice from challan error:', error);
    res.status(500).json({ message: error.message || 'Failed to create invoice' });
  }
});

router.post('/:id/resync-from-source', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid challan ID' });

    const { force } = req.body || {};

    const [challan] = await db.select().from(deliveryChallans)
      .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)));
    if (!challan) return res.status(404).json({ message: 'Delivery challan not found' });

    if (challan.workflowStatus !== 'DRAFT') {
      return res.status(400).json({ message: 'Can only resync challans in DRAFT status' });
    }
    if (challan.sourceDocType !== 'GATE_PASS' || !challan.sourceDocId) {
      return res.status(400).json({ message: 'Challan has no source gate pass to resync from' });
    }
    if (challan.isManuallyModified && !force) {
      return res.status(400).json({ message: 'Challan has been manually modified. Set force=true to override.' });
    }

    const [sourceGP] = await db.select().from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.id, challan.sourceDocId), eq(enhancedGatePasses.tenantId, tenantId)));
    if (!sourceGP) return res.status(404).json({ message: 'Source gate pass not found' });

    const gpItems = await db.select().from(enhancedGatePassItems)
      .where(and(eq(enhancedGatePassItems.gatePassId, sourceGP.id), eq(enhancedGatePassItems.tenantId, tenantId)));

    await db.update(deliveryChallans)
      .set({
        partyId: sourceGP.partyId,
        vehicleNumber: sourceGP.vehicleNumber,
        driverName: sourceGP.driverName,
        driverContact: sourceGP.driverContact,
        transporterName: sourceGP.transporterName,
        orderId: sourceGP.orderId,
        warehouseId: sourceGP.warehouseId,
        totalQuantity: sourceGP.totalQuantity || "0",
        isManuallyModified: false,
        updatedAt: new Date(),
      })
      .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)));

    await db.delete(deliveryChallanItems)
      .where(and(eq(deliveryChallanItems.challanId, id), eq(deliveryChallanItems.tenantId, tenantId)));

    if (gpItems.length > 0) {
      const dcItemValues = gpItems.map((item: any) => ({
        challanId: id,
        itemId: item.itemId || null,
        itemName: item.itemName || 'Unnamed Item',
        itemCode: item.itemCode || null,
        description: item.description || null,
        quantity: String(item.quantity || 0),
        unit: item.unit || null,
        batchNumber: item.batchNumber || null,
        remarks: item.remarks || null,
        tenantId,
      }));
      await db.insert(deliveryChallanItems).values(dcItemValues);
    }

    const [updatedChallan] = await db.select().from(deliveryChallans)
      .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)));

    res.json(updatedChallan);
  } catch (error: any) {
    console.error('Resync from source error:', error);
    res.status(500).json({ message: error.message || 'Failed to resync from source' });
  }
});

router.get('/:id/linked-document', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid challan ID' });

    const [challan] = await db.select().from(deliveryChallans)
      .where(and(eq(deliveryChallans.id, id), eq(deliveryChallans.tenantId, tenantId)));
    if (!challan) return res.status(404).json({ message: 'Delivery challan not found' });

    let sourceDoc = null;
    if (challan.sourceDocType === 'GATE_PASS' && challan.sourceDocId) {
      const [gp] = await db.select().from(enhancedGatePasses)
        .where(and(eq(enhancedGatePasses.id, challan.sourceDocId), eq(enhancedGatePasses.tenantId, tenantId)));
      if (gp) {
        sourceDoc = {
          docType: challan.sourceDocType,
          docId: challan.sourceDocId,
          docNumber: gp.gatePassNumber,
          docStatus: gp.workflowStatus,
        };
      }
    }

    const linkedGPs = await db.select().from(enhancedGatePasses)
      .where(and(
        eq(enhancedGatePasses.linkedDocType, 'DELIVERY_CHALLAN'),
        eq(enhancedGatePasses.linkedDocId, id),
        eq(enhancedGatePasses.tenantId, tenantId)
      ));

    const linkedGatePasses = linkedGPs.map(gp => ({
      docType: 'GATE_PASS',
      docId: gp.id,
      docNumber: gp.gatePassNumber,
      docStatus: gp.workflowStatus,
    }));

    res.json({ sourceDoc, linkedGatePasses });
  } catch (error: any) {
    console.error('Get linked document error:', error);
    res.status(500).json({ message: error.message || 'Failed to get linked document' });
  }
});

export default router;