import { parseIntParam } from "../utils/parseParams";
import express, { Request, Response } from "express";
import { commercialService } from "../services/commercialService";
import { SequentialIdGenerator } from "../utils/sequentialIdGenerator";
import { 
  insertCommercialInquirySchema, 
  insertCostingTemplateSchema,
  insertCommercialQuotationSchema,
  insertQuotationStyleSchema,
  insertStyleCostBreakdownSchema,
  insertCmCostBreakdownSchema,
  insertCommercialOrderSchema,
  insertOrderStyleSchema,
  insertLetterOfCreditSchema,
  insertExportDocumentSchema,
  insertShipmentSchema,
  insertBuyerFeedbackSchema
} from "../../shared/schema/commercial";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

const router = express.Router();

// Middleware to extract tenantId from req
const withTenant = (req: Request, res: Response, next: () => void) => {
  if (!req.tenantId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
};

// Dashboard and Analytics
router.get("/dashboard", withTenant, async (req: Request, res: Response) => {
  try {
    const stats = await commercialService.getCommercialDashboardStats(req.tenantId!);
    return res.status(200).json(stats);
  } catch (error) {
    console.error("Error getting dashboard stats:", error);
    return res.status(500).json({ message: "Failed to get dashboard stats" });
  }
});

router.get("/dashboard/pending-quotations", withTenant, async (req: Request, res: Response) => {
  try {
    const quotations = await commercialService.getPendingQuotations(req.tenantId!);
    return res.status(200).json(quotations);
  } catch (error) {
    console.error("Error getting pending quotations:", error);
    return res.status(500).json({ message: "Failed to get pending quotations" });
  }
});

router.get("/dashboard/recent-orders", withTenant, async (req: Request, res: Response) => {
  try {
    const orders = await commercialService.getRecentOrders(req.tenantId!);
    return res.status(200).json(orders);
  } catch (error) {
    console.error("Error getting recent orders:", error);
    return res.status(500).json({ message: "Failed to get recent orders" });
  }
});

router.get("/dashboard/upcoming-shipments", withTenant, async (req: Request, res: Response) => {
  try {
    const shipments = await commercialService.getUpcomingShipments(req.tenantId!);
    return res.status(200).json(shipments);
  } catch (error) {
    console.error("Error getting upcoming shipments:", error);
    return res.status(500).json({ message: "Failed to get upcoming shipments" });
  }
});

router.get("/dashboard/expiring-lcs", withTenant, async (req: Request, res: Response) => {
  try {
    const lcs = await commercialService.getExpiringLCs(req.tenantId!);
    return res.status(200).json(lcs);
  } catch (error) {
    console.error("Error getting expiring LCs:", error);
    return res.status(500).json({ message: "Failed to get expiring LCs" });
  }
});

// Commercial Inquiries
router.get("/inquiries", withTenant, async (req: Request, res: Response) => {
  try {
    const inquiries = await commercialService.getAllInquiries(req.tenantId!);
    return res.status(200).json(inquiries);
  } catch (error) {
    console.error("Error getting inquiries:", error);
    return res.status(500).json({ message: "Failed to get inquiries" });
  }
});

router.get("/inquiries/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const inquiry = await commercialService.getInquiryById(parseIntParam(req.params.id, "id"), req.tenantId!);
    if (!inquiry) {
      return res.status(404).json({ message: "Inquiry not found" });
    }
    return res.status(200).json(inquiry);
  } catch (error) {
    console.error("Error getting inquiry:", error);
    return res.status(500).json({ message: "Failed to get inquiry" });
  }
});

router.post("/inquiries", withTenant, async (req: Request, res: Response) => {
  try {
    const validatedData = insertCommercialInquirySchema.parse({
      ...req.body,
      tenantId: req.tenantId
    });
    
    const inquiry = await commercialService.createInquiry(validatedData);
    return res.status(201).json(inquiry);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error creating inquiry:", error);
    return res.status(500).json({ message: "Failed to create inquiry" });
  }
});

