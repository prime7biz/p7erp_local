import { db } from '../db';
import { entityEvents } from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export async function logEvent(
  tenantId: number,
  entityType: string,
  entityId: number,
  eventType: string,
  payload: any,
  summary: string,
  userId?: number,
) {
  const [event] = await db.insert(entityEvents).values({
    tenantId,
    entityType,
    entityId,
    eventType,
    payload: payload || {},
    summary,
    createdBy: userId || null,
  }).returning();
  return event;
}

export async function getTimeline(tenantId: number, entityType: string, entityId: number) {
  return db.select().from(entityEvents)
    .where(and(
      eq(entityEvents.tenantId, tenantId),
      eq(entityEvents.entityType, entityType),
      eq(entityEvents.entityId, entityId),
    ))
    .orderBy(desc(entityEvents.createdAt));
}

export async function getRelatedTimeline(tenantId: number, entityPairs: Array<{ entityType: string; entityId: number }>) {
  if (entityPairs.length === 0) return [];
  
  const conditions = entityPairs.map(p =>
    sql`(${entityEvents.entityType} = ${p.entityType} AND ${entityEvents.entityId} = ${p.entityId})`
  );
  const combined = sql.join(conditions, sql` OR `);

  return db.select().from(entityEvents)
    .where(and(eq(entityEvents.tenantId, tenantId), combined))
    .orderBy(desc(entityEvents.createdAt))
    .limit(100);
}

export async function getRecentEvents(tenantId: number, limit: number = 50) {
  return db.select().from(entityEvents)
    .where(eq(entityEvents.tenantId, tenantId))
    .orderBy(desc(entityEvents.createdAt))
    .limit(limit);
}
