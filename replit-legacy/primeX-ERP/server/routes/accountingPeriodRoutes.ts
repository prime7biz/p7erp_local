import { parseIntParam } from "../utils/parseParams";
import express, { Request, Response } from 'express';
import { db } from '../db';
import { accountingPeriods } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { checkPeriodLock, closePeriod, openPeriod } from '../services/periodLockService';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(403).json({ message: 'Tenant context required' });

    const periods = await db
      .select()
      .from(accountingPeriods)
      .where(eq(accountingPeriods.tenantId, tenantId))
      .orderBy(desc(accountingPeriods.startDate));

    res.json(periods);
  } catch (error) {
    console.error('[PERIODS] Error fetching periods:', error);
    res.status(500).json({ message: 'Failed to fetch accounting periods' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const user = req.user as any;
    if (!tenantId) return res.status(403).json({ message: 'Tenant context required' });
    if (!user?.isSuperUser) return res.status(403).json({ message: 'Only super users can manage accounting periods' });

    const { name, startDate, endDate } = req.body;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({ message: 'Name, start date, and end date are required' });
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ message: 'Start date must be before end date' });
    }

    const [period] = await db.insert(accountingPeriods).values({
      tenantId,
      name,
      startDate,
      endDate,
      isClosed: false,
    }).returning();

    res.status(201).json(period);
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'An accounting period with these dates already exists' });
    }
    console.error('[PERIODS] Error creating period:', error);
    res.status(500).json({ message: 'Failed to create accounting period' });
  }
});

router.post('/:id/close', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const user = req.user as any;
    if (!tenantId) return res.status(403).json({ message: 'Tenant context required' });
    if (!user?.isSuperUser) return res.status(403).json({ message: 'Only super users can close accounting periods' });

    const periodId = parseIntParam(req.params.id, "id");
    const { reason } = req.body;
    
    const result = await closePeriod(tenantId, periodId, user.id, reason);
    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }
    res.json(result);
  } catch (error) {
    console.error('[PERIODS] Error closing period:', error);
    res.status(500).json({ message: 'Failed to close accounting period' });
  }
});

router.post('/:id/open', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const user = req.user as any;
    if (!tenantId) return res.status(403).json({ message: 'Tenant context required' });
    if (!user?.isSuperUser) return res.status(403).json({ message: 'Only super users can reopen accounting periods' });

    const periodId = parseIntParam(req.params.id, "id");
    const { reason } = req.body;
    
    const result = await openPeriod(tenantId, periodId, user.id, reason);
    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }
    res.json(result);
  } catch (error) {
    console.error('[PERIODS] Error reopening period:', error);
    res.status(500).json({ message: 'Failed to reopen accounting period' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const user = req.user as any;
    if (!tenantId) return res.status(403).json({ message: 'Tenant context required' });
    if (!user?.isSuperUser) return res.status(403).json({ message: 'Only super users can delete accounting periods' });

    const periodId = parseIntParam(req.params.id, "id");
    
    const [period] = await db.select().from(accountingPeriods)
      .where(and(eq(accountingPeriods.id, periodId), eq(accountingPeriods.tenantId, tenantId)));
    
    if (!period) return res.status(404).json({ message: 'Period not found' });
    if (period.isClosed) return res.status(400).json({ message: 'Cannot delete a closed period. Reopen it first.' });

    await db.delete(accountingPeriods)
      .where(and(eq(accountingPeriods.id, periodId), eq(accountingPeriods.tenantId, tenantId)));

    res.json({ message: 'Period deleted successfully' });
  } catch (error) {
    console.error('[PERIODS] Error deleting period:', error);
    res.status(500).json({ message: 'Failed to delete accounting period' });
  }
});

router.get('/check', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(403).json({ message: 'Tenant context required' });

    const { date } = req.query;
    if (!date) return res.status(400).json({ message: 'Date parameter is required' });

    const result = await checkPeriodLock(tenantId, date as string);
    res.json(result);
  } catch (error) {
    console.error('[PERIODS] Error checking period lock:', error);
    res.status(500).json({ message: 'Failed to check period lock' });
  }
});

export default router;
