import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import {
  listResources, createResource, updateResource,
  listCalendarEntries, upsertCalendarEntry,
  listPlanningJobs, createPlanningJob, updatePlanningJob,
  allocateJob, listAllocations,
  runDeterministicAllocation, getAISuggestions,
} from "../../services/planningEngineService";

const router = Router();
router.use(authenticate);

router.get("/resources", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listResources(tenantId, { type: req.query.type as string, active: req.query.active !== undefined ? req.query.active === "true" : undefined });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/resources", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createResource(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/resources/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await updateResource(tenantId, +req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/calendars/:resourceId", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listCalendarEntries(tenantId, +req.params.resourceId, { from: req.query.from as string, to: req.query.to as string });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/calendars/:resourceId/:date", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await upsertCalendarEntry(tenantId, +req.params.resourceId, req.params.date, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/jobs", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listPlanningJobs(tenantId, { job_type: req.query.job_type as string, status: req.query.status as string });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/jobs", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await createPlanningJob(tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/jobs/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await updatePlanningJob(tenantId, +req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/allocations", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const jobId = req.query.job_id ? +req.query.job_id : undefined;
    if (jobId) {
      const result = await listAllocations(tenantId, jobId);
      res.json({ success: true, data: result });
    } else {
      const { db } = await import("../../db");
      const { sql } = await import("drizzle-orm");
      const result = await db.execute(
        sql`SELECT pa.*, cr.resource_code, cr.type as resource_type
            FROM planning_allocations pa
            LEFT JOIN capacity_resources cr ON cr.id = pa.resource_id AND cr.tenant_id = pa.tenant_id
            WHERE pa.tenant_id = ${tenantId}
            ORDER BY pa.date DESC LIMIT 100`
      );
      res.json({ success: true, data: result.rows });
    }
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/jobs/:id/allocations", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await listAllocations(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/jobs/:id/allocate", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await allocateJob(tenantId, +req.params.id, req.body.resource_id, req.body.date, req.body.qty, req.body.minutes);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/auto-allocate", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await runDeterministicAllocation(tenantId, req.body.job_type);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/ai-suggestions", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getAISuggestions(tenantId, req.query.job_type as string);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
