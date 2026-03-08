import { db } from '../db';
import { auditLogs } from '@shared/schema';

interface AuditLogParams {
  tenantId: number;
  entityType: string;
  entityId: number;
  action: string;
  performedBy: number;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, any>;
  visibility?: 'all' | 'super_user_only';
}

function computeDiff(
  oldValues: Record<string, any> | null | undefined,
  newValues: Record<string, any> | null | undefined
): Record<string, { from: any; to: any }> | null {
  if (!oldValues || !newValues) return null;
  
  const diff: Record<string, { from: any; to: any }> = {};
  const allKeys = Array.from(new Set(Object.keys(oldValues).concat(Object.keys(newValues))));
  
  for (const key of allKeys) {
    if (key === 'updatedAt' || key === 'password') continue;
    const oldVal = oldValues[key];
    const newVal = newValues[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { from: oldVal, to: newVal };
    }
  }
  
  return Object.keys(diff).length > 0 ? diff : null;
}

export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    const diffJson = computeDiff(params.oldValues, params.newValues);
    
    const meta = {
      ...(params.metadata || {}),
      ...(params.visibility && params.visibility !== 'all' ? { visibility: params.visibility } : {}),
    };
    
    await db.insert(auditLogs).values({
      tenantId: params.tenantId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      performedBy: params.performedBy,
      oldValues: params.oldValues || null,
      newValues: params.newValues || null,
      diffJson: diffJson,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      requestId: params.requestId || null,
      metadata: Object.keys(meta).length > 0 ? meta : null,
    });
  } catch (error) {
    console.error('[AUDIT] Failed to log audit entry:', error);
  }
}

export async function logEditDiff(
  tenantId: number,
  entityType: string,
  entityId: number,
  performedBy: number,
  oldValues: Record<string, any>,
  newValues: Record<string, any>,
  req?: { ip?: string; headers?: Record<string, any> }
): Promise<void> {
  await logAudit({
    tenantId,
    entityType,
    entityId,
    action: 'UPDATE',
    performedBy,
    oldValues,
    newValues,
    ipAddress: req?.ip,
    userAgent: req?.headers?.['user-agent'],
  });
}

export async function logCreate(
  tenantId: number,
  entityType: string,
  entityId: number,
  performedBy: number,
  newValues: Record<string, any>,
  req?: { ip?: string; headers?: Record<string, any> }
): Promise<void> {
  await logAudit({
    tenantId,
    entityType,
    entityId,
    action: 'CREATE',
    performedBy,
    newValues,
    ipAddress: req?.ip,
    userAgent: req?.headers?.['user-agent'],
  });
}

export async function logDelete(
  tenantId: number,
  entityType: string,
  entityId: number,
  performedBy: number,
  oldValues: Record<string, any>,
  req?: { ip?: string; headers?: Record<string, any> }
): Promise<void> {
  await logAudit({
    tenantId,
    entityType,
    entityId,
    action: 'DELETE',
    performedBy,
    oldValues,
    ipAddress: req?.ip,
    userAgent: req?.headers?.['user-agent'],
  });
}

export async function getAuditHistory(
  tenantId: number,
  entityType: string,
  entityId: number,
  limit: number = 50,
  isSuperUser: boolean = false
): Promise<any[]> {
  const { eq, and, desc, ne } = await import('drizzle-orm');
  const { users } = await import('@shared/schema');
  
  const conditions = [
    eq(auditLogs.tenantId, tenantId),
    eq(auditLogs.entityType, entityType),
    eq(auditLogs.entityId, entityId),
  ];

  if (!isSuperUser) {
    conditions.push(ne(auditLogs.visibility, 'super_user_only'));
  }
  
  return db.select({
    id: auditLogs.id,
    entityType: auditLogs.entityType,
    entityId: auditLogs.entityId,
    action: auditLogs.action,
    performedBy: auditLogs.performedBy,
    performerUsername: users.username,
    performerFirstName: users.firstName,
    performerLastName: users.lastName,
    performedAt: auditLogs.performedAt,
    diffJson: auditLogs.diffJson,
    ipAddress: auditLogs.ipAddress,
    metadata: auditLogs.metadata,
    visibility: auditLogs.visibility,
  })
  .from(auditLogs)
  .leftJoin(users, eq(auditLogs.performedBy, users.id))
  .where(and(...conditions))
  .orderBy(desc(auditLogs.performedAt))
  .limit(limit);
}

