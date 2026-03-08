import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  TicketCheck,
  Receipt,
  Shield,
  Users,
  LogOut,
} from "lucide-react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/tenants", label: "Tenants", icon: Building2 },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/tickets", label: "Support Tickets", icon: TicketCheck },
  { href: "/admin/billing", label: "Billing", icon: Receipt },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: Shield },
  { href: "/admin/users", label: "Admin Users", icon: Users },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { admin } = useAdminAuth();
  const { toast } = useToast();

  const isActive = (href: string, exact = false) => {
    if (exact) return location === href;
    return location.startsWith(href) && href !== "/admin" || (href === "/admin" && location === "/admin");
  };

  const handleLogout = async () => {
    try {
      await apiRequest("/api/admin/auth/logout", "POST");
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/auth/me"] });
      toast({ title: "Logged out", description: "You have been logged out." });
      setLocation("/admin/login");
    } catch (error: any) {
      toast({ title: "Logout failed", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 flex flex-col bg-sidebar">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-sidebar-accent rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-lg">Prime7 Admin</h1>
              <p className="text-xs text-sidebar-foreground/60">Management Portal</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <div className="space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                      active
                        ? "bg-sidebar-accent text-white"
                        : "text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          {admin && (
            <div className="mb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-semibold">
                    {admin.firstName?.charAt(0) || "A"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {admin.firstName} {admin.lastName}
                  </p>
                  <p className="text-xs text-sidebar-foreground/60 truncate capitalize">{admin.role}</p>
                </div>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start gap-3 text-red-400 hover:text-red-300 hover:bg-slate-700"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
