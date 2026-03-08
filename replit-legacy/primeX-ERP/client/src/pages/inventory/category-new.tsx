import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { ArrowLeft, Save } from "lucide-react";

// Define the form schema
const categoryFormSchema = z.object({
  categoryId: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  tenantId: z.number().optional(),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

// Category creation page component
const CategoryNewPage = () => {
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
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      categoryId: "",
      name: "",
      description: "",
      tenantId: 1,
    },
  });

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: async (data: CategoryFormValues) => {
      const response = await apiRequest('/api/item-categories', 'POST', data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Category created",
        description: "The category has been successfully created.",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/item-categories'] });
      
      // Navigate back to the return URL if it exists, or to the categories list
      if (returnUrl) {
        // If there was saved form data in localStorage, attempt to restore it
        navigate(returnUrl);
      } else {
        navigate("/inventory/categories");
      }
    },
    onError: (error) => {
      toast({
        title: "Creation failed",
        description: error instanceof Error ? error.message : "Failed to create category",
        variant: "destructive",
      });
    }
  });

  // Handle form submission
  const onSubmit = (values: CategoryFormValues) => {
    createCategoryMutation.mutate({ ...values, tenantId: 1 });
  };

  return (
    <DashboardContainer
      title="Create New Category"
      subtitle="Add a new item category"
      actions={
        <Button variant="outline" onClick={() => returnUrl ? navigate(returnUrl) : navigate("/inventory/categories")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Category Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category ID <span className="text-xs text-muted-foreground">(Auto-generated)</span></FormLabel>
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
                        <Input {...field} placeholder="Enter category name" />
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
                        placeholder="Enter category description" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={createCategoryMutation.isPending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {createCategoryMutation.isPending ? "Creating..." : "Create Category"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </DashboardContainer>
  );
};

export default CategoryNewPage;