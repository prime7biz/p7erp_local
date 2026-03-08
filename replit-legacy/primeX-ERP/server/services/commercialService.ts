import { db } from "../db";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  commercialInquiries,
  costingTemplates,
  commercialQuotations,
  quotationStyles,
  styleCostBreakdowns,
  cmCostBreakdowns,
  commercialOrders,
  orderStyles,
  exportDocuments,
  shipments,
  buyerFeedback,
  type CommercialInquiry,
  type InsertCommercialInquiry,
  type CostingTemplate,
  type InsertCostingTemplate,
  type CommercialQuotation,
  type InsertCommercialQuotation,
  type QuotationStyle,
  type InsertQuotationStyle,
  type StyleCostBreakdown,
  type InsertStyleCostBreakdown,
  type CmCostBreakdown,
  type InsertCmCostBreakdown,
  type CommercialOrder,
  type InsertCommercialOrder,
  type OrderStyle,
  type InsertOrderStyle,
  type ExportDocument,
  type InsertExportDocument,
  type Shipment,
  type InsertShipment,
  type BuyerFeedback,
  type InsertBuyerFeedback
} from "../../shared/schema/commercial";
import { commercialLcs, type CommercialLc, type InsertCommercialLc } from "../../shared/schema";

type LetterOfCredit = CommercialLc;
type InsertLetterOfCredit = InsertCommercialLc;
const letterOfCredits = commercialLcs;

class CommercialService {
  // Generate unique IDs
  private async generateInquiryNumber(tenantId: number): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    
    const latestInquiry = await db.select({ 
      inquiryNumber: commercialInquiries.inquiryNumber 
    })
    .from(commercialInquiries)
    .where(eq(commercialInquiries.tenantId, tenantId))
    .orderBy(desc(commercialInquiries.id))
    .limit(1);
    
    let sequence = 1;
    if (latestInquiry.length > 0) {
      const lastNumber = latestInquiry[0].inquiryNumber;
      const lastSequence = parseInt(lastNumber.split('-')[2], 10);
      sequence = lastSequence + 1;
    }
    
