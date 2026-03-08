import { eq, and, gte, lte, inArray, like, desc, asc, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { 
  calendarEvents, 
  calendarSettings,
  users,
  type CalendarEvent, 
  type InsertCalendarEvent,
  type CalendarSettings, 
  type InsertCalendarSettings 
} from "../../shared/schema";

// Default categories for events
export const EVENT_CATEGORIES = [
  { id: "meeting", name: "Meeting", color: "#3B82F6" }, // Blue
  { id: "production", name: "Production", color: "#10B981" }, // Green
  { id: "quality", name: "Quality Check", color: "#F59E0B" }, // Yellow
  { id: "delivery", name: "Delivery", color: "#8B5CF6" }, // Purple
  { id: "buyer", name: "Buyer Meeting", color: "#EC4899" }, // Pink
  { id: "maintenance", name: "Maintenance", color: "#EF4444" }, // Red
  { id: "training", name: "Training", color: "#6366F1" }, // Indigo
  { id: "other", name: "Other", color: "#6B7280" }, // Gray
];

// Types for filtering events
export interface CalendarFilter {
  startDate?: Date;
  endDate?: Date;
  categories?: string[];
  search?: string;
  creatorId?: number;
  attendeeId?: number;
  showCompleted?: boolean;
  isPriority?: boolean;
  relatedEntityType?: string;
  relatedEntityId?: number;
  tenantId: number;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

// Types for AI suggestions
export interface AIEventSuggestion {
  title: string;
  description?: string;
  suggestedStartDateTime: Date;
  suggestedEndDateTime: Date;
  suggestedCategory: string;
  suggestedAttendees: number[];
  reason: string;
  confidence: number;
}

export class CalendarService {
  // Get all events with filtering
  async getEvents(filter: CalendarFilter): Promise<CalendarEvent[]> {
    let query = db.select().from(calendarEvents).where(
      eq(calendarEvents.tenantId, filter.tenantId)
    );
    
    // Apply date range filter
    if (filter.startDate && filter.endDate) {
      query = query.where(
        and(
          gte(calendarEvents.startDateTime, filter.startDate),
          lte(calendarEvents.endDateTime, filter.endDate)
        )
      );
    }
    
    // Apply category filter
    if (filter.categories && filter.categories.length > 0) {
      query = query.where(inArray(calendarEvents.category, filter.categories));
    }
    
    // Apply search filter
    if (filter.search) {
      query = query.where(
        like(calendarEvents.title, `%${filter.search}%`)
      );
    }
    
    // Filter by creator
    if (filter.creatorId) {
      query = query.where(eq(calendarEvents.creatorId, filter.creatorId));
    }
    
    // Filter by attendee
    if (filter.attendeeId) {
      // This is more complex since attendees are stored as JSON
      // In a real implementation, you might want to use a proper JSON query
      // This is a simplified approach
      query = query.where(
        isNotNull(calendarEvents.attendees)
      );
      // Further filtering would be done in application code
    }
    
    // Filter by completed status
    if (!filter.showCompleted) {
      query = query.where(
        and(
          calendarEvents.status !== 'completed',
          calendarEvents.status !== 'cancelled'
        )
      );
    }
    
    // Filter by priority
    if (filter.isPriority) {
      query = query.where(eq(calendarEvents.priority, 'high'));
    }
    
    // Filter by related entity
    if (filter.relatedEntityType && filter.relatedEntityId) {
      query = query.where(
        and(
          eq(calendarEvents.relatedEntityType, filter.relatedEntityType),
          eq(calendarEvents.relatedEntityId, filter.relatedEntityId)
        )
      );
    }
    
    // Apply sorting
    if (filter.sortBy) {
      const sortColumn = filter.sortBy as keyof typeof calendarEvents;
      if (sortColumn in calendarEvents) {
        query = query.orderBy(
          filter.sortDirection === 'desc' 
            ? desc(calendarEvents[sortColumn]) 
            : asc(calendarEvents[sortColumn])
        );
      }
    } else {
      // Default sort by start date
      query = query.orderBy(asc(calendarEvents.startDateTime));
    }
    
    // Apply pagination
    if (filter.limit) {
      query = query.limit(filter.limit);
      if (filter.offset) {
        query = query.offset(filter.offset);
      }
    }
    
    // Execute query
    const events = await query;
    
    // If attendee filter is applied, filter in application code
    if (filter.attendeeId) {
      return events.filter(event => {
        const attendees = event.attendees as any[];
        return attendees.some(a => a.userId === filter.attendeeId);
      });
    }
    
    return events;
  }
  
  // Get a single event by ID
  async getEventById(id: number, tenantId: number): Promise<CalendarEvent | undefined> {
    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.id, id),
          eq(calendarEvents.tenantId, tenantId)
        )
      );
    
    if (!event) return undefined;
    
    // Fetch creator details
    const [creator] = await db
      .select()
      .from(users)
      .where(eq(users.id, event.creatorId));
    
    // Fetch attendee details if needed
    // This would depend on how attendees are stored in your database
    
    // Enhance event with creator details
    return {
      ...event,
      creatorName: creator ? `${creator.firstName} ${creator.lastName}`.trim() || creator.username : 'Unknown',
    } as CalendarEvent;
  }
  
  // Create a new event
  async createEvent(eventData: InsertCalendarEvent): Promise<CalendarEvent> {
    const [event] = await db
      .insert(calendarEvents)
      .values(eventData)
      .returning();
    
    return event;
  }
  
  // Update an existing event
  async updateEvent(id: number, tenantId: number, eventData: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined> {
    const [event] = await db
      .update(calendarEvents)
      .set({
        ...eventData,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(calendarEvents.id, id),
          eq(calendarEvents.tenantId, tenantId)
        )
      )
      .returning();
    
    return event;
  }
  
  // Delete an event
  async deleteEvent(id: number, tenantId: number): Promise<boolean> {
    const [deletedEvent] = await db
      .delete(calendarEvents)
      .where(
        and(
          eq(calendarEvents.id, id),
          eq(calendarEvents.tenantId, tenantId)
        )
      )
      .returning({ id: calendarEvents.id });
    
    return !!deletedEvent;
  }
  
  // Get user calendar settings
  async getCalendarSettings(userId: number): Promise<CalendarSettings | undefined> {
    const [settings] = await db
      .select()
      .from(calendarSettings)
      .where(eq(calendarSettings.userId, userId));
    
    return settings;
  }
  
  // Create or update user calendar settings
  async upsertCalendarSettings(userId: number, settingsData: Partial<InsertCalendarSettings>): Promise<CalendarSettings> {
    // Check if settings exist
    const existingSettings = await this.getCalendarSettings(userId);
    
    if (existingSettings) {
      // Update existing settings
      const [settings] = await db
        .update(calendarSettings)
        .set({
          ...settingsData,
          updatedAt: new Date()
        })
        .where(eq(calendarSettings.userId, userId))
        .returning();
      
      return settings;
    } else {
      // Create new settings
      const [settings] = await db
        .insert(calendarSettings)
        .values({
          userId,
          ...settingsData as InsertCalendarSettings
        })
        .returning();
      
      return settings;
    }
  }
  
  // Get AI-suggested events based on historical data and patterns
  async getAISuggestedEvents(userId: number, tenantId: number): Promise<AIEventSuggestion[]> {
    // This would call an external AI service or OpenAI API in a real implementation
    
    // Get user's existing events to understand patterns
    const userEvents = await this.getEvents({
      creatorId: userId,
      tenantId,
      limit: 100,
      sortDirection: 'desc',
      sortBy: 'startDateTime'
    });
    
    const now = new Date();
    // We'll generate dynamic suggestions based on the current date
    const suggestions: AIEventSuggestion[] = [
      {
        title: "Weekly Team Sync",
        description: "Regular team check-in to discuss progress and blockers",
        suggestedStartDateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 10, 0), // Next week, 10 AM
        suggestedEndDateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 11, 0), // 1 hour later
        suggestedCategory: "meeting",
        suggestedAttendees: [1, 2, 3], // User IDs
        reason: "Based on recurring pattern of weekly team meetings",
        confidence: 0.92
      },
      {
        title: "Production Line Maintenance",
        description: "Scheduled maintenance for production line A",
        suggestedStartDateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 9, 0), // 2 weeks later, 9 AM
        suggestedEndDateTime: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 12, 0), // 3 hours later
        suggestedCategory: "maintenance",
        suggestedAttendees: [4, 5], // User IDs
        reason: "Based on maintenance logs showing 30-day maintenance cycles",
        confidence: 0.85
      },
      {
        title: "Quarterly Quality Review",
        description: "Review quality metrics for Q2 and set goals for Q3",
        suggestedStartDateTime: new Date(now.getFullYear(), now.getMonth() + 1, 15, 13, 0), // Next month, 1 PM
        suggestedEndDateTime: new Date(now.getFullYear(), now.getMonth() + 1, 15, 15, 0), // 2 hours later
        suggestedCategory: "quality",
        suggestedAttendees: [1, 6, 7], // User IDs
        reason: "Based on quarterly business cycle and historical quality reviews",
        confidence: 0.88
      }
    ];
    
    return suggestions;
  }
  
  // Get AI analysis of calendar to find potential issues
  async getAICalendarAnalysis(userId: number, tenantId: number) {
    // This would call an external AI service in a real implementation
    
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(now);
    dayAfter.setDate(dayAfter.getDate() + 2);
    
    // Format dates as ISO strings for the frontend
    const tomorrowISO = tomorrow.toISOString().split('T')[0];
    const dayAfterISO = dayAfter.toISOString().split('T')[0];
    
    return {
      overbooked: {
        detected: true,
        dates: [tomorrowISO, dayAfterISO],
        suggestion: "Consider redistributing meetings on these days which appear consistently overbooked"
      },
      noBreaks: {
        detected: true,
        dates: [tomorrowISO],
        suggestion: "Schedule short breaks between consecutive meetings to improve productivity"
      },
      inefficientScheduling: {
        detected: true,
        meetings: ["Production Update", "Quality Review"],
        suggestion: "These meetings have 80% attendee overlap and similar agendas. Consider combining them."
      },
      workLifeBalance: {
        score: 68,
        suggestion: "Your calendar shows meetings outside working hours. Consider setting boundaries."
      }
    };
  }
  
  // Find optimal meeting times based on attendee availability
  async findOptimalMeetingTimes(attendeeIds: number[], duration: number, tenantId: number, preferredDate?: Date) {
    // This would analyze all attendees' calendars in a real implementation
    
    const now = new Date();
    const baseDate = preferredDate || now;
    const tomorrow = new Date(baseDate);
    tomorrow.setDate(baseDate.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // Start at 9 AM
    
    const dayAfter = new Date(baseDate);
    dayAfter.setDate(baseDate.getDate() + 2);
    dayAfter.setHours(9, 0, 0, 0); // Start at 9 AM
    
    return [
      {
        startDateTime: new Date(tomorrow.getTime()),
        endDateTime: new Date(tomorrow.getTime() + duration * 60 * 1000),
        attendeeAvailability: 1.0, // 100% of attendees available
        isOptimal: true
      },
      {
        startDateTime: new Date(tomorrow.getTime() + 3 * 60 * 60 * 1000), // Tomorrow at noon
        endDateTime: new Date(tomorrow.getTime() + 3 * 60 * 60 * 1000 + duration * 60 * 1000),
        attendeeAvailability: 0.85, // 85% of attendees available
        isOptimal: false
      },
      {
        startDateTime: new Date(dayAfter.getTime() + 2 * 60 * 60 * 1000), // Day after tomorrow at 11 AM
        endDateTime: new Date(dayAfter.getTime() + 2 * 60 * 60 * 1000 + duration * 60 * 1000),
        attendeeAvailability: 0.9, // 90% of attendees available
        isOptimal: true
      }
    ];
  }
}

export const calendarService = new CalendarService();