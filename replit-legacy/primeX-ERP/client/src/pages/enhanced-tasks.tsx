import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "../lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  CalendarIcon, 
  CheckCircle2Icon, 
  ChevronRightIcon, 
  ClockIcon, 
  PlusIcon, 
  BrainCircuitIcon,
  FilterIcon,
  SortAscIcon,
  TagIcon,
  UserIcon,
  AlertCircleIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  ArrowUpIcon,
  ShieldIcon
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { 
  Task, 
  AIInsight, 
  HealthReminder, 
  WeatherData,
  HealthReminderCard, 
  WeatherWidget, 
  AIAssistantWidget,
  fetchWeatherData,
  generateHealthReminders
} from "../components/tasks/TaskEnhancements";

// Task schema for validation
const taskSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  priority: z.enum(["urgent", "high", "medium", "low"]),
  status: z.enum(["pending", "in_progress", "blocked", "completed"]),
  dueDate: z.string().optional(),
  tags: z.string().optional(),
  department: z.string().optional(),
  requiresApproval: z.boolean().optional(),
  approvalLevel: z.string().optional(),
});

// Enhanced TaskCard component
interface TaskCardProps {
  task: Task;
  onComplete: (id: number, completed: boolean) => void;
  onGenerateInsights: (id: number) => void;
  onViewInsights: (task: Task) => void;
}