    return `INQ-${year}${month}-${sequence.toString().padStart(4, '0')}`;
  }
  
  private async generateQuotationNumber(tenantId: number): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    
    const latestQuotation = await db.select({ 
      quotationNumber: commercialQuotations.quotationNumber 
    })
    .from(commercialQuotations)
    .where(eq(commercialQuotations.tenantId, tenantId))
    .orderBy(desc(commercialQuotations.id))
    .limit(1);
    
    let sequence = 1;
    if (latestQuotation.length > 0) {
      const lastNumber = latestQuotation[0].quotationNumber;
      const lastSequence = parseInt(lastNumber.split('-')[2], 10);
      sequence = lastSequence + 1;
    }
    
    return `QT-${year}${month}-${sequence.toString().padStart(4, '0')}`;
  }
  
  private async generateOrderNumber(tenantId: number): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    
    const latestOrder = await db.select({ 
      orderNumber: commercialOrders.orderNumber 
    })
    .from(commercialOrders)
    .where(eq(commercialOrders.tenantId, tenantId))
    .orderBy(desc(commercialOrders.id))
    .limit(1);
    
    let sequence = 1;
    if (latestOrder.length > 0) {
      const lastNumber = latestOrder[0].orderNumber;
      const lastSequence = parseInt(lastNumber.split('-')[2], 10);
      sequence = lastSequence + 1;
    }
    
    return `ORD-${year}${month}-${sequence.toString().padStart(4, '0')}`;
  }

  // Commercial Inquiry Methods
  async getAllInquiries(tenantId: number): Promise<CommercialInquiry[]> {
    return db.select()
      .from(commercialInquiries)
      .where(eq(commercialInquiries.tenantId, tenantId))
      .orderBy(desc(commercialInquiries.createdAt));
  }
  
  async getInquiryById(id: number, tenantId: number): Promise<CommercialInquiry | undefined> {
    const [inquiry] = await db.select()
      .from(commercialInquiries)
      .where(and(
        eq(commercialInquiries.id, id),
        eq(commercialInquiries.tenantId, tenantId)
      ));
    
    return inquiry;
  }
  
  async getInquiryByNumber(inquiryNumber: string, tenantId: number): Promise<CommercialInquiry | undefined> {
    const [inquiry] = await db.select()
      .from(commercialInquiries)
      .where(and(
        eq(commercialInquiries.inquiryNumber, inquiryNumber),
        eq(commercialInquiries.tenantId, tenantId)
      ));
    
    return inquiry;
  }
  
  async createInquiry(data: InsertCommercialInquiry): Promise<CommercialInquiry> {
    const inquiryNumber = await this.generateInquiryNumber(data.tenantId);
    
    const [inquiry] = await db.insert(commercialInquiries)
      .values({
        ...data,
        inquiryNumber
      })
      .returning();
    
    return inquiry;
  }
  
  async updateInquiry(id: number, tenantId: number, data: Partial<InsertCommercialInquiry>): Promise<CommercialInquiry> {
    const [updatedInquiry] = await db.update(commercialInquiries)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(and(
        eq(commercialInquiries.id, id),
        eq(commercialInquiries.tenantId, tenantId)
      ))
      .returning();
    
    return updatedInquiry;
  }
  
  async deleteInquiry(id: number, tenantId: number): Promise<boolean> {
    try {
      await db.delete(commercialInquiries)
        .where(and(
          eq(commercialInquiries.id, id),
          eq(commercialInquiries.tenantId, tenantId)
        ));
      
      return true;
    } catch (error) {
      console.error("Error deleting inquiry:", error);
      return false;
    }
  }

  // Costing Template Methods
  async getAllCostingTemplates(tenantId: number): Promise<CostingTemplate[]> {
    return db.select()
      .from(costingTemplates)
      .where(eq(costingTemplates.tenantId, tenantId))
      .orderBy(costingTemplates.templateName);
  }
  
  async getCostingTemplateById(id: number, tenantId: number): Promise<CostingTemplate | undefined> {
    const [template] = await db.select()
      .from(costingTemplates)
      .where(and(
        eq(costingTemplates.id, id),
        eq(costingTemplates.tenantId, tenantId)
      ));
    
    return template;
  }
  
  async createCostingTemplate(data: InsertCostingTemplate): Promise<CostingTemplate> {
    const [template] = await db.insert(costingTemplates)
      .values(data)
      .returning();
    
    return template;
  }
  
  async updateCostingTemplate(id: number, tenantId: number, data: Partial<InsertCostingTemplate>): Promise<CostingTemplate> {
    const [updatedTemplate] = await db.update(costingTemplates)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(and(
        eq(costingTemplates.id, id),
        eq(costingTemplates.tenantId, tenantId)
      ))
      .returning();
    
    return updatedTemplate;
  }

  // Commercial Quotation Methods
  async getAllQuotations(tenantId: number): Promise<CommercialQuotation[]> {
    return db.select()
      .from(commercialQuotations)
      .where(eq(commercialQuotations.tenantId, tenantId))
      .orderBy(desc(commercialQuotations.createdAt));
  }
  
  async getQuotationById(id: number, tenantId: number): Promise<CommercialQuotation | undefined> {
    const [quotation] = await db.select()
      .from(commercialQuotations)
      .where(and(
        eq(commercialQuotations.id, id),
        eq(commercialQuotations.tenantId, tenantId)
      ));
    
    return quotation;
  }
  
  async getQuotationByNumber(quotationNumber: string, tenantId: number): Promise<CommercialQuotation | undefined> {
    const [quotation] = await db.select()
      .from(commercialQuotations)
      .where(and(
        eq(commercialQuotations.quotationNumber, quotationNumber),
        eq(commercialQuotations.tenantId, tenantId)
      ));
    
    return quotation;
  }
  
  async createQuotation(data: InsertCommercialQuotation): Promise<CommercialQuotation> {
    const quotationNumber = await this.generateQuotationNumber(data.tenantId);
    
    const [quotation] = await db.insert(commercialQuotations)
      .values({
        ...data,
        quotationNumber
      })
      .returning();
    
    return quotation;
  }
  
  async updateQuotation(id: number, tenantId: number, data: Partial<InsertCommercialQuotation>): Promise<CommercialQuotation> {
    const [updatedQuotation] = await db.update(commercialQuotations)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(and(
        eq(commercialQuotations.id, id),
        eq(commercialQuotations.tenantId, tenantId)
      ))
      .returning();
    
    return updatedQuotation;
  }
  
  async approveQuotation(id: number, tenantId: number, userId: number): Promise<CommercialQuotation> {
    const [approvedQuotation] = await db.update(commercialQuotations)
      .set({
        isApproved: true,
        approvedBy: userId,
        approvalDate: new Date(),
        updatedAt: new Date()
      })
      .where(and(
        eq(commercialQuotations.id, id),
        eq(commercialQuotations.tenantId, tenantId)
      ))
      .returning();
    
    return approvedQuotation;
  }

  // Quotation Style Methods
  async getQuotationStyles(quotationId: number, tenantId: number): Promise<QuotationStyle[]> {
    return db.select()
      .from(quotationStyles)
      .where(and(
        eq(quotationStyles.quotationId, quotationId),
        eq(quotationStyles.tenantId, tenantId)
      ));
  }
  
  async getQuotationStyleById(id: number, tenantId: number): Promise<QuotationStyle | undefined> {
    const [style] = await db.select()
      .from(quotationStyles)
      .where(and(
        eq(quotationStyles.id, id),
        eq(quotationStyles.tenantId, tenantId)
      ));
    
    return style;
  }
  
  async createQuotationStyle(data: InsertQuotationStyle): Promise<QuotationStyle> {
    const [style] = await db.insert(quotationStyles)
      .values(data)
      .returning();
    
    return style;
  }
  
  async updateQuotationStyle(id: number, tenantId: number, data: Partial<InsertQuotationStyle>): Promise<QuotationStyle> {
    const [updatedStyle] = await db.update(quotationStyles)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(and(
        eq(quotationStyles.id, id),
        eq(quotationStyles.tenantId, tenantId)
      ))
      .returning();
    
    return updatedStyle;
  }
  
  async deleteQuotationStyle(id: number, tenantId: number): Promise<boolean> {
    try {
      await db.delete(quotationStyles)
        .where(and(
          eq(quotationStyles.id, id),
          eq(quotationStyles.tenantId, tenantId)
        ));
      
      return true;
    } catch (error) {
      console.error("Error deleting quotation style:", error);
      return false;
    }
  }

  // Style Cost Breakdown Methods
  async getStyleCostBreakdowns(styleId: number, tenantId: number): Promise<StyleCostBreakdown[]> {
    return db.select()
      .from(styleCostBreakdowns)
      .where(and(
        eq(styleCostBreakdowns.styleId, styleId),
        eq(styleCostBreakdowns.tenantId, tenantId)
      ));
  }
  
  async createStyleCostBreakdown(data: InsertStyleCostBreakdown): Promise<StyleCostBreakdown> {
    const [costBreakdown] = await db.insert(styleCostBreakdowns)
      .values(data)
      .returning();
    
    return costBreakdown;
  }
  
  async updateStyleCostBreakdown(id: number, tenantId: number, data: Partial<InsertStyleCostBreakdown>): Promise<StyleCostBreakdown> {
    const [updatedCostBreakdown] = await db.update(styleCostBreakdowns)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(and(
        eq(styleCostBreakdowns.id, id),
        eq(styleCostBreakdowns.tenantId, tenantId)
      ))
      .returning();
    
    return updatedCostBreakdown;
  }
  
  async deleteStyleCostBreakdown(id: number, tenantId: number): Promise<boolean> {
    try {
      await db.delete(styleCostBreakdowns)
        .where(and(
          eq(styleCostBreakdowns.id, id),
          eq(styleCostBreakdowns.tenantId, tenantId)
        ));
      
      return true;
    } catch (error) {
      console.error("Error deleting style cost breakdown:", error);
      return false;
    }
  }

  // CM Cost Breakdown Methods
  async getCmCostBreakdowns(styleId: number, tenantId: number): Promise<CmCostBreakdown[]> {
    return db.select()
      .from(cmCostBreakdowns)
      .where(and(
        eq(cmCostBreakdowns.styleId, styleId),
        eq(cmCostBreakdowns.tenantId, tenantId)
      ));
  }
  
  async createCmCostBreakdown(data: InsertCmCostBreakdown): Promise<CmCostBreakdown> {
    const [cmCostBreakdown] = await db.insert(cmCostBreakdowns)
      .values(data)
      .returning();
    
    return cmCostBreakdown;
  }
  
  async updateCmCostBreakdown(id: number, tenantId: number, data: Partial<InsertCmCostBreakdown>): Promise<CmCostBreakdown> {
    const [updatedCmCostBreakdown] = await db.update(cmCostBreakdowns)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(and(
        eq(cmCostBreakdowns.id, id),
        eq(cmCostBreakdowns.tenantId, tenantId)
      ))
      .returning();
    
    return updatedCmCostBreakdown;
  }
  
  async deleteCmCostBreakdown(id: number, tenantId: number): Promise<boolean> {
    try {
      await db.delete(cmCostBreakdowns)
        .where(and(
          eq(cmCostBreakdowns.id, id),
          eq(cmCostBreakdowns.tenantId, tenantId)
        ));
      
      return true;
    } catch (error) {
      console.error("Error deleting CM cost breakdown:", error);
      return false;
    }
  }

  // Commercial Order Methods
  async getAllOrders(tenantId: number): Promise<CommercialOrder[]> {
    return db.select()
      .from(commercialOrders)
      .where(eq(commercialOrders.tenantId, tenantId))
      .orderBy(desc(commercialOrders.createdAt));
  }
  
  async getOrderById(id: number, tenantId: number): Promise<CommercialOrder | undefined> {
    const [order] = await db.select()
      .from(commercialOrders)
      .where(and(
        eq(commercialOrders.id, id),
        eq(commercialOrders.tenantId, tenantId)
      ));
    
    return order;
  }
  
  async getOrderByNumber(orderNumber: string, tenantId: number): Promise<CommercialOrder | undefined> {
    const [order] = await db.select()
      .from(commercialOrders)
      .where(and(
        eq(commercialOrders.orderNumber, orderNumber),
        eq(commercialOrders.tenantId, tenantId)
      ));
    
    return order;
  }
  
  async createOrder(data: InsertCommercialOrder): Promise<CommercialOrder> {
    const orderNumber = await this.generateOrderNumber(data.tenantId);
    
    const [order] = await db.insert(commercialOrders)
      .values({
        ...data,
        orderNumber
      })
      .returning();
    
    return order;
  }
  
  async updateOrder(id: number, tenantId: number, data: Partial<InsertCommercialOrder>): Promise<CommercialOrder> {
    const [updatedOrder] = await db.update(commercialOrders)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(and(
        eq(commercialOrders.id, id),
        eq(commercialOrders.tenantId, tenantId)
      ))
      .returning();
    
    return updatedOrder;
  }
  
  async confirmOrder(id: number, tenantId: number, userId: number): Promise<CommercialOrder> {
    const [confirmedOrder] = await db.update(commercialOrders)
      .set({
        isConfirmed: true,
        confirmedBy: userId,
        confirmationDate: new Date(),
        updatedAt: new Date()
      })
      .where(and(
        eq(commercialOrders.id, id),
        eq(commercialOrders.tenantId, tenantId)
      ))
      .returning();
    
    return confirmedOrder;
  }

  // Order Style Methods
  async getOrderStyles(orderId: number, tenantId: number): Promise<OrderStyle[]> {
    return db.select()
      .from(orderStyles)
      .where(and(
        eq(orderStyles.orderId, orderId),
        eq(orderStyles.tenantId, tenantId)
      ));
  }
  
  async getOrderStyleById(id: number, tenantId: number): Promise<OrderStyle | undefined> {
    const [style] = await db.select()
      .from(orderStyles)
      .where(and(
        eq(orderStyles.id, id),
        eq(orderStyles.tenantId, tenantId)
      ));
    
    return style;
  }
  
  async createOrderStyle(data: InsertOrderStyle): Promise<OrderStyle> {
    const [style] = await db.insert(orderStyles)
      .values(data)
      .returning();
    
    return style;
  }
  
  async updateOrderStyle(id: number, tenantId: number, data: Partial<InsertOrderStyle>): Promise<OrderStyle> {
    const [updatedStyle] = await db.update(orderStyles)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(and(
        eq(orderStyles.id, id),
        eq(orderStyles.tenantId, tenantId)
      ))
      .returning();
    
    return updatedStyle;
  }
  
  async updateOrderStyleStatus(id: number, tenantId: number, status: string): Promise<OrderStyle> {
    const [updatedStyle] = await db.update(orderStyles)
      .set({
        status,
        updatedAt: new Date()
      })
      .where(and(
        eq(orderStyles.id, id),
        eq(orderStyles.tenantId, tenantId)
      ))
      .returning();
    
    return updatedStyle;
  }

  // Letter of Credit Methods
  async getAllLetterOfCredits(tenantId: number): Promise<LetterOfCredit[]> {
    return db.select()
      .from(letterOfCredits)
      .where(eq(letterOfCredits.tenantId, tenantId))
      .orderBy(desc(letterOfCredits.createdAt));
  }
  
  async getLetterOfCreditsByOrder(orderId: number, tenantId: number): Promise<LetterOfCredit[]> {
    return db.select()
      .from(letterOfCredits)
      .where(and(
        eq(letterOfCredits.linkedSalesOrderId, orderId),
        eq(letterOfCredits.tenantId, tenantId)
      ));
  }
  
  async getLetterOfCreditById(id: number, tenantId: number): Promise<LetterOfCredit | undefined> {
    const [lc] = await db.select()
      .from(letterOfCredits)
      .where(and(
        eq(letterOfCredits.id, id),
        eq(letterOfCredits.tenantId, tenantId)
      ));
    
    return lc;
  }
  
  async createLetterOfCredit(data: InsertLetterOfCredit): Promise<LetterOfCredit> {
    const [lc] = await db.insert(letterOfCredits)
      .values(data)
      .returning();
    
    return lc;
  }
  
  async updateLetterOfCredit(id: number, tenantId: number, data: Partial<InsertLetterOfCredit>): Promise<LetterOfCredit> {
    const [updatedLc] = await db.update(letterOfCredits)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(and(
        eq(letterOfCredits.id, id),
        eq(letterOfCredits.tenantId, tenantId)
      ))
      .returning();
    
    return updatedLc;
  }

  // Export Document Methods
  async getAllExportDocuments(tenantId: number): Promise<ExportDocument[]> {
    return db.select()
      .from(exportDocuments)
      .where(eq(exportDocuments.tenantId, tenantId))
      .orderBy(desc(exportDocuments.createdAt));
  }
  
  async getExportDocumentsByOrder(orderId: number, tenantId: number): Promise<ExportDocument[]> {
    return db.select()
      .from(exportDocuments)
      .where(and(
        eq(exportDocuments.orderId, orderId),
        eq(exportDocuments.tenantId, tenantId)
      ));
  }
  
  async getExportDocumentById(id: number, tenantId: number): Promise<ExportDocument | undefined> {
    const [document] = await db.select()
      .from(exportDocuments)
      .where(and(
        eq(exportDocuments.id, id),
        eq(exportDocuments.tenantId, tenantId)
      ));
    
    return document;
  }
  
  async createExportDocument(data: InsertExportDocument): Promise<ExportDocument> {
    const [document] = await db.insert(exportDocuments)
      .values(data)
      .returning();
    
    return document;
  }
  
  async updateExportDocument(id: number, tenantId: number, data: Partial<InsertExportDocument>): Promise<ExportDocument> {
    const [updatedDocument] = await db.update(exportDocuments)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(and(
        eq(exportDocuments.id, id),
        eq(exportDocuments.tenantId, tenantId)
      ))
      .returning();
    
    return updatedDocument;
  }

  async getAllShipments(tenantId: number): Promise<any[]> {
    const results = await db.select({
      shipment: shipments,
      orderNumber: commercialOrders.orderNumber,
      orderAmount: commercialOrders.totalAmount,
      orderCurrency: commercialOrders.currencyCode,
    })
      .from(shipments)
      .leftJoin(commercialOrders, eq(shipments.orderId, commercialOrders.id))
      .where(eq(shipments.tenantId, tenantId))
      .orderBy(desc(shipments.createdAt));

    return results.map(r => ({
      ...r.shipment,
      orderNumber: r.orderNumber,
      totalValue: r.orderAmount || r.shipment.shippingCost || '0',
      orderCurrency: r.orderCurrency || 'USD',
    }));
  }
  
  async getShipmentsByOrder(orderId: number, tenantId: number): Promise<Shipment[]> {
    return db.select()
      .from(shipments)
      .where(and(
        eq(shipments.orderId, orderId),
        eq(shipments.tenantId, tenantId)
      ));
  }
  
  async getShipmentById(id: number, tenantId: number): Promise<Shipment | undefined> {
    const [shipment] = await db.select()
      .from(shipments)
      .where(and(
        eq(shipments.id, id),
        eq(shipments.tenantId, tenantId)
      ));
    
    return shipment;
  }
  
  async createShipment(data: InsertShipment): Promise<Shipment> {
    // Generate shipment number
    const year = new Date().getFullYear().toString().slice(-2);
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    
    const latestShipment = await db.select({ 
      shipmentNumber: shipments.shipmentNumber 
    })
    .from(shipments)
    .where(eq(shipments.tenantId, data.tenantId))
    .orderBy(desc(shipments.id))
    .limit(1);
    
    let sequence = 1;
    if (latestShipment.length > 0) {
      const lastNumber = latestShipment[0].shipmentNumber;
      const lastSequence = parseInt(lastNumber.split('-')[2], 10);
      sequence = lastSequence + 1;
    }
    
    const shipmentNumber = `SHP-${year}${month}-${sequence.toString().padStart(4, '0')}`;
    
    const [shipment] = await db.insert(shipments)
      .values({
        ...data,
        shipmentNumber
      })
      .returning();
    
    return shipment;
  }
  
  async updateShipment(id: number, tenantId: number, data: Partial<InsertShipment>): Promise<Shipment> {
    const [updatedShipment] = await db.update(shipments)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(and(
        eq(shipments.id, id),
        eq(shipments.tenantId, tenantId)
      ))
      .returning();
    
    return updatedShipment;
  }

  // Buyer Feedback Methods
  async getAllBuyerFeedback(tenantId: number): Promise<BuyerFeedback[]> {
    return db.select()
      .from(buyerFeedback)
      .where(eq(buyerFeedback.tenantId, tenantId))
      .orderBy(desc(buyerFeedback.createdAt));
  }
  
  async getBuyerFeedbackByOrder(orderId: number, tenantId: number): Promise<BuyerFeedback | undefined> {
    const [feedback] = await db.select()
      .from(buyerFeedback)
      .where(and(
        eq(buyerFeedback.orderId, orderId),
        eq(buyerFeedback.tenantId, tenantId)
      ));
    
    return feedback;
  }
  
  async createBuyerFeedback(data: InsertBuyerFeedback): Promise<BuyerFeedback> {
    const [feedback] = await db.insert(buyerFeedback)
      .values(data)
      .returning();
    
    return feedback;
  }
  
  async updateBuyerFeedback(id: number, tenantId: number, data: Partial<InsertBuyerFeedback>): Promise<BuyerFeedback> {
    const [updatedFeedback] = await db.update(buyerFeedback)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(and(
        eq(buyerFeedback.id, id),
        eq(buyerFeedback.tenantId, tenantId)
      ))
      .returning();
    
    return updatedFeedback;
  }
  
  async respondToBuyerFeedback(id: number, tenantId: number, userId: number, response: string): Promise<BuyerFeedback> {
    const [updatedFeedback] = await db.update(buyerFeedback)
      .set({
        respondedBy: userId,
        responseDate: new Date(),
        responseComments: response,
        updatedAt: new Date()
      })
      .where(and(
        eq(buyerFeedback.id, id),
        eq(buyerFeedback.tenantId, tenantId)
      ))
      .returning();
    
    return updatedFeedback;
  }

  // Dashboard Analytics
  async getCommercialDashboardStats(tenantId: number) {
    const inquiriesCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(commercialInquiries)
      .where(eq(commercialInquiries.tenantId, tenantId));

    const quotationsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(commercialQuotations)
      .where(eq(commercialQuotations.tenantId, tenantId));

    const ordersCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(commercialOrders)
      .where(eq(commercialOrders.tenantId, tenantId));

    const shipmentsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(shipments)
      .where(eq(shipments.tenantId, tenantId));

    const lcCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(letterOfCredits)
      .where(eq(letterOfCredits.tenantId, tenantId));

    const activeOrders = await db
      .select({ count: sql<number>`count(*)` })
      .from(commercialOrders)
      .where(and(
        eq(commercialOrders.tenantId, tenantId),
        eq(commercialOrders.orderStatus, "Processing")
      ));

    const totalOrderValue = await db
      .select({ total: sql<number>`COALESCE(sum(total_amount), 0)` })
      .from(commercialOrders)
      .where(eq(commercialOrders.tenantId, tenantId));

    return {
      inquiriesCount: inquiriesCount[0]?.count || 0,
      quotationsCount: quotationsCount[0]?.count || 0,
      ordersCount: ordersCount[0]?.count || 0,
      shipmentsCount: shipmentsCount[0]?.count || 0,
      lcCount: lcCount[0]?.count || 0,
      activeOrders: activeOrders[0]?.count || 0,
      totalOrderValue: totalOrderValue[0]?.total || 0
    };
  }

  async getPendingQuotations(tenantId: number) {
    return db.select()
      .from(commercialQuotations)
      .where(and(
        eq(commercialQuotations.tenantId, tenantId),
        eq(commercialQuotations.quotationStatus, "Pending"),
        sql`${commercialQuotations.isApproved} = false`
      ))
      .orderBy(commercialQuotations.validUntil)
      .limit(5);
  }

  async getRecentOrders(tenantId: number) {
    return db.select()
      .from(commercialOrders)
      .where(eq(commercialOrders.tenantId, tenantId))
      .orderBy(desc(commercialOrders.createdAt))
      .limit(5);
  }

  async getUpcomingShipments(tenantId: number) {
    const currentDate = new Date();
    return db.select()
      .from(shipments)
      .where(and(
        eq(shipments.tenantId, tenantId),
        sql`${shipments.shipmentDate} >= ${currentDate}`
      ))
      .orderBy(shipments.shipmentDate)
      .limit(5);
  }

  async getExpiringLCs(tenantId: number) {
    const currentDate = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(currentDate.getDate() + 30);
    
    return db.select()
      .from(letterOfCredits)
      .where(and(
        eq(letterOfCredits.tenantId, tenantId),
        sql`${letterOfCredits.expiryDate} >= ${currentDate}`,
        sql`${letterOfCredits.expiryDate} <= ${thirtyDaysFromNow}`
      ))
      .orderBy(letterOfCredits.expiryDate)
      .limit(5);
  }
}

export const commercialService = new CommercialService();