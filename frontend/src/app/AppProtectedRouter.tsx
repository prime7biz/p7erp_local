import { Suspense, lazy, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { AppComingSoonPage } from "@/pages/app/AppComingSoonPage";
import { PlaceholderPage } from "@/pages/app/PlaceholderPage";
import { AiAssistantPage } from "@/pages/app/ai/AiAssistantPage";
import { AiAutomationPage } from "@/pages/app/ai/AiAutomationPage";
import { AiPredictionsPage } from "@/pages/app/ai/AiPredictionsPage";
import { ExportCasesPage } from "@/pages/app/commercial/ExportCasesPage";
import { ProformaInvoicesPage } from "@/pages/app/commercial/ProformaInvoicesPage";
import { BtbLcsPage } from "@/pages/app/commercial/BtbLcsPage";
import { LogisticsPage } from "@/pages/app/logistics/LogisticsPage";
import { PartiesPage } from "@/pages/app/parties/PartiesPage";
import { DocumentFlowPage } from "@/pages/app/flow/DocumentFlowPage";
import { CustomersPage } from "@/pages/app/CustomersPage";
import { CustomerCreatePage } from "@/pages/app/CustomerCreatePage";
import { CustomerDetailPage } from "@/pages/app/CustomerDetailPage";
import { CustomerEditPage } from "@/pages/app/CustomerEditPage";
import { InquiriesPage } from "@/pages/app/InquiriesPage";
import { InquiryCreatePage } from "@/pages/app/InquiryCreatePage";
import { QuotationsPage } from "@/pages/app/QuotationsPage";
import { OrdersPage } from "@/pages/app/OrdersPage";
import { InquiryDetailPage } from "@/pages/app/InquiryDetailPage";
import { QuotationDetailPage } from "@/pages/app/QuotationDetailPage";
import { OrderDetailPage } from "@/pages/app/OrderDetailPage";
import { StylesPage } from "@/pages/app/StylesPage";
import { StyleDetailPage } from "@/pages/app/StyleDetailPage";
import { BomBuilderPage } from "@/pages/app/BomBuilderPage";
import { ConsumptionPlansPage } from "@/pages/app/ConsumptionPlansPage";
import { FollowupPage } from "@/pages/app/FollowupPage";
import { MerchPipelinePage } from "@/pages/app/MerchPipelinePage";
import { MerchCriticalAlertsPage } from "@/pages/app/MerchCriticalAlertsPage";
import { ConsumptionReconciliationPage } from "@/pages/app/ConsumptionReconciliationPage";
import { InventoryItemsPage } from "@/pages/app/InventoryItemsPage";
import { UnitsPage } from "@/pages/app/UnitsPage";
import { WarehousesPage } from "@/pages/app/WarehousesPage";
import { StockGroupsPage } from "@/pages/app/StockGroupsPage";
import { PurchaseOrdersPage } from "@/pages/app/PurchaseOrdersPage";
import { GoodsReceivingPage } from "@/pages/app/GoodsReceivingPage";
import { DeliveryChallansPage } from "@/pages/app/DeliveryChallansPage";
import { EnhancedGatePassesPage } from "@/pages/app/EnhancedGatePassesPage";
import { ProcessOrdersPage } from "@/pages/app/ProcessOrdersPage";
import { ConsumptionControlPage } from "@/pages/app/ConsumptionControlPage";
import { VoucherApprovalsPage } from "@/pages/app/VoucherApprovalsPage";
import { FxReceiptsPage } from "@/pages/app/FxReceiptsPage";
import { AccountsCurrencyPage } from "@/pages/app/AccountsCurrencyPage";
import { CostCentersPage } from "@/pages/app/CostCentersPage";
import { BudgetsPage } from "@/pages/app/BudgetsPage";
import { BankAccountsPage } from "@/pages/app/BankAccountsPage";
import { VoucherPrintPage } from "@/pages/app/VoucherPrintPage";
import { AccountingPeriodsPage } from "@/pages/app/AccountingPeriodsPage";
import { PaymentAdvicePage } from "@/pages/app/PaymentAdvicePage";
import { AllApprovalsPage } from "@/pages/app/AllApprovalsPage";

const SettingsLayout = lazy(() => import("@/pages/settings/SettingsLayout").then((m) => ({ default: m.SettingsLayout })));
const UsersPage = lazy(() => import("@/pages/settings/UsersPage").then((m) => ({ default: m.UsersPage })));
const RolesPage = lazy(() => import("@/pages/settings/RolesPage").then((m) => ({ default: m.RolesPage })));
const AuditPage = lazy(() => import("@/pages/settings/AuditPage").then((m) => ({ default: m.AuditPage })));
const ChequeTemplatesPage = lazy(() =>
  import("@/pages/settings/ChequeTemplatesPage").then((m) => ({ default: m.ChequeTemplatesPage })),
);
const CurrencyManagementPage = lazy(() =>
  import("@/pages/settings/CurrencyManagementPage").then((m) => ({ default: m.CurrencyManagementPage })),
);
const PricingSettingsPage = lazy(() =>
  import("@/pages/settings/PricingSettingsPage").then((m) => ({ default: m.PricingSettingsPage })),
);
const TenantSettingsPage = lazy(() =>
  import("@/pages/settings/TenantSettingsPage").then((m) => ({ default: m.TenantSettingsPage })),
);
const ConfigurationPage = lazy(() =>
  import("@/pages/settings/ConfigurationPage").then((m) => ({ default: m.ConfigurationPage })),
);
const BackupRestorePage = lazy(() =>
  import("@/pages/settings/BackupRestorePage").then((m) => ({ default: m.BackupRestorePage })),
);
const SettingsOverviewPage = lazy(() =>
  import("@/pages/settings/SettingsOverviewPage").then((m) => ({ default: m.SettingsOverviewPage })),
);
const TutorialsPage = lazy(() => import("@/pages/app/tutorials/TutorialsPage").then((m) => ({ default: m.TutorialsPage })));
const TutorialArticlePage = lazy(() =>
  import("@/pages/app/tutorials/TutorialArticlePage").then((m) => ({ default: m.TutorialArticlePage })),
);
const StockSummaryPage = lazy(() =>
  import("@/pages/app/StockSummaryPage").then((m) => ({ default: m.StockSummaryPage })),
);
const StockLedgerPage = lazy(() =>
  import("@/pages/app/StockLedgerPage").then((m) => ({ default: m.StockLedgerPage })),
);
const ManufacturingOrdersPage = lazy(() =>
  import("@/pages/app/ManufacturingOrdersPage").then((m) => ({ default: m.ManufacturingOrdersPage })),
);
const InventoryReconciliationPage = lazy(() =>
  import("@/pages/app/InventoryReconciliationPage").then((m) => ({ default: m.InventoryReconciliationPage })),
);
const AccountGroupsPage = lazy(() =>
  import("@/pages/app/AccountGroupsPage").then((m) => ({ default: m.AccountGroupsPage })),
);
const ChartOfAccountsPage = lazy(() =>
  import("@/pages/app/ChartOfAccountsPage").then((m) => ({ default: m.ChartOfAccountsPage })),
);
const VouchersPage = lazy(() => import("@/pages/app/VouchersPage").then((m) => ({ default: m.VouchersPage })));
const CashForecastPage = lazy(() =>
  import("@/pages/app/CashForecastPage").then((m) => ({ default: m.CashForecastPage })),
);
const ProfitabilityPage = lazy(() =>
  import("@/pages/app/ProfitabilityPage").then((m) => ({ default: m.ProfitabilityPage })),
);
const OutstandingBillsPage = lazy(() =>
  import("@/pages/app/OutstandingBillsPage").then((m) => ({ default: m.OutstandingBillsPage })),
);
const BankReconciliationPage = lazy(() =>
  import("@/pages/app/BankReconciliationPage").then((m) => ({ default: m.BankReconciliationPage })),
);
const PaymentRunsPage = lazy(() =>
  import("@/pages/app/PaymentRunsPage").then((m) => ({ default: m.PaymentRunsPage })),
);
const PurchaseWorkflowPage = lazy(() =>
  import("@/pages/app/PurchaseWorkflowPage").then((m) => ({ default: m.PurchaseWorkflowPage })),
);

const ReportsOverviewPage = lazy(() => import("@/pages/app/ReportsOverviewPage").then((m) => ({ default: m.ReportsOverviewPage })));
const ReportPurchaseOrdersPage = lazy(() =>
  import("@/pages/app/reports/ReportPurchaseOrdersPage").then((m) => ({ default: m.ReportPurchaseOrdersPage })),
);
const ReportGrnPage = lazy(() => import("@/pages/app/reports/ReportGrnPage").then((m) => ({ default: m.ReportGrnPage })));
const ReportSalesOrdersPage = lazy(() =>
  import("@/pages/app/reports/ReportSalesOrdersPage").then((m) => ({ default: m.ReportSalesOrdersPage })),
);
const ReportComingSoonPage = lazy(() =>
  import("@/pages/app/reports/ReportComingSoonPage").then((m) => ({ default: m.ReportComingSoonPage })),
);
const DayBookPage = lazy(() => import("@/pages/app/DayBookPage").then((m) => ({ default: m.DayBookPage })));
const TrialBalancePage = lazy(() =>
  import("@/pages/app/TrialBalancePage").then((m) => ({ default: m.TrialBalancePage })),
);
const FinancialStatementsPage = lazy(() =>
  import("@/pages/app/FinancialStatementsPage").then((m) => ({ default: m.FinancialStatementsPage })),
);
const CashFlowReportPage = lazy(() =>
  import("@/pages/app/CashFlowReportPage").then((m) => ({ default: m.CashFlowReportPage })),
);
const RatioAnalysisPage = lazy(() =>
  import("@/pages/app/RatioAnalysisPage").then((m) => ({ default: m.RatioAnalysisPage })),
);
const GroupSummaryPage = lazy(() =>
  import("@/pages/app/GroupSummaryPage").then((m) => ({ default: m.GroupSummaryPage })),
);
const ArApAgingReportPage = lazy(() =>
  import("@/pages/app/ArApAgingReportPage").then((m) => ({ default: m.ArApAgingReportPage })),
);
const LedgerActivityPage = lazy(() =>
  import("@/pages/app/LedgerActivityPage").then((m) => ({ default: m.LedgerActivityPage })),
);
const VoucherAnalyticsPage = lazy(() =>
  import("@/pages/app/VoucherAnalyticsPage").then((m) => ({ default: m.VoucherAnalyticsPage })),
);
const HrDepartmentsPage = lazy(() => import("@/pages/app/hr/HrDepartmentsPage").then((m) => ({ default: m.HrDepartmentsPage })));
const HrDesignationsPage = lazy(() =>
  import("@/pages/app/hr/HrDesignationsPage").then((m) => ({ default: m.HrDesignationsPage })),
);
const HrEmployeesPage = lazy(() => import("@/pages/app/hr/HrEmployeesPage").then((m) => ({ default: m.HrEmployeesPage })));
const HrEmployeeDetailPage = lazy(() =>
  import("@/pages/app/hr/HrEmployeeDetailPage").then((m) => ({ default: m.HrEmployeeDetailPage })),
);
const HrShiftsPage = lazy(() => import("@/pages/app/hr/attendance/HrShiftsPage").then((m) => ({ default: m.HrShiftsPage })));
const HrRosterPage = lazy(() => import("@/pages/app/hr/attendance/HrRosterPage").then((m) => ({ default: m.HrRosterPage })));
const HrAttendanceEntryPage = lazy(() =>
  import("@/pages/app/hr/attendance/HrAttendanceEntryPage").then((m) => ({ default: m.HrAttendanceEntryPage })),
);
const HrAttendanceSummaryPage = lazy(() =>
  import("@/pages/app/hr/attendance/HrAttendanceSummaryPage").then((m) => ({ default: m.HrAttendanceSummaryPage })),
);
const HrLeaveTypesPage = lazy(() => import("@/pages/app/hr/leave/HrLeaveTypesPage").then((m) => ({ default: m.HrLeaveTypesPage })));
const HrLeaveBalancesPage = lazy(() =>
  import("@/pages/app/hr/leave/HrLeaveBalancesPage").then((m) => ({ default: m.HrLeaveBalancesPage })),
);
const HrLeaveRequestsPage = lazy(() =>
  import("@/pages/app/hr/leave/HrLeaveRequestsPage").then((m) => ({ default: m.HrLeaveRequestsPage })),
);
const HrLeaveApprovalsPage = lazy(() =>
  import("@/pages/app/hr/leave/HrLeaveApprovalsPage").then((m) => ({ default: m.HrLeaveApprovalsPage })),
);
const HrPayrollPeriodsPage = lazy(() =>
  import("@/pages/app/hr/payroll/HrPayrollPeriodsPage").then((m) => ({ default: m.HrPayrollPeriodsPage })),
);
const HrSalaryStructuresPage = lazy(() =>
  import("@/pages/app/hr/payroll/HrSalaryStructuresPage").then((m) => ({ default: m.HrSalaryStructuresPage })),
);
const HrPayrollRunsPage = lazy(() =>
  import("@/pages/app/hr/payroll/HrPayrollRunsPage").then((m) => ({ default: m.HrPayrollRunsPage })),
);
const HrPayrollApprovalsPage = lazy(() =>
  import("@/pages/app/hr/payroll/HrPayrollApprovalsPage").then((m) => ({ default: m.HrPayrollApprovalsPage })),
);
const HrPayslipsPage = lazy(() => import("@/pages/app/hr/payroll/HrPayslipsPage").then((m) => ({ default: m.HrPayslipsPage })));
const HrGoalsPage = lazy(() => import("@/pages/app/hr/performance/HrGoalsPage").then((m) => ({ default: m.HrGoalsPage })));
const HrReviewsPage = lazy(() => import("@/pages/app/hr/performance/HrReviewsPage").then((m) => ({ default: m.HrReviewsPage })));
const HrPerformanceDashboardPage = lazy(() =>
  import("@/pages/app/hr/performance/HrPerformanceDashboardPage").then((m) => ({ default: m.HrPerformanceDashboardPage })),
);
const HrJobRequisitionsPage = lazy(() =>
  import("@/pages/app/hr/recruitment/HrJobRequisitionsPage").then((m) => ({ default: m.HrJobRequisitionsPage })),
);
const HrCandidatesPage = lazy(() =>
  import("@/pages/app/hr/recruitment/HrCandidatesPage").then((m) => ({ default: m.HrCandidatesPage })),
);
const HrInterviewsPage = lazy(() =>
  import("@/pages/app/hr/recruitment/HrInterviewsPage").then((m) => ({ default: m.HrInterviewsPage })),
);
const HrOffersPage = lazy(() => import("@/pages/app/hr/recruitment/HrOffersPage").then((m) => ({ default: m.HrOffersPage })));
const HrMyProfilePage = lazy(() => import("@/pages/app/hr/ess/HrMyProfilePage").then((m) => ({ default: m.HrMyProfilePage })));
const HrMyAttendancePage = lazy(() =>
  import("@/pages/app/hr/ess/HrMyAttendancePage").then((m) => ({ default: m.HrMyAttendancePage })),
);
const HrMyLeavePage = lazy(() => import("@/pages/app/hr/ess/HrMyLeavePage").then((m) => ({ default: m.HrMyLeavePage })));
const HrMyPayslipsPage = lazy(() =>
  import("@/pages/app/hr/ess/HrMyPayslipsPage").then((m) => ({ default: m.HrMyPayslipsPage })),
);
const HrReportsDashboardPage = lazy(() =>
  import("@/pages/app/hr/HrReportsDashboardPage").then((m) => ({ default: m.HrReportsDashboardPage })),
);
const ProductionOverviewPage = lazy(() =>
  import("@/pages/app/manufacturing/ProductionOverviewPage").then((m) => ({ default: m.ProductionOverviewPage })),
);
const ProductionPlanningPage = lazy(() =>
  import("@/pages/app/manufacturing/ProductionPlanningPage").then((m) => ({ default: m.ProductionPlanningPage })),
);
const ProductionAdvancedPlanningPage = lazy(() =>
  import("@/pages/app/manufacturing/ProductionAdvancedPlanningPage").then((m) => ({ default: m.ProductionAdvancedPlanningPage })),
);
const QualityCapaPage = lazy(() =>
  import("@/pages/app/manufacturing/QualityCapaPage").then((m) => ({ default: m.QualityCapaPage })),
);
const QualityDashboardPage = lazy(() =>
  import("@/pages/app/manufacturing/QualityDashboardPage").then((m) => ({ default: m.QualityDashboardPage })),
);
const QualityInspectionsPage = lazy(() =>
  import("@/pages/app/manufacturing/QualityInspectionsPage").then((m) => ({ default: m.QualityInspectionsPage })),
);
const QualityLabTestsPage = lazy(() =>
  import("@/pages/app/manufacturing/QualityLabTestsPage").then((m) => ({ default: m.QualityLabTestsPage })),
);
const QualityReturnsPage = lazy(() =>
  import("@/pages/app/manufacturing/QualityReturnsPage").then((m) => ({ default: m.QualityReturnsPage })),
);
const ShopFloorExecutionPage = lazy(() =>
  import("@/pages/app/manufacturing/ShopFloorExecutionPage").then((m) => ({ default: m.ShopFloorExecutionPage })),
);
const ProductionIeEfficiencyPage = lazy(() =>
  import("@/pages/app/manufacturing/ProductionIeEfficiencyPage").then((m) => ({ default: m.ProductionIeEfficiencyPage })),
);
const SamplesRequestsPage = lazy(() =>
  import("@/pages/app/manufacturing/SamplesRequestsPage").then((m) => ({ default: m.SamplesRequestsPage })),
);
const TnaDashboardPage = lazy(() =>
  import("@/pages/app/manufacturing/TnaDashboardPage").then((m) => ({ default: m.TnaDashboardPage })),
);
const TnaTemplatesPage = lazy(() =>
  import("@/pages/app/manufacturing/TnaTemplatesPage").then((m) => ({ default: m.TnaTemplatesPage })),
);
const TnaPlansPage = lazy(() => import("@/pages/app/manufacturing/TnaPlansPage").then((m) => ({ default: m.TnaPlansPage })));
const TnaPlanDetailPage = lazy(() =>
  import("@/pages/app/manufacturing/TnaPlanDetailPage").then((m) => ({ default: m.TnaPlanDetailPage })),
);

export function AppProtectedRouter() {
  useEffect(() => {
    let cancelled = false;
    const idleWindow = window as Window & {
      requestIdleCallback: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback: (id: number) => void;
    };

    const prefetchTasks: Array<() => Promise<unknown>> = [
      () => import("@/pages/app/VouchersPage"),
      () => import("@/pages/app/InventoryReconciliationPage"),
      () => import("@/pages/app/BankReconciliationPage"),
      () => import("@/pages/app/PaymentRunsPage"),
      () => import("@/pages/app/ChartOfAccountsPage"),
      () => import("@/pages/app/hr/HrEmployeesPage"),
      () => import("@/pages/app/manufacturing/ProductionOverviewPage"),
    ];

    const runPrefetch = () => {
      prefetchTasks.forEach((task, index) => {
        window.setTimeout(() => {
          if (cancelled) return;
          void task();
        }, index * 550);
      });
    };

    const idleId = idleWindow.requestIdleCallback(runPrefetch, { timeout: 2500 });

    return () => {
      cancelled = true;
      idleWindow.cancelIdleCallback(idleId);
    };
  }, []);

  return (
    <Routes>
      <Route
        element={
          <Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center text-sm text-slate-500">Loading module...</div>}>
            <Layout />
          </Suspense>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="customers/new" element={<CustomerCreatePage />} />
        <Route path="customers/:id/edit" element={<CustomerEditPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="inquiries" element={<InquiriesPage />} />
        <Route path="inquiries/new" element={<InquiryCreatePage />} />
        <Route path="inquiries/:id/edit" element={<InquiryCreatePage />} />
        <Route path="inquiries/:id" element={<InquiryDetailPage />} />
        <Route path="quotations" element={<QuotationsPage />} />
        <Route path="quotations/new" element={<QuotationDetailPage />} />
        <Route path="quotations/:id" element={<QuotationDetailPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="merchandising/styles" element={<StylesPage />} />
        <Route path="merchandising/styles/:id" element={<StyleDetailPage />} />
        <Route path="bom" element={<BomBuilderPage />} />
        <Route path="bom/orders" element={<ConsumptionPlansPage />} />
        <Route path="merchandising/pipeline" element={<MerchPipelinePage />} />
        <Route path="merchandising/alerts" element={<MerchCriticalAlertsPage />} />
        <Route path="merchandising/consumption-reconciliation" element={<ConsumptionReconciliationPage />} />
        <Route path="inventory" element={<InventoryItemsPage />} />
        <Route path="inventory/items" element={<InventoryItemsPage />} />
        <Route path="inventory/categories" element={<AppComingSoonPage title="Inventory Categories" description="Manage item categories and hierarchies." />} />
        <Route path="inventory/subcategories" element={<AppComingSoonPage title="Inventory Subcategories" />} />
        <Route path="inventory/units" element={<UnitsPage />} />
        <Route path="inventory/warehouses" element={<WarehousesPage />} />
        <Route path="inventory/stock-groups" element={<StockGroupsPage />} />
        <Route path="inventory/stock-dashboard" element={<AppComingSoonPage title="Stock Dashboard" description="Overview of stock levels and movements." />} />
        <Route path="inventory/stock-valuation" element={<AppComingSoonPage title="Stock Valuation" />} />
        <Route path="inventory/stock-adjustments" element={<AppComingSoonPage title="Stock Adjustments" />} />
        <Route path="inventory/warehouse-transfers" element={<AppComingSoonPage title="Warehouse Transfers" />} />
        <Route path="inventory/lots" element={<AppComingSoonPage title="Lot Traceability" description="Track lots and batches." />} />
        <Route path="inventory/purchase-orders" element={<PurchaseOrdersPage />} />
        <Route path="inventory/goods-receiving" element={<GoodsReceivingPage />} />
        <Route path="inventory/delivery-challans" element={<DeliveryChallansPage />} />
        <Route path="inventory/enhanced-gate-passes" element={<EnhancedGatePassesPage />} />
        <Route path="inventory/process-orders" element={<ProcessOrdersPage />} />
        <Route path="inventory/manufacturing-orders" element={<ManufacturingOrdersPage />} />
        <Route path="samples" element={<PlaceholderPage title="Samples" />} />
        <Route path="samples/:id" element={<PlaceholderPage title="Sample Detail" />} />
        <Route path="samples/requests" element={<SamplesRequestsPage />} />
        <Route path="time-action" element={<AppComingSoonPage title="Time & Action" description="Use TNA Dashboard under Manufacturing for time and action plans." />} />
        <Route path="tna/dashboard" element={<TnaDashboardPage />} />
        <Route path="tna/templates" element={<TnaTemplatesPage />} />
        <Route path="tna/plans" element={<TnaPlansPage />} />
        <Route path="tna/plans/:planId" element={<TnaPlanDetailPage />} />
        <Route path="production" element={<ProductionOverviewPage />} />
        <Route path="production/planning" element={<ProductionPlanningPage />} />
        <Route path="production/advanced-planning" element={<ProductionAdvancedPlanningPage />} />
        <Route path="production/cutting" element={<ShopFloorExecutionPage />} />
        <Route path="production/sewing" element={<ShopFloorExecutionPage />} />
        <Route path="production/finishing-packing" element={<ShopFloorExecutionPage />} />
        <Route path="production/ie" element={<ProductionIeEfficiencyPage />} />
        <Route path="quality/dashboard" element={<QualityDashboardPage />} />
        <Route path="quality/inspections" element={<QualityInspectionsPage />} />
        <Route path="quality/capa" element={<QualityCapaPage />} />
        <Route path="quality/lab-tests" element={<QualityLabTestsPage />} />
        <Route path="quality/returns" element={<QualityReturnsPage />} />
        <Route path="quality/qc" element={<QualityInspectionsPage />} />
        <Route path="ai/assistant" element={<AiAssistantPage />} />
        <Route path="ai/automation" element={<AiAutomationPage />} />
        <Route path="ai/predictions" element={<AiPredictionsPage />} />
        <Route path="inventory/consumption-control" element={<ConsumptionControlPage />} />
        <Route path="inventory/reconciliation" element={<InventoryReconciliationPage />} />
        <Route path="inventory/stock-summary" element={<StockSummaryPage />} />
        <Route path="inventory/stock-ledger" element={<StockLedgerPage />} />
        <Route path="commercial" element={<PlaceholderPage title="Commercial" />} />
        <Route path="commercial/export-cases" element={<ExportCasesPage />} />
        <Route path="commercial/proforma-invoices" element={<ProformaInvoicesPage />} />
        <Route path="commercial/btb-lcs" element={<BtbLcsPage />} />
        <Route path="logistics" element={<LogisticsPage />} />
        <Route path="followup" element={<FollowupPage />} />
        <Route path="parties" element={<PartiesPage />} />
        <Route path="flow" element={<DocumentFlowPage />} />
        <Route path="reports" element={<AppComingSoonPage title="Reports" description="Merchandising, PO, GRN, Sales Orders, and more. Use the sidebar to open a specific report." />} />
        <Route path="reports/merchandising" element={<ReportsOverviewPage />} />
        <Route path="reports/purchase-orders" element={<ReportPurchaseOrdersPage />} />
        <Route path="reports/grn" element={<ReportGrnPage />} />
        <Route path="reports/sales-orders" element={<ReportSalesOrdersPage />} />
        <Route path="reports/lc-outstanding" element={<ReportComingSoonPage title="LC Outstanding" description="View LC exposure and maturity." />} />
        <Route path="reports/btb-maturity" element={<ReportComingSoonPage title="BTB LC Maturity" />} />
        <Route path="reports/production-efficiency" element={<ReportComingSoonPage title="Production Efficiency" />} />
        <Route path="reports/qc-summary" element={<ReportComingSoonPage title="QC Summary" />} />
        <Route path="reports/employee" element={<ReportComingSoonPage title="Employee Summary" />} />
        <Route path="reports/payroll" element={<ReportComingSoonPage title="Payroll Summary" />} />
        <Route path="reports/shipments" element={<ReportComingSoonPage title="Shipment Tracking" />} />
        <Route path="reports/gate-passes" element={<ReportComingSoonPage title="Gate Pass Register" />} />
        <Route path="reports/challans" element={<ReportComingSoonPage title="Delivery Challans Report" />} />
        <Route path="reports/reconciliation" element={<ReportComingSoonPage title="Data Reconciliation" />} />
        <Route path="reports/exceptions" element={<ReportComingSoonPage title="Exceptions" />} />
        <Route path="accounts/groups" element={<AccountGroupsPage />} />
        <Route path="accounts" element={<ChartOfAccountsPage />} />
        <Route path="accounts/vouchers" element={<VouchersPage />} />
        <Route path="accounts/vouchers/print" element={<VoucherPrintPage />} />
        <Route path="accounts/vouchers/approval-queue" element={<VoucherApprovalsPage />} />
        <Route path="accounts/currency" element={<AccountsCurrencyPage />} />
        <Route path="accounts/outstanding-bills" element={<OutstandingBillsPage />} />
        <Route path="accounts/cost-centers" element={<CostCentersPage />} />
        <Route path="accounts/budgets" element={<BudgetsPage />} />
        <Route path="accounts/purchase-workflow" element={<PurchaseWorkflowPage />} />
        <Route path="banking/accounts" element={<BankAccountsPage />} />
        <Route path="banking/reconciliation" element={<BankReconciliationPage />} />
        <Route path="banking/payment-runs" element={<PaymentRunsPage />} />
        <Route path="banking/payment-advice" element={<PaymentAdvicePage />} />
        <Route path="cashflow/calendar" element={<AppComingSoonPage title="Cashflow Calendar" description="Plan and view cash flow by period." />} />
        <Route path="accounts/reports/day-book" element={<DayBookPage />} />
        <Route path="accounts/reports/trial-balance" element={<TrialBalancePage />} />
        <Route path="accounts/reports/financial-statements" element={<FinancialStatementsPage />} />
        <Route path="accounts/reports/ar-ap-aging" element={<ArApAgingReportPage />} />
        <Route path="accounts/reports/ledger-activity" element={<LedgerActivityPage />} />
        <Route path="accounts/reports/voucher-analytics" element={<VoucherAnalyticsPage />} />
        <Route path="accounts/reports/group-summary" element={<GroupSummaryPage />} />
        <Route path="accounts/reports/ratio-analysis" element={<RatioAnalysisPage />} />
        <Route path="accounts/reports/cash-flow" element={<CashFlowReportPage />} />
        <Route path="accounts/accounting-periods" element={<AccountingPeriodsPage />} />
        <Route path="finance/cash-forecast" element={<CashForecastPage />} />
        <Route path="finance/fx-receipts" element={<FxReceiptsPage />} />
        <Route path="finance/style-profitability" element={<ProfitabilityPage defaultMode="style" />} />
        <Route path="finance/lc-profitability" element={<ProfitabilityPage defaultMode="lc" />} />
        <Route path="finance/costing-variance" element={<ProfitabilityPage defaultMode="variance" />} />
        <Route path="hr/departments" element={<HrDepartmentsPage />} />
        <Route path="hr/designations" element={<HrDesignationsPage />} />
        <Route path="hr/employees" element={<HrEmployeesPage />} />
        <Route path="hr/employees/:employeeId" element={<HrEmployeeDetailPage />} />
        <Route path="hr/attendance/shifts" element={<HrShiftsPage />} />
        <Route path="hr/attendance/roster" element={<HrRosterPage />} />
        <Route path="hr/attendance/entries" element={<HrAttendanceEntryPage />} />
        <Route path="hr/attendance/summary" element={<HrAttendanceSummaryPage />} />
        <Route path="hr/leave/types" element={<HrLeaveTypesPage />} />
        <Route path="hr/leave/balances" element={<HrLeaveBalancesPage />} />
        <Route path="hr/leave/requests" element={<HrLeaveRequestsPage />} />
        <Route path="hr/leave/approvals" element={<HrLeaveApprovalsPage />} />
        <Route path="hr/payroll/periods" element={<HrPayrollPeriodsPage />} />
        <Route path="hr/payroll/salary-structures" element={<HrSalaryStructuresPage />} />
        <Route path="hr/payroll/runs" element={<HrPayrollRunsPage />} />
        <Route path="hr/payroll/approvals" element={<HrPayrollApprovalsPage />} />
        <Route path="hr/payroll/payslips" element={<HrPayslipsPage />} />
        <Route path="hr/performance/goals" element={<HrGoalsPage />} />
        <Route path="hr/performance/reviews" element={<HrReviewsPage />} />
        <Route path="hr/performance/dashboard" element={<HrPerformanceDashboardPage />} />
        <Route path="hr/recruitment/requisitions" element={<HrJobRequisitionsPage />} />
        <Route path="hr/recruitment/candidates" element={<HrCandidatesPage />} />
        <Route path="hr/recruitment/interviews" element={<HrInterviewsPage />} />
        <Route path="hr/recruitment/offers" element={<HrOffersPage />} />
        <Route path="hr/ess/profile" element={<HrMyProfilePage />} />
        <Route path="hr/ess/attendance" element={<HrMyAttendancePage />} />
        <Route path="hr/ess/leave" element={<HrMyLeavePage />} />
        <Route path="hr/ess/payslips" element={<HrMyPayslipsPage />} />
        <Route path="hr/reports" element={<HrReportsDashboardPage />} />
        <Route path="approvals" element={<AllApprovalsPage />} />
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<SettingsOverviewPage />} />
          <Route path="config" element={<ConfigurationPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="currency" element={<CurrencyManagementPage />} />
          <Route path="backup" element={<BackupRestorePage />} />
          <Route path="tenant" element={<TenantSettingsPage />} />
          <Route path="pricing" element={<PricingSettingsPage />} />
          <Route path="activity-logs" element={<AuditPage />} />
          <Route path="cheque-templates" element={<ChequeTemplatesPage />} />
        </Route>
        <Route path="tutorials" element={<TutorialsPage />} />
        <Route path="tutorials/:articleId" element={<TutorialArticlePage />} />
        <Route path="*" element={<PlaceholderPage />} />
      </Route>
    </Routes>
  );
}
