/**
 * Minimal Database Seed Script for PrimeX ERP System
 * 
 * This script populates the PostgreSQL database with essential data:
 * - Default tenant and admin user
 * - Customers and agents
 * - Core configuration data
 */

import { db, executeQuery } from "../db";
import { 
  users, tenants, subscriptions, customers, customerAgents,
  currencies, exchangeRates
} from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

/**
 * Main seed function for essential data
 */
async function seedEssentialData() {
  console.log("Starting minimal database seeding process...");

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
      
      // 4. Seed currencies
      await seedCurrencies(tenantId);
      
      // 5. Seed customers and agents
      await seedCustomers(tenantId);
      
      console.log("Minimal database seeding completed successfully!");
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

// Start the seeding process
seedEssentialData().then(() => {
  console.log("Essential database seeding completed successfully!");
  process.exit(0);
}).catch((error) => {
  console.error("Error during database seeding:", error);
  process.exit(1);
});