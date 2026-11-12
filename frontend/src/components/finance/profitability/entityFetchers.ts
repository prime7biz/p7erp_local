/**
 * Search lists for the entity picker on the Style / LC / Buyer P&L page.
 * Styles and customers have server-side search; Master Contracts have only a plain list,
 * so that list is loaded once and filtered here.
 */
import type { ProfitEntityKind } from "@/api/financeControl";
import { commercialApi } from "@/api/commercial";
import { merchApi } from "@/api/merch";
import type { RemoteSelectOption } from "@/hooks/useRemotePaginatedSearch";
import { fetchCustomerPage, hydrateCustomer } from "@/lib/remoteSelectFetchers";
import { logApiError } from "@/utils/logApiError";

export type EntityPickKind = Exclude<ProfitEntityKind, "orders">;

export const ENTITY_KINDS: { kind: EntityPickKind; label: string; placeholder: string }[] = [
  { kind: "styles", label: "Style", placeholder: "Search style by code or name…" },
  { kind: "master-contracts", label: "Master contract / LC", placeholder: "Search contract by reference or buyer…" },
  { kind: "buyers", label: "Buyer (customer)", placeholder: "Search customer by code or name…" },
];

type Page = Promise<{ options: RemoteSelectOption[]; total: number }>;

export async function fetchStylePage(query: string, page: number, pageSize: number): Page {
  const res = await merchApi.listStylesWithTotal({
    search: query || undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return {
    options: res.rows.map((s) => ({ value: s.id, label: `${s.style_code} · ${s.name}`, meta: s })),
    // The server may not send a total; then assume one more page when this page is full.
    total: res.total ?? (page - 1) * pageSize + res.rows.length + (res.rows.length === pageSize ? 1 : 0),
  };
}

export async function hydrateStyle(id: number): Promise<RemoteSelectOption | null> {
  try {
    const s = await merchApi.getStyle(id);
    return { value: s.id, label: `${s.style_code} · ${s.name}`, meta: s };
  } catch (e) {
    logApiError("entityFetchers.hydrateStyle", e);
    return null;
  }
}

function contractLabel(c: { reference?: string; buyer_name?: string | null; contract_type?: string }): string {
  const type = c.contract_type === "EXPORT_LC" ? "LC" : c.contract_type === "SALES_CONTRACT" ? "Contract" : "";
  return [c.reference ?? "—", c.buyer_name, type].filter(Boolean).join(" · ");
}

export async function fetchContractPage(query: string, page: number, pageSize: number): Page {
  const all = await commercialApi.listMasterContracts();
  const needle = query.trim().toLowerCase();
  const matches = needle ? all.filter((c) => contractLabel(c).toLowerCase().includes(needle)) : all;
  const start = (page - 1) * pageSize;
  return {
    options: matches.slice(start, start + pageSize).map((c) => ({ value: c.id, label: contractLabel(c), meta: c })),
    total: matches.length,
  };
}

export async function hydrateContract(id: number): Promise<RemoteSelectOption | null> {
  try {
    const c = await commercialApi.getMasterContract(id);
    return { value: c.id, label: contractLabel(c), meta: c };
  } catch (e) {
    logApiError("entityFetchers.hydrateContract", e);
    return null;
  }
}

export function fetchersFor(kind: EntityPickKind): {
  fetchPage: (query: string, page: number, pageSize: number) => Page;
  hydrateById: (id: number) => Promise<RemoteSelectOption | null>;
} {
  if (kind === "styles") return { fetchPage: fetchStylePage, hydrateById: hydrateStyle };
  if (kind === "master-contracts") return { fetchPage: fetchContractPage, hydrateById: hydrateContract };
  return {
    fetchPage: fetchCustomerPage as unknown as (q: string, p: number, s: number) => Page,
    hydrateById: hydrateCustomer as unknown as (id: number) => Promise<RemoteSelectOption | null>,
  };
}
