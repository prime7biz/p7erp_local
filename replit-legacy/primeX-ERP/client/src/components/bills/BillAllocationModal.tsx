import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Clock, AlertTriangle } from "lucide-react";

interface OutstandingBill {
  id: number;
  billNumber: string;
  billDate: string;
  dueDate: string | null;
  billType: string;
  originalAmount: string;
  pendingAmount: string;
  status: string;
  isOverdue: boolean;
  sourceDocType: string | null;
  sourceDocNumber: string | null;
}

export interface AllocationItem {
  allocationType: "AGAINST_REF" | "NEW_REF" | "ADVANCE" | "ON_ACCOUNT";
  billReferenceId?: number;
  amount: number;
  notes?: string;
}

interface BillAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAllocate: (allocations: AllocationItem[]) => void;
  partyId: number;
  accountId: number;
  totalAmount: number;
  voucherId?: number;
}

const formatCurrency = (amount: string | number) => {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "BDT 0.00";
  return `BDT ${Math.abs(num).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export function BillAllocationModal({
  isOpen,
  onClose,
  onAllocate,
  partyId,
  accountId,
  totalAmount,
  voucherId,
}: BillAllocationModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedBills, setSelectedBills] = useState<Record<number, number>>({});
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [advanceNotes, setAdvanceNotes] = useState("");
  const [onAccountAmount, setOnAccountAmount] = useState(0);

  const { data: outstandingBills = [], isLoading } = useQuery<OutstandingBill[]>({
    queryKey: ["/api/bills/party", partyId, "outstanding"],
    queryFn: async () => {
      const res = await fetch(`/api/bills/party/${partyId}/outstanding`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch outstanding bills");
      return res.json();
    },
    enabled: isOpen && partyId > 0,
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedBills({});
      setAdvanceAmount(0);
      setAdvanceNotes("");
      setOnAccountAmount(0);
    }
  }, [isOpen]);

  const totalAllocated = useMemo(() => {
    const againstRef = Object.values(selectedBills).reduce((s, a) => s + a, 0);
    return againstRef + advanceAmount + onAccountAmount;
  }, [selectedBills, advanceAmount, onAccountAmount]);

  const remaining = totalAmount - totalAllocated;

  const allocateMutation = useMutation({
    mutationFn: async (allocations: AllocationItem[]) => {
      const res = await apiRequest("/api/bills/allocate", "POST", {
        voucherId: voucherId || 0,
        partyId,
        accountId,
        allocations,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bills allocated", description: "Payment has been allocated successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/bills"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills/party", partyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/bills/report"] });
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: "Allocation failed", description: error.message, variant: "destructive" });
    },
  });

  const handleToggleBill = (billId: number, pendingAmount: number, checked: boolean) => {
    setSelectedBills((prev) => {
      const next = { ...prev };
      if (checked) {
        next[billId] = Math.min(pendingAmount, Math.max(0, totalAmount - totalAllocated + (prev[billId] || 0)));
      } else {
        delete next[billId];
      }
      return next;
    });
  };

  const handleAmountChange = (billId: number, value: string, maxPending: number) => {
    const num = parseFloat(value) || 0;
    setSelectedBills((prev) => ({
      ...prev,
      [billId]: Math.min(num, maxPending),
    }));
  };

  const handleSubmit = () => {
    if (Math.abs(remaining) > 0.01) {
      toast({
        title: "Allocation incomplete",
        description: `Total allocated (${formatCurrency(totalAllocated)}) must equal payment amount (${formatCurrency(totalAmount)}).`,
        variant: "destructive",
      });
      return;
    }

    const allocations: AllocationItem[] = [];

    for (const [billId, amount] of Object.entries(selectedBills)) {
      if (amount > 0) {
        allocations.push({
          allocationType: "AGAINST_REF",
          billReferenceId: parseInt(billId),
          amount,
        });
      }
    }

    if (advanceAmount > 0) {
      allocations.push({
        allocationType: "ADVANCE",
        amount: advanceAmount,
        notes: advanceNotes || undefined,
      });
    }

    if (onAccountAmount > 0) {
      allocations.push({
        allocationType: "ON_ACCOUNT",
        amount: onAccountAmount,
      });
    }

    if (voucherId) {
      allocateMutation.mutate(allocations);
    } else {
      onAllocate(allocations);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bill Allocation</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Allocate payment of {formatCurrency(totalAmount)} against outstanding bills
          </p>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              Against Reference
              <Badge variant="outline" className="text-xs">Settle outstanding bills</Badge>
            </h3>

            {isLoading ? (
              <div className="py-6 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading bills...</p>
              </div>
            ) : outstandingBills.length === 0 ? (
              <div className="py-6 text-center border rounded-md bg-muted/30">
                <p className="text-sm text-muted-foreground">No outstanding bills for this party</p>
              </div>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Bill No</TableHead>
                      <TableHead>Bill Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Original</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                      <TableHead className="text-right w-[140px]">Allocate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outstandingBills.map((bill) => {
                      const pending = parseFloat(bill.pendingAmount);
                      const isSelected = bill.id in selectedBills;
                      const isOverdue = bill.dueDate && new Date(bill.dueDate) < new Date();

                      return (
                        <TableRow
                          key={bill.id}
                          className={isOverdue ? "bg-red-50/50" : bill.status === "PARTIALLY_SETTLED" ? "bg-yellow-50/50" : ""}
                        >
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => handleToggleBill(bill.id, pending, !!checked)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{bill.billNumber}</TableCell>
                          <TableCell>{new Date(bill.billDate).toLocaleDateString("en-GB")}</TableCell>
                          <TableCell>
                            {bill.dueDate ? (
                              <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                                {new Date(bill.dueDate).toLocaleDateString("en-GB")}
                                {isOverdue && <Clock className="inline h-3 w-3 ml-1" />}
                              </span>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(bill.originalAmount)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(bill.pendingAmount)}</TableCell>
                          <TableCell className="text-right">
                            {isSelected && (
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max={pending}
                                value={selectedBills[bill.id] || ""}
                                onChange={(e) => handleAmountChange(bill.id, e.target.value, pending)}
                                className="w-[120px] text-right ml-auto h-8"
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-md p-4">
              <h3 className="text-sm font-semibold mb-3">Advance Payment</h3>
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={advanceAmount || ""}
                  onChange={(e) => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />
                <Label>Notes</Label>
                <Input
                  value={advanceNotes}
                  onChange={(e) => setAdvanceNotes(e.target.value)}
                  placeholder="Advance for next order..."
                />
              </div>
            </div>

            <div className="border rounded-md p-4">
              <h3 className="text-sm font-semibold mb-3">On Account</h3>
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={onAccountAmount || ""}
                  onChange={(e) => setOnAccountAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">Payment without bill reference, affects party ledger only</p>
              </div>
            </div>
          </div>

          <div className={`flex items-center justify-between p-3 rounded-md border-2 ${
            Math.abs(remaining) <= 0.01
              ? "bg-green-50 border-green-200"
              : remaining > 0
              ? "bg-yellow-50 border-yellow-200"
              : "bg-red-50 border-red-200"
          }`}>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">
                Allocated: <span className="font-bold">{formatCurrency(totalAllocated)}</span> / {formatCurrency(totalAmount)}
              </span>
              <span className="text-sm">|</span>
              <span className="text-sm font-medium">
                Remaining: <span className={`font-bold ${remaining > 0 ? "text-yellow-700" : remaining < -0.01 ? "text-red-700" : "text-green-700"}`}>
                  {formatCurrency(remaining)}
                </span>
              </span>
            </div>
            {Math.abs(remaining) > 0.01 && remaining > 0 && (
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={Math.abs(remaining) > 0.01 || allocateMutation.isPending}
          >
            {allocateMutation.isPending ? "Allocating..." : "Allocate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
