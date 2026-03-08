import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, Edit, Loader2, Building2, Mail, Phone, MapPin,
  CreditCard, Calendar, FileText, Banknote, DollarSign, User, Star
} from "lucide-react";
import { ModuleAIPanel } from "@/components/ai/ModuleAIPanel";

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "BDT 0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "BDT 0.00";
  return `BDT ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CrmProfileCard = ({ partyId }: { partyId: string }) => {
  const { data: crmProfile, isLoading } = useQuery<any>({
    queryKey: ['/api/parties', partyId, 'crm-profile'],
    queryFn: async () => {
      const res = await fetch(`/api/parties/${partyId}/crm-profile`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch CRM profile");
      return res.json();
    },
    enabled: !!partyId,
  });

  if (isLoading) {
    return (
      <Card className="border-indigo-200 bg-indigo-50/30">
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
          <span className="ml-2 text-sm text-muted-foreground">Loading CRM profile...</span>
        </CardContent>
      </Card>
    );
  }

  if (!crmProfile || !crmProfile.linked) {
    return (
      <Card className="border-indigo-200 bg-indigo-50/30">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-indigo-600" /> CRM Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No CRM customer profile linked</p>
          <p className="text-xs text-muted-foreground mt-1">This is an accounting-only party.</p>
        </CardContent>
      </Card>
    );
  }

  const customer = crmProfile.customer;
  const rating = customer.sustainabilityRating || 0;

  return (
    <Card className="border-indigo-200 bg-indigo-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <User className="h-4 w-4 text-indigo-600" /> CRM Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{customer.customerName}</span>
          <Badge className={customer.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
            {customer.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Customer ID</span>
            <span className="font-medium">{customer.customerId}</span>
          </div>
          {customer.email && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium truncate ml-2">{customer.email}</span>
            </div>
          )}
          {customer.phone && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium">{customer.phone}</span>
            </div>
          )}
          {customer.country && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Country</span>
              <span className="font-medium">{customer.country}</span>
            </div>
          )}
          {customer.industrySegment && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Industry</span>
              <span className="font-medium">{customer.industrySegment}</span>
            </div>
          )}
          {customer.complianceLevel && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Compliance</span>
              <Badge variant="outline" className="text-xs">{customer.complianceLevel}</Badge>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Sustainability</span>
            <div className="flex items-center gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className={`h-3.5 w-3.5 ${i < rating ? "text-amber-500 fill-amber-500" : "text-gray-200"}`} />
              ))}
              <span className="ml-1 text-xs">{rating}/5</span>
            </div>
          </div>
        </div>
        <Link href="/customers">
          <Button variant="outline" size="sm" className="w-full mt-2 border-indigo-300 text-indigo-700 hover:bg-indigo-100">
            <User className="mr-2 h-3 w-3" />
            View CRM Profile
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
};

export default function PartyDetail() {
  const [, params] = useRoute("/parties/:id");
  const partyId = params?.id;
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [formData, setFormData] = useState<any>(null);

  const { data: party, isLoading } = useQuery<any>({
    queryKey: ['/api/parties', partyId],
    queryFn: async () => {
      const res = await fetch(`/api/parties/${partyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch party");
      return res.json();
    },
    enabled: !!partyId,
  });

  const { data: ledger } = useQuery<any>({
    queryKey: ['/api/parties', partyId, 'ledger'],
    queryFn: async () => {
      const res = await fetch(`/api/parties/${partyId}/ledger`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!partyId,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(`/api/parties/${partyId}`, "PUT", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Party updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/parties', partyId] });
      setEditOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <DashboardContainer title="Party Detail" subtitle="Loading...">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardContainer>
    );
  }

  if (!party) {
    return (
      <DashboardContainer title="Party Not Found" subtitle="">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Party not found.</p>
          <Link href="/parties"><Button className="mt-4">Back to Parties</Button></Link>
        </div>
      </DashboardContainer>
    );
  }

  const openEdit = () => {
    setFormData({
      name: party.name || "",
      partyType: party.partyType || "vendor",
      contactPerson: party.contactPerson || "",
      email: party.email || "",
      phone: party.phone || "",
      address: party.address || "",
      city: party.city || "",
      country: party.country || "",
      creditPeriodDays: party.creditPeriodDays || 0,
      creditLimit: party.creditLimit || "0",
      defaultPaymentTerms: party.defaultPaymentTerms || "",
      groupLabel: party.groupLabel || "",
      taxId: party.taxId || "",
      bankName: party.bankName || "",
      bankAccountNumber: party.bankAccountNumber || "",
      bankBranch: party.bankBranch || "",
      bankRoutingNumber: party.bankRoutingNumber || "",
      notes: party.notes || "",
    });
    setEditOpen(true);
  };

  const transactions = ledger?.transactions || [];

  return (
    <DashboardContainer
      title={party.name}
      subtitle={`${party.partyCode} — ${(party.partyType || 'vendor').charAt(0).toUpperCase() + (party.partyType || 'vendor').slice(1)}`}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/parties">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </Link>
          <Button size="sm" onClick={openEdit}>
            <Edit className="mr-2 h-4 w-4" /> Edit
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" /> Party Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Party Code</p>
                  <p className="font-medium">{party.partyCode}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <Badge className={
                    party.partyType === 'vendor' ? "bg-blue-100 text-blue-800" :
                    party.partyType === 'customer' ? "bg-green-100 text-green-800" :
                    "bg-purple-100 text-purple-800"
                  }>
                    {(party.partyType || 'vendor').charAt(0).toUpperCase() + (party.partyType || 'vendor').slice(1)}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Group</p>
                  <p className="font-medium">{party.groupLabel || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  {party.isActive ? (
                    <Badge className="bg-green-100 text-green-800">Active</Badge>
                  ) : (
                    <Badge variant="destructive">Inactive</Badge>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Ledger Account</p>
                  <p className="font-medium">{party.ledgerAccountName || "Not linked"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tax ID</p>
                  <p className="font-medium">{party.taxId || "—"}</p>
                </div>
              </div>
              <Separator className="my-4" />
              <div className="grid grid-cols-2 gap-4">
                {party.contactPerson && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{party.contactPerson}</span>
                  </div>
                )}
                {party.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{party.email}</span>
                  </div>
                )}
                {party.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{party.phone}</span>
                  </div>
                )}
                {(party.address || party.city || party.country) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{[party.address, party.city, party.country].filter(Boolean).join(", ")}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" /> Recent Transactions
              </CardTitle>
              <CardDescription>
                {transactions.length > 0 ? `Last ${transactions.length} transactions` : "No transactions found"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No ledger transactions found for this party.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Voucher #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Narration</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx: any) => (
                        <TableRow key={tx.id}>
                          <TableCell className="font-medium">{tx.voucher_number || `V-${tx.voucher_id}`}</TableCell>
                          <TableCell>{tx.voucher_date ? new Date(tx.voucher_date).toLocaleDateString() : "—"}</TableCell>
                          <TableCell className="text-sm">{tx.description || tx.voucher_description || "—"}</TableCell>
                          <TableCell className="text-right">{formatCurrency(tx.debit_amount)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(tx.credit_amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" /> Outstanding Bills
              </CardTitle>
              <CardDescription>Bill-wise tracking (coming in Phase 1)</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center py-8 text-muted-foreground">
                Bill-wise tracking will be available in Phase 1.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" /> Ledger Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {party.balance ? (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Debit</span>
                    <span className="font-medium">{formatCurrency(party.balance.totalDebit)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Credit</span>
                    <span className="font-medium">{formatCurrency(party.balance.totalCredit)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="font-semibold">Net Balance</span>
                    <span className={`text-lg font-bold ${party.balance.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(party.balance.balance)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No ledger account linked</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" /> Financial Terms
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Credit Period</span>
                <span className="font-medium">{party.creditPeriodDays ? `${party.creditPeriodDays} days` : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Credit Limit</span>
                <span className="font-medium">{formatCurrency(party.creditLimit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Terms</span>
                <span className="font-medium">{party.defaultPaymentTerms || "—"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Banknote className="h-5 w-5" /> Bank Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-muted-foreground text-sm">Bank Name</span>
                <p className="font-medium">{party.bankName || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">Account Number</span>
                <p className="font-medium">{party.bankAccountNumber || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">Branch</span>
                <p className="font-medium">{party.bankBranch || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-sm">Routing Number</span>
                <p className="font-medium">{party.bankRoutingNumber || "—"}</p>
              </div>
            </CardContent>
          </Card>

          <CrmProfileCard partyId={partyId!} />

          {party.notes && (
            <Card>
              <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{party.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {party && (
        <ModuleAIPanel
          title="AI Party Analysis"
          endpoint="/api/module-ai/party-analysis"
          requestData={{ partyId: party.id }}
          triggerKey={`party-${party.id}`}
        />
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Party</DialogTitle>
            <DialogDescription>Update party information.</DialogDescription>
          </DialogHeader>
          {formData && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Party Name *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <Label>Party Type</Label>
                <Select value={formData.partyType} onValueChange={(v) => setFormData({ ...formData, partyType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendor">Vendor</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Group Label</Label>
                <Input value={formData.groupLabel} onChange={(e) => setFormData({ ...formData, groupLabel: e.target.value })} />
              </div>
              <div>
                <Label>Contact Person</Label>
                <Input value={formData.contactPerson} onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div>
                <Label>City</Label>
                <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
              </div>
              <div>
                <Label>Country</Label>
                <Input value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} />
              </div>
              <div>
                <Label>Credit Period (Days)</Label>
                <Input type="number" value={formData.creditPeriodDays}
                  onChange={(e) => setFormData({ ...formData, creditPeriodDays: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>Credit Limit</Label>
                <Input value={formData.creditLimit}
                  onChange={(e) => setFormData({ ...formData, creditLimit: e.target.value })} />
              </div>
              <div>
                <Label>Payment Terms</Label>
                <Input value={formData.defaultPaymentTerms}
                  onChange={(e) => setFormData({ ...formData, defaultPaymentTerms: e.target.value })} />
              </div>
              <div>
                <Label>Tax ID</Label>
                <Input value={formData.taxId} onChange={(e) => setFormData({ ...formData, taxId: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Address</Label>
                <Textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows={2} />
              </div>
              <div>
                <Label>Bank Name</Label>
                <Input value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} />
              </div>
              <div>
                <Label>Account Number</Label>
                <Input value={formData.bankAccountNumber} onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })} />
              </div>
              <div>
                <Label>Bank Branch</Label>
                <Input value={formData.bankBranch} onChange={(e) => setFormData({ ...formData, bankBranch: e.target.value })} />
              </div>
              <div>
                <Label>Routing Number</Label>
                <Input value={formData.bankRoutingNumber} onChange={(e) => setFormData({ ...formData, bankRoutingNumber: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate(formData)} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}