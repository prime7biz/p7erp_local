/**
 * Commercial Module Seed Script for PrimeX ERP System
 * 
 * This script populates the commercial module tables with realistic sample data
 * for a garment manufacturing ERP system.
 */

import { db } from "../db";
import {
  tenants, users, customers,
  commercialInquiries, commercialQuotations, commercialOrders,
  letterOfCredits, shipments, buyerFeedback,
  costingTemplates, quotationStyles, styleCostBreakdowns,
  cmCostBreakdowns, orderStyles, exportDocuments
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from 'uuid';

// Helper function to generate random IDs
function generateRandomId(prefix: string): string {
  const randomPart = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${randomPart}`;
}

// Helper function to get a random date within a range
function getRandomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Helper function to get a random element from an array
function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// Helper function to get a random subset of elements from an array
function getRandomSubset<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

/**
 * Main seed function
 */
async function seedCommercialData() {
  console.log("Starting commercial module seeding process...");

  try {
    // Get the target tenant
    const tenantResult = await db.select().from(tenants).where(eq(tenants.name, "Prime7 Solutions"));
    
    if (tenantResult.length === 0) {
      throw new Error("Prime7 Solutions tenant not found. Run minimalSeed.ts first.");
    }
    
    const tenantId = tenantResult[0].id;
    console.log(`Found Prime7 Solutions tenant with ID: ${tenantId}`);
    
    // Get admin user
    const adminResult = await db.select().from(users).where(eq(users.username, "admin"));
    
    if (adminResult.length === 0) {
      throw new Error("Admin user not found. Run minimalSeed.ts first.");
    }
    
    const adminId = adminResult[0].id;
    
    // Get customers
    const customersList = await db.select().from(customers).where(eq(customers.tenantId, tenantId));
    
    if (customersList.length === 0) {
      throw new Error("No customers found. Run minimalSeed.ts first.");
    }

    // 1. Seed costing templates
    await seedCostingTemplates(tenantId);

    // 2. Seed commercial inquiries
    await seedCommercialInquiries(tenantId, adminId, customersList);
    
    // 3. Seed commercial quotations
    await seedCommercialQuotations(tenantId, adminId);
    
    // 4. Seed quotation styles and cost breakdowns
    await seedQuotationStylesAndCosts(tenantId);
    
    // 5. Seed commercial orders
    await seedCommercialOrders(tenantId, adminId);
    
    // 6. Seed order styles
    await seedOrderStyles(tenantId);
    
    // 7. Seed letter of credits
    await seedLetterOfCredits(tenantId);
    
    // 8. Seed export documents
    await seedExportDocuments(tenantId, adminId);
    
    // 9. Seed shipments
    await seedShipments(tenantId);
    
    // 10. Seed buyer feedback
    await seedBuyerFeedback(tenantId);
    
    console.log("Commercial module seeding completed successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}

/**
 * Seed commercial inquiries
 */
async function seedCommercialInquiries(tenantId: number, adminId: number, customersList: any[]) {
  const existingInquiries = await db.select().from(commercialInquiries).where(eq(commercialInquiries.tenantId, tenantId));
  
  if (existingInquiries.length > 0) {
    console.log("Commercial inquiries already exist, skipping...");
    return;
  }
  
  console.log("Seeding commercial inquiries...");
  
  // Create inquiries for each customer
  const seasons = ["Spring/Summer 2025", "Fall/Winter 2025", "Holiday 2025"];
  const statuses = ["New", "In Progress", "Quotation Sent", "Approved", "Rejected"];
  const markets = ["US", "EU", "UK", "Canada", "Japan", "Australia"];
  
  const inquiries = [];
  
  for (const customer of customersList) {
    const inquiryCount = Math.floor(Math.random() * 3) + 1; // 1-3 inquiries per customer
    
    for (let i = 0; i < inquiryCount; i++) {
      const today = new Date();
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(today.getDate() - 3);
      
      const sixMonthsLater = new Date(today);
      sixMonthsLater.setMonth(today.getMonth() + 6);
      
      inquiries.push({
        inquiryNumber: generateRandomId("INQ"),
        customerId: customer.id,
        inquiryDate: getRandomDate(threeDaysAgo, today),
        season: getRandomElement(seasons),
        deliveryDeadline: getRandomDate(today, sixMonthsLater),
        fabricRequirements: "100% Cotton Jersey, 160GSM, Reactive dyed",
        samplingRequirements: "Need lab dip samples for color approval and fit samples",
        productionCapacity: 10000 + Math.floor(Math.random() * 40000),
        targetPrice: (5 + Math.random() * 10).toFixed(2),
        targetMarkets: getRandomSubset(markets, Math.floor(Math.random() * 3) + 1).join(", "),
        complianceRequirements: "OEKO-TEX Standard 100, BSCI compliance",
        inquiryStatus: getRandomElement(statuses),
        assignedTo: adminId,
        sustainabilityRequirements: "Organic cotton preferred, recycled polyester trims",
        preferredColors: "Navy, Black, White, Heather Grey",
        specialFinishes: "Garment wash, Anti-pilling treatment",
        attachments: [],
        comments: "Customer is interested in exploring sustainable fabric options",
        tenantId
      });
    }
  }
  
  if (inquiries.length > 0) {
    await db.insert(commercialInquiries).values(inquiries);
    console.log(`Created ${inquiries.length} commercial inquiries`);
  }
}

/**
 * Seed commercial quotations
 */
async function seedCommercialQuotations(tenantId: number, adminId: number) {
  const existingQuotations = await db.select().from(commercialQuotations).where(eq(commercialQuotations.tenantId, tenantId));
  
  if (existingQuotations.length > 0) {
    console.log("Commercial quotations already exist, skipping...");
    return;
  }
  
  console.log("Seeding commercial quotations...");
  
  // Get inquiries
  const inquiries = await db.select().from(commercialInquiries).where(eq(commercialInquiries.tenantId, tenantId));
  
  if (inquiries.length === 0) {
    console.log("No commercial inquiries found, skipping quotations...");
    return;
  }
  
  const quotations = [];
  const paymentTerms = [
    "30% advance, 70% before shipment",
    "50% advance, 50% before shipment",
    "100% LC at sight",
    "70% on shipment, 30% on delivery"
  ];
  
  const shippingTerms = ["FOB", "CIF", "EXW", "DDP"];
  const quotationStatuses = ["Draft", "Sent", "Negotiating", "Approved", "Rejected"];
  
  for (const inquiry of inquiries) {
    if (Math.random() > 0.3) { // Create quotations for 70% of inquiries
      const today = new Date();
      const inquiryDate = new Date(inquiry.inquiryDate);
      const quotationDate = getRandomDate(inquiryDate, today);
      
      const validUntil = new Date(quotationDate);
      validUntil.setDate(validUntil.getDate() + 30); // Valid for 30 days
      
      // Calculate base price based on target price with some variation
      const targetPrice = parseFloat(inquiry.targetPrice);
      const quotedBasePrice = targetPrice * (0.9 + Math.random() * 0.3); // 90-120% of target price
      
      // Calculate total amount
      const quantity = inquiry.productionCapacity || 10000;
      const totalAmount = quotedBasePrice * quantity;
      
      // Calculate profit margin (15-30%)
      const profitMargin = 15 + Math.random() * 15;
      
      quotations.push({
        quotationNumber: generateRandomId("QT"),
        inquiryId: inquiry.id,
        customerId: inquiry.customerId,
        quotationDate: quotationDate,
        validUntil: validUntil,
        fabricDetails: inquiry.fabricRequirements,
        productionLeadTime: 45 + Math.floor(Math.random() * 30), // 45-75 days
        samplingCost: Math.floor(Math.random() * 500) + 200, // $200-700
        quotationStatus: getRandomElement(quotationStatuses),
        paymentTerms: getRandomElement(paymentTerms),
        shippingTerms: getRandomElement(shippingTerms),
        totalQuantity: quantity,
        totalAmount: totalAmount.toFixed(2),
        profitMargin: profitMargin.toFixed(2),
        currencyCode: "USD",
        exchangeRate: 1.0,
        isApproved: Math.random() > 0.7, // 30% of quotations are approved
        approvedBy: Math.random() > 0.7 ? adminId : null,
        approvalDate: Math.random() > 0.7 ? new Date() : null,
        comments: "Quotation based on current market prices of raw materials",
        createdBy: adminId,
        tenantId
      });
    }
  }
  
  if (quotations.length > 0) {
    await db.insert(commercialQuotations).values(quotations);
    console.log(`Created ${quotations.length} commercial quotations`);
  }
}

/**
 * Seed commercial orders
 */
async function seedCommercialOrders(tenantId: number, adminId: number) {
  const existingOrders = await db.select().from(commercialOrders).where(eq(commercialOrders.tenantId, tenantId));
  
  if (existingOrders.length > 0) {
    console.log("Commercial orders already exist, skipping...");
    return;
  }
  
  console.log("Seeding commercial orders...");
  
  // Get approved quotations
  const quotations = await db.select().from(commercialQuotations)
    .where(eq(commercialQuotations.tenantId, tenantId))
    .where(eq(commercialQuotations.isApproved, true));
  
  if (quotations.length === 0) {
    console.log("No approved quotations found, skipping orders...");
    return;
  }
  
  const orders = [];
  const orderStatuses = ["New", "In Production", "Ready for Shipment", "Shipped", "Delivered", "Completed"];
  
  for (const quotation of quotations) {
    if (Math.random() > 0.2) { // Convert 80% of approved quotations to orders
      const quotationDate = new Date(quotation.quotationDate);
      const orderDate = getRandomDate(quotationDate, new Date());
      
      // Set delivery date 60-90 days from order date
      const deliveryDate = new Date(orderDate);
      deliveryDate.setDate(deliveryDate.getDate() + 60 + Math.floor(Math.random() * 30));
      
      orders.push({
        orderNumber: generateRandomId("ORD"),
        quotationId: quotation.id,
        customerId: quotation.customerId,
        poNumber: `PO-${Math.floor(Math.random() * 1000000)}`,
        orderDate: orderDate,
        deliveryDate: deliveryDate,
        orderStatus: getRandomElement(orderStatuses),
        totalQuantity: quotation.totalQuantity,
        totalAmount: quotation.totalAmount,
        currencyCode: quotation.currencyCode,
        exchangeRate: quotation.exchangeRate,
        paymentTerms: quotation.paymentTerms,
        shippingTerms: quotation.shippingTerms,
        isConfirmed: true,
        confirmedBy: adminId,
        confirmationDate: orderDate,
        buyerRemarks: "Please ensure quality inspection before shipment",
        internalNotes: "Priority customer, expedite production",
        attachments: [],
        createdBy: adminId,
        tenantId
      });
    }
  }
  
  if (orders.length > 0) {
    await db.insert(commercialOrders).values(orders);
    console.log(`Created ${orders.length} commercial orders`);
  }
}

/**
 * Seed letter of credits
 */
async function seedLetterOfCredits(tenantId: number) {
  const existingLCs = await db.select().from(letterOfCredits).where(eq(letterOfCredits.tenantId, tenantId));
  
  if (existingLCs.length > 0) {
    console.log("Letter of credits already exist, skipping...");
    return;
  }
  
  console.log("Seeding letter of credits...");
  
  // Get orders
  const orders = await db.select().from(commercialOrders).where(eq(commercialOrders.tenantId, tenantId));
  
  if (orders.length === 0) {
    console.log("No orders found, skipping letter of credits...");
    return;
  }
  
  const lcs = [];
  const lcStatuses = ["Draft", "Issued", "Amended", "Confirmed", "Expired"];
  const banks = [
    "Standard Chartered Bank", 
    "HSBC Bank", 
    "Citibank", 
    "Deutsche Bank", 
    "Bank of America",
    "Sonali Bank",
    "Janata Bank",
    "Agrani Bank"
  ];
  
  for (const order of orders) {
    if (Math.random() > 0.3) { // Create LCs for 70% of orders
      const orderDate = new Date(order.orderDate);
      const issuanceDate = getRandomDate(orderDate, new Date());
      
      // Set expiry date 90-120 days from issuance
      const expiryDate = new Date(issuanceDate);
      expiryDate.setDate(expiryDate.getDate() + 90 + Math.floor(Math.random() * 30));
      
      // Set last shipment date 30 days before expiry
      const lastShipmentDate = new Date(expiryDate);
      lastShipmentDate.setDate(lastShipmentDate.getDate() - 30);
      
      // Calculate reminder date 15 days before expiry
      const reminderDate = new Date(expiryDate);
      reminderDate.setDate(reminderDate.getDate() - 15);
      
      lcs.push({
        lcNumber: `LC-${Math.floor(Math.random() * 100000)}`,
        orderId: order.id,
        customerId: order.customerId,
        bankName: getRandomElement(banks),
        issuingBank: getRandomElement(banks),
        advisingBank: "Sonali Bank Ltd, Bangladesh",
        issuanceDate: issuanceDate,
        expiryDate: expiryDate,
        lastShipmentDate: lastShipmentDate,
        amount: order.totalAmount,
        currencyCode: order.currencyCode,
        status: getRandomElement(lcStatuses),
        documents: [],
        amendmentDetails: Math.random() > 0.7 ? "Extended shipment date by 15 days" : null,
        amendmentDate: Math.random() > 0.7 ? new Date() : null,
        lcTerms: "Standard LC terms as per UCP 600",
        paymentTerms: order.paymentTerms,
        bankCharges: (parseFloat(order.totalAmount) * 0.005).toFixed(2), // 0.5% of total amount
        discrepancies: null,
        reminderDate: reminderDate,
        comments: "Standard documentation required for payment",
        tenantId
      });
    }
  }
  
  if (lcs.length > 0) {
    await db.insert(letterOfCredits).values(lcs);
    console.log(`Created ${lcs.length} letter of credits`);
  }
}

/**
 * Seed costing templates
 */
async function seedCostingTemplates(tenantId: number) {
  const existingTemplates = await db.select().from(costingTemplates).where(eq(costingTemplates.tenantId, tenantId));
  
  if (existingTemplates.length > 0) {
    console.log("Costing templates already exist, skipping...");
    return;
  }
  
  console.log("Seeding costing templates...");
  
  const templateData = [
    {
      templateName: "Basic T-Shirt Costing",
      productCategory: "T-Shirts",
      description: "Standard costing template for basic cotton t-shirts",
      defaultWastage: 7.5,
      defaultProfit: 15.0,
      isActive: true,
      tenantId: tenantId
    },
    {
      templateName: "Premium Denim Jeans",
      productCategory: "Denim",
      description: "Costing template for premium quality denim jeans with specialized washes",
      defaultWastage: 8.0,
      defaultProfit: 22.5,
      isActive: true,
      tenantId: tenantId
    },
    {
      templateName: "Winter Jackets Standard",
      productCategory: "Outerwear",
      description: "Costing model for standard winter jackets with insulation",
      defaultWastage: 10.0,
      defaultProfit: 25.0,
      isActive: true,
      tenantId: tenantId
    },
    {
      templateName: "Formal Shirts",
      productCategory: "Shirts",
      description: "Detailed costing template for formal business shirts",
      defaultWastage: 6.5,
      defaultProfit: 18.0,
      isActive: true,
      tenantId: tenantId
    },
    {
      templateName: "Active Sportswear",
      productCategory: "Sportswear",
      description: "Costing for technical activewear with moisture-wicking fabrics",
      defaultWastage: 8.5,
      defaultProfit: 20.0,
      isActive: true,
      tenantId: tenantId
    }
  ];
  
  await db.insert(costingTemplates).values(templateData);
  console.log(`Seeded ${templateData.length} costing templates.`);
}

/**
 * Seed quotation styles and cost breakdowns
 */
async function seedQuotationStylesAndCosts(tenantId: number) {
  const existingStyles = await db.select().from(quotationStyles).where(eq(quotationStyles.tenantId, tenantId));
  
  if (existingStyles.length > 0) {
    console.log("Quotation styles and cost breakdowns already exist, skipping...");
    return;
  }
  
  console.log("Seeding quotation styles and cost breakdowns...");
  
  // Get existing quotations
  const quotations = await db.select().from(commercialQuotations).where(eq(commercialQuotations.tenantId, tenantId));
  
  if (quotations.length === 0) {
    console.log("No quotations found to seed styles. Skipping...");
    return;
  }
  
  const fabricTypes = [
    "100% Cotton Single Jersey",
    "95% Cotton 5% Elastane",
    "100% Polyester Microfiber",
    "98% Cotton 2% Spandex Denim",
    "80% Cotton 20% Polyester Fleece",
    "100% Cotton Poplin",
    "100% Organic Cotton"
  ];
  
  const colors = [
    "Navy, Black, White, Red",
    "Black, Charcoal, Indigo",
    "White, Blue, Pink, Yellow",
    "Stonewash, Mid Blue, Dark Indigo",
    "Mixed Assortment",
    "Solid Colors",
    "Seasonal Palette"
  ];
  
  const sizeRanges = [
    "XS, S, M, L, XL, XXL",
    "28, 30, 32, 34, 36, 38, 40",
    "S, M, L, XL",
    "4, 6, 8, 10, 12, 14, 16",
    "All Sizes",
    "Standard Assortment"
  ];
  
  // Create style data for each quotation
  for (const quotation of quotations) {
    const stylesCount = Math.floor(Math.random() * 3) + 1; // 1-3 styles per quotation
    
    for (let i = 0; i < stylesCount; i++) {
      // Create quotation style
      const styleTypes = ["T-Shirt", "Polo", "Jeans", "Jacket", "Dress", "Formal Shirt", "Sweater"];
      const styleType = styleTypes[Math.floor(Math.random() * styleTypes.length)];
      const styleName = `${styleType} Style ${i + 1}`;
      const styleCode = `ST-${quotation.id}-${i + 1}`;
      const productCategory = styleType.includes("Shirt") ? "Shirts" : 
                             styleType === "Jeans" ? "Denim" :
                             styleType === "Jacket" ? "Outerwear" : "Apparel";
      
      const quantityPerSize = {
        "S": Math.floor(Math.random() * 500) + 500,
        "M": Math.floor(Math.random() * 1000) + 1000,
        "L": Math.floor(Math.random() * 800) + 800,
        "XL": Math.floor(Math.random() * 500) + 300
      };
      
      const totalQuantity = Object.values(quantityPerSize).reduce((sum, qty) => sum + qty, 0);
      const unitPrice = parseFloat((Math.random() * 15 + 5).toFixed(2));
      const totalAmount = parseFloat((totalQuantity * unitPrice).toFixed(2));
      
      const [style] = await db.insert(quotationStyles).values({
        quotationId: quotation.id,
        styleName: styleName,
        styleCode: styleCode,
        productCategory: productCategory,
        description: `${styleName} - ${productCategory} line with custom features`,
        technicalDetails: `Fabric: ${fabricTypes[Math.floor(Math.random() * fabricTypes.length)]}, Weight: ${Math.floor(Math.random() * 100) + 150}gsm`,
        sizeRange: sizeRanges[Math.floor(Math.random() * sizeRanges.length)],
        colors: colors[Math.floor(Math.random() * colors.length)],
        fabricComposition: fabricTypes[Math.floor(Math.random() * fabricTypes.length)],
        fabricWeight: `${Math.floor(Math.random() * 100) + 150}gsm`,
        artwork: JSON.stringify([`artwork_${quotation.id}_${i}.png`]),
        quantityPerSize: JSON.stringify(quantityPerSize),
        unitPrice: unitPrice,
        totalQuantity: totalQuantity,
        totalAmount: totalAmount,
        comments: "Standard production specifications apply",
        tenantId: tenantId
      }).returning();
      
      // Seed style cost breakdowns (materials)
      await seedStyleCostBreakdowns(style.id, tenantId);
      
      // Seed CM cost breakdowns (operations)
      await seedCMCostBreakdowns(style.id, tenantId);
    }
  }
  
  console.log(`Completed seeding quotation styles and cost breakdowns.`);
}

/**
 * Seed style cost breakdowns (materials)
 */
async function seedStyleCostBreakdowns(styleId: number, tenantId: number) {
  const materialCategories = ["Main Fabric", "Lining", "Thread", "Buttons", "Zippers", "Labels", "Packaging"];
  const materialBreakdowns = [];
  
  // Generate 5-10 material entries per style
  const materialsCount = Math.floor(Math.random() * 6) + 5;
  
  for (let i = 0; i < materialsCount; i++) {
    const category = materialCategories[Math.floor(Math.random() * materialCategories.length)];
    const quantity = parseFloat((Math.random() * 5 + 0.5).toFixed(2));
    const unitPrice = parseFloat((Math.random() * 10 + 1).toFixed(2));
    const wastage = parseFloat((Math.random() * 10 + 2).toFixed(2));
    const totalCost = parseFloat(((quantity * unitPrice) * (1 + wastage/100)).toFixed(2));
    
    materialBreakdowns.push({
      styleId: styleId,
      materialCategory: category,
      materialName: `${category} ${i+1}`,
      materialDescription: `Standard ${category.toLowerCase()} material used for production`,
      supplier: `Supplier ${Math.floor(Math.random() * 5) + 1}`,
      unit: category === "Main Fabric" || category === "Lining" ? "Yards" : "Pieces",
      quantity: quantity,
      unitPrice: unitPrice,
      wastage: wastage,
      totalCost: totalCost,
      remarks: "Standard material specifications apply",
      tenantId: tenantId
    });
  }
  
  await db.insert(styleCostBreakdowns).values(materialBreakdowns);
}

/**
 * Seed CM cost breakdowns (operations)
 */
async function seedCMCostBreakdowns(styleId: number, tenantId: number) {
  const operations = [
    { name: "Cutting", department: "Cutting", machineType: "Automatic Cutter" },
    { name: "Sewing - Main Seams", department: "Sewing", machineType: "Lockstitch" },
    { name: "Sewing - Overlock", department: "Sewing", machineType: "Overlock" },
    { name: "Buttonholing", department: "Sewing", machineType: "Buttonhole" },
    { name: "Button Attachment", department: "Sewing", machineType: "Button Attacher" },
    { name: "Ironing", department: "Finishing", machineType: "Industrial Iron" },
    { name: "Quality Check", department: "QC", machineType: "Manual" },
    { name: "Packaging", department: "Packaging", machineType: "Manual" }
  ];
  
  const cmBreakdowns = [];
  
  // Generate CM operations for the style
  const selectedOperations = getRandomSubset(operations, Math.floor(Math.random() * 3) + 5); // 5-7 operations
  
  for (const operation of selectedOperations) {
    const timeRequired = parseFloat((Math.random() * 5 + 0.5).toFixed(2)); // minutes
    const costPerMinute = parseFloat((Math.random() * 0.2 + 0.05).toFixed(4)); // cost per minute
    const totalCost = parseFloat((timeRequired * costPerMinute).toFixed(2));
    
    cmBreakdowns.push({
      styleId: styleId,
      operationName: operation.name,
      department: operation.department,
      machineType: operation.machineType,
      timeRequired: timeRequired,
      costPerMinute: costPerMinute,
      totalCost: totalCost,
      remarks: "Standard operation",
      tenantId: tenantId
    });
  }
  
  await db.insert(cmCostBreakdowns).values(cmBreakdowns);
}

/**
 * Seed order styles
 */
async function seedOrderStyles(tenantId: number) {
  const existingOrderStyles = await db.select().from(orderStyles).where(eq(orderStyles.tenantId, tenantId));
  
  if (existingOrderStyles.length > 0) {
    console.log("Order styles already exist, skipping...");
    return;
  }
  
  console.log("Seeding order styles...");
  
  // Get existing orders
  const orders = await db.select().from(commercialOrders).where(eq(commercialOrders.tenantId, tenantId));
  
  if (orders.length === 0) {
    console.log("No orders found to seed order styles. Skipping...");
    return;
  }
  
  // Get quotation styles for reference
  const styles = await db.select().from(quotationStyles).where(eq(quotationStyles.tenantId, tenantId));
  
  if (styles.length === 0) {
    console.log("No quotation styles found to reference. Skipping...");
    return;
  }
  
  const orderStylesData = [];
  
  for (const order of orders) {
    // Identify related quotation styles if possible
    const relatedStyles = styles.filter(style => style.quotationId === order.quotationId);
    
    // If we have related styles, use them; otherwise, use random ones
    const stylesToUse = relatedStyles.length > 0 ? relatedStyles : getRandomSubset(styles, Math.min(3, styles.length));
    
    for (const style of stylesToUse) {
      // Calculate a delivery date that's 30-90 days from order date
      const orderDate = order.orderDate instanceof Date ? order.orderDate : new Date();
      const deliveryDate = new Date(orderDate);
      deliveryDate.setDate(deliveryDate.getDate() + Math.floor(Math.random() * 60) + 30);
      
      // Parse JSON strings into objects if needed
      const quantityPerSize = typeof style.quantityPerSize === 'string' 
        ? JSON.parse(style.quantityPerSize) 
        : style.quantityPerSize;
        
      const artwork = typeof style.artwork === 'string'
        ? JSON.parse(style.artwork)
        : style.artwork;
      
      orderStylesData.push({
        orderId: order.id,
        quotationStyleId: style.id,
        styleName: style.styleName,
        styleCode: style.styleCode,
        productCategory: style.productCategory,
        description: style.description,
        technicalDetails: style.technicalDetails,
        sizeRange: style.sizeRange,
        colors: style.colors,
        fabricComposition: style.fabricComposition,
        fabricWeight: style.fabricWeight,
        artwork: Array.isArray(artwork) ? JSON.stringify(artwork) : artwork,
        quantityPerSize: typeof quantityPerSize === 'object' ? JSON.stringify(quantityPerSize) : quantityPerSize,
        unitPrice: style.unitPrice,
        totalQuantity: style.totalQuantity,
        totalAmount: style.totalAmount,
        deliveryDate: deliveryDate,
        packingInstructions: "Pack individually in polybags, 12 pcs per carton",
        specialRequirements: Math.random() > 0.7 ? "Hangtags required with retail price" : null,
        qualityStandards: "AQL 2.5 for major defects, 4.0 for minor defects",
        approvedSample: Math.random() > 0.3, // 70% approved
        isActive: true,
        tenantId: tenantId
      });
    }
  }
  
  if (orderStylesData.length > 0) {
    await db.insert(orderStyles).values(orderStylesData);
    console.log(`Seeded ${orderStylesData.length} order styles.`);
  }
}

/**
 * Seed export documents
 */
async function seedExportDocuments(tenantId: number, adminId: number) {
  const existingDocs = await db.select().from(exportDocuments).where(eq(exportDocuments.tenantId, tenantId));
  
  if (existingDocs.length > 0) {
    console.log("Export documents already exist, skipping...");
    return;
  }
  
  console.log("Seeding export documents...");
  
  // Get existing orders
  const orders = await db.select().from(commercialOrders).where(eq(commercialOrders.tenantId, tenantId));
  
  if (orders.length === 0) {
    console.log("No orders found to seed export documents. Skipping...");
    return;
  }
  
  const documentTypes = [
    "Commercial Invoice",
    "Packing List",
    "Bill of Lading",
    "Certificate of Origin",
    "Quality Inspection Report",
    "Shipping Bill",
    "GSP Certificate"
  ];
  
  const exportDocsData = [];
  
  for (const order of orders) {
    // Only create export docs for orders in production or completed status
    if (!['Production', 'Ready for Shipment', 'Shipped', 'Delivered', 'Completed'].includes(order.orderStatus)) {
      continue;
    }
    
    // Calculate how many and which documents to create based on order status
    let applicableDocTypes = [];
    
    if (['Ready for Shipment', 'Shipped', 'Delivered', 'Completed'].includes(order.orderStatus)) {
      applicableDocTypes = [...documentTypes]; // All document types
    } else if (order.orderStatus === 'Production') {
      // Only some preliminary documents
      applicableDocTypes = ["Commercial Invoice", "Packing List", "Quality Inspection Report"];
    }
    
    for (const docType of applicableDocTypes) {
      // Document date after order date
      const orderDate = order.orderDate instanceof Date ? order.orderDate : new Date();
      const documentDate = new Date(orderDate);
      documentDate.setDate(documentDate.getDate() + Math.floor(Math.random() * 20) + 5);
      
      // Document status based on order status
      let docStatus = 'Draft';
      if (['Shipped', 'Delivered', 'Completed'].includes(order.orderStatus)) {
        docStatus = 'Finalized';
      } else if (order.orderStatus === 'Ready for Shipment') {
        docStatus = Math.random() > 0.5 ? 'Finalized' : 'Pending';
      }
      
      exportDocsData.push({
        tenantId: tenantId,
        orderId: order.id,
        documentType: docType,
        documentNumber: `${docType.substring(0, 3).toUpperCase()}-${order.orderNumber.substring(4)}-${Math.floor(Math.random() * 1000)}`,
        documentDate: documentDate,
        issuedBy: "Prime7 Solutions",
        issuedTo: order.customerId ? `Customer ${order.customerId}` : "Customer",
        description: `${docType} for order ${order.orderNumber}`,
        amount: docType === "Commercial Invoice" ? order.totalAmount : null,
        currencyCode: order.currencyCode || "USD",
        status: docStatus,
        documentFiles: JSON.stringify([`${docType.replace(/\s+/g, '_').toLowerCase()}_${order.orderNumber.substring(4)}.pdf`]),
        remarks: "Standard export documentation",
        createdBy: adminId
      });
    }
  }
  
  if (exportDocsData.length > 0) {
    await db.insert(exportDocuments).values(exportDocsData);
    console.log(`Seeded ${exportDocsData.length} export documents.`);
  }
}

async function seedShipments(tenantId: number) {
  const existingShipments = await db.select().from(shipments).where(eq(shipments.tenantId, tenantId));
  
  if (existingShipments.length > 0) {
    console.log("Shipments already exist, skipping...");
    return;
  }
  
  console.log("Seeding shipments...");
  
  // Get ready or shipped orders
  const orders = await db.select().from(commercialOrders)
    .where(eq(commercialOrders.tenantId, tenantId))
    .where(eq(commercialOrders.orderStatus, "Ready for Shipment"))
    .where(eq(commercialOrders.orderStatus, "Shipped"))
    .where(eq(commercialOrders.orderStatus, "Delivered"));
  
  if (orders.length === 0) {
    console.log("No ready/shipped orders found, skipping shipments...");
    return;
  }
  
  const shipmentsData = [];
  const shipmentModes = ["Sea", "Air", "Land"];
  const carriers = ["Maersk", "MSC", "CMA CGM", "COSCO Shipping", "Hapag-Lloyd", "DHL", "FedEx"];
  const forwarders = ["DHL Global Forwarding", "Kuehne + Nagel", "DB Schenker", "Expeditors", "DSV"];
  const containerTypes = ["20GP", "40GP", "40HC", "45HC"];
  const statuses = ["Planned", "In Transit", "Customs Clearance", "Delivered"];
  
  for (const order of orders) {
    const deliveryDate = new Date(order.deliveryDate);
    const shipmentDate = new Date(deliveryDate);
    shipmentDate.setDate(deliveryDate.getDate() - 30); // Ship 30 days before delivery
    
    const today = new Date();
    const actualShipmentDate = shipmentDate > today ? null : shipmentDate.toISOString().split('T')[0];
    
    const mode = getRandomElement(shipmentModes);
    let etd = null;
    let eta = null;
    
    if (actualShipmentDate) {
      // Calculate ETD (1-3 days after shipment date)
      const etdDate = new Date(shipmentDate);
      etdDate.setDate(shipmentDate.getDate() + 1 + Math.floor(Math.random() * 2));
      etd = etdDate.toISOString().split('T')[0];
      
      // Calculate ETA based on shipping mode
      const etaDate = new Date(etdDate);
      if (mode === "Sea") {
        etaDate.setDate(etdDate.getDate() + 25 + Math.floor(Math.random() * 10)); // 25-35 days
      } else if (mode === "Air") {
        etaDate.setDate(etdDate.getDate() + 2 + Math.floor(Math.random() * 3)); // 2-5 days
      } else {
        etaDate.setDate(etdDate.getDate() + 5 + Math.floor(Math.random() * 5)); // 5-10 days
      }
      eta = etaDate.toISOString().split('T')[0];
    }
    
    const containerDetails = [];
    if (mode === "Sea") {
      const containerCount = 1 + Math.floor(Math.random() * 3); // 1-3 containers
      for (let i = 0; i < containerCount; i++) {
        containerDetails.push({
          containerNumber: `CONT${Math.floor(Math.random() * 10000000)}`,
          sealNumber: `SEAL${Math.floor(Math.random() * 100000)}`,
          containerType: getRandomElement(containerTypes)
        });
      }
    }
    
    const totalPieces = order.totalQuantity || 10000;
    
    shipmentsData.push({
      shipmentNumber: generateRandomId("SHP"),
      orderId: order.id,
      shipmentDate: actualShipmentDate,
      etd,
      eta,
      shipmentMode: mode,
      carrier: getRandomElement(carriers),
      trackingNumber: `TRK${Math.floor(Math.random() * 10000000)}`,
      containerDetails: containerDetails.length > 0 ? containerDetails : null,
      goodsDescription: "Garments as per P.O.",
      packageCount: Math.ceil(totalPieces / 100), // Approximately 100 pieces per package
      grossWeight: (totalPieces * 0.3).toFixed(2), // Approximately 0.3 kg per piece
      netWeight: (totalPieces * 0.28).toFixed(2), // Approximately 0.28 kg per piece
      volume: (totalPieces * 0.001).toFixed(2), // Approximately 0.001 cbm per piece
      unitOfMeasure: "CBM",
      forwarder: getRandomElement(forwarders),
      shippingDocuments: [
        { type: "Bill of Lading", number: `BL${Math.floor(Math.random() * 100000)}`, path: "" },
        { type: "Commercial Invoice", number: `INV${Math.floor(Math.random() * 100000)}`, path: "" },
        { type: "Packing List", number: `PL${Math.floor(Math.random() * 100000)}`, path: "" }
      ],
      customsClearanceStatus: eta && new Date(eta) < today ? "Cleared" : null,
      inspectionDetails: "Pre-shipment inspection completed successfully",
      status: getRandomElement(statuses),
      notes: "Shipment as per order specifications",
      tenantId
    });
  }
  
  if (shipmentsData.length > 0) {
    await db.insert(shipments).values(shipmentsData);
    console.log(`Created ${shipmentsData.length} shipments`);
  }
}

/**
 * Seed buyer feedback
 */
async function seedBuyerFeedback(tenantId: number) {
  const existingFeedback = await db.select().from(buyerFeedback).where(eq(buyerFeedback.tenantId, tenantId));
  
  if (existingFeedback.length > 0) {
    console.log("Buyer feedback already exists, skipping...");
    return;
  }
  
  console.log("Seeding buyer feedback...");
  
  // Get delivered orders
  const orders = await db.select().from(commercialOrders)
    .where(eq(commercialOrders.tenantId, tenantId))
    .where(eq(commercialOrders.orderStatus, "Delivered"))
    .where(eq(commercialOrders.orderStatus, "Completed"));
  
  if (orders.length === 0) {
    console.log("No delivered orders found, skipping buyer feedback...");
    return;
  }
  
  const feedbackData = [];
  
  for (const order of orders) {
    if (Math.random() > 0.3) { // Create feedback for 70% of delivered orders
      const deliveryDate = new Date(order.deliveryDate);
      const feedbackDate = new Date(deliveryDate);
      feedbackDate.setDate(deliveryDate.getDate() + 7 + Math.floor(Math.random() * 14)); // 7-21 days after delivery
      
      // Generate random ratings (3-5 range for mostly positive feedback)
      const qualityRating = 3 + Math.floor(Math.random() * 3);
      const deliveryRating = 3 + Math.floor(Math.random() * 3);
      const communicationRating = 3 + Math.floor(Math.random() * 3);
      const priceRating = 3 + Math.floor(Math.random() * 3);
      
      // Calculate overall rating (average of all ratings)
      const overallRating = Math.round((qualityRating + deliveryRating + communicationRating + priceRating) / 4);
      
      const strengths = [
        "High quality materials",
        "Excellent workmanship",
        "On-time delivery",
        "Good communication",
        "Competitive pricing",
        "Flexibility in accommodating changes"
      ];
      
      const improvements = [
        "Faster sampling process",
        "More transparency in production updates",
        "Better packaging",
        "Smoother customs documentation",
        "More detailed quality reports"
      ];
      
      feedbackData.push({
        orderId: order.id,
        customerId: order.customerId,
        feedbackDate: feedbackDate.toISOString().split('T')[0],
        qualityRating,
        deliveryRating,
        communicationRating,
        priceRating,
        overallRating,
        comments: "Overall satisfied with the order. Looking forward to continued collaboration.",
        strengthsHighlighted: getRandomSubset(strengths, 2).join("; "),
        improvementAreas: getRandomSubset(improvements, 1).join("; "),
        actionTaken: null,
        respondedBy: null,
        responseDate: null,
        responseComments: null,
        tenantId
      });
    }
  }
  
  if (feedbackData.length > 0) {
    await db.insert(buyerFeedback).values(feedbackData);
    console.log(`Created ${feedbackData.length} buyer feedback entries`);
  }
}

// Start the seeding process
seedCommercialData().then(() => {
  console.log("Commercial module seeding completed successfully!");
  process.exit(0);
}).catch((error) => {
  console.error("Error during commercial module seeding:", error);
  process.exit(1);
});