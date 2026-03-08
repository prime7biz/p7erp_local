import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { documentLocks } from '@shared/schema';
import { eq, and, gt } from 'drizzle-orm';

export function requireLock(docType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const docId = parseInt(req.params.id || req.params.docId);
      if (isNaN(docId)) return next();

      const lockToken = req.headers['x-lock-token'] as string || req.body?.lockToken;
      const tenantId = req.tenantId;

      if (!tenantId) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const [lock] = await db.select()
        .from(documentLocks)
        .where(and(
          eq(documentLocks.docType, docType),
          eq(documentLocks.docId, docId),
          eq(documentLocks.tenantId, tenantId),
          gt(documentLocks.expiresAt, new Date())
        ));

      if (!lock) {
        return next();
      }

      if (!lockToken) {
        return res.status(423).json({
          message: 'Document is locked for editing',
          lockedBy: lock.lockedBy,
          expiresAt: lock.expiresAt,
          requiresLockToken: true,
        });
      }

      if (lock.lockToken !== lockToken) {
        return res.status(423).json({
          message: 'Invalid lock token. Document is locked by another user.',
          lockedBy: lock.lockedBy,
          expiresAt: lock.expiresAt,
        });
      }

      next();
    } catch (error: any) {
      console.error('[LOCK-MIDDLEWARE] Error:', error);
      return res.status(500).json({ message: 'Lock validation failed' });
    }
  };
}
