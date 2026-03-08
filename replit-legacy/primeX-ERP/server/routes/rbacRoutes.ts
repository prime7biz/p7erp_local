import { parseIntParam } from "../utils/parseParams";
import express, { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { requirePermission } from '../middleware/rbacMiddleware';
import { db } from '../db';
import { 
  erpPermissions, rolePermissions, userRoles, roles, users,
  userAccessScopes, roleAccessScopes, documentStatuses, 
  workflowTransitions, approvalMatrix, sodRules
} from '@shared/schema';
import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { getUserPermissions, getUserRoles } from '../services/permissionService';
import { seedRBACDefaults } from '../services/rbacSeeder';
import { logAudit } from '../services/auditService';

const router = express.Router();

router.use(isAuthenticated);

router.get('/permissions', async (req: Request, res: Response) => {
  try {
    const allPerms = await db
      .select()
      .from(erpPermissions)
      .where(eq(erpPermissions.isActive, true))
      .orderBy(asc(erpPermissions.module), asc(erpPermissions.docType), asc(erpPermissions.action));

    const grouped: Record<string, typeof allPerms> = {};
    for (const perm of allPerms) {
      if (!grouped[perm.module]) grouped[perm.module] = [];
      grouped[perm.module].push(perm);
    }

    return res.status(200).json(grouped);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    return res.status(500).json({ message: 'Failed to fetch permissions' });
  }
});

router.get('/permissions/user/:userId', async (req: Request, res: Response) => {
  try {
    const userId = parseIntParam(req.params.userId, "userId");
    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }
    const permissions = await getUserPermissions(userId, req.tenantId!);
    return res.status(200).json(permissions);
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    return res.status(500).json({ message: 'Failed to fetch user permissions' });
  }
});

router.get('/roles', async (req: Request, res: Response) => {
  try {
    const tenantRoles = await db
      .select()
      .from(roles)
      .where(eq(roles.tenantId, req.tenantId!));
    return res.status(200).json(tenantRoles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    return res.status(500).json({ message: 'Failed to fetch roles' });
  }
});

router.get('/roles/:id', async (req: Request, res: Response) => {
  try {
    const roleId = parseIntParam(req.params.id, "id");
    if (isNaN(roleId)) {
      return res.status(400).json({ message: 'Invalid role id' });
    }

    const [role] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, req.tenantId!)));

    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    const perms = await db
      .select({
        id: erpPermissions.id,
        key: erpPermissions.key,
        module: erpPermissions.module,
        docType: erpPermissions.docType,
        action: erpPermissions.action,
        displayName: erpPermissions.displayName,
        category: erpPermissions.category,
      })
      .from(rolePermissions)
      .innerJoin(erpPermissions, eq(rolePermissions.permissionId, erpPermissions.id))
      .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.tenantId, req.tenantId!)));

    return res.status(200).json({ ...role, permissions: perms });
  } catch (error) {
    console.error('Error fetching role:', error);
    return res.status(500).json({ message: 'Failed to fetch role' });
  }
});

router.post('/roles', requirePermission('system:roles:create'), async (req: Request, res: Response) => {
  try {
    const { name, displayName, description, level } = req.body;
    if (!name || !displayName || level === undefined) {
      return res.status(400).json({ message: 'name, displayName, and level are required' });
    }

    const [newRole] = await db
      .insert(roles)
      .values({
        name,
        displayName,
        description: description || null,
        level,
        tenantId: req.tenantId!,
        permissions: {},
      })
      .returning();

    await logAudit({
      tenantId: req.tenantId!,
      entityType: 'role',
      entityId: newRole.id,
      action: 'CREATE',
      performedBy: req.user!.id,
      newValues: newRole,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    }).catch(console.error);

    return res.status(201).json(newRole);
  } catch (error) {
    console.error('Error creating role:', error);
    return res.status(500).json({ message: 'Failed to create role' });
  }
});

