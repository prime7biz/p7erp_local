import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  type BankAccountResponse,
  type OutstandingBillResponse,
  type PaymentRunCreate,
  type PaymentRunResponse,
} from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { todayLocalISO } from "@/lib/dates";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { logApiError } from "@/utils/logApiError";
import { addMoney, subtractMoney, toMoneyString } from "@/lib/money";
import { getBankAccountsCached } from "@/lib/masterData";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listPageRootClass,
  listPageToolbarButtonClass,
  listPageToolbarSelectClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { RowActionsMenu, type RowActionItem } from "@/components/app/RowActionsMenu";
import {
  FinanceFormDrawer,
  FinanceListToolbar,
  FormSection,
  ScrollTableCard,
  SummaryStrip,
  showingCountLabel,
} from "@/components/finance/kit";

const fieldClass =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-0";
const labelClass = "mb-1 block text-xs font-medium text-text-muted";

const RUN_STATUSES = ["DRAFT", "APPROVED", "PROCESSED", "EXECUTED"] as const;

function statusBadgeClass(status: string) {
  if (status === "DRAFT") return "bg-surface-subtle text-text-secondary";
  if (status === "APPROVED") return "bg-status-info-subtle text-status-info-foreground";
  if (status === "PROCESSED") return "bg-status-warning-subtle text-status-warning-foreground";
  if (status === "EXECUTED") return "bg-status-success-subtle text-status-success-foreground";
  return "bg-surface-subtle text-text-secondary";
}

