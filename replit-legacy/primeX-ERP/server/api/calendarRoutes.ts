import { Router, Request, Response } from "express";
import { z } from "zod";
import { calendarService, EVENT_CATEGORIES } from "../services/calendarService";
import { authenticate } from "../middleware/auth";
import { insertCalendarEventSchema, insertCalendarSettingsSchema } from "../../shared/schema";

const router = Router();

// Get all event categories
router.get("/categories", async (req: Request, res: Response) => {
  try {
    res.json(EVENT_CATEGORIES);
  } catch (error: any) {
    console.error("Error fetching calendar categories:", error);
    res.status(500).json({ message: "Failed to fetch calendar categories", error: error.message });
  }
});

// Get calendar events with filtering
router.get("/events", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    
    // Parse query parameters
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const categories = req.query.categories ? (req.query.categories as string).split(",") : undefined;
    const search = req.query.search as string | undefined;
    const creatorId = req.query.creatorId ? parseInt(req.query.creatorId as string) : undefined;
    const attendeeId = req.query.attendeeId ? parseInt(req.query.attendeeId as string) : undefined;
    const showCompleted = req.query.showCompleted === "true";
    const isPriority = req.query.isPriority === "true";
    const relatedEntityType = req.query.relatedEntityType as string | undefined;
    const relatedEntityId = req.query.relatedEntityId ? parseInt(req.query.relatedEntityId as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;
    const sortBy = req.query.sortBy as string | undefined;
    const sortDirection = req.query.sortDirection as 'asc' | 'desc' | undefined;
    
    const events = await calendarService.getEvents({
      startDate,
      endDate,
      categories,
      search,
      creatorId,
      attendeeId,
      showCompleted,
      isPriority,
      relatedEntityType,
      relatedEntityId,
      tenantId,
      limit,
      offset,
      sortBy,
      sortDirection
    });
    
    res.json(events);
  } catch (error: any) {
    console.error("Error fetching calendar events:", error);
    res.status(500).json({ message: "Failed to fetch calendar events", error: error.message });
  }
});

// Get a single event by ID
router.get("/events/:id", async (req: Request, res: Response) => {
  try {
    const eventId = parseInt(req.params.id);
    const tenantId = (req as any).tenantId;
    
    const event = await calendarService.getEventById(eventId, tenantId);
    
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    
    res.json(event);
  } catch (error: any) {
    console.error("Error fetching calendar event:", error);
    res.status(500).json({ message: "Failed to fetch calendar event", error: error.message });
  }
});

// Create a new event
router.post("/events", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const tenantId = (req as any).tenantId;
    
    // Validate request body
    const eventData = insertCalendarEventSchema.parse({
      ...req.body,
      creatorId: userId,
      tenantId
    });
    
    const event = await calendarService.createEvent(eventData);
    
    res.status(201).json(event);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid event data", errors: error.errors });
    }
    
    console.error("Error creating calendar event:", error);
    res.status(500).json({ message: "Failed to create calendar event", error: error.message });
  }
});

// Update an existing event
router.put("/events/:id", async (req: Request, res: Response) => {
  try {
    const eventId = parseInt(req.params.id);
    const tenantId = (req as any).tenantId;
    
    // Check if event exists
    const existingEvent = await calendarService.getEventById(eventId, tenantId);
    
    if (!existingEvent) {
      return res.status(404).json({ message: "Event not found" });
    }
    
    // Validate request body (partial)
    const eventData = insertCalendarEventSchema.partial().parse(req.body);
    
    const updatedEvent = await calendarService.updateEvent(eventId, tenantId, eventData);
    
    res.json(updatedEvent);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid event data", errors: error.errors });
    }
    
    console.error("Error updating calendar event:", error);
    res.status(500).json({ message: "Failed to update calendar event", error: error.message });
  }
});

// Delete an event
router.delete("/events/:id", async (req: Request, res: Response) => {
  try {
    const eventId = parseInt(req.params.id);
    const tenantId = (req as any).tenantId;
    
    // Check if event exists
    const existingEvent = await calendarService.getEventById(eventId, tenantId);
    
    if (!existingEvent) {
      return res.status(404).json({ message: "Event not found" });
    }
    
    const deleted = await calendarService.deleteEvent(eventId, tenantId);
    
    if (deleted) {
      res.json({ message: "Event deleted successfully" });
    } else {
      res.status(500).json({ message: "Failed to delete event" });
    }
  } catch (error: any) {
    console.error("Error deleting calendar event:", error);
    res.status(500).json({ message: "Failed to delete calendar event", error: error.message });
  }
});

// Get user calendar settings
router.get("/settings", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    const settings = await calendarService.getCalendarSettings(userId);
    
    // If no settings exist yet, return default settings
    if (!settings) {
      return res.json({
        userId,
        workingHoursStart: "09:00:00",
        workingHoursEnd: "17:00:00",
        workingDays: ["1", "2", "3", "4", "5"],
        defaultView: "week",
        defaultReminder: 15,
        showWeekends: false,
        timeZone: "UTC",
        aiAssistEnabled: true
      });
    }
    
    res.json(settings);
  } catch (error: any) {
    console.error("Error fetching calendar settings:", error);
    res.status(500).json({ message: "Failed to fetch calendar settings", error: error.message });
  }
});

// Create or update user calendar settings
router.post("/settings", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    // Validate request body (partial)
    const settingsData = insertCalendarSettingsSchema.partial().parse(req.body);
    
    const settings = await calendarService.upsertCalendarSettings(userId, settingsData);
    
    res.json(settings);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid settings data", errors: error.errors });
    }
    
    console.error("Error updating calendar settings:", error);
    res.status(500).json({ message: "Failed to update calendar settings", error: error.message });
  }
});

// Get AI-suggested events
router.get("/ai/suggestions", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const tenantId = (req as any).tenantId;
    
    const suggestions = await calendarService.getAISuggestedEvents(userId, tenantId);
    
    res.json(suggestions);
  } catch (error: any) {
    console.error("Error fetching AI suggestions:", error);
    res.status(500).json({ message: "Failed to fetch AI suggestions", error: error.message });
  }
});

// Get AI calendar analysis
router.get("/ai/analysis", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const tenantId = (req as any).tenantId;
    
    const analysis = await calendarService.getAICalendarAnalysis(userId, tenantId);
    
    res.json(analysis);
  } catch (error: any) {
    console.error("Error fetching AI calendar analysis:", error);
    res.status(500).json({ message: "Failed to fetch AI calendar analysis", error: error.message });
  }
});

// Find optimal meeting times
router.post("/ai/optimal-times", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    
    // Validate request body
    const schema = z.object({
      attendeeIds: z.array(z.number()),
      duration: z.number().min(15).max(480), // Duration in minutes (15 min to 8 hours)
      preferredDate: z.string().optional()
    });
    
    const { attendeeIds, duration, preferredDate } = schema.parse(req.body);
    
    const optimalTimes = await calendarService.findOptimalMeetingTimes(
      attendeeIds, 
      duration, 
      tenantId, 
      preferredDate ? new Date(preferredDate) : undefined
    );
    
    res.json(optimalTimes);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid request data", errors: error.errors });
    }
    
    console.error("Error finding optimal meeting times:", error);
    res.status(500).json({ message: "Failed to find optimal meeting times", error: error.message });
  }
});

export default router;