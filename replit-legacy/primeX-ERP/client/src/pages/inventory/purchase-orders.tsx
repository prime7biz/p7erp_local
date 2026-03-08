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
import { Plus, Search, Filter, Download, Printer, MoreHorizontal, Eye, Edit, Trash2, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "partially_received", label: "Partially Received" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

function getStatusBadge(status: string) {
  switch (status) {
    case "draft":
      return <Badge variant="outline">Draft</Badge>;
    case "pending_approval":
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending Approval</Badge>;
    case "approved":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>;
    case "partially_received":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Partially Received</Badge>;
    case "received":
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Received</Badge>;
    case "cancelled":
      return <Badge variant="destructive">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatCurrency(amount: string | number | null | undefined, currency: string = "BDT") {
  if (!amount) return `${currency} 0.00`;
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${currency} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd MMM yyyy");
  } catch {
    return dateStr;
  }
}

export default function PurchaseOrdersPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: purchaseOrders, isLoading } = useQuery<any[]>({
    queryKey: ["/api/purchase-orders"],
  });

  const { data: vendors } = useQuery<any[]>({
    queryKey: ["/api/vendors"],
  });

  const filtered = (purchaseOrders || []).filter((po: any) => {
    if (statusFilter !== "all" && po.status !== statusFilter) return false;
    if (vendorFilter !== "all" && String(po.vendorId) !== vendorFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const poNumber = (po.poNumber || po.purchaseOrderNumber || "").toLowerCase();
      const vendorName = (po.vendorName || "").toLowerCase();
      if (!poNumber.includes(q) && !vendorName.includes(q)) return false;
    }
    if (dateFrom && po.orderDate && new Date(po.orderDate) < new Date(dateFrom)) return false;
    if (dateTo && po.orderDate && new Date(po.orderDate) > new Date(dateTo)) return false;
    return true;
  });

  return (
    <DashboardContainer
      title="Purchase Orders"
      subtitle="Manage purchase orders for materials and supplies"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm">
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Link href="/inventory/purchase-orders/new">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New Purchase Order
            </Button>
          </Link>
        </div>
      }
    >
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search PO number, vendor..."
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

        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger>
            <SelectValue placeholder="All Vendors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vendors</SelectItem>
            {Array.isArray(vendors) && vendors.map((v: any) => (
              <SelectItem key={v.id} value={String(v.id)}>{v.name || v.vendorName}</SelectItem>
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
          <CardTitle>Purchase Orders</CardTitle>
          <CardDescription>
            {statusFilter !== "all" || vendorFilter !== "all" || searchQuery ? (
              <span className="flex items-center gap-1">
                <Filter className="h-4 w-4" /> Filtered results
              </span>
            ) : (
              <span>Showing all purchase orders</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-96 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading purchase orders...</span>
            </div>
          ) : !filtered || filtered.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-10 w-10" />}
              title="No purchase orders found"
              description="Get started by creating your first purchase order."
              action={
                <Link href="/inventory/purchase-orders/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" /> Create Purchase Order
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Expected Delivery</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((po: any) => (
                    <TableRow key={po.id}>
                      <TableCell>
                        <Link href={`/inventory/purchase-orders/${po.id}`}>
                          <span className="font-semibold text-primary hover:underline cursor-pointer">
                            {po.poNumber || po.purchaseOrderNumber || `PO-${po.id}`}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>{po.vendorName || "—"}</TableCell>
                      <TableCell>{formatDate(po.orderDate)}</TableCell>
                      <TableCell>{formatDate(po.expectedDeliveryDate)}</TableCell>
                      <TableCell>{getStatusBadge(po.status)}</TableCell>
                      <TableCell>{po.currency || "BDT"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(po.totalAmount || po.grandTotal, po.currency)}
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
                            <Link href={`/inventory/purchase-orders/${po.id}`}>
                              <DropdownMenuItem>
                                <Eye className="mr-2 h-4 w-4" /> View
                              </DropdownMenuItem>
                            </Link>
                            {po.status === "draft" && (
                              <>
                                <Link href={`/inventory/purchase-orders/${po.id}/edit`}>
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