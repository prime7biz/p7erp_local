import { useState, createContext, useContext, useCallback, useEffect, useMemo } from "react";
import { APP_VERSION } from "@/lib/version";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useBusinessType } from "@/hooks/useBusinessType";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  ClipboardList, 
  ShoppingCart, 
  Shirt, 
  Calculator, 
  FileText, 
  Settings, 
  TrendingUp,
  Calendar,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Factory,
  Shield,
  Truck,
  DollarSign,
  UserCheck,
  BarChart3,
  CheckSquare,
  Clock,
  Warehouse,
  UserCog,
  CreditCard,
  Target,
  FileBarChart,
  Globe,
  Banknote,
  FolderTree,
  BookOpen,
  Scissors,
  ClipboardCheck,
  Layers,
  Landmark,
  X,
  PieChart,
  FileSpreadsheet,
  Activity,
  Star,
  ArrowRightLeft,
  Wrench,
  MessageSquare,
  Zap,
  Gauge,
  PackageCheck,
  Cog,
  AlertTriangle,
  FlaskConical,
  RotateCcw,
  ShieldCheck,
  HardDrive
} from "lucide-react";
import transparentLogo from "@assets/LOGO_ERP_1772333423262.png";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export const MobileSidebarContext = createContext<{
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}>({ isOpen: false, setOpen: () => {} });

export function useMobileSidebar() {
  return useContext(MobileSidebarContext);
}

type BusinessTypeFilter = 'buying_house' | 'manufacturer' | 'both';

interface NavItem {
  icon: any;
  label: string;
  href: string;
  exact?: boolean;
  superUserOnly?: boolean;
  requiresReportAccess?: boolean;
  requiresFinancialReportAccess?: boolean;
  visibleFor?: BusinessTypeFilter[];
}

interface MenuModule {
  section: string;
  icon: any;
  directLink?: string;
  items: NavItem[];
  visibleFor?: BusinessTypeFilter[];
}

