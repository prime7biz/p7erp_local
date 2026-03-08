import { db } from "../db";
import { customers, customerAgents, tenants } from "@shared/schema";
import { eq } from "drizzle-orm";

async function populateCustomers() {
  try {
    console.log("Starting to populate customer data...");
    
    // Get the first tenant (assuming it exists)
    const [tenant] = await db.select().from(tenants).limit(1);
    if (!tenant) {
      console.error("No tenant found. Please create a tenant first.");
      return;
    }
    
    const tenantId = tenant.id;
    console.log(`Using tenant ID: ${tenantId}`);
    
    // Check if customers already exist
    const existingCustomers = await db.select().from(customers).where(eq(customers.tenantId, tenantId));
    if (existingCustomers.length > 0) {
      console.log(`Found ${existingCustomers.length} existing customers. Skipping creation.`);
      return;
    }
    
    // Sample customer data for garment manufacturing
    const sampleCustomers = [
      {
        customerId: "CUST-00001",
        customerName: "Global Fashion Brands",
        address: "123 Fashion Ave, New York, NY 10001",
        website: "www.globalfashion.com",
        country: "United States",
        contactPerson: "Sarah Johnson",
        email: "sarah.johnson@globalfashion.com",
        phone: "+1-212-555-0123",
        hasAgent: true,
        isActive: true,
        tenantId: tenantId,
        orderCount: 25,
        inquiryCount: 45,
        totalSpend: 125000,
        avgOrderValue: 5000,
        paymentTerms: "NET 30",
        leadTime: 45,
        industrySegment: "Premium Fashion",
        sustainabilityRating: "4",
        complianceLevel: "High"
      },
      {
        customerId: "CUST-00002",
        customerName: "European Retail Chain",
        address: "456 Commerce St, London, UK",
        website: "www.euroretail.co.uk",
        country: "United Kingdom",
        contactPerson: "James Wilson",
        email: "james.wilson@euroretail.co.uk",
        phone: "+44-20-7123-4567",
        hasAgent: false,
        isActive: true,
        tenantId: tenantId,
        orderCount: 18,
        inquiryCount: 32,
        totalSpend: 95000,
        avgOrderValue: 5278,
        paymentTerms: "NET 45",
        leadTime: 60,
        industrySegment: "Fast Fashion",
        sustainabilityRating: "3",
        complianceLevel: "Medium"
      },
      {
        customerId: "CUST-00003",
        customerName: "Nordic Fashion House",
        address: "789 Design Blvd, Stockholm, Sweden",
        website: "www.nordicfashion.se",
        country: "Sweden",
        contactPerson: "Lars Anderson",
        email: "lars.anderson@nordicfashion.se",
        phone: "+46-8-555-9876",
        hasAgent: true,
        isActive: true,
        tenantId: tenantId,
        orderCount: 12,
        inquiryCount: 28,
        totalSpend: 78000,
        avgOrderValue: 6500,
        paymentTerms: "NET 30",
        leadTime: 50,
        industrySegment: "Sustainable Fashion",
        sustainabilityRating: "5",
        complianceLevel: "High"
      },
      {
        customerId: "CUST-00004",
        customerName: "Asian Pacific Apparel",
        address: "321 Trade Center, Singapore",
        website: "www.apapparel.com.sg",
        country: "Singapore",
        contactPerson: "Li Wei",
        email: "li.wei@apapparel.com.sg",
        phone: "+65-6555-1234",
        hasAgent: false,
        isActive: true,
        tenantId: tenantId,
        orderCount: 35,
        inquiryCount: 62,
        totalSpend: 180000,
        avgOrderValue: 5143,
        paymentTerms: "NET 15",
        leadTime: 30,
        industrySegment: "Mass Market",
        sustainabilityRating: "3",
        complianceLevel: "Medium"
      },
      {
        customerId: "CUST-00005",
        customerName: "Canadian Outdoor Wear",
        address: "555 Mountain View, Vancouver, BC",
        website: "www.canoutdoor.ca",
        country: "Canada",
        contactPerson: "Michael Chen",
        email: "michael.chen@canoutdoor.ca",
        phone: "+1-604-555-7890",
        hasAgent: true,
        isActive: true,
        tenantId: tenantId,
        orderCount: 8,
        inquiryCount: 15,
        totalSpend: 65000,
        avgOrderValue: 8125,
        paymentTerms: "NET 30",
        leadTime: 75,
        industrySegment: "Outdoor & Sports",
        sustainabilityRating: "4",
        complianceLevel: "High"
      }
    ];
    
    // Insert customers
    console.log("Inserting customers...");
    const insertedCustomers = await db.insert(customers).values(sampleCustomers).returning();
    console.log(`Successfully inserted ${insertedCustomers.length} customers`);
    
    // Create customer agents for customers with agents
    const agentData = [
      {
        customerId: insertedCustomers[0].id, // Global Fashion Brands
        agentName: "FashionLink Associates",
        agentEmail: "contact@fashionlink.com",
        agentPhone: "+1-212-555-1212",
        tenantId: tenantId
      },
      {
        customerId: insertedCustomers[2].id, // Nordic Fashion House
        agentName: "Scandinavian Garment Agents",
        agentEmail: "lars@scanagents.com",
        agentPhone: "+46-8-555-4545",
        tenantId: tenantId
      },
      {
        customerId: insertedCustomers[4].id, // Canadian Outdoor Wear
        agentName: "Pacific Rim Trading Co.",
        agentEmail: "david@pacificrim.com",
        agentPhone: "+1-604-555-7878",
        tenantId: tenantId
      }
    ];
    
    console.log("Inserting customer agents...");
    const insertedAgents = await db.insert(customerAgents).values(agentData).returning();
    console.log(`Successfully inserted ${insertedAgents.length} customer agents`);
    
    console.log("✅ Customer data population completed successfully!");
    
  } catch (error) {
    console.error("❌ Error populating customer data:", error);
    throw error;
  }
}

// Run the population script
populateCustomers()
  .then(() => {
    console.log("Customer population script completed");
    process.exit(0);
  })
  .catch(error => {
    console.error("Customer population script failed:", error);
    process.exit(1);
  });

export { populateCustomers };