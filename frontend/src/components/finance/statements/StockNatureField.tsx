import { useEffect, useState } from "react";
import { financeStatementsApi, type StockNatureState } from "@/api/financeStatements";
import { useAuth } from "@/context/AuthContext";
import { logApiError } from "@/utils/logApiError";
import { canEditClassification, classLabel } from "./statementClassLogic";

const selectClass =
  "w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-80";

/**
 * "Stock nature" of one stock group (raw material / work in process / finished goods / other).
 * It is used by the Tally-style statements and the Stock vs Ledger report. Manager / admin only.
 */
export function StockNatureField({ groupId, onSaved }: { groupId: number; onSaved?: () => void }) {
  const { me } = useAuth();
  const canEdit = canEditClassification(me?.role_name);
  const [state, setState] = useState<StockNatureState | null>(null);
  const [choice, setChoice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSaved(false);
    financeStatementsApi
      .getStockNature(groupId)
      .then((s) => {
        if (cancelled) return;
        setState(s);
        setChoice(s.stock_nature ?? "");
      })
      .catch((e: unknown) => {
        logApiError("StockNatureField.load", e);
        if (!cancelled) setError((e as Error).message || "Could not load the stock nature");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const next = await financeStatementsApi.setStockNature(groupId, choice || null);
      setState(next);
      setChoice(next.stock_nature ?? "");
      setSaved(true);
      onSaved?.();
    } catch (e) {
      logApiError("StockNatureField.save", e);
      if ((e as { status?: number }).status === 403) {
        setError("Only a manager or admin can change the stock nature.");
        setChoice(state?.stock_nature ?? "");
      } else {
        setError((e as Error).message || "Could not save the stock nature");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-text-muted">Loading stock nature…</p>;
  if (!state) return error ? <p role="alert" className="text-sm text-status-danger-foreground">{error}</p> : null;
  const changed = (state.stock_nature ?? "") !== choice;

  return (
    <fieldset className="space-y-2 border-t border-border-subtle pt-4" aria-label="Stock nature">
      <legend className="sr-only">Stock nature</legend>
      <label className="block text-xs font-medium text-text-muted">
        Stock nature (for statements)
        <select
          className={`${selectClass} mt-1`}
          value={choice}
          disabled={!canEdit || saving}
          onChange={(e) => {
            setChoice(e.target.value);
            setSaved(false);
          }}
        >
          <option value="">Inherit / Unclassified</option>
          {state.allowed_natures.map((n) => (
            <option key={n} value={n}>
              {classLabel(n)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-text-muted" data-testid="effective-nature">
        Effective: <b>{classLabel(state.effective_nature)}</b>
        {state.stock_nature == null && state.effective_nature ? " (inherited from a parent group)" : ""}
      </p>
      {canEdit ? (
        <button
          type="button"
          className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
          disabled={!changed || saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save stock nature"}
        </button>
      ) : (
        <p className="text-xs text-text-muted">Read only. A manager or admin can change this.</p>
      )}
      {error ? <p role="alert" className="text-sm text-status-danger-foreground">{error}</p> : null}
      {saved ? <p role="status" className="text-sm text-status-success-foreground">Stock nature saved.</p> : null}
    </fieldset>
  );
}
