import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Components
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Form schema
const subcategoryFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  categoryId: z.number().min(1, "Parent category is required"),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

type SubcategoryFormValues = z.infer<typeof subcategoryFormSchema>;

// Item Subcategories page component
const ItemSubcategoriesPage: React.FC = () => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedSubcategory, setSelectedSubcategory] = useState<any>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch categories for the parent category dropdown
  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
    queryKey: ["/api/item-categories"],
    staleTime: 5 * 60 * 1000,
  });
  
  // Ensure categories is always an array
  const categories = Array.isArray(categoriesData) ? categoriesData : [];

  // Fetch subcategories
  const { data: subcategoriesData, isLoading: subcategoriesLoading } = useQuery({
    queryKey: ["/api/item-subcategories", selectedCategoryId],
    queryFn: () => {
      const url = selectedCategoryId 
        ? `/api/item-subcategories?categoryId=${selectedCategoryId}`
        : "/api/item-subcategories";
      return apiRequest(url);
    },
    staleTime: 5 * 60 * 1000,
  });
  
  // Ensure subcategories is always an array
  const subcategories = Array.isArray(subcategoriesData) ? subcategoriesData : [];

  // Create subcategory mutation
  const createSubcategoryMutation = useMutation({
    mutationFn: (data: SubcategoryFormValues) => 
      apiRequest("/api/item-subcategories", {
        method: "POST",
        data,
      } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/item-subcategories"] });
      toast({
        title: "Subcategory created",
        description: "The item subcategory has been successfully created",
      });
      setIsAddDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create subcategory",
        variant: "destructive",
      });
    },
  });

  // Update subcategory mutation
  const updateSubcategoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SubcategoryFormValues> }) =>
      apiRequest(`/api/item-subcategories/${id}`, {
        method: "PATCH",
        data,
      } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/item-subcategories"] });
      toast({
        title: "Subcategory updated",
        description: "The item subcategory has been successfully updated",
      });
      setIsEditDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update subcategory",
        variant: "destructive",
      });
    },
  });

  // Delete subcategory mutation
  const deleteSubcategoryMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/item-subcategories/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/item-subcategories"] });
      toast({
        title: "Subcategory deleted",
        description: "The item subcategory has been successfully deleted",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete subcategory",
        variant: "destructive",
      });
    },
  });

  // Form setup for adding a new subcategory
  const addForm = useForm<SubcategoryFormValues>({
    resolver: zodResolver(subcategoryFormSchema),
    defaultValues: {
      name: "",
      categoryId: undefined as unknown as number,
      description: "",
      isActive: true,
    },
  });

  // Form setup for editing a subcategory
  const editForm = useForm<SubcategoryFormValues>({
    resolver: zodResolver(subcategoryFormSchema),
    defaultValues: {
      name: "",
      categoryId: undefined as unknown as number,
      description: "",
      isActive: true,
    },
  });

  // Handle form submission for adding a new subcategory
  const onAddSubmit = (data: SubcategoryFormValues) => {
    createSubcategoryMutation.mutate(data);
  };

  // Handle form submission for editing a subcategory
  const onEditSubmit = (data: SubcategoryFormValues) => {
    if (selectedSubcategory) {
      updateSubcategoryMutation.mutate({
        id: selectedSubcategory.id,
        data,
      });
    }
  };

  // Handle deleting a subcategory
  const handleDelete = (subcategory: any) => {
    if (confirm(`Are you sure you want to delete the subcategory "${subcategory.name}"?`)) {
      deleteSubcategoryMutation.mutate(subcategory.id);
    }
  };

  // Handle editing a subcategory
  const handleEdit = (subcategory: any) => {
    setSelectedSubcategory(subcategory);
    editForm.reset({
      name: subcategory.name,
      categoryId: subcategory.categoryId,
      description: subcategory.description || "",
      isActive: subcategory.isActive,
    });
    setIsEditDialogOpen(true);
  };

  // Handle viewing a subcategory
  const handleView = (subcategory: any) => {
    setSelectedSubcategory(subcategory);
    setIsViewDialogOpen(true);
  };

  // Get category name by ID
  const getCategoryNameById = (id: number) => {
    if (!categories) return "Unknown Category";
    const categoryArray = categories as any[];
    const category = categoryArray.find((cat: any) => cat.id === id);
    return category ? category.name : "Unknown Category";
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Item Subcategories</h1>
        <Button onClick={() => {
          addForm.reset({
            name: "",
            categoryId: undefined as unknown as number,
            description: "",
            isActive: true,
          });
          setIsAddDialogOpen(true);
        }}>
          <span className="material-icons mr-2">add</span>
          Add Subcategory
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center space-x-4">
            <Select 
              value={selectedCategoryId?.toString() || "all"} 
              onValueChange={(value) => setSelectedCategoryId(value !== "all" ? parseInt(value) : null)}
            >
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Filter by parent category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category: any) => (
                  <SelectItem key={category.id} value={category.id.toString()}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {subcategoriesLoading ? (
        <div className="text-center py-6">Loading subcategories...</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">Name</TableHead>
                <TableHead>Parent Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subcategories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6">
                    No subcategories found. Add your first subcategory to get started.
                  </TableCell>
                </TableRow>
              ) : (
                subcategories.map((subcategory: any) => (
                  <TableRow key={subcategory.id}>
                    <TableCell className="font-medium">{subcategory.name}</TableCell>
                    <TableCell>{getCategoryNameById(subcategory.categoryId)}</TableCell>
                    <TableCell>{subcategory.description || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={subcategory.isActive ? "outline" : "secondary"} 
                        className={subcategory.isActive ? "bg-green-100 text-green-800 hover:bg-green-200" : ""}>
                        {subcategory.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="material-icons">more_vert</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleView(subcategory)}>
                            <span className="material-icons text-sm mr-2">visibility</span>
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(subcategory)}>
                            <span className="material-icons text-sm mr-2">edit</span>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(subcategory)} className="text-red-600">
                            <span className="material-icons text-sm mr-2">delete</span>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Subcategory Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Item Subcategory</DialogTitle>
          </DialogHeader>
          <Form {...addForm}>
            <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="space-y-4">
              <FormField
                control={addForm.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent Category *</FormLabel>
                    <Select
                      value={field.value?.toString() || ""}
                      onValueChange={(value) => field.onChange(parseInt(value))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a parent category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories && (categories as any[]).map((category: any) => (
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
                control={addForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter subcategory name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={addForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter subcategory description"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={addForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Active Status</FormLabel>
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
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createSubcategoryMutation.isPending}
                >
                  {createSubcategoryMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Subcategory Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Subcategory</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent Category *</FormLabel>
                    <Select
                      value={field.value?.toString() || ""}
                      onValueChange={(value) => field.onChange(parseInt(value))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a parent category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories && (categories as any[]).map((category: any) => (
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
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter subcategory name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter subcategory description"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel>Active Status</FormLabel>
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
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={updateSubcategoryMutation.isPending}
                >
                  {updateSubcategoryMutation.isPending ? "Updating..." : "Update"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* View Subcategory Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Subcategory Details</DialogTitle>
          </DialogHeader>
          {selectedSubcategory && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 py-4">
                <div className="font-medium">Name:</div>
                <div className="col-span-2">{selectedSubcategory.name}</div>
              </div>
              <div className="grid grid-cols-3 gap-4 py-4 border-t">
                <div className="font-medium">Parent Category:</div>
                <div className="col-span-2">{getCategoryNameById(selectedSubcategory.categoryId)}</div>
              </div>
              <div className="grid grid-cols-3 gap-4 py-4 border-t">
                <div className="font-medium">Description:</div>
                <div className="col-span-2">{selectedSubcategory.description || "-"}</div>
              </div>
              <div className="grid grid-cols-3 gap-4 py-4 border-t">
                <div className="font-medium">Status:</div>
                <div className="col-span-2">
                  <Badge variant={selectedSubcategory.isActive ? "outline" : "secondary"}
                    className={selectedSubcategory.isActive ? "bg-green-100 text-green-800 hover:bg-green-200" : ""}>
                    {selectedSubcategory.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 py-4 border-t">
                <div className="font-medium">Created:</div>
                <div className="col-span-2">
                  {new Date(selectedSubcategory.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 py-4 border-t">
                <div className="font-medium">Last Updated:</div>
                <div className="col-span-2">
                  {new Date(selectedSubcategory.updatedAt).toLocaleString()}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ItemSubcategoriesPage;