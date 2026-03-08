import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, TrendingUp, TrendingDown, DollarSign, RefreshCcw, Calendar } from "lucide-react";

export default function CashForecastPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: scenarios, isLoading } = useQuery({ queryKey: ["/api/cash-forecast/scenarios"] });
  const { data: summary } = useQuery({ queryKey: ["/api/cash-forecast/summary"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/cash-forecast/scenarios", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/cash-forecast/scenarios"] }); setDialogOpen(false); toast({ title: "Scenario created" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: (scenarioId: number) => apiRequest("POST", `/api/cash-forecast/scenarios/${scenarioId}/generate`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/cash-forecast/scenarios"] }); queryClient.invalidateQueries({ queryKey: ["/api/cash-forecast/summary"] }); toast({ title: "Forecast generated" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      name: fd.get("name") as string,
      startDate: fd.get("startDate") as string,
      months: parseInt(fd.get("months") as string) || 6,
    });
  };

  const s = summary as any;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cash Flow Forecast</h1>
          <p className="text-sm text-muted-foreground">Scenario-based cash flow projection for FX, BTB maturities, and local payments</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New Scenario</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Forecast Scenario</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div><Label>Scenario Name</Label><Input name="name" placeholder="e.g. Base Case Q2 2026" required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Start Date</Label><Input name="startDate" type="date" required /></div>
                <div><Label>Months</Label><Input name="months" type="number" defaultValue="6" min="1" max="24" /></div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating..." : "Create Scenario"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Expected Inflows (6M)</p>
            <p className="text-xl font-bold text-green-600">BDT {Number(s.expectedInflows || 0).toLocaleString()}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Expected Outflows (6M)</p>
            <p className="text-xl font-bold text-red-600">BDT {Number(s.expectedOutflows || 0).toLocaleString()}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Net Cash Flow</p>
            <p className={`text-xl font-bold ${(s.netCashFlow || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              BDT {Number(s.netCashFlow || 0).toLocaleString()}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">BTB Maturities Due</p>
            <p className="text-xl font-bold text-orange-600">BDT {Number(s.btbMaturitiesDue || 0).toLocaleString()}</p>
          </Card>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : (
        <div className="space-y-4">
          {Array.isArray(scenarios) && scenarios.length === 0 && (
            <Card className="p-12 text-center">
              <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-muted-foreground">Create a forecast scenario to get started</p>
            </Card>
          )}
          {Array.isArray(scenarios) && scenarios.map((scenario: any) => (
            <Card key={scenario.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{scenario.name}</CardTitle>
                  <div className="flex gap-2">
                    <Badge variant="outline">{scenario.status || "DRAFT"}</Badge>
                    <Button size="sm" variant="outline" onClick={() => generateMutation.mutate(scenario.id)} disabled={generateMutation.isPending}>
                      <RefreshCcw className="h-4 w-4 mr-1" /> Generate
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {scenario.lines && scenario.lines.length > 0 && (
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-gray-50">
                        <th className="p-2 text-left">Month</th>
                        <th className="p-2 text-right text-green-700">Inflows</th>
                        <th className="p-2 text-right text-red-700">Outflows</th>
                        <th className="p-2 text-right font-bold">Net</th>
                        <th className="p-2 text-right">Cumulative</th>
                      </tr></thead>
                      <tbody>
                        {scenario.lines.map((line: any, i: number) => (
                          <tr key={i} className="border-b">
                            <td className="p-2">{line.month}</td>
                            <td className="p-2 text-right text-green-600">{Number(line.inflows).toLocaleString()}</td>
                            <td className="p-2 text-right text-red-600">{Number(line.outflows).toLocaleString()}</td>
                            <td className={`p-2 text-right font-medium ${line.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{Number(line.net).toLocaleString()}</td>
                            <td className={`p-2 text-right ${line.cumulative >= 0 ? '' : 'text-red-600'}`}>{Number(line.cumulative).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