const menuModules: MenuModule[] = [
  {
    section: "Dashboard",
    icon: LayoutDashboard,
    directLink: "/",
    items: [],
  },
  {
    section: "Merchandising",
    icon: Shirt,
    items: [
      { icon: Users, label: "Customers", href: "/customers" },
      { icon: ClipboardList, label: "Inquiries", href: "/inquiries" },
      { icon: FileText, label: "Quotations", href: "/quotations" },
      { icon: ShoppingCart, label: "Orders", href: "/orders" },
      { icon: Shirt, label: "Garment Styles", href: "/merchandising/styles" },
      { icon: Calculator, label: "BOM Builder", href: "/bom" },
      { icon: Target, label: "Consumption Plans", href: "/bom/orders" },
      { icon: TrendingUp, label: "Order Pipeline", href: "/merchandising/pipeline" },
      { icon: AlertTriangle, label: "Critical Alerts", href: "/merchandising/alerts" },
      { icon: ArrowRightLeft, label: "Consumption Recon", href: "/merchandising/consumption-reconciliation" },
      { icon: Globe, label: "Commercial", href: "/commercial" },
      { icon: Activity, label: "Order Follow-up", href: "/followup" },
      { icon: Users, label: "Parties", href: "/parties" },
      { icon: TrendingUp, label: "Document Flow", href: "/flow" },
    ],
  },
  {
    section: "Export & Import",
    icon: Globe,
    items: [
      { icon: Globe, label: "Export Cases", href: "/commercial/export-cases" },
      { icon: FileText, label: "Proforma Invoices", href: "/commercial/proforma-invoices" },
      { icon: ArrowRightLeft, label: "BTB LCs", href: "/commercial/btb-lcs" },
      { icon: Truck, label: "Logistics", href: "/logistics" },
    ],
  },
  {
    section: "Inventory",
    icon: Package,
    items: [
      { icon: Package, label: "Items & Stock", href: "/inventory" },
      { icon: FolderTree, label: "Stock Groups", href: "/inventory/stock-groups" },
      { icon: Warehouse, label: "Warehouses", href: "/inventory/warehouses" },
      { icon: Layers, label: "Units", href: "/inventory/units" },
      { icon: ShoppingCart, label: "Purchase Orders", href: "/inventory/purchase-orders" },
      { icon: ClipboardCheck, label: "Goods Receiving", href: "/inventory/goods-receiving" },
      { icon: Factory, label: "Process Orders", href: "/inventory/process-orders" },
      { icon: ArrowRightLeft, label: "Transfers", href: "/inventory/warehouse-transfers" },
      { icon: ClipboardList, label: "Adjustments", href: "/inventory/stock-adjustments/new" },
      { icon: Shield, label: "Consumption Control", href: "/inventory/consumption-control" },
      { icon: BarChart3, label: "Stock Summary", href: "/inventory/stock-summary" },
      { icon: Activity, label: "Dashboard", href: "/inventory/stock-dashboard" },
      { icon: FileBarChart, label: "Ledger", href: "/inventory/stock-ledger" },
      { icon: DollarSign, label: "Valuation", href: "/inventory/stock-valuation" },
      { icon: Package, label: "Lot Traceability", href: "/inventory/lots" },
      { icon: Truck, label: "Delivery Challans", href: "/inventory/delivery-challans" },
      { icon: Shield, label: "Gate Passes", href: "/inventory/enhanced-gate-passes" },
    ],
  },
  {
    section: "Manufacturing",
    icon: Factory,
    visibleFor: ['manufacturer', 'both'],
    items: [
      { icon: Shirt, label: "Samples", href: "/samples/requests" },
      { icon: Clock, label: "TNA Dashboard", href: "/tna/dashboard" },
      { icon: ClipboardList, label: "TNA Templates", href: "/tna/templates" },
      { icon: Calendar, label: "TNA Plans", href: "/tna/plans" },
      { icon: Factory, label: "Production Overview", href: "/production", visibleFor: ['manufacturer', 'both'] },
      { icon: ClipboardList, label: "Planning", href: "/production/planning", visibleFor: ['manufacturer', 'both'] },
      { icon: Scissors, label: "Cutting", href: "/production/cutting", visibleFor: ['manufacturer', 'both'] },
      { icon: Cog, label: "Sewing", href: "/production/sewing", visibleFor: ['manufacturer', 'both'] },
      { icon: PackageCheck, label: "Finishing", href: "/production/finishing-packing", visibleFor: ['manufacturer', 'both'] },
      { icon: Gauge, label: "IE & Efficiency", href: "/production/ie", visibleFor: ['manufacturer', 'both'] },
      { icon: Target, label: "Advanced Planning", href: "/production/advanced-planning", visibleFor: ['manufacturer', 'both'] },
    ],
  },
  {
    section: "Quality",
    icon: ShieldCheck,
    items: [
      { icon: BarChart3, label: "QC Dashboard", href: "/quality/dashboard" },
      { icon: ClipboardCheck, label: "Inspections", href: "/quality/inspections" },
      { icon: FlaskConical, label: "Lab Tests", href: "/quality/lab-tests" },
      { icon: AlertTriangle, label: "CAPA", href: "/quality/capa" },
      { icon: RotateCcw, label: "Returns", href: "/quality/returns" },
      { icon: CheckSquare, label: "Quality (Legacy)", href: "/quality/qc" },
    ],
  },
  {
    section: "AI Tools",
    icon: MessageSquare,
    items: [
      { icon: MessageSquare, label: "AI Assistant", href: "/ai/assistant" },
      { icon: Zap, label: "AI Automation", href: "/ai/automation" },
      { icon: Activity, label: "AI Predictions", href: "/ai/predictions" },
    ],
  },
  {
    section: "HR",
    icon: UserCheck,
    items: [
      { icon: UserCheck, label: "Employees", href: "/hr/employees" },
      { icon: Banknote, label: "Payroll", href: "/hr/payroll" },
      { icon: Target, label: "Performance", href: "/hr/performance" },
      { icon: Calendar, label: "Attendance", href: "/hr/attendance" },
    ],
  },
  {
    section: "Finance",
    icon: DollarSign,
    items: [
      { icon: FolderTree, label: "Account Groups", href: "/accounts/groups" },
      { icon: DollarSign, label: "Chart of Accounts", href: "/accounts" },
      { icon: CreditCard, label: "Vouchers", href: "/accounts/vouchers" },
      { icon: ClipboardList, label: "Voucher Approvals", href: "/accounts/vouchers/approval-queue" },
      { icon: Banknote, label: "Multi-Currency", href: "/accounts/currency" },
      { icon: FileText, label: "Bills", href: "/accounts/outstanding-bills" },
      { icon: Target, label: "Cost Centers", href: "/accounts/cost-centers" },
      { icon: BookOpen, label: "Day Book", href: "/accounts/reports/day-book", requiresFinancialReportAccess: true },
      { icon: FileBarChart, label: "Trial Balance", href: "/accounts/reports/trial-balance", requiresFinancialReportAccess: true },
      { icon: BarChart3, label: "Financial Statements", href: "/accounts/reports/financial-statements", requiresFinancialReportAccess: true },
      { icon: PieChart, label: "Group Summary", href: "/accounts/reports/group-summary", requiresFinancialReportAccess: true },
      { icon: Activity, label: "Ratio Analysis", href: "/accounts/reports/ratio-analysis", requiresFinancialReportAccess: true },
      { icon: TrendingUp, label: "Cash Flow", href: "/accounts/reports/cash-flow", requiresFinancialReportAccess: true },
      { icon: FileSpreadsheet, label: "Budgets", href: "/accounts/budgets" },
      { icon: FileText, label: "Purchase & AP", href: "/accounts/purchase-workflow" },
      { icon: Banknote, label: "FX Receipts", href: "/finance/fx-receipts" },
      { icon: TrendingUp, label: "Cash Forecast", href: "/finance/cash-forecast" },
      { icon: Target, label: "Style Profitability", href: "/finance/style-profitability" },
      { icon: Globe, label: "LC Profitability", href: "/finance/lc-profitability" },
      { icon: BarChart3, label: "Costing Variance", href: "/finance/costing-variance" },
      { icon: Landmark, label: "Bank Accounts", href: "/banking/accounts" },
      { icon: ArrowRightLeft, label: "Bank Reconciliation", href: "/banking/reconciliation" },
      { icon: CreditCard, label: "Payment Runs", href: "/banking/payment-runs" },
      { icon: Calendar, label: "Cashflow Calendar", href: "/cashflow/calendar", requiresReportAccess: true },
    ],
  },
  {
    section: "Workflow",
    icon: ClipboardCheck,
    items: [
      { icon: ClipboardCheck, label: "All Approvals", href: "/approvals" },
    ],
  },
  {
    section: "Reports",
    icon: BarChart3,
    items: [
      { icon: BarChart3, label: "Analytics", href: "/reports", requiresReportAccess: true },
      { icon: ShoppingCart, label: "Purchase Orders", href: "/reports/purchase-orders", requiresReportAccess: true },
      { icon: PackageCheck, label: "GRN Summary", href: "/reports/grn", requiresReportAccess: true },
      { icon: FileText, label: "Sales Orders", href: "/reports/sales-orders", requiresReportAccess: true },
      { icon: Landmark, label: "LC Outstanding", href: "/reports/lc-outstanding", requiresReportAccess: true },
      { icon: Banknote, label: "BTB LC Maturity", href: "/reports/btb-maturity", requiresReportAccess: true },
      { icon: Factory, label: "Production Efficiency", href: "/reports/production-efficiency", requiresReportAccess: true },
      { icon: CheckSquare, label: "QC Summary", href: "/reports/qc-summary", requiresReportAccess: true },
      { icon: Users, label: "Employee Summary", href: "/reports/employee", requiresReportAccess: true },
      { icon: DollarSign, label: "Payroll Summary", href: "/reports/payroll", requiresReportAccess: true },
      { icon: Truck, label: "Shipment Tracking", href: "/reports/shipments", requiresReportAccess: true },
      { icon: ClipboardList, label: "Gate Pass Register", href: "/reports/gate-passes", requiresReportAccess: true },
      { icon: FileSpreadsheet, label: "Delivery Challans", href: "/reports/challans", requiresReportAccess: true },
      { icon: ArrowRightLeft, label: "Data Reconciliation", href: "/reports/reconciliation", requiresReportAccess: true },
      { icon: AlertTriangle, label: "Exceptions", href: "/reports/exceptions", requiresReportAccess: true },
    ],
  },
  {
    section: "System",
    icon: Settings,
    items: [
      { icon: Wrench, label: "Configuration", href: "/settings/config" },
      { icon: Settings, label: "Settings", href: "/settings" },
      { icon: UserCog, label: "User Mgmt", href: "/settings/users", superUserOnly: true },
      { icon: Shield, label: "Roles", href: "/settings/roles", superUserOnly: true },
      { icon: Calendar, label: "Accounting Periods", href: "/settings/accounting-periods", superUserOnly: true },
      { icon: CreditCard, label: "Subscription", href: "/settings/pricing", superUserOnly: true },
      { icon: Activity, label: "Activity Logs", href: "/settings/activity-logs", superUserOnly: true },
      { icon: HardDrive, label: "Backup & Restore", href: "/settings/backup" },
      { icon: CreditCard, label: "Cheque Templates", href: "/settings/cheque-templates" },
    ],
  },
];

