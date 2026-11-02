import { useEffect, useSyncExternalStore } from "react";

/** Label of the record open on a detail page (e.g. an order code), shown as the last breadcrumb. */
let current: string | null = null;
const listeners = new Set<() => void>();

function setRecordLabel(label: string | null) {
  if (label === current) return;
  current = label;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRecordBreadcrumbLabel(): string | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** Call on a detail page once the record is loaded: `useRecordBreadcrumb(order?.order_code)`. */
export function useRecordBreadcrumb(label: string | null | undefined) {
  useEffect(() => {
    setRecordLabel(label?.trim() || null);
    return () => setRecordLabel(null);
  }, [label]);
}
