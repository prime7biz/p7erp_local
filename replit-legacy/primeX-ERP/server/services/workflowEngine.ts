import crypto from 'crypto';
import { db } from '../db';
import {
  workflowTransitions, documentWorkflowHistory, documentStatuses,
  documentLocks, approvalMatrix, sodRules, workflowDefinitions,
  workflowInstances, roles, userRoles, erpPermissions, rolePermissions,
  users, quotations, purchaseOrders, vouchers, goodsReceivingNotes
} from '@shared/schema';
import { eq, and, or, isNull, gte, lte, inArray, sql, desc, asc } from 'drizzle-orm';
import { checkPermission, checkSoD, getUserRoles } from './permissionService';
import { syncLegacyStatus } from './statusMapper';
import { updateWorkflowInstanceStatus } from './workflowInstanceService';

interface AvailableAction {
  action: string;
  toStatus: string;
  isAllowed: boolean;
  reason?: string;
  requiredPermission?: string;
  isOptional?: boolean;
  approvalProgress?: {
    current: number;
    required: number;
    approvers: Array<{ userId: number; roleId?: number; at: Date }>;
  };
  whyInQueue?: string;
  sodInfo?: {
    mode: string;
    conflictingAction?: string;
  };
}

interface WorkflowActionParams {
  docType: string;
  docId: number;
  action: string;
  userId: number;
  tenantId: number;
  currentStatus: string;
  amount?: number;
  comments?: string;
  reason?: string;
  isOverride?: boolean;
  overrideReason?: string;
  ipAddress?: string;
  requestId?: string;
}

interface WorkflowActionResult {
  success: boolean;
  newStatus?: string;
  message: string;
  historyId?: number;
  code?: string;
  details?: Record<string, any>;
}

const ACTION_TO_CONTROL_STEP: Record<string, string> = {
  create: 'maker',
  submit: 'maker',
  check: 'checker',
  recommend: 'recommender',
  approve: 'approver',
  post: 'poster',
  cancel: 'canceller',
};

function deriveControlStep(action: string, currentStatus?: string): string {
  const lower = action.toLowerCase();
  if (ACTION_TO_CONTROL_STEP[lower]) {
    return ACTION_TO_CONTROL_STEP[lower];
  }
  if (lower === 'send_back' || lower === 'reject') {
    if (currentStatus) {
      const statusLower = currentStatus.toLowerCase();
      if (statusLower.includes('check')) return 'checker';
      if (statusLower.includes('recommend')) return 'recommender';
      if (statusLower.includes('approv')) return 'approver';
      if (statusLower.includes('post')) return 'poster';
    }
    return 'reviewer';
  }
  return lower;
}

export async function getApprovalProgress(
  tenantId: number, docType: string, docId: number, action: string = 'approve'
): Promise<{ count: number; approvers: Array<{ userId: number; roleId?: number; at: Date }> }> {
  const approvals = await db.select({
    userId: documentWorkflowHistory.performedBy,
    roleId: documentWorkflowHistory.actorRoleId,
    at: documentWorkflowHistory.performedAt,
  })
  .from(documentWorkflowHistory)
  .where(and(
    eq(documentWorkflowHistory.tenantId, tenantId),
    eq(documentWorkflowHistory.docType, docType),
    eq(documentWorkflowHistory.docId, docId),
    eq(documentWorkflowHistory.action, action),
    eq(documentWorkflowHistory.toStatus, 'APPROVED')
  ));

  const uniqueApprovers = new Map<number, { userId: number; roleId?: number | null; at: Date }>();
  for (const a of approvals) {
    if (!uniqueApprovers.has(a.userId)) {
      uniqueApprovers.set(a.userId, a);
    }
  }

  return {
    count: uniqueApprovers.size,
    approvers: Array.from(uniqueApprovers.values()).map(a => ({
      userId: a.userId,
      roleId: a.roleId || undefined,
      at: a.at
    })),
  };
}

