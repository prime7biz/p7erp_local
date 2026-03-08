import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";

interface Task {
  id: string;
  title: string;
  dueTime: string;
  priority: "urgent" | "important" | "medium" | "standard";
  completed: boolean;
}

type TaskFilter = "today" | "upcoming" | "completed";

export const TasksList = () => {
  const [filter, setFilter] = useState<TaskFilter>("today");

  const { data: tasks, isLoading } = useQuery<{ [key in TaskFilter]: Task[] }>({
    queryKey: ["/api/dashboard/tasks"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const res = await apiRequest(`/api/tasks/${id}`, "PATCH", { completed });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/tasks"] });
    },
  });

  const handleTaskToggle = (id: string, completed: boolean) => {
    updateTaskMutation.mutate({ id, completed });
  };

  // Helper function to get priority badge styling
  const getPriorityBadge = (priority: Task["priority"]) => {
    switch (priority) {
      case "urgent":
        return "bg-secondary bg-opacity-10 text-secondary";
      case "important":
        return "bg-primary bg-opacity-10 text-primary";
      case "medium":
        return "bg-accent bg-opacity-10 text-accent";
      case "standard":
        return "bg-neutral-dark bg-opacity-10 text-neutral-dark";
      default:
        return "bg-neutral-dark bg-opacity-10 text-neutral-dark";
    }
  };

  // Get the task count for each filter
  const getTaskCount = (filterType: TaskFilter) => {
    if (!tasks) return 0;
    return tasks[filterType]?.length || 0;
  };

  // Get the filtered tasks based on the current filter
  const getFilteredTasks = () => {
    if (!tasks) return [];
    return tasks[filter] || [];
  };

  return (
    <Card className="bg-neutral-lightest rounded-lg shadow-sm">
      <CardHeader className="p-4 sm:p-6 pb-0 flex flex-row items-center justify-between">
        <CardTitle className="font-heading font-medium text-base sm:text-lg text-neutral-darkest">
          My Tasks
        </CardTitle>
        <button className="text-primary text-xs sm:text-sm font-medium hover:text-primary-dark flex items-center">
          <span className="material-icons text-xs sm:text-sm mr-1">add</span>
          Add Task
        </button>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-4">
        {/* Task filters */}
        <div className="flex mb-4 border-b border-neutral-medium overflow-x-auto scrollbar-hide">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as TaskFilter)}>
            <TabsList className="bg-transparent h-auto w-full min-w-max">
              <TabsTrigger 
                value="today" 
                className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=inactive]:text-neutral-dark data-[state=inactive]:border-b-0"
              >
                Today ({getTaskCount("today")})
              </TabsTrigger>
              <TabsTrigger 
                value="upcoming" 
                className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=inactive]:text-neutral-dark data-[state=inactive]:border-b-0"
              >
                Upcoming ({getTaskCount("upcoming")})
              </TabsTrigger>
              <TabsTrigger 
                value="completed" 
                className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=inactive]:text-neutral-dark data-[state=inactive]:border-b-0"
              >
                Completed ({getTaskCount("completed")})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
        {/* Task list */}
        <div className="space-y-3">
          {isLoading ? (
            // Loading skeleton
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="flex items-center p-3 bg-neutral-light rounded-md animate-pulse">
                <div className="h-4 w-4 bg-neutral-medium rounded mr-3"></div>
                <div className="flex-1">
                  <div className="h-5 bg-neutral-medium rounded w-3/4 mb-1"></div>
                  <div className="h-4 bg-neutral-medium rounded w-1/3"></div>
                </div>
                <div className="h-5 w-16 bg-neutral-medium rounded"></div>
              </div>
            ))
          ) : !tasks || getFilteredTasks().length === 0 ? (
            <div className="text-center py-6">
              <span className="material-icons text-4xl text-neutral-dark mb-2">task_alt</span>
              <h3 className="font-medium text-neutral-darkest mb-1">No tasks found</h3>
              <p className="text-sm text-neutral-dark">
                {filter === "completed"
                  ? "Completed tasks will appear here"
                  : filter === "upcoming"
                  ? "Future tasks will appear here"
                  : "You have no tasks for today"}
              </p>
            </div>
          ) : (
            getFilteredTasks().map((task) => (
              <div key={task.id} className="flex items-start sm:items-center p-2.5 sm:p-3 bg-neutral-light rounded-md">
                <Checkbox 
                  id={`task-${task.id}`}
                  checked={task.completed}
                  onCheckedChange={(checked) => {
                    handleTaskToggle(task.id, checked as boolean);
                  }}
                  className="h-4 w-4 mt-0.5 sm:mt-0 text-primary rounded border-neutral-medium flex-shrink-0"
                />
                <div className="ml-2.5 sm:ml-3 flex-1 min-w-0">
                  <p className={`text-xs sm:text-sm font-medium truncate ${task.completed ? 'line-through text-neutral-dark' : 'text-neutral-darkest'}`}>
                    {task.title}
                  </p>
                  <p className="text-2xs sm:text-xs text-neutral-dark">{task.dueTime}</p>
                </div>
                <Badge variant="outline" className={`ml-1 inline-flex flex-shrink-0 items-center px-1.5 sm:px-2.5 py-0.5 rounded-full text-2xs sm:text-xs font-medium ${getPriorityBadge(task.priority)}`}>
                  <span className="hidden sm:inline">{task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}</span>
                  <span className="sm:hidden">{task.priority.charAt(0).toUpperCase()}</span>
                </Badge>
              </div>
            ))
          )}
        </div>
        
        <div className="mt-4 text-center">
          <button className="text-primary text-sm font-medium hover:text-primary-dark">
            View All Tasks
          </button>
        </div>
      </CardContent>
    </Card>
  );
};
