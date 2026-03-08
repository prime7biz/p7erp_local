import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import {
  listIEOperations, createIEOperation, updateIEOperation, toggleIEOperation,
  listLineConfigs, getLineConfig, upsertLineConfig,
  calculateEfficiency, calculateTarget,
} from "../../services/ieService";
import {
  listOperators, createOperator, updateOperator,
  listOperatorSkills, addSkill, updateSkill,
  listLineOperatorAssignments, assignOperatorToLine, removeOperatorFromLine,
  runLineBalance, listBalanceRuns,
  getSkillMatrix,
} from "../../services/lineBalancingService";

const router = Router();
router.use(authenticate);

router.get("/operations", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listIEOperations(tenantId, { category: req.query.category as string, machine_type: req.query.machine_type as string, active: req.query.active !== undefined ? req.query.active === "true" : undefined });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/operations", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createIEOperation(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/operations/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await updateIEOperation(tenantId, +req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/operations/:id/toggle", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await toggleIEOperation(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/line-configs", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listLineConfigs(tenantId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/line-configs/:lineId", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getLineConfig(tenantId, +req.params.lineId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/line-configs/:lineId", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await upsertLineConfig(tenantId, +req.params.lineId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/efficiency", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await calculateEfficiency(tenantId, +(req.query.line_id || 0), req.query.date as string);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/target", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await calculateTarget(tenantId, +(req.query.line_id || 0));
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/operators", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listOperators(tenantId, { grade: req.query.grade as string, status: req.query.status as string, default_line_id: req.query.default_line_id ? +req.query.default_line_id : undefined });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/operators", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createOperator(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/operators/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await updateOperator(tenantId, +req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/operators/:id/skills", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listOperatorSkills(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/operators/:id/skills", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await addSkill(tenantId, +req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/skills/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await updateSkill(tenantId, +req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/line-operators/:lineLoadId", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listLineOperatorAssignments(tenantId, +req.params.lineLoadId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/line-operators/:lineLoadId", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await assignOperatorToLine(tenantId, +req.params.lineLoadId, req.body.operator_id, req.body.op_code);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete("/line-operators/assignments/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await removeOperatorFromLine(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/line-balance/:lineLoadId", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await runLineBalance(tenantId, +req.params.lineLoadId, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/line-balance/:lineLoadId/runs", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listBalanceRuns(tenantId, +req.params.lineLoadId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/skill-matrix", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getSkillMatrix(tenantId, req.query.line_id ? +req.query.line_id : undefined);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
