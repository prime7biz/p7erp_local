import { Switch, Route, useLocation, Router, Link } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { useNotificationStream } from "@/hooks/useNotificationStream";
import { Sidebar, MobileSidebarContext } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/topnav";
import { CommandPalette, useCommandPalette } from "@/components/command-palette";
import { Skeleton } from "@/components/ui/skeleton";
import { lazy, Suspense, useState, useEffect } from "react";
import { LayoutDashboard, PlusCircle, Search } from "lucide-react";

import Dashboard from "@/pages/dashboard";
import Login from "@/pages/auth/login";
import Register from "@/pages/auth/register";
import ForgotPassword from "@/pages/auth/forgot-password";
import VerifyEmail from "@/pages/auth/verify-email";
import ResetPassword from "@/pages/auth/reset-password";
import NotFound from "@/pages/not-found";
import CalendarTasks from "@/pages/calendar-tasks";
import CustomersPage from "@/pages/customers-new";
import InquiriesPage from "@/pages/inquiries";
import MyTasksPage from "@/pages/my-tasks";

const InquiryViewPage = lazy(() => import("@/pages/inquiries/[id]"));

const QuotationsPage = lazy(() => import("@/pages/quotations/quotations"));
const QuotationForm = lazy(() => import("@/pages/quotations/quotation-form"));
const QuotationView = lazy(() => import("@/pages/quotations/quotation-view"));
const ConvertQuotationToOrder = lazy(() => import("@/pages/quotations/convert-to-order"));

const OrdersPage = lazy(() => import("@/pages/orders/orders"));
const OrderForm = lazy(() => import("@/pages/orders/order-form"));
const OrderView = lazy(() => import("@/pages/orders/order-view"));

const CommercialPage = lazy(() => import("@/pages/commercial/index"));
const ShipmentDetailPage = lazy(() => import("@/pages/commercial/shipment-detail"));

const InventoryItems = lazy(() => import("@/pages/inventory/items"));
const InventoryCategories = lazy(() => import("@/pages/inventory/categories"));
const InventorySubcategories = lazy(() => import("@/pages/inventory/subcategories"));
const InventoryWarehouses = lazy(() => import("@/pages/inventory/warehouses"));
const InventoryUnits = lazy(() => import("@/pages/inventory/units"));
const InventoryTransactions = lazy(() => import("@/pages/inventory/transactions"));
const InventoryGatePasses = lazy(() => import("@/pages/inventory/gatepasses"));
const InventoryItemNew = lazy(() => import("@/pages/inventory/item-new"));
const InventoryCategoryNew = lazy(() => import("@/pages/inventory/category-new"));
const InventorySubcategoryNew = lazy(() => import("@/pages/inventory/subcategory-new"));
const InventoryPurchaseOrders = lazy(() => import("@/pages/inventory/purchase-orders"));
const InventoryPurchaseOrderForm = lazy(() => import("@/pages/inventory/purchase-order-form"));
const GoodsReceiving = lazy(() => import("@/pages/inventory/goods-receiving"));
const GRNForm = lazy(() => import("@/pages/inventory/grn-form"));
const ManufacturingOrders = lazy(() => import("@/pages/inventory/manufacturing-orders"));
const ManufacturingOrderForm = lazy(() => import("@/pages/inventory/manufacturing-order-form"));
const DeliveryChallans = lazy(() => import("@/pages/inventory/delivery-challans"));
const DeliveryChallanForm = lazy(() => import("@/pages/inventory/delivery-challan-form"));
const DeliveryChallanPrint = lazy(() => import("@/pages/inventory/delivery-challan-print"));
const EnhancedGatePasses = lazy(() => import("@/pages/inventory/enhanced-gate-passes"));
const EnhancedGatePassForm = lazy(() => import("@/pages/inventory/enhanced-gate-pass-form"));
const EnhancedGatePassPrint = lazy(() => import("@/pages/inventory/enhanced-gate-pass-print"));

