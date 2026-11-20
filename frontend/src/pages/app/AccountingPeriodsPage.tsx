import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, type AccountingPeriodCreate, type AccountingPeriodResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listPageFilterBarClass,
  listPageRootClass,
  listPageTableCardClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { FinanceFormDrawer, FormSection } from "@/components/finance/kit";
import { logApiError } from "@/utils/logApiError";
import { startOfMonthLocalISO, todayLocalISO } from "@/lib/dates";

const fieldClass =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-0";
const labelClass = "mb-1 block text-xs font-medium text-text-muted";

function defaultForm(): AccountingPeriodCreate {
  return {
    period_name: "",
    start_date: startOfMonthLocalISO(),
    end_date: todayLocalISO(),
  };
}

export function AccountingPeriodsPage() {
  const [rows, setRows] = useState<AccountingPeriodResponse[]>([]);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [lockDate, setLockDate] = useState(todayLocalISO());
  const [lockInfo, setLockInfo] = useState<{
    locked: boolean;
    reason?: string;
    period_id?: number;
    period_name?: string;
  } | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AccountingPeriodCreate>(defaultForm);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [rows]);

  async function load() {
    try {
      setError("");
      setRows(await api.listAccountingPeriods());
    } catch (e) {
      logApiError("AccountingPeriodsPage.load", e);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function closeDrawer() {
    setDrawerOpen(false);
    setFormError(null);
    setForm(defaultForm());
  }

  function openAdd() {
    setFormError(null);
    setForm(defaultForm());
    setDrawerOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (!form.period_name.trim()) throw new Error("Period name is required");
      await api.createAccountingPeriod(form);
      closeDrawer();
      await load();
    } catch (err) {
      logApiError("AccountingPeriodsPage.createAccountingPeriod", err);
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function closePeriod(id: number) {
    try {
      await api.closeAccountingPeriod(id);
      await load();
    } catch (e) {
      logApiError("AccountingPeriodsPage.closeAccountingPeriod", e);
      setError((e as Error).message);
    }
  }

  async function reopenPeriod(id: number) {
    try {
      await api.reopenAccountingPeriod(id);
      await load();
    } catch (e) {
      logApiError("AccountingPeriodsPage.reopenAccountingPeriod", e);
      setError((e as Error).message);
    }
  }

  async function deletePeriod(id: number) {
    try {
      await api.deleteAccountingPeriod(id);
      await load();
    } catch (e) {
      logApiError("AccountingPeriodsPage.deleteAccountingPeriod", e);
      setError((e as Error).message);
    }
  }

  async function checkLock() {
    try {
      setError("");
      setLockInfo(await api.checkAccountingPeriodLock(lockDate));
    } catch (e) {
      logApiError("AccountingPeriodsPage.checkAccountingPeriodLock", e);
      setError((e as Error).message);
    }
  }

  const today = todayLocalISO();

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Accounting Periods"
        description="Posting is blocked when a voucher date is outside any open period."
      />

      {error ? <div className={listPageErrorClass}>{error}</div> : null}

      {sorted.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h2 className="mb-3 text-sm font-semibold text-text-secondary">Timeline</h2>
          <div className="flex flex-wrap gap-2">
            {sorted.map((r) => {
              const isFuture = r.start_date > today;
              return (
                <div
                  key={r.id}
                  className={`min-w-[8rem] rounded-lg border px-3 py-2 text-xs ${
                    r.is_closed
                      ? "border-border bg-surface-subtle text-text-muted"
                      : isFuture
                        ? "border-dashed border-border text-text-secondary"
                        : "border-status-success/40 bg-status-success-subtle"
                  }`}
                  title={`${r.start_date} → ${r.end_date}`}
                >
                  <div className="font-semibold text-text-primary">{r.period_name}</div>
                  <div className="mt-0.5">{r.is_closed ? "Closed" : isFuture ? "Future" : "Open"}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 rounded-xl border border-border bg-surface-raised p-4 md:grid-cols-4">
        <input
          type="date"
          className="rounded border px-3 py-2 text-sm"
          value={lockDate}
          onChange={(e) => setLockDate(e.target.value)}
        />
        <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => void checkLock()}>
          Check Date Lock
        </button>
        <div className="rounded border bg-surface-subtle px-3 py-2 text-sm md:col-span-2">
          {lockInfo
            ? lockInfo.locked
              ? `Locked: ${lockInfo.reason ?? "Period closed"}`
              : `Open: ${lockInfo.period_name ?? "Available period"}`
            : "No check yet."}
        </div>
      </div>

      <div className={listPageFilterBarClass}>
        <span className="text-sm text-text-muted">Accounting periods control when vouchers can be posted.</span>
        <button
          type="button"
          onClick={openAdd}
          className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90 sm:ml-auto"
        >
          Add period
        </button>
      </div>

      <div className={listPageTableCardClass}>
        <div className="max-h-[28rem] overflow-auto">
          <table className={`${listTableBaseClass} min-w-[40rem]`}>
            <thead className={listTableTheadClass}>
              <tr>
                <th className={listTableThClass}>Name</th>
                <th className={listTableThClass}>Start</th>
                <th className={listTableThClass}>End</th>
                <th className={listTableThClass}>Status</th>
                <th className={listTableThClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className={listPageEmptyClass} colSpan={5}>
                    No accounting periods yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className={listTableTrClass}>
                    <td className={listTableTdPrimaryClass}>{r.period_name}</td>
                    <td className={listTableTdClass}>{r.start_date}</td>
                    <td className={listTableTdClass}>{r.end_date}</td>
                    <td className={listTableTdClass}>{r.is_closed ? "CLOSED" : "OPEN"}</td>
                    <td className={listTableTdClass}>
                      <RowActionsMenu
                        rowId={r.id}
                        openId={openActionsId}
                        onOpenChange={setOpenActionsId}
                        menuPortal
                        items={[
                          r.is_closed
                            ? { key: "reopen", label: "Reopen", onClick: () => void reopenPeriod(r.id) }
                            : { key: "close", label: "Close", onClick: () => void closePeriod(r.id) },
                          { key: "delete", label: "Delete", danger: true, onClick: () => void deletePeriod(r.id) },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 py-2 text-xs text-text-muted">
          Showing {rows.length} period{rows.length === 1 ? "" : "s"}
        </div>
      </div>

      <FinanceFormDrawer
        open={drawerOpen}
        title="Add period"
        description="Create a new open accounting period. Periods cannot be edited after create — close, reopen, or delete instead."
        onClose={closeDrawer}
        onSubmit={(e) => void submit(e)}
        submitLabel="Create Period"
        submitting={saving}
        error={formError ?? undefined}
      >
        <FormSection title="Period">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="ap-name">
            Period name *
          </label>
          <input
            id="ap-name"
            className={fieldClass}
            placeholder="Period name (e.g. Mar-2026)"
            value={form.period_name}
            onChange={(e) => setForm((p) => ({ ...p, period_name: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="ap-start">
            Start date
          </label>
          <input
            id="ap-start"
            type="date"
            className={fieldClass}
            value={form.start_date}
            onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="ap-end">
            End date
          </label>
          <input
            id="ap-end"
            type="date"
            className={fieldClass}
            value={form.end_date}
            onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
          />
        </div>
        </FormSection>
      </FinanceFormDrawer>
    </div>
  );
}
