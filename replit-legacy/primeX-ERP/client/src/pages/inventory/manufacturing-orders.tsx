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
import { Plus, Search, Filter, Download, Printer, MoreHorizontal, Eye, Edit, Trash2, Factory, Loader2 } from "lucide-react";
import { format } from "date-fns";

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function getStatusBadge(status: string) {
  switch (status) {
    case "draft":
      return <Badge variant="outline">Draft</Badge>;
    case "planned":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Planned</Badge>;
    case "in_progress":
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">In Progress</Badge>;
    case "on_hold":
      return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">On Hold</Badge>;
    case "completed":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Completed</Badge>;
    case "cancelled":
      return <Badge variant="destructive">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getStageBadge(stage: string | null | undefined) {
  if (!stage) return <span className="text-muted-foreground">—</span>;
  const formatted = stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">{formatted}</Badge>;
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

export default function ManufacturingOrdersPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: orders, isLoading } = useQuery<any[]>({
    queryKey: ["/api/manufacturing-orders"],
  });

  const filtered = (orders || []).filter((mo: any) => {
    if (statusFilter !== "all" && mo.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const moNumber = (mo.moNumber || "").toLowerCase();
      const itemName = (mo.finishedItemName || mo.itemName || "").toLowerCase();
      if (!moNumber.includes(q) && !itemName.includes(q)) return false;
    }
    if (dateFrom && mo.plannedStartDate && new Date(mo.plannedStartDate) < new Date(dateFrom)) return false;
    if (dateTo && mo.plannedEndDate && new Date(mo.plannedEndDate) > new Date(dateTo)) return false;
    return true;
  });

  return (
    <DashboardContainer
      title="Manufacturing Orders"
      subtitle="Track production from raw materials to finished garments"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm">
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Link href="/inventory/manufacturing-orders/new">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New Manufacturing Order
            </Button>
          </Link>
        </div>
      }
    >
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search MO number, item..."
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

        <Input
          type="date"
          placeholder="From date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <Input
          type="date"
          placeholder="To date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Factory className="h-5 w-5" />
            Manufacturing Orders
          </CardTitle>
          <CardDescription>
            {statusFilter !== "all" || searchQuery ? (
              <span className="flex items-center gap-1">
                <Filter className="h-4 w-4" /> Filtered results — {filtered.length} order(s)
              </span>
            ) : (
              <span>Showing all manufacturing orders ({filtered.length})</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-96 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading manufacturing orders...</span>
            </div>
          ) : !filtered || filtered.length === 0 ? (
            <EmptyState
              icon={<Factory className="h-10 w-10" />}
              title="No manufacturing orders found"
              description="Get started by creating your first manufacturing order to track garment production."
              action={
                <Link href="/inventory/manufacturing-orders/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" /> Create Manufacturing Order
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>MO Number</TableHead>
                    <TableHead>Finished Item</TableHead>
                    <TableHead className="text-right">Planned Qty</TableHead>
                    <TableHead className="text-right">Completed Qty</TableHead>
                    <TableHead className="text-right">Process Loss %</TableHead>
                    <TableHead>Current Stage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Planned Start</TableHead>
                    <TableHead>Planned End</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((mo: any) => {
                    const processLoss = parseFloat(mo.processLossPercentage || mo.totalProcessLoss || "0");
                    return (
                      <TableRow key={mo.id}>
                        <TableCell>
                          <Link href={`/inventory/manufacturing-orders/${mo.id}`}>
                            <span className="font-semibold text-primary hover:underline cursor-pointer">
                              {mo.moNumber || `MO-${mo.id}`}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>{mo.finishedItemName || mo.itemName || "—"}</TableCell>
                        <TableCell className="text-right">{mo.plannedQuantity || 0}</TableCell>
                        <TableCell className="text-right">{mo.completedQuantity || 0}</TableCell>
                        <TableCell className={`text-right ${processLoss > 5 ? "text-red-600 font-medium" : ""}`}>
                          {processLoss > 0 ? `${processLoss.toFixed(1)}%` : "—"}
                        </TableCell>
                        <TableCell>{getStageBadge(mo.currentStage)}</TableCell>
                        <TableCell>{getStatusBadge(mo.status)}</TableCell>
                        <TableCell>{formatDate(mo.plannedStartDate)}</TableCell>
                        <TableCell>{formatDate(mo.plannedEndDate)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(mo.totalCost)}
                        </TableCell>
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
                              <Link href={`/inventory/manufacturing-orders/${mo.id}`}>
                                <DropdownMenuItem>
                                  <Eye className="mr-2 h-4 w-4" /> View Details
                                </DropdownMenuItem>
                              </Link>
                              {mo.status === "draft" && (
                                <>
                                  <Link href={`/inventory/manufacturing-orders/${mo.id}`}>
                                    <DropdownMenuItem>
                                      <Edit className="mr-2 h-4 w-4" /> Edit
                                    </DropdownMenuItem>
                                  </Link>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardContainer>
  );
}
