/**
 * Essential Database Seed Script for PrimeX ERP System
 * 
 * This script populates the PostgreSQL database with essential item data
 * for a garment manufacturing ERP system (categories, units, and items).
 */

import { db } from "../db";
import {
  tenants, itemCategories, itemUnits, items
} from "@shared/schema";
import { eq } from "drizzle-orm";

async function seedEssentialData() {
  console.log("Starting essential database seeding process...");

  try {
    // Get the target tenant
    const tenantResult = await db.select().from(tenants).where(eq(tenants.name, "Prime7 Solutions"));
    
    if (tenantResult.length === 0) {
      throw new Error("Prime7 Solutions tenant not found. Run minimalSeed.ts first.");
    }
    
    const tenantId = tenantResult[0].id;
    console.log(`Found Prime7 Solutions tenant with ID: ${tenantId}`);
    
    // 1. Seed item categories for garment manufacturing
    await seedItemCategories(tenantId);
    
    // 2. Seed item units
    await seedItemUnits(tenantId);
    
    // 3. Seed items
    await seedItems(tenantId);
    
    console.log("Essential database seeding completed successfully!");
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}

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
  console.log("Item categories seeded successfully");
}

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
  console.log("Item units seeded successfully");
}

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
  
  if (categories.length === 0 || units.length === 0) {
    throw new Error("Categories or units not found. Please seed them first.");
  }
  
  // Find specific categories and units
  const fabricCategory = categories.find(c => c.name === "Fabrics")?.id;
  const trimCategory = categories.find(c => c.name === "Trims")?.id;
  const threadCategory = categories.find(c => c.name === "Threads")?.id;
  const accessoryCategory = categories.find(c => c.name === "Accessories")?.id;
  
  const yardUnit = units.find(u => u.unitCode === "YDS")?.id;
  const meterUnit = units.find(u => u.unitCode === "MTR")?.id;
  const pieceUnit = units.find(u => u.unitCode === "PCS")?.id;
  const coneUnit = units.find(u => u.unitCode === "CONE")?.id;
  
  // Create basic fabric items
  const fabrics = [
    {
      itemCode: "FAB-COTTON-100",
      name: "100% Cotton Jersey",
      description: "Premium 100% Cotton Jersey Fabric, 160 GSM",
      categoryId: fabricCategory,
      unitId: yardUnit,
      tenantId,
      type: "material",
      isActive: true,
      isStockable: true,
      materialContent: "100% Cotton",
      weight: "160",
      weightUnit: "GSM",
      defaultCost: 4.75,
      defaultPrice: 6.25,
      tags: ["fabric", "cotton", "jersey"]
    },
    {
      itemCode: "FAB-TC-6535",
      name: "TC 65/35 Poplin",
      description: "TC 65/35 Poplin Fabric, 110 GSM",
      categoryId: fabricCategory,
      unitId: yardUnit,
      tenantId,
      type: "material",
      isActive: true,
      isStockable: true,
      materialContent: "65% Polyester, 35% Cotton",
      weight: "110",
      weightUnit: "GSM",
      defaultCost: 3.50,
      defaultPrice: 4.75,
      tags: ["fabric", "tc", "poplin"]
    }
  ];
  
  // Create basic trim items
  const trims = [
    {
      itemCode: "TRM-BTN-18L",
      name: "18L Plastic Buttons",
      description: "18L 4-hole plastic buttons",
      categoryId: trimCategory,
      unitId: pieceUnit,
      tenantId,
      type: "accessory",
      isActive: true,
      isStockable: true,
      materialContent: "Plastic",
      defaultCost: 0.05,
      defaultPrice: 0.08,
      tags: ["trims", "buttons", "plastic"]
    }
  ];
  
  // Create basic thread items
  const threads = [
    {
      itemCode: "THR-40/2-BLK",
      name: "40/2 Black Thread",
      description: "40/2 polyester sewing thread, black",
      categoryId: threadCategory,
      unitId: coneUnit,
      tenantId,
      type: "accessory",
      isActive: true,
      isStockable: true,
      materialContent: "Polyester",
      color: "Black",
      defaultCost: 1.20,
      defaultPrice: 1.95,
      tags: ["thread", "black", "polyester"]
    }
  ];
  
  // Create basic accessory items
  const accessories = [
    {
      itemCode: "ACC-LABEL-MAIN",
      name: "Main Label",
      description: "Woven main brand label",
      categoryId: accessoryCategory,
      unitId: pieceUnit,
      tenantId,
      type: "accessory",
      isActive: true,
      isStockable: true,
      materialContent: "Polyester",
      defaultCost: 0.10,
      defaultPrice: 0.18,
      tags: ["label", "woven", "brand"]
    }
  ];
  
  // Insert all items
  await db.insert(items).values([...fabrics, ...trims, ...threads, ...accessories]);
  console.log("Items seeded successfully");
}

// Start the seeding process
seedEssentialData().then(() => {
  console.log("Essential database seeding completed successfully!");
  process.exit(0);
}).catch((error) => {
  console.error("Error during database seeding:", error);
  process.exit(1);
});