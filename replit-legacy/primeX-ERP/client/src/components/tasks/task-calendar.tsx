import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Calendar,
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  PlusIcon,
  BrainCircuitIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  ClockIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TaskCalendarProps {
  tasks: any[];
  onTaskSelect: (task: any) => void;
  onCompleteTask: (id: number, completed: boolean) => void;
  onGenerateInsights: (id: number) => void;
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  tasks: any[];
}

interface TaskWithType extends Record<string, any> {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string;
}

export function TaskCalendar({ tasks, onTaskSelect, onCompleteTask, onGenerateInsights }: TaskCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [view, setView] = useState<'month' | 'week'>('month');
  
  // Priority colors
  const priorityColors = {
    urgent: "bg-red-600",
    high: "bg-orange-500",
    medium: "bg-blue-500",
    low: "bg-green-500",
  };

  // Status colors
  const statusColors = {
    pending: "bg-yellow-500",
    in_progress: "bg-blue-500",
    completed: "bg-green-500",
    blocked: "bg-red-500",
  };
  
  // Prepare the calendar data
  useEffect(() => {
    const days = generateCalendarDays(currentDate, view, tasks);
    setCalendarDays(days);
  }, [currentDate, tasks, view]);
  
  // Generate the calendar days
  const generateCalendarDays = (date: Date, viewType: 'month' | 'week', taskList: TaskWithType[]): CalendarDay[] => {
    const result: CalendarDay[] = [];
    const year = date.getFullYear();
    const month = date.getMonth();
    const today = new Date();
    
    if (viewType === 'month') {
      // Get first day of month
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      
      // Get the day of the week of the first day (0 = Sunday, 6 = Saturday)
      let firstDayOfWeek = firstDay.getDay();
      if (firstDayOfWeek === 0) firstDayOfWeek = 7; // Sunday as 7 for correct calculation
      
      // Fill in days from previous month
      const daysFromPrevMonth = firstDayOfWeek - 1;
      const prevMonthLastDay = new Date(year, month, 0).getDate();
      
      for (let i = 0; i < daysFromPrevMonth; i++) {
        const day = prevMonthLastDay - daysFromPrevMonth + i + 1;
        const date = new Date(year, month - 1, day);
        result.push({
          date,
          isCurrentMonth: false,
          isToday: isSameDay(date, today),
          tasks: taskList.filter(t => t.dueDate && isSameDay(new Date(t.dueDate), date)),
        });
      }
      
      // Current month days
      for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(year, month, day);
        result.push({
          date,
          isCurrentMonth: true,
          isToday: isSameDay(date, today),
          tasks: taskList.filter(t => t.dueDate && isSameDay(new Date(t.dueDate), date)),
        });
      }
      
      // Fill in days from next month
      const totalDays = result.length;
      const daysToAdd = totalDays <= 35 ? 35 - totalDays : 42 - totalDays;
      
      for (let day = 1; day <= daysToAdd; day++) {
        const date = new Date(year, month + 1, day);
        result.push({
          date,
          isCurrentMonth: false,
          isToday: isSameDay(date, today),
          tasks: taskList.filter(t => t.dueDate && isSameDay(new Date(t.dueDate), date)),
        });
      }
    } else if (viewType === 'week') {
      // Get the first day of the week (Monday)
      const dayOfWeek = date.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust for Sunday
      const firstDayOfWeek = new Date(date);
      firstDayOfWeek.setDate(date.getDate() - diff);
      
      // Generate 7 days starting from Monday
      for (let i = 0; i < 7; i++) {
        const currentDate = new Date(firstDayOfWeek);
        currentDate.setDate(firstDayOfWeek.getDate() + i);
        
        result.push({
          date: currentDate,
          isCurrentMonth: currentDate.getMonth() === month,
          isToday: isSameDay(currentDate, today),
          tasks: taskList.filter(t => t.dueDate && isSameDay(new Date(t.dueDate), currentDate)),
        });
      }
    }
    
    return result;
  };
  
  // Helper function to check if two dates are the same day
  const isSameDay = (date1: Date, date2: Date): boolean => {
    return date1.getDate() === date2.getDate() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getFullYear() === date2.getFullYear();
  };
  
  // Navigate to previous period
  const goToPrevious = () => {
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  };
  
  // Navigate to next period
  const goToNext = () => {
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setCurrentDate(newDate);
  };
  
  // Format the current period for display
  const formatCurrentPeriod = (): string => {
    const options: Intl.DateTimeFormatOptions = view === 'month' 
      ? { month: 'long', year: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
    
    if (view === 'week') {
      const firstDay = calendarDays[0]?.date;
      const lastDay = calendarDays[6]?.date;
      
      if (!firstDay || !lastDay) return '';
      
      const firstDayStr = firstDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const lastDayStr = lastDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      
      return `${firstDayStr} - ${lastDayStr}`;
    }
    
    return currentDate.toLocaleDateString('en-US', options);
  };
  
  // Toggle between month and week views
  const toggleView = () => {
    setView(view === 'month' ? 'week' : 'month');
  };
  
  // Go to today
  const goToToday = () => {
    setCurrentDate(new Date());
  };
  
  // Render task dots or compact task items
  const renderTaskIndicators = (dayTasks: any[], isCompact = false) => {
    if (isCompact) {
      return dayTasks.slice(0, 2).map((task, index) => (
        <div
          key={index}
          className={`h-1.5 w-1.5 rounded-full ${
            task.priority && priorityColors[task.priority] ? priorityColors[task.priority] : 'bg-gray-400'
          } mx-0.5`}
        />
      ));
    }
    
    return dayTasks.slice(0, 3).map((task, index) => (
      <TooltipProvider key={index}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div 
              className={`px-2 py-1 rounded text-xs truncate text-white mb-1 cursor-pointer ${
                task.priority && priorityColors[task.priority] ? priorityColors[task.priority] : 'bg-gray-400'
              }`}
              onClick={() => onTaskSelect(task)}
            >
              {task.title}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs" side="bottom">
            <div className="text-sm font-semibold">{task.title}</div>
            {task.description && <div className="text-xs mt-1">{task.description}</div>}
            <div className="flex mt-1 gap-1">
              <Badge variant="secondary" className="text-xs">
                {task.status?.replace('_', ' ')}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {task.priority}
              </Badge>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ));
  };
  
  // Render more indicator if there are more tasks
  const renderMoreIndicator = (dayTasks: any[], isCompact = false) => {
    const remainingCount = dayTasks.length - (isCompact ? 2 : 3);
    if (remainingCount <= 0) return null;
    
    return (
      <div 
        className="text-xs text-gray-600 cursor-pointer hover:text-gray-900"
        onClick={() => {}}
      >
        +{remainingCount} more
      </div>
    );
  };
  
  return (
    <Card className="shadow-sm border-slate-200 rounded-xl overflow-hidden transition-all duration-200">
      <CardContent className="p-0">
        {/* Header */}
        <div className="p-4 flex justify-between items-center border-b bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon" 
              className="h-8 w-8" 
              onClick={goToPrevious}
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-8 w-8" 
              onClick={goToNext}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
            <h3 className="text-lg font-medium ml-2">{formatCurrentPeriod()}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8"
              onClick={goToToday}
            >
              Today
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8"
              onClick={toggleView}
            >
              {view === 'month' ? 'Week View' : 'Month View'}
            </Button>
          </div>
        </div>
        
        {/* Days of week header */}
        <div className="grid grid-cols-7 bg-slate-100 dark:bg-slate-800">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
            <div key={i} className="py-2 text-center text-sm font-medium text-gray-500">
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar grid */}
        <div 
          className={`grid grid-cols-7 ${
            view === 'month' ? 'grid-rows-6' : 'grid-rows-1 h-96'
          }`}
        >
          {calendarDays.map((day, dayIndex) => (
            <div
              key={dayIndex}
              className={`border-t border-r border-slate-200 min-h-[100px] ${
                day.isCurrentMonth ? 'bg-white dark:bg-slate-950' : 'bg-slate-50 dark:bg-slate-900 text-gray-400'
              } ${
                day.isToday ? 'ring-2 ring-inset ring-orange-500' : ''
              }`}
            >
              <div className="p-1 flex flex-col h-full">
                <div className="flex justify-between items-center">
                  <span 
                    className={`text-sm ${
                      day.isToday ? 'font-bold text-orange-600' : 'font-medium'
                    }`}
                  >
                    {day.date.getDate()}
                  </span>
                  
                  {day.tasks.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <MoreHorizontalIcon className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Tasks ({day.tasks.length})</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {day.tasks.map((task) => (
                          <DropdownMenuItem 
                            key={task.id}
                            onClick={() => onTaskSelect(task)}
                          >
                            <span className={`w-2 h-2 rounded-full ${
                              task.priority && priorityColors[task.priority] ? priorityColors[task.priority] : 'bg-gray-400'
                            } mr-2`}></span>
                            {task.title}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                
                {view === 'month' ? (
                  <div className="flex flex-wrap mt-1 gap-0.5">
                    {renderTaskIndicators(day.tasks, true)}
                    {renderMoreIndicator(day.tasks, true)}
                  </div>
                ) : (
                  <div className="flex flex-col mt-1 overflow-y-auto flex-1">
                    {renderTaskIndicators(day.tasks)}
                    {renderMoreIndicator(day.tasks)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default TaskCalendar;