import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type PasswordFieldInputProps = {
  id: string;
  value: string;
  onChange: (next: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  /** When true (default), shows a lock icon on the left and left padding for it */
  showLock?: boolean;
  wrapperClassName?: string;
  /** Base styles for the input; horizontal padding for icons is applied automatically */
  inputClassName: string;
};

/**
 * Password input with an eye toggle so users can verify typing.
 * Use `showLock={false}` for compact fields without a leading lock icon.
 */
export function PasswordFieldInput({
  id,
  value,
  onChange,
  autoComplete = "current-password",
  placeholder,
  required,
  minLength,
  showLock = true,
  wrapperClassName,
  inputClassName,
}: PasswordFieldInputProps) {
  const [visible, setVisible] = useState(false);
  const ToggleIcon = visible ? EyeOff : Eye;

  return (
    <div className={cn("relative", wrapperClassName)}>
      {showLock ? (
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
      ) : null}
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        className={cn(inputClassName, showLock ? "pl-10" : "pl-3", "pr-11")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-text-muted hover:bg-surface-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
      >
        <ToggleIcon className="h-4 w-4 shrink-0" aria-hidden />
      </button>
    </div>
  );
}
