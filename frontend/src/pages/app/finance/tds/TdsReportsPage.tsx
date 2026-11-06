import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type TdsDeductionResponse, type TdsReturnResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";
import { useLatestRequest } from "@/hooks/useLatestRequest";

export function TdsReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3));
  const [form, setForm] = useState<"26Q" | "24Q">("26Q");
  const [returnData, setReturnData] = useState<TdsReturnResponse | null>(null);
  const [deductions, setDeductions] = useState<TdsDeductionResponse[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const returnRequest = useLatestRequest();
  const loadReturn = useCallback(async () => {
    const token = returnRequest.begin();
    setLoading(true);
    setError("");
    try {
      const res = await api.getTdsReturn({ year, quarter, form });
      if (!returnRequest.isCurrent(token)) return;
      setReturnData(res);
    } catch (e) {
      logApiError("TdsReportsPage.loadReturn", e);
      if (!returnRequest.isCurrent(token)) return;
      setError((e as Error).message);
      setReturnData(null);
    } finally {
      if (returnRequest.isCurrent(token)) setLoading(false);
    }
  }, [returnRequest, year, quarter, form]);

  const deductionsRequest = useLatestRequest();
  const loadDeductions = useCallback(async () => {
    const token = deductionsRequest.begin();
    try {
      const res = await api.listTdsDeductions({ status: statusFilter || undefined });
      if (!deductionsRequest.isCurrent(token)) return;
      setDeductions(res.rows);
    } catch (e) {
      logApiError("TdsReportsPage.loadDeductions", e);
      if (!deductionsRequest.isCurrent(token)) return;
      setError((e as Error).message);
    }
  }, [deductionsRequest, statusFilter]);

  useEffect(() => {
    void loadReturn();
  }, [loadReturn]);

  useEffect(() => {
    void loadDeductions();
  }, [loadDeductions]);

  function onFilterSubmit(e: FormEvent) {
    e.preventDefault();
    void loadReturn();
  }

  async function exportJson() {
    try {
      setError("");
      const payload = await api.exportTdsReturn({ year, quarter, form });
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = payload.filename || `Form_${form}_Q${quarter}_${year}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      logApiError("TdsReportsPage.exportJson", e);
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="TDS Reports"
        description="Quarterly Form 26Q/24Q return data and deduction register."
        actions={
          <Link
            to="/app/finance/tds"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            TDS Settings
          </Link>
        }
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <form
        onSubmit={onFilterSubmit}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3"
      >
        <label className="text-xs text-gray-600">
          Year
          <input
            type="number"
            className="mt-1 block w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2000}
            max={2100}
          />
        </label>
        <label className="text-xs text-gray-600">
          Quarter
          <select
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={quarter}
            onChange={(e) => setQuarter(Number(e.target.value))}
          >
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={q}>
                Q{q}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Form
          <select
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form}
            onChange={(e) => setForm(e.target.value as "26Q" | "24Q")}
          >
            <option value="26Q">26Q (non-salary)</option>
            <option value="24Q">24Q (salary / 192)</option>
          </select>
        </label>
        <button type="submit" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
          Refresh
        </button>
        <button
          type="button"
          onClick={() => void exportJson()}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Export JSON
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-500">Loading return…</p>
      ) : returnData ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500">Period</p>
              <p className="text-sm font-medium">
                {returnData.from_date} → {returnData.to_date}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500">Lines</p>
              <p className="text-lg font-semibold">{returnData.summary.count}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500">Total TDS</p>
              <p className="text-lg font-semibold tabular-nums">{returnData.summary.total_tds}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs text-gray-500">Pending / Deposited</p>
              <p className="text-sm">
                {returnData.summary.pending_count} / {returnData.summary.deposited_count}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Section</th>
                  <th className="px-3 py-2">Party</th>
                  <th className="px-3 py-2 text-right">Taxable</th>
                  <th className="px-3 py-2 text-right">TDS</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {returnData.rows.map((r) => (
                  <tr key={r.deduction_id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{r.deduction_date ?? "—"}</td>
                    <td className="px-3 py-2 font-medium">{r.section_code}</td>
                    <td className="px-3 py-2">
                      #{r.party_ledger_id} ({r.party_type})
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.taxable_amount}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.tds_amount}</td>
                    <td className="px-3 py-2">{r.status}</td>
                  </tr>
                ))}
                {returnData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-500">
                      No deductions in this quarter for {form}.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800">All deductions</h3>
          <select
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="DEPOSITED">Deposited</option>
            <option value="CERTIFICATE_ISSUED">Certificate issued</option>
          </select>
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Party</th>
                <th className="px-3 py-2 text-right">Taxable</th>
                <th className="px-3 py-2 text-right">TDS</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Voucher</th>
              </tr>
            </thead>
            <tbody>
              {deductions.map((d) => (
                <tr key={d.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">{d.id}</td>
                  <td className="px-3 py-2">{d.deduction_date ?? "—"}</td>
                  <td className="px-3 py-2">#{d.party_ledger_id}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.taxable_amount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.tds_amount}</td>
                  <td className="px-3 py-2">{d.status}</td>
                  <td className="px-3 py-2">{d.voucher_id ?? "—"}</td>
                </tr>
              ))}
              {deductions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">
                    No deductions found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
