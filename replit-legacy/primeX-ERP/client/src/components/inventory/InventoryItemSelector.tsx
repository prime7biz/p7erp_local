import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronsUpDown, Plus, Package, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface SelectedItem {
  itemId: number;
  itemName: string;
  itemCode: string;
  unit: string;
}

interface InventoryItemSelectorProps {
  value: SelectedItem | null;
  onChange: (item: SelectedItem | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function InventoryItemSelector({ value, onChange, disabled, placeholder = "Select item..." }: InventoryItemSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: itemsData, isLoading: itemsLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: categoriesData } = useQuery<any[]>({
    queryKey: ["/api/item-categories"],
  });

  const { data: unitsData } = useQuery<any[]>({
    queryKey: ["/api/item-units"],
  });

  const items = itemsData || [];
  const categories = categoriesData || [];
  const units = unitsData || [];

  const filtered = useMemo(() => {
    if (!search) return items.slice(0, 50);
    const q = search.toLowerCase();
    return items.filter((item: any) =>
      item.name?.toLowerCase().includes(q) ||
      item.itemCode?.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [items, search]);

  const getUnitName = (unitId: number) => {
    const unit = units.find((u: any) => u.id === unitId);
    return unit?.name || unit?.unitCode || "";
  };

  const [newItem, setNewItem] = useState({
    name: "",
    itemCode: "",
    categoryId: "",
    unitId: "",
    openingStock: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("/api/items", "POST", data);
      return res.json();
    },
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      const unitName = getUnitName(created.unitId);
      onChange({
        itemId: created.id,
        itemName: created.name,
        itemCode: created.itemCode,
        unit: unitName,
      });
      setCreateDialogOpen(false);
      setNewItem({ name: "", itemCode: "", categoryId: "", unitId: "", openingStock: "" });
      toast({ title: "Item created", description: `${created.name} has been created and selected.` });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create item", variant: "destructive" });
    },
  });

  const handleCreateItem = () => {
    if (!newItem.name || !newItem.itemCode || !newItem.categoryId || !newItem.unitId) {
      toast({ title: "Validation Error", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name: newItem.name,
      itemCode: newItem.itemCode,
      categoryId: parseInt(newItem.categoryId),
      unitId: parseInt(newItem.unitId),
      type: "standard",
      openingStock: newItem.openingStock ? parseFloat(newItem.openingStock) : undefined,
    });
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} disabled={disabled}
            className="w-full justify-between font-normal">
            {value ? `${value.itemCode} — ${value.itemName}` : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search items by name or code..." value={search} onValueChange={setSearch} />
            <CommandList>
              {itemsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Loading items...</span>
                </div>
              ) : (
                <>
                  <CommandEmpty>No items found.</CommandEmpty>
                  <CommandGroup>
                    {filtered.map((item: any) => {
                      const unitName = getUnitName(item.unitId);
                      const isSelected = value?.itemId === item.id;
                      return (
                        <CommandItem
                          key={item.id}
                          value={String(item.id)}
                          onSelect={() => {
                            if (isSelected) {
                              onChange(null);
                            } else {
                              onChange({
                                itemId: item.id,
                                itemName: item.name,
                                itemCode: item.itemCode,
                                unit: unitName,
                              });
                            }
                            setOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="font-medium truncate">{item.itemCode} — {item.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {unitName && `Unit: ${unitName}`}
                              {item.currentStock !== undefined && item.currentStock !== null
                                ? ` • Stock: ${item.currentStock}`
                                : ""}
                            </span>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        setOpen(false);
                        setCreateDialogOpen(true);
                      }}
                      className="text-primary"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      <span className="font-medium">Create New Item</span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Create New Item
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="item-name">Item Name *</Label>
              <Input
                id="item-name"
                value={newItem.name}
                onChange={(e) => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Cotton Fabric 60s"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item-code">Item Code *</Label>
              <Input
                id="item-code"
                value={newItem.itemCode}
                onChange={(e) => setNewItem(prev => ({ ...prev, itemCode: e.target.value }))}
                placeholder="e.g. FAB-001"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item-category">Category *</Label>
              <Select
                value={newItem.categoryId}
                onValueChange={(val) => setNewItem(prev => ({ ...prev, categoryId: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat: any) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="item-unit">Unit *</Label>
              <Select
                value={newItem.unitId}
                onValueChange={(val) => setNewItem(prev => ({ ...prev, unitId: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {units.map((unit: any) => (
                    <SelectItem key={unit.id} value={String(unit.id)}>
                      {unit.name} ({unit.unitCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="opening-stock">Opening Stock</Label>
              <Input
                id="opening-stock"
                type="number"
                value={newItem.openingStock}
                onChange={(e) => setNewItem(prev => ({ ...prev, openingStock: e.target.value }))}
                placeholder="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateItem} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create & Select
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}