/**
 * Database Seed Script for PrimeX ERP System
 * 
 * This script populates the PostgreSQL database with realistic sample data for production use.
 * It creates initial data for all modules and ensures consistency across related records.
 */

import { db, executeQuery } from "../db";
import { 
  users, tenants, subscriptions, customers, customerAgents,
  tasks, taskComments, warehouses, inquiries, 
  itemCategories, itemSubcategories, itemUnits, items, itemVariants,
  quotations, orders, 
  currencies, exchangeRates,
  timeActionPlans, timeActionMilestones
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcrypt";
import { generateRandomId } from "../utils/idGenerator";

/**
 * Main seed function that orchestrates the entire database seeding process
 */
async function seedDatabase() {
  console.log("Starting database seeding process...");

  try {
    // Begin transaction to ensure data consistency
    await executeQuery(async () => {
      // 1. Create default tenant if it doesn't exist
      const existingTenants = await db.select().from(tenants).where(eq(tenants.name, "Prime7 Solutions"));
      let tenantId = 1;
      
      if (existingTenants.length === 0) {
        console.log("Creating default tenant...");
        const [tenant] = await db.insert(tenants).values({
          name: "Prime7 Solutions",
          domain: "prime7.primex.app",
          isActive: true
        }).returning();
        
        tenantId = tenant.id;
      } else {
        tenantId = existingTenants[0].id;
      }
      
      // 2. Create admin user if it doesn't exist
      const existingAdmins = await db.select().from(users).where(eq(users.username, "admin"));
      
      if (existingAdmins.length === 0) {
        console.log("Creating admin user...");
        const hashedPassword = await bcrypt.hash("admin123", 10);
        
        await db.insert(users).values({
          username: "admin",
          email: "admin@demo.com",
          password: hashedPassword,
          firstName: "System",
          lastName: "Administrator",
          role: "admin",
          tenantId: tenantId,
          isActive: true
        });
      }
      
      // 3. Create subscription if it doesn't exist
      const existingSubscriptions = await db.select().from(subscriptions)
        .where(eq(subscriptions.tenantId, tenantId));
      
      if (existingSubscriptions.length === 0) {
        console.log("Creating default subscription...");
        await db.insert(subscriptions).values({
          tenantId: tenantId,
          plan: "enterprise",
          status: "active",
          startDate: new Date(),
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
        });
      }
      
      // 4. Seed base data
      await seedCurrencies(tenantId);
      await seedWarehouses(tenantId);
      await seedItemCategories(tenantId);
      await seedItemUnits(tenantId);
      
      // 5. Seed business data
      await seedCustomers(tenantId);
      await seedItemsAndInventory(tenantId);
      await seedInquiries(tenantId);
      await seedQuotations(tenantId);
      await seedOrders(tenantId);
      await seedTasks(tenantId);
      
      console.log("Database seeding completed successfully!");
    });
  } catch (error) {
    console.error("Error seeding database:", error);
    throw error;
  }
}

/**
 * Seed currencies and exchange rates
 */
async function seedCurrencies(tenantId: number) {
  const existingCurrencies = await db.select().from(currencies)
    .where(eq(currencies.tenantId, tenantId));
  
  if (existingCurrencies.length > 0) {
    console.log("Currencies already exist, skipping...");
    return;
  }
  
  console.log("Seeding currencies and exchange rates...");
  
  // Create base currencies
  const [usd] = await db.insert(currencies).values({
    code: "USD",
    name: "US Dollar",
    symbol: "$",
    decimalPlaces: 2,
    isActive: true,
    isDefault: true,
    tenantId: tenantId
  }).returning();
  
  const [eur] = await db.insert(currencies).values({
    code: "EUR",
    name: "Euro",
    symbol: "€",
    decimalPlaces: 2,
    isActive: true,
    isDefault: false,
    tenantId: tenantId
  }).returning();
  
  const [gbp] = await db.insert(currencies).values({
    code: "GBP",
    name: "British Pound",
    symbol: "£",
    decimalPlaces: 2,
    isActive: true,
    isDefault: false,
    tenantId: tenantId
  }).returning();
  
  const [bdt] = await db.insert(currencies).values({
    code: "BDT",
    name: "Bangladeshi Taka",
    symbol: "BDT",
    decimalPlaces: 2,
    isActive: true,
    isDefault: false,
    tenantId: tenantId
  }).returning();
  
  // Create exchange rates
  await db.insert(exchangeRates).values([
    {
      currencyId: eur.id,
      rate: "1.07",
      validFrom: new Date("2023-01-01"),
      source: "manual",
      tenantId: tenantId
    },
    {
      currencyId: gbp.id,
      rate: "1.27",
      validFrom: new Date("2023-01-01"),
      source: "manual",
      tenantId: tenantId
    },
    {
      currencyId: bdt.id,
      rate: "0.0091",
      validFrom: new Date("2023-01-01"),
      source: "manual",
      tenantId: tenantId
    }
  ]);
}

/**
 * Seed warehouses
 */
async function seedWarehouses(tenantId: number) {
  const existingWarehouses = await db.select().from(warehouses)
    .where(eq(warehouses.tenantId, tenantId));
  
  if (existingWarehouses.length > 0) {
    console.log("Warehouses already exist, skipping...");
    return;
  }
  
  console.log("Seeding warehouses...");
  
  await db.insert(warehouses).values([
    {
      warehouseId: "WH-001",
      name: "Main Factory Warehouse",
      location: "Dhaka, Bangladesh",
      isActive: true,
      tenantId: tenantId
    },
    {
      warehouseId: "WH-002",
      name: "Raw Materials Storage",
      location: "Gazipur, Bangladesh",
      isActive: true,
      tenantId: tenantId
    },
    {
      warehouseId: "WH-003",
      name: "Finished Goods Warehouse",
      location: "Chittagong, Bangladesh",
      isActive: true,
      tenantId: tenantId
    }
  ]);
}

/**
 * Seed item categories and subcategories
 */
async function seedItemCategories(tenantId: number) {
  const existingCategories = await db.select().from(itemCategories)
    .where(eq(itemCategories.tenantId, tenantId));
  
  if (existingCategories.length > 0) {
    console.log("Item categories already exist, skipping...");
    return;
  }
  
  console.log("Seeding item categories and subcategories...");
  
  // Create main categories
  const [fabricCategory] = await db.insert(itemCategories).values({
    categoryId: "CAT-FABRIC",
    name: "Fabrics",
    description: "All types of fabrics used in garment production",
    isActive: true,
    tenantId: tenantId
  }).returning();
  
  const [trimCategory] = await db.insert(itemCategories).values({
    categoryId: "CAT-TRIM",
    name: "Trims",
    description: "Buttons, zippers, labels and other garment accessories",
    isActive: true,
    tenantId: tenantId
  }).returning();
  
  const [accessoryCategory] = await db.insert(itemCategories).values({
    categoryId: "CAT-ACCESS",
    name: "Accessories",
    description: "Accessories used in garment manufacturing",
    isActive: true,
    tenantId: tenantId
  }).returning();
  
  const [packagingCategory] = await db.insert(itemCategories).values({
    categoryId: "CAT-PACK",
    name: "Packaging",
    description: "Packaging materials for finished products",
    isActive: true,
    tenantId: tenantId
  }).returning();

  // Create subcategories
  await db.insert(itemSubcategories).values([
    {
      subcategoryId: "SUB-COTTON",
      name: "Cotton Fabrics",
      categoryId: fabricCategory.id,
      tenantId: tenantId
    },
    {
      subcategoryId: "SUB-POLY",
      name: "Polyester Fabrics",
      categoryId: fabricCategory.id,
      tenantId: tenantId
    },
    {
      subcategoryId: "SUB-BLEND",
      name: "Blended Fabrics",
      categoryId: fabricCategory.id,
      tenantId: tenantId
    },
    {
      subcategoryId: "SUB-DENIM",
      name: "Denim",
      categoryId: fabricCategory.id,
      tenantId: tenantId
    },
    {
      subcategoryId: "SUB-BUTTON",
      name: "Buttons",
      categoryId: trimCategory.id,
      tenantId: tenantId
    },
    {
      subcategoryId: "SUB-ZIPPER",
      name: "Zippers",
      categoryId: trimCategory.id,
      tenantId: tenantId
    },
    {
      subcategoryId: "SUB-LABEL",
      name: "Labels",
      categoryId: trimCategory.id,
      tenantId: tenantId
    },
    {
      subcategoryId: "SUB-THREAD",
      name: "Thread",
      categoryId: accessoryCategory.id,
      tenantId: tenantId
    },
    {
      subcategoryId: "SUB-ELASTIC",
      name: "Elastic",
      categoryId: accessoryCategory.id,
      tenantId: tenantId
    },
    {
      subcategoryId: "SUB-POLYBAG",
      name: "Polybags",
      categoryId: packagingCategory.id,
      tenantId: tenantId
    },
    {
      subcategoryId: "SUB-BOX",
      name: "Boxes",
      categoryId: packagingCategory.id,
      tenantId: tenantId
    }
  ]);
}

/**
 * Seed item units
 */
async function seedItemUnits(tenantId: number) {
  const existingUnits = await db.select().from(itemUnits)
    .where(eq(itemUnits.tenantId, tenantId));
  
  if (existingUnits.length > 0) {
    console.log("Item units already exist, skipping...");
    return;
  }
  
  console.log("Seeding item units...");
  
  await db.insert(itemUnits).values([
    {
      unitCode: "YD",
      name: "Yard",
      type: "length",
      baseUnit: true,
      conversionFactor: "1",
      tenantId: tenantId
    },
    {
      unitCode: "M",
      name: "Meter",
      type: "length",
      baseUnit: false,
      conversionFactor: "1.09361",
      tenantId: tenantId
    },
    {
      unitCode: "PCS",
      name: "Pieces",
      type: "count",
      baseUnit: true,
      conversionFactor: "1",
      tenantId: tenantId
    },
    {
      unitCode: "DOZ",
      name: "Dozen",
      type: "count",
      baseUnit: false,
      conversionFactor: "12",
      tenantId: tenantId
    },
    {
      unitCode: "KG",
      name: "Kilogram",
      type: "weight",
      baseUnit: true,
      conversionFactor: "1",
      tenantId: tenantId
    },
    {
      unitCode: "GM",
      name: "Gram",
      type: "weight",
      baseUnit: false,
      conversionFactor: "0.001",
      tenantId: tenantId
    },
    {
      unitCode: "CONE",
      name: "Cone",
      type: "count",
      baseUnit: true,
      conversionFactor: "1",
      tenantId: tenantId
    },
    {
      unitCode: "ROLL",
      name: "Roll",
      type: "count",
      baseUnit: true,
      conversionFactor: "1",
      tenantId: tenantId
    }
  ]);
}

/**
 * Seed customers and customer agents
 */
async function seedCustomers(tenantId: number) {
  const existingCustomers = await db.select().from(customers)
    .where(eq(customers.tenantId, tenantId));
  
  if (existingCustomers.length > 0) {
    console.log("Customers already exist, skipping...");
    return;
  }
  
  console.log("Seeding customers and agents...");
  
  // Create realistic garment industry customers
  const [customer1] = await db.insert(customers).values({
    customerId: "CUS-10001",
    customerName: "Global Fashion Brands Ltd.",
    country: "United States",
    contactPerson: "Robert Wilson",
    email: "rwilson@globalbrands.com",
    phone: "+1-212-555-7890",
    hasAgent: true,
    isActive: true,
    tenantId: tenantId
  }).returning();
  
  const [customer2] = await db.insert(customers).values({
    customerId: "CUS-10002",
    customerName: "European Apparel Group",
    country: "Germany",
    contactPerson: "Anna Schmidt",
    email: "anna.schmidt@euroapparel.de",
    phone: "+49-30-555-1234",
    hasAgent: false,
    isActive: true,
    tenantId: tenantId
  }).returning();
  
  const [customer3] = await db.insert(customers).values({
    customerId: "CUS-10003",
    customerName: "Nordic Fashion House",
    country: "Sweden",
    contactPerson: "Erik Johansson",
    email: "erik@nordicfashion.se",
    phone: "+46-8-555-6789",
    hasAgent: true,
    isActive: true,
    tenantId: tenantId
  }).returning();
  
  const [customer4] = await db.insert(customers).values({
    customerId: "CUS-10004",
    customerName: "UK Retail Solutions",
    country: "United Kingdom",
    contactPerson: "Emma Thompson",
    email: "ethompson@ukretail.co.uk",
    phone: "+44-20-555-3456",
    hasAgent: false,
    isActive: true,
    tenantId: tenantId
  }).returning();
  
  const [customer5] = await db.insert(customers).values({
    customerId: "CUS-10005",
    customerName: "StyleMart International",
    country: "Canada",
    contactPerson: "Michael Chen",
    email: "mchen@stylemart.ca",
    phone: "+1-416-555-9012",
    hasAgent: true,
    isActive: true,
    tenantId: tenantId
  }).returning();
  
  // Create customer agents for customers with agents
  await db.insert(customerAgents).values([
    {
      customerId: customer1.id,
      agentName: "FashionLink Associates",
      agentEmail: "sjohnson@fashionlink.com",
      agentPhone: "+1-212-555-1212",
      tenantId: tenantId
    },
    {
      customerId: customer3.id,
      agentName: "Scandinavian Garment Agents",
      agentEmail: "lars@scanagents.com",
      agentPhone: "+45-31-555-4545",
      tenantId: tenantId
    },
    {
      customerId: customer5.id,
      agentName: "Pacific Rim Trading Co.",
      agentEmail: "david@pacificrim.com",
      agentPhone: "+1-604-555-7878",
      tenantId: tenantId
    }
  ]);
}

/**
 * Seed items and inventory
 */
async function seedItemsAndInventory(tenantId: number) {
  const existingItems = await db.select().from(items)
    .where(eq(items.tenantId, tenantId));
  
  if (existingItems.length > 0) {
    console.log("Items already exist, skipping...");
    return;
  }
  
  console.log("Seeding items and inventory...");
  
  // Get necessary references
  const fabricCategory = await db.select().from(itemCategories)
    .where(and(
      eq(itemCategories.categoryId, "CAT-FABRIC"),
      eq(itemCategories.tenantId, tenantId)
    )).then(rows => rows[0]);
  
  const trimCategory = await db.select().from(itemCategories)
    .where(and(
      eq(itemCategories.categoryId, "CAT-TRIM"),
      eq(itemCategories.tenantId, tenantId)
    )).then(rows => rows[0]);
  
  const cottonSubcategory = await db.select().from(itemSubcategories)
    .where(and(
      eq(itemSubcategories.subcategoryId, "SUB-COTTON"),
      eq(itemSubcategories.tenantId, tenantId)
    )).then(rows => rows[0]);
  
  const polySubcategory = await db.select().from(itemSubcategories)
    .where(and(
      eq(itemSubcategories.subcategoryId, "SUB-POLY"),
      eq(itemSubcategories.tenantId, tenantId)
    )).then(rows => rows[0]);
  
  const buttonSubcategory = await db.select().from(itemSubcategories)
    .where(and(
      eq(itemSubcategories.subcategoryId, "SUB-BUTTON"),
      eq(itemSubcategories.tenantId, tenantId)
    )).then(rows => rows[0]);
  
  const yardUnit = await db.select().from(itemUnits)
    .where(and(
      eq(itemUnits.unitCode, "YD"),
      eq(itemUnits.tenantId, tenantId)
    )).then(rows => rows[0]);
  
  const pcsUnit = await db.select().from(itemUnits)
    .where(and(
      eq(itemUnits.unitCode, "PCS"),
      eq(itemUnits.tenantId, tenantId)
    )).then(rows => rows[0]);
  
  const mainWarehouse = await db.select().from(warehouses)
    .where(and(
      eq(warehouses.warehouseId, "WH-001"),
      eq(warehouses.tenantId, tenantId)
    )).then(rows => rows[0]);
  
  // Create items
  await db.insert(items).values([
    {
      itemCode: "FB-CT-100",
      name: "100% Cotton Fabric - White",
      description: "Premium 100% cotton fabric in white, 150 GSM",
      categoryId: fabricCategory.id,
      subcategoryId: cottonSubcategory.id,
      unitId: yardUnit.id,
      sku: "FB-CT-100-W-150",
      barcode: "100100100101",
      minStockLevel: 500,
      maxStockLevel: 5000,
      reorderPoint: 1000,
      isActive: true,
      isBillOfMaterial: false,
      isStockable: true,
      isServiceItem: false,
      tenantId: tenantId
    },
    {
      itemCode: "FB-CT-101",
      name: "100% Cotton Fabric - Black",
      description: "Premium 100% cotton fabric in black, 150 GSM",
      categoryId: fabricCategory.id,
      subcategoryId: cottonSubcategory.id,
      unitId: yardUnit.id,
      sku: "FB-CT-101-B-150",
      barcode: "100100100102",
      minStockLevel: 500,
      maxStockLevel: 5000,
      reorderPoint: 1000,
      isActive: true,
      isBillOfMaterial: false,
      isStockable: true,
      isServiceItem: false,
      tenantId: tenantId
    },
    {
      itemCode: "FB-PL-200",
      name: "Polyester Fabric - Navy",
      description: "100% polyester fabric in navy blue, 120 GSM",
      categoryId: fabricCategory.id,
      subcategoryId: polySubcategory.id,
      unitId: yardUnit.id,
      sku: "FB-PL-200-N-120",
      barcode: "100100100201",
      minStockLevel: 300,
      maxStockLevel: 3000,
      reorderPoint: 700,
      isActive: true,
      isBillOfMaterial: false,
      isStockable: true,
      isServiceItem: false,
      tenantId: tenantId
    },
    {
      itemCode: "TR-BT-001",
      name: "Plastic Button - White 18mm",
      description: "White plastic button, 18mm diameter, 4 holes",
      categoryId: trimCategory.id,
      subcategoryId: buttonSubcategory.id,
      unitId: pcsUnit.id,
      sku: "TR-BT-001-W-18",
      barcode: "200200200101",
      minStockLevel: 5000,
      maxStockLevel: 50000,
      reorderPoint: 10000,
      isActive: true,
      isBillOfMaterial: false,
      isStockable: true,
      isServiceItem: false,
      tenantId: tenantId
    },
    {
      itemCode: "TR-BT-002",
      name: "Metal Button - Silver 20mm",
      description: "Silver metal button, 20mm diameter",
      categoryId: trimCategory.id,
      subcategoryId: buttonSubcategory.id,
      unitId: pcsUnit.id,
      sku: "TR-BT-002-S-20",
      barcode: "200200200102",
      minStockLevel: 3000,
      maxStockLevel: 30000,
      reorderPoint: 6000,
      isActive: true,
      isBillOfMaterial: false,
      isStockable: true,
      isServiceItem: false,
      tenantId: tenantId
    }
  ]);
  
  // Retrieve created items for inventory creation
  const allItems = await db.select().from(items)
    .where(eq(items.tenantId, tenantId));
  
  // Create item variants and stock records
  for (const item of allItems) {
    if (item.itemCode.startsWith("FB-CT")) {
      // Create cotton fabric variants
      await db.insert(itemVariants).values([
        {
          parentItemId: item.id,
          variantCode: `${item.itemCode}-S`,
          name: `${item.name} - Small Width (45")`,
          sku: `${item.sku}-S`,
          attributes: JSON.stringify({ width: "45 inches" }),
          isActive: true,
          tenantId: tenantId
        },
        {
          parentItemId: item.id,
          variantCode: `${item.itemCode}-L`,
          name: `${item.name} - Large Width (60")`,
          sku: `${item.sku}-L`,
          attributes: JSON.stringify({ width: "60 inches" }),
          isActive: true,
          tenantId: tenantId
        }
      ]);
      
      // Add stock for the main item
      await db.insert(itemStock).values({
        itemId: item.id,
        warehouseId: mainWarehouse.id,
        quantity: "2500",
        tenantId: tenantId
      });
    } else if (item.itemCode.startsWith("FB-PL")) {
      // Create polyester fabric variants
      await db.insert(itemVariants).values([
        {
          parentItemId: item.id,
          variantCode: `${item.itemCode}-S`,
          name: `${item.name} - Small Width (45")`,
          sku: `${item.sku}-S`,
          attributes: JSON.stringify({ width: "45 inches" }),
          isActive: true,
          tenantId: tenantId
        },
        {
          parentItemId: item.id,
          variantCode: `${item.itemCode}-L`,
          name: `${item.name} - Large Width (58")`,
          sku: `${item.sku}-L`,
          attributes: JSON.stringify({ width: "58 inches" }),
          isActive: true,
          tenantId: tenantId
        }
      ]);
      
      // Add stock for the main item
      await db.insert(itemStock).values({
        itemId: item.id,
        warehouseId: mainWarehouse.id,
        quantity: "1800",
        tenantId: tenantId
      });
    } else if (item.itemCode.startsWith("TR-BT")) {
      // Add stock for buttons
      await db.insert(itemStock).values({
        itemId: item.id,
        warehouseId: mainWarehouse.id,
        quantity: item.itemCode === "TR-BT-001" ? "25000" : "15000",
        tenantId: tenantId
      });
    }
  }
}

/**
 * Seed inquiries
 */
async function seedInquiries(tenantId: number) {
  const existingInquiries = await db.select().from(inquiries)
    .where(eq(inquiries.tenantId, tenantId));
  
  if (existingInquiries.length > 0) {
    console.log("Inquiries already exist, skipping...");
    return;
  }
  
  console.log("Seeding inquiries...");
  
  // Get customers
  const allCustomers = await db.select().from(customers)
    .where(eq(customers.tenantId, tenantId));
  
  // Create inquiries with realistic garment industry details
  await db.insert(inquiries).values([
    {
      inquiryId: generateRandomId("INQ"),
      customerId: allCustomers[0].id,
      subject: "Cotton T-Shirts Summer Collection",
      status: "New",
      priority: "Medium",
      description: "Inquiry for summer collection of 100% cotton t-shirts in various colors. Need price quotation for 10,000 pieces per style, 5 colors.",
      receivedDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      projectDeadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
      targetPrice: "4.50",
      currency: "USD",
      assignedTo: 1, // Admin user
      productCategory: "T-Shirts",
      productDescription: "100% cotton jersey t-shirts, 180 GSM, crew neck, short sleeve, 5 solid colors",
      quantityRequired: 50000,
      sampleRequired: true,
      tenantId: tenantId
    },
    {
      inquiryId: generateRandomId("INQ"),
      customerId: allCustomers[1].id,
      subject: "Men's Denim Jeans Production",
      status: "In Progress",
      priority: "High",
      description: "Looking for manufacturer for premium men's denim jeans. Need competitive pricing for European market.",
      receivedDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
      projectDeadline: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), // 120 days from now
      targetPrice: "12.75",
      currency: "EUR",
      assignedTo: 1, // Admin user
      productCategory: "Jeans",
      productDescription: "Men's 5-pocket denim jeans, 12oz denim, 98% cotton 2% elastane, 3 washes available",
      quantityRequired: 25000,
      sampleRequired: true,
      tenantId: tenantId
    },
    {
      inquiryId: generateRandomId("INQ"),
      customerId: allCustomers[2].id,
      subject: "Children's Winter Jackets",
      status: "Quoted",
      priority: "Medium",
      description: "Need manufacturer for children's padded winter jackets with sustainable materials.",
      receivedDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), // 25 days ago
      projectDeadline: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000), // 150 days from now
      targetPrice: "18.50",
      currency: "EUR",
      assignedTo: 1, // Admin user
      productCategory: "Outerwear",
      productDescription: "Children's padded winter jackets, recycled polyester shell and filling, water-resistant, sizes 4-12 years",
      quantityRequired: 15000,
      sampleRequired: true,
      tenantId: tenantId
    },
    {
      inquiryId: generateRandomId("INQ"),
      customerId: allCustomers[3].id,
      subject: "Women's Business Shirts",
      status: "New",
      priority: "Low",
      description: "Request for quotation for women's formal business shirts for corporate uniform program.",
      receivedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      projectDeadline: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000), // 100 days from now
      targetPrice: "9.25",
      currency: "GBP",
      assignedTo: 1, // Admin user
      productCategory: "Shirts",
      productDescription: "Women's formal business shirts, 60% cotton 40% polyester, wrinkle-resistant, white and light blue",
      quantityRequired: 8000,
      sampleRequired: true,
      tenantId: tenantId
    }
  ]);
}

