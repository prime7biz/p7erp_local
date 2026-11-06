import { Suspense, lazy, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { TradeFeatureRouteGuard } from "@/components/TradeFeatureRouteGuard";
import { KnittingFeatureRouteGuard } from "@/components/KnittingFeatureRouteGuard";
import { PermissionRouteGuard } from "@/components/auth/PermissionRouteGuard";
import { ROUTE_PERMISSION } from "@/app/routePermissions";
// Translations are only used inside the app, so i18n starts here instead of in main.tsx.
import "@/i18n";

const Dashboard = lazy(() => import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const PlaceholderPage = lazy(() => import("@/pages/app/PlaceholderPage").then((m) => ({ default: m.PlaceholderPage })));
const AiAssistantPage = lazy(() => import("@/pages/app/ai/AiAssistantPage").then((m) => ({ default: m.AiAssistantPage })));
const AiAutomationPage = lazy(() => import("@/pages/app/ai/AiAutomationPage").then((m) => ({ default: m.AiAutomationPage })));
const AiPredictionsPage = lazy(() => import("@/pages/app/ai/AiPredictionsPage").then((m) => ({ default: m.AiPredictionsPage })));
const AiWeeklyReportsPage = lazy(() =>
  import("@/pages/app/ai/AiWeeklyReportsPage").then((m) => ({ default: m.AiWeeklyReportsPage })),
);
const CommercialPage = lazy(() => import("@/pages/app/commercial/CommercialPage").then((m) => ({ default: m.CommercialPage })));
const ExportCasesPage = lazy(() => import("@/pages/app/commercial/ExportCasesPage").then((m) => ({ default: m.ExportCasesPage })));
const ExportCaseFormPage = lazy(() =>
  import("@/pages/app/commercial/ExportCaseFormPage").then((m) => ({ default: m.ExportCaseFormPage })),
);
const ScanStationPage = lazy(() =>
  import("@/pages/app/production/scan/ScanStationPage").then((m) => ({ default: m.ScanStationPage })),
);
const AiAgentsPage = lazy(() =>
  import("@/pages/app/ai/agents/AiAgentsPage").then((m) => ({ default: m.AiAgentsPage })),
);
const BdCompliancePage = lazy(() =>
  import("@/pages/app/commercial/bd-compliance/BdCompliancePage").then((m) => ({ default: m.BdCompliancePage })),
);
const CommissionPage = lazy(() =>
  import("@/pages/app/commercial/CommissionPage").then((m) => ({ default: m.CommissionPage })),
);
const ProformaInvoicesPage = lazy(() =>
  import("@/pages/app/commercial/ProformaInvoicesPage").then((m) => ({ default: m.ProformaInvoicesPage })),
);
const BtbLcsPage = lazy(() => import("@/pages/app/commercial/BtbLcsPage").then((m) => ({ default: m.BtbLcsPage })));
const MasterContractsPage = lazy(() =>
  import("@/pages/app/commercial/MasterContractsPage").then((m) => ({ default: m.MasterContractsPage })),
);
const LogisticsPage = lazy(() => import("@/pages/app/logistics/LogisticsPage").then((m) => ({ default: m.LogisticsPage })));
const PackingListDetailPage = lazy(() =>
  import("@/pages/app/logistics/PackingListDetailPage").then((m) => ({ default: m.PackingListDetailPage })),
);
const TradeCasesPage = lazy(() => import("@/pages/app/trade/TradeCasesPage").then((m) => ({ default: m.TradeCasesPage })));
const TradeCaseDetailPage = lazy(() =>
  import("@/pages/app/trade/TradeCaseDetailPage").then((m) => ({ default: m.TradeCaseDetailPage })),
);
const TradeDashboardPage = lazy(() =>
  import("@/pages/app/trade/TradeDashboardPage").then((m) => ({ default: m.TradeDashboardPage })),
);
const ControlTowerPage = lazy(() =>
  import("@/pages/app/operations/ControlTowerPage").then((m) => ({ default: m.ControlTowerPage })),
);
const PartiesPage = lazy(() => import("@/pages/app/parties/PartiesPage").then((m) => ({ default: m.PartiesPage })));
const DocumentFlowPage = lazy(() => import("@/pages/app/flow/DocumentFlowPage").then((m) => ({ default: m.DocumentFlowPage })));
const CustomersPage = lazy(() => import("@/pages/app/crm/CustomersPage").then((m) => ({ default: m.CustomersPage })));
const CustomerCreatePage = lazy(() =>
  import("@/pages/app/crm/CustomerCreatePage").then((m) => ({ default: m.CustomerCreatePage })),
);
const CustomerDetailPage = lazy(() =>
  import("@/pages/app/crm/CustomerDetailPage").then((m) => ({ default: m.CustomerDetailPage })),
);
const CustomerEditPage = lazy(() => import("@/pages/app/crm/CustomerEditPage").then((m) => ({ default: m.CustomerEditPage })));
const InquiriesPage = lazy(() => import("@/pages/app/crm/InquiriesPage").then((m) => ({ default: m.InquiriesPage })));
const InquiryCreatePage = lazy(() => import("@/pages/app/crm/InquiryCreatePage").then((m) => ({ default: m.InquiryCreatePage })));
const QuotationsPage = lazy(() => import("@/pages/app/crm/QuotationsPage").then((m) => ({ default: m.QuotationsPage })));
const OrdersPage = lazy(() => import("@/pages/app/crm/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const OrderCreatePage = lazy(() => import("@/pages/app/crm/OrderCreatePage").then((m) => ({ default: m.OrderCreatePage })));
const InquiryDetailPage = lazy(() => import("@/pages/app/crm/InquiryDetailPage").then((m) => ({ default: m.InquiryDetailPage })));
const QuotationDetailPage = lazy(() =>
  import("@/pages/app/crm/QuotationDetailPage").then((m) => ({ default: m.QuotationDetailPage })),
);
const OrderDetailPage = lazy(() => import("@/pages/app/crm/OrderDetailPage").then((m) => ({ default: m.OrderDetailPage })));
const StylesPage = lazy(() => import("@/pages/app/StylesPage").then((m) => ({ default: m.StylesPage })));
const StyleDetailPage = lazy(() => import("@/pages/app/StyleDetailPage").then((m) => ({ default: m.StyleDetailPage })));
const BomBuilderPage = lazy(() => import("@/pages/app/BomBuilderPage").then((m) => ({ default: m.BomBuilderPage })));
const ConsumptionPlansPage = lazy(() =>
  import("@/pages/app/ConsumptionPlansPage").then((m) => ({ default: m.ConsumptionPlansPage })),
);
const FollowupPage = lazy(() => import("@/pages/app/FollowupPage").then((m) => ({ default: m.FollowupPage })));
const MerchPipelinePage = lazy(() => import("@/pages/app/MerchPipelinePage").then((m) => ({ default: m.MerchPipelinePage })));
const MerchControlTowerPage = lazy(() =>
  import("@/pages/app/MerchControlTowerPage").then((m) => ({ default: m.MerchControlTowerPage })),
);
const MerchSamplesPage = lazy(() => import("@/pages/app/MerchSamplesPage").then((m) => ({ default: m.MerchSamplesPage })));
const MerchSampleDetailPage = lazy(() =>
  import("@/pages/app/MerchSampleDetailPage").then((m) => ({ default: m.MerchSampleDetailPage })),
);
const PipelineAnalyticsPage = lazy(() =>
  import("@/pages/app/PipelineAnalyticsPage").then((m) => ({ default: m.PipelineAnalyticsPage })),
);
const MerchCriticalAlertsPage = lazy(() =>
  import("@/pages/app/MerchCriticalAlertsPage").then((m) => ({ default: m.MerchCriticalAlertsPage })),
);
const ConsumptionReconciliationPage = lazy(() =>
  import("@/pages/app/ConsumptionReconciliationPage").then((m) => ({ default: m.ConsumptionReconciliationPage })),
);
const OrderProfitabilityPage = lazy(() =>
  import("@/pages/app/merch/OrderProfitabilityPage").then((m) => ({ default: m.OrderProfitabilityPage })),
);
const WastageReportPage = lazy(() => import("@/pages/app/WastageReportPage").then((m) => ({ default: m.WastageReportPage })));
const InventoryItemsPage = lazy(() => import("@/pages/app/InventoryItemsPage").then((m) => ({ default: m.InventoryItemsPage })));
const VendorsPage = lazy(() => import("@/pages/app/VendorsPage").then((m) => ({ default: m.VendorsPage })));
const StockGroupsPage = lazy(() => import("@/pages/app/StockGroupsPage").then((m) => ({ default: m.StockGroupsPage })));
const StockItemsHierarchyPage = lazy(() =>
  import("@/pages/app/inventory/stock-hierarchy/StockItemsPage").then((m) => ({ default: m.StockItemsPage })),
);
const StockItemDetailPage = lazy(() =>
  import("@/pages/app/inventory/stock-hierarchy/StockItemDetailPage").then((m) => ({
    default: m.StockItemDetailPage,
  })),
);
const StockTransferHierarchyPage = lazy(() =>
  import("@/pages/app/inventory/stock-hierarchy/StockTransferPage").then((m) => ({
    default: m.StockTransferPage,
  })),
);
const GodownStockPage = lazy(() =>
  import("@/pages/app/inventory/stock-hierarchy/GodownStockPage").then((m) => ({ default: m.GodownStockPage })),
);
const PurchaseOrdersPage = lazy(() =>
  import("@/pages/app/PurchaseOrdersPage").then((m) => ({ default: m.PurchaseOrdersPage })),
);
const GoodsReceivingPage = lazy(() =>
  import("@/pages/app/GoodsReceivingPage").then((m) => ({ default: m.GoodsReceivingPage })),
);
const DeliveryChallansPage = lazy(() =>
  import("@/pages/app/DeliveryChallansPage").then((m) => ({ default: m.DeliveryChallansPage })),
);
const DeliveryChallanDetailPage = lazy(() =>
  import("@/pages/app/DeliveryChallanDetailPage").then((m) => ({ default: m.DeliveryChallanDetailPage })),
);
const EnhancedGatePassesPage = lazy(() =>
  import("@/pages/app/EnhancedGatePassesPage").then((m) => ({ default: m.EnhancedGatePassesPage })),
);
const GatePassDetailPage = lazy(() =>
  import("@/pages/app/GatePassDetailPage").then((m) => ({ default: m.GatePassDetailPage })),
);
const ProcessOrdersPage = lazy(() => import("@/pages/app/ProcessOrdersPage").then((m) => ({ default: m.ProcessOrdersPage })));
const MRPRunPage = lazy(() =>
  import("@/pages/app/inventory/mrp-idt/MRPRunPage").then((m) => ({ default: m.MRPRunPage })),
);
const ReorderSuggestionsPage = lazy(() =>
  import("@/pages/app/inventory/mrp-idt/ReorderSuggestionsPage").then((m) => ({
    default: m.ReorderSuggestionsPage,
  })),
);
const InterDepartmentTransferPage = lazy(() =>
  import("@/pages/app/inventory/mrp-idt/InterDepartmentTransferPage").then((m) => ({
    default: m.InterDepartmentTransferPage,
  })),
);
const IDTReceivePage = lazy(() =>
  import("@/pages/app/inventory/mrp-idt/IDTReceivePage").then((m) => ({ default: m.IDTReceivePage })),
);
const ProcessLossReportPage = lazy(() =>
  import("@/pages/app/inventory/mrp-idt/ProcessLossReportPage").then((m) => ({
    default: m.ProcessLossReportPage,
  })),
);
const PostCostingPage = lazy(() =>
  import("@/pages/app/inventory/mrp-idt/PostCostingPage").then((m) => ({ default: m.PostCostingPage })),
);
const ProcessLossSettingsPage = lazy(() =>
  import("@/pages/app/inventory/mrp-idt/ProcessLossSettingsPage").then((m) => ({
    default: m.ProcessLossSettingsPage,
  })),
);
const GrnInspectionPage = lazy(() =>
  import("@/pages/app/inventory/quality/GrnInspectionPage").then((m) => ({
    default: m.GrnInspectionPage,
  })),
);
const InventoryQualityDashboardPage = lazy(() =>
  import("@/pages/app/inventory/quality/QualityDashboardPage").then((m) => ({
    default: m.QualityDashboardPage,
  })),
);
const VendorScorecardPage = lazy(() =>
  import("@/pages/app/inventory/quality/VendorScorecardPage").then((m) => ({
    default: m.VendorScorecardPage,
  })),
);
const ABCAnalysisPage = lazy(() =>
  import("@/pages/app/inventory/analytics/ABCAnalysisPage").then((m) => ({
    default: m.ABCAnalysisPage,
  })),
);
const EOQPage = lazy(() =>
  import("@/pages/app/inventory/analytics/EOQPage").then((m) => ({ default: m.EOQPage })),
);
const StockAgingPage = lazy(() =>
  import("@/pages/app/inventory/analytics/StockAgingPage").then((m) => ({
    default: m.StockAgingPage,
  })),
);
const CycleCountPage = lazy(() =>
  import("@/pages/app/inventory/analytics/CycleCountPage").then((m) => ({
    default: m.CycleCountPage,
  })),
);
const SerialTrackingPage = lazy(() =>
  import("@/pages/app/inventory/serial-kit/SerialTrackingPage").then((m) => ({
    default: m.SerialTrackingPage,
  })),
);
const KitBuilderPage = lazy(() =>
  import("@/pages/app/inventory/serial-kit/KitBuilderPage").then((m) => ({
    default: m.KitBuilderPage,
  })),
);
const ConsignmentStockPage = lazy(() =>
  import("@/pages/app/inventory/serial-kit/ConsignmentStockPage").then((m) => ({
    default: m.ConsignmentStockPage,
  })),
);
const ConsumptionControlPage = lazy(() =>
  import("@/pages/app/ConsumptionControlPage").then((m) => ({ default: m.ConsumptionControlPage })),
);
const VoucherApprovalsPage = lazy(() =>
  import("@/pages/app/VoucherApprovalsPage").then((m) => ({ default: m.VoucherApprovalsPage })),
);
const FxReceiptsPage = lazy(() => import("@/pages/app/FxReceiptsPage").then((m) => ({ default: m.FxReceiptsPage })));
const AccountsCurrencyPage = lazy(() =>
  import("@/pages/app/AccountsCurrencyPage").then((m) => ({ default: m.AccountsCurrencyPage })),
);
const CostCentersPage = lazy(() => import("@/pages/app/CostCentersPage").then((m) => ({ default: m.CostCentersPage })));
const BudgetsPage = lazy(() => import("@/pages/app/BudgetsPage").then((m) => ({ default: m.BudgetsPage })));
const BankAccountsPage = lazy(() => import("@/pages/app/BankAccountsPage").then((m) => ({ default: m.BankAccountsPage })));
const VoucherPrintPage = lazy(() => import("@/pages/app/VoucherPrintPage").then((m) => ({ default: m.VoucherPrintPage })));
const VoucherDetailPage = lazy(() => import("@/pages/app/VoucherDetailPage").then((m) => ({ default: m.VoucherDetailPage })));
const AccountingPeriodsPage = lazy(() =>
  import("@/pages/app/AccountingPeriodsPage").then((m) => ({ default: m.AccountingPeriodsPage })),
);
const PaymentAdvicePage = lazy(() => import("@/pages/app/PaymentAdvicePage").then((m) => ({ default: m.PaymentAdvicePage })));
const AllApprovalsPage = lazy(() => import("@/pages/app/AllApprovalsPage").then((m) => ({ default: m.AllApprovalsPage })));
const MySignaturePage = lazy(() =>
  import("@/pages/settings/MySignaturePage").then((m) => ({ default: m.MySignaturePage })),
);
const QuotationPrintPage = lazy(() =>
  import("@/pages/print/QuotationPrintPage").then((m) => ({ default: m.QuotationPrintPage })),
);
const CustomerPrintPage = lazy(() => import("@/pages/print/CustomerPrintPage").then((m) => ({ default: m.CustomerPrintPage })));
const PurchaseOrderPrintPage = lazy(() =>
  import("@/pages/print/PurchaseOrderPrintPage").then((m) => ({ default: m.PurchaseOrderPrintPage })),
);
const GoodsReceivingPrintPage = lazy(() =>
  import("@/pages/print/GoodsReceivingPrintPage").then((m) => ({ default: m.GoodsReceivingPrintPage })),
);
const InquiryPrintPage = lazy(() => import("@/pages/print/InquiryPrintPage").then((m) => ({ default: m.InquiryPrintPage })));
const OrderPrintPage = lazy(() => import("@/pages/print/OrderPrintPage").then((m) => ({ default: m.OrderPrintPage })));
const StylePrintPage = lazy(() => import("@/pages/print/StylePrintPage").then((m) => ({ default: m.StylePrintPage })));
const ProformaInvoicePrintPage = lazy(() =>
  import("@/pages/print/ProformaInvoicePrintPage").then((m) => ({ default: m.ProformaInvoicePrintPage })),
);
const ProformaInvoiceFormPage = lazy(() =>
  import("@/pages/app/commercial/ProformaInvoiceFormPage").then((m) => ({ default: m.ProformaInvoiceFormPage })),
);
const CommercialInvoicesPage = lazy(() =>
  import("@/pages/app/commercial/CommercialInvoicesPage").then((m) => ({ default: m.CommercialInvoicesPage })),
);
const CommercialInvoiceDetailPage = lazy(() =>
  import("@/pages/app/commercial/CommercialInvoiceDetailPage").then((m) => ({
    default: m.CommercialInvoiceDetailPage,
  })),
);

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
const StatutoryCompliancePage = lazy(() =>
  import("@/pages/settings/StatutoryCompliancePage").then((m) => ({ default: m.StatutoryCompliancePage })),
);
const DataImportPage = lazy(() =>
  import("@/pages/settings/DataImportPage").then((m) => ({ default: m.DataImportPage })),
);
const BulkTenantOnboardingPage = lazy(() =>
  import("@/pages/settings/BulkTenantOnboardingPage").then((m) => ({ default: m.BulkTenantOnboardingPage })),
);
const SettingsOverviewPage = lazy(() =>
  import("@/pages/settings/SettingsOverviewPage").then((m) => ({ default: m.SettingsOverviewPage })),
);
const ExternalAccessPage = lazy(() =>
  import("@/pages/settings/external-access/ExternalAccessPage").then((m) => ({ default: m.ExternalAccessPage })),
);
const ExternalCustomerAccessPage = lazy(() =>
  import("@/pages/settings/external-access/ExternalCustomerAccessPage").then((m) => ({ default: m.ExternalCustomerAccessPage })),
);
const ExternalFinancierAccessPage = lazy(() =>
  import("@/pages/settings/external-access/ExternalFinancierAccessPage").then((m) => ({ default: m.ExternalFinancierAccessPage })),
);
const ExternalSupplierAccessPage = lazy(() =>
  import("@/pages/settings/external-access/ExternalSupplierAccessPage").then((m) => ({ default: m.ExternalSupplierAccessPage })),
);
const ExternalAccessAuditPage = lazy(() =>
  import("@/pages/settings/external-access/ExternalAccessAuditPage").then((m) => ({ default: m.ExternalAccessAuditPage })),
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
const FacilitiesPage = lazy(() =>
  import("@/pages/app/finance/FacilitiesPage").then((m) => ({ default: m.FacilitiesPage })),
);
const FacilityCreatePage = lazy(() =>
  import("@/pages/app/finance/FacilityCreatePage").then((m) => ({ default: m.FacilityCreatePage })),
);
const FacilityDetailPage = lazy(() =>
  import("@/pages/app/finance/FacilityDetailPage").then((m) => ({ default: m.FacilityDetailPage })),
);
const UtilizationCreatePage = lazy(() =>
  import("@/pages/app/finance/UtilizationCreatePage").then((m) => ({ default: m.UtilizationCreatePage })),
);
const UtilizationDetailPage = lazy(() =>
  import("@/pages/app/finance/UtilizationDetailPage").then((m) => ({ default: m.UtilizationDetailPage })),
);
const FacilityDashboardPage = lazy(() =>
  import("@/pages/app/finance/FacilityDashboardPage").then((m) => ({ default: m.FacilityDashboardPage })),
);
const BusinessOverviewPage = lazy(() =>
  import("@/pages/app/finance/BusinessOverviewPage").then((m) => ({ default: m.BusinessOverviewPage })),
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
const VendorBillsPage = lazy(() =>
  import("@/pages/app/accounts/VendorBillsPage").then((m) => ({ default: m.VendorBillsPage })),
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
const TraceabilityPage = lazy(() =>
  import("@/pages/app/inventory/TraceabilityPage").then((m) => ({ default: m.TraceabilityPage })),
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
const PartyLedgersPage = lazy(() =>
  import("@/pages/app/finance/party-ledger/PartyLedgersPage").then((m) => ({ default: m.PartyLedgersPage })),
);
const PartyLedgerCreatePage = lazy(() =>
  import("@/pages/app/finance/party-ledger/PartyLedgerCreatePage").then((m) => ({
    default: m.PartyLedgerCreatePage,
  })),
);
const PartyLedgerDetailPage = lazy(() =>
  import("@/pages/app/finance/party-ledger/PartyLedgerDetailPage").then((m) => ({
    default: m.PartyLedgerDetailPage,
  })),
);
const TaxLedgersPage = lazy(() =>
  import("@/pages/app/finance/gst/TaxLedgersPage").then((m) => ({ default: m.TaxLedgersPage })),
);
const GstReturnsPage = lazy(() =>
  import("@/pages/app/finance/gst/GstReturnsPage").then((m) => ({ default: m.GstReturnsPage })),
);
const TaxSettingsPage = lazy(() =>
  import("@/pages/app/finance/gst/TaxSettingsPage").then((m) => ({ default: m.TaxSettingsPage })),
);
const VoucherTypeConfigPage = lazy(() =>
  import("@/pages/app/finance/advanced-vouchers/VoucherTypeConfigPage").then((m) => ({
    default: m.VoucherTypeConfigPage,
  })),
);
const VoucherClassPage = lazy(() =>
  import("@/pages/app/finance/advanced-vouchers/VoucherClassPage").then((m) => ({ default: m.VoucherClassPage })),
);
const RecurringVouchersPage = lazy(() =>
  import("@/pages/app/finance/advanced-vouchers/RecurringVouchersPage").then((m) => ({
    default: m.RecurringVouchersPage,
  })),
);
const PostDatedRegisterPage = lazy(() =>
  import("@/pages/app/finance/advanced-vouchers/PostDatedRegisterPage").then((m) => ({
    default: m.PostDatedRegisterPage,
  })),
);
const MemorandumRegisterPage = lazy(() =>
  import("@/pages/app/finance/advanced-vouchers/MemorandumRegisterPage").then((m) => ({
    default: m.MemorandumRegisterPage,
  })),
);
const CreditNoteCreatePage = lazy(() =>
  import("@/pages/app/finance/advanced-vouchers/CreditNoteCreatePage").then((m) => ({
    default: m.CreditNoteCreatePage,
  })),
);
const DebitNoteCreatePage = lazy(() =>
  import("@/pages/app/finance/advanced-vouchers/DebitNoteCreatePage").then((m) => ({
    default: m.DebitNoteCreatePage,
  })),
);
const StockTransferCreatePage = lazy(() =>
  import("@/pages/app/finance/advanced-vouchers/StockTransferCreatePage").then((m) => ({
    default: m.StockTransferCreatePage,
  })),
);
const TdsSettingsPage = lazy(() =>
  import("@/pages/app/finance/tds/TdsSettingsPage").then((m) => ({ default: m.TdsSettingsPage })),
);
const TdsReportsPage = lazy(() =>
  import("@/pages/app/finance/tds/TdsReportsPage").then((m) => ({ default: m.TdsReportsPage })),
);
const FinancialDashboardPage = lazy(() =>
  import("@/pages/app/finance/mis/FinancialDashboardPage").then((m) => ({ default: m.FinancialDashboardPage })),
);
const FundFlowPage = lazy(() =>
  import("@/pages/app/finance/mis/FundFlowPage").then((m) => ({ default: m.FundFlowPage })),
);
const RatioAnalysisMisPage = lazy(() =>
  import("@/pages/app/finance/mis/RatioAnalysisMisPage").then((m) => ({ default: m.RatioAnalysisMisPage })),
);
const ComparativeStatementsPage = lazy(() =>
  import("@/pages/app/finance/mis/ComparativeStatementsPage").then((m) => ({
    default: m.ComparativeStatementsPage,
  })),
);
const CashFlowScenarioPage = lazy(() =>
  import("@/pages/app/finance/mis/CashFlowScenarioPage").then((m) => ({ default: m.CashFlowScenarioPage })),
);
const PayrollStatutoryConfigPage = lazy(() =>
  import("@/pages/app/hr/payroll/PayrollStatutoryConfigPage").then((m) => ({
    default: m.PayrollStatutoryConfigPage,
  })),
);
const LcPerformancePage = lazy(() =>
  import("@/pages/app/commercial/LcPerformancePage").then((m) => ({ default: m.LcPerformancePage })),
);
const Mushak63PrintPage = lazy(() =>
  import("@/pages/app/commercial/bd-compliance/Mushak63PrintPage").then((m) => ({ default: m.Mushak63PrintPage })),
);
const ChequePrintPage = lazy(() =>
  import("@/pages/app/finance/ChequePrintPage").then((m) => ({ default: m.ChequePrintPage })),
);
const RequisitionsPage = lazy(() =>
  import("@/pages/app/procurement/RequisitionsPage").then((m) => ({ default: m.RequisitionsPage })),
);
const RequisitionDetailPage = lazy(() =>
  import("@/pages/app/procurement/RequisitionDetailPage").then((m) => ({ default: m.RequisitionDetailPage })),
);
const ExceptionReportsPage = lazy(() =>
  import("@/pages/app/finance/ExceptionReportsPage").then((m) => ({ default: m.ExceptionReportsPage })),
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
const PayrollEmployeeAssignmentPage = lazy(() =>
  import("@/pages/app/hr/payroll/PayrollEmployeeAssignmentPage").then((m) => ({
    default: m.PayrollEmployeeAssignmentPage,
  })),
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
const AiEmployeeOnboardingPage = lazy(() =>
  import("@/pages/app/hr/AiEmployeeOnboardingPage").then((m) => ({ default: m.AiEmployeeOnboardingPage })),
);
const HrAiInsightsPage = lazy(() =>
  import("@/pages/app/hr/HrAiInsightsPage").then((m) => ({ default: m.HrAiInsightsPage })),
);
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
        <Route path="accounts/vouchers/:voucherId/cheque" element={<ChequePrintPage />} />
        <Route path="commercial/bd-compliance/mushak-6-3/:invoiceId" element={<Mushak63PrintPage />} />
      <Route element={<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.inventory} />}>
        <Route path="inventory/purchase-orders/:id/print" element={<PurchaseOrderPrintPage />} />
        <Route path="inventory/goods-receiving/:id/print" element={<GoodsReceivingPrintPage />} />
      </Route>
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
        <Route element={<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.merch} />}>
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
          <Route path="merchandising/control-tower" element={<MerchControlTowerPage />} />
          <Route path="merchandising/samples" element={<MerchSamplesPage />} />
          <Route path="merchandising/samples/:id" element={<MerchSampleDetailPage />} />
          <Route path="merchandising/pipeline" element={<MerchPipelinePage />} />
          <Route path="merchandising/pipeline-analytics" element={<PipelineAnalyticsPage />} />
          <Route path="merchandising/alerts" element={<MerchCriticalAlertsPage />} />
          <Route path="merchandising/wastage-report" element={<WastageReportPage />} />
          <Route path="merchandising/consumption-reconciliation" element={<ConsumptionReconciliationPage />} />
          <Route path="merch/order-profitability" element={<OrderProfitabilityPage />} />
          <Route path="merch/profitability" element={<OrderProfitabilityPage />} />
        </Route>
        <Route element={<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.inventory} />}>
          <Route path="inventory" element={<InventoryItemsPage />} />
          <Route path="inventory/items" element={<InventoryItemsPage />} />
          <Route path="inventory/categories" element={<Navigate to="/app/inventory?tab=masters" replace />} />
          <Route path="inventory/subcategories" element={<Navigate to="/app/inventory?tab=masters" replace />} />
          <Route path="inventory/units" element={<Navigate to="/app/inventory?tab=units" replace />} />
          <Route path="inventory/vendors" element={<VendorsPage />} />
          <Route path="inventory/warehouses" element={<Navigate to="/app/inventory?tab=warehouses" replace />} />
          <Route path="inventory/stock-groups" element={<StockGroupsPage />} />
          <Route path="inventory/stock-items" element={<StockItemsHierarchyPage />} />
          <Route path="inventory/stock-items/:id" element={<StockItemDetailPage />} />
          <Route path="inventory/stock-transfers" element={<StockTransferHierarchyPage />} />
          <Route path="inventory/godown-stock" element={<GodownStockPage />} />
          <Route path="inventory/stock-dashboard" element={<StockDashboardPage />} />
          <Route path="inventory/stock-valuation" element={<StockValuationPage />} />
          <Route path="inventory/stock-adjustments" element={<StockAdjustmentsPage />} />
          <Route path="inventory/stock-adjustments/new" element={<StockAdjustmentsPage />} />
          <Route path="inventory/warehouse-transfers" element={<WarehouseTransfersPage />} />
          <Route path="inventory/lots" element={<LotTraceabilityPage />} />
          <Route path="inventory/traceability" element={<TraceabilityPage />} />
          <Route path="inventory/purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="inventory/goods-receiving" element={<GoodsReceivingPage />} />
          <Route path="inventory/delivery-challans/:challanId" element={<DeliveryChallanDetailPage />} />
          <Route path="inventory/delivery-challans" element={<DeliveryChallansPage />} />
          <Route path="inventory/enhanced-gate-passes/:gatePassId" element={<GatePassDetailPage />} />
          <Route path="inventory/enhanced-gate-passes" element={<EnhancedGatePassesPage />} />
          <Route path="inventory/process-orders" element={<ProcessOrdersPage />} />
          <Route path="inventory/mrp" element={<MRPRunPage />} />
          <Route path="inventory/reorder-suggestions" element={<ReorderSuggestionsPage />} />
          <Route path="inventory/idt" element={<InterDepartmentTransferPage />} />
          <Route path="inventory/idt-receive" element={<IDTReceivePage />} />
          <Route path="inventory/process-loss-report" element={<ProcessLossReportPage />} />
          <Route path="inventory/post-costing" element={<PostCostingPage />} />
          <Route path="inventory/process-loss-settings" element={<ProcessLossSettingsPage />} />
          <Route path="inventory/grn-inspection" element={<GrnInspectionPage />} />
          <Route path="inventory/quality-dashboard" element={<InventoryQualityDashboardPage />} />
          <Route path="inventory/vendor-scorecard" element={<VendorScorecardPage />} />
          <Route path="inventory/abc-analysis" element={<ABCAnalysisPage />} />
          <Route path="inventory/eoq" element={<EOQPage />} />
          <Route path="inventory/stock-aging" element={<StockAgingPage />} />
          <Route path="inventory/cycle-count" element={<CycleCountPage />} />
          <Route path="inventory/serials" element={<SerialTrackingPage />} />
          <Route path="inventory/kits" element={<KitBuilderPage />} />
          <Route path="inventory/consignment" element={<ConsignmentStockPage />} />
          <Route path="inventory/manufacturing-orders" element={<Navigate to="/app/production/manufacturing-orders" replace />} />
        </Route>
        <Route path="samples" element={<Navigate to="/app/samples/requests" replace />} />
        <Route path="samples/:id" element={<Navigate to="/app/samples/requests" replace />} />
        <Route path="time-action" element={<Navigate to="/app/tna/dashboard" replace />} />
        <Route element={<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.merch} />}>
          <Route path="tna/dashboard" element={<TnaDashboardPage />} />
          <Route path="tna/templates" element={<TnaTemplatesPage />} />
          <Route path="tna/plans" element={<TnaPlansPage />} />
          <Route path="tna/plans/:planId" element={<TnaPlanDetailPage />} />
        </Route>
        <Route element={<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.production} />}>
          <Route path="samples/requests" element={<SamplesRequestsPage />} />
          <Route path="production" element={<GarmentProductionOverviewPage />} />
          <Route path="production/manufacturing-orders" element={<ManufacturingOrdersPage />} />
          <Route path="production/setup" element={<ProductionSetupPage />} />
          <Route path="production/calendar" element={<ProductionFactoryCalendarPage />} />
          <Route path="production/line-plan" element={<ProductionLinePlanPage />} />
          <Route path="production/planning" element={<ProductionPlanningPage />} />
          <Route path="production/advanced-planning" element={<Navigate to="/app/production/planning" replace />} />
          <Route path="production/cutting/pipeline" element={<ProductionCuttingPage />} />
          <Route path="production/scan-station" element={<ScanStationPage />} />
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
          <Route element={<KnittingFeatureRouteGuard />}>
            <Route path="production/knitting" element={<ProductionKnittingPage />} />
          </Route>
          <Route path="production/dyeing" element={<ProductionDyeingPage />} />
          <Route path="production/dept/:deptType" element={<DepartmentProductionPage />} />
          <Route path="quality/dashboard" element={<QualityDashboardPage />} />
          <Route path="quality/inspections" element={<QualityInspectionsPage />} />
          <Route path="quality/capa" element={<QualityCapaPage />} />
          <Route path="quality/lab-tests" element={<QualityLabTestsPage />} />
          <Route path="quality/returns" element={<QualityReturnsPage />} />
          <Route path="quality/qc" element={<QualityInspectionsPage />} />
        </Route>
        <Route element={<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.ai} />}>
          <Route path="ai/assistant" element={<AiAssistantPage />} />
          <Route path="ai/automation" element={<AiAutomationPage />} />
          <Route path="ai/predictions" element={<AiPredictionsPage />} />
          <Route path="ai/weekly-reports" element={<AiWeeklyReportsPage />} />
          <Route path="ai/agents" element={<AiAgentsPage />} />
        </Route>
        <Route element={<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.inventory} />}>
          <Route path="inventory/consumption-control" element={<ConsumptionControlPage />} />
          <Route path="inventory/reconciliation" element={<InventoryReconciliationPage />} />
          <Route path="inventory/stock-summary" element={<StockSummaryPage />} />
          <Route path="inventory/stock-inventory-summary" element={<StockInventorySummaryPage />} />
          <Route path="inventory/stock-ledger" element={<StockLedgerPage />} />
        </Route>
        <Route element={<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.merch} />}>
          <Route path="commercial" element={<CommercialPage />} />
          <Route path="commercial/export-cases" element={<ExportCasesPage />} />
          <Route path="commercial/export-cases/new" element={<ExportCaseFormPage />} />
          <Route path="commercial/export-cases/:id/edit" element={<ExportCaseFormPage />} />
          <Route path="commercial/master-contracts" element={<MasterContractsPage />} />
          <Route path="commercial/lc-performance" element={<LcPerformancePage />} />
          <Route path="commercial/proforma-invoices" element={<ProformaInvoicesPage />} />
          <Route path="commercial/commission" element={<CommissionPage />} />
          <Route path="commercial/bd-compliance" element={<BdCompliancePage />} />
          <Route path="commercial/proforma-invoices/new" element={<ProformaInvoiceFormPage />} />
          <Route path="commercial/proforma-invoices/:id/edit" element={<ProformaInvoiceFormPage />} />
          <Route path="commercial/invoices" element={<CommercialInvoicesPage />} />
          <Route path="commercial/invoices/:id" element={<CommercialInvoiceDetailPage />} />
          <Route path="commercial/btb-lcs" element={<BtbLcsPage />} />
        </Route>
        <Route path="operations/control-tower" element={<ControlTowerPage />} />
        <Route element={<TradeFeatureRouteGuard />}>
          <Route element={<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.trade} />}>
            <Route path="trade/cases" element={<TradeCasesPage />} />
            <Route path="trade/cases/:caseId" element={<TradeCaseDetailPage />} />
            <Route path="trade/dashboard" element={<TradeDashboardPage />} />
            <Route path="logistics" element={<LogisticsPage />} />
            <Route path="logistics/packing-lists/:id" element={<PackingListDetailPage />} />
          </Route>
          <Route element={<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.reports} />}>
            <Route path="reports/trade-overview" element={<ReportTradeOverviewPage />} />
          </Route>
        </Route>
        <Route path="followup" element={<FollowupPage />} />
        <Route path="parties" element={<PartiesPage />} />
        <Route path="flow" element={<DocumentFlowPage />} />
        <Route element={<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.reports} />}>
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
        </Route>
        <Route element={<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.finance} />}>
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
          <Route path="accounts/vendor-bills" element={<VendorBillsPage />} />
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
          <Route path="finance/party-ledgers" element={<PartyLedgersPage />} />
          <Route path="finance/party-ledgers/new" element={<PartyLedgerCreatePage />} />
          <Route path="finance/party-ledgers/:id" element={<PartyLedgerDetailPage />} />
          <Route path="finance/tax-ledgers" element={<TaxLedgersPage />} />
          <Route path="finance/gst/returns" element={<GstReturnsPage />} />
          <Route path="finance/gst/settings" element={<TaxSettingsPage />} />
          <Route path="finance/voucher-types" element={<VoucherTypeConfigPage />} />
          <Route path="finance/voucher-classes" element={<VoucherClassPage />} />
          <Route path="finance/recurring-vouchers" element={<RecurringVouchersPage />} />
          <Route path="finance/registers/post-dated" element={<PostDatedRegisterPage />} />
          <Route path="finance/registers/memorandum" element={<MemorandumRegisterPage />} />
          <Route path="finance/credit-notes/new" element={<CreditNoteCreatePage />} />
          <Route path="finance/debit-notes/new" element={<DebitNoteCreatePage />} />
          <Route path="finance/stock-transfer-vouchers/new" element={<StockTransferCreatePage />} />
          <Route path="finance/tds" element={<TdsSettingsPage />} />
          <Route path="finance/tds/reports" element={<TdsReportsPage />} />
          <Route path="finance/mis" element={<FinancialDashboardPage />} />
          <Route path="finance/mis/fund-flow" element={<FundFlowPage />} />
          <Route path="finance/mis/ratios" element={<RatioAnalysisMisPage />} />
          <Route path="finance/mis/comparative" element={<ComparativeStatementsPage />} />
          <Route path="finance/mis/cash-scenarios" element={<CashFlowScenarioPage />} />
          <Route path="accounts/reports/ledger-activity" element={<LedgerActivityPage />} />
          <Route path="accounts/reports/exceptions" element={<ExceptionReportsPage />} />
          <Route path="procurement/requisitions" element={<RequisitionsPage />} />
          <Route path="procurement/requisitions/:requisitionId" element={<RequisitionDetailPage />} />
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
        </Route>
        <Route element={<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.facility} />}>
          <Route path="finance/facilities/dashboard" element={<FacilityDashboardPage />} />
          <Route path="finance/facilities/new" element={<FacilityCreatePage />} />
          <Route path="finance/facilities/:facilityId/utilizations/new" element={<UtilizationCreatePage />} />
          <Route path="finance/facilities/:facilityId" element={<FacilityDetailPage />} />
          <Route path="finance/facilities" element={<FacilitiesPage />} />
          <Route path="finance/utilizations/:utilizationId" element={<UtilizationDetailPage />} />
          <Route path="finance/business-overview" element={<BusinessOverviewPage />} />
        </Route>
        <Route element={<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.hr} />}>
          <Route path="hr" element={<HrDashboardPage />} />
          <Route path="hr/departments" element={<HrDepartmentsPage />} />
          <Route path="hr/designations" element={<HrDesignationsPage />} />
          <Route path="hr/sections" element={<HrSectionsPage />} />
          <Route path="hr/employees" element={<HrEmployeesPage />} />
          <Route path="hr/employees/ai-onboard" element={<AiEmployeeOnboardingPage />} />
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
          <Route path="hr/payroll/assignments" element={<PayrollEmployeeAssignmentPage />} />
          <Route path="hr/payroll/runs" element={<HrPayrollRunsPage />} />
          <Route path="hr/payroll/advances" element={<HrPayrollAdvancesPage />} />
          <Route path="hr/payroll/bonuses" element={<HrPayrollBonusesPage />} />
          <Route path="hr/payroll/accounting-config" element={<HrPayrollAccountingConfigPage />} />
          <Route path="hr/payroll/statutory" element={<PayrollStatutoryConfigPage />} />
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
          <Route path="hr/ai-insights" element={<HrAiInsightsPage />} />
          <Route path="hr/reports" element={<HrReportsDashboardPage />} />
        </Route>
        <Route path="approvals" element={<AllApprovalsPage />} />
        <Route path="my-signature" element={<MySignaturePage />} />
        <Route element={<PermissionRouteGuard permissionKey={ROUTE_PERMISSION.settings} />}>
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<SettingsOverviewPage />} />
            <Route path="config" element={<ConfigurationPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="currency" element={<CurrencyManagementPage />} />
            <Route path="backup" element={<BackupRestorePage />} />
            <Route path="statutory-compliance" element={<StatutoryCompliancePage />} />
            <Route path="data-import" element={<DataImportPage />} />
            <Route path="bulk-tenant-onboarding" element={<BulkTenantOnboardingPage />} />
            <Route path="bgmea-bulk-onboarding" element={<Navigate to="/app/settings/bulk-tenant-onboarding" replace />} />
            <Route path="tenant" element={<TenantSettingsPage />} />
            <Route path="pricing" element={<PricingSettingsPage />} />
            <Route path="activity-logs" element={<AuditPage />} />
            <Route path="cheque-templates" element={<ChequeTemplatesPage />} />
            <Route path="external-access" element={<ExternalAccessPage />} />
            <Route path="external-access/customers" element={<ExternalCustomerAccessPage />} />
            <Route path="external-access/financiers" element={<ExternalFinancierAccessPage />} />
            <Route path="external-access/suppliers" element={<ExternalSupplierAccessPage />} />
            <Route path="external-access/audit" element={<ExternalAccessAuditPage />} />
          </Route>
        </Route>
        <Route path="tutorials" element={<TutorialsPage />} />
        <Route path="tutorials/:articleId" element={<TutorialArticlePage />} />
        <Route path="*" element={<PlaceholderPage />} />
      </Route>
    </Routes>
  );
}
