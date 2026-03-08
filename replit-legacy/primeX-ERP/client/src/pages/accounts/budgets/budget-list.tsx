import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, FileSpreadsheet, Trash2, BarChart3, Loader2 } from "lucide-react";

interface Budget {
  id: number; name: string; description: string | null;
  fiscalYearId: number; budgetType: string; status: string;
  createdAt: string; updatedAt: string; tenantId: number;
}

interface FiscalYear {
  id: number; name: string; startDate: string; endDate: string;
  status: string; isCurrent: boolean;
}

export default function BudgetListPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newFiscalYearId, setNewFiscalYearId] = useState("");
  const [newBudgetType, setNewBudgetType] = useState("annual");

  const { data: budgets, isLoading } = useQuery<Budget[]>({
    queryKey: ["/api/accounting/budgets"],
  });

  const { data: fiscalYears } = useQuery<FiscalYear[]>({
    queryKey: ["/api/accounting/fiscal-years"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("/api/accounting/budgets", "POST", data);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/budgets"] });
      toast({ title: "Budget created successfully" });
      setCreateOpen(false);
      setNewName(""); setNewDescription(""); setNewFiscalYearId(""); setNewBudgetType("annual");
      setLocation(`/accounts/budgets/${result.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Failed to create budget", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/accounting/budgets/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/budgets"] });
      toast({ title: "Budget deleted" });
    },
  });

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    active: "bg-green-100 text-green-800",
    closed: "bg-red-100 text-red-800",
  };

  return (
    <DashboardContainer
      title="Budget Management"
      subtitle="Create and manage budgets for expense and revenue planning"
      actions={
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Budget
        </Button>
      }
    >
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !budgets || budgets.length === 0 ? (
            <div className="text-center py-16">
              <FileSpreadsheet className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-500">No budgets yet</h3>
              <p className="text-sm text-gray-400 mt-1">Create your first budget to start tracking planned vs actual spending.</p>
              <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />Create Budget
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Budget Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgets.map((b) => (
                  <TableRow key={b.id} className="cursor-pointer hover:bg-gray-50">
                    <TableCell>
                      <Link href={`/accounts/budgets/${b.id}`}>
                        <span className="text-blue-600 hover:underline font-medium">{b.name}</span>
                      </Link>
                      {b.description && <p className="text-xs text-gray-500 mt-0.5">{b.description}</p>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{b.budgetType}</Badge></TableCell>
                    <TableCell><Badge className={statusColors[b.status] || "bg-gray-100"}>{b.status}</Badge></TableCell>
                    <TableCell className="text-sm text-gray-500">{new Date(b.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setLocation(`/accounts/budgets/${b.id}/vs-actual`)}>
                          <BarChart3 className="h-3.5 w-3.5 mr-1" />vs Actual
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(b.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create New Budget</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Budget Name</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g., FY 2026 Annual Budget" /></div>
            <div><Label>Description</Label><Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Optional description" /></div>
            <div>
              <Label>Fiscal Year</Label>
              <Select value={newFiscalYearId} onValueChange={setNewFiscalYearId}>
                <SelectTrigger><SelectValue placeholder="Select fiscal year" /></SelectTrigger>
                <SelectContent>
                  {(fiscalYears || []).map(fy => (
                    <SelectItem key={fy.id} value={fy.id.toString()}>{fy.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Budget Type</Label>
              <Select value={newBudgetType} onValueChange={setNewBudgetType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Annual Budget</SelectItem>
                  <SelectItem value="quarterly">Quarterly Budget</SelectItem>
                  <SelectItem value="project">Project Budget</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createMutation.mutate({ name: newName, description: newDescription, fiscalYearId: parseInt(newFiscalYearId), budgetType: newBudgetType })}
              disabled={!newName || !newFiscalYearId || createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Budget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}
