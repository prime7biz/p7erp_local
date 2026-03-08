import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { formatMoney } from "@/lib/formatters";

interface LedgerEntry {
  id: number;
  entry_date: string;
  document_type: string;
  document_number: string;
  item_name: string;
  item_code: string;
  qty_in: number;
  qty_out: number;
  balance_qty: number;
  rate: number;
  value_in: number;
  value_out: number;
}

interface LedgerResponse {
  entries: LedgerEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export default function StockLedgerPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [docType, setDocType] = useState("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const queryParams = new URLSearchParams();
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);
  if (itemSearch.trim()) queryParams.set("itemSearch", itemSearch.trim());
  if (docType !== "ALL") queryParams.set("documentType", docType);
  queryParams.set("page", String(page));
  queryParams.set("pageSize", String(pageSize));

  const { data, isLoading } = useQuery<LedgerResponse>({
    queryKey: ["/api/stock-ledger/ledger", dateFrom, dateTo, itemSearch, docType, page],
    queryFn: async () => {
      const res = await fetch(`/api/stock-ledger/ledger?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ledger");
      return res.json();
    },
  });

  const entries = data?.entries ?? (Array.isArray(data) ? data : []);
  const total = data?.total ?? entries.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function getDocTypeBadge(type: string) {
    const map: Record<string, string> = {
      DELIVERY_CHALLAN: "bg-blue-100 text-blue-800",
      GRN: "bg-green-100 text-green-800",
      STOCK_ADJUSTMENT: "bg-purple-100 text-purple-800",
    };
    return <Badge className={map[type] || "bg-gray-100 text-gray-800"}>{(type || "UNKNOWN").replace(/_/g, " ")}</Badge>;
  }

  return (
    <DashboardContainer
      title="Stock Ledger"
      subtitle="Detailed stock movement records"
      actions={
        <Link href="/inventory/stock-dashboard">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
        </Link>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label>Date From</Label>
                <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
              </div>
              <div>
                <Label>Date To</Label>
                <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
              </div>
              <div>
                <Label>Item Search</Label>
                <Input
                  value={itemSearch}
                  onChange={(e) => { setItemSearch(e.target.value); setPage(1); }}
                  placeholder="Search by item name..."
                />
              </div>
              <div>
                <Label>Document Type</Label>
                <Select value={docType} onValueChange={(v) => { setDocType(v); setPage(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Types</SelectItem>
                    <SelectItem value="DELIVERY_CHALLAN">Delivery Challan</SelectItem>
                    <SelectItem value="GRN">GRN</SelectItem>
                    <SelectItem value="STOCK_ADJUSTMENT">Stock Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm">No ledger entries found</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Doc Type</TableHead>
                        <TableHead>Doc Number</TableHead>
                        <TableHead>Item Name</TableHead>
                        <TableHead className="text-right">Qty In</TableHead>
                        <TableHead className="text-right">Qty Out</TableHead>
                        <TableHead className="text-right">Balance Qty</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Value In</TableHead>
                        <TableHead className="text-right">Value Out</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry: LedgerEntry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap">{entry.entry_date ? new Date(entry.entry_date).toLocaleDateString() : "-"}</TableCell>
                          <TableCell>{getDocTypeBadge(entry.document_type)}</TableCell>
                          <TableCell className="font-mono text-sm">{entry.document_number}</TableCell>
                          <TableCell>{entry.item_name}</TableCell>
                          <TableCell className="text-right text-green-600 font-medium">
                            {entry.qty_in ? entry.qty_in : "-"}
                          </TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            {entry.qty_out ? entry.qty_out : "-"}
                          </TableCell>
                          <TableCell className="text-right font-semibold">{entry.balance_qty}</TableCell>
                          <TableCell className="text-right">{formatMoney(entry.rate || 0)}</TableCell>
                          <TableCell className="text-right text-green-600">
                            {entry.value_in ? formatMoney(entry.value_in) : "-"}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {entry.value_out ? formatMoney(entry.value_out) : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} of {total} entries
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">Page {page} of {totalPages}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardContainer>
  );
}