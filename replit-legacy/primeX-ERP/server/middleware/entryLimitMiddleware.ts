import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { subscriptions, subscriptionPlans, dailyEntryCounts } from "../../shared/schema";
import { eq, and } from "drizzle-orm";

export function enforceEntryLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'POST') {
      return next();
    }

    if (!req.tenantId) return next();

    try {
      const [sub] = await db.select({
        plan: subscriptions.plan,
      })
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, req.tenantId))
        .limit(1);

      if (!sub) return next();

      const [plan] = await db.select({
        dailyEntryLimit: subscriptionPlans.dailyEntryLimit,
      })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.name, sub.plan))
        .limit(1);

      if (!plan || !plan.dailyEntryLimit) return next();

      const today = new Date().toISOString().split('T')[0];

      const [existing] = await db.select()
        .from(dailyEntryCounts)
        .where(and(
          eq(dailyEntryCounts.tenantId, req.tenantId),
          eq(dailyEntryCounts.entryDate, today)
        ))
        .limit(1);

      const currentCount = existing?.entryCount || 0;

      if (currentCount >= plan.dailyEntryLimit) {
        return res.status(429).json({
          message: `Daily entry limit reached (${plan.dailyEntryLimit} entries/day). Upgrade your plan for unlimited entries.`,
          code: "DAILY_ENTRY_LIMIT_REACHED",
          currentCount,
          limit: plan.dailyEntryLimit,
          plan: sub.plan,
        });
      }

      if (existing) {
        await db.update(dailyEntryCounts)
          .set({ entryCount: currentCount + 1 })
          .where(eq(dailyEntryCounts.id, existing.id));
      } else {
        await db.insert(dailyEntryCounts).values({
          tenantId: req.tenantId,
          entryDate: today,
          entryCount: 1,
        });
      }

      next();
    } catch (error) {
      console.error("Entry limit check error:", error);
      next();
    }
  };
}
