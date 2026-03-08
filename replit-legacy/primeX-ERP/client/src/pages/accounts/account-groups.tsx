import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DashboardContainer } from "@/components/layout/dashboard-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FolderTree, Plus, Edit, Trash2, ChevronRight, ChevronDown, Layers, Loader2, Landmark } from "lucide-react";

interface AccountGroup {
  id: number;
  name: string;
  code: string;
  parentGroupId: number | null;
  nature: "Asset" | "Liability" | "Income" | "Expense" | "Equity";
  affectsGrossProfit: boolean;
  isBankGroup: boolean;
  sortOrder: number;
  isActive: boolean;
  children?: AccountGroup[];
}

const groupFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required").max(30),
  parentGroupId: z.number().nullable().optional(),
  nature: z.enum(["Asset", "Liability", "Income", "Expense", "Equity"]),
  affectsGrossProfit: z.boolean().default(false),
  isBankGroup: z.boolean().default(false),
  sortOrder: z.number().default(0),
});

type GroupFormValues = z.infer<typeof groupFormSchema>;

const NATURE_COLORS: Record<string, string> = {
  Asset: "bg-blue-100 text-blue-800",
  Liability: "bg-orange-100 text-orange-800",
  Income: "bg-green-100 text-green-800",
  Expense: "bg-red-100 text-red-800",
  Equity: "bg-purple-100 text-purple-800",
};