/**
 * Seed quotations based on inquiries
 */
async function seedQuotations(tenantId: number) {
  const existingQuotations = await db.select().from(quotations)
    .where(eq(quotations.tenantId, tenantId));
  
  if (existingQuotations.length > 0) {
    console.log("Quotations already exist, skipping...");
    return;
  }
  
  console.log("Seeding quotations...");
  
  // Get all inquiries that are in "Quoted" status
  const quotedInquiries = await db.select().from(inquiries)
    .where(and(
      eq(inquiries.status, "Quoted"),
      eq(inquiries.tenantId, tenantId)
    ));
  
  if (quotedInquiries.length === 0) {
    console.log("No quoted inquiries found to create quotations for.");
    return;
  }
  
  // Create a quotation based on the quoted inquiry
  for (const inquiry of quotedInquiries) {
    const quotationId = generateRandomId("QUO");
    
    // Create the main quotation record
    const [quotation] = await db.insert(quotations).values({
      quotationId: quotationId,
      inquiryId: inquiry.id,
      customerId: inquiry.customerId,
      styleName: inquiry.productCategory || "Basic Style",
      department: "Production",
      status: "Sent",
      projectedQuantity: inquiry.quantityRequired,
      projectedDeliveryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 90 days from now
      createdBy: 1, // Admin user
      tenantId: tenantId
    }).returning();
    
    // Add material costs
    await db.insert(quotationMaterials).values([
      {
        quotationId: quotation.id,
        serialNo: 1,
        description: "Main Fabric",
        unitOfMeasure: "YD",
        requiredQuantity: "2.2",
        wastagePercentage: "5",
        unitPrice: "3.25",
        totalCost: ((2.2 * 1.05) * 3.25 * inquiry.quantityRequired).toFixed(2),
        tenantId: tenantId
      },
      {
        quotationId: quotation.id,
        serialNo: 2,
        description: "Lining",
        unitOfMeasure: "YD",
        requiredQuantity: "1.0",
        wastagePercentage: "3",
        unitPrice: "1.75",
        totalCost: ((1.0 * 1.03) * 1.75 * inquiry.quantityRequired).toFixed(2),
        tenantId: tenantId
      },
      {
        quotationId: quotation.id,
        serialNo: 3,
        description: "Thread",
        unitOfMeasure: "CONE",
        requiredQuantity: "0.02",
        wastagePercentage: "2",
        unitPrice: "3.50",
        totalCost: ((0.02 * 1.02) * 3.50 * inquiry.quantityRequired).toFixed(2),
        tenantId: tenantId
      }
    ]);
    
    // Add manufacturing costs
    await db.insert(quotationManufacturing).values([
      {
        quotationId: quotation.id,
        serialNo: 1,
        stylePart: "Cutting",
        machinesRequired: 5,
        productionPerHour: "30",
        productionPerDay: "240",
        daysRequired: "13",
        laborCostPerDay: "250",
        totalCost: (13 * 250 * 5).toFixed(2),
        tenantId: tenantId
      },
      {
        quotationId: quotation.id,
        serialNo: 2,
        stylePart: "Sewing",
        machinesRequired: 20,
        productionPerHour: "10",
        productionPerDay: "80",
        daysRequired: "38",
        laborCostPerDay: "300",
        totalCost: (38 * 300 * 20).toFixed(2),
        tenantId: tenantId
      },
      {
        quotationId: quotation.id,
        serialNo: 3,
        stylePart: "Finishing",
        machinesRequired: 8,
        productionPerHour: "20",
        productionPerDay: "160",
        daysRequired: "18",
        laborCostPerDay: "200",
        totalCost: (18 * 200 * 8).toFixed(2),
        tenantId: tenantId
      }
    ]);
    
    // Add other costs
    await db.insert(quotationOtherCosts).values([
      {
        quotationId: quotation.id,
        serialNo: 1,
        description: "Shipping",
        costPerUnit: "0.35",
        totalCost: (0.35 * inquiry.quantityRequired).toFixed(2),
        tenantId: tenantId
      },
      {
        quotationId: quotation.id,
        serialNo: 2,
        description: "Quality Control",
        costPerUnit: "0.20",
        totalCost: (0.20 * inquiry.quantityRequired).toFixed(2),
        tenantId: tenantId
      },
      {
        quotationId: quotation.id,
        serialNo: 3,
        description: "Packaging",
        costPerUnit: "0.25",
        totalCost: (0.25 * inquiry.quantityRequired).toFixed(2),
        tenantId: tenantId
      }
    ]);
    
    // Add cost summary
    const totalMaterialCost = ((2.2 * 1.05) * 3.25 + (1.0 * 1.03) * 1.75 + (0.02 * 1.02) * 3.50) * inquiry.quantityRequired;
    const totalManufacturingCost = (13 * 250 * 5) + (38 * 300 * 20) + (18 * 200 * 8);
    const totalOtherCost = (0.35 + 0.20 + 0.25) * inquiry.quantityRequired;
    const totalCost = totalMaterialCost + totalManufacturingCost + totalOtherCost;
    const costPerUnit = totalCost / inquiry.quantityRequired;
    const profitAmount = costPerUnit * 0.25; // 25% profit
    const sellingPricePerUnit = costPerUnit + profitAmount;
    
    await db.insert(quotationCostSummary).values({
      quotationId: quotation.id,
      materialCost: totalMaterialCost.toFixed(2),
      manufacturingCost: totalManufacturingCost.toFixed(2),
      otherCost: totalOtherCost.toFixed(2),
      totalCost: totalCost.toFixed(2),
      costPerUnit: costPerUnit.toFixed(2),
      profitAmount: profitAmount.toFixed(2),
      sellingPricePerUnit: sellingPricePerUnit.toFixed(2),
      tenantId: tenantId
    });
  }
}

