import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { authenticate } from "../middleware/auth";
import { 
  roles, 
  departments, 
  tenantSettings, 
  users, 
  userPermissions,
  userRoles,
  subscriptions,
  subscriptionPlans,
  employees,
  insertRoleSchema,
  insertDepartmentSchema,
  insertTenantSettingsSchema,
  insertSettingsUserSchema,
  insertUserPermissionSchema,
  type Role,
  type Department,
  type TenantSettings,
  type User,
  type UserPermission
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, count, isNull, notInArray, sql } from "drizzle-orm";

const router = Router();

// Middleware to check if user is a super user
const requireSuperUser = async (req: any, res: any, next: any) => {
  try {
    const userId = req.userId || req.user?.id;
    if (req.user?.isSuperUser) {
      return next();
    }
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user[0] || !user[0].isSuperUser) {
      return res.status(403).json({ error: "Super user access required" });
    }
    next();
  } catch (error) {
    return res.status(500).json({ error: "Authorization check failed" });
  }
};

// ============================================================
// Role Management Routes
// ============================================================

// Get all roles for tenant
router.get("/roles", authenticate, async (req: any, res) => {
  try {
    const tenantRoles = await db.select().from(roles).orderBy(roles.level);
    res.json(tenantRoles);
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(500).json({ error: "Failed to fetch roles" });
  }
});

// Create new role (super user only)
router.post("/roles", authenticate, requireSuperUser, async (req: any, res) => {
  try {
    const validatedData = insertRoleSchema.parse({
      ...req.body,
      level: req.body.level || 10,
      tenantId: req.tenantId
    });
    const [newRole] = await db.insert(roles).values(validatedData).returning();
    res.status(201).json(newRole);
  } catch (error) {
    console.error("Error creating role:", error);
    res.status(500).json({ error: "Failed to create role" });
  }
});

// Update role (super user only)
router.put("/roles/:id", authenticate, requireSuperUser, async (req: any, res) => {
  try {
    const roleId = parseInt(req.params.id);
    const validatedData = insertRoleSchema.parse(req.body);
    
    const [updatedRole] = await db
      .update(roles)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(roles.id, roleId))
      .returning();
    
    if (!updatedRole) {
      return res.status(404).json({ error: "Role not found" });
    }
    
    res.json(updatedRole);
  } catch (error) {
    console.error("Error updating role:", error);
    res.status(500).json({ error: "Failed to update role" });
  }
});

// ============================================================
// Department Management Routes
// ============================================================