const StockDashboard = lazy(() => import("@/pages/inventory/stock-dashboard"));
const StockLedgerPage = lazy(() => import("@/pages/inventory/stock-ledger-page"));
const StockAdjustmentForm = lazy(() => import("@/pages/inventory/stock-adjustment-form"));
const StockValuationReport = lazy(() => import("@/pages/inventory/stock-valuation-report"));
const StockGroupsPage = lazy(() => import("@/pages/inventory/stock-groups"));
const ProcessOrdersPage = lazy(() => import("@/pages/inventory/process-orders"));
const ProcessOrderFormPage = lazy(() => import("@/pages/inventory/process-order-form"));
const ConsumptionControlPage = lazy(() => import("@/pages/inventory/consumption-control"));
const WarehouseTransfersPage = lazy(() => import("@/pages/inventory/warehouse-transfers"));
const StockSummaryPage = lazy(() => import("@/pages/inventory/stock-summary"));
const LotTraceabilityPage = lazy(() => import("@/pages/inventory/lot-traceability"));

const MerchStylesPage = lazy(() => import("@/pages/merchandising/styles"));
const MerchStyleDetailPage = lazy(() => import("@/pages/merchandising/style-detail"));
const OrderPipelinePage = lazy(() => import("@/pages/merchandising/order-pipeline"));
const MerchQuotationDetailPage = lazy(() => import("@/pages/quotations/quotation-detail"));
const BomBuilderPage = lazy(() => import("@/pages/merchandising/bom-builder"));
const ConsumptionPlanPage = lazy(() => import("@/pages/merchandising/consumption-plan"));
const BomListPage = lazy(() => import("@/pages/merchandising/bom-list"));
const ConsumptionListPage = lazy(() => import("@/pages/merchandising/consumption-list"));
const CriticalAlertsPage = lazy(() => import("@/pages/merchandising/critical-alerts"));
const ConsumptionReconciliationPage = lazy(() => import("@/pages/merchandising/consumption-reconciliation"));

const SamplesPage = lazy(() => import("@/pages/samples/index"));
const SampleNew = lazy(() => import("@/pages/samples/new"));
const SampleDetail = lazy(() => import("@/pages/samples/[id]"));
const SampleRequestsPage = lazy(() => import("@/pages/samples/sample-requests"));
const SampleRequestDetailPage = lazy(() => import("@/pages/samples/sample-request-detail"));

const PartyDashboard = lazy(() => import("@/pages/parties/party-dashboard"));
const PartyDetail = lazy(() => import("@/pages/parties/party-detail"));

const DocumentFlowDashboard = lazy(() => import("@/pages/flow/document-flow-dashboard"));

const TimeActionPage = lazy(() => import("@/pages/time-action/index"));
const TnaDashboardPage = lazy(() => import("@/pages/tna/dashboard"));
const TnaTemplatesPage = lazy(() => import("@/pages/tna/templates"));
const TnaPlansPage = lazy(() => import("@/pages/tna/plans"));
const TnaPlanDetailPage = lazy(() => import("@/pages/tna/plan-detail"));

const AIAutomationPage = lazy(() => import("@/pages/ai/automation"));
const AIAssistantPage = lazy(() => import("@/pages/ai/assistant"));
const AIPredictionsPage = lazy(() => import("@/pages/ai/predictions"));

const OrderFollowupPage = lazy(() => import("@/pages/followup/index"));
const ExportCasesPage = lazy(() => import("@/pages/commercial/export-cases"));
const ExportCaseDetailPage = lazy(() => import("@/pages/commercial/export-case-detail"));
const ProformaInvoicesPage = lazy(() => import("@/pages/commercial/proforma-invoices"));
const PiDetailPage = lazy(() => import("@/pages/commercial/pi-detail"));
const BtbLcsPage = lazy(() => import("@/pages/commercial/btb-lcs"));
const BtbLcDetailPage = lazy(() => import("@/pages/commercial/btb-lc-detail"));
const FxReceiptsPage = lazy(() => import("@/pages/finance/fx-receipts"));
const FxSettlementPage = lazy(() => import("@/pages/finance/fx-settlement"));
const StyleProfitabilityPage = lazy(() => import("@/pages/finance/style-profitability"));
const LcProfitabilityPage = lazy(() => import("@/pages/finance/lc-profitability"));
const CostingVariancePage = lazy(() => import("@/pages/finance/costing-variance"));
const CashForecastPage = lazy(() => import("@/pages/finance/cash-forecast"));

