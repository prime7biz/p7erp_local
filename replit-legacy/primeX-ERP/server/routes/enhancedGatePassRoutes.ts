import { parseIntParam } from "../utils/parseParams";
import express, { Request, Response } from 'express';
import { db } from '../db';
import { enhancedGatePasses, enhancedGatePassItems, parties, deliveryChallans, deliveryChallanItems } from '@shared/schema';
import { eq, and, ilike, sql, desc, or, count, gte, lte } from 'drizzle-orm';
import { generateDocumentNumber } from '../utils/documentNumberGenerator';
import { requireLock } from '../middleware/lockMiddleware';
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
    const today = new Date().toISOString().split('T')[0];

    const [totalToday] = await db.select({ count: count() }).from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.tenantId, tenantId), eq(enhancedGatePasses.gatePassDate, today)));

    const [inwardToday] = await db.select({ count: count() }).from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.tenantId, tenantId), eq(enhancedGatePasses.gatePassDate, today), eq(enhancedGatePasses.gatePassType, 'GP_IN')));

    const [outwardToday] = await db.select({ count: count() }).from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.tenantId, tenantId), eq(enhancedGatePasses.gatePassDate, today), eq(enhancedGatePasses.gatePassType, 'GP_OUT')));

    const [pendingAck] = await db.select({ count: count() }).from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.tenantId, tenantId), eq(enhancedGatePasses.guardAcknowledged, false), eq(enhancedGatePasses.workflowStatus, 'APPROVED')));

    const [totalAll] = await db.select({ count: count() }).from(enhancedGatePasses)
      .where(eq(enhancedGatePasses.tenantId, tenantId));

    const [totalInward] = await db.select({ count: count() }).from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.tenantId, tenantId), eq(enhancedGatePasses.gatePassType, 'GP_IN')));

    const [totalOutward] = await db.select({ count: count() }).from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.tenantId, tenantId), eq(enhancedGatePasses.gatePassType, 'GP_OUT')));

    res.json({
      totalToday: totalToday?.count || 0,
      inwardToday: inwardToday?.count || 0,
      outwardToday: outwardToday?.count || 0,
      pendingAcknowledgment: pendingAck?.count || 0,
      totalAll: totalAll?.count || 0,
      totalInward: totalInward?.count || 0,
      totalOutward: totalOutward?.count || 0,
    });
  } catch (error: any) {
    console.error('Gate pass summary error:', error);
    res.status(500).json({ message: error.message || 'Failed to get summary' });
  }
});

