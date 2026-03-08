import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { getAuditHistory, getActivityLogs, getSecurityStats, logAudit } from '../services/auditService';

const router = express.Router();

router.get('/logs', isAuthenticated, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) {
      return res.status(403).json({ message: 'Tenant context required' });
    }
    
    const isSuperUser = !!req.user?.isSuperUser;
    if (!isSuperUser) {
      return res.status(403).json({ message: 'Super user access required' });
    }
    
    const { dateFrom, dateTo, userId: filterUserId, action, entityType, search, page, pageSize } = req.query;
    
    const result = await getActivityLogs(tenantId, isSuperUser, {
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      userId: filterUserId ? parseInt(filterUserId as string) : undefined,
      action: action as string,
      entityType: entityType as string,
      search: search as string,
      page: page ? parseInt(page as string) : 1,
      pageSize: pageSize ? parseInt(pageSize as string) : 50,
    });
    
    res.json(result);
  } catch (error) {
    console.error('[AUDIT] Error fetching activity logs:', error);
    res.status(500).json({ message: 'Failed to fetch activity logs' });
  }
});

router.get('/security-stats', isAuthenticated, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant context required' });
    }
    
    const isSuperUser = !!req.user?.isSuperUser;
    if (!isSuperUser) {
      return res.status(403).json({ message: 'Super user access required' });
    }
    
    const stats = await getSecurityStats(tenantId);
    res.json(stats);
  } catch (error) {
    console.error('[AUDIT] Error fetching security stats:', error);
    res.status(500).json({ message: 'Failed to fetch security stats' });
  }
});

router.post('/log-action', isAuthenticated, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) {
      return res.status(403).json({ message: 'Tenant context required' });
    }
    
    const { action, entityType, entityId, details } = req.body;
    if (!action || !entityType) {
      return res.status(400).json({ message: 'action and entityType are required' });
    }
    
    await logAudit({
      tenantId,
      entityType,
      entityId: entityId || 0,
      action: action.toUpperCase(),
      performedBy: userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: details || {},
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('[AUDIT] Error logging client action:', error);
    res.status(500).json({ message: 'Failed to log action' });
  }
});

router.get('/:entityType/:entityId', isAuthenticated, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(403).json({ message: 'Tenant context required' });
    }
    const limit = parseInt(req.query.limit as string) || 50;
    
    const history = await getAuditHistory(tenantId, entityType, parseInt(entityId), limit);
    res.json({ items: history });
  } catch (error) {
    console.error('[AUDIT] Error fetching audit history:', error);
    res.status(500).json({ message: 'Failed to fetch audit history' });
  }
});

export default router;
