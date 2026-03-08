import { parseIntParam } from "../utils/parseParams";
import { requireTenant } from "../utils/tenantScope";
import express from "express";
import { storage } from "../storage";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { ItemFilters } from "../storage";
import { insertItemSchema } from "@shared/schema";
import { SequentialIdGenerator } from "../utils/sequentialIdGenerator";

const router = express.Router();

// GET /api/items - Get all items with optional filtering
router.get("/", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    
    // Parse query parameters for filtering
    const filters: ItemFilters = {};
    
    if (req.query.categoryId) {
      filters.categoryId = parseInt(req.query.categoryId as string);
    }
    
    if (req.query.subcategoryId) {
      filters.subcategoryId = parseInt(req.query.subcategoryId as string);
    }
    
    if (req.query.type) {
      filters.type = req.query.type as string;
    }
    
    if (req.query.search) {
      filters.searchQuery = req.query.search as string;
    }
    
    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === "true";
    }
    
    if (req.query.hasVariants !== undefined) {
      filters.hasVariants = req.query.hasVariants === "true";
    }
    
    if (req.query.isStockable !== undefined) {
      filters.isStockable = req.query.isStockable === "true";
    }
    
    if (req.query.isServiceItem !== undefined) {
      filters.isServiceItem = req.query.isServiceItem === "true";
    }
    
    if (req.query.isBillOfMaterial !== undefined) {
      filters.isBillOfMaterial = req.query.isBillOfMaterial === "true";
    }
    
    const items = await storage.getAllItems(tenantId, filters);
    res.json(items);
  } catch (error) {
    console.error("Error fetching items:", error);
    res.status(500).json({ message: "Failed to fetch items" });
  }
});

// GET /api/items/:id - Get an item by ID
router.get("/:id", async (req, res) => {
  try {
    const itemId = parseIntParam(req.params.id, "id");
    const tenantId = requireTenant(req);
    
    if (isNaN(itemId)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }
    
    const item = await storage.getItemById(itemId, tenantId);
    
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    res.json(item);
  } catch (error) {
    console.error("Error fetching item:", error);
    res.status(500).json({ message: "Failed to fetch item" });
  }
});

// GET /api/items/code/:itemCode - Get an item by item code
router.get("/code/:itemCode", async (req, res) => {
  try {
    const { itemCode } = req.params;
    const tenantId = requireTenant(req);
    
    if (!itemCode) {
      return res.status(400).json({ message: "Item code is required" });
    }
    
    const item = await storage.getItemByItemCode(itemCode, tenantId);
    
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    res.json(item);
  } catch (error) {
    console.error("Error fetching item by code:", error);
    res.status(500).json({ message: "Failed to fetch item" });
  }
});

// POST /api/items - Create a new item
router.post("/", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    
    // Check if itemCode already exists
    if (req.body.itemCode) {
      const existingItem = await storage.getItemByItemCode(req.body.itemCode, tenantId);
      if (existingItem) {
        return res.status(409).json({ message: "Item with this code already exists" });
      }
    }
    
    // Validate request body (itemCode and tenantId are added after validation)
    const validationResult = insertItemSchema.partial({ itemCode: true, tenantId: true }).safeParse(req.body);
    
    if (!validationResult.success) {
      const validationError = fromZodError(validationResult.error);
      return res.status(400).json({ message: validationError.message });
    }
    
    // Generate a sequential item code if not provided
    if (!validationResult.data.itemCode) {
      validationResult.data.itemCode = await SequentialIdGenerator.generateItemId(tenantId);
    }
    
    // Add tenantId to the item data
    const itemData = {
      ...validationResult.data,
      tenantId
    };
    
    const newItem = await storage.createItem(itemData);
    res.status(201).json(newItem);
  } catch (error) {
    console.error("Error creating item:", error);
    res.status(500).json({ message: "Failed to create item" });
  }
});

