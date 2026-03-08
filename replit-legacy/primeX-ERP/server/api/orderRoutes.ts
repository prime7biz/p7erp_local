import { parseIntParam } from "../utils/parseParams";
import { requireTenant } from "../utils/tenantScope";
import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { insertOrderSchema } from "@shared/schema";
import { ZodError } from "zod";
import { v4 as uuidv4 } from 'uuid';
import { SequentialIdGenerator } from "../utils/sequentialIdGenerator";
import { requirePermission } from "../middleware/rbacMiddleware";

const orderRoutes = Router();

// Get all orders
orderRoutes.get("/", requirePermission('sales:sales_order:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const orders = await storage.getAllOrders(tenantId);
    res.json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

// Get order by ID
orderRoutes.get("/:id", requirePermission('sales:sales_order:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const orderId = Number(req.params.id);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }
    
    const order = await storage.getOrderById(orderId, tenantId);
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    let style = null;
    if (order.styleId) {
      try {
        const { getStyleById } = await import("../services/merchandisingService");
        style = await getStyleById(tenantId, order.styleId);
      } catch (e) {
        console.error(`Error fetching style ${order.styleId} for order ${orderId}:`, e);
      }
    }
    
    res.json({ ...order, style });
  } catch (error) {
    console.error("Error fetching order:", error);
    res.status(500).json({ message: "Failed to fetch order" });
  }
});

// Get order material requirements
orderRoutes.get("/:id/materials", requirePermission('sales:sales_order:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const orderId = Number(req.params.id);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }
    
    const materials = await storage.getOrderMaterials(orderId, tenantId);
    res.json(materials);
  } catch (error) {
    console.error("Error fetching order materials:", error);
    res.status(500).json({ message: "Failed to fetch order materials" });
  }
});

// Get order color/size breakdown
orderRoutes.get("/:id/color-size-breakdown", requirePermission('sales:sales_order:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const orderId = Number(req.params.id);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }
    
    const breakdown = await storage.getOrderColorSizeBreakdown(orderId, tenantId);
    res.json(breakdown);
  } catch (error) {
    console.error("Error fetching order color/size breakdown:", error);
    res.status(500).json({ message: "Failed to fetch order color/size breakdown" });
  }
});

