import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  X,
  SlidersHorizontal,
  Columns3,
  RotateCcw,
  AlertTriangle,
  Inbox,
} from "lucide-react";

export interface ErpTableColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  sticky?: boolean;
  width?: string;
  render?: (row: T, index: number) => React.ReactNode;
  align?: "left" | "center" | "right";
  isMoney?: boolean;
  isQty?: boolean;
  hidden?: boolean;
  defaultVisible?: boolean;
}

export interface ErpFilter {
  key: string;
  label: string;
  type: "select";
  options: { label: string; value: string }[];
}

export interface ErpRowAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
}

export interface ErpBulkAction<T> {
  label: string;
  icon?: React.ReactNode;
  onClick: (selected: T[]) => void;
  variant?: "default" | "destructive";
}

export interface ErpTableProps<T> {
  columns: ErpTableColumn<T>[];
  data: T[];
  isLoading?: boolean;
  totalCount?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ErpFilter[];
  activeFilters?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  onClearFilters?: () => void;
  rowActions?: (row: T) => ErpRowAction[];
  selectable?: boolean;
  selectedRows?: T[];
  onSelectionChange?: (selected: T[]) => void;
  bulkActions?: ErpBulkAction<T>[];
  onRowClick?: (row: T) => void;
  showTotals?: boolean;
  tableId?: string;
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; onClick: () => void };
  headerActions?: React.ReactNode;
  title?: string;
  description?: string;
}

function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const qtyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function getColumnVisibilityKey(tableId: string) {
  return `erp_table_cols_${tableId}`;
}

function loadColumnVisibility(
  tableId: string | undefined,
  columns: ErpTableColumn<unknown>[]
): Record<string, boolean> {
  const defaults: Record<string, boolean> = {};
  columns.forEach((col) => {
    defaults[col.key] = col.defaultVisible !== false && !col.hidden;
  });

  if (!tableId) return defaults;

  try {
    const stored = localStorage.getItem(getColumnVisibilityKey(tableId));
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, boolean>;
      return { ...defaults, ...parsed };
    }
  } catch {
    // ignore
  }
  return defaults;
}

function saveColumnVisibility(
  tableId: string | undefined,
  visibility: Record<string, boolean>
) {
  if (!tableId) return;
  try {
    localStorage.setItem(
      getColumnVisibilityKey(tableId),
      JSON.stringify(visibility)
    );
  } catch {
    // ignore
  }
}

