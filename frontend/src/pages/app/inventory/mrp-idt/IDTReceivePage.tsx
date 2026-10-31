import { useCallback, useEffect, useState } from "react";
import { api, type InterDepartmentTransferResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function IDTReceivePage() {
  const [rows, setRows] = useState<InterDepartmentTransferResponse[]>([]);
  const [error, setError] = useState("");
  const [qty, setQty] = useState<Record<number, string>>({});
  const [batch, setBatch] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      setError("");
      const all = await api.listInterDepartmentTransfers({ status: "ISSUED" });
      const partial = await api.listInterDepartmentTransfers({ status: "RECEIVED_PARTIALLY" });
      setRows([...all, ...partial]);
    } catch (e) {
      logApiError("IDTReceivePage.load", e);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function receive(id: number) {
    const received = qty[id];
    if (!received) {
      setError("Enter received qty");
      return;
    }
    try {
      setError("");
      await api.receiveInterDepartmentTransfer(id, {
        target_qty_received: received,
        target_batch_number: batch[id] || undefined,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Receive IDT"
        description="Confirm converted output; process loss is calculated automatically"
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      <div className="space-y-3">
        {rows.map((r) => {
          const issued = Number(r.source_qty_issued);
          const recv = Number(qty[r.id] || 0);
          const lossPct =
            issued > 0 && qty[r.id] ? (((issued - recv) / issued) * 100).toFixed(2) : null;
          const std = r.standard_process_loss_percent;
          const over = lossPct != null && std != null && Number(lossPct) > Number(std);
          return (
            <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="font-medium text-sm">
                {r.idt_number} | {r.process_name} | item {r.source_item_id} {r.source_qty_issued}{" "}
                {r.source_qty_unit} → item {r.target_item_id}
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  Actual received
                  <input
                    className="mt-1 block w-32 rounded-lg border border-gray-300 px-2 py-1.5"
                    value={qty[r.id] ?? ""}
                    onChange={(e) => setQty({ ...qty, [r.id]: e.target.value })}
                  />
                </label>
                <label className="text-sm">
                  Batch number
                  <input
                    className="mt-1 block w-40 rounded-lg border border-gray-300 px-2 py-1.5"
                    placeholder="auto"
                    value={batch[r.id] ?? ""}
                    onChange={(e) => setBatch({ ...batch, [r.id]: e.target.value })}
                  />
                </label>
                {lossPct != null ? (
                  <p className={`text-sm ${over ? "text-red-600" : "text-gray-600"}`}>
                    Process loss: {lossPct}%
                    {std != null ? ` (vs standard ${std}%)` : ""}
                    {over ? " ⚠" : ""}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void receive(r.id)}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-700"
                >
                  Confirm receipt
                </button>
              </div>
            </div>
          );
        })}
        {!rows.length ? (
          <p className="text-sm text-gray-500">No open IDTs to receive.</p>
        ) : null}
      </div>
    </div>
  );
}