// Convert quotation to order
orderRoutes.post("/convert-from-quotation/:id", requirePermission('sales:sales_order:create'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const quotationId = Number(req.params.id);
    const userId = Number(req.cookies.userId) || 1;
    
    if (isNaN(quotationId)) {
      return res.status(400).json({ message: "Invalid quotation ID" });
    }
    
    // Get the quotation to convert
    const quotation = await storage.getQuotationById(quotationId, tenantId);
    
    if (!quotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }
    
    // Check if quotation is already converted
    if (quotation.status === "converted_to_order") {
      return res.status(400).json({ message: "This quotation has already been converted to an order" });
    }
    
    // Get the form data from request body
    const {
      deliveryMode,
      deliveryPort,
      paymentTerms,
      colorSizes,
      sampleTypes,
      trimTypes
    } = req.body;
    
    // Generate sequential order ID (e.g., ORD-00001)
    const orderId = await SequentialIdGenerator.generateOrderId(tenantId);
    
    // Create the new order with multi-currency support
    const newOrder = {
      tenantId,
      orderId,
      quotationId: quotation.id,
      customerId: quotation.customerId,
      styleName: quotation.styleName,
      styleId: quotation.styleId || undefined,
      department: quotation.department,
      totalQuantity: quotation.projectedQuantity,
      deliveryDate: quotation.projectedDeliveryDate,
      deliveryMode,
      deliveryPort: deliveryPort || null,
      paymentTerms: paymentTerms || null,
      priceConfirmed: quotation.quotedPrice,
      currency: quotation.currency || 'USD',
      exchangeRate: quotation.exchangeRate || 1,
      baseAmount: quotation.baseAmount,
      localAmount: quotation.localAmount,
      orderStatus: "new",
      notes: quotation.notes,
      createdBy: userId
    };
    
    // Create the order in the database
    const createdOrder = await storage.createOrder(newOrder);
    
    // If color/size breakdown provided, add it to the order
    if (colorSizes && Array.isArray(colorSizes) && colorSizes.length > 0) {
      const breakdownEntries = colorSizes.map((item: any) => ({
        orderId: createdOrder.id,
        tenantId,
        color: item.color,
        size: item.size,
        quantity: item.quantity
      }));
      
      await Promise.all(breakdownEntries.map(entry => 
        storage.createOrderColorSizeBreakdown(entry)
      ));
    }
    
    // Update quotation status to converted
    await storage.updateQuotation(quotationId, tenantId, {
      status: "converted_to_order"
    });
    
    res.status(201).json({
      message: "Quotation successfully converted to order",
      order: createdOrder
    });
  } catch (error) {
    console.error("Error converting quotation to order:", error);
    if (error instanceof ZodError) {
      return res.status(400).json({ message: "Invalid order data", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to convert quotation to order" });
  }
});

// Get order amendments
orderRoutes.get("/:id/amendments", requirePermission('sales:sales_order:read'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const orderId = Number(req.params.id);
    if (isNaN(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }
    const amendments = await storage.getOrderAmendments(orderId, tenantId);
    res.json(amendments);
  } catch (error) {
    console.error("Error fetching order amendments:", error);
    res.status(500).json({ message: "Failed to fetch order amendments" });
  }
});

// Create order amendment(s) when editing a confirmed order
orderRoutes.post("/:id/amendments", requirePermission('sales:sales_order:edit'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const orderId = Number(req.params.id);
    const userId = Number(req.cookies.userId) || 1;
    if (isNaN(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }
    const { amendments, reason } = req.body;
    if (!amendments || !Array.isArray(amendments) || amendments.length === 0) {
      return res.status(400).json({ message: "Amendments array is required" });
    }
    if (!reason) {
      return res.status(400).json({ message: "Reason is required" });
    }
    const nextNum = await storage.getNextAmendmentNumber(orderId, tenantId);
    const created = [];
    for (let i = 0; i < amendments.length; i++) {
      const a = amendments[i];
      const amendment = await storage.createOrderAmendment({
        tenantId,
        orderId,
        amendmentNumber: nextNum,
        fieldChanged: a.fieldChanged,
        oldValue: a.oldValue != null ? String(a.oldValue) : null,
        newValue: a.newValue != null ? String(a.newValue) : null,
        reason,
        requestedBy: userId,
        status: "approved",
      });
      created.push(amendment);
    }
    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating order amendments:", error);
    res.status(500).json({ message: "Failed to create order amendments" });
  }
});

// Update amendment status (approve/reject)
orderRoutes.patch("/:orderId/amendments/:id", requirePermission('sales:sales_order:edit'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const amendmentId = Number(req.params.id);
    const userId = Number(req.cookies.userId) || 1;
    const { status } = req.body;
    if (!status || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'approved' or 'rejected'" });
    }
    const updated = await storage.updateOrderAmendment(amendmentId, tenantId, {
      status,
      approvedBy: userId,
    });
    res.json(updated);
  } catch (error) {
    console.error("Error updating amendment:", error);
    res.status(500).json({ message: "Failed to update amendment" });
  }
});

// Update order status
orderRoutes.patch("/:id/status", requirePermission('sales:sales_order:edit'), async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const orderId = Number(req.params.id);
    const { status } = req.body;
    
    if (isNaN(orderId)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }
    
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }
    
    const order = await storage.getOrderById(orderId, tenantId);
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    // Update the order status
    const updatedOrder = await storage.updateOrder(orderId, tenantId, { orderStatus: status });
    
    res.json({
      message: "Order status updated successfully",
      order: updatedOrder
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ message: "Failed to update order status" });
  }
});

export default orderRoutes;