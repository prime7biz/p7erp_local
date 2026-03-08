import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus, Users, Building2, UserCheck, Loader2,
  Eye, Edit, Upload, RefreshCw
} from "lucide-react";
import { ErpTable, StatusBadge } from "@/components/erp/erp-table";
import type { ErpTableColumn, ErpFilter } from "@/components/erp/erp-table";

function getTypeBadge(type: string) {
  switch (type) {
    case "vendor":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Vendor</Badge>;
    case "customer":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Customer</Badge>;
    case "both":
      return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Both</Badge>;
    default:
      return <Badge variant="outline">{type}</Badge>;
  }
}

export default function PartyDashboard() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "", partyType: "vendor", contactPerson: "", email: "", phone: "",
    address: "", city: "", country: "", creditPeriodDays: 0, creditLimit: "0",
    defaultPaymentTerms: "", groupLabel: "", taxId: "", bankName: "",
    bankAccountNumber: "", bankBranch: "", bankRoutingNumber: "", notes: "",
  });

  const typeFilter = activeFilters.partyType || "all";
  const groupFilter = activeFilters.group || "all";

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/parties', search, typeFilter, groupFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (typeFilter !== "all") params.set("partyType", typeFilter);
      if (groupFilter !== "all") params.set("group", groupFilter);
      const res = await fetch(`/api/parties?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch parties");
      return res.json();
    },
  });

  const { data: summary } = useQuery<any>({
    queryKey: ['/api/parties/summary'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("/api/parties", "POST", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Party created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/parties'] });
      queryClient.invalidateQueries({ queryKey: ['/api/parties/summary'] });
      setCreateOpen(false);
      setFormData({
        name: "", partyType: "vendor", contactPerson: "", email: "", phone: "",
        address: "", city: "", country: "", creditPeriodDays: 0, creditLimit: "0",
        defaultPaymentTerms: "", groupLabel: "", taxId: "", bankName: "",
        bankAccountNumber: "", bankBranch: "", bankRoutingNumber: "", notes: "",
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create party", description: error.message, variant: "destructive" });
    },
  });

  const migrateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/parties/migrate-from-coa", "POST", {});
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Migration complete", description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/parties'] });
      queryClient.invalidateQueries({ queryKey: ['/api/parties/summary'] });
    },
    onError: (error: any) => {
      toast({ title: "Migration failed", description: error.message, variant: "destructive" });
    },
  });

  const parties = data?.parties || [];

  const columns: ErpTableColumn<any>[] = [
    {
      key: "partyCode", label: "Party Code", sticky: true, width: "120px",
      render: (row) => (
        <Link href={`/parties/${row.id}`}>
          <span className="font-semibold text-primary hover:underline cursor-pointer">{row.partyCode}</span>
        </Link>
      ),
    },
    { key: "name", label: "Name" },
    {
      key: "partyType", label: "Type",
      render: (row) => getTypeBadge(row.partyType),
    },
    { key: "contactPerson", label: "Contact", render: (row) => row.contactPerson || "—" },
    { key: "phone", label: "Phone", render: (row) => row.phone || "—" },
    { key: "email", label: "Email", render: (row) => row.email || "—" },
    { key: "city", label: "City", render: (row) => row.city || "—" },
    {
      key: "isActive", label: "Status",
      render: (row) => <StatusBadge status={row.isActive ? "Active" : "Inactive"} />,
    },
  ];

  const filters: ErpFilter[] = [
    {
      key: "partyType", label: "Type", type: "select",
      options: [
        { label: "Vendor", value: "vendor" },
        { label: "Customer", value: "customer" },
        { label: "Both", value: "both" },
      ],
    },
    {
      key: "status", label: "Status", type: "select",
      options: [
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
      ],
    },
  ];

  const handleFilterChange = (key: string, value: string) => {
    setActiveFilters((prev) => {
      if (!value) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  };

  const handleClearFilters = () => setActiveFilters({});

  return (
    <DashboardContainer
      title="Party Master"
      subtitle="Unified vendor and customer ledger management"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => migrateMutation.mutate()}
            disabled={migrateMutation.isPending}>
            {migrateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Migrate from COA
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" /> New Party
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Party</DialogTitle>
                <DialogDescription>Add a new vendor, customer, or both-type party.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-1 md:col-span-2">
                  <Label>Party Name *</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div>
                  <Label>Party Type *</Label>
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
                  <Input value={formData.groupLabel} onChange={(e) => setFormData({ ...formData, groupLabel: e.target.value })}
                    placeholder="e.g., Dyeing, Knitting, Supplier" />
                </div>
                <div>
                  <Label>Contact Person</Label>
                  <Input value={formData.contactPerson} onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
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
                  <Label>Default Payment Terms</Label>
                  <Input value={formData.defaultPaymentTerms}
                    onChange={(e) => setFormData({ ...formData, defaultPaymentTerms: e.target.value })} />
                </div>
                <div>
                  <Label>Tax ID (TIN/BIN)</Label>
                  <Input value={formData.taxId} onChange={(e) => setFormData({ ...formData, taxId: e.target.value })} />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <Label>Address</Label>
                  <Textarea value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} rows={2} />
                </div>
                <div>
                  <Label>Bank Name</Label>
                  <Input value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} />
                </div>
                <div>
                  <Label>Bank Account Number</Label>
                  <Input value={formData.bankAccountNumber} onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })} />
                </div>
                <div>
                  <Label>Bank Branch</Label>
                  <Input value={formData.bankBranch} onChange={(e) => setFormData({ ...formData, bankBranch: e.target.value })} />
                </div>
                <div>
                  <Label>Bank Routing Number</Label>
                  <Input value={formData.bankRoutingNumber} onChange={(e) => setFormData({ ...formData, bankRoutingNumber: e.target.value })} />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <Label>Notes</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={() => createMutation.mutate(formData)} disabled={createMutation.isPending || !formData.name}>
                  {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create Party
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg"><Users className="h-5 w-5 text-orange-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Parties</p>
                <p className="text-2xl font-bold">{summary?.totalParties || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><Building2 className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Vendors</p>
                <p className="text-2xl font-bold">{summary?.totalVendors || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg"><UserCheck className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Customers</p>
                <p className="text-2xl font-bold">{summary?.totalCustomers || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg"><RefreshCw className="h-5 w-5 text-purple-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Both Type</p>
                <p className="text-2xl font-bold">{summary?.totalBoth || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ErpTable
        tableId="parties"
        columns={columns}
        data={parties}
        isLoading={isLoading}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or code..."
        filters={filters}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        emptyIcon={<Users className="h-12 w-12 opacity-40" />}
        emptyTitle="No parties found"
        emptyDescription="Create your first party or migrate from Chart of Accounts."
        emptyAction={{ label: "Create Party", onClick: () => setCreateOpen(true) }}
        rowActions={(row) => [
          { label: "View Details", icon: <Eye className="h-4 w-4 mr-2" />, onClick: () => setLocation(`/parties/${row.id}`) },
        ]}
      />
    </DashboardContainer>
  );
}
