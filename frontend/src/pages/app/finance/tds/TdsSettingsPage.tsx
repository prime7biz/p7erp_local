import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type ChartOfAccountResponse,
  type TdsSectionBody,
  type TdsSectionResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";
import { getChartOfAccountsCached } from "@/lib/masterData";

const emptySectionForm = (): TdsSectionBody & { id?: number } => ({
  section_code: "",
  description: "",
  threshold_amount: "0",
  tds_rate: "0",
  rate_company: "",
  rate_non_company: "",
  is_active: true,
});

export function TdsSettingsPage() {
  const [rows, setRows] = useState<TdsSectionResponse[]>([]);
  const [accounts, setAccounts] = useState<ChartOfAccountResponse[]>([]);
  const [tdsPayableAccountId, setTdsPayableAccountId] = useState("");
  const [form, setForm] = useState(emptySectionForm());
  const [assignPartyLedgerId, setAssignPartyLedgerId] = useState("");
  const [assignSectionId, setAssignSectionId] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      setError("");
      const [sections, settings, coa] = await Promise.all([
        api.listTdsSections(),
        api.getTdsSettings(),
        getChartOfAccountsCached({ active_only: true }),
      ]);
      setRows(sections.rows);
      setAccounts(coa);
      setTdsPayableAccountId(settings.tds_payable_account_id != null ? String(settings.tds_payable_account_id) : "");
    } catch (e) {
      logApiError("TdsSettingsPage.load", e);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    function onDoc(ev: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(ev.target as Node)) {
        setOpenActionsId(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function startEdit(row: TdsSectionResponse) {
    setForm({
      id: row.id,
      section_code: row.section_code,
      description: row.description ?? "",
      threshold_amount: row.threshold_amount,
      tds_rate: row.tds_rate,
      rate_company: row.rate_company ?? "",
      rate_non_company: row.rate_non_company ?? "",
      is_active: row.is_active,
    });
    setOpenActionsId(null);
  }

  async function onSaveSection(e: FormEvent) {
    e.preventDefault();
    try {
      setError("");
      setMsg("");
      const body: TdsSectionBody = {
        section_code: form.section_code.trim(),
        description: form.description?.trim() || null,
        threshold_amount: form.threshold_amount,
        tds_rate: form.tds_rate,
        rate_company: form.rate_company ? form.rate_company : null,
        rate_non_company: form.rate_non_company ? form.rate_non_company : null,
        is_active: form.is_active ?? true,
      };
      if (form.id) {
        await api.updateTdsSection(form.id, body);
        setMsg("Section updated.");
      } else {
        await api.createTdsSection(body);
        setMsg("Section created.");
      }
      setForm(emptySectionForm());
      await load();
    } catch (err) {
      logApiError("TdsSettingsPage.saveSection", err);
      setError((err as Error).message);
    }
  }

  async function onSaveSettings(e: FormEvent) {
    e.preventDefault();
    try {
      setError("");
      setMsg("");
      await api.updateTdsSettings({
        tds_payable_account_id: tdsPayableAccountId ? Number(tdsPayableAccountId) : null,
      });
      setMsg("TDS settings saved.");
    } catch (err) {
      logApiError("TdsSettingsPage.saveSettings", err);
      setError((err as Error).message);
    }
  }

  async function onAssignSection(e: FormEvent) {
    e.preventDefault();
    const plId = Number(assignPartyLedgerId);
    if (!Number.isFinite(plId)) {
      setError("Enter a valid party ledger ID.");
      return;
    }
    try {
      setError("");
      setMsg("");
      await api.assignPartyLedgerTdsSection(plId, assignSectionId ? Number(assignSectionId) : null);
      setMsg(`TDS section assigned to party ledger #${plId}.`);
      setAssignPartyLedgerId("");
      setAssignSectionId("");
    } catch (err) {
      logApiError("TdsSettingsPage.assignSection", err);
      setError((err as Error).message);
    }
  }

  const acctLabel = new Map(accounts.map((a) => [a.id, `${a.account_number} — ${a.name}`]));

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="TDS Settings"
        description="Configure TDS sections, payable GL account, and party-level section assignment."
        actions={
          <Link
            to="/app/finance/tds/reports"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            TDS Reports
          </Link>
        }
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{msg}</p>
      ) : null}

      <form onSubmit={onSaveSettings} className="rounded-lg border border-gray-200 bg-white p-3 space-y-2 max-w-xl">
        <p className="text-xs font-semibold uppercase text-gray-500">Global settings</p>
        <label className="block text-xs text-gray-600">
          TDS payable account
          <select
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={tdsPayableAccountId}
            onChange={(e) => setTdsPayableAccountId(e.target.value)}
          >
            <option value="">Not set</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.account_number} — {a.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Save settings
        </button>
      </form>

      <form
        onSubmit={onSaveSection}
        className="grid gap-2 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <p className="text-xs font-semibold uppercase text-gray-500 lg:col-span-4">
          {form.id ? `Edit section #${form.id}` : "New TDS section"}
        </p>
        <label className="text-xs text-gray-600">
          Section code
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm uppercase"
            value={form.section_code}
            onChange={(e) => setForm((p) => ({ ...p, section_code: e.target.value }))}
            placeholder="194C"
            required
          />
        </label>
        <label className="text-xs text-gray-600 lg:col-span-2">
          Description
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.description ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />
        </label>
        <label className="text-xs text-gray-600">
          Threshold
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.threshold_amount ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, threshold_amount: e.target.value }))}
            required
          />
        </label>
        <label className="text-xs text-gray-600">
          TDS rate %
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.tds_rate ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, tds_rate: e.target.value }))}
            required
          />
        </label>
        <label className="text-xs text-gray-600">
          Rate (company) %
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.rate_company ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, rate_company: e.target.value }))}
          />
        </label>
        <label className="text-xs text-gray-600">
          Rate (non-company) %
          <input
            className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={form.rate_non_company ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, rate_non_company: e.target.value }))}
          />
        </label>
        <label className="flex items-end gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={form.is_active !== false}
            onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
          />
          Active
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            {form.id ? "Update" : "Create"}
          </button>
          {form.id ? (
            <button
              type="button"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              onClick={() => setForm(emptySectionForm())}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 text-right">Threshold</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium">{r.section_code}</td>
                <td className="px-3 py-2 text-gray-600">{r.description ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.threshold_amount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.tds_rate}%</td>
                <td className="px-3 py-2">{r.is_active ? "Active" : "Inactive"}</td>
                <td className="relative px-3 py-2">
                  <div ref={openActionsId === r.id ? actionsRef : undefined} className="relative inline-block">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      onClick={() => setOpenActionsId(openActionsId === r.id ? null : r.id)}
                    >
                      Actions
                    </button>
                    {openActionsId === r.id ? (
                      <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => startEdit(r)}
                        >
                          Edit
                        </button>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-500">
                  No TDS sections yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <form onSubmit={onAssignSection} className="rounded-lg border border-gray-200 bg-white p-3 space-y-2 max-w-xl">
        <p className="text-xs font-semibold uppercase text-gray-500">Assign section to party ledger</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-gray-600">
            Party ledger ID
            <input
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={assignPartyLedgerId}
              onChange={(e) => setAssignPartyLedgerId(e.target.value)}
              placeholder="e.g. 12"
            />
          </label>
          <label className="text-xs text-gray-600">
            TDS section
            <select
              className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={assignSectionId}
              onChange={(e) => setAssignSectionId(e.target.value)}
            >
              <option value="">Clear assignment</option>
              {rows.filter((r) => r.is_active).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.section_code} — {r.description ?? "No description"}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
          Assign
        </button>
        <p className="text-xs text-gray-500">
          Tip: open a party ledger detail page to see its assigned section. Payable account:{" "}
          {tdsPayableAccountId ? acctLabel.get(Number(tdsPayableAccountId)) ?? `#${tdsPayableAccountId}` : "not set"}.
        </p>
      </form>
    </div>
  );
}
