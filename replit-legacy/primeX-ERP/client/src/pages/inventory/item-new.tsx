import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { ArrowLeft, Save } from "lucide-react";

// Define the form schema
const itemFormSchema = z.object({
  itemCode: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  type: z.string().min(1, "Type is required"),
  categoryId: z.string().min(1, "Category is required"),
  subcategoryId: z.string().nullable().optional(),
  unitId: z.string().min(1, "Unit is required"),
  basePrice: z.string().min(1, "Base price is required"),
  stockable: z.boolean().default(true),
  purchasable: z.boolean().default(true),
  sellable: z.boolean().default(true),
  minimumStock: z.string().optional(),
  reorderPoint: z.string().optional(),
  tenantId: z.number().optional(),
});

type ItemFormValues = z.infer<typeof itemFormSchema>;

// Item creation page component
const ItemNewPage = () => {
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Check if there's a returnTo parameter in the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnToPath = params.get("returnTo");
    if (returnToPath) {
      setReturnUrl(returnToPath);
    }
  }, []);

  // Define form with default values
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: {
      itemCode: "",
      name: "",
      description: "",
      type: "standard",
      categoryId: "",
      subcategoryId: null,
      unitId: "",
      basePrice: "0",
      stockable: true,
      purchasable: true,
      sellable: true,
      minimumStock: "0",
      reorderPoint: "0",
      tenantId: 1,
    },
  });

  // Fetch categories for dropdown
  const { data: categories } = useQuery({
    queryKey: ['/api/item-categories'],
    queryFn: async () => {
      const response = await fetch('/api/item-categories');
      if (!response.ok) {
        throw new Error('Failed to fetch item categories');
      }
      return response.json();
    },
  });

  // Fetch subcategories for dropdown
  const { data: subcategories } = useQuery({
    queryKey: ['/api/item-subcategories'],
    queryFn: async () => {
      const response = await fetch('/api/item-subcategories');
      if (!response.ok) {
        throw new Error('Failed to fetch item subcategories');
      }
      return response.json();
    },
  });

  // Fetch units for dropdown
  const { data: units } = useQuery({
    queryKey: ['/api/item-units'],
    queryFn: async () => {
      const response = await fetch('/api/item-units');
      if (!response.ok) {
        throw new Error('Failed to fetch item units');
      }
      return response.json();
    },
  });

  // Create item mutation
  const createItemMutation = useMutation({
    mutationFn: async (data: ItemFormValues) => {
      const response = await apiRequest('/api/items', 'POST', data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Item created",
        description: "The item has been successfully created.",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      
      // Navigate back to the return URL if it exists, or to the items list
      if (returnUrl) {
        // If there was saved form data in localStorage, we should try to restore it
        navigate(returnUrl);
      } else {
        navigate("/inventory/items");
      }
    },
    onError: (error) => {
      toast({
        title: "Creation failed",
        description: error instanceof Error ? error.message : "Failed to create item",
        variant: "destructive",
      });
    }
  });

  // Handle form submission
  const onSubmit = (values: ItemFormValues) => {
    // Ensure numeric values are sent as numbers
    const formattedValues = {
      ...values,
      categoryId: values.categoryId ? parseInt(values.categoryId) : null,
      subcategoryId: values.subcategoryId ? parseInt(values.subcategoryId) : null,
      unitId: values.unitId ? parseInt(values.unitId) : null,
      basePrice: values.basePrice,
      minimumStock: values.minimumStock || "0",
      reorderPoint: values.reorderPoint || "0",
      tenantId: 1, // Default tenant ID
    };
    
    createItemMutation.mutate(formattedValues);
  };

  return (
    <DashboardContainer
      title="Create New Item"
      subtitle="Add a new inventory item"
      actions={
        <Button variant="outline" onClick={() => returnUrl ? navigate(returnUrl) : navigate("/inventory/items")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Item Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="itemCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item Code <span className="text-xs text-muted-foreground">(Auto-generated)</span></FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} placeholder="Auto-generated" disabled className="bg-muted" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name*</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter item name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        value={field.value || ''}
                        placeholder="Enter item description" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item Type*</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select item type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="raw_material">Raw Material</SelectItem>
                          <SelectItem value="semi_finished">Semi-Finished</SelectItem>
                          <SelectItem value="finished">Finished Product</SelectItem>
                          <SelectItem value="service">Service</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category*</FormLabel>
                      <Select
                        value={field.value?.toString() || ""}
                        onValueChange={(value) => {
                          field.onChange(value);
                          // When category changes, reset subcategory selection
                          form.setValue("subcategoryId", null);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories?.map((category: any) => (
                            <SelectItem key={category.id} value={category.id.toString()}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="subcategoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subcategory</FormLabel>
                      <Select
                        value={field.value?.toString() || ""}
                        onValueChange={(value) => {
                          field.onChange(value === "null" ? null : value);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a subcategory" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="null">None</SelectItem>
                          {subcategories
                            ?.filter((sub: any) => 
                              sub.categoryId === parseInt(form.watch("categoryId")?.toString() || "0")
                            )
                            .map((subcategory: any) => (
                              <SelectItem key={subcategory.id} value={subcategory.id.toString()}>
                                {subcategory.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="unitId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit of Measure*</FormLabel>
                      <Select
                        value={field.value?.toString() || ""}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {units?.map((unit: any) => (
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
              
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="basePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base Price*</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01"
                          min="0"
                          {...field} 
                          placeholder="0.00" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="minimumStock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minimum Stock</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="1"
                          min="0"
                          {...field} 
                          value={field.value || '0'}
                          placeholder="0" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="reorderPoint"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reorder Point</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="1"
                          min="0"
                          {...field} 
                          value={field.value || '0'}
                          placeholder="0" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="stockable"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Stockable</FormLabel>
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
                
                <FormField
                  control={form.control}
                  name="purchasable"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Purchasable</FormLabel>
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
                
                <FormField
                  control={form.control}
                  name="sellable"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Sellable</FormLabel>
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
              
              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={createItemMutation.isPending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {createItemMutation.isPending ? "Creating..." : "Create Item"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </DashboardContainer>
  );
};

export default ItemNewPage;