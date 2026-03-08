// Script to add sample Time & Action Plans to the database
import { db } from '../server/db';
import { timeActionPlans, timeActionMilestones } from '../shared/schema';
import { eq } from 'drizzle-orm';

// Helper function to format dates correctly for database
function formatDate(dateString: string) {
  return new Date(dateString).toISOString();
}

async function main() {
  try {
    console.log("Creating sample Time & Action Plans...");
    
    // Clear existing data to start fresh
    await db.delete(timeActionMilestones);
    console.log("Cleared existing milestones");
    
    await db.delete(timeActionPlans);
    console.log("Cleared existing plans");
    
    // Create three sample plans
    const plans = await db.insert(timeActionPlans).values([
      {
        name: "Summer 2025 Collection - T-shirts",
        tenantId: 1,
        orderId: 1,
        description: "Time & Action plan for the Summer 2025 T-shirt collection using local fabric",
        fabricType: "local",
        startDate: formatDate('2025-03-01'),
        endDate: formatDate('2025-05-15'),
        status: "in-progress",
        totalDays: 75,
        leadTime: "75 days (local fabric standard)",
        responsible: "John Smith",
        createdBy: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: "Winter 2025 Collection - Jackets",
        tenantId: 1,
        orderId: 2,
        description: "Time & Action plan for the Winter 2025 jacket collection using imported fabric",
        fabricType: "imported",
        startDate: formatDate('2025-05-01'),
        endDate: formatDate('2025-08-29'),
        status: "not-started",
        totalDays: 120,
        leadTime: "120 days (imported fabric standard)",
        responsible: "Jane Doe",
        createdBy: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: "Spring 2026 Collection - Pants",
        tenantId: 1,
        orderId: 3,
        description: "Time & Action plan for the Spring 2026 pants collection using local fabric (with some expected delays)",
        fabricType: "local",
        startDate: formatDate('2025-09-01'),
        endDate: formatDate('2025-11-15'),
        status: "delayed",
        totalDays: 75,
        leadTime: "75 days (local fabric standard)",
        responsible: "Robert Johnson",
        createdBy: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]).returning();
    
    console.log(`Created ${plans.length} sample plans`);
    
    // Add milestones for the first plan (Summer Collection - Local Fabric)
    const plan1 = plans[0];
    const startDate1 = new Date(plan1.startDate);
    
    const milestones1 = await db.insert(timeActionMilestones).values([
      {
        planId: plan1.id,
        tenantId: plan1.tenantId,
        milestoneName: "Order Confirmation",
        description: "Confirm order details with client",
        plannedStartDate: formatDate(startDate1.toISOString()),
        plannedEndDate: formatDate(new Date(startDate1.getTime() + (2 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: formatDate(startDate1.toISOString()),
        actualEndDate: formatDate(new Date(startDate1.getTime() + (1 * 24 * 60 * 60 * 1000)).toISOString()),
        status: "completed",
        responsiblePerson: "Sales Manager",
        department: "Sales",
        comments: "All order details confirmed with client",
        dependencies: [],
        priority: "high",
        isCritical: true,
        sortOrder: 1
      },
      {
        planId: plan1.id,
        tenantId: plan1.tenantId,
        milestoneName: "Pattern Development",
        description: "Develop and approve patterns",
        plannedStartDate: formatDate(new Date(startDate1.getTime() + (3 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate1.getTime() + (7 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: formatDate(new Date(startDate1.getTime() + (3 * 24 * 60 * 60 * 1000)).toISOString()),
        actualEndDate: formatDate(new Date(startDate1.getTime() + (8 * 24 * 60 * 60 * 1000)).toISOString()),
        status: "completed",
        responsiblePerson: "Pattern Designer",
        department: "Design",
        comments: "Pattern approved with minor changes",
        dependencies: ["Order Confirmation"],
        priority: "high",
        isCritical: true,
        sortOrder: 2
      },
      {
        planId: plan1.id,
        tenantId: plan1.tenantId,
        milestoneName: "Sample Development",
        description: "Create and approve samples",
        plannedStartDate: formatDate(new Date(startDate1.getTime() + (8 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate1.getTime() + (15 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: formatDate(new Date(startDate1.getTime() + (9 * 24 * 60 * 60 * 1000)).toISOString()),
        actualEndDate: formatDate(new Date(startDate1.getTime() + (16 * 24 * 60 * 60 * 1000)).toISOString()),
        status: "completed",
        responsiblePerson: "Sample Room Supervisor",
        department: "Production",
        comments: "Sample approved after first iteration",
        dependencies: ["Pattern Development"],
        priority: "high",
        isCritical: true,
        sortOrder: 3
      },
      {
        planId: plan1.id,
        tenantId: plan1.tenantId,
        milestoneName: "Fabric Sourcing",
        description: "Source and test fabric samples",
        plannedStartDate: formatDate(new Date(startDate1.getTime() + (5 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate1.getTime() + (20 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: formatDate(new Date(startDate1.getTime() + (5 * 24 * 60 * 60 * 1000)).toISOString()),
        actualEndDate: formatDate(new Date(startDate1.getTime() + (22 * 24 * 60 * 60 * 1000)).toISOString()),
        status: "completed",
        responsiblePerson: "Sourcing Manager",
        department: "Procurement",
        comments: "Local fabric supplier confirmed",
        dependencies: ["Order Confirmation"],
        priority: "high",
        isCritical: true,
        sortOrder: 4
      },
      {
        planId: plan1.id,
        tenantId: plan1.tenantId,
        milestoneName: "Material Procurement",
        description: "Order and receive all required materials",
        plannedStartDate: formatDate(new Date(startDate1.getTime() + (20 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate1.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: formatDate(new Date(startDate1.getTime() + (22 * 24 * 60 * 60 * 1000)).toISOString()),
        actualEndDate: formatDate(new Date(startDate1.getTime() + (33 * 24 * 60 * 60 * 1000)).toISOString()),
        status: "completed",
        responsiblePerson: "Procurement Manager",
        department: "Procurement",
        comments: "All materials received",
        dependencies: ["Fabric Sourcing"],
        priority: "high",
        isCritical: true,
        sortOrder: 5
      },
      {
        planId: plan1.id,
        tenantId: plan1.tenantId,
        milestoneName: "Cutting",
        description: "Cut fabric according to patterns",
        plannedStartDate: formatDate(new Date(startDate1.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate1.getTime() + (35 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: formatDate(new Date(startDate1.getTime() + (33 * 24 * 60 * 60 * 1000)).toISOString()),
        actualEndDate: formatDate(new Date(startDate1.getTime() + (38 * 24 * 60 * 60 * 1000)).toISOString()),
        status: "completed",
        responsiblePerson: "Cutting Department Head",
        department: "Production",
        comments: "",
        dependencies: ["Material Procurement", "Pattern Development"],
        priority: "high",
        isCritical: true,
        sortOrder: 6
      },
      {
        planId: plan1.id,
        tenantId: plan1.tenantId,
        milestoneName: "Sewing",
        description: "Sew garments according to design",
        plannedStartDate: formatDate(new Date(startDate1.getTime() + (35 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate1.getTime() + (50 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: formatDate(new Date(startDate1.getTime() + (38 * 24 * 60 * 60 * 1000)).toISOString()),
        actualEndDate: null,
        status: "in-progress",
        responsiblePerson: "Production Manager",
        department: "Production",
        comments: "70% complete, on track to finish by deadline",
        dependencies: ["Cutting"],
        priority: "high",
        isCritical: true,
        sortOrder: 7
      },
      {
        planId: plan1.id,
        tenantId: plan1.tenantId,
        milestoneName: "Quality Control",
        description: "Inspect garments for quality issues",
        plannedStartDate: formatDate(new Date(startDate1.getTime() + (50 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate1.getTime() + (55 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: null,
        actualEndDate: null,
        status: "pending",
        responsiblePerson: "QC Manager",
        department: "Quality Control",
        comments: "",
        dependencies: ["Sewing"],
        priority: "high",
        isCritical: true,
        sortOrder: 8
      },
      {
        planId: plan1.id,
        tenantId: plan1.tenantId,
        milestoneName: "Finishing",
        description: "Complete finishing operations (pressing, buttons, etc.)",
        plannedStartDate: formatDate(new Date(startDate1.getTime() + (55 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate1.getTime() + (60 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: null,
        actualEndDate: null,
        status: "pending",
        responsiblePerson: "Finishing Department Head",
        department: "Production",
        comments: "",
        dependencies: ["Quality Control"],
        priority: "medium",
        isCritical: false,
        sortOrder: 9
      },
      {
        planId: plan1.id,
        tenantId: plan1.tenantId,
        milestoneName: "Final Inspection",
        description: "Final inspection and approval",
        plannedStartDate: formatDate(new Date(startDate1.getTime() + (60 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate1.getTime() + (65 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: null,
        actualEndDate: null,
        status: "pending",
        responsiblePerson: "Quality Assurance Manager",
        department: "Quality Control",
        comments: "",
        dependencies: ["Finishing"],
        priority: "high",
        isCritical: true,
        sortOrder: 10
      },
      {
        planId: plan1.id,
        tenantId: plan1.tenantId,
        milestoneName: "Packing",
        description: "Pack finished garments for shipping",
        plannedStartDate: formatDate(new Date(startDate1.getTime() + (65 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate1.getTime() + (70 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: null,
        actualEndDate: null,
        status: "pending",
        responsiblePerson: "Packing Supervisor",
        department: "Logistics",
        comments: "",
        dependencies: ["Final Inspection"],
        priority: "medium",
        isCritical: false,
        sortOrder: 11
      },
      {
        planId: plan1.id,
        tenantId: plan1.tenantId,
        milestoneName: "Shipping",
        description: "Ship completed order to client",
        plannedStartDate: formatDate(new Date(startDate1.getTime() + (70 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate1.getTime() + (75 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: null,
        actualEndDate: null,
        status: "pending",
        responsiblePerson: "Logistics Manager",
        department: "Logistics",
        comments: "",
        dependencies: ["Packing"],
        priority: "high",
        isCritical: true,
        sortOrder: 12
      }
    ]).returning();
    
    console.log(`Added ${milestones1.length} milestones to plan 1`);
    
    // Add milestones for the second plan (Winter Collection - Imported Fabric)
    const plan2 = plans[1];
    const startDate2 = new Date(plan2.startDate);
    
    const milestones2 = await db.insert(timeActionMilestones).values([
      {
        planId: plan2.id,
        tenantId: plan2.tenantId,
        milestoneName: "Order Confirmation",
        description: "Confirm order details with client",
        plannedStartDate: formatDate(startDate2.toISOString()),
        plannedEndDate: formatDate(new Date(startDate2.getTime() + (2 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: null,
        actualEndDate: null,
        status: "pending",
        responsiblePerson: "Sales Manager",
        department: "Sales",
        comments: "",
        dependencies: [],
        priority: "high",
        isCritical: true,
        sortOrder: 1
      },
      {
        planId: plan2.id,
        tenantId: plan2.tenantId,
        milestoneName: "Pattern Development",
        description: "Develop and approve patterns",
        plannedStartDate: formatDate(new Date(startDate2.getTime() + (3 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate2.getTime() + (10 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: null,
        actualEndDate: null,
        status: "pending",
        responsiblePerson: "Pattern Designer",
        department: "Design",
        comments: "",
        dependencies: ["Order Confirmation"],
        priority: "high",
        isCritical: true,
        sortOrder: 2
      },
      {
        planId: plan2.id,
        tenantId: plan2.tenantId,
        milestoneName: "International Fabric Sourcing",
        description: "Source fabric from international suppliers",
        plannedStartDate: formatDate(new Date(startDate2.getTime() + (5 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate2.getTime() + (20 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: null,
        actualEndDate: null,
        status: "pending",
        responsiblePerson: "International Sourcing Manager",
        department: "Procurement",
        comments: "",
        dependencies: ["Order Confirmation"],
        priority: "high",
        isCritical: true,
        sortOrder: 3
      },
      {
        planId: plan2.id,
        tenantId: plan2.tenantId,
        milestoneName: "Sample Development",
        description: "Create and approve samples",
        plannedStartDate: formatDate(new Date(startDate2.getTime() + (10 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate2.getTime() + (20 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: null,
        actualEndDate: null,
        status: "pending",
        responsiblePerson: "Sample Room Supervisor",
        department: "Production",
        comments: "",
        dependencies: ["Pattern Development"],
        priority: "high",
        isCritical: true,
        sortOrder: 4
      },
      {
        planId: plan2.id,
        tenantId: plan2.tenantId,
        milestoneName: "Fabric Order Placement",
        description: "Place order for imported fabric",
        plannedStartDate: formatDate(new Date(startDate2.getTime() + (20 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate2.getTime() + (25 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: null,
        actualEndDate: null,
        status: "pending",
        responsiblePerson: "Procurement Manager",
        department: "Procurement",
        comments: "",
        dependencies: ["International Fabric Sourcing", "Sample Development"],
        priority: "high",
        isCritical: true,
        sortOrder: 5
      },
      {
        planId: plan2.id,
        tenantId: plan2.tenantId,
        milestoneName: "Import Documentation",
        description: "Prepare and process import documentation",
        plannedStartDate: formatDate(new Date(startDate2.getTime() + (25 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate2.getTime() + (35 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: null,
        actualEndDate: null,
        status: "pending",
        responsiblePerson: "Import Manager",
        department: "Logistics",
        comments: "",
        dependencies: ["Fabric Order Placement"],
        priority: "high",
        isCritical: true,
        sortOrder: 6
      },
      {
        planId: plan2.id,
        tenantId: plan2.tenantId,
        milestoneName: "Fabric Shipping",
        description: "Ship fabric from international supplier",
        plannedStartDate: formatDate(new Date(startDate2.getTime() + (35 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate2.getTime() + (50 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: null,
        actualEndDate: null,
        status: "pending",
        responsiblePerson: "Logistics Manager",
        department: "Logistics",
        comments: "",
        dependencies: ["Import Documentation"],
        priority: "high",
        isCritical: true,
        sortOrder: 7
      },
      {
        planId: plan2.id,
        tenantId: plan2.tenantId,
        milestoneName: "Fabric Customs Clearance",
        description: "Clear fabric through customs",
        plannedStartDate: formatDate(new Date(startDate2.getTime() + (50 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate2.getTime() + (55 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: null,
        actualEndDate: null,
        status: "pending",
        responsiblePerson: "Customs Clearance Specialist",
        department: "Logistics",
        comments: "",
        dependencies: ["Fabric Shipping"],
        priority: "high",
        isCritical: true,
        sortOrder: 8
      }
    ]).returning();
    
    console.log(`Added ${milestones2.length} milestones to plan 2`);
    
    // Add milestones for the third plan (Spring Collection - Local Fabric with Delay)
    const plan3 = plans[2];
    const startDate3 = new Date(plan3.startDate);
    
    const milestones3 = await db.insert(timeActionMilestones).values([
      {
        planId: plan3.id,
        tenantId: plan3.tenantId,
        milestoneName: "Order Confirmation",
        description: "Confirm order details with client",
        plannedStartDate: formatDate(startDate3.toISOString()),
        plannedEndDate: formatDate(new Date(startDate3.getTime() + (2 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: formatDate(startDate3.toISOString()),
        actualEndDate: formatDate(new Date(startDate3.getTime() + (1 * 24 * 60 * 60 * 1000)).toISOString()),
        status: "completed",
        responsiblePerson: "Sales Manager",
        department: "Sales",
        comments: "All order details confirmed with client",
        dependencies: [],
        priority: "high",
        isCritical: true,
        sortOrder: 1
      },
      {
        planId: plan3.id,
        tenantId: plan3.tenantId,
        milestoneName: "Pattern Development",
        description: "Develop and approve patterns",
        plannedStartDate: formatDate(new Date(startDate3.getTime() + (3 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate3.getTime() + (7 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: formatDate(new Date(startDate3.getTime() + (3 * 24 * 60 * 60 * 1000)).toISOString()),
        actualEndDate: formatDate(new Date(startDate3.getTime() + (9 * 24 * 60 * 60 * 1000)).toISOString()),
        status: "completed",
        responsiblePerson: "Pattern Designer",
        department: "Design",
        comments: "Delayed by 2 days due to revisions requested by client",
        dependencies: ["Order Confirmation"],
        priority: "high",
        isCritical: true,
        sortOrder: 2
      },
      {
        planId: plan3.id,
        tenantId: plan3.tenantId,
        milestoneName: "Sample Development",
        description: "Create and approve samples",
        plannedStartDate: formatDate(new Date(startDate3.getTime() + (8 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate3.getTime() + (15 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: formatDate(new Date(startDate3.getTime() + (10 * 24 * 60 * 60 * 1000)).toISOString()),
        actualEndDate: formatDate(new Date(startDate3.getTime() + (18 * 24 * 60 * 60 * 1000)).toISOString()),
        status: "completed",
        responsiblePerson: "Sample Room Supervisor",
        department: "Production",
        comments: "Samples required multiple revisions",
        dependencies: ["Pattern Development"],
        priority: "high",
        isCritical: true,
        sortOrder: 3
      },
      {
        planId: plan3.id,
        tenantId: plan3.tenantId,
        milestoneName: "Fabric Sourcing",
        description: "Source and test fabric samples",
        plannedStartDate: formatDate(new Date(startDate3.getTime() + (5 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate3.getTime() + (20 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: formatDate(new Date(startDate3.getTime() + (5 * 24 * 60 * 60 * 1000)).toISOString()),
        actualEndDate: formatDate(new Date(startDate3.getTime() + (25 * 24 * 60 * 60 * 1000)).toISOString()),
        status: "completed",
        responsiblePerson: "Sourcing Manager",
        department: "Procurement",
        comments: "Significant delay due to fabric supplier issues",
        dependencies: ["Order Confirmation"],
        priority: "high",
        isCritical: true,
        sortOrder: 4
      },
      {
        planId: plan3.id,
        tenantId: plan3.tenantId,
        milestoneName: "Material Procurement",
        description: "Order and receive all required materials",
        plannedStartDate: formatDate(new Date(startDate3.getTime() + (20 * 24 * 60 * 60 * 1000)).toISOString()),
        plannedEndDate: formatDate(new Date(startDate3.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString()),
        actualStartDate: formatDate(new Date(startDate3.getTime() + (25 * 24 * 60 * 60 * 1000)).toISOString()),
        actualEndDate: null,
        status: "in-progress",
        responsiblePerson: "Procurement Manager",
        department: "Procurement",
        comments: "Delay due to fabric availability",
        dependencies: ["Fabric Sourcing"],
        priority: "high",
        isCritical: true,
        sortOrder: 5
      }
    ]).returning();
    
    console.log(`Added ${milestones3.length} milestones to plan 3`);
    
    console.log("Sample Time & Action Plans created successfully!");
    
  } catch (error) {
    console.error("Error creating sample data:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  });