// Get all departments for tenant
router.get("/departments", authenticate, async (req: any, res) => {
  try {
    const tenantDepartments = await db
      .select()
      .from(departments)
      .where(eq(departments.tenantId, req.tenantId))
      .orderBy(departments.name);
    res.json(tenantDepartments);
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});

// Create new department (super user only)
router.post("/departments", authenticate, requireSuperUser, async (req: any, res) => {
  try {
    const validatedData = insertDepartmentSchema.parse({
      ...req.body,
      code: req.body.code || req.body.name?.toUpperCase().replace(/\s+/g, '_').substring(0, 10) || 'DEPT',
      tenantId: req.tenantId
    });
    const [newDepartment] = await db.insert(departments).values(validatedData).returning();
    res.status(201).json(newDepartment);
  } catch (error) {
    console.error("Error creating department:", error);
    res.status(500).json({ error: "Failed to create department" });
  }
});

// ============================================================
// Employee Picklist (for user creation)
// ============================================================
router.get("/employees-picklist", authenticate, async (req: any, res) => {
  try {
    const empList = await db.select({
      id: employees.id,
      employeeId: employees.employeeId,
      firstName: employees.firstName,
      lastName: employees.lastName,
      email: employees.email,
      phone: employees.phone,
      department: employees.department,
      designation: employees.designation,
    })
      .from(employees)
      .where(and(eq(employees.tenantId, req.tenantId), eq(employees.isActive, true)))
      .orderBy(employees.firstName);
    
    res.json(empList);
  } catch (error) {
    console.error("Error fetching employees picklist:", error);
    res.status(500).json({ error: "Failed to fetch employees" });
  }
});

// Workflow roles list for user creation dropdown
router.get("/workflow-roles", authenticate, async (req: any, res) => {
  try {
    const workflowRoleNames = ['data_entry', 'officer', 'recommender', 'approver', 'accounts_poster', 'auditor'];
    const wfRoles = await db.select()
      .from(roles)
      .where(sql`${roles.name} = ANY(ARRAY[${sql.join(workflowRoleNames.map(n => sql`${n}`), sql`, `)}]::text[])`)
      .orderBy(roles.level);
    res.json(wfRoles);
  } catch (error) {
    console.error("Error fetching workflow roles:", error);
    res.status(500).json({ error: "Failed to fetch workflow roles" });
  }
});

// Module roles list for user creation checkboxes
router.get("/module-roles", authenticate, async (req: any, res) => {
  try {
    const moduleRoleNames = ['module_accounts', 'module_inventory', 'module_purchase', 'module_sales', 'module_commercial_lc', 'module_hr_payroll'];
    const modRoles = await db.select()
      .from(roles)
      .where(sql`${roles.name} = ANY(ARRAY[${sql.join(moduleRoleNames.map(n => sql`${n}`), sql`, `)}]::text[])`)
      .orderBy(roles.name);
    res.json(modRoles);
  } catch (error) {
    console.error("Error fetching module roles:", error);
    res.status(500).json({ error: "Failed to fetch module roles" });
  }
});

// ============================================================
// User Management Routes
// ============================================================

// Get all users for tenant with role information
router.get("/users", authenticate, async (req: any, res) => {
  try {
    const tenantUsers = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        employeeId: users.employeeId,
        phone: users.phone,
        joiningDate: users.joiningDate,
        isActive: users.isActive,
        isSuperUser: users.isSuperUser,
        lastLogin: users.lastLogin,
        roleId: users.roleId,
        departmentId: users.departmentId,
        roleName: roles.displayName,
        roleLevel: roles.level,
        departmentName: departments.name,
        createdAt: users.createdAt
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(eq(users.tenantId, req.tenantId))
      .orderBy(desc(users.createdAt));
    
    res.json(tenantUsers);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Create new user (super user only)
router.post("/users", authenticate, requireSuperUser, async (req: any, res) => {
  try {
    // Check user limit based on subscription plan
    const [sub] = await db.select({
      plan: subscriptions.plan,
    })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, req.tenantId))
      .limit(1);

    if (sub) {
      const [planInfo] = await db.select({
        maxUsers: subscriptionPlans.maxUsers,
        displayName: subscriptionPlans.displayName,
      })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.name, sub.plan))
        .limit(1);

      if (planInfo) {
        const [userCount] = await db.select({
          count: count(),
        })
          .from(users)
          .where(and(
            eq(users.tenantId, req.tenantId),
            eq(users.isActive, true)
          ));

        const currentUsers = userCount?.count || 0;
        if (currentUsers >= planInfo.maxUsers) {
          return res.status(403).json({
            error: `User limit reached for your plan (${planInfo.displayName}). Maximum ${planInfo.maxUsers} users allowed. Please upgrade your plan.`
          });
        }
      }
    }

    const validatedData = insertSettingsUserSchema.parse(req.body);
    
    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password as string, 10);
    
    const userData = {
      ...validatedData,
      password: hashedPassword,
      tenantId: req.tenantId
    };
    
    const [newUser] = await db.insert(users).values(userData).returning();
    
    if (newUser.roleId) {
      await db.insert(userRoles).values({
        userId: newUser.id,
        roleId: newUser.roleId,
        tenantId: req.tenantId,
        isPrimary: true,
        assignedBy: req.userId,
      }).onConflictDoNothing();
    }
    
    const moduleRoleKeys: string[] = req.body.moduleRoleKeys || [];
    if (moduleRoleKeys.length > 0) {
      const moduleRoles = await db.select({ id: roles.id, name: roles.name })
        .from(roles)
        .where(sql`${roles.name} = ANY(ARRAY[${sql.join(moduleRoleKeys.map(n => sql`${n}`), sql`, `)}]::text[])`);
      
      for (const mr of moduleRoles) {
        await db.insert(userRoles).values({
          userId: newUser.id,
          roleId: mr.id,
          tenantId: req.tenantId,
          isPrimary: false,
          assignedBy: req.userId,
        }).onConflictDoNothing();
      }
    }
    
    const { password, ...userResponse } = newUser;
    res.status(201).json(userResponse);
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// Update user (super user only)
router.put("/users/:id", authenticate, requireSuperUser, async (req: any, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { password, ...updateData } = req.body;
    
    if (updateData.joiningDate === "" || updateData.joiningDate === undefined) {
      updateData.joiningDate = null;
    }
    if (updateData.departmentId === 0 || updateData.departmentId === "") {
      updateData.departmentId = null;
    }
    if (updateData.employeeId === "") {
      updateData.employeeId = null;
    }

    let finalUpdateData = { ...updateData, updatedAt: new Date() };
    
    if (password) {
      finalUpdateData.password = await bcrypt.hash(password as string, 10);
    }
    
    const [updatedUser] = await db
      .update(users)
      .set(finalUpdateData)
      .where(and(eq(users.id, userId), eq(users.tenantId, req.tenantId)))
      .returning();
    
    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    if (updatedUser.roleId) {
      const existingPrimary = await db.select({ id: userRoles.id, roleId: userRoles.roleId })
        .from(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.isPrimary, true)))
        .limit(1);
      
      if (existingPrimary.length > 0) {
        if (existingPrimary[0].roleId !== updatedUser.roleId) {
          const conflicting = await db.select({ id: userRoles.id })
            .from(userRoles)
            .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, updatedUser.roleId)))
            .limit(1);
          if (conflicting.length > 0) {
            await db.delete(userRoles).where(eq(userRoles.id, conflicting[0].id));
          }
          await db.update(userRoles)
            .set({ roleId: updatedUser.roleId, assignedBy: req.userId })
            .where(eq(userRoles.id, existingPrimary[0].id));
        }
      } else {
        await db.insert(userRoles).values({
          userId: userId,
          roleId: updatedUser.roleId,
          tenantId: req.tenantId,
          isPrimary: true,
          assignedBy: req.userId,
        }).onConflictDoNothing();
      }
    }
    
    const moduleRoleKeys: string[] = req.body.moduleRoleKeys || [];
    if (moduleRoleKeys.length > 0 || req.body.moduleRoleKeys !== undefined) {
      await db.delete(userRoles)
        .where(and(
          eq(userRoles.userId, userId),
          eq(userRoles.tenantId, req.tenantId),
          eq(userRoles.isPrimary, false)
        ));
      
      if (moduleRoleKeys.length > 0) {
        const moduleRoles = await db.select({ id: roles.id })
          .from(roles)
          .where(sql`${roles.name} = ANY(ARRAY[${sql.join(moduleRoleKeys.map(n => sql`${n}`), sql`, `)}]::text[])`);
        
        for (const mr of moduleRoles) {
          await db.insert(userRoles).values({
            userId,
            roleId: mr.id,
            tenantId: req.tenantId,
            isPrimary: false,
            assignedBy: req.userId,
          }).onConflictDoNothing();
        }
      }
    }
    
    const { password: _, ...userResponse } = updatedUser;
    res.json(userResponse);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// Deactivate user (super user only)
