import type { JobWorkContractDetail, JobWorkDelivery } from "@/api/jobWork";
import { jobWorkApi } from "@/api/jobWork";

type Mode = "production" | "delivery";

type Props = {
  mode: Mode;
  detail: JobWorkContractDetail;
  deliveries: JobWorkDelivery[];
  prodQty: Record<number, string>;
  delQty: Record<number, string>;
  rejQty: Record<number, string>;
  saving: boolean;
  onProdQty: (id: number, qty: string) => void;
  onDelQty: (id: number, qty: string) => void;
  onRejQty: (id: number, qty: string) => void;
  onAction: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
};

/** Produced qty (Phase 1 manual) and job-work delivery notes (no stock / COGS). */
export function JobWorkDeliverablesPanel({
  mode,
  detail,
  deliveries,
  prodQty,
  delQty,
  rejQty,
  saving,
  onProdQty,
  onDelQty,
  onRejQty,
  onAction,
}: Props) {
  if (mode === "production") {
    return (
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        {detail.deliverables.map((d) => (
          <div key={d.id} className="flex flex-wrap items-end gap-2 border-b border-gray-100 pb-3 text-sm">
            <div className="min-w-[180px]">
              <p className="font-medium">
                {[d.style_ref, d.color, d.size].filter(Boolean).join(" / ") || `Line #${d.id}`}
              </p>
              <p className="text-xs text-gray-500">
                Ordered {d.qty_ordered} · Delivered {d.qty_delivered}
              </p>
            </div>
            <label>
              Produced
              <input
                value={prodQty[d.id] ?? d.qty_produced}
                onChange={(e) => onProdQty(d.id, e.target.value)}
                className="ml-2 rounded-lg border border-gray-300 px-2 py-1"
              />
            </label>
          </div>
        ))}
        {detail.status !== "DRAFT" && detail.status !== "CLOSED" ? (
          <button
            type="button"
            disabled={saving}
            className="rounded-lg bg-brand-primary px-3 py-2 text-sm text-white"
            onClick={() =>
              void onAction(
                () =>
                  jobWorkApi.produce(
                    detail.id,
                    detail.deliverables.map((d) => ({
                      deliverable_id: d.id,
                      qty_produced: prodQty[d.id] ?? d.qty_produced,
                    })),
                  ),
                "Production saved",
              )
            }
          >
            Save produced qty
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {detail.status !== "DRAFT" && detail.status !== "CLOSED" ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium">Record delivery (accepted = delivered − rejected)</p>
          {detail.deliverables.map((d) => (
            <div key={d.id} className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-[140px]">
                {[d.style_ref, d.color, d.size].filter(Boolean).join(" / ") || `#${d.id}`}
              </span>
              <input
                value={delQty[d.id] ?? ""}
                onChange={(e) => onDelQty(d.id, e.target.value)}
                placeholder="Delivered"
                className="w-28 rounded-lg border border-gray-300 px-2 py-1"
              />
              <input
                value={rejQty[d.id] ?? "0"}
                onChange={(e) => onRejQty(d.id, e.target.value)}
                placeholder="Rejected"
                className="w-28 rounded-lg border border-gray-300 px-2 py-1"
              />
            </div>
          ))}
          <button
            type="button"
            disabled={saving}
            className="mt-2 rounded-lg bg-brand-primary px-3 py-2 text-sm text-white"
            onClick={() =>
              void onAction(
                () =>
                  jobWorkApi.createDelivery(detail.id, {
                    lines: detail.deliverables
                      .filter((d) => (delQty[d.id] || "0") !== "0" && (delQty[d.id] || "").trim() !== "")
                      .map((d) => ({
                        deliverable_id: d.id,
                        qty_delivered: delQty[d.id] || "0",
                        qty_rejected: rejQty[d.id] || "0",
                      })),
                  }),
                "Delivery recorded",
              )
            }
          >
            Save delivery note
          </button>
        </div>
      ) : null}
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
        <p className="font-medium">Deliveries</p>
        {deliveries.length === 0 ? <p className="text-gray-500">None yet</p> : null}
        {deliveries.map((d) => (
          <div key={d.id} className="mt-2 border-t pt-2">
            <p>
              {d.delivery_no} · {d.delivery_date} · accepted {d.qty_accepted} (rejected {d.qty_rejected})
            </p>
            {d.reference_doc ? <p className="text-xs text-gray-500">Ref {d.reference_doc}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
