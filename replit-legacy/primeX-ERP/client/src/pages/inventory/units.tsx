import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, MoreVertical, Plus, RefreshCw, Search } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { FormDescription } from '@/components/ui/form';
import { PageHeader } from '../../components/page-header';
import { EmptyState } from '../../components/empty-state';
import { DashboardContainer } from '@/components/layout/dashboard-container';

// Unit form schema
const unitFormSchema = z.object({
  unitCode: z.string().min(1, 'Unit code is required').max(10, 'Unit code must be 10 characters or less'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  type: z.string().min(1, 'Type is required'),
  baseUnit: z.boolean().default(false),
  conversionFactor: z.string().optional(),
  baseUnitId: z.number().nullable().optional(),
  isActive: z.boolean().default(true),
  tenantId: z.number()
});

type UnitFormValues = z.infer<typeof unitFormSchema>;

// Define TypeScript types for our data
type Unit = {
  id: number;
  unitCode: string;
  name: string;
  description: string | null;
  type: string;
  baseUnit: boolean;
  conversionFactor: string | null;
  baseUnitId: number | null;
  isActive: boolean;
  tenantId: number;
  createdAt: string;
  updatedAt: string;
};

// Unit types for dropdown options
const UNIT_TYPES = [
  { value: 'length', label: 'Length' },
  { value: 'weight', label: 'Weight' },
  { value: 'volume', label: 'Volume' },
  { value: 'area', label: 'Area' },
  { value: 'quantity', label: 'Quantity' },
  { value: 'time', label: 'Time' },
  { value: 'temperature', label: 'Temperature' },
];

export default function UnitsPage() {
  const { user: currentUser } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string | undefined>(undefined);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const tenantId = currentUser?.tenant?.id;

  // Query to fetch units
  const { data: units = [], isLoading } = useQuery({
    queryKey: ['/api/item-units', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const response = await fetch(`/api/item-units?tenantId=${tenantId}${filterType && filterType !== 'all' ? `&type=${filterType}` : ''}`);
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    }
  });

  // Create form
  const createForm = useForm<UnitFormValues>({
    resolver: zodResolver(unitFormSchema),
    defaultValues: {
      unitCode: '',
      name: '',
      description: '',
      type: '',
      baseUnit: false,
      conversionFactor: '1',
      baseUnitId: null,
      isActive: true,
      tenantId: tenantId || 0
    }
  });

  // Edit form
  const editForm = useForm<UnitFormValues>({
    resolver: zodResolver(unitFormSchema),
    defaultValues: {
      unitCode: '',
      name: '',
      description: '',
      type: '',
      baseUnit: false,
      conversionFactor: '1',
      baseUnitId: null,
      isActive: true,
      tenantId: tenantId || 0
    }
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (values: UnitFormValues) => {
      return apiRequest('/api/item-units', 'POST', values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/item-units', tenantId] });
      setIsCreateDialogOpen(false);
      createForm.reset();
      toast({
        title: 'Success',
        description: 'Unit created successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create unit',
        variant: 'destructive',
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (values: UnitFormValues & { id: number }) => {
      const { id, ...updateData } = values;
      return apiRequest(`/api/item-units/${id}`, 'PUT', updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/item-units', tenantId] });
      setIsEditDialogOpen(false);
      setSelectedUnit(null);
      toast({
        title: 'Success',
        description: 'Unit updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update unit',
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest(`/api/item-units/${id}?tenantId=${tenantId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/item-units', tenantId] });
      toast({
        title: 'Success',
        description: 'Unit deleted successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete unit',
        variant: 'destructive',
      });
    },
  });

  const handleCreateSubmit = (values: UnitFormValues) => {
    createMutation.mutate(values);
  };

  const handleEditSubmit = (values: UnitFormValues) => {
    if (selectedUnit) {
      updateMutation.mutate({ ...values, id: selectedUnit.id });
    }
  };

  const handleEdit = (unit: Unit) => {
    setSelectedUnit(unit);
    editForm.reset({
      unitCode: unit.unitCode,
      name: unit.name,
      description: unit.description || '',
      type: unit.type,
      baseUnit: unit.baseUnit,
      conversionFactor: unit.conversionFactor || '1',
      baseUnitId: unit.baseUnitId,
      isActive: unit.isActive,
      tenantId: unit.tenantId
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this unit?')) {
      deleteMutation.mutate(id);
    }
  };

  // Filter units by search query and type
  const filteredUnits = units.filter((unit: any) => {
    const matchesSearch = !searchQuery || 
      (unit.name && unit.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (unit.unitCode && unit.unitCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (unit.description && unit.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = !filterType || unit.type === filterType;
    
    return matchesSearch && matchesType;
  });

  return (
    <DashboardContainer
      title="Unit Management"
      subtitle="Manage measurement units used in inventory"
      actions={
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Unit
        </Button>
      }
    >

      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search units..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full md:w-44">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {UNIT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/item-units', tenantId] })}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {/* "Add Unit" button removed as it's already in the DashboardContainer actions */}
        </div>
      </div>

      <Card>
        <CardHeader className="px-6 py-4">
          <CardTitle className="text-lg">Measurement Units</CardTitle>
          <CardDescription>
            Units for measuring length, weight, volume, and more
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredUnits.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Base Unit</TableHead>
                  <TableHead>Conv. Factor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUnits.map((unit: Unit) => (
                  <TableRow key={unit.id}>
                    <TableCell className="font-medium">{unit.unitCode}</TableCell>
                    <TableCell>{unit.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {UNIT_TYPES.find(t => t.value === unit.type)?.label || unit.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {unit.baseUnit ? (
                        <Badge className="bg-green-50 text-green-700 border-green-200">
                          Base Unit
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">Derived</span>
                      )}
                    </TableCell>
                    <TableCell>{unit.conversionFactor}</TableCell>
                    <TableCell>
                      {unit.isActive ? (
                        <Badge variant="default" className="bg-green-500">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(unit)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => handleDelete(unit.id)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No units found"
              description="Create your first unit to get started."
              icon={<div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Search className="h-6 w-6 text-primary" />
              </div>}
              action={
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Unit
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Create Unit Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Add New Unit</DialogTitle>
            <DialogDescription>
              Add a new measurement unit for use in inventory items.
            </DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={createForm.control}
                  name="unitCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Code *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., KG, M, CM" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Kilogram, Meter" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={createForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Unit description..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={createForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {UNIT_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="baseUnit"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between space-x-2 space-y-0 rounded-md border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Base Unit</FormLabel>
                        <FormDescription className="text-xs">
                          Is this a base unit of measurement?
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={createForm.control}
                  name="conversionFactor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Conversion Factor</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="1" 
                          step="0.0001"
                          {...field} 
                          disabled={createForm.watch('baseUnit')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createForm.control}
                  name="baseUnitId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base Unit</FormLabel>
                      <Select 
                        onValueChange={(value) => value === "none" ? field.onChange(null) : field.onChange(parseInt(value))} 
                        value={field.value?.toString() || "none"}
                        disabled={createForm.watch('baseUnit')}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select base unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {units
                            .filter((unit: Unit) => unit.baseUnit && unit.type === createForm.watch('type'))
                            .map((unit: Unit) => (
                              <SelectItem key={unit.id} value={unit.id.toString()}>
                                {unit.name} ({unit.unitCode})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={createForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between space-x-2 space-y-0 rounded-md border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <FormDescription className="text-xs">
                        Inactive units won't be available for selection.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button 
                  variant="outline" 
                  type="button" 
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Unit
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Unit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Unit</DialogTitle>
            <DialogDescription>
              Update the measurement unit details.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="unitCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit Code *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., KG, M, CM" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Kilogram, Meter" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Unit description..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {UNIT_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="baseUnit"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between space-x-2 space-y-0 rounded-md border p-4">
                      <div className="space-y-0.5">
                        <FormLabel>Base Unit</FormLabel>
                        <FormDescription className="text-xs">
                          Is this a base unit of measurement?
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="conversionFactor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Conversion Factor</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="1" 
                          step="0.0001"
                          {...field} 
                          disabled={editForm.watch('baseUnit')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={editForm.control}
                  name="baseUnitId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base Unit</FormLabel>
                      <Select 
                        onValueChange={(value) => value === "none" ? field.onChange(null) : field.onChange(parseInt(value))} 
                        value={field.value?.toString() || "none"}
                        disabled={editForm.watch('baseUnit')}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select base unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {units
                            .filter((unit: Unit) => unit.baseUnit && unit.type === editForm.watch('type') 
                              && (!selectedUnit || unit.id !== selectedUnit.id))
                            .map((unit: Unit) => (
                              <SelectItem key={unit.id} value={unit.id.toString()}>
                                {unit.name} ({unit.unitCode})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={editForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between space-x-2 space-y-0 rounded-md border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <FormDescription className="text-xs">
                        Inactive units won't be available for selection.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button 
                  variant="outline" 
                  type="button" 
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Update Unit
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}