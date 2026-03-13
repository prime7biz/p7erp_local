import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type BankAccountResponse,
  type OutstandingBillResponse,
  type PaymentRunCreate,
  type PaymentRunResponse,
} from "@/api/client";
import { useAuth } from "@/context/AuthContext";

const RUN_STATUSES = ["DRAFT", "APPROVED", "PROCESSED", "EXECUTED"] as const;

function statusBadgeClass(status: string) {
  if (status === "DRAFT") return "bg-slate-100 text-slate-700";
  if (status === "APPROVED") return "bg-blue-100 text-blue-700";
  if (status === "PROCESSED") return "bg-amber-100 text-amber-700";
  if (status === "EXECUTED") return "bg-emerald-100 text-emerald-700";
  return "bg-slate-100 text-slate-700";
}

export function PaymentRunsPage() {
  const { me } = useAuth();
  const [bankAccounts, setBankAccounts] = useState<BankAccountResponse[]>([]);
  const [payables, setPayables] = useState<OutstandingBillResponse[]>([]);
  const [rows, setRows] = useState<PaymentRunResponse[]>([]);
  const [selectedBillIds, setSelectedBillIds] = useState<number[]>([]);
  const [runStatusFilter, setRunStatusFilter] = useState("");
  const [runSearch, setRunSearch] = useState("");
  const [billSearch, setBillSearch] = useState("");
  const [myRole, setMyRole] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<PaymentRunCreate>({
    run_code: "",
    run_date: new Date().toISOString().slice(0, 10),
    bank_account_id: undefined,
    remarks: "",
    items: [],
  });

  async function load() {
    try {
      setSuccess("");
      setError("");
      const [banks, bills, runs] = await Promise.all([
        api.listBankAccounts(),
        api.listOutstandingBills({ bill_type: "PAYABLE" }),
        api.listPaymentRuns(runStatusFilter ? { status_filter: runStatusFilter } : undefined),
      ]);
      setBankAccounts(banks);
      setPayables(bills.filter((b) => b.status === "OPEN" || b.status === "PARTIAL"));
      setRows(runs);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runStatusFilter]);

  useEffect(() => {
    const loadRole = async () => {
      if (!me?.user_id) return;
      try {
        const users = await api.listUsers();
        const mine = users.find((u) => u.id === me.user_id);
        setMyRole((mine?.role_name ?? "").trim().toLowerCase());
      } catch {
        setMyRole("");
      }
    };
    void loadRole();
  }, [me?.user_id]);

  const canApproveOrProcess = myRole === "admin" || myRole === "manager";
  const canExecute = canApproveOrProcess;

  const selectedItems = useMemo(() => {
    return payables
      .filter((b) => selectedBillIds.includes(b.id))
      .map((b) => {
        const outstanding = Math.max(Number(b.amount) - Number(b.paid_amount), 0);
        return {
          bill_id: b.id,
          party_name: b.party_name,
          amount: String(outstanding),
          reference: b.bill_no,
        };
      });
  }, [payables, selectedBillIds]);

  const filteredPayables = useMemo(() => {
    const query = billSearch.trim().toLowerCase();
    if (!query) return payables;
    return payables.filter(
      (b) => b.bill_no.toLowerCase().includes(query) || b.party_name.toLowerCase().includes(query),
    );
  }, [payables, billSearch]);

  const filteredRuns = useMemo(() => {
    const query = runSearch.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(
      (r) =>
        r.run_code.toLowerCase().includes(query) ||
        String(r.id).includes(query) ||
        (r.remarks ?? "").toLowerCase().includes(query),
    );
  }, [rows, runSearch]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      setSuccess("");
      if (!selectedItems.length) throw new Error("Please select payable bills");
      if (!form.bank_account_id) throw new Error("Bank account is required for payment run workflow");
      await api.createPaymentRun({ ...form, items: selectedItems });
      setSelectedBillIds([]);
      setForm((p) => ({ ...p, run_code: "", remarks: "", bank_account_id: undefined }));
      setBillSearch("");
      setSuccess("Payment run created in DRAFT status.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function execute(runId: number) {
    try {
      setSuccess("");
      await api.executePaymentRun(runId);
      setSuccess("Payment run executed successfully.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function approve(runId: number) {
    try {
      setSuccess("");
      await api.approvePaymentRun(runId);
      setSuccess("Payment run approved.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function processRun(runId: number) {
    try {
      setSuccess("");
      await api.processPaymentRun(runId);
      setSuccess("Payment run processed.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Payment Runs</h1>
        <p className="text-sm text-slate-500">Batch payable bills through DRAFT - APPROVED - PROCESSED - EXECUTED workflow.</p>
      </div>
      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}

      <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Create Payment Run</h2>
          <div className="text-xs text-slate-500">
            Selected bills: <b>{selectedBillIds.length}</b>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input className="rounded border px-3 py-2 text-sm" placeholder="Run code (optional)" value={form.run_code ?? ""} onChange={(e) => setForm((p) => ({ ...p, run_code: e.target.value }))} />
          <input type="date" className="rounded border px-3 py-2 text-sm" value={form.run_date} onChange={(e) => setForm((p) => ({ ...p, run_date: e.target.value }))} />
          <select className="rounded border px-3 py-2 text-sm" value={form.bank_account_id ?? ""} onChange={(e) => setForm((p) => ({ ...p, bank_account_id: e.target.value ? Number(e.target.value) : undefined }))} required>
            <option value="">Select bank account *</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bank_name} - {a.account_name}
              </option>
            ))}
          </select>
          <input className="rounded border px-3 py-2 text-sm sm:col-span-2 lg:col-span-2" placeholder="Remarks (optional)" value={form.remarks ?? ""} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">Required: Bank account and at least one payable bill.</p>
          <button className="w-full rounded bg-slate-900 px-3 py-2 text-sm text-white sm:w-auto">Create Run (Draft)</button>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-slate-700">Open Payable Bills</h2>
            <input
              className="w-full rounded border px-3 py-2 text-sm md:w-72"
              placeholder="Search bill no or party..."
              value={billSearch}
              onChange={(e) => setBillSearch(e.target.value)}
            />
          </div>
          <div className="max-h-52 overflow-auto rounded border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-2 py-1">Pick</th>
                  <th className="px-2 py-1">Bill</th>
                  <th className="px-2 py-1">Party</th>
                  <th className="px-2 py-1 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayables.map((b) => {
                  const outstanding = Math.max(Number(b.amount) - Number(b.paid_amount), 0);
                  return (
                    <tr key={b.id} className="border-t">
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={selectedBillIds.includes(b.id)}
                          onChange={(e) =>
                            setSelectedBillIds((prev) =>
                              e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id)
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-1">{b.bill_no}</td>
                      <td className="px-2 py-1">{b.party_name}</td>
                      <td className="px-2 py-1 text-right">{outstanding.toLocaleString()}</td>
                    </tr>
                  );
                })}
                {filteredPayables.length === 0 ? (
                  <tr className="border-t">
                    <td className="px-2 py-2 text-slate-500" colSpan={4}>
                      No open payable bills for the current search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <h2 className="text-sm font-semibold text-slate-700">Payment Run Queue</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-600">Status:</span>
            <select
              className="rounded border px-2 py-1 text-xs"
              value={runStatusFilter}
              onChange={(e) => setRunStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              {RUN_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => void load()}>
              Refresh
            </button>
          </div>
          <input
            className="w-full rounded border px-3 py-2 text-sm md:w-72"
            placeholder="Search run code or remarks..."
            value={runSearch}
            onChange={(e) => setRunSearch(e.target.value)}
          />
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-2 py-1">Run Code</th>
              <th className="px-2 py-1">Date</th>
              <th className="px-2 py-1 text-right">Total</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Voucher</th>
              <th className="px-2 py-1">Items</th>
              <th className="px-2 py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredRuns.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1">{r.run_code}</td>
                <td className="px-2 py-1">{r.run_date}</td>
                <td className="px-2 py-1 text-right">{Number(r.total_amount).toLocaleString()}</td>
                <td className="px-2 py-1">
                  <span className={`rounded px-2 py-1 text-xs ${statusBadgeClass(r.status)}`}>{r.status}</span>
                </td>
                <td className="px-2 py-1">{r.executed_voucher_id ? `#${r.executed_voucher_id}` : "-"}</td>
                <td className="px-2 py-1">{r.items.length}</td>
                <td className="px-2 py-1">
                  <div className="flex flex-wrap gap-2">
                    {r.status === "DRAFT" && canApproveOrProcess ? (
                      <button type="button" className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs text-blue-700" onClick={() => void approve(r.id)}>
                        Approve
                      </button>
                    ) : null}
                    {r.status === "APPROVED" && canApproveOrProcess ? (
                      <button type="button" className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700" onClick={() => void processRun(r.id)}>
                        Process
                      </button>
                    ) : null}
                    {r.status === "PROCESSED" && canExecute ? (
                      <button type="button" className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700" onClick={() => void execute(r.id)}>
                        Execute
                      </button>
                    ) : null}
                    {r.status === "EXECUTED" ? <span className="text-xs text-emerald-600">Completed</span> : null}
                    {(r.status === "DRAFT" || r.status === "APPROVED" || r.status === "PROCESSED") &&
                    !canApproveOrProcess ? (
                      <span className="text-xs text-slate-500">Manager/Admin action</span>
                    ) : null}
                    <Link className="rounded border px-2 py-1 text-xs text-slate-700" to={`/app/banking/payment-advice?run_id=${r.id}`}>
                      Open Advice
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {filteredRuns.length === 0 ? (
              <tr className="border-t">
                <td className="px-2 py-2 text-slate-500" colSpan={7}>
                  No payment runs found for the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
