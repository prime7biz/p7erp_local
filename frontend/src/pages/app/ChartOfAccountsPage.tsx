import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  FINANCE_COST_NATURE_CODES,
  type ChartOfAccountCreate,
  type ChartOfAccountResponse,
  type AccountGroupResponse,
  type CoAConfigResponse,
  type CoaInterestBasis,
  type CoaInterestFrequency,
  type CoaInterestMethod,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { LocalSearchSelect } from "@/components/app/LocalSearchSelect";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listPageFilterBarClass,
  listPageLoadingClass,
  listPageRootClass,
  listPageToolbarButtonClass,
  listPageToolbarInputClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { FinanceFormDrawer, FormSection, ScrollTableCard, showingCountLabel } from "@/components/finance/kit";
import { logApiError } from "@/utils/logApiError";
import { downloadCsv } from "@/lib/reportExport";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { useConfirm } from "@/components/app/useConfirm";
import { useAuth } from "@/context/AuthContext";

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
  enable_bill_wise: false,
  cost_nature: null,
  interest_enabled: false,
  interest_basis: null,
  interest_method: null,
  interest_frequency: null,
  interest_rate_yearly: null,
  interest_amount: null,
  interest_counterpart_account_id: null,
  interest_activation_date: null,
};

const fieldClass =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-0";
const labelClass = "mb-1 block text-xs font-medium text-text-muted";