router.put('/roles/:id', requirePermission('system:roles:edit'), async (req: Request, res: Response) => {
  try {
    const roleId = parseIntParam(req.params.id, "id");
    if (isNaN(roleId)) {
      return res.status(400).json({ message: 'Invalid role id' });
    }

    const { name, displayName, description, level } = req.body;

    const [oldRole] = await db.select().from(roles).where(and(eq(roles.id, roleId), eq(roles.tenantId, req.tenantId!)));

    const [updated] = await db
      .update(roles)
      .set({
        ...(name !== undefined && { name }),
        ...(displayName !== undefined && { displayName }),
        ...(description !== undefined && { description }),
        ...(level !== undefined && { level }),
        updatedAt: new Date(),
      })
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, req.tenantId!)))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Role not found' });
    }

    await logAudit({
      tenantId: req.tenantId!,
      entityType: 'role',
      entityId: roleId,
      action: 'UPDATE',
      performedBy: req.user!.id,
      oldValues: oldRole,
      newValues: updated,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    }).catch(console.error);

    return res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating role:', error);
    return res.status(500).json({ message: 'Failed to update role' });
  }
});

router.delete('/roles/:id', requirePermission('system:roles:delete'), async (req: Request, res: Response) => {
  try {
    const roleId = parseIntParam(req.params.id, "id");
    if (isNaN(roleId)) {
      return res.status(400).json({ message: 'Invalid role id' });
    }

    const [oldRole] = await db.select().from(roles).where(and(eq(roles.id, roleId), eq(roles.tenantId, req.tenantId!)));

    const [updated] = await db
      .update(roles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(roles.id, roleId), eq(roles.tenantId, req.tenantId!)))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Role not found' });
    }

    await logAudit({
      tenantId: req.tenantId!,
      entityType: 'role',
      entityId: roleId,
      action: 'DELETE',
      performedBy: req.user!.id,
      oldValues: oldRole,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    }).catch(console.error);

    return res.status(200).json({ message: 'Role deactivated' });
  } catch (error) {
    console.error('Error deleting role:', error);
    return res.status(500).json({ message: 'Failed to delete role' });
  }
});

router.post('/roles/:id/permissions', requirePermission('system:roles:edit'), async (req: Request, res: Response) => {
  try {
    const roleId = parseIntParam(req.params.id, "id");
    if (isNaN(roleId)) {
      return res.status(400).json({ message: 'Invalid role id' });
    }

    const { permissionIds } = req.body;
    if (!Array.isArray(permissionIds)) {
      return res.status(400).json({ message: 'permissionIds must be an array' });
    }

    const oldPerms = await db
      .select({ permissionId: rolePermissions.permissionId })
      .from(rolePermissions)
      .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.tenantId, req.tenantId!)));

    await db
      .delete(rolePermissions)
      .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.tenantId, req.tenantId!)));

    if (permissionIds.length > 0) {
      const values = permissionIds.map((permId: number) => ({
        roleId,
        permissionId: permId,
        tenantId: req.tenantId!,
        grantedBy: req.user?.id || null,
      }));
      await db.insert(rolePermissions).values(values);
    }

    await logAudit({
      tenantId: req.tenantId!,
      entityType: 'role_permissions',
      entityId: roleId,
      action: 'UPDATE',
      performedBy: req.user!.id,
      oldValues: { permissionIds: oldPerms.map(p => p.permissionId) },
      newValues: { permissionIds },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    }).catch(console.error);

    return res.status(200).json({ message: 'Permissions updated', count: permissionIds.length });
  } catch (error) {
    console.error('Error setting role permissions:', error);
    return res.status(500).json({ message: 'Failed to set role permissions' });
  }
});

router.get('/roles/:id/permissions', async (req: Request, res: Response) => {
  try {
    const roleId = parseIntParam(req.params.id, "id");
    if (isNaN(roleId)) {
      return res.status(400).json({ message: 'Invalid role id' });
    }

    const perms = await db
      .select({ permissionId: rolePermissions.permissionId })
      .from(rolePermissions)
      .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.tenantId, req.tenantId!)));

    return res.status(200).json(perms.map((p) => p.permissionId));
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    return res.status(500).json({ message: 'Failed to fetch role permissions' });
  }
});

