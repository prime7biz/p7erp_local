import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Search, Shirt, Globe, AlertTriangle, CheckCircle2, Clock, Circle,
  Package, FileText, Ship, DollarSign, ArrowRight, ChevronDown, ChevronRight,
  Activity, Banknote, AlertCircle, TrendingUp, CalendarDays,
} from "lucide-react";

type TimelineStep = {
  label: string;
  status: "done" | "in-progress" | "pending" | "blocked";
  date?: string;
  detail?: string;
  icon?: any;
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "done": return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case "in-progress": return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />;
    case "blocked": return <AlertCircle className="h-5 w-5 text-red-500" />;
    default: return <Circle className="h-5 w-5 text-gray-300" />;
  }
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-100 text-red-700 border-red-200",
    warning: "bg-orange-100 text-orange-700 border-orange-200",
    info: "bg-blue-100 text-blue-700 border-blue-200",
  };
  return <Badge variant="outline" className={colors[severity] || colors.info}>{severity}</Badge>;
}

function TimelineView({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="relative">
      {steps.map((step, i) => (
        <div key={i} className="flex gap-4 pb-6 last:pb-0">
          <div className="flex flex-col items-center">
            <StatusIcon status={step.status} />
            {i < steps.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
          </div>
          <div className="flex-1 pb-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{step.label}</span>
              <Badge variant="outline" className="text-xs capitalize">{step.status.replace("-", " ")}</Badge>
            </div>
            {step.date && <p className="text-xs text-gray-500 mt-0.5">{step.date}</p>}
            {step.detail && <p className="text-xs text-gray-600 mt-0.5">{step.detail}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OrderFollowupPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("style");
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(null);
  const [selectedExportCaseId, setSelectedExportCaseId] = useState<number | null>(null);
  const [searchSubmitted, setSearchSubmitted] = useState("");

  const { data: searchResults } = useQuery({
    queryKey: ["/api/followup/search", searchSubmitted],
    enabled: searchSubmitted.length >= 2,
  });

  const { data: styleData, isLoading: styleLoading } = useQuery({
    queryKey: ["/api/followup/style", selectedStyleId],
    enabled: !!selectedStyleId,
  });

  const { data: ecData, isLoading: ecLoading } = useQuery({
    queryKey: ["/api/followup/export-case", selectedExportCaseId],
    enabled: !!selectedExportCaseId,
  });

  const { data: alerts } = useQuery({ queryKey: ["/api/followup/alerts"] });

  const { data: styles } = useQuery({ queryKey: ["/api/merch/styles"] });
  const { data: exportCases } = useQuery({ queryKey: ["/api/export-cases"] });

  const handleSearch = () => setSearchSubmitted(searchQuery);

  function buildStyleTimeline(data: any): TimelineStep[] {
    const steps: TimelineStep[] = [];
    if (data?.inquiries?.length > 0) {
      const inq = data.inquiries[0];
      steps.push({ label: `Inquiry: ${inq.inquiryId}`, status: "done", date: inq.createdAt, detail: `Qty: ${inq.projectedQuantity}, Target: ${inq.targetPrice}` });
    } else {
      steps.push({ label: "Inquiry", status: "pending" });
    }
    if (data?.quotations?.length > 0) {
      const q = data.quotations[0];
      steps.push({ label: `Quotation: ${q.quotationId}`, status: q.workflowStatus === "APPROVED" ? "done" : "in-progress", date: q.quotationDate, detail: `Price: ${q.quotedPrice}` });
    } else {
      steps.push({ label: "Quotation", status: "pending" });
    }
    if (data?.orders?.length > 0) {
      for (const o of data.orders) {
        steps.push({ label: `Order: ${o.orderId}`, status: o.orderStatus === "delivered" ? "done" : o.orderStatus === "canceled" ? "blocked" : "in-progress", date: o.deliveryDate, detail: `Qty: ${o.totalQuantity}, Status: ${o.orderStatus}` });
      }
    } else {
      steps.push({ label: "Purchase Order", status: "pending" });
    }
    if (data?.proformaInvoices?.length > 0) {
      steps.push({ label: `PI: ${data.proformaInvoices[0].piNumber}`, status: "done", detail: `Value: ${data.proformaInvoices[0].totalValue}` });
    }
    if (data?.exportCases?.length > 0) {
      for (const ec of data.exportCases) {
        steps.push({ label: `Export Case: ${ec.exportCaseNumber}`, status: ec.status === "SETTLED" ? "done" : "in-progress", detail: `Status: ${ec.status}` });
      }
    }
    if (data?.btbLcs?.length > 0) {
      for (const btb of data.btbLcs) {
        steps.push({ label: `BTB LC: ${btb.btbLcNumber}`, status: btb.status === "PAID" ? "done" : "in-progress", detail: `Amount: ${btb.amount} ${btb.currency}` });
      }
    }
    if (data?.shipments?.length > 0) {
      for (const s of data.shipments) {
        steps.push({ label: `Shipment: ${s.shipmentNumber}`, status: s.status === "DELIVERED" ? "done" : "in-progress", detail: `Status: ${s.status}` });
      }
    }
    if (data?.fxReceipts?.length > 0) {
      for (const fx of data.fxReceipts) {
        steps.push({ label: `FX Receipt: ${fx.currency} ${fx.amount}`, status: fx.status === "SETTLED" ? "done" : "in-progress", date: fx.receiptDate });
      }
    }
    return steps;
  }

  function buildExportCaseTimeline(data: any): TimelineStep[] {
    const steps: TimelineStep[] = [];
    if (data?.exportCase) {
      steps.push({ label: `Export Case: ${data.exportCase.exportCaseNumber}`, status: "done", detail: `Status: ${data.exportCase.status}` });
    }
    if (data?.lc) {
      steps.push({ label: `LC: ${data.lc.lcNumber}`, status: "done", detail: `Value: ${data.lc.currency} ${data.lc.lcValue}` });
    }
    if (data?.orders?.length > 0) {
      steps.push({ label: `${data.orders.length} Order(s) Linked`, status: "done", detail: `Total Qty: ${data.summary?.totalQuantity || 0}` });
    }
    if (data?.proformaInvoices?.length > 0) {
      steps.push({ label: `PI: ${data.proformaInvoices[0].piNumber}`, status: "done" });
    }
    if (data?.btbLcs?.length > 0) {
      for (const btb of data.btbLcs) {
        const maturityStatus = btb.daysToMaturity !== null && btb.daysToMaturity <= 7 ? "blocked" :
          btb.daysToMaturity !== null && btb.daysToMaturity <= 14 ? "in-progress" : "done";
        steps.push({ label: `BTB: ${btb.btbLcNumber}`, status: btb.status === "PAID" ? "done" : maturityStatus, detail: `${btb.amount} ${btb.currency}, Maturity: ${btb.maturityDate || 'TBD'}` });
      }
    }
    if (data?.shipments?.length > 0) {
      for (const s of data.shipments) {
        steps.push({ label: `Shipment: ${s.shipmentNumber}`, status: s.status === "DELIVERED" ? "done" : "in-progress" });
      }
    }
    if (data?.fxReceipts?.length > 0) {
      for (const fx of data.fxReceipts) {
        steps.push({ label: `FX: ${fx.currency} ${fx.amount}`, status: fx.status === "SETTLED" ? "done" : "in-progress", date: fx.receiptDate });
      }
    }
    return steps;
  }

  const allAlerts = [
    ...(alerts as any)?.btbMaturities || [],
    ...(alerts as any)?.pendingShipments || [],
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Order Follow-up</h1>
          <p className="text-sm text-muted-foreground">Track orders from inquiry to export realization</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Input
            placeholder="Search by Style / PO / PI / LC / BTB / BL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="max-w-sm"
          />
          <Button onClick={handleSearch} size="icon" variant="outline">
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {searchSubmitted && searchResults && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Search Results for "{searchSubmitted}"</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(searchResults as any)?.styles?.map((s: any) => (
              <button key={s.id} className="block w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm" onClick={() => { setSelectedStyleId(s.id); setActiveTab("style"); setSearchSubmitted(""); }}>
                <Shirt className="inline h-4 w-4 mr-2 text-purple-500" />{s.label}
              </button>
            ))}
            {(searchResults as any)?.orders?.map((o: any) => (
              <button key={o.id} className="block w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm" onClick={() => { setSearchSubmitted(""); }}>
                <Package className="inline h-4 w-4 mr-2 text-blue-500" />{o.label}
              </button>
            ))}
            {(searchResults as any)?.exportCases?.map((ec: any) => (
              <button key={ec.id} className="block w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm" onClick={() => { setSelectedExportCaseId(ec.id); setActiveTab("export-lc"); setSearchSubmitted(""); }}>
                <Globe className="inline h-4 w-4 mr-2 text-green-500" />{ec.label}
              </button>
            ))}
            {(searchResults as any)?.lcs?.map((lc: any) => (
              <button key={lc.id} className="block w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm">
                <FileText className="inline h-4 w-4 mr-2 text-orange-500" />{lc.label}
              </button>
            ))}
            {!(searchResults as any)?.styles?.length && !(searchResults as any)?.orders?.length && !(searchResults as any)?.exportCases?.length && !(searchResults as any)?.lcs?.length && (
              <p className="text-sm text-muted-foreground px-3 py-2">No results found</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="style" className="flex-1"><Shirt className="h-4 w-4 mr-1" /> Style View</TabsTrigger>
              <TabsTrigger value="export-lc" className="flex-1"><Globe className="h-4 w-4 mr-1" /> Export LC View</TabsTrigger>
            </TabsList>

            <TabsContent value="style" className="mt-4 space-y-4">
              <Select value={selectedStyleId?.toString() || ""} onValueChange={(v) => setSelectedStyleId(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a style to view follow-up..." />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(styles) && styles.map((s: any) => (
                    <SelectItem key={s.id} value={s.id.toString()}>
                      {s.styleNumber} - {s.styleName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {styleLoading && <div className="animate-pulse space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-gray-100 rounded" />)}</div>}

              {styleData && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shirt className="h-5 w-5 text-purple-500" />
                      {(styleData as any).style?.styleNumber} — {(styleData as any).style?.styleName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TimelineView steps={buildStyleTimeline(styleData)} />
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="export-lc" className="mt-4 space-y-4">
              <Select value={selectedExportCaseId?.toString() || ""} onValueChange={(v) => setSelectedExportCaseId(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an export case to view follow-up..." />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(exportCases) && exportCases.map((ec: any) => (
                    <SelectItem key={ec.id} value={ec.id.toString()}>
                      {ec.exportCaseNumber} — {ec.buyerName || 'Unknown Buyer'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {ecLoading && <div className="animate-pulse space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-gray-100 rounded" />)}</div>}

              {ecData && (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Globe className="h-5 w-5 text-green-500" />
                        {(ecData as any).exportCase?.exportCaseNumber}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <TimelineView steps={buildExportCaseTimeline(ecData)} />
                    </CardContent>
                  </Card>

                  {(ecData as any).summary && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Card className="p-3">
                        <p className="text-xs text-muted-foreground">Orders</p>
                        <p className="text-lg font-bold">{(ecData as any).summary.totalOrders}</p>
                      </Card>
                      <Card className="p-3">
                        <p className="text-xs text-muted-foreground">Order Value</p>
                        <p className="text-lg font-bold">{Number((ecData as any).summary.totalOrderValue).toLocaleString()}</p>
                      </Card>
                      <Card className="p-3">
                        <p className="text-xs text-muted-foreground">FX Received</p>
                        <p className="text-lg font-bold text-green-600">{Number((ecData as any).summary.totalFxReceived).toLocaleString()}</p>
                      </Card>
                      <Card className="p-3">
                        <p className="text-xs text-muted-foreground">BTB LCs</p>
                        <p className="text-lg font-bold">{(ecData as any).summary.btbCount}</p>
                      </Card>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Active Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allAlerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active alerts</p>
              ) : (
                <div className="space-y-3">
                  {allAlerts.slice(0, 10).map((alert: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <SeverityBadge severity={alert.severity} />
                      <span className="flex-1">{alert.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {styleData && (styleData as any).alerts?.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Style Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(styleData as any).alerts.map((alert: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <SeverityBadge severity={alert.severity} />
                      <span className="flex-1">{alert.message}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
