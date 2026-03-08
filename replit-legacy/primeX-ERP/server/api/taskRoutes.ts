import express, { Request, Response } from "express";
import { storage } from "../storage";
import { authenticate, requireRole } from "../middleware/auth";
import { insertTaskSchema, insertTaskCommentSchema } from "@shared/schema";
import { taskAIService } from "../services/taskAIService";
import { z } from "zod";

const router = express.Router();

/**
 * Get all tasks with optional filters
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const filters = req.query as any;
    
    const tasks = await storage.getAllTasks(tenantId, filters);
    res.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ message: "Failed to fetch tasks" });
  }
});

/**
 * Get a specific task by ID
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const taskId = parseInt(req.params.id, 10);
    
    const task = await storage.getTaskById(taskId, tenantId);
    
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    
    res.json(task);
  } catch (error) {
    console.error("Error fetching task:", error);
    res.status(500).json({ message: "Failed to fetch task" });
  }
});

/**
 * Create a new task
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const userId = (req.user as any).id as number;
    
    const taskData = insertTaskSchema.parse({
      ...req.body,
      tenantId,
      createdBy: userId,
      assignedTo: req.body.assignedTo || userId,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    const task = await storage.createTask(taskData);
    res.status(201).json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        message: "Invalid task data", 
        errors: error.errors 
      });
    } else {
      console.error("Error creating task:", error);
      res.status(500).json({ message: "Failed to create task" });
    }
  }
});

/**
 * Update a task
 */
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const taskId = parseInt(req.params.id, 10);
    
    // Ensure task exists and belongs to tenant
    const existingTask = await storage.getTaskById(taskId, tenantId);
    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }
    
    // Update task data
    const taskData = {
      ...req.body,
      updatedAt: new Date()
    };
    
    const updatedTask = await storage.updateTask(taskId, tenantId, taskData);
    res.json(updatedTask);
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ message: "Failed to update task" });
  }
});

/**
 * Mark a task as complete/incomplete
 */
router.patch("/:id/complete", async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const taskId = parseInt(req.params.id, 10);
    const { completed } = req.body;
    
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ message: "Completed status must be a boolean" });
    }
    
    // Ensure task exists and belongs to tenant
    const existingTask = await storage.getTaskById(taskId, tenantId);
    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }
    
    const updatedTask = await storage.completeTask(taskId, tenantId, completed);
    res.json(updatedTask);
  } catch (error) {
    console.error("Error updating task completion status:", error);
    res.status(500).json({ message: "Failed to update task completion status" });
  }
});

/**
 * Delete a task
 */
router.delete("/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const taskId = parseInt(req.params.id, 10);
    
    // Ensure task exists and belongs to tenant
    const existingTask = await storage.getTaskById(taskId, tenantId);
    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }
    
    const result = await storage.deleteTask(taskId, tenantId);
    if (result) {
      res.status(204).end();
    } else {
      res.status(500).json({ message: "Failed to delete task" });
    }
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({ message: "Failed to delete task" });
  }
});

/**
 * Get all comments for a task
 */
router.get("/:id/comments", async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const taskId = parseInt(req.params.id, 10);
    
    // Ensure task exists and belongs to tenant
    const existingTask = await storage.getTaskById(taskId, tenantId);
    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }
    
    const comments = await storage.getTaskComments(taskId);
    res.json(comments);
  } catch (error) {
    console.error("Error fetching task comments:", error);
    res.status(500).json({ message: "Failed to fetch task comments" });
  }
});

/**
 * Add a comment to a task
 */
router.post("/:id/comments", async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const taskId = parseInt(req.params.id, 10);
    const userId = (req.user as any).id as number;
    
    // Ensure task exists and belongs to tenant
    const existingTask = await storage.getTaskById(taskId, tenantId);
    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }
    
    const commentData = insertTaskCommentSchema.parse({
      ...req.body,
      taskId,
      userId,
      createdAt: new Date(),
    });
    
    const comment = await storage.createTaskComment(commentData);
    res.status(201).json(comment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ 
        message: "Invalid comment data", 
        errors: error.errors 
      });
    } else {
      console.error("Error creating comment:", error);
      res.status(500).json({ message: "Failed to create comment" });
    }
  }
});

