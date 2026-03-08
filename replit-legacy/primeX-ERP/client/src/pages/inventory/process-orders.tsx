import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ArrowRight, Factory, Truck, RotateCcw, Eye, Loader2 } from "lucide-react";

const PROCESS_TYPES = [
  { value: "KNITTING", label: "Knitting" },
  { value: "DYEING", label: "Dyeing" },
  { value: "FINISHING", label: "Finishing" },
  { value: "CUTTING", label: "Cutting" },
  { value: "WASHING", label: "Washing" },
  { value: "PRINTING", label: "Printing" },
];

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "ISSUED", label: "Issued" },
  { value: "RECEIVED", label: "Received" },
  { value: "APPROVED", label: "Approved" },
];

function getStatusBadge(status: string) {
  switch (status?.toUpperCase()) {
    case "DRAFT":
      return <Badge variant="outline" className="bg-gray-100 text-gray-800 hover:bg-gray-100">Draft</Badge>;
    case "ISSUED":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Issued</Badge>;
    case "RECEIVED":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Received</Badge>;
    case "APPROVED":
      return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Approved</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getMethodBadge(method: string) {
  if (method === "subcontract") {
    return (
      <span className="inline-flex items-center gap-1 text-sm">
        <Truck className="h-3.5 w-3.5 text-orange-600" />
        <span>Subcontract</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Factory className="h-3.5 w-3.5 text-blue-600" />
      <span>In-House</span>
    </span>
  );
}

function ProcessOrdersPage() {
  const [processTypeFilter, setProcessTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: orders, isLoading } = useQuery<any[]>({
    queryKey: ["/api/process-orders"],
  });

  const filtered = (orders || []).filter((po: any) => {
    if (processTypeFilter !== "all" && po.processType !== processTypeFilter) return false;
    if (statusFilter !== "all" && po.status?.toUpperCase() !== statusFilter) return false;
    return true;
  });

  const totalCount = (orders || []).length;
  const draftCount = (orders || []).filter((o: any) => o.status?.toUpperCase() === "DRAFT").length;
  const issuedCount = (orders || []).filter((o: any) => o.status?.toUpperCase() === "ISSUED").length;
  const receivedCount = (orders || []).filter((o: any) => o.status?.toUpperCase() === "RECEIVED").length;
  const approvedCount = (orders || []).filter((o: any) => o.status?.toUpperCase() === "APPROVED").length;

  return (
    <DashboardContainer
      title="Process Orders"
      subtitle="Material conversion tracking (Yarn → Greige → Finished Fabric)"
      actions={
        <Link href="/inventory/process-orders/new">
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> New Process Order
          </Button>
        </Link>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{totalCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-sm text-muted-foreground">Draft</div>
            <div className="text-2xl font-bold text-gray-600">{draftCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-sm text-muted-foreground">Issued</div>
            <div className="text-2xl font-bold text-blue-600">{issuedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-sm text-muted-foreground">Received</div>
            <div className="text-2xl font-bold text-green-600">{receivedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-sm text-muted-foreground">Approved</div>
            <div className="text-2xl font-bold text-purple-600">{approvedCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={processTypeFilter} onValueChange={setProcessTypeFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Process Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {PROCESS_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(processTypeFilter !== "all" || statusFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setProcessTypeFilter("all"); setStatusFilter("all"); }}
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Clear Filters
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="px-6 py-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Factory className="h-5 w-5" />
            Process Orders
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading process orders...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Factory className="h-10 w-10 mb-3" />
              <p className="text-lg font-medium">No process orders found</p>
              <p className="text-sm">Create your first process order to start tracking material conversions.</p>
              <Link href="/inventory/process-orders/new">
                <Button className="mt-4">
                  <Plus className="mr-2 h-4 w-4" /> Create Process Order
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Process #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Input Material</TableHead>
                    <TableHead>Output Material</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((po: any) => (
                    <TableRow key={po.id}>
                      <TableCell>
                        <Link href={`/inventory/process-orders/${po.id}`}>
                          <span className="font-semibold text-primary hover:underline cursor-pointer">
                            {po.processNumber || `PO-${po.id}`}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {PROCESS_TYPES.find((t) => t.value === po.processType)?.label || po.processType}
                        </Badge>
                      </TableCell>
                      <TableCell>{getMethodBadge(po.processMethod)}</TableCell>
                      <TableCell>{po.inputItemName || po.inputMaterial || "—"}</TableCell>
                      <TableCell>{po.outputItemName || po.outputMaterial || "—"}</TableCell>
                      <TableCell className="text-right">{po.inputQuantity || 0}</TableCell>
                      <TableCell>{getStatusBadge(po.status)}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/inventory/process-orders/${po.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="mr-1 h-4 w-4" /> View
                          </Button>
                        </Link>
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

export default ProcessOrdersPage;
