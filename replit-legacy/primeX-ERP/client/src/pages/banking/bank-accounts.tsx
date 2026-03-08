import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit2, Building2, Landmark, RefreshCw, Link2, BookOpen } from "lucide-react";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/formatters";

interface BankAccount {
  id: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  currency: string;
  currentBalance: string | number;
  lastReconciledDate: string | null;
  isActive: boolean | null;
  branchName?: string;
  routingNumber?: string;
  swiftCode?: string;
  glAccountId?: number | null;
}

interface BankLedger {
  id: number;
  name: string;
  accountNumber: string;
  accountCurrencyCode?: string;
  bankAccountDetails?: any;
  isLinkedToBanking: boolean;
}

const defaultForm = {
  bankName: "",
  accountName: "",
  accountNumber: "",
  currency: "BDT",
  currentBalance: "0",
  status: "ACTIVE",
  branchName: "",
  routingNumber: "",
  swiftCode: "",
};

export default function BankAccountsPage() {
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [selectedLedgerId, setSelectedLedgerId] = useState<string>("");

  const { data: accounts, isLoading } = useQuery<BankAccount[]>({
    queryKey: ["/api/bank/accounts"],
  });

  const { data: bankLedgers } = useQuery<BankLedger[]>({
    queryKey: ["/api/accounting/chart-of-accounts/bank-ledgers"],
  });

  const linkMutation = useMutation({
    mutationFn: async (ledgerId: number) => {
      const res = await apiRequest("/api/bank/accounts/link-from-coa", "POST", { ledgerId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/chart-of-accounts/bank-ledgers"] });
      toast({ title: "Bank account linked from Chart of Accounts" });
      setLinkDialogOpen(false);
      setSelectedLedgerId("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to link account", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof defaultForm }) => {
      const res = await apiRequest(`/api/bank/accounts/${id}`, "PUT", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/accounts"] });
      toast({ title: "Bank account updated successfully" });
      closeEditDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update account", description: err.message, variant: "destructive" });
    },
  });

  const openLink = () => {
    setSelectedLedgerId("");
    setLinkDialogOpen(true);
  };

  const openEdit = (account: BankAccount) => {
    setEditingAccount(account);
    setForm({
      bankName: account.bankName || "",
      accountName: account.accountName || "",
      accountNumber: account.accountNumber || "",
      currency: account.currency || "BDT",
      currentBalance: String(account.currentBalance || "0"),
      status: account.isActive ? "ACTIVE" : "INACTIVE",
      branchName: account.branchName || "",
      routingNumber: account.routingNumber || "",
      swiftCode: account.swiftCode || "",
    });
    setEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    setEditDialogOpen(false);
    setEditingAccount(null);
    setForm(defaultForm);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAccount) {
      updateMutation.mutate({ id: editingAccount.id, data: form });
    }
  };

  const handleLink = () => {
    if (selectedLedgerId) {
      linkMutation.mutate(parseInt(selectedLedgerId));
    }
  };

  const formatBalance = (val: string | number) => {
    return formatMoney(val);
  };

  const statusBadge = (isActive: boolean | null) => {
    if (isActive === false) {
      return <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">INACTIVE</Badge>;
    }
    return <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">ACTIVE</Badge>;
  };

  const isPending = linkMutation.isPending || updateMutation.isPending;
  const accountList = Array.isArray(accounts) ? accounts : [];
  const unlinkledLedgers = (bankLedgers || []).filter(l => !l.isLinkedToBanking);

  return (
    <DashboardContainer
      title="Bank Accounts"
      subtitle="Manage your organization's bank accounts"
      actions={
        <Button onClick={openLink} className="gap-2">
          <Plus className="h-4 w-4" /> Add Bank Account
        </Button>
      }
    >
      <Card className="shadow-sm border-0 shadow-gray-200/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : accountList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Landmark className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No Bank Accounts</h3>
              <p className="text-sm text-gray-500 mb-4">
                Link bank accounts from Chart of Accounts to get started with reconciliation.
              </p>
              <Button onClick={openLink} variant="outline" className="gap-2">
                <Link2 className="h-4 w-4" /> Link from Chart of Accounts
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80">
                    <TableHead className="font-semibold">Bank Name</TableHead>
                    <TableHead className="font-semibold">Account Name</TableHead>
                    <TableHead className="font-semibold">Account Number</TableHead>
                    <TableHead className="font-semibold">Currency</TableHead>
                    <TableHead className="font-semibold text-right">Current Balance</TableHead>
                    <TableHead className="font-semibold">Last Reconciled</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountList.map((account) => (
                    <TableRow key={account.id} className="hover:bg-gray-50/50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-gray-400" />
                          {account.bankName}
                          {account.glAccountId && (
                            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 gap-1">
                              <BookOpen className="h-3 w-3" />
                              Linked from CoA
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{account.accountName}</TableCell>
                      <TableCell className="font-mono text-sm">{account.accountNumber}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{account.currency}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatBalance(account.currentBalance)}
                      </TableCell>
                      <TableCell>
                        {account.lastReconciledDate
                          ? new Date(account.lastReconciledDate).toLocaleDateString()
                          : <span className="text-gray-400 text-sm">Never</span>}
                      </TableCell>
                      <TableCell>{statusBadge(account.isActive)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(account)} className="h-8 w-8 p-0">
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Link Bank Account from CoA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Select a ledger marked as "Bank Account" in your Chart of Accounts. The bank account details will be synced automatically.
            </p>
            {unlinkledLedgers.length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                <BookOpen className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                <p className="font-medium">No unlinked bank ledgers available</p>
                <p className="text-sm mt-1">Mark a ledger as "Bank Account" in Chart of Accounts first.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Select Bank Ledger</Label>
                  <Select value={selectedLedgerId} onValueChange={setSelectedLedgerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a bank ledger..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unlinkledLedgers.map(l => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          <div className="flex items-center gap-2">
                            <span>{l.name}</span>
                            <span className="text-xs text-gray-400">({l.accountNumber})</span>
                            {l.accountCurrencyCode && (
                              <Badge variant="outline" className="text-xs ml-1">{l.accountCurrencyCode}</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
                  <Button
                    onClick={handleLink}
                    disabled={!selectedLedgerId || linkMutation.isPending}
                    className="gap-2"
                  >
                    {linkMutation.isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
                    Link Account
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              Edit Bank Account
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bank Name *</Label>
                <Input
                  required
                  value={form.bankName}
                  onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  placeholder="e.g. Sonali Bank"
                />
              </div>
              <div className="space-y-2">
                <Label>Account Name *</Label>
                <Input
                  required
                  value={form.accountName}
                  onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                  placeholder="e.g. Operating Account"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input
                  value={form.accountNumber}
                  onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                  placeholder="e.g. 1234567890"
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
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Branch Name</Label>
                <Input
                  value={form.branchName}
                  onChange={(e) => setForm({ ...form, branchName: e.target.value })}
                  placeholder="Branch"
                />
              </div>
              <div className="space-y-2">
                <Label>Routing Number</Label>
                <Input
                  value={form.routingNumber}
                  onChange={(e) => setForm({ ...form, routingNumber: e.target.value })}
                  placeholder="Routing #"
                />
              </div>
              <div className="space-y-2">
                <Label>SWIFT Code</Label>
                <Input
                  value={form.swiftCode}
                  onChange={(e) => setForm({ ...form, swiftCode: e.target.value })}
                  placeholder="SWIFT"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={closeEditDialog}>Cancel</Button>
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending && <RefreshCw className="h-4 w-4 animate-spin" />}
                Update Account
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}
