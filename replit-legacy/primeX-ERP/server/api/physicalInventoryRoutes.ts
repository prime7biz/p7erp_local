import { parseIntParam } from "../utils/parseParams";
import { requireTenant } from "../utils/tenantScope";
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { and, eq, desc, sql } from 'drizzle-orm';
import { 
  inventoryMovements, 
  items, 
  warehouses, 
  itemStock, 
  itemVariants
} from '@shared/schema';
import { generateInventoryMovementId } from '../utils/idGenerator';
import { AIService } from '../services/aiService';

const router = Router();

// Get physical inventory count records
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    
    // Get all physical inventory count movements
    const movements = await db.query.inventoryMovements.findMany({
      where: and(
        eq(inventoryMovements.tenantId, tenantId),
        eq(inventoryMovements.type, 'physical_count')
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
        items: additionalData.items || [],
        countedBy: additionalData.countedBy || 'Unknown',
        verifiedBy: additionalData.verifiedBy,
        countMethod: additionalData.countMethod || 'manual',
        discrepancyValue: additionalData.discrepancyValue,
        additionalData: movement.additionalData,
        createdAt: movement.createdAt,
        updatedAt: movement.updatedAt
      };
    });
    
    res.json(processedMovements);
  } catch (error) {
    console.error('Error fetching physical inventory records:', error);
    res.status(500).json({ message: 'Failed to fetch physical inventory records' });
  }
});

// Get a specific physical inventory count by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = requireTenant(req);
    
    // Make sure id is a valid number
    const movementId = parseInt(id);
    if (isNaN(movementId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    
    // Get the inventory movement
    const movement = await db.query.inventoryMovements.findFirst({
      where: and(
        eq(inventoryMovements.id, movementId),
        eq(inventoryMovements.tenantId, tenantId),
        eq(inventoryMovements.type, 'physical_count')
      )
    });
    
    if (!movement) {
      return res.status(404).json({ error: 'Physical inventory record not found' });
    }
    
    // Process the record for response
    const additionalData = movement.additionalData as any || {};
    const processedMovement = {
      id: movement.id,
      transactionId: movement.movementId,
      type: movement.type,
      warehouseId: movement.warehouseId,
      transactionDate: movement.movementDate,
      status: movement.status,
      notes: movement.notes,
      items: additionalData.items || [],
      countedBy: additionalData.countedBy || 'Unknown',
      verifiedBy: additionalData.verifiedBy,
      countMethod: additionalData.countMethod || 'manual',
      discrepancyValue: additionalData.discrepancyValue,
      additionalData: movement.additionalData,
      createdAt: movement.createdAt,
      updatedAt: movement.updatedAt
    };
    
    res.json(processedMovement);
  } catch (error) {
    console.error('Error fetching physical inventory record:', error);
    res.status(500).json({ error: 'Failed to fetch physical inventory record' });
  }
});

// Create a new physical inventory count
router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const {
      warehouseId,
      items: countItems,
      transactionDate,
      notes,
      countedBy,
      verifiedBy,
      countMethod
    } = req.body;
    
    // Generate new inventory movement ID
    const movementId = await generateInventoryMovementId('PHY');
    
    // Calculate total discrepancy value
    let totalDiscrepancy = 0;
    for (const item of countItems) {
      // Get current stock quantity
      const [stockRecord] = await db.select()
        .from(itemStock)
        .where(and(
          eq(itemStock.itemId, item.itemId),
          eq(itemStock.warehouseId, warehouseId),
          eq(itemStock.tenantId, tenantId)
        ));
      
      const systemQty = stockRecord ? parseFloat(stockRecord.quantity) : 0;
      const countedQty = parseFloat(item.quantity);
      const discrepancy = countedQty - systemQty;
      
      // Get item cost for discrepancy value calculation
      const [itemRecord] = await db.select()
        .from(items)
        .where(and(
          eq(items.id, item.itemId),
          eq(items.tenantId, tenantId)
        ));
        
      const unitCost = itemRecord?.cost || 0;
      totalDiscrepancy += discrepancy * unitCost;
      
      // Update item with discrepancy information
      item.systemQuantity = systemQty;
      item.discrepancy = discrepancy;
      item.discrepancyPercent = systemQty !== 0 ? (discrepancy / systemQty) * 100 : 0;
    }
    
    // Prepare additional data
    const additionalData = {
      items: countItems,
      countedBy,
      verifiedBy,
      countMethod,
      discrepancyValue: totalDiscrepancy
    };
    
    // Insert the physical inventory record
    const [newMovement] = await db.insert(inventoryMovements)
      .values({
        movementId,
        tenantId,
        warehouseId,
        type: 'physical_count',
        status: 'pending',
        movementDate: transactionDate ? new Date(transactionDate) : new Date(),
        notes,
        additionalData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    
    // Format the response
    const processedMovement = {
      id: newMovement.id,
      transactionId: newMovement.movementId,
      type: newMovement.type,
      warehouseId: newMovement.warehouseId,
      transactionDate: newMovement.movementDate,
      status: newMovement.status,
      notes: newMovement.notes,
      items: countItems,
      countedBy,
      verifiedBy,
      countMethod,
      discrepancyValue: totalDiscrepancy,
      additionalData: newMovement.additionalData,
      createdAt: newMovement.createdAt,
      updatedAt: newMovement.updatedAt
    };
    
    res.status(201).json(processedMovement);
  } catch (error) {
    console.error('Failed to create physical inventory record:', error);
    res.status(500).json({ error: 'Failed to create physical inventory record' });
  }
});

