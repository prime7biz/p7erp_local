import { Router } from "express";
import { isAuthenticated } from "../../middleware/auth";
import * as qm from "../../services/qualityManagementService";

const router = Router();
router.use(isAuthenticated);

router.get("/parameters", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.listQcParameters(tenantId);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.post("/parameters", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.createQcParameter({ ...req.body, tenantId });
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.get("/parameters/:id", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.getQcParameter(tenantId, +req.params.id);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.put("/parameters/:id", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.updateQcParameter(tenantId, +req.params.id, req.body);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.get("/templates", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.listQcTemplates(tenantId);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.post("/templates", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.createQcTemplate({ ...req.body, tenantId });
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.get("/templates/:id", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.getQcTemplate(tenantId, +req.params.id);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.put("/templates/:id", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.updateQcTemplate(tenantId, +req.params.id, req.body);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.post("/templates/:id/parameters", async (req, res) => {
  try {
    const templateId = +req.params.id;
    const { parameters } = req.body;
    const data = await qm.addTemplateParameters(templateId, parameters || []);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.get("/inspections", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.listQcInspections(tenantId, {
      inspectionType: req.query.inspectionType as string,
      status: req.query.status as string,
      overallResult: req.query.overallResult as string,
    });
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.post("/inspections", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.createQcInspection({ ...req.body, tenantId });
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.get("/inspections/:id", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.getQcInspection(tenantId, +req.params.id);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.put("/inspections/:id", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.updateQcInspection(tenantId, +req.params.id, req.body);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.post("/inspections/:id/complete", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const { results, overallResult } = req.body;
    const data = await qm.completeInspection(tenantId, +req.params.id, results || [], overallResult, userId);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.post("/inspections/:id/approve", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.approveInspection(tenantId, +req.params.id, userId);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.post("/hold", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.createHoldRelease({ ...req.body, tenantId, performedBy: userId, action: "HOLD" });
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.post("/release", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.createHoldRelease({ ...req.body, tenantId, performedBy: userId, action: "RELEASE" });
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.get("/holds", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.listHoldReleases(tenantId);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.get("/lab-tests", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.listLabTests(tenantId);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.post("/lab-tests", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.createLabTest({ ...req.body, tenantId, createdBy: userId });
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.get("/lab-tests/:id", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.getLabTest(tenantId, +req.params.id);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.put("/lab-tests/:id", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.updateLabTest(tenantId, +req.params.id, req.body);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.get("/capa", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.listCapaActions(tenantId);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.post("/capa", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.createCapaAction({ ...req.body, tenantId, createdBy: userId });
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.get("/capa/:id", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.getCapaAction(tenantId, +req.params.id);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.put("/capa/:id", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.updateCapaAction(tenantId, +req.params.id, req.body);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.post("/capa/:id/complete", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.completeCapaAction(tenantId, +req.params.id);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.post("/capa/:id/verify", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.verifyCapaAction(tenantId, +req.params.id, userId, req.body.effectivenessCheck);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.get("/returns", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.listReturnRequests(tenantId);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.post("/returns", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const { lines, ...rest } = req.body;
    const data = await qm.createReturnRequest({ ...rest, tenantId, createdBy: userId }, lines);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.get("/returns/:id", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.getReturnRequest(tenantId, +req.params.id);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.put("/returns/:id", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.updateReturnRequest(tenantId, +req.params.id, req.body);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.post("/returns/:id/approve", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const userId = (req as any).user?.id;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.approveReturnRequest(tenantId, +req.params.id, userId);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

router.get("/dashboard", async (req, res) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ success: false, message: "Authentication required" });
    const data = await qm.getQualityDashboard(tenantId);
    res.json({ success: true, data });
  } catch (e: any) { res.status(400).json({ success: false, message: e.message }); }
});

export default router;
