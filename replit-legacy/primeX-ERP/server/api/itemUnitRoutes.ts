import express from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { insertItemUnitSchema } from '@shared/schema';

const router = express.Router();

// GET all item units
router.get('/', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Authentication required" });
    const type = req.query.type as string | undefined;
    
    const units = await storage.getAllItemUnits(tenantId, type);
    res.json(units);
  } catch (error) {
    console.error('Error fetching item units:', error);
    res.status(500).json({ message: 'Failed to fetch item units' });
  }
});

// GET item unit by ID
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Authentication required" });
    
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }
    
    const unit = await storage.getItemUnitById(id, tenantId);
    
    if (!unit) {
      return res.status(404).json({ message: 'Item unit not found' });
    }
    
    res.json(unit);
  } catch (error) {
    console.error('Error fetching item unit:', error);
    res.status(500).json({ message: 'Failed to fetch item unit' });
  }
});

// GET unit by unit code
router.get('/code/:unitCode', async (req, res) => {
  try {
    const unitCode = req.params.unitCode;
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Authentication required" });
    
    const unit = await storage.getItemUnitByUnitCode(unitCode, tenantId);
    
    if (!unit) {
      return res.status(404).json({ message: 'Item unit not found' });
    }
    
    res.json(unit);
  } catch (error) {
    console.error('Error fetching item unit by code:', error);
    res.status(500).json({ message: 'Failed to fetch item unit' });
  }
});

// POST create new item unit
router.post('/', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Authentication required" });

    const validationResult = insertItemUnitSchema.safeParse({ ...req.body, tenantId });
    
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: 'Invalid unit data', 
        errors: validationResult.error.errors 
      });
    }
    
    const unitExists = await storage.getItemUnitByUnitCode(
      validationResult.data.unitCode,
      tenantId
    );
    
    if (unitExists) {
      return res.status(409).json({ 
        message: `Unit with code ${validationResult.data.unitCode} already exists`
      });
    }
    
    const unit = await storage.createItemUnit(validationResult.data);
    res.status(201).json(unit);
  } catch (error) {
    console.error('Error creating item unit:', error);
    res.status(500).json({ message: 'Failed to create item unit' });
  }
});

// PUT update item unit
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Authentication required" });
    
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }
    
    const unit = await storage.getItemUnitById(id, tenantId);
    
    if (!unit) {
      return res.status(404).json({ message: 'Item unit not found' });
    }
    
    // Remove id from the request body if it exists
    const { id: _, ...updateData } = req.body;
    
    const updatedUnit = await storage.updateItemUnit(id, tenantId, updateData);
    res.json(updatedUnit);
  } catch (error) {
    console.error('Error updating item unit:', error);
    res.status(500).json({ message: 'Failed to update item unit' });
  }
});

// DELETE item unit
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Authentication required" });
    
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }
    
    const unit = await storage.getItemUnitById(id, tenantId);
    
    if (!unit) {
      return res.status(404).json({ message: 'Item unit not found' });
    }
    
    const success = await storage.deleteItemUnit(id, tenantId);
    
    if (!success) {
      return res.status(500).json({ message: 'Failed to delete item unit' });
    }
    
    res.json({ message: 'Item unit deleted successfully' });
  } catch (error) {
    console.error('Error deleting item unit:', error);
    res.status(500).json({ message: 'Failed to delete item unit' });
  }
});

export default router;