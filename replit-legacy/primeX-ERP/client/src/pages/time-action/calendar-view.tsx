import { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useQuery } from '@tanstack/react-query';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent 
} from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps?: {
    status: string;
    planId: number;
    department: string;
    description: string;
  };
}

export default function TimeActionCalendar() {
  const [selectedPlan, setSelectedPlan] = useState<string>('all');
  const { toast } = useToast();
  
  // Fetch all time action plans
  const { data: plans = [] } = useQuery({
    queryKey: ['/api/time-action-plans'],
  });

  // Fetch all milestones
  const { data: allMilestones = [], isLoading } = useQuery({
    queryKey: ['/api/time-action-milestones', selectedPlan],
    enabled: true,
  });

  // Transform milestones into calendar events
  const getEvents = (): CalendarEvent[] => {
    if (!allMilestones || !Array.isArray(allMilestones)) return [];
    
    return allMilestones.map((milestone: any) => {
      // Determine color based on status
      let backgroundColor = '#60a5fa'; // Default blue
      
      switch (milestone.status) {
        case 'Completed':
          backgroundColor = '#22c55e'; // Green
          break;
        case 'In Progress':
          backgroundColor = '#f59e0b'; // Amber
          break;
        case 'Delayed':
          backgroundColor = '#ef4444'; // Red
          break;
        case 'At Risk':
          backgroundColor = '#f97316'; // Orange
          break;
        default:
          backgroundColor = '#60a5fa'; // Blue
      }
      
      return {
        id: milestone.id.toString(),
        title: milestone.milestoneName,
        start: milestone.plannedStartDate,
        end: milestone.plannedEndDate,
        backgroundColor,
        borderColor: backgroundColor,
        textColor: '#ffffff',
        extendedProps: {
          status: milestone.status,
          planId: milestone.planId,
          department: milestone.department,
          description: milestone.description || '',
        }
      };
    });
  };

  const handleEventClick = (info: any) => {
    const { event } = info;
    const { extendedProps } = event;
    
    toast({
      title: event.title,
      description: (
        <div className="mt-2 space-y-2">
          <p><strong>Status:</strong> {extendedProps.status}</p>
          <p><strong>Department:</strong> {extendedProps.department}</p>
          <p><strong>Description:</strong> {extendedProps.description || 'No description available'}</p>
          <p><strong>Start:</strong> {new Date(event.start).toLocaleDateString()}</p>
          {event.end && <p><strong>End:</strong> {new Date(event.end).toLocaleDateString()}</p>}
        </div>
      ),
      duration: 5000,
    });
  };

  const handleDateSelect = (selectInfo: any) => {
    // Future enhancement: Allow adding milestones directly from calendar
    console.log('Date selected:', selectInfo);
  };

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Time & Action Calendar</CardTitle>
            <CardDescription>
              Visualize all milestones and deadlines across production plans
            </CardDescription>
          </div>
          <div className="flex space-x-2 items-center">
            <Select value={selectedPlan} onValueChange={setSelectedPlan}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                {Array.isArray(plans) && plans.map((plan: any) => (
                  <SelectItem key={plan.id} value={plan.id.toString()}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex space-x-1">
              <Badge variant="default" className="bg-green-500">Completed</Badge>
              <Badge variant="default" className="bg-amber-500">In Progress</Badge>
              <Badge variant="default" className="bg-red-500">Delayed</Badge>
              <Badge variant="default" className="bg-orange-500">At Risk</Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[600px] flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div className="h-[600px]">
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,dayGridWeek'
              }}
              selectable={true}
              selectMirror={true}
              dayMaxEvents={true}
              weekends={true}
              events={getEvents()}
              eventClick={handleEventClick}
              select={handleDateSelect}
              height="100%"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}