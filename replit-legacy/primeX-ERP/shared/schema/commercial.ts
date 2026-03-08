import { pgTable, text, serial, integer, boolean, timestamp, varchar, date, jsonb, decimal, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
import { tenants, users } from "../schema";

// Commercial Inquiry Table (for initial customer inquiries)
export const commercialInquiries = pgTable("commercial_inquiries", {
  id: serial("id").primaryKey(),
  inquiryNumber: varchar("inquiry_number", { length: 50 }).notNull().unique(),
  customerId: integer("customer_id").notNull(),
  inquiryDate: timestamp("inquiry_date").defaultNow().notNull(),
  season: varchar("season", { length: 50 }),
  deliveryDeadline: date("delivery_deadline"),
  fabricRequirements: text("fabric_requirements"),
  samplingRequirements: text("sampling_requirements"),
  productionCapacity: integer("production_capacity"),
  targetPrice: decimal("target_price", { precision: 10, scale: 2 }),
  targetMarkets: varchar("target_markets", { length: 255 }),
  complianceRequirements: text("compliance_requirements"),
  inquiryStatus: varchar("inquiry_status", { length: 50 }).default("New").notNull(),
  assignedTo: integer("assigned_to").references(() => users.id),
  sustainabilityRequirements: text("sustainability_requirements"),
  preferredColors: text("preferred_colors"),
  specialFinishes: text("special_finishes"),
  attachments: jsonb("attachments").$type<string[]>().default([]),
  comments: text("comments"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
});

// Commercial Quotations
export const commercialQuotations = pgTable("commercial_quotations", {
  id: serial("id").primaryKey(),
  quotationNumber: varchar("quotation_number", { length: 50 }).notNull().unique(),
  inquiryId: integer("inquiry_id").references(() => commercialInquiries.id),
  customerId: integer("customer_id").notNull(),
  quotationDate: timestamp("quotation_date").defaultNow().notNull(),
  validUntil: date("valid_until").notNull(),
  fabricDetails: text("fabric_details"),
  productionLeadTime: integer("production_lead_time"),
  samplingCost: decimal("sampling_cost", { precision: 10, scale: 2 }),
  quotationStatus: varchar("quotation_status", { length: 50 }).default("Draft").notNull(),
  paymentTerms: varchar("payment_terms", { length: 255 }),
  shippingTerms: varchar("shipping_terms", { length: 255 }),
  totalQuantity: integer("total_quantity"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),
  profitMargin: decimal("profit_margin", { precision: 5, scale: 2 }),
  currencyCode: varchar("currency_code", { length: 3 }).default("USD"),
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 4 }),
  isApproved: boolean("is_approved").default(false),
  approvedBy: integer("approved_by").references(() => users.id),
  approvalDate: timestamp("approval_date"),
  comments: text("comments"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
});

// Commercial Orders (confirmed orders from customers)
export const commercialOrders = pgTable("commercial_orders", {
  id: serial("id").primaryKey(),
  orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
  quotationId: integer("quotation_id").references(() => commercialQuotations.id),
  customerId: integer("customer_id").notNull(),
  poNumber: varchar("po_number", { length: 100 }),
  orderDate: timestamp("order_date").defaultNow().notNull(),
  deliveryDate: date("delivery_date"),
  orderStatus: varchar("order_status", { length: 50 }).default("New").notNull(),
  totalQuantity: integer("total_quantity"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),
  currencyCode: varchar("currency_code", { length: 3 }).default("USD"),
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 4 }),
  paymentTerms: varchar("payment_terms", { length: 255 }),
  shippingTerms: varchar("shipping_terms", { length: 255 }),
  isConfirmed: boolean("is_confirmed").default(false),
  confirmedBy: integer("confirmed_by").references(() => users.id),
  confirmationDate: timestamp("confirmation_date"),
  buyerRemarks: text("buyer_remarks"),
  internalNotes: text("internal_notes"),
  attachments: jsonb("attachments").$type<string[]>().default([]),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
});

