import { parseIntParam } from "../../utils/parseParams";
import { Router, Request, Response } from "express";
import {
  createTemplate, addTemplateTasks, listTemplates, getTemplate,
  generatePlan, listPlans, getPlanDetail,
  updateTask, addTaskComment,
  getDashboardSummary, getUpcomingTasks, getOverdueTasks,
} from "../../services/tnaService";

const router = Router();

router.post('/templates', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const { name, appliesTo, productType } = req.body;
    if (!name || !appliesTo) return res.status(400).json({ success: false, message: 'name and appliesTo are required' });
    const data = await createTemplate(tenantId, { name, appliesTo, productType, createdBy: (req as any).userId });
    return res.json({ success: true, data });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error creating TNA template:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/templates/:id/tasks', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const templateId = parseIntParam(req.params.id, "id");
    const { tasks } = req.body;
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) return res.status(400).json({ success: false, message: 'tasks array is required' });
    const data = await addTemplateTasks(tenantId, templateId, tasks);
    return res.json({ success: true, data });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error adding template tasks:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/templates', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const { appliesTo, productType } = req.query;
    const data = await listTemplates(tenantId, {
      appliesTo: appliesTo as string | undefined,
      productType: productType as string | undefined,
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error listing TNA templates:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const templateId = parseIntParam(req.params.id, "id");
    const data = await getTemplate(tenantId, templateId);
    return res.json({ success: true, data });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting TNA template:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/plans', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const { templateId, relatedType, relatedId, anchorDateType, anchorDate } = req.body;
    if (!templateId || !relatedType || !relatedId || !anchorDate) {
      return res.status(400).json({ success: false, message: 'templateId, relatedType, relatedId, and anchorDate are required' });
    }
    const data = await generatePlan(tenantId, {
      templateId, relatedType, relatedId, anchorDateType: anchorDateType || 'DELIVERY', anchorDate,
      createdBy: (req as any).userId,
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error generating TNA plan:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/plans', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const { relatedType, relatedId, status } = req.query;
    const data = await listPlans(tenantId, {
      relatedType: relatedType as string | undefined,
      relatedId: relatedId ? parseInt(relatedId as string) : undefined,
      status: status as string | undefined,
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error listing TNA plans:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/plans/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const planId = parseIntParam(req.params.id, "id");
    const data = await getPlanDetail(tenantId, planId);
    return res.json({ success: true, data });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting TNA plan detail:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.patch('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const taskId = parseIntParam(req.params.id, "id");
    const userId = (req as any).userId as number;
    const { status, actualStart, actualEnd, assignedToUserId, remarks } = req.body;
    const data = await updateTask(tenantId, taskId, userId, { status, actualStart, actualEnd, assignedToUserId, remarks });
    return res.json({ success: true, data });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error updating TNA task:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/tasks/:id/comment', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const taskId = parseIntParam(req.params.id, "id");
    const userId = (req as any).userId as number;
    const { comment } = req.body;
    if (!comment) return res.status(400).json({ success: false, message: 'comment is required' });
    const data = await addTaskComment(tenantId, taskId, userId, comment);
    return res.json({ success: true, data });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error adding TNA task comment:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/dashboard/summary', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const data = await getDashboardSummary(tenantId);
    return res.json({ success: true, data });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting TNA dashboard summary:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/dashboard/upcoming', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const days = parseInt(req.query.days as string) || 7;
    const data = await getUpcomingTasks(tenantId, days);
    return res.json({ success: true, data });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting upcoming TNA tasks:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/dashboard/overdue', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const data = await getOverdueTasks(tenantId);
    return res.json({ success: true, data });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting overdue TNA tasks:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

export default router;
