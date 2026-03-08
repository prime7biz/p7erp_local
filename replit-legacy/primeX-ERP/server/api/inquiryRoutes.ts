import express, { Request, Response } from "express";
import { storage } from "../storage";
import { authenticate } from "../middleware/auth";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { insertInquirySchema } from "@shared/schema";
import { randomUUID } from "crypto";
import { SequentialIdGenerator } from "../utils/sequentialIdGenerator";
import OpenAI from "openai";
import { db } from "../db";

const router = express.Router();

// Authenticate all inquiry routes
router.use(authenticate);

/**
 * Get all inquiries for a tenant
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const inquiries = await storage.getAllInquiries(req.tenantId);
    
    // For each inquiry, add customer name and agent info
    const enrichedInquiries = await Promise.all(
      inquiries.map(async (inquiry) => {
        const customer = await storage.getCustomerById(inquiry.customerId, req.tenantId!);
        const agent = customer ? await storage.getAgentByCustomerId(customer.id) : null;
        
        return {
          ...inquiry,
          customerName: customer?.customerName || "Unknown Customer",
          hasAgent: !!agent,
          agentName: agent?.name || null,
        };
      })
    );
    
    return res.status(200).json(enrichedInquiries);
  } catch (error) {
    console.error("Get inquiries error:", error);
    return res.status(500).json({ message: "Failed to get inquiries" });
  }
});

/**
 * Get a single inquiry by ID
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const inquiryId = Number(req.params.id);
    if (isNaN(inquiryId)) {
      return res.status(400).json({ message: "Invalid inquiry ID" });
    }

    const inquiry = await storage.getInquiryById(inquiryId, req.tenantId);
    if (!inquiry) {
      return res.status(404).json({ message: "Inquiry not found" });
    }

    // Enrich with customer and agent info
    const customer = await storage.getCustomerById(inquiry.customerId, req.tenantId);
    const agent = customer ? await storage.getAgentByCustomerId(customer.id) : null;
    
    let style = null;
    if (inquiry.styleId) {
      try {
        const { getStyleById } = await import("../services/merchandisingService");
        style = await getStyleById(req.tenantId, inquiry.styleId);
      } catch (e) {
        console.error(`Error fetching style ${inquiry.styleId} for inquiry ${inquiryId}:`, e);
      }
    }

    const enrichedInquiry = {
      ...inquiry,
      customerName: customer?.customerName || "Unknown Customer",
      hasAgent: !!agent,
      agentName: agent?.name || null,
      style,
    };

    return res.status(200).json(enrichedInquiry);
  } catch (error) {
    console.error("Get inquiry error:", error);
    return res.status(500).json({ message: "Failed to get inquiry" });
  }
});

/**
 * Create a new inquiry
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Generate a sequential inquiry ID in format INQ-XXXXX
    const inquiryId = await SequentialIdGenerator.generateInquiryId(req.tenantId);

    // Parse and validate the incoming data
    const data = req.body;

    // If styleId is provided, look up the style and set styleName for backward compatibility
    let styleNameFromStyle = data.styleName;
    if (data.styleId && !data.styleName) {
      try {
        const { getStyleById } = await import("../services/merchandisingService");
        const style = await getStyleById(req.tenantId, data.styleId);
        if (style) styleNameFromStyle = style.styleName;
      } catch (e) {
        console.error(`Error fetching style ${data.styleId} for new inquiry:`, e);
      }
    }

    const validatedData = insertInquirySchema.parse({
      ...data,
      styleName: styleNameFromStyle || data.styleName,
      inquiryId,
      tenantId: req.tenantId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Check if the customer exists
    const customer = await storage.getCustomerById(validatedData.customerId, req.tenantId);
    if (!customer) {
      return res.status(400).json({ message: "Customer not found" });
    }

    // Create the inquiry
    const inquiry = await storage.createInquiry(validatedData);

    // Enrich the response with customer and agent info
    const agent = await storage.getAgentByCustomerId(customer.id);
    
    const enrichedInquiry = {
      ...inquiry,
      customerName: customer.customerName,
      hasAgent: !!agent,
      agentName: agent?.name || null,
    };

    return res.status(201).json(enrichedInquiry);
  } catch (error) {
    console.error("Create inquiry error:", error);
    
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    
    return res.status(500).json({ message: "Failed to create inquiry" });
  }
});

/**
 * Update an existing inquiry
 */
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const inquiryId = Number(req.params.id);
    if (isNaN(inquiryId)) {
      return res.status(400).json({ message: "Invalid inquiry ID" });
    }

    // Check if the inquiry exists
    const existingInquiry = await storage.getInquiryById(inquiryId, req.tenantId);
    if (!existingInquiry) {
      return res.status(404).json({ message: "Inquiry not found" });
    }

    // Parse and validate the incoming data
    const data = req.body;
    
    // If styleId is provided, look up the style and set styleName for backward compatibility
    if (data.styleId && !data.styleName) {
      try {
        const { getStyleById } = await import("../services/merchandisingService");
        const style = await getStyleById(req.tenantId, data.styleId);
        if (style) data.styleName = style.styleName;
      } catch (e) {
        console.error(`Error fetching style ${data.styleId} for inquiry update:`, e);
      }
    }

    // Process and clean up the data before updating
    let validatedData = { ...data };
    
    // Format date fields correctly (the database field is a DATE, not TIMESTAMP)
    if (data.projectedDeliveryDate) {
      // Convert any date format to a valid ISO date string (YYYY-MM-DD)
      // This handles both string dates and Date objects
      try {
        const dateObj = new Date(data.projectedDeliveryDate);
        // Format as YYYY-MM-DD for PostgreSQL DATE type
        const isoDate = dateObj.toISOString().split('T')[0];
        validatedData.projectedDeliveryDate = isoDate;
      } catch (err) {
        console.warn("Invalid projectedDeliveryDate format, removing from update:", data.projectedDeliveryDate);
        delete validatedData.projectedDeliveryDate;
      }
    }
    
    // Remove updatedAt - it's handled by the database/storage layer
    delete validatedData.updatedAt;
    
    console.log("Updating inquiry with data:", validatedData);
    
    // Use our direct SQL approach for updating inquiries
    // This completely bypasses the ORM
    let updatedInquiry;
    try {
      // Import our direct update function
      const { updateInquiryDirect } = await import('./directQueries');
      
      console.log("Using direct SQL approach to update inquiry");
      updatedInquiry = await updateInquiryDirect(inquiryId, req.tenantId, validatedData);
      
      if (!updatedInquiry) {
        throw new Error("Inquiry update failed");
      }
    } catch (error) {
      console.error("Error updating inquiry:", error);
      throw error;
    }

    // Enrich the response with customer and agent info
    const customer = await storage.getCustomerById(updatedInquiry.customerId, req.tenantId);
    const agent = customer ? await storage.getAgentByCustomerId(customer.id) : null;
    
    const enrichedInquiry = {
      ...updatedInquiry,
      customerName: customer?.customerName || "Unknown Customer",
      hasAgent: !!agent,
      agentName: agent?.name || null,
    };

    return res.status(200).json(enrichedInquiry);
  } catch (error) {
    console.error("Update inquiry error:", error);
    
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    
    return res.status(500).json({ message: "Failed to update inquiry" });
  }
});

