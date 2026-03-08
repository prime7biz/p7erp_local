import { parseIntParam } from "../utils/parseParams";
import { Router } from "express";
import { storage } from "../storage";
import { authenticate } from "../middleware/auth";
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { timeActionPlans, timeActionMilestones } from "@shared/schema";

const router = Router();

// Schema for Time Action Plan validation
const timeActionPlanSchema = createInsertSchema(timeActionPlans).omit({ id: true, createdAt: true, updatedAt: true });
const updateTimeActionPlanSchema = timeActionPlanSchema.partial();

// Schema for Time Action Milestone validation
const timeActionMilestoneSchema = createInsertSchema(timeActionMilestones).omit({ id: true, createdAt: true, updatedAt: true });
const updateTimeActionMilestoneSchema = timeActionMilestoneSchema.partial();

// Get Time Action Plan for an order
router.get("/orders/:orderId/time-action-plan", authenticate, async (req, res) => {
  try {
    const orderId = parseIntParam(req.params.orderId, "orderId");
    const timeActionPlan = await storage.getTimeActionPlanByOrderId(orderId);
    
    if (timeActionPlan) {
      return res.json(timeActionPlan);
    } else {
      return res.status(404).json({ message: "Time Action Plan not found" });
    }
  } catch (error) {
    console.error("Error fetching Time Action Plan:", error);
    return res.status(500).json({ message: "Failed to fetch Time Action Plan" });
  }
});

// Create Time Action Plan for an order
router.post("/orders/:orderId/time-action-plan", authenticate, async (req, res) => {
  try {
    const orderId = parseIntParam(req.params.orderId, "orderId");
    const tenantId = req.user!.tenantId;
    const createdBy = req.user!.id;
    
    // Validate request body
    const validatedData = timeActionPlanSchema.parse({
      ...req.body,
      orderId,
      tenantId,
      createdBy,
    });
    
    const newTimeActionPlan = await storage.createTimeActionPlan(validatedData);
    return res.status(201).json(newTimeActionPlan);
  } catch (error) {
    console.error("Error creating Time Action Plan:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    return res.status(500).json({ message: "Failed to create Time Action Plan" });
  }
});

// Update Time Action Plan
router.patch("/time-action-plans/:id", authenticate, async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    
    // Validate request body
    const validatedData = updateTimeActionPlanSchema.parse(req.body);
    
    const updatedTimeActionPlan = await storage.updateTimeActionPlan(id, validatedData);
    return res.json(updatedTimeActionPlan);
  } catch (error) {
    console.error(`Error updating Time Action Plan with ID ${req.params.id}:`, error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    return res.status(500).json({ message: "Failed to update Time Action Plan" });
  }
});

// Delete Time Action Plan
router.delete("/time-action-plans/:id", authenticate, async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    
    const result = await storage.deleteTimeActionPlan(id);
    if (result) {
      return res.status(204).send();
    } else {
      return res.status(404).json({ message: "Time Action Plan not found" });
    }
  } catch (error) {
    console.error(`Error deleting Time Action Plan with ID ${req.params.id}:`, error);
    return res.status(500).json({ message: "Failed to delete Time Action Plan" });
  }
});

// Get Milestones for a Time Action Plan
router.get("/time-action-plans/:planId/milestones", authenticate, async (req, res) => {
  try {
    const planId = parseIntParam(req.params.planId, "planId");
    
    const milestones = await storage.getTimeActionMilestones(planId);
    return res.json(milestones);
  } catch (error) {
    console.error(`Error fetching milestones for plan ID ${req.params.planId}:`, error);
    return res.status(500).json({ message: "Failed to fetch milestones" });
  }
});

// Create Milestone for a Time Action Plan
router.post("/time-action-plans/:planId/milestones", authenticate, async (req, res) => {
  try {
    const planId = parseIntParam(req.params.planId, "planId");
    const tenantId = req.user!.tenantId;
    
    // Validate request body
    const validatedData = timeActionMilestoneSchema.parse({
      ...req.body,
      planId,
      tenantId,
    });
    
    const newMilestone = await storage.createTimeActionMilestone(validatedData);
    return res.status(201).json(newMilestone);
  } catch (error) {
    console.error("Error creating milestone:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    return res.status(500).json({ message: "Failed to create milestone" });
  }
});

// Update Milestone
router.patch("/time-action-milestones/:id", authenticate, async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    
    // Validate request body
    const validatedData = updateTimeActionMilestoneSchema.parse(req.body);
    
    const updatedMilestone = await storage.updateTimeActionMilestone(id, validatedData);
    return res.json(updatedMilestone);
  } catch (error) {
    console.error(`Error updating milestone with ID ${req.params.id}:`, error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    return res.status(500).json({ message: "Failed to update milestone" });
  }
});

