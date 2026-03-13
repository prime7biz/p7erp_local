import { useEffect, useState } from "react";
import { api, type HrLeaveRequestResponse } from "@/api/client";

export function HrLeaveApprovalsPage() {
  const [rows, setRows] = useState<HrLeaveRequestResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const load = async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listHrLeaveRequests({ status: "pending" });
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leave approvals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const decide = async (id: number, decision: "approved" | "rejected"): Promise<void> => {
    setError("");
    try {
      await api.decideHrLeaveRequest(id, decision);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update decision");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Approvals</h1>
          <p className="text-sm text-gray-500">Approve or reject pending leave requests.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
        >
          Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">Loading pending requests...</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">No pending requests.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Employee ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Leave Type ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">From</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">To</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Days</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.employee_id}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.leave_type_id}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.from_date}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.to_date}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.total_days}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => void decide(row.id, "approved")}
                        className="rounded border border-green-300 px-3 py-1 text-xs text-green-700 hover:bg-green-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void decide(row.id, "rejected")}
                        className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
