import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Plus, CreditCard, CheckCircle2, PlayCircle, Clock, RefreshCw,
  ChevronRight, Banknote, XCircle, Eye
} from "lucide-react";
import { formatMoney } from "@/lib/formatters";

interface PaymentRun {
  id: number;
  runNumber: string;
  description: string;
  bankAccountId: number;
  paymentDate: string;
  totalAmount: string | number;
  currency: string;
  status: string;
  paymentCount: number;
  createdAt: string;
  approvedAt?: string;
  processedAt?: string;
  payments?: Payment[];
}

interface Payment {
  id: number;
  payeeId: number;
  payeeName: string;
  amount: string | number;
  reference: string;
  description: string;
  status: string;
}

interface BankAccount {
  id: number;
  bankName: string;
  accountName: string;
}

export default function PaymentRunsPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailRun, setDetailRun] = useState<PaymentRun | null>(null);
  const [form, setForm] = useState({
    description: "",
    bankAccountId: "",
    paymentDate: new Date().toISOString().split("T")[0],
    currency: "BDT",
  });

  const { data: paymentRuns, isLoading } = useQuery<PaymentRun[]>({
    queryKey: ["/api/bank/payment-runs"],
  });

  const { data: accounts } = useQuery<BankAccount[]>({
    queryKey: ["/api/bank/accounts"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("/api/bank/payment-runs", "POST", {
        ...data,
        bankAccountId: Number(data.bankAccountId),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/payment-runs"] });
      toast({ title: "Payment run created" });
      setDialogOpen(false);
      setForm({ description: "", bankAccountId: "", paymentDate: new Date().toISOString().split("T")[0], currency: "BDT" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create payment run", description: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/bank/payment-runs/${id}/approve`, "POST");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/payment-runs"] });
      toast({ title: "Payment run approved" });
      setDetailRun(null);
    },
    onError: (err: Error) => {
      toast({ title: "Approval failed", description: err.message, variant: "destructive" });
    },
  });

  const processMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/bank/payment-runs/${id}/process`, "POST");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/payment-runs"] });
      toast({ title: "Payment run processed" });
      setDetailRun(null);
    },
    onError: (err: Error) => {
      toast({ title: "Processing failed", description: err.message, variant: "destructive" });
    },
  });

  const statusBadge = (status: string) => {
    const map: Record<string, { cls: string; icon: any }> = {
      DRAFT: { cls: "bg-gray-100 text-gray-600 border-gray-200", icon: Clock },
      PENDING: { cls: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
      APPROVED: { cls: "bg-blue-100 text-blue-700 border-blue-200", icon: CheckCircle2 },
      PROCESSING: { cls: "bg-purple-100 text-purple-700 border-purple-200", icon: RefreshCw },
      COMPLETED: { cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
      FAILED: { cls: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
      CANCELLED: { cls: "bg-gray-100 text-gray-500 border-gray-200", icon: XCircle },
    };
    const cfg = map[status] || map.DRAFT;
    const Icon = cfg.icon;
    return (
      <Badge variant="outline" className={`gap-1 ${cfg.cls}`}>
        <Icon className="h-3 w-3" /> {status}
      </Badge>
    );
  };

  const formatAmount = (val: string | number) => {
    return formatMoney(val);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  const runsList = Array.isArray(paymentRuns) ? paymentRuns : [];
  const accountList = Array.isArray(accounts) ? accounts : [];

  return (
    <DashboardContainer
      title="Payment Runs"
      subtitle="Manage batch payment processing"
      actions={
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Payment Run
        </Button>
      }
    >
      <Card className="shadow-sm border-0 shadow-gray-200/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : runsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Banknote className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No Payment Runs</h3>
              <p className="text-sm text-gray-500 mb-4">Create your first payment run to batch process payments.</p>
              <Button onClick={() => setDialogOpen(true)} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" /> New Payment Run
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80">
                    <TableHead className="font-semibold">Run #</TableHead>
                    <TableHead className="font-semibold">Description</TableHead>
                    <TableHead className="font-semibold">Payment Date</TableHead>
                    <TableHead className="font-semibold text-center">Payments</TableHead>
                    <TableHead className="font-semibold text-right">Total Amount</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runsList.map(run => (
                    <TableRow key={run.id} className="hover:bg-gray-50/50">
                      <TableCell className="font-mono text-sm font-medium">{run.runNumber || `PR-${run.id}`}</TableCell>
                      <TableCell>{run.description || "-"}</TableCell>
                      <TableCell>{new Date(run.paymentDate).toLocaleDateString()}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{run.paymentCount || 0}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatAmount(run.totalAmount)}</TableCell>
                      <TableCell>{statusBadge(run.status)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setDetailRun(run)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {(run.status === "DRAFT" || run.status === "PENDING") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-blue-600"
                              onClick={() => approveMutation.mutate(run.id)}
                              disabled={approveMutation.isPending}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          )}
                          {run.status === "APPROVED" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-emerald-600"
                              onClick={() => processMutation.mutate(run.id)}
                              disabled={processMutation.isPending}
                            >
                              <PlayCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" /> Create Payment Run
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Supplier payments - January 2026"
              />
            </div>
            <div className="space-y-2">
              <Label>Bank Account *</Label>
              <Select value={form.bankAccountId} onValueChange={(v) => setForm({ ...form, bankAccountId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  {accountList.map(acc => (
                    <SelectItem key={acc.id} value={String(acc.id)}>
                      {acc.bankName} - {acc.accountName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Date *</Label>
                <Input
                  type="date"
                  required
                  value={form.paymentDate}
                  onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BDT">BDT</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createMutation.isPending} className="gap-2">
                {createMutation.isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
                Create Run
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailRun} onOpenChange={() => setDetailRun(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Run: {detailRun?.runNumber || `PR-${detailRun?.id}`}
              <span className="ml-2">{detailRun && statusBadge(detailRun.status)}</span>
            </DialogTitle>
          </DialogHeader>
          {detailRun && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Payment Date</p>
                  <p className="text-sm font-medium">{new Date(detailRun.paymentDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Amount</p>
                  <p className="text-sm font-bold">{formatAmount(detailRun.totalAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Payments</p>
                  <p className="text-sm font-medium">{detailRun.paymentCount || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Currency</p>
                  <p className="text-sm font-medium">{detailRun.currency}</p>
                </div>
              </div>

              {detailRun.description && (
                <div>
                  <p className="text-xs text-gray-500">Description</p>
                  <p className="text-sm">{detailRun.description}</p>
                </div>
              )}

              {detailRun.payments && detailRun.payments.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Included Payments</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Payee</TableHead>
                          <TableHead className="text-xs">Reference</TableHead>
                          <TableHead className="text-xs text-right">Amount</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailRun.payments.map(payment => (
                          <TableRow key={payment.id}>
                            <TableCell className="text-xs">{payment.payeeName}</TableCell>
                            <TableCell className="text-xs font-mono">{payment.reference}</TableCell>
                            <TableCell className="text-xs text-right font-medium">{formatAmount(payment.amount)}</TableCell>
                            <TableCell>{statusBadge(payment.status)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-3 pt-2">
                {(detailRun.status === "DRAFT" || detailRun.status === "PENDING") && (
                  <Button
                    onClick={() => approveMutation.mutate(detailRun.id)}
                    disabled={approveMutation.isPending}
                    className="gap-2"
                    variant="outline"
                  >
                    {approveMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Approve
                  </Button>
                )}
                {detailRun.status === "APPROVED" && (
                  <Button
                    onClick={() => processMutation.mutate(detailRun.id)}
                    disabled={processMutation.isPending}
                    className="gap-2"
                  >
                    {processMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                    Process Payments
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}