export async function getAvailableActions(
  docType: string,
  docId: number,
  currentStatus: string,
  userId: number,
  tenantId: number,
  amount?: number
): Promise<{ actions: AvailableAction[]; isSuperUser: boolean }> {
  try {
    const [userRecord] = await db.select({ isSuperUser: users.isSuperUser })
      .from(users).where(eq(users.id, userId));
    const isSuperUser = userRecord?.isSuperUser === true;

    const transitions = await db
      .select()
      .from(workflowTransitions)
      .where(
        and(
          eq(workflowTransitions.tenantId, tenantId),
          eq(workflowTransitions.docType, docType),
          eq(workflowTransitions.fromStatusCode, currentStatus),
          eq(workflowTransitions.isActive, true)
        )
      )
      .orderBy(asc(workflowTransitions.sequence));

    const actions: AvailableAction[] = [];

    for (const transition of transitions) {
      let isAllowed = true;
      let reason: string | undefined;

      if (isSuperUser) {
        isAllowed = true;
      } else {
        if (transition.requiredPermissionKey) {
          const permResult = await checkPermission(userId, tenantId, transition.requiredPermissionKey);
          if (!permResult.allowed) {
            isAllowed = false;
            reason = permResult.reason || 'Insufficient permissions';
          }
        }

        let sodInfo: AvailableAction['sodInfo'] | undefined;

        if (isAllowed) {
          const sodResult = await checkSoD(tenantId, docType, docId, transition.actionName, userId);
          if (!sodResult.allowed) {
            isAllowed = false;
            reason = `Segregation of Duties conflict: you already performed "${sodResult.conflictingAction}" on this document`;
            sodInfo = {
              mode: sodResult.mode || 'STANDARD',
              conflictingAction: sodResult.conflictingAction,
            };
          }
        }

        if (isAllowed && amount !== undefined && transition.actionName.toLowerCase() === 'approve') {
          const matrixRules = await checkApprovalMatrix(docType, amount, tenantId);
          if (matrixRules.length > 0) {
            const userRolesList = await getUserRoles(userId, tenantId);
            const userRoleIds = new Set(userRolesList.map((r) => r.id));
            const hasApprovalAuthority = matrixRules.some((rule) => {
              if (rule.ruleType === 'ROLE' && rule.requiredRoleId) {
                return userRoleIds.has(rule.requiredRoleId);
              }
              if (rule.ruleType === 'USER' && rule.requiredUserId) {
                return rule.requiredUserId === userId;
              }
              return true;
            });

            if (!hasApprovalAuthority) {
              isAllowed = false;
              reason = 'Amount exceeds your approval authority';
            }
          }
        }
      }

      let whyInQueue: string | undefined;
      if (isAllowed) {
        const actionLower = transition.actionName.toLowerCase();
        if (actionLower === 'check') {
          whyInQueue = 'Document is submitted and awaiting your check';
        } else if (actionLower === 'recommend') {
          whyInQueue = 'Document is checked and awaiting your recommendation';
        } else if (actionLower === 'approve') {
          whyInQueue = 'Document is checked and awaiting your approval';
        } else if (actionLower === 'post') {
          whyInQueue = 'Document is approved and awaiting posting';
        } else if (actionLower === 'submit') {
          whyInQueue = 'Document is in draft and ready for submission';
        } else if (actionLower === 'reject' || actionLower === 'send_back') {
          whyInQueue = `Document is at ${currentStatus} and can be sent back`;
        }
      }

      actions.push({
        action: transition.actionName,
        toStatus: transition.toStatusCode,
        isAllowed,
        reason,
        requiredPermission: transition.requiredPermissionKey || undefined,
        isOptional: transition.isOptional,
        whyInQueue,
      });
    }

    if (!isSuperUser) {
      for (const action of actions) {
        if (action.action === 'approve' && action.isAllowed) {
          const matrixRules = await checkApprovalMatrix(docType, amount || 0, tenantId);
          if (matrixRules.length > 0 && matrixRules[0].approvalMode === 'ALL_REQUIRED' && matrixRules[0].requiredCount > 1) {
            const progress = await getApprovalProgress(tenantId, docType, docId, 'approve');
            action.approvalProgress = {
              current: progress.count,
              required: matrixRules[0].requiredCount,
              approvers: progress.approvers,
            };
            if (progress.approvers.some(a => a.userId === userId)) {
              action.isAllowed = false;
              action.reason = 'You have already approved this document';
            } else {
              action.whyInQueue = `Document requires ${matrixRules[0].requiredCount} approvals, has ${progress.count} so far`;
            }
          }
        }
      }
    }

    return { actions, isSuperUser };
  } catch (error) {
    console.error('[WORKFLOW] Error getting available actions:', error);
    throw new Error('Failed to retrieve available actions');
  }
}

