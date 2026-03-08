import { parseIntParam } from "../utils/parseParams";
import { requireTenant } from "../utils/tenantScope";
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { inventoryMovements } from '@shared/schema';
import { eq, and, or, desc } from 'drizzle-orm';
import { generateInventoryMovementId } from '../utils/idGenerator';

const router = Router();

// Get all gate passes and delivery challans
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    
    const movements = await db.query.inventoryMovements.findMany({
      where: and(
        eq(inventoryMovements.tenantId, tenantId),
        or(
          eq(inventoryMovements.type, 'gate_pass'),
          eq(inventoryMovements.type, 'delivery_challan')
        )
      ),
      orderBy: [desc(inventoryMovements.createdAt)]
    });
    
    // Process each movement to extract items from additionalData
    const processedMovements = movements.map(movement => {
      const additionalData = movement.additionalData as any || {};
      return {
        id: movement.id,
        transactionId: movement.movementId,
        type: movement.type,
        warehouseId: movement.warehouseId,
        transactionDate: movement.movementDate,
        status: movement.status,
        notes: movement.notes,
        referenceNumber: additionalData.referenceNumber,
        items: additionalData.items || [],
        gatePassNumber: additionalData.gatePassNumber,
        vehicleNumber: additionalData.vehicleNumber,
        driverName: additionalData.driverName,
        contactNumber: additionalData.contactNumber,
        destinationAddress: additionalData.destinationAddress,
        expectedReturnDate: additionalData.expectedReturnDate,
        purpose: additionalData.purpose,
        additionalData,
        createdAt: movement.createdAt,
        updatedAt: movement.updatedAt
      };
    });
    
    res.json(processedMovements);
  } catch (error) {
    console.error('Failed to fetch gate passes:', error);
    res.status(500).json({ error: 'Failed to fetch gate passes' });
  }
});

// Get a specific gate pass by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = requireTenant(req);
    
    const movement = await db.query.inventoryMovements.findFirst({
      where: and(
        eq(inventoryMovements.tenantId, tenantId),
        eq(inventoryMovements.id, parseInt(id)),
        or(
          eq(inventoryMovements.type, 'gate_pass'),
          eq(inventoryMovements.type, 'delivery_challan')
        )
      )
    });
    
    if (!movement) {
      return res.status(404).json({ error: 'Gate pass not found' });
    }
    
    // Process the movement to extract items from additionalData
    const additionalData = movement.additionalData as any || {};
    const processedMovement = {
      id: movement.id,
      transactionId: movement.movementId,
      type: movement.type,
      warehouseId: movement.warehouseId,
      transactionDate: movement.movementDate,
      status: movement.status,
      notes: movement.notes,
      referenceNumber: additionalData.referenceNumber,
      items: additionalData.items || [],
      gatePassNumber: additionalData.gatePassNumber,
      vehicleNumber: additionalData.vehicleNumber,
      driverName: additionalData.driverName,
      contactNumber: additionalData.contactNumber,
      destinationAddress: additionalData.destinationAddress,
      expectedReturnDate: additionalData.expectedReturnDate,
      purpose: additionalData.purpose,
      additionalData,
      createdAt: movement.createdAt,
      updatedAt: movement.updatedAt
    };
    
    res.json(processedMovement);
  } catch (error) {
    console.error('Failed to fetch gate pass:', error);
    res.status(500).json({ error: 'Failed to fetch gate pass' });
  }
});

// Create a new gate pass or delivery challan
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      type,
      warehouseId,
      items,
      gatePassNumber,
      transactionDate,
      notes,
      referenceNumber,
      vehicleNumber,
      driverName,
      contactNumber,
      destinationAddress,
      expectedReturnDate,
      purpose
    } = req.body;
    
    // Get tenant ID from authenticated user
    const tenantId = requireTenant(req);
    
    // Validate required fields
    if (!type || !warehouseId || !items || items.length === 0) {
      return res.status(400).json({ 
        error: 'Missing required fields: type, warehouseId, and items are required' 
      });
    }
    
    // Determine the actual type to use in the database
    const dbType = type === 'delivery_challan' ? 'delivery_challan' : 'gate_pass';
    
    // Generate a unique ID if not provided
    const movementId = gatePassNumber || await generateInventoryMovementId();
    
    // Store additional data specific to gate passes
    const additionalData = {
      items, // Store items in additional data
      referenceNumber,
      gatePassNumber,
      vehicleNumber,
      driverName,
      contactNumber,
      destinationAddress,
      expectedReturnDate,
      purpose
    };
    
    // Create the gate pass record using our schema structure
    const [movement] = await db.insert(inventoryMovements).values({
      tenantId,
      movementId,
      type: dbType,
      warehouseId,
      movementDate: new Date(transactionDate),
      status: 'pending',
      notes,
      additionalData,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();
    
    // Format the response to match our client-side structure
    const processedMovement = {
      id: movement.id,
      transactionId: movement.movementId,
      type: movement.type,
      warehouseId: movement.warehouseId,
      transactionDate: movement.movementDate,
      status: movement.status,
      notes: movement.notes,
      referenceNumber,
      items,
      gatePassNumber,
      vehicleNumber,
      driverName,
      contactNumber,
      destinationAddress,
      expectedReturnDate,
      purpose,
      additionalData: movement.additionalData,
      createdAt: movement.createdAt,
      updatedAt: movement.updatedAt
    };
    
    res.status(201).json(processedMovement);
  } catch (error) {
    console.error('Failed to create gate pass:', error);
    res.status(500).json({ error: 'Failed to create gate pass' });
  }
});

