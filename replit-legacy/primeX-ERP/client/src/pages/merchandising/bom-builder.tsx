import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Plus, Loader2, Lock, CheckCircle, Sparkles, ChevronDown, Package, Scissors, BoxIcon,
  History, ShieldAlert, FileEdit, AlertTriangle, Clock, Check, X, Info,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import Spinner from '@/components/ui/spinner';

const bomStatusColors: Record<string, string> = {
  DRAFT: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-green-100 text-green-800',
  LOCKED: 'bg-gray-100 text-gray-800',
};

const overrideStatusColors: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

const categoryIcons: Record<string, any> = {
  FABRIC: Scissors,
  TRIMS: Package,
  PACKING: BoxIcon,
};

export default function BomBuilderPage() {
  const { styleId } = useParams<{ styleId: string }>();
  const [_, navigate] = useLocation();
  const { toast } = useToast();

  const [selectedBomId, setSelectedBomId] = useState<string>('');
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [addVariantOpen, setAddVariantOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string>('');
  const [suggestions, setSuggestions] = useState<any[] | null>(null);
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);
  const [overrideRequestOpen, setOverrideRequestOpen] = useState(false);
  const [overrideLineData, setOverrideLineData] = useState<any>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectRequestId, setRejectRequestId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [lineForm, setLineForm] = useState({
    category: 'FABRIC',
    itemId: '',
    itemDescription: '',
    uom: '',
    baseConsumption: '',
    wastagePct: '',
    processLossPct: '',
    colorPolicy: 'SAME_FOR_ALL',
    sizePolicy: 'SAME_FOR_ALL',
  });

  const [variantForm, setVariantForm] = useState({
    size: '',
    color: '',
    consumptionOverride: '',
    wastageOverridePct: '',
  });

  const [suggestForm, setSuggestForm] = useState({
    productType: '',
    fabricType: '',
    gsm: '',
  });

  const [overrideForm, setOverrideForm] = useState({
    newConsumption: '',
    newWastagePct: '',
    reason: '',
  });

  const { data: versionsData, isLoading: loadingVersions } = useQuery<any>({
    queryKey: ['/api/bom/styles', styleId],
  });

  const rawVersions = versionsData?.data || versionsData?.versions || versionsData || [];
  const versions = Array.isArray(rawVersions) ? rawVersions : [];

  const { data: bomData, isLoading: loadingBom } = useQuery<any>({
    queryKey: ['/api/bom', selectedBomId],
    enabled: !!selectedBomId,
  });

  const { data: styleData } = useQuery<any>({
    queryKey: ['/api/merch/styles', styleId],
    enabled: !!styleId,
  });

  const { data: itemsData } = useQuery<any>({
    queryKey: ['/api/items'],
  });
  const items = Array.isArray(itemsData) ? itemsData : itemsData?.items || [];

  const { data: overrideRequestsData } = useQuery<any>({
    queryKey: ['/api/bom/override-requests', { bomId: selectedBomId }],
    queryFn: async () => {
      const res = await fetch(`/api/bom/override-requests?bomId=${selectedBomId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!selectedBomId && (bomData?.status === 'APPROVED' || bomData?.status === 'LOCKED' || bomData?.data?.status === 'APPROVED' || bomData?.data?.status === 'LOCKED'),
  });

  const currentBom = bomData?.data || bomData;
  const bomLines = currentBom?.lines || [];
  const bomStatus = currentBom?.status || 'DRAFT';
  const isFrozen = bomStatus === 'APPROVED' || bomStatus === 'LOCKED';

  const overrideRequests = overrideRequestsData?.data || overrideRequestsData || [];

  const createBomMutation = useMutation({
    mutationFn: () => apiRequest(`/api/bom/styles/${styleId}`, 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bom/styles', styleId] });
      toast({ title: 'BOM Created', description: 'New BOM version created successfully.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to create BOM.', variant: 'destructive' });
    },
  });

  const addLineMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/bom/${selectedBomId}/lines`, 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bom', selectedBomId] });
      setAddLineOpen(false);
      resetLineForm();
      toast({ title: 'Line Added', description: 'BOM line added successfully.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to add line.', variant: 'destructive' });
    },
  });

  const addVariantMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest(`/api/bom/${selectedBomId}/lines/${selectedLineId}/variants`, 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bom', selectedBomId] });
      setAddVariantOpen(false);
      resetVariantForm();
      toast({ title: 'Variant Added', description: 'Line variant added successfully.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to add variant.', variant: 'destructive' });
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => apiRequest(`/api/bom/${selectedBomId}/approve`, 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bom', selectedBomId] });
      queryClient.invalidateQueries({ queryKey: ['/api/bom/styles', styleId] });
      toast({ title: 'BOM Approved', description: 'BOM has been approved.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to approve BOM.', variant: 'destructive' });
    },
  });

  const reviseMutation = useMutation({
    mutationFn: () => apiRequest(`/api/bom/${selectedBomId}/revise`, 'POST'),
    onSuccess: async (res) => {
      const result = await res.json();
      const newBom = result?.data || result;
      queryClient.invalidateQueries({ queryKey: ['/api/bom/styles', styleId] });
      const versionNo = newBom?.versionNo || 'N';
      toast({ title: 'Revision Created', description: `Revision v${versionNo} created as Draft` });
      if (newBom?.id) {
        setSelectedBomId(String(newBom.id));
      }
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to revise BOM.', variant: 'destructive' });
    },
  });

  const lockMutation = useMutation({
    mutationFn: () => apiRequest(`/api/bom/${selectedBomId}/lock`, 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bom', selectedBomId] });
      queryClient.invalidateQueries({ queryKey: ['/api/bom/styles', styleId] });
      setLockConfirmOpen(false);
      toast({ title: 'BOM Locked', description: 'BOM locked permanently' });
    },
    onError: (err: any) => {
      setLockConfirmOpen(false);
      toast({ title: 'Error', description: err.message || 'Failed to lock BOM.', variant: 'destructive' });
    },
  });

  const suggestMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/bom/ai/suggest', 'POST', data),
    onSuccess: async (res) => {
      const data = await res.json();
      const suggestionsData = data?.data?.suggestions || data?.data?.lines || data?.suggestions || data?.lines || [];
      setSuggestions(suggestionsData);
      toast({ title: 'Suggestions Ready', description: 'AI BOM suggestions generated.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to get suggestions.', variant: 'destructive' });
    },
  });

  const overrideRequestMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/bom/override-requests', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bom/override-requests', { bomId: selectedBomId }] });
      setOverrideRequestOpen(false);
      setOverrideLineData(null);
      setOverrideForm({ newConsumption: '', newWastagePct: '', reason: '' });
      toast({ title: 'Override Request Submitted', description: 'Override request submitted for approval' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to submit override request.', variant: 'destructive' });
    },
  });

  const approveOverrideMutation = useMutation({
    mutationFn: (requestId: number) => apiRequest(`/api/bom/override-requests/${requestId}/approve`, 'PATCH'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bom/override-requests', { bomId: selectedBomId }] });
      queryClient.invalidateQueries({ queryKey: ['/api/bom', selectedBomId] });
      toast({ title: 'Override Approved', description: 'Override request has been approved and applied.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to approve override.', variant: 'destructive' });
    },
  });

  const rejectOverrideMutation = useMutation({
    mutationFn: ({ requestId, rejectionReason }: { requestId: number; rejectionReason: string }) =>
      apiRequest(`/api/bom/override-requests/${requestId}/reject`, 'PATCH', { rejectionReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bom/override-requests', { bomId: selectedBomId }] });
      setRejectDialogOpen(false);
      setRejectRequestId(null);
      setRejectionReason('');
      toast({ title: 'Override Rejected', description: 'Override request has been rejected.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to reject override.', variant: 'destructive' });
    },
  });

  function resetLineForm() {
    setLineForm({
      category: 'FABRIC', itemId: '', itemDescription: '', uom: '',
      baseConsumption: '', wastagePct: '', processLossPct: '',
      colorPolicy: 'SAME_FOR_ALL', sizePolicy: 'SAME_FOR_ALL',
    });
  }

  function resetVariantForm() {
    setVariantForm({ size: '', color: '', consumptionOverride: '', wastageOverridePct: '' });
  }

  function handleAddLine() {
    const payload: any = {
      category: lineForm.category,
      itemDescription: lineForm.itemDescription,
      uom: lineForm.uom,
      baseConsumption: parseFloat(lineForm.baseConsumption) || 0,
      wastagePct: parseFloat(lineForm.wastagePct) || 0,
      processLossPct: parseFloat(lineForm.processLossPct) || 0,
      colorPolicy: lineForm.colorPolicy,
      sizePolicy: lineForm.sizePolicy,
    };
    if (lineForm.itemId) payload.itemId = parseInt(lineForm.itemId);
    addLineMutation.mutate(payload);
  }

  function handleAddVariant() {
    const payload: any = {};
    if (variantForm.size) payload.size = variantForm.size;
    if (variantForm.color) payload.color = variantForm.color;
    if (variantForm.consumptionOverride) payload.consumptionOverride = parseFloat(variantForm.consumptionOverride);
    if (variantForm.wastageOverridePct) payload.wastageOverridePct = parseFloat(variantForm.wastageOverridePct);
    addVariantMutation.mutate(payload);
  }

  function handleSuggest() {
    const payload: any = { productType: suggestForm.productType, styleId: parseInt(styleId!) };
    if (suggestForm.fabricType) payload.fabricType = suggestForm.fabricType;
    if (suggestForm.gsm) payload.gsm = parseInt(suggestForm.gsm);
    suggestMutation.mutate(payload);
  }

  async function handleApplySuggestions() {
    if (!suggestions || !selectedBomId) return;
    for (const line of suggestions) {
      try {
        await apiRequest(`/api/bom/${selectedBomId}/lines`, 'POST', {
          category: line.category || 'FABRIC',
          itemDescription: line.itemDescription || line.description || '',
          uom: line.uom || 'YDS',
          baseConsumption: line.baseConsumption || line.consumption || 0,
          wastagePct: line.wastagePct || line.wastage || 0,
          processLossPct: line.processLossPct || 0,
          colorPolicy: line.colorPolicy || 'SAME_FOR_ALL',
          sizePolicy: line.sizePolicy || 'SAME_FOR_ALL',
        });
      } catch (e) {
        console.error("BOM suggestion apply error:", e);
      }
    }
    queryClient.invalidateQueries({ queryKey: ['/api/bom', selectedBomId] });
    setSuggestions(null);
    setSuggestOpen(false);
    toast({ title: 'Applied', description: 'All suggestions applied to BOM.' });
  }

  function handleOpenOverrideRequest(line: any) {
    setOverrideLineData(line);
    setOverrideForm({
      newConsumption: line.baseConsumption || '',
      newWastagePct: line.wastagePct || '',
      reason: '',
    });
    setOverrideRequestOpen(true);
  }

  function handleSubmitOverrideRequest() {
    if (!overrideForm.reason.trim()) {
      toast({ title: 'Validation', description: 'Reason is required.', variant: 'destructive' });
      return;
    }
    const overrideData: any = {};
    if (overrideForm.newConsumption && overrideForm.newConsumption !== overrideLineData.baseConsumption) {
      overrideData.baseConsumption = parseFloat(overrideForm.newConsumption);
    }
    if (overrideForm.newWastagePct && overrideForm.newWastagePct !== overrideLineData.wastagePct) {
      overrideData.wastagePct = parseFloat(overrideForm.newWastagePct);
    }
    if (Object.keys(overrideData).length === 0) {
      toast({ title: 'No Changes', description: 'Please modify at least one value.', variant: 'destructive' });
      return;
    }
    overrideRequestMutation.mutate({
      styleBomId: parseInt(selectedBomId),
      bomLineId: overrideLineData.id,
      reason: overrideForm.reason,
      overrideData,
    });
  }

  const styleNo = styleData?.styleNo || styleData?.style?.styleNo || `#${styleId}`;

  if (loadingVersions) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">BOM for Style {styleNo}</h1>
            <p className="text-muted-foreground">Bill of Materials management</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {versions.length > 0 && (
              <Select value={selectedBomId} onValueChange={setSelectedBomId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select BOM Version" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v: any, idx: number) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      <span className="flex items-center gap-2">
                        v{v.versionNo || v.version || idx + 1}
                        <Badge variant="outline" className={bomStatusColors[v.status] || ''}>
                          {v.status}
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button onClick={() => createBomMutation.mutate()} disabled={createBomMutation.isPending}>
              {createBomMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Create New BOM
            </Button>
          </div>
        </div>

        {versions.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5" /> Version History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((v: any, idx: number) => (
                    <TableRow
                      key={v.id}
                      className={selectedBomId === String(v.id) ? 'bg-primary/5' : 'cursor-pointer hover:bg-muted/50'}
                      onClick={() => setSelectedBomId(String(v.id))}
                    >
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          v{v.versionNo || v.version || idx + 1}
                          {selectedBomId === String(v.id) && (
                            <Badge variant="default" className="text-xs">Current</Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={bomStatusColors[v.status] || ''}>
                          {v.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {v.createdAt ? new Date(v.createdAt).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={selectedBomId === String(v.id) ? 'default' : 'ghost'}
                          onClick={(e) => { e.stopPropagation(); setSelectedBomId(String(v.id)); }}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {selectedBomId && currentBom && (
          <>
            {isFrozen && (
              <Alert className={bomStatus === 'LOCKED' ? 'border-amber-300 bg-amber-50' : 'border-blue-300 bg-blue-50'}>
                <Info className={`h-4 w-4 ${bomStatus === 'LOCKED' ? 'text-amber-600' : 'text-blue-600'}`} />
                <AlertDescription className={bomStatus === 'LOCKED' ? 'text-amber-800' : 'text-blue-800'}>
                  This BOM is <strong>{bomStatus}</strong>. Editing is disabled. Use 'Create New Revision' to make changes.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <Badge className={`text-sm ${bomStatusColors[bomStatus]}`}>{bomStatus}</Badge>
              {bomStatus === 'DRAFT' && (
                <>
                  <Button size="sm" onClick={() => setAddLineOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Add Line
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                    {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                    Approve BOM
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setSuggestOpen(true)}>
                    <Sparkles className="h-4 w-4 mr-1" /> Suggest BOM
                  </Button>
                </>
              )}
              {bomStatus === 'APPROVED' && (
                <>
                  <Button size="sm" variant="outline" onClick={() => reviseMutation.mutate()} disabled={reviseMutation.isPending}>
                    {reviseMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    <FileEdit className="h-4 w-4 mr-1" /> Create New Revision
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setLockConfirmOpen(true)}>
                    <Lock className="h-4 w-4 mr-1" /> Lock BOM
                  </Button>
                </>
              )}
              {bomStatus === 'LOCKED' && (
                <>
                  <Badge variant="secondary"><Lock className="h-3 w-3 mr-1 inline" /> Read-Only</Badge>
                  <Button size="sm" variant="outline" onClick={() => reviseMutation.mutate()} disabled={reviseMutation.isPending}>
                    {reviseMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    <FileEdit className="h-4 w-4 mr-1" /> Create New Revision
                  </Button>
                </>
              )}
            </div>

            {loadingBom ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : (
              <Accordion type="multiple" defaultValue={['FABRIC', 'TRIMS', 'PACKING']} className="space-y-2">
                {(['FABRIC', 'TRIMS', 'PACKING'] as const).map((category) => {
                  const lines = bomLines.filter((l: any) => l.category === category);
                  const Icon = categoryIcons[category] || Package;
                  return (
                    <AccordionItem key={category} value={category} className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-2">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                          <span className="font-semibold">{category}</span>
                          <Badge variant="outline" className="ml-2">{lines.length} items</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {lines.length === 0 ? (
                          <p className="text-muted-foreground text-center py-4">No items in this category</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Description</TableHead>
                                  <TableHead>UOM</TableHead>
                                  <TableHead>Base Consumption</TableHead>
                                  <TableHead>Wastage %</TableHead>
                                  <TableHead>Process Loss %</TableHead>
                                  <TableHead>Color Policy</TableHead>
                                  <TableHead>Size Policy</TableHead>
                                  <TableHead>Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {lines.map((line: any) => (
                                  <> 
                                    <TableRow key={line.id}>
                                      <TableCell className="font-medium">{line.itemDescription}</TableCell>
                                      <TableCell>{line.uom}</TableCell>
                                      <TableCell>{line.baseConsumption}</TableCell>
                                      <TableCell>{line.wastagePct}%</TableCell>
                                      <TableCell>{line.processLossPct}%</TableCell>
                                      <TableCell>
                                        <Badge variant="outline" className="text-xs">{line.colorPolicy}</Badge>
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant="outline" className="text-xs">{line.sizePolicy}</Badge>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-1">
                                          {bomStatus === 'DRAFT' && (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => {
                                                setSelectedLineId(String(line.id));
                                                setAddVariantOpen(true);
                                              }}
                                            >
                                              <Plus className="h-3 w-3 mr-1" /> Variant
                                            </Button>
                                          )}
                                          {isFrozen && (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="text-amber-600 hover:text-amber-700"
                                              onClick={() => handleOpenOverrideRequest(line)}
                                            >
                                              <ShieldAlert className="h-3 w-3 mr-1" /> Override
                                            </Button>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                    {line.variants?.map((v: any) => (
                                      <TableRow key={`v-${v.id}`} className="bg-muted/30">
                                        <TableCell className="pl-8 text-muted-foreground">
                                          ↳ {v.size && `Size: ${v.size}`} {v.color && `Color: ${v.color}`}
                                        </TableCell>
                                        <TableCell />
                                        <TableCell>{v.consumptionOverride ?? '-'}</TableCell>
                                        <TableCell>{v.wastageOverridePct != null ? `${v.wastageOverridePct}%` : '-'}</TableCell>
                                        <TableCell colSpan={4} />
                                      </TableRow>
                                    ))}
                                  </>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}

            {isFrozen && Array.isArray(overrideRequests) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5" /> Override Requests
                  </CardTitle>
                  <CardDescription>Pending and processed override requests for this BOM</CardDescription>
                </CardHeader>
                <CardContent>
                  {overrideRequests.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">No override requests</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Line Item</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Changes</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Requested</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {overrideRequests.map((req: any) => {
                            const matchingLine = bomLines.find((l: any) => l.id === req.bomLineId);
                            const overrideData = typeof req.overrideData === 'string' ? JSON.parse(req.overrideData) : (req.overrideData || {});
                            return (
                              <TableRow key={req.id}>
                                <TableCell className="font-medium">
                                  {matchingLine?.itemDescription || `Line #${req.bomLineId || 'N/A'}`}
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate" title={req.reason}>
                                  {req.reason}
                                </TableCell>
                                <TableCell>
                                  <div className="text-xs space-y-1">
                                    {overrideData.baseConsumption !== undefined && (
                                      <div>Consumption: <span className="text-red-500 line-through">{matchingLine?.baseConsumption}</span> → <span className="text-green-600 font-medium">{overrideData.baseConsumption}</span></div>
                                    )}
                                    {overrideData.wastagePct !== undefined && (
                                      <div>Wastage: <span className="text-red-500 line-through">{matchingLine?.wastagePct}%</span> → <span className="text-green-600 font-medium">{overrideData.wastagePct}%</span></div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={overrideStatusColors[req.status] || ''}>
                                    {req.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : '-'}
                                </TableCell>
                                <TableCell className="text-right">
                                  {req.status === 'PENDING' && (
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-green-600 hover:text-green-700"
                                        onClick={() => approveOverrideMutation.mutate(req.id)}
                                        disabled={approveOverrideMutation.isPending}
                                      >
                                        <Check className="h-3 w-3 mr-1" /> Approve
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-red-600 hover:text-red-700"
                                        onClick={() => {
                                          setRejectRequestId(req.id);
                                          setRejectionReason('');
                                          setRejectDialogOpen(true);
                                        }}
                                      >
                                        <X className="h-3 w-3 mr-1" /> Reject
                                      </Button>
                                    </div>
                                  )}
                                  {req.status === 'REJECTED' && req.rejectionReason && (
                                    <span className="text-xs text-muted-foreground" title={req.rejectionReason}>
                                      {req.rejectionReason.substring(0, 30)}{req.rejectionReason.length > 30 ? '...' : ''}
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!selectedBomId && versions.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No BOM versions exist for this style yet.</p>
              <Button onClick={() => createBomMutation.mutate()} disabled={createBomMutation.isPending}>
                <Plus className="h-4 w-4 mr-2" /> Create First BOM
              </Button>
            </CardContent>
          </Card>
        )}

        {!selectedBomId && versions.length > 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ChevronDown className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Select a BOM version from the history above to view details.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={addLineOpen} onOpenChange={setAddLineOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add BOM Line</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select value={lineForm.category} onValueChange={(v) => setLineForm({ ...lineForm, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FABRIC">Fabric</SelectItem>
                  <SelectItem value="TRIMS">Trims</SelectItem>
                  <SelectItem value="PACKING">Packing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Item (Optional)</Label>
              <Select value={lineForm.itemId} onValueChange={(v) => setLineForm({ ...lineForm, itemId: v })}>
                <SelectTrigger><SelectValue placeholder="Select item..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {items.map((item: any) => (
                    <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Item Description</Label>
              <Input value={lineForm.itemDescription} onChange={(e) => setLineForm({ ...lineForm, itemDescription: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>UOM</Label>
                <Input value={lineForm.uom} onChange={(e) => setLineForm({ ...lineForm, uom: e.target.value })} placeholder="YDS, MTR, PCS..." />
              </div>
              <div>
                <Label>Base Consumption</Label>
                <Input type="number" step="0.001" value={lineForm.baseConsumption} onChange={(e) => setLineForm({ ...lineForm, baseConsumption: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Wastage %</Label>
                <Input type="number" step="0.1" value={lineForm.wastagePct} onChange={(e) => setLineForm({ ...lineForm, wastagePct: e.target.value })} />
              </div>
              <div>
                <Label>Process Loss %</Label>
                <Input type="number" step="0.1" value={lineForm.processLossPct} onChange={(e) => setLineForm({ ...lineForm, processLossPct: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Color Policy</Label>
                <Select value={lineForm.colorPolicy} onValueChange={(v) => setLineForm({ ...lineForm, colorPolicy: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SAME_FOR_ALL">Same for All</SelectItem>
                    <SelectItem value="PER_COLOR">Per Color</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Size Policy</Label>
                <Select value={lineForm.sizePolicy} onValueChange={(v) => setLineForm({ ...lineForm, sizePolicy: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SAME_FOR_ALL">Same for All</SelectItem>
                    <SelectItem value="PER_SIZE">Per Size</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddLineOpen(false)}>Cancel</Button>
            <Button onClick={handleAddLine} disabled={addLineMutation.isPending}>
              {addLineMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add Line
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addVariantOpen} onOpenChange={setAddVariantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Variant Override</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Size</Label>
                <Input value={variantForm.size} onChange={(e) => setVariantForm({ ...variantForm, size: e.target.value })} placeholder="S, M, L, XL..." />
              </div>
              <div>
                <Label>Color</Label>
                <Input value={variantForm.color} onChange={(e) => setVariantForm({ ...variantForm, color: e.target.value })} placeholder="Red, Blue..." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Consumption Override</Label>
                <Input type="number" step="0.001" value={variantForm.consumptionOverride} onChange={(e) => setVariantForm({ ...variantForm, consumptionOverride: e.target.value })} />
              </div>
              <div>
                <Label>Wastage Override %</Label>
                <Input type="number" step="0.1" value={variantForm.wastageOverridePct} onChange={(e) => setVariantForm({ ...variantForm, wastageOverridePct: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddVariantOpen(false)}>Cancel</Button>
            <Button onClick={handleAddVariant} disabled={addVariantMutation.isPending}>
              {addVariantMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add Variant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={suggestOpen} onOpenChange={(open) => { setSuggestOpen(open); if (!open) setSuggestions(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" /> AI BOM Suggestions
            </DialogTitle>
          </DialogHeader>
          {!suggestions ? (
            <div className="space-y-4">
              <div>
                <Label>Product Type *</Label>
                <Input value={suggestForm.productType} onChange={(e) => setSuggestForm({ ...suggestForm, productType: e.target.value })} placeholder="T-Shirt, Polo, Denim Jeans..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Fabric Type (optional)</Label>
                  <Input value={suggestForm.fabricType} onChange={(e) => setSuggestForm({ ...suggestForm, fabricType: e.target.value })} placeholder="Cotton Jersey, Twill..." />
                </div>
                <div>
                  <Label>GSM (optional)</Label>
                  <Input type="number" value={suggestForm.gsm} onChange={(e) => setSuggestForm({ ...suggestForm, gsm: e.target.value })} placeholder="160, 200..." />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSuggestOpen(false)}>Cancel</Button>
                <Button onClick={handleSuggest} disabled={suggestMutation.isPending || !suggestForm.productType}>
                  {suggestMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Generate Suggestions
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead>Consumption</TableHead>
                    <TableHead>Wastage %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map((s: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell><Badge variant="outline">{s.category}</Badge></TableCell>
                      <TableCell>{s.itemDescription || s.description}</TableCell>
                      <TableCell>{s.uom}</TableCell>
                      <TableCell>{s.baseConsumption || s.consumption}</TableCell>
                      <TableCell>{s.wastagePct || s.wastage}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSuggestions(null)}>Back</Button>
                <Button onClick={handleApplySuggestions}>
                  <CheckCircle className="h-4 w-4 mr-2" /> Apply All Suggestions
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={lockConfirmOpen} onOpenChange={setLockConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600" /> Lock BOM Permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Once locked, the BOM cannot be edited directly.
              You can still create a new revision from a locked BOM.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => lockMutation.mutate()}
              disabled={lockMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {lockMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Lock BOM
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={overrideRequestOpen} onOpenChange={setOverrideRequestOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" /> Request Override
            </DialogTitle>
            <DialogDescription>
              Submit an override request for this BOM line. Requires approval.
            </DialogDescription>
          </DialogHeader>
          {overrideLineData && (
            <div className="space-y-4">
              <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                <div><span className="text-muted-foreground">Item:</span> <strong>{overrideLineData.itemDescription}</strong></div>
                <div><span className="text-muted-foreground">Current Consumption:</span> {overrideLineData.baseConsumption}</div>
                <div><span className="text-muted-foreground">Current Wastage:</span> {overrideLineData.wastagePct}%</div>
              </div>
              <div>
                <Label>New Consumption</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={overrideForm.newConsumption}
                  onChange={(e) => setOverrideForm({ ...overrideForm, newConsumption: e.target.value })}
                />
              </div>
              <div>
                <Label>New Wastage %</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={overrideForm.newWastagePct}
                  onChange={(e) => setOverrideForm({ ...overrideForm, newWastagePct: e.target.value })}
                />
              </div>
              <div>
                <Label>Reason <span className="text-red-500">*</span></Label>
                <Textarea
                  value={overrideForm.reason}
                  onChange={(e) => setOverrideForm({ ...overrideForm, reason: e.target.value })}
                  placeholder="Explain why this override is needed..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideRequestOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmitOverrideRequest}
              disabled={overrideRequestMutation.isPending || !overrideForm.reason.trim()}
            >
              {overrideRequestMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Override Request</DialogTitle>
            <DialogDescription>Provide a reason for rejecting this override request.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>Rejection Reason <span className="text-red-500">*</span></Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (rejectRequestId && rejectionReason.trim()) {
                  rejectOverrideMutation.mutate({ requestId: rejectRequestId, rejectionReason });
                }
              }}
              disabled={rejectOverrideMutation.isPending || !rejectionReason.trim()}
            >
              {rejectOverrideMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
