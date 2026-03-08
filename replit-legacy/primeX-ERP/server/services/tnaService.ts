import { db } from '../db';
import { eq, and, desc, lte, gte, not, inArray, sql, count, asc, isNull, or } from 'drizzle-orm';
import { tnaTemplates, tnaTemplateTasks, tnaPlans, tnaTasks, tnaTaskUpdates } from '@shared/schema';

class ERPError extends Error {
  code: string;
  httpStatus: number;
  details?: any;
  constructor(code: string, message: string, httpStatus: number = 400, details?: any) {
    super(message);
    this.name = 'ERPError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  NOT_STARTED: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  IN_PROGRESS: ['DONE', 'DELAYED', 'BLOCKED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
  DELAYED: ['IN_PROGRESS', 'DONE'],
};

// ======================== Template Management ========================

export async function createTemplate(
  tenantId: number,
  data: { name: string; appliesTo: string; productType?: string; createdBy?: number }
) {
  const [template] = await db.insert(tnaTemplates).values({
    tenantId,
    name: data.name,
    appliesTo: data.appliesTo,
    productType: data.productType || null,
    createdBy: data.createdBy || null,
  }).returning();
  return template;
}

export async function addTemplateTasks(
  tenantId: number,
  templateId: number,
  tasks: Array<{
    name: string;
    department?: string;
    defaultOffsetDays: number;
    durationDays?: number;
    dependencyTaskIds?: number[];
    isCritical?: boolean;
    defaultOwnerRole?: string;
    sortOrder?: number;
  }>
) {
  const template = await db.select().from(tnaTemplates)
    .where(and(eq(tnaTemplates.id, templateId), eq(tnaTemplates.tenantId, tenantId)));
  if (!template.length) throw new ERPError('TEMPLATE_NOT_FOUND', 'Template not found', 404);

  const values = tasks.map((t, idx) => ({
    tenantId,
    templateId,
    name: t.name,
    department: t.department || null,
    defaultOffsetDays: t.defaultOffsetDays,
    durationDays: t.durationDays || null,
    dependencyTaskIds: t.dependencyTaskIds || null,
    isCritical: t.isCritical || false,
    defaultOwnerRole: t.defaultOwnerRole || null,
    sortOrder: t.sortOrder ?? idx,
  }));

  const inserted = await db.insert(tnaTemplateTasks).values(values).returning();
  return inserted;
}

export async function listTemplates(
  tenantId: number,
  filters?: { appliesTo?: string; productType?: string }
) {
  const conditions = [eq(tnaTemplates.tenantId, tenantId), eq(tnaTemplates.isActive, true)];
  if (filters?.appliesTo) conditions.push(eq(tnaTemplates.appliesTo, filters.appliesTo));
  if (filters?.productType) conditions.push(eq(tnaTemplates.productType, filters.productType));

  return db.select().from(tnaTemplates).where(and(...conditions)).orderBy(desc(tnaTemplates.createdAt));
}

export async function getTemplate(tenantId: number, templateId: number) {
  const [template] = await db.select().from(tnaTemplates)
    .where(and(eq(tnaTemplates.id, templateId), eq(tnaTemplates.tenantId, tenantId)));
  if (!template) throw new ERPError('TEMPLATE_NOT_FOUND', 'Template not found', 404);

  const tasks = await db.select().from(tnaTemplateTasks)
    .where(and(eq(tnaTemplateTasks.templateId, templateId), eq(tnaTemplateTasks.tenantId, tenantId)))
    .orderBy(asc(tnaTemplateTasks.sortOrder));

  return { ...template, tasks };
}

// ======================== Plan Generation ========================

function computeCriticalPath(tasks: Array<{ id: number; dependsOnTaskIds: number[] | null; plannedStart: string | null; plannedEnd: string | null; durationDays: number }>) {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const inDegree = new Map<number, number>();
  const adj = new Map<number, number[]>();

  for (const t of tasks) {
    inDegree.set(t.id, 0);
    adj.set(t.id, []);
  }

  for (const t of tasks) {
    if (t.dependsOnTaskIds && t.dependsOnTaskIds.length > 0) {
      for (const depId of t.dependsOnTaskIds) {
        if (adj.has(depId)) {
          adj.get(depId)!.push(t.id);
          inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
        }
      }
    }
  }

  const queue: number[] = [];
  for (const [id, deg] of Array.from(inDegree)) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder: number[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoOrder.push(curr);
    for (const next of (adj.get(curr) || [])) {
      inDegree.set(next, (inDegree.get(next) || 0) - 1);
      if (inDegree.get(next) === 0) queue.push(next);
    }
  }

  const earliestFinish = new Map<number, number>();
  for (const id of topoOrder) {
    const t = taskMap.get(id)!;
    let es = 0;
    if (t.dependsOnTaskIds && t.dependsOnTaskIds.length > 0) {
      for (const depId of t.dependsOnTaskIds) {
        es = Math.max(es, earliestFinish.get(depId) || 0);
      }
    }
    earliestFinish.set(id, es + t.durationDays);
  }

  let maxFinish = 0;
  for (const ef of Array.from(earliestFinish.values())) {
    maxFinish = Math.max(maxFinish, ef);
  }

  const latestFinish = new Map<number, number>();
  for (const id of [...topoOrder].reverse()) {
    const successors = adj.get(id) || [];
    if (successors.length === 0) {
      latestFinish.set(id, maxFinish);
    } else {
      let lf = Infinity;
      for (const succ of successors) {
        const succTask = taskMap.get(succ)!;
        lf = Math.min(lf, (latestFinish.get(succ) || maxFinish) - succTask.durationDays);
      }
      latestFinish.set(id, lf);
    }
  }

  const criticalIds = new Set<number>();
  for (const id of topoOrder) {
    const t = taskMap.get(id)!;
    const es = (earliestFinish.get(id) || 0) - t.durationDays;
    const lf = latestFinish.get(id) || 0;
    const ls = lf - t.durationDays;
    if (Math.abs(es - ls) < 0.001) {
      criticalIds.add(id);
    }
  }

  return criticalIds;
}

export async function generatePlan(
  tenantId: number,
  data: { templateId: number; relatedType: string; relatedId: number; anchorDateType: string; anchorDate: string; createdBy?: number }
) {
  const template = await getTemplate(tenantId, data.templateId);
  if (!template.tasks.length) throw new ERPError('TEMPLATE_EMPTY', 'Template has no tasks', 400);

  const planNo = `TNA-${Date.now()}`;
  const anchorDate = new Date(data.anchorDate);

  const [plan] = await db.insert(tnaPlans).values({
    tenantId,
    planNo,
    relatedType: data.relatedType,
    relatedId: data.relatedId,
    templateId: data.templateId,
    anchorDateType: data.anchorDateType,
    anchorDate: data.anchorDate,
    status: 'ACTIVE',
    createdBy: data.createdBy || null,
  }).returning();

  const taskInserts = template.tasks.map(tt => {
    const plannedEndDate = new Date(anchorDate);
    plannedEndDate.setDate(plannedEndDate.getDate() - tt.defaultOffsetDays);
    const duration = tt.durationDays || 1;
    const plannedStartDate = new Date(plannedEndDate);
    plannedStartDate.setDate(plannedStartDate.getDate() - duration);

    return {
      tenantId,
      planId: plan.id,
      templateTaskId: tt.id,
      name: tt.name,
      department: tt.department,
      plannedStart: plannedStartDate.toISOString().split('T')[0],
      plannedEnd: plannedEndDate.toISOString().split('T')[0],
      status: 'NOT_STARTED' as const,
      assignedRole: tt.defaultOwnerRole,
      dependsOnTaskIds: tt.dependencyTaskIds,
      isCritical: false,
      remarks: null,
    };
  });

  const insertedTasks = await db.insert(tnaTasks).values(taskInserts).returning();

  const tasksForCritical = insertedTasks.map(t => ({
    id: t.id,
    dependsOnTaskIds: t.dependsOnTaskIds,
    plannedStart: t.plannedStart,
    plannedEnd: t.plannedEnd,
    durationDays: t.plannedStart && t.plannedEnd
      ? Math.max(1, Math.round((new Date(t.plannedEnd).getTime() - new Date(t.plannedStart).getTime()) / (1000 * 60 * 60 * 24)))
      : 1,
  }));

  const criticalIds = computeCriticalPath(tasksForCritical);

  if (criticalIds.size > 0) {
    await db.update(tnaTasks)
      .set({ isCritical: true })
      .where(and(
        eq(tnaTasks.planId, plan.id),
        inArray(tnaTasks.id, Array.from(criticalIds))
      ));
  }

  const finalTasks = await db.select().from(tnaTasks)
    .where(eq(tnaTasks.planId, plan.id))
    .orderBy(asc(tnaTasks.plannedEnd));

  return { ...plan, tasks: finalTasks };
}

// ======================== Task Management ========================

export async function updateTask(
  tenantId: number,
  taskId: number,
  userId: number,
  updates: { status?: string; actualStart?: string; actualEnd?: string; assignedToUserId?: number; remarks?: string }
) {
  const [task] = await db.select().from(tnaTasks)
    .where(and(eq(tnaTasks.id, taskId), eq(tnaTasks.tenantId, tenantId)));
  if (!task) throw new ERPError('TASK_NOT_FOUND', 'TNA task not found', 404);

  if (updates.status && updates.status !== task.status) {
    const allowed = VALID_TRANSITIONS[task.status];
    if (!allowed || !allowed.includes(updates.status)) {
      throw new ERPError('INVALID_TRANSITION', `Cannot transition from ${task.status} to ${updates.status}`, 400);
    }

    if (updates.status === 'IN_PROGRESS' && task.dependsOnTaskIds && task.dependsOnTaskIds.length > 0) {
      const deps = await db.select().from(tnaTasks)
        .where(and(eq(tnaTasks.tenantId, tenantId), inArray(tnaTasks.id, task.dependsOnTaskIds)));
      const allDone = deps.every(d => d.status === 'DONE');
      if (!allDone) {
        updates.status = 'BLOCKED';
      }
    }

    await db.insert(tnaTaskUpdates).values({
      tenantId,
      taskId,
      fromStatus: task.status,
      toStatus: updates.status,
      comment: updates.remarks || null,
      updatedBy: userId,
    });
  }

  const setData: any = { updatedAt: new Date(), lastUpdatedBy: userId };
  if (updates.status) setData.status = updates.status;
  if (updates.actualStart !== undefined) setData.actualStart = updates.actualStart;
  if (updates.actualEnd !== undefined) setData.actualEnd = updates.actualEnd;
  if (updates.assignedToUserId !== undefined) setData.assignedToUserId = updates.assignedToUserId;
  if (updates.remarks !== undefined) setData.remarks = updates.remarks;

  const [updated] = await db.update(tnaTasks).set(setData)
    .where(and(eq(tnaTasks.id, taskId), eq(tnaTasks.tenantId, tenantId)))
    .returning();

  return updated;
}

export async function addTaskComment(tenantId: number, taskId: number, userId: number, comment: string) {
  const [task] = await db.select().from(tnaTasks)
    .where(and(eq(tnaTasks.id, taskId), eq(tnaTasks.tenantId, tenantId)));
  if (!task) throw new ERPError('TASK_NOT_FOUND', 'TNA task not found', 404);

  const [entry] = await db.insert(tnaTaskUpdates).values({
    tenantId,
    taskId,
    fromStatus: null,
    toStatus: null,
    comment,
    updatedBy: userId,
  }).returning();

  return entry;
}

// ======================== Plan Queries ========================

export async function listPlans(
  tenantId: number,
  filters?: { relatedType?: string; relatedId?: number; status?: string }
) {
  const conditions = [eq(tnaPlans.tenantId, tenantId)];
  if (filters?.relatedType) conditions.push(eq(tnaPlans.relatedType, filters.relatedType));
  if (filters?.relatedId) conditions.push(eq(tnaPlans.relatedId, filters.relatedId));
  if (filters?.status) conditions.push(eq(tnaPlans.status, filters.status));

  return db.select().from(tnaPlans).where(and(...conditions)).orderBy(desc(tnaPlans.createdAt));
}

export async function getPlanDetail(tenantId: number, planId: number) {
  const [plan] = await db.select().from(tnaPlans)
    .where(and(eq(tnaPlans.id, planId), eq(tnaPlans.tenantId, tenantId)));
  if (!plan) throw new ERPError('PLAN_NOT_FOUND', 'TNA plan not found', 404);

  const tasks = await db.select().from(tnaTasks)
    .where(and(eq(tnaTasks.planId, planId), eq(tnaTasks.tenantId, tenantId)))
    .orderBy(asc(tnaTasks.plannedEnd));

  const risk = await calculatePlanRisk(tenantId, planId);

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'DONE').length;
  const stats = {
    totalTasks,
    completedTasks,
    progressPercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
  };