// Update a physical inventory count
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = requireTenant(req);
    const {
      warehouseId,
      items: countItems,
      transactionDate,
      notes,
      status,
      countedBy,
      verifiedBy,
      countMethod
    } = req.body;
    
    // Make sure id is a valid number
    const movementId = parseInt(id);
    if (isNaN(movementId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    
    // Get existing record
    const existingMovement = await db.query.inventoryMovements.findFirst({
      where: and(
        eq(inventoryMovements.id, movementId),
        eq(inventoryMovements.tenantId, tenantId),
        eq(inventoryMovements.type, 'physical_count')
      )
    });
    
    if (!existingMovement) {
      return res.status(404).json({ error: 'Physical inventory record not found' });
    }
    
    // Calculate total discrepancy value if items are provided
    let totalDiscrepancy = 0;
    if (countItems && countItems.length > 0) {
      for (const item of countItems) {
        // Get current stock quantity
        const [stockRecord] = await db.select()
          .from(itemStock)
          .where(and(
            eq(itemStock.itemId, item.itemId),
            eq(itemStock.warehouseId, warehouseId || existingMovement.warehouseId),
            eq(itemStock.tenantId, tenantId)
          ));
        
        const systemQty = stockRecord ? parseFloat(stockRecord.quantity) : 0;
        const countedQty = parseFloat(item.quantity);
        const discrepancy = countedQty - systemQty;
        
        // Get item cost for discrepancy value calculation
        const [itemRecord] = await db.select()
          .from(items)
          .where(and(
            eq(items.id, item.itemId),
            eq(items.tenantId, tenantId)
          ));
          
        const unitCost = itemRecord?.cost || 0;
        totalDiscrepancy += discrepancy * unitCost;
        
        // Update item with discrepancy information
        item.systemQuantity = systemQty;
        item.discrepancy = discrepancy;
        item.discrepancyPercent = systemQty !== 0 ? (discrepancy / systemQty) * 100 : 0;
      }
    }
    
    // Prepare additional data
    const existingAdditionalData = existingMovement.additionalData as any || {};
    const additionalData = {
      items: countItems || existingAdditionalData.items || [],
      countedBy: countedBy || existingAdditionalData.countedBy,
      verifiedBy: verifiedBy || existingAdditionalData.verifiedBy,
      countMethod: countMethod || existingAdditionalData.countMethod,
      discrepancyValue: countItems ? totalDiscrepancy : existingAdditionalData.discrepancyValue
    };
    
    // If status is changing to "approved", update inventory quantities
    if (status === 'approved' && existingMovement.status !== 'approved') {
      const items = additionalData.items;
      for (const item of items) {
        // Get current stock record
        const [stockRecord] = await db.select()
          .from(itemStock)
          .where(and(
            eq(itemStock.itemId, item.itemId),
            eq(itemStock.warehouseId, existingMovement.warehouseId),
            eq(itemStock.tenantId, tenantId)
          ));
        
        if (stockRecord) {
          // Update existing stock record
          await db.update(itemStock)
            .set({
              quantity: item.quantity.toString(),
              updatedAt: new Date()
            })
            .where(eq(itemStock.id, stockRecord.id));
        } else {
          // Create new stock record if none exists
          await db.insert(itemStock)
            .values({
              itemId: item.itemId,
              warehouseId: existingMovement.warehouseId,
              quantity: item.quantity.toString(),
              tenantId,
              createdAt: new Date(),
              updatedAt: new Date()
            });
        }
      }
    }
    
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
      .where(eq(inventoryMovements.id, movementId))
      .returning();
    
    // Format the response
    const processedMovement = {
      id: updatedMovement.id,
      transactionId: updatedMovement.movementId,
      type: updatedMovement.type,
      warehouseId: updatedMovement.warehouseId,
      transactionDate: updatedMovement.movementDate,
      status: updatedMovement.status,
      notes: updatedMovement.notes,
      items: additionalData.items,
      countedBy: additionalData.countedBy,
      verifiedBy: additionalData.verifiedBy,
      countMethod: additionalData.countMethod,
      discrepancyValue: additionalData.discrepancyValue,
      additionalData: updatedMovement.additionalData,
      createdAt: updatedMovement.createdAt,
      updatedAt: updatedMovement.updatedAt
    };
    
    res.json(processedMovement);
  } catch (error) {
    console.error('Failed to update physical inventory record:', error);
    res.status(500).json({ error: 'Failed to update physical inventory record' });
  }
});

