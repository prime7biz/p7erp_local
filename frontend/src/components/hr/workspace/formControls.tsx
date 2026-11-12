/**
 * Small labelled inputs for the employee workspace.
 * `highlight` adds a temporary brand ring to fields the AI just filled in.
 */
import { useId, type ReactNode } from "react";
import { erpControlFocusClass, mobileFieldClass } from "@/components/app/listPageLayout";
import { useMobileUiV2, useMobileUiV2Phone } from "@/hooks/useMobileUiV2";
import { cn } from "@/lib/utils";

const inputClass = "w-full rounded border border-border-strong bg-surface-raised px-3 py-2 text-sm disabled:bg-surface-subtle disabled:text-text-muted";

export function Section({
  title,
  description,
  children,
  className,
  collapsibleOnPhone = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /**
   * Optional sections only: with `mobile_ui_v2` on a phone the section starts folded (tap the title
   * to open). Values stay in the form either way; never use it for required or permission-gated fields.
   */
  collapsibleOnPhone?: boolean;
}) {
  const phone = useMobileUiV2Phone();
  const grid = <div className={cn("mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3", phone ? "gap-4" : "gap-3")}>{children}</div>;
  if (collapsibleOnPhone && phone) {
    return (
      <details className={cn("rounded-xl border border-border bg-surface-raised p-4", className)}>
        <summary className="flex min-h-11 cursor-pointer flex-col justify-center">
          <span className="text-sm font-semibold text-text-primary">{title} (optional)</span>
          {description && <span className="mt-0.5 text-xs text-text-muted">{description}</span>}
        </summary>
        {grid}
      </details>
    );
  }
  return (
    <section className={cn("rounded-xl border border-border bg-surface-raised p-4", className)}>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
      {grid}
    </section>
  );
}

/** Default phone keyboard for a field type when the caller did not choose one (mobile_ui_v2 only). */
function defaultInputMode(type: string): "tel" | "email" | "decimal" | undefined {
  if (type === "tel") return "tel";
  if (type === "email") return "email";
  if (type === "number") return "decimal";
  return undefined;
}

type FieldShellProps = {
  label: string;
  hint?: string;
  error?: string;
  masked?: boolean;
  className?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
};

export function FieldShell({ label, hint, error, masked, className, children }: FieldShellProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const help = error || (masked ? "Hidden for your role" : hint);
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-text-muted">
        {label}
      </label>
      {children(id, help ? helpId : undefined)}
      {help && (
        <p id={helpId} className={cn("mt-1 text-xs", error ? "text-status-danger" : "text-text-muted")}>
          {help}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date" | "email" | "tel" | "number";
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  masked?: boolean;
  highlight?: boolean;
  inputMode?: "numeric" | "tel" | "email" | "text";
  maxLength?: number;
  list?: string;
  className?: string;
};

export function TextField({
  label, value, onChange, type = "text", placeholder, hint, error, required, disabled, masked, highlight, inputMode, maxLength, list, className,
}: TextFieldProps) {
  const mobileV2 = useMobileUiV2();
  return (
    <FieldShell label={required ? `${label} *` : label} hint={hint} error={error} masked={masked} className={className}>
      {(id, describedBy) => (
        <input
          id={id}
          type={type}
          className={cn(
            inputClass,
            erpControlFocusClass,
            "transition-shadow duration-700",
            mobileV2 && mobileFieldClass,
            highlight && "ring-2 ring-brand-primary/50",
          )}
          value={masked ? "" : value}
          placeholder={masked ? "••••••" : placeholder}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled || masked}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          inputMode={inputMode ?? (mobileV2 ? defaultInputMode(type) : undefined)}
          maxLength={maxLength}
          list={list}
        />
      )}
    </FieldShell>
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  emptyLabel?: string;
  /** False hides the empty choice (the value cannot be cleared). */
  allowEmpty?: boolean;
  hint?: string;
  disabled?: boolean;
  masked?: boolean;
  highlight?: boolean;
  className?: string;
};

export function SelectField({
  label, value, onChange, options, emptyLabel = "Select…", allowEmpty = true, hint, disabled, masked, highlight, className,
}: SelectFieldProps) {
  const mobileV2 = useMobileUiV2();
  return (
    <FieldShell label={label} hint={hint} masked={masked} className={className}>
      {(id, describedBy) => (
        <select
          id={id}
          className={cn(inputClass, erpControlFocusClass, mobileV2 && mobileFieldClass, highlight && "ring-2 ring-brand-primary/50")}
          value={masked ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || masked}
          aria-describedby={describedBy}
        >
          {(allowEmpty || !value) && <option value="">{emptyLabel}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

export function CheckboxField({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) {
  const phone = useMobileUiV2Phone();
  return (
    <label className={cn("flex items-start gap-2 text-sm text-text-secondary", phone && "min-h-11 items-center gap-3")}>
      <input
        type="checkbox"
        className={phone ? "h-5 w-5 shrink-0" : "mt-0.5"}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-text-muted">{hint}</span>}
      </span>
    </label>
  );
}
