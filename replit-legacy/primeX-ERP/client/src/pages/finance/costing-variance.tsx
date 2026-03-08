import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Minus, AlertTriangle } from "lucide-react";

function VarianceBadge({ value }: { value: number }) {
  if (Math.abs(value) < 0.01) return <Badge variant="outline" className="text-gray-500"><Minus className="h-3 w-3 mr-1" />0%</Badge>;
  if (value > 0) return <Badge variant="outline" className="text-red-600 border-red-200"><ArrowUp className="h-3 w-3 mr-1" />+{value.toFixed(1)}%</Badge>;
  return <Badge variant="outline" className="text-green-600 border-green-200"><ArrowDown className="h-3 w-3 mr-1" />{value.toFixed(1)}%</Badge>;
}

export default function CostingVariancePage() {
  const [selectedStyleId, setSelectedStyleId] = useState<string>("");

  const { data: styles } = useQuery({ queryKey: ["/api/merch/styles"] });
  const { data: varianceData, isLoading } = useQuery({
    queryKey: ["/api/profitability/variance", selectedStyleId],
    enabled: !!selectedStyleId,
  });

  const v = varianceData as any;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Costing Variance</h1>
          <p className="text-sm text-muted-foreground">Compare estimated vs. actual costs for styles</p>
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
          <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-muted-foreground">Select a style to view costing variance analysis</p>
        </Card>
      )}

      {isLoading && <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />)}</div>}

      {v && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Estimated Cost</p>
              <p className="text-xl font-bold">BDT {Number(v.estimatedCost || 0).toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Actual Cost</p>
              <p className="text-xl font-bold">BDT {Number(v.actualCost || 0).toLocaleString()}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Variance</p>
              <p className={`text-xl font-bold ${(v.varianceAmount || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                BDT {Number(v.varianceAmount || 0).toLocaleString()}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Variance %</p>
              <VarianceBadge value={v.variancePercent || 0} />
            </Card>
          </div>

          {v.lineItems && v.lineItems.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Cost Element Variance</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead><tr className="border-b bg-gray-50">
                    <th className="p-3 text-left text-sm">Cost Element</th>
                    <th className="p-3 text-right text-sm">Estimated</th>
                    <th className="p-3 text-right text-sm">Actual</th>
                    <th className="p-3 text-right text-sm">Variance</th>
                    <th className="p-3 text-right text-sm">%</th>
                  </tr></thead>
                  <tbody>
                    {v.lineItems.map((item: any, i: number) => (
                      <tr key={i} className="border-b">
                        <td className="p-3 text-sm">{item.element}</td>
                        <td className="p-3 text-sm text-right">{Number(item.estimated).toLocaleString()}</td>
                        <td className="p-3 text-sm text-right">{Number(item.actual).toLocaleString()}</td>
                        <td className="p-3 text-sm text-right font-medium">{Number(item.variance).toLocaleString()}</td>
                        <td className="p-3 text-right"><VarianceBadge value={item.variancePercent || 0} /></td>
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