// LC (Letter of Credit) Management
export const letterOfCredits = pgTable("letter_of_credits", {
  id: serial("id").primaryKey(),
  lcNumber: varchar("lc_number", { length: 100 }).notNull(),
  orderId: integer("order_id").references(() => commercialOrders.id),
  customerId: integer("customer_id").notNull(),
  bankName: varchar("bank_name", { length: 255 }),
  issuingBank: varchar("issuing_bank", { length: 255 }),
  advisingBank: varchar("advising_bank", { length: 255 }),
  issuanceDate: date("issuance_date"),
  expiryDate: date("expiry_date"),
  lastShipmentDate: date("last_shipment_date"),
  amount: decimal("amount", { precision: 12, scale: 2 }),
  currencyCode: varchar("currency_code", { length: 3 }).default("USD"),
  status: varchar("status", { length: 50 }).default("Draft"),
  documents: jsonb("documents").$type<string[]>().default([]),
  amendmentDetails: text("amendment_details"),
  amendmentDate: date("amendment_date"),
  lcTerms: text("lc_terms"),
  paymentTerms: varchar("payment_terms", { length: 255 }),
  bankCharges: decimal("bank_charges", { precision: 10, scale: 2 }),
  discrepancies: text("discrepancies"),
  reminderDate: date("reminder_date"),
  comments: text("comments"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
});

// Shipment Details
export const shipments = pgTable("shipments", {
  id: serial("id").primaryKey(),
  shipmentNumber: varchar("shipment_number", { length: 50 }).notNull().unique(),
  orderId: integer("order_id").references(() => commercialOrders.id),
  shipmentDate: date("shipment_date"),
  etd: date("etd"), // Estimated Time of Departure
  eta: date("eta"), // Estimated Time of Arrival
  shipmentMode: varchar("shipment_mode", { length: 50 }), // Air, Sea, Land
  carrier: varchar("carrier", { length: 255 }),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  containerDetails: jsonb("container_details"),
  goodsDescription: text("goods_description"),
  packageCount: integer("package_count"),
  grossWeight: decimal("gross_weight", { precision: 10, scale: 2 }),
  netWeight: decimal("net_weight", { precision: 10, scale: 2 }),
  volume: decimal("volume", { precision: 10, scale: 2 }),
  unitOfMeasure: varchar("unit_of_measure", { length: 20 }),
  forwarder: varchar("forwarder", { length: 255 }),
  shippingDocuments: jsonb("shipping_documents"),
  customsClearanceStatus: varchar("customs_clearance_status", { length: 50 }),
  inspectionDetails: text("inspection_details"),
  portOfLoading: varchar("port_of_loading", { length: 255 }),
  portOfDischarge: varchar("port_of_discharge", { length: 255 }),
  blNumber: varchar("bl_number", { length: 100 }),
  vesselName: varchar("vessel_name", { length: 255 }),
  shippingCost: decimal("shipping_cost", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 50 }).default("Planned"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
});

// Buyer's Feedback (post-delivery feedback)
export const buyerFeedback = pgTable("buyer_feedback", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => commercialOrders.id),
  customerId: integer("customer_id").notNull(),
  feedbackDate: date("feedback_date").defaultNow(),
  qualityRating: integer("quality_rating"), // 1-5 scale
  deliveryRating: integer("delivery_rating"), // 1-5 scale
  communicationRating: integer("communication_rating"), // 1-5 scale
  priceRating: integer("price_rating"), // 1-5 scale
  overallRating: integer("overall_rating"), // 1-5 scale
  comments: text("comments"),
  strengthsHighlighted: text("strengths_highlighted"),
  improvementAreas: text("improvement_areas"),
  actionTaken: text("action_taken"),
  respondedBy: integer("responded_by").references(() => users.id),
  responseDate: date("response_date"),
  responseComments: text("response_comments"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
});

// Define relations
export const commercialInquiriesRelations = relations(commercialInquiries, ({ many }) => ({
  quotations: many(commercialQuotations),
}));

export const commercialQuotationsRelations = relations(commercialQuotations, ({ one, many }) => ({
  inquiry: one(commercialInquiries, {
    fields: [commercialQuotations.inquiryId],
    references: [commercialInquiries.id],
  }),
  orders: many(commercialOrders),
}));

export const commercialOrdersRelations = relations(commercialOrders, ({ one, many }) => ({
  quotation: one(commercialQuotations, {
    fields: [commercialOrders.quotationId],
    references: [commercialQuotations.id],
  }),
  letterOfCredits: many(letterOfCredits),
  shipments: many(shipments),
  feedback: many(buyerFeedback),
}));