/**
 * Delete a comment from a task
 */
router.delete("/comments/:commentId", async (req: Request, res: Response) => {
  try {
    const commentId = parseInt(req.params.commentId, 10);
    
    const result = await storage.deleteTaskComment(commentId);
    if (result) {
      res.status(204).end();
    } else {
      res.status(500).json({ message: "Failed to delete comment" });
    }
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({ message: "Failed to delete comment" });
  }
});

/**
 * Get AI insights for a task
 */
router.get("/:id/ai-insights", async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const taskId = parseInt(req.params.id, 10);
    
    // Ensure task exists and belongs to tenant
    const existingTask = await storage.getTaskById(taskId, tenantId);
    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }
    
    const insights = await storage.getTaskAIInsights(taskId);
    res.json(insights);
  } catch (error) {
    console.error("Error fetching AI insights:", error);
    res.status(500).json({ message: "Failed to fetch AI insights" });
  }
});

/**
 * Generate new AI insights for a task
 */
router.post("/:id/generate-insights", async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const taskId = parseInt(req.params.id, 10);
    
    // Ensure task exists and belongs to tenant
    const existingTask = await storage.getTaskById(taskId, tenantId);
    if (!existingTask) {
      return res.status(404).json({ message: "Task not found" });
    }
    
    // Generate insights using AI
    const generatedInsights = await taskAIService.generateTaskInsights(existingTask);
    
    // Save insights to database
    const savedInsights = [];
    for (const insight of generatedInsights) {
      const savedInsight = await storage.createTaskAIInsight({
        taskId,
        title: insight.title,
        description: insight.description,
        type: insight.type,
        confidence: insight.confidence,
        recommendations: insight.recommendations,
        createdAt: new Date()
      });
      savedInsights.push(savedInsight);
    }
    
    res.status(201).json(savedInsights);
  } catch (error) {
    console.error("Error generating AI insights:", error);
    res.status(500).json({ message: "Failed to generate AI insights" });
  }
});

/**
 * Generate a summary of all tasks with AI insights
 */
router.get("/summary/ai-analysis", async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    
    // Get all tasks for analysis
    const tasks = await storage.getAllTasks(tenantId);
    if (!tasks || tasks.length === 0) {
      return res.status(200).json({
        completionRate: "0%",
        onTrackTasks: 0,
        atRiskTasks: 0,
        blockedTasks: 0,
        keyBottlenecks: [],
        recommendations: ["No tasks found to analyze"]
      });
    }
    
    // Generate task summary
    const summary = await taskAIService.generateTasksSummary(tasks);
    res.json(summary);
  } catch (error) {
    console.error("Error generating task summary:", error);
    res.status(500).json({ message: "Failed to generate task summary" });
  }
});

/**
 * Analyze critical path for tasks
 */
router.post("/analyze-critical-path", async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const { dependencies } = req.body;
    
    if (!Array.isArray(dependencies)) {
      return res.status(400).json({ message: "Dependencies must be an array" });
    }
    
    // Get all tasks for analysis
    const tasks = await storage.getAllTasks(tenantId);
    if (!tasks || tasks.length === 0) {
      return res.status(404).json({ message: "No tasks found to analyze" });
    }
    
    // Generate critical path analysis
    const criticalPathAnalysis = await taskAIService.analyzeCriticalPath(tasks, dependencies);
    res.json(criticalPathAnalysis);
  } catch (error) {
    console.error("Error analyzing critical path:", error);
    res.status(500).json({ message: "Failed to analyze critical path" });
  }
});

/**
 * Suggest deadline for a new task
 */
router.post("/suggest-deadline", async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId as number;
    const { title, description, priority } = req.body;
    
    if (!title || !priority) {
      return res.status(400).json({ message: "Title and priority are required" });
    }
    
    // Get all tasks for workload analysis
    const tasks = await storage.getAllTasks(tenantId);
    
    // Generate deadline suggestion
    const suggestion = await taskAIService.suggestDeadlines(
      tasks,
      title,
      description || "",
      priority
    );
    
    res.json(suggestion);
  } catch (error) {
    console.error("Error suggesting deadline:", error);
    res.status(500).json({ message: "Failed to suggest deadline" });
  }
});

export default router;