router.get('/users/:userId/roles', async (req: Request, res: Response) => {
  try {
    const userId = parseIntParam(req.params.userId, "userId");
    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const userRolesList = await getUserRoles(userId, req.tenantId!);
    return res.status(200).json(userRolesList);
  } catch (error) {
    console.error('Error fetching user roles:', error);
    return res.status(500).json({ message: 'Failed to fetch user roles' });
  }
});

router.post('/users/:userId/roles', requirePermission('system:users:edit'), async (req: Request, res: Response) => {
  try {
    const userId = parseIntParam(req.params.userId, "userId");
    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const { roleIds, isPrimary } = req.body;
    if (!Array.isArray(roleIds) || roleIds.length === 0) {
      return res.status(400).json({ message: 'roleIds must be a non-empty array' });
    }

    const values = roleIds.map((roleId: number, index: number) => ({
      userId,
      roleId,
      tenantId: req.tenantId!,
      isPrimary: isPrimary === roleId || (isPrimary === undefined && index === 0),
      assignedBy: req.user?.id || null,
    }));

    const inserted = await db
      .insert(userRoles)
      .values(values)
      .onConflictDoNothing()
      .returning();

    for (const ur of inserted) {
      await logAudit({
        tenantId: req.tenantId!,
        entityType: 'user_role',
        entityId: userId,
        action: 'CREATE',
        performedBy: req.user!.id,
        newValues: ur,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string,
      }).catch(console.error);
    }

    return res.status(201).json(inserted);
  } catch (error) {
    console.error('Error assigning user roles:', error);
    return res.status(500).json({ message: 'Failed to assign user roles' });
  }
});

router.delete('/users/:userId/roles/:roleId', requirePermission('system:users:edit'), async (req: Request, res: Response) => {
  try {
    const userId = parseIntParam(req.params.userId, "userId");
    const roleId = parseIntParam(req.params.roleId, "roleId");
    if (isNaN(userId) || isNaN(roleId)) {
      return res.status(400).json({ message: 'Invalid userId or roleId' });
    }

    const [deleted] = await db
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.roleId, roleId),
          eq(userRoles.tenantId, req.tenantId!)
        )
      )
      .returning();

    if (!deleted) {
      return res.status(404).json({ message: 'User role assignment not found' });
    }

    await logAudit({
      tenantId: req.tenantId!,
      entityType: 'user_role',
      entityId: userId,
      action: 'DELETE',
      performedBy: req.user!.id,
      oldValues: deleted,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    }).catch(console.error);

    return res.status(200).json({ message: 'Role removed from user' });
  } catch (error) {
    console.error('Error removing user role:', error);
    return res.status(500).json({ message: 'Failed to remove user role' });
  }
});

router.get('/users/:userId/scopes', async (req: Request, res: Response) => {
  try {
    const userId = parseIntParam(req.params.userId, "userId");
    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const scopes = await db
      .select()
      .from(userAccessScopes)
      .where(and(eq(userAccessScopes.userId, userId), eq(userAccessScopes.tenantId, req.tenantId!)));

    return res.status(200).json(scopes);
  } catch (error) {
    console.error('Error fetching user scopes:', error);
    return res.status(500).json({ message: 'Failed to fetch user scopes' });
  }
});

