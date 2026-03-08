import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface CalendarEvent {
  id: string;
  title: string;
  location: string;
  startTime: string;
  category: "meeting" | "buyer" | "quality" | "other";
  attendees: Array<{
    id: string;
    name: string;
    initials: string;
  }>;
}

export const CalendarEvents = () => {
  const today = format(new Date(), "MMM d, yyyy");
  
  const { data: events, isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/dashboard/calendar-events"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Helper function to get event border color based on category
  const getEventBorderColor = (category: CalendarEvent["category"]) => {
    switch (category) {
      case "meeting":
        return "border-primary";
      case "buyer":
        return "border-secondary";
      case "quality":
        return "border-accent";
      default:
        return "border-neutral-dark";
    }
  };

  // Helper function to get event background color based on category
  const getEventBgColor = (category: CalendarEvent["category"]) => {
    switch (category) {
      case "meeting":
        return "bg-primary bg-opacity-5";
      case "buyer":
        return "bg-secondary bg-opacity-5";
      case "quality":
        return "bg-accent bg-opacity-5";
      default:
        return "bg-neutral-dark bg-opacity-5";
    }
  };

  // Helper function to get timeline dot color based on category
  const getTimelineColor = (category: CalendarEvent["category"]) => {
    switch (category) {
      case "meeting":
        return "bg-primary";
      case "buyer":
        return "bg-secondary";
      case "quality":
        return "bg-accent";
      default:
        return "bg-neutral-dark";
    }
  };

  // Helper function to format event time from ISO string
  const formatEventTime = (isoString: string) => {
    const date = new Date(isoString);
    return format(date, "HH:mm");
  };

  return (
    <Card className="bg-neutral-lightest rounded-lg shadow-sm">
      <CardHeader className="p-4 sm:p-6 pb-0 flex flex-row items-center justify-between">
        <CardTitle className="font-heading font-medium text-base sm:text-lg text-neutral-darkest">
          Upcoming Events
        </CardTitle>
        <div className="flex items-center text-neutral-dark text-xs sm:text-sm">
          <span className="hidden xs:inline">{today}</span>
          <button className="ml-0 sm:ml-2 text-neutral-dark hover:text-neutral-darkest">
            <span className="material-icons text-sm sm:text-base">today</span>
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="space-y-4">
          {isLoading ? (
            // Loading skeleton
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="flex items-start animate-pulse">
                <div className="flex flex-col items-center mr-4">
                  <div className="h-5 bg-neutral-light rounded w-12 mb-1"></div>
                  <div className="h-full w-px bg-neutral-light mt-1"></div>
                </div>
                <div className="flex-1 bg-neutral-light p-3 rounded-md">
                  <div className="h-5 bg-neutral-medium rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-neutral-medium rounded w-1/2 mb-3"></div>
                  <div className="flex items-center">
                    <div className="flex -space-x-2">
                      <div className="h-6 w-6 rounded-full bg-neutral-medium"></div>
                      <div className="h-6 w-6 rounded-full bg-neutral-medium"></div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : !events || events.length === 0 ? (
            <div className="text-center py-8">
              <span className="material-icons text-4xl text-neutral-dark mb-2">event</span>
              <h3 className="font-medium text-neutral-darkest mb-1">No events today</h3>
              <p className="text-sm text-neutral-dark">Your schedule is clear</p>
            </div>
          ) : (
            events.map((event) => (
              <div key={event.id} className="flex items-start">
                <div className="flex flex-col items-center mr-2 sm:mr-4">
                  <span className="text-xs sm:text-sm font-semibold text-neutral-darkest">
                    {formatEventTime(event.startTime)}
                  </span>
                  <div className={`h-full w-px ${getTimelineColor(event.category)} mt-1`}></div>
                </div>
                <div className={`flex-1 ${getEventBgColor(event.category)} p-2 sm:p-3 rounded-md border-l-2 sm:border-l-4 ${getEventBorderColor(event.category)}`}>
                  <h4 className="font-medium text-xs sm:text-sm text-neutral-darkest">{event.title}</h4>
                  <p className="text-2xs sm:text-xs text-neutral-dark">{event.location}</p>
                  {event.attendees.length > 0 && (
                    <div className="mt-1.5 sm:mt-2 flex items-center">
                      <div className="flex -space-x-1 sm:-space-x-2">
                        {event.attendees.slice(0, 3).map((attendee) => (
                          <Avatar key={attendee.id} className="h-5 w-5 sm:h-6 sm:w-6 border-2 border-white">
                            <AvatarFallback className="bg-primary-light text-neutral-lightest text-2xs sm:text-xs">
                              {attendee.initials}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                      </div>
                      {event.attendees.length > 3 && (
                        <span className="text-2xs sm:text-xs text-neutral-dark ml-1 sm:ml-2">
                          +{event.attendees.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="mt-6 text-center">
          <button className="text-primary text-sm font-medium hover:text-primary-dark">
            View Calendar
          </button>
        </div>
      </CardContent>
    </Card>
  );
};
