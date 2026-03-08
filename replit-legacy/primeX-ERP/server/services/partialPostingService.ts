import { db } from '../db';
import { grnItems, goodsReceivingNotes } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export type PostingStatus = 'NOT_POSTED' | 'PARTIALLY_POSTED' | 'POSTED';

export async function calculateGrnPostingStatus(grnId: number): Promise<{
  status: PostingStatus;
  lines: Array<{
    itemId: number;
    ordered: number;
    received: number;
    posted: number;
    remaining: number;
  }>;
  summary: {
    totalOrdered: number;
    totalReceived: number;
    totalPosted: number;
    percentPosted: number;
  };
}> {
  const items = await db.select()
    .from(grnItems)
    .where(eq(grnItems.grnId, grnId));
  
  let totalOrdered = 0;
  let totalReceived = 0;
  let totalPosted = 0;
  
  const lines = items.map(item => {
    const ordered = parseFloat(item.orderedQuantity || '0');
    const received = parseFloat(item.receivedQuantity || '0');
    const posted = parseFloat(item.postedQuantity || '0');
    const effectiveQty = received > 0 ? received : ordered;
    
    totalOrdered += ordered;
    totalReceived += received;
    totalPosted += posted;
    
    return {
      itemId: item.itemId,
      ordered,
      received,
      posted,
      remaining: effectiveQty - posted,
    };
  });
  
  let status: PostingStatus;
  if (totalPosted === 0) {
    status = 'NOT_POSTED';
  } else if (totalPosted >= totalReceived && totalReceived > 0) {
    status = 'POSTED';
  } else {
    status = 'PARTIALLY_POSTED';
  }
  
  return {
    status,
    lines,
    summary: {
      totalOrdered,
      totalReceived,
      totalPosted,
      percentPosted: totalReceived > 0 ? Math.round((totalPosted / totalReceived) * 100) : 0,
    },
  };
}

export async function postGrnLineItem(
  grnId: number, grnItemId: number, quantityToPost: number
): Promise<{ success: boolean; newStatus: PostingStatus; message: string }> {
  const [item] = await db.select()
    .from(grnItems)
    .where(eq(grnItems.id, grnItemId));
  
  if (!item) {
    return { success: false, newStatus: 'NOT_POSTED', message: 'GRN item not found' };
  }
  
  const received = parseFloat(item.receivedQuantity || '0');
  const currentPosted = parseFloat(item.postedQuantity || '0');
  const newPosted = currentPosted + quantityToPost;
  
  if (newPosted > received) {
    return {
      success: false,
      newStatus: 'PARTIALLY_POSTED',
      message: `Cannot post ${quantityToPost}. Only ${received - currentPosted} remaining to post.`,
    };
  }
  
  await db.update(grnItems)
    .set({ postedQuantity: String(newPosted) })
    .where(eq(grnItems.id, grnItemId));
  
  const { status } = await calculateGrnPostingStatus(grnId);
  
  const workflowStatus = status === 'POSTED' ? 'POSTED' : 
                          status === 'PARTIALLY_POSTED' ? 'PARTIALLY_POSTED' : 'APPROVED';
  
  await db.update(goodsReceivingNotes)
    .set({ workflowStatus })
    .where(eq(goodsReceivingNotes.id, grnId));
  
  return {
    success: true,
    newStatus: status,
    message: `Posted ${quantityToPost} units. GRN status: ${status}`,
  };
}

export async function getGrnPostingProgress(grnId: number) {
  return calculateGrnPostingStatus(grnId);
}
