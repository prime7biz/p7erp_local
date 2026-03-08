import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { vouchers, deliveryChallans, goodsReceivingNotes, manufacturingOrders } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

type DocTypeConfig = {
  table: any;
  statusField: string;
  immutableStatuses: string[];
};

const DOC_TYPE_MAP: Record<string, DocTypeConfig> = {
  voucher: {
    table: vouchers,
    statusField: 'workflowStatus',
    immutableStatuses: ['POSTED', 'REVERSED'],
  },
  delivery_challan: {
    table: deliveryChallans,
    statusField: 'workflowStatus',
    immutableStatuses: ['POSTED', 'REVERSED'],
  },
  grn: {
    table: goodsReceivingNotes,
    statusField: 'workflowStatus',
    immutableStatuses: ['POSTED', 'REVERSED'],
  },
  manufacturing_order: {
    table: manufacturingOrders,
    statusField: 'status',
    immutableStatuses: ['completed', 'COMPLETED', 'POSTED', 'reversed', 'REVERSED'],
  },
};

export function immutabilityGuard(docType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!['PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const docId = parseInt(req.params.id);
    if (!docId || isNaN(docId)) {
      return next();
    }

    const config = DOC_TYPE_MAP[docType];
    if (!config) {
      return next();
    }

    try {
      const user = (req as any).user;
      const tenantId = user?.tenantId;
      if (!tenantId) {
        return next();
      }

      const [doc] = await db.select({
        id: config.table.id,
        status: config.table[config.statusField],
      }).from(config.table)
        .where(and(
          eq(config.table.id, docId),
          eq(config.table.tenantId, tenantId)
        ));

      if (!doc) {
        return next();
      }

      const currentStatus = doc.status as string;
      if (config.immutableStatuses.includes(currentStatus)) {
        return res.status(409).json({
          error: 'IMMUTABLE_DOCUMENT',
          message: "This document is immutable. Use 'Reverse & Create New' to make changes.",
          currentStatus,
          docType,
          docId,
        });
      }

      next();
    } catch (error) {
      console.error(`[ImmutabilityGuard] Error checking document status:`, error);
      next();
    }
  };
}
