import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, Shirt, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function StyleProfitabilityPage() {
  const [selectedStyleId, setSelectedStyleId] = useState<string>("");

  const { data: styles } = useQuery({ queryKey: ["/api/merch/styles"] });
  const { data: profitData, isLoading } = useQuery({
    queryKey: ["/api/profitability/style", selectedStyleId],
    enabled: !!selectedStyleId,
  });

  const p = profitData as any;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Style Profitability</h1>
          <p className="text-sm text-muted-foreground">Analyze profit margins by garment style</p>
        </div>
        <Select value={selectedStyleId} onValueChange={setSelectedStyleId}>
          <SelectTrigger className="w-72"><SelectValue placeholder="Select a style..." /></SelectTrigger>
          <SelectContent>
            {Array.isArray(styles) && styles.map((s: any) => (
              <SelectItem key={s.id} value={s.id.toString()}>{s.styleNumber} — {s.styleName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedStyleId && (
        <Card className="p-12 text-center">
          <Shirt className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-muted-foreground">Select a style to view profitability analysis</p>
        </Card>
      )}

      {isLoading && <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />)}</div>}

      {p && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-1">
                <p className="text-xs text-muted-foreground">Revenue</p>
                {p.revenueSource && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                          {p.revenueSource === 'fx' ? 'FX' : p.revenueSource === 'invoice' ? 'Invoice' : 'Order'}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          {p.revenueSource === 'fx' && 'Based on actual FX receipts (highest fidelity)'}
                          {p.revenueSource === 'invoice' && 'Based on sales invoices'}
                          {p.revenueSource === 'order' && 'Based on order confirmed price (estimated)'}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <p className="text-xl font-bold text-green-600">BDT {Number(p.revenue || 0).toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Direct Costs</p>
              <p className="text-xl font-bold text-red-600">BDT {Number(p.directCosts || 0).toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Gross Profit</p>
              <p className="text-xl font-bold">BDT {Number(p.grossProfit || 0).toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Margin %</p>
              <p className={`text-xl font-bold ${(p.marginPercent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(p.marginPercent || 0) >= 0 ? <TrendingUp className="inline h-5 w-5 mr-1" /> : <TrendingDown className="inline h-5 w-5 mr-1" />}
                {Number(p.marginPercent || 0).toFixed(1)}%
              </p>
            </Card>
          </div>

          {p.costBreakdown && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Cost Breakdown</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full">
                  <thead><tr className="border-b bg-gray-50">
                    <th className="p-3 text-left text-sm">Category</th>
                    <th className="p-3 text-right text-sm">Amount (BDT)</th>
                    <th className="p-3 text-right text-sm">% of Revenue</th>
                  </tr></thead>
                  <tbody>
                    {Object.entries(p.costBreakdown).map(([cat, amt]: [string, any]) => (
                      <tr key={cat} className="border-b">
                        <td className="p-3 text-sm capitalize">{cat.replace(/_/g, ' ')}</td>
                        <td className="p-3 text-sm text-right">{Number(amt).toLocaleString()}</td>
                        <td className="p-3 text-sm text-right">{p.revenue ? ((amt / p.revenue) * 100).toFixed(1) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {p.orders && p.orders.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Order-Level Profitability</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead><tr className="border-b bg-gray-50">
                    <th className="p-3 text-left text-sm">Order</th>
                    <th className="p-3 text-right text-sm">Qty</th>
                    <th className="p-3 text-right text-sm">Revenue</th>
                    <th className="p-3 text-right text-sm">Cost</th>
                    <th className="p-3 text-right text-sm">Profit</th>
                    <th className="p-3 text-right text-sm">Margin</th>
                  </tr></thead>
                  <tbody>
                    {p.orders.map((o: any) => (
                      <tr key={o.orderId} className="border-b">
                        <td className="p-3 text-sm font-medium">{o.orderId}</td>
                        <td className="p-3 text-sm text-right">{o.quantity}</td>
                        <td className="p-3 text-sm text-right">{Number(o.revenue).toLocaleString()}</td>
                        <td className="p-3 text-sm text-right">{Number(o.cost).toLocaleString()}</td>
                        <td className="p-3 text-sm text-right font-medium">{Number(o.profit).toLocaleString()}</td>
                        <td className="p-3 text-sm text-right">
                          <Badge variant="outline" className={o.margin >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {Number(o.margin).toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