const ProductionPage = lazy(() => import("@/pages/production/index"));
const ProductionPlanningPage = lazy(() => import("@/pages/production/planning"));
const CuttingPage = lazy(() => import("@/pages/production/cutting"));
const SewingPage = lazy(() => import("@/pages/production/sewing"));
const FinishingPackingPage = lazy(() => import("@/pages/production/finishing-packing"));
const IEEfficiencyPage = lazy(() => import("@/pages/production/ie-efficiency"));
const AdvancedPlanningPage = lazy(() => import("@/pages/production/advanced-planning"));
const QCManagementPage = lazy(() => import("@/pages/quality/qc-management"));
const QualityPage = lazy(() => import("@/pages/quality/index"));
const QCDashboardPage = lazy(() => import("@/pages/quality/qc-dashboard"));
const QCInspectionsPage = lazy(() => import("@/pages/quality/qc-inspections"));
const LabTestsPage = lazy(() => import("@/pages/quality/lab-tests"));
const CapaPage = lazy(() => import("@/pages/quality/capa-page"));
const ReturnsPage = lazy(() => import("@/pages/quality/returns-page"));
const LogisticsPage = lazy(() => import("@/pages/logistics/index"));

const HRDashboard = lazy(() => import("@/pages/hr/index"));
const PayrollPage = lazy(() => import("@/pages/hr/payroll"));

const AccountGroupsPage = lazy(() => import("@/pages/accounts/account-groups"));
const ChartOfAccounts = lazy(() => import("@/pages/accounts/chart-of-accounts"));
const AccountingDashboard = lazy(() => import("@/pages/accounts/dashboard"));
const VouchersPage = lazy(() => import("@/pages/accounts/vouchers/vouchers"));
const ApprovalQueuePage = lazy(() => import("@/pages/accounts/vouchers/approval-queue"));
const VoucherViewPage = lazy(() => import("@/pages/accounts/vouchers/voucher-view"));
const VoucherFormPage = lazy(() => import("@/pages/accounts/vouchers/voucher-form"));
const VoucherPrintPage = lazy(() => import("@/pages/accounts/vouchers/voucher-print"));
const CurrencyPage = lazy(() => import("@/pages/accounts/currency"));
const JournalsPage = lazy(() => import("@/pages/accounts/journals"));
const DayBookPage = lazy(() => import("@/pages/accounts/reports/day-book"));
const TrialBalancePage = lazy(() => import("@/pages/accounts/reports/trial-balance"));
const LedgerReportPage = lazy(() => import("@/pages/accounts/reports/ledger-report"));
const FinancialStatementsPage = lazy(() => import("@/pages/accounts/reports/financial-statements"));
const ArApAgingPage = lazy(() => import("@/pages/accounts/reports/ar-ap-aging"));
const OutstandingBillsPage = lazy(() => import("@/pages/accounts/outstanding-bills"));
const GroupSummaryPage = lazy(() => import("@/pages/accounts/reports/group-summary"));
const RatioAnalysisPage = lazy(() => import("@/pages/accounts/reports/ratio-analysis"));
const CashFlowPage = lazy(() => import("@/pages/accounts/reports/cash-flow"));

const BudgetListPage = lazy(() => import("@/pages/accounts/budgets/budget-list"));
const BudgetEntryPage = lazy(() => import("@/pages/accounts/budgets/budget-entry"));
const BudgetVsActualPage = lazy(() => import("@/pages/accounts/budgets/budget-vs-actual"));

const CostCenterDashboard = lazy(() => import("@/pages/accounts/cost-center-dashboard"));
const JobCostSheet = lazy(() => import("@/pages/accounts/job-cost-sheet"));
const PurchaseWorkflowPage = lazy(() => import("@/pages/accounts/purchase-workflow"));

