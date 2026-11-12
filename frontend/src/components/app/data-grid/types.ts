import type { ReactNode } from "react";

export type GridDensity = "compact" | "comfortable";

/**
 * Where a column goes on the phone card (only when the grid's `mobileCards` is on):
 * - `title`: first line, usually the code / link to the detail page (always shown)
 * - `subtitle`: small line under the title
 * - `status`: badge at the top right
 * - `detail`: label + value grid on the card (keep to 2–4 columns)
 * - `actions`: the row's combined Actions menu (always shown)
 * - `hidden`: never on the card (still in Table view and exports)
 * Columns without a role are listed under "More details".
 */
export type GridMobileRole = "title" | "subtitle" | "status" | "detail" | "actions" | "hidden";

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
  /** Place on the phone card; see `GridMobileRole`. */
  mobile?: GridMobileRole;
};
