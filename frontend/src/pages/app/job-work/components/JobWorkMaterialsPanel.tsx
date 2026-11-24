import type { JobWorkContractDetail } from "@/api/jobWork";
import { jobWorkApi } from "@/api/jobWork";

type Props = {
  detail: JobWorkContractDetail;
  matLineId: number;
  matQty: string;
  saving: boolean;
  onMatLineId: (id: number) => void;
  onMatQty: (qty: string) => void;
  onAction: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
};

/** Zero-value customer materials: receive / consume / return (no inventory GL). */
export function JobWorkMaterialsPanel({
  detail,
  matLineId,
  matQty,
  saving,
  onMatLineId,
  onMatQty,
  onAction,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Per pc</th>
              <th className="px-3 py-2">Received</th>
              <th className="px-3 py-2">Consumed</th>
              <th className="px-3 py-2">Returned</th>
              <th className="px-3 py-2">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {detail.materials.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-3 py-2">#{m.item_id}</td>
                <td className="px-3 py-2">{m.consumption_per_unit}</td>
                <td className="px-3 py-2">{m.qty_received}</td>
                <td className="px-3 py-2">{m.qty_consumed}</td>
                <td className="px-3 py-2">{m.qty_returned}</td>
                <td className="px-3 py-2 font-medium">{m.qty_remaining}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail.status !== "DRAFT" && detail.status !== "CLOSED" ? (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-4">
          <label className="text-sm">
            Material line
            <select
              value={matLineId}
              onChange={(e) => onMatLineId(Number(e.target.value))}
              className="mt-1 block rounded-lg border border-gray-300 px-2 py-2"
            >
              {detail.materials.map((m) => (
                <option key={m.id} value={m.id}>
                  #{m.id} item {m.item_id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Qty
            <input
              value={matQty}
              onChange={(e) => onMatQty(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 px-2 py-2"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            className="rounded-lg border px-3 py-2 text-sm"
            onClick={() =>
              void onAction(
                () => jobWorkApi.receiveMaterial(detail.id, { material_id: matLineId, qty: matQty }),
                "Received",
              )
            }
          >
            Receive
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded-lg border px-3 py-2 text-sm"
            onClick={() =>
              void onAction(
                () => jobWorkApi.consumeMaterial(detail.id, { material_id: matLineId, qty: matQty }),
                "Consumed",
              )
            }
          >
            Consume
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded-lg border px-3 py-2 text-sm"
            onClick={() =>
              void onAction(
                () => jobWorkApi.returnMaterial(detail.id, { material_id: matLineId, qty: matQty }),
                "Returned",
              )
            }
          >
            Return unused
          </button>
        </div>
      ) : null}
      <p className="text-xs text-gray-500">
        Customer materials stay on this ledger only — no inventory valuation or GL.
      </p>
    </div>
  );
}
