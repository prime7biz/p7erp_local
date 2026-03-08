import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertItemSubcategorySchema } from "@shared/schema";
import { SequentialIdGenerator } from "../utils/sequentialIdGenerator";

const router = Router();

// Get all subcategories
router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Authentication required" });
    const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string) : undefined;
    
    const subcategories = await storage.getAllItemSubcategories(tenantId, categoryId);
    res.json(subcategories || []);
  } catch (error) {
    console.error("Error fetching item subcategories:", error);
    res.status(500).json({ message: "Failed to fetch item subcategories" });
  }
});

// Get subcategory by ID
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Authentication required" });
    
    const subcategory = await storage.getItemSubcategoryById(id, tenantId);
    if (!subcategory) {
      return res.status(404).json({ message: "Item subcategory not found" });
    }
    
    res.json(subcategory);
  } catch (error) {
    console.error("Error fetching item subcategory:", error);
    res.status(500).json({ message: "Failed to fetch item subcategory" });
  }
});

// Create a new subcategory
router.post("/", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Authentication required" });
    
    // Parse and validate request body
    let subcategoryData = insertItemSubcategorySchema.parse({
      ...req.body,
      tenantId
    });
    
    // Generate a sequential subcategory ID if not provided
    if (!subcategoryData.subcategoryId) {
      subcategoryData.subcategoryId = await SequentialIdGenerator.generateSubcategoryId(tenantId);
    }
    
    const subcategory = await storage.createItemSubcategory(subcategoryData);
    res.status(201).json(subcategory);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.errors 
      });
    }
    
    console.error("Error creating item subcategory:", error);
    res.status(500).json({ message: "Failed to create item subcategory" });
  }
});

// Update a subcategory
router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Authentication required" });
    
    // Partial validation
    const updateData = insertItemSubcategorySchema.partial().parse(req.body);
    
    const subcategory = await storage.updateItemSubcategory(id, tenantId, updateData);
    res.json(subcategory);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Validation error", 
        errors: error.errors 
      });
    }
    
    console.error("Error updating item subcategory:", error);
    res.status(500).json({ message: "Failed to update item subcategory" });
  }
});

// Delete a subcategory
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Authentication required" });
    
    const success = await storage.deleteItemSubcategory(id, tenantId);
    if (!success) {
      return res.status(404).json({ message: "Item subcategory not found" });
    }
    
    res.status(204).end();
  } catch (error) {
    console.error("Error deleting item subcategory:", error);
    res.status(500).json({ message: "Failed to delete item subcategory" });
  }
});

export default router;