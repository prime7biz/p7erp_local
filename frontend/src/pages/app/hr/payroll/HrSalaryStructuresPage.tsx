import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type HrPayrollStructureLineResponse,
  type HrSalaryStructureCreate,
  type HrSalaryStructureResponse,
} from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { logApiError } from "@/utils/logApiError";

interface ComponentRow {
  id: number;
  code: string;
  name: string;
  component_type: string;
  calculation_type: string;
}

const CALC_LABEL: Record<string, string> = {
  FIXED: "Fixed amount",
  PERCENT_OF_BASE: "% of basic (assignment base salary)",
  PER_DAY: "Per paid day",
  PER_HOUR_OT: "Per OT hour",
  PER_PIECE: "Per piece",
  PER_SAM_MINUTE: "Per SAM minute",
};

const inputCls = "w-full rounded border border-border-strong px-3 py-2 text-sm";
const btnPrimary = "rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground disabled:opacity-50";
const btnSecondary = "rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary";

function money(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value);
}

export function HrSalaryStructuresPage() {
  const [structures, setStructures] = useState<HrSalaryStructureResponse[]>([]);
  const [components, setComponents] = useState<ComponentRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [lines, setLines] = useState<HrPayrollStructureLineResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [linesLoading, setLinesLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [structureModal, setStructureModal] = useState<"create" | "edit" | null>(null);
  const [structureForm, setStructureForm] = useState<HrSalaryStructureCreate>({ code: "", name: "", description: "", is_active: true });
  const [lineForm, setLineForm] = useState<{ component_id: string; amount: string }>({ component_id: "", amount: "" });
  const [editingLine, setEditingLine] = useState<{ id: number; amount: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const componentMap = useMemo(() => new Map(components.map((c) => [c.id, c])), [components]);
  const selected = structures.find((s) => s.id === selectedId) ?? null;

  const loadStructures = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, comps] = await Promise.all([
        api.listHrSalaryStructures({ active_only: false }),
        api.listHrPayrollComponents({ active_only: false }),
      ]);
      setStructures(rows);
      setComponents(comps as unknown as ComponentRow[]);
      setSelectedId((cur) => cur ?? rows[0]?.id ?? null);
    } catch (e) {
      logApiError("salary structures load", e);
      setError(e instanceof Error ? e.message : "Failed to load salary structures");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLines = useCallback(async (structureId: number) => {
    setLinesLoading(true);
    try {
      setLines(await api.listHrSalaryStructureLines(structureId));
    } catch (e) {
      logApiError("salary structure lines load", e);
      setError(e instanceof Error ? e.message : "Failed to load component lines");
    } finally {
      setLinesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStructures();
  }, [loadStructures]);

  useEffect(() => {
    if (selectedId != null) void loadLines(selectedId);
    else setLines([]);
  }, [selectedId, loadLines]);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const fixedTotal = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const c = componentMap.get(l.component_id);
        if (!c || c.calculation_type !== "FIXED") return sum;
        const v = Number(l.amount) || 0;
        return c.component_type === "DEDUCTION" ? sum - v : sum + v;
      }, 0),
    [lines, componentMap]
  );
  const percentLines = lines.filter((l) => componentMap.get(l.component_id)?.calculation_type === "PERCENT_OF_BASE");

  const run = async (fn: () => Promise<void>, ok: string) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setStructureForm({ code: "", name: "", description: "", is_active: true });
    setStructureModal("create");
  };

  const openEditStructure = () => {
    if (!selected) return;
    setStructureForm({ code: selected.code, name: selected.name, description: selected.description ?? "", is_active: selected.is_active });
    setStructureModal("edit");
  };

  const saveStructure = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (structureModal === "create") {
        const row = await api.createHrSalaryStructure({
          code: structureForm.code.trim(),
          name: structureForm.name.trim(),
          description: structureForm.description?.trim() || null,
          is_active: structureForm.is_active,
        });
        setSelectedId(row.id);
      } else if (selected) {
        await api.updateHrSalaryStructure(selected.id, {
          name: structureForm.name.trim(),
          description: structureForm.description?.trim() || null,
          is_active: structureForm.is_active,
        });
      }
      setStructureModal(null);
      await loadStructures();
    }, "Structure saved");
  };

  const addLine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !lineForm.component_id) return;
    void run(async () => {
      await api.createHrSalaryStructureLine(selected.id, {
        component_id: Number(lineForm.component_id),
        amount: lineForm.amount || "0",
        sort_order: (lines.length + 1) * 10,
      });
      setLineForm({ component_id: "", amount: "" });
      await loadLines(selected.id);
    }, "Component line added");
  };

  const saveLineAmount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !editingLine) return;
    void run(async () => {
      await api.updateHrSalaryStructureLine(selected.id, editingLine.id, { amount: editingLine.amount || "0" });
      setEditingLine(null);
      await loadLines(selected.id);
    }, "Amount updated");
  };

  const deleteLine = (line: HrPayrollStructureLineResponse) => {
    if (!selected) return;
    const c = componentMap.get(line.component_id);
    if (!window.confirm(`Remove ${c?.name ?? "this component"} from ${selected.name}?`)) return;
    void run(async () => {
      await api.deleteHrSalaryStructureLine(selected.id, line.id);
      await loadLines(selected.id);
    }, "Component line removed");
  };

  const usedComponentIds = new Set(lines.map((l) => l.component_id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <HrPageHeader
          title="Salary Structures"
          description="Each structure is a set of pay component lines. Basic and house rent can follow each employee's basic wage (set on the assignment); allowances are fixed amounts."
          breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Salary structures" }]}
        />
        <button type="button" onClick={openCreate} className={btnPrimary}>
          Add salary structure
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      <div aria-live="polite" className="sr-only">
        {notice}
      </div>
      {notice && !error && (
        <div className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-2 text-sm text-status-success-foreground">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-surface-raised p-10 text-center text-sm text-text-muted">Loading salary structures...</div>
      ) : structures.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-raised p-10 text-center text-sm text-text-muted">
          No salary structures yet. Add one, or use HR &gt; Bangladesh Setup to create the Gazette grade structures.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <nav aria-label="Salary structures" className="rounded-xl border border-border bg-surface-raised p-2">
            <ul className="space-y-1">
              {structures.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    aria-current={s.id === selectedId ? "true" : undefined}
                    className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                      s.id === selectedId ? "bg-brand-primary/10 font-semibold text-text-primary" : "text-text-secondary hover:bg-surface-subtle"
                    }`}
                  >
                    <span className="block">{s.name}</span>
                    <span className="block text-xs text-text-muted">
                      {s.code}
                      {s.is_active ? "" : " · inactive"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {selected && (
            <section className="space-y-4 rounded-xl border border-border bg-surface-raised p-4" aria-labelledby="structure-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="structure-title" className="text-lg font-semibold text-text-primary">
                    {selected.name} <span className="text-sm font-normal text-text-muted">({selected.code})</span>
                  </h2>
                  {selected.description && <p className="mt-1 max-w-3xl text-sm text-text-muted">{selected.description}</p>}
                </div>
                <button type="button" onClick={openEditStructure} className={btnSecondary}>
                  Edit structure
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border">
                {linesLoading ? (
                  <div className="p-6 text-center text-sm text-text-muted">Loading component lines...</div>
                ) : lines.length === 0 ? (
                  <div className="p-6 text-center text-sm text-text-muted">No component lines. Add basic, house rent and allowances below.</div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-surface-subtle">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Component</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Type</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Calculation</th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Amount / rate</th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {lines.map((line) => {
                        const c = componentMap.get(line.component_id);
                        const isPct = c?.calculation_type === "PERCENT_OF_BASE";
                        return (
                          <tr key={line.id}>
                            <td className="px-3 py-2 text-text-primary">
                              {c?.name ?? `Component #${line.component_id}`}
                              <span className="block text-xs text-text-muted">{c?.code}</span>
                            </td>
                            <td className="px-3 py-2 text-text-secondary">{c?.component_type === "DEDUCTION" ? "Deduction" : "Earning"}</td>
                            <td className="px-3 py-2 text-text-secondary">{CALC_LABEL[c?.calculation_type ?? ""] ?? c?.calculation_type}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-text-primary">
                              {editingLine?.id === line.id ? (
                                <form onSubmit={saveLineAmount} className="flex items-center justify-end gap-2">
                                  <label className="sr-only" htmlFor={`amt-${line.id}`}>
                                    New amount
                                  </label>
                                  <input
                                    id={`amt-${line.id}`}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    autoFocus
                                    className="w-28 rounded border border-border-strong px-2 py-1 text-right text-sm"
                                    value={editingLine.amount}
                                    onChange={(e) => setEditingLine({ id: line.id, amount: e.target.value })}
                                  />
                                  <button type="submit" disabled={saving} className="text-xs font-semibold text-brand-primary">
                                    Save
                                  </button>
                                  <button type="button" onClick={() => setEditingLine(null)} className="text-xs text-text-muted">
                                    Cancel
                                  </button>
                                </form>
                              ) : (
                                <>{isPct ? `${money(line.amount)}%` : money(line.amount)}</>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  aria-haspopup="menu"
                                  aria-expanded={openActionsId === line.id}
                                  onClick={() => setOpenActionsId(openActionsId === line.id ? null : line.id)}
                                  className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                >
                                  Actions
                                </button>
                                {openActionsId === line.id && (
                                  <div role="menu" className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        setEditingLine({ id: line.id, amount: String(Number(line.amount)) });
                                        setOpenActionsId(null);
                                      }}
                                      className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                                    >
                                      Edit amount
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        setOpenActionsId(null);
                                        deleteLine(line);
                                      }}
                                      className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <p className="text-sm text-text-secondary">
                Fixed amounts total: <strong className="tabular-nums">{money(fixedTotal)}</strong>
                {percentLines.length > 0 && (
                  <> plus {percentLines.map((l) => `${money(l.amount)}% (${componentMap.get(l.component_id)?.name ?? ""})`).join(", ")} of each employee&apos;s basic wage.</>
                )}
              </p>

              <form onSubmit={addLine} className="flex flex-wrap items-end gap-3 rounded-lg bg-surface-subtle p-3">
                <div className="min-w-[14rem] flex-1">
                  <label htmlFor="line-component" className="mb-1 block text-xs font-medium text-text-secondary">
                    Component **
                  </label>
                  <select
                    id="line-component"
                    className={inputCls}
                    value={lineForm.component_id}
                    onChange={(e) => setLineForm((f) => ({ ...f, component_id: e.target.value }))}
                    required
                  >
                    <option value="">Choose a component</option>
                    {components
                      .filter((c) => !usedComponentIds.has(c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code}) — {CALC_LABEL[c.calculation_type] ?? c.calculation_type}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="w-40">
                  <label htmlFor="line-amount" className="mb-1 block text-xs font-medium text-text-secondary">
                    Amount or %
                  </label>
                  <input
                    id="line-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputCls}
                    value={lineForm.amount}
                    onChange={(e) => setLineForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <button type="submit" disabled={saving || !lineForm.component_id} className={btnPrimary}>
                  Add line
                </button>
              </form>
            </section>
          )}
        </div>
      )}

      {structureModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setStructureModal(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="structure-modal-title"
            className="w-full max-w-md rounded-xl bg-surface-raised p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === "Escape" && setStructureModal(null)}
          >
            <h2 id="structure-modal-title" className="mb-4 text-lg font-semibold text-text-primary">
              {structureModal === "create" ? "Add salary structure" : "Edit salary structure"}
            </h2>
            <form onSubmit={saveStructure} className="space-y-3">
              <div>
                <label htmlFor="structure-code" className="mb-1 block text-xs font-medium text-text-secondary">
                  Code ** {structureModal === "edit" && "(cannot change)"}
                </label>
                <input
                  id="structure-code"
                  className={inputCls}
                  value={structureForm.code}
                  maxLength={24}
                  disabled={structureModal === "edit"}
                  onChange={(e) => setStructureForm((f) => ({ ...f, code: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label htmlFor="structure-name" className="mb-1 block text-xs font-medium text-text-secondary">
                  Name **
                </label>
                <input
                  id="structure-name"
                  className={inputCls}
                  value={structureForm.name}
                  maxLength={128}
                  onChange={(e) => setStructureForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label htmlFor="structure-desc" className="mb-1 block text-xs font-medium text-text-secondary">
                  Description
                </label>
                <textarea
                  id="structure-desc"
                  rows={3}
                  className={inputCls}
                  value={structureForm.description ?? ""}
                  onChange={(e) => setStructureForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={structureForm.is_active ?? true}
                  onChange={(e) => setStructureForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Active
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setStructureModal(null)} className={btnSecondary}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="rounded bg-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary-foreground">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
