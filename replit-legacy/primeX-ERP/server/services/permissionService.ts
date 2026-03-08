import { db } from '../db';
import { erpPermissions, rolePermissions, userRoles, roles, users, userAccessScopes, roleAccessScopes, sodRules, documentWorkflowHistory } from '@shared/schema';
import { eq, and, or, isNull, gte, inArray } from 'drizzle-orm';

export async function checkPermission(
  userId: number,
  tenantId: number,
  permissionKey: string
): Promise<{ allowed: boolean; reason?: string }> {
  const [user] = await db
    .select({ isSuperUser: users.isSuperUser })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));

  if (!user) {
    return { allowed: false, reason: 'User not found' };
  }

  if (user.isSuperUser) {
    return { allowed: true, reason: 'Super user access' };
  }

  const now = new Date();
  const activeUserRoles = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.tenantId, tenantId),
        or(isNull(userRoles.effectiveTo), gte(userRoles.effectiveTo, now))
      )
    );

  if (activeUserRoles.length === 0) {
    return { allowed: false, reason: 'No active roles assigned' };
  }

  const roleIds = activeUserRoles.map((ur) => ur.roleId);

  const matchingPermissions = await db
    .select({ key: erpPermissions.key })
    .from(rolePermissions)
    .innerJoin(erpPermissions, eq(rolePermissions.permissionId, erpPermissions.id))
    .where(
      and(
        inArray(rolePermissions.roleId, roleIds),
        eq(erpPermissions.key, permissionKey),
        eq(erpPermissions.isActive, true)
      )
    );

  if (matchingPermissions.length > 0) {
    return { allowed: true, reason: 'Permission granted via role' };
  }

  const legacyRoles = await db
    .select({ permissions: roles.permissions })
    .from(roles)
    .where(inArray(roles.id, roleIds));

  for (const role of legacyRoles) {
    const perms = role.permissions as any;
    if (!perms) continue;
    if (perms.isSuperUser === true) {
      return { allowed: true, reason: 'Role has super user flag (legacy)' };
    }
    if (Array.isArray(perms)) {
      if (perms.includes('*') || perms.includes(permissionKey)) {
        return { allowed: true, reason: 'Permission granted via legacy role permissions' };
      }
    }
    if (typeof perms === 'object' && !Array.isArray(perms)) {
      const allPerms = Object.values(perms).flat() as string[];
      if (allPerms.includes('*') || allPerms.includes(permissionKey)) {
        return { allowed: true, reason: 'Permission granted via legacy role permissions' };
      }
    }
  }

  return { allowed: false, reason: `Missing permission: ${permissionKey}` };
}

export async function getUserPermissions(
  userId: number,
  tenantId: number
): Promise<string[]> {
  const [user] = await db
    .select({ isSuperUser: users.isSuperUser })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));

  if (user?.isSuperUser) {
    const allPerms = await db
      .select({ key: erpPermissions.key })
      .from(erpPermissions)
      .where(eq(erpPermissions.isActive, true));
    return allPerms.map((p) => p.key);
  }

  const now = new Date();
  const activeUserRoles = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.tenantId, tenantId),
        or(isNull(userRoles.effectiveTo), gte(userRoles.effectiveTo, now))
      )
    );

  if (activeUserRoles.length === 0) {
    return [];
  }

  const roleIds = activeUserRoles.map((ur) => ur.roleId);

  const permissions = await db
    .select({ key: erpPermissions.key })
    .from(rolePermissions)
    .innerJoin(erpPermissions, eq(rolePermissions.permissionId, erpPermissions.id))
    .where(
      and(
        inArray(rolePermissions.roleId, roleIds),
        eq(erpPermissions.isActive, true)
      )
    );

  const permKeys = new Set(permissions.map((p) => p.key));
  return Array.from(permKeys);
}

