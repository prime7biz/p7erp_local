import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, type FxReceiptCreate, type FxReceiptResponse, type FxUnsettledSummaryResponse } from "@/api/client";
import { todayLocalISO } from "@/lib/dates";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listPageLoadingClass,
  listPageRootClass,
  listPageToolbarSelectClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
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

export function FxReceiptsPage() {
  const [rows, setRows] = useState<FxReceiptResponse[]>([]);
  const [summary, setSummary] = useState<FxUnsettledSummaryResponse | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [settleMap, setSettleMap] = useState<Record<number, string>>({});
  const [form, setForm] = useState<FxReceiptCreate>({
    receipt_no: "",
    receipt_date: todayLocalISO(),
    source_ref: "",
    currency: "USD",
    fc_amount: "0",
    rate_to_base: "120",
    notes: "",
  });

  const latest = useLatestRequest();
  const load = useCallback(async () => {
    const token = latest.begin();
    setLoading(true);
    setError("");
    try {
      const [fx, s] = await Promise.all([api.listFxReceipts(statusFilter ? { status_filter: statusFilter } : undefined), api.getFxUnsettledSummary()]);
      if (!latest.isCurrent(token)) return;
      setRows(fx);
      setSummary(s);
    } catch (e) {
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
    } finally {
      if (latest.isCurrent(token)) setLoading(false);
    }
  }, [latest, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

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
      await api.createFxReceipt(form);
      setForm((p) => ({ ...p, receipt_no: "", source_ref: "", fc_amount: "0", notes: "" }));
      closeDrawer();
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function settle(id: number) {
    try {
      await api.settleFxReceipt(id, settleMap[id] || "0");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className={listPageRootClass}>
      <AppPageHeader title="FX Receipts & Settlement" description="Track foreign currency receipts and settlement workflow." />

      {summary ? (
        <SummaryStrip
          items={[
            { key: "total", label: "Total Base", value: summary.total_base_amount.toLocaleString() },
            { key: "settled", label: "Total Settled", value: summary.total_settled_amount.toLocaleString(), tone: "success" },
            { key: "unsettled", label: "Unsettled", value: summary.total_unsettled_amount.toLocaleString(), tone: "warning" },
          ]}
        />
      ) : null}

      <FinanceListToolbar
        filters={
          <select
            aria-label="Receipt status filter"
            className={listPageToolbarSelectClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="OPEN">OPEN</option>
            <option value="PARTIAL">PARTIAL</option>
            <option value="SETTLED">SETTLED</option>
          </select>
        }
        primaryAction={{ label: "Create receipt", onClick: openAdd }}
      />

      {error ? <div className={listPageErrorClass}>{error}</div> : null}

      <ScrollTableCard maxHeight="main" footer={showingCountLabel(rows.length, rows.length, "receipt")}>
        <table className={`${listTableBaseClass} min-w-[44rem]`}>
          <thead className={listTableTheadClass}>
            <tr>
              <th className={listTableThClass}>Receipt</th>
              <th className={listTableThClass}>Date</th>
              <th className={listTableThClass}>FC Amount</th>
              <th className={listTableThClass}>Base Amount</th>
              <th className={listTableThClass}>Settled</th>
              <th className={listTableThClass}>Status</th>
              <th className={listTableThClass}>Settle</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={listPageLoadingClass} colSpan={7}>
                  Loading FX receipts...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className={listPageEmptyClass} colSpan={7}>
                  No FX receipts found.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className={listTableTrClass}>
                  <td className={listTableTdPrimaryClass}>{r.receipt_no}</td>
                  <td className={listTableTdClass}>{r.receipt_date}</td>
                  <td className={listTableTdClass}>
                    {Number(r.fc_amount).toLocaleString()} {r.currency}
                  </td>
                  <td className={listTableTdClass}>{Number(r.base_amount).toLocaleString()}</td>
                  <td className={listTableTdClass}>{Number(r.settled_amount).toLocaleString()}</td>
                  <td className={listTableTdClass}>{r.status}</td>
                  <td className={listTableTdClass}>
                    <div className="flex gap-2">
                      <input
                        className="w-24 rounded-lg border border-border-strong bg-surface-raised px-2 py-1 text-xs"
                        placeholder="Amount"
                        aria-label={`Settle amount for ${r.receipt_no}`}
                        value={settleMap[r.id] ?? ""}
                        onChange={(e) => setSettleMap((p) => ({ ...p, [r.id]: e.target.value }))}
                      />
                      <button type="button" className="rounded-lg border border-border-strong px-2 py-1 text-xs" onClick={() => void settle(r.id)}>
                        Settle
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollTableCard>

      <FinanceFormDrawer
        open={drawerOpen}
        title="Create FX receipt"
        onClose={closeDrawer}
        onSubmit={(e) => void submit(e)}
        submitLabel="Create Receipt"
        submitting={saving}
        error={formError ?? undefined}
      >
        <FormSection title="Receipt">
          <div>
            <label className={labelClass} htmlFor="fx-no">Receipt No (optional)</label>
            <input id="fx-no" className={fieldClass} value={form.receipt_no} onChange={(e) => setForm((p) => ({ ...p, receipt_no: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="fx-date">Receipt date</label>
            <input id="fx-date" type="date" className={fieldClass} value={form.receipt_date} onChange={(e) => setForm((p) => ({ ...p, receipt_date: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="fx-src">Source Ref</label>
            <input id="fx-src" className={fieldClass} value={form.source_ref} onChange={(e) => setForm((p) => ({ ...p, source_ref: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="fx-notes">Notes</label>
            <input id="fx-notes" className={fieldClass} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
        </FormSection>
        <FormSection title="Amount and rate">
          <div>
            <label className={labelClass} htmlFor="fx-cur">Currency</label>
            <input id="fx-cur" className={fieldClass} value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="fx-fc">FC Amount</label>
            <input id="fx-fc" className={fieldClass} value={form.fc_amount} onChange={(e) => setForm((p) => ({ ...p, fc_amount: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass} htmlFor="fx-rate">Rate to Base</label>
            <input id="fx-rate" className={fieldClass} value={form.rate_to_base} onChange={(e) => setForm((p) => ({ ...p, rate_to_base: e.target.value }))} />
          </div>
        </FormSection>
      </FinanceFormDrawer>
    </div>
  );
}
