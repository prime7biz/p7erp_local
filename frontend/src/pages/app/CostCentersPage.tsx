import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, type CostCenterCreate, type CostCenterDashboardRow, type CostCenterResponse } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listPageFilterBarClass,
  listPageRootClass,
  listPageTableCardClass,
  listPageToolbarInputClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { FinanceFormDrawer, FormSection } from "@/components/finance/kit";
import { logApiError } from "@/utils/logApiError";

const fieldClass =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-0";
const labelClass = "mb-1 block text-xs font-medium text-text-muted";

const emptyForm: CostCenterCreate = {
  center_code: "",
  name: "",
  department: "",
  is_active: true,
};

export function CostCentersPage() {
  const [rows, setRows] = useState<CostCenterResponse[]>([]);
  const [dashboard, setDashboard] = useState<CostCenterDashboardRow[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<number | string | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<CostCenterCreate>({ ...emptyForm });

  async function load() {
    try {
      setError("");
      const [centers, dash] = await Promise.all([
        api.listCostCenters({ active_only: false }),
        api.getCostCenterDashboard(),
      ]);
      setRows(centers);
      setDashboard(dash);
    } catch (e) {
      logApiError("CostCentersPage.load", e);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.center_code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.department || "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setFormError(null);
    setForm({ ...emptyForm });
  }

  function openAdd() {
    setEditingId(null);
    setFormError(null);
    setForm({ ...emptyForm });
    setDrawerOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (!form.name?.trim()) throw new Error("Cost center name is required");
      if (editingId) await api.updateCostCenter(editingId, form);
      else await api.createCostCenter(form);
      closeDrawer();
      await load();
    } catch (err) {
      logApiError("CostCentersPage.submit", err);
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: CostCenterResponse) {
    setEditingId(row.id);
    setFormError(null);
    setForm({
      center_code: row.center_code,
      name: row.name,
      department: row.department,
      is_active: row.is_active,
    });
    setDrawerOpen(true);
  }

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Cost Centers"
        description="Department or operation wise financial tracking."
      />

      <div className={listPageFilterBarClass}>
        <input
          type="search"
          aria-label="Search cost centres"
          placeholder="Search code or name…"
          className={listPageToolbarInputClass}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={openAdd}
          className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90 sm:ml-auto"
        >
          Add cost centre
        </button>
      </div>

      {error ? <div className={listPageErrorClass}>{error}</div> : null}

      <div className={listPageTableCardClass}>
        <div className="max-h-[28rem] overflow-auto">
          <table className={`${listTableBaseClass} min-w-[40rem]`}>
            <thead className={listTableTheadClass}>
              <tr>
                <th className={listTableThClass}>Code</th>
                <th className={listTableThClass}>Name</th>
                <th className={listTableThClass}>Department</th>
                <th className={listTableThClass}>Status</th>
                <th className={listTableThClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td className={listPageEmptyClass} colSpan={5}>
                    {rows.length === 0 ? "No cost centres yet." : "No cost centres match your search."}
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.id} className={listTableTrClass}>
                    <td className={listTableTdPrimaryClass}>{r.center_code}</td>
                    <td className={listTableTdClass}>{r.name}</td>
                    <td className={listTableTdClass}>{r.department ?? "—"}</td>
                    <td className={listTableTdClass}>{r.is_active ? "ACTIVE" : "INACTIVE"}</td>
                    <td className={listTableTdClass}>
                      <RowActionsMenu
                        rowId={r.id}
                        openId={openActionsId}
                        onOpenChange={setOpenActionsId}
                        menuPortal
                        items={[
                          { key: "edit", label: "Edit", onClick: () => startEdit(r) },
                          {
                            key: "dashboard",
                            label: "View dashboard",
                            onClick: () =>
                              document
                                .getElementById("cost-center-dashboard")
                                ?.scrollIntoView({ behavior: "smooth" }),
                          },
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
          Showing {filteredRows.length} of {rows.length} cost centre{rows.length === 1 ? "" : "s"}
        </div>
      </div>

      <div id="cost-center-dashboard" className={listPageTableCardClass}>
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Cost Center Dashboard</h2>
        </div>
        <div className="max-h-[24rem] overflow-auto">
          <table className={`${listTableBaseClass} min-w-[40rem]`}>
            <thead className={listTableTheadClass}>
              <tr>
                <th className={listTableThClass}>Code</th>
                <th className={listTableThClass}>Name</th>
                <th className={listTableThRightClass}>Debit</th>
                <th className={listTableThRightClass}>Credit</th>
                <th className={listTableThRightClass}>Net</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.length === 0 ? (
                <tr>
                  <td className={listPageEmptyClass} colSpan={5}>
                    No dashboard rows yet.
                  </td>
                </tr>
              ) : (
                dashboard.map((d) => (
                  <tr key={d.cost_center_id} className={listTableTrClass}>
                    <td className={listTableTdPrimaryClass}>{d.center_code}</td>
                    <td className={listTableTdClass}>{d.name}</td>
                    <td className={`${listTableTdClass} text-right`}>{d.debit_total.toLocaleString()}</td>
                    <td className={`${listTableTdClass} text-right`}>{d.credit_total.toLocaleString()}</td>
                    <td className={`${listTableTdClass} text-right`}>{d.net.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FinanceFormDrawer
        open={drawerOpen}
        title={editingId ? "Edit cost centre" : "Add cost centre"}
        onClose={closeDrawer}
        onSubmit={(e) => void submit(e)}
        submitLabel={editingId ? "Update" : "Create"}
        submitting={saving}
        error={formError ?? undefined}
      >
        <FormSection title="Cost centre">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="cc-code">
            Center code
          </label>
          <input
            id="cc-code"
            className={fieldClass}
            value={form.center_code}
            onChange={(e) => setForm((p) => ({ ...p, center_code: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="cc-name">
            Name *
          </label>
          <input
            id="cc-name"
            className={fieldClass}
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="cc-dept">
            Department
          </label>
          <input
            id="cc-dept"
            className={fieldClass}
            value={form.department ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_active !== false}
            onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
          />
          Active
        </label>
        </FormSection>
      </FinanceFormDrawer>
    </div>
  );
}