export async function performAction(params: WorkflowActionParams): Promise<WorkflowActionResult> {
  const {
    docType, docId, action, userId, tenantId, currentStatus,
    amount, comments, reason, isOverride, overrideReason, ipAddress, requestId
  } = params;

  const DOC_TABLE_MAP: Record<string, string> = {
    quotation: 'quotations',
    purchase_order: 'purchase_orders',
    voucher: 'vouchers',
    grn: 'goods_receiving_notes',
  };

  const tableName = DOC_TABLE_MAP[docType];
  if (!tableName) {
    return { success: false, code: 'UNKNOWN_DOC_TYPE', message: `Unknown document type: ${docType}`, details: { docType, docId, action } };
  }

  try {
    const [actingUser] = await db.select({ isSuperUser: users.isSuperUser })
      .from(users).where(eq(users.id, userId));
    const isSuperUserAction = actingUser?.isSuperUser === true;

    if (isSuperUserAction) {
      params.isOverride = true;
      console.log(`[WORKFLOW] Super user override auto-applied for user ${userId}`);
    }

    const result = await db.transaction(async (tx) => {
      // 1. Lock the document row to prevent concurrent modifications
      switch (docType) {
        case 'quotation':
          await tx.select({ id: quotations.id }).from(quotations).where(eq(quotations.id, docId)).for('update');
          break;
        case 'purchase_order':
          await tx.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.id, docId)).for('update');
          break;
        case 'voucher':
          await tx.select({ id: vouchers.id }).from(vouchers).where(eq(vouchers.id, docId)).for('update');
          break;
        case 'grn':
          await tx.select({ id: goodsReceivingNotes.id }).from(goodsReceivingNotes).where(eq(goodsReceivingNotes.id, docId)).for('update');
          break;
      }

      // 2. Re-check current status inside transaction
      let currentStatusInDb: string | null = null;
      switch (docType) {
        case 'quotation': {
          const [doc] = await tx.select({ ws: quotations.workflowStatus }).from(quotations).where(eq(quotations.id, docId));
          currentStatusInDb = doc?.ws || null;
          break;
        }
        case 'purchase_order': {
          const [doc] = await tx.select({ ws: purchaseOrders.workflowStatus }).from(purchaseOrders).where(eq(purchaseOrders.id, docId));
          currentStatusInDb = doc?.ws || null;
          break;
        }
        case 'voucher': {
          const [doc] = await tx.select({ ws: vouchers.workflowStatus }).from(vouchers).where(eq(vouchers.id, docId));
          currentStatusInDb = doc?.ws || null;
          break;
        }
        case 'grn': {
          const [doc] = await tx.select({ ws: goodsReceivingNotes.workflowStatus }).from(goodsReceivingNotes).where(eq(goodsReceivingNotes.id, docId));
          currentStatusInDb = doc?.ws || null;
          break;
        }
      }
      if (currentStatusInDb && currentStatusInDb !== currentStatus) {
        return { success: false, code: 'STALE_STATUS', message: `Document status has changed to "${currentStatusInDb}". Please refresh and try again.`, details: { docType, docId, action, expectedStatus: currentStatus, actualStatus: currentStatusInDb } };
      }

      // 3. Idempotency check via requestId
      if (requestId) {
        const [existing] = await tx.select({ id: documentWorkflowHistory.id })
          .from(documentWorkflowHistory)
          .where(eq(documentWorkflowHistory.requestId, requestId));
        if (existing) {
          return { success: true, code: 'ALREADY_PROCESSED', message: 'Action already processed', historyId: existing.id, newStatus: currentStatus };
        }
      }

      // 4. Find valid transition
      const [transition] = await tx
        .select()
        .from(workflowTransitions)
        .where(
          and(
            eq(workflowTransitions.tenantId, tenantId),
            eq(workflowTransitions.docType, docType),
            eq(workflowTransitions.fromStatusCode, currentStatus),
            eq(workflowTransitions.actionName, action),
            eq(workflowTransitions.isActive, true)
          )
        );

      if (!transition) {
        return {
          success: false,
          code: 'INVALID_TRANSITION',
          message: `Action "${action}" is not allowed from status "${currentStatus}" for document type "${docType}"`,
          details: { docType, docId, action, currentStatus },
        };
      }

      // 4b. Period lock check for voucher posting
      if (docType === 'voucher' && transition.toStatusCode === 'POSTED') {
        const [voucherDoc] = await tx.select({ 
          voucherDate: vouchers.voucherDate 
        }).from(vouchers).where(and(eq(vouchers.id, docId), eq(vouchers.tenantId, tenantId)));
        
        if (voucherDoc?.voucherDate) {
          const { checkPeriodLock } = await import('./periodLockService');
          const periodCheck = await checkPeriodLock(tenantId, voucherDoc.voucherDate);
          
          if (periodCheck.blocked) {
            if (isOverride) {
              if (!overrideReason && !reason) {
                return {
                  success: false,
                  code: 'OVERRIDE_REASON_REQUIRED',
                  message: 'An override reason is required to post into a closed accounting period.',
                  details: {
                    periodId: periodCheck.periodId,
                    periodName: periodCheck.periodName,
                    periodStart: periodCheck.periodStart,
                    periodEnd: periodCheck.periodEnd,
                    postingDate: periodCheck.postingDate,
                    docType,
                    docId,
                    action,
                  },
                };
              }
              const overridePerm = await checkPermission(userId, tenantId, 'accounts:period:override_post');
              if (!overridePerm.allowed) {
                return {
                  success: false,
                  code: 'PERMISSION_DENIED',
                  message: 'You do not have permission to override the closed period restriction',
                  details: { docType, docId, action, requiredPermission: 'accounts:period:override_post' },
                };
              }
              const { logAudit } = await import('./auditService');
              await logAudit({
                tenantId,
                entityType: 'voucher',
                entityId: docId,
                action: 'PERIOD_OVERRIDE',
                performedBy: userId,
                metadata: {
                  periodId: periodCheck.periodId,
                  periodName: periodCheck.periodName,
                  overrideReason: overrideReason || reason || 'No reason provided',
                },
                ipAddress,
              }).catch(console.error);
            } else {
              return {
                success: false,
                code: 'PERIOD_CLOSED',
                message: periodCheck.message || 'Posting blocked: accounting period is closed.',
                details: {
                  periodId: periodCheck.periodId,
                  periodName: periodCheck.periodName,
                  periodStart: periodCheck.periodStart,
                  periodEnd: periodCheck.periodEnd,
                  postingDate: periodCheck.postingDate,
                  docType,
                  docId,
                  action,
                },
              };
            }
          }
        }
      }

      // 5. Permission checks (read-only lookups, safe to use external services)
      if (!isOverride && transition.requiredPermissionKey) {
        const permResult = await checkPermission(userId, tenantId, transition.requiredPermissionKey);
        if (!permResult.allowed) {
          return {
            success: false,
            code: 'PERMISSION_DENIED',
            message: permResult.reason || 'You do not have permission to perform this action',
            details: { docType, docId, action, requiredPermission: transition.requiredPermissionKey },
          };
        }
      }

      const sodResult = await checkSoD(tenantId, docType, docId, action, userId);
      if (!sodResult.allowed && !isOverride) {
        return {
          success: false,
          code: 'SOD_CONFLICT',
          message: `Segregation of Duties conflict: you already performed "${sodResult.conflictingAction}" on this document`,
          details: { docType, docId, action, conflictingAction: sodResult.conflictingAction },
        };
      }

      // 6. Approval matrix checks
      if (amount !== undefined && action.toLowerCase() === 'approve') {
        const matrixRules = await checkApprovalMatrix(docType, amount, tenantId);
        if (matrixRules.length > 0 && !isOverride) {
          const userRolesList = await getUserRoles(userId, tenantId);
          const userRoleIds = new Set(userRolesList.map((r) => r.id));
          const hasApprovalAuthority = matrixRules.some((rule) => {
            if (rule.ruleType === 'ROLE' && rule.requiredRoleId) {
              return userRoleIds.has(rule.requiredRoleId);
            }
            if (rule.ruleType === 'USER' && rule.requiredUserId) {
              return rule.requiredUserId === userId;
            }
            return true;
          });

          if (!hasApprovalAuthority) {
            return {
              success: false,
              code: 'APPROVAL_AUTHORITY_EXCEEDED',
              message: 'Amount exceeds your approval authority',
              details: { docType, docId, action, amount },
            };
          }
        }
      }

      // 7. Multi-approval logic (inline approval progress check using tx)
      if (action === 'approve') {
        const matrixRules = await checkApprovalMatrix(docType, amount || 0, tenantId);
        if (matrixRules.length > 0) {
          const rule = matrixRules[0];
          if (rule.approvalMode === 'ALL_REQUIRED' && rule.requiredCount > 1) {
            const approvals = await tx.select({
              userId: documentWorkflowHistory.performedBy,
              roleId: documentWorkflowHistory.actorRoleId,
              at: documentWorkflowHistory.performedAt,
            })
            .from(documentWorkflowHistory)
            .where(and(
              eq(documentWorkflowHistory.tenantId, tenantId),
              eq(documentWorkflowHistory.docType, docType),
              eq(documentWorkflowHistory.docId, docId),
              eq(documentWorkflowHistory.action, 'approve'),
              eq(documentWorkflowHistory.toStatus, 'APPROVED')
            ));

            const uniqueApprovers = new Map<number, { userId: number; roleId?: number | null; at: Date }>();
            for (const a of approvals) {
              if (!uniqueApprovers.has(a.userId)) {
                uniqueApprovers.set(a.userId, a);
              }
            }
            const progressCount = uniqueApprovers.size;
            const newCount = progressCount + 1;

            if (uniqueApprovers.has(userId)) {
              return { success: false, code: 'ALREADY_APPROVED', message: 'You have already approved this document', details: { docType, docId, action } };
            }

            if (newCount < rule.requiredCount) {
              const userRolesResult = await getUserRoles(userId, tenantId);
              const primaryRole = userRolesResult[0];

              await tx.insert(documentWorkflowHistory).values({
                tenantId,
                docType,
                docId,
                action: 'approve',
                controlStep: 'approver',
                fromStatus: currentStatus,
                toStatus: 'APPROVED',
                performedBy: userId,
                actorRoleId: primaryRole?.id || null,
                comments: comments || null,
                reason: reason || null,
                isOverride: isOverride || false,
                overrideReason: overrideReason || null,
                ipAddress: ipAddress || null,
                amountAtAction: amount ? String(amount) : null,
                metadata: { partialApproval: true, currentCount: newCount, requiredCount: rule.requiredCount },
                requestId: requestId || null,
              });

              return {
                success: true,
                message: `Approval recorded (${newCount}/${rule.requiredCount} required). Document remains at ${currentStatus} until all approvals are collected.`,
                newStatus: currentStatus,
              };
            }
          }
        }
      }

      // 8. Determine actor role
      const userRolesList = await getUserRoles(userId, tenantId);
      let actorRoleId: number | null = null;
      if (userRolesList.length > 0) {
        const primaryRole = userRolesList.find((r) => r.isPrimary);
        if (primaryRole) {
          actorRoleId = primaryRole.id;
        } else {
          const sorted = [...userRolesList].sort((a, b) => (a.level ?? 999) - (b.level ?? 999));
          actorRoleId = sorted[0].id;
        }
      }

      const controlStep = deriveControlStep(action, currentStatus);

      // 9. Insert workflow history
      const [historyEntry] = await tx
        .insert(documentWorkflowHistory)
        .values({
          tenantId,
          docType,
          docId,
          action,
          controlStep,
          fromStatus: currentStatus,
          toStatus: transition.toStatusCode,
          performedBy: userId,
          actorRoleId,
          comments: comments || null,
          reason: reason || null,
          isOverride: isOverride || false,
          overrideReason: overrideReason || null,
          ipAddress: ipAddress || null,
          amountAtAction: amount !== undefined ? String(amount) : null,
          requestId: requestId || null,
        })
        .returning();

      // 10. Update document workflowStatus inline
      switch (docType) {
        case 'quotation':
          await tx.update(quotations).set({ workflowStatus: transition.toStatusCode }).where(eq(quotations.id, docId));
          break;
        case 'purchase_order':
          await tx.update(purchaseOrders).set({ workflowStatus: transition.toStatusCode }).where(eq(purchaseOrders.id, docId));
          break;
        case 'voucher':
          await tx.update(vouchers).set({ workflowStatus: transition.toStatusCode }).where(eq(vouchers.id, docId));
          break;
        case 'grn':
          await tx.update(goodsReceivingNotes).set({ workflowStatus: transition.toStatusCode }).where(eq(goodsReceivingNotes.id, docId));
          break;
      }

      return {
        success: true,
        newStatus: transition.toStatusCode,
        message: `Action "${action}" performed successfully`,
        historyId: historyEntry.id,
      };
    });

    if (result.success && isSuperUserAction) {
      try {
        const { logAudit } = await import('./auditService');
        await logAudit({
          tenantId,
          entityType: docType,
          entityId: docId,
          action: 'SUPER_USER_OVERRIDE',
          performedBy: userId,
          ipAddress,
          metadata: {
            workflowAction: action,
            fromStatus: currentStatus,
            toStatus: result.newStatus,
            autoOverride: true,
          },
          visibility: 'super_user_only',
        });
      } catch (err) {
        console.error('[WORKFLOW] Failed to log super user override audit:', err);
      }
    }

    // Post-transaction: sync legacy status, workflow instance, and task/notifications (non-critical)
    if (result.success && result.newStatus && result.newStatus !== currentStatus) {
      await syncLegacyStatus(docType, docId, result.newStatus).catch((err) => {
        console.error('[WORKFLOW] Failed to sync legacy status:', err);
      });

      try {
        const { handleWorkflowTransitionNotifications } = await import('./taskNotificationService');
        await handleWorkflowTransitionNotifications(
          tenantId, docType, docId, action, userId, result.newStatus!
        );
      } catch (err) {
        console.error('[WORKFLOW] Failed to create workflow tasks/notifications:', err);
      }

      try {
        let instanceId: number | null = null;
        switch (docType) {
          case 'quotation': {
            const [doc] = await db.select({ wid: quotations.workflowInstanceId }).from(quotations).where(eq(quotations.id, docId));
            instanceId = doc?.wid || null;
            break;
          }
          case 'purchase_order': {
            const [doc] = await db.select({ wid: purchaseOrders.workflowInstanceId }).from(purchaseOrders).where(eq(purchaseOrders.id, docId));
            instanceId = doc?.wid || null;
            break;
          }
          case 'voucher': {
            const [doc] = await db.select({ wid: vouchers.workflowInstanceId }).from(vouchers).where(eq(vouchers.id, docId));
            instanceId = doc?.wid || null;
            break;
          }
          case 'grn': {
            const [doc] = await db.select({ wid: goodsReceivingNotes.workflowInstanceId }).from(goodsReceivingNotes).where(eq(goodsReceivingNotes.id, docId));
            instanceId = doc?.wid || null;
            break;
          }
        }
        if (instanceId) {
          await updateWorkflowInstanceStatus(instanceId, result.newStatus);
        }
      } catch (err) {
        console.error('[WORKFLOW] Failed to update workflow instance:', err);
      }
    }

    return result;
  } catch (error) {
    console.error('[WORKFLOW] Error performing action:', error);
    return {
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred while performing the action',
      details: { docType, docId, action },
    };
  }
}