// Delete Milestone
router.delete("/time-action-milestones/:id", authenticate, async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    
    const result = await storage.deleteTimeActionMilestone(id);
    if (result) {
      return res.status(204).send();
    } else {
      return res.status(404).json({ message: "Milestone not found" });
    }
  } catch (error) {
    console.error(`Error deleting milestone with ID ${req.params.id}:`, error);
    return res.status(500).json({ message: "Failed to delete milestone" });
  }
});

// Special AI integration: Auto-generate milestone recommendations
router.post("/time-action-plans/:orderId/ai-recommend", authenticate, async (req, res) => {
  try {
    const orderId = parseIntParam(req.params.orderId, "orderId");
    
    // Get the order details to understand product type, quantity, and complexity
    const order = await storage.getOrderById(orderId, req.user!.tenantId);
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    // AI-based milestone generation would happen here (simplified implementation)
    // In a real implementation, this would use OpenAI or another AI service
    const productType = order.styleName;
    const quantity = order.quantity;
    
    // Create a base template of milestones
    const recommendedMilestones = generateAIRecommendedMilestones(productType, quantity, order.startDate, order.deliveryDate);
    
    return res.json({
      recommendations: recommendedMilestones,
      metadata: {
        productAnalysis: {
          complexity: estimateComplexity(productType),
          leadTimeEstimate: estimateLeadTime(productType, quantity),
          riskFactors: identifyRiskFactors(productType, quantity),
        }
      }
    });
  } catch (error) {
    console.error("Error generating AI recommendations:", error);
    return res.status(500).json({ message: "Failed to generate recommendations" });
  }
});

