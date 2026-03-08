import express from 'express';
import { getInventoryOptimizationRecommendations } from '../services/aiRecommendationService';
import { authenticate } from '../middleware/auth';

const router = express.Router();

// GET AI-powered inventory optimization recommendations
// For demo purposes, we're using a simplified route that doesn't require authentication
router.get('/inventory-optimization', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Authentication required" });
    const categoryFilter = req.query.category as string | undefined;
    const itemLimit = req.query.limit ? parseInt(req.query.limit as string) : 5;
    
    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ 
        message: 'AI service unavailable. Please configure API key.',
        error: 'missing_api_key' 
      });
    }
    
    const recommendations = await getInventoryOptimizationRecommendations(
      tenantId, 
      categoryFilter,
      itemLimit
    );
    
    res.json(recommendations);
  } catch (error) {
    console.error('Error generating AI recommendations:', error);
    res.status(500).json({ 
      message: 'Failed to generate recommendations',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;