/**
 * Delete an inquiry
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const inquiryId = Number(req.params.id);
    if (isNaN(inquiryId)) {
      return res.status(400).json({ message: "Invalid inquiry ID" });
    }

    // Check if the inquiry exists
    const existingInquiry = await storage.getInquiryById(inquiryId, req.tenantId);
    if (!existingInquiry) {
      return res.status(404).json({ message: "Inquiry not found" });
    }

    // Delete the inquiry
    const result = await storage.deleteInquiry(inquiryId, req.tenantId);
    if (!result) {
      return res.status(500).json({ message: "Failed to delete inquiry" });
    }

    return res.status(200).json({ message: "Inquiry deleted successfully" });
  } catch (error) {
    console.error("Delete inquiry error:", error);
    return res.status(500).json({ message: "Failed to delete inquiry" });
  }
});

/**
 * Update inquiry status (used when converting to quotation)
 */
router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const inquiryId = Number(req.params.id);
    if (isNaN(inquiryId)) {
      return res.status(400).json({ message: "Invalid inquiry ID" });
    }

    // Check if the inquiry exists
    const existingInquiry = await storage.getInquiryById(inquiryId, req.tenantId);
    if (!existingInquiry) {
      return res.status(404).json({ message: "Inquiry not found" });
    }

    // Get status data from request
    const { status, inquiryType } = req.body;
    
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    // Update the inquiry status - don't include updatedAt as it gets handled by the storage layer
    const updatedInquiry = await storage.updateInquiry(inquiryId, req.tenantId, {
      status,
      inquiryType: inquiryType || existingInquiry.inquiryType
    });

    return res.status(200).json({ 
      message: "Inquiry status updated successfully",
      status: updatedInquiry.status,
    });
  } catch (error) {
    console.error("Update inquiry status error:", error);
    return res.status(500).json({ message: "Failed to update inquiry status" });
  }
});