async function updateDocumentWorkflowStatus(docType: string, docId: number, newStatus: string): Promise<void> {
  switch (docType) {
    case 'quotation':
      await db.update(quotations).set({ workflowStatus: newStatus }).where(eq(quotations.id, docId));
      break;
    case 'purchase_order':
      await db.update(purchaseOrders).set({ workflowStatus: newStatus }).where(eq(purchaseOrders.id, docId));
      break;
    case 'voucher':
      await db.update(vouchers).set({ workflowStatus: newStatus }).where(eq(vouchers.id, docId));
      break;
    case 'grn': {
      await db.update(goodsReceivingNotes).set({ workflowStatus: newStatus }).where(eq(goodsReceivingNotes.id, docId));
      break;
    }
    default:
      console.warn(`[WORKFLOW] No status update handler for docType: ${docType}`);
  }
}

export async function getDocumentHistory(
  docType: string,
  docId: number,
  tenantId: number
): Promise<any[]> {
  try {
    const history = await db
      .select({
        id: documentWorkflowHistory.id,
        docType: documentWorkflowHistory.docType,
        docId: documentWorkflowHistory.docId,
        action: documentWorkflowHistory.action,
        controlStep: documentWorkflowHistory.controlStep,
        fromStatus: documentWorkflowHistory.fromStatus,
        toStatus: documentWorkflowHistory.toStatus,
        performedBy: documentWorkflowHistory.performedBy,
        performerFirstName: users.firstName,
        performerLastName: users.lastName,
        performerUsername: users.username,
        actorRoleId: documentWorkflowHistory.actorRoleId,
        actorRoleName: roles.displayName,
        performedAt: documentWorkflowHistory.performedAt,
        comments: documentWorkflowHistory.comments,
        reason: documentWorkflowHistory.reason,
        isOverride: documentWorkflowHistory.isOverride,
        overrideReason: documentWorkflowHistory.overrideReason,
        ipAddress: documentWorkflowHistory.ipAddress,
        amountAtAction: documentWorkflowHistory.amountAtAction,
        metadata: documentWorkflowHistory.metadata,
      })
      .from(documentWorkflowHistory)
      .leftJoin(users, eq(documentWorkflowHistory.performedBy, users.id))
      .leftJoin(roles, eq(documentWorkflowHistory.actorRoleId, roles.id))
      .where(
        and(
          eq(documentWorkflowHistory.tenantId, tenantId),
          eq(documentWorkflowHistory.docType, docType),
          eq(documentWorkflowHistory.docId, docId)
        )
      )
      .orderBy(desc(documentWorkflowHistory.performedAt));

    return history.map((h) => ({
      ...h,
      performerName: [h.performerFirstName, h.performerLastName].filter(Boolean).join(' ') || h.performerUsername || 'Unknown',
    }));
  } catch (error) {
    console.error('[WORKFLOW] Error getting document history:', error);
    throw new Error('Failed to retrieve document history');
  }
}