router.put("/inquiries/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const inquiry = await commercialService.getInquiryById(id, req.tenantId!);
    if (!inquiry) {
      return res.status(404).json({ message: "Inquiry not found" });
    }
    
    const validatedData = insertCommercialInquirySchema.partial().parse(req.body);
    const updatedInquiry = await commercialService.updateInquiry(id, req.tenantId!, validatedData);
    return res.status(200).json(updatedInquiry);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error updating inquiry:", error);
    return res.status(500).json({ message: "Failed to update inquiry" });
  }
});

router.delete("/inquiries/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const inquiry = await commercialService.getInquiryById(id, req.tenantId!);
    if (!inquiry) {
      return res.status(404).json({ message: "Inquiry not found" });
    }
    
    const success = await commercialService.deleteInquiry(id, req.tenantId!);
    if (success) {
      return res.status(200).json({ message: "Inquiry deleted successfully" });
    } else {
      return res.status(500).json({ message: "Failed to delete inquiry" });
    }
  } catch (error) {
    console.error("Error deleting inquiry:", error);
    return res.status(500).json({ message: "Failed to delete inquiry" });
  }
});

// Costing Templates
router.get("/costing-templates", withTenant, async (req: Request, res: Response) => {
  try {
    const templates = await commercialService.getAllCostingTemplates(req.tenantId!);
    return res.status(200).json(templates);
  } catch (error) {
    console.error("Error getting costing templates:", error);
    return res.status(500).json({ message: "Failed to get costing templates" });
  }
});

router.get("/costing-templates/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const template = await commercialService.getCostingTemplateById(parseIntParam(req.params.id, "id"), req.tenantId!);
    if (!template) {
      return res.status(404).json({ message: "Costing template not found" });
    }
    return res.status(200).json(template);
  } catch (error) {
    console.error("Error getting costing template:", error);
    return res.status(500).json({ message: "Failed to get costing template" });
  }
});

router.post("/costing-templates", withTenant, async (req: Request, res: Response) => {
  try {
    const validatedData = insertCostingTemplateSchema.parse({
      ...req.body,
      tenantId: req.tenantId,
      createdBy: req.user.id
    });
    
    const template = await commercialService.createCostingTemplate(validatedData);
    return res.status(201).json(template);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error creating costing template:", error);
    return res.status(500).json({ message: "Failed to create costing template" });
  }
});

router.put("/costing-templates/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const template = await commercialService.getCostingTemplateById(id, req.tenantId!);
    if (!template) {
      return res.status(404).json({ message: "Costing template not found" });
    }
    
    const validatedData = insertCostingTemplateSchema.partial().parse(req.body);
    const updatedTemplate = await commercialService.updateCostingTemplate(id, req.tenantId!, validatedData);
    return res.status(200).json(updatedTemplate);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error updating costing template:", error);
    return res.status(500).json({ message: "Failed to update costing template" });
  }
});

// Commercial Quotations
router.get("/quotations", withTenant, async (req: Request, res: Response) => {
  try {
    const quotations = await commercialService.getAllQuotations(req.tenantId!);
    return res.status(200).json(quotations);
  } catch (error) {
    console.error("Error getting quotations:", error);
    return res.status(500).json({ message: "Failed to get quotations" });
  }
});

router.get("/quotations/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const quotation = await commercialService.getQuotationById(parseIntParam(req.params.id, "id"), req.tenantId!);
    if (!quotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }
    return res.status(200).json(quotation);
  } catch (error) {
    console.error("Error getting quotation:", error);
    return res.status(500).json({ message: "Failed to get quotation" });
  }
});

router.post("/quotations", withTenant, async (req: Request, res: Response) => {
  try {
    const validatedData = insertCommercialQuotationSchema.parse({
      ...req.body,
      tenantId: req.tenantId,
      createdBy: req.user.id
    });
    
    const quotation = await commercialService.createQuotation(validatedData);
    return res.status(201).json(quotation);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error creating quotation:", error);
    return res.status(500).json({ message: "Failed to create quotation" });
  }
});

