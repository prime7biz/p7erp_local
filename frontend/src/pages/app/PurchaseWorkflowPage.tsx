import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type GoodsReceivingResponse,
  type OutstandingBillResponse,
  type PurchaseApOverviewResponse,
  type PurchaseOrderResponse,
} from "@/api/client";

export function PurchaseWorkflowPage() {
  const [overview, setOverview] = useState<PurchaseApOverviewResponse | null>(null);
  const [openPayables, setOpenPayables] = useState<OutstandingBillResponse[]>([]);
  const [approvedPoRows, setApprovedPoRows] = useState<PurchaseOrderResponse[]>([]);
  const [receivedGrnRows, setReceivedGrnRows] = useState<GoodsReceivingResponse[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    try {
      setSuccess("");
      setError("");
      const [summary, bills, pos, grns] = await Promise.all([
        api.getPurchaseApOverview(),
        api.listOutstandingBills({ bill_type: "PAYABLE" }),
        api.listPurchaseOrders(),
        api.listGoodsReceiving(),
      ]);
      setOverview(summary);
      setOpenPayables(bills.filter((b) => b.status === "OPEN" || b.status === "PARTIAL"));
      setApprovedPoRows(pos.filter((p) => p.status === "APPROVED" || p.status === "PARTIALLY_RECEIVED" || p.status === "CLOSED"));
      setReceivedGrnRows(grns.filter((g) => g.status === "RECEIVED"));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createPayable(poId: number) {
    try {
      await api.createPayableFromPurchaseOrder(poId, { due_in_days: 30, currency: "BDT" });
      setSuccess("AP bill created from purchase order.");
      setError("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function createPayableFromGrn(grnId: number) {
    try {
      await api.createPayableFromGoodsReceiving(grnId, { due_in_days: 30, currency: "BDT" });
      setSuccess("AP bill created from received GRN.");
      setError("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Purchase & AP Workflow</h1>
        <p className="text-sm text-slate-500">Review purchase liabilities and prepare payments from one place.</p>
      </div>
      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase text-slate-500">Payable Bills</p>
          <p className="text-xl font-semibold text-slate-900">{overview?.payable_bills_count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase text-slate-500">Open Payables</p>
          <p className="text-xl font-semibold text-slate-900">{overview?.open_payable_count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase text-slate-500">Open Amount</p>
          <p className="text-xl font-semibold text-slate-900">{(overview?.open_payable_amount ?? 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase text-slate-500">Due 7 Days</p>
          <p className="text-xl font-semibold text-amber-700">{(overview?.due_next_7_days_amount ?? 0).toLocaleString()}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Link to="/app/accounts/outstanding-bills" className="rounded border px-3 py-2 text-sm">
          Open Outstanding Bills
        </Link>
        <Link to="/app/banking/payment-runs" className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
          Create Payment Run
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-2 py-1">Bill No</th>
              <th className="px-2 py-1">Party</th>
              <th className="px-2 py-1">Due Date</th>
              <th className="px-2 py-1 text-right">Amount</th>
              <th className="px-2 py-1 text-right">Paid</th>
              <th className="px-2 py-1 text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {openPayables.map((b) => {
              const outstanding = Math.max(Number(b.amount) - Number(b.paid_amount), 0);
              return (
                <tr key={b.id} className="border-t">
                  <td className="px-2 py-1">{b.bill_no}</td>
                  <td className="px-2 py-1">{b.party_name}</td>
                  <td className="px-2 py-1">{b.due_date}</td>
                  <td className="px-2 py-1 text-right">{Number(b.amount).toLocaleString()}</td>
                  <td className="px-2 py-1 text-right">{Number(b.paid_amount).toLocaleString()}</td>
                  <td className="px-2 py-1 text-right">{outstanding.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="border-b bg-slate-50 px-3 py-2">
          <h2 className="text-sm font-semibold text-slate-700">Approved Purchase Orders (Create AP Bill from PO)</h2>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-2 py-1">PO Code</th>
              <th className="px-2 py-1">Supplier</th>
              <th className="px-2 py-1">Order Date</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {approvedPoRows.map((po) => (
              <tr key={po.id} className="border-t">
                <td className="px-2 py-1">{po.po_code}</td>
                <td className="px-2 py-1">{po.supplier_name}</td>
                <td className="px-2 py-1">{po.order_date ?? "-"}</td>
                <td className="px-2 py-1">{po.status}</td>
                <td className="px-2 py-1">
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => void createPayable(po.id)}>
                    Create AP Bill
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="border-b bg-slate-50 px-3 py-2">
          <h2 className="text-sm font-semibold text-slate-700">Received GRNs (Create AP Bill from actual receipt)</h2>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-2 py-1">GRN Code</th>
              <th className="px-2 py-1">PO ID</th>
              <th className="px-2 py-1">Received Date</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {receivedGrnRows.map((grn) => (
              <tr key={grn.id} className="border-t">
                <td className="px-2 py-1">{grn.grn_code}</td>
                <td className="px-2 py-1">{grn.purchase_order_id ?? "-"}</td>
                <td className="px-2 py-1">{grn.received_date ?? "-"}</td>
                <td className="px-2 py-1">{grn.status}</td>
                <td className="px-2 py-1">
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => void createPayableFromGrn(grn.id)}>
                    Create AP Bill
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
