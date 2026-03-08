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
import { Plus, Search, Filter, Download, Printer, MoreHorizontal, Eye, Edit, Trash2, Package, Loader2 } from "lucide-react";
import { format } from "date-fns";

const statusOptions = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "inspecting", label: "Inspecting" },
  { value: "accepted", label: "Accepted" },
  { value: "partially_accepted", label: "Partially Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "completed", label: "Completed" },
];

function getStatusBadge(status: string) {
  switch (status) {
    case "draft":
      return <Badge variant="outline">Draft</Badge>;
    case "inspecting":
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Inspecting</Badge>;
    case "accepted":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Accepted</Badge>;
    case "partially_accepted":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Partially Accepted</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>;
    case "completed":
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Completed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd MMM yyyy");
  } catch {
    return dateStr;
  }
}

export default function GoodsReceivingPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: grns, isLoading } = useQuery<any[]>({
    queryKey: ["/api/grn"],
  });

  const { data: vendors } = useQuery<any[]>({
    queryKey: ["/api/vendors"],
  });

  const filtered = (grns || []).filter((grn: any) => {
    if (statusFilter !== "all" && grn.status !== statusFilter) return false;
    if (vendorFilter !== "all" && String(grn.vendorId) !== vendorFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const grnNumber = (grn.grnNumber || "").toLowerCase();
      const vendorName = (grn.vendorName || "").toLowerCase();
      const invoiceNumber = (grn.invoiceNumber || "").toLowerCase();
      const poNumber = (grn.poNumber || "").toLowerCase();
      if (!grnNumber.includes(q) && !vendorName.includes(q) && !invoiceNumber.includes(q) && !poNumber.includes(q)) return false;
    }
    if (dateFrom && grn.receivingDate && new Date(grn.receivingDate) < new Date(dateFrom)) return false;
    if (dateTo && grn.receivingDate && new Date(grn.receivingDate) > new Date(dateTo)) return false;
    return true;
  });

  return (
    <DashboardContainer
      title="Goods Receiving Notes"
      subtitle="Manage goods receiving notes for incoming materials"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm">
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Link href="/inventory/goods-receiving/new">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> New GRN
            </Button>
          </Link>
        </div>
      }
    >
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search GRN, vendor, invoice..."
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
          <CardTitle>Goods Receiving Notes</CardTitle>
          <CardDescription>
            {statusFilter !== "all" || vendorFilter !== "all" || searchQuery ? (
              <span className="flex items-center gap-1">
                <Filter className="h-4 w-4" /> Filtered results
              </span>
            ) : (
              <span>Showing all goods receiving notes</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-96 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading goods receiving notes...</span>
            </div>
          ) : !filtered || filtered.length === 0 ? (
            <EmptyState
              icon={<Package className="h-10 w-10" />}
              title="No goods receiving notes found"
              description="Get started by creating your first goods receiving note."
              action={
                <Link href="/inventory/goods-receiving/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" /> Create GRN
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>GRN Number</TableHead>
                    <TableHead>PO Reference</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Receiving Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Invoice Number</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((grn: any) => (
                    <TableRow key={grn.id}>
                      <TableCell>
                        <Link href={`/inventory/goods-receiving/${grn.id}`}>
                          <span className="font-semibold text-primary hover:underline cursor-pointer">
                            {grn.grnNumber || `GRN-${grn.id}`}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>{grn.poNumber || "—"}</TableCell>
                      <TableCell>{grn.vendorName || "—"}</TableCell>
                      <TableCell>{grn.warehouseName || "—"}</TableCell>
                      <TableCell>{formatDate(grn.receivingDate)}</TableCell>
                      <TableCell>{getStatusBadge(grn.status)}</TableCell>
                      <TableCell>{grn.invoiceNumber || "—"}</TableCell>
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
                            <Link href={`/inventory/goods-receiving/${grn.id}`}>
                              <DropdownMenuItem>
                                <Eye className="mr-2 h-4 w-4" /> View
                              </DropdownMenuItem>
                            </Link>
                            {grn.status === "draft" && (
                              <>
                                <Link href={`/inventory/goods-receiving/${grn.id}/edit`}>
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