router.put("/quotations/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const quotation = await commercialService.getQuotationById(id, req.tenantId!);
    if (!quotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }
    
    const validatedData = insertCommercialQuotationSchema.partial().parse(req.body);
    const updatedQuotation = await commercialService.updateQuotation(id, req.tenantId!, validatedData);
    return res.status(200).json(updatedQuotation);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error updating quotation:", error);
    return res.status(500).json({ message: "Failed to update quotation" });
  }
});

router.patch("/quotations/:id/approve", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const quotation = await commercialService.getQuotationById(id, req.tenantId!);
    if (!quotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }
    
    const approvedQuotation = await commercialService.approveQuotation(id, req.tenantId!, req.user.id);
    return res.status(200).json(approvedQuotation);
  } catch (error) {
    console.error("Error approving quotation:", error);
    return res.status(500).json({ message: "Failed to approve quotation" });
  }
});

// Quotation Styles
router.get("/quotations/:quotationId/styles", withTenant, async (req: Request, res: Response) => {
  try {
    const quotationId = parseIntParam(req.params.quotationId, "quotationId");
    const styles = await commercialService.getQuotationStyles(quotationId, req.tenantId!);
    return res.status(200).json(styles);
  } catch (error) {
    console.error("Error getting quotation styles:", error);
    return res.status(500).json({ message: "Failed to get quotation styles" });
  }
});

router.get("/quotation-styles/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const style = await commercialService.getQuotationStyleById(id, req.tenantId!);
    if (!style) {
      return res.status(404).json({ message: "Quotation style not found" });
    }
    return res.status(200).json(style);
  } catch (error) {
    console.error("Error getting quotation style:", error);
    return res.status(500).json({ message: "Failed to get quotation style" });
  }
});

router.post("/quotation-styles", withTenant, async (req: Request, res: Response) => {
  try {
    const validatedData = insertQuotationStyleSchema.parse({
      ...req.body,
      tenantId: req.tenantId
    });
    
    const style = await commercialService.createQuotationStyle(validatedData);
    return res.status(201).json(style);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error creating quotation style:", error);
    return res.status(500).json({ message: "Failed to create quotation style" });
  }
});

router.put("/quotation-styles/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const style = await commercialService.getQuotationStyleById(id, req.tenantId!);
    if (!style) {
      return res.status(404).json({ message: "Quotation style not found" });
    }
    
    const validatedData = insertQuotationStyleSchema.partial().parse(req.body);
    const updatedStyle = await commercialService.updateQuotationStyle(id, req.tenantId!, validatedData);
    return res.status(200).json(updatedStyle);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error updating quotation style:", error);
    return res.status(500).json({ message: "Failed to update quotation style" });
  }
});

router.delete("/quotation-styles/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const style = await commercialService.getQuotationStyleById(id, req.tenantId!);
    if (!style) {
      return res.status(404).json({ message: "Quotation style not found" });
    }
    
    const success = await commercialService.deleteQuotationStyle(id, req.tenantId!);
    if (success) {
      return res.status(200).json({ message: "Quotation style deleted successfully" });
    } else {
      return res.status(500).json({ message: "Failed to delete quotation style" });
    }
  } catch (error) {
    console.error("Error deleting quotation style:", error);
    return res.status(500).json({ message: "Failed to delete quotation style" });
  }
});

// Style Cost Breakdowns
router.get("/quotation-styles/:styleId/cost-breakdowns", withTenant, async (req: Request, res: Response) => {
  try {
    const styleId = parseIntParam(req.params.styleId, "styleId");
    const costBreakdowns = await commercialService.getStyleCostBreakdowns(styleId, req.tenantId!);
    return res.status(200).json(costBreakdowns);
  } catch (error) {
    console.error("Error getting style cost breakdowns:", error);
    return res.status(500).json({ message: "Failed to get style cost breakdowns" });
  }
});

router.post("/style-cost-breakdowns", withTenant, async (req: Request, res: Response) => {
  try {
    const validatedData = insertStyleCostBreakdownSchema.parse({
      ...req.body,
      tenantId: req.tenantId
    });
    
    const costBreakdown = await commercialService.createStyleCostBreakdown(validatedData);
    return res.status(201).json(costBreakdown);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error creating style cost breakdown:", error);
    return res.status(500).json({ message: "Failed to create style cost breakdown" });
  }
});

