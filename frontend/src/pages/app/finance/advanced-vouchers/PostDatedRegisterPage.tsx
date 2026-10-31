import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type PostDatedRegisterRow } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function PostDatedRegisterPage() {
  const [rows, setRows] = useState<PostDatedRegisterRow[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activating, setActivating] = useState(false);

  async function load() {
    try {
      setError("");
      const res = await api.listPostDatedRegister();
      setRows(res.rows);
    } catch (e) {
      logApiError("PostDatedRegisterPage.load", e);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function activateDue() {
    try {
      setActivating(true);
      setError("");
      setSuccess("");
      const res = await api.activateDuePostDated();
      setSuccess(`Activated ${res.count} voucher(s).`);
      await load();
    } catch (e) {
      logApiError("PostDatedRegisterPage.activate", e);
      setError((e as Error).message);
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Post-dated Register"
        description="Vouchers scheduled for a future date. Activate due entries when their date arrives."
        actions={
          <button
            type="button"
            disabled={activating}
            onClick={() => void activateDue()}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {activating ? "Activating…" : "Activate due"}
          </button>
        }
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{success}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Voucher #</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Days until active</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Edit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium">{r.voucher_number}</td>
                <td className="px-3 py-2">{r.voucher_date}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.amount}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      r.days_until_active <= 0
                        ? "bg-green-100 text-green-800"
                        : r.days_until_active <= 7
                          ? "bg-amber-100 text-amber-800"
                          : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {r.days_until_active <= 0 ? "Due now" : `${r.days_until_active} days`}
                  </span>
                </td>
                <td className="px-3 py-2">{r.voucher_type}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2">
                  <Link
                    to={`/app/accounts/vouchers?edit=${r.id}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Edit voucher
                  </Link>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                  No post-dated vouchers in register.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
