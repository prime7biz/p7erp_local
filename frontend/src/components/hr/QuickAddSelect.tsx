/**
 * Select with an inline "+" button that opens the HR quick-add modal.
 * The created record is passed to `onCreated` (so the parent can add it to its
 * option list) and then auto-selected through `onChange`.
 */
import { useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { erpControlFocusClass } from "@/components/app/listPageLayout";
import { cn } from "@/lib/utils";
import { HrMasterQuickAddModal, type HrQuickAddRecord } from "./HrMasterQuickAddModal";
import { HR_MASTER_LABELS, type HrMasterKind } from "./hrQuickAddPayload";

export type QuickAddSelectOption = { id: number; label: string };

export type QuickAddSelectProps = {
  kind: HrMasterKind;
  label: string;
  value: number | null;
  options: QuickAddSelectOption[];
  onChange: (id: number | null) => void;
  /** Called with the new record before it is selected, so the parent can add it to `options`. */
  onCreated: (record: HrQuickAddRecord) => void;
  /** Text of the empty option, e.g. "No department". */
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  /** Designation quick-add only: department pre-selected in the modal. */
  defaultDepartmentId?: number | null;
  /** Designation quick-add only: departments to choose from in the modal. */
  departmentOptions?: QuickAddSelectOption[];
  /** Hide the "+" button (for example when the user cannot create). */
  allowQuickAdd?: boolean;
  className?: string;
};

export function QuickAddSelect({
  kind,
  label,
  value,
  options,
  onChange,
  onCreated,
  emptyLabel = "Select…",
  required = false,
  disabled = false,
  defaultDepartmentId = null,
  departmentOptions,
  allowQuickAdd = true,
  className,
}: QuickAddSelectProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const selectId = useId();
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const kindLabel = HR_MASTER_LABELS[kind];

  const closeModal = () => {
    setModalOpen(false);
    // Return focus to the trigger so keyboard users keep their place.
    window.setTimeout(() => addButtonRef.current?.focus(), 0);
  };

  return (
    <div className={className}>
      <label htmlFor={selectId} className="mb-1 block text-xs font-medium text-text-muted">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <select
          id={selectId}
          className={cn("min-w-0 flex-1 rounded border border-border-strong px-3 py-2 text-sm", erpControlFocusClass)}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          required={required}
          disabled={disabled}
        >
          <option value="">{emptyLabel}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {allowQuickAdd && (
          <button
            ref={addButtonRef}
            type="button"
            onClick={() => setModalOpen(true)}
            disabled={disabled}
            aria-label={`Add new ${kindLabel}`}
            title={`Add new ${kindLabel}`}
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded border border-border-strong px-2.5 text-text-secondary hover:bg-surface-subtle disabled:opacity-50",
              erpControlFocusClass,
            )}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <HrMasterQuickAddModal
        open={modalOpen}
        onClose={closeModal}
        kind={kind}
        defaultDepartmentId={defaultDepartmentId}
        departments={departmentOptions}
        onCreated={(record) => {
          onCreated(record);
          onChange(record.id);
        }}
      />
    </div>
  );
}