// Delete a physical inventory count
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = requireTenant(req);
    
    // Make sure id is a valid number
    const movementId = parseInt(id);
    if (isNaN(movementId)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    
    // Get existing record to ensure it's a physical count
    const existingMovement = await db.query.inventoryMovements.findFirst({
      where: and(
        eq(inventoryMovements.id, movementId),
        eq(inventoryMovements.tenantId, tenantId),
        eq(inventoryMovements.type, 'physical_count')
      )
    });
    
    if (!existingMovement) {
      return res.status(404).json({ error: 'Physical inventory record not found' });
    }
    
    // Only allow deleting pending counts
    if (existingMovement.status === 'approved') {
      return res.status(400).json({ error: 'Cannot delete an approved physical count' });
    }
    
    // Delete the record
    await db.delete(inventoryMovements)
      .where(eq(inventoryMovements.id, movementId));
    
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete physical inventory record:', error);
    res.status(500).json({ error: 'Failed to delete physical inventory record' });
  }
});

// Get AI-powered count recommendations
router.get('/ai-recommendations/count-schedule', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    
    // Get inventory items with stock levels
    const stockItems = await db.execute(sql`
      SELECT 
        i.id, 
        i.name, 
        i.item_code as "itemCode", 
        i.cost, 
        i.category_id as "categoryId", 
        ic.name as "categoryName",
        is.quantity, 
        w.name as "warehouseName",
        w.id as "warehouseId",
        COALESCE(
          (SELECT MAX(im.created_at) 
           FROM inventory_movements im
           WHERE im.type = 'physical_count' 
           AND im.warehouse_id = w.id
           AND EXISTS (
             SELECT 1
             FROM jsonb_array_elements(im.additional_data->'items') as items
             WHERE (items->>'itemId')::int = i.id
           )
          ), 
          NULL
        ) as "lastCountDate"
      FROM 
        items i
      JOIN 
        item_stock is ON i.id = is.item_id
      JOIN 
        warehouses w ON is.warehouse_id = w.id
      LEFT JOIN
        item_categories ic ON i.category_id = ic.id
      WHERE 
        i.tenant_id = ${tenantId}
        AND is.tenant_id = ${tenantId}
        AND i.is_stockable = true
      ORDER BY 
        "lastCountDate" ASC NULLS FIRST, 
        i.cost DESC
    `);
    
    // Group by warehouse and create AI recommendations
    const warehouseGroups = {};
    for (const item of stockItems) {
      if (!warehouseGroups[item.warehouseId]) {
        warehouseGroups[item.warehouseId] = {
          warehouseId: item.warehouseId,
          warehouseName: item.warehouseName,
          items: [],
          totalItems: 0,
          totalValue: 0,
          lastCountDate: null,
          priority: 'medium'
        };
      }
      
      const group = warehouseGroups[item.warehouseId];
      group.items.push(item);
      group.totalItems++;
      group.totalValue += parseFloat(item.quantity) * parseFloat(item.cost);
      
      // Track the earliest count date for the warehouse
      const itemCountDate = item.lastCountDate ? new Date(item.lastCountDate) : null;
      if (itemCountDate && (!group.lastCountDate || itemCountDate < group.lastCountDate)) {
        group.lastCountDate = itemCountDate;
      }
    }
    
    // Convert to array and calculate priorities
    const now = new Date();
    const recommendations = Object.values(warehouseGroups).map(group => {
      // Calculate days since last count
      const daysSinceCount = group.lastCountDate 
        ? Math.floor((now.getTime() - group.lastCountDate.getTime()) / (1000 * 60 * 60 * 24))
        : 9999; // Very large number for warehouses never counted
      
      // Determine priority based on days and value
      if (daysSinceCount > 90 || group.totalValue > 50000) {
        group.priority = 'high';
      } else if (daysSinceCount > 45 || group.totalValue > 20000) {
        group.priority = 'medium';
      } else {
        group.priority = 'low';
      }
      
      // Add days since count to the response
      group.daysSinceCount = daysSinceCount;
      
      // Format last count date for display
      group.lastCountDate = group.lastCountDate ? group.lastCountDate.toISOString() : null;
      
      return group;
    });
    
    // Sort by priority (high to low) and days since count (desc)
    recommendations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.daysSinceCount - a.daysSinceCount;
    });
    
    res.json(recommendations);
  } catch (error) {
    console.error('Error generating count recommendations:', error);
    res.status(500).json({ message: 'Failed to generate count recommendations' });
  }
});

