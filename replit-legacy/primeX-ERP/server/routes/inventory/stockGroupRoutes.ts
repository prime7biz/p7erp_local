import { parseIntParam } from "../../utils/parseParams";
import express, { Request, Response } from 'express';
import { db } from '../../db';
import { stockGroups, items } from '@shared/schema';
import { eq, and, asc, isNull, sql } from 'drizzle-orm';

const router = express.Router();

const getTenantId = (req: Request): number => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) throw new Error("Tenant ID not found");
  return tenantId;
};

const getUserId = (req: Request): number => {
  const userId = req.user?.id;
  if (!userId) throw new Error("User ID not found");
  return userId;
};

router.get('/tree', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const allGroups = await db.select().from(stockGroups)
      .where(eq(stockGroups.tenantId, tenantId))
      .orderBy(asc(stockGroups.sortOrder), asc(stockGroups.name));

    const groupMap = new Map<number, any>();
    const roots: any[] = [];

    for (const g of allGroups) {
      groupMap.set(g.id, { ...g, children: [] });
    }

    for (const g of allGroups) {
      const node = groupMap.get(g.id)!;
      if (g.parentId && groupMap.has(g.parentId)) {
        groupMap.get(g.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    res.json(roots);
  } catch (error: any) {
    console.error('Stock group tree error:', error);
    res.status(500).json({ message: error.message || 'Failed to get stock group tree' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { flat } = req.query as Record<string, string>;

    const allGroups = await db.select().from(stockGroups)
      .where(eq(stockGroups.tenantId, tenantId))
      .orderBy(asc(stockGroups.sortOrder), asc(stockGroups.name));

    if (flat === 'true') {
      return res.json(allGroups);
    }

    const groupMap = new Map<number, any>();
    const roots: any[] = [];

    for (const g of allGroups) {
      groupMap.set(g.id, { ...g, children: [] });
    }

    for (const g of allGroups) {
      const node = groupMap.get(g.id)!;
      if (g.parentId && groupMap.has(g.parentId)) {
        groupMap.get(g.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    res.json(roots);
  } catch (error: any) {
    console.error('Stock groups error:', error);
    res.status(500).json({ message: error.message || 'Failed to get stock groups' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid stock group ID' });

    const [group] = await db.select().from(stockGroups)
      .where(and(eq(stockGroups.id, id), eq(stockGroups.tenantId, tenantId)));

    if (!group) return res.status(404).json({ message: 'Stock group not found' });

    res.json(group);
  } catch (error: any) {
    console.error('Stock group error:', error);
    res.status(500).json({ message: error.message || 'Failed to get stock group' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { name, code, parentId, nature, inventoryAccountId, cogsAccountId, wipAccountId, adjustmentAccountId, grniAccountId, isActive, sortOrder } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    let level = 0;
    let parentPath: string | null = null;

    if (parentId) {
      const [parent] = await db.select().from(stockGroups)
        .where(and(eq(stockGroups.id, parentId), eq(stockGroups.tenantId, tenantId)));
      if (!parent) return res.status(400).json({ message: 'Parent stock group not found' });
      level = parent.level + 1;
      parentPath = parent.path;
    }

    const autoCode = code || `SG-${Date.now().toString(36).toUpperCase()}`;

    const [created] = await db.insert(stockGroups).values({
      tenantId,
      name,
      code: autoCode,
      parentId: parentId || null,
      level,
      path: null,
      nature: nature || 'raw_material',
      inventoryAccountId: inventoryAccountId || null,
      cogsAccountId: cogsAccountId || null,
      wipAccountId: wipAccountId || null,
      adjustmentAccountId: adjustmentAccountId || null,
      grniAccountId: grniAccountId || null,
      isActive: isActive !== undefined ? isActive : true,
      sortOrder: sortOrder || 0,
    }).returning();

    const newPath = parentPath ? `${parentPath}/${created.id}` : String(created.id);
    const [updated] = await db.update(stockGroups)
      .set({ path: newPath })
      .where(eq(stockGroups.id, created.id))
      .returning();

    res.status(201).json(updated);
  } catch (error: any) {
    console.error('Create stock group error:', error);
    res.status(500).json({ message: error.message || 'Failed to create stock group' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid stock group ID' });

    const [existing] = await db.select().from(stockGroups)
      .where(and(eq(stockGroups.id, id), eq(stockGroups.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Stock group not found' });

    const { name, code, nature, inventoryAccountId, cogsAccountId, wipAccountId, adjustmentAccountId, grniAccountId, isActive, sortOrder } = req.body;

    const [updated] = await db.update(stockGroups).set({
      ...(name !== undefined && { name }),
      ...(code !== undefined && { code }),
      ...(nature !== undefined && { nature }),
      ...(inventoryAccountId !== undefined && { inventoryAccountId }),
      ...(cogsAccountId !== undefined && { cogsAccountId }),
      ...(wipAccountId !== undefined && { wipAccountId }),
      ...(adjustmentAccountId !== undefined && { adjustmentAccountId }),
      ...(grniAccountId !== undefined && { grniAccountId }),
      ...(isActive !== undefined && { isActive }),
      ...(sortOrder !== undefined && { sortOrder }),
      updatedAt: new Date(),
    }).where(and(eq(stockGroups.id, id), eq(stockGroups.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (error: any) {
    console.error('Update stock group error:', error);
    res.status(500).json({ message: error.message || 'Failed to update stock group' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid stock group ID' });

    const [existing] = await db.select().from(stockGroups)
      .where(and(eq(stockGroups.id, id), eq(stockGroups.tenantId, tenantId)));
    if (!existing) return res.status(404).json({ message: 'Stock group not found' });

    const childGroups = await db.select().from(stockGroups)
      .where(and(eq(stockGroups.parentId, id), eq(stockGroups.tenantId, tenantId)));
    if (childGroups.length > 0) {
      return res.status(400).json({ message: 'Cannot delete stock group with child groups' });
    }

    const linkedItems = await db.select().from(items)
      .where(and(eq(items.stockGroupId, id), eq(items.tenantId, tenantId)));
    if (linkedItems.length > 0) {
      return res.status(400).json({ message: 'Cannot delete stock group with linked items' });
    }

    await db.delete(stockGroups)
      .where(and(eq(stockGroups.id, id), eq(stockGroups.tenantId, tenantId)));

    res.json({ message: 'Stock group deleted successfully' });
  } catch (error: any) {
    console.error('Delete stock group error:', error);
    res.status(500).json({ message: error.message || 'Failed to delete stock group' });
  }
});

export default router;
