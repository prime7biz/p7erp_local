import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import type { PipelineItemOut } from "@/api/client";

interface PipelineCardProps {
  item: PipelineItemOut;
  docTypeBadge: (doc: string) => React.ReactNode;
  formatAmount: (value: string | number | null | undefined) => string;
  moveMenuId: string | null;
  setMoveMenuId: (id: string | null) => void;
  onMoveTo: (item: PipelineItemOut, status: string) => void;
  moving: boolean;
  onDragStartKey: (key: string | null) => void;
}

export function PipelineCard({
  item,
  docTypeBadge,
  formatAmount,
  moveMenuId,
  setMoveMenuId,
  onMoveTo,
  moving,
  onDragStartKey,
}: PipelineCardProps) {
  const menuId = `${item.document_type}-${item.id}`;
  const isOpen = moveMenuId === menuId;
  return (
    <div
      className="rounded-lg border border-border bg-surface-raised p-2.5 shadow-sm"
      draggable={item.next_status_options.length > 0}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", menuId);
        e.dataTransfer.effectAllowed = "move";
        onDragStartKey(menuId);
      }}
      onDragEnd={() => onDragStartKey(null)}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          {docTypeBadge(item.document_type)}
          <Link
            to={item.detail_path}
            className="mt-1 block font-medium text-brand-primary hover:text-brand-primary hover:underline"
          >
            {item.code}
          </Link>
          <p className="mt-0.5 truncate text-xs text-text-secondary" title={item.customer_name}>
            {item.customer_name}
          </p>
          {(item.style_ref || item.style_name) && (
            <p className="truncate text-xs text-text-muted" title={item.style_ref || item.style_name || ""}>
              {item.style_name || item.style_ref}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-1 text-xs text-text-muted">
            {item.quantity != null && <span>Qty: {item.quantity.toLocaleString()}</span>}
            {item.total_amount != null && item.total_amount !== "" && <span>· {formatAmount(item.total_amount)}</span>}
          </div>
        </div>
        {item.next_status_options.length > 0 && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMoveMenuId(isOpen ? null : menuId)}
              disabled={moving}
              className="rounded border border-border-strong p-1 text-text-muted hover:bg-surface-subtle disabled:opacity-50"
              title="Move to next stage"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {isOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised py-1 shadow-lg">
                {item.next_status_options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onMoveTo(item, opt)}
                    className="block w-full px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                  >
                    → {opt.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
