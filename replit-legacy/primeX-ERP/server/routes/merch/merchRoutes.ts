import { parseIntParam } from "../../utils/parseParams";
import { Router, Request, Response } from "express";
import {
  submitEnquiry,
  updateEnquiryMerchStatus,
  createStyle,
  listStyles,
  getStyleById,
  createQuotation,
  approveQuotation,
  reviseQuotation,
  getQuotationWithVersions,
  getEnquiryTrace,
  createOrUpdateCosting,
  getCostingByQuotation,
  getStyleComponents,
  createStyleComponent,
  updateStyleComponent,
  deleteStyleComponent,
  getStyleColorways,
  createStyleColorway,
  updateStyleColorway,
  deleteStyleColorway,
  getStyleSizeScales,
  createStyleSizeScale,
  updateStyleSizeScale,
  deleteStyleSizeScale,
  canDeleteStyle,
  toggleStyleActive,
  deleteStyle,
} from "../../services/merchandisingService";
import { runBackfillStyleId } from "../../scripts/backfillStyleId";
import { db } from "../../db";
import { sql } from "drizzle-orm";

const router = Router();

// ============================================================================
// Style Routes
// ============================================================================

router.post('/styles', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const data = req.body;
    const result = await createStyle(tenantId, data);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error creating style:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/styles', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const filters: any = {};
    if (req.query.buyerId) filters.buyerId = parseInt(req.query.buyerId as string);
    if (req.query.status) filters.status = req.query.status as string;
    const result = await listStyles(tenantId, filters);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error listing styles:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/styles/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const styleId = parseIntParam(req.params.id, "id");
    const result = await getStyleById(tenantId, styleId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting style:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// Enquiry Routes
// ============================================================================

router.post('/enquiries/:id/submit', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const enquiryId = parseIntParam(req.params.id, "id");
    const userId = (req as any).userId || (req as any).user?.id;
    const result = await submitEnquiry(tenantId, enquiryId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error submitting enquiry:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.patch('/enquiries/:id/status', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const enquiryId = parseIntParam(req.params.id, "id");
    const userId = (req as any).userId || (req as any).user?.id;
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'status is required in request body' });
    }
    const result = await updateEnquiryMerchStatus(tenantId, enquiryId, status, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error updating enquiry status:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/enquiries/:id/trace', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const enquiryId = parseIntParam(req.params.id, "id");
    const result = await getEnquiryTrace(tenantId, enquiryId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting enquiry trace:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// Quotation Routes
// ============================================================================

router.post('/quotations', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const data = req.body;
    const result = await createQuotation(tenantId, data);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error creating quotation:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/quotations/:id/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const quotationId = parseIntParam(req.params.id, "id");
    const userId = (req as any).userId || (req as any).user?.id;
    const result = await approveQuotation(tenantId, quotationId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error approving quotation:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/quotations/:id/revise', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const quotationId = parseIntParam(req.params.id, "id");
    const userId = (req as any).userId || (req as any).user?.id;
    const result = await reviseQuotation(tenantId, quotationId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error revising quotation:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/quotations/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const quotationId = parseIntParam(req.params.id, "id");
    const result = await getQuotationWithVersions(tenantId, quotationId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting quotation:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.get('/quotations/:id/costing', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const quotationId = parseIntParam(req.params.id, "id");
    const result = await getCostingByQuotation(tenantId, quotationId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting costing:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/quotations/:id/costing', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const quotationId = parseIntParam(req.params.id, "id");
    const costingData = req.body;
    const result = await createOrUpdateCosting(tenantId, quotationId, costingData);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error creating/updating costing:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// Style Components Routes
// ============================================================================

router.get('/styles/:styleId/components', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const styleId = parseIntParam(req.params.styleId, "styleId");
    const result = await getStyleComponents(tenantId, styleId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting style components:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/styles/:styleId/components', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const styleId = parseIntParam(req.params.styleId, "styleId");
    const result = await createStyleComponent({ ...req.body, tenantId, styleId });
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'A component with this name already exists for this style' });
    console.error('Error creating style component:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.put('/styles/:styleId/components/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const id = parseIntParam(req.params.id, "id");
    const result = await updateStyleComponent(tenantId, id, req.body);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'A component with this name already exists for this style' });
    console.error('Error updating style component:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.delete('/styles/:styleId/components/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const id = parseIntParam(req.params.id, "id");
    const result = await deleteStyleComponent(tenantId, id);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error deleting style component:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// Style Colorways Routes
// ============================================================================

router.get('/styles/:styleId/colorways', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const styleId = parseIntParam(req.params.styleId, "styleId");
    const result = await getStyleColorways(tenantId, styleId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting style colorways:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/styles/:styleId/colorways', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const styleId = parseIntParam(req.params.styleId, "styleId");
    const result = await createStyleColorway({ ...req.body, tenantId, styleId });
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'A colorway with this name already exists for this style' });
    console.error('Error creating style colorway:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.put('/styles/:styleId/colorways/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const id = parseIntParam(req.params.id, "id");
    const result = await updateStyleColorway(tenantId, id, req.body);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'A colorway with this name already exists for this style' });
    console.error('Error updating style colorway:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.delete('/styles/:styleId/colorways/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const id = parseIntParam(req.params.id, "id");
    const result = await deleteStyleColorway(tenantId, id);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error deleting style colorway:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// Style Size Scales Routes
// ============================================================================

router.get('/styles/:styleId/size-scales', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const styleId = parseIntParam(req.params.styleId, "styleId");
    const result = await getStyleSizeScales(tenantId, styleId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error getting style size scales:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.post('/styles/:styleId/size-scales', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const styleId = parseIntParam(req.params.styleId, "styleId");
    const result = await createStyleSizeScale({ ...req.body, tenantId, styleId });
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'A size scale with this name already exists for this style' });
    console.error('Error creating style size scale:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.put('/styles/:styleId/size-scales/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const id = parseIntParam(req.params.id, "id");
    const result = await updateStyleSizeScale(tenantId, id, req.body);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'A size scale with this name already exists for this style' });
    console.error('Error updating style size scale:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.delete('/styles/:styleId/size-scales/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const id = parseIntParam(req.params.id, "id");
    const result = await deleteStyleSizeScale(tenantId, id);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error deleting style size scale:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// Style Toggle Active & Delete with Guardrail
// ============================================================================

router.patch('/styles/:styleId/toggle-active', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const styleId = parseIntParam(req.params.styleId, "styleId");
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isActive (boolean) is required in request body' });
    }
    const result = await toggleStyleActive(tenantId, styleId, isActive);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message });
    console.error('Error toggling style active:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

router.delete('/styles/:styleId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const styleId = parseIntParam(req.params.styleId, "styleId");
    const result = await deleteStyle(tenantId, styleId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ERPError') return res.status(error.httpStatus).json({ success: false, code: error.code, message: error.message, details: error.details });
    console.error('Error deleting style:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// Pipeline Aggregation Route
// ============================================================================

router.get('/pipeline', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const { getPipelineData } = await import("../../services/merchandisingService");
    const result = await getPipelineData(tenantId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error getting pipeline data:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// Critical Alerts Aggregation
// ============================================================================

router.get('/critical-alerts', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const today = new Date().toISOString().split('T')[0];
    const alerts: Array<{
      id: string;
      severity: 'critical' | 'warning' | 'info';
      category: string;
      title: string;
      description: string;
      link: string;
      assignedTo: string | null;
      daysOverdue: number;
      createdAt: string;
    }> = [];

    const { sql: sqlTag } = await import("drizzle-orm");

    const overdueTnaTasks = await db.execute(sqlTag`
      SELECT tt.id, tt.name, tt.planned_end, tt.status, tt.assigned_role,
             tp.plan_no, tp.related_type, tp.related_id
      FROM tna_tasks tt
      JOIN tna_plans tp ON tt.plan_id = tp.id AND tp.tenant_id = ${tenantId}
      WHERE tt.tenant_id = ${tenantId}
        AND tt.status NOT IN ('COMPLETED', 'SKIPPED')
        AND tt.planned_end IS NOT NULL
        AND tt.planned_end < ${today}
      ORDER BY tt.planned_end ASC
      LIMIT 50
    `);

    for (const task of overdueTnaTasks.rows as any[]) {
      const daysOverdue = Math.floor((Date.now() - new Date(task.planned_end).getTime()) / 86400000);
      alerts.push({
        id: `tna-${task.id}`,
        severity: daysOverdue > 7 ? 'critical' : 'warning',
        category: 'TNA Milestone',
        title: `Overdue: ${task.name}`,
        description: `Plan ${task.plan_no} — ${daysOverdue} day(s) overdue (was due ${task.planned_end})`,
        link: `/tna/plans/${task.related_id || ''}`,
        assignedTo: task.assigned_role || null,
        daysOverdue,
        createdAt: task.planned_end,
      });
    }

    const overdueMilestones = await db.execute(sqlTag`
      SELECT m.id, m.milestone_name, m.planned_end_date, m.status, m.responsible_person,
             p.id as plan_id, p.name as plan_name
      FROM time_action_milestones m
      JOIN time_action_plans p ON m.plan_id = p.id AND p.tenant_id = ${tenantId}
      WHERE m.tenant_id = ${tenantId}
        AND m.status NOT IN ('completed')
        AND m.planned_end_date < ${today}
      ORDER BY m.planned_end_date ASC
      LIMIT 50
    `);

    for (const m of overdueMilestones.rows as any[]) {
      const daysOverdue = Math.floor((Date.now() - new Date(m.planned_end_date).getTime()) / 86400000);
      alerts.push({
        id: `milestone-${m.id}`,
        severity: daysOverdue > 7 ? 'critical' : 'warning',
        category: 'Time & Action',
        title: `Overdue Milestone: ${m.milestone_name}`,
        description: `Plan "${m.plan_name}" — ${daysOverdue} day(s) overdue`,
        link: `/time-action`,
        assignedTo: m.responsible_person || null,
        daysOverdue,
        createdAt: m.planned_end_date,
      });
    }

    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
    const pendingSamples = await db.execute(sqlTag`
      SELECT sr.id, sr.request_number, sr.status, sr.updated_at,
             c.customer_name
      FROM sample_requests sr
      LEFT JOIN customers c ON sr.customer_id = c.id
      WHERE sr.tenant_id = ${tenantId}
        AND sr.status IN ('SUBMITTED', 'SENT_TO_BUYER')
        AND sr.updated_at < ${threeDaysAgo}
      ORDER BY sr.updated_at ASC
      LIMIT 50
    `);

    for (const s of pendingSamples.rows as any[]) {
      const daysWaiting = Math.floor((Date.now() - new Date(s.updated_at).getTime()) / 86400000);
      alerts.push({
        id: `sample-${s.id}`,
        severity: daysWaiting > 7 ? 'warning' : 'info',
        category: 'Sample Approval',
        title: `Pending: ${s.request_number}`,
        description: `${s.customer_name || 'Unknown buyer'} — waiting ${daysWaiting} day(s)`,
        link: `/samples/requests/${s.id}`,
        assignedTo: null,
        daysOverdue: daysWaiting,
        createdAt: s.updated_at,
      });
    }

    const thirtyDaysFromNow = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const expiringLcs = await db.execute(sqlTag`
      SELECT id, lc_number, expiry_date, lc_value, currency, status, beneficiary
      FROM commercial_lcs
      WHERE tenant_id = ${tenantId}
        AND status NOT IN ('CLOSED', 'CANCELLED', 'EXPIRED')
        AND expiry_date IS NOT NULL
        AND expiry_date <= ${thirtyDaysFromNow}
      ORDER BY expiry_date ASC
      LIMIT 50
    `);

    for (const lc of expiringLcs.rows as any[]) {
      const daysUntilExpiry = Math.floor((new Date(lc.expiry_date).getTime() - Date.now()) / 86400000);
      alerts.push({
        id: `lc-${lc.id}`,
        severity: daysUntilExpiry < 7 ? 'critical' : daysUntilExpiry < 14 ? 'warning' : 'info',
        category: 'LC Expiry',
        title: `LC ${lc.lc_number} expiring`,
        description: `${lc.currency} ${lc.lc_value} — expires in ${daysUntilExpiry} day(s) on ${lc.expiry_date}`,
        link: `/commercial`,
        assignedTo: lc.beneficiary || null,
        daysOverdue: -daysUntilExpiry,
        createdAt: lc.expiry_date,
      });
    }

    const fourteenDaysFromNow = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    const atRiskOrders = await db.execute(sqlTag`
      SELECT id, order_id, style_name, delivery_date, order_status, total_quantity
      FROM orders
      WHERE tenant_id = ${tenantId}
        AND order_status NOT IN ('completed', 'shipped', 'delivered', 'canceled')
        AND delivery_date <= ${fourteenDaysFromNow}
      ORDER BY delivery_date ASC
      LIMIT 50
    `);

    for (const o of atRiskOrders.rows as any[]) {
      const daysUntilDelivery = Math.floor((new Date(o.delivery_date).getTime() - Date.now()) / 86400000);
      const isOverdue = daysUntilDelivery < 0;
      alerts.push({
        id: `order-${o.id}`,
        severity: isOverdue ? 'critical' : daysUntilDelivery < 7 ? 'warning' : 'info',
        category: 'Order at Risk',
        title: `${o.order_id}: ${o.style_name}`,
        description: isOverdue
          ? `${Math.abs(daysUntilDelivery)} day(s) past delivery date — status: ${o.order_status}`
          : `${daysUntilDelivery} day(s) until delivery — status: ${o.order_status}`,
        link: `/orders/${o.id}`,
        assignedTo: null,
        daysOverdue: isOverdue ? Math.abs(daysUntilDelivery) : -daysUntilDelivery,
        createdAt: o.delivery_date,
      });
    }

    const delayedMaterials = await db.execute(sqlTag`
      SELECT om.id, om.material_type, om.expected_delivery_date, om.booking_status,
             o.order_id, o.style_name
      FROM order_materials om
      JOIN orders o ON om.order_id = o.id AND o.tenant_id = ${tenantId}
      WHERE om.tenant_id = ${tenantId}
        AND om.booking_status NOT IN ('received')
        AND om.expected_delivery_date IS NOT NULL
        AND om.expected_delivery_date < ${today}
      ORDER BY om.expected_delivery_date ASC
      LIMIT 50
    `);

    for (const mat of delayedMaterials.rows as any[]) {
      const daysOverdue = Math.floor((Date.now() - new Date(mat.expected_delivery_date).getTime()) / 86400000);
      alerts.push({
        id: `material-${mat.id}`,
        severity: daysOverdue > 7 ? 'critical' : 'warning',
        category: 'Material Delay',
        title: `${mat.material_type} for ${mat.order_id}`,
        description: `${mat.style_name} — ${daysOverdue} day(s) overdue (expected ${mat.expected_delivery_date})`,
        link: `/orders/${mat.order_id}`,
        assignedTo: null,
        daysOverdue,
        createdAt: mat.expected_delivery_date,
      });
    }

    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.daysOverdue - a.daysOverdue);

    const summary = {
      critical: alerts.filter(a => a.severity === 'critical').length,
      warning: alerts.filter(a => a.severity === 'warning').length,
      info: alerts.filter(a => a.severity === 'info').length,
      total: alerts.length,
    };

    return res.json({ success: true, data: { alerts, summary } });
  } catch (error: any) {
    console.error('Error fetching critical alerts:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// Consumption Reconciliation
// ============================================================================

router.get('/consumption-reconciliation/:orderId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const orderId = parseIntParam(req.params.orderId, "orderId");

    const orderRows = await db.execute(
      sql`SELECT id, order_id, style_name, total_quantity FROM orders WHERE id = ${orderId} AND tenant_id = ${tenantId} LIMIT 1`
    );
    const order = (orderRows as any).rows?.[0];
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const snapshotRows = await db.execute(
      sql`SELECT obsi.item_id, obsi.item_name, obsi.material_type,
                 COALESCE(obsi.unit_name, 'pcs') as unit_name,
                 COALESCE(obsi.total_required_qty, obsi.required_qty)::numeric as planned_qty
          FROM order_bom_snapshot_items obsi
          JOIN order_bom_snapshots obs ON obs.id = obsi.snapshot_id
          WHERE obs.order_id = ${orderId} AND obs.tenant_id = ${tenantId}
          ORDER BY obsi.material_type, obsi.item_name`
    );
    const plannedItems: any[] = (snapshotRows as any).rows || [];

    const consumptionRows = await db.execute(
      sql`SELECT pc.item_id, SUM(pc.qty::numeric) as total_consumed
          FROM production_consumptions pc
          JOIN production_orders po ON po.id = pc.production_order_id
          WHERE po.order_id = ${orderId} AND pc.tenant_id = ${tenantId}
          GROUP BY pc.item_id`
    );
    const consumptionMap = new Map<number, number>();
    for (const row of ((consumptionRows as any).rows || [])) {
      consumptionMap.set(row.item_id, parseFloat(row.total_consumed) || 0);
    }

    let totalPlanned = 0;
    let totalActual = 0;
    let itemsExceedingTolerance = 0;

    const items = plannedItems.map((p: any) => {
      const plannedQty = parseFloat(p.planned_qty) || 0;
      const actualQty = consumptionMap.get(p.item_id) || 0;
      const variance = actualQty - plannedQty;
      const variancePct = plannedQty > 0 ? (variance / plannedQty) * 100 : 0;

      totalPlanned += plannedQty;
      totalActual += actualQty;
      if (Math.abs(variancePct) > 5) itemsExceedingTolerance++;

      return {
        itemId: p.item_id,
        itemName: p.item_name,
        materialType: p.material_type,
        unitName: p.unit_name,
        plannedQty,
        actualQty,
        variance,
        variancePct,
      };
    });

    const overallVariancePct = totalPlanned > 0 ? ((totalActual - totalPlanned) / totalPlanned) * 100 : 0;

    return res.json({
      order: {
        id: order.id,
        orderId: order.order_id,
        styleName: order.style_name,
        totalQuantity: order.total_quantity,
      },
      items,
      summary: {
        totalPlanned,
        totalActual,
        overallVariancePct,
        itemsExceedingTolerance,
      },
    });
  } catch (error: any) {
    console.error('Error fetching consumption reconciliation:', error);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
});

// ============================================================================
// Backfill Route
// ============================================================================

router.post('/backfill-style-ids', async (req: Request, res: Response) => {
  try {
    const summary = await runBackfillStyleId(db);
    return res.json({ success: true, data: summary });
  } catch (error: any) {
    console.error('Error running backfill:', error);
    return res.status(500).json({ success: false, message: 'Backfill failed', error: error.message });
  }
});

export default router;