/**
 * Seed orders based on quotations
 */
async function seedOrders(tenantId: number) {
  const existingOrders = await db.select().from(orders)
    .where(eq(orders.tenantId, tenantId));
  
  if (existingOrders.length > 0) {
    console.log("Orders already exist, skipping...");
    return;
  }
  
  console.log("Seeding orders...");
  
  // Get quotations with "Sent" status
  const sentQuotations = await db.select().from(quotations)
    .where(and(
      eq(quotations.status, "Sent"),
      eq(quotations.tenantId, tenantId)
    ));
  
  if (sentQuotations.length === 0) {
    console.log("No sent quotations found to create orders for.");
    return;
  }
  
  // Use the first quotation to create an order
  const quotation = sentQuotations[0];
  
  // Create the main order record
  const [order] = await db.insert(orders).values({
    orderId: generateRandomId("ORD"),
    quotationId: quotation.id,
    customerId: quotation.customerId,
    styleName: quotation.styleName,
    department: quotation.department || "Production",
    totalQuantity: quotation.projectedQuantity,
    deliveryDate: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 75 days from now
    deliveryMode: "Sea",
    orderStatus: "new",
    priceConfirmed: quotation.projectedQuantity > 0 ? 25.50 : 0,
    currency: "USD",
    createdBy: 1, // Admin user
    tenantId: tenantId
  }).returning();
  
  // Create color/size breakdown
  await db.insert(orderColorSizeBreakdown).values([
    {
      orderId: order.id,
      color: "Navy",
      sizeS: Math.floor(quotation.projectedQuantity * 0.2),
      sizeM: Math.floor(quotation.projectedQuantity * 0.35),
      sizeL: Math.floor(quotation.projectedQuantity * 0.30),
      sizeXL: Math.floor(quotation.projectedQuantity * 0.15),
      sizeXXL: 0,
      total: quotation.projectedQuantity,
      tenantId: tenantId
    },
    {
      orderId: order.id,
      color: "Black",
      sizeS: Math.floor(quotation.projectedQuantity * 0.15),
      sizeM: Math.floor(quotation.projectedQuantity * 0.30),
      sizeL: Math.floor(quotation.projectedQuantity * 0.35),
      sizeXL: Math.floor(quotation.projectedQuantity * 0.15),
      sizeXXL: Math.floor(quotation.projectedQuantity * 0.05),
      total: quotation.projectedQuantity,
      tenantId: tenantId
    }
  ]);
  
  // Create materials for the order
  const quotMaterials = await db.select().from(quotationMaterials)
    .where(and(
      eq(quotationMaterials.quotationId, quotation.id),
      eq(quotationMaterials.tenantId, tenantId)
    ));
  
  for (const material of quotMaterials) {
    await db.insert(orderMaterials).values({
      orderId: order.id,
      itemDescription: material.description,
      unitOfMeasure: material.unitOfMeasure,
      quantityNeeded: (parseFloat(material.requiredQuantity) * quotation.projectedQuantity).toFixed(2),
      unitPrice: material.unitPrice,
      totalCost: material.totalCost,
      deliveryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      status: "Pending",
      tenantId: tenantId
    });
  }
  
  // Create a time & action plan for the order
  const [plan] = await db.insert(timeActionPlans).values({
    orderId: order.id,
    planName: `Production Plan for ${order.orderId}`,
    startDate: new Date(),
    endDate: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000), // Same as delivery date
    status: "In Progress",
    tenantId: tenantId
  }).returning();
  
  // Add milestones to the time & action plan
  await db.insert(timeActionMilestones).values([
    {
      planId: plan.id,
      milestoneName: "Material Sourcing",
      description: "Source and procure all required materials",
      plannedStartDate: new Date(),
      plannedEndDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      actualStartDate: new Date(),
      status: "In Progress",
      completion: 30,
      criticalPath: true,
      tenantId: tenantId
    },
    {
      planId: plan.id,
      milestoneName: "Sample Approval",
      description: "Get pre-production sample approved by customer",
      plannedStartDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      plannedEndDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
      status: "Pending",
      completion: 0,
      criticalPath: true,
      tenantId: tenantId
    },
    {
      planId: plan.id,
      milestoneName: "Cutting",
      description: "Cut all fabrics according to patterns",
      plannedStartDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
      plannedEndDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000),
      status: "Pending",
      completion: 0,
      criticalPath: true,
      tenantId: tenantId
    },
    {
      planId: plan.id,
      milestoneName: "Sewing",
      description: "Complete sewing of all garments",
      plannedStartDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000),
      plannedEndDate: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000),
      status: "Pending",
      completion: 0,
      criticalPath: true,
      tenantId: tenantId
    },
    {
      planId: plan.id,
      milestoneName: "Quality Control",
      description: "Perform quality checks and fix any issues",
      plannedStartDate: new Date(Date.now() + 55 * 24 * 60 * 60 * 1000),
      plannedEndDate: new Date(Date.now() + 65 * 24 * 60 * 60 * 1000),
      status: "Pending",
      completion: 0,
      criticalPath: true,
      tenantId: tenantId
    },
    {
      planId: plan.id,
      milestoneName: "Packaging & Shipping",
      description: "Pack and prepare for shipment",
      plannedStartDate: new Date(Date.now() + 65 * 24 * 60 * 60 * 1000),
      plannedEndDate: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000),
      status: "Pending",
      completion: 0,
      criticalPath: true,
      tenantId: tenantId
    }
  ]);
}

