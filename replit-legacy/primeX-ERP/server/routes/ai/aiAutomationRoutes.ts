import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import {
  listRules, getRule, createRule, updateRule, toggleRule, deleteRule,
  triggerEvent, listRuns, getRun,
  listNotifications, markNotificationRead, getUnreadCount,
  seedDefaultRules,
} from "../../services/aiAutomationService";

const router = Router();
router.use(authenticate);

router.get("/rules", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listRules(tenantId, { trigger_type: req.query.trigger_type as string, is_enabled: req.query.is_enabled !== undefined ? req.query.is_enabled === "true" : undefined });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/rules/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getRule(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/rules", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await createRule(tenantId, { ...req.body, created_by: userId });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/rules/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await updateRule(tenantId, +req.params.id, { ...req.body, updated_by: userId });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/rules/:id/toggle", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await toggleRule(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete("/rules/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await deleteRule(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/trigger", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await triggerEvent(tenantId, req.body.event_key, req.body.context || {});
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/runs", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listRuns(tenantId, req.query.rule_id ? +req.query.rule_id : undefined);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/runs/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getRun(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/notifications", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await listNotifications(tenantId, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/notifications/:id/read", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await markNotificationRead(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/notifications/unread-count", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await getUnreadCount(tenantId, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/seed-defaults", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await seedDefaultRules(tenantId, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
