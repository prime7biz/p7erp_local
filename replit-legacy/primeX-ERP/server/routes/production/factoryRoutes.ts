import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import {
  listProductionPlans, getProductionPlan, createProductionPlan, updateProductionPlan,
  approveProductionPlan, activateProductionPlan, closeProductionPlan,
  listLineAssignments, createLineAssignment, updateLineAssignment, deleteLineAssignment,
  listSewingLines, createSewingLine, updateSewingLine,
  listShifts, createShift,
  listHourlyEntries, createHourlyEntry,
  listWipMoves, createWipMove,
  getDashboardKPIs,
} from "../../services/factoryExecutionService";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listProductionPlans(tenantId, { status: req.query.status as string, date: req.query.date as string });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/lines/all", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listSewingLines(tenantId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/lines", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createSewingLine(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/lines/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await updateSewingLine(tenantId, +req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/shifts/all", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listShifts(tenantId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/shifts", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createShift(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/hourly", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listHourlyEntries(tenantId, req.query);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/hourly", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await createHourlyEntry(tenantId, { ...req.body, entered_by: userId });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/wip", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listWipMoves(tenantId, req.query);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/wip", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await createWipMove(tenantId, { ...req.body, created_by: userId });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/dashboard", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getDashboardKPIs(tenantId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getProductionPlan(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await createProductionPlan(tenantId, { ...req.body, created_by: userId });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await updateProductionPlan(tenantId, +req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/:id/approve", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await approveProductionPlan(tenantId, +req.params.id, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/:id/activate", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await activateProductionPlan(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/:id/close", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await closeProductionPlan(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/:id/assignments", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listLineAssignments(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/:id/assignments", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createLineAssignment(tenantId, { ...req.body, production_plan_id: +req.params.id });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/assignments/:aid", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await updateLineAssignment(tenantId, +req.params.aid, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete("/assignments/:aid", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await deleteLineAssignment(tenantId, +req.params.aid);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
