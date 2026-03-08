import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import {
  listFinishingBatches, createFinishingBatch, activateFinishingBatch, completeFinishingBatch,
  listFinishingEntries, createFinishingEntry,
  listPackingBatches, createPackingBatch, activatePackingBatch, completePackingBatch,
  listPackUnits, addPackUnit,
  listCartons, createCarton, addCartonLine, listCartonLines, sealCarton, reopenCarton,
  listPackingLists, createPackingList, addCartonToPackingList, issuePackingList,
  getFinishingPackingDashboard,
} from "../../services/finishingPackingService";

const router = Router();
router.use(authenticate);

router.get("/finishing-batches", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listFinishingBatches(tenantId, { status: req.query.status as string, planId: req.query.planId ? +req.query.planId : undefined });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/finishing-batches", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await createFinishingBatch(tenantId, { ...req.body, created_by: userId });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/finishing-batches/:id/activate", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await activateFinishingBatch(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/finishing-batches/:id/complete", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await completeFinishingBatch(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/finishing-batches/:id/entries", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listFinishingEntries(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/finishing-entries", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await createFinishingEntry(tenantId, { ...req.body, entered_by: userId });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/packing-batches", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listPackingBatches(tenantId, { status: req.query.status as string, planId: req.query.planId ? +req.query.planId : undefined });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/packing-batches", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await createPackingBatch(tenantId, { ...req.body, created_by: userId });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/packing-batches/:id/activate", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await activatePackingBatch(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/packing-batches/:id/complete", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await completePackingBatch(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/packing-batches/:id/pack-units", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listPackUnits(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/pack-units", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await addPackUnit(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/cartons", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listCartons(tenantId, { packing_batch_id: req.query.packing_batch_id ? +req.query.packing_batch_id : undefined, status: req.query.status as string });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/cartons", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createCarton(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/cartons/:id/lines", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listCartonLines(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/cartons/:id/lines", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await addCartonLine(tenantId, +req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/cartons/:id/seal", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await sealCarton(tenantId, +req.params.id, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/cartons/:id/reopen", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await reopenCarton(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/packing-lists", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listPackingLists(tenantId, { status: req.query.status as string, salesOrderId: req.query.salesOrderId ? +req.query.salesOrderId : undefined, shipmentId: req.query.shipmentId ? +req.query.shipmentId : undefined });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/packing-lists", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createPackingList(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/packing-lists/:id/cartons", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await addCartonToPackingList(tenantId, +req.params.id, req.body.carton_id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/packing-lists/:id/issue", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await issuePackingList(tenantId, +req.params.id, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/dashboard", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getFinishingPackingDashboard(tenantId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
