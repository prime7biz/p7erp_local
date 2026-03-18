import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, type ChartOfAccountCreate, type ChartOfAccountResponse, type AccountGroupResponse, type CoAConfigResponse } from "@/api/client";
import { downloadCsv } from "@/lib/reportExport";

const defaultForm: ChartOfAccountCreate = {
  account_number: "",
  name: "",
  group_id: 0,
  normal_balance: "debit",
  opening_balance: "0",
  description: "",
  is_active: true,
  is_bank_account: false,
  account_type: "posting",
  reporting_code: "",
  display_order: 0,
  statistical_unit: "",
  parent_account_id: null,
  last_reviewed_at: "",
};

export function ChartOfAccountsPage() {
  const [groups, setGroups] = useState<AccountGroupResponse[]>([]);
  const [rows, setRows] = useState<ChartOfAccountResponse[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCoaConfig, setShowCoaConfig] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [coaConfig, setCoaConfig] = useState<CoAConfigResponse | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importConflict, setImportConflict] = useState<"skip" | "update" | "abort">("skip");
  const [importResult, setImportResult] = useState<{ ok: boolean; groups_created: number; groups_updated: number; accounts_created: number; accounts_updated: number; errors: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState<ChartOfAccountCreate>({ ...defaultForm });

  async function load() {
    setLoading(true);
    try {
      const [g, a] = await Promise.all([api.listAccountGroups(), api.listChartOfAccounts({ active_only: !showInactive })]);
      setGroups(g);
      setRows(a);
      if (!form.group_id && g.length > 0) {
        const firstGroup = g[0];
        if (firstGroup) {
          setForm((p) => ({ ...p, group_id: firstGroup.id }));
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  useEffect(() => {
    if (showCoaConfig) {
      api.getCoaConfig().then(setCoaConfig).catch(() => setCoaConfig(null));
    }
  }, [showCoaConfig]);

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (!form.name?.trim()) throw new Error("Ledger name is required");
      if (!form.group_id) throw new Error("Please select a group");
      const payload: ChartOfAccountCreate = {
        ...form,
        last_reviewed_at: form.last_reviewed_at?.trim() || undefined,
        reporting_code: form.reporting_code?.trim() || undefined,
        statistical_unit: form.statistical_unit?.trim() || undefined,
      };
      if (editingId) {
        await api.updateChartOfAccount(editingId, payload);
      } else {
        await api.createChartOfAccount(payload);
      }
      setEditingId(null);
      setForm({ ...defaultForm, group_id: form.group_id });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function startEdit(row: ChartOfAccountResponse) {
    setEditingId(row.id);
    setForm({
      account_number: row.account_number,
      name: row.name,
      group_id: row.group_id,
      normal_balance: row.normal_balance,
      opening_balance: row.opening_balance,
      description: row.description,
      is_active: row.is_active,
      is_bank_account: row.is_bank_account,
    });
  }

  async function remove(id: number) {
    if (!window.confirm("Delete this ledger account?")) return;
    try {
      await api.deleteChartOfAccount(id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleExport() {
    setError(null);
    try {
      const csv = await api.coaExport();
      downloadCsv(csv, "coa_export");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleImport() {
    if (!importFile) {
      setError("Select a CSV file first.");
      return;
    }
    setError(null);
    setImportResult(null);
    try {
      const result = await api.coaImport(importFile, importConflict);
      setImportResult(result);
      if (result.ok) await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function saveCoaConfig() {
    if (!coaConfig) return;
    setError(null);
    try {
      const updated = await api.putCoaConfig({
        account_number_prefix: coaConfig.account_number_prefix,
        account_number_width: coaConfig.account_number_width,
        group_code_prefix: coaConfig.group_code_prefix,
        group_code_width: coaConfig.group_code_width,
        allow_manual_account_number: coaConfig.allow_manual_account_number,
        max_group_depth: coaConfig.max_group_depth,
        max_account_depth: coaConfig.max_account_depth,
        validate_normal_balance: coaConfig.validate_normal_balance,
      });
      setCoaConfig(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Chart of Accounts</h1>
          <p className="mt-1 text-sm text-text-muted">Ledger accounts, opening balances, and group-based classification.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="rounded border border-border-strong bg-surface-raised px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
          >
            Export CoA
          </button>
          <button
            type="button"
            onClick={() => setShowImport((i) => !i)}
            className="rounded border border-border-strong bg-surface-raised px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
          >
            Import CoA
          </button>
          <button
            type="button"
            onClick={() => setShowCoaConfig((c) => !c)}
            className="rounded border border-border-strong bg-surface-raised px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
          >
            CoA settings
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show Inactive
          </label>
        </div>
      </div>

      {showImport && (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h3 className="mb-2 text-sm font-medium text-text-primary">Import Chart of Accounts (CSV)</h3>
          <div className="flex flex-wrap items-end gap-3">
            <input
              type="file"
              accept=".csv"
              className="text-sm"
              onChange={(e) => {
                setImportFile(e.target.files?.[0] ?? null);
                setImportResult(null);
              }}
            />
            <select
              className="rounded border px-2 py-1.5 text-sm"
              value={importConflict}
              onChange={(e) => setImportConflict(e.target.value as "skip" | "update" | "abort")}
            >
              <option value="skip">Skip existing</option>
              <option value="update">Update existing</option>
              <option value="abort">Abort on conflict</option>
            </select>
            <button
              type="button"
              onClick={() => void handleImport()}
              className="rounded bg-surface-inverse px-3 py-1.5 text-sm text-brand-primary-foreground hover:bg-surface-inverse/90"
            >
              Import
            </button>
          </div>
          {importResult && (
            <div className="mt-3 rounded border border-border-subtle bg-surface-subtle p-2 text-sm">
              {importResult.ok ? (
                <p className="text-text-secondary">
                  Done. Groups: {importResult.groups_created} created, {importResult.groups_updated} updated. Accounts: {importResult.accounts_created} created, {importResult.accounts_updated} updated.
                  {importResult.errors.length > 0 && ` Warnings: ${importResult.errors.join("; ")}`}
                </p>
              ) : (
                <p className="text-status-danger-foreground">Import failed. {importResult.errors.join("; ")}</p>
              )}
            </div>
          )}
        </div>
      )}

      {showCoaConfig && coaConfig && (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h3 className="mb-3 text-sm font-medium text-text-primary">CoA code format (admin)</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs text-text-muted">Account number prefix</label>
              <input
                className="w-full rounded border px-2 py-1.5 text-sm"
                value={coaConfig.account_number_prefix}
                onChange={(e) => setCoaConfig((c) => c ? { ...c, account_number_prefix: e.target.value } : c)}
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Account number width</label>
              <input
                type="number"
                min={1}
                max={8}
                className="w-full rounded border px-2 py-1.5 text-sm"
                value={coaConfig.account_number_width}
                onChange={(e) => setCoaConfig((c) => c ? { ...c, account_number_width: Number(e.target.value) || 4 } : c)}
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Group code prefix</label>
              <input
                className="w-full rounded border px-2 py-1.5 text-sm"
                value={coaConfig.group_code_prefix}
                onChange={(e) => setCoaConfig((c) => c ? { ...c, group_code_prefix: e.target.value } : c)}
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Group code width</label>
              <input
                type="number"
                min={1}
                max={8}
                className="w-full rounded border px-2 py-1.5 text-sm"
                value={coaConfig.group_code_width}
                onChange={(e) => setCoaConfig((c) => c ? { ...c, group_code_width: Number(e.target.value) || 4 } : c)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={coaConfig.allow_manual_account_number}
                onChange={(e) => setCoaConfig((c) => c ? { ...c, allow_manual_account_number: e.target.checked } : c)}
              />
              Allow manual account number
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={coaConfig.validate_normal_balance}
                onChange={(e) => setCoaConfig((c) => c ? { ...c, validate_normal_balance: e.target.checked } : c)}
              />
              Validate normal balance vs group
            </label>
            <div>
              <label className="text-xs text-text-muted">Max group depth (optional)</label>
              <input
                type="number"
                min={0}
                className="w-full rounded border px-2 py-1.5 text-sm"
                value={coaConfig.max_group_depth ?? ""}
                onChange={(e) => setCoaConfig((c) => c ? { ...c, max_group_depth: e.target.value ? Number(e.target.value) : null } : c)}
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Max account depth (optional)</label>
              <input
                type="number"
                min={0}
                className="w-full rounded border px-2 py-1.5 text-sm"
                value={coaConfig.max_account_depth ?? ""}
                onChange={(e) => setCoaConfig((c) => c ? { ...c, max_account_depth: e.target.value ? Number(e.target.value) : null } : c)}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void saveCoaConfig()}
            className="mt-3 rounded bg-surface-inverse px-3 py-1.5 text-sm text-brand-primary-foreground hover:bg-surface-inverse/90"
          >
            Save CoA settings
          </button>
        </div>
      )}

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-muted">Account Number</label>
          <input
            className="rounded border bg-surface-subtle px-3 py-2 text-sm"
            readOnly
            placeholder="Auto-generated"
            value={editingId ? form.account_number : ""}
          />
        </div>
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Ledger Name"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
        />
        <select
          className="rounded border px-3 py-2 text-sm"
          value={form.group_id}
          onChange={(e) => setForm((p) => ({ ...p, group_id: Number(e.target.value) }))}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <input
          className="rounded border px-3 py-2 text-sm"
          placeholder="Opening Balance"
          value={form.opening_balance}
          onChange={(e) => setForm((p) => ({ ...p, opening_balance: e.target.value }))}
        />
        <select
          className="rounded border px-3 py-2 text-sm"
          value={form.normal_balance}
          onChange={(e) => setForm((p) => ({ ...p, normal_balance: e.target.value as "debit" | "credit" }))}
        >
          <option value="debit">Debit</option>
          <option value="credit">Credit</option>
        </select>
        <input
          className="rounded border px-3 py-2 text-sm sm:col-span-2"
          placeholder="Description"
          value={form.description ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
        />
        <div className="flex items-center justify-between rounded border px-3 py-2 sm:col-span-2 lg:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.is_bank_account}
              onChange={(e) => setForm((p) => ({ ...p, is_bank_account: e.target.checked }))}
            />
            Bank Account
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
            Active
          </label>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <button
            type="button"
            className="text-sm text-text-secondary underline"
            onClick={() => setShowAdvanced((a) => !a)}
          >
            {showAdvanced ? "Hide advanced" : "Show advanced"}
          </button>
        </div>
        {showAdvanced ? (
          <>
            <select
              className="rounded border px-3 py-2 text-sm"
              value={form.account_type ?? "posting"}
              onChange={(e) => setForm((p) => ({ ...p, account_type: e.target.value as "posting" | "statistical" | "header" }))}
            >
              <option value="posting">Posting</option>
              <option value="statistical">Statistical</option>
              <option value="header">Header</option>
            </select>
            <input
              className="rounded border px-3 py-2 text-sm"
              placeholder="Reporting code"
              value={form.reporting_code ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, reporting_code: e.target.value || undefined }))}
            />
            <input
              className="rounded border px-3 py-2 text-sm"
              type="number"
              placeholder="Display order"
              value={form.display_order ?? 0}
              onChange={(e) => setForm((p) => ({ ...p, display_order: Number(e.target.value) || 0 }))}
            />
            {(form.account_type ?? "posting") === "statistical" ? (
              <input
                className="rounded border px-3 py-2 text-sm"
                placeholder="Statistical unit (e.g. Count, SqFt)"
                value={form.statistical_unit ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, statistical_unit: e.target.value || undefined }))}
              />
            ) : null}
            <select
              className="rounded border px-3 py-2 text-sm"
              value={form.parent_account_id ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, parent_account_id: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">No parent</option>
              {rows.filter((a) => a.id !== editingId).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_number} – {a.name}
                </option>
              ))}
            </select>
            <input
              className="rounded border px-3 py-2 text-sm"
              type="date"
              placeholder="Last reviewed"
              value={form.last_reviewed_at ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, last_reviewed_at: e.target.value || undefined }))}
            />
          </>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 sm:col-span-2 lg:col-span-1">
          {editingId ? (
            <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setEditingId(null)}>
              Cancel
            </button>
          ) : null}
          <button className="rounded bg-surface-inverse px-3 py-2 text-sm text-brand-primary-foreground">{editingId ? "Update" : "Create"}</button>
        </div>
      </form>

      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left text-text-secondary">
            <tr>
              <th className="px-4 py-3">No</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Normal</th>
              <th className="px-4 py-3">Opening</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-text-muted" colSpan={8}>
                  Loading chart of accounts...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-text-muted" colSpan={8}>
                  No ledger accounts found.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{r.account_number}</td>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3">{groupMap.get(r.group_id) || "-"}</td>
                  <td className="px-4 py-3">{r.account_type ?? "posting"}</td>
                  <td className="px-4 py-3 uppercase">{r.normal_balance}</td>
                  <td className="px-4 py-3">{Number(r.opening_balance || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">{Number(r.balance || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenActionsId((prev) => (prev === r.id ? null : r.id))}
                        className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                      >
                        Actions
                      </button>
                      {openActionsId === r.id && (
                        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                          <button
                            type="button"
                            onClick={() => {
                              setOpenActionsId(null);
                              startEdit(r);
                            }}
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenActionsId(null);
                              void remove(r.id);
                            }}
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