const ReportsPage = lazy(() => import("@/pages/reports/index"));
const ReportDetailPage = lazy(() => import("@/pages/reports/[id]"));
const ReportNewPage = lazy(() => import("@/pages/reports/new/index"));
const ReportTemplateDetailPage = lazy(() => import("@/pages/reports/templates/[id]"));
const ReconciliationReportsPage = lazy(() => import("@/pages/reports/reconciliation-reports"));
const ExceptionsPage = lazy(() => import("@/pages/reports/exceptions-page"));
const CashflowCalendarPage = lazy(() => import("@/pages/reports/cashflow-calendar"));
const PurchaseOrderReportPage = lazy(() => import("@/pages/reports/purchase-order-report"));
const GRNReportPage = lazy(() => import("@/pages/reports/grn-report"));
const SalesOrderReportPage = lazy(() => import("@/pages/reports/sales-order-report"));
const LCOutstandingReportPage = lazy(() => import("@/pages/reports/lc-outstanding-report"));
const BTBMaturityReportPage = lazy(() => import("@/pages/reports/btb-maturity-report"));
const ProductionEfficiencyReportPage = lazy(() => import("@/pages/reports/production-efficiency-report"));
const QCSummaryReportPage = lazy(() => import("@/pages/reports/qc-summary-report"));
const EmployeeReportPage = lazy(() => import("@/pages/reports/employee-report"));
const PayrollReportPage = lazy(() => import("@/pages/reports/payroll-report"));
const ShipmentReportPage = lazy(() => import("@/pages/reports/shipment-report"));
const GatePassReportPage = lazy(() => import("@/pages/reports/gate-pass-report"));
const ChallanReportPage = lazy(() => import("@/pages/reports/challan-report"));

const SettingsPage = lazy(() => import("@/pages/settings/index"));
const UserManagement = lazy(() => import("@/pages/settings/user-management"));
const RolePermissions = lazy(() => import("@/pages/settings/role-permissions"));
const TenantSettings = lazy(() => import("@/pages/settings/tenant-settings"));
const CurrencyManagement = lazy(() => import("@/pages/settings/currency-management"));
const DepartmentManagement = lazy(() => import("@/pages/settings/department-management"));
const AccountingPeriods = lazy(() => import("@/pages/settings/accounting-periods"));
const PricingPage = lazy(() => import("@/pages/settings/pricing"));
const ConfigPage = lazy(() => import("@/pages/settings/config"));
const BackupPage = lazy(() => import("@/pages/settings/backup"));
const ChequeTemplatesPage = lazy(() => import("@/pages/settings/cheque-templates"));
const ActivityLogsPage = lazy(() => import("@/pages/settings/activity-logs"));

const ChequePrintPage = lazy(() => import("@/pages/accounts/vouchers/cheque-print"));

const ApprovalQueue = lazy(() => import("@/pages/approvals/approval-queue"));

const BankAccountsPage = lazy(() => import("@/pages/banking/bank-accounts"));
const BankReconciliationPage = lazy(() => import("@/pages/banking/bank-reconciliation"));
const PaymentRunsPage = lazy(() => import("@/pages/banking/payment-runs"));

const TutorialsPage = lazy(() => import("@/pages/tutorials/index"));

