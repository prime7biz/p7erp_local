import { useState } from "react";
import { api, type PostCostingReportResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function PostCostingPage() {
  const [orderId, setOrderId] = useState("");
  const [report, setReport] = useState<PostCostingReportResponse | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const id = Number(orderId);
    if (!id) {
      setError("Enter a valid order ID");
      return;
    }
    try {
      setError("");
      setReport(await api.getPostCostingReport(id));
    } catch (e) {
      logApiError("PostCostingPage.load", e);
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6 print:p-0">
      <AppPageHeader
        title="Post-Costing Report"
        description="Stage-by-stage cost and process loss for an order"
        actions={
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 print:hidden"
            onClick={() => window.print()}
          >
            Print / PDF
          </button>
        }
      />
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-sm">
          Order ID
          <input
            className="mt-1 block w-40 rounded-lg border border-gray-300 px-2 py-1.5"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          Load
        </button>
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {report ? (
        <div className="space-y-3">
          <p className="text-sm">
            Order <strong>{report.order_code ?? report.order_id}</strong>
            {report.order_qty != null ? ` · Qty ${report.order_qty}` : ""}
            {report.final_unit_cost != null ? ` · Final unit cost ${report.final_unit_cost}` : ""}
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Input</th>
                  <th className="px-3 py-2">Output</th>
                  <th className="px-3 py-2">Loss %</th>
                  <th className="px-3 py-2">Input cost</th>
                  <th className="px-3 py-2">Job work</th>
                  <th className="px-3 py-2">Cost / unit</th>
                </tr>
              </thead>
              <tbody>
                {report.stages.map((s, i) => (
                  <tr
                    key={`${s.stage}-${i}`}
                    className={`border-b ${s.loss_exception ? "bg-red-50" : ""}`}
                  >
                    <td className="px-3 py-2">{s.stage}</td>
                    <td className="px-3 py-2">{s.input_qty ?? "—"}</td>
                    <td className="px-3 py-2">{s.output_qty ?? "—"}</td>
                    <td className="px-3 py-2">{s.loss_percent ?? "—"}</td>
                    <td className="px-3 py-2">{s.input_cost ?? "—"}</td>
                    <td className="px-3 py-2">{s.job_work ?? "—"}</td>
                    <td className="px-3 py-2">{s.output_cost_per_unit ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.variance_drivers.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-medium">Primary variance drivers</p>
              <ul className="mt-1 list-disc pl-5">
                {report.variance_drivers.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
