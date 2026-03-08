import express, { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { db } from '../db';
import { documentStatuses } from '@shared/schema';
import { asc } from 'drizzle-orm';
import {
  getAvailableActions, performAction, getDocumentHistory,
  acquireLock, releaseLock, forceUnlock
} from '../services/workflowEngine';

const router = express.Router();

router.use(isAuthenticated);

router.get('/documents/:docType/:docId/actions', async (req: Request, res: Response) => {
  try {
    const { docType, docId } = req.params;
    const currentStatus = req.query.currentStatus as string;
    const amount = req.query.amount ? parseFloat(req.query.amount as string) : undefined;

    if (!currentStatus) {
      return res.status(400).json({ message: 'currentStatus query parameter is required' });
    }

    const docIdNum = parseInt(docId, 10);
    if (isNaN(docIdNum)) {
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    const result = await getAvailableActions(
      docType, docIdNum, currentStatus, req.user!.id, req.tenantId!, amount
    );

    return res.status(200).json({
      actions: result.actions.map(a => ({
        action: a.action,
        label: a.action.replace('_', ' '),
        targetStatus: a.toStatus,
        enabled: a.isAllowed,
        reason: a.reason,
        approvalProgress: a.approvalProgress,
        whyInQueue: a.whyInQueue,
      })),
      isSuperuser: result.isSuperUser,
    });
  } catch (error) {
    console.error('[WORKFLOW] Error in GET actions:', error);
    return res.status(500).json({ message: 'Failed to get available actions' });
  }
});

router.post('/documents/:docType/:docId/action', async (req: Request, res: Response) => {
  try {
    const { docType, docId } = req.params;
    const { action, currentStatus, amount, comments, reason, isOverride, overrideReason, requestId } = req.body;

    if (!action || !currentStatus) {
      return res.status(400).json({ message: 'action and currentStatus are required' });
    }

    const docIdNum = parseInt(docId, 10);
    if (isNaN(docIdNum)) {
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';

    const result = await performAction({
      docType,
      docId: docIdNum,
      action,
      userId: req.user!.id,
      tenantId: req.tenantId!,
      currentStatus,
      amount,
      comments,
      reason,
      isOverride: req.user?.isSuperUser ? true : isOverride,
      overrideReason: req.user?.isSuperUser ? (overrideReason || 'Super user auto-override') : overrideReason,
      ipAddress,
      requestId,
    });

    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error('[WORKFLOW] Error in POST action:', error);
    return res.status(500).json({ success: false, message: 'Failed to perform action' });
  }
});

router.get('/documents/:docType/:docId/history', async (req: Request, res: Response) => {
  try {
    const { docType, docId } = req.params;

    const docIdNum = parseInt(docId, 10);
    if (isNaN(docIdNum)) {
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    const history = await getDocumentHistory(docType, docIdNum, req.tenantId!);
    return res.status(200).json({ history });
  } catch (error) {
    console.error('[WORKFLOW] Error in GET history:', error);
    return res.status(500).json({ message: 'Failed to get document history' });
  }
});

router.post('/documents/:docType/:docId/lock', async (req: Request, res: Response) => {
  try {
    const { docType, docId } = req.params;
    const { durationMinutes, reason } = req.body;

    const docIdNum = parseInt(docId, 10);
    if (isNaN(docIdNum)) {
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    const result = await acquireLock(
      docType, docIdNum, req.user!.id, req.tenantId!, durationMinutes || 5, reason
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error('[WORKFLOW] Error in POST lock:', error);
    return res.status(500).json({ message: 'Failed to acquire lock' });
  }
});

router.delete('/documents/:docType/:docId/lock', async (req: Request, res: Response) => {
  try {
    const { docType, docId } = req.params;
    const { lockToken } = req.body;

    const docIdNum = parseInt(docId, 10);
    if (isNaN(docIdNum)) {
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    const result = await releaseLock(
      docType, docIdNum, req.user!.id, req.tenantId!, lockToken
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error('[WORKFLOW] Error in DELETE lock:', error);
    return res.status(500).json({ message: 'Failed to release lock' });
  }
});

router.post('/documents/:docType/:docId/force-unlock', async (req: Request, res: Response) => {
  try {
    const { docType, docId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ message: 'reason is required for force unlock' });
    }

    const docIdNum = parseInt(docId, 10);
    if (isNaN(docIdNum)) {
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    const result = await forceUnlock(
      docType, docIdNum, req.user!.id, req.tenantId!, reason
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error('[WORKFLOW] Error in POST force-unlock:', error);
    return res.status(500).json({ message: 'Failed to force unlock document' });
  }
});

router.get('/statuses', async (_req: Request, res: Response) => {
  try {
    const statuses = await db
      .select()
      .from(documentStatuses)
      .orderBy(asc(documentStatuses.sequence));

    return res.status(200).json({ statuses });
  } catch (error) {
    console.error('[WORKFLOW] Error in GET statuses:', error);
    return res.status(500).json({ message: 'Failed to get document statuses' });
  }
});

export default router;
