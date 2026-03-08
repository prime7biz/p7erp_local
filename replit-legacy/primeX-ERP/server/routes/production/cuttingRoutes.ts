import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import {
  listMarkerPlans, getMarkerPlan, createMarkerPlan, approveMarkerPlan,
  listLayPlans, createLayPlan, completeLayPlan,
  listCuttingTickets, createCuttingTicket, closeCuttingTicket,
  listBundles, generateBundles,
  listBundleIssues, createBundleIssue, postBundleIssue, addBundleIssueLine,
  getCuttingDashboard,
} from "../../services/cuttingService";

const router = Router();
router.use(authenticate);

router.get("/markers", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listMarkerPlans(tenantId, req.query);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/markers/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getMarkerPlan(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/markers", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createMarkerPlan(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/markers/:id/approve", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await approveMarkerPlan(tenantId, +req.params.id, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/lays/:markerId", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listLayPlans(tenantId, +req.params.markerId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/lays", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createLayPlan(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/lays/:id/complete", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await completeLayPlan(tenantId, +req.params.id, req.body.actual_pcs);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/tickets/:layPlanId", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listCuttingTickets(tenantId, +req.params.layPlanId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/tickets", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createCuttingTicket(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/tickets/:id/close", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await closeCuttingTicket(tenantId, +req.params.id, req.body.cut_qty, req.body.rejects_qty);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/bundles", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listBundles(tenantId, req.query);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/bundles/generate", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await generateBundles(tenantId, +req.body.ticket_id, +req.body.bundle_size);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/issues", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listBundleIssues(tenantId, req.query);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/issues", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createBundleIssue(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/issues/:id/post", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await postBundleIssue(tenantId, +req.params.id, userId, req.body.request_id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/issues/:id/lines", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await addBundleIssueLine(tenantId, +req.params.id, req.body.bundle_id, req.body.qty_issued);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/dashboard", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getCuttingDashboard(tenantId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
