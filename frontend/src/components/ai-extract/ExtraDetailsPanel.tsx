import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { ExtraExtractedField } from "@/types/extraction";
import {
  IGNORE_TARGET,
  NOTES_TARGET,
  buildExtraRows,
  coerceExtraValue,
  planApplyAll,
  type ExtraRowState,
  type ExtraTargetOption,
} from "@/components/ai-extract/extraDetailsLogic";

type Props = {
  extras?: ExtraExtractedField[];
  /** Form fields the user may put a detail into (Notes, when offered, is appended to). */
  options: ExtraTargetOption[];
  /** Map a backend suggestion to a page target, e.g. `style_name_candidate` -> quick-add style name. */
  aliases?: Record<string, string>;
  /**
   * Put the value into the form. For Notes the original text is passed so the page can append it.
   * Use functional state updates: "Apply all suggested" calls this several times in a row.
   */
  onApply: (target: string, value: string | number, detail: { label: string; value: string }) => void;
  title?: string;
  className?: string;
};

export function ExtraDetailsPanel({
  extras,
  options,
  aliases,
  onApply,
  title = "More details found in the document",
  className,
}: Props) {
  const [rows, setRows] = useState<ExtraRowState[]>(() => buildExtraRows(extras, options, aliases));

  useEffect(() => {
    setRows(buildExtraRows(extras, options, aliases));
    // Options / aliases are static per page; rebuild only for a new extraction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extras]);

  const labelFor = useMemo(() => new Map(options.map((o) => [o.key, o.label])), [options]);
  const pendingWithTarget = useMemo(() => planApplyAll(rows), [rows]);
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  if (rows.length === 0) return null;

  const update = (id: string, patch: Partial<ExtraRowState>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const applyRow = (row: ExtraRowState): boolean => {
    if (!row.target) return false;
    if (row.target === NOTES_TARGET) {
      onApply(NOTES_TARGET, row.value, { label: row.label, value: row.value });
      update(row.id, { status: "applied", error: null, appliedTo: row.target });
      return true;
    }
    const res = coerceExtraValue(row.target, row.value);
    if (!res.ok) {
      update(row.id, { error: `Doesn't fit ${labelFor.get(row.target) ?? row.target}: ${res.reason}` });
      return false;
    }
    onApply(row.target, res.value, { label: row.label, value: row.value });
    update(row.id, { status: "applied", error: null, appliedTo: row.target });
    return true;
  };

  const applyAll = () => {
    const ids = new Set(pendingWithTarget);
    for (const row of rows) {
      if (ids.has(row.id)) applyRow(row);
    }
  };

  return (
    <div className={cn("rounded-xl border border-border bg-surface-raised p-5", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <p className="text-text-muted mt-1 text-xs">
            These details have no automatic field. Check the suggested field in <strong>Put into</strong>, change it
            if needed, then Apply. Text put into Notes is added below what is already there. Nothing is saved until
            you use the main Save button.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-border-strong bg-surface-base px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-subtle disabled:opacity-40"
          onClick={applyAll}
          disabled={pendingWithTarget.length === 0}
        >
          Apply all suggested ({pendingWithTarget.length})
        </button>
      </div>

      {pendingCount === 0 ? (
        <p className="text-text-muted mt-3 text-xs">All details have been handled.</p>
      ) : null}

      <ul className="mt-4 divide-y divide-border/80">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(
              "grid grid-cols-1 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-start sm:gap-3",
              row.status !== "pending" && "opacity-70",
            )}
            data-testid={`extra-row-${row.id}`}
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-text-primary">{row.label}</p>
              <p className="whitespace-pre-line break-words text-sm text-text-secondary">{row.value}</p>
              {row.error ? <p className="mt-1 text-xs text-status-danger">{row.error}</p> : null}
            </div>

            {row.status === "pending" ? (
              <>
                <div>
                  <label className="mb-1 block text-[11px] text-text-muted sm:sr-only" htmlFor={`${row.id}-target`}>
                    Put into
                  </label>
                  <select
                    id={`${row.id}-target`}
                    aria-label={`Put ${row.label} into`}
                    value={row.target}
                    onChange={(e) => update(row.id, { target: e.target.value, error: null })}
                    className="w-full rounded-lg border border-border-strong bg-surface-base px-2 py-1.5 text-sm focus:border-brand-primary focus:outline-none"
                  >
                    <option value={IGNORE_TARGET}>Don't use</option>
                    {options.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                        {o.key === row.suggestedField ? " (suggested)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => applyRow(row)}
                    disabled={!row.target}
                    className="min-h-[36px] rounded-lg border border-border-strong px-3 py-1 text-xs font-medium text-text-primary hover:bg-surface-subtle disabled:opacity-40"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => update(row.id, { status: "ignored", error: null })}
                    className="min-h-[36px] rounded-lg border border-border px-3 py-1 text-xs text-text-muted hover:bg-surface-subtle"
                  >
                    Dismiss
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 sm:col-span-2">
                {row.status === "applied" ? (
                  <span className="text-xs font-medium text-status-success">
                    Added to {labelFor.get(row.appliedTo ?? "") ?? row.appliedTo}
                  </span>
                ) : (
                  <>
                    <span className="text-xs text-text-muted">Not used</span>
                    <button
                      type="button"
                      onClick={() => update(row.id, { status: "pending" })}
                      className="text-xs text-brand-primary underline-offset-2 hover:underline"
                    >
                      Restore
                    </button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
