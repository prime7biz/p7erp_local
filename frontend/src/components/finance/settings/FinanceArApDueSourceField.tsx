import { useId } from "react";

/** Tenant setting key that stores the choice (feature flag `finance_ar_ap_due_source`). */
export const FINANCE_AR_AP_DUE_SOURCE_KEY = "finance_ar_ap_due_source";

/** The bill records the backend can read "due till today" amounts from. */
export const FINANCE_AR_AP_DUE_SOURCE_OPTIONS = [
  { value: "outstanding_bills", label: "Outstanding bills" },
  { value: "party_ledger", label: "Party ledgers" },
  { value: "bill_references", label: "Bill references" },
] as const;

const AUTOMATIC_LABEL = "Automatic (recommended): party ledgers when switched on, otherwise outstanding bills";

const selectClass =
  "w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-80";

interface Props {
  /** Saved choice; undefined (or an unknown value) means "Automatic" (the backend picks the standard source). */
  value: string | undefined;
  /** Called with the new choice, or undefined when the user picks "Automatic" (the caller removes the key). */
  onChange: (next: string | undefined) => void;
  disabled?: boolean;
}

/**
 * Settings → Configuration → Finance: which bill records Ratio Analysis and the
 * Finance Control Tower use for "due till today" amounts.
 */
export function FinanceArApDueSourceField({ value, onChange, disabled = false }: Props) {
  const id = useId();
  const helpId = `${id}-help`;
  const known = FINANCE_AR_AP_DUE_SOURCE_OPTIONS.some((o) => o.value === value);

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-text-primary">
        Bill source for amounts due
      </label>
      <select
        id={id}
        className={selectClass}
        value={known ? value : ""}
        disabled={disabled}
        aria-describedby={helpId}
        onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      >
        <option value="">{AUTOMATIC_LABEL}</option>
        {FINANCE_AR_AP_DUE_SOURCE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <p id={helpId} className="text-xs text-text-muted">
        Which bill records Ratio Analysis and the Finance Control Tower use for amounts due till today. Leave it on
        Automatic unless your company keeps its bills in one specific place.
      </p>
    </div>
  );
}
