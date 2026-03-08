import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import {
  ClipboardList,
  Bell,
  CheckCircle2,
  Clock,
  FileText,
  CreditCard,
  ShoppingCart,
  ArrowRight,
  Check,
  Loader2,
} from "lucide-react";

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

const DOC_TYPE_ICONS: Record<string, any> = {
  voucher: CreditCard,
  quotation: FileText,
  purchase_order: ShoppingCart,
};

const DOC_TYPE_ROUTES: Record<string, string> = {
  voucher: "/accounts/vouchers",
  quotation: "/quotations",
  purchase_order: "/inventory/purchase-orders",
};

export default function MyTasksPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: pendingTasks = [], isLoading: loadingTasks } = useQuery<any[]>({
    queryKey: ["/api/workflow-tasks/my-tasks"],
    refetchInterval: 30000,
  });

  const { data: notifications = [], isLoading: loadingNotifs } = useQuery<any[]>({
    queryKey: ["/api/workflow-tasks/notifications"],
    refetchInterval: 30000,
  });

  const handleCompleteTask = async (taskId: number) => {
    try {
      await apiRequest(`/api/workflow-tasks/${taskId}/done`, "POST", {});
      queryClient.invalidateQueries({ queryKey: ["/api/workflow-tasks/my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workflow-tasks/notifications/unread-count"] });
    } catch (error) {
      console.error("Failed to complete task:", error);
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await apiRequest(`/api/workflow-tasks/notifications/${id}/read`, "POST", {});
      queryClient.invalidateQueries({ queryKey: ["/api/workflow-tasks/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workflow-tasks/notifications"] });
    } catch (error) {
      console.error("Failed to mark read:", error);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiRequest("/api/workflow-tasks/notifications/read-all", "POST", {});
      queryClient.invalidateQueries({ queryKey: ["/api/workflow-tasks/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workflow-tasks/notifications"] });
    } catch (error) {
      console.error("Failed to mark all read:", error);
    }
  };

  const navigateToDoc = (docType: string, docId: number) => {
    const base = DOC_TYPE_ROUTES[docType];
    if (base) navigate(`${base}/${docId}`);
  };

  const unreadCount = notifications.filter((n: any) => !n.isRead).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Tasks & Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your workflow tasks and stay updated
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1 text-orange-600 border-orange-200 bg-orange-50">
            <ClipboardList className="h-3.5 w-3.5" />
            {pendingTasks.length} pending
          </Badge>
          <Badge variant="outline" className="gap-1 text-blue-600 border-blue-200 bg-blue-50">
            <Bell className="h-3.5 w-3.5" />
            {unreadCount} unread
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks" className="gap-1.5">
            <ClipboardList className="h-4 w-4" />
            Tasks
            {pendingTasks.length > 0 && (
              <Badge className="ml-1 h-5 w-5 rounded-full p-0 text-[10px] bg-orange-500">
                {pendingTasks.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="h-4 w-4" />
            Notifications
            {unreadCount > 0 && (
              <Badge className="ml-1 h-5 w-5 rounded-full p-0 text-[10px] bg-red-500">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-4 space-y-3">
          {loadingTasks ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : pendingTasks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-300" />
                <h3 className="text-lg font-medium text-gray-700">All caught up!</h3>
                <p className="text-sm text-gray-500 mt-1">No pending tasks right now.</p>
              </CardContent>
            </Card>
          ) : (
            pendingTasks.map((task: any) => {
              const DocIcon = DOC_TYPE_ICONS[task.relatedEntityType] || FileText;
              return (
                <Card key={task.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-orange-50 shrink-0">
                        <DocIcon className="h-5 w-5 text-orange-600" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-medium text-gray-900 text-sm">{task.title}</h4>
                        {task.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{task.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge variant="outline" className="text-xs">
                            {task.priority || "normal"}
                          </Badge>
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {task.createdAt ? formatTimeAgo(task.createdAt) : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {task.relatedEntityType && task.relatedEntityId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1"
                          onClick={() => navigateToDoc(task.relatedEntityType, task.relatedEntityId)}
                        >
                          Open
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-green-600 hover:text-green-700 hover:bg-green-50 gap-1"
                        onClick={() => handleCompleteTask(task.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Done
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="notifications" className="mt-4 space-y-3">
          {unreadCount > 0 && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" className="text-xs text-blue-600" onClick={handleMarkAllRead}>
                <Check className="h-3.5 w-3.5 mr-1" />
                Mark all as read
              </Button>
            </div>
          )}

          {loadingNotifs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : notifications.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Bell className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-700">No notifications</h3>
                <p className="text-sm text-gray-500 mt-1">You're all up to date.</p>
              </CardContent>
            </Card>
          ) : (
            notifications.map((notif: any) => (
              <Card
                key={notif.id}
                className={`cursor-pointer hover:shadow-md transition-shadow ${!notif.isRead ? 'border-l-4 border-l-blue-500' : ''}`}
                onClick={() => {
                  if (!notif.isRead) handleMarkRead(notif.id);
                  if (notif.relatedEntityType && notif.relatedEntityId) {
                    navigateToDoc(notif.relatedEntityType, notif.relatedEntityId);
                  }
                }}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <div className={`p-2 rounded-lg shrink-0 ${notif.isRead ? 'bg-gray-50' : 'bg-blue-50'}`}>
                    <Bell className={`h-4 w-4 ${notif.isRead ? 'text-gray-400' : 'text-blue-600'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className={`text-sm ${notif.isRead ? 'text-gray-600' : 'font-medium text-gray-900'}`}>
                        {notif.title}
                      </h4>
                      <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                        {notif.createdAt ? formatTimeAgo(notif.createdAt) : ""}
                      </span>
                    </div>
                    {notif.message && (
                      <p className="text-xs text-gray-500 mt-0.5">{notif.message}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