router.patch("/users/:id/deactivate", authenticate, requireSuperUser, async (req: any, res) => {
  try {
    const userId = parseInt(req.params.id);
    
    const updatedUser = await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.tenantId, req.tenantId)))
      .returning();
    
    if (!updatedUser || updatedUser.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({ message: "User deactivated successfully" });
  } catch (error) {
    console.error("Error deactivating user:", error);
    res.status(500).json({ error: "Failed to deactivate user" });
  }
});

// ============================================================
// Tenant Settings Routes
// ============================================================

// Get tenant settings
router.get("/tenant-settings", authenticate, async (req: any, res) => {
  try {
    const settings = await db
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, req.tenantId))
      .limit(1);
    
    if (settings.length === 0) {
      // Create default settings if none exist
      const [defaultSettings] = await db
        .insert(tenantSettings)
        .values({ tenantId: req.tenantId })
        .returning();
      return res.json(defaultSettings);
    }
    
    res.json(settings[0]);
  } catch (error) {
    console.error("Error fetching tenant settings:", error);
    res.status(500).json({ error: "Failed to fetch tenant settings" });
  }
});

// Update tenant settings (super user only)
router.put("/tenant-settings", authenticate, requireSuperUser, async (req: any, res) => {
  try {
    const validatedData = insertTenantSettingsSchema.parse({
      ...req.body,
      tenantId: req.tenantId
    });
    
    const [updatedSettings] = await db
      .update(tenantSettings)
      .set({ ...validatedData, updatedAt: new Date() })
      .where(eq(tenantSettings.tenantId, req.tenantId))
      .returning();
    
    if (!updatedSettings) {
      // Create if doesn't exist
      const [newSettings] = await db
        .insert(tenantSettings)
        .values(validatedData)
        .returning();
      return res.json(newSettings);
    }
    
    res.json(updatedSettings);
  } catch (error) {
    console.error("Error updating tenant settings:", error);
    res.status(500).json({ error: "Failed to update tenant settings" });
  }
});

