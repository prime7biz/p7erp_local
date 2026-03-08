import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import {
  listDefects, createDefect, updateDefect, toggleDefect,
  createInspection, listInspections, getInspection,
  createFinalLot, updateFinalLotResults, listFinalLots, getFinalLot,
  listCorrectiveActions, createCorrectiveAction, updateCorrectiveAction,
  getQCDashboard,
} from "../../services/qualityService";

const router = Router();
router.use(authenticate);

router.get("/defects", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listDefects(tenantId, { process: req.query.process as string, category: req.query.category as string, active: req.query.active !== undefined ? req.query.active === "true" : undefined });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/defects", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createDefect(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/defects/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await updateDefect(tenantId, +req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/defects/:id/toggle", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await toggleDefect(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/inspections", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listInspections(tenantId, { type: req.query.type as string, department: req.query.department as string, date: req.query.date as string, result: req.query.result as string });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/inspections/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getInspection(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/inspections", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createInspection(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/final-lots", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listFinalLots(tenantId, { status: req.query.status as string, related_type: req.query.related_type as string });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/final-lots/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getFinalLot(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/final-lots", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createFinalLot(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/final-lots/:id/results", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await updateFinalLotResults(tenantId, +req.params.id, req.body.found_defects);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/corrective-actions", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listCorrectiveActions(tenantId, { status: req.query.status as string, inspection_id: req.query.inspection_id ? +req.query.inspection_id : undefined, final_lot_id: req.query.final_lot_id ? +req.query.final_lot_id : undefined });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/corrective-actions", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createCorrectiveAction(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/corrective-actions/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await updateCorrectiveAction(tenantId, +req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/dashboard", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getQCDashboard(tenantId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
