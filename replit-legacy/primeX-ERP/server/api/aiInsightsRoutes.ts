import { requireTenant } from "../utils/tenantScope";
import express, { Request, Response } from "express";
import { AIService } from "../services/aiService";
import { storage } from "../storage";

const aiService = new AIService();

const router = express.Router();

/**
 * Get AI insights for a specific customer
 */
router.get("/customers/:id", async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    // For demonstration purposes, use tenant ID 1 if not available in request
    // In a real multi-tenant system, this would come from the authenticated user's token
    const tenantId = requireTenant(req);

    if (isNaN(customerId)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    // Get customer from database with agent info
    const customer = await storage.getCustomerById(customerId, tenantId);
    
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    
    // Get agent info if customer has an agent
    let customerWithAgent = customer;
    if (customer.hasAgent) {
      const agent = await storage.getAgentByCustomerId(customer.id);
      if (agent) {
        customerWithAgent = { ...customer, agent };
      }
    }
    
    // Generate insights using AI service
    const insights = await aiService.generateCustomerInsights(customerWithAgent);
    
    return res.json(insights);
  } catch (error: any) {
    console.error("Error getting customer insights:", error);
    return res.status(500).json({ message: error.message || "Failed to get customer insights" });
  }
});

/**
 * Get overall business intelligence insights for customers
 */
router.get("/business-intelligence", async (req: Request, res: Response) => {
  try {
    // For demonstration purposes, use tenant ID 1 if not available in request
    // In a real multi-tenant system, this would come from the authenticated user's token
    const tenantId = requireTenant(req);
    
    // Get all customers
    const customers = await storage.getAllCustomers(tenantId);
    
    // Generate business intelligence using AI service
    const insights = await aiService.generateBusinessIntelligence(customers);
    
    return res.json(insights);
  } catch (error: any) {
    console.error("Error getting business intelligence:", error);
    return res.status(500).json({ message: error.message || "Failed to get business intelligence" });
  }
});

// Import quotation AI insights routes
import quotationInsightsRoutes from './aiInsightsQuotationRoutes';

// Use quotation insights routes
router.use('', quotationInsightsRoutes);

export default router;