import { db } from '../db';
import { quotations, purchaseOrders, vouchers, voucherStatus } from '@shared/schema';
import { eq } from 'drizzle-orm';

const WORKFLOW_TO_LEGACY: Record<string, Record<string, string>> = {
  quotation: {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    CHECKED: 'checked',
    RECOMMENDED: 'recommended',
    APPROVED: 'approved',
    POSTED: 'confirmed',
    CLOSED: 'closed',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
    AMENDED: 'amended',
  },
  purchase_order: {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    CHECKED: 'checked',
    RECOMMENDED: 'recommended',
    APPROVED: 'approved',
    POSTED: 'ordered',
    CLOSED: 'closed',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
    AMENDED: 'amended',
    PARTIALLY_POSTED: 'partially_received',
  },
  voucher: {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    CHECKED: 'checked',
    RECOMMENDED: 'recommended',
    APPROVED: 'approved',
    POSTED: 'posted',
    CLOSED: 'closed',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
    AMENDED: 'amended',
  },
  sales_order: {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    CHECKED: 'checked',
    APPROVED: 'approved',
    POSTED: 'confirmed',
    CLOSED: 'closed',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
  },
  grn: {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    CHECKED: 'checked',
    APPROVED: 'approved',
    POSTED: 'posted',
    CLOSED: 'closed',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
    PARTIALLY_POSTED: 'partially_posted',
  },
  gin: {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    CHECKED: 'checked',
    APPROVED: 'approved',
    POSTED: 'posted',
    CLOSED: 'closed',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
    PARTIALLY_POSTED: 'partially_posted',
  },
};

const LEGACY_TO_WORKFLOW: Record<string, Record<string, string>> = {};
for (const [docType, mapping] of Object.entries(WORKFLOW_TO_LEGACY)) {
  LEGACY_TO_WORKFLOW[docType] = {};
  for (const [wf, legacy] of Object.entries(mapping)) {
    LEGACY_TO_WORKFLOW[docType][legacy] = wf;
  }
}

/**
 * Convert workflowStatus to legacy status string for a document type.
 * @deprecated Legacy status fields will be removed in a future version.
 */
export function workflowToLegacyStatus(docType: string, workflowStatus: string): string {
  return WORKFLOW_TO_LEGACY[docType]?.[workflowStatus] || workflowStatus.toLowerCase();
}

/**
 * Convert legacy status string to workflowStatus code.
 * @deprecated Legacy status fields will be removed in a future version.
 */
export function legacyToWorkflowStatus(docType: string, legacyStatus: string): string {
  return LEGACY_TO_WORKFLOW[docType]?.[legacyStatus] || legacyStatus.toUpperCase();
}

/**
 * Sync legacy status fields when workflowStatus changes.
 * Called by the workflow engine after a status transition.
 * @deprecated Will be removed when legacy status fields are dropped.
 */
export async function syncLegacyStatus(
  docType: string, docId: number, workflowStatus: string
): Promise<void> {
  const legacyStatus = workflowToLegacyStatus(docType, workflowStatus);
  
  try {
    switch (docType) {
      case 'quotation':
        await db.update(quotations)
          .set({ status: legacyStatus })
          .where(eq(quotations.id, docId));
        break;
      case 'purchase_order':
        await db.update(purchaseOrders)
          .set({ status: legacyStatus })
          .where(eq(purchaseOrders.id, docId));
        break;
      case 'voucher':
        const statusRecords = await db.select()
          .from(voucherStatus)
          .where(eq(voucherStatus.name, legacyStatus));
        if (statusRecords.length > 0) {
          await db.update(vouchers)
            .set({ statusId: statusRecords[0].id })
            .where(eq(vouchers.id, docId));
        }
        break;
      default:
        console.log(`[STATUS-MAPPER] No legacy sync for docType: ${docType}`);
    }
    console.log(`[STATUS-MAPPER] Synced ${docType}#${docId} legacy status to '${legacyStatus}'`);
  } catch (error) {
    console.error(`[STATUS-MAPPER] Failed to sync legacy status for ${docType}#${docId}:`, error);
  }
}
