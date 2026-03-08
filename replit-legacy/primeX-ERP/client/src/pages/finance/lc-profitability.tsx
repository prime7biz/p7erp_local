import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Globe } from "lucide-react";

export default function LcProfitabilityPage() {
  const [selectedEcId, setSelectedEcId] = useState<string>("");

  const { data: exportCases } = useQuery({ queryKey: ["/api/export-cases"] });
  const { data: profitData, isLoading } = useQuery({
    queryKey: ["/api/profitability/export-case", selectedEcId],
    enabled: !!selectedEcId,
  });

  const p = profitData as any;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">LC Profitability</h1>
          <p className="text-sm text-muted-foreground">Analyze profitability per export case / LC</p>
        </div>
        <Select value={selectedEcId} onValueChange={setSelectedEcId}>
          <SelectTrigger className="w-72"><SelectValue placeholder="Select export case..." /></SelectTrigger>
          <SelectContent>
            {Array.isArray(exportCases) && exportCases.map((ec: any) => (
              <SelectItem key={ec.id} value={ec.id.toString()}>{ec.exportCaseNumber} — {ec.buyerName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedEcId && (
        <Card className="p-12 text-center">
          <Globe className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-muted-foreground">Select an export case to view LC-level profitability</p>
        </Card>
      )}

      {isLoading && <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />)}</div>}

      {p && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">LC Value</p>
              <p className="text-lg font-bold">{p.currency} {Number(p.lcValue || 0).toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">FX Received</p>
              <p className="text-lg font-bold text-green-600">BDT {Number(p.fxReceived || 0).toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">BTB Costs</p>
              <p className="text-lg font-bold text-red-600">BDT {Number(p.btbCosts || 0).toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Net Profit</p>
              <p className={`text-lg font-bold ${(p.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                BDT {Number(p.netProfit || 0).toLocaleString()}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Margin</p>
              <p className={`text-lg font-bold ${(p.margin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(p.margin || 0) >= 0 ? <TrendingUp className="inline h-4 w-4 mr-1" /> : <TrendingDown className="inline h-4 w-4 mr-1" />}
                {Number(p.margin || 0).toFixed(1)}%
              </p>
            </Card>
          </div>

          {p.breakdown && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Cost & Revenue Breakdown</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-2 text-green-700">Revenue</h4>
                    <table className="w-full">
                      <tbody>
                        {(p.breakdown.revenue || []).map((r: any, i: number) => (
                          <tr key={i} className="border-b"><td className="p-2 text-sm">{r.label}</td><td className="p-2 text-sm text-right">{Number(r.amount).toLocaleString()}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2 text-red-700">Costs</h4>
                    <table className="w-full">
                      <tbody>
                        {(p.breakdown.costs || []).map((c: any, i: number) => (
                          <tr key={i} className="border-b"><td className="p-2 text-sm">{c.label}</td><td className="p-2 text-sm text-right">{Number(c.amount).toLocaleString()}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
