/**
 * Comprehensive Database Seed Script for PrimeX ERP System
 * 
 * This script populates the PostgreSQL database with realistic sample data
 * for a garment manufacturing ERP system, building upon the essential data
 * created by minimalSeed.ts.
 */

import { db, executeQuery } from "../db";
import {
  tenants, users, customers, customerAgents, currencies,
  inquiries, quotations, orders, tasks, timeActionPlans,
  timeActionMilestones, items, itemCategories, itemUnits
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

/**
 * Main seed function
 */
async function seedComprehensiveData() {
  console.log("Starting comprehensive database seeding process...");

  try {
    // Begin transaction to ensure data consistency
    await executeQuery(async () => {
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
      
      // 1. Seed item categories for garment manufacturing
      await seedItemCategories(tenantId);
      
      // 2. Seed item units
      await seedItemUnits(tenantId);
      
      // 3. Seed items and materials
      await seedItems(tenantId);
      
      // 4. Seed inquiries
      await seedInquiries(tenantId, adminId);
      
      // 5. Seed quotations
      await seedQuotations(tenantId, adminId);
      
      // 6. Seed orders
      await seedOrders(tenantId, adminId);
      
      // 7. Seed time and action plans
      await seedTimeActionPlans(tenantId, adminId);
      
      // 8. Seed tasks
      await seedTasks(tenantId, adminId);
      
      console.log("Comprehensive database seeding completed successfully!");
    });
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}

/**
 * Seed item categories for garment manufacturing
 */
async function seedItemCategories(tenantId: number) {
  const existingCategories = await db.select().from(itemCategories).where(eq(itemCategories.tenantId, tenantId));
  
  if (existingCategories.length > 0) {
    console.log("Item categories already exist, skipping...");
    return;
  }
  
  console.log("Seeding item categories...");
  
  const categories = [
    {
      categoryId: "FAB",
      name: "Fabrics",
      description: "All types of fabric materials",
      tenantId
    },
    {
      categoryId: "TRM",
      name: "Trims",
      description: "Buttons, zippers, and other trim items",
      tenantId
    },
    {
      categoryId: "ACC",
      name: "Accessories",
      description: "Hangtags, labels, and other accessories",
      tenantId
    },
    {
      categoryId: "THR",
      name: "Threads",
      description: "Sewing threads of various types and colors",
      tenantId
    },
    {
      categoryId: "PKG",
      name: "Packaging",
      description: "Boxes, poly bags, and other packaging materials",
      tenantId
    }
  ];
  
  await db.insert(itemCategories).values(categories);
}

/**
 * Seed item units
 */
async function seedItemUnits(tenantId: number) {
  const existingUnits = await db.select().from(itemUnits).where(eq(itemUnits.tenantId, tenantId));
  
  if (existingUnits.length > 0) {
    console.log("Item units already exist, skipping...");
    return;
  }
  
  console.log("Seeding item units...");
  
  const units = [
    {
      unitCode: "YDS",
      name: "Yards",
      description: "Unit of length measurement",
      type: "length",
      tenantId
    },
    {
      unitCode: "MTR",
      name: "Meters",
      description: "Unit of length measurement (metric)",
      type: "length",
      tenantId
    },
    {
      unitCode: "KG",
      name: "Kilograms",
      description: "Unit of weight measurement",
      type: "weight",
      tenantId
    },
    {
      unitCode: "PCS",
      name: "Pieces",
      description: "Count of individual items",
      type: "quantity",
      tenantId
    },
    {
      unitCode: "DOZ",
      name: "Dozen",
      description: "Count of 12 items",
      type: "quantity",
      tenantId
    },
    {
      unitCode: "CONE",
      name: "Cone",
      description: "Unit for thread measurement",
      type: "quantity",
      tenantId
    }
  ];
  
  await db.insert(itemUnits).values(units);
}

/**
 * Seed items for garment manufacturing
 */
async function seedItems(tenantId: number) {
  const existingItems = await db.select().from(items).where(eq(items.tenantId, tenantId));
  
  if (existingItems.length > 0) {
    console.log("Items already exist, skipping...");
    return;
  }
  
  console.log("Seeding items...");
  
  // Get item categories and units
  const categories = await db.select().from(itemCategories).where(eq(itemCategories.tenantId, tenantId));
  const units = await db.select().from(itemUnits).where(eq(itemUnits.tenantId, tenantId));
  
  // Find specific categories and units
  const fabricCategory = categories.find(c => c.categoryName === "Fabrics")?.id;
  const trimCategory = categories.find(c => c.categoryName === "Trims")?.id;
  const threadCategory = categories.find(c => c.categoryName === "Threads")?.id;
  const accessoryCategory = categories.find(c => c.categoryName === "Accessories")?.id;
  
  const yardUnit = units.find(u => u.unitCode === "YDS")?.id;
  const meterUnit = units.find(u => u.unitCode === "MTR")?.id;
  const pieceUnit = units.find(u => u.unitCode === "PCS")?.id;
  const coneUnit = units.find(u => u.unitCode === "CONE")?.id;
  
  // Create fabric items
  const fabrics = [
    {
      item_code: "FAB-COTTON-100",
      name: "100% Cotton Jersey",
      description: "Premium 100% Cotton Jersey Fabric, 160 GSM",
      category_id: fabricCategory,
      unit_id: yardUnit,
      tenantId: tenantId,
      type: "material",
      is_active: true,
      is_stockable: true,
      material_content: "100% Cotton",
      weight: "160",
      weight_unit: "GSM",
      default_cost: 4.75,
      default_price: 6.25,
      reorder_point: 500,
      min_stock_level: 200,
      max_stock_level: 5000,
      lead_time_in_days: 30,
      tags: ["fabric", "cotton", "jersey"]
    },
    {
      item_code: "FAB-TC-6535",
      name: "TC 65/35 Poplin",
      description: "TC 65/35 Poplin Fabric, 110 GSM",
      category_id: fabricCategory,
      unit_id: yardUnit,
      tenantId: tenantId,
      type: "material",
      is_active: true,
      is_stockable: true,
      material_content: "65% Polyester, 35% Cotton",
      weight: "110",
      weight_unit: "GSM",
      default_cost: 3.50,
      default_price: 4.75,
      reorder_point: 600,
      min_stock_level: 300,
      max_stock_level: 6000,
      lead_time_in_days: 25,
      tags: ["fabric", "tc", "poplin"]
    },
    {
      item_code: "FAB-POLY-100",
      name: "100% Polyester Pique",
      description: "100% Polyester Pique Knit Fabric, 200 GSM",
      category_id: fabricCategory,
      unit_id: meterUnit,
      tenantId: tenantId,
      type: "material",
      is_active: true,
      is_stockable: true,
      material_content: "100% Polyester",
      weight: "200",
      weight_unit: "GSM",
      default_cost: 3.25,
      default_price: 4.50,
      reorder_point: 500,
      min_stock_level: 250,
      max_stock_level: 5000,
      lead_time_in_days: 21,
      tags: ["fabric", "polyester", "pique"]
    }
  ];
  
  // Create trims
  const trims = [
    {
      item_code: "TRM-BTN-18L",
      name: "18L Plastic Buttons",
      description: "18L 4-hole plastic buttons",
      category_id: trimCategory,
      unit_id: pieceUnit,
      tenantId: tenantId,
      type: "accessory",
      is_active: true,
      is_stockable: true,
      material_content: "Plastic",
      default_cost: 0.05,
      default_price: 0.08,
      reorder_point: 5000,
      min_stock_level: 1000,
      max_stock_level: 20000,
      lead_time_in_days: 14,
      tags: ["trims", "buttons", "plastic"]
    },
    {
      item_code: "TRM-ZIP-5YKK",
      name: "5\" YKK Zippers",
      description: "5-inch YKK nylon zippers",
      category_id: trimCategory,
      unit_id: pieceUnit,
      tenantId: tenantId,
      type: "accessory",
      is_active: true,
      is_stockable: true,
      material_content: "Nylon",
      default_cost: 0.25,
      default_price: 0.45,
      reorder_point: 2000,
      min_stock_level: 500,
      max_stock_level: 10000,
      lead_time_in_days: 21,
      tags: ["trims", "zippers", "ykk"]
    }
  ];
  
  // Create threads
  const threads = [
    {
      item_code: "THR-40/2-BLK",
      name: "40/2 Black Thread",
      description: "40/2 polyester sewing thread, black",
      category_id: threadCategory,
      unit_id: coneUnit,
      tenantId: tenantId,
      type: "accessory",
      is_active: true,
      is_stockable: true,
      material_content: "Polyester",
      color: "Black",
      default_cost: 1.20,
      default_price: 1.95,
      reorder_point: 100,
      min_stock_level: 50,
      max_stock_level: 500,
      lead_time_in_days: 7,
      tags: ["thread", "black", "polyester"]
    },
    {
      item_code: "THR-40/2-WHT",
      name: "40/2 White Thread",
      description: "40/2 polyester sewing thread, white",
      category_id: threadCategory,
      unit_id: coneUnit,
      tenantId: tenantId,
      type: "accessory",
      is_active: true,
      is_stockable: true,
      material_content: "Polyester",
      color: "White",
      default_cost: 1.20,
      default_price: 1.95,
      reorder_point: 100,
      min_stock_level: 50,
      max_stock_level: 500,
      lead_time_in_days: 7,
      tags: ["thread", "white", "polyester"]
    }
  ];
  
  // Create accessories
  const accessories = [
    {
      item_code: "ACC-LABEL-MAIN",
      name: "Main Label",
      description: "Woven main brand label",
      category_id: accessoryCategory,
      unit_id: pieceUnit,
      tenantId: tenantId,
      type: "accessory",
      is_active: true,
      is_stockable: true,
      material_content: "Polyester",
      default_cost: 0.10,
      default_price: 0.18,
      reorder_point: 5000,
      min_stock_level: 1000,
      max_stock_level: 20000,
      lead_time_in_days: 21,
      tags: ["label", "woven", "brand"]
    },
    {
      item_code: "ACC-TAG-HANG",
      name: "Hang Tag",
      description: "Printed paper hang tag with string",
      category_id: accessoryCategory,
      unit_id: pieceUnit,
      tenantId: tenantId,
      type: "accessory",
      is_active: true,
      is_stockable: true,
      material_content: "Paper",
      default_cost: 0.05,
      default_price: 0.09,
      reorder_point: 10000,
      min_stock_level: 2000,
      max_stock_level: 30000,
      lead_time_in_days: 14,
      tags: ["tag", "paper", "printed"]
    }
  ];
  
  // Insert all items
  await db.insert(items).values([...fabrics, ...trims, ...threads, ...accessories]);
}

/**
 * Seed inquiries based on existing customers
 */
async function seedInquiries(tenantId: number, adminId: number) {
  const existingInquiries = await db.select().from(inquiries).where(eq(inquiries.tenantId, tenantId));
  
  if (existingInquiries.length > 0) {
    console.log("Inquiries already exist, skipping...");
    return;
  }
  
  console.log("Seeding inquiries...");
  
  // Get customers
  const customersList = await db.select().from(customers).where(eq(customers.tenantId, tenantId));
  
  if (customersList.length === 0) {
    throw new Error("No customers found. Run minimalSeed.ts first.");
  }
  
  // Create inquiries for each customer
  for (const customer of customersList) {
    const inquiryCount = Math.floor(Math.random() * 3) + 1; // 1-3 inquiries per customer
    
    for (let i = 0; i < inquiryCount; i++) {
      const productTypes = ["T-Shirt", "Polo Shirt", "Dress Shirt", "Pants", "Shorts", "Jacket"];
      const productType = getRandomElement(productTypes);
      const departments = ["Mens", "Womens", "Kids", "Unisex"];
      const department = getRandomElement(departments);
      
      await db.insert(inquiries).values({
        inquiryId: generateRandomId("INQ"),
        customerId: customer.id,
        tenantId: tenantId,
        styleName: `${department} ${productType}`,
        inquiryType: "Product Development",
        department: department,
        projectedQuantity: Math.floor(Math.random() * 10000) + 1000,
        projectedDeliveryDate: getRandomDate(
          new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
          new Date(Date.now() + 120 * 24 * 60 * 60 * 1000) // 120 days from now
        ),
        targetPrice: (Math.random() * 20 + 5).toFixed(2), // Random price between $5 and $25
        currency: "USD",
        season: getRandomElement(["Spring 2025", "Summer 2025", "Fall 2025"]),
        status: "Submitted",
        createdBy: adminId
      });
    }
  }
}

/**
 * Seed quotations based on inquiries
 */
async function seedQuotations(tenantId: number, adminId: number) {
  const existingQuotations = await db.select().from(quotations).where(eq(quotations.tenantId, tenantId));
  
  if (existingQuotations.length > 0) {
    console.log("Quotations already exist, skipping...");
    return;
  }
  
  console.log("Seeding quotations...");
  
  // Get inquiries
  const inquiriesList = await db.select().from(inquiries).where(eq(inquiries.tenantId, tenantId));
  
  if (inquiriesList.length === 0) {
    throw new Error("No inquiries found. Add inquiries first.");
  }
  
  // Create quotations for each inquiry
  for (const inquiry of inquiriesList) {
    // Random date between inquiry creation and now
    const quotationDate = getRandomDate(
      new Date(inquiry.createdAt),
      new Date()
    );
    
    // Random adjustment to target price (90-110%)
    const priceMultiplier = 0.9 + Math.random() * 0.2;
    const quotedPrice = (parseFloat(inquiry.targetPrice) * priceMultiplier).toFixed(2);
    
    await db.insert(quotations).values({
      quotationId: generateRandomId("QT"),
      inquiryId: inquiry.id,
      customerId: inquiry.customerId,
      tenantId: tenantId,
      styleName: inquiry.styleName,
      inquiryType: inquiry.inquiryType,
      department: inquiry.department,
      projectedQuantity: inquiry.projectedQuantity,
      projectedDeliveryDate: inquiry.projectedDeliveryDate,
      projectedUnitPrice: quotedPrice,
      currency: inquiry.currency,
      status: getRandomElement(["Draft", "Sent", "Approved", "Rejected"]),
      createdBy: adminId,
      validity: 30, // 30 days validity
      productDescription: `${inquiry.styleName} - ${inquiry.department}`,
      terms: "50% advance, 50% before shipment",
      notes: "Subject to final approval of samples and colors."
    });
  }
}

/**
 * Seed orders based on approved quotations
 */
async function seedOrders(tenantId: number, adminId: number) {
  const existingOrders = await db.select().from(orders).where(eq(orders.tenantId, tenantId));
  
  if (existingOrders.length > 0) {
    console.log("Orders already exist, skipping...");
    return;
  }
  
  console.log("Seeding orders...");
  
  // Get approved quotations
  const quotationsList = await db.select().from(quotations)
    .where(eq(quotations.tenantId, tenantId))
    .where(eq(quotations.status, "Approved"));
  
  // If no approved quotations, approve some randomly
  if (quotationsList.length === 0) {
    // Get some quotations in "Sent" status
    const sentQuotations = await db.select().from(quotations)
      .where(eq(quotations.tenantId, tenantId))
      .where(eq(quotations.status, "Sent"));
    
    // Approve half of the sent quotations
    const quotationsToApprove = sentQuotations.slice(0, Math.floor(sentQuotations.length / 2));
    
    for (const quotation of quotationsToApprove) {
      await db.update(quotations)
        .set({ status: "Approved" })
        .where(eq(quotations.id, quotation.id));
    }
    
    // Refetch the approved quotations
    const updatedQuotations = await db.select().from(quotations)
      .where(eq(quotations.tenantId, tenantId))
      .where(eq(quotations.status, "Approved"));
    
    // Create orders for each approved quotation
    for (const quotation of updatedQuotations) {
      await db.insert(orders).values({
        orderId: generateRandomId("ORD"),
        quotationId: quotation.id,
        customerId: quotation.customerId,
        tenantId: tenantId,
        styleName: quotation.styleName,
        department: quotation.department,
        totalQuantity: quotation.projectedQuantity,
        deliveryDate: quotation.projectedDeliveryDate.toISOString().split('T')[0],
        deliveryMode: getRandomElement(["Sea", "Air", "Road"]),
        orderStatus: getRandomElement(["new", "in_progress", "ready_for_shipment", "shipped", "delivered"]),
        priceConfirmed: parseFloat(quotation.projectedUnitPrice),
        currency: quotation.currency,
        createdBy: adminId
      });
    }
  } else {
    // Create orders for each approved quotation
    for (const quotation of quotationsList) {
      await db.insert(orders).values({
        orderId: generateRandomId("ORD"),
        quotationId: quotation.id,
        customerId: quotation.customerId,
        tenantId: tenantId,
        styleName: quotation.styleName,
        department: quotation.department,
        totalQuantity: quotation.projectedQuantity,
        deliveryDate: quotation.projectedDeliveryDate.toISOString().split('T')[0],
        deliveryMode: getRandomElement(["Sea", "Air", "Road"]),
        orderStatus: getRandomElement(["new", "in_progress", "ready_for_shipment", "shipped", "delivered"]),
        priceConfirmed: parseFloat(quotation.projectedUnitPrice),
        currency: quotation.currency,
        createdBy: adminId
      });
    }
  }
}

/**
 * Seed time and action plans for orders
 */
async function seedTimeActionPlans(tenantId: number, adminId: number) {
  const existingPlans = await db.select().from(timeActionPlans).where(eq(timeActionPlans.tenantId, tenantId));
  
  if (existingPlans.length > 0) {
    console.log("Time and action plans already exist, skipping...");
    return;
  }
  
  console.log("Seeding time and action plans...");
  
  // Get orders
  const ordersList = await db.select().from(orders).where(eq(orders.tenantId, tenantId));
  
  if (ordersList.length === 0) {
    throw new Error("No orders found. Add orders first.");
  }
  
  // Create time and action plans for each order
  for (const order of ordersList) {
    // Create the main plan
    const [plan] = await db.insert(timeActionPlans).values({
      orderId: order.id,
      tenantId: tenantId,
      name: `Production Plan for ${order.styleName}`,
      description: `Time and action plan for order ${order.orderId}`,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(order.deliveryDate).toISOString().split('T')[0],
      totalDays: Math.round((new Date(order.deliveryDate).getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000)),
      status: "active",
      createdBy: adminId
    }).returning();
    
    // Now add milestones
    const milestones = [
      {
        planId: plan.id,
        tenantId: tenantId,
        milestoneName: "Pre-Production Meeting",
        description: "Initial planning meeting with all departments",
        plannedStartDate: new Date(new Date().getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        plannedEndDate: new Date(new Date().getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: "completed",
        responsiblePerson: "Production Manager",
        department: "Production",
        priority: "high",
        isCritical: true,
        sortOrder: 1
      },
      {
        planId: plan.id,
        tenantId: tenantId,
        milestoneName: "Material Sourcing",
        description: "Source and order all required materials",
        plannedStartDate: new Date(new Date().getTime() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        plannedEndDate: new Date(new Date().getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: "in_progress",
        responsiblePerson: "Procurement Manager",
        department: "Procurement",
        priority: "high",
        isCritical: true,
        sortOrder: 2
      },
      {
        planId: plan.id,
        tenantId: tenantId,
        milestoneName: "Sample Development",
        description: "Create and approve production samples",
        plannedStartDate: new Date(new Date().getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        plannedEndDate: new Date(new Date().getTime() + 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: "pending",
        responsiblePerson: "Sample Room Supervisor",
        department: "Technical",
        priority: "high",
        isCritical: true,
        sortOrder: 3
      },
      {
        planId: plan.id,
        tenantId: tenantId,
        milestoneName: "Bulk Production",
        description: "Main production run",
        plannedStartDate: new Date(new Date().getTime() + 26 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        plannedEndDate: new Date(new Date().getTime() + 56 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: "pending",
        responsiblePerson: "Production Manager",
        department: "Production",
        priority: "high",
        isCritical: true,
        sortOrder: 4
      },
      {
        planId: plan.id,
        tenantId: tenantId,
        milestoneName: "Quality Inspection",
        description: "Final quality control and inspection",
        plannedStartDate: new Date(new Date().getTime() + 57 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        plannedEndDate: new Date(new Date().getTime() + 62 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: "pending",
        responsiblePerson: "QC Manager",
        department: "Quality",
        priority: "high",
        isCritical: true,
        sortOrder: 5
      },
      {
        planId: plan.id,
        tenantId: tenantId,
        milestoneName: "Packing & Shipping",
        description: "Final packing and shipment preparation",
        plannedStartDate: new Date(new Date().getTime() + 63 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        plannedEndDate: new Date(order.deliveryDate).toISOString().split('T')[0],
        status: "pending",
        responsiblePerson: "Logistics Manager",
        department: "Logistics",
        priority: "high",
        isCritical: true,
        sortOrder: 6
      }
    ];
    
    await db.insert(timeActionMilestones).values(milestones);
  }
}

/**
 * Seed tasks
 */
async function seedTasks(tenantId: number, adminId: number) {
  const existingTasks = await db.select().from(tasks).where(eq(tasks.tenantId, tenantId));
  
  if (existingTasks.length > 0) {
    console.log("Tasks already exist, skipping...");
    return;
  }
  
  console.log("Seeding tasks...");
  
  // Get milestone data to link tasks to relevant entities
  const milestones = await db.select().from(timeActionMilestones).where(eq(timeActionMilestones.tenantId, tenantId));
  
  if (milestones.length === 0) {
    throw new Error("No milestones found. Add time action plans first.");
  }
  
  // Create common tasks
  const commonTasks = [
    {
      title: "Review production capacity for upcoming orders",
      description: "Assess current production capacity and adjust scheduling for new orders",
      priority: "high",
      status: "pending",
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      assignedTo: adminId,
      createdBy: adminId,
      tenantId: tenantId,
      tags: ["production", "planning"]
    },
    {
      title: "Update material inventory records",
      description: "Reconcile physical inventory with system records for all raw materials",
      priority: "medium",
      status: "pending",
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      assignedTo: adminId,
      createdBy: adminId,
      tenantId: tenantId,
      tags: ["inventory", "materials"]
    },
    {
      title: "Prepare weekly production report",
      description: "Compile production output, efficiency, and quality metrics for the past week",
      priority: "medium",
      status: "completed",
      completed: true,
      completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      assignedTo: adminId,
      createdBy: adminId,
      tenantId: tenantId,
      tags: ["reporting", "production"]
    }
  ];
  
  // Create milestone-specific tasks
  const milestoneRelatedTasks = [];
  
  for (const milestone of milestones) {
    // Only create tasks for some milestones to avoid too many tasks
    if (Math.random() > 0.3) {
      continue;
    }
    
    milestoneRelatedTasks.push({
      title: `Prepare for ${milestone.milestoneName}`,
      description: `Complete preparation activities for ${milestone.milestoneName}`,
      priority: milestone.priority,
      status: "pending",
      dueDate: new Date(milestone.plannedStartDate).toISOString().split('T')[0],
      assignedTo: adminId,
      createdBy: adminId,
      tenantId: tenantId,
      relatedEntityType: "milestone",
      relatedEntityId: milestone.id,
      tags: ["planning", milestone.department.toLowerCase()]
    });
    
    milestoneRelatedTasks.push({
      title: `Follow up on ${milestone.milestoneName}`,
      description: `Check progress and address any issues with ${milestone.milestoneName}`,
      priority: milestone.priority,
      status: "pending",
      dueDate: new Date(new Date(milestone.plannedStartDate).getTime() + 
        (new Date(milestone.plannedEndDate).getTime() - new Date(milestone.plannedStartDate).getTime()) / 2
      ).toISOString().split('T')[0],
      assignedTo: adminId,
      createdBy: adminId,
      tenantId: tenantId,
      relatedEntityType: "milestone",
      relatedEntityId: milestone.id,
      tags: ["follow-up", milestone.department.toLowerCase()]
    });
  }
  
  // Insert all tasks
  await db.insert(tasks).values([...commonTasks, ...milestoneRelatedTasks]);
}

// Start the seeding process
seedComprehensiveData().then(() => {
  console.log("Comprehensive database seeding completed successfully!");
  process.exit(0);
}).catch((error) => {
  console.error("Error during database seeding:", error);
  process.exit(1);
});