router.put("/style-cost-breakdowns/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const validatedData = insertStyleCostBreakdownSchema.partial().parse(req.body);
    const updatedCostBreakdown = await commercialService.updateStyleCostBreakdown(id, req.tenantId!, validatedData);
    return res.status(200).json(updatedCostBreakdown);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error updating style cost breakdown:", error);
    return res.status(500).json({ message: "Failed to update style cost breakdown" });
  }
});

router.delete("/style-cost-breakdowns/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const success = await commercialService.deleteStyleCostBreakdown(id, req.tenantId!);
    if (success) {
      return res.status(200).json({ message: "Style cost breakdown deleted successfully" });
    } else {
      return res.status(500).json({ message: "Failed to delete style cost breakdown" });
    }
  } catch (error) {
    console.error("Error deleting style cost breakdown:", error);
    return res.status(500).json({ message: "Failed to delete style cost breakdown" });
  }
});

// CM Cost Breakdowns
router.get("/quotation-styles/:styleId/cm-cost-breakdowns", withTenant, async (req: Request, res: Response) => {
  try {
    const styleId = parseIntParam(req.params.styleId, "styleId");
    const cmCostBreakdowns = await commercialService.getCmCostBreakdowns(styleId, req.tenantId!);
    return res.status(200).json(cmCostBreakdowns);
  } catch (error) {
    console.error("Error getting CM cost breakdowns:", error);
    return res.status(500).json({ message: "Failed to get CM cost breakdowns" });
  }
});

router.post("/cm-cost-breakdowns", withTenant, async (req: Request, res: Response) => {
  try {
    const validatedData = insertCmCostBreakdownSchema.parse({
      ...req.body,
      tenantId: req.tenantId
    });
    
    const cmCostBreakdown = await commercialService.createCmCostBreakdown(validatedData);
    return res.status(201).json(cmCostBreakdown);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error creating CM cost breakdown:", error);
    return res.status(500).json({ message: "Failed to create CM cost breakdown" });
  }
});

router.put("/cm-cost-breakdowns/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const validatedData = insertCmCostBreakdownSchema.partial().parse(req.body);
    const updatedCmCostBreakdown = await commercialService.updateCmCostBreakdown(id, req.tenantId!, validatedData);
    return res.status(200).json(updatedCmCostBreakdown);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error updating CM cost breakdown:", error);
    return res.status(500).json({ message: "Failed to update CM cost breakdown" });
  }
});

router.delete("/cm-cost-breakdowns/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const success = await commercialService.deleteCmCostBreakdown(id, req.tenantId!);
    if (success) {
      return res.status(200).json({ message: "CM cost breakdown deleted successfully" });
    } else {
      return res.status(500).json({ message: "Failed to delete CM cost breakdown" });
    }
  } catch (error) {
    console.error("Error deleting CM cost breakdown:", error);
    return res.status(500).json({ message: "Failed to delete CM cost breakdown" });
  }
});

// Commercial Orders
router.get("/orders", withTenant, async (req: Request, res: Response) => {
  try {
    const orders = await commercialService.getAllOrders(req.tenantId!);
    return res.status(200).json(orders);
  } catch (error) {
    console.error("Error getting orders:", error);
    return res.status(500).json({ message: "Failed to get orders" });
  }
});

router.get("/orders/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const order = await commercialService.getOrderById(parseIntParam(req.params.id, "id"), req.tenantId!);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    return res.status(200).json(order);
  } catch (error) {
    console.error("Error getting order:", error);
    return res.status(500).json({ message: "Failed to get order" });
  }
});

router.post("/orders", withTenant, async (req: Request, res: Response) => {
  try {
    const validatedData = insertCommercialOrderSchema.parse({
      ...req.body,
      tenantId: req.tenantId,
      createdBy: req.user.id
    });
    
    const order = await commercialService.createOrder(validatedData);
    return res.status(201).json(order);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error creating order:", error);
    return res.status(500).json({ message: "Failed to create order" });
  }
});

