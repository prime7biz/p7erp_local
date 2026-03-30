import { useMemo, useState } from "react";
import { api } from "@/api/client";
import type { CommercialFieldDef } from "@/lib/commercialChangeFields";
import { logApiError } from "@/utils/logApiError";

type Props = {
  open: boolean;
  onClose: () => void;
  entityType: "order" | "quotation";
  entityId: number;
  fieldDefs: CommercialFieldDef[];
  /** Current field values from detail record (keys match field_defs). */
  record: Record<string, unknown>;
  onCreated: () => void;
};

export function ProposeChangeModal({
  open,
  onClose,
  entityType,
  entityId,
  fieldDefs,
  record,
  onCreated,
}: Props) {
  const [fieldKey, setFieldKey] = useState(fieldDefs[0]?.key ?? "");
  const [reason, setReason] = useState("");
  const [newValueStr, setNewValueStr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const def = useMemo(() => fieldDefs.find((d) => d.key === fieldKey), [fieldDefs, fieldKey]);

  const currentRaw = record[fieldKey];
  const currentLabel =
    currentRaw === null || currentRaw === undefined
      ? "—"
      : typeof currentRaw === "object"
        ? JSON.stringify(currentRaw)
        : String(currentRaw);

  if (!open) return null;

  const buildNewValue = (): unknown => {
    if (!def) return newValueStr;
    if (def.input === "number") {
      const n = Number(newValueStr);
      if (Number.isNaN(n)) throw new Error("Enter a valid number");
      return n;
    }
    if (def.input === "date") {
      if (!newValueStr.trim()) throw new Error("Pick a date");
      return newValueStr.trim();
    }
    return newValueStr;
  };

  const submit = async () => {
    setError("");
    if (!fieldKey || !reason.trim()) {
      setError("Field and reason are required.");
      return;
    }
    setSubmitting(true);
    try {
      let newValue: unknown;
      try {
        newValue = buildNewValue();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Invalid value");
        setSubmitting(false);
        return;
      }
      await api.createCommercialChangeRequest({
        entity_type: entityType,
        entity_id: entityId,
        field_key: fieldKey,
        new_value: newValue,
        reason: reason.trim(),
        source: "manual",
      });
      onCreated();
      onClose();
      setReason("");
      setNewValueStr("");
    } catch (e) {
      logApiError("ProposeChangeModal.submit", e);
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-text-primary">Propose commercial change</h3>
        <p className="mt-1 text-xs text-text-muted">
          Creates a pending change request. An approver must approve before the value can be applied.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-text-secondary">Field</label>
            <select
              value={fieldKey}
              onChange={(e) => {
                setFieldKey(e.target.value);
                setNewValueStr("");
              }}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
            >
              {fieldDefs.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Current value</label>
            <div className="mt-1 rounded-lg border border-border-subtle bg-surface-subtle px-2 py-1.5 text-sm text-text-secondary">
              {currentLabel}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">New value</label>
            {def?.input === "select" && def.options ? (
              <select
                value={newValueStr}
                onChange={(e) => setNewValueStr(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
              >
                <option value="">Select…</option>
                {def.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : def?.input === "date" ? (
              <input
                type="date"
                value={newValueStr}
                onChange={(e) => setNewValueStr(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
              />
            ) : def?.input === "number" ? (
              <input
                type="number"
                value={newValueStr}
                onChange={(e) => setNewValueStr(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
              />
            ) : (
              <input
                type="text"
                value={newValueStr}
                onChange={(e) => setNewValueStr(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
              />
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary">Reason</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
              placeholder="Why is this change needed?"
            />
          </div>
        </div>
        {error && <div className="mt-2 text-xs text-status-danger-foreground">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-brand-primary-foreground hover:bg-brand-primary/90"
          >
            {submitting ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </div>
    </div>
  );
}
