import { requireTenant } from "../utils/tenantScope";
import express, { Request, Response } from "express";
import { AIService } from "../services/aiService";
import { storage } from "../storage";

const aiService = new AIService();

const router = express.Router();

/**
 * Get AI insights for a specific quotation
 */
router.get("/quotations/:id", async (req: Request, res: Response) => {
  try {
    const quotationId = parseInt(req.params.id);
    // For demonstration purposes, use tenant ID 1 if not available in request
    // In a real multi-tenant system, this would come from the authenticated user's token
    const tenantId = requireTenant(req);

    if (isNaN(quotationId)) {
      return res.status(400).json({ message: "Invalid quotation ID" });
    }

    // Get quotation from database with all necessary details
    const quotation = await storage.getQuotationById(quotationId, tenantId);
    
    if (!quotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }
    
    // Since we don't have aiInsights property in quotation yet,
    // Return an empty array for now
    const insights = [];
    
    return res.json(insights);
  } catch (error: any) {
    console.error("Error getting quotation insights:", error);
    return res.status(500).json({ message: error.message || "Failed to get quotation insights" });
  }
});

/**
 * Generate new AI insights for a quotation
 */
router.post("/quotations/:id/generate", async (req: Request, res: Response) => {
  try {
    const quotationId = parseInt(req.params.id);
    // For demonstration purposes, use tenant ID 1 if not available in request
    const tenantId = requireTenant(req);

    if (isNaN(quotationId)) {
      return res.status(400).json({ message: "Invalid quotation ID" });
    }

    // Get quotation from database with all necessary details
    const quotation = await storage.getQuotationById(quotationId, tenantId);
    
    if (!quotation) {
      return res.status(404).json({ message: "Quotation not found" });
    }
    
    // Generate insights using AI service - match the method name we created
    const insights = await aiService.generateQuotationInsights(quotation);
    
    // In a real-world implementation, we'd save insights to database
    // For now, return the generated insights directly
    return res.json(insights);
  } catch (error: any) {
    console.error("Error generating quotation insights:", error);
    return res.status(500).json({ message: error.message || "Failed to generate quotation insights" });
  }
});

export default router;