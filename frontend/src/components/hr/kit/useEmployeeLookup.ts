import { useEffect, useMemo, useState } from "react";
import { api, getTenantId } from "@/api/client";
import type { HrEmployeeLookupItem } from "@/api/hr";
import { logApiError } from "@/utils/logApiError";

/** Server limit for `GET /hr/employees/lookup`. */
const MAX_IDS_PER_REQUEST = 500;

/**
 * Names already fetched, keyed by tenant + employee id so another company's names
 * never show after switching login on the same device. `null` = not found.
 */
const cache = new Map<string, HrEmployeeLookupItem | null>();
const inflight = new Map<string, Promise<void>>();

const tenantPrefix = () => getTenantId() ?? "-";
const keyOf = (id: number, prefix = tenantPrefix()) => `${prefix}:${id}`;

async function loadMissing(ids: number[]): Promise<void> {
  // Fix the tenant when the request is sent, so a late answer can never be filed under another tenant.
  const prefix = tenantPrefix();
  const missing = ids.filter((id) => !cache.has(keyOf(id, prefix)) && !inflight.has(keyOf(id, prefix)));
  const waits = ids.map((id) => inflight.get(keyOf(id, prefix))).filter((p): p is Promise<void> => !!p);
  for (let i = 0; i < missing.length; i += MAX_IDS_PER_REQUEST) {
    const chunk = missing.slice(i, i + MAX_IDS_PER_REQUEST);
    const job = api
      .lookupHrEmployees(chunk)
      .then((rows) => {
        const found = new Map(rows.map((r) => [r.id, r]));
        for (const id of chunk) cache.set(keyOf(id, prefix), found.get(id) ?? null);
      })
      .catch((err: unknown) => {
        // Leave them uncached so a later render can retry; cells fall back to "Employee #id".
        logApiError("useEmployeeLookup", err);
      })
      .finally(() => {
        for (const id of chunk) inflight.delete(keyOf(id, prefix));
      });
    for (const id of chunk) inflight.set(keyOf(id, prefix), job);
    waits.push(job);
  }
  await Promise.all(waits);
}

export type EmployeeLookup = (id: number | null | undefined) => HrEmployeeLookupItem | null | undefined;

/**
 * Employee code + name for the ids shown in a table.
 * Returns a getter: `undefined` while loading, `null` when not found, otherwise the employee.
 */
export function useEmployeeLookup(ids: readonly (number | null | undefined)[]): EmployeeLookup {
  const [, setVersion] = useState(0);
  const unique = useMemo(
    () => [...new Set(ids.filter((id): id is number => typeof id === "number" && id > 0))].sort((a, b) => a - b),
    [ids],
  );
  const signature = unique.join(",");

  useEffect(() => {
    if (!signature) return;
    let cancelled = false;
    const wanted = signature.split(",").map(Number);
    void loadMissing(wanted).then(() => {
      if (!cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [signature]);

  return (id) => {
    if (typeof id !== "number" || id <= 0) return null;
    const key = keyOf(id);
    return cache.has(key) ? cache.get(key) : undefined;
  };
}

/** Test helper: forget every cached name. */
export function clearEmployeeLookupCache(): void {
  cache.clear();
  inflight.clear();
}

export function employeeLabel(item: HrEmployeeLookupItem): string {
  return `${item.employee_code} · ${item.full_name}`;
}
