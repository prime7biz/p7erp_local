import { useEffect, useRef } from "react";

/**
 * Tally-style voucher keys. F-keys match Tally; Alt+digit is the fallback for
 * keyboards or browsers that swallow F-keys (e.g. Fn-lock laptops).
 */
export const VOUCHER_HOTKEYS: { fKey: string; digit: string; type: string; label: string }[] = [
  { fKey: "F4", digit: "4", type: "CONTRA", label: "Contra" },
  { fKey: "F5", digit: "5", type: "PAYMENT", label: "Payment" },
  { fKey: "F6", digit: "6", type: "RECEIPT", label: "Receipt" },
  { fKey: "F7", digit: "7", type: "JOURNAL", label: "Journal" },
];

export function voucherTypeForKey(e: Pick<KeyboardEvent, "key" | "code" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">): string | null {
  if (e.ctrlKey || e.metaKey || e.shiftKey) return null;
  for (const h of VOUCHER_HOTKEYS) {
    if (!e.altKey && e.key === h.fKey) return h.type;
    // `code` keeps Alt+digit working on layouts where Alt changes `key`.
    if (e.altKey && (e.key === h.digit || e.code === `Digit${h.digit}`)) return h.type;
  }
  return null;
}

type Options = {
  /** Open a new voucher form of this type. */
  onNewVoucher: (voucherType: string) => void;
  /** Called on Ctrl+Enter (submit=false) or Ctrl+Shift+Enter (submit=true) while the form is open. */
  onSave: (submit: boolean) => void;
  formOpen: boolean;
  /** When false, no key is captured (e.g. a modal is open on top). */
  enabled?: boolean;
};

/** Keyboard voucher entry for the Vouchers page. Listeners are removed when the page unmounts. */
export function useVoucherHotkeys({ onNewVoucher, onSave, formOpen, enabled = true }: Options) {
  const latest = useRef({ onNewVoucher, onSave, formOpen });
  useEffect(() => {
    latest.current = { onNewVoucher, onSave, formOpen };
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.isComposing) return;
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && latest.current.formOpen) {
        e.preventDefault();
        latest.current.onSave(e.shiftKey);
        return;
      }
      const type = voucherTypeForKey(e);
      if (!type) return;
      e.preventDefault();
      latest.current.onNewVoucher(type);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
