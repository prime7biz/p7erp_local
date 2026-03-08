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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { ArrowLeft, Save } from "lucide-react";

// Define the form schema
const subcategoryFormSchema = z.object({
  subcategoryId: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  categoryId: z.string().min(1, "Category is required"),
  tenantId: z.number().optional(),
});

type SubcategoryFormValues = z.infer<typeof subcategoryFormSchema>;

// Subcategory creation page component
const SubcategoryNewPage = () => {
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
  const form = useForm<SubcategoryFormValues>({
    resolver: zodResolver(subcategoryFormSchema),
    defaultValues: {
      subcategoryId: "",
      name: "",
      description: "",
      categoryId: "",
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

  // Create subcategory mutation
  const createSubcategoryMutation = useMutation({
    mutationFn: async (data: SubcategoryFormValues) => {
      const response = await apiRequest('/api/item-subcategories', 'POST', {
        ...data,
        categoryId: parseInt(data.categoryId),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Subcategory created",
        description: "The subcategory has been successfully created.",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/item-subcategories'] });
      
      // Navigate back to the return URL if it exists, or to the subcategories list
      if (returnUrl) {
        // If there was saved form data in localStorage, we should try to restore it
        navigate(returnUrl);
      } else {
        navigate("/inventory/subcategories");
      }
    },
    onError: (error) => {
      toast({
        title: "Creation failed",
        description: error instanceof Error ? error.message : "Failed to create subcategory",
        variant: "destructive",
      });
    }
  });

  // Handle form submission
  const onSubmit = (values: SubcategoryFormValues) => {
    createSubcategoryMutation.mutate({ ...values, tenantId: 1 });
  };

  return (
    <DashboardContainer
      title="Create New Subcategory"
      subtitle="Add a new item subcategory"
      actions={
        <Button variant="outline" onClick={() => returnUrl ? navigate(returnUrl) : navigate("/inventory/subcategories")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Subcategory Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="subcategoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subcategory ID <span className="text-xs text-muted-foreground">(Auto-generated)</span></FormLabel>
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
                        <Input {...field} placeholder="Enter subcategory name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent Category*</FormLabel>
                    <Select
                      value={field.value?.toString() || ""}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select parent category" />
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
                        placeholder="Enter subcategory description" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={createSubcategoryMutation.isPending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {createSubcategoryMutation.isPending ? "Creating..." : "Create Subcategory"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </DashboardContainer>
  );
};

export default SubcategoryNewPage;