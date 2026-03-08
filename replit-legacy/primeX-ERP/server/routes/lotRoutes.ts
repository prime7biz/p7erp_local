import { parseIntParam } from "../utils/parseParams";
import { Router, Request, Response } from "express";
import { isAuthenticated } from "../middleware/auth";
import { requireTenant } from "../utils/tenantScope";
import * as lotService from "../services/lotTraceabilityService";
import { insertLotSchema } from "@shared/schema";

const router = Router();
router.use(isAuthenticated);

router.get("/expiring", async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const daysAhead = parseInt(req.query.days as string) || 30;
    const result = await lotService.getExpiringLots(tenantId, daysAhead);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/by-item/:itemId", async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const itemId = parseIntParam(req.params.itemId, "itemId");
    const result = await lotService.getLotsByItem(itemId, tenantId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const filters: any = {};
    if (req.query.itemId) filters.itemId = parseInt(req.query.itemId as string);
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.warehouseId) filters.warehouseId = parseInt(req.query.warehouseId as string);
    const result = await lotService.getLots(tenantId, filters);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const result = await lotService.createLot(req.body, tenantId);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const id = parseIntParam(req.params.id, "id");
    const result = await lotService.getLot(id, tenantId);
    if (!result) return res.status(404).json({ message: "Lot not found" });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

router.put("/:id/status", async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const id = parseIntParam(req.params.id, "id");
    const { status } = req.body;
    const result = await lotService.updateLotStatus(id, status, tenantId);
    if (!result) return res.status(404).json({ message: "Lot not found" });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/:id/transactions", async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const userId = (req as any).user?.userId || (req as any).user?.id;
    const lotId = parseIntParam(req.params.id, "id");
    const result = await lotService.recordLotTransaction({ ...req.body, lotId }, tenantId, userId);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/:id/allocate", async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const lotId = parseIntParam(req.params.id, "id");
    const { allocationType, allocationId, quantity } = req.body;
    const result = await lotService.allocateLot(lotId, allocationType, allocationId, parseFloat(quantity), tenantId);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/:id/trace", async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const id = parseIntParam(req.params.id, "id");
    const result = await lotService.getTraceabilityReport(id, tenantId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export const lotAllocationRouter = Router();

lotAllocationRouter.post("/:id/issue", async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenant(req);
    const userId = (req as any).user?.userId || (req as any).user?.id;
    const allocationId = parseIntParam(req.params.id, "id");
    const { quantity } = req.body;
    const result = await lotService.issueLotAllocation(allocationId, parseFloat(quantity), tenantId, userId);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
