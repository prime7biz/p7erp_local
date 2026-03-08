import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area } from 'recharts';

// Types for our data
interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  currentStock: number;
  minimumStock: number;
  reorderPoint: number;
  optimalStock: number;
  forecastedDemand: number;
  leadTime: number;
  unitCost: number;
  statusType: 'normal' | 'low' | 'critical' | 'excess';
}

interface HistoricalData {
  date: string;
  actualDemand: number;
  predictedDemand: number;
  inventory: number;
  reorderPoint: number;
}

interface ForecastData {
  date: string;
  predictedDemand: number;
  worstCase: number;
  bestCase: number;
  projectedInventory: number;
  reorderPoint: number;
  suggestedOrder?: number;
}

export const InventoryForecast = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState('30days');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedView, setSelectedView] = useState('graph');
  
  // Sample inventory items data
  const inventoryItems: InventoryItem[] = [
    {
      id: '1',
      name: 'Cotton Fabric - Navy Blue',
      sku: 'FAB-CTN-NB',
      category: 'fabric',
      currentStock: 420,
      minimumStock: 200,
      reorderPoint: 350,
      optimalStock: 800,
      forecastedDemand: 620,
      leadTime: 14,
      unitCost: 4.5,
      statusType: 'low'
    },
    {
      id: '2',
      name: 'T-Shirt Buttons - Small White',
      sku: 'BTN-TSH-SW',
      category: 'accessories',
      currentStock: 5200,
      minimumStock: 1000,
      reorderPoint: 2000,
      optimalStock: 6000,
      forecastedDemand: 1800,
      leadTime: 7,
      unitCost: 0.15,
      statusType: 'normal'
    },
    {
      id: '3',
      name: 'Denim Fabric - Dark Wash',
      sku: 'FAB-DNM-DW',
      category: 'fabric',
      currentStock: 150,
      minimumStock: 100,
      reorderPoint: 200,
      optimalStock: 400,
      forecastedDemand: 280,
      leadTime: 21,
      unitCost: 6.75,
      statusType: 'critical'
    },
    {
      id: '4',
      name: 'Zipper - Metal 8 inch',
      sku: 'ZIP-MT-8',
      category: 'accessories',
      currentStock: 3400,
      minimumStock: 500,
      reorderPoint: 1200,
      optimalStock: 3000,
      forecastedDemand: 900,
      leadTime: 10,
      unitCost: 0.8,
      statusType: 'excess'
    },
    {
      id: '5',
      name: 'Polyester Blend - Black',
      sku: 'FAB-PLY-BK',
      category: 'fabric',
      currentStock: 680,
      minimumStock: 300,
      reorderPoint: 450,
      optimalStock: 900,
      forecastedDemand: 520,
      leadTime: 14,
      unitCost: 3.25,
      statusType: 'normal'
    }
  ];
  
  // Sample historical data
  const historicalData: HistoricalData[] = [
    { date: '2025-04-16', actualDemand: 65, predictedDemand: 62, inventory: 585, reorderPoint: 350 },
    { date: '2025-04-17', actualDemand: 72, predictedDemand: 65, inventory: 513, reorderPoint: 350 },
    { date: '2025-04-18', actualDemand: 58, predictedDemand: 60, inventory: 455, reorderPoint: 350 },
    { date: '2025-04-19', actualDemand: 52, predictedDemand: 58, inventory: 403, reorderPoint: 350 },
    { date: '2025-04-20', actualDemand: 50, predictedDemand: 55, inventory: 353, reorderPoint: 350 },
    { date: '2025-04-21', actualDemand: 75, predictedDemand: 65, inventory: 278, reorderPoint: 350 },
    { date: '2025-04-22', actualDemand: 80, predictedDemand: 70, inventory: 198, reorderPoint: 350 },
    { date: '2025-04-23', actualDemand: 84, predictedDemand: 75, inventory: 114, reorderPoint: 350 },
    { date: '2025-04-24', actualDemand: 60, predictedDemand: 65, inventory: 54, reorderPoint: 350 },
    { date: '2025-04-25', actualDemand: 0, predictedDemand: 60, inventory: 854, reorderPoint: 350 }, // Restocked +800
    { date: '2025-04-26', actualDemand: 62, predictedDemand: 65, inventory: 792, reorderPoint: 350 },
    { date: '2025-04-27', actualDemand: 58, predictedDemand: 60, inventory: 734, reorderPoint: 350 },
    { date: '2025-04-28', actualDemand: 64, predictedDemand: 65, inventory: 670, reorderPoint: 350 },
    { date: '2025-04-29', actualDemand: 76, predictedDemand: 70, inventory: 594, reorderPoint: 350 },
    { date: '2025-04-30', actualDemand: 72, predictedDemand: 75, inventory: 522, reorderPoint: 350 },
    { date: '2025-05-01', actualDemand: 68, predictedDemand: 65, inventory: 454, reorderPoint: 350 },
    { date: '2025-05-02', actualDemand: 62, predictedDemand: 60, inventory: 392, reorderPoint: 350 },
    { date: '2025-05-03', actualDemand: 54, predictedDemand: 55, inventory: 338, reorderPoint: 350 },
    { date: '2025-05-04', actualDemand: 48, predictedDemand: 50, inventory: 290, reorderPoint: 350 },
    { date: '2025-05-05', actualDemand: 52, predictedDemand: 55, inventory: 238, reorderPoint: 350 },
    { date: '2025-05-06', actualDemand: 60, predictedDemand: 65, inventory: 178, reorderPoint: 350 },
    { date: '2025-05-07', actualDemand: 72, predictedDemand: 75, inventory: 106, reorderPoint: 350 },
    { date: '2025-05-08', actualDemand: 62, predictedDemand: 65, inventory: 44, reorderPoint: 350 },
    { date: '2025-05-09', actualDemand: 0, predictedDemand: 60, inventory: 844, reorderPoint: 350 }, // Restocked +800
    { date: '2025-05-10', actualDemand: 68, predictedDemand: 65, inventory: 776, reorderPoint: 350 },
    { date: '2025-05-11', actualDemand: 72, predictedDemand: 70, inventory: 704, reorderPoint: 350 },
    { date: '2025-05-12', actualDemand: 76, predictedDemand: 75, inventory: 628, reorderPoint: 350 },
    { date: '2025-05-13', actualDemand: 68, predictedDemand: 70, inventory: 560, reorderPoint: 350 },
    { date: '2025-05-14', actualDemand: 64, predictedDemand: 65, inventory: 496, reorderPoint: 350 },
    { date: '2025-05-15', actualDemand: 76, predictedDemand: 70, inventory: 420, reorderPoint: 350 },
  ];
  
  // Sample forecast data
  const forecastData: ForecastData[] = [
    { date: '2025-05-16', predictedDemand: 68, worstCase: 85, bestCase: 55, projectedInventory: 352, reorderPoint: 350 },
    { date: '2025-05-17', predictedDemand: 70, worstCase: 88, bestCase: 56, projectedInventory: 282, reorderPoint: 350, suggestedOrder: 800 },
    { date: '2025-05-18', predictedDemand: 65, worstCase: 82, bestCase: 52, projectedInventory: 217, reorderPoint: 350 },
    { date: '2025-05-19', predictedDemand: 75, worstCase: 94, bestCase: 60, projectedInventory: 142, reorderPoint: 350 },
    { date: '2025-05-20', predictedDemand: 85, worstCase: 106, bestCase: 68, projectedInventory: 57, reorderPoint: 350 },
    { date: '2025-05-21', predictedDemand: 72, worstCase: 90, bestCase: 58, projectedInventory: 785, reorderPoint: 350 }, // +800 restock arrives
    { date: '2025-05-22', predictedDemand: 64, worstCase: 80, bestCase: 51, projectedInventory: 721, reorderPoint: 350 },
    { date: '2025-05-23', predictedDemand: 68, worstCase: 85, bestCase: 54, projectedInventory: 653, reorderPoint: 350 },
    { date: '2025-05-24', predictedDemand: 58, worstCase: 73, bestCase: 46, projectedInventory: 595, reorderPoint: 350 },
    { date: '2025-05-25', predictedDemand: 52, worstCase: 65, bestCase: 42, projectedInventory: 543, reorderPoint: 350 },
    { date: '2025-05-26', predictedDemand: 66, worstCase: 83, bestCase: 53, projectedInventory: 477, reorderPoint: 350 },
    { date: '2025-05-27', predictedDemand: 74, worstCase: 92, bestCase: 59, projectedInventory: 403, reorderPoint: 350 },
    { date: '2025-05-28', predictedDemand: 82, worstCase: 103, bestCase: 66, projectedInventory: 321, reorderPoint: 350, suggestedOrder: 800 },
    { date: '2025-05-29', predictedDemand: 78, worstCase: 98, bestCase: 62, projectedInventory: 243, reorderPoint: 350 },
    { date: '2025-05-30', predictedDemand: 84, worstCase: 105, bestCase: 67, projectedInventory: 159, reorderPoint: 350 },
  ];
  
  // Get appropriate status color based on inventory status
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'low':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'excess':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    }
  };
  
  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  };
  
  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded shadow-md">
          <p className="font-medium">{formatDate(label)}</p>
          {payload.map((entry: any, index: number) => (
            <p key={`item-${index}`} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };
  
  // Calculate inventory health metrics
  const criticalItems = inventoryItems.filter(item => item.statusType === 'critical').length;
  const lowItems = inventoryItems.filter(item => item.statusType === 'low').length;
  const normalItems = inventoryItems.filter(item => item.statusType === 'normal').length;
  const excessItems = inventoryItems.filter(item => item.statusType === 'excess').length;
  const totalItems = inventoryItems.length;
  
  return (
    <Card className="overflow-hidden border-primary/10 shadow-md bg-white/90 backdrop-blur-sm mb-6">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 pb-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <CardTitle className="text-lg font-medium flex items-center">
            <span className="material-icons mr-2 text-primary">inventory</span>
            Predictive Inventory Forecasting
          </CardTitle>
          
          <div className="flex flex-wrap gap-2">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[140px] h-8 text-xs bg-white">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="fabric">Fabrics</SelectItem>
                <SelectItem value="accessories">Accessories</SelectItem>
                <SelectItem value="packaging">Packaging</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
              <SelectTrigger className="w-[110px] h-8 text-xs bg-white">
                <SelectValue placeholder="Timeframe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">7 Days</SelectItem>
                <SelectItem value="14days">14 Days</SelectItem>
                <SelectItem value="30days">30 Days</SelectItem>
                <SelectItem value="90days">90 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-4">
        {/* Inventory Health Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="border border-emerald-200 rounded-lg bg-emerald-50 p-3 text-center">
            <div className="text-emerald-600 text-lg font-semibold">{normalItems}</div>
            <div className="text-xs text-neutral-dark">Healthy Stock</div>
          </div>
          <div className="border border-amber-200 rounded-lg bg-amber-50 p-3 text-center">
            <div className="text-amber-600 text-lg font-semibold">{lowItems}</div>
            <div className="text-xs text-neutral-dark">Low Stock</div>
          </div>
          <div className="border border-red-200 rounded-lg bg-red-50 p-3 text-center">
            <div className="text-red-600 text-lg font-semibold">{criticalItems}</div>
            <div className="text-xs text-neutral-dark">Critical Stock</div>
          </div>
          <div className="border border-blue-200 rounded-lg bg-blue-50 p-3 text-center">
            <div className="text-blue-600 text-lg font-semibold">{excessItems}</div>
            <div className="text-xs text-neutral-dark">Excess Stock</div>
          </div>
        </div>
        
        {/* Tab navigation for different views */}
        <Tabs defaultValue="insights" className="mb-4">
          <div className="flex justify-between items-center mb-4">
            <TabsList>
              <TabsTrigger value="insights">Insights</TabsTrigger>
              <TabsTrigger value="forecast">Forecast</TabsTrigger>
              <TabsTrigger value="history">Historical</TabsTrigger>
              <TabsTrigger value="items">Items</TabsTrigger>
            </TabsList>
            
            <div className="flex">
              <button 
                onClick={() => setSelectedView('graph')}
                className={`p-1.5 rounded-l-md text-xs ${selectedView === 'graph' ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-dark'}`}
                aria-label="Graph view"
              >
                <span className="material-icons text-sm">bar_chart</span>
              </button>
              <button 
                onClick={() => setSelectedView('table')}
                className={`p-1.5 rounded-r-md text-xs ${selectedView === 'table' ? 'bg-primary text-white' : 'bg-neutral-100 text-neutral-dark'}`}
                aria-label="Table view"
              >
                <span className="material-icons text-sm">table_chart</span>
              </button>
            </div>
          </div>
          
          <TabsContent value="insights" className="space-y-4">
            <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
              <div className="flex items-start">
                <span className="material-icons text-orange-500 mr-3">tips_and_updates</span>
                <div>
                  <h3 className="font-medium text-neutral-darkest mb-1">Reorder Recommendations</h3>
                  <p className="text-sm text-neutral-dark mb-3">Our AI predicts that 3 items will require reordering within the next 7 days based on current consumption patterns and lead times.</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center p-2 bg-white rounded border border-neutral-200">
                      <div className="flex items-center">
                        <div className="w-2 h-6 bg-red-500 rounded-sm mr-3"></div>
                        <div>
                          <div className="font-medium text-sm">Cotton Fabric - Navy Blue</div>
                          <div className="text-xs text-neutral-dark">Current: 420 units | Forecasted demand: 620 units</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-sm font-medium">Order 800 units</div>
                          <div className="text-xs text-neutral-dark">Lead time: 14 days</div>
                        </div>
                        <button className="bg-primary text-white rounded p-1.5">
                          <span className="material-icons text-sm">add_shopping_cart</span>
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center p-2 bg-white rounded border border-neutral-200">
                      <div className="flex items-center">
                        <div className="w-2 h-6 bg-red-500 rounded-sm mr-3"></div>
                        <div>
                          <div className="font-medium text-sm">Denim Fabric - Dark Wash</div>
                          <div className="text-xs text-neutral-dark">Current: 150 units | Forecasted demand: 280 units</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-sm font-medium">Order 400 units</div>
                          <div className="text-xs text-neutral-dark">Lead time: 21 days</div>
                        </div>
                        <button className="bg-primary text-white rounded p-1.5">
                          <span className="material-icons text-sm">add_shopping_cart</span>
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center p-2 bg-white rounded border border-neutral-200">
                      <div className="flex items-center">
                        <div className="w-2 h-6 bg-amber-500 rounded-sm mr-3"></div>
                        <div>
                          <div className="font-medium text-sm">Polyester Blend - Black</div>
                          <div className="text-xs text-neutral-dark">Current: 680 units | Forecasted demand: 520 units</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-sm font-medium">Order 600 units</div>
                          <div className="text-xs text-neutral-dark">Lead time: 14 days</div>
                        </div>
                        <button className="bg-primary text-white rounded p-1.5">
                          <span className="material-icons text-sm">add_shopping_cart</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <div className="flex items-start">
                <span className="material-icons text-blue-500 mr-3">savings</span>
                <div>
                  <h3 className="font-medium text-neutral-darkest mb-1">Cost Optimization Opportunities</h3>
                  <p className="text-sm text-neutral-dark mb-2">AI has identified potential savings by optimizing your inventory levels.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                    <div className="bg-white p-3 rounded border border-neutral-200">
                      <div className="text-xl font-semibold text-primary mb-1">BDT 16,320</div>
                      <div className="text-sm">Potential carrying cost savings by reducing excess inventory</div>
                    </div>
                    <div className="bg-white p-3 rounded border border-neutral-200">
                      <div className="text-xl font-semibold text-green-600 mb-1">BDT 28,750</div>
                      <div className="text-sm">Potential savings from bulk order discounts with optimized ordering</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="forecast">
            {selectedView === 'graph' ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecastData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={formatDate}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="worstCase" 
                      stroke="#f97316" 
                      fill="#ffedd5" 
                      strokeWidth={1}
                      name="Worst Case"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="predictedDemand" 
                      stroke="#0284c7" 
                      fill="#e0f2fe" 
                      strokeWidth={2}
                      name="Predicted Demand"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="bestCase" 
                      stroke="#10b981" 
                      fill="#d1fae5" 
                      strokeWidth={1}
                      name="Best Case"
                    />
                    <Line 
                      type="stepAfter" 
                      dataKey="projectedInventory" 
                      stroke="#6366f1" 
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Projected Inventory"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="reorderPoint" 
                      stroke="#dc2626" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Reorder Point"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="overflow-auto max-h-80">
                <table className="w-full min-w-[600px] border-collapse">
                  <thead>
                    <tr className="bg-neutral-100">
                      <th className="p-2 text-left text-sm font-medium">Date</th>
                      <th className="p-2 text-right text-sm font-medium">Predicted Demand</th>
                      <th className="p-2 text-right text-sm font-medium">Projected Inventory</th>
                      <th className="p-2 text-right text-sm font-medium">Reorder Point</th>
                      <th className="p-2 text-right text-sm font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastData.map((item, index) => (
                      <tr key={index} className={`border-b ${item.projectedInventory < item.reorderPoint ? 'bg-red-50' : ''}`}>
                        <td className="p-2 text-sm">{formatDate(item.date)}</td>
                        <td className="p-2 text-sm text-right">{item.predictedDemand}</td>
                        <td className="p-2 text-sm text-right font-medium">{item.projectedInventory}</td>
                        <td className="p-2 text-sm text-right">{item.reorderPoint}</td>
                        <td className="p-2 text-sm text-right">
                          {item.suggestedOrder && (
                            <Badge className="bg-primary text-white ml-auto">Order {item.suggestedOrder}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="history">
            {selectedView === 'graph' ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historicalData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={formatDate}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="actualDemand" 
                      stroke="#f97316" 
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name="Actual Demand"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="predictedDemand" 
                      stroke="#0284c7" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={{ r: 2 }}
                      name="Predicted Demand"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="inventory" 
                      stroke="#6366f1" 
                      strokeWidth={2}
                      name="Inventory Level"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="reorderPoint" 
                      stroke="#dc2626" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Reorder Point"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="overflow-auto max-h-80">
                <table className="w-full min-w-[600px] border-collapse">
                  <thead>
                    <tr className="bg-neutral-100">
                      <th className="p-2 text-left text-sm font-medium">Date</th>
                      <th className="p-2 text-right text-sm font-medium">Actual Demand</th>
                      <th className="p-2 text-right text-sm font-medium">Predicted Demand</th>
                      <th className="p-2 text-right text-sm font-medium">Accuracy</th>
                      <th className="p-2 text-right text-sm font-medium">Inventory Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicalData.map((item, index) => {
                      const accuracy = item.actualDemand === 0 ? 100 : 100 - Math.abs((item.predictedDemand - item.actualDemand) / item.actualDemand * 100);
                      return (
                        <tr key={index} className={`border-b ${item.inventory < item.reorderPoint ? 'bg-red-50' : ''}`}>
                          <td className="p-2 text-sm">{formatDate(item.date)}</td>
                          <td className="p-2 text-sm text-right">{item.actualDemand}</td>
                          <td className="p-2 text-sm text-right">{item.predictedDemand}</td>
                          <td className="p-2 text-sm text-right">
                            {item.actualDemand === 0 ? '-' : `${Math.round(accuracy)}%`}
                          </td>
                          <td className="p-2 text-sm text-right font-medium">{item.inventory}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="items">
            <div className="overflow-auto max-h-80">
              <table className="w-full min-w-[700px] border-collapse">
                <thead>
                  <tr className="bg-neutral-100">
                    <th className="p-2 text-left text-sm font-medium">Item</th>
                    <th className="p-2 text-left text-sm font-medium">SKU</th>
                    <th className="p-2 text-right text-sm font-medium">Current Stock</th>
                    <th className="p-2 text-right text-sm font-medium">Forecasted Demand</th>
                    <th className="p-2 text-center text-sm font-medium">Status</th>
                    <th className="p-2 text-right text-sm font-medium">Lead Time</th>
                    <th className="p-2 text-right text-sm font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryItems.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-2 text-sm font-medium">{item.name}</td>
                      <td className="p-2 text-sm">{item.sku}</td>
                      <td className="p-2 text-sm text-right">{item.currentStock.toLocaleString()}</td>
                      <td className="p-2 text-sm text-right">{item.forecastedDemand.toLocaleString()}</td>
                      <td className="p-2 text-center">
                        <Badge variant="outline" className={getStatusColor(item.statusType)}>
                          {item.statusType.charAt(0).toUpperCase() + item.statusType.slice(1)}
                        </Badge>
                      </td>
                      <td className="p-2 text-sm text-right">{item.leadTime} days</td>
                      <td className="p-2 text-right">
                        <button className="text-primary hover:text-primary-dark p-1">
                          <span className="material-icons text-sm">visibility</span>
                        </button>
                        <button className="text-primary hover:text-primary-dark p-1">
                          <span className="material-icons text-sm">edit</span>
                        </button>
                        <button className="text-primary hover:text-primary-dark p-1">
                          <span className="material-icons text-sm">add_shopping_cart</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
        
        {/* Action Row */}
        <div className="flex justify-between pt-4 border-t mt-4">
          <div>
            <div className="text-sm font-medium mb-1 flex items-center">
              <span className="material-icons text-sm text-primary mr-1">precision_manufacturing</span>
              AI Prediction Accuracy
            </div>
            <div className="text-xs text-neutral-dark">92.7% over the last 30 days</div>
          </div>
          
          <div className="flex gap-2">
            <button className="text-sm bg-neutral-100 hover:bg-neutral-200 px-3 py-1.5 rounded-md flex items-center">
              <span className="material-icons text-sm mr-1">download</span>
              Export
            </button>
            <button className="text-sm bg-primary text-white hover:bg-primary-dark px-3 py-1.5 rounded-md flex items-center">
              <span className="material-icons text-sm mr-1">shopping_cart</span>
              Order Items
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};