router.put("/orders/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const order = await commercialService.getOrderById(id, req.tenantId!);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    const validatedData = insertCommercialOrderSchema.partial().parse(req.body);
    const updatedOrder = await commercialService.updateOrder(id, req.tenantId!, validatedData);
    return res.status(200).json(updatedOrder);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error updating order:", error);
    return res.status(500).json({ message: "Failed to update order" });
  }
});

router.patch("/orders/:id/confirm", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const order = await commercialService.getOrderById(id, req.tenantId!);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    const confirmedOrder = await commercialService.confirmOrder(id, req.tenantId!, req.user.id);
    return res.status(200).json(confirmedOrder);
  } catch (error) {
    console.error("Error confirming order:", error);
    return res.status(500).json({ message: "Failed to confirm order" });
  }
});

// Order Styles
router.get("/orders/:orderId/styles", withTenant, async (req: Request, res: Response) => {
  try {
    const orderId = parseIntParam(req.params.orderId, "orderId");
    const styles = await commercialService.getOrderStyles(orderId, req.tenantId!);
    return res.status(200).json(styles);
  } catch (error) {
    console.error("Error getting order styles:", error);
    return res.status(500).json({ message: "Failed to get order styles" });
  }
});

router.get("/order-styles/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const style = await commercialService.getOrderStyleById(id, req.tenantId!);
    if (!style) {
      return res.status(404).json({ message: "Order style not found" });
    }
    return res.status(200).json(style);
  } catch (error) {
    console.error("Error getting order style:", error);
    return res.status(500).json({ message: "Failed to get order style" });
  }
});

router.post("/order-styles", withTenant, async (req: Request, res: Response) => {
  try {
    const validatedData = insertOrderStyleSchema.parse({
      ...req.body,
      tenantId: req.tenantId
    });
    
    const style = await commercialService.createOrderStyle(validatedData);
    return res.status(201).json(style);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error creating order style:", error);
    return res.status(500).json({ message: "Failed to create order style" });
  }
});

router.put("/order-styles/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const style = await commercialService.getOrderStyleById(id, req.tenantId!);
    if (!style) {
      return res.status(404).json({ message: "Order style not found" });
    }
    
    const validatedData = insertOrderStyleSchema.partial().parse(req.body);
    const updatedStyle = await commercialService.updateOrderStyle(id, req.tenantId!, validatedData);
    return res.status(200).json(updatedStyle);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error updating order style:", error);
    return res.status(500).json({ message: "Failed to update order style" });
  }
});

router.patch("/order-styles/:id/status", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const style = await commercialService.getOrderStyleById(id, req.tenantId!);
    if (!style) {
      return res.status(404).json({ message: "Order style not found" });
    }
    
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }
    
    const updatedStyle = await commercialService.updateOrderStyleStatus(id, req.tenantId!, status);
    return res.status(200).json(updatedStyle);
  } catch (error) {
    console.error("Error updating order style status:", error);
    return res.status(500).json({ message: "Failed to update order style status" });
  }
});

// Letter of Credit
router.get("/lcs", withTenant, async (req: Request, res: Response) => {
  try {
    const lcs = await commercialService.getAllLetterOfCredits(req.tenantId!);
    return res.status(200).json(lcs);
  } catch (error) {
    console.error("Error getting LCs:", error);
    return res.status(500).json({ message: "Failed to get LCs" });
  }
});

router.get("/orders/:orderId/lcs", withTenant, async (req: Request, res: Response) => {
  try {
    const orderId = parseIntParam(req.params.orderId, "orderId");
    const lcs = await commercialService.getLetterOfCreditsByOrder(orderId, req.tenantId!);
    return res.status(200).json(lcs);
  } catch (error) {
    console.error("Error getting LCs for order:", error);
    return res.status(500).json({ message: "Failed to get LCs for order" });
  }
});

