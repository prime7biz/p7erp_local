import { useEffect, useState } from "react";
import { financeStatementsApi, type StatementClassState } from "@/api/financeStatements";
import { useAuth } from "@/context/AuthContext";
import { logApiError } from "@/utils/logApiError";
import { canEditClassification, classLabel } from "./statementClassLogic";

interface Props {
  groupId: number;
  /** Shows the name of the group a class is inherited from. */
  groupNameOf?: (id: number) => string | undefined;
  /** Called after a successful save (the list can reload its "Statement class" column). */
  onSaved?: () => void;
}

const selectClass =
  "w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand-primary focus:ring-1 focus:ring-focus-ring disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-80";

/**
 * "Statement class" of one account group (Tally-style statements). Choose a class, read the preview of
 * what it changes, then press Save. Only a manager or admin can save; others see it read-only.
 * "Inherit / Unclassified" clears the group's own class (it then follows its parent, or stays Unclassified).
 */
export function StatementClassField({ groupId, groupNameOf, onSaved }: Props) {
  const { me } = useAuth();
  const canEdit = canEditClassification(me?.role_name);
  const [state, setState] = useState<StatementClassState | null>(null);
  const [preview, setPreview] = useState<StatementClassState | null>(null);
  const [choice, setChoice] = useState(""); // "" = Inherit / Unclassified
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSaved(false);
    setPreview(null);
    financeStatementsApi
      .getStatementClass(groupId)
      .then((s) => {
        if (cancelled) return;
        setState(s);
        setChoice(s.statement_class ?? "");
      })
      .catch((e: unknown) => {
        logApiError("StatementClassField.load", e);
        if (!cancelled) setError((e as Error).message || "Could not load the statement class");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  async function onChoose(value: string) {
    setChoice(value);
    setSaved(false);
    setError("");
    if (!value) {
      setPreview(null);
      return;
    }
    try {
      setPreview(await financeStatementsApi.getStatementClass(groupId, value));
    } catch (e) {
      logApiError("StatementClassField.preview", e);
      setPreview(null);
      setError((e as Error).message || "Could not preview this change");
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const next = await financeStatementsApi.setStatementClass(groupId, choice || null);
      setState(next);
      setChoice(next.statement_class ?? "");
      setPreview(null);
      setSaved(true);
      onSaved?.();
    } catch (e) {
      logApiError("StatementClassField.save", e);
      if ((e as { status?: number }).status === 403) {
        setError("Only a manager or admin can change the statement class.");
        setChoice(state?.statement_class ?? "");
        setPreview(null);
      } else {
        setError((e as Error).message || "Could not save the statement class");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-text-muted">Loading statement class…</p>;
  if (!state) return error ? <p role="alert" className="text-sm text-status-danger-foreground">{error}</p> : null;

  const changed = (state.statement_class ?? "") !== choice;
  const shown = preview ?? state;
  const inheritedFrom = state.inherited_from_group_id != null ? groupNameOf?.(state.inherited_from_group_id) : undefined;

  return (
    <fieldset className="space-y-2 rounded-lg border border-border-subtle bg-surface-subtle/50 p-4" aria-label="Statement class">
      <legend className="px-1 text-sm font-medium text-text-primary">Statement class</legend>
      <p className="text-xs text-text-muted">
        Decides where this group appears in the Trial Balance, Balance Sheet and Profit &amp; Loss. Sub-groups and ledgers follow it
        unless they have their own class.
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,18rem)_auto] sm:items-end">
        <label className="text-xs font-medium text-text-muted">
          Class
          <select
            className={`${selectClass} mt-1`}
            value={choice}
            disabled={!canEdit || saving}
            onChange={(e) => void onChoose(e.target.value)}
          >
            <option value="">Inherit / Unclassified</option>
            {state.allowed_classes.map((c) => (
              <option key={c} value={c}>
                {classLabel(c)}
              </option>
            ))}
          </select>
        </label>
        {canEdit ? (
          <button
            type="button"
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-brand-primary-foreground shadow-sm hover:bg-brand-primary/90 disabled:opacity-50"
            disabled={!changed || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save statement class"}
          </button>
        ) : (
          <p className="text-xs text-text-muted">Read only. A manager or admin can change this.</p>
        )}
      </div>

      <p className="text-sm text-text-secondary" data-testid="effective-class">
        Effective class: <b>{classLabel(state.effective_class)}</b>
        {state.statement_class == null && state.effective_class
          ? ` (inherited${inheritedFrom ? ` from ${inheritedFrom}` : ""})`
          : ""}
      </p>

      {changed ? (
        <div className="rounded-lg border border-border bg-surface-raised p-3 text-sm" data-testid="class-preview">
          <p className="font-medium text-text-primary">
            Preview: {choice ? <>this group becomes <b>{classLabel(choice)}</b></> : <>this group goes back to inheriting</>}
          </p>
          <p className="text-text-secondary">
            Affects {shown.affected_group_count} group(s) and {shown.affected_ledger_count} ledger(s) in {shown.reports.length} statement(s).
          </p>
          {shown.affected_groups.length > 0 ? (
            <ul className="mt-1 max-h-32 list-inside list-disc overflow-auto text-xs text-text-muted">
              {shown.affected_groups.map((g) => (
                <li key={g.id}>
                  {g.name}: {classLabel(g.current_effective_class)} → {choice ? classLabel(choice) : "inherited"}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {error ? <p role="alert" className="text-sm text-status-danger-foreground">{error}</p> : null}
      {saved ? <p role="status" className="text-sm text-status-success-foreground">Statement class saved.</p> : null}
    </fieldset>
  );
}