export async function getActivityLogs(
  tenantId: number,
  isSuperUser: boolean,
  filters: {
    dateFrom?: string;
    dateTo?: string;
    userId?: number;
    action?: string;
    entityType?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<{ items: any[]; total: number }> {
  const { eq, and, desc, gte, lte, ilike, or, sql, count } = await import('drizzle-orm');
  const { users } = await import('@shared/schema');
  
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const offset = (page - 1) * pageSize;
  
  const conditions: any[] = [eq(auditLogs.tenantId, tenantId)];
  
  if (!isSuperUser) {
    const { ne } = await import('drizzle-orm');
    conditions.push(ne(auditLogs.visibility, 'super_user_only'));
  }
  
  if (filters.dateFrom) {
    conditions.push(gte(auditLogs.performedAt, new Date(filters.dateFrom)));
  }
  if (filters.dateTo) {
    const endDate = new Date(filters.dateTo);
    endDate.setHours(23, 59, 59, 999);
    conditions.push(lte(auditLogs.performedAt, endDate));
  }
  if (filters.userId) {
    conditions.push(eq(auditLogs.performedBy, filters.userId));
  }
  if (filters.action) {
    conditions.push(eq(auditLogs.action, filters.action));
  }
  if (filters.entityType) {
    conditions.push(eq(auditLogs.entityType, filters.entityType));
  }
  if (filters.search) {
    conditions.push(
      or(
        ilike(auditLogs.entityType, `%${filters.search}%`),
        ilike(auditLogs.action, `%${filters.search}%`),
        sql`CAST(${auditLogs.entityId} AS TEXT) LIKE ${`%${filters.search}%`}`
      )!
    );
  }
  
  const whereClause = and(...conditions);
  
  const [totalResult] = await db.select({ count: count() })
    .from(auditLogs)
    .where(whereClause);
  
  const items = await db.select({
    id: auditLogs.id,
    entityType: auditLogs.entityType,
    entityId: auditLogs.entityId,
    action: auditLogs.action,
    performedBy: auditLogs.performedBy,
    performerUsername: users.username,
    performerFirstName: users.firstName,
    performerLastName: users.lastName,
    performedAt: auditLogs.performedAt,
    oldValues: auditLogs.oldValues,
    newValues: auditLogs.newValues,
    diffJson: auditLogs.diffJson,
    ipAddress: auditLogs.ipAddress,
    userAgent: auditLogs.userAgent,
    metadata: auditLogs.metadata,
  })
  .from(auditLogs)
  .leftJoin(users, eq(auditLogs.performedBy, users.id))
  .where(whereClause)
  .orderBy(desc(auditLogs.performedAt))
  .limit(pageSize)
  .offset(offset);
  
  return { items, total: totalResult?.count || 0 };
}

export async function getSecurityStats(tenantId: number): Promise<{
  totalEventsToday: number;
  loginCount24h: number;
  failedLogins24h: number;
  mostActiveUsers: { username: string; count: number }[];
}> {
  const { eq, and, gte, sql, count, desc } = await import('drizzle-orm');
  const { users } = await import('@shared/schema');
  
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const [totalToday] = await db.select({ count: count() })
    .from(auditLogs)
    .where(and(
      eq(auditLogs.tenantId, tenantId),
      gte(auditLogs.performedAt, startOfDay)
    ));
  
  const [logins24h] = await db.select({ count: count() })
    .from(auditLogs)
    .where(and(
      eq(auditLogs.tenantId, tenantId),
      eq(auditLogs.action, 'LOGIN'),
      gte(auditLogs.performedAt, twentyFourHoursAgo)
    ));
  
  const [failedLogins24h] = await db.select({ count: count() })
    .from(auditLogs)
    .where(and(
      eq(auditLogs.tenantId, tenantId),
      eq(auditLogs.action, 'FAILED_LOGIN'),
      gte(auditLogs.performedAt, twentyFourHoursAgo)
    ));
  
  const activeUsersResult = await db.select({
    username: users.username,
    count: count(),
  })
  .from(auditLogs)
  .leftJoin(users, eq(auditLogs.performedBy, users.id))
  .where(and(
    eq(auditLogs.tenantId, tenantId),
    gte(auditLogs.performedAt, startOfDay)
  ))
  .groupBy(users.username)
  .orderBy(desc(count()))
  .limit(5);
  
  return {
    totalEventsToday: totalToday?.count || 0,
    loginCount24h: logins24h?.count || 0,
    failedLogins24h: failedLogins24h?.count || 0,
    mostActiveUsers: activeUsersResult.map(r => ({ username: r.username || 'Unknown', count: Number(r.count) })),
  };
}
