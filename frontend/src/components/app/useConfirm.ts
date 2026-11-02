import { createContext, useContext } from "react";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions (delete, cancel, reject). */
  danger?: boolean;
};

export type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

/** `const confirm = useConfirm(); if (await confirm({ title: "Delete?", danger: true })) ...` */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  // Outside the provider (tests, isolated renders) fall back to the browser dialog.
  return ctx ?? (async (o) => window.confirm(o.description ? `${o.title}\n\n${o.description}` : o.title));
}
