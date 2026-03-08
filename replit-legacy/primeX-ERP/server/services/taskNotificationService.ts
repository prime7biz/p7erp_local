import { db } from '../db';
import { tasks, notifications, userRoles, roles, users, documentWorkflowHistory } from '@shared/schema';
import { eq, and, asc } from 'drizzle-orm';
import { pushNotificationToUser } from '../api/workflowTaskRoutes';

const ACTION_TO_NEXT_ROLE: Record<string, string> = {
  submit: 'officer',
  check: 'recommender',
  recommend: 'approver',
  approve: 'accounts_poster',
};

const ACTION_TO_TASK_TITLE: Record<string, string> = {
  submit: 'Review & Check',
  check: 'Review & Recommend',
  recommend: 'Review & Approve',
  approve: 'Post to Ledger',
};

const DOC_TYPE_DISPLAY: Record<string, string> = {
  quotation: 'Quotation',
  purchase_order: 'Purchase Order',
  voucher: 'Voucher',
  grn: 'GRN',
  sales_order: 'Sales Order',
};

async function getUsersWithRole(tenantId: number, roleName: string): Promise<number[]> {
  const results = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.tenantId, tenantId),
        eq(roles.name, roleName),
        eq(roles.tenantId, tenantId)
      )
    );

  return results.map(r => r.userId);
}

async function getDocumentCreator(tenantId: number, docType: string, docId: number): Promise<number | null> {
  const [entry] = await db
    .select({ performedBy: documentWorkflowHistory.performedBy })
    .from(documentWorkflowHistory)
    .where(
      and(
        eq(documentWorkflowHistory.tenantId, tenantId),
        eq(documentWorkflowHistory.docType, docType),
        eq(documentWorkflowHistory.docId, docId),
        eq(documentWorkflowHistory.action, 'create')
      )
    )
    .orderBy(asc(documentWorkflowHistory.performedAt))
    .limit(1);

  return entry?.performedBy ?? null;
}

export async function createWorkflowTask(
  tenantId: number,
  docType: string,
  docId: number,
  action: string,
  nextRoleKey: string,
  createdByUserId: number
): Promise<void> {
  try {
    const targetUserIds = await getUsersWithRole(tenantId, nextRoleKey);
    if (targetUserIds.length === 0) {
      console.log(`[TASK-NOTIFY] No users found with role "${nextRoleKey}" for tenant ${tenantId}`);
      return;
    }

    const docDisplay = DOC_TYPE_DISPLAY[docType] || docType;
    const taskTitle = ACTION_TO_TASK_TITLE[action] || `Action required on ${docDisplay}`;

    for (const userId of targetUserIds) {
      await db.insert(tasks).values({
        title: `${taskTitle}: ${docDisplay} #${docId}`,
        description: `${docDisplay} #${docId} requires your action. Please review and take the appropriate workflow step.`,
        priority: 'important',
        status: 'pending',
        completed: false,
        assignedTo: userId,
        createdBy: createdByUserId,
        tenantId,
        relatedEntityType: docType,
        relatedEntityId: docId,
        tags: ['workflow', docType, action],
      });
    }

    console.log(`[TASK-NOTIFY] Created ${targetUserIds.length} task(s) for role "${nextRoleKey}" on ${docType} #${docId}`);
  } catch (error) {
    console.error('[TASK-NOTIFY] Error creating workflow task:', error);
  }
}

export async function createNotification(
  tenantId: number,
  userId: number,
  title: string,
  body: string,
  meta?: { entityType?: string; entityId?: number }
): Promise<void> {
  try {
    await db.insert(notifications).values({
      tenantId,
      userId,
      notificationType: 'workflow',
      title,
      message: body,
      relatedEntityType: meta?.entityType || null,
      relatedEntityId: meta?.entityId || null,
      isRead: false,
      isSent: false,
    });

    pushNotificationToUser(userId, {
      title,
      message: body,
      entityType: meta?.entityType,
      entityId: meta?.entityId,
    });
  } catch (error) {
    console.error('[TASK-NOTIFY] Error creating notification:', error);
  }
}

export async function markWorkflowTasksDone(
  tenantId: number,
  docType: string,
  docId: number
): Promise<void> {
  try {
    await db
      .update(tasks)
      .set({
        status: 'completed',
        completed: true,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(tasks.tenantId, tenantId),
          eq(tasks.relatedEntityType, docType),
          eq(tasks.relatedEntityId, docId),
          eq(tasks.completed, false)
        )
      );

    console.log(`[TASK-NOTIFY] Marked tasks done for ${docType} #${docId}`);
  } catch (error) {
    console.error('[TASK-NOTIFY] Error marking tasks done:', error);
  }
}

export async function handleWorkflowTransitionNotifications(
  tenantId: number,
  docType: string,
  docId: number,
  action: string,
  performedByUserId: number,
  newStatus: string
): Promise<void> {
  const actionLower = action.toLowerCase();
  const docDisplay = DOC_TYPE_DISPLAY[docType] || docType;

  if (actionLower === 'post') {
    await markWorkflowTasksDone(tenantId, docType, docId);

    const creatorId = await getDocumentCreator(tenantId, docType, docId);
    if (creatorId) {
      await createNotification(
        tenantId,
        creatorId,
        `${docDisplay} #${docId} Posted`,
        `Your ${docDisplay} #${docId} has been posted successfully.`,
        { entityType: docType, entityId: docId }
      );
    }
    return;
  }

  if (actionLower === 'reject' || actionLower === 'send_back') {
    await markWorkflowTasksDone(tenantId, docType, docId);

    const creatorId = await getDocumentCreator(tenantId, docType, docId);
    if (creatorId) {
      const actionLabel = actionLower === 'reject' ? 'Rejected' : 'Returned';
      await createWorkflowTask(
        tenantId, docType, docId, actionLower, 'data_entry', performedByUserId
      );
      await createNotification(
        tenantId,
        creatorId,
        `${docDisplay} #${docId} ${actionLabel}`,
        `Your ${docDisplay} #${docId} has been ${actionLabel.toLowerCase()}. Please review and resubmit if needed.`,
        { entityType: docType, entityId: docId }
      );
    }
    return;
  }

  const nextRoleKey = ACTION_TO_NEXT_ROLE[actionLower];
  if (nextRoleKey) {
    await markWorkflowTasksDone(tenantId, docType, docId);

    await createWorkflowTask(
      tenantId, docType, docId, actionLower, nextRoleKey, performedByUserId
    );

    const targetUserIds = await getUsersWithRole(tenantId, nextRoleKey);
    for (const userId of targetUserIds) {
      await createNotification(
        tenantId,
        userId,
        `${docDisplay} #${docId} awaits your action`,
        `A ${docDisplay} has been ${actionLower}ed and is now awaiting your review (${newStatus}).`,
        { entityType: docType, entityId: docId }
      );
    }
  }
}