// PATCH /api/items/:id - Update an item
router.patch("/:id", async (req, res) => {
  try {
    const itemId = parseIntParam(req.params.id, "id");
    const tenantId = requireTenant(req);
    
    if (isNaN(itemId)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }
    
    // Check if item exists
    const existingItem = await storage.getItemById(itemId, tenantId);
    if (!existingItem) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    // Check if updating itemCode and if it already exists
    if (req.body.itemCode && req.body.itemCode !== existingItem.itemCode) {
      const itemWithCode = await storage.getItemByItemCode(req.body.itemCode, tenantId);
      if (itemWithCode && itemWithCode.id !== itemId) {
        return res.status(409).json({ message: "Item with this code already exists" });
      }
    }
    
    // Update the item
    const updatedItem = await storage.updateItem(itemId, tenantId, req.body);
    res.json(updatedItem);
  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).json({ message: "Failed to update item" });
  }
});

// DELETE /api/items/:id - Delete an item
router.delete("/:id", async (req, res) => {
  try {
    const itemId = parseIntParam(req.params.id, "id");
    const tenantId = requireTenant(req);
    
    if (isNaN(itemId)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }
    
    // Check if item exists
    const existingItem = await storage.getItemById(itemId, tenantId);
    if (!existingItem) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    // Delete the item
    const result = await storage.deleteItem(itemId, tenantId);
    
    if (result) {
      res.status(204).send();
    } else {
      res.status(500).json({ message: "Failed to delete item" });
    }
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).json({ message: "Failed to delete item" });
  }
});

// GET /api/items/:id/variants - Get variants for an item
router.get("/:id/variants", async (req, res) => {
  try {
    const itemId = parseIntParam(req.params.id, "id");
    const tenantId = requireTenant(req);
    
    if (isNaN(itemId)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }
    
    // Get item variants
    const variants = await storage.getItemVariants(itemId, tenantId);
    res.json(variants);
  } catch (error) {
    console.error("Error fetching item variants:", error);
    res.status(500).json({ message: "Failed to fetch item variants" });
  }
});

// GET /api/items/:id/stock - Get stock for an item
router.get("/:id/stock", async (req, res) => {
  try {
    const itemId = parseIntParam(req.params.id, "id");
    const tenantId = requireTenant(req);
    const warehouseId = req.query.warehouseId ? parseInt(req.query.warehouseId as string) : undefined;
    
    if (isNaN(itemId)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }
    
    // Get item stock
    const stock = await storage.getItemStock(itemId, tenantId, warehouseId);
    res.json(stock);
  } catch (error) {
    console.error("Error fetching item stock:", error);
    res.status(500).json({ message: "Failed to fetch item stock" });
  }
});

// GET /api/items/:id/pricing - Get pricing for an item
router.get("/:id/pricing", async (req, res) => {
  try {
    const itemId = parseIntParam(req.params.id, "id");
    const tenantId = requireTenant(req);
    const priceListId = req.query.priceListId ? parseInt(req.query.priceListId as string) : undefined;
    
    if (isNaN(itemId)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }
    
    // Get item pricing
    const pricing = await storage.getItemPricing(itemId, tenantId, priceListId);
    res.json(pricing);
  } catch (error) {
    console.error("Error fetching item pricing:", error);
    res.status(500).json({ message: "Failed to fetch item pricing" });
  }
});

// GET /api/items/:id/bom - Get bill of materials for an item
router.get("/:id/bom", async (req, res) => {
  try {
    const itemId = parseIntParam(req.params.id, "id");
    const tenantId = requireTenant(req);
    const version = req.query.version as string | undefined;
    
    if (isNaN(itemId)) {
      return res.status(400).json({ message: "Invalid item ID" });
    }
    
    // Get bill of materials
    const bom = await storage.getItemBOM(itemId, tenantId, version);
    
    if (!bom) {
      return res.status(404).json({ message: "Bill of materials not found" });
    }
    
    res.json(bom);
  } catch (error) {
    console.error("Error fetching bill of materials:", error);
    res.status(500).json({ message: "Failed to fetch bill of materials" });
  }
});

export default router;