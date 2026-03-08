import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { TabsContent, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Card as TremorCard } from "@tremor/react";

import { 
  FileText, 
  FilePlus, 
  FileSearch, 
  Clock, 
  CheckCircle2, 
  Download,
  Upload,
  Printer,
  Share2,
  Search,
  Plus,
  AlertTriangle,
  ClipboardList,
  Package,
  DollarSign
} from 'lucide-react';

interface DocumentManagementProps {
  selectedReference: string;
  timeInterval: string;
  dateRange: string;
}

const DocumentManagement: React.FC<DocumentManagementProps> = ({
  selectedReference,
  timeInterval,
  dateRange,
}) => {
  const [activeTab, setActiveTab] = useState('export-docs');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);

  const { data: exportDocuments = [], isLoading: docsLoading } = useQuery<any[]>({
    queryKey: ['/api/commercial/export-documents'],
  });

  const { data: shipments = [], isLoading: shipmentsLoading } = useQuery<any[]>({
    queryKey: ['/api/commercial/shipments'],
  });

  const isLoading = docsLoading || shipmentsLoading;

  const docsList = Array.isArray(exportDocuments) ? exportDocuments : [];

  const containerAnimation = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemAnimation = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  const formatDocType = (type: string) => {
    return (type || 'document').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const documents = docsList.map((d: any) => ({
    id: d.documentNumber || `DOC-${d.id}`,
    dbId: d.id,
    type: formatDocType(d.documentType),
    title: d.description || `${formatDocType(d.documentType)} #${d.id}`,
    reference: `ORD-${d.orderId || 'N/A'}`,
    referenceType: "Order",
    date: d.documentDate || d.createdAt || '',
    status: (() => {
      const st = (d.status || '').toLowerCase();
      if (st === 'approved') return 'approved' as const;
      if (st === 'completed' || st === 'issued') return 'complete' as const;
      if (st === 'rejected') return 'rejected' as const;
      return 'pending' as const;
    })(),
    assignedTo: d.issuedBy || 'N/A',
    amount: parseFloat(d.amount || '0'),
    updatedAt: d.updatedAt || d.createdAt || new Date().toISOString(),
  }));

  const docStats = {
    total: documents.length,
    pending: documents.filter((d: any) => d.status === 'pending').length,
    completed: documents.filter((d: any) => d.status === 'complete' || d.status === 'approved').length,
    byType: (() => {
      const types: Record<string, number> = {};
      documents.forEach((d: any) => {
        types[d.type] = (types[d.type] || 0) + 1;
      });
      return Object.entries(types).map(([type, count]) => ({ type, count }));
    })(),
  };

  const filteredDocuments = documents
    .filter((doc: any) => 
      (searchQuery === '' || 
       doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
       doc.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
       doc.type.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .filter((doc: any) => selectedReference === 'all' || doc.reference === selectedReference);

  const getStatusBadge = (status: string) => {
    switch(status.toLowerCase()) {
      case 'pending': return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending</Badge>;
      case 'complete': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Complete</Badge>;
      case 'approved': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>;
      case 'rejected': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Rejected</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString();
  };

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <motion.div variants={containerAnimation} initial="hidden" animate="visible" className="space-y-6">
      <Tabs defaultValue="export-docs" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full border-b mb-4 pb-0 overflow-auto">
          <TabsTrigger value="export-docs" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 bg-transparent">
            Export Documents
          </TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 bg-transparent">
            Analytics
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="export-docs" className="mt-0 space-y-4">
          <motion.div variants={itemAnimation} className="flex flex-col md:flex-row justify-between gap-4">
            <div className="relative w-full md:w-1/2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search documents..."
                className="w-full pl-8"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Total</div>
                <div className="text-2xl font-bold">{docStats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Pending</div>
                <div className="text-2xl font-bold text-amber-600">{docStats.pending}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Completed</div>
                <div className="text-2xl font-bold text-green-600">{docStats.completed}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">Completion Rate</div>
                <div className="text-2xl font-bold">{docStats.total > 0 ? Math.round((docStats.completed / docStats.total) * 100) : 0}%</div>
              </CardContent>
            </Card>
          </div>
          
          <motion.div variants={itemAnimation}>
            {selectedReference !== 'all' && (
              <div className="bg-blue-50 p-3 rounded-lg mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div>
                    <h3 className="font-medium text-blue-800">Filtered by Reference</h3>
                    <p className="text-sm text-blue-600">Showing documents for reference: {selectedReference}</p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">ID</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.length > 0 ? (
                    filteredDocuments.map((doc: any) => (
                      <TableRow key={doc.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedDocument(doc.id)}>
                        <TableCell className="font-medium">{doc.id}</TableCell>
                        <TableCell>
                          <div className="font-medium">{doc.type}</div>
                          <div className="text-xs text-muted-foreground">{doc.title}</div>
                        </TableCell>
                        <TableCell>
                          <div>{doc.reference}</div>
                          <div className="text-xs text-muted-foreground">{doc.referenceType}</div>
                        </TableCell>
                        <TableCell>{formatDate(doc.date)}</TableCell>
                        <TableCell>{getStatusBadge(doc.status)}</TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground">{formatTimestamp(doc.updatedAt)}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-8 w-8">
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8">
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                        No documents found. Create export documents in the Commercial module.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </motion.div>
          
          {selectedDocument && (() => {
            const doc = documents.find((d: any) => d.id === selectedDocument);
            if (!doc) return null;
            return (
              <motion.div variants={itemAnimation}>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>Document Details</CardTitle>
                        <CardDescription>{doc.type} - {doc.title}</CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedDocument(null)}>Close</Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Document ID</h4>
                        <div className="text-sm">{doc.id}</div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Reference</h4>
                        <div className="text-sm">{doc.reference}</div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Date</h4>
                        <div className="text-sm">{formatDate(doc.date)}</div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Status</h4>
                        <div className="mt-1">{getStatusBadge(doc.status)}</div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Type</h4>
                        <div className="text-sm">{doc.type}</div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Last Updated</h4>
                        <div className="text-sm">{formatTimestamp(doc.updatedAt)}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })()}
        </TabsContent>
        
        <TabsContent value="analytics" className="mt-0 space-y-6">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Documents by Type</CardTitle>
              </CardHeader>
              <CardContent>
                {docStats.byType.length > 0 ? (
                  <TremorCard>
                    <BarChart
                      className="h-72"
                      data={docStats.byType}
                      index="type"
                      categories={["count"]}
                      colors={["blue"]}
                      showAnimation={true}
                    />
                  </TremorCard>
                ) : (
                  <div className="h-72 flex items-center justify-center text-muted-foreground">
                    No document data available for analytics
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
          
          <motion.div variants={itemAnimation}>
            <Card>
              <CardHeader>
                <CardTitle>Document Processing Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex flex-col items-center bg-blue-50 p-4 rounded-lg">
                    <p className="text-xs text-blue-600 font-medium">TOTAL DOCUMENTS</p>
                    <p className="text-xl font-bold">{docStats.total}</p>
                  </div>
                  <div className="flex flex-col items-center bg-amber-50 p-4 rounded-lg">
                    <p className="text-xs text-amber-600 font-medium">PENDING REVIEW</p>
                    <p className="text-xl font-bold">{docStats.pending}</p>
                  </div>
                  <div className="flex flex-col items-center bg-green-50 p-4 rounded-lg">
                    <p className="text-xs text-green-600 font-medium">COMPLETION RATE</p>
                    <p className="text-xl font-bold">{docStats.total > 0 ? Math.round((docStats.completed / docStats.total) * 100) : 0}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default DocumentManagement;