const allItems = menuModules.flatMap(s => s.items);


function getCollapseKey(tenantId?: number, userId?: number) {
  return `prime7_sidebar_collapsed_${tenantId || 0}_${userId || 0}`;
}

export function Sidebar() {
  const [location] = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user } = useAuth();
  const { canAccessReports, canAccessFinancialReports } = usePermissions();
  const { businessType } = useBusinessType();
  const { toast } = useToast();
  const { isOpen: isMobileOpen, setOpen: setMobileOpen } = useMobileSidebar();

  const { data: alertData } = useQuery<{ success: boolean; data: { summary: { total: number } } }>({
    queryKey: ["/api/merch/critical-alerts"],
    refetchInterval: 120000,
    enabled: !!user,
  });
  const alertCount = alertData?.data?.summary?.total || 0;

  const collapseStorageKey = getCollapseKey(user?.tenantId, user?.id);

  const filteredModules = useMemo(() => {
    const isVisible = (filter?: BusinessTypeFilter[]) => {
      if (!filter || filter.length === 0) return true;
      if (businessType === 'both') return true;
      return filter.includes(businessType);
    };
    return menuModules
      .filter(mod => isVisible(mod.visibleFor))
      .map(mod => ({
        ...mod,
        items: mod.items.filter(item => isVisible(item.visibleFor)),
      }));
  }, [businessType]);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(collapseStorageKey);
      if (stored) return JSON.parse(stored);
    } catch {}
    const defaults: Record<string, boolean> = {};
    menuModules.forEach(m => { defaults[m.section] = false; });
    return defaults;
  });

  useEffect(() => {
    try {
      localStorage.setItem(collapseStorageKey, JSON.stringify(expandedSections));
    } catch {}
  }, [expandedSections, collapseStorageKey]);

  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('prime7_sidebar_favorites') || '[]');
    } catch { return []; }
  });

  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => {
      const next: Record<string, boolean> = {};
      Object.keys(prev).forEach(k => { next[k] = false; });
      next[section] = !prev[section];
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((href: string) => {
    setFavorites(prev => {
      const next = prev.includes(href) ? prev.filter(f => f !== href) : [...prev, href];
      localStorage.setItem('prime7_sidebar_favorites', JSON.stringify(next));
      return next;
    });
  }, []);

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

  const isActive = (href: string, exact = false) => {
    if (exact) return location === href;
    return location.startsWith(href) && href !== "/";
  };

  const isSectionActive = (mod: MenuModule) => {
    if (mod.directLink) return location === mod.directLink;
    return mod.items.some(item => isActive(item.href, item.exact));
  };

  const handleNavClick = () => {
    setMobileOpen(false);
  };

  const showLabel = !isCollapsed || isMobileOpen;

  const renderNavItem = (item: NavItem, showStar: boolean) => {
    if (item.superUserOnly && !user?.isSuperUser) return null;
    if (item.requiresReportAccess && !canAccessReports()) return null;
    if (item.requiresFinancialReportAccess && !canAccessFinancialReports()) return null;
    const active = isActive(item.href, item.exact);
    const isFav = favorites.includes(item.href);
    return (
      <div key={item.href} className="group relative flex items-center">
        <Link href={item.href} className="flex-1">
          <Button
            variant="ghost"
            onClick={handleNavClick}
            className={`w-full justify-start gap-2.5 h-8 rounded-md text-[13px] ${
              showLabel ? "px-3 pl-9" : "px-2"
            } ${
              active
                ? "border-l-[3px] border-l-primary bg-primary/10 text-primary font-medium hover:bg-primary/15 rounded-l-none"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <item.icon className={`h-4 w-4 shrink-0 ${!showLabel ? "mx-auto" : ""}`} />
            {showLabel && <span className="truncate">{item.label}</span>}
            {showLabel && item.href === "/merchandising/alerts" && alertCount > 0 && (
              <Badge className="ml-auto h-5 min-w-[20px] px-1.5 text-[10px] bg-red-500 text-white border-0 rounded-full">
                {alertCount > 99 ? "99+" : alertCount}
              </Badge>
            )}
          </Button>
        </Link>
        {showLabel && showStar && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleFavorite(item.href); }}
            className={`absolute right-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
              isFav ? "opacity-100 text-primary hover:text-primary/80" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <Star className={`h-3 w-3 ${isFav ? "fill-current" : ""}`} />
          </button>
        )}
      </div>
    );
  };

  const favoriteItems = allItems.filter(item => favorites.includes(item.href));

  const sidebarContent = (
    <div className={`flex flex-col h-screen bg-white border-r border-gray-200 transition-all duration-300 ${
      isCollapsed && !isMobileOpen ? "w-16" : "w-60"
    }`}>
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        {(!isCollapsed || isMobileOpen) && (
          <div className="flex items-center">
            <img src={transparentLogo} alt="Prime7 ERP" className="h-8 w-auto" />
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => isMobileOpen ? setMobileOpen(false) : setIsCollapsed(!isCollapsed)}
          className="p-1 h-7 w-7 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        >
          {isMobileOpen ? <X className="h-4 w-4" /> : isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {(!isCollapsed || isMobileOpen) && user && (
        <div className="px-3 py-2 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
              <span className="text-primary font-semibold text-sm">
                {user.firstName?.charAt(0) || user.username?.charAt(0) || "U"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user.firstName ? `${user.firstName} ${user.lastName || ''}` : user.username}
              </p>
              <p className="text-xs text-gray-500 truncate">{user.tenant?.name}</p>
            </div>
          </div>
          {user.subscription && (
            <Badge variant="outline" className="mt-1.5 text-[10px] bg-primary/10 text-primary border-primary/20">
              {user.subscription.planName}
            </Badge>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto py-2 px-2">
        <div className="space-y-0.5">
          {showLabel && favoriteItems.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <Star className="h-3 w-3 text-primary fill-primary" />
                <span>Favorites</span>
              </div>
              <div className="space-y-0.5">
                {favoriteItems.map(item => renderNavItem(item, true))}
              </div>
              <Separator className="my-2" />
            </div>
          )}

          {filteredModules.map((mod) => {
            if (mod.directLink) {
              const active = location === mod.directLink;
              return (
                <Link key={mod.section} href={mod.directLink}>
                  <Button
                    variant="ghost"
                    onClick={handleNavClick}
                    className={`w-full justify-start gap-2.5 h-9 rounded-md text-sm ${
                      showLabel ? "px-3" : "px-2"
                    } ${
                      active
                        ? "border-l-[3px] border-l-primary bg-primary/10 text-primary font-medium hover:bg-primary/15 rounded-l-none"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    <mod.icon className={`h-4 w-4 shrink-0 ${!showLabel ? "mx-auto" : ""}`} />
                    {showLabel && <span className="font-medium">{mod.section}</span>}
                  </Button>
                </Link>
              );
            }

            const sectionActive = isSectionActive(mod);
            const isExpanded = expandedSections[mod.section];
            const visibleItems = mod.items.filter(item => {
              if (item.superUserOnly && !user?.isSuperUser) return false;
              if (item.requiresReportAccess && !canAccessReports()) return false;
              if (item.requiresFinancialReportAccess && !canAccessFinancialReports()) return false;
              return true;
            });

            return (
              <div key={mod.section}>
                <button
                  onClick={() => toggleSection(mod.section)}
                  className={`flex items-center w-full gap-2.5 h-9 rounded-md text-sm transition-colors ${
                    showLabel ? "px-3" : "px-2 justify-center"
                  } ${
                    sectionActive
                      ? "text-primary font-medium"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <mod.icon className={`h-4 w-4 shrink-0 ${!showLabel ? "mx-auto" : ""}`} />
                  {showLabel && (
                    <>
                      <span className="flex-1 text-left font-medium truncate">{mod.section}</span>
                      <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-0" : "-rotate-90"}`} />
                    </>
                  )}
                </button>
                {showLabel && (
                  <div className={`overflow-hidden transition-all duration-200 ${
                    isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                  }`}>
                    <div className="space-y-0.5 py-0.5">
                      {visibleItems.map(item => renderNavItem(item, true))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="p-2 border-t border-gray-200 space-y-0.5">
        <Link href="/tutorials">
          <Button
            variant="ghost"
            onClick={handleNavClick}
            className={`w-full justify-start gap-2.5 h-8 text-sm ${
              (!isCollapsed || isMobileOpen) ? "px-3" : "px-2"
            } ${
              location.startsWith("/tutorials")
                ? "border-l-[3px] border-l-primary bg-primary/10 text-primary font-medium hover:bg-primary/15 rounded-l-none"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            <BookOpen className={`h-4 w-4 ${(isCollapsed && !isMobileOpen) ? "mx-auto" : ""}`} />
            {(!isCollapsed || isMobileOpen) && <span>Help & Tutorials</span>}
          </Button>
        </Link>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className={`w-full justify-start gap-2.5 text-red-500 hover:text-red-600 hover:bg-red-50 h-8 text-sm ${
            (!isCollapsed || isMobileOpen) ? "px-3" : "px-2"
          }`}
        >
          <LogOut className={`h-4 w-4 ${(isCollapsed && !isMobileOpen) ? "mx-auto" : ""}`} />
          {(!isCollapsed || isMobileOpen) && <span>Logout</span>}
        </Button>
        {(!isCollapsed || isMobileOpen) && (
          <div className="text-[10px] text-gray-400 text-center mt-1">
            v{APP_VERSION}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden md:flex">
        {sidebarContent}
      </div>

      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
