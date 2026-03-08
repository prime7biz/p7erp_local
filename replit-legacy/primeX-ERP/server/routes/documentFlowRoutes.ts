import { parseIntParam } from "../utils/parseParams";
import express, { Request, Response } from 'express';
import { db } from '../db';
import {
  purchaseOrders, goodsReceivingNotes, enhancedGatePasses, vouchers,
  billReferences, orders, deliveryChallans, deliveryChallanItems,
  enhancedGatePassItems, parties, orderMaterials
} from '@shared/schema';
import { eq, and, desc, sql, count, or } from 'drizzle-orm';

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

router.get('/purchase/:purchaseOrderId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const poId = parseIntParam(req.params.purchaseOrderId, "purchaseOrderId");

    const [po] = await db.select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      status: purchaseOrders.workflowStatus,
      supplierId: purchaseOrders.supplierId,
      totalAmount: purchaseOrders.totalAmount,
    }).from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId)));

    if (!po) return res.status(404).json({ error: "Purchase order not found" });

    const grns = await db.select({
      id: goodsReceivingNotes.id,
      grnNumber: goodsReceivingNotes.grnNumber,
      status: goodsReceivingNotes.workflowStatus,
    }).from(goodsReceivingNotes)
      .where(and(eq(goodsReceivingNotes.purchaseOrderId, poId), eq(goodsReceivingNotes.tenantId, tenantId)));

    const gps = await db.select({
      id: enhancedGatePasses.id,
      gatePassNumber: enhancedGatePasses.gatePassNumber,
      type: enhancedGatePasses.gatePassType,
      status: enhancedGatePasses.workflowStatus,
    }).from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.purchaseOrderId, poId), eq(enhancedGatePasses.tenantId, tenantId)));

    const purchaseBills = await db.select({
      id: vouchers.id,
      voucherNumber: vouchers.voucherNumber,
      amount: vouchers.amount,
      status: vouchers.workflowStatus,
    }).from(vouchers)
      .where(and(
        eq(vouchers.originType, 'purchase_bill'),
        eq(vouchers.originId, poId),
        eq(vouchers.tenantId, tenantId)
      ));

    const payments = await db.select({
      id: vouchers.id,
      voucherNumber: vouchers.voucherNumber,
      amount: vouchers.amount,
      status: vouchers.workflowStatus,
    }).from(vouchers)
      .where(and(
        eq(vouchers.originType, 'payment'),
        eq(vouchers.originId, poId),
        eq(vouchers.tenantId, tenantId)
      ));

    const billVoucherIds = purchaseBills.map(b => b.id);
    let bills: any[] = [];
    if (billVoucherIds.length > 0) {
      bills = await db.select({
        id: billReferences.id,
        billNumber: billReferences.billNumber,
        pendingAmount: billReferences.pendingAmount,
        status: billReferences.status,
      }).from(billReferences)
        .where(and(
          eq(billReferences.tenantId, tenantId),
          sql`${billReferences.sourceVoucherId} = ANY(${sql`ARRAY[${sql.join(billVoucherIds.map(id => sql`${id}`), sql`, `)}]`})`
        ));
    }

    res.json({
      purchaseOrder: po,
      grn: grns,
      gatePasses: gps,
      purchaseBills,
      payments,
      billReferences: bills,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sales/:orderId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const ordId = parseIntParam(req.params.orderId, "orderId");

    const [order] = await db.select({
      id: orders.id,
      orderNumber: orders.orderId,
      status: orders.orderStatus,
      customerId: orders.customerId,
    }).from(orders)
      .where(and(eq(orders.id, ordId), eq(orders.tenantId, tenantId)));

    if (!order) return res.status(404).json({ error: "Sales order not found" });

    const challans = await db.select({
      id: deliveryChallans.id,
      challanNumber: deliveryChallans.challanNumber,
      status: deliveryChallans.workflowStatus,
      totalAmount: deliveryChallans.totalAmount,
    }).from(deliveryChallans)
      .where(and(eq(deliveryChallans.orderId, ordId), eq(deliveryChallans.tenantId, tenantId)));

    const gps = await db.select({
      id: enhancedGatePasses.id,
      gatePassNumber: enhancedGatePasses.gatePassNumber,
      type: enhancedGatePasses.gatePassType,
      status: enhancedGatePasses.workflowStatus,
    }).from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.orderId, ordId), eq(enhancedGatePasses.tenantId, tenantId)));

    const salesInvoices = await db.select({
      id: vouchers.id,
      voucherNumber: vouchers.voucherNumber,
      amount: vouchers.amount,
      status: vouchers.workflowStatus,
    }).from(vouchers)
      .where(and(
        eq(vouchers.originType, 'sales_invoice'),
        eq(vouchers.originId, ordId),
        eq(vouchers.tenantId, tenantId)
      ));

    const receipts = await db.select({
      id: vouchers.id,
      voucherNumber: vouchers.voucherNumber,
      amount: vouchers.amount,
      status: vouchers.workflowStatus,
    }).from(vouchers)
      .where(and(
        eq(vouchers.originType, 'receipt'),
        eq(vouchers.originId, ordId),
        eq(vouchers.tenantId, tenantId)
      ));

    const invoiceVoucherIds = salesInvoices.map(i => i.id);
    let bills: any[] = [];
    if (invoiceVoucherIds.length > 0) {
      bills = await db.select({
        id: billReferences.id,
        billNumber: billReferences.billNumber,
        pendingAmount: billReferences.pendingAmount,
        status: billReferences.status,
      }).from(billReferences)
        .where(and(
          eq(billReferences.tenantId, tenantId),
          sql`${billReferences.sourceVoucherId} = ANY(${sql`ARRAY[${sql.join(invoiceVoucherIds.map(id => sql`${id}`), sql`, `)}]`})`
        ));
    }

    res.json({
      salesOrder: order,
      deliveryChallans: challans,
      gatePasses: gps,
      salesInvoices,
      receipts,
      billReferences: bills,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/party/:partyId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const partyId = parseIntParam(req.params.partyId, "partyId");

    const [party] = await db.select().from(parties)
      .where(and(eq(parties.id, partyId), eq(parties.tenantId, tenantId)));
    if (!party) return res.status(404).json({ error: "Party not found" });

    const pos = await db.select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      status: purchaseOrders.workflowStatus,
      totalAmount: purchaseOrders.totalAmount,
      createdAt: purchaseOrders.createdAt,
    }).from(purchaseOrders)
      .where(and(eq(purchaseOrders.supplierId, partyId), eq(purchaseOrders.tenantId, tenantId)))
      .orderBy(desc(purchaseOrders.createdAt));

    const salesOrders = await db.select({
      id: orders.id,
      orderNumber: orders.orderId,
      status: orders.orderStatus,
      createdAt: orders.createdAt,
    }).from(orders)
      .where(and(eq(orders.customerId, partyId), eq(orders.tenantId, tenantId)))
      .orderBy(desc(orders.createdAt));

    const partyBills = await db.select({
      id: billReferences.id,
      billNumber: billReferences.billNumber,
      billType: billReferences.billType,
      originalAmount: billReferences.originalAmount,
      pendingAmount: billReferences.pendingAmount,
      status: billReferences.status,
    }).from(billReferences)
      .where(and(eq(billReferences.partyId, partyId), eq(billReferences.tenantId, tenantId)));

    res.json({
      party: { id: party.id, partyName: party.name, partyCode: party.partyCode, partyType: party.partyType },
      purchaseOrders: pos,
      salesOrders,
      billReferences: partyBills,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const [poCount] = await db.select({ count: count() }).from(purchaseOrders)
      .where(eq(purchaseOrders.tenantId, tenantId));
    const [poDraft] = await db.select({ count: count() }).from(purchaseOrders)
      .where(and(eq(purchaseOrders.tenantId, tenantId), eq(purchaseOrders.workflowStatus, 'DRAFT')));
    const [poApproved] = await db.select({ count: count() }).from(purchaseOrders)
      .where(and(eq(purchaseOrders.tenantId, tenantId), eq(purchaseOrders.workflowStatus, 'APPROVED')));

    const [grnCount] = await db.select({ count: count() }).from(goodsReceivingNotes)
      .where(eq(goodsReceivingNotes.tenantId, tenantId));
    const [grnPending] = await db.select({ count: count() }).from(goodsReceivingNotes)
      .where(and(eq(goodsReceivingNotes.tenantId, tenantId), eq(goodsReceivingNotes.workflowStatus, 'DRAFT')));

    const [gpInCount] = await db.select({ count: count() }).from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.tenantId, tenantId), eq(enhancedGatePasses.gatePassType, 'GP_IN')));
    const [gpOutCount] = await db.select({ count: count() }).from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.tenantId, tenantId), eq(enhancedGatePasses.gatePassType, 'GP_OUT')));

    const [orderCount] = await db.select({ count: count() }).from(orders)
      .where(eq(orders.tenantId, tenantId));
    const [orderActive] = await db.select({ count: count() }).from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.orderStatus, 'in_progress')));

    const [challanCount] = await db.select({ count: count() }).from(deliveryChallans)
      .where(eq(deliveryChallans.tenantId, tenantId));
    const [challanPending] = await db.select({ count: count() }).from(deliveryChallans)
      .where(and(eq(deliveryChallans.tenantId, tenantId), eq(deliveryChallans.workflowStatus, 'DRAFT')));

    const [purchaseBillCount] = await db.select({ count: count() }).from(vouchers)
      .where(and(eq(vouchers.tenantId, tenantId), eq(vouchers.originType, 'purchase_bill')));
    const [salesInvoiceCount] = await db.select({ count: count() }).from(vouchers)
      .where(and(eq(vouchers.tenantId, tenantId), eq(vouchers.originType, 'sales_invoice')));

    const [payableCount] = await db.select({ count: count() }).from(billReferences)
      .where(and(eq(billReferences.tenantId, tenantId), eq(billReferences.billType, 'PAYABLE'), eq(billReferences.status, 'OPEN')));
    const [receivableCount] = await db.select({ count: count() }).from(billReferences)
      .where(and(eq(billReferences.tenantId, tenantId), eq(billReferences.billType, 'RECEIVABLE'), eq(billReferences.status, 'OPEN')));

    const recentVouchers = await db.select({
      id: vouchers.id,
      voucherNumber: vouchers.voucherNumber,
      originType: vouchers.originType,
      amount: vouchers.amount,
      status: vouchers.workflowStatus,
      createdAt: vouchers.createdAt,
    }).from(vouchers)
      .where(eq(vouchers.tenantId, tenantId))
      .orderBy(desc(vouchers.createdAt))
      .limit(10);

    res.json({
      purchase: {
        purchaseOrders: { total: poCount.count, draft: poDraft.count, approved: poApproved.count },
        grn: { total: grnCount.count, pending: grnPending.count },
        gatePassesIn: { total: gpInCount.count },
        purchaseBills: { total: purchaseBillCount.count },
        pendingPayables: { total: payableCount.count },
      },
      sales: {
        orders: { total: orderCount.count, active: orderActive.count },
        deliveryChallans: { total: challanCount.count, pending: challanPending.count },
        gatePassesOut: { total: gpOutCount.count },
        salesInvoices: { total: salesInvoiceCount.count },
        pendingReceivables: { total: receivableCount.count },
      },
      recentActivity: recentVouchers,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/po-to-grn/:poId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const poId = parseIntParam(req.params.poId, "poId");

    const [po] = await db.select().from(purchaseOrders)
      .where(and(eq(purchaseOrders.id, poId), eq(purchaseOrders.tenantId, tenantId)));

    if (!po) return res.status(404).json({ error: "Purchase order not found" });

    res.json({
      redirectUrl: `/inventory/grn/new?poId=${poId}`,
      purchaseOrder: {
        id: po.id,
        poNumber: po.poNumber,
        supplierId: po.supplierId,
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/order-to-challan/:orderId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const orderId = parseIntParam(req.params.orderId, "orderId");

    const [order] = await db.select().from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));

    if (!order) return res.status(404).json({ error: "Sales order not found" });

    const materials = await db.select().from(orderMaterials)
      .where(and(eq(orderMaterials.orderId, orderId), eq(orderMaterials.tenantId, tenantId)));

    const existingChallans = await db.select({ count: count() }).from(deliveryChallans)
      .where(and(eq(deliveryChallans.tenantId, tenantId), eq(deliveryChallans.orderId, orderId)));
    const challanSeq = (existingChallans[0]?.count || 0) + 1;
    const challanNumber = `DC-${order.orderId}-${String(challanSeq).padStart(2, '0')}`;

    const today = new Date().toISOString().split('T')[0];
    let totalQty = 0;
    let totalAmt = 0;

    const challanItems = materials.map(m => {
      const qty = parseFloat(m.quantityNeeded) || 0;
      const rate = parseFloat(m.unitPrice) || 0;
      const amt = qty * rate;
      totalQty += qty;
      totalAmt += amt;
      return {
        itemId: m.itemId,
        itemName: m.materialType,
        itemCode: '',
        quantity: m.quantityNeeded,
        unit: 'pcs',
        rate: m.unitPrice,
        amount: String(amt),
        tenantId,
      };
    });

    const [newChallan] = await db.insert(deliveryChallans).values({
      challanNumber,
      challanDate: today,
      customerId: order.customerId,
      orderId: order.id,
      totalQuantity: String(totalQty),
      totalAmount: String(totalAmt),
      currency: order.currency || 'BDT',
      workflowStatus: 'DRAFT',
      tenantId,
      createdBy: userId,
    }).returning();

    if (challanItems.length > 0) {
      await db.insert(deliveryChallanItems).values(
        challanItems.map(item => ({ ...item, challanId: newChallan.id }))
      );
    }

    res.json({
      success: true,
      deliveryChallan: newChallan,
      redirectUrl: `/inventory/delivery-challans/${newChallan.id}`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/challan-to-gate-pass/:challanId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const challanId = parseIntParam(req.params.challanId, "challanId");

    const [challan] = await db.select().from(deliveryChallans)
      .where(and(eq(deliveryChallans.id, challanId), eq(deliveryChallans.tenantId, tenantId)));

    if (!challan) return res.status(404).json({ error: "Delivery challan not found" });

    const items = await db.select().from(deliveryChallanItems)
      .where(and(eq(deliveryChallanItems.challanId, challanId), eq(deliveryChallanItems.tenantId, tenantId)));

    const existingGPs = await db.select({ count: count() }).from(enhancedGatePasses)
      .where(and(eq(enhancedGatePasses.tenantId, tenantId), eq(enhancedGatePasses.deliveryChallanId, challanId)));
    const gpSeq = (existingGPs[0]?.count || 0) + 1;
    const gpNumber = `GP-OUT-${challan.challanNumber}-${String(gpSeq).padStart(2, '0')}`;

    const today = new Date().toISOString().split('T')[0];

    const [newGP] = await db.insert(enhancedGatePasses).values({
      gatePassNumber: gpNumber,
      gatePassDate: today,
      gatePassType: 'GP_OUT',
      partyId: challan.partyId,
      deliveryChallanId: challan.id,
      orderId: challan.orderId,
      vehicleNumber: challan.vehicleNumber,
      driverName: challan.driverName,
      driverContact: challan.driverContact,
      transporterName: challan.transporterName,
      totalItems: items.length,
      totalQuantity: challan.totalQuantity,
      workflowStatus: 'DRAFT',
      tenantId,
      createdBy: userId,
    }).returning();

    if (items.length > 0) {
      await db.insert(enhancedGatePassItems).values(
        items.map(item => ({
          gatePassId: newGP.id,
          itemId: item.itemId,
          itemName: item.itemName,
          itemCode: item.itemCode || '',
          quantity: item.quantity,
          unit: item.unit || 'pcs',
          tenantId,
        }))
      );
    }

    res.json({
      success: true,
      gatePass: newGP,
      redirectUrl: `/inventory/enhanced-gate-passes/${newGP.id}`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/challan-to-invoice/:challanId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const challanId = parseIntParam(req.params.challanId, "challanId");

    const [challan] = await db.select().from(deliveryChallans)
      .where(and(eq(deliveryChallans.id, challanId), eq(deliveryChallans.tenantId, tenantId)));

    if (!challan) return res.status(404).json({ error: "Delivery challan not found" });
    if (!challan.isPosted) return res.status(400).json({ error: "Delivery challan must be POSTED before creating invoice" });
    if (challan.invoiceCreated) return res.status(400).json({ error: "Invoice already created for this challan" });

    res.json({
      success: true,
      redirectUrl: `/accounts/vouchers/new?originModule=delivery_challan&originType=sales_invoice&originId=${challanId}&partyId=${challan.partyId || challan.customerId}&amount=${challan.totalAmount || 0}`,
      challan: {
        id: challan.id,
        challanNumber: challan.challanNumber,
        partyId: challan.partyId || challan.customerId,
        totalAmount: challan.totalAmount,
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
