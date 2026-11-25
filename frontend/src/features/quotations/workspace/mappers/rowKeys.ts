/**
 * Stable React keys for quotation costing rows.
 *
 * Rows used to be keyed by their position, so deleting or inserting a row made the next row inherit
 * the previous row's picker state. `_rowKey` lives only in the browser: it is removed before saving
 * and ignored when checking for unsaved changes.
 */
let counter = 0;

export function newRowKey(): string {
  counter += 1;
  return `row-${Date.now().toString(36)}-${counter}`;
}

type Keyed = { _rowKey?: string };

export function needsRowKeys(rows: Keyed[]): boolean {
  return rows.some((row) => !row._rowKey);
}

/** Returns the same array when every row already has a key (no extra render). */
export function ensureRowKeys<T extends Keyed>(rows: T[]): T[] {
  if (!needsRowKeys(rows)) return rows;
  return rows.map((row) => (row._rowKey ? row : { ...row, _rowKey: newRowKey() }));
}

/** Copy of the row without the browser-only key. */
export function stripRowKey<T extends Keyed>(row: T): Omit<T, "_rowKey"> {
  const copy = { ...row };
  delete copy._rowKey;
  return copy;
}
