import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Plus,
  Hash,
  BookOpen,
  Warehouse,
  Settings,
  Edit,
  ToggleLeft,
} from "lucide-react";

export default function ConfigPage() {
  const [activeTab, setActiveTab] = useState("number-series");

  return (
    <DashboardContainer
      title="System Configuration"
      subtitle="Manage number series, ledger mappings, and warehouse defaults"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="number-series" className="flex items-center gap-2">
            <Hash className="h-4 w-4" />
            Number Series
          </TabsTrigger>
          <TabsTrigger value="ledger-mappings" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Ledger Mappings
          </TabsTrigger>
          <TabsTrigger value="warehouse-defaults" className="flex items-center gap-2">
            <Warehouse className="h-4 w-4" />
            Warehouse Defaults
          </TabsTrigger>
        </TabsList>

        <TabsContent value="number-series" className="mt-6">
          <NumberSeriesTab />
        </TabsContent>
        <TabsContent value="ledger-mappings" className="mt-6">
          <LedgerMappingsTab />
        </TabsContent>
        <TabsContent value="warehouse-defaults" className="mt-6">
          <WarehouseDefaultsTab />
        </TabsContent>
      </Tabs>
    </DashboardContainer>
  );
}

function NumberSeriesTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    prefix: "",
    nextNumber: "1",
    docType: "",
    isActive: true,
  });

  const { data: series, isLoading } = useQuery<any[]>({
    queryKey: ["/api/settings/number-series"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("/api/settings/number-series", "POST", {
        ...data,
        nextNumber: Number(data.nextNumber),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/number-series"] });
      toast({ title: "Success", description: "Number series created successfully" });
      setDialogOpen(false);
      setFormData({ prefix: "", nextNumber: "1", docType: "", isActive: true });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiRequest(`/api/settings/number-series/${id}`, "PATCH", { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/number-series"] });
      toast({ title: "Success", description: "Number series updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Number Series</h3>
          <p className="text-sm text-muted-foreground">Configure document number prefixes and sequences</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Series
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Number Series</DialogTitle>
              <DialogDescription>Define a new document number series</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Prefix</Label>
                  <Input
                    placeholder="e.g., INV-"
                    value={formData.prefix}
                    onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Next Number</Label>
                  <Input
                    type="number"
                    placeholder="1"
                    value={formData.nextNumber}
                    onChange={(e) => setFormData({ ...formData, nextNumber: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Input
                  placeholder="e.g., INVOICE, PURCHASE_ORDER"
                  value={formData.docType}
                  onChange={(e) => setFormData({ ...formData, docType: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label>Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.prefix || !formData.docType || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Add Series"}
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
          ) : !series?.length ? (
            <div className="text-center py-12">
              <Hash className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No number series configured</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Document Type</TableHead>
                  <TableHead className="text-right">Next Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {series.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono font-medium">{item.prefix}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{item.docType}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{item.nextNumber}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={item.isActive
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-gray-50 text-gray-500 border-gray-200"
                        }
                      >
                        {item.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleMutation.mutate({ id: item.id, isActive: !item.isActive })}
                      >
                        <ToggleLeft className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LedgerMappingsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    mappingKey: "",
    accountId: "",
    description: "",
  });

  const { data: mappings, isLoading } = useQuery<any[]>({
    queryKey: ["/api/settings/ledger-mappings"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("/api/settings/ledger-mappings", "PUT", {
        ...data,
        accountId: Number(data.accountId),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ledger-mappings"] });
      toast({ title: "Success", description: "Ledger mapping created successfully" });
      setDialogOpen(false);
      setFormData({ mappingKey: "", accountId: "", description: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Ledger Mappings</h3>
          <p className="text-sm text-muted-foreground">Map system transactions to accounting ledger accounts</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Mapping
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Ledger Mapping</DialogTitle>
              <DialogDescription>Map a system key to a ledger account</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Mapping Key</Label>
                <Input
                  placeholder="e.g., SALES_REVENUE, PURCHASE_EXPENSE"
                  value={formData.mappingKey}
                  onChange={(e) => setFormData({ ...formData, mappingKey: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Account ID</Label>
                <Input
                  type="number"
                  placeholder="Ledger account ID"
                  value={formData.accountId}
                  onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Describe this mapping..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.mappingKey || !formData.accountId || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Add Mapping"}
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
          ) : !mappings?.length ? (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No ledger mappings configured</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mapping Key</TableHead>
                  <TableHead>Account ID</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((mapping: any) => (
                  <TableRow key={mapping.id || mapping.mappingKey}>
                    <TableCell className="font-mono font-medium">{mapping.mappingKey}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{mapping.accountId}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {mapping.description || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WarehouseDefaultsTab() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    purpose: "",
    warehouseId: "",
  });

  const { data: defaults, isLoading } = useQuery<any[]>({
    queryKey: ["/api/settings/warehouses/defaults"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("/api/settings/warehouses/defaults", "PUT", {
        ...data,
        warehouseId: Number(data.warehouseId),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/warehouses/defaults"] });
      toast({ title: "Success", description: "Warehouse default created successfully" });
      setDialogOpen(false);
      setFormData({ purpose: "", warehouseId: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Warehouse Defaults</h3>
          <p className="text-sm text-muted-foreground">Configure default warehouses for different purposes</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Default
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Warehouse Default</DialogTitle>
              <DialogDescription>Set a default warehouse for a specific purpose</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Purpose</Label>
                <Input
                  placeholder="e.g., RAW_MATERIAL, FINISHED_GOODS"
                  value={formData.purpose}
                  onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Warehouse ID</Label>
                <Input
                  type="number"
                  placeholder="Warehouse ID"
                  value={formData.warehouseId}
                  onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.purpose || !formData.warehouseId || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Add Default"}
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
          ) : !defaults?.length ? (
            <div className="text-center py-12">
              <Warehouse className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No warehouse defaults configured</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Warehouse ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {defaults.map((item: any) => (
                  <TableRow key={item.id || item.purpose}>
                    <TableCell className="font-medium">{item.purpose}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.warehouseId}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