function PageLoader() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-24 ml-auto" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function MobileBottomBar() {
  const [location] = useLocation();
  const items = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: PlusCircle, label: "Create", href: "/accounts/vouchers/new" },
    { icon: Search, label: "Search", href: "/reports" },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white border-t border-gray-200 px-2 py-1.5 flex items-center justify-around">
      {items.map((item) => {
        const active = item.href === "/" ? location === "/" : location.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href}>
            <button className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-[11px] ${active ? "text-primary" : "text-gray-500"}`}>
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </button>
          </Link>
        );
      })}
    </div>
  );
}

function useNoIndex() {
  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    meta.content = "noindex, nofollow";
    return () => {
      if (meta && meta.parentNode) meta.remove();
    };
  }, []);
}

function AuthenticatedApp() {
  useSessionGuard();
  useNoIndex();
  useNotificationStream(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { open: commandPaletteOpen, setOpen: setCommandPaletteOpen } = useCommandPalette();

  return (
    <MobileSidebarContext.Provider value={{ isOpen: mobileSidebarOpen, setOpen: setMobileSidebarOpen }}>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TopNav onOpenCommandPalette={() => setCommandPaletteOpen(true)} />
          <CommandPalette open={commandPaletteOpen} setOpen={setCommandPaletteOpen} />
          <div className="flex-1 overflow-auto pb-14 md:pb-0">
          <Suspense fallback={<PageLoader />}>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/my-tasks" component={MyTasksPage} />
              <Route path="/login">{() => { window.location.replace("/app"); return null; }}</Route>
              <Route path="/auth/login">{() => { window.location.replace("/app"); return null; }}</Route>
              <Route path="/register">{() => { window.location.replace("/app"); return null; }}</Route>
              <Route path="/auth/register">{() => { window.location.replace("/app"); return null; }}</Route>
              <Route path="/calendar-tasks" component={CalendarTasks} />

              {/* Sales & CRM */}
              <Route path="/customers" component={CustomersPage} />
              <Route path="/inquiries/:id">{(params) => <InquiryViewPage />}</Route>
              <Route path="/inquiries" component={InquiriesPage} />
              <Route path="/quotations/new">{() => <QuotationForm />}</Route>
              <Route path="/quotations/convert/:id">{() => <ConvertQuotationToOrder />}</Route>
              <Route path="/quotations/:id/edit">{() => <QuotationForm />}</Route>
              <Route path="/quotations/:id">{() => <QuotationView />}</Route>
              <Route path="/quotations" component={QuotationsPage} />
              <Route path="/orders/new">{() => <OrderForm />}</Route>
              <Route path="/orders/:id/edit">{() => <OrderForm />}</Route>
              <Route path="/orders/:id">{() => <OrderView />}</Route>
              <Route path="/orders">{() => <OrdersPage />}</Route>
              <Route path="/commercial/export-cases/:id">{() => <ExportCaseDetailPage />}</Route>
              <Route path="/commercial/export-cases" component={ExportCasesPage} />
              <Route path="/commercial/proforma-invoices/:id">{() => <PiDetailPage />}</Route>
              <Route path="/commercial/proforma-invoices" component={ProformaInvoicesPage} />
              <Route path="/commercial/btb-lcs/:id">{() => <BtbLcDetailPage />}</Route>
              <Route path="/commercial/btb-lcs" component={BtbLcsPage} />
              <Route path="/commercial/shipments/:id">{() => <ShipmentDetailPage />}</Route>
              <Route path="/commercial" component={CommercialPage} />

              {/* Document Flow */}
              <Route path="/flow" component={DocumentFlowDashboard} />

              {/* Party Master */}
              <Route path="/parties/:id">{() => <PartyDetail />}</Route>
              <Route path="/parties" component={PartyDashboard} />

              {/* Manufacturing - Inventory */}
              <Route path="/inventory/items/new">{() => <InventoryItemNew />}</Route>
              <Route path="/inventory/items" component={InventoryItems} />
              <Route path="/inventory/categories/new">{() => <InventoryCategoryNew />}</Route>
              <Route path="/inventory/categories" component={InventoryCategories} />
              <Route path="/inventory/subcategories/new">{() => <InventorySubcategoryNew />}</Route>
              <Route path="/inventory/subcategories" component={InventorySubcategories} />
              <Route path="/inventory/warehouses" component={InventoryWarehouses} />
              <Route path="/inventory/units" component={InventoryUnits} />
              <Route path="/inventory/transactions" component={InventoryTransactions} />
              <Route path="/inventory/gatepasses" component={InventoryGatePasses} />
              <Route path="/inventory/purchase-orders/new">{() => <InventoryPurchaseOrderForm />}</Route>
              <Route path="/inventory/purchase-orders/:id/edit">{() => <InventoryPurchaseOrderForm />}</Route>
              <Route path="/inventory/purchase-orders/:id">{() => <InventoryPurchaseOrderForm />}</Route>
              <Route path="/inventory/purchase-orders" component={InventoryPurchaseOrders} />
              <Route path="/inventory/goods-receiving/new">{() => <GRNForm />}</Route>
              <Route path="/inventory/goods-receiving/:id/edit">{() => <GRNForm />}</Route>
              <Route path="/inventory/goods-receiving/:id">{() => <GRNForm />}</Route>
              <Route path="/inventory/goods-receiving" component={GoodsReceiving} />
              <Route path="/inventory/manufacturing-orders/new">{() => <ManufacturingOrderForm />}</Route>
              <Route path="/inventory/manufacturing-orders/:id">{() => <ManufacturingOrderForm />}</Route>
              <Route path="/inventory/manufacturing-orders" component={ManufacturingOrders} />
              <Route path="/inventory/delivery-challans/new">{() => <DeliveryChallanForm />}</Route>
              <Route path="/inventory/delivery-challans/:id/print">{() => <DeliveryChallanPrint />}</Route>
              <Route path="/inventory/delivery-challans/:id">{() => <DeliveryChallanForm />}</Route>
              <Route path="/inventory/delivery-challans" component={DeliveryChallans} />
              <Route path="/inventory/enhanced-gate-passes/new">{() => <EnhancedGatePassForm />}</Route>
              <Route path="/inventory/enhanced-gate-passes/:id/print">{() => <EnhancedGatePassPrint />}</Route>
              <Route path="/inventory/enhanced-gate-passes/:id">{() => <EnhancedGatePassForm />}</Route>
              <Route path="/inventory/enhanced-gate-passes" component={EnhancedGatePasses} />
              <Route path="/inventory/stock-dashboard">{() => <StockDashboard />}</Route>
              <Route path="/inventory/stock-valuation">{() => <StockValuationReport />}</Route>
              <Route path="/inventory/stock-ledger">{() => <StockLedgerPage />}</Route>
              <Route path="/inventory/stock-adjustments/new">{() => <StockAdjustmentForm />}</Route>
              <Route path="/inventory/stock-adjustments/:id">{() => <StockAdjustmentForm />}</Route>
              <Route path="/inventory/stock-groups" component={StockGroupsPage} />
              <Route path="/inventory/process-orders/new">{() => <ProcessOrderFormPage />}</Route>
              <Route path="/inventory/process-orders/:id">{() => <ProcessOrderFormPage />}</Route>
              <Route path="/inventory/process-orders" component={ProcessOrdersPage} />
              <Route path="/inventory/consumption-control" component={ConsumptionControlPage} />
              <Route path="/inventory/warehouse-transfers" component={WarehouseTransfersPage} />
              <Route path="/inventory/stock-summary" component={StockSummaryPage} />
              <Route path="/inventory/lots" component={LotTraceabilityPage} />
              <Route path="/inventory" component={InventoryItems} />

              {/* Merchandising */}
              <Route path="/merchandising/pipeline" component={OrderPipelinePage} />
              <Route path="/merchandising/styles/:id">{() => <MerchStyleDetailPage />}</Route>
              <Route path="/merchandising/styles" component={MerchStylesPage} />
              <Route path="/merchandising/quotation/:id">{() => <MerchQuotationDetailPage />}</Route>
              <Route path="/merchandising/alerts" component={CriticalAlertsPage} />
              <Route path="/bom/styles/:styleId">{() => <BomBuilderPage />}</Route>
              <Route path="/bom/orders/:orderId/consumption">{() => <ConsumptionPlanPage />}</Route>
              <Route path="/bom/orders" component={ConsumptionListPage} />
              <Route path="/bom" component={BomListPage} />
              <Route path="/merchandising/consumption-reconciliation" component={ConsumptionReconciliationPage} />

              {/* Manufacturing - Others */}
              <Route path="/samples/requests/new">{() => <SampleNew />}</Route>
              <Route path="/samples/requests/:id">{() => <SampleRequestDetailPage />}</Route>
              <Route path="/samples/requests" component={SampleRequestsPage} />
              <Route path="/samples/new">{() => <SampleNew />}</Route>
              <Route path="/samples/:id">{() => <SampleDetail />}</Route>
              <Route path="/samples" component={SamplesPage} />
              <Route path="/time-action" component={TimeActionPage} />
              <Route path="/tna/dashboard" component={TnaDashboardPage} />
              <Route path="/tna/templates" component={TnaTemplatesPage} />
              <Route path="/tna/plans/:id">{() => <TnaPlanDetailPage />}</Route>
              <Route path="/tna/plans" component={TnaPlansPage} />
              <Route path="/ai/predictions" component={AIPredictionsPage} />
              <Route path="/ai/automation" component={AIAutomationPage} />
              <Route path="/ai/assistant" component={AIAssistantPage} />
              <Route path="/production/planning" component={ProductionPlanningPage} />
              <Route path="/production/cutting" component={CuttingPage} />
              <Route path="/production/sewing" component={SewingPage} />
              <Route path="/production/finishing-packing" component={FinishingPackingPage} />
              <Route path="/production/ie" component={IEEfficiencyPage} />
              <Route path="/production/advanced-planning" component={AdvancedPlanningPage} />
              <Route path="/production" component={ProductionPage} />
              <Route path="/quality/qc" component={QCManagementPage} />
              <Route path="/quality/dashboard" component={QCDashboardPage} />
              <Route path="/quality/inspections" component={QCInspectionsPage} />
              <Route path="/quality/lab-tests" component={LabTestsPage} />
              <Route path="/quality/capa" component={CapaPage} />
              <Route path="/quality/returns" component={ReturnsPage} />
              <Route path="/quality" component={QualityPage} />
              <Route path="/logistics" component={LogisticsPage} />

              {/* Human Resources */}
              <Route path="/hr/employees" component={HRDashboard} />
              <Route path="/hr/payroll" component={PayrollPage} />
              <Route path="/hr/performance" component={HRDashboard} />
              <Route path="/hr/attendance" component={HRDashboard} />
              <Route path="/hr" component={HRDashboard} />

              {/* Approval Queue */}
              <Route path="/approvals" component={ApprovalQueue} />

              {/* Finance & Accounting */}
              <Route path="/accounts/vouchers/approval-queue" component={ApprovalQueuePage} />
              <Route path="/accounts/vouchers/new">{() => <VoucherFormPage />}</Route>
              <Route path="/accounts/vouchers/edit/:id">{() => <VoucherFormPage />}</Route>
              <Route path="/accounts/vouchers/cheque-print/:id">{() => <ChequePrintPage />}</Route>
              <Route path="/accounts/vouchers/print/:id">{() => <VoucherPrintPage />}</Route>
              <Route path="/accounts/vouchers/view/:id">{() => <VoucherViewPage />}</Route>
              <Route path="/accounts/groups" component={AccountGroupsPage} />
              <Route path="/accounts/vouchers" component={VouchersPage} />
              <Route path="/accounts/currency" component={CurrencyPage} />
              <Route path="/accounts/journals" component={JournalsPage} />
              <Route path="/accounts/reports/day-book" component={DayBookPage} />
              <Route path="/accounts/reports/trial-balance" component={TrialBalancePage} />
              <Route path="/accounts/reports/ledger/:accountId">{() => <LedgerReportPage />}</Route>
              <Route path="/accounts/reports/ledger" component={LedgerReportPage} />
              <Route path="/accounts/reports/financial-statements" component={FinancialStatementsPage} />
              <Route path="/accounts/outstanding-bills" component={OutstandingBillsPage} />
              <Route path="/accounts/reports/ar-ap-aging" component={ArApAgingPage} />
              <Route path="/accounts/reports/group-summary" component={GroupSummaryPage} />
              <Route path="/accounts/reports/ratio-analysis" component={RatioAnalysisPage} />
              <Route path="/accounts/reports/cash-flow" component={CashFlowPage} />
              <Route path="/accounts/reports" component={AccountingDashboard} />
              <Route path="/accounts/budgets/:id/vs-actual">{() => <BudgetVsActualPage />}</Route>
              <Route path="/accounts/budgets/:id">{() => <BudgetEntryPage />}</Route>
              <Route path="/accounts/budgets" component={BudgetListPage} />
              <Route path="/accounts/cost-centers/:id">{() => <JobCostSheet />}</Route>
              <Route path="/accounts/cost-centers" component={CostCenterDashboard} />
              <Route path="/accounts/purchase-workflow" component={PurchaseWorkflowPage} />
              <Route path="/accounts" component={ChartOfAccounts} />

              {/* Order Follow-up */}
              <Route path="/followup" component={OrderFollowupPage} />

              {/* Finance - Export & FX */}
              <Route path="/finance/fx-settlement/:receiptId">{() => <FxSettlementPage />}</Route>
              <Route path="/finance/fx-receipts" component={FxReceiptsPage} />
              <Route path="/finance/style-profitability" component={StyleProfitabilityPage} />
              <Route path="/finance/lc-profitability" component={LcProfitabilityPage} />
              <Route path="/finance/costing-variance" component={CostingVariancePage} />
              <Route path="/finance/cash-forecast" component={CashForecastPage} />

              {/* Business Intelligence */}
              <Route path="/reports/purchase-orders" component={PurchaseOrderReportPage} />
              <Route path="/reports/grn" component={GRNReportPage} />
              <Route path="/reports/sales-orders" component={SalesOrderReportPage} />
              <Route path="/reports/lc-outstanding" component={LCOutstandingReportPage} />
              <Route path="/reports/btb-maturity" component={BTBMaturityReportPage} />
              <Route path="/reports/production-efficiency" component={ProductionEfficiencyReportPage} />
              <Route path="/reports/qc-summary" component={QCSummaryReportPage} />
              <Route path="/reports/employee" component={EmployeeReportPage} />
              <Route path="/reports/payroll" component={PayrollReportPage} />
              <Route path="/reports/shipments" component={ShipmentReportPage} />
              <Route path="/reports/gate-passes" component={GatePassReportPage} />
              <Route path="/reports/challans" component={ChallanReportPage} />
              <Route path="/reports/reconciliation" component={ReconciliationReportsPage} />
              <Route path="/reports/exceptions" component={ExceptionsPage} />
              <Route path="/reports/new" component={ReportNewPage} />
              <Route path="/reports/templates/:id">{() => <ReportTemplateDetailPage />}</Route>
              <Route path="/reports/:id">{() => <ReportDetailPage />}</Route>
              <Route path="/cashflow/calendar" component={CashflowCalendarPage} />
              <Route path="/reports" component={ReportsPage} />

              {/* System Settings */}
              <Route path="/settings/users" component={UserManagement} />
              <Route path="/settings/roles" component={RolePermissions} />
              <Route path="/settings/tenant" component={TenantSettings} />
              <Route path="/settings/currency" component={CurrencyManagement} />
              <Route path="/settings/departments" component={DepartmentManagement} />
              <Route path="/settings/accounting-periods" component={AccountingPeriods} />
              <Route path="/settings/pricing" component={PricingPage} />
              <Route path="/settings/config" component={ConfigPage} />
              <Route path="/settings/activity-logs" component={ActivityLogsPage} />
              <Route path="/settings/backup" component={BackupPage} />
              <Route path="/settings/cheque-templates" component={ChequeTemplatesPage} />
              <Route path="/settings" component={SettingsPage} />

              {/* Banking */}
              <Route path="/banking/accounts" component={BankAccountsPage} />
              <Route path="/banking/reconciliation" component={BankReconciliationPage} />
              <Route path="/banking/payment-runs" component={PaymentRunsPage} />

              {/* Tutorials */}
              <Route path="/tutorials/:articleId" component={TutorialsPage} />
              <Route path="/tutorials" component={TutorialsPage} />

              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </div>
      </div>
      <MobileBottomBar />
    </div>
    </MobileSidebarContext.Provider>
  );
}


function UnauthenticatedApp() {
  return (
    <div className="min-h-screen">
      <Switch>
        <Route path="/auth/register" component={Register} />
        <Route path="/auth/login" component={Login} />
        <Route path="/auth/forgot-password" component={ForgotPassword} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/register" component={Register} />
        <Route path="/login" component={Login} />
        <Route path="*" component={Login} />
      </Switch>
    </div>
  );
}

function AppArea() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <div className="hidden md:block w-60 bg-white border-r border-gray-200 p-4 space-y-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="space-y-2 pt-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-8 w-full rounded-md" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-6 space-y-6">
          <Skeleton className="h-10 w-full max-w-md" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Router base="/app">
        {isAuthenticated ? <AuthenticatedApp /> : <UnauthenticatedApp />}
      </Router>
      <Toaster />
    </TooltipProvider>
  );
}

export default AppArea;
