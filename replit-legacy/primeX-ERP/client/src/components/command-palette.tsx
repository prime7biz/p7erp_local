import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  FileText,
  ShoppingCart,
  Globe,
  Package,
  FolderTree,
  Warehouse,
  Layers,
  ClipboardCheck,
  Factory,
  ArrowRightLeft,
  Shield,
  BarChart3,
  Activity,
  FileBarChart,
  DollarSign,
  Shirt,
  Calculator,
  Target,
  Scissors,
  Clock,
  Calendar,
  Cog,
  PackageCheck,
  Gauge,
  Truck,
  MessageSquare,
  Zap,
  UserCheck,
  Banknote,
  CreditCard,
  BookOpen,
  PieChart,
  TrendingUp,
  FileSpreadsheet,
  Wrench,
  Settings,
  UserCog,
  Pin,
  PinOff,
  Plus,
} from "lucide-react";

const navigationRoutes = [
  {
    group: "Dashboard",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
    ],
  },
  {
    group: "Sales & CRM",
    items: [
      { label: "Customers", href: "/customers", icon: Users },
      { label: "Inquiries", href: "/inquiries", icon: ClipboardList },
      { label: "Quotations", href: "/quotations", icon: FileText },
      { label: "Orders", href: "/orders", icon: ShoppingCart },
      { label: "Commercial", href: "/commercial", icon: Globe },
      { label: "All Parties", href: "/parties", icon: Users },
      { label: "Document Flow", href: "/flow", icon: TrendingUp },
    ],
  },
  {
    group: "Inventory",
    items: [
      { label: "Items & Stock", href: "/inventory", icon: Package },
      { label: "Stock Groups", href: "/inventory/stock-groups", icon: FolderTree },
      { label: "Warehouses", href: "/inventory/warehouses", icon: Warehouse },
      { label: "Units", href: "/inventory/units", icon: Layers },
      { label: "Purchase Orders", href: "/inventory/purchase-orders", icon: ShoppingCart },
      { label: "Goods Receiving", href: "/inventory/goods-receiving", icon: ClipboardCheck },
      { label: "Process Orders", href: "/inventory/process-orders", icon: Factory },
      { label: "Warehouse Transfers", href: "/inventory/warehouse-transfers", icon: ArrowRightLeft },
      { label: "Stock Adjustments", href: "/inventory/stock-adjustments/new", icon: ClipboardList },
      { label: "Consumption Control", href: "/inventory/consumption-control", icon: Shield },
      { label: "Stock Summary", href: "/inventory/stock-summary", icon: BarChart3 },
      { label: "Stock Dashboard", href: "/inventory/stock-dashboard", icon: Activity },
      { label: "Stock Ledger", href: "/inventory/stock-ledger", icon: FileBarChart },
      { label: "Stock Valuation", href: "/inventory/stock-valuation", icon: DollarSign },
    ],
  },
  {
    group: "Merchandising",
    items: [
      { label: "Garment Styles", href: "/merchandising/styles", icon: Shirt },
      { label: "BOM Builder", href: "/bom", icon: Calculator },
      { label: "Consumption Plans", href: "/bom/orders", icon: Target },
    ],
  },
  {
    group: "Manufacturing",
    items: [
      { label: "Sample Development", href: "/samples/requests", icon: Shirt },
      { label: "TNA Dashboard", href: "/tna/dashboard", icon: Clock },
      { label: "TNA Templates", href: "/tna/templates", icon: ClipboardList },
      { label: "TNA Plans", href: "/tna/plans", icon: Calendar },
      { label: "Production Overview", href: "/production", icon: Factory },
      { label: "Production Planning", href: "/production/planning", icon: ClipboardList },
      { label: "Cutting", href: "/production/cutting", icon: Scissors },
      { label: "Sewing", href: "/production/sewing", icon: Cog },
      { label: "Finishing & Packing", href: "/production/finishing-packing", icon: PackageCheck },
      { label: "IE & Efficiency", href: "/production/ie", icon: Gauge },
      { label: "Advanced Planning", href: "/production/advanced-planning", icon: Target },
      { label: "Quality Management", href: "/quality/qc", icon: Shield },
      { label: "Logistics", href: "/logistics", icon: Truck },
    ],
  },
  {
    group: "AI Tools",
    items: [
      { label: "AI Assistant", href: "/ai/assistant", icon: MessageSquare },
      { label: "AI Automation", href: "/ai/automation", icon: Zap },
    ],
  },
  {
    group: "HR",
    items: [
      { label: "Employees", href: "/hr/employees", icon: UserCheck },
      { label: "Payroll", href: "/hr/payroll", icon: Banknote },
      { label: "Performance", href: "/hr/performance", icon: Target },
      { label: "Attendance", href: "/hr/attendance", icon: Calendar },
    ],
  },
  {
    group: "Delivery & Logistics",
    items: [
      { label: "Delivery Challans", href: "/inventory/delivery-challans", icon: Truck },
      { label: "Gate Passes", href: "/inventory/enhanced-gate-passes", icon: Shield },
    ],
  },
  {
    group: "Finance",
    items: [
      { label: "Account Groups", href: "/accounts/groups", icon: FolderTree },
      { label: "Chart of Accounts", href: "/accounts", icon: DollarSign },
      { label: "Vouchers", href: "/accounts/vouchers", icon: CreditCard },
      { label: "Voucher Approvals", href: "/accounts/vouchers/approval-queue", icon: ClipboardList },
      { label: "Multi-Currency", href: "/accounts/currency", icon: Banknote },
      { label: "Outstanding Bills", href: "/accounts/outstanding-bills", icon: FileText },
      { label: "Cost Centers", href: "/accounts/cost-centers", icon: Target },
      { label: "Day Book", href: "/accounts/reports/day-book", icon: BookOpen },
      { label: "Trial Balance", href: "/accounts/reports/trial-balance", icon: FileBarChart },
      { label: "Financial Statements", href: "/accounts/reports/financial-statements", icon: BarChart3 },
      { label: "Group Summary", href: "/accounts/reports/group-summary", icon: PieChart },
      { label: "Ratio Analysis", href: "/accounts/reports/ratio-analysis", icon: Activity },
      { label: "Cash Flow", href: "/accounts/reports/cash-flow", icon: TrendingUp },
      { label: "Budget Management", href: "/accounts/budgets", icon: FileSpreadsheet },
      { label: "Purchase & AP", href: "/accounts/purchase-workflow", icon: FileText },
    ],
  },
  {
    group: "Workflow",
    items: [
      { label: "Approval Queue", href: "/approvals", icon: ClipboardCheck },
    ],
  },
  {
    group: "Reports",
    items: [
      { label: "Analytics Dashboard", href: "/reports", icon: BarChart3 },
    ],
  },
  {
    group: "System",
    items: [
      { label: "Configuration", href: "/settings/config", icon: Wrench },
      { label: "Settings", href: "/settings", icon: Settings },
      { label: "User Management", href: "/settings/users", icon: UserCog },
      { label: "Roles & Permissions", href: "/settings/roles", icon: Shield },
      { label: "Accounting Periods", href: "/settings/accounting-periods", icon: Calendar },
      { label: "Subscription", href: "/settings/pricing", icon: CreditCard },
    ],
  },
];

