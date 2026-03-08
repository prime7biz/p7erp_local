import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ChevronRight,
  ChevronDown,
  FolderTree,
  Plus,
  Edit,
  Trash2,
  Package,
  Building2,
  Loader2,
  Zap,
} from "lucide-react";

const NATURE_OPTIONS = [
  { value: "raw_material", label: "Raw Material", color: "bg-blue-100 text-blue-800" },
  { value: "wip", label: "Work In Progress", color: "bg-yellow-100 text-yellow-800" },
  { value: "finished_goods", label: "Finished Goods", color: "bg-green-100 text-green-800" },
  { value: "packing", label: "Packing Material", color: "bg-purple-100 text-purple-800" },
  { value: "consumable", label: "Consumable", color: "bg-orange-100 text-orange-800" },
  { value: "trading", label: "Trading Goods", color: "bg-pink-100 text-pink-800" },
];

const getNatureLabel = (nature: string) => {
  return NATURE_OPTIONS.find((n) => n.value === nature)?.label || nature;
};

const getNatureColor = (nature: string) => {
  return NATURE_OPTIONS.find((n) => n.value === nature)?.color || "bg-gray-100 text-gray-800";
};

const stockGroupFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  code: z.string().optional(),
  parentId: z.number().nullable().optional(),
  nature: z.string().min(1, "Nature is required"),
  inventoryAccountId: z.number().nullable().optional(),
  cogsAccountId: z.number().nullable().optional(),
  wipAccountId: z.number().nullable().optional(),
  adjustmentAccountId: z.number().nullable().optional(),
  grniAccountId: z.number().nullable().optional(),
  isActive: z.boolean().default(true),
});

type StockGroupFormValues = z.infer<typeof stockGroupFormSchema>;

interface StockGroupNode {
  id: number;
  name: string;
  code: string | null;
  nature: string;
  level: number;
  parentId: number | null;
  isActive: boolean;
  inventoryAccountId: number | null;
  cogsAccountId: number | null;
  wipAccountId: number | null;
  adjustmentAccountId: number | null;
  grniAccountId: number | null;
  children: StockGroupNode[];
}

