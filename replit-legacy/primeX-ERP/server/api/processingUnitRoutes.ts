import express from 'express';
import { processingUnitStorage } from '../database/inventory/processingUnitStorage';
import { isAuthenticated } from '../middleware/auth';

const router = express.Router();

router.get('/next-code', isAuthenticated, async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const nextCode = await processingUnitStorage.getNextUnitCode(tenantId);
    res.json({ nextCode });
  } catch (error) {
    console.error('Error getting next unit code:', error);
    res.status(500).json({ message: 'Failed to get next unit code' });
  }
});

router.get('/', isAuthenticated, async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const filters = {
      type: req.query.type as string | undefined,
      isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
    };
    const units = await processingUnitStorage.getAllProcessingUnits(tenantId, filters);
    res.json(units);
  } catch (error) {
    console.error('Error fetching processing units:', error);
    res.status(500).json({ message: 'Failed to fetch processing units' });
  }
});

router.get('/by-type/:type', isAuthenticated, async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const type = req.params.type;
    const units = await processingUnitStorage.getProcessingUnitsByType(type, tenantId);
    res.json(units);
  } catch (error) {
    console.error('Error fetching processing units by type:', error);
    res.status(500).json({ message: 'Failed to fetch processing units by type' });
  }
});

router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseInt(req.params.id);
    const unit = await processingUnitStorage.getProcessingUnitById(id, tenantId);
    if (!unit) {
      return res.status(404).json({ message: 'Processing unit not found' });
    }
    res.json(unit);
  } catch (error) {
    console.error('Error fetching processing unit:', error);
    res.status(500).json({ message: 'Failed to fetch processing unit' });
  }
});

router.post('/', isAuthenticated, async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const unit = await processingUnitStorage.createProcessingUnit(req.body, tenantId);
    res.status(201).json(unit);
  } catch (error) {
    console.error('Error creating processing unit:', error);
    res.status(500).json({ message: 'Failed to create processing unit' });
  }
});

router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseInt(req.params.id);
    const unit = await processingUnitStorage.updateProcessingUnit(id, req.body, tenantId);
    if (!unit) {
      return res.status(404).json({ message: 'Processing unit not found' });
    }
    res.json(unit);
  } catch (error) {
    console.error('Error updating processing unit:', error);
    res.status(500).json({ message: 'Failed to update processing unit' });
  }
});

router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseInt(req.params.id);
    const deleted = await processingUnitStorage.deleteProcessingUnit(id, tenantId);
    if (!deleted) {
      return res.status(404).json({ message: 'Processing unit not found' });
    }
    res.json({ message: 'Processing unit deleted successfully' });
  } catch (error) {
    console.error('Error deleting processing unit:', error);
    res.status(500).json({ message: 'Failed to delete processing unit' });
  }
});

export default router;
