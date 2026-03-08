import { db } from '../db';
import { workflowDefinitions, workflowInstances, quotations, purchaseOrders, vouchers } from '@shared/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';

export async function createWorkflowInstance(
  tenantId: number, docType: string, docId: number
): Promise<number | null> {
  try {
    const [definition] = await db.select()
      .from(workflowDefinitions)
      .where(and(
        eq(workflowDefinitions.tenantId, tenantId),
        eq(workflowDefinitions.docType, docType),
        eq(workflowDefinitions.isActive, true)
      ))
      .orderBy(desc(workflowDefinitions.version))
      .limit(1);

    if (!definition) {
      const [newDef] = await db.insert(workflowDefinitions)
        .values({
          tenantId,
          docType,
          version: 1,
          definitionJson: { type: 'standard', states: ['DRAFT','SUBMITTED','CHECKED','RECOMMENDED','APPROVED','POSTED','CLOSED','REJECTED','CANCELLED'] },
          isActive: true,
        })
        .onConflictDoNothing()
        .returning();
      
      if (!newDef) {
        const [existing] = await db.select()
          .from(workflowDefinitions)
          .where(and(
            eq(workflowDefinitions.tenantId, tenantId),
            eq(workflowDefinitions.docType, docType),
            eq(workflowDefinitions.isActive, true)
          ))
          .limit(1);
        if (!existing) return null;
        
        const [instance] = await db.insert(workflowInstances)
          .values({
            tenantId,
            docType,
            docId,
            workflowDefinitionId: existing.id,
            currentStatus: 'DRAFT',
          })
          .returning();
        return instance?.id || null;
      }
      
      const [instance] = await db.insert(workflowInstances)
        .values({
          tenantId,
          docType,
          docId,
          workflowDefinitionId: newDef.id,
          currentStatus: 'DRAFT',
        })
        .returning();
      return instance?.id || null;
    }

    const [instance] = await db.insert(workflowInstances)
      .values({
        tenantId,
        docType,
        docId,
        workflowDefinitionId: definition.id,
        currentStatus: 'DRAFT',
      })
      .returning();
    
    return instance?.id || null;
  } catch (error) {
    console.error(`[WORKFLOW-INSTANCE] Failed to create instance for ${docType}#${docId}:`, error);
    return null;
  }
}

export async function updateWorkflowInstanceStatus(
  instanceId: number, newStatus: string, ownerRoleId?: number
): Promise<void> {
  try {
    const isTerminal = ['POSTED', 'CLOSED', 'REJECTED', 'CANCELLED', 'AMENDED'].includes(newStatus);
    await db.update(workflowInstances)
      .set({
        currentStatus: newStatus,
        currentOwnerRoleId: ownerRoleId || null,
        ...(isTerminal ? { completedAt: new Date() } : {}),
      })
      .where(eq(workflowInstances.id, instanceId));
  } catch (error) {
    console.error(`[WORKFLOW-INSTANCE] Failed to update instance ${instanceId}:`, error);
  }
}

export async function linkInstanceToDocument(
  docType: string, docId: number, instanceId: number
): Promise<void> {
  try {
    switch (docType) {
      case 'quotation':
        await db.update(quotations)
          .set({ workflowInstanceId: instanceId })
          .where(eq(quotations.id, docId));
        break;
      case 'purchase_order':
        await db.update(purchaseOrders)
          .set({ workflowInstanceId: instanceId })
          .where(eq(purchaseOrders.id, docId));
        break;
      case 'voucher':
        await db.update(vouchers)
          .set({ workflowInstanceId: instanceId })
          .where(eq(vouchers.id, docId));
        break;
    }
  } catch (error) {
    console.error(`[WORKFLOW-INSTANCE] Failed to link instance ${instanceId} to ${docType}#${docId}:`, error);
  }
}

export async function initializeDocumentWorkflow(
  tenantId: number, docType: string, docId: number
): Promise<number | null> {
  const instanceId = await createWorkflowInstance(tenantId, docType, docId);
  if (instanceId) {
    await linkInstanceToDocument(docType, docId, instanceId);
    console.log(`[WORKFLOW-INSTANCE] Initialized workflow for ${docType}#${docId}, instance: ${instanceId}`);
  }
  return instanceId;
}

export async function backfillWorkflowInstances(tenantId: number): Promise<{ created: number }> {
  let created = 0;
  
  const unlinkedQuotations = await db.select({ id: quotations.id, workflowStatus: quotations.workflowStatus })
    .from(quotations)
    .where(and(
      eq(quotations.tenantId, tenantId),
      isNull(quotations.workflowInstanceId)
    ));
  
  for (const doc of unlinkedQuotations) {
    const instanceId = await createWorkflowInstance(tenantId, 'quotation', doc.id);
    if (instanceId) {
      await linkInstanceToDocument('quotation', doc.id, instanceId);
      if (doc.workflowStatus && doc.workflowStatus !== 'DRAFT') {
        await updateWorkflowInstanceStatus(instanceId, doc.workflowStatus);
      }
      created++;
    }
  }
  
  const unlinkedPOs = await db.select({ id: purchaseOrders.id, workflowStatus: purchaseOrders.workflowStatus })
    .from(purchaseOrders)
    .where(and(
      eq(purchaseOrders.tenantId, tenantId),
      isNull(purchaseOrders.workflowInstanceId)
    ));
  
  for (const doc of unlinkedPOs) {
    const instanceId = await createWorkflowInstance(tenantId, 'purchase_order', doc.id);
    if (instanceId) {
      await linkInstanceToDocument('purchase_order', doc.id, instanceId);
      if (doc.workflowStatus && doc.workflowStatus !== 'DRAFT') {
        await updateWorkflowInstanceStatus(instanceId, doc.workflowStatus);
      }
      created++;
    }
  }
  
  const unlinkedVouchers = await db.select({ id: vouchers.id, workflowStatus: vouchers.workflowStatus })
    .from(vouchers)
    .where(and(
      eq(vouchers.tenantId, tenantId),
      isNull(vouchers.workflowInstanceId)
    ));
  
  for (const doc of unlinkedVouchers) {
    const instanceId = await createWorkflowInstance(tenantId, 'voucher', doc.id);
    if (instanceId) {
      await linkInstanceToDocument('voucher', doc.id, instanceId);
      if (doc.workflowStatus && doc.workflowStatus !== 'DRAFT') {
        await updateWorkflowInstanceStatus(instanceId, doc.workflowStatus);
      }
      created++;
    }
  }
  
  console.log(`[WORKFLOW-INSTANCE] Backfilled ${created} instances for tenant ${tenantId}`);
  return { created };
}