// Update a gate pass
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      warehouseId,
      items,
      transactionDate,
      status,
      notes,
      referenceNumber,
      vehicleNumber,
      driverName,
      contactNumber,
      destinationAddress,
      expectedReturnDate,
      purpose
    } = req.body;
    
    // Get existing record to preserve the type
    const existingMovement = await db.query.inventoryMovements.findFirst({
      where: eq(inventoryMovements.id, parseInt(id))
    });
    
    if (!existingMovement) {
      return res.status(404).json({ error: 'Gate pass not found' });
    }
    
    // Only allow updating gate passes and delivery challans
    if (existingMovement.type !== 'gate_pass' && existingMovement.type !== 'delivery_challan') {
      return res.status(400).json({ error: 'Can only update gate passes and delivery challans' });
    }
    
    // Extract existing items from additionalData
    const existingAdditionalData = existingMovement.additionalData as any || {};
    
    // Update additional data
    const additionalData = {
      ...existingAdditionalData,
      items: items || existingAdditionalData.items || [],
      referenceNumber: referenceNumber || existingAdditionalData.referenceNumber,
      vehicleNumber,
      driverName,
      contactNumber,
      destinationAddress,
      expectedReturnDate,
      purpose
    };
    
    // Update the record
    const [updatedMovement] = await db.update(inventoryMovements)
      .set({
        warehouseId: warehouseId || existingMovement.warehouseId,
        movementDate: transactionDate ? new Date(transactionDate) : existingMovement.movementDate,
        status: status || existingMovement.status,
        notes: notes !== undefined ? notes : existingMovement.notes,
        additionalData,
        updatedAt: new Date()
      })
      .where(eq(inventoryMovements.id, parseInt(id)))
      .returning();
    
    // Format the response to match our client-side structure
    const processedMovement = {
      id: updatedMovement.id,
      transactionId: updatedMovement.movementId,
      type: updatedMovement.type,
      warehouseId: updatedMovement.warehouseId,
      transactionDate: updatedMovement.movementDate,
      status: updatedMovement.status,
      notes: updatedMovement.notes,
      referenceNumber: additionalData.referenceNumber,
      items: additionalData.items || [],
      gatePassNumber: additionalData.gatePassNumber,
      vehicleNumber: additionalData.vehicleNumber,
      driverName: additionalData.driverName,
      contactNumber: additionalData.contactNumber,
      destinationAddress: additionalData.destinationAddress,
      expectedReturnDate: additionalData.expectedReturnDate,
      purpose: additionalData.purpose,
      additionalData: updatedMovement.additionalData,
      createdAt: updatedMovement.createdAt,
      updatedAt: updatedMovement.updatedAt
    };
    
    res.json(processedMovement);
  } catch (error) {
    console.error('Failed to update gate pass:', error);
    res.status(500).json({ error: 'Failed to update gate pass' });
  }
});

// Delete a gate pass
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = requireTenant(req);
    
    // Make sure id is a valid number
    const movementId = parseInt(id);
    if (isNaN(movementId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    
    // Get existing record to ensure it's a gate pass or delivery challan
    const existingMovement = await db.query.inventoryMovements.findFirst({
      where: and(
        eq(inventoryMovements.tenantId, tenantId),
        eq(inventoryMovements.id, movementId),
        or(
          eq(inventoryMovements.type, 'gate_pass'),
          eq(inventoryMovements.type, 'delivery_challan')
        )
      )
    });
    
    if (!existingMovement) {
      return res.status(404).json({ error: 'Gate pass not found' });
    }
    
    // Delete the record
    await db.delete(inventoryMovements)
      .where(eq(inventoryMovements.id, movementId));
    
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete gate pass:', error);
    res.status(500).json({ error: 'Failed to delete gate pass' });
  }
});

export default router;