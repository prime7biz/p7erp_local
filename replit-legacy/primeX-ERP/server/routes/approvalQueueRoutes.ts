import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { db } from '../db';
import {
  quotations, purchaseOrders, vouchers, users, roles,
  workflowTransitions, userRoles, documentWorkflowHistory,
  erpPermissions, rolePermissions
} from '@shared/schema';
import { eq, and, ne, inArray, desc, sql, or, isNull, gte } from 'drizzle-orm';
import { getUserRoles, getUserPermissions } from '../services/permissionService';
import { getAvailableActions } from '../services/workflowEngine';

const router = express.Router();

const EXCLUDED_STATUSES = ['DRAFT', 'POSTED', 'CLOSED', 'CANCELLED'];

router.get('/queue', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.tenantId!;
    const filterDocType = req.query.docType as string | undefined;
    const filterStatus = req.query.status as string | undefined;
    const filterAction = req.query.actionFilter as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const search = (req.query.search as string)?.trim() || undefined;
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortDirection = (req.query.sortDirection as string) === 'asc' ? 'asc' : 'desc';
    const offset = (page - 1) * pageSize;

    const userPermKeys = await getUserPermissions(userId, tenantId);

    const matchingTransitions = await db
      .select()
      .from(workflowTransitions)
      .where(
        and(
          eq(workflowTransitions.tenantId, tenantId),
          eq(workflowTransitions.isActive, true)
        )
      );

    const relevantTransitions = matchingTransitions.filter(t => {
      if (!t.requiredPermissionKey) return true;
      return userPermKeys.includes(t.requiredPermissionKey);
    });

    const statusesByDocType: Record<string, Set<string>> = {};
    for (const t of relevantTransitions) {
      if (!t.fromStatusCode) continue;
      if (EXCLUDED_STATUSES.includes(t.fromStatusCode)) continue;
      if (!statusesByDocType[t.docType]) {
        statusesByDocType[t.docType] = new Set();
      }
      statusesByDocType[t.docType].add(t.fromStatusCode);
    }

    const items: any[] = [];

    if ((!filterDocType || filterDocType === 'voucher') && statusesByDocType['voucher']) {
      const statusArr = Array.from(statusesByDocType['voucher']);
      const filteredStatuses = filterStatus ? statusArr.filter(s => s === filterStatus) : statusArr;
      if (filteredStatuses.length > 0) {
        const docs = await db
          .select({
            id: vouchers.id,
            docNumber: vouchers.voucherNumber,
            description: vouchers.description,
            currentStatus: vouchers.workflowStatus,
            amount: vouchers.amount,
            currency: vouchers.currencyCode,
            submittedById: vouchers.submittedById,
            submittedAt: vouchers.submittedDate,
            createdAt: vouchers.createdAt,
            submittedByUsername: users.username,
            submittedByFirstName: users.firstName,
            submittedByLastName: users.lastName,
          })
          .from(vouchers)
          .leftJoin(users, eq(vouchers.submittedById, users.id))
          .where(
            and(
              eq(vouchers.tenantId, tenantId),
              inArray(vouchers.workflowStatus, filteredStatuses),
              ...(search ? [sql`${vouchers.voucherNumber} ILIKE ${'%' + search + '%'}`] : [])
            )
          )
          .orderBy(desc(vouchers.createdAt))
          .limit(500);

        for (const doc of docs) {
          const { actions } = await getAvailableActions(
            'voucher', doc.id, doc.currentStatus || 'DRAFT', userId, tenantId,
            doc.amount ? Number(doc.amount) : undefined
          );
          const allowedActions = actions.filter((a: any) => a.isAllowed);
          if (allowedActions.length > 0) {
            items.push({
              docType: 'voucher',
              docId: doc.id,
              docNumber: doc.docNumber,
              description: doc.description || 'Voucher',
              currentStatus: doc.currentStatus,
              amount: doc.amount ? Number(doc.amount) : 0,
              currency: doc.currency || 'BDT',
              submittedBy: [doc.submittedByFirstName, doc.submittedByLastName].filter(Boolean).join(' ') || doc.submittedByUsername || 'Unknown',
              submittedAt: doc.submittedAt,
              availableActions: allowedActions.map(a => ({
                action: a.action,
                toStatus: a.toStatus,
                whyInQueue: a.whyInQueue,
                approvalProgress: a.approvalProgress,
              })),
              createdAt: doc.createdAt,
            });
          }
        }
      }
    }

    if ((!filterDocType || filterDocType === 'purchase_order') && statusesByDocType['purchase_order']) {
      const statusArr = Array.from(statusesByDocType['purchase_order']);
      const filteredStatuses = filterStatus ? statusArr.filter(s => s === filterStatus) : statusArr;
      if (filteredStatuses.length > 0) {
        const docs = await db
          .select({
            id: purchaseOrders.id,
            docNumber: purchaseOrders.poNumber,
            currentStatus: purchaseOrders.workflowStatus,
            amount: purchaseOrders.totalAmount,
            currency: purchaseOrders.currency,
            notes: purchaseOrders.notes,
            createdById: purchaseOrders.createdBy,
            createdAt: purchaseOrders.createdAt,
            createdByUsername: users.username,
            createdByFirstName: users.firstName,
            createdByLastName: users.lastName,
          })
          .from(purchaseOrders)
          .leftJoin(users, eq(purchaseOrders.createdBy, users.id))
          .where(
            and(
              eq(purchaseOrders.tenantId, tenantId),
              inArray(purchaseOrders.workflowStatus, filteredStatuses),
              ...(search ? [sql`${purchaseOrders.poNumber} ILIKE ${'%' + search + '%'}`] : [])
            )
          )
          .orderBy(desc(purchaseOrders.createdAt))
          .limit(500);

        for (const doc of docs) {
          const { actions } = await getAvailableActions(
            'purchase_order', doc.id, doc.currentStatus || 'DRAFT', userId, tenantId,
            doc.amount ? Number(doc.amount) : undefined
          );
          const allowedActions = actions.filter((a: any) => a.isAllowed);
          if (allowedActions.length > 0) {
            items.push({
              docType: 'purchase_order',
              docId: doc.id,
              docNumber: doc.docNumber,
              description: doc.notes || 'Purchase Order',
              currentStatus: doc.currentStatus,
              amount: doc.amount ? Number(doc.amount) : 0,
              currency: doc.currency || 'BDT',
              submittedBy: [doc.createdByFirstName, doc.createdByLastName].filter(Boolean).join(' ') || doc.createdByUsername || 'Unknown',
              submittedAt: doc.createdAt,
              availableActions: allowedActions.map(a => ({
                action: a.action,
                toStatus: a.toStatus,
                whyInQueue: a.whyInQueue,
                approvalProgress: a.approvalProgress,
              })),
              createdAt: doc.createdAt,
            });
          }
        }
      }
    }

    if ((!filterDocType || filterDocType === 'quotation') && statusesByDocType['quotation']) {
      const statusArr = Array.from(statusesByDocType['quotation']);
      const filteredStatuses = filterStatus ? statusArr.filter(s => s === filterStatus) : statusArr;
      if (filteredStatuses.length > 0) {
        const docs = await db
          .select({
            id: quotations.id,
            docNumber: quotations.quotationId,
            currentStatus: quotations.workflowStatus,
            amount: quotations.totalCost,
            notes: quotations.notes,
            styleName: quotations.styleName,
            createdById: quotations.createdBy,
            createdAt: quotations.createdAt,
            createdByUsername: users.username,
            createdByFirstName: users.firstName,
            createdByLastName: users.lastName,
          })
          .from(quotations)
          .leftJoin(users, eq(quotations.createdBy, users.id))
          .where(
            and(
              eq(quotations.tenantId, tenantId),
              inArray(quotations.workflowStatus, filteredStatuses),
              ...(search ? [sql`${quotations.quotationId} ILIKE ${'%' + search + '%'}`] : [])
            )
          )
          .orderBy(desc(quotations.createdAt))
          .limit(500);

        for (const doc of docs) {
          const { actions } = await getAvailableActions(
            'quotation', doc.id, doc.currentStatus || 'DRAFT', userId, tenantId,
            doc.amount ? Number(doc.amount) : undefined
          );
          const allowedActions = actions.filter((a: any) => a.isAllowed);
          if (allowedActions.length > 0) {
            items.push({
              docType: 'quotation',
              docId: doc.id,
              docNumber: doc.docNumber,
              description: doc.styleName || doc.notes || 'Quotation',
              currentStatus: doc.currentStatus,
              amount: doc.amount ? Number(doc.amount) : 0,
              currency: 'BDT',
              submittedBy: [doc.createdByFirstName, doc.createdByLastName].filter(Boolean).join(' ') || doc.createdByUsername || 'Unknown',
              submittedAt: doc.createdAt,
              availableActions: allowedActions.map(a => ({
                action: a.action,
                toStatus: a.toStatus,
                whyInQueue: a.whyInQueue,
                approvalProgress: a.approvalProgress,
              })),
              createdAt: doc.createdAt,
            });
          }
        }
      }
    }

    for (const item of items) {
      const actions = item.availableActions || [];
      const actionNames = actions.map((a: any) => a.action?.toLowerCase());
      if (actionNames.includes('check')) {
        item.userAuthority = 'check';
      } else if (actionNames.includes('recommend')) {
        item.userAuthority = 'recommend';
      } else if (actionNames.includes('approve')) {
        item.userAuthority = 'approve';
      } else if (actionNames.includes('post')) {
        item.userAuthority = 'post';
      } else if (actionNames.length > 0) {
        item.userAuthority = actionNames[0];
      } else {
        item.userAuthority = 'unknown';
      }
    }

    if (filterAction) {
      const filtered = items.filter(item => item.userAuthority === filterAction);
      items.length = 0;
      items.push(...filtered);
    }

    items.sort((a, b) => {
      let valA: any, valB: any;
      if (sortBy === 'amount') {
        valA = a.amount || 0;
        valB = b.amount || 0;
      } else if (sortBy === 'docNumber') {
        valA = (a.docNumber || '').toLowerCase();
        valB = (b.docNumber || '').toLowerCase();
      } else {
        valA = new Date(a.createdAt || 0).getTime();
        valB = new Date(b.createdAt || 0).getTime();
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    const byDocType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const byAction: Record<string, number> = {};
    for (const item of items) {
      byDocType[item.docType] = (byDocType[item.docType] || 0) + 1;
      byStatus[item.currentStatus] = (byStatus[item.currentStatus] || 0) + 1;
      if (item.userAuthority) {
        byAction[item.userAuthority] = (byAction[item.userAuthority] || 0) + 1;
      }
    }

    const totalCount = items.length;
    const paginatedItems = items.slice(offset, offset + pageSize);

    return res.json({
      items: paginatedItems,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      summary: {
        total: totalCount,
        byDocType,
        byStatus,
        byAction,
      },
    });
  } catch (error) {
    console.error('[APPROVAL QUEUE] Error fetching queue:', error);
    return res.status(500).json({ message: 'Failed to fetch approval queue' });
  }
});

router.get('/queue/by-action', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.tenantId!;
    const isSuperUser = req.user!.isSuperUser;

    const userPermKeys = await getUserPermissions(userId, tenantId);

    const matchingTransitions = await db
      .select()
      .from(workflowTransitions)
      .where(
        and(
          eq(workflowTransitions.tenantId, tenantId),
          eq(workflowTransitions.isActive, true)
        )
      );

    const relevantTransitions = matchingTransitions.filter(t => {
      if (isSuperUser) return true;
      if (!t.requiredPermissionKey) return true;
      return userPermKeys.includes(t.requiredPermissionKey);
    });

    const statusesByDocType: Record<string, Set<string>> = {};
    for (const t of relevantTransitions) {
      if (!t.fromStatusCode) continue;
      if (EXCLUDED_STATUSES.includes(t.fromStatusCode)) continue;
      if (!statusesByDocType[t.docType]) {
        statusesByDocType[t.docType] = new Set();
      }
      statusesByDocType[t.docType].add(t.fromStatusCode);
    }

    const allItems: any[] = [];

    if (statusesByDocType['voucher']) {
      const statusArr = Array.from(statusesByDocType['voucher']);
      if (statusArr.length > 0) {
        const docs = await db
          .select({
            id: vouchers.id,
            currentStatus: vouchers.workflowStatus,
            amount: vouchers.amount,
          })
          .from(vouchers)
          .where(
            and(
              eq(vouchers.tenantId, tenantId),
              inArray(vouchers.workflowStatus, statusArr)
            )
          )
          .limit(500);

        for (const doc of docs) {
          const { actions: vActions } = await getAvailableActions(
            'voucher', doc.id, doc.currentStatus || 'DRAFT', userId, tenantId,
            doc.amount ? Number(doc.amount) : undefined
          );
          const allowedActions = vActions.filter((a: any) => a.isAllowed);
          if (allowedActions.length > 0) {
            const actionNames = allowedActions.map((a: any) => a.action.toLowerCase());
            let authority = actionNames[0];
            if (actionNames.includes('check')) authority = 'check';
            else if (actionNames.includes('recommend')) authority = 'recommend';
            else if (actionNames.includes('approve')) authority = 'approve';
            else if (actionNames.includes('post')) authority = 'post';
            allItems.push({ authority });
          }
        }
      }
    }

    if (statusesByDocType['purchase_order']) {
      const statusArr = Array.from(statusesByDocType['purchase_order']);
      if (statusArr.length > 0) {
        const docs = await db
          .select({
            id: purchaseOrders.id,
            currentStatus: purchaseOrders.workflowStatus,
            amount: purchaseOrders.totalAmount,
          })
          .from(purchaseOrders)
          .where(
            and(
              eq(purchaseOrders.tenantId, tenantId),
              inArray(purchaseOrders.workflowStatus, statusArr)
            )
          )
          .limit(500);

        for (const doc of docs) {
          const { actions: poActions } = await getAvailableActions(
            'purchase_order', doc.id, doc.currentStatus || 'DRAFT', userId, tenantId,
            doc.amount ? Number(doc.amount) : undefined
          );
          const allowedActions = poActions.filter((a: any) => a.isAllowed);
          if (allowedActions.length > 0) {
            const actionNames = allowedActions.map((a: any) => a.action.toLowerCase());
            let authority = actionNames[0];
            if (actionNames.includes('check')) authority = 'check';
            else if (actionNames.includes('recommend')) authority = 'recommend';
            else if (actionNames.includes('approve')) authority = 'approve';
            else if (actionNames.includes('post')) authority = 'post';
            allItems.push({ authority });
          }
        }
      }
    }

    if (statusesByDocType['quotation']) {
      const statusArr = Array.from(statusesByDocType['quotation']);
      if (statusArr.length > 0) {
        const docs = await db
          .select({
            id: quotations.id,
            currentStatus: quotations.workflowStatus,
            amount: quotations.totalCost,
          })
          .from(quotations)
          .where(
            and(
              eq(quotations.tenantId, tenantId),
              inArray(quotations.workflowStatus, statusArr)
            )
          )
          .limit(500);

        for (const doc of docs) {
          const { actions: qActions } = await getAvailableActions(
            'quotation', doc.id, doc.currentStatus || 'DRAFT', userId, tenantId,
            doc.amount ? Number(doc.amount) : undefined
          );
          const allowedActions = qActions.filter((a: any) => a.isAllowed);
          if (allowedActions.length > 0) {
            const actionNames = allowedActions.map((a: any) => a.action.toLowerCase());
            let authority = actionNames[0];
            if (actionNames.includes('check')) authority = 'check';
            else if (actionNames.includes('recommend')) authority = 'recommend';
            else if (actionNames.includes('approve')) authority = 'approve';
            else if (actionNames.includes('post')) authority = 'post';
            allItems.push({ authority });
          }
        }
      }
    }

    const byAction: Record<string, number> = {};
    for (const item of allItems) {
      byAction[item.authority] = (byAction[item.authority] || 0) + 1;
    }

    const availableAuthorities = isSuperUser
      ? ['check', 'recommend', 'approve', 'post']
      : Object.keys(byAction);

    return res.json({
      byAction,
      total: allItems.length,
      availableAuthorities,
      isSuperUser,
    });
  } catch (error) {
    console.error('[APPROVAL QUEUE] Error fetching by-action:', error);
    return res.status(500).json({ message: 'Failed to fetch action counts' });
  }
});

