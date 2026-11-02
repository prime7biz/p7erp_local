import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from "./useConfirm";

/** Mount once near the app root; pages call `useConfirm()` from `./useConfirm`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  }, []);

  useEffect(() => {
    if (!opts) return;
    confirmBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [opts, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => close(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={opts.description ? "confirm-desc" : undefined}
            className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title" className="text-base font-semibold text-text-primary">
              {opts.title}
            </h2>
            {opts.description ? (
              <p id="confirm-desc" className="mt-2 text-sm text-text-secondary">
                {opts.description}
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
              >
                {opts.cancelLabel ?? "Cancel"}
              </button>
              <button
                ref={confirmBtn}
                type="button"
                onClick={() => close(true)}
                className={
                  opts.danger
                    ? "rounded-lg bg-status-danger px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                    : "rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-brand-primary-foreground hover:opacity-90"
                }
              >
                {opts.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}