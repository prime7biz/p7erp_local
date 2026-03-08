import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenantCurrencySettings, getCurrencySymbol } from "@/lib/currency";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FilePlus,
  FileEdit,
  Eye,
  Calendar,
  CreditCard,
  FileText,
  Wallet,
  DollarSign,
  Send,
  Loader2,
  BarChart3,
  Download,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportToExcel } from '@/lib/exportToExcel';
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ErpTable, StatusBadge } from "@/components/erp/erp-table";
import type { ErpTableColumn, ErpFilter } from "@/components/erp/erp-table";

interface VoucherType {
  id: number;
  code: string;
  name: string;
  prefix: string;
  totalCount: number;
  draftCount: number;
  postedCount: number;
  cancelledCount: number;
}

interface Voucher {
  id: number;
  voucherNumber: string;
  voucherDate: string;
  postingDate: string | null;
  voucherTypeId: number;
  voucherTypeName: string;
  statusId: number;
  statusName: string;
  statusColor: string;
  amount: string;
  description: string | null;
  reference: string | null;
  isPosted: boolean;
  isCancelled: boolean;
  entityType: string | null;
  entityId: number | null;
  preparedById: number;
  preparedByName: string;
  createdAt: string;
}

const STATUS_TABS = [
  { value: "all", label: "All", statusId: undefined },
  { value: "draft", label: "Draft", statusId: "7" },
  { value: "submitted", label: "Submitted", statusId: "8" },
  { value: "checked", label: "Checked", statusId: "9" },
  { value: "recommended", label: "Recommended", statusId: "10" },
  { value: "approved", label: "Approved", statusId: "3" },
  { value: "posted", label: "Posted", statusId: "5" },
  { value: "rejected", label: "Rejected", statusId: "4" },
];

