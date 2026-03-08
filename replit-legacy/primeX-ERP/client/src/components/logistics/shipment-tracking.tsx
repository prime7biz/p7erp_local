import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { TabsContent, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Card as TremorCard } from "@tremor/react";

import { 
  Ship, 
  Truck, 
  Plane,
  MapPin, 
  Calendar, 
  Clock, 
  Package, 
  FileText, 
  Search,
  Plus,
  BarChart,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface ShipmentTrackingProps {
  selectedReference: string;
  timeInterval: string;
  dateRange: string;
}

const ShipmentTracking: React.FC<ShipmentTrackingProps> = ({
  selectedReference,
  timeInterval,
  dateRange,
}) => {
  const [activeTab, setActiveTab] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShipment, setSelectedShipment] = useState<string | null>(null);

  const { data: rawShipments = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/commercial/shipments'],
  });

  const containerAnimation = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemAnimation = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.5 }
    }
  };

  const rawList = Array.isArray(rawShipments) ? rawShipments : [];
  const shipments = rawList.map((s: any) => ({
    id: s.shipmentNumber || `SHP-${s.id}`,
    dbId: s.id,
    reference: s.orderNumber || `ORD-${s.orderId || ''}`,
    referenceType: s.orderId ? "Order" : "Direct",
    origin: s.portOfLoading || 'Origin',
    destination: s.portOfDischarge || 'Destination',
    carrier: s.carrier || s.vesselName || 'N/A',
    transportMode: ((s.shipmentMode || s.mode || 'sea').toLowerCase().includes('air') ? 'air' :
                    (s.shipmentMode || s.mode || 'sea').toLowerCase().includes('road') ? 'road' : 'sea') as 'sea' | 'air' | 'road' | 'rail',
    departureDate: s.shipmentDate || s.etd || s.createdAt,
    arrivalDate: s.eta || '',
    status: (() => {
      const st = (s.status || '').toLowerCase();
      if (st === 'delivered' || st === 'completed') return 'delivered' as const;
      if (st === 'customs' || st === 'customs_clearance') return 'customs' as const;
      if (st === 'in_transit' || st === 'in-transit' || st === 'shipped') return 'in-transit' as const;
      if (st === 'delayed') return 'delayed' as const;
      if (st === 'loading') return 'planned' as const;
      return 'planned' as const;
    })(),
    trackingNumber: s.trackingNumber || s.blNumber || s.containerNumber || 'N/A',
    progress: (() => {
      const st = (s.status || '').toLowerCase();
      if (st === 'delivered' || st === 'completed') return 100;
      if (st === 'customs' || st === 'customs_clearance') return 82;
      if (st === 'in_transit' || st === 'in-transit' || st === 'shipped') return 55;
      if (st === 'loading') return 30;
      if (st === 'scheduled') return 20;
      return 15;
    })(),
    lastUpdate: s.updatedAt || s.createdAt || new Date().toISOString(),
    value: parseFloat(s.totalValue || s.shippingCost || '0'),
  }));

  const shipmentStats = {
    total: shipments.length,
    active: shipments.filter((s: any) => s.status !== 'delivered').length,
    delayed: shipments.filter((s: any) => s.status === 'delayed').length,
    delivered: shipments.filter((s: any) => s.status === 'delivered').length,
    onTimeDelivery: shipments.length > 0
      ? (shipments.filter((s: any) => s.status === 'delivered').length / shipments.length * 100)
      : 0,
  };

  const filteredShipments = shipments
    .filter((shipment: any) => 
      (searchQuery === '' || 
       shipment.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
       shipment.origin.toLowerCase().includes(searchQuery.toLowerCase()) ||
       shipment.destination.toLowerCase().includes(searchQuery.toLowerCase()) ||
       shipment.carrier.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .filter((shipment: any) => selectedReference === 'all' || shipment.reference === selectedReference);

  const activeShipments = filteredShipments.filter((s: any) => s.status !== 'delivered');
  const completedShipments = filteredShipments.filter((s: any) => s.status === 'delivered');

  const getTransportIcon = (mode: string) => {
    switch(mode) {
      case 'sea': return <Ship className="h-4 w-4 text-blue-500" />;
      case 'air': return <Plane className="h-4 w-4 text-indigo-500" />;
      case 'road': return <Truck className="h-4 w-4 text-green-500" />;
      case 'rail': return <Truck className="h-4 w-4 text-amber-500" />;
      default: return <Ship className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'planned': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Planned</Badge>;
      case 'in-transit': return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">In Transit</Badge>;
      case 'customs': return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Customs</Badge>;
      case 'delivered': return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Delivered</Badge>;
      case 'delayed': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Delayed</Badge>;
      default: return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString();
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
    <motion.div
      variants={containerAnimation}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={itemAnimation} className="flex flex-col md:flex-row justify-between gap-4">
        <div className="relative w-full md:w-1/2">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search shipments by ID, origin, destination, or carrier..."
            className="w-full pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="flex items-center gap-1">
            <BarChart className="h-4 w-4" />
            Reports
          </Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{shipmentStats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Active</div>
            <div className="text-2xl font-bold text-blue-600">{shipmentStats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Delayed</div>
            <div className="text-2xl font-bold text-red-600">{shipmentStats.delayed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Delivered</div>
            <div className="text-2xl font-bold text-green-600">{shipmentStats.delivered}</div>
          </CardContent>
        </Card>
      </div>
      
      <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="active">Active Shipments</TabsTrigger>
          <TabsTrigger value="history">Shipment History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="active" className="space-y-6">
          {selectedReference !== 'all' && (
            <motion.div variants={itemAnimation}>
              <div className="bg-blue-50 p-3 rounded-lg mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-blue-600" />
                  <div>
                    <h3 className="font-medium text-blue-800">Filtered by Reference</h3>
                    <p className="text-sm text-blue-600">Showing shipments for reference: {selectedReference}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          
          <motion.div variants={itemAnimation}>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shipment ID</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Carrier</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Last Update</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeShipments.length > 0 ? (
                      activeShipments.map((shipment: any) => (
                        <TableRow 
                          key={shipment.id} 
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedShipment(shipment.id)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1">
                              {getTransportIcon(shipment.transportMode)}
                              <span>{shipment.id}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{shipment.origin}</span>
                              <span className="text-xs text-muted-foreground">to {shipment.destination}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <span>{shipment.reference}</span>
                              <div className="text-xs text-muted-foreground">{shipment.referenceType}</div>
                            </div>
                          </TableCell>
                          <TableCell>{shipment.carrier}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs">{formatDate(shipment.departureDate)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-muted-foreground" />
                                <span className="text-xs">{formatDate(shipment.arrivalDate)}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(shipment.status)}</TableCell>
                          <TableCell>
                            <div className="w-24">
                              <div className="flex items-center">
                                <div className="w-full bg-gray-200 rounded-full h-2 mr-2">
                                  <div 
                                    className={`h-2 rounded-full ${
                                      shipment.status === 'delayed' ? 'bg-red-500' : 
                                      shipment.progress >= 80 ? 'bg-green-500' : 
                                      shipment.progress >= 50 ? 'bg-blue-500' : 
                                      shipment.progress >= 25 ? 'bg-amber-500' : 'bg-gray-500'
                                    }`} 
                                    style={{ width: `${shipment.progress}%` }}
                                  ></div>
                                </div>
                                <span className="text-xs">{shipment.progress}%</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs text-muted-foreground">
                              {new Date(shipment.lastUpdate).toLocaleString()}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="h-24 text-center">
                          No active shipments found. Create shipments in the Commercial module.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </motion.div>

          {selectedShipment && (() => {
            const selected = shipments.find((s: any) => s.id === selectedShipment);
            if (!selected) return null;
            return (
              <motion.div variants={itemAnimation}>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>Shipment Details</CardTitle>
                        <CardDescription>
                          {selected.origin} to {selected.destination}
                        </CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedShipment(null)}>Close</Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Shipment ID</Label>
                        <p className="font-medium">{selected.id}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Reference</Label>
                        <p className="font-medium">{selected.reference}</p>
                        <p className="text-xs text-muted-foreground">{selected.referenceType}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Carrier</Label>
                        <p className="font-medium">{selected.carrier}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Tracking Number</Label>
                        <p className="font-medium">{selected.trackingNumber}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Transport Mode</Label>
                        <div className="flex items-center gap-2">
                          {getTransportIcon(selected.transportMode)}
                          <p className="font-medium capitalize">{selected.transportMode}</p>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Status</Label>
                        <div className="mt-1">{getStatusBadge(selected.status)}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })()}
        </TabsContent>
        
        <TabsContent value="history" className="space-y-6">
          <motion.div variants={itemAnimation}>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shipment ID</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Carrier</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedShipments.length > 0 ? (
                      completedShipments.map((shipment: any) => (
                        <TableRow key={shipment.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1">
                              {getTransportIcon(shipment.transportMode)}
                              <span>{shipment.id}</span>
                            </div>
                          </TableCell>
                          <TableCell>{shipment.origin} → {shipment.destination}</TableCell>
                          <TableCell>{shipment.carrier}</TableCell>
                          <TableCell>{formatDate(shipment.departureDate)} - {formatDate(shipment.arrivalDate)}</TableCell>
                          <TableCell>{getStatusBadge(shipment.status)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center">
                          No completed shipments found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default ShipmentTracking;