export function ChartOfAccountsPage() {
  const confirm = useConfirm();
  const { me } = useAuth();
  const interestFlagOn = me?.feature_flags?.coa_ledger_interest_v1 === true;
  const [groups, setGroups] = useState<AccountGroupResponse[]>([]);
  const [rows, setRows] = useState<ChartOfAccountResponse[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCoaConfig, setShowCoaConfig] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [coaConfig, setCoaConfig] = useState<CoAConfigResponse | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importConflict, setImportConflict] = useState<"skip" | "update" | "abort">("skip");
  const [importResult, setImportResult] = useState<{
    ok: boolean;
    groups_created: number;
    groups_updated: number;
    accounts_created: number;
    accounts_updated: number;
    errors: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<number | string | null>(null);
  const [form, setForm] = useState<ChartOfAccountCreate>({ ...defaultForm });
  const [interestPreview, setInterestPreview] = useState<string | null>(null);
  const [interestRunMsg, setInterestRunMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterGroupId, setFilterGroupId] = useState<number | "">("");

  const latest = useLatestRequest();
  const load = useCallback(async () => {
    const token = latest.begin();
    setLoading(true);
    try {
      const [g, a] = await Promise.all([
        api.listAccountGroups(),
        api.listChartOfAccounts({ active_only: !showInactive }),
      ]);
      if (!latest.isCurrent(token)) return;
      setGroups(g);
      setRows(a);
      setError(null);
      const firstGroup = g[0];
      if (firstGroup) {
        setForm((p) => (p.group_id ? p : { ...p, group_id: firstGroup.id }));
      }
    } catch (e) {
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
    } finally {
      if (latest.isCurrent(token)) setLoading(false);
    }
  }, [latest, showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (showCoaConfig) {
      api
        .getCoaConfig()
        .then(setCoaConfig)
        .catch((e) => {
          logApiError("ChartOfAccountsPage.getCoaConfig", e);
          setCoaConfig(null);
        });
    }
  }, [showCoaConfig]);

  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const groupSelectOptions = useMemo(
    () => groups.map((g) => ({ value: g.id, label: g.name })),
    [groups],
  );
  const selectedGroup = useMemo(() => groups.find((g) => g.id === form.group_id), [groups, form.group_id]);
  const selectedNature = (selectedGroup?.nature || "").toLowerCase();
  const canActivateInterest =
    interestFlagOn &&
    (selectedNature === "asset" || selectedNature === "liability") &&
    !form.enable_bill_wise &&
    !form.maintain_fc_balance;
  const counterpartOptions = useMemo(() => {
    const want = selectedNature === "liability" ? "expense" : selectedNature === "asset" ? "income" : "";
    if (!want) return [];
    return rows.filter((a) => {
      const g = groups.find((x) => x.id === a.group_id);
      return (g?.nature || "").toLowerCase() === want && a.id !== editingId;
    });
  }, [rows, groups, selectedNature, editingId]);
  const counterpartSelectOptions = useMemo(
    () => counterpartOptions.map((a) => ({ value: a.id, label: `${a.account_number} – ${a.name}` })),
    [counterpartOptions],
  );
  const parentAccountOptions = useMemo(
    () =>
      rows
        .filter((a) => a.id !== editingId)
        .map((a) => ({ value: a.id, label: `${a.account_number} – ${a.name}` })),
    [rows, editingId],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterGroupId !== "" && r.group_id !== filterGroupId) return false;
      if (!q) return true;
      return (
        (r.account_number ?? "").toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (groupMap.get(r.group_id) || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filterGroupId, groupMap]);

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setFormError(null);
    setShowAdvanced(false);
    setInterestPreview(null);
    setInterestRunMsg(null);
    setForm({ ...defaultForm, group_id: groups[0]?.id ?? 0 });
  }

  function openAdd() {
    setEditingId(null);
    setFormError(null);
    setShowAdvanced(false);
    setInterestPreview(null);
    setInterestRunMsg(null);
    setForm({ ...defaultForm, group_id: groups[0]?.id ?? 0 });
    setDrawerOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (!form.name?.trim()) throw new Error("Ledger name is required");
      if (!form.group_id) throw new Error("Please select a group");
      const payload: ChartOfAccountCreate = {
        ...form,
        last_reviewed_at: form.last_reviewed_at?.trim() || undefined,
        reporting_code: form.reporting_code?.trim() || undefined,
        statistical_unit: form.statistical_unit?.trim() || undefined,
        cost_nature: form.cost_nature ?? null,
        interest_enabled: canActivateInterest ? !!form.interest_enabled : false,
        interest_basis: canActivateInterest && form.interest_enabled ? form.interest_basis : null,
        interest_method: canActivateInterest && form.interest_enabled ? form.interest_method : null,
        interest_frequency: canActivateInterest && form.interest_enabled ? form.interest_frequency : null,
        interest_rate_yearly:
          canActivateInterest && form.interest_enabled && form.interest_method === "yearly_rate"
            ? form.interest_rate_yearly || null
            : null,
        interest_amount:
          canActivateInterest && form.interest_enabled && form.interest_method !== "yearly_rate"
            ? form.interest_amount || null
            : null,
        interest_counterpart_account_id:
          canActivateInterest && form.interest_enabled ? form.interest_counterpart_account_id ?? null : null,
        interest_activation_date:
          canActivateInterest && form.interest_enabled ? form.interest_activation_date || null : null,
      };
      if (editingId) {
        await api.updateChartOfAccount(editingId, payload);
      } else {
        await api.createChartOfAccount(payload);
      }
      closeDrawer();
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: ChartOfAccountResponse) {
    setEditingId(row.id);
    setFormError(null);
    setShowAdvanced(false);
    setForm({
      ...defaultForm,
      account_number: row.account_number,
      name: row.name,
      group_id: row.group_id,
      normal_balance: row.normal_balance,
      opening_balance: row.opening_balance,
      description: row.description ?? "",
      is_active: row.is_active,
      is_bank_account: row.is_bank_account,
      enable_bill_wise: row.enable_bill_wise ?? false,
      account_type: row.account_type ?? "posting",
      reporting_code: row.reporting_code ?? "",
      display_order: row.display_order ?? 0,
      statistical_unit: row.statistical_unit ?? "",
      parent_account_id: row.parent_account_id ?? null,
      last_reviewed_at: row.last_reviewed_at ?? "",
      cost_nature: row.cost_nature ?? null,
      account_currency: row.account_currency ?? undefined,
      maintain_fc_balance: row.maintain_fc_balance ?? false,
      interest_enabled: row.interest_enabled ?? false,
      interest_basis: row.interest_basis ?? null,
      interest_method: row.interest_method ?? null,
      interest_frequency: row.interest_frequency ?? null,
      interest_rate_yearly: row.interest_rate_yearly ?? null,
      interest_amount: row.interest_amount ?? null,
      interest_counterpart_account_id: row.interest_counterpart_account_id ?? null,
      interest_activation_date: row.interest_activation_date ?? null,
    });
    setInterestPreview(null);
    setInterestRunMsg(null);
    setDrawerOpen(true);
  }

  async function previewInterest() {
    if (!editingId) {
      setFormError("Save the ledger first, then preview interest.");
      return;
    }
    setFormError(null);
    setInterestPreview(null);
    try {
      const res = await api.previewCoaInterest({ account_id: editingId });
      const lines = (res.periods || []).map((p) => {
        const amount = String(p.interest_amount ?? "0");
        const key = String(p.period_key ?? "");
        const skip = p.skip_reason ? ` (skip: ${String(p.skip_reason)})` : "";
        const existing = p.existing_status ? ` existing=${String(p.existing_status)}` : "";
        return `${key}: ${amount}${skip}${existing}`;
      });
      setInterestPreview(lines.length ? lines.join("\n") : "No completed periods due yet.");
    } catch (e) {
      setFormError((e as Error).message);
    }
  }

  async function runInterest() {
    if (!(await confirm({ title: "Create draft interest journals for completed periods?" }))) return;
    setFormError(null);
    setInterestRunMsg(null);
    try {
      const res = await api.runCoaInterest(editingId ? { account_id: editingId } : undefined);
      setInterestRunMsg(`Created ${res.created} draft voucher(s), skipped ${res.skipped}.`);
    } catch (e) {
      setFormError((e as Error).message);
    }
  }

  async function remove(id: number) {
    if (!(await confirm({ title: "Delete this ledger account?", danger: true }))) return;
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
        inventory_stock_account_id: coaConfig.inventory_stock_account_id ?? null,
        inventory_clearing_account_id: coaConfig.inventory_clearing_account_id ?? null,
      });
      setCoaConfig(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Chart of Accounts"
        description="Ledger accounts, opening balances, and group-based classification."
        actions={
          <>
            <button
              type="button"
              onClick={() => void handleExport()}
              className={listPageToolbarButtonClass}
            >
              Export CoA
            </button>
            <button
              type="button"
              onClick={() => setShowImport((i) => !i)}
              className={listPageToolbarButtonClass}
            >
              Import CoA
            </button>
            <button
              type="button"
              onClick={() => setShowCoaConfig((c) => !c)}
              className={listPageToolbarButtonClass}
            >
              CoA settings
            </button>
          </>
        }
      />

      <div className={listPageFilterBarClass}>
        <input
          type="search"
          aria-label="Search ledgers"
          placeholder="Search number or name…"
          className={listPageToolbarInputClass}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <LocalSearchSelect
          aria-label="Filter by group"
          className="min-w-[12rem]"
          value={filterGroupId}
          options={groupSelectOptions}
          onChange={(next) => setFilterGroupId(next === "" ? "" : Number(next))}
          placeholder="All groups"
          allowClear
        />
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-text-secondary">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
        <button
          type="button"
          onClick={openAdd}
          className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90 sm:ml-auto"
        >
          Add ledger
        </button>
      </div>

      {showImport && (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h3 className="mb-2 text-sm font-medium text-text-primary">
            Import Chart of Accounts (CSV or Excel .xlsx — first sheet)
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <input
              type="file"
              accept=".csv,.xlsx"
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
              className="rounded-xl bg-brand-primary px-3 py-1.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
            >
              Import
            </button>
          </div>
          {importResult && (
            <div className="mt-3 rounded border border-border-subtle bg-surface-subtle p-2 text-sm">
              {importResult.ok ? (
                <p className="text-text-secondary">
                  Done. Groups: {importResult.groups_created} created, {importResult.groups_updated} updated.
                  Accounts: {importResult.accounts_created} created, {importResult.accounts_updated} updated.
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
                onChange={(e) =>
                  setCoaConfig((c) => (c ? { ...c, account_number_prefix: e.target.value } : c))
                }
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
                onChange={(e) =>
                  setCoaConfig((c) => (c ? { ...c, account_number_width: Number(e.target.value) || 4 } : c))
                }
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Group code prefix</label>
              <input
                className="w-full rounded border px-2 py-1.5 text-sm"
                value={coaConfig.group_code_prefix}
                onChange={(e) => setCoaConfig((c) => (c ? { ...c, group_code_prefix: e.target.value } : c))}
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
                onChange={(e) =>
                  setCoaConfig((c) => (c ? { ...c, group_code_width: Number(e.target.value) || 4 } : c))
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={coaConfig.allow_manual_account_number}
                onChange={(e) =>
                  setCoaConfig((c) => (c ? { ...c, allow_manual_account_number: e.target.checked } : c))
                }
              />
              Allow manual account number
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={coaConfig.validate_normal_balance}
                onChange={(e) =>
                  setCoaConfig((c) => (c ? { ...c, validate_normal_balance: e.target.checked } : c))
                }
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
                onChange={(e) =>
                  setCoaConfig((c) =>
                    c ? { ...c, max_group_depth: e.target.value ? Number(e.target.value) : null } : c,
                  )
                }
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">Max account depth (optional)</label>
              <input
                type="number"
                min={0}
                className="w-full rounded border px-2 py-1.5 text-sm"
                value={coaConfig.max_account_depth ?? ""}
                onChange={(e) =>
                  setCoaConfig((c) =>
                    c ? { ...c, max_account_depth: e.target.value ? Number(e.target.value) : null } : c,
                  )
                }
              />
            </div>
            <div className="sm:col-span-2">
              <p className="mb-2 text-xs font-medium text-text-primary">Inventory GL defaults (optional)</p>
              <p className="mb-2 text-xs text-text-muted">
                Used when stock group accounts are not set. Receipt: Dr stock / Cr clearing (GRNI).
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-text-muted">Default stock-in-hand account</label>
                  <select
                    className="w-full rounded border px-2 py-1.5 text-sm"
                    value={coaConfig.inventory_stock_account_id ?? ""}
                    onChange={(e) =>
                      setCoaConfig((c) =>
                        c
                          ? {
                              ...c,
                              inventory_stock_account_id: e.target.value ? Number(e.target.value) : null,
                            }
                          : c,
                      )
                    }
                  >
                    <option value="">— None —</option>
                    {rows
                      .filter((a) => a.is_active && a.account_type === "posting")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.account_number} {a.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-text-muted">Inventory clearing / GRNI account</label>
                  <select
                    className="w-full rounded border px-2 py-1.5 text-sm"
                    value={coaConfig.inventory_clearing_account_id ?? ""}
                    onChange={(e) =>
                      setCoaConfig((c) =>
                        c
                          ? {
                              ...c,
                              inventory_clearing_account_id: e.target.value ? Number(e.target.value) : null,
                            }
                          : c,
                      )
                    }
                  >
                    <option value="">— None —</option>
                    {rows
                      .filter((a) => a.is_active && a.account_type === "posting")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.account_number} {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void saveCoaConfig()}
            className="mt-3 rounded-xl bg-brand-primary px-3 py-1.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
          >
            Save CoA settings
          </button>
        </div>
      )}

      {error ? <div className={listPageErrorClass}>{error}</div> : null}

      <ScrollTableCard
        maxHeight="main"
        footer={!loading ? showingCountLabel(filteredRows.length, rows.length, "account") : undefined}
      >
        <table className={`${listTableBaseClass} min-w-[64rem]`}>
          <thead className={listTableTheadClass}>
            <tr>
              <th className={listTableThClass}>No</th>
              <th className={listTableThClass}>Name</th>
              <th className={listTableThClass}>Group</th>
              <th className={listTableThClass}>Type</th>
              <th className={listTableThClass}>Cost nature</th>
              <th className={listTableThClass}>Normal</th>
              <th className={listTableThClass}>Opening</th>
              <th className={listTableThClass}>Balance</th>
              <th className={listTableThClass}>Bill-Wise</th>
              <th className={listTableThClass}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className={listPageLoadingClass} colSpan={10}>
                  Loading chart of accounts…
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td className={listPageEmptyClass} colSpan={10}>
                  {rows.length === 0
                    ? "No ledger accounts found."
                    : "No ledgers match your search or group filter."}
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={r.id} className={listTableTrClass}>
                  <td className={listTableTdPrimaryClass}>{r.account_number}</td>
                  <td className={listTableTdClass}>{r.name}</td>
                  <td className={listTableTdClass}>{groupMap.get(r.group_id) || "—"}</td>
                  <td className={listTableTdClass}>{r.account_type ?? "posting"}</td>
                  <td className={`${listTableTdClass} text-text-muted`}>{r.cost_nature ?? "—"}</td>
                  <td className={`${listTableTdClass} uppercase`}>{r.normal_balance}</td>
                  <td className={listTableTdClass}>{Number(r.opening_balance || 0).toLocaleString()}</td>
                  <td className={listTableTdClass}>{Number(r.balance || 0).toLocaleString()}</td>
                  <td className={listTableTdClass}>
                    {r.enable_bill_wise ? (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        Yes
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={listTableTdClass}>
                    <RowActionsMenu
                      rowId={r.id}
                      openId={openActionsId}
                      onOpenChange={setOpenActionsId}
                      menuPortal
                      items={[
                        { key: "edit", label: "Edit", onClick: () => startEdit(r) },
                        { key: "delete", label: "Delete", danger: true, onClick: () => void remove(r.id) },
                      ]}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScrollTableCard>

      <FinanceFormDrawer
        open={drawerOpen}
        title={editingId ? "Edit ledger" : "Add ledger"}
        description="Account number is generated on create. Use advanced fields for reporting and interest."
        onClose={closeDrawer}
        onSubmit={(e) => void submit(e)}
        submitLabel={editingId ? "Update" : "Create"}
        submitting={saving}
        error={formError ?? undefined}
        size="lg"
      >
        <FormSection title="Ledger details">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="coa-account-number">
            Account number
          </label>
          <input
            id="coa-account-number"
            className={`${fieldClass} bg-surface-subtle`}
            readOnly
            placeholder="Auto-generated"
            value={editingId ? form.account_number : ""}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="coa-name">
            Ledger name *
          </label>
          <input
            id="coa-name"
            className={fieldClass}
            placeholder="Ledger name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="coa-group">
            Group *
          </label>
          <LocalSearchSelect
            id="coa-group"
            value={form.group_id || ""}
            options={groupSelectOptions}
            onChange={(next) => setForm((p) => ({ ...p, group_id: next === "" ? 0 : Number(next) }))}
            placeholder="Select group…"
            required
            allowClear={false}
            aria-label="Group"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={labelClass} htmlFor="coa-opening">
              Opening balance
            </label>
            <input
              id="coa-opening"
              className={fieldClass}
              placeholder="0"
              value={form.opening_balance}
              onChange={(e) => setForm((p) => ({ ...p, opening_balance: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className={labelClass} htmlFor="coa-normal">
              Normal balance
            </label>
            <select
              id="coa-normal"
              className={fieldClass}
              value={form.normal_balance}
              onChange={(e) =>
                setForm((p) => ({ ...p, normal_balance: e.target.value as "debit" | "credit" }))
              }
            >
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="coa-description">
            Description
          </label>
          <input
            id="coa-description"
            className={fieldClass}
            placeholder="Description"
            value={form.description ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />
        </div>
        <div className="flex flex-wrap gap-4 rounded-lg border border-border px-3 py-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.is_bank_account}
              onChange={(e) => setForm((p) => ({ ...p, is_bank_account: e.target.checked }))}
            />
            Bank account
          </label>
          <label
            className="flex items-center gap-2 text-sm"
            title="Enable Tally-style bill-wise tracking for Sundry Creditors / Debtors"
          >
            <input
              type="checkbox"
              checked={!!form.enable_bill_wise}
              onChange={(e) => setForm((p) => ({ ...p, enable_bill_wise: e.target.checked }))}
            />
            Bill-wise tracking
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            Active
          </label>
        </div>
        <button
          type="button"
          className="text-sm text-text-secondary underline"
          onClick={() => setShowAdvanced((a) => !a)}
        >
          {showAdvanced ? "Hide advanced" : "Show advanced"}
        </button>
        {showAdvanced ? (
          <div className="space-y-3 rounded-lg border border-border bg-surface-subtle/50 p-3">
            <div className="space-y-1">
              <label className={labelClass} htmlFor="coa-type">
                Account type
              </label>
              <select
                id="coa-type"
                className={fieldClass}
                value={form.account_type ?? "posting"}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    account_type: e.target.value as "posting" | "statistical" | "header",
                  }))
                }
              >
                <option value="posting">Posting</option>
                <option value="statistical">Statistical</option>
                <option value="header">Header</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="coa-reporting">
                Reporting code
              </label>
              <input
                id="coa-reporting"
                className={fieldClass}
                placeholder="Reporting code"
                value={form.reporting_code ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, reporting_code: e.target.value || undefined }))}
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="coa-order">
                Display order
              </label>
              <input
                id="coa-order"
                className={fieldClass}
                type="number"
                value={form.display_order ?? 0}
                onChange={(e) => setForm((p) => ({ ...p, display_order: Number(e.target.value) || 0 }))}
              />
            </div>
            {(form.account_type ?? "posting") === "statistical" ? (
              <div className="space-y-1">
                <label className={labelClass} htmlFor="coa-stat-unit">
                  Statistical unit
                </label>
                <input
                  id="coa-stat-unit"
                  className={fieldClass}
                  placeholder="e.g. Count, SqFt"
                  value={form.statistical_unit ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, statistical_unit: e.target.value || undefined }))}
                />
              </div>
            ) : null}
            <div className="space-y-1">
              <label className={labelClass} htmlFor="coa-parent">
                Parent account
              </label>
              <LocalSearchSelect
                id="coa-parent"
                value={form.parent_account_id ?? ""}
                options={parentAccountOptions}
                onChange={(next) =>
                  setForm((p) => ({
                    ...p,
                    parent_account_id: next === "" ? null : Number(next),
                  }))
                }
                placeholder="No parent"
                allowClear
                aria-label="Parent account"
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="coa-reviewed">
                Last reviewed
              </label>
              <input
                id="coa-reviewed"
                className={fieldClass}
                type="date"
                value={form.last_reviewed_at ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, last_reviewed_at: e.target.value || undefined }))}
              />
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="coa-cost-nature">
                Cost nature (reporting / financier rollups)
              </label>
              <select
                id="coa-cost-nature"
                className={fieldClass}
                value={form.cost_nature ?? ""}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    cost_nature: e.target.value
                      ? (e.target.value as (typeof FINANCE_COST_NATURE_CODES)[number])
                      : null,
                  }))
                }
              >
                <option value="">Not set (unknown)</option>
                {FINANCE_COST_NATURE_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
        {canActivateInterest ? (
          <div className="space-y-3 rounded-lg border border-border bg-surface-subtle/60 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
              <input
                type="checkbox"
                checked={!!form.interest_enabled}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    interest_enabled: e.target.checked,
                    interest_basis: e.target.checked ? p.interest_basis || "simple" : null,
                    interest_method: e.target.checked ? p.interest_method || "yearly_rate" : null,
                    interest_frequency: e.target.checked ? p.interest_frequency || "monthly" : null,
                  }))
                }
              />
              Activate interest on this ledger
            </label>
            <p className="text-xs text-text-muted">
              Optional. Draft journals are created automatically; you post them. Compound adds unpaid interest to
              the balance (bank loans). Simple charges principal only (hand loans). First period is prorated by
              days.
            </p>
            {form.interest_enabled ? (
              <div className="space-y-3">
                <select
                  className={fieldClass}
                  value={form.interest_basis ?? "simple"}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, interest_basis: e.target.value as CoaInterestBasis }))
                  }
                >
                  <option value="simple">Simple (principal only)</option>
                  <option value="compound">Compound (interest on unpaid interest)</option>
                </select>
                <select
                  className={fieldClass}
                  value={form.interest_method ?? "yearly_rate"}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, interest_method: e.target.value as CoaInterestMethod }))
                  }
                >
                  <option value="yearly_rate">Yearly interest rate %</option>
                  <option value="monthly_fixed">Monthly fixed amount</option>
                  <option value="yearly_fixed">Yearly fixed amount</option>
                </select>
                <select
                  className={fieldClass}
                  value={form.interest_frequency ?? "monthly"}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, interest_frequency: e.target.value as CoaInterestFrequency }))
                  }
                >
                  <option value="monthly">Monthly accrual</option>
                  <option value="quarterly">Quarterly accrual</option>
                </select>
                <input
                  className={fieldClass}
                  type="date"
                  value={form.interest_activation_date ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, interest_activation_date: e.target.value || null }))
                  }
                  title="Interest activation date"
                />
                {form.interest_method === "yearly_rate" ? (
                  <input
                    className={fieldClass}
                    placeholder="Yearly rate %"
                    value={form.interest_rate_yearly ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, interest_rate_yearly: e.target.value || null }))
                    }
                  />
                ) : (
                  <input
                    className={fieldClass}
                    placeholder={form.interest_method === "monthly_fixed" ? "Monthly amount" : "Yearly amount"}
                    value={form.interest_amount ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, interest_amount: e.target.value || null }))}
                  />
                )}
                <LocalSearchSelect
                  value={form.interest_counterpart_account_id ?? ""}
                  options={counterpartSelectOptions}
                  onChange={(next) =>
                    setForm((p) => ({
                      ...p,
                      interest_counterpart_account_id: next === "" ? null : Number(next),
                    }))
                  }
                  placeholder={
                    selectedNature === "liability" ? "Interest Expense ledger…" : "Interest Income ledger…"
                  }
                  allowClear
                  aria-label="Interest counterpart account"
                />
                {editingId ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={listPageToolbarButtonClass}
                      onClick={() => void previewInterest()}
                    >
                      Preview interest
                    </button>
                    <button
                      type="button"
                      className={listPageToolbarButtonClass}
                      onClick={() => void runInterest()}
                    >
                      Run interest accruals
                    </button>
                  </div>
                ) : null}
                {interestPreview ? (
                  <pre className="whitespace-pre-wrap rounded border bg-surface-raised px-3 py-2 text-xs text-text-secondary">
                    {interestPreview}
                  </pre>
                ) : null}
                {interestRunMsg ? <div className="text-xs text-text-secondary">{interestRunMsg}</div> : null}
              </div>
            ) : null}
          </div>
        ) : null}
        </FormSection>
      </FinanceFormDrawer>
    </div>
  );
}
