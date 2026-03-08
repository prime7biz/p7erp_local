import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation, Link } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus, Search, Filter, Eye, Edit, Loader2, Shirt,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import Spinner from '@/components/ui/spinner';

const statusColors: Record<string, string> = {
  DRAFT: 'bg-blue-100 text-blue-800',
  ACTIVE: 'bg-green-100 text-green-800',
  ARCHIVED: 'bg-gray-100 text-gray-800',
};

export default function StylesPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedBuyer, setSelectedBuyer] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    styleNo: '',
    buyerId: '',
    season: '',
    productType: '',
    description: '',
  });

  const { data: stylesResponse, isLoading } = useQuery<any>({
    queryKey: ['/api/merch/styles', selectedStatus, selectedBuyer],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedStatus && selectedStatus !== 'all') params.append('status', selectedStatus);
      if (selectedBuyer && selectedBuyer !== 'all') params.append('buyerId', selectedBuyer);
      const res = await fetch(`/api/merch/styles?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch styles');
      return res.json();
    },
  });

  const { data: customers } = useQuery<any>({
    queryKey: ['/api/customers'],
  });

  const styles = stylesResponse?.data || [];

  const filteredStyles = styles.filter((style: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      style.styleNo?.toLowerCase().includes(q) ||
      style.season?.toLowerCase().includes(q) ||
      style.productType?.toLowerCase().includes(q)
    );
  });

  const createStyleMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest('/api/merch/styles', 'POST', {
        ...data,
        buyerId: parseInt(data.buyerId),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Style created', description: 'New garment style has been created successfully.' });
      queryClient.invalidateQueries({ queryKey: ['/api/merch/styles'] });
      setDialogOpen(false);
      setFormData({ styleNo: '', buyerId: '', season: '', productType: '', description: '' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = () => {
    if (!formData.styleNo || !formData.buyerId) {
      toast({ title: 'Validation Error', description: 'Style No and Buyer are required.', variant: 'destructive' });
      return;
    }
    createStyleMutation.mutate(formData);
  };

  const getBuyerName = (buyerId: number) => {
    const customer = (Array.isArray(customers) ? customers : []).find((c: any) => c.id === buyerId);
    return customer?.customerName || customer?.name || 'Unknown Buyer';
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Shirt className="h-6 w-6" />
              Garment Styles
            </h1>
            <p className="text-gray-500 mt-1">Manage garment styles, tech packs, and buyer specifications</p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Style
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-medium flex items-center">
              <Filter className="h-5 w-5 mr-2 text-gray-500" />
              Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="search" className="mb-1 block">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    placeholder="Search by style no, season..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1 block">Status</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block">Buyer</Label>
                <Select value={selectedBuyer} onValueChange={setSelectedBuyer}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Buyers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Buyers</SelectItem>
                    {(Array.isArray(customers) ? customers : []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.customerName || c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center items-center p-8">
                <Spinner size="lg" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Style No</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Season</TableHead>
                    <TableHead>Product Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStyles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                        No styles found. Create your first garment style to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredStyles.map((style: any) => (
                      <TableRow key={style.id}>
                        <TableCell className="font-medium">{style.styleNo}</TableCell>
                        <TableCell>{getBuyerName(style.buyerId)}</TableCell>
                        <TableCell>{style.season || '-'}</TableCell>
                        <TableCell>{style.productType || '-'}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[style.status] || 'bg-gray-100 text-gray-800'}>
                            {style.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setLocation(`/merchandising/styles/${style.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Add New Style</DialogTitle>
              <DialogDescription>
                Create a new garment style with buyer and season details.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="styleNo">Style No *</Label>
                <Input
                  id="styleNo"
                  placeholder="e.g., ST-2026-001"
                  value={formData.styleNo}
                  onChange={(e) => setFormData({ ...formData, styleNo: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="buyerId">Buyer *</Label>
                <Select
                  value={formData.buyerId}
                  onValueChange={(val) => setFormData({ ...formData, buyerId: val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select buyer" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Array.isArray(customers) ? customers : []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.customerName || c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="season">Season</Label>
                  <Input
                    id="season"
                    placeholder="e.g., SS2026"
                    value={formData.season}
                    onChange={(e) => setFormData({ ...formData, season: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productType">Product Type</Label>
                  <Input
                    id="productType"
                    placeholder="e.g., T-Shirt, Polo"
                    value={formData.productType}
                    onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Style description and notes..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={createStyleMutation.isPending}>
                {createStyleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Style
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