export function ErpTable<T extends Record<string, unknown>>({
  columns,
  data,
  isLoading = false,
  totalCount,
  page = 1,
  pageSize = 25,
  onPageChange,
  onPageSizeChange,
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search...",
  filters,
  activeFilters = {},
  onFilterChange,
  onClearFilters,
  rowActions,
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  bulkActions = [],
  onRowClick,
  showTotals = false,
  tableId,
  emptyIcon,
  emptyTitle = "No data found",
  emptyDescription = "There are no records to display.",
  emptyAction,
  headerActions,
  title,
  description,
}: ErpTableProps<T>) {
  const [localSearch, setLocalSearch] = useState(searchValue);
  const debouncedSearch = useDebounce(localSearch, 300);
  const [columnVisibility, setColumnVisibility] = useState<
    Record<string, boolean>
  >(() => loadColumnVisibility(tableId, columns as ErpTableColumn<unknown>[]));

  useEffect(() => {
    setLocalSearch(searchValue);
  }, [searchValue]);

  useEffect(() => {
    if (onSearchChange && debouncedSearch !== searchValue) {
      onSearchChange(debouncedSearch);
    }
  }, [debouncedSearch]);

  const toggleColumnVisibility = useCallback(
    (key: string) => {
      setColumnVisibility((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        saveColumnVisibility(tableId, next);
        return next;
      });
    },
    [tableId]
  );

  const resetColumnVisibility = useCallback(() => {
    const defaults: Record<string, boolean> = {};
    columns.forEach((col) => {
      defaults[col.key] = col.defaultVisible !== false && !col.hidden;
    });
    setColumnVisibility(defaults);
    saveColumnVisibility(tableId, defaults);
  }, [columns, tableId]);

  const visibleColumns = useMemo(
    () => columns.filter((col) => columnVisibility[col.key] !== false),
    [columns, columnVisibility]
  );

  const total = totalCount ?? data.length;
  const startRecord = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const isAllSelected =
    selectable && data.length > 0 && selectedRows.length === data.length;
  const isSomeSelected =
    selectable && selectedRows.length > 0 && selectedRows.length < data.length;

  const toggleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    if (isAllSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange([...data]);
    }
  }, [isAllSelected, data, onSelectionChange]);

  const toggleSelectRow = useCallback(
    (row: T) => {
      if (!onSelectionChange) return;
      const exists = selectedRows.includes(row);
      if (exists) {
        onSelectionChange(selectedRows.filter((r) => r !== row));
      } else {
        onSelectionChange([...selectedRows, row]);
      }
    },
    [selectedRows, onSelectionChange]
  );

  const totals = useMemo(() => {
    if (!showTotals) return null;
    const sums: Record<string, number> = {};
    visibleColumns.forEach((col) => {
      if (col.isMoney || col.isQty) {
        sums[col.key] = data.reduce((acc, row) => {
          const val = Number(row[col.key]) || 0;
          return acc + val;
        }, 0);
      }
    });
    return sums;
  }, [showTotals, visibleColumns, data]);

  const activeFilterEntries = Object.entries(activeFilters).filter(
    ([, v]) => v && v !== ""
  );

  const hasHeader =
    title || onSearchChange || filters || headerActions || tableId;

  const colSpan =
    visibleColumns.length +
    (selectable ? 1 : 0) +
    (rowActions ? 1 : 0);

  return (
    <Card className="overflow-hidden">
      {selectable && selectedRows.length > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border-b border-blue-200 px-4 py-2.5">
          <span className="text-sm font-medium text-blue-700">
            {selectedRows.length} item{selectedRows.length !== 1 ? "s" : ""}{" "}
            selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            {bulkActions.map((action, i) => (
              <Button
                key={i}
                size="sm"
                variant={action.variant === "destructive" ? "destructive" : "outline"}
                onClick={() => action.onClick(selectedRows)}
                className="h-7 text-xs"
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onSelectionChange?.([])}
              className="h-7 text-xs text-blue-700"
            >
              Clear selection
            </Button>
          </div>
        </div>
      )}

      {hasHeader && (
        <div className="border-b px-4 py-3 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {(title || description) && (
              <div className="flex-1 min-w-0">
                {title && (
                  <h3 className="text-lg font-semibold leading-tight">
                    {title}
                  </h3>
                )}
                {description && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {description}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto">
              {onSearchChange && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="pl-8 h-9 w-[200px] sm:w-[260px]"
                  />
                  {localSearch && (
                    <button
                      onClick={() => {
                        setLocalSearch("");
                        onSearchChange("");
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}

              {filters && filters.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9">
                      <SlidersHorizontal className="h-4 w-4 mr-1.5" />
                      Filters
                      {activeFilterEntries.length > 0 && (
                        <Badge
                          variant="secondary"
                          className="ml-1.5 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]"
                        >
                          {activeFilterEntries.length}
                        </Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Filter by</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {filters.map((filter) => (
                      <div key={filter.key} className="px-2 py-1.5">
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">
                          {filter.label}
                        </label>
                        <Select
                          value={activeFilters[filter.key] || ""}
                          onValueChange={(val) =>
                            onFilterChange?.(filter.key, val)
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder={`All ${filter.label}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {filter.options.map((opt) => (
                              <SelectItem
                                key={opt.value}
                                value={opt.value}
                                className="text-xs"
                              >
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    {activeFilterEntries.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={onClearFilters}
                          className="text-xs justify-center text-muted-foreground"
                        >
                          Clear all filters
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {tableId && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9">
                      <Columns3 className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {columns
                      .filter((col) => !col.hidden)
                      .map((col) => (
                        <DropdownMenuCheckboxItem
                          key={col.key}
                          checked={columnVisibility[col.key] !== false}
                          onCheckedChange={() =>
                            toggleColumnVisibility(col.key)
                          }
                          onSelect={(e) => e.preventDefault()}
                        >
                          {col.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={resetColumnVisibility}
                      className="text-xs justify-center text-muted-foreground"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reset to default
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {headerActions}
            </div>
          </div>

          {activeFilterEntries.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {activeFilterEntries.map(([key, value]) => {
                const filter = filters?.find((f) => f.key === key);
                const option = filter?.options.find((o) => o.value === value);
                return (
                  <Badge
                    key={key}
                    variant="secondary"
                    className="pl-2 pr-1 py-0.5 text-xs font-normal gap-1"
                  >
                    {filter?.label}: {option?.label || value}
                    <button
                      onClick={() => onFilterChange?.(key, "")}
                      className="ml-0.5 hover:bg-muted rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
              <button
                onClick={onClearFilters}
                className="text-xs text-muted-foreground hover:text-foreground ml-1"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {selectable && (
                <TableHead className="w-[40px] sticky top-0 z-10 bg-white">
                  <Checkbox
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) {
                        (el as unknown as HTMLInputElement).indeterminate =
                          isSomeSelected;
                      }
                    }}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              {visibleColumns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    "sticky top-0 z-10 bg-white whitespace-nowrap",
                    col.sticky && "sticky left-0 z-20 bg-white",
                    col.align === "center" && "text-center",
                    col.align === "right" && "text-right"
                  )}
                  style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                >
                  {col.label}
                </TableHead>
              ))}
              {rowActions && (
                <TableHead className="w-[50px] sticky top-0 z-10 bg-white" />
              )}
            </TableRow>
          </TableHeader>

          {isLoading ? (
            <TableBody>
              {Array.from({ length: 7 }).map((_, rowIdx) => (
                <TableRow key={rowIdx} className="hover:bg-transparent">
                  {selectable && (
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                  )}
                  {visibleColumns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton
                        className={cn(
                          "h-4",
                          col.isMoney || col.isQty ? "w-16" : "w-24"
                        )}
                      />
                    </TableCell>
                  ))}
                  {rowActions && (
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          ) : data.length === 0 ? (
            <TableBody>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colSpan}>
                  <EmptyState
                    icon={emptyIcon}
                    title={emptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          ) : (
            <>
              <TableBody>
                {data.map((row, rowIdx) => {
                  const isSelected = selectedRows.includes(row);
                  return (
                    <TableRow
                      key={rowIdx}
                      data-state={isSelected ? "selected" : undefined}
                      className={cn(
                        "hover:bg-muted/50",
                        onRowClick && "cursor-pointer"
                      )}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (
                          target.closest("[role=checkbox]") ||
                          target.closest("[data-erp-actions]") ||
                          target.closest("button")
                        ) {
                          return;
                        }
                        onRowClick?.(row);
                      }}
                    >
                      {selectable && (
                        <TableCell className="w-[40px]">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectRow(row)}
                            aria-label={`Select row ${rowIdx + 1}`}
                          />
                        </TableCell>
                      )}
                      {visibleColumns.map((col) => (
                        <TableCell
                          key={col.key}
                          className={cn(
                            col.sticky &&
                              "sticky left-0 z-[5] bg-white",
                            col.align === "center" && "text-center",
                            col.align === "right" && "text-right",
                            (col.isMoney || col.isQty) && "tabular-nums"
                          )}
                          style={
                            col.width
                              ? { width: col.width, minWidth: col.width }
                              : undefined
                          }
                        >
                          {col.render
                            ? col.render(row, rowIdx)
                            : (row[col.key] as React.ReactNode) ?? "—"}
                        </TableCell>
                      ))}
                      {rowActions && (
                        <TableCell
                          className="w-[50px]"
                          data-erp-actions="true"
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              {rowActions(row).map((action, i) => (
                                <DropdownMenuItem
                                  key={i}
                                  onClick={action.onClick}
                                  disabled={action.disabled}
                                  className={cn(
                                    action.variant === "destructive" &&
                                      "text-destructive focus:text-destructive"
                                  )}
                                >
                                  {action.icon}
                                  {action.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>

              {showTotals && totals && (
                <TableFooter>
                  <TableRow className="font-semibold bg-muted/30">
                    {selectable && <TableCell />}
                    {visibleColumns.map((col, idx) => (
                      <TableCell
                        key={col.key}
                        className={cn(
                          col.align === "center" && "text-center",
                          col.align === "right" && "text-right",
                          (col.isMoney || col.isQty) && "tabular-nums font-semibold"
                        )}
                      >
                        {col.isMoney && totals[col.key] !== undefined
                          ? numberFormatter.format(totals[col.key])
                          : col.isQty && totals[col.key] !== undefined
                            ? qtyFormatter.format(totals[col.key])
                            : idx === 0
                              ? "Total"
                              : ""}
                      </TableCell>
                    ))}
                    {rowActions && <TableCell />}
                  </TableRow>
                </TableFooter>
              )}
            </>
          )}
        </Table>
      </div>

      {!isLoading && data.length > 0 && (onPageChange || onPageSizeChange) && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Showing {startRecord}–{endRecord} of {total}
          </p>
          <div className="flex items-center gap-3">
            {onPageSizeChange && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  Rows per page
                </span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(val) => onPageSizeChange(Number(val))}
                >
                  <SelectTrigger className="h-8 w-[70px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {onPageChange && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground px-2 whitespace-nowrap">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-200",
  SUBMITTED: "bg-blue-100 text-blue-700 border-blue-200",
  APPROVED: "bg-purple-100 text-purple-700 border-purple-200",
  POSTED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ACTIVE: "bg-emerald-100 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-100 text-red-700 border-red-200",
  SUSPENDED: "bg-orange-100 text-orange-700 border-orange-200",
  ON_HOLD: "bg-orange-100 text-orange-700 border-orange-200",
  CLOSED: "bg-teal-100 text-teal-700 border-teal-200",
  COMPLETED: "bg-teal-100 text-teal-700 border-teal-200",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const normalized = status?.toUpperCase().replace(/[\s-]+/g, "_") || "";
  const colors =
    STATUS_COLORS[normalized] || "bg-gray-100 text-gray-700 border-gray-200";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        colors,
        className
      )}
    >
      {status}
    </span>
  );
}

export function EmptyState({
  icon,
  title = "No data found",
  description = "There are no records to display.",
  action,
  className,
}: {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      <div className="text-muted-foreground mb-3">
        {icon || <Inbox className="h-12 w-12 mx-auto opacity-40" />}
      </div>
      <h4 className="text-base font-medium text-foreground mb-1">{title}</h4>
      <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      {action && (
        <Button onClick={action.onClick} className="mt-4" size="sm">
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title = "Are you sure?",
  description = "This action cannot be undone.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  variant = "default",
  isLoading = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: "default" | "destructive";
  isLoading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {variant === "destructive" && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            )}
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-1">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => {
              onCancel?.();
              onOpenChange(false);
            }}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Processing..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
