import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import {
  Filter,
  Plus,
  Search,
  FileText,
  Eye,
  Edit,
  Trash2,
  Clock,
  Calendar,
  ArrowUpDown,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import Spinner from '@/components/ui/spinner';
import { SampleDevelopment } from '@shared/schema';
import { format } from 'date-fns';

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

export default function SampleDevelopmentPage() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [selectedTab, setSelectedTab] = useState<string>('all');
  
  // Fetch all samples
  const {
    data: samples,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['/api/samples'],
    placeholderData: [],
  });

  // Fetch sample types for dropdown
  const { data: sampleTypes } = useQuery({
    queryKey: ['/api/sample-types'],
    placeholderData: [],
  });

  // Fetch customers for dropdown
  const { data: customers } = useQuery({
    queryKey: ['/api/customers'],
    placeholderData: [],
  });

  // Filter samples based on search query, selected status, type, and customer
  const filteredSamples = samples?.filter((sample: SampleDevelopment) => {
    const matchesSearch = !searchQuery || 
      sample.styleName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sample.sampleId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (sample.description && sample.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = !selectedStatus || sample.status === selectedStatus;
    const matchesType = !selectedType || (sample.sampleType || sample.priority) === selectedType;
    const matchesCustomer = !selectedCustomer || sample.customerId.toString() === selectedCustomer;
    const matchesTab = selectedTab === 'all' || 
      (selectedTab === 'active' && ['new', 'in_process'].includes(sample.status)) ||
      (selectedTab === 'completed' && ['completed', 'approved'].includes(sample.status)) ||
      (selectedTab === 'rejected' && sample.status === 'rejected');
    
    return matchesSearch && matchesStatus && matchesType && matchesCustomer && matchesTab;
  });

  if (isError) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-red-500 mb-4">Error loading samples</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-darkest">Sample Development</h1>
            <p className="text-neutral-dark">Manage and track the development and approval of all sample types</p>
          </div>
          <Button onClick={() => setLocation('/samples/new')}>
            <Plus className="mr-2 h-4 w-4" /> New Sample
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-medium flex items-center">
              <Filter className="h-5 w-5 mr-2 text-neutral" />
              Filters and Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="search" className="mb-1 block">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral" />
                  <Input
                    id="search"
                    placeholder="Search style name or ID..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="status" className="mb-1 block">Status</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="in_process">In Process</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="sent_to_customer">Sent to Customer</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="type" className="mb-1 block">Sample Type</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger id="type">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {sampleTypes?.map((type: { value: string, label: string }) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="customer" className="mb-1 block">Customer</Label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger id="customer">
                    <SelectValue placeholder="All Customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers?.map((customer: { id: number, customerName: string }) => (
                      <SelectItem key={customer.id} value={customer.id.toString()}>
                        {customer.customerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="all" className="mb-4" onValueChange={setSelectedTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="all">All Samples</TabsTrigger>
            <TabsTrigger value="active">In Process</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>

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
                    <TableHead className="w-[120px]">Sample ID</TableHead>
                    <TableHead>Style Name</TableHead>
                    <TableHead>Sample Type</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>
                      <div className="flex items-center">
                        Status
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center">
                        <Calendar className="mr-2 h-4 w-4" />
                        Requested
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center">
                        <Clock className="mr-2 h-4 w-4" />
                        Target
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSamples?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-neutral-dark">
                        No samples found matching your filters
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredSamples?.map((sample: SampleDevelopment) => {
                    const customerName = customers?.find(
                      (c: { id: number }) => c.id === sample.customerId
                    )?.customerName || 'Unknown Customer';
                    
                    const statusClassName = 
                      statusColors[sample.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800';

                    return (
                      <TableRow key={sample.id}>
                        <TableCell className="font-medium">{sample.sampleId}</TableCell>
                        <TableCell>{sample.styleName}</TableCell>
                        <TableCell>
                          {sampleTypes?.find(
                            (t: { value: string }) => t.value === (sample.sampleType || String(sample.sampleTypeId || ''))
                          )?.label || sample.sampleType || sample.priority || 'N/A'}
                        </TableCell>
                        <TableCell>{customerName}</TableCell>
                        <TableCell>
                          <Badge className={statusClassName}>
                            {sample.status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(sample.requestedDate)}</TableCell>
                        <TableCell>{formatDate(sample.targetCompletionDate)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" 
                              onClick={() => setLocation(`/samples/${sample.id}`)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" 
                              onClick={() => setLocation(`/samples/${sample.id}/edit`)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700">
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
      </div>
    </DashboardLayout>
  );
}