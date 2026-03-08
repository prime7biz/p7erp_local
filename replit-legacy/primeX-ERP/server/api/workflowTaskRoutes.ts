import { Router, Response } from "express";
import { authenticate } from "../middleware/auth";
import { db } from "../db";
import { tasks, notifications } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../utils/jwtSecret";
import { storage } from "../storage";

const router = Router();

const sseClients: Map<number, Set<Response>> = new Map();

export function pushNotificationToUser(userId: number, notification: { title: string; message: string; entityType?: string; entityId?: number }) {
  const clients = sseClients.get(userId);
  if (!clients || clients.size === 0) return;

  const data = JSON.stringify({
    type: "notification",
    ...notification,
    timestamp: new Date().toISOString(),
  });

  for (const res of clients) {
    try {
      res.write(`data: ${data}\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}

router.get("/notifications/stream", async (req: any, res) => {
  try {
    const token = req.cookies?.token || (
      req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : null
    );

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, getJwtSecret());
    } catch {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const user = await storage.getUserById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const userId = user.id;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    if (!sseClients.has(userId)) {
      sseClients.set(userId, new Set());
    }
    sseClients.get(userId)!.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    req.on("close", () => {
      clearInterval(heartbeat);
      const clients = sseClients.get(userId);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
          sseClients.delete(userId);
        }
      }
    });
  } catch (error) {
    console.error("[SSE] Error setting up notification stream:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to setup notification stream" });
    }
  }
});

router.get("/my-tasks", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const tenantId = req.tenantId;
    const status = (req.query.status as string) || "pending";

    const myTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.tenantId, tenantId),
          eq(tasks.status, status),
          eq(tasks.assignedTo, userId)
        )
      )
      .orderBy(desc(tasks.createdAt))
      .limit(50);

    res.json(myTasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
});

router.post("/:id/done", authenticate, async (req: any, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const userId = req.user?.id;
    const tenantId = req.tenantId;

    const [updated] = await db
      .update(tasks)
      .set({ status: "completed", completed: true, completedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId), eq(tasks.assignedTo, userId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Task not found or not assigned to you" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error completing task:", error);
    res.status(500).json({ error: "Failed to complete task" });
  }
});

router.get("/notifications", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const tenantId = req.tenantId;

    const notifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.userId, userId)
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    res.json(notifs);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.get("/notifications/unread-count", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const tenantId = req.tenantId;

    const notifs = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.userId, userId),
          eq(notifications.isRead, false)
        )
      );

    res.json({ count: notifs.length });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

router.post("/notifications/:id/read", authenticate, async (req: any, res) => {
  try {
    const notifId = parseInt(req.params.id);
    const userId = req.user?.id;
    const tenantId = req.tenantId;

    const [updated] = await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(notifications.id, notifId), eq(notifications.tenantId, tenantId), eq(notifications.userId, userId)))
      .returning();

    res.json(updated || { success: true });
  } catch (error) {
    console.error("Error marking notification read:", error);
    res.status(500).json({ error: "Failed to mark notification read" });
  }
});

router.post("/notifications/read-all", authenticate, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const tenantId = req.tenantId;

    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.userId, userId),
          eq(notifications.isRead, false)
        )
      );

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking all notifications read:", error);
    res.status(500).json({ error: "Failed to mark all notifications read" });
  }
});

export default router;