function TreeNode({
  node,
  onEdit,
  onDelete,
  defaultExpanded = false,
}: {
  node: StockGroupNode;
  onEdit: (node: StockGroupNode) => void;
  onDelete: (id: number) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-md hover:bg-muted/50 group transition-colors"
        style={{ paddingLeft: `${node.level * 24 + 12}px` }}
      >
        <button
          onClick={() => hasChildren && setExpanded(!expanded)}
          className={`p-0.5 rounded ${hasChildren ? "hover:bg-muted cursor-pointer" : "invisible"}`}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        <FolderTree className="h-4 w-4 text-primary/70" />

        <span className="font-medium text-sm flex-1">{node.name}</span>

        {node.code && (
          <span className="text-xs text-muted-foreground font-mono">{node.code}</span>
        )}

        <Badge className={`text-xs ${getNatureColor(node.nature)}`} variant="secondary">
          {getNatureLabel(node.nature)}
        </Badge>

        {!node.isActive && (
          <Badge variant="outline" className="text-xs bg-gray-100 text-gray-500">
            Inactive
          </Badge>
        )}

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(node)}
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(node.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              onEdit={onEdit}
              onDelete={onDelete}
              defaultExpanded={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const QUICK_SETUP_GROUPS = [
  {
    name: "Raw Materials",
    nature: "raw_material",
    children: [
      {
        name: "Fabric",
        nature: "raw_material",
        children: [
          { name: "Knit Fabric", nature: "raw_material" },
          { name: "Woven Fabric", nature: "raw_material" },
        ],
      },
      {
        name: "Trims & Accessories",
        nature: "raw_material",
        children: [
          { name: "Buttons", nature: "raw_material" },
          { name: "Zippers", nature: "raw_material" },
          { name: "Labels", nature: "raw_material" },
          { name: "Thread", nature: "raw_material" },
        ],
      },
      { name: "Packing Materials", nature: "packing", children: [] },
    ],
  },
  {
    name: "Work In Progress",
    nature: "wip",
    children: [
      { name: "Greige Fabric", nature: "wip" },
      { name: "Finished Fabric", nature: "wip" },
      { name: "Cut Panels", nature: "wip" },
    ],
  },
  {
    name: "Finished Goods",
    nature: "finished_goods",
    children: [{ name: "Garments", nature: "finished_goods" }],
  },
];

const StockGroupsPage = () => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<StockGroupNode | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: treeData, isLoading } = useQuery<StockGroupNode[]>({
    queryKey: ["/api/stock-groups", "tree"],
    queryFn: async () => {
      const res = await fetch("/api/stock-groups/tree", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stock groups");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: flatGroups } = useQuery<StockGroupNode[]>({
    queryKey: ["/api/stock-groups", "flat"],
    queryFn: async () => {
      const res = await fetch("/api/stock-groups?flat=true", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stock groups");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: glAccounts } = useQuery<any[]>({
    queryKey: ["/api/accounting/chart-of-accounts"],
    staleTime: 10 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (data: StockGroupFormValues) =>
      apiRequest("/api/stock-groups", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock-groups"] });
      toast({ title: "Stock group created", description: "The stock group has been successfully created" });
      setIsAddDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create stock group", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<StockGroupFormValues> }) =>
      apiRequest(`/api/stock-groups/${id}`, "PUT", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock-groups"] });
      toast({ title: "Stock group updated", description: "The stock group has been successfully updated" });
      setIsEditDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update stock group", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/stock-groups/${id}`, "DELETE", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock-groups"] });
      toast({ title: "Stock group deleted", description: "The stock group has been successfully deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete stock group", variant: "destructive" });
    },
  });

  const quickSetupMutation = useMutation({
    mutationFn: async () => {
      const createGroup = async (
        group: any,
        parentId: number | null
      ): Promise<void> => {
        const res = await apiRequest("/api/stock-groups", "POST", {
          name: group.name,
          nature: group.nature,
          parentId,
          isActive: true,
        });
        const created = res as any;
        if (group.children) {
          for (const child of group.children) {
            await createGroup(child, created.id);
          }
        }
      };

      for (const group of QUICK_SETUP_GROUPS) {
        await createGroup(group, null);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stock-groups"] });
      toast({
        title: "Quick setup complete",
        description: "Default garment manufacturing stock groups have been created",
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to run quick setup", variant: "destructive" });
    },
  });

  const addForm = useForm<StockGroupFormValues>({
    resolver: zodResolver(stockGroupFormSchema),
    defaultValues: {
      name: "",
      code: "",
      parentId: null,
      nature: "raw_material",
      inventoryAccountId: null,
      cogsAccountId: null,
      wipAccountId: null,
      adjustmentAccountId: null,
      grniAccountId: null,
      isActive: true,
    },
  });

  const editForm = useForm<StockGroupFormValues>({
    resolver: zodResolver(stockGroupFormSchema),
    defaultValues: {
      name: "",
      code: "",
      parentId: null,
      nature: "raw_material",
      inventoryAccountId: null,
      cogsAccountId: null,
      wipAccountId: null,
      adjustmentAccountId: null,
      grniAccountId: null,
      isActive: true,
    },
  });

  const onAddSubmit = (data: StockGroupFormValues) => {
    createMutation.mutate(data);
  };

  const onEditSubmit = (data: StockGroupFormValues) => {
    if (selectedGroup) {
      updateMutation.mutate({ id: selectedGroup.id, data });
    }
  };

  const handleEdit = (group: StockGroupNode) => {
    setSelectedGroup(group);
    editForm.reset({
      name: group.name,
      code: group.code || "",
      parentId: group.parentId,
      nature: group.nature,
      inventoryAccountId: group.inventoryAccountId,
      cogsAccountId: group.cogsAccountId,
      wipAccountId: group.wipAccountId,
      adjustmentAccountId: group.adjustmentAccountId,
      grniAccountId: group.grniAccountId,
      isActive: group.isActive,
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Are you sure you want to delete this stock group?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleOpenAddDialog = (parentId?: number | null) => {
    addForm.reset({
      name: "",
      code: "",
      parentId: parentId || null,
      nature: "raw_material",
      inventoryAccountId: null,
      cogsAccountId: null,
      wipAccountId: null,
      adjustmentAccountId: null,
      grniAccountId: null,
      isActive: true,
    });
    setIsAddDialogOpen(true);
  };

  const renderGLAccountSelect = (
    form: any,
    fieldName: string,
    label: string
  ) => (
    <FormField
      control={form.control}
      name={fieldName}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            onValueChange={(value) =>
              field.onChange(value === "none" ? null : parseInt(value))
            }
            value={field.value?.toString() || "none"}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {glAccounts &&
                glAccounts.map((account: any) => (
                  <SelectItem key={account.id} value={account.id.toString()}>
                    {account.code} - {account.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const renderFormFields = (form: any, isEdit: boolean) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name *</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Raw Materials" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Code</FormLabel>
              <FormControl>
                <Input placeholder="Auto-generated if empty" {...field} value={field.value || ""} />
              </FormControl>
              <FormDescription className="text-xs">Leave blank for auto-generation</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="nature"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nature *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select nature" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {NATURE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
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
          name="parentId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Parent Group</FormLabel>
              <Select
                onValueChange={(value) =>
                  field.onChange(value === "none" ? null : parseInt(value))
                }
                value={field.value?.toString() || "none"}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select parent group" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="none">None (Root Level)</SelectItem>
                  {flatGroups &&
                    flatGroups
                      .filter((g) => !isEdit || g.id !== selectedGroup?.id)
                      .map((g) => (
                        <SelectItem key={g.id} value={g.id.toString()}>
                          {"—".repeat(g.level)} {g.name}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="border rounded-md p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">GL Account Mapping</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {renderGLAccountSelect(form, "inventoryAccountId", "Inventory Account")}
          {renderGLAccountSelect(form, "cogsAccountId", "COGS Account")}
          {renderGLAccountSelect(form, "wipAccountId", "WIP Account")}
          {renderGLAccountSelect(form, "adjustmentAccountId", "Adjustment Account")}
          {renderGLAccountSelect(form, "grniAccountId", "GRNI Account")}
        </div>
      </div>

      <FormField
        control={form.control}
        name="isActive"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between space-x-2 space-y-0 rounded-md border p-4">
            <div className="space-y-0.5">
              <FormLabel>Active</FormLabel>
              <FormDescription className="text-xs">
                Inactive groups won't be available for selection
              </FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );

  if (isLoading) {
    return (
      <DashboardContainer title="Stock Groups" subtitle="Manage hierarchical stock group classification">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/3 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Array(6)
                .fill(null)
                .map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
            </div>
          </CardContent>
        </Card>
      </DashboardContainer>
    );
  }

  const isEmpty = !treeData || treeData.length === 0;

  return (
    <DashboardContainer
      title="Stock Groups"
      subtitle="Manage hierarchical stock group classification"
      actions={
        <div className="flex gap-2">
          {isEmpty && (
            <Button
              variant="outline"
              onClick={() => quickSetupMutation.mutate()}
              disabled={quickSetupMutation.isPending}
            >
              {quickSetupMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              Quick Setup
            </Button>
          )}
          <Button onClick={() => handleOpenAddDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Add Stock Group
          </Button>
        </div>
      }
    >
      <Card>
        <CardHeader className="px-6 py-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Stock Group Hierarchy</CardTitle>
          </div>
          <CardDescription>
            Organize inventory items into hierarchical groups with GL account mappings
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FolderTree className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No stock groups yet</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md">
                Create stock groups to organize your inventory items. Use "Quick Setup" to
                pre-create common garment manufacturing groups.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => quickSetupMutation.mutate()}
                  disabled={quickSetupMutation.isPending}
                >
                  {quickSetupMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="mr-2 h-4 w-4" />
                  )}
                  Quick Setup
                </Button>
                <Button onClick={() => handleOpenAddDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Stock Group
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-2">
              {treeData.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  defaultExpanded={true}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Stock Group</DialogTitle>
            <DialogDescription>
              Create a new stock group for inventory classification
            </DialogDescription>
          </DialogHeader>
          <Form {...addForm}>
            <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="space-y-4">
              {renderFormFields(addForm, false)}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Stock Group"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Stock Group</DialogTitle>
            <DialogDescription>
              Update the stock group details
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              {renderFormFields(editForm, true)}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Stock Group"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
};

export default StockGroupsPage;
