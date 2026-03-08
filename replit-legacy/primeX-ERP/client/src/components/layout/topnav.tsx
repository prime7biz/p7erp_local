import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Bell, 
  Search, 
  Settings, 
  User, 
  LogOut,
  Menu,
  Plus,
  CreditCard,
  ShoppingCart,
  Package,
  Users,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Check,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMobileSidebar } from "@/components/layout/sidebar";

interface TopNavProps {
  onOpenCommandPalette?: () => void;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function TopNav({ onOpenCommandPalette }: TopNavProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { setOpen: setMobileSidebarOpen } = useMobileSidebar();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/workflow-tasks/notifications/unread-count"],
    refetchInterval: 30000,
  });

  const { data: notificationList } = useQuery<any[]>({
    queryKey: ["/api/workflow-tasks/notifications"],
    refetchInterval: 30000,
  });

  const { data: myTasks } = useQuery<any[]>({
    queryKey: ["/api/workflow-tasks/my-tasks"],
    refetchInterval: 30000,
  });

  const unreadCount = unreadData?.count || 0;
  const recentNotifications = (notificationList || []).slice(0, 5);
  const pendingTaskCount = (myTasks || []).filter((t: any) => !t.completed).length;

  const isDev = typeof window !== "undefined" && (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.includes(".replit.") ||
    window.location.hostname.includes("replit.dev")
  );

  const handleLogout = async () => {
    try {
      await apiRequest("/api/auth/logout", "POST", {});
      toast({
        title: "Logged out successfully",
        description: "You have been logged out of your account",
      });
      window.location.href = "/app/login";
    } catch (error) {
      toast({
        title: "Logout failed",
        description: "An error occurred while logging out",
        variant: "destructive",
      });
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

  const handleMarkRead = async (id: number) => {
    try {
      await apiRequest(`/api/workflow-tasks/notifications/${id}/read`, "POST", {});
      queryClient.invalidateQueries({ queryKey: ["/api/workflow-tasks/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workflow-tasks/notifications"] });
    } catch (error) {
      console.error("Failed to mark read:", error);
    }
  };

  const quickActions = [
    { label: "Create Voucher", href: "/accounts/vouchers/new", icon: CreditCard },
    { label: "New Purchase Order", href: "/inventory/purchase-orders/new", icon: ShoppingCart },
    { label: "New Order", href: "/orders/new", icon: FileText },
    { label: "New Item", href: "/inventory/items/new", icon: Package },
    { label: "New Party", href: "/parties", icon: Users },
  ];

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 gap-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Button variant="ghost" size="icon" className="md:hidden shrink-0 h-8 w-8" onClick={() => setMobileSidebarOpen(true)}>
          <Menu className="h-4 w-4" />
        </Button>

        <button
          onClick={() => onOpenCommandPalette?.()}
          className="flex items-center gap-2 h-8 px-3 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-sm text-gray-500 transition-colors max-w-xs w-full"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Search... ⌘K</span>
        </button>

        {user?.tenant?.name && (
          <span className="hidden lg:inline text-sm font-medium text-gray-700 truncate">
            {user.tenant.name}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {isDev && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600 bg-amber-50 shrink-0">
            <AlertTriangle className="h-3 w-3 mr-0.5" />
            DEV
          </Badge>
        )}

        {pendingTaskCount > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8"
            onClick={() => navigate("/my-tasks")}
            title="My Tasks"
          >
            <ClipboardList className="h-4 w-4 text-orange-600" />
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-orange-500 text-white text-[10px] flex items-center justify-center font-medium">
              {pendingTaskCount > 9 ? "9+" : pendingTaskCount}
            </span>
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {quickActions.map((action) => (
              <DropdownMenuItem key={action.href} onClick={() => navigate(action.href)}>
                <action.icon className="mr-2 h-4 w-4" />
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-8 w-8">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-medium">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between px-2 py-1.5">
              <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600" onClick={handleMarkAllRead}>
                  <Check className="h-3 w-3 mr-1" />
                  Mark all read
                </Button>
              )}
            </div>
            <DropdownMenuSeparator />
            {recentNotifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500">
                <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                No notifications yet
              </div>
            ) : (
              recentNotifications.map((notification: any) => (
                <DropdownMenuItem
                  key={notification.id}
                  className="flex flex-col items-start p-3 cursor-pointer"
                  onClick={() => {
                    if (!notification.isRead) handleMarkRead(notification.id);
                    if (notification.relatedEntityType) {
                      const docType = notification.relatedEntityType;
                      const docId = notification.relatedEntityId;
                      if (docType === "voucher") navigate(`/accounts/vouchers/${docId}`);
                      else if (docType === "quotation") navigate(`/quotations/${docId}`);
                      else if (docType === "purchase_order") navigate(`/inventory/purchase-orders/${docId}`);
                    }
                  }}
                >
                  <div className="flex w-full justify-between items-start gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {!notification.isRead && (
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      )}
                      <p className={`text-sm ${notification.isRead ? 'text-gray-600' : 'font-medium text-gray-900'} line-clamp-2`}>
                        {notification.title}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                      {notification.createdAt ? formatTimeAgo(notification.createdAt) : ""}
                    </span>
                  </div>
                  {notification.message && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1 w-full">
                      {notification.message}
                    </p>
                  )}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-center text-blue-600 justify-center" onClick={() => navigate("/my-tasks")}>
              View all tasks & notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2 h-8">
              <div className="w-7 h-7 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
                <span className="text-orange-600 font-semibold text-xs">
                  {user?.firstName?.charAt(0) || user?.username?.charAt(0) || "U"}
                </span>
              </div>
              <span className="hidden md:block text-sm font-medium text-gray-900 truncate max-w-[120px]">
                {user?.firstName ? `${user.firstName}` : user?.username}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div>
                <p className="font-medium">
                  {user?.firstName ? `${user.firstName} ${user.lastName || ''}` : user?.username}
                </p>
                <p className="text-xs text-gray-500 font-normal">
                  {user?.email}
                </p>
                {user?.subscription && (
                  <Badge variant="outline" className="mt-1 text-xs bg-orange-50 text-orange-600 border-orange-200">
                    {user.subscription.planName}
                  </Badge>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/my-tasks")}>
              <ClipboardList className="mr-2 h-4 w-4" />
              My Tasks
              {pendingTaskCount > 0 && (
                <Badge className="ml-auto text-xs bg-orange-100 text-orange-700 border-0">
                  {pendingTaskCount}
                </Badge>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <User className="mr-2 h-4 w-4" />
              Profile Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings/config")}>
              <Settings className="mr-2 h-4 w-4" />
              Account Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
