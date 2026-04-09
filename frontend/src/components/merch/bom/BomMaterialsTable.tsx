import { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { OrderDrivenBomLine } from "@/api/client";
import { BomVarianceBadge } from "./BomVarianceBadge";

function procBadge(status: string) {
  const s = status.toUpperCase();
  if (s === "FULLY_RECEIVED") return "bg-status-success-subtle text-status-success-foreground";
  if (s === "PARTIALLY_RECEIVED") return "bg-status-info-subtle text-status-info-foreground";
  if (s === "PO_APPROVED" || s === "PO_DRAFT") return "bg-status-warning-subtle text-status-warning-foreground";
  return "bg-surface-subtle text-text-muted";
}

function fmt(n: number | null | undefined, d = 3) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

export function BomMaterialsTable({
  lines,
  bomStatus,
  quotationId,
  onEdit,
  onCreatePo,
  onViewPos,
  onDelete,
}: {
  lines: OrderDrivenBomLine[];
  bomStatus: string;
  quotationId: number | null;
  onEdit: (line: OrderDrivenBomLine) => void;
  onCreatePo: (line: OrderDrivenBomLine) => void;
  onViewPos: (line: OrderDrivenBomLine) => void;
  onDelete: (line: OrderDrivenBomLine) => void;
}) {
  const st = (bomStatus || "DRAFT").toUpperCase();
  const isDraft = st === "DRAFT";
  const canPo = st === "APPROVED" || st === "FROZEN";
  const [openRow, setOpenRow] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpenRow(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (lines.length === 0) {
    return <p className="text-sm text-text-muted">No material lines.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="min-w-[1200px] w-full text-left text-xs">
        <thead className="sticky top-0 z-[1] border-b border-border bg-surface-subtle text-text-muted">
          <tr>
            <th className="px-2 py-2">Item / desc</th>
            <th className="px-2 py-2">Type</th>
            <th className="px-2 py-2">Quoted /u</th>
            <th className="px-2 py-2">BOM net /u</th>
            <th className="px-2 py-2">Wast %</th>
            <th className="px-2 py-2">Loss %</th>
            <th className="px-2 py-2">Gross /u</th>
            <th className="px-2 py-2">Req gross</th>
            <th className="px-2 py-2">Exp. price</th>
            <th className="px-2 py-2">BOM cost</th>
            <th className="px-2 py-2">Δ cons %</th>
            <th className="px-2 py-2">Δ price %</th>
            <th className="px-2 py-2">PO status</th>
            <th className="px-2 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const cVar = line.consumption_variance_pct;
            const pVar = line.price_variance_pct;
            const warn =
              (cVar != null && Math.abs(cVar) > 5) || (pVar != null && Math.abs(pVar) > 5);
            return (
              <tr
                key={line.id}
                className={`border-b border-border-subtle ${warn ? "bg-status-warning-subtle/30" : ""}`}
              >
                <td className="px-2 py-1.5 text-text-primary">
                  <div className="font-medium">{line.item_code_snapshot || line.item_code || "—"}</div>
                  <div className="text-text-muted">{line.description_snapshot || line.description || ""}</div>
                </td>
                <td className="px-2 py-1.5">{line.material_type || line.category}</td>
                <td className="px-2 py-1.5">{fmt(line.quoted_consumption_per_unit, 4)}</td>
                <td className="px-2 py-1.5">{fmt(line.bom_net_consumption_per_unit, 4)}</td>
                <td className="px-2 py-1.5">{line.wastage_pct ?? "—"}</td>
                <td className="px-2 py-1.5">{fmt(line.process_loss_pct, 2)}</td>
                <td className="px-2 py-1.5">{fmt(line.bom_gross_consumption_per_unit, 4)}</td>
                <td className="px-2 py-1.5">{fmt(line.required_gross_qty, 3)}</td>
                <td className="px-2 py-1.5">{fmt(line.bom_expected_unit_price, 4)}</td>
                <td className="px-2 py-1.5">{fmt(line.bom_expected_total_cost, 2)}</td>
                <td className="px-2 py-1.5">
                  <BomVarianceBadge variancePct={cVar} />
                </td>
                <td className="px-2 py-1.5">
                  <BomVarianceBadge variancePct={pVar} />
                </td>
                <td className="px-2 py-1.5">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${procBadge(line.procurement_status)}`}>
                    {line.procurement_status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right relative">
                  <div ref={openRow === line.id ? menuRef : undefined} className="relative inline-block text-left">
                  <button
                    type="button"
                    className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    onClick={() => setOpenRow((id) => (id === line.id ? null : line.id))}
                  >
                    Actions
                  </button>
                  {openRow === line.id && (
                    <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                      <button
                        type="button"
                        disabled={!isDraft}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                        onClick={() => {
                          setOpenRow(null);
                          onEdit(line);
                        }}
                      >
                        Edit line
                      </button>
                      {quotationId && line.quotation_line_id ? (
                        <Link
                          to={`/app/quotations?quotationId=${quotationId}`}
                          className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => setOpenRow(null)}
                        >
                          Quotation source
                        </Link>
                      ) : (
                        <span className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-400">No quotation line</span>
                      )}
                      <button
                        type="button"
                        disabled={!canPo || !line.item_id}
                        title={!canPo ? "Approve BOM first" : !line.item_id ? "Link inventory item" : undefined}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                        onClick={() => {
                          setOpenRow(null);
                          onCreatePo(line);
                        }}
                      >
                        Create PO
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                        onClick={() => {
                          setOpenRow(null);
                          onViewPos(line);
                        }}
                      >
                        View linked POs
                      </button>
                      <button
                        type="button"
                        disabled={!isDraft}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                        onClick={() => {
                          setOpenRow(null);
                          void onDelete(line);
                        }}
                      >
                        Delete line
                      </button>
                    </div>
                  )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
