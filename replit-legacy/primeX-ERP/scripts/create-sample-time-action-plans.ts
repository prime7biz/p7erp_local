// Script to create sample Time & Action Plans with milestones
import { db } from '../server/db';
import { timeActionPlans, timeActionMilestones } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function clearExistingData() {
  try {
    // Clear existing milestones
    await db.delete(timeActionMilestones);
    console.log('Existing milestones cleared');
    
    // Clear existing plans
    await db.delete(timeActionPlans);
    console.log('Existing plans cleared');
  } catch (error) {
    console.error('Error clearing existing data:', error);
  }
}

async function createSamplePlans() {
  try {
    // Create three sample T&A Plans
    const plans = [
      // Plan 1: Summer Collection - Local Fabric
      {
        orderId: 7, // Using an existing order ID
        tenantId: 1,
        name: "Summer 2025 Collection - T-shirts",
        description: "Time & Action plan for the Summer 2025 T-shirt collection using local fabric",
        fabricType: "local",
        startDate: '2025-03-01',
        endDate: '2025-05-15',
        status: "in-progress",
        totalDays: 75,
        leadTime: "75 days (local fabric standard)",
        responsible: "John Smith",
        createdBy: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      // Plan 2: Winter Collection - Imported Fabric
      {
        orderId: 8, // Using an existing order ID
        tenantId: 1,
        name: "Winter 2025 Collection - Jackets",
        description: "Time & Action plan for the Winter 2025 jacket collection using imported fabric",
        fabricType: "imported",
        startDate: '2025-05-01',
        endDate: '2025-08-29',
        status: "not-started",
        totalDays: 120,
        leadTime: "120 days (imported fabric standard)",
        responsible: "Jane Doe",
        createdBy: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      // Plan 3: Spring Collection - Local Fabric with Delay
      {
        orderId: 9, // Using an existing order ID
        tenantId: 1,
        name: "Spring 2026 Collection - Pants",
        description: "Time & Action plan for the Spring 2026 pants collection using local fabric (with some expected delays)",
        fabricType: "local",
        startDate: '2025-09-01',
        endDate: '2025-11-15',
        status: "delayed",
        totalDays: 75,
        leadTime: "75 days (local fabric standard)",
        responsible: "Robert Johnson",
        createdBy: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    
    // Insert plans
    const insertedPlans = await db.insert(timeActionPlans).values(plans).returning();
    console.log('Sample plans created:', insertedPlans.length);
    
    return insertedPlans;
  } catch (error) {
    console.error('Error creating sample plans:', error);
    return [];
  }
}

async function createMilestonesForPlan(plan) {
  try {
    // Define standard milestones based on fabric type
    const milestones = plan.fabricType === 'local' 
      ? getLocalFabricMilestones(plan) 
      : getImportedFabricMilestones(plan);
    
    // Insert milestones
    const insertedMilestones = await db.insert(timeActionMilestones).values(milestones).returning();
    console.log(`Created ${insertedMilestones.length} milestones for plan: ${plan.name}`);
  } catch (error) {
    console.error(`Error creating milestones for plan ${plan.id}:`, error);
  }
}

function getLocalFabricMilestones(plan) {
  const startDate = new Date(plan.startDate);
  const endDate = new Date(plan.endDate);
  
  // Create different statuses based on plan status
  let completedCount = 0;
  let inProgressCount = 0;
  
  if (plan.status === 'in-progress') {
    completedCount = 6; // First 6 milestones are complete
    inProgressCount = 2; // Next 2 are in progress
  } else if (plan.status === 'delayed') {
    completedCount = 4; // Only first 4 complete
    inProgressCount = 1; // 1 in progress
  }
  
  const milestones = [
    // Pre-production phase
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Order Confirmation",
      description: "Confirm order details with client",
      plannedStartDate: new Date(startDate.getTime()).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (2 * 24 * 60 * 60 * 1000)).toISOString(), // 2 days
      actualStartDate: completedCount >= 1 ? new Date(startDate.getTime()).toISOString() : null,
      actualEndDate: completedCount >= 1 ? new Date(startDate.getTime() + (1 * 24 * 60 * 60 * 1000)).toISOString() : null,
      status: completedCount >= 1 ? "completed" : "pending",
      responsiblePerson: "Sales Manager",
      department: "Sales",
      comments: "All order details confirmed with client",
      dependencies: [],
      priority: "high",
      isCritical: true,
      sortOrder: 1
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Pattern Development",
      description: "Develop and approve patterns",
      plannedStartDate: new Date(startDate.getTime() + (3 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (7 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: completedCount >= 2 ? new Date(startDate.getTime() + (3 * 24 * 60 * 60 * 1000)).toISOString() : null,
      actualEndDate: completedCount >= 2 ? new Date(startDate.getTime() + (8 * 24 * 60 * 60 * 1000)).toISOString() : null, // 1 day delay
      status: completedCount >= 2 ? "completed" : "pending",
      responsiblePerson: "Pattern Designer",
      department: "Design",
      comments: completedCount >= 2 ? "Pattern approved with minor changes" : "",
      dependencies: ["Order Confirmation"],
      priority: "high",
      isCritical: true,
      sortOrder: 2
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Sample Development",
      description: "Create and approve samples",
      plannedStartDate: new Date(startDate.getTime() + (8 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (15 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: completedCount >= 3 ? new Date(startDate.getTime() + (9 * 24 * 60 * 60 * 1000)).toISOString() : null,
      actualEndDate: completedCount >= 3 ? new Date(startDate.getTime() + (16 * 24 * 60 * 60 * 1000)).toISOString() : null,
      status: completedCount >= 3 ? "completed" : "pending",
      responsiblePerson: "Sample Room Supervisor",
      department: "Production",
      comments: "Sample approved after first iteration",
      dependencies: ["Pattern Development"],
      priority: "high",
      isCritical: true,
      sortOrder: 3
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Fabric Sourcing",
      description: "Source and test fabric samples",
      plannedStartDate: new Date(startDate.getTime() + (5 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (20 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: completedCount >= 4 ? new Date(startDate.getTime() + (5 * 24 * 60 * 60 * 1000)).toISOString() : null,
      actualEndDate: completedCount >= 4 ? new Date(startDate.getTime() + (22 * 24 * 60 * 60 * 1000)).toISOString() : null,
      status: completedCount >= 4 ? "completed" : "pending",
      responsiblePerson: "Sourcing Manager",
      department: "Procurement",
      comments: "Local fabric supplier confirmed",
      dependencies: ["Order Confirmation"],
      priority: "high",
      isCritical: true,
      sortOrder: 4
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Material Procurement",
      description: "Order and receive all required materials",
      plannedStartDate: new Date(startDate.getTime() + (20 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: completedCount >= 5 ? new Date(startDate.getTime() + (22 * 24 * 60 * 60 * 1000)).toISOString() : null,
      actualEndDate: completedCount >= 5 ? new Date(startDate.getTime() + (33 * 24 * 60 * 60 * 1000)).toISOString() : null,
      status: completedCount >= 5 ? "completed" : "pending",
      responsiblePerson: "Procurement Manager",
      department: "Procurement",
      comments: plan.status === 'delayed' ? "Delay due to fabric availability" : "All materials received",
      dependencies: ["Fabric Sourcing"],
      priority: "high",
      isCritical: true,
      sortOrder: 5
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Cutting",
      description: "Cut fabric according to patterns",
      plannedStartDate: new Date(startDate.getTime() + (30 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (35 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: completedCount >= 6 ? new Date(startDate.getTime() + (33 * 24 * 60 * 60 * 1000)).toISOString() : null,
      actualEndDate: completedCount >= 6 ? new Date(startDate.getTime() + (38 * 24 * 60 * 60 * 1000)).toISOString() : null,
      status: completedCount >= 6 ? "completed" : (inProgressCount >= 1 && completedCount < 6 ? "in-progress" : "pending"),
      responsiblePerson: "Cutting Department Head",
      department: "Production",
      comments: "",
      dependencies: ["Material Procurement", "Pattern Development"],
      priority: "high",
      isCritical: true,
      sortOrder: 6
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Sewing",
      description: "Sew garments according to design",
      plannedStartDate: new Date(startDate.getTime() + (35 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (50 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: completedCount >= 7 ? new Date(startDate.getTime() + (38 * 24 * 60 * 60 * 1000)).toISOString() : (inProgressCount >= 2 && completedCount < 7 ? new Date(startDate.getTime() + (38 * 24 * 60 * 60 * 1000)).toISOString() : null),
      actualEndDate: completedCount >= 7 ? new Date(startDate.getTime() + (53 * 24 * 60 * 60 * 1000)).toISOString() : null,
      status: completedCount >= 7 ? "completed" : (inProgressCount >= 2 && completedCount < 7 ? "in-progress" : "pending"),
      responsiblePerson: "Production Manager",
      department: "Production",
      comments: "",
      dependencies: ["Cutting"],
      priority: "high",
      isCritical: true,
      sortOrder: 7
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Quality Control",
      description: "Inspect garments for quality issues",
      plannedStartDate: new Date(startDate.getTime() + (50 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (55 * 24 * 60 * 60 * 1000)).toISOString(),
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
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Finishing",
      description: "Complete finishing operations (pressing, buttons, etc.)",
      plannedStartDate: new Date(startDate.getTime() + (55 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (60 * 24 * 60 * 60 * 1000)).toISOString(),
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
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Final Inspection",
      description: "Final inspection and approval",
      plannedStartDate: new Date(startDate.getTime() + (60 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (65 * 24 * 60 * 60 * 1000)).toISOString(),
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
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Packing",
      description: "Pack finished garments for shipping",
      plannedStartDate: new Date(startDate.getTime() + (65 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (70 * 24 * 60 * 60 * 1000)).toISOString(),
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
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Shipping",
      description: "Ship completed order to client",
      plannedStartDate: new Date(startDate.getTime() + (70 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (75 * 24 * 60 * 60 * 1000)).toISOString(),
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
  ];
  
  return milestones;
}

function getImportedFabricMilestones(plan) {
  const startDate = new Date(plan.startDate);
  const endDate = new Date(plan.endDate);
  
  // For imported fabric, we'll have additional milestones related to import
  const milestones = [
    // Pre-production phase
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Order Confirmation",
      description: "Confirm order details with client",
      plannedStartDate: new Date(startDate.getTime()).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (2 * 24 * 60 * 60 * 1000)).toISOString(), // 2 days
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
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Pattern Development",
      description: "Develop and approve patterns",
      plannedStartDate: new Date(startDate.getTime() + (3 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (10 * 24 * 60 * 60 * 1000)).toISOString(),
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
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "International Fabric Sourcing",
      description: "Source fabric from international suppliers",
      plannedStartDate: new Date(startDate.getTime() + (5 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (20 * 24 * 60 * 60 * 1000)).toISOString(),
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
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Sample Development",
      description: "Create and approve samples",
      plannedStartDate: new Date(startDate.getTime() + (10 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (20 * 24 * 60 * 60 * 1000)).toISOString(),
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
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Fabric Order Placement",
      description: "Place order for imported fabric",
      plannedStartDate: new Date(startDate.getTime() + (20 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (25 * 24 * 60 * 60 * 1000)).toISOString(),
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
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Import Documentation",
      description: "Prepare and process import documentation",
      plannedStartDate: new Date(startDate.getTime() + (25 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (35 * 24 * 60 * 60 * 1000)).toISOString(),
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
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Fabric Shipping",
      description: "Ship fabric from international supplier",
      plannedStartDate: new Date(startDate.getTime() + (35 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (50 * 24 * 60 * 60 * 1000)).toISOString(),
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
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Fabric Customs Clearance",
      description: "Clear fabric through customs",
      plannedStartDate: new Date(startDate.getTime() + (50 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (55 * 24 * 60 * 60 * 1000)).toISOString(),
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
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Fabric Receipt & Testing",
      description: "Receive and test imported fabric",
      plannedStartDate: new Date(startDate.getTime() + (55 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (60 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: null,
      actualEndDate: null,
      status: "pending",
      responsiblePerson: "Quality Control Manager",
      department: "Quality Control",
      comments: "",
      dependencies: ["Fabric Customs Clearance"],
      priority: "high",
      isCritical: true,
      sortOrder: 9
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Accessory Procurement",
      description: "Order and receive all accessories",
      plannedStartDate: new Date(startDate.getTime() + (25 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (60 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: null,
      actualEndDate: null,
      status: "pending",
      responsiblePerson: "Procurement Manager",
      department: "Procurement",
      comments: "",
      dependencies: ["Sample Development"],
      priority: "medium",
      isCritical: false,
      sortOrder: 10
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Cutting",
      description: "Cut fabric according to patterns",
      plannedStartDate: new Date(startDate.getTime() + (60 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (70 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: null,
      actualEndDate: null,
      status: "pending",
      responsiblePerson: "Cutting Department Head",
      department: "Production",
      comments: "",
      dependencies: ["Fabric Receipt & Testing", "Accessory Procurement"],
      priority: "high",
      isCritical: true,
      sortOrder: 11
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Sewing",
      description: "Sew garments according to design",
      plannedStartDate: new Date(startDate.getTime() + (70 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (90 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: null,
      actualEndDate: null,
      status: "pending",
      responsiblePerson: "Production Manager",
      department: "Production",
      comments: "",
      dependencies: ["Cutting"],
      priority: "high",
      isCritical: true,
      sortOrder: 12
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Quality Control",
      description: "Inspect garments for quality issues",
      plannedStartDate: new Date(startDate.getTime() + (90 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (95 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: null,
      actualEndDate: null,
      status: "pending",
      responsiblePerson: "QC Manager",
      department: "Quality Control",
      comments: "",
      dependencies: ["Sewing"],
      priority: "high",
      isCritical: true,
      sortOrder: 13
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Finishing",
      description: "Complete finishing operations (pressing, buttons, etc.)",
      plannedStartDate: new Date(startDate.getTime() + (95 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (105 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: null,
      actualEndDate: null,
      status: "pending",
      responsiblePerson: "Finishing Department Head",
      department: "Production",
      comments: "",
      dependencies: ["Quality Control"],
      priority: "medium",
      isCritical: false,
      sortOrder: 14
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Final Inspection",
      description: "Final inspection and approval",
      plannedStartDate: new Date(startDate.getTime() + (105 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (110 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: null,
      actualEndDate: null,
      status: "pending",
      responsiblePerson: "Quality Assurance Manager",
      department: "Quality Control",
      comments: "",
      dependencies: ["Finishing"],
      priority: "high",
      isCritical: true,
      sortOrder: 15
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Packing",
      description: "Pack finished garments for shipping",
      plannedStartDate: new Date(startDate.getTime() + (110 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (115 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: null,
      actualEndDate: null,
      status: "pending",
      responsiblePerson: "Packing Supervisor",
      department: "Logistics",
      comments: "",
      dependencies: ["Final Inspection"],
      priority: "medium",
      isCritical: false,
      sortOrder: 16
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Export Documentation",
      description: "Prepare export documentation",
      plannedStartDate: new Date(startDate.getTime() + (110 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (115 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: null,
      actualEndDate: null,
      status: "pending",
      responsiblePerson: "Export Manager",
      department: "Logistics",
      comments: "",
      dependencies: ["Final Inspection"],
      priority: "medium",
      isCritical: false,
      sortOrder: 17
    },
    {
      planId: plan.id,
      tenantId: plan.tenantId,
      milestoneName: "Shipping",
      description: "Ship completed order to client",
      plannedStartDate: new Date(startDate.getTime() + (115 * 24 * 60 * 60 * 1000)).toISOString(),
      plannedEndDate: new Date(startDate.getTime() + (120 * 24 * 60 * 60 * 1000)).toISOString(),
      actualStartDate: null,
      actualEndDate: null,
      status: "pending",
      responsiblePerson: "Logistics Manager",
      department: "Logistics",
      comments: "",
      dependencies: ["Packing", "Export Documentation"],
      priority: "high",
      isCritical: true,
      sortOrder: 18
    }
  ];
  
  return milestones;
}

async function run() {
  try {
    await clearExistingData();
    const plans = await createSamplePlans();
    
    for (const plan of plans) {
      await createMilestonesForPlan(plan);
    }
    
    console.log('Sample Time & Action Plans and milestones created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating sample data:', error);
    process.exit(1);
  }
}

run();