export function PaymentRunsPage() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<number | string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
  const [baseCurrency, setBaseCurrency] = useState("BDT");
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [form, setForm] = useState<PaymentRunCreate>({
    run_code: "",
    run_date: todayLocalISO(),
    bank_account_id: undefined,
    remarks: "",
    items: [],
  });

  const latest = useLatestRequest();
  const load = useCallback(async () => {
    const token = latest.begin();
    try {
      setSuccess("");
      setError("");
      const [banks, bills, runs] = await Promise.all([
        getBankAccountsCached(),
        api.listOutstandingBills({ bill_type: "PAYABLE" }),
        api.listPaymentRuns(runStatusFilter ? { status_filter: runStatusFilter } : undefined),
      ]);
      if (!latest.isCurrent(token)) return;
      setBankAccounts(banks);
      setPayables(bills.filter((b) => b.status === "OPEN" || b.status === "PARTIAL"));
      setRows(runs);
    } catch (e) {
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
    }
  }, [latest, runStatusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const loadRole = async () => {
      if (!me?.user_id) return;
      try {
        const users = await api.listUsers();
        const mine = users.find((u) => u.id === me.user_id);
        setMyRole((mine?.role_name ?? "").trim().toLowerCase());
      } catch (e) {
        logApiError("PaymentRunsPage.loadRole", e);
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
        const outstanding = Math.max(subtractMoney(b.amount, b.paid_amount), 0);
        const sourceCurrency = (b.currency || baseCurrency).toUpperCase();
        const fxRate = sourceCurrency === baseCurrency.toUpperCase() ? 1 : fxRates[sourceCurrency] || 0;
        const baseAmount = outstanding * fxRate;
        return {
          bill_id: b.id,
          party_name: b.party_name,
          amount: toMoneyString(outstanding),
          source_currency: sourceCurrency,
          fx_rate_to_base: String(fxRate),
          base_amount: toMoneyString(baseAmount),
          reference: b.bill_no,
        };
      });
  }, [payables, selectedBillIds, baseCurrency, fxRates]);

  const selectedSettlementPreview = useMemo(() => {
    let sourceTotal = 0;
    let baseTotal = 0;
    for (const b of payables.filter((bill) => selectedBillIds.includes(bill.id))) {
      const outstanding = Math.max(subtractMoney(b.amount, b.paid_amount), 0);
      sourceTotal = addMoney(sourceTotal, outstanding);
      const srcCurrency = (b.currency || baseCurrency).toUpperCase();
      const rate = srcCurrency === baseCurrency.toUpperCase() ? 1 : fxRates[srcCurrency] || 0;
      baseTotal = addMoney(baseTotal, outstanding * rate);
    }
    return { sourceTotal, baseTotal };
  }, [payables, selectedBillIds, fxRates, baseCurrency]);

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

  function openAdd() {
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setFormError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      setSuccess("");
      if (!selectedItems.length) throw new Error("Please select payable bills");
      if (!form.bank_account_id) throw new Error("Bank account is required for payment run workflow");
      const missingFxItem = selectedItems.find(
        (item) => item.source_currency !== baseCurrency.toUpperCase() && Number(item.fx_rate_to_base) <= 0,
      );
      if (missingFxItem) {
        throw new Error(`FX rate is required for ${missingFxItem.source_currency} settlements`);
      }
      await api.createPaymentRun({ ...form, base_currency: baseCurrency, items: selectedItems });
      setSelectedBillIds([]);
      setForm((p) => ({ ...p, run_code: "", remarks: "", bank_account_id: undefined }));
      setBillSearch("");
      setSuccess("Payment run created in DRAFT status.");
      closeDrawer();
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
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
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Payment Runs"
        description="Batch payable bills through DRAFT - APPROVED - PROCESSED - EXECUTED workflow."
      />

      <FinanceListToolbar
        search={runSearch}
        onSearchChange={setRunSearch}
        searchPlaceholder="Search run code or remarks..."
        filters={
          <select
            aria-label="Run status filter"
            className={listPageToolbarSelectClass}
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
        }
        secondaryActions={
          <button type="button" className={listPageToolbarButtonClass} onClick={() => void load()}>
            Refresh
          </button>
        }
        primaryAction={{ label: "Create payment run", onClick: openAdd }}
      />

      {error ? <div className={listPageErrorClass}>{error}</div> : null}
      {success ? (
        <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-3 py-2.5 text-sm text-status-success-foreground">
          {success}
        </div>
      ) : null}

      <ScrollTableCard maxHeight="main" footer={showingCountLabel(filteredRuns.length, rows.length, "payment run")}>
        <table className={`${listTableBaseClass} min-w-[48rem]`}>
          <thead className={listTableTheadClass}>
            <tr>
              <th className={listTableThClass}>Run Code</th>
              <th className={listTableThClass}>Date</th>
              <th className={listTableThRightClass}>Base Total</th>
              <th className={listTableThClass}>Status</th>
              <th className={listTableThClass}>Voucher</th>
              <th className={listTableThClass}>Items</th>
              <th className={listTableThClass}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRuns.length === 0 ? (
              <tr>
                <td className={listPageEmptyClass} colSpan={7}>
                  No payment runs found for the current filters.
                </td>
              </tr>
            ) : (
              filteredRuns.map((r) => {
                const items: RowActionItem[] = [];
                if (r.status === "DRAFT" && canApproveOrProcess) {
                  items.push({ key: "approve", label: "Approve", onClick: () => void approve(r.id) });
                }
                if (r.status === "APPROVED" && canApproveOrProcess) {
                  items.push({ key: "process", label: "Process", onClick: () => void processRun(r.id) });
                }
                if (r.status === "PROCESSED" && canExecute) {
                  items.push({ key: "execute", label: "Execute", onClick: () => void execute(r.id) });
                }
                items.push({ key: "advice", label: "Open Advice", onClick: () => navigate(`/app/banking/payment-advice?run_id=${r.id}`) });
                return (
                  <tr key={r.id} className={listTableTrClass}>
                    <td className={listTableTdPrimaryClass}>{r.run_code}</td>
                    <td className={listTableTdClass}>{r.run_date}</td>
                    <td className={`${listTableTdClass} text-right`}>
                      {Number(r.total_amount).toLocaleString()} {r.base_currency}
                    </td>
                    <td className={listTableTdClass}>
                      <span className={`rounded px-2 py-1 text-xs ${statusBadgeClass(r.status)}`}>{r.status}</span>
                      {r.status === "EXECUTED" ? <span className="ml-2 text-xs text-status-success">Completed</span> : null}
                      {(r.status === "DRAFT" || r.status === "APPROVED" || r.status === "PROCESSED") && !canApproveOrProcess ? (
                        <span className="ml-2 text-xs text-text-muted">Manager/Admin action</span>
                      ) : null}
                    </td>
                    <td className={listTableTdClass}>{r.executed_voucher_id ? `#${r.executed_voucher_id}` : "-"}</td>
                    <td className={listTableTdClass}>{r.items.length}</td>
                    <td className={listTableTdClass}>
                      <RowActionsMenu
                        rowId={r.id}
                        openId={openActionsId}
                        onOpenChange={setOpenActionsId}
                        menuPortal
                        items={items}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </ScrollTableCard>

      <FinanceFormDrawer
        open={drawerOpen}
        size="xl"
        title="Create Payment Run"
        description={`Selected bills: ${selectedBillIds.length}`}
        onClose={closeDrawer}
        onSubmit={(e) => void submit(e)}
        submitLabel="Create Run (Draft)"
        submitting={saving}
        error={formError ?? undefined}
      >
        <FormSection title="Run details" description="Required: Bank account and at least one payable bill.">
          <div>
            <label className={labelClass} htmlFor="pr-code">Run code (optional)</label>
            <input id="pr-code" className={fieldClass} value={form.run_code ?? ""} onChange={(e) => setForm((p) => ({ ...p, run_code: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="pr-date">Run date</label>
            <input id="pr-date" type="date" className={fieldClass} value={form.run_date} onChange={(e) => setForm((p) => ({ ...p, run_date: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="pr-bank">Bank account *</label>
            <select
              id="pr-bank"
              className={fieldClass}
              value={form.bank_account_id ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, bank_account_id: e.target.value ? Number(e.target.value) : undefined }))}
            >
              <option value="">Select bank account</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.bank_name} - {a.account_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="pr-remarks">Remarks (optional)</label>
            <input id="pr-remarks" className={fieldClass} value={form.remarks ?? ""} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} />
          </div>
        </FormSection>

        <FormSection title="Settlement Preview">
          <label className="text-xs text-text-secondary">
            Base Currency:
            <input
              className="ml-2 w-20 rounded-lg border border-border-strong px-2 py-1 text-xs"
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value.toUpperCase())}
            />
          </label>
          <SummaryStrip
            items={[
              { key: "src", label: "Selected Source Total", value: selectedSettlementPreview.sourceTotal.toLocaleString() },
              {
                key: "base",
                label: `Estimated Base Total (${baseCurrency})`,
                value: selectedSettlementPreview.baseTotal.toLocaleString(),
              },
            ]}
          />
        </FormSection>

        <FormSection
          title="Open Payable Bills"
          actions={
            <input
              className="w-full rounded-lg border border-border-strong px-3 py-1.5 text-sm md:w-64"
              placeholder="Search bill no or party..."
              aria-label="Search payable bills"
              value={billSearch}
              onChange={(e) => setBillSearch(e.target.value)}
            />
          }
        >
          <ScrollTableCard maxHeight="secondary">
            <table className={`${listTableBaseClass} min-w-[40rem]`}>
              <thead className={listTableTheadClass}>
                <tr>
                  <th className={listTableThClass}>Pick</th>
                  <th className={listTableThClass}>Bill</th>
                  <th className={listTableThClass}>Party</th>
                  <th className={listTableThClass}>Source Cur</th>
                  <th className={listTableThRightClass}>Outstanding (Source)</th>
                  <th className={listTableThRightClass}>FX to {baseCurrency}</th>
                  <th className={listTableThRightClass}>Base Equivalent</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayables.map((b) => {
                  const outstanding = Math.max(subtractMoney(b.amount, b.paid_amount), 0);
                  const sourceCurrency = (b.currency || baseCurrency).toUpperCase();
                  const fx = sourceCurrency === baseCurrency.toUpperCase() ? 1 : fxRates[sourceCurrency] || 0;
                  const baseEquivalent = outstanding * fx;
                  return (
                    <tr key={b.id} className={listTableTrClass}>
                      <td className={listTableTdClass}>
                        <input
                          type="checkbox"
                          aria-label={`Pick ${b.bill_no}`}
                          checked={selectedBillIds.includes(b.id)}
                          onChange={(e) =>
                            setSelectedBillIds((prev) =>
                              e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id),
                            )
                          }
                        />
                      </td>
                      <td className={listTableTdPrimaryClass}>{b.bill_no}</td>
                      <td className={listTableTdClass}>{b.party_name}</td>
                      <td className={listTableTdClass}>{sourceCurrency}</td>
                      <td className={`${listTableTdClass} text-right`}>{outstanding.toLocaleString()}</td>
                      <td className={`${listTableTdClass} text-right`}>
                        {sourceCurrency === baseCurrency.toUpperCase() ? (
                          "1.0000"
                        ) : (
                          <input
                            type="number"
                            step="0.0001"
                            className="w-20 rounded-lg border border-border-strong px-1.5 py-1 text-right text-xs"
                            value={fxRates[sourceCurrency] ?? ""}
                            onChange={(e) =>
                              setFxRates((prev) => ({
                                ...prev,
                                [sourceCurrency]: e.target.value ? Number(e.target.value) : 0,
                              }))
                            }
                          />
                        )}
                      </td>
                      <td className={`${listTableTdClass} text-right`}>{baseEquivalent.toLocaleString()}</td>
                    </tr>
                  );
                })}
                {filteredPayables.length === 0 ? (
                  <tr>
                    <td className={listPageEmptyClass} colSpan={7}>
                      No open payable bills for the current search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </ScrollTableCard>
        </FormSection>
      </FinanceFormDrawer>
    </div>
  );
}