export async function acquireLock(
  docType: string,
  docId: number,
  userId: number,
  tenantId: number,
  durationMinutes: number = 5,
  reason?: string
): Promise<{ locked: boolean; lockToken?: string; expiresAt?: Date; lockedBy?: string }> {
  try {
    const now = new Date();

    await db
      .delete(documentLocks)
      .where(
        and(
          eq(documentLocks.docType, docType),
          eq(documentLocks.docId, docId),
          eq(documentLocks.tenantId, tenantId),
          lte(documentLocks.expiresAt, now)
        )
      );

    const existingLocks = await db
      .select({
        id: documentLocks.id,
        lockedBy: documentLocks.lockedBy,
        lockToken: documentLocks.lockToken,
        expiresAt: documentLocks.expiresAt,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(documentLocks)
      .leftJoin(users, eq(documentLocks.lockedBy, users.id))
      .where(
        and(
          eq(documentLocks.docType, docType),
          eq(documentLocks.docId, docId),
          eq(documentLocks.tenantId, tenantId)
        )
      );

    if (existingLocks.length > 0) {
      const existingLock = existingLocks[0];

      if (existingLock.lockedBy !== userId) {
        const lockedByName = [existingLock.firstName, existingLock.lastName].filter(Boolean).join(' ') || existingLock.username || 'Another user';
        return {
          locked: false,
          lockedBy: lockedByName,
          expiresAt: existingLock.expiresAt,
        };
      }

      const newToken = crypto.randomUUID();
      const newExpiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
      await db
        .update(documentLocks)
        .set({
          lockToken: newToken,
          expiresAt: newExpiresAt,
          lockReason: reason || undefined,
        })
        .where(eq(documentLocks.id, existingLock.id));

      return { locked: true, lockToken: newToken, expiresAt: newExpiresAt };
    }

    const lockToken = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

    await db
      .insert(documentLocks)
      .values({
        docType,
        docId,
        lockedBy: userId,
        lockToken,
        expiresAt,
        lockReason: reason || null,
        tenantId,
      });

    return { locked: true, lockToken, expiresAt };
  } catch (error) {
    console.error('[WORKFLOW] Error acquiring lock:', error);
    throw new Error('Failed to acquire document lock');
  }
}

export async function releaseLock(
  docType: string,
  docId: number,
  userId: number,
  tenantId: number,
  lockToken?: string
): Promise<{ released: boolean; message: string }> {
  try {
    const conditions = [
      eq(documentLocks.docType, docType),
      eq(documentLocks.docId, docId),
      eq(documentLocks.tenantId, tenantId),
      eq(documentLocks.lockedBy, userId),
    ];

    if (lockToken) {
      conditions.push(eq(documentLocks.lockToken, lockToken));
    }

    const [deleted] = await db
      .delete(documentLocks)
      .where(and(...conditions))
      .returning();

    if (!deleted) {
      return { released: false, message: 'No matching lock found to release' };
    }

    return { released: true, message: 'Lock released successfully' };
  } catch (error) {
    console.error('[WORKFLOW] Error releasing lock:', error);
    throw new Error('Failed to release document lock');
  }
}

export async function forceUnlock(
  docType: string,
  docId: number,
  userId: number,
  tenantId: number,
  reason: string
): Promise<{ unlocked: boolean; message: string }> {
  try {
    const [deleted] = await db
      .delete(documentLocks)
      .where(
        and(
          eq(documentLocks.docType, docType),
          eq(documentLocks.docId, docId),
          eq(documentLocks.tenantId, tenantId)
        )
      )
      .returning();

    if (!deleted) {
      return { unlocked: false, message: 'No lock found on this document' };
    }

    await db.insert(documentWorkflowHistory).values({
      tenantId,
      docType,
      docId,
      action: 'force_unlock',
      controlStep: 'admin',
      fromStatus: 'LOCKED',
      toStatus: 'UNLOCKED',
      performedBy: userId,
      isOverride: true,
      overrideReason: reason,
      comments: `Force unlocked by admin. Previous lock held by user ID ${deleted.lockedBy}`,
    });

    return { unlocked: true, message: 'Document force unlocked successfully' };
  } catch (error) {
    console.error('[WORKFLOW] Error force unlocking:', error);
    throw new Error('Failed to force unlock document');
  }
}

export async function checkApprovalMatrix(
  docType: string,
  amount: number,
  tenantId: number
): Promise<any[]> {
  try {
    const amountStr = String(amount);

    const rules = await db
      .select()
      .from(approvalMatrix)
      .where(
        and(
          eq(approvalMatrix.tenantId, tenantId),
          eq(approvalMatrix.docType, docType),
          eq(approvalMatrix.isActive, true),
          lte(approvalMatrix.minAmount, amountStr),
          or(
            isNull(approvalMatrix.maxAmount),
            gte(approvalMatrix.maxAmount, amountStr)
          )
        )
      )
      .orderBy(desc(approvalMatrix.approvalLevel));

    return rules;
  } catch (error) {
    console.error('[WORKFLOW] Error checking approval matrix:', error);
    throw new Error('Failed to check approval matrix');
  }
}

export async function getDocumentStatus(statusCode: string) {
  try {
    const [status] = await db
      .select()
      .from(documentStatuses)
      .where(eq(documentStatuses.code, statusCode));

    return status || null;
  } catch (error) {
    console.error('[WORKFLOW] Error getting document status:', error);
    throw new Error('Failed to retrieve document status');
  }
}
