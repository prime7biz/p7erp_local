import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { detectExceptions, getExceptionsSummary, acknowledgeException } from '../services/exceptionsService';

const router = Router();

router.use(isAuthenticated);

router.get('/scan', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.tenantId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const exceptions = await detectExceptions(user.tenantId);
    return res.json({ exceptions, count: exceptions.length });
  } catch (error) {
    console.error('Exception scan error:', error);
    return res.status(500).json({ message: 'Failed to scan for exceptions', error: (error as Error).message });
  }
});

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.tenantId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const summary = await getExceptionsSummary(user.tenantId);
    return res.json({ summary });
  } catch (error) {
    console.error('Exception summary error:', error);
    return res.status(500).json({ message: 'Failed to get exception summary', error: (error as Error).message });
  }
});

router.post('/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.tenantId || !user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'Exception ID is required' });
    }

    await acknowledgeException(id, user.tenantId, user.id);
    return res.json({ message: 'Exception acknowledged', exceptionId: id });
  } catch (error) {
    console.error('Exception acknowledge error:', error);
    return res.status(500).json({ message: 'Failed to acknowledge exception', error: (error as Error).message });
  }
});

export default router;
