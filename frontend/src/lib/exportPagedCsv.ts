/**
 * Walk a paginated API that returns rows + total count (X-Total-Count or body total)
 * and build a CSV string. Guards against infinite loops and inconsistent totals.
 */

export type PagedFetchResult<Row> = { rows: Row[]; total: number | null };

export interface ExportPagedCsvOptions<Row> {
  /** Called with offset; must return rows and authoritative total when available. */
  fetchPage: (offset: number, limit: number) => Promise<PagedFetchResult<Row>>;
  chunkSize: number;
  /** Max rows to export (safety cap). */
  maxRows: number;
  /** Max loop iterations (each iteration should advance offset). */
  maxIterations: number;
  headers: string[];
  rowToCells: (row: Row) => string[];
  escapeCell?: (value: string) => string;
}

export interface ExportPagedCsvOutcome {
  csv: string;
  rowCount: number;
  truncated: boolean;
  truncationReason: string | null;
  warnings: string[];
}

function defaultEscapeCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Export rows to CSV by paging forward. Stops when a page is short, offset reaches total, or a guard trips.
 */
export async function exportPagedCsv<Row>(options: ExportPagedCsvOptions<Row>): Promise<ExportPagedCsvOutcome> {
  const {
    fetchPage,
    chunkSize,
    maxRows,
    maxIterations,
    headers,
    rowToCells,
    escapeCell = defaultEscapeCell,
  } = options;

  const lines: string[] = [headers.join(",")];
  const warnings: string[] = [];
  let offset = 0;
  let totalFromHeader: number | null = null;
  let iterations = 0;
  let rowCount = 0;
  let truncated = false;
  let truncationReason: string | null = null;
  let lastFingerprint: string | null = null;
  let sameFingerprintStreak = 0;
  /** True if the last fetched page was full-sized (may indicate more rows when total is unknown). */
  let lastPageWasFull = false;

  while (iterations < maxIterations && rowCount < maxRows) {
    iterations += 1;
    const { rows, total } = await fetchPage(offset, chunkSize);

    if (total != null && Number.isFinite(total)) {
      if (totalFromHeader == null) {
        totalFromHeader = total;
      } else if (totalFromHeader !== total) {
        warnings.push("Total count changed while exporting; stopping to avoid inconsistent file.");
        truncationReason = "Inconsistent total count from server.";
        truncated = true;
        break;
      }
    }

    if (rows.length === 0) {
      lastPageWasFull = false;
      if (totalFromHeader != null && offset < totalFromHeader && rowCount === 0) {
        warnings.push("Empty page but total suggests more rows; stopping.");
        truncationReason = "Empty page while export expected more rows.";
        truncated = true;
      }
      break;
    }

    lastPageWasFull = rows.length >= chunkSize;

    const fp = rows.map((r) => JSON.stringify(r)).join("|").slice(0, 2000);
    if (fp === lastFingerprint) {
      sameFingerprintStreak += 1;
      if (sameFingerprintStreak >= 2) {
        warnings.push("Detected repeated page content; stopping to prevent a loop.");
        truncationReason = "Repeated page detected.";
        truncated = true;
        break;
      }
    } else {
      sameFingerprintStreak = 0;
      lastFingerprint = fp;
    }

    for (const r of rows) {
      if (rowCount >= maxRows) {
        truncated = true;
        truncationReason = `Export limited to ${maxRows} rows (safety cap).`;
        break;
      }
      const cells = rowToCells(r).map((c) => escapeCell(String(c)));
      lines.push(cells.join(","));
      rowCount += 1;
    }

    if (rowCount >= maxRows) break;

    if (rows.length < chunkSize) break;

    const nextOffset = offset + rows.length;
    if (nextOffset === offset) {
      warnings.push("Offset did not advance; stopping.");
      truncationReason = "Offset stuck.";
      truncated = true;
      break;
    }
    offset = nextOffset;

    if (totalFromHeader != null && offset >= totalFromHeader) break;
  }

  if (!truncated && iterations >= maxIterations) {
    if (totalFromHeader != null) {
      if (rowCount < totalFromHeader) {
        truncated = true;
        truncationReason = `Export stopped after ${maxIterations} steps; file may be incomplete.`;
        warnings.push(truncationReason);
      }
    } else if (lastPageWasFull) {
      truncated = true;
      truncationReason = `Export stopped after ${maxIterations} steps (safety cap).`;
      warnings.push(truncationReason);
    }
  }

  return {
    csv: lines.join("\n"),
    rowCount,
    truncated,
    truncationReason,
    warnings,
  };
}
