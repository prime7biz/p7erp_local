import type { ReactNode } from "react";

export type GridDensity = "compact" | "comfortable";

/** One column of a shared DataGrid. `value` drives sorting and export; `cell` drives display. */
export type GridColumn<T> = {
  /** Stable id: used for saved views and column visibility, so never rename casually. */
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  value?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  /** Hidden until the user turns it on in "Columns". */
  defaultHidden?: boolean;
  /** Always shown (identity / actions columns). */
  alwaysVisible?: boolean;
  /** Exclude from CSV/XLSX export (e.g. the Actions column). */
  noExport?: boolean;
  enableSorting?: boolean;
};