/**
 * Get AI insights for an inquiry
 */
router.get("/:id/insights", async (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const inquiryId = Number(req.params.id);
    if (isNaN(inquiryId)) {
      return res.status(400).json({ message: "Invalid inquiry ID" });
    }

    // Check if the inquiry exists
    const inquiry = await storage.getInquiryById(inquiryId, req.tenantId);
    if (!inquiry) {
      return res.status(404).json({ message: "Inquiry not found" });
    }

    // Get customer info for context
    const customer = await storage.getCustomerById(inquiry.customerId, req.tenantId);

    // Generate AI insights
    const insights = await generateAIInsights(inquiry, customer);
    
    return res.status(200).json(insights);
  } catch (error) {
    console.error("Get AI insights error:", error);
    return res.status(500).json({ message: "Failed to get AI insights" });
  }
});

// Helper function to generate AI insights for an inquiry
async function generateAIInsights(inquiry: any, customer: any) {
  // Check if OpenAI API key is available
  if (!process.env.OPENAI_API_KEY) {
    console.warn("OpenAI API key not found, returning mock insights");
    return generateMockInsights(inquiry);
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const prompt = `
    Please analyze this product inquiry and provide business insights. Respond with JSON only.
    
    Inquiry Details:
    - Product: ${inquiry.styleName}
    - Type: ${inquiry.inquiryType}
    - Department: ${inquiry.department}
    - Projected Quantity: ${inquiry.projectedQuantity}
    - Target Price: ${inquiry.targetPrice}
    - Customer: ${customer?.customerName || 'Unknown'}
    - Projected Delivery Date: ${new Date(inquiry.projectedDeliveryDate).toLocaleDateString()}
    
    Generate recommendations, market trends, production risks, and pricing strategy insights in this JSON format:
    {
      "recommendations": [
        {
          "type": "info|warning|success",
          "title": "Recommendation title",
          "description": "Detailed recommendation",
          "confidence": 0.85 // number between 0-1
        }
      ],
      "marketTrends": {
        "similar": 24, // number of similar products in market
        "averagePrice": 420, // average market price
        "demandTrend": "Increasing/Stable/Decreasing",
        "competitiveAnalysis": "Brief competitive landscape analysis"
      }
    }
    `;

    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error("OpenAI API error:", error);
    return generateMockInsights(inquiry);
  }
}

// Fallback function to generate mock insights if AI is unavailable
function generateMockInsights(inquiry: any) {
  const mockInsights = {
    recommendations: [
      {
        type: "info",
        title: "Consider fabric alternatives",
        description: `Based on similar products, consider exploring alternative fabric options that could reduce costs while maintaining quality standards for ${inquiry.styleName}.`,
        confidence: 0.82
      },
      {
        type: "warning",
        title: "Delivery timeline risk",
        description: "The projected delivery date may be challenging to meet given current supply chain conditions. Consider adding a buffer of 10-15 days.",
        confidence: 0.75
      },
      {
        type: "success",
        title: "Bulk discount opportunity",
        description: `The projected quantity of ${inquiry.projectedQuantity} units qualifies for bulk pricing from several suppliers, potentially improving margins.`,
        confidence: 0.91
      }
    ],
    marketTrends: {
      similar: Math.floor(Math.random() * 30) + 10,
      averagePrice: inquiry.targetPrice * (0.85 + Math.random() * 0.3),
      demandTrend: ["Increasing", "Stable", "Slightly increasing"][Math.floor(Math.random() * 3)],
      competitiveAnalysis: `The ${inquiry.department} market for similar products is moderately competitive with ${Math.floor(Math.random() * 4) + 2} major players. Quality and timely delivery are key differentiators.`
    }
  };

  return mockInsights;
}

export default router;