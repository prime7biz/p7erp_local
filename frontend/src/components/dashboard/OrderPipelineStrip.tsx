import { memo } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type PipelineNode = {
  id: string;
  label: string;
  count: number;
  href?: string;
};

const DEFAULT_NODES: { id: string; label: string; match: string[] }[] = [
  { id: "inquiry", label: "Inquiry", match: ["INQUIRY", "LEAD"] },
  { id: "quote", label: "Quote", match: ["QUOTED", "QUOTATION"] },
  { id: "order", label: "Order", match: ["NEW", "DRAFT", "CONFIRMED"] },
  { id: "bom", label: "BOM", match: ["BOM"] },
  { id: "po", label: "PO", match: ["PO", "PROCUREMENT"] },
  { id: "grn", label: "GRN", match: ["GRN", "RECEIVED"] },
  { id: "cut", label: "Cut", match: ["CUTTING", "CUT"] },
  { id: "sew", label: "Sew", match: ["SEWING", "IN_PROGRESS", "PRODUCTION"] },
  { id: "qc", label: "QC", match: ["QC", "QUALITY"] },
  { id: "pack", label: "Pack", match: ["PACKING", "PACKED"] },
  { id: "ship", label: "Ship", match: ["SHIPPED", "DISPATCH"] },
  { id: "done", label: "Done", match: ["COMPLETED", "CLOSED", "DELIVERED"] },
];

type Props = {
  /** Status cards from dashboard order breakdown */
  statusCards?: { label: string; value: number; status?: string }[];
  className?: string;
};

function countForNode(
  node: (typeof DEFAULT_NODES)[number],
  statusCards: { label: string; value: number; status?: string }[],
): number {
  return statusCards.reduce((sum, card) => {
    const key = `${card.status || ""} ${card.label}`.toUpperCase();
    if (node.match.some((m) => key.includes(m))) return sum + (card.value || 0);
    return sum;
  }, 0);
}

/**
 * Horizontal 12-node order execution strip for the home dashboard.
 */
function OrderPipelineStripInner({ statusCards = [], className }: Props) {
  const nodes: PipelineNode[] = DEFAULT_NODES.map((n) => ({
    id: n.id,
    label: n.label,
    count: countForNode(n, statusCards),
    href: "/app/orders",
  }));
  const max = Math.max(1, ...nodes.map((n) => n.count));

  return (
    <div className={cn("w-full overflow-x-auto pb-1", className)}>
      <ol className="flex min-w-[720px] items-stretch gap-0">
        {nodes.map((node, idx) => {
          const intensity = node.count / max;
          return (
            <li key={node.id} className="relative flex flex-1 flex-col items-center">
              {idx < nodes.length - 1 ? (
                <span
                  className="absolute left-1/2 top-4 h-0.5 w-full bg-border"
                  aria-hidden
                />
              ) : null}
              <Link
                to={node.href || "/app/orders"}
                className="relative z-[1] flex w-full flex-col items-center gap-1 px-0.5"
                title={`${node.label}: ${node.count}`}
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 text-[11px] font-bold tabular-nums transition-colors"
                  style={{
                    borderColor:
                      node.count > 0
                        ? "var(--color-brand-primary)"
                        : "var(--color-border-strong)",
                    background:
                      node.count > 0
                        ? `color-mix(in srgb, var(--color-brand-primary) ${Math.round(20 + intensity * 50)}%, white)`
                        : "var(--color-surface-raised)",
                    color:
                      node.count > 0
                        ? "var(--color-brand-pressed)"
                        : "var(--color-text-muted)",
                  }}
                >
                  {node.count}
                </span>
                <span className="text-[10px] font-medium text-text-secondary">{node.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export const OrderPipelineStrip = memo(OrderPipelineStripInner);