const createActions = [
  { label: "Create Voucher", href: "/accounts/vouchers/new", icon: Plus },
  { label: "New Item", href: "/inventory/items/new", icon: Plus },
  { label: "New Party", href: "/parties", icon: Plus },
  { label: "New Purchase Order", href: "/inventory/purchase-orders/new", icon: Plus },
  { label: "New Order", href: "/orders/new", icon: Plus },
];

function getStorageKey(prefix: string, tenantId?: number, userId?: number) {
  return `${prefix}_${tenantId || 0}_${userId || 0}`;
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}

export function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [location] = useLocation();

  const recentKey = getStorageKey("prime7_recent_routes", user?.tenantId, user?.id);
  const pinnedKey = getStorageKey("prime7_pinned_routes", user?.tenantId, user?.id);

  const [recentRoutes, setRecentRoutes] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(recentKey) || "[]"); } catch { return []; }
  });
  const [pinnedRoutes, setPinnedRoutes] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(pinnedKey) || "[]"); } catch { return []; }
  });

  useEffect(() => {
    if (!location || location === "/login" || location === "/register") return;
    setRecentRoutes(prev => {
      const next = [location, ...prev.filter(r => r !== location)].slice(0, 10);
      localStorage.setItem(recentKey, JSON.stringify(next));
      return next;
    });
  }, [location, recentKey]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setOpen, open]);

  const handleSelect = useCallback((href: string) => {
    navigate(href);
    setOpen(false);
  }, [navigate, setOpen]);

  const togglePin = useCallback((href: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedRoutes(prev => {
      let next: string[];
      if (prev.includes(href)) {
        next = prev.filter(r => r !== href);
      } else {
        if (prev.length >= 5) return prev;
        next = [...prev, href];
      }
      localStorage.setItem(pinnedKey, JSON.stringify(next));
      return next;
    });
  }, [pinnedKey]);

  const allFlat = navigationRoutes.flatMap(g => g.items);

  const findLabel = (href: string) => {
    const item = allFlat.find(i => i.href === href);
    return item?.label || href;
  };
  const findIcon = (href: string) => {
    const item = allFlat.find(i => i.href === href);
    return item?.icon || LayoutDashboard;
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search modules, actions, routes..." />
      <CommandList className="max-h-[400px]">
        <CommandEmpty>No results found.</CommandEmpty>

        {pinnedRoutes.length > 0 && (
          <CommandGroup heading="Pinned">
            {pinnedRoutes.map(href => {
              const Icon = findIcon(href);
              return (
                <CommandItem key={`pin-${href}`} value={`pinned-${findLabel(href)}`} onSelect={() => handleSelect(href)}>
                  <Icon className="mr-2 h-4 w-4" />
                  <span>{findLabel(href)}</span>
                  <button
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    onClick={(e) => togglePin(href, e)}
                  >
                    <PinOff className="h-3.5 w-3.5" />
                  </button>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {recentRoutes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent">
              {recentRoutes.slice(0, 10).map(href => {
                const Icon = findIcon(href);
                const isPinned = pinnedRoutes.includes(href);
                return (
                  <CommandItem key={`recent-${href}`} value={`recent-${findLabel(href)}`} onSelect={() => handleSelect(href)}>
                    <Icon className="mr-2 h-4 w-4" />
                    <span>{findLabel(href)}</span>
                    <button
                      className="ml-auto text-muted-foreground hover:text-foreground"
                      onClick={(e) => togglePin(href, e)}
                    >
                      {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </button>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Create">
          {createActions.map(action => (
            <CommandItem key={action.href} value={`create-${action.label}`} onSelect={() => handleSelect(action.href)}>
              <action.icon className="mr-2 h-4 w-4" />
              <span>{action.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {navigationRoutes.map(group => (
          <CommandGroup key={group.group} heading={group.group}>
            {group.items.map(item => {
              const isPinned = pinnedRoutes.includes(item.href);
              return (
                <CommandItem key={item.href} value={`${group.group}-${item.label}`} onSelect={() => handleSelect(item.href)}>
                  <item.icon className="mr-2 h-4 w-4" />
                  <span>{item.label}</span>
                  <button
                    className="ml-auto text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                    onClick={(e) => togglePin(item.href, e)}
                  >
                    {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
