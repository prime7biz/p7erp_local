import { parseIntParam } from "../utils/parseParams";
import { requireTenant } from "../utils/tenantScope";
import express from 'express';
import { achievementService } from '../services/achievementService';
import { isAuthenticated } from '../middleware/auth';
import { z } from 'zod';
import { insertAchievementBadgeSchema, insertUserPerformanceMetricSchema } from '@shared/schema';

const router = express.Router();

// Get all achievement badges for the tenant
router.get('/badges', isAuthenticated, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const badges = await achievementService.getAllAchievementBadges(tenantId);
    res.json(badges);
  } catch (error: any) {
    console.error('Error fetching achievement badges:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch achievement badges' });
  }
});

// Get a specific achievement badge by ID
router.get('/badges/:id', isAuthenticated, async (req, res) => {
  try {
    const badgeId = parseIntParam(req.params.id, "id");
    if (isNaN(badgeId)) {
      return res.status(400).json({ message: 'Invalid badge ID' });
    }
    
    const tenantId = requireTenant(req);
    const badge = await achievementService.getAchievementBadgeById(badgeId, tenantId);
    
    if (!badge) {
      return res.status(404).json({ message: 'Achievement badge not found' });
    }
    
    res.json(badge);
  } catch (error: any) {
    console.error('Error fetching achievement badge:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch achievement badge' });
  }
});

// Create a new achievement badge
router.post('/badges', isAuthenticated, async (req, res) => {
  try {
    // Validate request body
    const badgeData = insertAchievementBadgeSchema.parse({
      ...req.body,
      tenantId: requireTenant(req)
    });
    
    const badge = await achievementService.createAchievementBadge(badgeData);
    res.status(201).json(badge);
  } catch (error: any) {
    console.error('Error creating achievement badge:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Validation error',
        errors: error.errors 
      });
    }
    res.status(500).json({ message: error.message || 'Failed to create achievement badge' });
  }
});

// Update an achievement badge
router.put('/badges/:id', isAuthenticated, async (req, res) => {
  try {
    const badgeId = parseIntParam(req.params.id, "id");
    if (isNaN(badgeId)) {
      return res.status(400).json({ message: 'Invalid badge ID' });
    }
    
    // Validate request body
    const badgeData = insertAchievementBadgeSchema.partial().parse({
      ...req.body,
      tenantId: requireTenant(req)
    });
    
    const badge = await achievementService.updateAchievementBadge(badgeId, badgeData);
    
    if (!badge) {
      return res.status(404).json({ message: 'Achievement badge not found or no changes made' });
    }
    
    res.json(badge);
  } catch (error: any) {
    console.error('Error updating achievement badge:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Validation error',
        errors: error.errors 
      });
    }
    res.status(500).json({ message: error.message || 'Failed to update achievement badge' });
  }
});

// Get user achievements
router.get('/user/:userId/achievements', isAuthenticated, async (req, res) => {
  try {
    const userId = parseIntParam(req.params.userId, "userId");
    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    
    const tenantId = requireTenant(req);
    const achievements = await achievementService.getUserAchievementsWithBadgeDetails(userId, tenantId);
    
    res.json(achievements);
  } catch (error: any) {
    console.error('Error fetching user achievements:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch user achievements' });
  }
});

// Get user achievement summary
router.get('/user/:userId/summary', isAuthenticated, async (req, res) => {
  try {
    const userId = parseIntParam(req.params.userId, "userId");
    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    
    const tenantId = requireTenant(req);
    const summary = await achievementService.getUserAchievementSummary(userId, tenantId);
    
    res.json(summary);
  } catch (error: any) {
    console.error('Error fetching user achievement summary:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch user achievement summary' });
  }
});

// Get user achievement activity logs
router.get('/user/:userId/logs', isAuthenticated, async (req, res) => {
  try {
    const userId = parseIntParam(req.params.userId, "userId");
    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    
    const tenantId = requireTenant(req);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    
    const logs = await achievementService.getUserAchievementLogs(userId, tenantId, limit);
    
    res.json(logs);
  } catch (error: any) {
    console.error('Error fetching user achievement logs:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch user achievement logs' });
  }
});

// Track a performance metric
router.post('/metrics', isAuthenticated, async (req, res) => {
  try {
    // Validate request body
    const metricSchema = z.object({
      userId: z.number(),
      metricType: z.string(),
      value: z.number(),
    });
    
    const { userId, metricType, value } = metricSchema.parse(req.body);
    const tenantId = requireTenant(req);
    
    const result = await achievementService.trackPerformanceMetric(
      userId,
      tenantId,
      metricType,
      value
    );
    
    res.status(201).json(result);
  } catch (error: any) {
    console.error('Error tracking performance metric:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Validation error',
        errors: error.errors 
      });
    }
    res.status(500).json({ message: error.message || 'Failed to track performance metric' });
  }
});

// Initialize default achievement badges for a tenant
router.post('/initialize-defaults', isAuthenticated, async (req, res) => {
  try {
    const tenantId = requireTenant(req);
    const badges = await achievementService.initializeDefaultBadges(tenantId);
    
    res.status(201).json({ 
      message: 'Default achievement badges initialized successfully',
      badges
    });
  } catch (error: any) {
    console.error('Error initializing default achievement badges:', error);
    res.status(500).json({ message: error.message || 'Failed to initialize default achievement badges' });
  }
});

export default router;