// ============================================================
// Permission Management Routes
// ============================================================

// Get user permissions
router.get("/users/:userId/permissions", authenticate, async (req: any, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const permissions = await db
      .select()
      .from(userPermissions)
      .where(eq(userPermissions.userId, userId));
    
    res.json(permissions);
  } catch (error) {
    console.error("Error fetching user permissions:", error);
    res.status(500).json({ error: "Failed to fetch user permissions" });
  }
});

// Update user permissions (super user only)
router.post("/users/:userId/permissions", authenticate, requireSuperUser, async (req: any, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { permissions } = req.body;
    
    // Delete existing permissions
    await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
    
    // Insert new permissions
    if (permissions && permissions.length > 0) {
      const permissionData = permissions.map((perm: any) => ({
        userId,
        module: perm.module,
        action: perm.action,
        granted: perm.granted
      }));
      
      await db.insert(userPermissions).values(permissionData);
    }
    
    res.json({ message: "Permissions updated successfully" });
  } catch (error) {
    console.error("Error updating user permissions:", error);
    res.status(500).json({ error: "Failed to update user permissions" });
  }
});

// Get system modules for permission configuration
router.get("/system/modules", authenticate, async (req: any, res) => {
  try {
    const modules = [
      {
        name: "dashboard",
        displayName: "Dashboard",
        actions: ["read"]
      },
      {
        name: "customers",
        displayName: "Customers",
        actions: ["create", "read", "update", "delete"]
      },
      {
        name: "inquiries",
        displayName: "Inquiries",
        actions: ["create", "read", "update", "delete"]
      },
      {
        name: "quotations",
        displayName: "Quotations",
        actions: ["create", "read", "update", "delete"]
      },
      {
        name: "orders",
        displayName: "Orders",
        actions: ["create", "read", "update", "delete"]
      },
      {
        name: "inventory",
        displayName: "Inventory",
        actions: ["create", "read", "update", "delete"]
      },
      {
        name: "timeaction",
        displayName: "Time & Action Plans",
        actions: ["create", "read", "update", "delete"]
      },
      {
        name: "samples",
        displayName: "Samples",
        actions: ["create", "read", "update", "delete"]
      },
      {
        name: "accounting",
        displayName: "Accounting",
        actions: ["create", "read", "update", "delete"]
      },
      {
        name: "reports",
        displayName: "Reports",
        actions: ["read", "export"]
      },
      {
        name: "settings",
        displayName: "Settings",
        actions: ["read", "update"]
      }
    ];
    
    res.json(modules);
  } catch (error) {
    console.error("Error fetching system modules:", error);
    res.status(500).json({ error: "Failed to fetch system modules" });
  }
});

export async function backfillUserRoles() {
  try {
    const usersWithoutRoles = await db
      .select({ id: users.id, roleId: users.roleId, tenantId: users.tenantId })
      .from(users)
      .where(
        and(
          sql`${users.id} NOT IN (SELECT user_id FROM user_roles)`,
          sql`${users.roleId} IS NOT NULL`
        )
      );
    
    if (usersWithoutRoles.length > 0) {
      for (const u of usersWithoutRoles) {
        await db.insert(userRoles).values({
          userId: u.id,
          roleId: u.roleId!,
          tenantId: u.tenantId,
          isPrimary: true,
        }).onConflictDoNothing();
      }
      console.log(`[Backfill] Synced ${usersWithoutRoles.length} users to user_roles table`);
    }
  } catch (error) {
    console.error("[Backfill] Error syncing user_roles:", error);
  }
}

export default router;