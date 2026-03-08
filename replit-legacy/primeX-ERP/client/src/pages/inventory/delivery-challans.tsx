import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/empty-state";
import { Plus, Search, Filter, MoreHorizontal, Eye, Edit, Trash2, FileText, Loader2, Printer, Truck, Package, CheckCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { ModuleAIPanel } from "@/components/ai/ModuleAIPanel";

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "CHECKED", label: "Checked" },
  { value: "RECOMMENDED", label: "Recommended" },
  { value: "APPROVED", label: "Approved" },
  { value: "POSTED", label: "Posted" },
  { value: "REJECTED", label: "Rejected" },
];

function getStatusBadge(status: string) {
  switch (status) {
    case "DRAFT":
      return <Badge variant="outline">Draft</Badge>;
    case "SUBMITTED":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Submitted</Badge>;
    case "CHECKED":
      return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100">Checked</Badge>;
    case "RECOMMENDED":
      return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Recommended</Badge>;
    case "APPROVED":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>;
    case "POSTED":
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Posted</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatCurrency(amount: string | number | null | undefined) {
  if (!amount) return "BDT 0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `BDT ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd MMM yyyy");
  } catch {
    return dateStr;
  }
}

export default function DeliveryChallansPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: summaryData } = useQuery<any>({
    queryKey: ["/api/delivery-challans/summary"],
  });

  const { data: challanData, isLoading } = useQuery<any>({
    queryKey: ["/api/delivery-challans", statusFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchQuery) params.set("search", searchQuery);
      const res = await fetch(`/api/delivery-challans?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const challans = challanData?.challans || [];

  return (
    <DashboardContainer
      title="Delivery Challans"
      subtitle="Manage goods dispatch and delivery documentation"
      actions={
        <div className="flex items-center gap-2">
          <Link href="/inventory/delivery-challans/new">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New Delivery Challan
            </Button>
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Challans</p>
                <p className="text-2xl font-bold">{summaryData?.totalChallans || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-100">
                <Clock className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Draft</p>
                <p className="text-2xl font-bold">{summaryData?.statusCounts?.DRAFT || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold">{summaryData?.statusCounts?.APPROVED || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100">
                <Truck className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Posted</p>
                <p className="text-2xl font-bold">{summaryData?.statusCounts?.POSTED || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ModuleAIPanel
        title="AI Delivery & Security Analysis"
        endpoint="/api/module-ai/delivery-security"
        requestData={{}}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search challan number, vehicle..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Delivery Challans</CardTitle>
          <CardDescription>
            {statusFilter !== "all" || searchQuery ? (
              <span className="flex items-center gap-1">
                <Filter className="h-4 w-4" /> Filtered results
              </span>
            ) : (
              <span>Showing all delivery challans</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-96 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading delivery challans...</span>
            </div>
          ) : !challans || challans.length === 0 ? (
            <EmptyState
              icon={<Truck className="h-10 w-10" />}
              title="No delivery challans found"
              description="Get started by creating your first delivery challan."
              action={
                <Link href="/inventory/delivery-challans/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" /> Create Delivery Challan
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Challan No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Total Qty</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {challans.map((dc: any) => (
                    <TableRow key={dc.id}>
                      <TableCell>
                        <Link href={`/inventory/delivery-challans/${dc.id}`}>
                          <span className="font-semibold text-primary hover:underline cursor-pointer">
                            {dc.challanNumber}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>{formatDate(dc.challanDate)}</TableCell>
                      <TableCell>{dc.partyName || "—"}</TableCell>
                      <TableCell>{dc.itemsCount || 0}</TableCell>
                      <TableCell className="text-right">{parseFloat(dc.totalQuantity || "0").toLocaleString()}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(dc.totalAmount)}</TableCell>
                      <TableCell>{getStatusBadge(dc.workflowStatus)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <Link href={`/inventory/delivery-challans/${dc.id}`}>
                              <DropdownMenuItem>
                                <Eye className="mr-2 h-4 w-4" /> View
                              </DropdownMenuItem>
                            </Link>
                            {dc.workflowStatus === "DRAFT" && (
                              <Link href={`/inventory/delivery-challans/${dc.id}`}>
                                <DropdownMenuItem>
                                  <Edit className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                              </Link>
                            )}
                            <Link href={`/inventory/delivery-challans/${dc.id}/print`}>
                              <DropdownMenuItem>
                                <Printer className="mr-2 h-4 w-4" /> Print
                              </DropdownMenuItem>
                            </Link>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardContainer>
  );
}