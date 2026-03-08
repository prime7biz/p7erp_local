import { db } from '../db';
import { documentRefs } from '@shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

export async function addRef(
  tenantId: number,
  entityType: string,
  entityId: number,
  refType: string,
  refValue: string,
) {
  const existing = await db.select().from(documentRefs)
    .where(and(
      eq(documentRefs.tenantId, tenantId),
      eq(documentRefs.entityType, entityType),
      eq(documentRefs.entityId, entityId),
      eq(documentRefs.refType, refType),
      eq(documentRefs.refValue, refValue),
    ));
  if (existing.length > 0) return existing[0];

  const [ref] = await db.insert(documentRefs).values({
    tenantId,
    entityType,
    entityId,
    refType,
    refValue,
  }).returning();
  return ref;
}

export async function searchByRef(tenantId: number, query: string) {
  if (!query || query.length < 2) return [];

  const results = await db.select().from(documentRefs)
    .where(and(
      eq(documentRefs.tenantId, tenantId),
      sql`LOWER(${documentRefs.refValue}) LIKE LOWER(${'%' + query + '%'})`,
    ))
    .orderBy(desc(documentRefs.createdAt))
    .limit(50);

  const grouped: Record<string, Array<typeof results[0]>> = {};
  for (const r of results) {
    const key = `${r.entityType}:${r.entityId}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  return Object.entries(grouped).map(([key, refs]) => ({
    entityType: refs[0].entityType,
    entityId: refs[0].entityId,
    refs: refs.map(r => ({ refType: r.refType, refValue: r.refValue })),
  }));
}

export async function getRefsForEntity(tenantId: number, entityType: string, entityId: number) {
  return db.select().from(documentRefs)
    .where(and(
      eq(documentRefs.tenantId, tenantId),
      eq(documentRefs.entityType, entityType),
      eq(documentRefs.entityId, entityId),
    ));
}
