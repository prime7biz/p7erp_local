import { parseIntParam } from "../../utils/parseParams";
import { Router } from "express";
import { manufacturingOrderStorage } from "../../database/inventory/manufacturingOrderStorage";
import { isAuthenticated } from "../../middleware/auth";

const router = Router();

router.use(isAuthenticated);

router.get("/next-number", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const nextNumber = await manufacturingOrderStorage.getNextMoNumber(tenantId);
    res.json({ nextNumber });
  } catch (error) {
    console.error("Error getting next MO number:", error);
    res.status(500).json({ message: "Failed to get next MO number" });
  }
});

router.get("/", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const filters = {
      status: req.query.status as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
    };
    const orders = await manufacturingOrderStorage.getAllManufacturingOrders(tenantId, filters);
    res.json(orders);
  } catch (error) {
    console.error("Error fetching manufacturing orders:", error);
    res.status(500).json({ message: "Failed to fetch manufacturing orders" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }
    const order = await manufacturingOrderStorage.getManufacturingOrderById(id, tenantId);
    if (!order) {
      return res.status(404).json({ message: "Manufacturing order not found" });
    }
    res.json(order);
  } catch (error) {
    console.error("Error fetching manufacturing order:", error);
    res.status(500).json({ message: "Failed to fetch manufacturing order" });
  }
});

router.post("/", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id;

    const order = await manufacturingOrderStorage.createManufacturingOrder(
      { ...req.body, createdBy: userId },
      tenantId,
    );

    await manufacturingOrderStorage.createDefaultStages(order.id, tenantId);

    const fullOrder = await manufacturingOrderStorage.getManufacturingOrderById(order.id, tenantId);
    res.status(201).json(fullOrder);
  } catch (error) {
    console.error("Error creating manufacturing order:", error);
    res.status(500).json({ message: "Failed to create manufacturing order" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const order = await manufacturingOrderStorage.updateManufacturingOrder(id, req.body, tenantId);
    if (!order) {
      return res.status(404).json({ message: "Manufacturing order not found" });
    }
    res.json(order);
  } catch (error) {
    console.error("Error updating manufacturing order:", error);
    res.status(500).json({ message: "Failed to update manufacturing order" });
  }
});

router.post("/:id/start", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const order = await manufacturingOrderStorage.startManufacturingOrder(id, tenantId);
    if (!order) {
      return res.status(404).json({ message: "Manufacturing order not found" });
    }
    res.json(order);
  } catch (error) {
    console.error("Error starting manufacturing order:", error);
    res.status(500).json({ message: "Failed to start manufacturing order" });
  }
});

router.post("/:id/complete", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const id = parseIntParam(req.params.id, "id");
    const order = await manufacturingOrderStorage.completeManufacturingOrder(id, tenantId);
    res.json(order);
  } catch (error) {
    console.error("Error completing manufacturing order:", error);
    res.status(500).json({ message: "Failed to complete manufacturing order" });
  }
});

router.get("/:id/stages", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const moId = parseIntParam(req.params.id, "id");
    const stages = await manufacturingOrderStorage.getManufacturingStages(moId, tenantId);
    res.json(stages.map((s) => ({ ...s.stage, processingUnitName: s.processingUnitName })));
  } catch (error) {
    console.error("Error fetching stages:", error);
    res.status(500).json({ message: "Failed to fetch manufacturing stages" });
  }
});

router.post("/:id/stages", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const moId = parseIntParam(req.params.id, "id");
    const stage = await manufacturingOrderStorage.createManufacturingStage({
      ...req.body,
      manufacturingOrderId: moId,
      tenantId,
    });
    res.status(201).json(stage);
  } catch (error) {
    console.error("Error creating stage:", error);
    res.status(500).json({ message: "Failed to create manufacturing stage" });
  }
});

router.put("/stages/:stageId", async (req, res) => {
  try {
    const stageId = parseIntParam(req.params.stageId, "stageId");
    const stage = await manufacturingOrderStorage.updateManufacturingStage(stageId, req.body);
    if (!stage) {
      return res.status(404).json({ message: "Stage not found" });
    }
    res.json(stage);
  } catch (error) {
    console.error("Error updating stage:", error);
    res.status(500).json({ message: "Failed to update manufacturing stage" });
  }
});

router.post("/stages/:stageId/complete", async (req, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const stageId = parseIntParam(req.params.stageId, "stageId");
    const stage = await manufacturingOrderStorage.completeStage(stageId, tenantId);
    res.json(stage);
  } catch (error: any) {
    console.error("Error completing stage:", error);
    res.status(500).json({ message: error.message || "Failed to complete stage" });
  }
});

export default router;