router.get('/register', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { dateFrom, dateTo, page = '1', limit = '100' } = req.query as Record<string, string>;

    const conditions: any[] = [eq(enhancedGatePasses.tenantId, tenantId)];
    if (dateFrom) conditions.push(gte(enhancedGatePasses.gatePassDate, dateFrom));
    if (dateTo) conditions.push(lte(enhancedGatePasses.gatePassDate, dateTo));

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await db
      .select({
        gatePass: enhancedGatePasses,
        partyName: parties.name,
      })
      .from(enhancedGatePasses)
      .leftJoin(parties, eq(enhancedGatePasses.partyId, parties.id))
      .where(and(...conditions))
      .orderBy(desc(enhancedGatePasses.gatePassDate), desc(enhancedGatePasses.id))
      .limit(parseInt(limit))
      .offset(offset);

    const [countResult] = await db.select({ count: count() }).from(enhancedGatePasses).where(and(...conditions));

    const register = result.map(r => ({
      ...r.gatePass,
      partyDisplayName: r.partyName || r.gatePass.partyName,
    }));

    res.json({
      register,
      total: countResult?.count || 0,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error: any) {
    console.error('Gate pass register error:', error);
    res.status(500).json({ message: error.message || 'Failed to get register' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { search, gatePassType, status, partyId, dateFrom, dateTo, page = '1', limit = '50' } = req.query as Record<string, string>;

    const conditions: any[] = [eq(enhancedGatePasses.tenantId, tenantId)];

    if (gatePassType && gatePassType !== 'all') {
      conditions.push(eq(enhancedGatePasses.gatePassType, gatePassType));
    }
    if (status && status !== 'all') {
      conditions.push(eq(enhancedGatePasses.workflowStatus, status));
    }
    if (partyId) {
      conditions.push(eq(enhancedGatePasses.partyId, parseInt(partyId)));
    }
    if (dateFrom) {
      conditions.push(gte(enhancedGatePasses.gatePassDate, dateFrom));
    }
    if (dateTo) {
      conditions.push(lte(enhancedGatePasses.gatePassDate, dateTo));
    }
    if (search) {
      conditions.push(
        or(
          ilike(enhancedGatePasses.gatePassNumber, `%${search}%`),
          ilike(enhancedGatePasses.partyName, `%${search}%`),
          ilike(enhancedGatePasses.vehicleNumber, `%${search}%`),
          ilike(enhancedGatePasses.driverName, `%${search}%`)
        )
      );
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const result = await db
      .select({
        gatePass: enhancedGatePasses,
        partyDisplayName: parties.name,
        partyCode: parties.partyCode,
      })
      .from(enhancedGatePasses)
      .leftJoin(parties, eq(enhancedGatePasses.partyId, parties.id))
      .where(and(...conditions))
      .orderBy(desc(enhancedGatePasses.createdAt))
      .limit(parseInt(limit))
      .offset(offset);

    const [countResult] = await db.select({ count: count() }).from(enhancedGatePasses).where(and(...conditions));

    const itemCounts = await db
      .select({
        gatePassId: enhancedGatePassItems.gatePassId,
        itemCount: count(),
      })
      .from(enhancedGatePassItems)
      .where(eq(enhancedGatePassItems.tenantId, tenantId))
      .groupBy(enhancedGatePassItems.gatePassId);

    const itemCountMap = new Map(itemCounts.map(ic => [ic.gatePassId, ic.itemCount]));

    const gatePasses = result.map(r => ({
      ...r.gatePass,
      partyDisplayName: r.partyDisplayName || r.gatePass.partyName,
      partyCode: r.partyCode,
      itemsCount: itemCountMap.get(r.gatePass.id) || 0,
    }));

    res.json({
      gatePasses,
      total: countResult?.count || 0,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error: any) {
    console.error('List gate passes error:', error);
    res.status(500).json({ message: error.message || 'Failed to list gate passes' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid gate pass ID' });

    const [result] = await db
      .select({
        gatePass: enhancedGatePasses,
        partyDisplayName: parties.name,
        partyCode: parties.partyCode,
      })
      .from(enhancedGatePasses)
      .leftJoin(parties, eq(enhancedGatePasses.partyId, parties.id))
      .where(and(eq(enhancedGatePasses.id, id), eq(enhancedGatePasses.tenantId, tenantId)));

    if (!result) return res.status(404).json({ message: 'Gate pass not found' });

    let gatePass = result.gatePass;
    if (!gatePass.verificationCode) {
      const code = await assignVerificationCode('gate_pass', id).catch(() => null);
      if (code) gatePass = { ...gatePass, verificationCode: code };
    }

    const items = await db.select().from(enhancedGatePassItems)
      .where(and(eq(enhancedGatePassItems.gatePassId, id), eq(enhancedGatePassItems.tenantId, tenantId)));

    res.json({
      ...gatePass,
      partyDisplayName: result.partyDisplayName || result.gatePass.partyName,
      partyCode: result.partyCode,
      items,
    });
  } catch (error: any) {
    console.error('Get gate pass error:', error);
    res.status(500).json({ message: error.message || 'Failed to get gate pass' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);

    const { gatePassDate, gatePassType, partyId, partyName, deliveryChallanId, grnId,
      purchaseOrderId, orderId, warehouseId, vehicleNumber, vehicleType,
      driverName, driverContact, driverLicense, transporterName,
      securityGuardName, securityCheckpoint, purpose, notes, remarks,
      totalQuantity, items } = req.body;

    if (!gatePassDate || !gatePassType) {
      return res.status(400).json({ message: 'Gate pass date and type are required' });
    }
    if (!['GP_IN', 'GP_OUT'].includes(gatePassType)) {
      return res.status(400).json({ message: 'Gate pass type must be GP_IN or GP_OUT' });
    }

    const prefix = gatePassType === 'GP_IN' ? 'GPI' : 'GPO';
    const gatePassNumber = await generateDocumentNumber({
      prefix,
      tableName: 'enhanced_gate_passes',
      columnName: 'gate_pass_number',
      tenantId,
    });

    const [newGatePass] = await db.insert(enhancedGatePasses).values({
      gatePassNumber,
      gatePassDate,
      gatePassType,
      partyId: partyId || null,
      partyName: partyName || null,
      deliveryChallanId: deliveryChallanId || null,
      grnId: grnId || null,
      purchaseOrderId: purchaseOrderId || null,
      orderId: orderId || null,
      warehouseId: warehouseId || null,
      vehicleNumber: vehicleNumber || null,
      vehicleType: vehicleType || null,
      driverName: driverName || null,
      driverContact: driverContact || null,
      driverLicense: driverLicense || null,
      transporterName: transporterName || null,
      securityGuardName: securityGuardName || null,
      securityCheckpoint: securityCheckpoint || null,
      purpose: purpose || null,
      notes: notes || null,
      remarks: remarks || null,
      totalItems: items?.length || 0,
      totalQuantity: totalQuantity ? String(totalQuantity) : "0",
      workflowStatus: "DRAFT",
      tenantId,
      createdBy: userId,
    }).returning();

    const gpVerificationCode = await assignVerificationCode('gate_pass', newGatePass.id).catch((err) => {
      console.error("Failed to assign verification code to gate pass:", err);
      return null;
    });
    const newGatePassWithCode = { ...newGatePass, verificationCode: gpVerificationCode };

    if (items && Array.isArray(items) && items.length > 0) {
      const itemValues = items.map((item: any) => ({
        gatePassId: newGatePass.id,
        itemId: item.itemId || null,
        itemName: item.itemName || 'Unnamed Item',
        itemCode: item.itemCode || null,
        description: item.description || null,
        quantity: String(item.quantity || 0),
        unit: item.unit || null,
        weight: item.weight ? String(item.weight) : null,
        batchNumber: item.batchNumber || null,
        condition: item.condition || 'good',
        remarks: item.remarks || null,
        tenantId,
      }));
      await db.insert(enhancedGatePassItems).values(itemValues);
    }

    if (gatePassType === 'GP_OUT' && autoCreateChallan) {
      const [existingDC] = await db.select().from(deliveryChallans)
        .where(and(
          eq(deliveryChallans.sourceDocType, 'GATE_PASS'),
          eq(deliveryChallans.sourceDocId, newGatePass.id),
          eq(deliveryChallans.tenantId, tenantId)
        ));

      if (existingDC) {
        await db.update(enhancedGatePasses)
          .set({ linkedDocType: 'DELIVERY_CHALLAN', linkedDocId: existingDC.id, updatedAt: new Date() })
          .where(eq(enhancedGatePasses.id, newGatePass.id));
        const [updatedGP] = await db.select().from(enhancedGatePasses).where(eq(enhancedGatePasses.id, newGatePass.id));
        return res.status(201).json({ gatePass: updatedGP, linkedChallan: existingDC });
      }

      const dcNumber = await generateDocumentNumber({
        prefix: 'DC',
        tableName: 'delivery_challans',
        columnName: 'challan_number',
        tenantId,
      });

      const [newChallan] = await db.insert(deliveryChallans).values({
        challanNumber: dcNumber,
        challanDate: gatePassDate,
        partyId: newGatePass.partyId || null,
        orderId: newGatePass.orderId || null,
        warehouseId: newGatePass.warehouseId || null,
        vehicleNumber: newGatePass.vehicleNumber || null,
        driverName: newGatePass.driverName || null,
        driverContact: newGatePass.driverContact || null,
        transporterName: newGatePass.transporterName || null,
        totalQuantity: newGatePass.totalQuantity || "0",
        workflowStatus: "DRAFT",
        sourceDocType: 'GATE_PASS',
        sourceDocId: newGatePass.id,
        tenantId,
        createdBy: userId,
      }).returning();

      const gpItems = await db.select().from(enhancedGatePassItems)
        .where(and(eq(enhancedGatePassItems.gatePassId, newGatePass.id), eq(enhancedGatePassItems.tenantId, tenantId)));

      if (gpItems.length > 0) {
        const dcItemValues = gpItems.map((item: any) => ({
          challanId: newChallan.id,
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

      await db.update(enhancedGatePasses)
        .set({ linkedDocType: 'DELIVERY_CHALLAN', linkedDocId: newChallan.id, updatedAt: new Date() })
        .where(eq(enhancedGatePasses.id, newGatePass.id));

      const [updatedGP] = await db.select().from(enhancedGatePasses).where(eq(enhancedGatePasses.id, newGatePass.id));
      return res.status(201).json({ gatePass: updatedGP, linkedChallan: newChallan });
    }

    res.status(201).json(newGatePassWithCode);
  } catch (error: any) {
    console.error('Create gate pass error:', error);
    res.status(500).json({ message: error.message || 'Failed to create gate pass' });
  }
});

router.put('/:id', requireLock('enhanced_gate_pass'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid gate pass ID' });

    const [existing] = await db.select().from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.id, id), eq(enhancedGatePasses.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Gate pass not found' });
    if (existing.workflowStatus !== 'DRAFT') {
      return res.status(400).json({ message: 'Can only edit gate passes in DRAFT status' });
    }

    const { gatePassDate, gatePassType, partyId, partyName, deliveryChallanId, grnId,
      purchaseOrderId, orderId, warehouseId, vehicleNumber, vehicleType,
      driverName, driverContact, driverLicense, transporterName,
      securityGuardName, securityCheckpoint, purpose, notes, remarks,
      totalQuantity, items } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (gatePassDate !== undefined) updateData.gatePassDate = gatePassDate;
    if (gatePassType !== undefined) updateData.gatePassType = gatePassType;
    if (partyId !== undefined) updateData.partyId = partyId;
    if (partyName !== undefined) updateData.partyName = partyName;
    if (deliveryChallanId !== undefined) updateData.deliveryChallanId = deliveryChallanId;
    if (grnId !== undefined) updateData.grnId = grnId;
    if (purchaseOrderId !== undefined) updateData.purchaseOrderId = purchaseOrderId;
    if (orderId !== undefined) updateData.orderId = orderId;
    if (warehouseId !== undefined) updateData.warehouseId = warehouseId;
    if (vehicleNumber !== undefined) updateData.vehicleNumber = vehicleNumber;
    if (vehicleType !== undefined) updateData.vehicleType = vehicleType;
    if (driverName !== undefined) updateData.driverName = driverName;
    if (driverContact !== undefined) updateData.driverContact = driverContact;
    if (driverLicense !== undefined) updateData.driverLicense = driverLicense;
    if (transporterName !== undefined) updateData.transporterName = transporterName;
    if (securityGuardName !== undefined) updateData.securityGuardName = securityGuardName;
    if (securityCheckpoint !== undefined) updateData.securityCheckpoint = securityCheckpoint;
    if (purpose !== undefined) updateData.purpose = purpose;
    if (notes !== undefined) updateData.notes = notes;
    if (remarks !== undefined) updateData.remarks = remarks;
    if (totalQuantity !== undefined) updateData.totalQuantity = String(totalQuantity);

    const [updated] = await db.update(enhancedGatePasses)
      .set(updateData)
      .where(and(eq(enhancedGatePasses.id, id), eq(enhancedGatePasses.tenantId, tenantId)))
      .returning();

    if (items && Array.isArray(items)) {
      await db.delete(enhancedGatePassItems)
        .where(and(eq(enhancedGatePassItems.gatePassId, id), eq(enhancedGatePassItems.tenantId, tenantId)));

      if (items.length > 0) {
        const itemValues = items.map((item: any) => ({
          gatePassId: id,
          itemId: item.itemId || null,
          itemName: item.itemName || 'Unnamed Item',
          itemCode: item.itemCode || null,
          description: item.description || null,
          quantity: String(item.quantity || 0),
          unit: item.unit || null,
          weight: item.weight ? String(item.weight) : null,
          batchNumber: item.batchNumber || null,
          condition: item.condition || 'good',
          remarks: item.remarks || null,
          tenantId,
        }));
        await db.insert(enhancedGatePassItems).values(itemValues);
      }

      await db.update(enhancedGatePasses)
        .set({ totalItems: items.length })
        .where(eq(enhancedGatePasses.id, id));
    }

    res.json(updated);
  } catch (error: any) {
    console.error('Update gate pass error:', error);
    res.status(500).json({ message: error.message || 'Failed to update gate pass' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid gate pass ID' });

    const [existing] = await db.select().from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.id, id), eq(enhancedGatePasses.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Gate pass not found' });
    if (existing.workflowStatus !== 'DRAFT') {
      return res.status(400).json({ message: 'Can only delete gate passes in DRAFT status' });
    }

    await db.delete(enhancedGatePassItems)
      .where(and(eq(enhancedGatePassItems.gatePassId, id), eq(enhancedGatePassItems.tenantId, tenantId)));
    await db.delete(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.id, id), eq(enhancedGatePasses.tenantId, tenantId)));

    res.json({ message: 'Gate pass deleted successfully' });
  } catch (error: any) {
    console.error('Delete gate pass error:', error);
    res.status(500).json({ message: error.message || 'Failed to delete gate pass' });
  }
});

router.post('/from-delivery-challan/:challanId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const challanId = parseIntParam(req.params.challanId, "challanId");
    if (isNaN(challanId)) return res.status(400).json({ message: 'Invalid challan ID' });

    const [existingGP] = await db.select().from(enhancedGatePasses)
      .where(and(
        eq(enhancedGatePasses.linkedDocType, 'DELIVERY_CHALLAN'),
        eq(enhancedGatePasses.linkedDocId, challanId),
        eq(enhancedGatePasses.tenantId, tenantId)
      ));
    if (existingGP) {
      return res.status(200).json(existingGP);
    }

    const [challan] = await db.select().from(deliveryChallans)
      .where(and(eq(deliveryChallans.id, challanId), eq(deliveryChallans.tenantId, tenantId)));
    if (!challan) return res.status(404).json({ message: 'Delivery challan not found' });

    let partyDisplayName = null;
    if (challan.partyId) {
      const [party] = await db.select().from(parties).where(eq(parties.id, challan.partyId));
      if (party) partyDisplayName = party.name;
    }

    const challanItems = await db.select().from(deliveryChallanItems)
      .where(and(eq(deliveryChallanItems.challanId, challanId), eq(deliveryChallanItems.tenantId, tenantId)));

    const gatePassNumber = await generateDocumentNumber({
      prefix: 'GPO',
      tableName: 'enhanced_gate_passes',
      columnName: 'gate_pass_number',
      tenantId,
    });
    const today = new Date().toISOString().split('T')[0];

    const [newGatePass] = await db.insert(enhancedGatePasses).values({
      gatePassNumber,
      gatePassDate: today,
      gatePassType: 'GP_OUT',
      partyId: challan.partyId,
      partyName: partyDisplayName,
      deliveryChallanId: challanId,
      orderId: challan.orderId,
      warehouseId: challan.warehouseId,
      vehicleNumber: challan.vehicleNumber,
      driverName: challan.driverName,
      driverContact: challan.driverContact,
      transporterName: challan.transporterName,
      totalItems: challanItems.length,
      totalQuantity: challan.totalQuantity || "0",
      workflowStatus: "DRAFT",
      purpose: `Outward gate pass for Delivery Challan ${challan.challanNumber}`,
      linkedDocType: 'DELIVERY_CHALLAN',
      linkedDocId: challanId,
      tenantId,
      createdBy: userId,
    }).returning();

    if (challanItems.length > 0) {
      const itemValues = challanItems.map((item: any) => ({
        gatePassId: newGatePass.id,
        itemId: item.itemId || null,
        itemName: item.itemName || 'Unnamed Item',
        itemCode: item.itemCode || null,
        description: item.description || null,
        quantity: String(item.quantity || 0),
        unit: item.unit || null,
        weight: null,
        batchNumber: item.batchNumber || null,
        condition: 'good',
        remarks: item.remarks || null,
        tenantId,
      }));
      await db.insert(enhancedGatePassItems).values(itemValues);
    }

    await db.update(deliveryChallans)
      .set({ sourceDocType: 'GATE_PASS', sourceDocId: newGatePass.id, updatedAt: new Date() })
      .where(and(eq(deliveryChallans.id, challanId), eq(deliveryChallans.tenantId, tenantId)));

    res.status(201).json(newGatePass);
  } catch (error: any) {
    console.error('Create gate pass from challan error:', error);
    res.status(500).json({ message: error.message || 'Failed to create gate pass from delivery challan' });
  }
});

router.get('/:id/linked-document', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid gate pass ID' });

    const [gatePass] = await db.select().from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.id, id), eq(enhancedGatePasses.tenantId, tenantId)));
    if (!gatePass) return res.status(404).json({ message: 'Gate pass not found' });

    if (!gatePass.linkedDocType || !gatePass.linkedDocId) {
      return res.json({ linkedDocType: null, linkedDocId: null, linkedDocNumber: null, linkedDocStatus: null });
    }

    if (gatePass.linkedDocType === 'DELIVERY_CHALLAN') {
      const [dc] = await db.select().from(deliveryChallans)
        .where(and(eq(deliveryChallans.id, gatePass.linkedDocId), eq(deliveryChallans.tenantId, tenantId)));
      return res.json({
        linkedDocType: gatePass.linkedDocType,
        linkedDocId: gatePass.linkedDocId,
        linkedDocNumber: dc?.challanNumber || null,
        linkedDocStatus: dc?.workflowStatus || null,
      });
    }

    res.json({
      linkedDocType: gatePass.linkedDocType,
      linkedDocId: gatePass.linkedDocId,
      linkedDocNumber: null,
      linkedDocStatus: null,
    });
  } catch (error: any) {
    console.error('Get linked document error:', error);
    res.status(500).json({ message: error.message || 'Failed to get linked document' });
  }
});

router.post('/from-grn/:grnId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const grnId = parseIntParam(req.params.grnId, "grnId");
    if (isNaN(grnId)) return res.status(400).json({ message: 'Invalid GRN ID' });

    const grnResult = await db.execute(sql`
      SELECT * FROM goods_receiving_notes WHERE id = ${grnId} AND tenant_id = ${tenantId} LIMIT 1
    `);
    if (!grnResult.rows || grnResult.rows.length === 0) {
      return res.status(404).json({ message: 'GRN not found' });
    }
    const grn = grnResult.rows[0] as any;

    let partyDisplayName = grn.vendor_name || null;
    if (grn.vendor_id) {
      const [party] = await db.select().from(parties).where(eq(parties.id, grn.vendor_id));
      if (party) partyDisplayName = party.name;
    }

    const gatePassNumber = await generateDocumentNumber({
      prefix: 'GPI',
      tableName: 'enhanced_gate_passes',
      columnName: 'gate_pass_number',
      tenantId,
    });
    const today = new Date().toISOString().split('T')[0];

    const [newGatePass] = await db.insert(enhancedGatePasses).values({
      gatePassNumber,
      gatePassDate: today,
      gatePassType: 'GP_IN',
      partyId: grn.vendor_id || null,
      partyName: partyDisplayName,
      grnId: grnId,
      purchaseOrderId: grn.purchase_order_id || null,
      vehicleNumber: grn.vehicle_number || null,
      totalItems: 0,
      totalQuantity: "0",
      workflowStatus: "DRAFT",
      purpose: `Inward gate pass for GRN ${grn.grn_number || grnId}`,
      tenantId,
      createdBy: userId,
    }).returning();

    try {
      const grnItems = await db.execute(sql`
        SELECT * FROM grn_items WHERE grn_id = ${grnId} AND tenant_id = ${tenantId}
      `);
      if (grnItems.rows && grnItems.rows.length > 0) {
        const itemValues = grnItems.rows.map((item: any) => ({
          gatePassId: newGatePass.id,
          itemId: item.item_id || null,
          itemName: item.item_name || 'Unnamed Item',
          itemCode: item.item_code || null,
          description: item.description || null,
          quantity: String(item.received_quantity || item.quantity || 0),
          unit: item.unit || null,
          weight: null,
          batchNumber: item.batch_number || null,
          condition: 'good',
          remarks: item.remarks || null,
          tenantId,
        }));
        await db.insert(enhancedGatePassItems).values(itemValues);
        await db.update(enhancedGatePasses)
          .set({ totalItems: grnItems.rows.length })
          .where(eq(enhancedGatePasses.id, newGatePass.id));
      }
    } catch (e) {
      console.log('Could not load GRN items (table may not exist):', e);
    }

    res.status(201).json(newGatePass);
  } catch (error: any) {
    console.error('Create gate pass from GRN error:', error);
    res.status(500).json({ message: error.message || 'Failed to create gate pass from GRN' });
  }
});

router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid gate pass ID' });

    const [existing] = await db.select().from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.id, id), eq(enhancedGatePasses.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Gate pass not found' });
    if (existing.workflowStatus !== 'DRAFT') {
      return res.status(400).json({ message: `Cannot submit. Current status is ${existing.workflowStatus}, expected DRAFT` });
    }

    const [updated] = await db.update(enhancedGatePasses)
      .set({ workflowStatus: 'SUBMITTED', updatedAt: new Date() })
      .where(and(eq(enhancedGatePasses.id, id), eq(enhancedGatePasses.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Gate pass submit error:', error);
    res.status(500).json({ message: error.message || 'Failed to submit gate pass' });
  }
});

router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid gate pass ID' });

    const [existing] = await db.select().from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.id, id), eq(enhancedGatePasses.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Gate pass not found' });
    if (existing.workflowStatus !== 'SUBMITTED') {
      return res.status(400).json({ message: `Cannot approve. Current status is ${existing.workflowStatus}, expected SUBMITTED` });
    }

    const [updated] = await db.update(enhancedGatePasses)
      .set({
        workflowStatus: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(enhancedGatePasses.id, id), eq(enhancedGatePasses.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Gate pass approve error:', error);
    res.status(500).json({ message: error.message || 'Failed to approve gate pass' });
  }
});

router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid gate pass ID' });

    const { reason } = req.body;

    const [existing] = await db.select().from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.id, id), eq(enhancedGatePasses.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Gate pass not found' });

    const [updated] = await db.update(enhancedGatePasses)
      .set({
        workflowStatus: 'REJECTED',
        remarks: reason ? `${existing.remarks || ''}\n[REJECTED]: ${reason}`.trim() : existing.remarks,
        updatedAt: new Date(),
      })
      .where(and(eq(enhancedGatePasses.id, id), eq(enhancedGatePasses.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Gate pass reject error:', error);
    res.status(500).json({ message: error.message || 'Failed to reject gate pass' });
  }
});

router.post('/:id/guard-acknowledge', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid gate pass ID' });

    const { securityGuardName, securityCheckpoint } = req.body;

    const [existing] = await db.select().from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.id, id), eq(enhancedGatePasses.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Gate pass not found' });

    if (existing.workflowStatus !== 'APPROVED') {
      return res.status(400).json({ message: 'Gate pass must be APPROVED before guard acknowledgment' });
    }

    const now = new Date();
    const updateData: any = {
      guardAcknowledged: true,
      guardAcknowledgedAt: now,
      updatedAt: now,
    };

    if (securityGuardName) updateData.securityGuardName = securityGuardName;
    if (securityCheckpoint) updateData.securityCheckpoint = securityCheckpoint;

    if (existing.gatePassType === 'GP_IN') {
      updateData.entryTime = now;
    } else {
      updateData.exitTime = now;
    }

    const [updated] = await db.update(enhancedGatePasses)
      .set(updateData)
      .where(and(eq(enhancedGatePasses.id, id), eq(enhancedGatePasses.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Gate pass guard acknowledge error:', error);
    res.status(500).json({ message: error.message || 'Failed to acknowledge gate pass' });
  }
});

export default router;
