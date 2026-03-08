import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { z } from 'zod';
import { reverseDocument, getReversalHistory, getRecentReversals } from '../services/reversalEngineService';
import { formatERPError } from '../services/transactionSafetyService';

const router = Router();

router.use(isAuthenticated);

const reversalBodySchema = z.object({
  reason: z.string().min(1, 'Reason is required for reversal'),
  createCorrection: z.boolean().optional().default(false),
});

router.post('/:docType/:docId', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.tenantId || !user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { docType, docId } = req.params;
    const parsedDocId = parseInt(docId);
    if (isNaN(parsedDocId)) {
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    const parsed = reversalBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid request body',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await reverseDocument(
      docType,
      parsedDocId,
      user.tenantId,
      user.id,
      parsed.data.reason
    );

    res.json(result);
  } catch (error: any) {
    const status = error.httpStatus || 500;
    res.status(status).json(formatERPError(error));
  }
});

router.get('/:docType/:docId/history', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.tenantId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { docType, docId } = req.params;
    const parsedDocId = parseInt(docId);
    if (isNaN(parsedDocId)) {
      return res.status(400).json({ message: 'Invalid document ID' });
    }

    const history = await getReversalHistory(docType, parsedDocId, user.tenantId);
    res.json(history);
  } catch (error: any) {
    const status = error.httpStatus || 500;
    res.status(status).json(formatERPError(error));
  }
});

router.get('/recent', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.tenantId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const days = parseInt(req.query.days as string) || 30;
    const reversals = await getRecentReversals(user.tenantId, days);
    res.json(reversals);
  } catch (error: any) {
    const status = error.httpStatus || 500;
    res.status(status).json(formatERPError(error));
  }
});

export default router;