router.post('/users/:userId/scopes', requirePermission('system:users:edit'), async (req: Request, res: Response) => {
  try {
    const userId = parseIntParam(req.params.userId, "userId");
    if (isNaN(userId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const { scopes } = req.body;
    if (!Array.isArray(scopes)) {
      return res.status(400).json({ message: 'scopes must be an array' });
    }

    const oldScopes = await db
      .select()
      .from(userAccessScopes)
      .where(and(eq(userAccessScopes.userId, userId), eq(userAccessScopes.tenantId, req.tenantId!)));

    await db
      .delete(userAccessScopes)
      .where(and(eq(userAccessScopes.userId, userId), eq(userAccessScopes.tenantId, req.tenantId!)));

    if (scopes.length > 0) {
      const values = scopes.map((s: { scopeType: string; scopeValueId: number }) => ({
        userId,
        scopeType: s.scopeType,
        scopeValueId: s.scopeValueId,
        tenantId: req.tenantId!,
      }));
      await db.insert(userAccessScopes).values(values);
    }

    await logAudit({
      tenantId: req.tenantId!,
      entityType: 'user_access_scope',
      entityId: userId,
      action: 'UPDATE',
      performedBy: req.user!.id,
      oldValues: { scopes: oldScopes },
      newValues: { scopes },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    }).catch(console.error);

    return res.status(200).json({ message: 'Scopes updated', count: scopes.length });
  } catch (error) {
    console.error('Error setting user scopes:', error);
    return res.status(500).json({ message: 'Failed to set user scopes' });
  }
});

router.get('/statuses', async (_req: Request, res: Response) => {
  try {
    const statuses = await db
      .select()
      .from(documentStatuses)
      .orderBy(asc(documentStatuses.sequence));

    return res.status(200).json(statuses);
  } catch (error) {
    console.error('Error fetching document statuses:', error);
    return res.status(500).json({ message: 'Failed to fetch document statuses' });
  }
});

router.get('/workflow/transitions', async (req: Request, res: Response) => {
  try {
    const docType = req.query.docType as string | undefined;
    const conditions = [eq(workflowTransitions.tenantId, req.tenantId!)];
    if (docType) {
      conditions.push(eq(workflowTransitions.docType, docType));
    }

    const transitions = await db
      .select()
      .from(workflowTransitions)
      .where(and(...conditions))
      .orderBy(asc(workflowTransitions.sequence));

    return res.status(200).json(transitions);
  } catch (error) {
    console.error('Error fetching workflow transitions:', error);
    return res.status(500).json({ message: 'Failed to fetch workflow transitions' });
  }
});

router.post('/workflow/transitions', async (req: Request, res: Response) => {
  try {
    const { docType, transitions } = req.body;
    if (!docType || !Array.isArray(transitions)) {
      return res.status(400).json({ message: 'docType and transitions array are required' });
    }

    const oldTransitions = await db
      .select()
      .from(workflowTransitions)
      .where(and(eq(workflowTransitions.tenantId, req.tenantId!), eq(workflowTransitions.docType, docType)));

    await db
      .delete(workflowTransitions)
      .where(and(eq(workflowTransitions.tenantId, req.tenantId!), eq(workflowTransitions.docType, docType)));

    if (transitions.length > 0) {
      const values = transitions.map((t: any) => ({
        tenantId: req.tenantId!,
        docType,
        fromStatusCode: t.fromStatusCode || null,
        toStatusCode: t.toStatusCode,
        actionName: t.actionName,
        requiredPermissionKey: t.requiredPermissionKey || null,
        sodGroup: t.sodGroup || null,
        isOptional: t.isOptional || false,
        sequence: t.sequence || 0,
      }));
      await db.insert(workflowTransitions).values(values);
    }

    await logAudit({
      tenantId: req.tenantId!,
      entityType: 'workflow_transition',
      entityId: 0,
      action: 'UPDATE',
      performedBy: req.user!.id,
      oldValues: { docType, transitions: oldTransitions },
      newValues: { docType, transitions },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
      metadata: { docType },
    }).catch(console.error);

    return res.status(200).json({ message: 'Workflow transitions updated', count: transitions.length });
  } catch (error) {
    console.error('Error setting workflow transitions:', error);
    return res.status(500).json({ message: 'Failed to set workflow transitions' });
  }
});

router.get('/approval-matrix', async (req: Request, res: Response) => {
  try {
    const docType = req.query.docType as string | undefined;
    const conditions = [eq(approvalMatrix.tenantId, req.tenantId!)];
    if (docType) {
      conditions.push(eq(approvalMatrix.docType, docType));
    }

    const rules = await db
      .select()
      .from(approvalMatrix)
      .where(and(...conditions))
      .orderBy(asc(approvalMatrix.approvalLevel));

    return res.status(200).json(rules);
  } catch (error) {
    console.error('Error fetching approval matrix:', error);
    return res.status(500).json({ message: 'Failed to fetch approval matrix' });
  }
});

router.post('/approval-matrix', async (req: Request, res: Response) => {
  try {
    const { docType, minAmount, maxAmount, currency, approvalLevel, ruleType, requiredRoleId, requiredUserId, requiredPermissionKey, approvalMode, requiredCount } = req.body;
    if (!docType) {
      return res.status(400).json({ message: 'docType is required' });
    }

    const [rule] = await db
      .insert(approvalMatrix)
      .values({
        tenantId: req.tenantId!,
        docType,
        minAmount: minAmount || '0',
        maxAmount: maxAmount || null,
        currency: currency || 'BDT',
        approvalLevel: approvalLevel || 1,
        ruleType: ruleType || 'ROLE',
        requiredRoleId: requiredRoleId || null,
        requiredUserId: requiredUserId || null,
        requiredPermissionKey: requiredPermissionKey || null,
        approvalMode: approvalMode || 'ANY_ONE',
        requiredCount: requiredCount || 1,
      })
      .returning();

    await logAudit({
      tenantId: req.tenantId!,
      entityType: 'approval_matrix',
      entityId: rule.id,
      action: 'CREATE',
      performedBy: req.user!.id,
      newValues: rule,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    }).catch(console.error);

    return res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating approval matrix rule:', error);
    return res.status(500).json({ message: 'Failed to create approval matrix rule' });
  }
});

router.put('/approval-matrix/:id', async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const { docType, minAmount, maxAmount, currency, approvalLevel, ruleType, requiredRoleId, requiredUserId, requiredPermissionKey, approvalMode, requiredCount } = req.body;

    const [oldRule] = await db.select().from(approvalMatrix).where(and(eq(approvalMatrix.id, id), eq(approvalMatrix.tenantId, req.tenantId!)));

    const [updated] = await db
      .update(approvalMatrix)
      .set({
        ...(docType !== undefined && { docType }),
        ...(minAmount !== undefined && { minAmount }),
        ...(maxAmount !== undefined && { maxAmount }),
        ...(currency !== undefined && { currency }),
        ...(approvalLevel !== undefined && { approvalLevel }),
        ...(ruleType !== undefined && { ruleType }),
        ...(requiredRoleId !== undefined && { requiredRoleId }),
        ...(requiredUserId !== undefined && { requiredUserId }),
        ...(requiredPermissionKey !== undefined && { requiredPermissionKey }),
        ...(approvalMode !== undefined && { approvalMode }),
        ...(requiredCount !== undefined && { requiredCount }),
      })
      .where(and(eq(approvalMatrix.id, id), eq(approvalMatrix.tenantId, req.tenantId!)))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Approval matrix rule not found' });
    }

    await logAudit({
      tenantId: req.tenantId!,
      entityType: 'approval_matrix',
      entityId: id,
      action: 'UPDATE',
      performedBy: req.user!.id,
      oldValues: oldRule,
      newValues: updated,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    }).catch(console.error);

    return res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating approval matrix rule:', error);
    return res.status(500).json({ message: 'Failed to update approval matrix rule' });
  }
});

