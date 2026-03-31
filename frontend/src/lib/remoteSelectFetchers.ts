import {
  api,
  type BtbLcRow,
  type ChartOfAccountResponse,
  type CostCenterResponse,
  type InventoryItemResponse,
  type OrderResponse,
  type TradeCaseRow,
  type VendorResponse,
} from "@/api/client";
import type { RemoteSelectOption } from "@/hooks/useRemotePaginatedSearch";

/** Paginated inventory items for RemoteSearchSelect (server search). */
export async function fetchInventoryItemPage(
  query: string,
  page: number,
  pageSize: number,
): Promise<{ options: RemoteSelectOption<InventoryItemResponse>[]; total: number }> {
  const res = await api.listInventoryItemsPaginated({
    search: query || undefined,
    page,
    page_size: pageSize,
  });
  return {
    options: res.items.map((it) => ({
      value: it.id,
      label: `${it.item_code} · ${it.name}`,
      meta: it,
    })),
    total: res.total,
  };
}

export async function hydrateInventoryItem(
  id: number,
): Promise<RemoteSelectOption<InventoryItemResponse> | null> {
  try {
    const it = await api.getInventoryItem(id);
    return { value: it.id, label: `${it.item_code} · ${it.name}`, meta: it };
  } catch {
    return null;
  }
}

export async function fetchVendorPage(
  query: string,
  page: number,
  pageSize: number,
): Promise<{ options: RemoteSelectOption<VendorResponse>[]; total: number }> {
  const res = await api.listVendorsPaginated({
    search: query || undefined,
    page,
    page_size: pageSize,
  });
  return {
    options: res.items.map((v) => ({
      value: v.id,
      label: `${v.vendor_code} · ${v.name}`,
      meta: v,
    })),
    total: res.total,
  };
}

export async function hydrateVendor(id: number): Promise<RemoteSelectOption<VendorResponse> | null> {
  try {
    const v = await api.getVendor(id);
    return { value: v.id, label: `${v.vendor_code} · ${v.name}`, meta: v };
  } catch {
    return null;
  }
}

export async function fetchOrderPage(
  query: string,
  page: number,
  pageSize: number,
): Promise<{ options: RemoteSelectOption<OrderResponse>[]; total: number }> {
  const res = await api.listOrdersPaginated({
    search: query || undefined,
    page,
    page_size: pageSize,
  });
  return {
    options: res.items.map((o) => ({
      value: o.id,
      label: `${o.order_code}${o.style_ref ? ` · ${o.style_ref}` : ""}`,
      meta: o,
    })),
    total: res.total,
  };
}

export async function hydrateOrder(id: number): Promise<RemoteSelectOption<OrderResponse> | null> {
  try {
    const o = await api.getOrder(id);
    return {
      value: o.id,
      label: `${o.order_code}${o.style_ref ? ` · ${o.style_ref}` : ""}`,
      meta: o,
    };
  } catch {
    return null;
  }
}

function chartAccountLabel(a: ChartOfAccountResponse): string {
  const type = a.account_type && a.account_type !== "posting" ? ` · ${a.account_type}` : "";
  return `${a.account_number} — ${a.name}${type}${a.enable_bill_wise ? " [Bill-Wise]" : ""}`;
}

export async function fetchChartAccountPage(
  query: string,
  page: number,
  pageSize: number,
): Promise<{ options: RemoteSelectOption<ChartOfAccountResponse>[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const res = await api.listChartOfAccountsWithTotal({
    active_only: true,
    search: query || undefined,
    limit: pageSize,
    offset,
  });
  return {
    options: res.rows.map((a) => ({
      value: a.id,
      label: chartAccountLabel(a),
      meta: a,
    })),
    total: res.total ?? res.rows.length,
  };
}

export async function hydrateChartAccount(
  id: number,
): Promise<RemoteSelectOption<ChartOfAccountResponse> | null> {
  try {
    const a = await api.getChartOfAccount(id);
    return { value: a.id, label: chartAccountLabel(a), meta: a };
  } catch {
    return null;
  }
}

export async function fetchCostCenterPage(
  query: string,
  page: number,
  pageSize: number,
): Promise<{ options: RemoteSelectOption<CostCenterResponse>[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const res = await api.listCostCentersWithTotal({
    active_only: true,
    search: query || undefined,
    limit: pageSize,
    offset,
  });
  return {
    options: res.rows.map((c) => ({
      value: c.id,
      label: `${c.center_code} — ${c.name}`,
      meta: c,
    })),
    total: res.total ?? res.rows.length,
  };
}

export async function hydrateCostCenter(id: number): Promise<RemoteSelectOption<CostCenterResponse> | null> {
  try {
    const c = await api.getCostCenter(id);
    return { value: c.id, label: `${c.center_code} — ${c.name}`, meta: c };
  } catch {
    return null;
  }
}

function tradeCaseLabel(t: TradeCaseRow): string {
  return `${t.reference} · ${t.direction} · ${t.current_stage}`;
}

/** Server-side search + offset pagination (trade_cases API). */
export async function fetchTradeCasePage(
  query: string,
  page: number,
  pageSize: number,
): Promise<{ options: RemoteSelectOption<TradeCaseRow>[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const rows = await api.listTradeCases({
    search: query.trim() || undefined,
    limit: pageSize + 1,
    offset,
  });
  const hasMore = rows.length > pageSize;
  const slice = hasMore ? rows.slice(0, pageSize) : rows;
  const total = hasMore ? offset + pageSize + 1 : offset + slice.length;
  return {
    options: slice.map((t) => ({
      value: t.id,
      label: tradeCaseLabel(t),
      meta: t,
    })),
    total,
  };
}

export async function hydrateTradeCase(id: number): Promise<RemoteSelectOption<TradeCaseRow> | null> {
  try {
    const t = await api.getTradeCase(id);
    return { value: t.id, label: tradeCaseLabel(t), meta: t };
  } catch {
    return null;
  }
}

function btbLcLabel(b: BtbLcRow): string {
  const ref = (b.lc_number || b.reference || `LC #${b.id}`).trim();
  const st = b.status ? ` · ${b.status}` : "";
  return `${ref}${st}`;
}

/**
 * BTB LC list API has no search parameter; we load up to 500 rows and filter client-side.
 * Sufficient for typical tenant volume; replace with server search if lists grow large.
 */
export async function fetchBtbLcPage(
  query: string,
  page: number,
  pageSize: number,
): Promise<{ options: RemoteSelectOption<BtbLcRow>[]; total: number }> {
  const rows = await api.listBtbLcs({ limit: 500, offset: 0 });
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          String(r.id).includes(q) ||
          (r.reference ?? "").toLowerCase().includes(q) ||
          (r.lc_number ?? "").toLowerCase().includes(q) ||
          (r.status ?? "").toLowerCase().includes(q),
      )
    : rows;
  const offset = (page - 1) * pageSize;
  const slice = filtered.slice(offset, offset + pageSize);
  return {
    options: slice.map((b) => ({
      value: b.id,
      label: btbLcLabel(b),
      meta: b,
    })),
    total: filtered.length,
  };
}

export async function hydrateBtbLc(id: number): Promise<RemoteSelectOption<BtbLcRow> | null> {
  try {
    const b = await api.getBtbLc(id);
    return { value: b.id, label: btbLcLabel(b), meta: b };
  } catch {
    return null;
  }
}
