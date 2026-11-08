/**
 * Quick-add modal for HR masters (department, designation, section).
 * Codes are assigned automatically by the API, so no code field is shown.
 *
 * Rendered in a portal so it can safely be opened from inside another form
 * (for example the "Add designation" dialog) without nesting <form> elements.
 * Submit/click/keyboard events are stopped here so the parent form keeps its state.
 */
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  api,
  type HrDepartmentResponse,
  type HrDesignationResponse,
  type HrSectionResponse,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X } from "lucide-react";
import { logApiError } from "@/utils/logApiError";
import { erpControlFocusClass } from "@/components/app/listPageLayout";
import { cn } from "@/lib/utils";
import {
  HR_MASTER_LABELS,
  buildDepartmentQuickPayload,
  buildDesignationQuickPayload,
  buildSectionQuickPayload,
  validateQuickAddName,
  type HrMasterKind,
} from "./hrQuickAddPayload";

export type HrQuickAddRecord = HrDepartmentResponse | HrDesignationResponse | HrSectionResponse;

export type HrMasterQuickAddModalProps = {
  open: boolean;
  onClose: () => void;
  kind: HrMasterKind;
  /** Designation only: department pre-selected in the modal (optional). */
  defaultDepartmentId?: number | null;
  /** Designation only: departments the user may pick from. */
  departments?: { id: number; label: string }[];
  onCreated: (record: HrQuickAddRecord) => void;
};

export function HrMasterQuickAddModal({
  open,
  onClose,
  kind,
  defaultDepartmentId = null,
  departments = [],
  onCreated,
}: HrMasterQuickAddModalProps) {
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState<number | null>(defaultDepartmentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const errorId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  // Fresh state each time the dialog opens; never touches the parent's state.
  useEffect(() => {
    if (open) {
      setName("");
      setDepartmentId(defaultDepartmentId ?? null);
      setError("");
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const label = HR_MASTER_LABELS[kind];
  const title = `Add ${label}`;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (!busy) onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    // The parent dialog may be a <form>; React bubbles portal events to it.
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const validation = validateQuickAddName(name);
    if (validation) {
      setError(validation);
      nameRef.current?.focus();
      return;
    }
    setError("");
    setBusy(true);
    try {
      let created: HrQuickAddRecord;
      if (kind === "department") {
        created = await api.createHrDepartment(buildDepartmentQuickPayload(name));
      } else if (kind === "designation") {
        created = await api.createHrDesignation(buildDesignationQuickPayload(name, departmentId));
      } else {
        created = await api.createHrSection(buildSectionQuickPayload(name));
      }
      onCreated(created);
      onClose();
    } catch (err) {
      logApiError("HrMasterQuickAddModal.submit", err);
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        e.stopPropagation();
        if (!busy) onClose();
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <Card className="w-full max-w-md shadow-xl" onClick={stop}>
        <CardHeader className="flex flex-row items-center justify-between border-b border-border-subtle pb-3">
          <CardTitle id={titleId} className="text-lg">
            {title}
          </CardTitle>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} disabled={busy} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            {error ? (
              <div
                id={errorId}
                role="alert"
                className="rounded-md border border-status-danger/30 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground"
              >
                {error}
              </div>
            ) : null}
            <div>
              <label htmlFor={`${titleId}-name`} className="mb-1 block text-xs font-medium text-text-muted">
                {kind === "designation" ? "Designation name" : kind === "section" ? "Section name" : "Department name"}{" "}
                <span aria-hidden="true">**</span>
              </label>
              <input
                id={`${titleId}-name`}
                ref={nameRef}
                className={cn("w-full rounded-lg border border-border-strong px-3 py-2 text-sm", erpControlFocusClass)}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Display name"
                maxLength={128}
                required
                aria-required="true"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
              />
            </div>
            {kind === "designation" && (
              <div>
                <label htmlFor={`${titleId}-dept`} className="mb-1 block text-xs font-medium text-text-muted">
                  Department (optional)
                </label>
                <select
                  id={`${titleId}-dept`}
                  className={cn("w-full rounded-lg border border-border-strong px-3 py-2 text-sm", erpControlFocusClass)}
                  value={departmentId ?? ""}
                  onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">No department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="text-xs text-text-muted">Code assigned automatically</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Create"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>,
    document.body,
  );
}