function GroupFormDialog({
  open,
  onOpenChange,
  title,
  description,
  defaultValues,
  allGroups,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  defaultValues: GroupFormValues;
  allGroups: AccountGroup[];
  onSubmit: (values: GroupFormValues) => void;
  isPending: boolean;
}) {
  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues,
  });

  const handleSubmit = (values: GroupFormValues) => {
    onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Current Assets" {...field} />
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
                    <Input placeholder="e.g. CA" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="parentGroupId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Group</FormLabel>
                  <Select
                    value={field.value?.toString() ?? "none"}
                    onValueChange={(val) => field.onChange(val === "none" ? null : Number(val))}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select parent group" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">None (Root Group)</SelectItem>
                      {allGroups.map((g) => (
                        <SelectItem key={g.id} value={g.id.toString()}>
                          {g.name} ({g.code})
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
              name="nature"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nature</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select nature" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Asset">Asset</SelectItem>
                      <SelectItem value="Liability">Liability</SelectItem>
                      <SelectItem value="Income">Income</SelectItem>
                      <SelectItem value="Expense">Expense</SelectItem>
                      <SelectItem value="Equity">Equity</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="affectsGrossProfit"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-3 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal">Affects Gross Profit</FormLabel>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.watch("nature") === "Asset" && (
              <FormField
                control={form.control}
                name="isBankGroup"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="flex items-center gap-2">
                        <Landmark className="h-4 w-4" />
                        Bank Group
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">Ledgers under this group default to bank accounts</p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="sortOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort Order</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="0"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function TreeRow({
  group,
  level,
  expandedIds,
  toggleExpanded,
  onEdit,
  onDelete,
}: {
  group: AccountGroup;
  level: number;
  expandedIds: Set<number>;
  toggleExpanded: (id: number) => void;
  onEdit: (group: AccountGroup) => void;
  onDelete: (group: AccountGroup) => void;
}) {
  const hasChildren = group.children && group.children.length > 0;
  const isExpanded = expandedIds.has(group.id);

  return (
    <>
      <div
        className="flex items-center gap-2 py-2.5 px-3 hover:bg-gray-50 border-b border-gray-100 group"
        style={{ paddingLeft: `${12 + level * 24}px` }}
      >
        <button
          className="w-5 h-5 flex items-center justify-center shrink-0"
          onClick={() => hasChildren && toggleExpanded(group.id)}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            )
          ) : (
            <span className="w-4" />
          )}
        </button>
        <FolderTree className="h-4 w-4 text-gray-400 shrink-0" />
        <span className="font-medium text-sm flex-1 min-w-0 truncate">{group.name}</span>
        <span className="text-xs text-gray-500 shrink-0">{group.code}</span>
        <Badge variant="secondary" className={`text-xs shrink-0 ${NATURE_COLORS[group.nature] || ""}`}>
          {group.nature}
        </Badge>
        {group.affectsGrossProfit && (
          <Badge variant="outline" className="text-xs shrink-0 border-amber-300 text-amber-700 bg-amber-50">
            GP
          </Badge>
        )}
        {group.isBankGroup && (
          <Badge variant="outline" className="text-xs shrink-0 border-blue-300 text-blue-700 bg-blue-50 flex items-center gap-1">
            <Landmark className="h-3 w-3" />
            Bank
          </Badge>
        )}
        {!group.isActive && (
          <Badge variant="outline" className="text-xs shrink-0 border-gray-300 text-gray-500">
            Inactive
          </Badge>
        )}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(group)}>
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:text-red-700" onClick={() => onDelete(group)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {hasChildren && isExpanded &&
        group.children!.map((child) => (
          <TreeRow
            key={child.id}
            group={child}
            level={level + 1}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}

export default function AccountGroupsPage() {
  const { toast } = useToast();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<AccountGroup | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<AccountGroup | null>(null);

  const { data: hierarchy, isLoading: hierarchyLoading } = useQuery<AccountGroup[]>({
    queryKey: ["/api/accounting/account-groups/hierarchy"],
  });

  const { data: flatGroups } = useQuery<AccountGroup[]>({
    queryKey: ["/api/accounting/account-groups"],
  });

  const createMutation = useMutation({
    mutationFn: (data: GroupFormValues) => apiRequest("/api/accounting/account-groups", "POST", data),
    onSuccess: () => {
      toast({ title: "Group created", description: "Account group has been created successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/account-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/account-groups/hierarchy"] });
      setIsAddOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: GroupFormValues }) =>
      apiRequest(`/api/accounting/account-groups/${id}`, "PUT", data),
    onSuccess: () => {
      toast({ title: "Group updated", description: "Account group has been updated successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/account-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/account-groups/hierarchy"] });
      setEditGroup(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/accounting/account-groups/${id}`, "DELETE"),
    onSuccess: () => {
      toast({ title: "Group deleted", description: "Account group has been deleted successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/account-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/account-groups/hierarchy"] });
      setDeleteGroup(null);
    },
    onError: (error: Error) => {
      toast({ title: "Cannot delete group", description: error.message, variant: "destructive" });
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("/api/accounting/account-groups/seed", "POST"),
    onSuccess: () => {
      toast({ title: "Default groups seeded", description: "Default account groups have been created." });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/account-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounting/account-groups/hierarchy"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error seeding groups", description: error.message, variant: "destructive" });
    },
  });

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    if (flatGroups) {
      setExpandedIds(new Set(flatGroups.map((g) => g.id)));
    }
  };

  const collapseAll = () => setExpandedIds(new Set());

  const hasGroups = hierarchy && hierarchy.length > 0;

  return (
    <DashboardContainer
      title="Account Groups"
      subtitle="Manage your account groups hierarchy"
      actions={
        <div className="flex gap-2">
          {hasGroups && (
            <>
              <Button variant="outline" size="sm" onClick={expandAll}>
                Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Collapse All
              </Button>
            </>
          )}
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Group
          </Button>
        </div>
      }
    >
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Groups Hierarchy
            </CardTitle>
            {!hasGroups && !hierarchyLoading && (
              <Button
                variant="outline"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
              >
                {seedMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <FolderTree className="mr-2 h-4 w-4" />
                Seed Default Groups
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {hierarchyLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !hasGroups ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FolderTree className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No account groups yet</h3>
              <p className="text-sm text-gray-500 mb-4 max-w-md">
                Create your first account group or seed default groups to get started.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
                  {seedMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Seed Default Groups
                </Button>
                <Button onClick={() => setIsAddOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Group
                </Button>
              </div>
            </div>
          ) : (
            <div className="divide-y-0">
              {hierarchy!.map((group) => (
                <TreeRow
                  key={group.id}
                  group={group}
                  level={0}
                  expandedIds={expandedIds}
                  toggleExpanded={toggleExpanded}
                  onEdit={setEditGroup}
                  onDelete={setDeleteGroup}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Group Dialog */}
      <GroupFormDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        title="Add Account Group"
        description="Create a new account group in the hierarchy."
        defaultValues={{
          name: "",
          code: "",
          parentGroupId: null,
          nature: "Asset",
          affectsGrossProfit: false,
          isBankGroup: false,
          sortOrder: 0,
        }}
        allGroups={flatGroups || []}
        onSubmit={(values) => createMutation.mutate(values)}
        isPending={createMutation.isPending}
      />

      {/* Edit Group Dialog */}
      {editGroup && (
        <GroupFormDialog
          open={!!editGroup}
          onOpenChange={(open) => !open && setEditGroup(null)}
          title="Edit Account Group"
          description={`Edit the "${editGroup.name}" account group.`}
          defaultValues={{
            name: editGroup.name,
            code: editGroup.code,
            parentGroupId: editGroup.parentGroupId,
            nature: editGroup.nature,
            affectsGrossProfit: editGroup.affectsGrossProfit,
            isBankGroup: editGroup.isBankGroup || false,
            sortOrder: editGroup.sortOrder,
          }}
          allGroups={(flatGroups || []).filter((g) => g.id !== editGroup.id)}
          onSubmit={(values) => updateMutation.mutate({ id: editGroup.id, data: values })}
          isPending={updateMutation.isPending}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteGroup} onOpenChange={(open) => !open && setDeleteGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account Group</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteGroup?.name}"? This action cannot be undone.
              {deleteGroup?.children && deleteGroup.children.length > 0 && (
                <span className="block mt-2 text-red-600 font-medium">
                  This group has child groups and cannot be deleted.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteGroup(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteGroup && deleteMutation.mutate(deleteGroup.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardContainer>
  );
}