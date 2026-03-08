import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import {
  listOperationBulletins, getOperationBulletin, createOperationBulletin,
  addOBOperation, removeOBOperation, approveOB,
  listLineLoads, createLineLoad, updateLineLoad,
  listBundleProgress, updateBundleProgress,
  createInlineInspection, listInlineInspections,
  calculateDHU, getSewingDashboard,
} from "../../services/sewingExecutionService";

const router = Router();
router.use(authenticate);

router.get("/obs", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listOperationBulletins(tenantId, req.query);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/obs/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getOperationBulletin(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/obs", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createOperationBulletin(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/obs/:id/ops", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await addOBOperation(tenantId, +req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete("/obs/ops/:opId", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await removeOBOperation(tenantId, +req.params.opId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/obs/:id/approve", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await approveOB(tenantId, +req.params.id, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/line-loads", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listLineLoads(tenantId, req.query);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/line-loads", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createLineLoad(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/line-loads/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await updateLineLoad(tenantId, +req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/line-loads/:id/progress", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listBundleProgress(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/line-loads/:id/progress", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await updateBundleProgress(tenantId, req.body.bundle_id, +req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/inspections/inline", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await createInlineInspection(tenantId, { ...req.body, inspector_user_id: userId });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/inspections/inline", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listInlineInspections(tenantId, req.query);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/dhu", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await calculateDHU(tenantId, +(req.query.line_id || 0), req.query.date as string);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/dashboard", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getSewingDashboard(tenantId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
