import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Receipt } from "lucide-react";
import { formatMoney } from "@/lib/formatters";

interface BillingRecord {
  id: number;
  tenantName: string;
  tenantId: number;
  plan: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  status: string;
  invoiceNumber: string;
  paymentDate: string | null;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
};

export default function AdminBilling() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ tenantId: "", plan: "", amount: "", periodStart: "", periodEnd: "" });
  const { toast } = useToast();

  const { data: records, isLoading } = useQuery<BillingRecord[]>({
    queryKey: ["/api/admin/billing"],
  });

  const filtered = records?.filter((r) =>
    statusFilter === "all" ? true : r.status === statusFilter
  ) ?? [];

  const handleMarkPaid = async (id: number) => {
    try {
      await apiRequest(`/api/admin/billing/${id}`, "PATCH", { status: "paid" });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/billing"] });
      toast({ title: "Billing Updated", description: "Record marked as paid." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/api/admin/billing", "POST", {
        tenantId: parseInt(form.tenantId),
        plan: form.plan,
        amount: Math.round(parseFloat(form.amount) * 100),
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/billing"] });
      setCreateOpen(false);
      setForm({ tenantId: "", plan: "", amount: "", periodStart: "", periodEnd: "" });
      toast({ title: "Billing Record Created" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
            <p className="text-gray-600">Manage billing records and invoices</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> New Billing Record
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Billing Record</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Tenant ID</Label>
                  <Input type="number" value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Plan</Label>
                  <Input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Amount (BDT)</Label>
                  <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Period Start</Label>
                    <Input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Period End</Label>
                    <Input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} required />
                  </div>
                </div>
                <Button type="submit" className="w-full">Create Record</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-6">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="paid">Paid</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Amount (BDT)</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                        <Receipt className="mx-auto h-8 w-8 mb-2 text-gray-300" />
                        No billing records found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.tenantName}</TableCell>
                        <TableCell>{record.plan}</TableCell>
                        <TableCell>{formatMoney(record.amount / 100)}</TableCell>
                        <TableCell className="text-gray-600 text-sm">
                          {new Date(record.periodStart).toLocaleDateString()} — {new Date(record.periodEnd).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${statusColors[record.status] || ""} hover:opacity-80`}>
                            {record.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-600">{record.invoiceNumber}</TableCell>
                        <TableCell className="text-gray-600">
                          {record.paymentDate ? new Date(record.paymentDate).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          {record.status !== "paid" && (
                            <Button size="sm" variant="outline" onClick={() => handleMarkPaid(record.id)}>
                              Mark Paid
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
