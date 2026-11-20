import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type MemorandumRegisterRow } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { listTableTheadClass } from "@/components/app/listPageLayout";
import { ScrollTableCard, showingCountLabel } from "@/components/finance/kit";
import { logApiError } from "@/utils/logApiError";
import { useConfirm } from "@/components/app/useConfirm";

export function MemorandumRegisterPage() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<MemorandumRegisterRow[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [openActionsId, setOpenActionsId] = useState<string | number | null>(null);
  const navigate = useNavigate();
  const [convertingId, setConvertingId] = useState<number | null>(null);

  async function load() {
    try {
      setError("");
      const res = await api.listMemorandumRegister();
      setRows(res.rows);
    } catch (e) {
      logApiError("MemorandumRegisterPage.load", e);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function convert(id: number) {
    if (!(await confirm({ title: "Convert this memorandum voucher to a regular voucher?" }))) return;
    try {
      setConvertingId(id);
      setOpenActionsId(null);
      setError("");
      setSuccess("");
      const res = await api.convertMemorandumVoucher(id);
      setSuccess(`Converted voucher #${res.id as number} (${res.voucher_type as string}).`);
      await load();
    } catch (e) {
      logApiError("MemorandumRegisterPage.convert", e);
      setError((e as Error).message);
    } finally {
      setConvertingId(null);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Memorandum Register"
        description="Non-book vouchers held for reference. Convert to regular when ready to post."
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{success}</p>
      ) : null}

      <ScrollTableCard footer={showingCountLabel(rows.length, rows.length, "voucher")}>
        <table className="min-w-full text-left text-sm">
          <thead className={`${listTableTheadClass} text-xs uppercase text-gray-500`}>
            <tr>
              <th className="px-3 py-2">Voucher #</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium">
                  <Link to={`/app/accounts/vouchers?edit=${r.id}`} className="text-blue-600 hover:underline">
                    {r.voucher_number}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.voucher_date}</td>
                <td className="px-3 py-2">{r.voucher_type}</td>
                <td className="px-3 py-2 text-gray-600">{r.description ?? "—"}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2">
                  <RowActionsMenu
                    menuPortal
                    rowId={r.id}
                    openId={openActionsId}
                    onOpenChange={setOpenActionsId}
                    items={[
                      {
                        key: "convert",
                        label: convertingId === r.id ? "Converting…" : "Convert",
                        disabled: convertingId === r.id,
                        onClick: () => void convert(r.id),
                      },
                      {
                        key: "edit",
                        label: "Edit voucher",
                        onClick: () => navigate(`/app/accounts/vouchers?edit=${r.id}`),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                  No memorandum vouchers in register.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </ScrollTableCard>
    </div>
  );
}