router.get('/my-actions', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.tenantId!;

    const history = await db
      .select({
        id: documentWorkflowHistory.id,
        docType: documentWorkflowHistory.docType,
        docId: documentWorkflowHistory.docId,
        action: documentWorkflowHistory.action,
        controlStep: documentWorkflowHistory.controlStep,
        fromStatus: documentWorkflowHistory.fromStatus,
        toStatus: documentWorkflowHistory.toStatus,
        performedAt: documentWorkflowHistory.performedAt,
        comments: documentWorkflowHistory.comments,
        reason: documentWorkflowHistory.reason,
        amountAtAction: documentWorkflowHistory.amountAtAction,
        actorRoleId: documentWorkflowHistory.actorRoleId,
        actorRoleName: roles.displayName,
      })
      .from(documentWorkflowHistory)
      .leftJoin(roles, eq(documentWorkflowHistory.actorRoleId, roles.id))
      .where(
        and(
          eq(documentWorkflowHistory.tenantId, tenantId),
          eq(documentWorkflowHistory.performedBy, userId)
        )
      )
      .orderBy(desc(documentWorkflowHistory.performedAt))
      .limit(50);

    const enrichedHistory = [];
    for (const h of history) {
      let docNumber = '';
      if (h.docType === 'voucher') {
        const [v] = await db.select({ voucherNumber: vouchers.voucherNumber }).from(vouchers).where(eq(vouchers.id, h.docId));
        docNumber = v?.voucherNumber || `VCH-${h.docId}`;
      } else if (h.docType === 'purchase_order') {
        const [po] = await db.select({ poNumber: purchaseOrders.poNumber }).from(purchaseOrders).where(eq(purchaseOrders.id, h.docId));
        docNumber = po?.poNumber || `PO-${h.docId}`;
      } else if (h.docType === 'quotation') {
        const [q] = await db.select({ quotationId: quotations.quotationId }).from(quotations).where(eq(quotations.id, h.docId));
        docNumber = q?.quotationId || `QTN-${h.docId}`;
      }

      enrichedHistory.push({
        ...h,
        docNumber,
        amountAtAction: h.amountAtAction ? Number(h.amountAtAction) : null,
      });
    }

    return res.json({ items: enrichedHistory });
  } catch (error) {
    console.error('[APPROVAL QUEUE] Error fetching my actions:', error);
    return res.status(500).json({ message: 'Failed to fetch action history' });
  }
});

