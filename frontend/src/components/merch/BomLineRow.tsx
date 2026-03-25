import type React from "react";
import type { BomDetailResponse } from "@/api/client";

interface BomLineRowProps {
  line: BomDetailResponse["items"][number];
  requiredQty: number;
  estimatedCost: number;
  isGovernedBom: boolean;
  isActionsOpen: boolean;
  actionsRef: React.RefObject<HTMLDivElement>;
  onToggleActions: (lineId: number) => void;
  onEdit: (lineId: number) => void;
  onDelete: (lineId: number) => Promise<void>;
  formatNumber: (value: number, fractionDigits?: number) => string;
}

export function BomLineRow({
  line,
  requiredQty,
  estimatedCost,
  isGovernedBom,
  isActionsOpen,
  actionsRef,
  onToggleActions,
  onEdit,
  onDelete,
  formatNumber,
}: BomLineRowProps) {
  return (
    <tr className="border-b border-border-subtle last:border-0">
      <td className="px-3 py-2 text-text-primary">
        {line.item_id != null ? <span title={`Item #${line.item_id}`}>{line.item_code ?? line.description ?? "—"}</span> : line.description || line.item_code || "—"}
      </td>
      <td className="px-3 py-2 text-text-secondary">{line.category ?? "—"}</td>
      <td className="px-3 py-2 text-text-secondary">{line.uom ?? "—"}</td>
      <td className="px-3 py-2 text-text-secondary">{line.base_consumption}</td>
      <td className="px-3 py-2 text-text-secondary">{line.wastage_pct ?? "—"}</td>
      <td className="px-3 py-2 text-text-secondary">{formatNumber(requiredQty, 4)}</td>
      <td className="px-3 py-2 text-text-secondary">{line.item_id != null ? formatNumber(estimatedCost, 2) : "—"}</td>
      <td className="px-3 py-2 text-right">
        <div className="relative inline-block text-left" ref={isActionsOpen ? actionsRef : undefined}>
          <button
            type="button"
            disabled={isGovernedBom}
            onClick={() => onToggleActions(line.id)}
            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Actions
          </button>
          {isActionsOpen && !isGovernedBom && (
            <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
              <button
                type="button"
                onClick={() => onEdit(line.id)}
                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void onDelete(line.id)}
                className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