router.delete('/approval-matrix/:id', async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const [deleted] = await db
      .delete(approvalMatrix)
      .where(and(eq(approvalMatrix.id, id), eq(approvalMatrix.tenantId, req.tenantId!)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ message: 'Approval matrix rule not found' });
    }

    await logAudit({
      tenantId: req.tenantId!,
      entityType: 'approval_matrix',
      entityId: id,
      action: 'DELETE',
      performedBy: req.user!.id,
      oldValues: deleted,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    }).catch(console.error);

    return res.status(200).json({ message: 'Approval matrix rule deleted' });
  } catch (error) {
    console.error('Error deleting approval matrix rule:', error);
    return res.status(500).json({ message: 'Failed to delete approval matrix rule' });
  }
});

router.get('/sod-rules', async (req: Request, res: Response) => {
  try {
    const rules = await db
      .select()
      .from(sodRules)
      .where(eq(sodRules.tenantId, req.tenantId!));

    return res.status(200).json(rules);
  } catch (error) {
    console.error('Error fetching SoD rules:', error);
    return res.status(500).json({ message: 'Failed to fetch SoD rules' });
  }
});

router.post('/sod-rules', async (req: Request, res: Response) => {
  try {
    const { docType, ruleName, conflictingActions, isStrict } = req.body;
    if (!docType || !ruleName || !Array.isArray(conflictingActions)) {
      return res.status(400).json({ message: 'docType, ruleName, and conflictingActions are required' });
    }

    const [rule] = await db
      .insert(sodRules)
      .values({
        tenantId: req.tenantId!,
        docType,
        ruleName,
        conflictingActions,
        isStrict: isStrict !== undefined ? isStrict : true,
      })
      .returning();

    await logAudit({
      tenantId: req.tenantId!,
      entityType: 'sod_rule',
      entityId: rule.id,
      action: 'CREATE',
      performedBy: req.user!.id,
      newValues: rule,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    }).catch(console.error);

    return res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating SoD rule:', error);
    return res.status(500).json({ message: 'Failed to create SoD rule' });
  }
});