  return { ...plan, tasks, risk, stats };
}

// ======================== Dashboard & Alerts ========================

export async function getDashboardSummary(tenantId: number) {
  const allPlans = await db.select().from(tnaPlans).where(eq(tnaPlans.tenantId, tenantId));
  const totalPlans = allPlans.length;
  const activePlans = allPlans.filter(p => p.status === 'ACTIVE').length;

  const allTasks = await db.select().from(tnaTasks).where(eq(tnaTasks.tenantId, tenantId));
  const totalTasks = allTasks.length;

  const tasksByStatus: Record<string, number> = { NOT_STARTED: 0, IN_PROGRESS: 0, DONE: 0, BLOCKED: 0, DELAYED: 0, CANCELLED: 0 };
  for (const t of allTasks) {
    tasksByStatus[t.status] = (tasksByStatus[t.status] || 0) + 1;
  }

  const today = new Date().toISOString().split('T')[0];
  const overdueTasks = allTasks.filter(t => t.plannedEnd && t.plannedEnd < today && !['DONE', 'CANCELLED'].includes(t.status)).length;

  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const sevenDayStr = sevenDaysFromNow.toISOString().split('T')[0];
  const upcomingTasks7d = allTasks.filter(t => t.plannedEnd && t.plannedEnd >= today && t.plannedEnd <= sevenDayStr && t.status !== 'DONE').length;

  const riskSummary: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  const activePlanIds = allPlans.filter(p => p.status === 'ACTIVE');
  for (const p of activePlanIds) {
    const risk = await calculatePlanRisk(tenantId, p.id);
    riskSummary[risk.riskCategory] = (riskSummary[risk.riskCategory] || 0) + 1;
  }

  return { totalPlans, activePlans, totalTasks, tasksByStatus, overdueTasks, upcomingTasks7d, riskSummary };
}

