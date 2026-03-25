import { useState } from "react";
import { Link } from "react-router-dom";
import {
  createInvoice,
  listInvoices,
  markInvoicePaid,
  sendInvoice,
  voidInvoice,
} from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { useToast } from "@/context/ToastContext";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatUsd } from "@/utils/format";
import { Modal } from "@/components/ui/Modal";
import type { InvoiceItem } from "@/api/client";
import { useApi } from "@/hooks/useApi";

export function InvoicesPage() {
  const { showToast } = useToast();
  const { can } = useAdminAuth();
  const manage = can("billing.manage_billing");

  const { data, loading, error, refetch } = useApi(() => listInvoices().then((r) => r.items));
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ tenant_id: "", subtotal: "0", tax: "0", total: "0" });

  const items = data ?? ([] as InvoiceItem[]);

  async function onSend(id: number) {
    try {
      await sendInvoice(id);
      showToast("Sent", "success");
      await refetch();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Send failed", "error");
    }
  }

  async function onPaid(id: number) {
    try {
      await markInvoicePaid(id);
      showToast("Marked paid", "success");
      await refetch();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Update failed", "error");
    }
  }

  async function onVoid(id: number) {
    try {
      await voidInvoice(id);
      showToast("Voided", "success");
      await refetch();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Void failed", "error");
    }
  }

  if (loading && !data) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Create, send, and settle invoices."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => void refetch()}
            >
              Refresh
            </button>
            {manage && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
              >
                New invoice
              </button>
            )}
          </div>
        }
      />
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      <DataTable
        columns={[
          { key: "n", header: "Number", cell: (i) => i.invoice_number },
          {
            key: "t",
            header: "Tenant",
            cell: (i) => (
              <Link className="text-indigo-600 hover:underline" to={`/tenants/${i.tenant_id}`}>
                {i.tenant_id}
              </Link>
            ),
          },
          { key: "tot", header: "Total", cell: (i) => formatUsd(i.total) },
          { key: "s", header: "Status", cell: (i) => i.status },
          { key: "d", header: "Due", cell: (i) => i.due_date ?? "—" },
          {
            key: "a",
            header: "Actions",
            cell: (i) =>
              manage ? (
                <div className="flex flex-wrap gap-1">
                  {i.status === "draft" && (
                    <button type="button" className="text-xs text-indigo-600" onClick={() => void onSend(i.id)}>
                      Send
                    </button>
                  )}
                  {(i.status === "sent" || i.status === "overdue") && (
                    <button type="button" className="text-xs text-emerald-700" onClick={() => void onPaid(i.id)}>
                      Paid
                    </button>
                  )}
                  {i.status !== "void" && i.status !== "paid" && (
                    <button type="button" className="text-xs text-red-600" onClick={() => void onVoid(i.id)}>
                      Void
                    </button>
                  )}
                </div>
              ) : (
                <span className="text-xs text-slate-400">—</span>
              ),
          },
        ]}
        rows={items}
        rowKey={(i) => i.id}
        emptyMessage="No invoices."
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create invoice" size="sm">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const tid = parseInt(form.tenant_id, 10);
            if (!tid) {
              showToast("Tenant ID required", "error");
              return;
            }
            try {
              await createInvoice({
                tenant_id: tid,
                subtotal: parseFloat(form.subtotal),
                tax: parseFloat(form.tax),
                total: parseFloat(form.total),
              });
              showToast("Created", "success");
              setCreateOpen(false);
              await refetch();
            } catch (err: unknown) {
              showToast(err instanceof Error ? err.message : "Create failed", "error");
            }
          }}
        >
          <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Tenant ID" value={form.tenant_id} onChange={(e) => setForm({ ...form, tenant_id: e.target.value })} />
          <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Subtotal" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: e.target.value })} />
          <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Tax" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} />
          <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Total" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} />
          <button type="submit" className="w-full bg-indigo-600 text-white rounded py-2 text-sm">Create draft</button>
        </form>
      </Modal>
    </div>
  );
}
