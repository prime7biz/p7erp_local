import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, CalendarIcon, Clock, CheckCircle, Trophy, Star, Plus, Edit2, Trash2, Target } from "lucide-react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Task schema
const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]),
  dueDate: z.string().optional(),
  status: z.enum(["pending", "in_progress", "completed"]).default("pending"),
});

type TaskFormValues = z.infer<typeof taskSchema>;

interface Task {
  id: number;
  title: string;
  description?: string;
  priority: "low" | "medium" | "high";
  dueDate?: string;
  status: "pending" | "in_progress" | "completed";
  createdAt: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  type: "meeting" | "deadline" | "reminder" | "task";
  priority?: "low" | "medium" | "high";
}

interface Achievement {
  id: number;
  title: string;
  description: string;
  points: number;
  badge_icon: string;
  achieved_at: string;
  category: string;
}

const CalendarAndTasks = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Sample data until backend endpoints are implemented
  const tasks: Task[] = [
    {
      id: 1,
      title: "Review customer order #ORD-1001",
      description: "Review and approve customer order for 5000 T-shirts",
      priority: "high",
      status: "pending",
      dueDate: format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'),
      createdAt: new Date().toISOString()
    },
    {
      id: 2,
      title: "Production planning meeting",
      description: "Weekly production planning for upcoming orders",
      priority: "medium",
      status: "in_progress",
      createdAt: new Date().toISOString()
    },
    {
      id: 3,
      title: "Quality inspection report",
      description: "Complete quality inspection for batch #QC-2024-001",
      priority: "high",
      status: "completed",
      createdAt: new Date().toISOString()
    }
  ];

  const calendarEvents: CalendarEvent[] = [
    {
      id: "1",
      title: "Production Meeting",
      date: format(new Date(), 'yyyy-MM-dd'),
      time: "10:00 AM",
      type: "meeting",
      priority: "high"
    },
    {
      id: "2",
      title: "Order Deadline - Customer ABC",
      date: format(new Date(Date.now() + 172800000), 'yyyy-MM-dd'),
      type: "deadline",
      priority: "high"
    },
    {
      id: "3",
      title: "Sample Approval Review",
      date: format(new Date(Date.now() + 259200000), 'yyyy-MM-dd'),
      time: "2:00 PM",
      type: "task",
      priority: "medium"
    }
  ];

  const achievements: Achievement[] = [
    {
      id: 1,
      title: "Order Completion Champion",
      description: "Completed 10 orders on time",
      points: 100,
      badge_icon: "trophy",
      achieved_at: new Date().toISOString(),
      category: "production"
    },
    {
      id: 2,
      title: "Quality Excellence",
      description: "Maintained 99% quality rating",
      points: 150,
      badge_icon: "star",
      achieved_at: new Date().toISOString(),
      category: "quality"
    }
  ];

  const tasksLoading = false;
  const eventsLoading = false;
  const achievementsLoading = false;

  // Task form
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      status: "pending",
    },
  });

  // Task mutations disabled until backend endpoints are implemented
  const taskMutation = useMutation({
    mutationFn: async (data: TaskFormValues) => {
      // Simulate successful operation for demo purposes
      return Promise.resolve({ success: true });
    },
    onSuccess: () => {
      setIsTaskDialogOpen(false);
      setEditingTask(null);
      form.reset();
      toast({
        title: editingTask ? "Task Updated" : "Task Created",
        description: "Task operation completed successfully (demo mode).",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to ${editingTask ? "update" : "create"} task.`,
        variant: "destructive",
      });
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      // Simulate successful operation for demo purposes
      return Promise.resolve({ success: true });
    },
    onSuccess: () => {
      toast({
        title: "Task Deleted",
        description: "Task deleted successfully (demo mode).",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete task.",
        variant: "destructive",
      });
    },
  });

  // Update task status mutation
  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) => {
      return apiRequest(`/api/tasks/${taskId}`, "PATCH", { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task Updated",
        description: "Task status has been updated successfully.",
      });
    },
  });

  const onSubmit = (data: TaskFormValues) => {
    taskMutation.mutate(data);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    form.reset({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      dueDate: task.dueDate,
      status: task.status,
    });
    setIsTaskDialogOpen(true);
  };

  const handleDeleteTask = (taskId: number) => {
    if (confirm("Are you sure you want to delete this task?")) {
      deleteTaskMutation.mutate(taskId);
    }
  };

  const toggleTaskStatus = (task: Task) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    updateTaskStatusMutation.mutate({ taskId: task.id, status: newStatus });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "text-red-500 bg-red-50";
      case "medium": return "text-yellow-500 bg-yellow-50";
      case "low": return "text-green-500 bg-green-50";
      default: return "text-gray-500 bg-gray-50";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-green-500 bg-green-50";
      case "in_progress": return "text-blue-500 bg-blue-50";
      case "pending": return "text-orange-500 bg-orange-50";
      default: return "text-gray-500 bg-gray-50";
    }
  };

  const getBadgeIcon = (icon: string) => {
    switch (icon) {
      case "trophy": return <Trophy className="h-4 w-4" />;
      case "star": return <Star className="h-4 w-4" />;
      case "target": return <Target className="h-4 w-4" />;
      default: return <Trophy className="h-4 w-4" />;
    }
  };

  const formatEventDate = (dateStr: string | undefined) => {
    if (!dateStr) return "No date";
    try {
      const date = parseISO(dateStr);
      if (isToday(date)) return "Today";
      if (isTomorrow(date)) return "Tomorrow";
      return format(date, "MMM dd");
    } catch (error) {
      return "Invalid date";
    }
  };

  const todayTasks = (tasks as Task[]).filter((task: Task) => {
    if (!task.dueDate) return false;
    try {
      return isToday(parseISO(task.dueDate));
    } catch {
      return false;
    }
  });

  const upcomingTasks = (tasks as Task[]).filter((task: Task) => {
    if (!task.dueDate || task.status === "completed") return false;
    try {
      return !isToday(parseISO(task.dueDate));
    } catch {
      return false;
    }
  });

  const completedTasks = (tasks as Task[]).filter((task: Task) => task.status === "completed");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Calendar & Tasks</h1>
          <p className="text-gray-600">Manage your schedule, tasks, and track achievements</p>
        </div>
        <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingTask(null); form.reset(); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingTask ? "Edit Task" : "Create New Task"}</DialogTitle>
              <DialogDescription>
                {editingTask ? "Update your task details below." : "Add a new task to your list."}
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
                        <Textarea placeholder="Enter task description" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {editingTask && (
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <DialogFooter>
                  <Button type="submit" disabled={taskMutation.isPending}>
                    {taskMutation.isPending ? "Saving..." : editingTask ? "Update Task" : "Create Task"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Today's Tasks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Today's Tasks
                </CardTitle>
                <CardDescription>{todayTasks.length} tasks due today</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {todayTasks.slice(0, 3).map((task: Task) => (
                    <div key={task.id} className="flex items-center justify-between p-2 rounded border">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleTaskStatus(task)}
                        >
                          <CheckCircle className={`h-4 w-4 ${task.status === "completed" ? "text-green-500" : "text-gray-400"}`} />
                        </Button>
                        <span className={`text-sm ${task.status === "completed" ? "line-through text-gray-500" : ""}`}>
                          {task.title}
                        </span>
                      </div>
                      <Badge className={getPriorityColor(task.priority)}>
                        {task.priority}
                      </Badge>
                    </div>
                  ))}
                  {todayTasks.length === 0 && (
                    <p className="text-sm text-gray-500">No tasks due today</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Upcoming Events */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Upcoming Events
                </CardTitle>
                <CardDescription>{(calendarEvents as CalendarEvent[]).length} events scheduled</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(calendarEvents as CalendarEvent[]).slice(0, 3).map((event: CalendarEvent) => (
                    <div key={event.id} className="flex items-center justify-between p-2 rounded border">
                      <div>
                        <p className="text-sm font-medium">{event.title}</p>
                        <p className="text-xs text-gray-500">{formatEventDate(event.date)}</p>
                      </div>
                      <Badge variant="outline">
                        {event.type}
                      </Badge>
                    </div>
                  ))}
                  {(calendarEvents as CalendarEvent[]).length === 0 && (
                    <p className="text-sm text-gray-500">No upcoming events</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent Achievements */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Recent Achievements
                </CardTitle>
                <CardDescription>{(achievements as Achievement[]).length} achievements unlocked</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(achievements as Achievement[]).slice(0, 3).map((achievement: Achievement) => (
                    <div key={achievement.id} className="flex items-center gap-3 p-2 rounded border">
                      <div className="text-yellow-500">
                        {getBadgeIcon(achievement.badge_icon)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{achievement.title}</p>
                        <p className="text-xs text-gray-500">{achievement.points} points</p>
                      </div>
                    </div>
                  ))}
                  {(achievements as Achievement[]).length === 0 && (
                    <p className="text-sm text-gray-500">No achievements yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Calendar Events</CardTitle>
              <CardDescription>View your scheduled events and deadlines</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {(calendarEvents as CalendarEvent[]).map((event: CalendarEvent) => (
                  <div key={event.id} className="flex items-center justify-between p-4 rounded border hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="text-blue-500">
                        <CalendarIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-medium">{event.title}</h3>
                        <p className="text-sm text-gray-500">
                          {formatEventDate(event.date)} {event.time && `at ${event.time}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{event.type}</Badge>
                      {event.priority && (
                        <Badge className={getPriorityColor(event.priority)}>
                          {event.priority}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                {(calendarEvents as CalendarEvent[]).length === 0 && (
                  <p className="text-center text-gray-500 py-8">No calendar events found</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <div className="grid gap-4">
            {/* Pending Tasks */}
            <Card>
              <CardHeader>
                <CardTitle>Active Tasks</CardTitle>
                <CardDescription>Tasks that need your attention</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(tasks as Task[]).filter((task: Task) => task.status !== "completed").map((task: Task) => (
                    <div key={task.id} className="flex items-center justify-between p-3 rounded border hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleTaskStatus(task)}
                        >
                          <CheckCircle className={`h-4 w-4 ${task.status === "completed" ? "text-green-500" : "text-gray-400"}`} />
                        </Button>
                        <div>
                          <h3 className="font-medium">{task.title}</h3>
                          {task.description && (
                            <p className="text-sm text-gray-500">{task.description}</p>
                          )}
                          {task.dueDate && (
                            <p className="text-xs text-gray-400">
                              Due: {format(parseISO(task.dueDate), "MMM dd, yyyy")}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getPriorityColor(task.priority)}>
                          {task.priority}
                        </Badge>
                        <Badge className={getStatusColor(task.status)}>
                          {task.status.replace("_", " ")}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditTask(task)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTask(task.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(tasks as Task[]).filter((task: Task) => task.status !== "completed").length === 0 && (
                    <p className="text-center text-gray-500 py-8">No active tasks</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Completed Tasks */}
            {completedTasks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Completed Tasks</CardTitle>
                  <CardDescription>{completedTasks.length} tasks completed</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {completedTasks.map((task: Task) => (
                      <div key={task.id} className="flex items-center justify-between p-3 rounded border bg-gray-50">
                        <div className="flex items-center gap-3">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <div>
                            <h3 className="font-medium line-through text-gray-500">{task.title}</h3>
                            {task.description && (
                              <p className="text-sm text-gray-400 line-through">{task.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="text-green-500 bg-green-50">completed</Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleTaskStatus(task)}
                          >
                            Reopen
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="achievements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Your Achievements</CardTitle>
              <CardDescription>Track your progress and accomplishments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(achievements as Achievement[]).map((achievement: Achievement) => (
                  <div key={achievement.id} className="flex items-center gap-4 p-4 rounded border hover:bg-gray-50">
                    <div className="text-yellow-500 text-2xl">
                      {getBadgeIcon(achievement.badge_icon)}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium">{achievement.title}</h3>
                      <p className="text-sm text-gray-500">{achievement.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline">{achievement.category}</Badge>
                        <span className="text-sm font-medium text-blue-600">{achievement.points} pts</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Achieved {format(parseISO(achievement.achieved_at), "MMM dd, yyyy")}
                      </p>
                    </div>
                  </div>
                ))}
                {(achievements as Achievement[]).length === 0 && (
                  <div className="col-span-full text-center text-gray-500 py-8">
                    <Trophy className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No achievements yet. Keep working to unlock your first achievement!</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CalendarAndTasks;