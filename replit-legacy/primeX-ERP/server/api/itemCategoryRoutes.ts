import { requireTenant } from "../utils/tenantScope";
import { Router } from "express";
import { storage } from "../storage";
import { authenticate } from "../middleware/auth";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { insertItemCategorySchema } from "@shared/schema";
import { generateRandomId } from "../utils/idGenerator";
import { SequentialIdGenerator } from "../utils/sequentialIdGenerator";

const router = Router();

// Get all item categories
router.get("/", async (req, res) => {
  try {
    // Use a default tenant ID of 1 for testing if not authenticated
    const tenantId = requireTenant(req);
    
    const categories = await storage.getAllItemCategories(tenantId);
    return res.status(200).json(categories || []);
  } catch (error) {
    console.error("Error fetching item categories:", error);
    return res.status(500).json({ message: "Failed to fetch item categories" });
  }
});

// Get a specific item category by ID
router.get("/:id", async (req, res) => {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ message: "Tenant ID not found" });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const category = await storage.getItemCategoryById(id, req.tenantId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    return res.status(200).json(category);
  } catch (error) {
    console.error(`Error fetching item category with id ${req.params.id}:`, error);
    return res.status(500).json({ message: "Failed to fetch category" });
  }
});

// Create a new item category
router.post("/", async (req, res) => {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ message: "Tenant ID not found" });
    }

    // Use the categoryId from the request if provided, or generate a sequential one
    let categoryId = req.body.categoryId;
    if (!categoryId) {
      // Generate a sequential ID if no categoryId is provided
      categoryId = await SequentialIdGenerator.generateCategoryId(req.tenantId);
    }

    const validatedData = insertItemCategorySchema.parse({
      ...req.body,
      tenantId: requireTenant(req),
      categoryId,
    });

    const newCategory = await storage.createItemCategory(validatedData);
    return res.status(201).json(newCategory);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationError = fromZodError(error);
      return res.status(400).json({ message: validationError.message });
    }
    
    console.error("Error creating item category:", error);
    return res.status(500).json({ message: "Failed to create item category" });
  }
});

// Update an existing item category
router.patch("/:id", async (req, res) => {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ message: "Tenant ID not found" });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    // Check if category exists and belongs to tenant
    const existingCategory = await storage.getItemCategoryById(id, req.tenantId);
    if (!existingCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Allow updating name, description, and isActive fields only
    const { name, description, isActive } = req.body;
    const updateData: any = {};
    
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedCategory = await storage.updateItemCategory(id, req.tenantId, updateData);
    return res.status(200).json(updatedCategory);
  } catch (error) {
    console.error(`Error updating item category with id ${req.params.id}:`, error);
    return res.status(500).json({ message: "Failed to update item category" });
  }
});

// Toggle category status (active/inactive)
router.patch("/:id/toggle-status", async (req, res) => {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ message: "Tenant ID not found" });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "Invalid status value" });
    }

    // Check if category exists and belongs to tenant
    const existingCategory = await storage.getItemCategoryById(id, req.tenantId);
    if (!existingCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    const updatedCategory = await storage.updateItemCategory(id, req.tenantId, { isActive });
    return res.status(200).json(updatedCategory);
  } catch (error) {
    console.error(`Error toggling status for item category with id ${req.params.id}:`, error);
    return res.status(500).json({ message: "Failed to toggle category status" });
  }
});

// Delete an item category
router.delete("/:id", async (req, res) => {
  try {
    if (!req.tenantId) {
      return res.status(401).json({ message: "Tenant ID not found" });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    // Check if category exists and belongs to tenant
    const existingCategory = await storage.getItemCategoryById(id, req.tenantId);
    if (!existingCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    // TODO: Check if category is used by any items before deleting
    // For now, we'll proceed with deletion without checking

    const deleted = await storage.deleteItemCategory(id, req.tenantId);
    if (!deleted) {
      return res.status(500).json({ message: "Failed to delete category" });
    }

    return res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error(`Error deleting item category with id ${req.params.id}:`, error);
    return res.status(500).json({ message: "Failed to delete item category" });
  }
});

export default router;