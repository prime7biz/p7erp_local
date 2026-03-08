import express from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { authenticate } from '../middleware/auth';
import { 
  sampleDevelopmentSchema, 
  insertSampleDevelopmentSchema,
  sampleMaterialSchema,
  insertSampleMaterialSchema,
  sampleApprovalSchema,
  insertSampleApprovalSchema
} from '@shared/schema';

const router = express.Router();

// Apply authentication middleware to all sample routes
router.use(authenticate);

// Filters schema for sample list
const sampleFiltersSchema = z.object({
  customerId: z.coerce.number().optional(),
  inquiryId: z.coerce.number().optional(),
  orderId: z.coerce.number().optional(),
  status: z.string().optional(),
  sampleType: z.string().optional(),
  styleName: z.string().optional(),
  dateRange: z.object({
    start: z.coerce.date().optional(),
    end: z.coerce.date().optional(),
  }).optional(),
}).passthrough();

// GET - Get all samples
router.get('/', async (req, res) => {
  try {
    const { tenantId } = req.user!;
    
    let filters = {};
    try {
      filters = sampleFiltersSchema.parse(req.query);
    } catch (parseErr) {
      filters = {};
    }
    
    const samples = await storage.getAllSamples(tenantId, filters);
    return res.json(samples);
  } catch (error) {
    console.error('Error fetching samples:', error);
    return res.status(500).json({ message: 'Failed to fetch samples' });
  }
});

// GET - Get sample types
router.get('/sample-types', (req, res) => {
  // These could be fetched from the database in a real implementation
  const sampleTypes = [
    { value: 'development', label: 'Development Sample' },
    { value: 'fitting', label: 'Fitting Sample' },
    { value: 'size_set', label: 'Size Set Sample' },
    { value: 'pp', label: 'Pre-Production Sample' },
    { value: 'top', label: 'TOP Sample' },
    { value: 'gold', label: 'Gold Seal Sample' },
    { value: 'shipping', label: 'Shipping Sample' },
    { value: 'color', label: 'Color Sample' },
    { value: 'wash', label: 'Wash Sample' },
    { value: 'lab_dip', label: 'Lab Dip' },
  ];
  
  return res.json(sampleTypes);
});

// GET - Get a single sample by ID
router.get('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user!;
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid sample ID' });
    }
    
    const sample = await storage.getSampleById(id, tenantId);
    
    if (!sample) {
      return res.status(404).json({ message: 'Sample not found' });
    }
    
    return res.json(sample);
  } catch (error) {
    console.error('Error fetching sample:', error);
    return res.status(500).json({ message: 'Failed to fetch sample' });
  }
});

// POST - Create a new sample
router.post('/', async (req, res) => {
  try {
    const { tenantId } = req.user!;
    
    // Generate a unique sample ID (this could be a more complex process in a real app)
    const dateString = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const sampleId = `SMPL-${dateString}-${randomNum}`;
    
    // Validate request body
    const validatedData = insertSampleDevelopmentSchema.parse({
      ...req.body,
      tenantId,
      sampleId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    const newSample = await storage.createSampleDevelopment(validatedData);
    return res.status(201).json(newSample);
  } catch (error) {
    console.error('Error creating sample:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    
    return res.status(500).json({ message: 'Failed to create sample' });
  }
});

// PATCH - Update a sample
router.patch('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user!;
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid sample ID' });
    }
    
    // First check if the sample exists
    const existingSample = await storage.getSampleById(id, tenantId);
    if (!existingSample) {
      return res.status(404).json({ message: 'Sample not found' });
    }
    
    // Update the sample
    const updatedSample = await storage.updateSampleDevelopment(id, {
      ...req.body,
      updatedAt: new Date(),
    });
    
    return res.json(updatedSample);
  } catch (error) {
    console.error('Error updating sample:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    
    return res.status(500).json({ message: 'Failed to update sample' });
  }
});

// DELETE - Delete a sample
router.delete('/:id', async (req, res) => {
  try {
    const { tenantId } = req.user!;
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid sample ID' });
    }
    
    // First check if the sample exists and belongs to the tenant
    const existingSample = await storage.getSampleById(id, tenantId);
    if (!existingSample) {
      return res.status(404).json({ message: 'Sample not found' });
    }
    
    // Delete the sample
    const success = await storage.deleteSampleDevelopment(id);
    
    if (!success) {
      return res.status(500).json({ message: 'Failed to delete sample' });
    }
    
    return res.json({ message: 'Sample deleted successfully' });
  } catch (error) {
    console.error('Error deleting sample:', error);
    return res.status(500).json({ message: 'Failed to delete sample' });
  }
});

// GET - Get materials for a sample
router.get('/:id/materials', async (req, res) => {
  try {
    const sampleId = parseInt(req.params.id);
    
    if (isNaN(sampleId)) {
      return res.status(400).json({ message: 'Invalid sample ID' });
    }
    
    const materials = await storage.getSampleMaterials(sampleId);
    return res.json(materials);
  } catch (error) {
    console.error('Error fetching sample materials:', error);
    return res.status(500).json({ message: 'Failed to fetch sample materials' });
  }
});

// POST - Add material to a sample
router.post('/:id/materials', async (req, res) => {
  try {
    const sampleId = parseInt(req.params.id);
    
    if (isNaN(sampleId)) {
      return res.status(400).json({ message: 'Invalid sample ID' });
    }
    
    // Validate request body
    const validatedData = insertSampleMaterialSchema.parse({
      ...req.body,
      sampleId,
    });
    
    const newMaterial = await storage.createSampleMaterial(validatedData);
    return res.status(201).json(newMaterial);
  } catch (error) {
    console.error('Error adding sample material:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    
    return res.status(500).json({ message: 'Failed to add sample material' });
  }
});

// GET - Get approvals for a sample
router.get('/:id/approvals', async (req, res) => {
  try {
    const { tenantId } = req.user!;
    const sampleId = parseInt(req.params.id);
    
    if (isNaN(sampleId)) {
      return res.status(400).json({ message: 'Invalid sample ID' });
    }
    
    const approvals = await storage.getSampleApprovalsBySampleId(sampleId, tenantId);
    return res.json(approvals);
  } catch (error) {
    console.error('Error fetching sample approvals:', error);
    return res.status(500).json({ message: 'Failed to fetch sample approvals' });
  }
});

// POST - Create approval request for a sample
router.post('/:id/approvals', async (req, res) => {
  try {
    const { tenantId } = req.user!;
    const sampleId = parseInt(req.params.id);
    
    if (isNaN(sampleId)) {
      return res.status(400).json({ message: 'Invalid sample ID' });
    }
    
    // Validate request body
    const validatedData = insertSampleApprovalSchema.parse({
      ...req.body,
      sampleId,
      tenantId,
      status: 'pending',
    });
    
    const newApproval = await storage.createSampleApproval(validatedData);
    return res.status(201).json(newApproval);
  } catch (error) {
    console.error('Error creating approval request:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation failed', errors: error.errors });
    }
    
    return res.status(500).json({ message: 'Failed to create approval request' });
  }
});

export default router;