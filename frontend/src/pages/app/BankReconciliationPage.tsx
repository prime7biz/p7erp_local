import { FormEvent, useEffect, useState } from "react";
import {
  api,
  type BankAccountResponse,
  type BankReconciliationSummaryResponse,
  type BankStatementMatchLogResponse,
  type BankStatementLineCreate,
  type BankStatementLineResponse,
  type PaymentRunResponse,
  type BankReconciliationCreate,
  type BankReconciliationResponse,
} from "@/api/client";
import { useAuth } from "@/context/AuthContext";

export function BankReconciliationPage() {
  const { me } = useAuth();
  const [accounts, setAccounts] = useState<BankAccountResponse[]>([]);
  const [rows, setRows] = useState<BankReconciliationResponse[]>([]);
  const [selectedReconId, setSelectedReconId] = useState<number | null>(null);
  const [statementLines, setStatementLines] = useState<BankStatementLineResponse[]>([]);
  const [summary, setSummary] = useState<BankReconciliationSummaryResponse | null>(null);
  const [matchLogs, setMatchLogs] = useState<BankStatementMatchLogResponse[]>([]);
  const [paymentRuns, setPaymentRuns] = useState<PaymentRunResponse[]>([]);
  const [csvText, setCsvText] = useState("");
  const [finalizeReason, setFinalizeReason] = useState("");
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [canFinalize, setCanFinalize] = useState(false);
  const [lineMatchSelection, setLineMatchSelection] = useState<Record<number, number | "">>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lineForm, setLineForm] = useState<BankStatementLineCreate>({
    transaction_date: new Date().toISOString().slice(0, 10),
    description: "",
    reference: "",
    debit_amount: "0",
    credit_amount: "0",
    running_balance: "",
  });
  const [form, setForm] = useState<BankReconciliationCreate>({
    bank_account_id: 0,
    statement_date: new Date().toISOString().slice(0, 10),
    statement_balance: "0",
    notes: "",
  });
  const selectedReconciliation = rows.find((r) => r.id === selectedReconId) ?? null;

  async function load() {
    try {
      setSuccess("");
      setError("");
      const bankList = await api.listBankAccounts();
      setAccounts(bankList);
      const effectiveBankId = form.bank_account_id || bankList[0]?.id;
      if (effectiveBankId) {
        setForm((p) => ({ ...p, bank_account_id: effectiveBankId }));
        const [recs, runs] = await Promise.all([
          api.listBankReconciliations({ bank_account_id: effectiveBankId }),
          api.listPaymentRuns(),
        ]);
        setRows(recs);
        setPaymentRuns(runs.filter((r) => r.status === "EXECUTED" && r.bank_account_id === effectiveBankId));
        if (recs.length > 0) {
          const firstRec = recs[0];
          if (!firstRec) return;
          setSelectedReconId(firstRec.id);
          await loadReconDetails(firstRec.id);
        } else {
          setSelectedReconId(null);
          setStatementLines([]);
          setSummary(null);
          setMatchLogs([]);
        }
      } else {
        setRows([]);
        setSelectedReconId(null);
        setStatementLines([]);
        setSummary(null);
        setMatchLogs([]);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const loadPermission = async () => {
      if (!me?.user_id) return;
      try {
        const users = await api.listUsers();
        const mine = users.find((u) => u.id === me.user_id);
        const role = (mine?.role_name ?? "").toLowerCase();
        setCanFinalize(role === "admin" || role === "manager");
      } catch {
        setCanFinalize(false);
      }
    };
    void loadPermission();
  }, [me?.user_id]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => {
      setSuccess("");
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => {
      setError("");
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  function selectedStatusLabel() {
    if (!selectedReconciliation) return "No selection";
    if (selectedReconciliation.is_finalized) return "FINALIZED";
    return selectedReconciliation.status || "OPEN";
  }

  function selectedStatusClass() {
    const label = selectedStatusLabel();
    if (label === "FINALIZED") return "bg-slate-100 text-slate-700 border-slate-300";
    if (label === "MATCHED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  async function loadReconDetails(reconId: number) {
    const [lines, s, logs] = await Promise.all([
      api.listBankStatementLines(reconId),
      api.getBankReconciliationSummary(reconId),
      api.listBankStatementMatchLogs(reconId),
    ]);
    setStatementLines(lines);
    setSummary(s);
    setMatchLogs(logs);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      setSuccess("");
      if (!form.bank_account_id) throw new Error("Please select a bank account");
      await api.createBankReconciliation(form);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onBankChange(bankId: number) {
    setForm((p) => ({ ...p, bank_account_id: bankId }));
    try {
      setSuccess("");
      const [recs, runs] = await Promise.all([api.listBankReconciliations({ bank_account_id: bankId }), api.listPaymentRuns()]);
      setRows(recs);
      setPaymentRuns(runs.filter((r) => r.status === "EXECUTED" && r.bank_account_id === bankId));
      if (recs.length > 0) {
        const firstRec = recs[0];
        if (!firstRec) return;
        setSelectedReconId(firstRec.id);
        await loadReconDetails(firstRec.id);
      } else {
        setSelectedReconId(null);
        setStatementLines([]);
        setSummary(null);
        setMatchLogs([]);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function resolve(id: number) {
    try {
      setSuccess("");
      await api.resolveBankReconciliation(id);
      if (form.bank_account_id) {
        const recs = await api.listBankReconciliations({ bank_account_id: form.bank_account_id });
        setRows(recs);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function selectReconciliation(reconId: number) {
    setSelectedReconId(reconId);
    try {
      setSuccess("");
      await loadReconDetails(reconId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addStatementLine(e: FormEvent) {
    e.preventDefault();
    try {
      setSuccess("");
      if (!selectedReconId) throw new Error("Select a reconciliation first");
      await api.importBankStatementLines(selectedReconId, [lineForm]);
      setLineForm({
        transaction_date: new Date().toISOString().slice(0, 10),
        description: "",
        reference: "",
        debit_amount: "0",
        credit_amount: "0",
        running_balance: "",
      });
      await loadReconDetails(selectedReconId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function autoMatch() {
    try {
      setSuccess("");
      if (!selectedReconId) throw new Error("Select a reconciliation first");
      await api.autoMatchBankStatementLines(selectedReconId, 1);
      await loadReconDetails(selectedReconId);
      if (form.bank_account_id) {
        setRows(await api.listBankReconciliations({ bank_account_id: form.bank_account_id }));
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function importCsvText() {
    try {
      setSuccess("");
      if (!selectedReconId) throw new Error("Select a reconciliation first");
      if (!csvText.trim()) throw new Error("Paste CSV text first");
      await api.importBankStatementLinesCsv(selectedReconId, csvText);
      setCsvText("");
      await loadReconDetails(selectedReconId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function manualMatch(lineId: number) {
    try {
      setSuccess("");
      if (!selectedReconId) throw new Error("Select a reconciliation first");
      const runId = lineMatchSelection[lineId];
      if (!runId) throw new Error("Select a payment run");
      await api.manualMatchBankStatementLine(selectedReconId, lineId, Number(runId));
      await loadReconDetails(selectedReconId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function unmatch(lineId: number) {
    try {
      setSuccess("");
      if (!selectedReconId) throw new Error("Select a reconciliation first");
      await api.manualUnmatchBankStatementLine(selectedReconId, lineId);
      await loadReconDetails(selectedReconId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function finalizeSelected() {
    try {
      setSuccess("");
      if (!selectedReconId) throw new Error("Select a reconciliation first");
      setIsFinalizing(true);
      await api.finalizeBankReconciliation(selectedReconId, finalizeReason.trim() || undefined);
      await loadReconDetails(selectedReconId);
      setFinalizeReason("");
      setShowFinalizeConfirm(false);
      setSuccess("Reconciliation finalized successfully.");
      if (form.bank_account_id) {
        setRows(await api.listBankReconciliations({ bank_account_id: form.bank_account_id }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsFinalizing(false);
    }
  }

  async function exportAuditCsv() {
    try {
      setSuccess("");
      if (!selectedReconId) throw new Error("Select a reconciliation first");
      setIsExporting(true);
      const csv = await api.exportBankStatementMatchLogsCsv(selectedReconId);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reconciliation_${selectedReconId}_match_logs.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccess("Audit CSV exported successfully.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Bank Reconciliation</h1>
        <p className="text-sm text-slate-500">Compare statement balance with book balance and close differences.</p>
        <div className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${selectedStatusClass()}`}>
          Selected Status: {selectedStatusLabel()}
        </div>
      </div>
      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <select className="rounded border px-3 py-2 text-sm" value={form.bank_account_id} onChange={(e) => void onBankChange(Number(e.target.value))}>
          <option value={0}>Select bank account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.bank_name} - {a.account_name}
            </option>
          ))}
        </select>
        <input type="date" className="rounded border px-3 py-2 text-sm" value={form.statement_date} onChange={(e) => setForm((p) => ({ ...p, statement_date: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Statement balance" value={form.statement_balance} onChange={(e) => setForm((p) => ({ ...p, statement_balance: e.target.value }))} />
        <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white">Add Statement</button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-2 py-1">Date</th>
              <th className="px-2 py-1 text-right">Statement</th>
              <th className="px-2 py-1 text-right">Book</th>
              <th className="px-2 py-1 text-right">Difference</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Action</th>
              <th className="px-2 py-1">Lines</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1">{r.statement_date}</td>
                <td className="px-2 py-1 text-right">{Number(r.statement_balance).toLocaleString()}</td>
                <td className="px-2 py-1 text-right">{Number(r.book_balance).toLocaleString()}</td>
                <td className="px-2 py-1 text-right">{Number(r.difference_amount).toLocaleString()}</td>
                <td className="px-2 py-1">{r.status}{r.is_finalized ? " / FINALIZED" : ""}</td>
                <td className="px-2 py-1">
                  {r.is_finalized ? (
                    <span className="text-xs text-slate-500">Locked</span>
                  ) : r.status !== "MATCHED" ? (
                    <button className="rounded border px-2 py-1 text-xs" onClick={() => void resolve(r.id)}>
                      Resolve
                    </button>
                  ) : (
                    <span className="text-xs text-emerald-600">Done</span>
                  )}
                </td>
                <td className="px-2 py-1">
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => void selectReconciliation(r.id)}>
                    {selectedReconId === r.id ? "Selected" : "Open"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Statement Lines</h2>
          <div className="flex gap-2">
            <button className="rounded border px-3 py-1 text-sm" onClick={() => void autoMatch()} disabled={!selectedReconId || selectedReconciliation?.is_finalized}>
              Auto Match
            </button>
            {canFinalize ? (
              <button className="rounded border px-3 py-1 text-sm" onClick={() => setShowFinalizeConfirm(true)} disabled={!selectedReconId || selectedReconciliation?.is_finalized || isFinalizing}>
                Finalize
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {canFinalize ? (
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Finalize reason (optional but recommended)"
              value={finalizeReason}
              onChange={(e) => setFinalizeReason(e.target.value)}
              disabled={selectedReconciliation?.is_finalized}
            />
          ) : (
            <div className="rounded border bg-slate-50 px-3 py-2 text-sm">
              Only manager/admin can finalize reconciliation.
            </div>
          )}
          {selectedReconciliation?.is_finalized ? (
            <div className="rounded border bg-slate-50 px-3 py-2 text-sm">
              Finalized reason: {selectedReconciliation.finalize_reason || "-"}
            </div>
          ) : null}
        </div>

        {summary ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded border bg-slate-50 px-3 py-2 text-sm">Lines: {summary.line_count}</div>
            <div className="rounded border bg-emerald-50 px-3 py-2 text-sm">Matched: {summary.matched_count}</div>
            <div className="rounded border bg-amber-50 px-3 py-2 text-sm">Unmatched: {summary.unmatched_count}</div>
            <div className="rounded border bg-slate-50 px-3 py-2 text-sm">Difference: {summary.difference_amount.toLocaleString()}</div>
          </div>
        ) : null}

        {showFinalizeConfirm && canFinalize && selectedReconciliation && !selectedReconciliation.is_finalized ? (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="mb-2 font-medium text-amber-800">Confirm finalize?</p>
            <p className="mb-3 text-amber-700">After finalize, this reconciliation will be locked for edits and matching changes.</p>
            <div className="flex gap-2">
              <button className="rounded bg-amber-700 px-3 py-1 text-white" onClick={() => void finalizeSelected()}>
                {isFinalizing ? "Finalizing..." : "Yes, Finalize"}
              </button>
              <button className="rounded border px-3 py-1" onClick={() => setShowFinalizeConfirm(false)} disabled={isFinalizing}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <form onSubmit={addStatementLine} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <input type="date" className="rounded border px-3 py-2 text-sm" value={lineForm.transaction_date} onChange={(e) => setLineForm((p) => ({ ...p, transaction_date: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Description" value={lineForm.description ?? ""} onChange={(e) => setLineForm((p) => ({ ...p, description: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Reference" value={lineForm.reference ?? ""} onChange={(e) => setLineForm((p) => ({ ...p, reference: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Debit" value={lineForm.debit_amount ?? "0"} onChange={(e) => setLineForm((p) => ({ ...p, debit_amount: e.target.value }))} />
          <input className="rounded border px-3 py-2 text-sm" placeholder="Credit" value={lineForm.credit_amount ?? "0"} onChange={(e) => setLineForm((p) => ({ ...p, credit_amount: e.target.value }))} />
          <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white" disabled={selectedReconciliation?.is_finalized}>Add Line</button>
        </form>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">CSV Import (paste CSV text)</p>
          <textarea
            className="h-24 w-full rounded border px-3 py-2 text-sm"
            placeholder="transaction_date,description,reference,debit_amount,credit_amount,running_balance"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <button className="rounded border px-3 py-1 text-sm" onClick={() => void importCsvText()} disabled={!selectedReconId || selectedReconciliation?.is_finalized}>
            Import CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-2 py-1">Date</th>
                <th className="px-2 py-1">Description</th>
                <th className="px-2 py-1">Reference</th>
                <th className="px-2 py-1 text-right">Debit</th>
                <th className="px-2 py-1 text-right">Credit</th>
                <th className="px-2 py-1">Match</th>
                <th className="px-2 py-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {statementLines.map((line) => (
                <tr key={line.id} className="border-t">
                  <td className="px-2 py-1">{line.transaction_date}</td>
                  <td className="px-2 py-1">{line.description ?? "-"}</td>
                  <td className="px-2 py-1">{line.reference ?? "-"}</td>
                  <td className="px-2 py-1 text-right">{Number(line.debit_amount).toLocaleString()}</td>
                  <td className="px-2 py-1 text-right">{Number(line.credit_amount).toLocaleString()}</td>
                  <td className="px-2 py-1">
                    {line.matched_status}
                    {line.matched_payment_run_id ? ` (Run #${line.matched_payment_run_id})` : ""}
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex gap-2">
                      <select
                        className="rounded border px-2 py-1 text-xs"
                        value={lineMatchSelection[line.id] ?? ""}
                        disabled={selectedReconciliation?.is_finalized}
                        onChange={(e) =>
                          setLineMatchSelection((prev) => ({
                            ...prev,
                            [line.id]: e.target.value ? Number(e.target.value) : "",
                          }))
                        }
                      >
                        <option value="">Select run</option>
                        {paymentRuns.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.run_code} ({Number(r.total_amount).toLocaleString()})
                          </option>
                        ))}
                      </select>
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => void manualMatch(line.id)} disabled={selectedReconciliation?.is_finalized}>
                        Match
                      </button>
                      {line.matched_status === "MATCHED" ? (
                        <button className="rounded border px-2 py-1 text-xs" onClick={() => void unmatch(line.id)} disabled={selectedReconciliation?.is_finalized}>
                          Unmatch
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Match Audit Trail</h2>
          <button className="rounded border px-3 py-1 text-sm" onClick={() => void exportAuditCsv()} disabled={!selectedReconId || isExporting}>
            {isExporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-2 py-1">When</th>
              <th className="px-2 py-1">Action</th>
              <th className="px-2 py-1">Line</th>
              <th className="px-2 py-1">Run</th>
              <th className="px-2 py-1">User</th>
              <th className="px-2 py-1">Note</th>
            </tr>
          </thead>
          <tbody>
            {matchLogs.map((log) => (
              <tr key={log.id} className="border-t">
                <td className="px-2 py-1">{new Date(log.created_at).toLocaleString()}</td>
                <td className="px-2 py-1">{log.action}</td>
                <td className="px-2 py-1">#{log.statement_line_id}</td>
                <td className="px-2 py-1">{log.payment_run_id ? `#${log.payment_run_id}` : "-"}</td>
                <td className="px-2 py-1">{log.created_by ?? "-"}</td>
                <td className="px-2 py-1">{log.note ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
