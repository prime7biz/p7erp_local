import type { ReactNode } from "react";
import type { SheetNode } from "@/api/financeStatements";
import { isOpeningDifferenceRow, OPENING_DIFFERENCE_ROW_CLASS } from "./openingDifference";
import { formatCell, formatIndian } from "./statementFormat";

export interface FlatSheetRow {
  key: string;
  depth: number;
  node: SheetNode;
}

/** Tree -> list in display order (parent first). */
export function flattenSheet(nodes: SheetNode[], depth = 0, prefix = ""): FlatSheetRow[] {
  const out: FlatSheetRow[] = [];
  nodes.forEach((node, index) => {
    const key = `${prefix}${index}`;
    out.push({ key, depth, node });
    out.push(...flattenSheet(node.children ?? [], depth + 1, `${key}.`));
  });
  return out;
}

interface Props {
  /** Column heading, e.g. "Liabilities", "Assets", "Particulars (Dr)". */
  title: string;
  nodes: SheetNode[];
  /** Total line under the side (outer column). */
  totalLabel: string;
  total: string;
  /** Click a group / ledger name to drill down. */
  onDrill?: (node: SheetNode) => void;
  emptyText?: string;
  footer?: ReactNode;
}

/**
 * One side of a two-sided Tally statement. Ledgers show their amount in the inner column and
 * groups (and results such as "Gross Profit c/o") in the outer column.
 */
export function SheetSide({ title, nodes, totalLabel, total, onDrill, emptyText = "Nothing on this side.", footer }: Props) {
  const rows = flattenSheet(nodes);
  return (
    <section className="statement-sheet print-card overflow-x-auto rounded-xl border border-border bg-surface-raised">
      <table className="min-w-full text-sm">
        <thead className="bg-surface-subtle">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-text-muted" aria-label="Ledger amount" />
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-text-muted" aria-label="Group amount" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-6 text-center text-text-muted">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map(({ key, depth, node }) => {
              const openingDiff = isOpeningDifferenceRow(node);
              const drillable =
                !!onDrill && !openingDiff && node.id != null && (node.row_type === "group" || node.row_type === "ledger");
              const strong = node.row_type === "primary" || node.row_type === "result";
              const tone = openingDiff ? OPENING_DIFFERENCE_ROW_CLASS : "text-text-primary";
              return (
                <tr
                  key={key}
                  data-testid={openingDiff ? "opening-difference-row" : undefined}
                  className={`border-t border-border-subtle ${node.row_type === "primary" ? "bg-surface-subtle/50" : ""}`}
                >
                  <td className="px-3 py-1.5" style={{ paddingLeft: 12 + depth * 16 }}>
                    {drillable ? (
                      <button type="button" className="text-left text-brand-primary hover:underline print:text-inherit" onClick={() => onDrill?.(node)}>
                        {node.name}
                      </button>
                    ) : (
                      <span className={`${strong ? "font-semibold" : ""} ${node.row_type === "result" ? "italic" : ""} ${tone}`}>
                        {node.name}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-text-secondary">{formatCell(node.inner_amount)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${strong ? "font-semibold" : ""} ${tone}`}>
                    {formatCell(node.outer_amount)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border-strong bg-surface-subtle font-semibold">
            <td className="px-3 py-2">{totalLabel}</td>
            <td />
            <td className="px-3 py-2 text-right tabular-nums" data-testid={`total-${totalLabel}`}>
              {formatIndian(total)}
            </td>
          </tr>
        </tfoot>
      </table>
      {footer}
    </section>
  );
}