export async function getUserRoles(userId: number, tenantId: number) {
  const now = new Date();
  const activeRoles = await db
    .select({
      id: roles.id,
      name: roles.name,
      displayName: roles.displayName,
      level: roles.level,
      isPrimary: userRoles.isPrimary,
      effectiveFrom: userRoles.effectiveFrom,
      effectiveTo: userRoles.effectiveTo,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.tenantId, tenantId),
        or(isNull(userRoles.effectiveTo), gte(userRoles.effectiveTo, now))
      )
    );

  return activeRoles;
}

export async function checkScopeAccess(
  userId: number,
  tenantId: number,
  scopeType: string,
  scopeValueId: number
): Promise<{ allowed: boolean; reason?: string }> {
  const userScopes = await db
    .select({ scopeValueId: userAccessScopes.scopeValueId })
    .from(userAccessScopes)
    .where(
      and(
        eq(userAccessScopes.userId, userId),
        eq(userAccessScopes.tenantId, tenantId),
        eq(userAccessScopes.scopeType, scopeType)
      )
    );

  if (userScopes.length > 0) {
    const allowed = userScopes.some((s) => s.scopeValueId === scopeValueId);
    return allowed
      ? { allowed: true, reason: 'User scope access granted' }
      : { allowed: false, reason: `User not authorized for ${scopeType} scope` };
  }

  const now = new Date();
  const activeUserRoles = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.tenantId, tenantId),
        or(isNull(userRoles.effectiveTo), gte(userRoles.effectiveTo, now))
      )
    );

  if (activeUserRoles.length === 0) {
    return { allowed: true, reason: 'No scope restrictions (no roles)' };
  }

  const roleIds = activeUserRoles.map((ur) => ur.roleId);

  const roleScopes = await db
    .select({ scopeValueId: roleAccessScopes.scopeValueId })
    .from(roleAccessScopes)
    .where(
      and(
        inArray(roleAccessScopes.roleId, roleIds),
        eq(roleAccessScopes.tenantId, tenantId),
        eq(roleAccessScopes.scopeType, scopeType)
      )
    );

  if (roleScopes.length === 0) {
    return { allowed: true, reason: 'No scope restrictions defined for this type' };
  }

  const allowed = roleScopes.some((s) => s.scopeValueId === scopeValueId);
  return allowed
    ? { allowed: true, reason: 'Role scope access granted' }
    : { allowed: false, reason: `Role not authorized for ${scopeType} scope` };
}

export async function checkSoD(
  tenantId: number,
  docType: string,
  docId: number,
  action: string,
  userId: number
): Promise<{ allowed: boolean; conflictingAction?: string; mode?: string }> {
  const rules = await db
    .select()
    .from(sodRules)
    .where(
      and(
        eq(sodRules.tenantId, tenantId),
        eq(sodRules.docType, docType),
        eq(sodRules.isActive, true)
      )
    );

  if (rules.length === 0) {
    return { allowed: true };
  }

  for (const rule of rules) {
    const sodMode = (rule as any).sodMode || 'STANDARD';

    if (sodMode === 'OFF') {
      continue;
    }

    const history = await db
      .select({ action: documentWorkflowHistory.action })
      .from(documentWorkflowHistory)
      .where(
        and(
          eq(documentWorkflowHistory.tenantId, tenantId),
          eq(documentWorkflowHistory.docType, docType),
          eq(documentWorkflowHistory.docId, docId),
          eq(documentWorkflowHistory.performedBy, userId)
        )
      );

    const userActions = new Set(history.map((h) => h.action));

    if (sodMode === 'STRICT') {
      if (userActions.size > 0) {
        const firstPastAction = history[0]?.action || 'unknown';
        return {
          allowed: false,
          conflictingAction: firstPastAction,
          mode: 'STRICT',
        };
      }
    }

    if (sodMode === 'STANDARD') {
      const conflicting = rule.conflictingActions as string[];
      if (!Array.isArray(conflicting) || !conflicting.includes(action)) continue;

      for (const pastAction of conflicting) {
        if (pastAction === action) continue;
        if (userActions.has(pastAction)) {
          return {
            allowed: false,
            conflictingAction: pastAction,
            mode: 'STANDARD',
          };
        }
      }
    }
  }

  return { allowed: true };
}