router.get("/lcs/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const lc = await commercialService.getLetterOfCreditById(id, req.tenantId!);
    if (!lc) {
      return res.status(404).json({ message: "Letter of credit not found" });
    }
    return res.status(200).json(lc);
  } catch (error) {
    console.error("Error getting letter of credit:", error);
    return res.status(500).json({ message: "Failed to get letter of credit" });
  }
});

router.post("/lcs", withTenant, async (req: Request, res: Response) => {
  try {
    const validatedData = insertLetterOfCreditSchema.parse({
      ...req.body,
      tenantId: req.tenantId
    });
    
    const lc = await commercialService.createLetterOfCredit(validatedData);
    return res.status(201).json(lc);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error creating letter of credit:", error);
    return res.status(500).json({ message: "Failed to create letter of credit" });
  }
});

router.put("/lcs/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const lc = await commercialService.getLetterOfCreditById(id, req.tenantId!);
    if (!lc) {
      return res.status(404).json({ message: "Letter of credit not found" });
    }
    
    const validatedData = insertLetterOfCreditSchema.partial().parse(req.body);
    const updatedLc = await commercialService.updateLetterOfCredit(id, req.tenantId!, validatedData);
    return res.status(200).json(updatedLc);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error updating letter of credit:", error);
    return res.status(500).json({ message: "Failed to update letter of credit" });
  }
});

// Export Documents
router.get("/export-documents", withTenant, async (req: Request, res: Response) => {
  try {
    const documents = await commercialService.getAllExportDocuments(req.tenantId!);
    return res.status(200).json(documents);
  } catch (error) {
    console.error("Error getting export documents:", error);
    return res.status(500).json({ message: "Failed to get export documents" });
  }
});

router.get("/orders/:orderId/export-documents", withTenant, async (req: Request, res: Response) => {
  try {
    const orderId = parseIntParam(req.params.orderId, "orderId");
    const documents = await commercialService.getExportDocumentsByOrder(orderId, req.tenantId!);
    return res.status(200).json(documents);
  } catch (error) {
    console.error("Error getting export documents for order:", error);
    return res.status(500).json({ message: "Failed to get export documents for order" });
  }
});

router.get("/export-documents/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const document = await commercialService.getExportDocumentById(id, req.tenantId!);
    if (!document) {
      return res.status(404).json({ message: "Export document not found" });
    }
    return res.status(200).json(document);
  } catch (error) {
    console.error("Error getting export document:", error);
    return res.status(500).json({ message: "Failed to get export document" });
  }
});

router.post("/export-documents", withTenant, async (req: Request, res: Response) => {
  try {
    // Generate sequential document number if not provided
    if (!req.body.documentNumber) {
      // Get document type for prefix (e.g., "Commercial Invoice" -> "COM")
      const docType = req.body.documentType || "Document";
      req.body.documentNumber = await SequentialIdGenerator.generateDocumentId(req.tenantId!, docType);
    }
    
    const validatedData = insertExportDocumentSchema.parse({
      ...req.body,
      tenantId: req.tenantId
    });
    
    const document = await commercialService.createExportDocument(validatedData);
    return res.status(201).json(document);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error creating export document:", error);
    return res.status(500).json({ message: "Failed to create export document" });
  }
});

router.put("/export-documents/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const document = await commercialService.getExportDocumentById(id, req.tenantId!);
    if (!document) {
      return res.status(404).json({ message: "Export document not found" });
    }
    
    const validatedData = insertExportDocumentSchema.partial().parse(req.body);
    const updatedDocument = await commercialService.updateExportDocument(id, req.tenantId!, validatedData);
    return res.status(200).json(updatedDocument);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error updating export document:", error);
    return res.status(500).json({ message: "Failed to update export document" });
  }
});

// Shipments
router.get("/shipments", withTenant, async (req: Request, res: Response) => {
  try {
    const shipments = await commercialService.getAllShipments(req.tenantId!);
    return res.status(200).json(shipments);
  } catch (error) {
    console.error("Error getting shipments:", error);
    return res.status(500).json({ message: "Failed to get shipments" });
  }
});

