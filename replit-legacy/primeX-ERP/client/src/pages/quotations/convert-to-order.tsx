import { useState, useEffect } from "react";
import { useParams, useLocation as useWouterLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

// Define the conversion form schema
const convertToOrderSchema = z.object({
  deliveryMode: z.enum(["Air", "Sea", "Road", "Rail"]),
  deliveryPort: z.string().optional(),
  paymentTerms: z.string(),
  // Color and size breakdowns - will be handled separately as a dynamic form
  sampleTypes: z.array(z.string()).optional(),
  trimTypes: z.array(z.string()).optional(),
});

type ColorSizeBreakdown = {
  color: string;
  size: string;
  quantity: number;
};

// Define sample types for garment production
const SAMPLE_TYPES = [
  "Fit Sample",
  "Production Sample",
  "Pre-Production Sample",
  "Size Set",
  "Photo Sample",
  "Salesman Sample",
  "Counter Sample",
  "Lab Dip",
  "Strike Off"
];

// Define trim types for garment production
const TRIM_TYPES = [
  "Buttons",
  "Zippers",
  "Labels",
  "Hang Tags",
  "Size Tags",
  "Care Labels",
  "Embroidery",
  "Elastic Band",
  "Drawstrings",
  "Patches"
];

// Define payment terms options
const PAYMENT_TERMS = [
  "Net 30",
  "Net 45",
  "Net 60",
  "50% Advance, 50% Before Shipment",
  "30% Advance, 70% Before Shipment",
  "Letter of Credit (LC)",
  "Documents Against Payment (DP)",
  "Cash Against Documents (CAD)"
];

export default function ConvertQuotationToOrder() {
  const { id } = useParams();
  const [location, setLocation] = useWouterLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [colorSizes, setColorSizes] = useState<ColorSizeBreakdown[]>([]);
  const [newColor, setNewColor] = useState("");
  const [newSize, setNewSize] = useState("");
  const [newQuantity, setNewQuantity] = useState<number>(0);
  
  const [selectedSampleTypes, setSelectedSampleTypes] = useState<string[]>([]);
  const [selectedTrimTypes, setSelectedTrimTypes] = useState<string[]>([]);
  
  // Fetch quotation details
  const { data: quotation, isLoading: isLoadingQuotation } = useQuery({
    queryKey: ["/api/quotations", id],
    queryFn: async () => {
      if (!id) return null;
      const response = await apiRequest(`/api/quotations/${id}`, "GET");
      return await response.json();
    },
    enabled: !!id,
  });
  
  // Form definition with zod validation
  const form = useForm<z.infer<typeof convertToOrderSchema>>({
    resolver: zodResolver(convertToOrderSchema),
    defaultValues: {
      deliveryMode: "Sea",
      deliveryPort: "",
      paymentTerms: "Net 30",
      sampleTypes: [],
      trimTypes: [],
    },
  });
  
  // Mutation for converting quotation to order
  const convertToOrderMutation = useMutation({
    mutationFn: async (data: z.infer<typeof convertToOrderSchema>) => {
      if (!id) throw new Error("Quotation ID is required");
      
      // Add color/size breakdown to the request
      const requestData = {
        ...data,
        colorSizes: colorSizes,
        sampleTypes: selectedSampleTypes,
        trimTypes: selectedTrimTypes
      };
      
      return await apiRequest(`/api/orders/convert-from-quotation/${id}`, 'POST', requestData);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      
      toast({
        title: "Success",
        description: "Quotation successfully converted to order",
      });
      
      // Navigate to the new order page
      setLocation(`/orders/${data.order.id}`);
    },
    onError: (error) => {
      console.error("Error converting quotation to order:", error);
      toast({
        title: "Error",
        description: "Failed to convert quotation to order",
        variant: "destructive",
      });
    },
  });
  
  // Add a new color/size breakdown
  const addColorSize = () => {
    if (!newColor || !newSize || newQuantity <= 0) {
      toast({
        title: "Invalid entry",
        description: "Please enter valid color, size and quantity",
        variant: "destructive",
      });
      return;
    }
    
    setColorSizes([...colorSizes, { color: newColor, size: newSize, quantity: newQuantity }]);
    setNewColor("");
    setNewSize("");
    setNewQuantity(0);
  };
  
  // Remove a color/size breakdown
  const removeColorSize = (index: number) => {
    const updatedColorSizes = [...colorSizes];
    updatedColorSizes.splice(index, 1);
    setColorSizes(updatedColorSizes);
  };
  
  // Calculate total quantity from color/size breakdown
  const totalQuantity = colorSizes.reduce((sum, item) => sum + item.quantity, 0);
  
  // Handle form submission
  const onSubmit = (data: z.infer<typeof convertToOrderSchema>) => {
    // Validate color/size breakdown if entered
    if (colorSizes.length > 0 && totalQuantity <= 0) {
      toast({
        title: "Invalid color/size breakdown",
        description: "Total quantity must be greater than zero",
        variant: "destructive",
      });
      return;
    }
    
    // Update the form data with the selected sample types and trim types
    data.sampleTypes = selectedSampleTypes;
    data.trimTypes = selectedTrimTypes;
    
    // Submit the form
    convertToOrderMutation.mutate(data);
  };
  
  const toggleSampleType = (type: string) => {
    setSelectedSampleTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };
  
  const toggleTrimType = (type: string) => {
    setSelectedTrimTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };
  
  if (isLoadingQuotation) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="mr-2 h-8 w-8 animate-spin" />
        <span>Loading quotation details...</span>
      </div>
    );
  }
  
  if (!quotation) {
    return (
      <div className="text-center py-10">
        <h2 className="text-2xl font-bold">Quotation Not Found</h2>
        <p className="mt-2">The requested quotation could not be found.</p>
        <Button className="mt-4" onClick={() => setLocation("/quotations")}>Back to Quotations</Button>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Convert Quotation to Order</h1>
          <p className="text-muted-foreground">
            Create a new order based on quotation #{quotation.quotationId}
          </p>
        </div>
        <Button variant="outline" onClick={() => setLocation("/quotations")}>
          Cancel
        </Button>
      </div>
      
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Quotation Details</CardTitle>
              <CardDescription>Review quotation information before conversion</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium">Quotation ID</h3>
                  <p className="text-muted-foreground">{quotation.quotationId}</p>
                </div>
                
                <div>
                  <h3 className="font-medium">Style Name</h3>
                  <p className="text-muted-foreground">{quotation.styleName}</p>
                </div>
                
                <div>
                  <h3 className="font-medium">Department</h3>
                  <p className="text-muted-foreground">{quotation.department}</p>
                </div>
                
                <div>
                  <h3 className="font-medium">Projected Quantity</h3>
                  <p className="text-muted-foreground">{quotation.projectedQuantity} pcs</p>
                </div>
                
                <div>
                  <h3 className="font-medium">Projected Delivery</h3>
                  <p className="text-muted-foreground">
                    {new Date(quotation.projectedDeliveryDate).toLocaleDateString()}
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium">Quoted Price</h3>
                  <p className="text-muted-foreground">
                    ${parseFloat(quotation.quotedPrice).toFixed(2)} per pc
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium">Status</h3>
                  <p className="text-muted-foreground">{quotation.status}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Order Information</CardTitle>
              <CardDescription>Provide additional details needed for the order</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <Tabs defaultValue="delivery">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="delivery">Delivery Details</TabsTrigger>
                      <TabsTrigger value="colorsize">Color/Size Breakdown</TabsTrigger>
                      <TabsTrigger value="requirements">Requirements</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="delivery" className="space-y-4 py-4">
                      <FormField
                        control={form.control}
                        name="deliveryMode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Delivery Mode</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select delivery mode" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Air">Air Freight</SelectItem>
                                <SelectItem value="Sea">Sea Freight</SelectItem>
                                <SelectItem value="Road">Road Transport</SelectItem>
                                <SelectItem value="Rail">Rail Transport</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              How the goods will be shipped to the destination
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="deliveryPort"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Delivery Port/Location</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Enter delivery port or location" 
                                {...field} 
                              />
                            </FormControl>
                            <FormDescription>
                              The final destination port or location for delivery
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="paymentTerms"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Payment Terms</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select payment terms" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {PAYMENT_TERMS.map((term) => (
                                  <SelectItem key={term} value={term}>
                                    {term}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Payment conditions for this order
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TabsContent>
                    
                    <TabsContent value="colorsize" className="space-y-4 py-4">
                      <div className="mb-4">
                        <h3 className="text-lg font-medium">Color & Size Breakdown</h3>
                        <p className="text-sm text-muted-foreground">
                          Specify quantities by color and size
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <FormLabel>Color</FormLabel>
                          <Input
                            placeholder="e.g., Navy Blue"
                            value={newColor}
                            onChange={(e) => setNewColor(e.target.value)}
                          />
                        </div>
                        
                        <div>
                          <FormLabel>Size</FormLabel>
                          <Input
                            placeholder="e.g., XL"
                            value={newSize}
                            onChange={(e) => setNewSize(e.target.value)}
                          />
                        </div>
                        
                        <div>
                          <FormLabel>Quantity</FormLabel>
                          <div className="flex space-x-2">
                            <Input
                              type="number"
                              min="1"
                              placeholder="Quantity"
                              value={newQuantity || ""}
                              onChange={(e) => setNewQuantity(parseInt(e.target.value) || 0)}
                            />
                            <Button type="button" onClick={addColorSize} size="icon">
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      {colorSizes.length > 0 ? (
                        <div className="border rounded-md overflow-hidden mt-4">
                          <table className="w-full">
                            <thead className="bg-muted">
                              <tr>
                                <th className="text-left p-2">Color</th>
                                <th className="text-left p-2">Size</th>
                                <th className="text-right p-2">Quantity</th>
                                <th className="p-2 w-10"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {colorSizes.map((item, index) => (
                                <tr key={index} className="border-t">
                                  <td className="p-2">{item.color}</td>
                                  <td className="p-2">{item.size}</td>
                                  <td className="p-2 text-right">{item.quantity}</td>
                                  <td className="p-2">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeColorSize(index)}
                                    >
                                      <X className="h-4 w-4 text-muted-foreground" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-muted/50">
                              <tr>
                                <td colSpan={2} className="p-2 font-medium">Total</td>
                                <td className="p-2 text-right font-medium">{totalQuantity}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-6 text-muted-foreground border border-dashed rounded-md">
                          No color/size breakdown added yet
                        </div>
                      )}
                    </TabsContent>
                    
                    <TabsContent value="requirements" className="space-y-4 py-4">
                      <div className="mb-4">
                        <h3 className="text-lg font-medium">Sample Requirements</h3>
                        <p className="text-sm text-muted-foreground">
                          Select sample types required for this order
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        {SAMPLE_TYPES.map((type) => (
                          <div key={type} className="flex items-center space-x-2">
                            <Checkbox
                              id={`sample-${type}`}
                              checked={selectedSampleTypes.includes(type)}
                              onCheckedChange={() => toggleSampleType(type)}
                            />
                            <label
                              htmlFor={`sample-${type}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {type}
                            </label>
                          </div>
                        ))}
                      </div>
                      
                      <Separator className="my-4" />
                      
                      <div className="mb-4">
                        <h3 className="text-lg font-medium">Trim Requirements</h3>
                        <p className="text-sm text-muted-foreground">
                          Select trims required for this order
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        {TRIM_TYPES.map((type) => (
                          <div key={type} className="flex items-center space-x-2">
                            <Checkbox
                              id={`trim-${type}`}
                              checked={selectedTrimTypes.includes(type)}
                              onCheckedChange={() => toggleTrimType(type)}
                            />
                            <label
                              htmlFor={`trim-${type}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              {type}
                            </label>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  </Tabs>
                  
                  <div className="pt-4 border-t flex justify-end space-x-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setLocation("/quotations")}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={convertToOrderMutation.isPending}
                    >
                      {convertToOrderMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Convert to Order
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}