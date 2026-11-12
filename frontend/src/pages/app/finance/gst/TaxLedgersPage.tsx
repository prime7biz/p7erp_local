import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ChartOfAccountResponse, type TaxLedgerResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { listPageRootClass } from "@/components/app/listPageLayout";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { logApiError } from "@/utils/logApiError";
import { getChartOfAccountsCached } from "@/lib/masterData";

const TAX_TYPES = ["CGST", "SGST", "IGST", "UTGST", "VAT", "CST"] as const;

export function TaxLedgersPage() {
  const [rows, setRows] = useState<TaxLedgerResponse[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [error, setError] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | string | null>(null);
  const [form, setForm] = useState({
    chart_account_id: "",
    tax_type: "CGST",
    tax_rate: "9",
    gst_type: "GOODS",
    nature_of_transaction: "",
  });

  async function load() {
    try {
      setError("");
      const [ledgers, coa] = await Promise.all([
        api.listTaxLedgers({ active_only: false }),
        getChartOfAccountsCached({ active_only: true }),
      ]);
      setRows(ledgers);
      setAccounts(coa);
    } catch (e) {
      logApiError("TaxLedgersPage.load", e);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    try {
      setError("");
      await api.createTaxLedger({
        chart_account_id: Number(form.chart_account_id),
        tax_type: form.tax_type,
        tax_rate: form.tax_rate,
        gst_type: form.gst_type,
        nature_of_transaction: form.nature_of_transaction || null,
      });
      setForm((p) => ({ ...p, nature_of_transaction: "" }));
      await load();
    } catch (err) {
      logApiError("TaxLedgersPage.create", err);
      setError((err as Error).message);
    }
  }

  async function deactivate(id: number) {
    try {
      await api.deactivateTaxLedger(id);
      await load();
    } catch (err) {
      logApiError("TaxLedgersPage.deactivate", err);
      setError((err as Error).message);
    }
  }

  const acctName = new Map(accounts.map((a) => [a.id, `${a.account_number} — ${a.name}`]));

  return (
    <div className={`${listPageRootClass} p-4 md:p-6`}>
      <AppPageHeader
        title="Tax Ledgers"
        description="Map CGST/SGST/IGST (and VAT) rates to chart accounts. Duplicate type+rate is blocked."
        actions={
          <Link
            to="/app/finance/gst/settings"
            className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
          >
            Tax settings
          </Link>
        }
      />

      {error ? (
        <p className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={onCreate}
        className="grid gap-2 rounded-lg border border-border bg-surface-raised p-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <label className="text-xs text-text-muted lg:col-span-2">
          Account
          <select
            className="mt-1 block w-full rounded-lg border border-border-strong px-2 py-1.5 text-sm"
            value={form.chart_account_id}
            onChange={(e) => setForm((p) => ({ ...p, chart_account_id: e.target.value }))}
            required
          >
            <option value="">Select…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_number} — {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-text-muted">
          Tax type
          <select
            className="mt-1 block w-full rounded-lg border border-border-strong px-2 py-1.5 text-sm"
            value={form.tax_type}
            onChange={(e) => setForm((p) => ({ ...p, tax_type: e.target.value }))}
          >
            {TAX_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-text-muted">
          Rate %
          <input
            className="mt-1 block w-full rounded-lg border border-border-strong px-2 py-1.5 text-sm"
            value={form.tax_rate}
            onChange={(e) => setForm((p) => ({ ...p, tax_rate: e.target.value }))}
            required
          />
        </label>
        <label className="text-xs text-text-muted">
          GST type
          <select
            className="mt-1 block w-full rounded-lg border border-border-strong px-2 py-1.5 text-sm"
            value={form.gst_type}
            onChange={(e) => setForm((p) => ({ ...p, gst_type: e.target.value }))}
          >
            <option value="GOODS">GOODS</option>
            <option value="SERVICES">SERVICES</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="w-full rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-medium text-brand-primary-foreground hover:opacity-95"
          >
            Add
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface-raised">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-surface-subtle text-xs uppercase text-text-muted">
            <tr>
              <th className="px-3 py-2">Tax type</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2">GST type</th>
              <th className="px-3 py-2">Nature</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border-subtle">
                <td className="px-3 py-2 font-medium">{r.tax_type}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.tax_rate}%</td>
                <td className="px-3 py-2">{r.gst_type}</td>
                <td className="px-3 py-2 text-text-muted">{r.nature_of_transaction ?? "—"}</td>
                <td className="px-3 py-2">{acctName.get(r.chart_account_id) ?? `#${r.chart_account_id}`}</td>
                <td className="px-3 py-2">{r.is_active ? "Active" : "Inactive"}</td>
                <td className="px-3 py-2">
                  <RowActionsMenu
                    rowId={r.id}
                    openId={openActionsId}
                    onOpenChange={setOpenActionsId}
                    items={
                      r.is_active
                        ? [{ key: "deactivate", label: "Deactivate", danger: true, onClick: () => void deactivate(r.id) }]
                        : [{ key: "inactive", label: "Inactive", disabled: true }]
                    }
                  />
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-text-muted">
                  No tax ledgers yet. Create CGST 9%, SGST 9%, and IGST 18% to start.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