const VouchersDashboard: React.FC = () => {
  const { data: tenantCurrency } = useTenantCurrencySettings();
  const currencySymbol = getCurrencySymbol(tenantCurrency?.baseCurrency || "BDT");
  const { data, isLoading, isError } = useQuery<{
    voucherTypes: VoucherType[];
    periodicSummary: any[];
  }>({
    queryKey: ["/api/accounting/vouchers/dashboard"],
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Voucher Types</CardTitle>
            <CardDescription>Overview of voucher statistics by type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="bg-red-50 border-red-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-red-800">Error Loading Dashboard</CardTitle>
          <CardDescription className="text-red-700">
            Could not load the dashboard data. Please try again later.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xl">Voucher Types</CardTitle>
          <CardDescription>Overview of voucher statistics by type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.voucherTypes.map((type) => (
              <Card key={type.id} className="bg-white border shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="py-4 px-5">
                  <CardTitle className="text-base font-medium flex items-center">
                    {type.name === "Payment" && <Wallet className="mr-2 h-4 w-4 text-red-500" />}
                    {type.name === "Receipt" && <DollarSign className="mr-2 h-4 w-4 text-green-500" />}
                    {type.name === "Journal" && <FileText className="mr-2 h-4 w-4 text-blue-500" />}
                    {type.name === "Contra" && <CreditCard className="mr-2 h-4 w-4 text-purple-500" />}
                    {type.name}
                  </CardTitle>
                  <CardDescription className="text-xs -mt-1">{type.code}</CardDescription>
                </CardHeader>
                <CardContent className="py-0 px-5 pb-4">
                  <div className="text-2xl font-semibold mb-2">{type.totalCount}</div>
                  <div className="grid grid-cols-3 gap-1 text-xs">
                    <div>
                      <span className="text-gray-500">Draft: </span>
                      <span className="font-medium">{type.draftCount}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Posted: </span>
                      <span className="font-medium">{type.postedCount}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Cancelled: </span>
                      <span className="font-medium">{type.cancelledCount}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {data.periodicSummary && data.periodicSummary.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">Monthly Summary</CardTitle>
            <CardDescription>Voucher count and amount by month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Count</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.periodicSummary.slice(0, 6).map((period, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {period.period ? format(new Date(period.period), 'MMM yyyy') : '-'}
                      </TableCell>
                      <TableCell>{period.count}</TableCell>
                      <TableCell className="text-right">
                        {typeof period.totalAmount === 'number'
                          ? `${currencySymbol}${period.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : `${currencySymbol}0.00`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default function VouchersPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: tenantCurrency } = useTenantCurrencySettings();
  const currencySymbol = getCurrencySymbol(tenantCurrency?.baseCurrency || "BDT");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const { data: voucherTypes, isLoading: isLoadingTypes } = useQuery<VoucherType[]>({
    queryKey: ["/api/accounting/vouchers/types"],
    retry: false,
  });

  const queryParams = new URLSearchParams();
  if (searchTerm) queryParams.append("search", searchTerm);
  const voucherTypeId = activeFilters.voucherTypeId;
  if (voucherTypeId && voucherTypeId !== 'all') queryParams.append("voucherTypeId", voucherTypeId);
  if (fromDate) queryParams.append("fromDate", fromDate);
  if (toDate) queryParams.append("toDate", toDate);

  const selectedTab = STATUS_TABS.find(t => t.value === activeTab);
  if (selectedTab?.statusId) {
    queryParams.append("statusId", selectedTab.statusId);
  }

  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";

  const { data: vouchers, isLoading } = useQuery<Voucher[]>({
    queryKey: [`/api/accounting/vouchers${queryString}`],
    retry: false,
  });

  const statusActionMutation = useMutation({
    mutationFn: async ({ id, statusId, actionName, comments }: { id: number; statusId: number; actionName: string; comments: string }) => {
      await apiRequest(`/api/accounting/vouchers/${id}/change-status`, "POST", {
        statusId, actionName, comments,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ predicate: (query) => typeof query.queryKey[0] === 'string' && (query.queryKey[0] as string).startsWith('/api/accounting/vouchers') });
      toast({ title: `${variables.actionName} completed successfully` });
    },
    onError: (error: Error, variables) => {
      toast({ title: `Failed to ${variables.actionName.toLowerCase()}`, description: error.message, variant: "destructive" });
    },
  });

  const handleCreateVoucher = () => setLocation("/accounts/vouchers/new");
  const handleViewVoucher = (id: number) => setLocation(`/accounts/vouchers/view/${id}`);
  const handleEditVoucher = (id: number) => setLocation(`/accounts/vouchers/edit/${id}`);

  const columns: ErpTableColumn<Voucher>[] = [
    { key: "voucherNumber", label: "Voucher No.", sticky: true, width: "130px" },
    {
      key: "voucherDate", label: "Date",
      render: (row) => format(new Date(row.voucherDate), 'dd MMM yyyy'),
    },
    { key: "voucherTypeName", label: "Type" },
    {
      key: "description", label: "Narration",
      render: (row) => (
        <span className="max-w-[200px] truncate block">{row.description || '—'}</span>
      ),
    },
    { key: "reference", label: "Reference", render: (row) => row.reference || '—' },
    {
      key: "statusName", label: "Status",
      render: (row) => {
        const submitButton = row.statusId === 7 ? (
          <Button
            size="sm" variant="outline"
            className="h-6 px-2 text-xs bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 ml-1"
            onClick={(e) => {
              e.stopPropagation();
              statusActionMutation.mutate({
                id: row.id, statusId: 8, actionName: "Submit", comments: "Action performed",
              });
            }}
            disabled={statusActionMutation.isPending}
          >
            {statusActionMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
            Submit
          </Button>
        ) : null;
        return (
          <div className="flex items-center gap-1">
            <StatusBadge status={row.statusName} />
            {submitButton}
          </div>
        );
      },
    },
    {
      key: "amount", label: "Amount", align: "right", isMoney: true,
      render: (row) => `${currencySymbol}${parseFloat(row.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    { key: "preparedByName", label: "Created By" },
  ];

  const voucherTypeOptions = Array.isArray(voucherTypes)
    ? voucherTypes.map((t) => ({ label: t.name, value: t.id.toString() }))
    : [];

  const filters: ErpFilter[] = [
    {
      key: "voucherTypeId", label: "Voucher Type", type: "select",
      options: voucherTypeOptions,
    },
  ];

  const handleFilterChange = (key: string, value: string) => {
    setActiveFilters((prev) => {
      if (!value) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  };

  const handleClearFilters = () => {
    setActiveFilters({});
    setFromDate("");
    setToDate("");
    setActiveTab("all");
  };

  const handleExport = (fmt: "xlsx" | "csv") => {
    exportToExcel(
      Array.isArray(vouchers) ? vouchers : [],
      [
        { key: "voucherNumber", header: "Voucher No" },
        { key: "voucherTypeName", header: "Type" },
        { key: "voucherDate", header: "Date" },
        { key: "description", header: "Narration" },
        { key: "reference", header: "Reference" },
        { key: "amount", header: "Amount" },
        { key: "statusName", header: "Status" },
        { key: "preparedByName", header: "Created By" },
      ],
      "vouchers",
      fmt
    );
  };

  const pageActions = (
    <div className="flex space-x-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleExport("xlsx")}>Export as Excel</DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport("csv")}>Export as CSV</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button onClick={handleCreateVoucher}>
        <FilePlus className="mr-2 h-4 w-4" />
        New Voucher
      </Button>
    </div>
  );

  return (
    <DashboardContainer
      title="Voucher Management"
      subtitle="Create, manage, and view financial vouchers"
      actions={pageActions}
    >
      <VouchersDashboard />

      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.value}
              variant={activeTab === tab.value ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab(tab.value)}
              className={activeTab === tab.value ? "" : "text-muted-foreground"}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 mb-4">
        <div className="flex items-center gap-1">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input type="date" placeholder="From" value={fromDate}
            onChange={(e) => setFromDate(e.target.value)} className="w-[140px] h-10" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" placeholder="To" value={toDate}
            onChange={(e) => setToDate(e.target.value)} className="w-[140px] h-10" />
        </div>
        {(fromDate || toDate) && (
          <Button variant="outline" size="sm" onClick={() => { setFromDate(""); setToDate(""); }} className="h-10">
            Clear Dates
          </Button>
        )}
      </div>

      <ErpTable
        tableId="vouchers"
        columns={columns}
        data={Array.isArray(vouchers) ? vouchers : []}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search vouchers..."
        filters={filters}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        showTotals={true}
        emptyIcon={<FileText className="h-12 w-12 opacity-40" />}
        emptyTitle="No vouchers found"
        emptyDescription="Create your first voucher to get started."
        emptyAction={{ label: "Create Voucher", onClick: handleCreateVoucher }}
        rowActions={(row) => {
          const actions: any[] = [
            { label: "View", icon: <Eye className="h-4 w-4 mr-2" />, onClick: () => handleViewVoucher(row.id) },
          ];
          if (row.statusId === 7 || row.statusId === 4) {
            actions.push({ label: "Edit", icon: <FileEdit className="h-4 w-4 mr-2" />, onClick: () => handleEditVoucher(row.id) });
          }
          actions.push({ label: "View Audit Trail", icon: <BarChart3 className="h-4 w-4 mr-2" />, onClick: () => handleViewVoucher(row.id) });
          return actions;
        }}
      />
    </DashboardContainer>
  );
}
