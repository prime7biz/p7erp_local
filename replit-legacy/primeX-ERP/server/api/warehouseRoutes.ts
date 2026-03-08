import { parseIntParam } from "../utils/parseParams";
import { requireTenant } from "../utils/tenantScope";
import express from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertWarehouseSchema } from "@shared/schema";
import { SequentialIdGenerator } from "../utils/sequentialIdGenerator";

const router = express.Router();

// Get all warehouses
router.get("/", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const warehouses = await storage.getAllWarehouses(tenantId);
    res.json(warehouses);
  } catch (error: any) {
    console.error("Error fetching warehouses:", error);
    res.status(500).json({ message: error.message || "Failed to fetch warehouses" });
  }
});

// Get warehouse by ID
router.get("/:id", async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = requireTenant(req);

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid warehouse ID" });
    }

    const warehouse = await storage.getWarehouseById(id, tenantId);
    
    if (!warehouse) {
      return res.status(404).json({ message: "Warehouse not found" });
    }
    
    res.json(warehouse);
  } catch (error: any) {
    console.error(`Error fetching warehouse with ID ${req.params.id}:`, error);
    res.status(500).json({ message: error.message || "Failed to fetch warehouse" });
  }
});

// Create new warehouse
router.post("/", async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    
    // Generate warehouse ID if not provided
    if (!req.body.warehouseId) {
      req.body.warehouseId = await SequentialIdGenerator.generateWarehouseId(tenantId);
    }
    
    // Validate request body
    const validatedData = insertWarehouseSchema.parse({
      ...req.body,
      tenantId
    });
    
    // Create warehouse
    const newWarehouse = await storage.createWarehouse(validatedData);
    res.status(201).json(newWarehouse);
  } catch (error: any) {
    console.error("Error creating warehouse:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Validation error", errors: error.errors });
    } else {
      res.status(500).json({ message: error.message || "Failed to create warehouse" });
    }
  }
});

// Update warehouse
router.put("/:id", async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = requireTenant(req);

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid warehouse ID" });
    }

    // Validate request body
    const validatedData = insertWarehouseSchema.partial().parse({
      ...req.body,
      tenantId
    });
    
    // Update warehouse
    const updatedWarehouse = await storage.updateWarehouse(id, tenantId, validatedData);
    
    if (!updatedWarehouse) {
      return res.status(404).json({ message: "Warehouse not found" });
    }
    
    res.json(updatedWarehouse);
  } catch (error: any) {
    console.error(`Error updating warehouse with ID ${req.params.id}:`, error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: "Validation error", errors: error.errors });
    } else {
      res.status(500).json({ message: error.message || "Failed to update warehouse" });
    }
  }
});

// Delete warehouse
router.delete("/:id", async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = requireTenant(req);

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid warehouse ID" });
    }

    const deleted = await storage.deleteWarehouse(id, tenantId);
    
    if (!deleted) {
      return res.status(404).json({ message: "Warehouse not found" });
    }
    
    res.json({ message: "Warehouse deleted successfully" });
  } catch (error: any) {
    console.error(`Error deleting warehouse with ID ${req.params.id}:`, error);
    res.status(500).json({ message: error.message || "Failed to delete warehouse" });
  }
});

export default router;