// Helper function to generate AI recommendations (simplified)
function generateAIRecommendedMilestones(
  productType: string,
  quantity: number,
  startDate: Date,
  deliveryDate: Date
) {
  // Calculate total days
  const totalDays = Math.floor((deliveryDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Base milestones for garment production
  const baseMilestones = [
    { name: "Pre-Production Meeting", durationDays: 1, criticalPath: true },
    { name: "Fabric Sourcing", durationDays: Math.ceil(totalDays * 0.15), criticalPath: true },
    { name: "Fabric Testing & Approval", durationDays: Math.ceil(totalDays * 0.05), criticalPath: true },
    { name: "Pattern Making", durationDays: Math.ceil(totalDays * 0.1), criticalPath: true },
    { name: "Sample Development", durationDays: Math.ceil(totalDays * 0.1), criticalPath: true },
    { name: "Sample Approval", durationDays: Math.ceil(totalDays * 0.05), criticalPath: true },
    { name: "Bulk Fabric Receipt", durationDays: Math.ceil(totalDays * 0.2), criticalPath: true },
    { name: "Cutting", durationDays: Math.ceil(totalDays * 0.05), criticalPath: true },
    { name: "Sewing", durationDays: Math.ceil(totalDays * 0.15), criticalPath: true },
    { name: "Finishing & Packing", durationDays: Math.ceil(totalDays * 0.1), criticalPath: true },
    { name: "Quality Control & Inspection", durationDays: Math.ceil(totalDays * 0.03), criticalPath: true },
    { name: "Shipping Preparation", durationDays: Math.ceil(totalDays * 0.02), criticalPath: true }
  ];
  
  // Adjust based on product type (simplified)
  let adjustedMilestones = [...baseMilestones];
  
  if (productType.toLowerCase().includes("knit")) {
    // Add knit-specific milestones
    adjustedMilestones.push({ name: "Yarn Dyeing", durationDays: Math.ceil(totalDays * 0.1), criticalPath: true });
  }
  
  if (productType.toLowerCase().includes("denim")) {
    // Add denim-specific milestones
    adjustedMilestones.push({ name: "Washing Development", durationDays: Math.ceil(totalDays * 0.1), criticalPath: true });
    adjustedMilestones.push({ name: "Washing Process", durationDays: Math.ceil(totalDays * 0.1), criticalPath: true });
  }
  
  // Adjust based on quantity (simplified)
  if (quantity > 10000) {
    // For large orders, increase certain durations
    adjustedMilestones = adjustedMilestones.map(m => {
      if (m.name === "Cutting" || m.name === "Sewing" || m.name === "Finishing & Packing") {
        return { ...m, durationDays: Math.ceil(m.durationDays * 1.2) };
      }
      return m;
    });
  }
  
  // Calculate actual dates based on start date and durations
  let currentDate = new Date(startDate);
  const scheduledMilestones = adjustedMilestones.map(milestone => {
    const plannedStartDate = new Date(currentDate);
    
    // Add duration days to current date
    currentDate.setDate(currentDate.getDate() + milestone.durationDays);
    const plannedEndDate = new Date(currentDate);
    
    return {
      milestoneName: milestone.name,
      description: `${milestone.name} for ${productType}`,
      plannedStartDate: plannedStartDate.toISOString().split('T')[0],
      plannedEndDate: plannedEndDate.toISOString().split('T')[0],
      isCritical: milestone.criticalPath,
      priority: milestone.criticalPath ? "high" : "medium",
      department: getDepartmentForMilestone(milestone.name),
      status: "pending"
    };
  });
  
  return scheduledMilestones;
}

// Helper function to determine department based on milestone
function getDepartmentForMilestone(milestoneName: string): string {
  const departmentMap: Record<string, string> = {
    "Pre-Production Meeting": "Production Planning",
    "Fabric Sourcing": "Procurement",
    "Fabric Testing & Approval": "Quality Control",
    "Pattern Making": "Technical Design",
    "Sample Development": "Sample Room",
    "Sample Approval": "Design",
    "Bulk Fabric Receipt": "Warehouse",
    "Cutting": "Production",
    "Sewing": "Production",
    "Finishing & Packing": "Production",
    "Quality Control & Inspection": "Quality Control",
    "Shipping Preparation": "Logistics",
    "Yarn Dyeing": "Dyeing",
    "Washing Development": "Washing",
    "Washing Process": "Washing"
  };
  
  return departmentMap[milestoneName] || "Production";
}

// Helper function to estimate complexity based on product type
function estimateComplexity(productType: string): string {
  if (productType.toLowerCase().includes("jacket") || 
      productType.toLowerCase().includes("coat") || 
      productType.toLowerCase().includes("suit")) {
    return "high";
  } else if (productType.toLowerCase().includes("denim") || 
             productType.toLowerCase().includes("shirt") || 
             productType.toLowerCase().includes("blouse")) {
    return "medium";
  } else {
    return "low";
  }
}

// Helper function to estimate lead time based on product and quantity
function estimateLeadTime(productType: string, quantity: number): number {
  // Base lead time in days
  let baseLeadTime = 45;
  
  // Adjust for product complexity
  if (estimateComplexity(productType) === "high") {
    baseLeadTime += 15;
  } else if (estimateComplexity(productType) === "medium") {
    baseLeadTime += 7;
  }
  
  // Adjust for quantity
  if (quantity > 10000) {
    baseLeadTime += 15;
  } else if (quantity > 5000) {
    baseLeadTime += 7;
  }
  
  return baseLeadTime;
}

// Helper function to identify risk factors
function identifyRiskFactors(productType: string, quantity: number): string[] {
  const risks: string[] = [];
  
  // Product-specific risks
  if (estimateComplexity(productType) === "high") {
    risks.push("Complex construction may lead to production delays");
  }
  
  if (productType.toLowerCase().includes("denim")) {
    risks.push("Washing process may introduce quality variations");
  }
  
  // Quantity-specific risks
  if (quantity > 10000) {
    risks.push("Large order volume increases risk of production bottlenecks");
    risks.push("Material procurement may face delays due to high quantity requirements");
  }
  
  // Add common risks
  risks.push("Fabric delivery delays from suppliers");
  risks.push("Potential quality issues during bulk production");
  
  return risks;
}

export default router;