/**
 * Seed tasks
 */
async function seedTasks(tenantId: number) {
  const existingTasks = await db.select().from(tasks)
    .where(eq(tasks.tenantId, tenantId));
  
  if (existingTasks.length > 0) {
    console.log("Tasks already exist, skipping...");
    return;
  }
  
  console.log("Seeding tasks...");
  
  // Create tasks based on various aspects of the garment manufacturing process
  await db.insert(tasks).values([
    {
      title: "Review production schedule for upcoming orders",
      description: "Review and optimize the production schedule for all active orders to ensure on-time delivery",
      status: "In Progress",
      priority: "High",
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dueTime: "16:00",
      assignedTo: 1, // Admin user
      createdBy: 1,
      tags: ["Production", "Planning"],
      relatedEntityType: null,
      relatedEntityId: null,
      completed: false,
      completedAt: null,
      reminderAt: null,
      tenantId: tenantId
    },
    {
      title: "Follow up with fabric suppliers about delivery delays",
      description: "Contact the fabric suppliers about the delayed shipments for orders #ORD-78291 and #ORD-78305",
      status: "To Do",
      priority: "Critical",
      dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dueTime: "12:00",
      assignedTo: 1,
      createdBy: 1,
      tags: ["Procurement", "Supplier"],
      relatedEntityType: null,
      relatedEntityId: null,
      completed: false,
      completedAt: null,
      reminderAt: null,
      tenantId: tenantId
    },
    {
      title: "Prepare quality inspection report for customer sample",
      description: "Complete the quality inspection report for the pre-production sample of order #ORD-78291",
      status: "To Do",
      priority: "Medium",
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dueTime: "17:00",
      assignedTo: 1,
      createdBy: 1,
      tags: ["Quality", "Sample"],
      relatedEntityType: null,
      relatedEntityId: null,
      completed: false,
      completedAt: null,
      reminderAt: null,
      tenantId: tenantId
    },
    {
      title: "Schedule production meeting with department heads",
      description: "Organize a meeting with all production department heads to discuss optimization strategies",
      status: "To Do",
      priority: "Medium",
      dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dueTime: "10:00",
      assignedTo: 1,
      createdBy: 1,
      tags: ["Meeting", "Production"],
      relatedEntityType: null,
      relatedEntityId: null,
      completed: false,
      completedAt: null,
      reminderAt: null,
      tenantId: tenantId
    },
    {
      title: "Prepare quotation for new inquiry from Nordic Fashion House",
      description: "Prepare a detailed quotation for the winter jacket inquiry from Nordic Fashion House",
      status: "In Progress",
      priority: "High",
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dueTime: "18:00",
      assignedTo: 1,
      createdBy: 1,
      tags: ["Quotation", "Sales"],
      relatedEntityType: null,
      relatedEntityId: null,
      completed: false,
      completedAt: null,
      reminderAt: null,
      tenantId: tenantId
    },
    {
      title: "Review and approve employee overtime requests",
      description: "Review overtime requests from the cutting department for this week",
      status: "Completed",
      priority: "Medium",
      dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      dueTime: "14:00",
      assignedTo: 1,
      createdBy: 1,
      tags: ["HR", "Approvals"],
      relatedEntityType: null,
      relatedEntityId: null,
      completed: true,
      completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      reminderAt: null,
      tenantId: tenantId
    }
  ]);
  
  // Add comments to a task
  const task = await db.select().from(tasks)
    .where(and(
      eq(tasks.title, "Follow up with fabric suppliers about delivery delays"),
      eq(tasks.tenantId, tenantId)
    )).then(rows => rows[0]);
  
  if (task) {
    await db.insert(taskComments).values([
      {
        taskId: task.id,
        content: "I've contacted the supplier via email. Waiting for their response.",
        createdBy: 1,
        tenantId: tenantId
      },
      {
        taskId: task.id,
        content: "Supplier responded that the delay is due to a raw material shortage. They promised to ship by next week.",
        createdBy: 1,
        tenantId: tenantId
      }
    ]);
  }
}

// Start the seeding process
seedDatabase().then(() => {
  console.log("Database seeding completed successfully!");
  process.exit(0);
}).catch((error) => {
  console.error("Error during database seeding:", error);
  process.exit(1);
});