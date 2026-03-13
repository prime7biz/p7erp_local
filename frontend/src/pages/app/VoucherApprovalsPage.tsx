import { useEffect, useState } from "react";
import { api, type VoucherResponse } from "@/api/client";
import { downloadCsv, printCurrentPage } from "@/lib/reportExport";

const QUEUE_STATUSES = ["SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED"];
const ACTION_TO_STATUS: Record<string, string> = {
  submit: "SUBMITTED",
  check: "CHECKED",
  recommend: "RECOMMENDED",
  approve: "APPROVED",
  reject: "REJECTED",
  set_draft: "DRAFT",
  cancel: "CANCELLED",
};
const ACTION_LABEL: Record<string, string> = {
  submit: "Submit",
  check: "Check",
  recommend: "Recommend",
  approve: "Approve",
  post: "Post",
  reject: "Reject",
  set_draft: "Set Draft",
  cancel: "Cancel",
};

function actionButtonClass(action: string) {
  if (action === "reject") return "rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700";
  if (action === "approve" || action === "post") return "rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700";
  if (action === "check" || action === "recommend" || action === "submit") return "rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs text-blue-700";
  return "rounded border px-2 py-1 text-xs";
}

export function VoucherApprovalsPage() {
  const [rows, setRows] = useState<VoucherResponse[]>([]);
  const [filteredRows, setFilteredRows] = useState<VoucherResponse[]>([]);
  const [availableActionMap, setAvailableActionMap] = useState<Record<number, string[]>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  async function load() {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const list = await api.listVouchers();
      const queueRows = list.filter((r) => QUEUE_STATUSES.includes(r.status));
      setRows(queueRows);
      setFilteredRows(queueRows);
      const actionPairs = await Promise.all(
        queueRows.map(async (r) => {
          try {
            const meta = await api.getVoucherAvailableActions(r.id);
            return [r.id, meta.actions] as [number, string[]];
          } catch {
            return [r.id, []] as [number, string[]];
          }
        })
      );
      const actionMap: Record<number, string[]> = {};
      for (const [id, actions] of actionPairs) actionMap[id] = actions;
      setAvailableActionMap(actionMap);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      const byStatus = statusFilter === "ALL" ? true : r.status === statusFilter;
      const bySearch =
        q.length === 0 ||
        r.voucher_number.toLowerCase().includes(q) ||
        (r.reference ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q);
      return byStatus && bySearch;
    });
    setFilteredRows(out);
  }, [rows, search, statusFilter]);

  async function takeAction(id: number, action: string) {
    try {
      if (action === "post") {
        await api.postVoucher(id);
      } else {
        const mappedStatus = ACTION_TO_STATUS[action];
        if (!mappedStatus) throw new Error(`Unsupported action: ${action}`);
        await api.updateVoucherStatus(id, mappedStatus);
      }
      setSuccess(`Voucher action completed: ${ACTION_LABEL[action] ?? action}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function exportCsv() {
    const headers = ["voucher_id", "voucher_number", "voucher_date", "voucher_type", "status", "amount"];
    const lines = filteredRows.map((r) => {
      const amount = r.lines.filter((l) => l.entry_type === "DEBIT").reduce((sum, l) => sum + Number(l.amount || 0), 0);
      return [r.id, r.voucher_number, r.voucher_date, r.voucher_type, r.status, amount.toFixed(2)].join(",");
    });
    const csv = [headers.join(","), ...lines].join("\n");
    downloadCsv(csv, "voucher_approval_queue");
    setSuccess("Approval queue exported to CSV.");
  }

  return (
    <div className="space-y-6 print-report">
      <div className="print-only mb-3 border-b border-slate-300 pb-2">
        <h1 className="text-lg font-semibold">Voucher Approval Queue</h1>
      </div>
      <div className="no-print">
        <h1 className="text-2xl font-semibold text-slate-900">Voucher Approval Queue</h1>
        <p className="mt-1 text-sm text-slate-500">Review submitted vouchers and move them through approval workflow.</p>
      </div>
      {error ? <div className="no-print rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="no-print rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
      <div className="no-print grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Search voucher number/reference/description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="rounded border px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">All Queue Statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="CHECKED">Checked</option>
          <option value="RECOMMENDED">Recommended</option>
          <option value="APPROVED">Approved</option>
        </select>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => printCurrentPage()}>
          Print Queue
        </button>
        <button className="rounded border px-3 py-2 text-sm" onClick={() => exportCsv()}>
          Export CSV
        </button>
      </div>
      <div className="print-card overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Voucher No</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-5 text-slate-500" colSpan={6}>
                  Loading approval queue...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td className="px-3 py-5 text-slate-500" colSpan={6}>
                  No pending vouchers in approval queue.
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => {
                const amount = r.lines.filter((l) => l.entry_type === "DEBIT").reduce((sum, l) => sum + Number(l.amount || 0), 0);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.voucher_number}</td>
                    <td className="px-3 py-2">{r.voucher_date}</td>
                    <td className="px-3 py-2">{r.voucher_type}</td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">{amount.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(availableActionMap[r.id] ?? []).map((action) => (
                          <button key={action} className={actionButtonClass(action)} onClick={() => void takeAction(r.id, action)}>
                            {ACTION_LABEL[action] ?? action}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