export const letterOfCreditsRelations = relations(letterOfCredits, ({ one }) => ({
  order: one(commercialOrders, {
    fields: [letterOfCredits.orderId],
    references: [commercialOrders.id],
  }),
}));

export const shipmentsRelations = relations(shipments, ({ one }) => ({
  order: one(commercialOrders, {
    fields: [shipments.orderId],
    references: [commercialOrders.id],
  }),
}));

export const buyerFeedbackRelations = relations(buyerFeedback, ({ one }) => ({
  order: one(commercialOrders, {
    fields: [buyerFeedback.orderId],
    references: [commercialOrders.id],
  }),
}));

// Costing Templates for Product Costing
export const costingTemplates = pgTable("costing_templates", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  templateName: varchar("template_name", { length: 100 }).notNull(),
  productCategory: varchar("product_category", { length: 100 }).notNull(),
  description: text("description"),
  defaultWastage: decimal("default_wastage", { precision: 5, scale: 2 }),
  defaultProfit: decimal("default_profit", { precision: 5, scale: 2 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => {
  return {
    tenantTemplateNameUnq: unique().on(table.tenantId, table.templateName),
  };
});

// Quotation Styles - for storing style details in quotations
export const quotationStyles = pgTable("quotation_styles", {
  id: serial("id").primaryKey(),
  quotationId: integer("quotation_id").notNull().references(() => commercialQuotations.id),
  styleName: varchar("style_name", { length: 100 }).notNull(),
  styleCode: varchar("style_code", { length: 50 }),
  productCategory: varchar("product_category", { length: 100 }),
  description: text("description"),
  technicalDetails: text("technical_details"),
  sizeRange: varchar("size_range", { length: 255 }),
  colors: varchar("colors", { length: 255 }),
  fabricComposition: varchar("fabric_composition", { length: 255 }),
  fabricWeight: varchar("fabric_weight", { length: 50 }),
  artwork: jsonb("artwork").$type<string[]>().default([]),
  quantityPerSize: jsonb("quantity_per_size"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  totalQuantity: integer("total_quantity"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),
  comments: text("comments"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Style Cost Breakdowns - for material costs in quotations
export const styleCostBreakdowns = pgTable("style_cost_breakdowns", {
  id: serial("id").primaryKey(),
  styleId: integer("style_id").notNull().references(() => quotationStyles.id),
  materialCategory: varchar("material_category", { length: 100 }).notNull(),
  materialName: varchar("material_name", { length: 100 }).notNull(),
  materialDescription: text("material_description"),
  supplier: varchar("supplier", { length: 100 }),
  unit: varchar("unit", { length: 20 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  wastage: decimal("wastage", { precision: 5, scale: 2 }),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).notNull(),
  remarks: text("remarks"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// CM (Cost of Manufacturing) Breakdowns
export const cmCostBreakdowns = pgTable("cm_cost_breakdowns", {
  id: serial("id").primaryKey(),
  styleId: integer("style_id").notNull().references(() => quotationStyles.id),
  operationName: varchar("operation_name", { length: 100 }).notNull(),
  department: varchar("department", { length: 100 }),
  machineType: varchar("machine_type", { length: 100 }),
  timeRequired: decimal("time_required", { precision: 8, scale: 2 }), // in minutes
  costPerMinute: decimal("cost_per_minute", { precision: 8, scale: 4 }),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).notNull(),
  remarks: text("remarks"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Order Styles - similar to quotation styles but for confirmed orders
export const orderStyles = pgTable("order_styles", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => commercialOrders.id),
  quotationStyleId: integer("quotation_style_id").references(() => quotationStyles.id),
  styleName: varchar("style_name", { length: 100 }).notNull(),
  styleCode: varchar("style_code", { length: 50 }),
  productCategory: varchar("product_category", { length: 100 }),
  description: text("description"),
  technicalDetails: text("technical_details"),
  sizeRange: varchar("size_range", { length: 255 }),
  colors: varchar("colors", { length: 255 }),
  fabricComposition: varchar("fabric_composition", { length: 255 }),
  fabricWeight: varchar("fabric_weight", { length: 50 }),
  artwork: jsonb("artwork").$type<string[]>().default([]),
  quantityPerSize: jsonb("quantity_per_size"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  totalQuantity: integer("total_quantity"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),
  deliveryDate: date("delivery_date"),
  packingInstructions: text("packing_instructions"),
  specialRequirements: text("special_requirements"),
  qualityStandards: text("quality_standards"),
  approvedSample: boolean("approved_sample").default(false),
  isActive: boolean("is_active").default(true),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Export Documents for LC, Shipment, etc.
export const exportDocuments = pgTable("export_documents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  orderId: integer("order_id").references(() => commercialOrders.id),
  documentType: varchar("document_type", { length: 50 }).notNull(), // commercial_invoice, packing_list, bill_of_lading, etc.
  documentNumber: varchar("document_number", { length: 100 }),
  documentDate: date("document_date"),
  issuedBy: varchar("issued_by", { length: 100 }),
  issuedTo: varchar("issued_to", { length: 100 }),
  description: text("description"),
  amount: decimal("amount", { precision: 12, scale: 2 }),
  currencyCode: varchar("currency_code", { length: 3 }).default("USD"),
  status: varchar("status", { length: 50 }).default("Draft"),
  documentFiles: jsonb("document_files").$type<string[]>().default([]),
  remarks: text("remarks"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Create insert schemas for each table
export const insertCommercialInquirySchema = createInsertSchema(commercialInquiries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommercialQuotationSchema = createInsertSchema(commercialQuotations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCommercialOrderSchema = createInsertSchema(commercialOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLetterOfCreditSchema = createInsertSchema(letterOfCredits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShipmentSchema = createInsertSchema(shipments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBuyerFeedbackSchema = createInsertSchema(buyerFeedback).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCostingTemplateSchema = createInsertSchema(costingTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQuotationStyleSchema = createInsertSchema(quotationStyles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStyleCostBreakdownSchema = createInsertSchema(styleCostBreakdowns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCmCostBreakdownSchema = createInsertSchema(cmCostBreakdowns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrderStyleSchema = createInsertSchema(orderStyles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExportDocumentSchema = createInsertSchema(exportDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types 
export type CommercialInquiry = typeof commercialInquiries.$inferSelect;
export type InsertCommercialInquiry = z.infer<typeof insertCommercialInquirySchema>;

export type CommercialQuotation = typeof commercialQuotations.$inferSelect;
export type InsertCommercialQuotation = z.infer<typeof insertCommercialQuotationSchema>;

export type CommercialOrder = typeof commercialOrders.$inferSelect;
export type InsertCommercialOrder = z.infer<typeof insertCommercialOrderSchema>;

export type LetterOfCredit = typeof letterOfCredits.$inferSelect;
export type InsertLetterOfCredit = z.infer<typeof insertLetterOfCreditSchema>;

export type Shipment = typeof shipments.$inferSelect;
export type InsertShipment = z.infer<typeof insertShipmentSchema>;

export type BuyerFeedback = typeof buyerFeedback.$inferSelect;
export type InsertBuyerFeedback = z.infer<typeof insertBuyerFeedbackSchema>;

export type CostingTemplate = typeof costingTemplates.$inferSelect;
export type InsertCostingTemplate = z.infer<typeof insertCostingTemplateSchema>;

export type QuotationStyle = typeof quotationStyles.$inferSelect;
export type InsertQuotationStyle = z.infer<typeof insertQuotationStyleSchema>;

export type StyleCostBreakdown = typeof styleCostBreakdowns.$inferSelect;
export type InsertStyleCostBreakdown = z.infer<typeof insertStyleCostBreakdownSchema>;

export type CmCostBreakdown = typeof cmCostBreakdowns.$inferSelect;
export type InsertCmCostBreakdown = z.infer<typeof insertCmCostBreakdownSchema>;

export type OrderStyle = typeof orderStyles.$inferSelect;
export type InsertOrderStyle = z.infer<typeof insertOrderStyleSchema>;

export type ExportDocument = typeof exportDocuments.$inferSelect;
export type InsertExportDocument = z.infer<typeof insertExportDocumentSchema>;