router.get('/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const tenantId = req.tenantId!;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const voucherCounts = await db
      .select({
        status: vouchers.workflowStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(vouchers)
      .where(
        and(
          eq(vouchers.tenantId, tenantId),
          sql`${vouchers.workflowStatus} NOT IN ('DRAFT', 'POSTED', 'CLOSED', 'CANCELLED')`
        )
      )
      .groupBy(vouchers.workflowStatus);

    const poCounts = await db
      .select({
        status: purchaseOrders.workflowStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.tenantId, tenantId),
          sql`${purchaseOrders.workflowStatus} NOT IN ('DRAFT', 'POSTED', 'CLOSED', 'CANCELLED')`
        )
      )
      .groupBy(purchaseOrders.workflowStatus);

    const quotationCounts = await db
      .select({
        status: quotations.workflowStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(quotations)
      .where(
        and(
          eq(quotations.tenantId, tenantId),
          sql`${quotations.workflowStatus} NOT IN ('DRAFT', 'POSTED', 'CLOSED', 'CANCELLED')`
        )
      )
      .groupBy(quotations.workflowStatus);

    let totalPending = 0;
    const byDocType: Record<string, number> = { voucher: 0, purchase_order: 0, quotation: 0 };
    const byStatus: Record<string, number> = {};

    for (const row of voucherCounts) {
      const count = row.count;
      totalPending += count;
      byDocType.voucher += count;
      byStatus[row.status || 'UNKNOWN'] = (byStatus[row.status || 'UNKNOWN'] || 0) + count;
    }
    for (const row of poCounts) {
      const count = row.count;
      totalPending += count;
      byDocType.purchase_order += count;
      byStatus[row.status || 'UNKNOWN'] = (byStatus[row.status || 'UNKNOWN'] || 0) + count;
    }
    for (const row of quotationCounts) {
      const count = row.count;
      totalPending += count;
      byDocType.quotation += count;
      byStatus[row.status || 'UNKNOWN'] = (byStatus[row.status || 'UNKNOWN'] || 0) + count;
    }

    const [approvedToday] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(documentWorkflowHistory)
      .where(
        and(
          eq(documentWorkflowHistory.tenantId, tenantId),
          eq(documentWorkflowHistory.performedBy, userId),
          gte(documentWorkflowHistory.performedAt, today),
          sql`${documentWorkflowHistory.action} IN ('approve', 'check', 'recommend', 'post')`
        )
      );

    const [rejectedToday] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(documentWorkflowHistory)
      .where(
        and(
          eq(documentWorkflowHistory.tenantId, tenantId),
          eq(documentWorkflowHistory.performedBy, userId),
          gte(documentWorkflowHistory.performedAt, today),
          sql`${documentWorkflowHistory.action} IN ('reject', 'send_back')`
        )
      );

    return res.json({
      totalPending,
      awaitingMyAction: totalPending,
      approvedToday: approvedToday?.count || 0,
      rejectedToday: rejectedToday?.count || 0,
      byDocType,
      byStatus,
    });
  } catch (error) {
    console.error('[APPROVAL QUEUE] Error fetching stats:', error);
    return res.status(500).json({ message: 'Failed to fetch approval stats' });
  }
});

export default router;
