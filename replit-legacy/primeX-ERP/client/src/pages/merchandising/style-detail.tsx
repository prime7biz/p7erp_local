import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useLocation, Link } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/erp/erp-table';
import { DocumentHeader } from '@/components/erp/document-header';
import { AuditTimeline } from '@/components/erp/document-header';
import {
  ArrowLeft, Shirt, Calendar, User, Tag, Clock, Package, Loader2,
  ExternalLink, Plus, Edit, Trash2, Check, X, Palette, Ruler, History,
  Layers, Eye,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { format } from 'date-fns';

export default function StyleDetailPage() {
  const params = useParams<{ id: string }>();
  const styleId = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: styleResponse, isLoading, isError } = useQuery<any>({
    queryKey: ['/api/merch/styles', styleId],
    queryFn: async () => {
      const res = await fetch(`/api/merch/styles/${styleId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch style details');
      return res.json();
    },
  });

  const { data: customers } = useQuery<any>({
    queryKey: ['/api/customers'],
  });

  const style = styleResponse?.data;

  const getBuyerName = (buyerId: number) => {
    const customer = (Array.isArray(customers) ? customers : []).find((c: any) => c.id === buyerId);
    return customer?.customerName || customer?.name || 'Unknown Buyer';
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !style) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <Button variant="ghost" onClick={() => setLocation('/merchandising/styles')} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Styles
          </Button>
          <Card>
            <CardContent className="py-8 text-center text-red-500">
              Style not found or an error occurred loading the details.
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6 space-y-4">
        <Button variant="ghost" onClick={() => setLocation('/merchandising/styles')} className="mb-0">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Styles
        </Button>

        <DocumentHeader
          title={style.styleNo}
          docNo={`Style #${style.id}`}
          date={style.createdAt}
          status={style.status}
        >
          <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {getBuyerName(style.buyerId)}</span>
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {style.season || 'No Season'}</span>
            <span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" /> {style.productType || 'No Type'}</span>
          </div>
        </DocumentHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full">
            <TabsTrigger value="overview"><Eye className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Overview</TabsTrigger>
            <TabsTrigger value="components"><Layers className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Components</TabsTrigger>
            <TabsTrigger value="colorways"><Palette className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Colorways</TabsTrigger>
            <TabsTrigger value="sizes"><Ruler className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Size Scale</TabsTrigger>
            <TabsTrigger value="bom"><Package className="h-3.5 w-3.5 mr-1 hidden sm:inline" />BOM</TabsTrigger>
            <TabsTrigger value="history"><History className="h-3.5 w-3.5 mr-1 hidden sm:inline" />History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab style={style} styleId={styleId!} getBuyerName={getBuyerName} customers={customers} />
          </TabsContent>
          <TabsContent value="components">
            <ComponentsTab styleId={styleId!} />
          </TabsContent>
          <TabsContent value="colorways">
            <ColorwaysTab styleId={styleId!} />
          </TabsContent>
          <TabsContent value="sizes">
            <SizeScaleTab styleId={styleId!} />
          </TabsContent>
          <TabsContent value="bom">
            <BomTab styleId={styleId!} />
          </TabsContent>
          <TabsContent value="history">
            <HistoryTab style={style} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function OverviewTab({ style, styleId, getBuyerName, customers }: { style: any; styleId: string; getBuyerName: (id: number) => string; customers: any }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    styleNo: style.styleNo || '',
    season: style.season || '',
    productType: style.productType || '',
    description: style.description || '',
    buyerId: style.buyerId?.toString() || '',
    status: style.status || 'DRAFT',
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(`/api/merch/styles/${styleId}`, 'PUT', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Style updated', description: 'Style details saved successfully.' });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/styles', styleId] });
      setEditing(false);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      const res = await apiRequest(`/api/merch/styles/${styleId}/toggle-active`, 'PATCH', { isActive });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Updated', description: 'Style active status updated.' });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/styles', styleId] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      ...form,
      buyerId: parseInt(form.buyerId),
    });
  };

  const handleCancel = () => {
    setForm({
      styleNo: style.styleNo || '',
      season: style.season || '',
      productType: style.productType || '',
      description: style.description || '',
      buyerId: style.buyerId?.toString() || '',
      status: style.status || 'DRAFT',
    });
    setEditing(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Style Overview</CardTitle>
            <CardDescription>General information and specifications</CardDescription>
          </div>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Edit className="h-4 w-4 mr-1" /> Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                <Check className="h-4 w-4 mr-1" /> Save
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Style No</Label>
            {editing ? (
              <Input value={form.styleNo} onChange={(e) => setForm({ ...form, styleNo: e.target.value })} />
            ) : (
              <p className="text-sm font-medium">{style.styleNo}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Season</Label>
            {editing ? (
              <Input value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })} />
            ) : (
              <p className="text-sm font-medium">{style.season || '-'}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Product Type</Label>
            {editing ? (
              <Input value={form.productType} onChange={(e) => setForm({ ...form, productType: e.target.value })} />
            ) : (
              <p className="text-sm font-medium">{style.productType || '-'}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Buyer</Label>
            {editing ? (
              <Select value={form.buyerId} onValueChange={(val) => setForm({ ...form, buyerId: val })}>
                <SelectTrigger><SelectValue placeholder="Select buyer" /></SelectTrigger>
                <SelectContent>
                  {(Array.isArray(customers) ? customers : []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.customerName || c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm font-medium">{getBuyerName(style.buyerId)}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            {editing ? (
              <Select value={form.status} onValueChange={(val) => setForm({ ...form, status: val })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <StatusBadge status={style.status} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Active</Label>
            <div className="flex items-center gap-2">
              <Switch
                checked={style.isActive !== false}
                onCheckedChange={(checked) => toggleActiveMutation.mutate(checked)}
                disabled={toggleActiveMutation.isPending}
              />
              <span className="text-sm">{style.isActive !== false ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Description</Label>
          {editing ? (
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
            />
          ) : (
            <div className="bg-muted/30 rounded-lg p-4 border min-h-[80px]">
              {style.description ? (
                <p className="text-sm whitespace-pre-line">{style.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No description provided</p>
              )}
            </div>
          )}
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-muted/30 rounded-lg p-4 border">
            <p className="text-xs text-muted-foreground mb-1">Tech Pack Reference</p>
            <p className="text-sm font-medium">{style.techPackRef || 'Not attached'}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-4 border">
            <p className="text-xs text-muted-foreground mb-1">Fabrication</p>
            <p className="text-sm font-medium">{style.fabrication || 'Not specified'}</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-4 border">
            <p className="text-xs text-muted-foreground mb-1">Created</p>
            <p className="text-sm font-medium">
              {style.createdAt ? format(new Date(style.createdAt), 'dd MMM yyyy, HH:mm') : '-'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ComponentsTab({ styleId }: { styleId: string }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newRow, setNewRow] = useState({ name: '', componentType: '', uom: '', skuCode: '', isActive: true });
  const [editRow, setEditRow] = useState<any>({});

  const { data: componentsRes, isLoading } = useQuery<any>({
    queryKey: ['/api/merch/styles', styleId, 'components'],
    queryFn: async () => {
      const res = await fetch(`/api/merch/styles/${styleId}/components`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch components');
      return res.json();
    },
  });

  const components = componentsRes?.data || [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(`/api/merch/styles/${styleId}/components`, 'POST', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Component added' });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/styles', styleId, 'components'] });
      setAdding(false);
      setNewRow({ name: '', componentType: '', uom: '', skuCode: '', isActive: true });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest(`/api/merch/styles/${styleId}/components/${id}`, 'PUT', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Component updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/styles', styleId, 'components'] });
      setEditingId(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/merch/styles/${styleId}/components/${id}`, 'DELETE');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Component deleted' });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/styles', styleId, 'components'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const startEdit = (comp: any) => {
    setEditingId(comp.id);
    setEditRow({ name: comp.name, componentType: comp.componentType || '', uom: comp.uom || '', skuCode: comp.skuCode || '', isActive: comp.isActive !== false });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Components</CardTitle>
            <CardDescription>Garment components for this style</CardDescription>
          </div>
          <Button size="sm" onClick={() => setAdding(true)} disabled={adding}>
            <Plus className="h-4 w-4 mr-1" /> Add Component
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead>SKU Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adding && (
                  <TableRow>
                    <TableCell><Input placeholder="Name" value={newRow.name} onChange={(e) => setNewRow({ ...newRow, name: e.target.value })} className="h-8" /></TableCell>
                    <TableCell><Input placeholder="Type" value={newRow.componentType} onChange={(e) => setNewRow({ ...newRow, componentType: e.target.value })} className="h-8" /></TableCell>
                    <TableCell><Input placeholder="UOM" value={newRow.uom} onChange={(e) => setNewRow({ ...newRow, uom: e.target.value })} className="h-8" /></TableCell>
                    <TableCell><Input placeholder="SKU" value={newRow.skuCode} onChange={(e) => setNewRow({ ...newRow, skuCode: e.target.value })} className="h-8" /></TableCell>
                    <TableCell>
                      <Badge variant={newRow.isActive ? 'default' : 'secondary'}>{newRow.isActive ? 'Active' : 'Inactive'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => createMutation.mutate(newRow)} disabled={createMutation.isPending || !newRow.name}>
                          {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setAdding(false); setNewRow({ name: '', componentType: '', uom: '', skuCode: '', isActive: true }); }}>
                          <X className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {components.length === 0 && !adding ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <Layers className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      No components added yet
                    </TableCell>
                  </TableRow>
                ) : (
                  components.map((comp: any) => (
                    <TableRow key={comp.id}>
                      {editingId === comp.id ? (
                        <>
                          <TableCell><Input value={editRow.name} onChange={(e) => setEditRow({ ...editRow, name: e.target.value })} className="h-8" /></TableCell>
                          <TableCell><Input value={editRow.componentType} onChange={(e) => setEditRow({ ...editRow, componentType: e.target.value })} className="h-8" /></TableCell>
                          <TableCell><Input value={editRow.uom} onChange={(e) => setEditRow({ ...editRow, uom: e.target.value })} className="h-8" /></TableCell>
                          <TableCell><Input value={editRow.skuCode} onChange={(e) => setEditRow({ ...editRow, skuCode: e.target.value })} className="h-8" /></TableCell>
                          <TableCell>
                            <Switch checked={editRow.isActive} onCheckedChange={(v) => setEditRow({ ...editRow, isActive: v })} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateMutation.mutate({ id: comp.id, data: editRow })} disabled={updateMutation.isPending}>
                                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                <X className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-medium">{comp.name}</TableCell>
                          <TableCell>{comp.componentType || '-'}</TableCell>
                          <TableCell>{comp.uom || '-'}</TableCell>
                          <TableCell>{comp.skuCode || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={comp.isActive !== false ? 'default' : 'secondary'}>
                              {comp.isActive !== false ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(comp)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteMutation.mutate(comp.id)} disabled={deleteMutation.isPending}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ColorwaysTab({ styleId }: { styleId: string }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newRow, setNewRow] = useState({ colorName: '', colorCode: '', pantoneRef: '', notes: '', isActive: true });
  const [editRow, setEditRow] = useState<any>({});

  const { data: colorwaysRes, isLoading } = useQuery<any>({
    queryKey: ['/api/merch/styles', styleId, 'colorways'],
    queryFn: async () => {
      const res = await fetch(`/api/merch/styles/${styleId}/colorways`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch colorways');
      return res.json();
    },
  });

  const colorways = colorwaysRes?.data || [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(`/api/merch/styles/${styleId}/colorways`, 'POST', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Colorway added' });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/styles', styleId, 'colorways'] });
      setAdding(false);
      setNewRow({ colorName: '', colorCode: '', pantoneRef: '', notes: '', isActive: true });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest(`/api/merch/styles/${styleId}/colorways/${id}`, 'PUT', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Colorway updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/styles', styleId, 'colorways'] });
      setEditingId(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/merch/styles/${styleId}/colorways/${id}`, 'DELETE');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Colorway deleted' });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/styles', styleId, 'colorways'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const startEdit = (cw: any) => {
    setEditingId(cw.id);
    setEditRow({ colorName: cw.colorName || '', colorCode: cw.colorCode || '', pantoneRef: cw.pantoneRef || '', notes: cw.notes || '', isActive: cw.isActive !== false });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Colorways</CardTitle>
            <CardDescription>Color variations for this style</CardDescription>
          </div>
          <Button size="sm" onClick={() => setAdding(true)} disabled={adding}>
            <Plus className="h-4 w-4 mr-1" /> Add Colorway
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Color Name</TableHead>
                  <TableHead>Color Code</TableHead>
                  <TableHead>Pantone Ref</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adding && (
                  <TableRow>
                    <TableCell><Input placeholder="Color name" value={newRow.colorName} onChange={(e) => setNewRow({ ...newRow, colorName: e.target.value })} className="h-8" /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input placeholder="#FF0000" value={newRow.colorCode} onChange={(e) => setNewRow({ ...newRow, colorCode: e.target.value })} className="h-8 w-24" />
                        {newRow.colorCode && <div className="h-6 w-6 rounded border" style={{ backgroundColor: newRow.colorCode }} />}
                      </div>
                    </TableCell>
                    <TableCell><Input placeholder="Pantone ref" value={newRow.pantoneRef} onChange={(e) => setNewRow({ ...newRow, pantoneRef: e.target.value })} className="h-8" /></TableCell>
                    <TableCell><Input placeholder="Notes" value={newRow.notes} onChange={(e) => setNewRow({ ...newRow, notes: e.target.value })} className="h-8" /></TableCell>
                    <TableCell><Badge variant={newRow.isActive ? 'default' : 'secondary'}>{newRow.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => createMutation.mutate(newRow)} disabled={createMutation.isPending || !newRow.colorName}>
                          {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setAdding(false); setNewRow({ colorName: '', colorCode: '', pantoneRef: '', notes: '', isActive: true }); }}>
                          <X className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {colorways.length === 0 && !adding ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <Palette className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      No colorways added yet
                    </TableCell>
                  </TableRow>
                ) : (
                  colorways.map((cw: any) => (
                    <TableRow key={cw.id}>
                      {editingId === cw.id ? (
                        <>
                          <TableCell><Input value={editRow.colorName} onChange={(e) => setEditRow({ ...editRow, colorName: e.target.value })} className="h-8" /></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Input value={editRow.colorCode} onChange={(e) => setEditRow({ ...editRow, colorCode: e.target.value })} className="h-8 w-24" />
                              {editRow.colorCode && <div className="h-6 w-6 rounded border" style={{ backgroundColor: editRow.colorCode }} />}
                            </div>
                          </TableCell>
                          <TableCell><Input value={editRow.pantoneRef} onChange={(e) => setEditRow({ ...editRow, pantoneRef: e.target.value })} className="h-8" /></TableCell>
                          <TableCell><Input value={editRow.notes} onChange={(e) => setEditRow({ ...editRow, notes: e.target.value })} className="h-8" /></TableCell>
                          <TableCell><Switch checked={editRow.isActive} onCheckedChange={(v) => setEditRow({ ...editRow, isActive: v })} /></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateMutation.mutate({ id: cw.id, data: editRow })} disabled={updateMutation.isPending}>
                                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                <X className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-medium">{cw.colorName}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {cw.colorCode && <div className="h-5 w-5 rounded border" style={{ backgroundColor: cw.colorCode }} />}
                              <span className="text-xs font-mono">{cw.colorCode || '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell>{cw.pantoneRef || '-'}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{cw.notes || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={cw.isActive !== false ? 'default' : 'secondary'}>
                              {cw.isActive !== false ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(cw)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteMutation.mutate(cw.id)} disabled={deleteMutation.isPending}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SizeScaleTab({ styleId }: { styleId: string }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newRow, setNewRow] = useState({ scaleName: '', sizes: '', isDefault: false });
  const [editRow, setEditRow] = useState<any>({});

  const { data: scalesRes, isLoading } = useQuery<any>({
    queryKey: ['/api/merch/styles', styleId, 'size-scales'],
    queryFn: async () => {
      const res = await fetch(`/api/merch/styles/${styleId}/size-scales`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch size scales');
      return res.json();
    },
  });

  const scales = scalesRes?.data || [];

  const parseSizes = (sizesStr: string): string[] => {
    return sizesStr.split(',').map(s => s.trim()).filter(Boolean);
  };

  const sizesToString = (sizes: any): string => {
    if (Array.isArray(sizes)) return sizes.join(', ');
    if (typeof sizes === 'string') {
      try { return JSON.parse(sizes).join(', '); } catch { return sizes; }
    }
    return '';
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(`/api/merch/styles/${styleId}/size-scales`, 'POST', {
        ...data,
        sizes: parseSizes(data.sizes),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Size scale added' });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/styles', styleId, 'size-scales'] });
      setAdding(false);
      setNewRow({ scaleName: '', sizes: '', isDefault: false });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest(`/api/merch/styles/${styleId}/size-scales/${id}`, 'PUT', {
        ...data,
        sizes: parseSizes(data.sizes),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Size scale updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/styles', styleId, 'size-scales'] });
      setEditingId(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/merch/styles/${styleId}/size-scales/${id}`, 'DELETE');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Size scale deleted' });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/styles', styleId, 'size-scales'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const startEdit = (scale: any) => {
    setEditingId(scale.id);
    setEditRow({ scaleName: scale.scaleName || '', sizes: sizesToString(scale.sizes), isDefault: scale.isDefault || false });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Size Scales</CardTitle>
            <CardDescription>Size ranges for this style</CardDescription>
          </div>
          <Button size="sm" onClick={() => setAdding(true)} disabled={adding}>
            <Plus className="h-4 w-4 mr-1" /> Add Size Scale
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scale Name</TableHead>
                  <TableHead>Sizes</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adding && (
                  <TableRow>
                    <TableCell><Input placeholder="Scale name" value={newRow.scaleName} onChange={(e) => setNewRow({ ...newRow, scaleName: e.target.value })} className="h-8" /></TableCell>
                    <TableCell><Input placeholder="S, M, L, XL" value={newRow.sizes} onChange={(e) => setNewRow({ ...newRow, sizes: e.target.value })} className="h-8" /></TableCell>
                    <TableCell><Switch checked={newRow.isDefault} onCheckedChange={(v) => setNewRow({ ...newRow, isDefault: v })} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => createMutation.mutate(newRow)} disabled={createMutation.isPending || !newRow.scaleName}>
                          {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setAdding(false); setNewRow({ scaleName: '', sizes: '', isDefault: false }); }}>
                          <X className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {scales.length === 0 && !adding ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      <Ruler className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      No size scales added yet
                    </TableCell>
                  </TableRow>
                ) : (
                  scales.map((scale: any) => {
                    const sizesList = Array.isArray(scale.sizes) ? scale.sizes :
                      (typeof scale.sizes === 'string' ? (() => { try { return JSON.parse(scale.sizes); } catch { return []; } })() : []);

                    return (
                      <TableRow key={scale.id}>
                        {editingId === scale.id ? (
                          <>
                            <TableCell><Input value={editRow.scaleName} onChange={(e) => setEditRow({ ...editRow, scaleName: e.target.value })} className="h-8" /></TableCell>
                            <TableCell><Input value={editRow.sizes} onChange={(e) => setEditRow({ ...editRow, sizes: e.target.value })} className="h-8" placeholder="S, M, L, XL" /></TableCell>
                            <TableCell><Switch checked={editRow.isDefault} onCheckedChange={(v) => setEditRow({ ...editRow, isDefault: v })} /></TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateMutation.mutate({ id: scale.id, data: editRow })} disabled={updateMutation.isPending}>
                                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                  <X className="h-4 w-4 text-red-600" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="font-medium">{scale.scaleName}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {sizesList.map((size: string, i: number) => (
                                  <Badge key={i} variant="outline" className="text-xs">{size}</Badge>
                                ))}
                                {sizesList.length === 0 && <span className="text-muted-foreground text-sm">-</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                              {scale.isDefault && <Badge className="bg-blue-100 text-blue-800">Default</Badge>}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(scale)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteMutation.mutate(scale.id)} disabled={deleteMutation.isPending}>
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BomTab({ styleId }: { styleId: string }) {
  const [, setLocation] = useLocation();

  const { data: bomRes, isLoading } = useQuery<any>({
    queryKey: ['/api/bom/styles', styleId],
    queryFn: async () => {
      const res = await fetch(`/api/bom/styles/${styleId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch BOMs');
      return res.json();
    },
  });

  const boms = bomRes?.data || (Array.isArray(bomRes) ? bomRes : []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Bill of Materials</CardTitle>
            <CardDescription>Material requirements and costing</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/bom/styles/${styleId}`}>
                <ExternalLink className="h-4 w-4 mr-1" /> View BOM
              </Link>
            </Button>
            <Button size="sm" onClick={() => setLocation(`/bom/styles/${styleId}`)}>
              <Plus className="h-4 w-4 mr-1" /> Create New BOM
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : boms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-lg font-medium">No BOMs Created Yet</p>
            <p className="text-sm mt-1">Create a Bill of Materials for this style.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Component</TableHead>
                  <TableHead>Effective From</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {boms.map((bom: any) => (
                  <TableRow key={bom.id}>
                    <TableCell className="font-medium">v{bom.versionNo || bom.version || 1}</TableCell>
                    <TableCell><StatusBadge status={bom.status || 'DRAFT'} /></TableCell>
                    <TableCell>{bom.componentName || bom.component || '-'}</TableCell>
                    <TableCell>
                      {bom.effectiveFrom ? format(new Date(bom.effectiveFrom), 'dd MMM yyyy') : '-'}
                    </TableCell>
                    <TableCell>{bom.linesCount || bom.lines?.length || 0}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/bom/styles/${styleId}`}>
                          <Eye className="h-4 w-4 mr-1" /> View
                        </Link>
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
  );
}

function HistoryTab({ style }: { style: any }) {
  const entries = [];

  if (style.createdAt) {
    entries.push({
      id: 'created',
      action: 'Style Created',
      timestamp: style.createdAt,
      details: `Style ${style.styleNo} was created with status ${style.status || 'DRAFT'}`,
    });
  }

  if (style.updatedAt && style.updatedAt !== style.createdAt) {
    entries.push({
      id: 'updated',
      action: 'Style Updated',
      timestamp: style.updatedAt,
      details: `Last modification to style details`,
    });
  }

  if (style.status === 'ACTIVE') {
    entries.push({
      id: 'activated',
      action: 'Activated',
      timestamp: style.updatedAt || style.createdAt,
      details: 'Style was set to ACTIVE status',
    });
  }

  if (style.status === 'ARCHIVED') {
    entries.push({
      id: 'archived',
      action: 'Archived',
      timestamp: style.updatedAt || style.createdAt,
      details: 'Style was archived',
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>Audit trail and change log</CardDescription>
      </CardHeader>
      <CardContent>
        <AuditTimeline entries={entries} />
      </CardContent>
    </Card>
  );
}