import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  FileText,
  Plus,
  CheckCircle2,
  CreditCard,
  DollarSign,
  TrendingDown,
  Clock,
  AlertTriangle,
  ShoppingCart,
  Receipt,
  BarChart3,
} from "lucide-react";

const invoiceStatusColors: Record<string, string> = {
  DRAFT: "bg-blue-100 text-blue-800 border-blue-200",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800 border-amber-200",
  APPROVED: "bg-green-100 text-green-800 border-green-200",
  PAID: "bg-purple-100 text-purple-800 border-purple-200",
};

const paymentStatusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  COMPLETED: "bg-green-100 text-green-800 border-green-200",
  FAILED: "bg-red-100 text-red-800 border-red-200",
  CANCELLED: "bg-gray-100 text-gray-500 border-gray-200",
};

function formatBDT(amount: string | number | null | undefined) {
  if (amount == null) return "BDT 0";
  return `BDT ${Number(amount).toLocaleString()}`;
}

function formatDate(dateStr: string | Date | null | undefined) {
  if (!dateStr) return "-";
  return format(new Date(dateStr), "MMM dd, yyyy");
}

export default function PurchaseWorkflowPage() {
  const [activeTab, setActiveTab] = useState("invoices");

  return (
    <DashboardContainer
      title="Purchase & Accounts Payable"
      subtitle="Manage supplier invoices, payments, and AP aging analysis"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="invoices" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Supplier Invoices
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Payments
          </TabsTrigger>
          <TabsTrigger value="aging" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            AP Aging Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-6">
          <SupplierInvoicesTab />
        </TabsContent>
        <TabsContent value="payments" className="mt-6">
          <PaymentsTab />
        </TabsContent>
        <TabsContent value="aging" className="mt-6">
          <APAgingTab />
        </TabsContent>
      </Tabs>
    </DashboardContainer>
  );
}

function SupplierInvoicesTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    invoiceNo: "",
    supplierName: "",
    invoiceDate: "",
    dueDate: "",
    totalAmount: "",
    description: "",
  });

  const { data: invoices, isLoading } = useQuery<any[]>({
    queryKey: ["/api/purchase/bills"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("/api/purchase/bills", "POST", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase/bills"] });
      toast({ title: "Success", description: "Supplier invoice created successfully" });
      setDialogOpen(false);
      setFormData({ invoiceNo: "", supplierName: "", invoiceDate: "", dueDate: "", totalAmount: "", description: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/purchase/bills/${id}/approve`, "POST");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase/bills"] });
      toast({ title: "Success", description: "Invoice approved successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const payMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/purchase/bills/${id}/post`, "POST");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase/bills"] });
      toast({ title: "Success", description: "Invoice marked as paid" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Supplier Invoices</h3>
          <p className="text-sm text-muted-foreground">Track and manage supplier invoices through approval workflow</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Supplier Invoice</DialogTitle>
              <DialogDescription>Record a new supplier invoice for processing</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Invoice No</Label>
                  <Input
                    placeholder="INV-001"
                    value={formData.invoiceNo}
                    onChange={(e) => setFormData({ ...formData, invoiceNo: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Supplier Name</Label>
                  <Input
                    placeholder="Supplier name"
                    value={formData.supplierName}
                    onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Invoice Date</Label>
                  <Input
                    type="date"
                    value={formData.invoiceDate}
                    onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Total Amount (BDT)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={formData.totalAmount}
                  onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Invoice description..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.invoiceNo || !formData.supplierName || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Invoice"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : !invoices?.length ? (
            <div className="text-center py-12">
              <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No supplier invoices found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Invoice Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.invoiceNo}</TableCell>
                      <TableCell>{inv.supplierName}</TableCell>
                      <TableCell className="text-sm">{formatDate(inv.invoiceDate)}</TableCell>
                      <TableCell className="text-sm">{formatDate(inv.dueDate)}</TableCell>
                      <TableCell className="text-right font-medium">{formatBDT(inv.totalAmount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={invoiceStatusColors[inv.status] || ""}>
                          {inv.status?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {(inv.status === "PENDING_APPROVAL" || inv.status === "DRAFT") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600"
                              onClick={() => approveMutation.mutate(inv.id)}
                              disabled={approveMutation.isPending}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                          )}
                          {inv.status === "APPROVED" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-purple-600"
                              onClick={() => payMutation.mutate(inv.id)}
                              disabled={payMutation.isPending}
                            >
                              <CreditCard className="h-4 w-4 mr-1" />
                              Pay
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
    </div>
  );
}

function PaymentsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    paymentNo: "",
    supplierName: "",
    amount: "",
    paymentDate: "",
    mode: "BANK_TRANSFER",
    reference: "",
  });

  const { data: payments, isLoading } = useQuery<any[]>({
    queryKey: ["/api/purchase/payments"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("/api/purchase/payments", "POST", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase/payments"] });
      toast({ title: "Success", description: "Payment recorded successfully" });
      setDialogOpen(false);
      setFormData({ paymentNo: "", supplierName: "", amount: "", paymentDate: "", mode: "BANK_TRANSFER", reference: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Payments</h3>
          <p className="text-sm text-muted-foreground">Track supplier payments and payment history</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>Record a new payment to a supplier</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment No</Label>
                  <Input
                    placeholder="PAY-001"
                    value={formData.paymentNo}
                    onChange={(e) => setFormData({ ...formData, paymentNo: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Supplier Name</Label>
                  <Input
                    placeholder="Supplier name"
                    value={formData.supplierName}
                    onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount (BDT)</Label>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Date</Label>
                  <Input
                    type="date"
                    value={formData.paymentDate}
                    onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Payment Mode</Label>
                <Select value={formData.mode} onValueChange={(val) => setFormData({ ...formData, mode: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="CHEQUE">Cheque</SelectItem>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="MOBILE_BANKING">Mobile Banking</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reference</Label>
                <Input
                  placeholder="Transaction reference..."
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.paymentNo || !formData.amount || createMutation.isPending}
              >
                {createMutation.isPending ? "Recording..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : !payments?.length ? (
            <div className="text-center py-12">
              <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No payments recorded yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment No</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment: any) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-medium">{payment.paymentNo}</TableCell>
                      <TableCell>{payment.supplierName}</TableCell>
                      <TableCell className="text-right font-medium">{formatBDT(payment.amount)}</TableCell>
                      <TableCell className="text-sm">{formatDate(payment.paymentDate)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {payment.mode?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={paymentStatusColors[payment.status] || ""}>
                          {payment.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function APAgingTab() {
  const { data: agingReport, isLoading } = useQuery<any>({
    queryKey: ["/api/purchase/ap-aging"],
  });

  const summary = agingReport?.summary || {};
  const details = agingReport?.details || agingReport || [];
  const detailRows = Array.isArray(details) ? details : [];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">AP Aging Report</h3>
        <p className="text-sm text-muted-foreground">Accounts payable aging analysis by supplier</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatBDT(summary.totalOutstanding || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Current</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-green-600">{formatBDT(summary.current || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">1-30 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-blue-600">{formatBDT(summary.days1to30 || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">31-60 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-amber-600">{formatBDT(summary.days31to60 || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">61-90 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-orange-600">{formatBDT(summary.days61to90 || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">90+ Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600">{formatBDT(summary.days90plus || 0)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aging Detail by Supplier</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : !detailRows.length ? (
            <div className="text-center py-12">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No outstanding payables</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">1-30 Days</TableHead>
                    <TableHead className="text-right">31-60 Days</TableHead>
                    <TableHead className="text-right">61-90 Days</TableHead>
                    <TableHead className="text-right">90+ Days</TableHead>
                    <TableHead className="text-right font-bold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailRows.map((row: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.supplier || row.supplierName}</TableCell>
                      <TableCell className="text-right">{Number(row.current || 0) > 0 ? formatBDT(row.current) : "-"}</TableCell>
                      <TableCell className="text-right">{Number(row.days1to30 || 0) > 0 ? formatBDT(row.days1to30) : "-"}</TableCell>
                      <TableCell className="text-right text-amber-600">{Number(row.days31to60 || 0) > 0 ? formatBDT(row.days31to60) : "-"}</TableCell>
                      <TableCell className="text-right text-orange-600">{Number(row.days61to90 || 0) > 0 ? formatBDT(row.days61to90) : "-"}</TableCell>
                      <TableCell className="text-right text-red-600">{Number(row.days90plus || 0) > 0 ? formatBDT(row.days90plus) : "-"}</TableCell>
                      <TableCell className="text-right font-bold">{formatBDT(row.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