const TaskCard = ({ task, onComplete, onGenerateInsights, onViewInsights }: TaskCardProps) => {
  type PriorityType = "urgent" | "high" | "medium" | "low";
  type StatusType = "pending" | "in_progress" | "blocked" | "completed";
  
  const priorityColors: Record<PriorityType, string> = {
    urgent: "from-red-50 to-white border-red-300 shadow-red-100/50",
    high: "from-orange-50 to-white border-orange-300 shadow-orange-100/50",
    medium: "from-blue-50 to-white border-blue-300 shadow-blue-100/50",
    low: "from-green-50 to-white border-green-300 shadow-green-100/50",
  };

  const priorityIndicators: Record<PriorityType, JSX.Element> = {
    urgent: <AlertCircleIcon className="h-5 w-5 text-red-600" />,
    high: <AlertCircleIcon className="h-5 w-5 text-orange-600" />,
    medium: <AlertCircleIcon className="h-5 w-5 text-blue-600" />,
    low: <CheckCircle2Icon className="h-5 w-5 text-green-600" />,
  };

  const statusColors: Record<StatusType, string> = {
    pending: "bg-gray-100 text-gray-800 border-gray-800/20",
    in_progress: "bg-blue-100 text-blue-800 border-blue-800/20",
    blocked: "bg-red-100 text-red-800 border-red-800/20",
    completed: "bg-green-100 text-green-800 border-green-800/20",
  };

  const statusIcons: Record<StatusType, JSX.Element> = {
    pending: <ClockIcon className="h-4 w-4 mr-1" />,
    in_progress: <ClockIcon className="h-4 w-4 mr-1" />,
    blocked: <AlertCircleIcon className="h-4 w-4 mr-1" />,
    completed: <CheckCircle2Icon className="h-4 w-4 mr-1" />,
  };

  const getDueIndicator = () => {
    if (!task.dueDate) return null;
    
    const now = new Date();
    const dueDate = new Date(task.dueDate);
    const diffTime = dueDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return <span className="flex items-center text-red-600 font-medium"><AlertCircleIcon className="h-3.5 w-3.5 mr-1" />Overdue by {Math.abs(diffDays)} days</span>;
    } else if (diffDays === 0) {
      return <span className="flex items-center text-orange-600 font-medium"><AlertCircleIcon className="h-3.5 w-3.5 mr-1" />Due today</span>;
    } else if (diffDays === 1) {
      return <span className="flex items-center text-orange-600"><ClockIcon className="h-3.5 w-3.5 mr-1" />Due tomorrow</span>;
    } else if (diffDays <= 3) {
      return <span className="flex items-center text-orange-500"><ClockIcon className="h-3.5 w-3.5 mr-1" />Due in {diffDays} days</span>;
    } else {
      return <span className="flex items-center text-gray-600"><CalendarIcon className="h-3.5 w-3.5 mr-1" />Due in {diffDays} days</span>;
    }
  };

  const getCompletionIndicator = () => {
    const progress = task.progress || 0;
    const getProgressColor = () => {
      if (progress >= 75) return "bg-green-500";
      if (progress >= 50) return "bg-blue-500";
      if (progress >= 25) return "bg-orange-500";
      return "bg-red-500";
    };

    return (
      <div className="w-full mt-2">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-600">Progress</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
          <div 
            className={`h-full ${getProgressColor()}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <Card className={`bg-gradient-to-br ${
      task.priority && priorityColors[task.priority] ? priorityColors[task.priority] : 'from-gray-50 to-white border-gray-200'
    } overflow-hidden border shadow-sm hover:shadow-md transition-all duration-200`}>
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-start space-x-2">
            <div className="mt-1">
              {task.priority && priorityIndicators[task.priority]}
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">
                {task.title}
              </CardTitle>
              {task.requiresApproval && (
                <Badge variant="outline" className="mt-1 bg-purple-100 text-purple-800 border-purple-200">
                  <ShieldIcon className="h-3 w-3 mr-1" />
                  Needs Approval
                </Badge>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-black/5">
                <MoreHorizontalIcon className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onViewInsights(task)}>
                <BrainCircuitIcon className="h-4 w-4 mr-2 text-purple-500" />
                View AI Insights
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onGenerateInsights(task.id)}>
                <BrainCircuitIcon className="h-4 w-4 mr-2 text-purple-500" />
                Generate New Insights
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <MessageSquareIcon className="h-4 w-4 mr-2 text-blue-500" />
                Add Comment
              </DropdownMenuItem>
              <DropdownMenuItem>
                <UserIcon className="h-4 w-4 mr-2 text-green-500" />
                Reassign Task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        {task.description && (
          <p className="text-sm text-gray-600 mb-3">{task.description}</p>
        )}
        
        <div className="flex flex-wrap gap-2 mb-3">
          <Badge variant="secondary" className={`flex items-center ${
            task.status && statusColors[task.status] ? statusColors[task.status] : "bg-gray-100 text-gray-800"
          }`}>
            {task.status && statusIcons[task.status]}
            {task.status ? task.status.replace('_', ' ').charAt(0).toUpperCase() + task.status.replace('_', ' ').slice(1) : "Status unknown"}
          </Badge>
          
          {task.department && (
            <Badge variant="outline" className="bg-gray-50 border-gray-200 text-gray-700">
              <TagIcon className="h-3 w-3 mr-1" />
              {task.department}
            </Badge>
          )}
          
          {task.tags && task.tags.length > 0 && task.tags.map((tag: string, index: number) => (
            <Badge key={index} variant="outline" className="bg-purple-50 border-purple-200 text-purple-700">
              {tag}
            </Badge>
          ))}
        </div>
        
        {getCompletionIndicator()}
        
        <div className="flex justify-between items-center mt-3 text-xs">
          <div>
            {getDueIndicator()}
          </div>
          
          <div className="flex items-center gap-2">
            {task.assignedTo && (
              <HoverCard>
                <HoverCardTrigger asChild>
                  <div className="flex items-center cursor-pointer">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={`https://ui-avatars.com/api/?name=${encodeURIComponent(task.assignedTo)}&background=random`} />
                      <AvatarFallback>{task.assignedTo.charAt(0)}</AvatarFallback>
                    </Avatar>
                  </div>
                </HoverCardTrigger>
                <HoverCardContent className="w-60">
                  <div className="flex justify-between space-x-4">
                    <Avatar>
                      <AvatarImage src={`https://ui-avatars.com/api/?name=${encodeURIComponent(task.assignedTo)}&background=random`} />
                      <AvatarFallback>{task.assignedTo.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold">{task.assignedTo}</h4>
                      <p className="text-xs text-muted-foreground">Assigned to this task</p>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
            )}
            
            <Button 
              variant={task.completed ? "outline" : "default"}
              size="sm"
              className={task.completed ? "h-8 border-green-500 text-green-700" : "h-8 bg-green-600 hover:bg-green-700"}
              onClick={() => onComplete(task.id, task.completed || false)}
            >
              {task.completed ? (
                <>
                  <CheckCircle2Icon className="h-4 w-4 mr-1 text-green-500" />
                  Completed
                </>
              ) : (
                <>
                  <CheckCircle2Icon className="h-4 w-4 mr-1" />
                  Complete
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Approval Card Component
interface ApprovalCardProps {
  task: Task;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}

const ApprovalCard = ({ task, onApprove, onReject }: ApprovalCardProps) => {
  const getPriorityColor = (priority: "urgent" | "high" | "medium" | "low") => {
    const colors = {
      urgent: "text-red-600 border-red-600 bg-red-50",
      high: "text-orange-600 border-orange-600 bg-orange-50",
      medium: "text-blue-600 border-blue-600 bg-blue-50",
      low: "text-green-600 border-green-600 bg-green-50"
    };
    return colors[priority] || "text-gray-600 border-gray-600 bg-gray-50";
  };
  
  return (
    <Card className="border shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <h4 className="font-medium">{task.title}</h4>
            <p className="text-sm text-gray-500 mt-1">Requires {task.approvalLevel} approval</p>
          </div>
          <Badge className={getPriorityColor(task.priority)}>
            {task.priority}
          </Badge>
        </div>
        <div className="flex gap-2 mt-4">
          <Button 
            variant="outline" 
            size="sm" 
            className="border-red-500 text-red-500 hover:bg-red-50"
            onClick={() => onReject(task.id)}
          >
            Reject
          </Button>
          <Button 
            size="sm" 
            className="bg-green-600 hover:bg-green-700"
            onClick={() => onApprove(task.id)}
          >
            Approve
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Main tasks page component
const EnhancedTasksPage = () => {
  const [open, setOpen] = useState(false);
  const [insightDrawerOpen, setInsightDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedTab, setSelectedTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("dueDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [activeReminders, setActiveReminders] = useState<HealthReminder[]>([]);
  const [showPendingApprovals, setShowPendingApprovals] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<Task[]>([]);
  const [aiInsights, setAiInsights] = useState<AIInsight[]>([]);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const { toast } = useToast();
  
  // Load weather data for Dhaka
  useEffect(() => {
    const loadWeatherData = async () => {
      try {
        const data = await fetchWeatherData();
        setWeatherData(data);
      } catch (error) {
        console.error("Error fetching weather data:", error);
      }
    };
    
    loadWeatherData();
  }, []);
  
  // Set up health reminders
  useEffect(() => {
    const reminders = generateHealthReminders();
    setActiveReminders(reminders.slice(0, 1)); // Start with one active reminder
    
    // For demo purposes, show a new reminder every 2 minutes
    const reminderInterval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * reminders.length);
      const randomReminder = reminders[randomIndex];
      
      setActiveReminders(prev => {
        // Don't add if already active
        if (prev.some(r => r.id === randomReminder.id)) return prev;
        
        // Limit to 2 active reminders at a time
        const updated = [...prev, randomReminder];
        return updated.slice(-2);
      });
    }, 2 * 60 * 1000);
    
    // Clear interval on unmount
    return () => clearInterval(reminderInterval);
  }, []);
  
  // For demo purposes, load some sample pending approvals
  useEffect(() => {
    // Sample pending approvals data
    const sampleApprovals: Task[] = [
      {
        id: 999,
        title: "Quality Check: Production Batch #1245",
        description: "Verify quality standards for the latest production batch of t-shirts",
        priority: "high",
        status: "pending",
        requiresApproval: true,
        approvalLevel: "Manager",
        department: "Quality"
      }
    ];
    
    setPendingApprovals(sampleApprovals);
  }, []);

  const form = useForm<z.infer<typeof taskSchema>>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      status: "pending",
      dueDate: "",
      tags: "",
      department: "",
      requiresApproval: false
    },
  });

  // Query tasks from API
  const { data: tasks, isLoading } = useQuery({
    queryKey: ["/api/tasks"],
    select: (data: any) => {
      if (selectedTab === "all") {
        return data;
      } else if (selectedTab === "pending") {
        return data.filter((task: Task) => task.status !== "completed");
      } else if (selectedTab === "completed") {
        return data.filter((task: Task) => task.status === "completed");
      }
      return data;
    },
  });

  // Query AI insights for selected task
  const { data: insights, isLoading: insightsLoading } = useQuery({
    queryKey: ["/api/tasks", selectedTask?.id, "ai-insights"],
    queryFn: () => apiRequest(`/api/tasks/${selectedTask?.id}/ai-insights`, "GET"),
    enabled: !!selectedTask?.id,
  });

  // Filter and sort tasks
  const filteredAndSortedTasks = React.useMemo(() => {
    if (!tasks) return [];
    
    let filtered = [...tasks];
    
    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter((task: Task) => (
        task.title.toLowerCase().includes(searchLower) ||
        (task.description && task.description.toLowerCase().includes(searchLower)) ||
        (task.tags && task.tags.some((tag: string) => tag.toLowerCase().includes(searchLower)))
      ));
    }
    
    // Apply status filter
    if (statusFilter.length > 0) {
      filtered = filtered.filter((task: Task) => statusFilter.includes(task.status));
    }
    
    // Apply priority filter
    if (priorityFilter.length > 0) {
      filtered = filtered.filter((task: Task) => priorityFilter.includes(task.priority));
    }
    
    // Sort tasks
    filtered.sort((a: any, b: any) => {
      if (!a[sortBy] && !b[sortBy]) return 0;
      if (!a[sortBy]) return 1;
      if (!b[sortBy]) return -1;
      
      const valueA = sortBy === 'dueDate' ? new Date(a[sortBy]) : a[sortBy];
      const valueB = sortBy === 'dueDate' ? new Date(b[sortBy]) : b[sortBy];
      
      if (valueA < valueB) return sortDirection === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    return filtered;
  }, [tasks, searchTerm, statusFilter, priorityFilter, sortBy, sortDirection]);

  // Create new task mutation
  const createTaskMutation = useMutation({
    mutationFn: (data: z.infer<typeof taskSchema>) => {
      // Process tags from comma-separated string to array
      const tags = data.tags ? data.tags.split(",").map(tag => tag.trim()) : [];
      
      return apiRequest("/api/tasks", "POST", {
        ...data,
        tags,
        progress: 0 // Start with 0% progress
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setOpen(false);
      form.reset();
      toast({
        title: "Task created",
        description: "Your task has been created successfully.",
      });
    },
  });

  // Complete task mutation
  const completeTaskMutation = useMutation({
    mutationFn: ({ id, completed }: { id: number; completed: boolean }) => {
      return apiRequest(`/api/tasks/${id}/complete`, "PATCH", { completed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task updated",
        description: "The task status has been updated.",
      });
    },
  });

  // Generate insights mutation
  const generateInsightsMutation = useMutation({
    mutationFn: (id: number) => {
      setIsLoadingInsights(true);
      // For demo purposes, generate insights locally instead of API
      return new Promise<AIInsight[]>((resolve) => {
        setTimeout(() => {
          const insights: AIInsight[] = [
            {
              id: 1,
              title: "Task Optimization",
              description: "Breaking this task into smaller sub-tasks could improve completion rate by 35%",
              type: "suggestion"
            },
            {
              id: 2,
              title: "Resource Allocation",
              description: "Based on similar past tasks, this may require 2 additional staff members",
              type: "resource"
            },
            {
              id: 3,
              title: "Risk Assessment",
              description: "This task has potential delays in the supply chain based on weather conditions in Dhaka",
              type: "warning"
            }
          ];
          setIsLoadingInsights(false);
          setAiInsights(insights);
          resolve(insights);
        }, 1500);
      });
    },
    onSuccess: () => {
      toast({
        title: "AI Insights Generated",
        description: "AI insights have been generated for this task",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof taskSchema>) => {
    createTaskMutation.mutate(data);
  };

  const handleCompleteTask = (id: number, currentStatus: boolean) => {
    completeTaskMutation.mutate({ id, completed: !currentStatus });
  };

  const handleGenerateInsights = (id: number) => {
    const task = tasks?.find((t: Task) => t.id === id);
    if (task) {
      setSelectedTask(task);
      generateInsightsMutation.mutate(id);
    }
  };

  const handleViewInsights = (task: Task) => {
    setSelectedTask(task);
    if (aiInsights.length === 0) {
      handleGenerateInsights(task.id);
    }
    setInsightDrawerOpen(true);
  };
  
  // Handle reminder actions
  const dismissReminder = (id: number) => {
    setActiveReminders(prev => prev.filter(r => r.id !== id));
  };
  
  const snoozeReminder = (id: number) => {
    // Snooze for a short period for demo purposes
    setActiveReminders(prev => prev.filter(r => r.id !== id));
    
    setTimeout(() => {
      const reminder = generateHealthReminders().find(r => r.id === id);
      if (reminder) {
        setActiveReminders(prev => {
          if (prev.length >= 2) return prev;
          return [...prev, reminder];
        });
      }
    }, 60 * 1000); // 1 minute for demo
    
    toast({
      title: "Reminder snoozed",
      description: "We'll remind you again in a minute.",
      variant: "default",
    });
  };
  
  // Handle task approvals
  const handleApproveTask = (id: number) => {
    // In a real implementation, this would call an API
    setPendingApprovals(prev => prev.filter(task => task.id !== id));
    
    toast({
      title: "Task approved",
      description: "The task has been approved successfully.",
      variant: "default",
    });
  };
  
  const handleRejectTask = (id: number) => {
    // In a real implementation, this would call an API
    setPendingApprovals(prev => prev.filter(task => task.id !== id));
    
    toast({
      title: "Task rejected",
      description: "The task has been rejected.",
      variant: "default",
    });
  };

  // Toggle filter selection
  const toggleStatusFilter = (status: string) => {
    setStatusFilter(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status) 
        : [...prev, status]
    );
  };

  const togglePriorityFilter = (priority: string) => {
    setPriorityFilter(prev => 
      prev.includes(priority) 
        ? prev.filter(p => p !== priority) 
        : [...prev, priority]
    );
  };

  // Handle sort change
  const handleSortChange = (field: string) => {
    if (sortBy === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  // Reset all filters
  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter([]);
    setPriorityFilter([]);
    setSortBy("dueDate");
    setSortDirection("asc");
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header with Welcome Message, Health Reminders and Weather */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Task Management</h1>
              <p className="text-gray-500 mt-1">Manage and track your manufacturing tasks</p>
            </div>
            <div className="mt-4 md:mt-0">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-orange-600 hover:bg-orange-700">
                    <PlusIcon className="mr-2 h-4 w-4" />
                    New Task
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px]">
                  <DialogHeader>
                    <DialogTitle>Create New Task</DialogTitle>
                    <DialogDescription>
                      Add a new task to your manufacturing workflow
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter task title" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Enter task description" 
                                className="h-24"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="priority"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Priority</FormLabel>
                              <Select 
                                onValueChange={field.onChange} 
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select priority" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="urgent">Urgent</SelectItem>
                                  <SelectItem value="high">High</SelectItem>
                                  <SelectItem value="medium">Medium</SelectItem>
                                  <SelectItem value="low">Low</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Status</FormLabel>
                              <Select 
                                onValueChange={field.onChange} 
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select status" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="in_progress">In Progress</SelectItem>
                                  <SelectItem value="blocked">Blocked</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="dueDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Due Date</FormLabel>
                              <FormControl>
                                <Input 
                                  type="date" 
                                  {...field} 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="department"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Department</FormLabel>
                              <Select 
                                onValueChange={field.onChange} 
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select department" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="production">Production</SelectItem>
                                  <SelectItem value="quality">Quality</SelectItem>
                                  <SelectItem value="inventory">Inventory</SelectItem>
                                  <SelectItem value="marketing">Marketing</SelectItem>
                                  <SelectItem value="sales">Sales</SelectItem>
                                  <SelectItem value="hr">HR</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="requiresApproval"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                            <FormControl>
                              <Switch 
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel>Requires Approval</FormLabel>
                              <FormDescription>
                                This task will need approval before it can be marked as completed
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="tags"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tags</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="production, quality, materials" 
                                {...field} 
                              />
                            </FormControl>
                            <FormDescription>
                              Enter tags separated by commas
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <DialogFooter>
                        <Button 
                          type="submit" 
                          disabled={createTaskMutation.isPending}
                          className="bg-orange-600 hover:bg-orange-700"
                        >
                          {createTaskMutation.isPending ? "Creating..." : "Create Task"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          
          {/* Health Reminders */}
          {activeReminders.length > 0 && (
            <div className="mt-4 space-y-2">
              {activeReminders.map(reminder => (
                <HealthReminderCard 
                  key={reminder.id}
                  reminder={reminder}
                  onDismiss={dismissReminder}
                  onSnooze={snoozeReminder}
                />
              ))}
            </div>
          )}
        </div>
        
        {/* Weather Card */}
        <div>
          {weatherData && <WeatherWidget weatherData={weatherData} />}
        </div>
      </div>
      
      {/* Conditional Approvals section */}
      {showPendingApprovals && pendingApprovals.length > 0 && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold flex items-center">
              <ShieldIcon className="h-5 w-5 mr-2 text-purple-600" />
              Pending Approvals
            </h2>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowPendingApprovals(false)}
            >
              Hide
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingApprovals.map(task => (
              <ApprovalCard 
                key={task.id}
                task={task}
                onApprove={handleApproveTask}
                onReject={handleRejectTask}
              />
            ))}
          </div>
        </div>
      )}

      {/* Main layout with AI Assistant */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          {/* Filters and Search Bar */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10">
                    <FilterIcon className="mr-2 h-4 w-4" />
                    Filter
                    {(statusFilter.length > 0 || priorityFilter.length > 0) && (
                      <Badge className="ml-2 bg-orange-600" variant="default">
                        {statusFilter.length + priorityFilter.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Status</h4>
                      <div className="flex flex-wrap gap-2">
                        {['pending', 'in_progress', 'blocked', 'completed'].map(status => (
                          <Badge 
                            key={status}
                            variant={statusFilter.includes(status) ? "default" : "outline"}
                            className={statusFilter.includes(status) ? "bg-orange-600 hover:bg-orange-700" : ""}
                            onClick={() => toggleStatusFilter(status)}
                          >
                            {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Priority</h4>
                      <div className="flex flex-wrap gap-2">
                        {['urgent', 'high', 'medium', 'low'].map(priority => (
                          <Badge 
                            key={priority}
                            variant={priorityFilter.includes(priority) ? "default" : "outline"}
                            className={priorityFilter.includes(priority) ? "bg-orange-600 hover:bg-orange-700" : ""}
                            onClick={() => togglePriorityFilter(priority)}
                          >
                            {priority.charAt(0).toUpperCase() + priority.slice(1)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Separator />
                    <div className="flex justify-end">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={resetFilters}
                      >
                        Reset Filters
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10">
                    <SortAscIcon className="mr-2 h-4 w-4" />
                    Sort
                    <Badge className="ml-2 bg-orange-600" variant="default">
                      {sortBy}
                    </Badge>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-60">
                  <div className="space-y-2">
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start"
                      onClick={() => handleSortChange('dueDate')}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      Due Date
                      {sortBy === 'dueDate' && (
                        <ArrowUpIcon className={`ml-auto h-4 w-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                      )}
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start"
                      onClick={() => handleSortChange('priority')}
                    >
                      <AlertCircleIcon className="mr-2 h-4 w-4" />
                      Priority
                      {sortBy === 'priority' && (
                        <ArrowUpIcon className={`ml-auto h-4 w-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                      )}
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start"
                      onClick={() => handleSortChange('title')}
                    >
                      <MessageSquareIcon className="mr-2 h-4 w-4" />
                      Title
                      {sortBy === 'title' && (
                        <ArrowUpIcon className={`ml-auto h-4 w-4 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                      )}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              
              {!showPendingApprovals && pendingApprovals.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-10 border-purple-300 text-purple-700 hover:bg-purple-50 hover:text-purple-800"
                  onClick={() => setShowPendingApprovals(true)}
                >
                  <ShieldIcon className="mr-2 h-4 w-4" />
                  Approvals
                  <Badge className="ml-2 bg-purple-600" variant="default">
                    {pendingApprovals.length}
                  </Badge>
                </Button>
              )}
            </div>
            <div className="w-full md:w-auto">
              <Input
                type="search"
                placeholder="Search tasks..."
                className="md:w-80"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <Tabs defaultValue="all" onValueChange={setSelectedTab} className="mb-6">
            <TabsList className="w-full md:w-auto border-b rounded-none justify-start gap-2">
              <TabsTrigger value="all" className="flex items-center gap-2 py-2 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-orange-600">
                All Tasks
                {tasks && (
                  <Badge variant="outline" className="rounded-full bg-gray-100 text-gray-800">
                    {tasks.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="pending" className="flex items-center gap-2 py-2 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-orange-600">
                Active Tasks
                {tasks && (
                  <Badge variant="outline" className="rounded-full bg-gray-100 text-gray-800">
                    {tasks.filter((task: Task) => task.status !== "completed").length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed" className="flex items-center gap-2 py-2 px-4 rounded-none border-b-2 border-transparent data-[state=active]:border-orange-600">
                Completed
                {tasks && (
                  <Badge variant="outline" className="rounded-full bg-gray-100 text-gray-800">
                    {tasks.filter((task: any) => task.status === "completed").length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4 mt-4">
              {isLoading ? (
                <div className="flex justify-center items-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
                </div>
              ) : filteredAndSortedTasks.length === 0 ? (
                <Card>
                  <CardContent className="py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-orange-500 mb-4">
                        <ClockIcon className="h-8 w-8" />
                      </div>
                      <h3 className="text-xl font-medium mb-2">No tasks found</h3>
                      <p className="text-gray-500 mb-6 max-w-md">
                        {statusFilter.length > 0 || priorityFilter.length > 0 || searchTerm
                          ? "Try adjusting your filters or search to see more tasks."
                          : "Create your first task to get started with task management."}
                      </p>
                      <Button onClick={() => setOpen(true)} className="bg-orange-600 hover:bg-orange-700">
                        <PlusIcon className="mr-2 h-4 w-4" />
                        Create New Task
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredAndSortedTasks.map((task: any) => (
                    <TaskCard 
                      key={task.id} 
                      task={task} 
                      onComplete={handleCompleteTask}
                      onGenerateInsights={handleGenerateInsights}
                      onViewInsights={handleViewInsights}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="pending" className="space-y-4 mt-4">
              {isLoading ? (
                <div className="flex justify-center items-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
                </div>
              ) : filteredAndSortedTasks.length === 0 ? (
                <Card>
                  <CardContent className="py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-orange-500 mb-4">
                        <ClockIcon className="h-8 w-8" />
                      </div>
                      <h3 className="text-xl font-medium mb-2">No pending tasks found</h3>
                      <p className="text-gray-500 mb-6 max-w-md">
                        {statusFilter.length > 0 || priorityFilter.length > 0 || searchTerm
                          ? "Try adjusting your filters or search to see more tasks."
                          : "Great job! You've completed all your current tasks."}
                      </p>
                      <Button onClick={() => setOpen(true)} className="bg-orange-600 hover:bg-orange-700">
                        <PlusIcon className="mr-2 h-4 w-4" />
                        Create New Task
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredAndSortedTasks.map((task: any) => (
                    <TaskCard 
                      key={task.id} 
                      task={task} 
                      onComplete={handleCompleteTask}
                      onGenerateInsights={handleGenerateInsights}
                      onViewInsights={handleViewInsights}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4 mt-4">
              {isLoading ? (
                <div className="flex justify-center items-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
                </div>
              ) : filteredAndSortedTasks.length === 0 ? (
                <Card>
                  <CardContent className="py-16 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-orange-500 mb-4">
                        <ClockIcon className="h-8 w-8" />
                      </div>
                      <h3 className="text-xl font-medium mb-2">No completed tasks found</h3>
                      <p className="text-gray-500 mb-6 max-w-md">
                        {statusFilter.length > 0 || priorityFilter.length > 0 || searchTerm
                          ? "Try adjusting your filters or search to see more tasks."
                          : "You haven't completed any tasks yet. Keep going!"}
                      </p>
                      <Button onClick={() => setOpen(true)} className="bg-orange-600 hover:bg-orange-700">
                        <PlusIcon className="mr-2 h-4 w-4" />
                        Create New Task
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredAndSortedTasks.map((task: any) => (
                    <TaskCard 
                      key={task.id} 
                      task={task} 
                      onComplete={handleCompleteTask}
                      onGenerateInsights={handleGenerateInsights}
                      onViewInsights={handleViewInsights}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
        
        {/* AI Assistant Sidebar */}
        <div className="space-y-6">
          <AIAssistantWidget 
            task={selectedTask}
            insights={aiInsights}
            isLoading={isLoadingInsights}
          />
          
          {tasks && tasks.length > 0 && (
            <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200 shadow-sm">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center space-x-2">
                  <ActivityIcon className="h-5 w-5 text-blue-500" />
                  <CardTitle className="text-lg font-semibold text-blue-800">Task Productivity</CardTitle>
                </div>
                <CardDescription className="text-blue-700">
                  Your task completion metrics
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Completed Tasks</span>
                      <span className="font-medium">
                        {tasks.filter((t: any) => t.status === "completed").length}/{tasks.length}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-blue-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500"
                        style={{ 
                          width: `${tasks.length ? (tasks.filter((t: any) => t.status === "completed").length / tasks.length) * 100 : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Urgent Tasks</span>
                      <span className="font-medium">
                        {tasks.filter((t: any) => t.priority === "urgent" && t.status !== "completed").length}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-red-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-red-500"
                        style={{ 
                          width: `${tasks.length ? (tasks.filter((t: any) => t.priority === "urgent" && t.status !== "completed").length / tasks.length) * 100 : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Tasks Due Today</span>
                      <span className="font-medium">
                        {tasks.filter((t: any) => {
                          if (!t.dueDate || t.status === "completed") return false;
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const dueDate = new Date(t.dueDate);
                          dueDate.setHours(0, 0, 0, 0);
                          return dueDate.getTime() === today.getTime();
                        }).length}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Drawer
        open={insightDrawerOpen}
        onOpenChange={setInsightDrawerOpen}
      >
        <DrawerContent>
          <DrawerHeader className="border-b">
            <DrawerTitle className="text-xl font-semibold">
              AI Insights for Task
            </DrawerTitle>
            <DrawerDescription>
              {selectedTask?.title}
            </DrawerDescription>
          </DrawerHeader>
          <div className="p-6">
            {isLoadingInsights ? (
              <div className="flex justify-center items-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
              </div>
            ) : aiInsights && aiInsights.length > 0 ? (
              <div className="space-y-4">
                {aiInsights.map((insight, index) => (
                  <Card key={index}>
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-md font-medium flex items-center">
                        <BrainCircuitIcon className="h-5 w-5 mr-2 text-purple-500" />
                        {insight.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-2">
                      <p className="text-sm text-gray-600">{insight.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <BrainCircuitIcon className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">No insights available</h3>
                <p className="text-gray-500 mb-4">We don't have any AI insights for this task yet.</p>
                <Button 
                  onClick={() => selectedTask && handleGenerateInsights(selectedTask.id)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <BrainCircuitIcon className="mr-2 h-4 w-4" />
                  Generate Insights
                </Button>
              </div>
            )}
          </div>
          <DrawerFooter className="border-t">
            <DrawerClose asChild>
              <Button variant="outline">Close</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default EnhancedTasksPage;