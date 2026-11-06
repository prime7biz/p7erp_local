import { useCallback, useEffect, useState } from "react";
import { api, type StockSerialRow, type SerialTrace } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { logApiError } from "@/utils/logApiError";

export function SerialTrackingPage() {
  const [rows, setRows] = useState<StockSerialRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [trace, setTrace] = useState<SerialTrace | null>(null);
  const [csvText, setCsvText] = useState("item_id,serial_number,warehouse_id\n");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const latest = useLatestRequest();

  const load = useCallback(async () => {
    const token = latest.begin();
    setError("");
    try {
      const res = await api.listStockSerials({ q: q || undefined, status: status || undefined });
      if (!latest.isCurrent(token)) return;
      setRows(res);
    } catch (e) {
      logApiError("SerialTrackingPage.load", e);
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
    }
  }, [latest, q, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function doTrace(sn: string) {
    setError("");
    try {
      setTrace(await api.traceStockSerial(sn));
    } catch (e) {
      setError((e as Error).message);
      setTrace(null);
    }
  }

  async function importCsv() {
    setError("");
    setSuccess("");
    try {
      const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) {
        setError("CSV needs a header and at least one data row");
        return;
      }
      const headerLine = lines[0];
      if (!headerLine) {
        setError("CSV needs a header and at least one data row");
        return;
      }
      const headers = headerLine.split(",").map((h) => h.trim());
      const dataRows = lines
        .slice(1)
        .map((line) => {
          const cols = line.split(",").map((c) => c.trim());
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => {
            obj[h] = cols[i] ?? "";
          });
          return {
            item_id: Number(obj.item_id),
            serial_number: (obj.serial_number ?? "").trim(),
            warehouse_id: obj.warehouse_id ? Number(obj.warehouse_id) : undefined,
          };
        })
        .filter((r) => r.serial_number && Number.isFinite(r.item_id) && r.item_id > 0);
      if (!dataRows.length) {
        setError("No valid serial rows found in CSV");
        return;
      }
      const res = await api.importStockSerials(dataRows);
      setSuccess(`Imported ${res.created} serials`);
      if (res.errors?.length) setError(res.errors.slice(0, 5).join("; "));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Serial Tracking"
        description="Search serials, trace lifecycle (GRN → movements → sale), import CSV"
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="text-sm">
          Search serial
          <input
            className="mt-1 block w-56 rounded-lg border border-gray-300 px-2 py-1.5"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="SN-…"
          />
        </label>
        <label className="text-sm">
          Status
          <select
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            {["IN_STOCK", "ISSUED", "SOLD", "SCRAPPED"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white"
        >
          Refresh
        </button>
        {q ? (
          <button
            type="button"
            onClick={() => void doTrace(q)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
          >
            Trace
          </button>
        ) : null}
      </div>

      {trace ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
          <h2 className="font-semibold">
            Trace: {trace.serial_number} — {trace.status}
          </h2>
          <p className="mt-1 text-gray-600">
            {trace.item_code} · WH {trace.warehouse_name ?? "—"} · GRN {trace.grn_code ?? "—"} · Sale{" "}
            {trace.dc_code ?? "—"}
          </p>
          <ul className="mt-2 list-disc pl-5 text-xs text-gray-700">
            {(trace.lifecycle || []).map((e, i) => (
              <li key={i}>
                {e.event} {e.at ? `@ ${e.at}` : ""} {e.ref ? `(${e.ref})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">Serial</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Warehouse</th>
              <th className="px-3 py-2">GRN</th>
              <th className="px-3 py-2">Sale</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  No serials. Enable <code>serial_tracking_enabled</code> and receive GRN for serial items.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                  onClick={() => void doTrace(r.serial_number)}
                >
                  <td className="px-3 py-2 font-medium">{r.serial_number}</td>
                  <td className="px-3 py-2">
                    {r.item_code} — {r.item_name}
                  </td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">{r.warehouse_name ?? "—"}</td>
                  <td className="px-3 py-2">{r.grn_code ?? "—"}</td>
                  <td className="px-3 py-2">{r.dc_code ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Import serials (CSV)</h2>
        <textarea
          className="mt-2 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-mono text-xs"
          rows={5}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
        />
        <button
          type="button"
          onClick={() => void importCsv()}
          className="mt-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Upload import
        </button>
      </div>
    </div>
  );
}
