import { parseIntParam } from "../utils/parseParams";
import { requireTenant } from "../utils/tenantScope";
import express from 'express';
import { db } from '../db';
import { eq, desc, and } from 'drizzle-orm';
import { inventoryMovements, items, warehouses } from '../../shared/schema';
// Import the correct function from idGenerator
import { generateRandomId, generateId } from '../utils/idGenerator';
import { authenticate } from '../middleware/auth';
import { getInventoryOptimizationRecommendations } from '../services/aiRecommendationService';

const router = express.Router();

// Get all inventory movements
router.get('/', async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const movementsList = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.tenantId, tenantId))
      .orderBy(desc(inventoryMovements.createdAt));
    
    res.json(movementsList);
  } catch (error) {
    console.error('Error fetching inventory movements:', error);
    res.status(500).json({ message: 'Failed to fetch inventory movements' });
  }
});

// Get a specific inventory movement by ID
router.get('/:id', async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = requireTenant(req);
    
    const [movement] = await db
      .select()
      .from(inventoryMovements)
      .where(and(
        eq(inventoryMovements.id, id),
        eq(inventoryMovements.tenantId, tenantId)
      ));
    
    if (!movement) {
      return res.status(404).json({ message: 'Inventory movement not found' });
    }
    
    res.json(movement);
  } catch (error) {
    console.error('Error fetching inventory movement:', error);
    res.status(500).json({ message: 'Failed to fetch inventory movement' });
  }
});

// Create a new inventory movement
router.post('/', async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    
    // Generate a unique movement ID with appropriate prefix
    const type = req.body.type;
    let prefix = 'MOV';
    
    switch (type) {
      case 'receive':
        prefix = 'RCV';
        break;
      case 'issue':
        prefix = 'ISS';
        break;
      case 'transfer':
        prefix = 'TRF';
        break;
      case 'processing_send':
        prefix = 'PRS';
        break;
      case 'processing_receive':
        prefix = 'PRR';
        break;
      case 'subcontract_send':
        prefix = 'SCS';
        break;
      case 'subcontract_receive':
        prefix = 'SCR';
        break;
      case 'return':
        prefix = 'RET';
        break;
      case 'adjustment':
        prefix = 'ADJ';
        break;
      case 'manufacturing':
        prefix = 'MFG';
        break;
    }
    
    const movementId = await generateId(prefix, 5);
    
    // Create the inventory movement record
    const [createdMovement] = await db
      .insert(inventoryMovements)
      .values({
        movementId: movementId,
        tenantId: tenantId,
        warehouseId: req.body.warehouseId,
        type: req.body.type,
        sourceType: req.body.sourceDocType,
        sourceId: req.body.sourceDocId,
        description: req.body.notes,
        movementDate: new Date(req.body.transactionDate),
        status: 'draft',
        processedBy: req.user?.id,
        // Store additional data in a structured way
        additionalData: {
          items: req.body.items,
          targetWarehouseId: req.body.targetWarehouseId,
          processingUnitId: req.body.processingUnitId,
          subcontractorId: req.body.subcontractorId,
          vendorId: req.body.vendorId,
          purchaseOrderId: req.body.purchaseOrderId,
          expectedReturnDate: req.body.expectedReturnDate,
          expectedCompletionDate: req.body.expectedCompletionDate,
          referenceNumber: req.body.referenceNumber
        }
      })
      .returning();
    
    // Process the inventory movement based on type
    // This is a simplified version - in a real application this would need
    // complex transaction processing to update stock levels, etc.
    
    res.status(201).json({
      message: 'Inventory movement created successfully',
      movementId: movementId,
      data: createdMovement
    });
  } catch (error) {
    console.error('Error creating inventory movement:', error);
    res.status(500).json({ message: 'Failed to create inventory movement' });
  }
});

// Update an inventory movement status
router.patch('/:id/status', async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = requireTenant(req);
    const { status } = req.body;
    
    if (!['draft', 'approved', 'processed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }
    
    const [updated] = await db
      .update(inventoryMovements)
      .set({ 
        status: status,
        approvedBy: status === 'approved' ? req.user?.id : undefined,
        approvedAt: status === 'approved' ? new Date() : undefined,
        updatedAt: new Date()
      })
      .where(and(
        eq(inventoryMovements.id, id),
        eq(inventoryMovements.tenantId, tenantId)
      ))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ message: 'Inventory movement not found' });
    }
    
    res.json({
      message: 'Inventory movement status updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error updating inventory movement status:', error);
    res.status(500).json({ message: 'Failed to update inventory movement status' });
  }
});

// Generate documents for an inventory movement
router.post('/:id/documents', async (req, res) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    const tenantId = requireTenant(req);
    const { documentType } = req.body;
    
    // Check if the inventory movement exists
    const [movement] = await db
      .select()
      .from(inventoryMovements)
      .where(and(
        eq(inventoryMovements.id, id),
        eq(inventoryMovements.tenantId, tenantId)
      ));
    
    if (!movement) {
      return res.status(404).json({ message: 'Inventory movement not found' });
    }
    
    // In a real application, this would generate a PDF or other document
    // For now, just return a success message
    const documentUrl = `/api/documents/${documentType}-${movement.movementId}.pdf`;
    
    res.json({
      message: 'Document generated successfully',
      documentUrl: documentUrl,
      documentType: documentType
    });
  } catch (error) {
    console.error('Error generating document:', error);
    res.status(500).json({ message: 'Failed to generate document' });
  }
});

// Get AI recommendations for inventory movements
router.get('/recommendations', async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const recommendations = await getInventoryOptimizationRecommendations(tenantId);
    res.json(recommendations);
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({ message: 'Failed to generate recommendations' });
  }
});

export default router;