router.get("/orders/:orderId/shipments", withTenant, async (req: Request, res: Response) => {
  try {
    const orderId = parseIntParam(req.params.orderId, "orderId");
    const shipments = await commercialService.getShipmentsByOrder(orderId, req.tenantId!);
    return res.status(200).json(shipments);
  } catch (error) {
    console.error("Error getting shipments for order:", error);
    return res.status(500).json({ message: "Failed to get shipments for order" });
  }
});

router.get("/shipments/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const shipment = await commercialService.getShipmentById(id, req.tenantId!);
    if (!shipment) {
      return res.status(404).json({ message: "Shipment not found" });
    }
    return res.status(200).json(shipment);
  } catch (error) {
    console.error("Error getting shipment:", error);
    return res.status(500).json({ message: "Failed to get shipment" });
  }
});

router.post("/shipments", withTenant, async (req: Request, res: Response) => {
  try {
    const validatedData = insertShipmentSchema.parse({
      ...req.body,
      tenantId: req.tenantId
    });
    
    const shipment = await commercialService.createShipment(validatedData);
    return res.status(201).json(shipment);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error creating shipment:", error);
    return res.status(500).json({ message: "Failed to create shipment" });
  }
});

router.put("/shipments/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const shipment = await commercialService.getShipmentById(id, req.tenantId!);
    if (!shipment) {
      return res.status(404).json({ message: "Shipment not found" });
    }
    
    const validatedData = insertShipmentSchema.partial().parse(req.body);
    const updatedShipment = await commercialService.updateShipment(id, req.tenantId!, validatedData);
    return res.status(200).json(updatedShipment);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error updating shipment:", error);
    return res.status(500).json({ message: "Failed to update shipment" });
  }
});

// Buyer Feedback
router.get("/feedback", withTenant, async (req: Request, res: Response) => {
  try {
    const feedback = await commercialService.getAllBuyerFeedback(req.tenantId!);
    return res.status(200).json(feedback);
  } catch (error) {
    console.error("Error getting buyer feedback:", error);
    return res.status(500).json({ message: "Failed to get buyer feedback" });
  }
});

router.get("/orders/:orderId/feedback", withTenant, async (req: Request, res: Response) => {
  try {
    const orderId = parseIntParam(req.params.orderId, "orderId");
    const feedback = await commercialService.getBuyerFeedbackByOrder(orderId, req.tenantId!);
    if (!feedback) {
      return res.status(404).json({ message: "Feedback not found for this order" });
    }
    return res.status(200).json(feedback);
  } catch (error) {
    console.error("Error getting feedback for order:", error);
    return res.status(500).json({ message: "Failed to get feedback for order" });
  }
});

router.post("/feedback", withTenant, async (req: Request, res: Response) => {
  try {
    const validatedData = insertBuyerFeedbackSchema.parse({
      ...req.body,
      tenantId: req.tenantId
    });
    
    const feedback = await commercialService.createBuyerFeedback(validatedData);
    return res.status(201).json(feedback);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error creating buyer feedback:", error);
    return res.status(500).json({ message: "Failed to create buyer feedback" });
  }
});

router.put("/feedback/:id", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const validatedData = insertBuyerFeedbackSchema.partial().parse(req.body);
    const updatedFeedback = await commercialService.updateBuyerFeedback(id, req.tenantId!, validatedData);
    return res.status(200).json(updatedFeedback);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    console.error("Error updating buyer feedback:", error);
    return res.status(500).json({ message: "Failed to update buyer feedback" });
  }
});

router.patch("/feedback/:id/respond", withTenant, async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const { response } = req.body;
    if (!response) {
      return res.status(400).json({ message: "Response is required" });
    }
    
    const updatedFeedback = await commercialService.respondToBuyerFeedback(id, req.tenantId!, req.user.id, response);
    return res.status(200).json(updatedFeedback);
  } catch (error) {
    console.error("Error responding to buyer feedback:", error);
    return res.status(500).json({ message: "Failed to respond to buyer feedback" });
  }
});

export default router;