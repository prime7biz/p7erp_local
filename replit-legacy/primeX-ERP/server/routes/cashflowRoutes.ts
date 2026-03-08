import { Router, Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { getCashflowCalendar } from '../services/cashflowCalendarService';

const router = Router();

router.use(isAuthenticated);

router.get('/calendar', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.tenantId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
    const days = parseInt(req.query.days as string) || 90;

    if (days < 1 || days > 365) {
      return res.status(400).json({ message: 'Days must be between 1 and 365' });
    }

    const result = await getCashflowCalendar(user.tenantId, startDate, days);
    return res.json(result);
  } catch (error) {
    console.error('Cashflow calendar error:', error);
    return res.status(500).json({ message: 'Failed to get cashflow calendar', error: (error as Error).message });
  }
});

export default router;
