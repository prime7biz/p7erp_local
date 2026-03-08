import express from 'express';
import { db } from '../db';
import { eq } from 'drizzle-orm';

const router = express.Router();

// This is a mock service to provide Subcontractors
// Since we don't have a dedicated table, we'll return mock data
router.get('/', async (req, res) => {
  try {
    const subcontractors = [
      { id: 1, name: "Fast Stitching Partners", type: "sewing", location: "Eastside Industrial Area", contactPerson: "David Miller", contactPhone: "555-7890", performance: "A" },
      { id: 2, name: "Premium Fabrics Treatment", type: "dyeing", location: "Riverside Complex", contactPerson: "Lisa Wilson", contactPhone: "555-8901", performance: "A" },
      { id: 3, name: "Creative Embroidery Ltd.", type: "embroidery", location: "Craftsman District", contactPerson: "Thomas Moore", contactPhone: "555-9012", performance: "B" },
      { id: 4, name: "Global Print Solutions", type: "printing", location: "Tech Park", contactPerson: "Anna Garcia", contactPhone: "555-0123", performance: "A" },
      { id: 5, name: "Elite Finishing Co.", type: "finishing", location: "Southport Industrial", contactPerson: "James Taylor", contactPhone: "555-1234", performance: "B" }
    ];
    
    res.json(subcontractors);
  } catch (error) {
    console.error('Error fetching subcontractors:', error);
    res.status(500).json({ message: 'Failed to fetch subcontractors' });
  }
});

export default router;