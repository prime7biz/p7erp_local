import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { AppComingSoonPage } from "@/pages/app/AppComingSoonPage";
import { PlaceholderPage } from "@/pages/app/PlaceholderPage";
import { AiAssistantPage } from "@/pages/app/ai/AiAssistantPage";
import { AiAutomationPage } from "@/pages/app/ai/AiAutomationPage";
import { AiPredictionsPage } from "@/pages/app/ai/AiPredictionsPage";
import { AiWeeklyReportsPage } from "@/pages/app/ai/AiWeeklyReportsPage";
import { CommercialPage } from "@/pages/app/commercial/CommercialPage";
import { ExportCasesPage } from "@/pages/app/commercial/ExportCasesPage";
import { ProformaInvoicesPage } from "@/pages/app/commercial/ProformaInvoicesPage";
import { BtbLcsPage } from "@/pages/app/commercial/BtbLcsPage";
import { MasterContractsPage } from "@/pages/app/commercial/MasterContractsPage";
import { TradeFeatureRouteGuard } from "@/components/TradeFeatureRouteGuard";
import { LogisticsPage } from "@/pages/app/logistics/LogisticsPage";
import { TradeCasesPage } from "@/pages/app/trade/TradeCasesPage";
import { TradeCaseDetailPage } from "@/pages/app/trade/TradeCaseDetailPage";
import { TradeDashboardPage } from "@/pages/app/trade/TradeDashboardPage";
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
import { OrderCreatePage } from "@/pages/app/OrderCreatePage";
import { InquiryDetailPage } from "@/pages/app/InquiryDetailPage";
import { QuotationDetailPage } from "@/pages/app/QuotationDetailPage";
import { OrderDetailPage } from "@/pages/app/OrderDetailPage";
import { StylesPage } from "@/pages/app/StylesPage";
import { StyleDetailPage } from "@/pages/app/StyleDetailPage";
import { BomBuilderPage } from "@/pages/app/BomBuilderPage";
import { ConsumptionPlansPage } from "@/pages/app/ConsumptionPlansPage";
import { FollowupPage } from "@/pages/app/FollowupPage";
import { MerchPipelinePage } from "@/pages/app/MerchPipelinePage";
import { PipelineAnalyticsPage } from "@/pages/app/PipelineAnalyticsPage";
import { MerchCriticalAlertsPage } from "@/pages/app/MerchCriticalAlertsPage";
import { ConsumptionReconciliationPage } from "@/pages/app/ConsumptionReconciliationPage";
import { WastageReportPage } from "@/pages/app/WastageReportPage";
import { InventoryItemsPage } from "@/pages/app/InventoryItemsPage";
import { VendorsPage } from "@/pages/app/VendorsPage";
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
import { VoucherDetailPage } from "@/pages/app/VoucherDetailPage";
import { AccountingPeriodsPage } from "@/pages/app/AccountingPeriodsPage";
import { PaymentAdvicePage } from "@/pages/app/PaymentAdvicePage";
import { AllApprovalsPage } from "@/pages/app/AllApprovalsPage";
import { QuotationPrintPage } from "@/pages/print/QuotationPrintPage";
import { CustomerPrintPage } from "@/pages/print/CustomerPrintPage";
import { InquiryPrintPage } from "@/pages/print/InquiryPrintPage";
import { OrderPrintPage } from "@/pages/print/OrderPrintPage";
import { StylePrintPage } from "@/pages/print/StylePrintPage";
import { ProformaInvoicePrintPage } from "@/pages/print/ProformaInvoicePrintPage";
import { ProformaInvoiceFormPage } from "@/pages/app/commercial/ProformaInvoiceFormPage";

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
const StockInventorySummaryPage = lazy(() =>
  import("@/pages/app/StockInventorySummaryPage").then((m) => ({ default: m.StockInventorySummaryPage })),
);
const StockDashboardPage = lazy(() =>
  import("@/pages/app/StockDashboardPage").then((m) => ({ default: m.StockDashboardPage })),
);
const StockValuationPage = lazy(() =>
  import("@/pages/app/StockValuationPage").then((m) => ({ default: m.StockValuationPage })),
);
const StockLedgerPage = lazy(() =>
  import("@/pages/app/StockLedgerPage").then((m) => ({ default: m.StockLedgerPage })),
);
const WarehouseTransfersPage = lazy(() =>
  import("@/pages/app/WarehouseTransfersPage").then((m) => ({ default: m.WarehouseTransfersPage })),
);
const StockAdjustmentsPage = lazy(() =>
  import("@/pages/app/StockAdjustmentsPage").then((m) => ({ default: m.StockAdjustmentsPage })),
);
const ManufacturingOrdersPage = lazy(() =>
  import("@/pages/app/ManufacturingOrdersPage").then((m) => ({ default: m.ManufacturingOrdersPage })),
);
const InventoryReconciliationPage = lazy(() =>
  import("@/pages/app/InventoryReconciliationPage").then((m) => ({ default: m.InventoryReconciliationPage })),
);
const AdvanceOptionsPage = lazy(() =>
  import("@/pages/app/AdvanceOptionsPage").then((m) => ({ default: m.AdvanceOptionsPage })),
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
const SettlementAuditPage = lazy(() =>
  import("@/pages/app/SettlementAuditPage").then((m) => ({ default: m.SettlementAuditPage })),
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
const ReportStyle360Page = lazy(() =>
  import("@/pages/app/reports/ReportStyle360Page").then((m) => ({ default: m.ReportStyle360Page })),
);
const ReportsHubPage = lazy(() => import("@/pages/app/reports/ReportsHubPage").then((m) => ({ default: m.ReportsHubPage })));
const ReportLcOutstandingPage = lazy(() =>
  import("@/pages/app/reports/ReportLcOutstandingPage").then((m) => ({ default: m.ReportLcOutstandingPage })),
);
const ReportBtbMaturityPage = lazy(() =>
  import("@/pages/app/reports/ReportBtbMaturityPage").then((m) => ({ default: m.ReportBtbMaturityPage })),
);
const ReportShipmentsPage = lazy(() =>
  import("@/pages/app/reports/ReportShipmentsPage").then((m) => ({ default: m.ReportShipmentsPage })),
);
const ReportTradeOverviewPage = lazy(() =>
  import("@/pages/app/reports/ReportTradeOverviewPage").then((m) => ({ default: m.ReportTradeOverviewPage })),
);
const ReportProductionEfficiencyPage = lazy(() =>
  import("@/pages/app/reports/ReportProductionEfficiencyPage").then((m) => ({ default: m.ReportProductionEfficiencyPage })),
);
const ReportQcSummaryPage = lazy(() =>
  import("@/pages/app/reports/ReportQcSummaryPage").then((m) => ({ default: m.ReportQcSummaryPage })),
);
const ReportEmployeeSummaryPage = lazy(() =>
  import("@/pages/app/reports/ReportEmployeeSummaryPage").then((m) => ({ default: m.ReportEmployeeSummaryPage })),
);
const ReportPayrollSummaryPage = lazy(() =>
  import("@/pages/app/reports/ReportPayrollSummaryPage").then((m) => ({ default: m.ReportPayrollSummaryPage })),
);
const ReportReconciliationPage = lazy(() =>
  import("@/pages/app/reports/ReportReconciliationPage").then((m) => ({ default: m.ReportReconciliationPage })),
);
const ReportExceptionsPage = lazy(() =>
  import("@/pages/app/reports/ReportExceptionsPage").then((m) => ({ default: m.ReportExceptionsPage })),
);
const ReportGatePassesPage = lazy(() =>
  import("@/pages/app/reports/ReportGatePassesPage").then((m) => ({ default: m.ReportGatePassesPage })),
);
const ReportChallansPage = lazy(() =>
  import("@/pages/app/reports/ReportChallansPage").then((m) => ({ default: m.ReportChallansPage })),
);
const CashflowCalendarPage = lazy(() =>
  import("@/pages/app/CashflowCalendarPage").then((m) => ({ default: m.CashflowCalendarPage })),
);
const LotTraceabilityPage = lazy(() =>
  import("@/pages/app/LotTraceabilityPage").then((m) => ({ default: m.LotTraceabilityPage })),
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
const HrRegularizationsPage = lazy(() =>
  import("@/pages/app/hr/attendance/HrRegularizationsPage").then((m) => ({ default: m.HrRegularizationsPage })),
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
const HrDashboardPage = lazy(() => import("@/pages/app/hr/HrDashboardPage").then((m) => ({ default: m.HrDashboardPage })));
const HrSectionsPage = lazy(() => import("@/pages/app/hr/HrSectionsPage").then((m) => ({ default: m.HrSectionsPage })));
const HrAttendanceHolidaysPage = lazy(() =>
  import("@/pages/app/hr/attendance/HrAttendanceHolidaysPage").then((m) => ({ default: m.HrAttendanceHolidaysPage })),
);
const HrOvertimeRulesPage = lazy(() =>
  import("@/pages/app/hr/attendance/HrOvertimeRulesPage").then((m) => ({ default: m.HrOvertimeRulesPage })),
);
const HrOvertimePage = lazy(() => import("@/pages/app/hr/attendance/HrOvertimePage").then((m) => ({ default: m.HrOvertimePage })));
const HrLeavePoliciesPage = lazy(() =>
  import("@/pages/app/hr/leave/HrLeavePoliciesPage").then((m) => ({ default: m.HrLeavePoliciesPage })),
);
const HrLeaveCalendarPage = lazy(() =>
  import("@/pages/app/hr/leave/HrLeaveCalendarPage").then((m) => ({ default: m.HrLeaveCalendarPage })),
);
const HrPayrollComponentsPage = lazy(() =>
  import("@/pages/app/hr/payroll/HrPayrollComponentsPage").then((m) => ({ default: m.HrPayrollComponentsPage })),
);
const HrPayrollAdvancesPage = lazy(() =>
  import("@/pages/app/hr/payroll/HrPayrollAdvancesPage").then((m) => ({ default: m.HrPayrollAdvancesPage })),
);
const HrPayrollBonusesPage = lazy(() =>
  import("@/pages/app/hr/payroll/HrPayrollBonusesPage").then((m) => ({ default: m.HrPayrollBonusesPage })),
);
const HrPayrollAccountingConfigPage = lazy(() =>
  import("@/pages/app/hr/payroll/HrPayrollAccountingConfigPage").then((m) => ({ default: m.HrPayrollAccountingConfigPage })),
);
const HrPerformanceCyclesPage = lazy(() =>
  import("@/pages/app/hr/performance/HrPerformanceCyclesPage").then((m) => ({ default: m.HrPerformanceCyclesPage })),
);
const HrEssTicketsPage = lazy(() => import("@/pages/app/hr/ess/HrEssTicketsPage").then((m) => ({ default: m.HrEssTicketsPage })));
const SupportTicketsPage = lazy(() =>
  import("@/pages/app/support/SupportTicketsPage").then((m) => ({ default: m.SupportTicketsPage })),
);
const SupportNewTicketPage = lazy(() =>
  import("@/pages/app/support/SupportNewTicketPage").then((m) => ({ default: m.SupportNewTicketPage })),
);
const SupportTicketDetailPage = lazy(() =>
  import("@/pages/app/support/SupportTicketDetailPage").then((m) => ({ default: m.SupportTicketDetailPage })),
);
const HrCompliancePage = lazy(() => import("@/pages/app/hr/HrCompliancePage").then((m) => ({ default: m.HrCompliancePage })));
const GarmentProductionOverviewPage = lazy(() =>
  import("@/pages/app/production/GarmentProductionOverviewPage").then((m) => ({ default: m.GarmentProductionOverviewPage })),
);
const ProductionQualityPage = lazy(() =>
  import("@/pages/app/production/ProductionQualityPage").then((m) => ({ default: m.ProductionQualityPage })),
);
const CrewRosterWeeklyPage = lazy(() =>
  import("@/pages/app/production/CrewRosterWeeklyPage").then((m) => ({ default: m.CrewRosterWeeklyPage })),
);
const ProductionPlanningPage = lazy(() =>
  import("@/pages/app/manufacturing/ProductionPlanningPage").then((m) => ({ default: m.ProductionPlanningPage })),
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
const ProductionSetupPage = lazy(() =>
  import("@/pages/app/production/ProductionSetupPage").then((m) => ({ default: m.ProductionSetupPage })),
);
const ProductionLinePlanPage = lazy(() =>
  import("@/pages/app/production/ProductionLinePlanPage").then((m) => ({ default: m.ProductionLinePlanPage })),
);
const ProductionFactoryCalendarPage = lazy(() =>
  import("@/pages/app/production/ProductionFactoryCalendarPage").then((m) => ({ default: m.ProductionFactoryCalendarPage })),
);
const ProductionIeOperationsPage = lazy(() =>
  import("@/pages/app/production/ProductionIeOperationsPage").then((m) => ({ default: m.ProductionIeOperationsPage })),
);
const ProductionOperationBulletinsPage = lazy(() =>
  import("@/pages/app/production/ProductionOperationBulletinsPage").then((m) => ({ default: m.ProductionOperationBulletinsPage })),
);
const ProductionLineBalancePage = lazy(() =>
  import("@/pages/app/production/ProductionLineBalancePage").then((m) => ({ default: m.ProductionLineBalancePage })),
);
const HourlyProductionPage = lazy(() =>
  import("@/pages/app/production/HourlyProductionPage").then((m) => ({ default: m.HourlyProductionPage })),
);
const ProductionCostsPage = lazy(() =>
  import("@/pages/app/production/ProductionCostsPage").then((m) => ({ default: m.ProductionCostsPage })),
);
const DailyCrewSheetPage = lazy(() =>
  import("@/pages/app/production/DailyCrewSheetPage").then((m) => ({ default: m.DailyCrewSheetPage })),
);
const ProductionCuttingPage = lazy(() =>
  import("@/pages/app/production/ProductionCuttingPage").then((m) => ({ default: m.ProductionCuttingPage })),
);
const ProductionKnittingPage = lazy(() =>
  import("@/pages/app/production/ProductionKnittingPage").then((m) => ({ default: m.ProductionKnittingPage })),
);
const ProductionDyeingPage = lazy(() =>
  import("@/pages/app/production/ProductionDyeingPage").then((m) => ({ default: m.ProductionDyeingPage })),
);
const DepartmentProductionPage = lazy(() =>
  import("@/pages/app/production/DepartmentProductionPage").then((m) => ({ default: m.DepartmentProductionPage })),
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
      () => import("@/pages/app/production/GarmentProductionOverviewPage"),
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
      <Route path="quotations/:id/print" element={<QuotationPrintPage />} />
      <Route path="customers/:id/print" element={<CustomerPrintPage />} />
        <Route path="inquiries/:id/print" element={<InquiryPrintPage />} />
        <Route path="orders/:id/print" element={<OrderPrintPage />} />
        <Route path="merchandising/styles/:id/print" element={<StylePrintPage />} />
        <Route path="commercial/proforma-invoices/:id/print" element={<ProformaInvoicePrintPage />} />
      <Route
        element={
          <Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center text-sm text-text-muted">Loading module...</div>}>
            <Layout />
          </Suspense>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="support/tickets" element={<SupportTicketsPage />} />
        <Route path="support/tickets/new" element={<SupportNewTicketPage />} />
        <Route path="support/tickets/:id" element={<SupportTicketDetailPage />} />
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
        <Route path="orders/new" element={<OrderCreatePage />} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="merchandising/styles" element={<StylesPage />} />
        <Route path="merchandising/styles/:id" element={<StyleDetailPage />} />
        <Route path="bom" element={<BomBuilderPage />} />
        <Route path="bom/orders" element={<ConsumptionPlansPage />} />
        <Route path="merchandising/pipeline" element={<MerchPipelinePage />} />
        <Route path="merchandising/pipeline-analytics" element={<PipelineAnalyticsPage />} />
        <Route path="merchandising/alerts" element={<MerchCriticalAlertsPage />} />
        <Route path="merchandising/wastage-report" element={<WastageReportPage />} />
        <Route path="merchandising/consumption-reconciliation" element={<ConsumptionReconciliationPage />} />
        <Route path="inventory" element={<InventoryItemsPage />} />
        <Route path="inventory/items" element={<InventoryItemsPage />} />
        <Route path="inventory/categories" element={<Navigate to="/app/inventory?tab=masters" replace />} />
        <Route path="inventory/subcategories" element={<Navigate to="/app/inventory?tab=masters" replace />} />
        <Route path="inventory/units" element={<Navigate to="/app/inventory" replace />} />
        <Route path="inventory/vendors" element={<VendorsPage />} />
        <Route path="inventory/warehouses" element={<Navigate to="/app/inventory" replace />} />
        <Route path="inventory/stock-groups" element={<StockGroupsPage />} />
        <Route path="inventory/stock-dashboard" element={<StockDashboardPage />} />
        <Route path="inventory/stock-valuation" element={<StockValuationPage />} />
        <Route path="inventory/stock-adjustments" element={<StockAdjustmentsPage />} />
        <Route path="inventory/stock-adjustments/new" element={<StockAdjustmentsPage />} />
        <Route path="inventory/warehouse-transfers" element={<WarehouseTransfersPage />} />
        <Route path="inventory/lots" element={<LotTraceabilityPage />} />
        <Route path="inventory/purchase-orders" element={<PurchaseOrdersPage />} />
        <Route path="inventory/goods-receiving" element={<GoodsReceivingPage />} />
        <Route path="inventory/delivery-challans" element={<DeliveryChallansPage />} />
        <Route path="inventory/enhanced-gate-passes" element={<EnhancedGatePassesPage />} />
        <Route path="inventory/process-orders" element={<ProcessOrdersPage />} />
        <Route path="inventory/manufacturing-orders" element={<Navigate to="/app/production/manufacturing-orders" replace />} />
        <Route path="samples" element={<PlaceholderPage title="Samples" />} />
        <Route path="samples/:id" element={<PlaceholderPage title="Sample Detail" />} />
        <Route path="samples/requests" element={<SamplesRequestsPage />} />
        <Route path="time-action" element={<AppComingSoonPage title="Time & Action" description="Use TNA Dashboard under Manufacturing for time and action plans." />} />
        <Route path="tna/dashboard" element={<TnaDashboardPage />} />
        <Route path="tna/templates" element={<TnaTemplatesPage />} />
        <Route path="tna/plans" element={<TnaPlansPage />} />
        <Route path="tna/plans/:planId" element={<TnaPlanDetailPage />} />
        <Route path="production" element={<GarmentProductionOverviewPage />} />
        <Route path="production/manufacturing-orders" element={<ManufacturingOrdersPage />} />
        <Route path="production/setup" element={<ProductionSetupPage />} />
        <Route path="production/calendar" element={<ProductionFactoryCalendarPage />} />
        <Route path="production/line-plan" element={<ProductionLinePlanPage />} />
        <Route path="production/planning" element={<ProductionPlanningPage />} />
        <Route path="production/advanced-planning" element={<Navigate to="/app/production/planning" replace />} />
        <Route path="production/cutting/pipeline" element={<ProductionCuttingPage />} />
        <Route path="production/cutting" element={<ShopFloorExecutionPage />} />
        <Route path="production/sewing" element={<ShopFloorExecutionPage />} />
        <Route path="production/finishing-packing" element={<ShopFloorExecutionPage />} />
        <Route path="production/ie/operations" element={<ProductionIeOperationsPage />} />
        <Route path="production/ie/bulletins" element={<ProductionOperationBulletinsPage />} />
        <Route path="production/ie/line-balance" element={<ProductionLineBalancePage />} />
        <Route path="production/ie" element={<ProductionIeEfficiencyPage />} />
        <Route path="production/hourly/:dept" element={<HourlyProductionPage />} />
        <Route path="production/crew-daily" element={<DailyCrewSheetPage />} />
        <Route path="production/quality" element={<ProductionQualityPage />} />
        <Route path="production/crew-roster" element={<CrewRosterWeeklyPage />} />
        <Route path="production/costs" element={<ProductionCostsPage />} />
        <Route path="production/knitting" element={<ProductionKnittingPage />} />
        <Route path="production/dyeing" element={<ProductionDyeingPage />} />
        <Route path="production/dept/:deptType" element={<DepartmentProductionPage />} />
        <Route path="quality/dashboard" element={<QualityDashboardPage />} />
        <Route path="quality/inspections" element={<QualityInspectionsPage />} />
        <Route path="quality/capa" element={<QualityCapaPage />} />
        <Route path="quality/lab-tests" element={<QualityLabTestsPage />} />
        <Route path="quality/returns" element={<QualityReturnsPage />} />
        <Route path="quality/qc" element={<QualityInspectionsPage />} />
        <Route path="ai/assistant" element={<AiAssistantPage />} />
        <Route path="ai/automation" element={<AiAutomationPage />} />
        <Route path="ai/predictions" element={<AiPredictionsPage />} />
        <Route path="ai/weekly-reports" element={<AiWeeklyReportsPage />} />
        <Route path="inventory/consumption-control" element={<ConsumptionControlPage />} />
        <Route path="inventory/reconciliation" element={<InventoryReconciliationPage />} />
        <Route path="inventory/stock-summary" element={<StockSummaryPage />} />
        <Route path="inventory/stock-inventory-summary" element={<StockInventorySummaryPage />} />
        <Route path="inventory/stock-ledger" element={<StockLedgerPage />} />
        <Route path="commercial" element={<CommercialPage />} />
        <Route path="commercial/export-cases" element={<ExportCasesPage />} />
        <Route path="commercial/master-contracts" element={<MasterContractsPage />} />
        <Route path="commercial/proforma-invoices" element={<ProformaInvoicesPage />} />
        <Route path="commercial/proforma-invoices/new" element={<ProformaInvoiceFormPage />} />
        <Route path="commercial/proforma-invoices/:id/edit" element={<ProformaInvoiceFormPage />} />
        <Route path="commercial/btb-lcs" element={<BtbLcsPage />} />
        <Route element={<TradeFeatureRouteGuard />}>
          <Route path="trade/cases" element={<TradeCasesPage />} />
          <Route path="trade/cases/:caseId" element={<TradeCaseDetailPage />} />
          <Route path="trade/dashboard" element={<TradeDashboardPage />} />
          <Route path="logistics" element={<LogisticsPage />} />
          <Route path="reports/trade-overview" element={<ReportTradeOverviewPage />} />
        </Route>
        <Route path="followup" element={<FollowupPage />} />
        <Route path="parties" element={<PartiesPage />} />
        <Route path="flow" element={<DocumentFlowPage />} />
        <Route path="reports" element={<ReportsHubPage />} />
        <Route path="reports/merchandising" element={<ReportsOverviewPage />} />
        <Route path="reports/purchase-orders" element={<ReportPurchaseOrdersPage />} />
        <Route path="reports/grn" element={<ReportGrnPage />} />
        <Route path="reports/sales-orders" element={<ReportSalesOrdersPage />} />
        <Route path="reports/style-360" element={<ReportStyle360Page />} />
        <Route path="reports/lc-outstanding" element={<ReportLcOutstandingPage />} />
        <Route path="reports/btb-maturity" element={<ReportBtbMaturityPage />} />
        <Route path="reports/production-efficiency" element={<ReportProductionEfficiencyPage />} />
        <Route path="reports/qc-summary" element={<ReportQcSummaryPage />} />
        <Route path="reports/employee" element={<ReportEmployeeSummaryPage />} />
        <Route path="reports/payroll" element={<ReportPayrollSummaryPage />} />
        <Route path="reports/shipments" element={<ReportShipmentsPage />} />
        <Route path="reports/gate-passes" element={<ReportGatePassesPage />} />
        <Route path="reports/challans" element={<ReportChallansPage />} />
        <Route path="reports/reconciliation" element={<ReportReconciliationPage />} />
        <Route path="reports/exceptions" element={<ReportExceptionsPage />} />
        <Route path="accounts/advance-options" element={<AdvanceOptionsPage />} />
        <Route path="accounts/groups" element={<AccountGroupsPage />} />
        <Route path="accounts" element={<ChartOfAccountsPage />} />
        <Route path="accounts/vouchers" element={<VouchersPage />} />
        <Route path="accounts/vouchers/print" element={<VoucherPrintPage />} />
        <Route path="accounts/vouchers/:voucherId" element={<VoucherDetailPage />} />
        <Route path="accounts/vouchers/approval-queue" element={<VoucherApprovalsPage />} />
        <Route path="accounts/currency" element={<AccountsCurrencyPage />} />
        <Route path="accounts/outstanding-bills" element={<OutstandingBillsPage />} />
        <Route path="accounts/cost-centers" element={<CostCentersPage />} />
        <Route path="accounts/budgets" element={<BudgetsPage />} />
        <Route path="accounts/purchase-workflow" element={<PurchaseWorkflowPage />} />
        <Route path="banking/accounts" element={<BankAccountsPage />} />
        <Route path="banking/reconciliation" element={<BankReconciliationPage />} />
        <Route path="banking/payment-runs" element={<PaymentRunsPage />} />
        <Route path="banking/settlement-audit" element={<SettlementAuditPage />} />
        <Route path="banking/payment-advice" element={<PaymentAdvicePage />} />
        <Route path="cashflow/calendar" element={<CashflowCalendarPage />} />
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
        <Route path="hr" element={<HrDashboardPage />} />
        <Route path="hr/departments" element={<HrDepartmentsPage />} />
        <Route path="hr/designations" element={<HrDesignationsPage />} />
        <Route path="hr/sections" element={<HrSectionsPage />} />
        <Route path="hr/employees" element={<HrEmployeesPage />} />
        <Route path="hr/employees/:employeeId" element={<HrEmployeeDetailPage />} />
        <Route path="hr/attendance/shifts" element={<HrShiftsPage />} />
        <Route path="hr/attendance/holidays" element={<HrAttendanceHolidaysPage />} />
        <Route path="hr/attendance/roster" element={<HrRosterPage />} />
        <Route path="hr/attendance/entries" element={<HrAttendanceEntryPage />} />
        <Route path="hr/attendance/regularizations" element={<HrRegularizationsPage />} />
        <Route path="hr/attendance/overtime-rules" element={<HrOvertimeRulesPage />} />
        <Route path="hr/attendance/overtime" element={<HrOvertimePage />} />
        <Route path="hr/attendance/summary" element={<HrAttendanceSummaryPage />} />
        <Route path="hr/leave/types" element={<HrLeaveTypesPage />} />
        <Route path="hr/leave/policies" element={<HrLeavePoliciesPage />} />
        <Route path="hr/leave/balances" element={<HrLeaveBalancesPage />} />
        <Route path="hr/leave/requests" element={<HrLeaveRequestsPage />} />
        <Route path="hr/leave/approvals" element={<HrLeaveApprovalsPage />} />
        <Route path="hr/leave/calendar" element={<HrLeaveCalendarPage />} />
        <Route path="hr/payroll/components" element={<HrPayrollComponentsPage />} />
        <Route path="hr/payroll/periods" element={<HrPayrollPeriodsPage />} />
        <Route path="hr/payroll/salary-structures" element={<HrSalaryStructuresPage />} />
        <Route path="hr/payroll/runs" element={<HrPayrollRunsPage />} />
        <Route path="hr/payroll/advances" element={<HrPayrollAdvancesPage />} />
        <Route path="hr/payroll/bonuses" element={<HrPayrollBonusesPage />} />
        <Route path="hr/payroll/accounting-config" element={<HrPayrollAccountingConfigPage />} />
        <Route path="hr/payroll/approvals" element={<HrPayrollApprovalsPage />} />
        <Route path="hr/payroll/payslips" element={<HrPayslipsPage />} />
        <Route path="hr/performance/cycles" element={<HrPerformanceCyclesPage />} />
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
        <Route path="hr/ess/tickets" element={<HrEssTicketsPage />} />
        <Route path="hr/compliance" element={<HrCompliancePage />} />
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
