import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import {
  listThreads, createThread, getThread, deleteThread,
  addMessage, getReply, getQuickSuggestions,
} from "../../services/aiAssistantService";

const router = Router();
router.use(authenticate);

router.get("/threads", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await listThreads(tenantId, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/threads", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await createThread(tenantId, userId, req.body.title);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/threads/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await getThread(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete("/threads/:id", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await deleteThread(tenantId, +req.params.id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/threads/:id/messages", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await addMessage(tenantId, +req.params.id, req.body.role, req.body.content, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/threads/:id/reply", async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id;
    const result = await getReply(tenantId, +req.params.id, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get("/suggestions", async (req, res) => {
  try {
    const result = getQuickSuggestions(req.query.module as string);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