// Get AI-powered discrepancy analysis
router.post('/ai-recommendations/analyze-discrepancies', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const { physicalCountId } = req.body;
    
    if (!physicalCountId) {
      return res.status(400).json({ error: 'Physical count ID is required' });
    }
    
    // Get the physical count record
    const countRecord = await db.query.inventoryMovements.findFirst({
      where: and(
        eq(inventoryMovements.id, parseInt(physicalCountId)),
        eq(inventoryMovements.tenantId, tenantId),
        eq(inventoryMovements.type, 'physical_count')
      )
    });
    
    if (!countRecord) {
      return res.status(404).json({ error: 'Physical count record not found' });
    }
    
    const additionalData = countRecord.additionalData as any || {};
    const countItems = additionalData.items || [];
    
    if (countItems.length === 0) {
      return res.status(400).json({ error: 'No items found in the physical count' });
    }
    
    // Get warehouse info
    const warehouse = await db.query.warehouses.findFirst({
      where: eq(warehouses.id, countRecord.warehouseId)
    });
    
    // Get item details for each counted item
    const itemIds = countItems.map(item => item.itemId);
    const itemDetails = await db.select()
      .from(items)
      .where(and(
        eq(items.tenantId, tenantId),
        sql`items.id IN (${itemIds.join(',')})`
      ));
    
    // Enrich count items with item details
    const enrichedItems = countItems.map(countItem => {
      const itemDetail = itemDetails.find(i => i.id === countItem.itemId);
      return {
        ...countItem,
        itemName: itemDetail?.name || `Item #${countItem.itemId}`,
        itemCode: itemDetail?.itemCode || '',
        cost: itemDetail?.cost || 0,
        category: itemDetail?.categoryId || null
      };
    });
    
    // Filter items with significant discrepancies (>5% or >10 units)
    const significantDiscrepancies = enrichedItems.filter(item => 
      Math.abs(item.discrepancyPercent) > 5 || Math.abs(item.discrepancy) > 10
    );
    
    // Get total count value and discrepancy value
    const totalCountValue = enrichedItems.reduce((sum, item) => 
      sum + (parseFloat(item.quantity) * parseFloat(item.cost)), 0);
    
    const totalDiscrepancyValue = enrichedItems.reduce((sum, item) => 
      sum + (parseFloat(item.discrepancy) * parseFloat(item.cost)), 0);
    
    // Calculate discrepancy percentage
    const discrepancyPercentage = totalCountValue !== 0 
      ? (totalDiscrepancyValue / totalCountValue) * 100 
      : 0;
    
    // Prepare the AI analysis context
    const analysisContext = {
      countId: countRecord.movementId,
      countDate: countRecord.movementDate,
      warehouseName: warehouse?.name || `Warehouse #${countRecord.warehouseId}`,
      totalItems: enrichedItems.length,
      itemsWithDiscrepancies: significantDiscrepancies.length,
      significantDiscrepancies: significantDiscrepancies.slice(0, 10), // Top 10 discrepancies
      totalCountValue: totalCountValue,
      totalDiscrepancyValue: totalDiscrepancyValue,
      discrepancyPercentage: discrepancyPercentage,
      countMethod: additionalData.countMethod || 'manual'
    };
    
    // Call AI service to analyze discrepancies
    const aiService = new AIService();
    const analysis = await aiService.analyzeInventoryDiscrepancies(analysisContext);
    
    // Prepare response
    const response = {
      physicalCountId,
      warehouseId: countRecord.warehouseId,
      warehouseName: warehouse?.name,
      countDate: countRecord.movementDate,
      totalItems: enrichedItems.length,
      itemsWithDiscrepancies: significantDiscrepancies.length,
      significantDiscrepancies: significantDiscrepancies.slice(0, 10),
      totalCountValue,
      totalDiscrepancyValue,
      discrepancyPercentage,
      analysis
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error analyzing discrepancies:', error);
    res.status(500).json({ message: 'Failed to analyze discrepancies' });
  }
});

export default router;