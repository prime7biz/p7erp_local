/**
 * The HR list table (search, sorting, paging, phone cards, status chips, hybrid row buttons)
 * with the simple column shape the Bangladesh HR screens already use.
 */
import type { ReactNode } from "react";
import { HrDataTable, type HrDataTableLabels } from "@/components/hr/kit/HrDataTable";
import type { CellValue, HrTableColumn } from "@/components/hr/kit/tableLogic";
import { toRowActions, type KitAction } from "./bdKitActions";
import { useAuth } from "@/context/AuthContext";
import type { ListPageSize } from "@/hooks/useListPagination";
import { canExportHrData } from "@/lib/roles";

export interface KitColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
  /** Plain value for search, sorting and CSV. Columns without it are display-only. */
  value?: (row: T) => CellValue;
  align?: "left" | "right";
  hideOnMobile?: boolean;
}

export function KitTable<T>({
  rows,
  columns,
  rowKey,
  empty,
  emptyHint,
  loading,
  error,
  onRetry,
  onRefresh,
  actions,
  statusOf,
  exportFileName,
  searchPlaceholder,
  toolbar,
  defaultPageSize = 20,
  labels,
}: {
  rows: T[];
  columns: KitColumn<T>[];
  rowKey: (row: T) => string | number;
  empty: string;
  emptyHint?: string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onRefresh?: () => void;
  actions?: (row: T) => KitAction[];
  statusOf?: (row: T) => string | null | undefined;
  /** Shows Export CSV (for HR manager roles only). Leave out on money / legal lists. */
  exportFileName?: string;
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  defaultPageSize?: ListPageSize;
  /** Translated table texts (screens with a Bangla switch). */
  labels?: Partial<HrDataTableLabels>;
}) {
  const { me } = useAuth();
  const kitColumns: HrTableColumn<T>[] = columns.map((c, i) => ({
    key: `${i}-${c.header}`,
    header: c.header,
    render: c.cell,
    value: c.value,
    align: c.align,
    hideOnMobile: c.hideOnMobile,
  }));
  return (
    <HrDataTable<T>
      rows={rows}
      rowKey={rowKey}
      columns={kitColumns}
      loading={loading}
      error={error}
      onRetry={onRetry}
      onRefresh={onRefresh}
      emptyTitle={empty}
      emptyHint={emptyHint}
      searchPlaceholder={searchPlaceholder}
      rowActions={actions ? (row) => toRowActions(actions(row)) : undefined}
      statusOf={statusOf}
      exportFileName={exportFileName}
      canExport={Boolean(exportFileName) && canExportHrData(me?.role_name)}
      toolbar={toolbar}
      defaultPageSize={defaultPageSize}
      labels={labels}
    />
  );
}
