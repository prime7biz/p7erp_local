import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams } from 'wouter';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Clock,
  Calendar,
  ImagePlus,
  CheckSquare,
  X,
  Plus,
  FileText,
  MessageCircle,
  Upload,
  FileUp,
  Eye,
  PencilLine,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import Spinner from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { SampleDevelopment, SampleMaterial, SampleApproval } from '@shared/schema';

function formatDate(dateString: string | Date | null | undefined) {
  if (!dateString) return '-';
  return format(new Date(dateString), 'MMM dd, yyyy');
}

const statusColors = {
  new: 'bg-blue-100 text-blue-800',
  in_process: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-800',
  sent_to_customer: 'bg-purple-100 text-purple-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
};

export default function SampleDetailPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('details');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Fetch sample details
  const {
    data: sample,
    isLoading,
    isError,
  } = useQuery({
    queryKey: [`/api/samples/${id}`],
    enabled: !!id,
  });

  // Fetch sample materials
  const {
    data: materials,
    isLoading: loadingMaterials,
  } = useQuery({
    queryKey: [`/api/samples/${id}/materials`],
    enabled: !!id,
    placeholderData: [],
  });

  // Fetch sample approvals
  const {
    data: approvals,
    isLoading: loadingApprovals,
  } = useQuery({
    queryKey: [`/api/samples/${id}/approvals`],
    enabled: !!id,
    placeholderData: [],
  });

  // Fetch customers for lookup
  const { data: customers } = useQuery({
    queryKey: ['/api/customers'],
    placeholderData: [],
  });

  // Fetch sample types for lookup
  const { data: sampleTypes } = useQuery({
    queryKey: ['/api/sample-types'],
    placeholderData: [],
  });

  // Fetch items for materials dropdown
  const { data: items } = useQuery({
    queryKey: ['/api/items'],
    placeholderData: [],
  });

  // Update sample status mutation
  const updateSampleStatus = useMutation({
    mutationFn: (status: string) => {
      return apiRequest(`/api/samples/${id}`, {
        method: 'PATCH',
        data: { status },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/samples/${id}`] });
      toast({
        title: 'Status updated',
        description: 'The sample status has been updated successfully.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'There was an error updating the sample status.',
        variant: 'destructive',
      });
    },
  });

  // Delete sample mutation
  const deleteSample = useMutation({
    mutationFn: () => {
      return apiRequest(`/api/samples/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/samples'] });
      toast({
        title: 'Sample deleted',
        description: 'The sample has been deleted successfully.',
      });
      setLocation('/samples');
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'There was an error deleting the sample.',
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center h-full">
          <Spinner size="lg" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !sample) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-red-500 mb-4">Error loading sample details</p>
          <Button onClick={() => setLocation('/samples')}>Back to Samples</Button>
        </div>
      </DashboardLayout>
    );
  }

  const customerName = customers?.find(
    (c: { id: number }) => c.id === sample.customerId
  )?.customerName || 'Unknown Customer';
  
  const sampleTypeName = sampleTypes?.find(
    (t: { value: string }) => t.value === (sample.sampleType || String(sample.sampleTypeId || ''))
  )?.label || sample.sampleType || sample.priority || 'N/A';

  const statusClassName = 
    statusColors[sample.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800';

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/samples')}
              className="mr-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center">
                <h1 className="text-2xl font-bold text-neutral-darkest mr-3">
                  {sample.styleName}
                </h1>
                <Badge className={statusClassName}>
                  {sample.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <p className="text-neutral-dark flex items-center mt-1">
                <span className="font-medium mr-2">Sample ID:</span> {sample.sampleId}
                <span className="mx-2">•</span>
                <span className="font-medium mr-2">Customer:</span> {customerName}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Select
              value={sample.status}
              onValueChange={(value) => updateSampleStatus.mutate(value)}
              disabled={updateSampleStatus.isPending}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Change Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="in_process">In Process</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="sent_to_customer">Sent to Customer</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            
            <Button onClick={() => setLocation(`/samples/${id}/edit`)}>
              <Edit className="mr-2 h-4 w-4" /> Edit
            </Button>
            
            <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="mb-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="materials">Materials</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
            <TabsTrigger value="communications">Communications</TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Sample Information</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-10">
                    <div>
                      <h3 className="text-sm font-medium text-neutral-dark">Style Name</h3>
                      <p className="mt-1 text-base">{sample.styleName}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-neutral-dark">Sample Type</h3>
                      <p className="mt-1 text-base">{sampleTypeName}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-neutral-dark">Department</h3>
                      <p className="mt-1 text-base">{sample.department}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-neutral-dark">Quantity</h3>
                      <p className="mt-1 text-base">{sample.quantity}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-neutral-dark">Requested Date</h3>
                      <p className="mt-1 text-base flex items-center">
                        <Calendar className="h-4 w-4 mr-2 text-neutral" />
                        {formatDate(sample.requestedDate)}
                      </p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-neutral-dark">Target Completion</h3>
                      <p className="mt-1 text-base flex items-center">
                        <Clock className="h-4 w-4 mr-2 text-neutral" />
                        {formatDate(sample.targetCompletionDate)}
                      </p>
                    </div>
                    {sample.actualCompletionDate && (
                      <div>
                        <h3 className="text-sm font-medium text-neutral-dark">Actual Completion</h3>
                        <p className="mt-1 text-base flex items-center">
                          <CheckSquare className="h-4 w-4 mr-2 text-green-500" />
                          {formatDate(sample.actualCompletionDate)}
                        </p>
                      </div>
                    )}
                    {sample.rejectionReason && (
                      <div>
                        <h3 className="text-sm font-medium text-neutral-dark">Rejection Reason</h3>
                        <p className="mt-1 text-base flex items-center">
                          <X className="h-4 w-4 mr-2 text-red-500" />
                          {sample.rejectionReason}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <Separator className="my-6" />
                  
                  <div>
                    <h3 className="text-sm font-medium text-neutral-dark mb-2">Description</h3>
                    <p className="text-base">
                      {sample.description || 'No description provided.'}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Status Timeline</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="relative border-l-2 border-neutral-100 pl-5 pb-5 space-y-6">
                    <div className="relative">
                      <div className="absolute -left-[27px] flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600 ring-8 ring-white">
                        <FileText className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex flex-col">
                        <h4 className="font-medium">Sample Created</h4>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(sample.createdAt)}
                        </span>
                      </div>
                    </div>
                    
                    {sample.status !== 'new' && (
                      <div className="relative">
                        <div className="absolute -left-[27px] flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-600 ring-8 ring-white">
                          <Clock className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex flex-col">
                          <h4 className="font-medium">Started Processing</h4>
                          <span className="text-xs text-muted-foreground">
                            {/* We don't have the exact date in our data model, so this is a placeholder */}
                            After {formatDate(sample.createdAt)}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {['completed', 'sent_to_customer', 'approved', 'rejected'].includes(sample.status) && (
                      <div className="relative">
                        <div className="absolute -left-[27px] flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600 ring-8 ring-white">
                          <CheckSquare className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex flex-col">
                          <h4 className="font-medium">Completed</h4>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(sample.actualCompletionDate) || "Date not recorded"}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {['sent_to_customer', 'approved', 'rejected'].includes(sample.status) && (
                      <div className="relative">
                        <div className="absolute -left-[27px] flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-purple-600 ring-8 ring-white">
                          <Upload className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex flex-col">
                          <h4 className="font-medium">Sent to Customer</h4>
                          <span className="text-xs text-muted-foreground">
                            {/* We don't have the exact date in our data model, so this is a placeholder */}
                            After completion
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {['approved', 'rejected'].includes(sample.status) && (
                      <div className="relative">
                        <div className={`absolute -left-[27px] flex h-6 w-6 items-center justify-center rounded-full ${
                          sample.status === 'approved' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                        } ring-8 ring-white`}>
                          {sample.status === 'approved' ? (
                            <CheckSquare className="h-3.5 w-3.5" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <h4 className="font-medium">
                            {sample.status === 'approved' ? 'Approved by Customer' : 'Rejected by Customer'}
                          </h4>
                          <span className="text-xs text-muted-foreground">
                            {/* We don't have the exact date in our data model, so this is a placeholder */}
                            After review
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="materials">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Materials Required</CardTitle>
                <Button size="sm" onClick={() => setLocation(`/samples/${id}/materials/new`)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Material
                </Button>
              </CardHeader>
              <CardContent>
                {loadingMaterials ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : materials?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No materials have been added to this sample.</p>
                    <Button 
                      variant="link" 
                      onClick={() => setLocation(`/samples/${id}/materials/new`)}
                    >
                      Add your first material
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material Type</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materials?.map((material: SampleMaterial) => {
                        const item = items?.find((i: { id: number }) => i.id === material.itemId);
                        
                        return (
                          <TableRow key={material.id}>
                            <TableCell>{material.materialType}</TableCell>
                            <TableCell>{item?.name || 'Unknown Item'}</TableCell>
                            <TableCell>{material.quantity}</TableCell>
                            <TableCell>
                              {/* Unitld would need to be looked up in a real implementation */}
                              {material.unitId ? 'Unit' : 'pcs'}
                            </TableCell>
                            <TableCell>
                              <Badge className={
                                material.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                                material.status === 'received' ? 'bg-blue-100 text-blue-800' :
                                'bg-green-100 text-green-800'
                              }>
                                {material.status.charAt(0).toUpperCase() + material.status.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                <Button variant="ghost" size="icon">
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-500">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="approvals">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Approval Requests</CardTitle>
                <Button size="sm" onClick={() => setLocation(`/samples/${id}/approvals/new`)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Request Approval
                </Button>
              </CardHeader>
              <CardContent>
                {loadingApprovals ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : approvals?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No approval requests have been created for this sample.</p>
                    <Button 
                      variant="link" 
                      onClick={() => setLocation(`/samples/${id}/approvals/new`)}
                    >
                      Create your first approval request
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Approval Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Approved By</TableHead>
                        <TableHead>Approved At</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {approvals?.map((approval: SampleApproval) => {
                        return (
                          <TableRow key={approval.id}>
                            <TableCell className="capitalize">
                              {approval.approvalType.replace(/_/g, ' ')}
                            </TableCell>
                            <TableCell>
                              <Badge className={
                                approval.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                                approval.status === 'approved' ? 'bg-green-100 text-green-800' :
                                approval.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                'bg-blue-100 text-blue-800'
                              }>
                                {approval.status.charAt(0).toUpperCase() + approval.status.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(approval.createdAt)}</TableCell>
                            <TableCell>
                              {approval.approvedBy ? approval.approvedBy : '-'}
                            </TableCell>
                            <TableCell>
                              {approval.approvedAt ? formatDate(approval.approvedAt) : '-'}
                            </TableCell>
                            <TableCell>
                              <div className="flex space-x-2">
                                <Button variant="ghost" size="icon">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon">
                                  <PencilLine className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="communications">
            <Card>
              <CardHeader>
                <CardTitle>Communications History</CardTitle>
                <CardDescription>Record of all communications related to this sample</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 text-neutral-light" />
                  <p className="mb-2">No communications have been recorded for this sample yet.</p>
                  <Button variant="outline">
                    Add Communication Log
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Delete Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Are you sure?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete the sample
                "{sample.styleName}" and all related data including materials and approvals.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => deleteSample.mutate()}
                disabled={deleteSample.isPending}
              >
                {deleteSample.isPending ? 'Deleting...' : 'Delete Sample'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}