export async function getUpcomingTasks(tenantId: number, days: number) {
  const today = new Date().toISOString().split('T')[0];
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  const futureDateStr = futureDate.toISOString().split('T')[0];

  return db.select().from(tnaTasks)
    .where(and(
      eq(tnaTasks.tenantId, tenantId),
      gte(tnaTasks.plannedEnd, today),
      lte(tnaTasks.plannedEnd, futureDateStr),
      not(eq(tnaTasks.status, 'DONE')),
      not(eq(tnaTasks.status, 'CANCELLED'))
    ))
    .orderBy(asc(tnaTasks.plannedEnd));
}

export async function getOverdueTasks(tenantId: number) {
  const today = new Date().toISOString().split('T')[0];

  return db.select().from(tnaTasks)
    .where(and(
      eq(tnaTasks.tenantId, tenantId),
      lte(tnaTasks.plannedEnd, today),
      not(eq(tnaTasks.status, 'DONE')),
      not(eq(tnaTasks.status, 'CANCELLED'))
    ))
    .orderBy(asc(tnaTasks.plannedEnd));
}

// ======================== Risk Scoring ========================

export async function calculatePlanRisk(tenantId: number, planId: number) {
  const [plan] = await db.select().from(tnaPlans)
    .where(and(eq(tnaPlans.id, planId), eq(tnaPlans.tenantId, tenantId)));
  if (!plan) throw new ERPError('PLAN_NOT_FOUND', 'TNA plan not found', 404);

  const tasks = await db.select().from(tnaTasks)
    .where(and(eq(tnaTasks.planId, planId), eq(tnaTasks.tenantId, tenantId)));

  const today = new Date().toISOString().split('T')[0];
  const totalTasks = tasks.length;
  if (totalTasks === 0) return { planId, riskScore: 0, riskCategory: 'LOW' as const, details: { overduePct: 0, criticalDelayed: false, daysToAnchor: null } };

  const overdueTasks = tasks.filter(t => t.plannedEnd && t.plannedEnd < today && !['DONE', 'CANCELLED'].includes(t.status));
  const overduePct = (overdueTasks.length / totalTasks) * 100;

  const criticalDelayed = tasks.some(t => t.isCritical && ['DELAYED', 'BLOCKED'].includes(t.status));

  const anchorDate = new Date(plan.anchorDate);
  const todayDate = new Date(today);
  const daysToAnchor = Math.ceil((anchorDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
  const incompleteTasks = tasks.filter(t => !['DONE', 'CANCELLED'].includes(t.status)).length;

  let riskScore = 0;
  let riskCategory: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

  if (criticalDelayed) {
    riskScore = 90;
    riskCategory = 'HIGH';
  } else if (overduePct > 30) {
    riskScore = 80;
    riskCategory = 'HIGH';
  } else if (daysToAnchor < 7 && incompleteTasks > 0) {
    riskScore = 75;
    riskCategory = 'HIGH';
  } else if (overduePct > 15) {
    riskScore = 50;
    riskCategory = 'MEDIUM';
  } else if (overduePct > 0) {
    riskScore = 30;
    riskCategory = 'MEDIUM';
  } else {
    riskScore = 10;
    riskCategory = 'LOW';
  }

  return {
    planId,
    riskScore,
    riskCategory,
    details: {
      overduePct: Math.round(overduePct * 100) / 100,
      criticalDelayed,
      daysToAnchor,
      incompleteTasks,
      totalTasks,
    },
  };
}