router.put('/sod-rules/:id', async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const { docType, ruleName, conflictingActions, isStrict, isActive } = req.body;

    const [oldRule] = await db.select().from(sodRules).where(and(eq(sodRules.id, id), eq(sodRules.tenantId, req.tenantId!)));

    const [updated] = await db
      .update(sodRules)
      .set({
        ...(docType !== undefined && { docType }),
        ...(ruleName !== undefined && { ruleName }),
        ...(conflictingActions !== undefined && { conflictingActions }),
        ...(isStrict !== undefined && { isStrict }),
        ...(isActive !== undefined && { isActive }),
      })
      .where(and(eq(sodRules.id, id), eq(sodRules.tenantId, req.tenantId!)))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'SoD rule not found' });
    }

    await logAudit({
      tenantId: req.tenantId!,
      entityType: 'sod_rule',
      entityId: id,
      action: 'UPDATE',
      performedBy: req.user!.id,
      oldValues: oldRule,
      newValues: updated,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    }).catch(console.error);

    return res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating SoD rule:', error);
    return res.status(500).json({ message: 'Failed to update SoD rule' });
  }
});

router.delete('/sod-rules/:id', async (req: Request, res: Response) => {
  try {
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const [deleted] = await db
      .delete(sodRules)
      .where(and(eq(sodRules.id, id), eq(sodRules.tenantId, req.tenantId!)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ message: 'SoD rule not found' });
    }

    await logAudit({
      tenantId: req.tenantId!,
      entityType: 'sod_rule',
      entityId: id,
      action: 'DELETE',
      performedBy: req.user!.id,
      oldValues: deleted,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    }).catch(console.error);

    return res.status(200).json({ message: 'SoD rule deleted' });
  } catch (error) {
    console.error('Error deleting SoD rule:', error);
    return res.status(500).json({ message: 'Failed to delete SoD rule' });
  }
});

router.post('/backfill-instances', async (req: Request, res: Response) => {
  try {
    if (!req.user?.isSuperUser) {
      return res.status(403).json({ message: 'Only superusers can backfill instances' });
    }
    const { backfillWorkflowInstances } = await import('../services/workflowInstanceService');
    const result = await backfillWorkflowInstances(req.tenantId!);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('[RBAC] Backfill error:', error);
    res.status(500).json({ message: 'Failed to backfill instances' });
  }
});

router.post('/seed-defaults', async (req: Request, res: Response) => {
  try {
    if (!req.user?.isSuperUser) {
      return res.status(403).json({ message: 'Only super users can seed RBAC defaults' });
    }

    await seedRBACDefaults(req.tenantId!);
    return res.status(200).json({ message: 'RBAC defaults seeded successfully' });
  } catch (error) {
    console.error('Error seeding RBAC defaults:', error);
    return res.status(500).json({ message: 'Failed to seed RBAC defaults' });
  }
});

export default router;
