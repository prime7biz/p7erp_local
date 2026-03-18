import { useEffect, useState } from "react";
import { api } from "@/api/client";

type TabKey = "po" | "grn" | "challan" | "gatepass" | "stock";

function statusBadgeClass(status: string) {
  const s = status.toUpperCase();
  if (["DRAFT", "PENDING", "OPEN"].includes(s)) return "bg-surface-subtle text-text-secondary";
  if (["APPROVED", "SUBMITTED", "CHECKED", "RECOMMENDED"].includes(s)) return "bg-status-info-subtle text-status-info-foreground";
  if (["RECEIVED", "POSTED", "RELEASED", "CLOSED"].includes(s)) return "bg-status-success-subtle text-status-success-foreground";
  if (["REJECTED", "CANCELLED"].includes(s)) return "bg-status-danger-subtle text-status-danger-foreground";
  return "bg-surface-subtle text-text-secondary";
}

export function InventoryReconciliationPage() {
  const [tab, setTab] = useState<TabKey>("po");
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [poRows, setPoRows] = useState<Awaited<ReturnType<typeof api.listPurchaseOrders>>>([]);
  const [grnRows, setGrnRows] = useState<Awaited<ReturnType<typeof api.listGoodsReceiving>>>([]);
  const [challanRows, setChallanRows] = useState<Awaited<ReturnType<typeof api.listDeliveryChallans>>>([]);
  const [gateRows, setGateRows] = useState<Awaited<ReturnType<typeof api.listEnhancedGatePasses>>>([]);
  const [stockRows, setStockRows] = useState<Awaited<ReturnType<typeof api.getStockSummary>>>([]);
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof api.getInventoryReconciliationOverview>> | null>(null);
  const [pendingCrCount, setPendingCrCount] = useState(0);
  const [prevOverview, setPrevOverview] = useState<{
    purchase_orders_open: number;
    goods_receiving_open: number;
    delivery_challans_posted: number;
    gate_pass_released: number;
    stock_items_on_hand: number;
    pending_cr_count: number;
    low_stock_count: number;
  } | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setError("");
    try {
      const filter = {
        status_filter: statusFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      };
      const [po, grn, ch, gp, stock] = await Promise.all([
        api.listPurchaseOrders(filter),
        api.listGoodsReceiving(filter),
        api.listDeliveryChallans(filter),
        api.listEnhancedGatePasses(filter),
        api.getStockSummary(),
      ]);
      const [ov, pendingCrRows] = await Promise.all([
        api.getInventoryReconciliationOverview(),
        api.listConsumptionChangeRequests({ status_filter: "PENDING" }),
      ]);
      setPoRows(po);
      setGrnRows(grn);
      setChallanRows(ch);
      setGateRows(gp);
      setStockRows(stock);
      setOverview(ov);
      setPendingCrCount(pendingCrRows.length);
      const lowStockCount = stock.filter((r) => r.on_hand_qty > 0 && r.on_hand_qty <= 5).length;
      const prevRaw = localStorage.getItem("p7_inventory_overview_snapshot");
      if (prevRaw) {
        try {
          setPrevOverview(
            JSON.parse(prevRaw) as {
              purchase_orders_open: number;
              goods_receiving_open: number;
              delivery_challans_posted: number;
              gate_pass_released: number;
              stock_items_on_hand: number;
              pending_cr_count: number;
              low_stock_count: number;
            },
          );
        } catch {
          setPrevOverview(null);
        }
      }
      localStorage.setItem(
        "p7_inventory_overview_snapshot",
        JSON.stringify({
          purchase_orders_open: ov.purchase_orders_open,
          goods_receiving_open: ov.goods_receiving_open,
          delivery_challans_posted: ov.delivery_challans_posted,
          gate_pass_released: ov.gate_pass_released,
          stock_items_on_hand: ov.stock_items_on_hand,
          pending_cr_count: pendingCrRows.length,
          low_stock_count: lowStockCount,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory reports");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toCsv = (rows: Array<Record<string, unknown>>) => {
    if (!rows.length) return "";
    const firstRow = rows[0];
    if (!firstRow) return "";
    const headers = Object.keys(firstRow);
    const escape = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = [headers.join(",")];
    for (const row of rows) {
      lines.push(headers.map((h) => escape(row[h])).join(","));
    }
    return lines.join("\n");
  };

  const exportCurrent = () => {
    let data: Array<Record<string, unknown>> = [];
    if (tab === "po") data = poRows as unknown as Array<Record<string, unknown>>;
    if (tab === "grn") data = grnRows as unknown as Array<Record<string, unknown>>;
    if (tab === "challan") data = challanRows as unknown as Array<Record<string, unknown>>;
    if (tab === "gatepass") data = gateRows as unknown as Array<Record<string, unknown>>;
    if (tab === "stock") data = stockRows as unknown as Array<Record<string, unknown>>;
    const content = toCsv(data);
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory_${tab}_reconciliation.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const q = search.trim().toLowerCase();
  const trend = (current: number, previous?: number) => {
    if (previous == null) return "";
    if (current > previous) return "↑";
    if (current < previous) return "↓";
    return "→";
  };
  const fpo = q ? poRows.filter((r) => `${r.po_code} ${r.supplier_name} ${r.status}`.toLowerCase().includes(q)) : poRows;
  const fgrn = q ? grnRows.filter((r) => `${r.grn_code} ${r.purchase_order_id ?? ""} ${r.status}`.toLowerCase().includes(q)) : grnRows;
  const fchallan = q ? challanRows.filter((r) => `${r.challan_code} ${r.customer_name} ${r.status}`.toLowerCase().includes(q)) : challanRows;
  const fgate = q ? gateRows.filter((r) => `${r.gate_pass_code} ${r.purpose} ${r.status}`.toLowerCase().includes(q)) : gateRows;
  const fstock = q ? stockRows.filter((r) => `${r.item_name} ${r.warehouse_name ?? ""}`.toLowerCase().includes(q)) : stockRows;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Inventory Reconciliation</h1>
        <p className="text-sm text-text-muted">Single view of PO, GRN, Challan, Gate Pass, and current stock.</p>
      </div>

      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle p-3 text-sm text-status-danger-foreground">{error}</div> : null}

      {overview ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <div className="text-text-muted">PO Open</div>
            <div className="text-xl font-semibold">{overview.purchase_orders_open} <span className="text-xs text-text-muted">{trend(overview.purchase_orders_open, prevOverview?.purchase_orders_open)}</span></div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <div className="text-text-muted">GRN Open</div>
            <div className="text-xl font-semibold">{overview.goods_receiving_open} <span className="text-xs text-text-muted">{trend(overview.goods_receiving_open, prevOverview?.goods_receiving_open)}</span></div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <div className="text-text-muted">Challan Posted</div>
            <div className="text-xl font-semibold">{overview.delivery_challans_posted} <span className="text-xs text-text-muted">{trend(overview.delivery_challans_posted, prevOverview?.delivery_challans_posted)}</span></div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <div className="text-text-muted">Gate Pass Released</div>
            <div className="text-xl font-semibold">{overview.gate_pass_released} <span className="text-xs text-text-muted">{trend(overview.gate_pass_released, prevOverview?.gate_pass_released)}</span></div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <div className="text-text-muted">Items On Hand</div>
            <div className="text-xl font-semibold">{overview.stock_items_on_hand} <span className="text-xs text-text-muted">{trend(overview.stock_items_on_hand, prevOverview?.stock_items_on_hand)}</span></div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <div className="text-text-muted">Pending CR</div>
            <div className="text-xl font-semibold">{pendingCrCount} <span className="text-xs text-text-muted">{trend(pendingCrCount, prevOverview?.pending_cr_count)}</span></div>
          </div>
          <div className="rounded-xl border border-border bg-surface-raised p-3 text-sm">
            <div className="text-text-muted">Low Stock Items</div>
            <div className="text-xl font-semibold">{stockRows.filter((r) => r.on_hand_qty > 0 && r.on_hand_qty <= 5).length} <span className="text-xs text-text-muted">{trend(stockRows.filter((r) => r.on_hand_qty > 0 && r.on_hand_qty <= 5).length, prevOverview?.low_stock_count)}</span></div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button className={`rounded border px-3 py-1 text-sm ${tab === "po" ? "bg-surface-inverse text-brand-primary-foreground" : ""}`} onClick={() => setTab("po")}>PO</button>
        <button className={`rounded border px-3 py-1 text-sm ${tab === "grn" ? "bg-surface-inverse text-brand-primary-foreground" : ""}`} onClick={() => setTab("grn")}>GRN</button>
        <button className={`rounded border px-3 py-1 text-sm ${tab === "challan" ? "bg-surface-inverse text-brand-primary-foreground" : ""}`} onClick={() => setTab("challan")}>Challan</button>
        <button className={`rounded border px-3 py-1 text-sm ${tab === "gatepass" ? "bg-surface-inverse text-brand-primary-foreground" : ""}`} onClick={() => setTab("gatepass")}>Gate Pass</button>
        <button className={`rounded border px-3 py-1 text-sm ${tab === "stock" ? "bg-surface-inverse text-brand-primary-foreground" : ""}`} onClick={() => setTab("stock")}>Stock</button>
        <input
          className="w-full rounded border px-3 py-1 text-sm sm:w-auto"
          placeholder="Status (e.g. DRAFT)"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
        <input className="w-full rounded border px-3 py-1 text-sm sm:w-auto" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input className="w-full rounded border px-3 py-1 text-sm sm:w-auto" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <button className="rounded border px-3 py-1 text-sm" onClick={() => void load()}>
          Apply Filters
        </button>
        <input
          className="w-full rounded border px-3 py-1 text-sm sm:w-auto"
          placeholder="Search current tab..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="rounded border px-3 py-1 text-sm" onClick={() => exportCurrent()}>
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        {tab === "po" ? (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left text-text-secondary"><tr><th className="px-4 py-3">PO</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Quick Link</th></tr></thead>
            <tbody>{fpo.map((r) => <tr key={r.id} className="border-t"><td className="px-4 py-3">{r.po_code}</td><td className="px-4 py-3">{r.supplier_name}</td><td className="px-4 py-3"><span className={`rounded px-2 py-1 text-xs font-semibold ${statusBadgeClass(r.status)}`}>{r.status}</span></td><td className="px-4 py-3"><a className="text-xs text-status-info hover:underline" href={`/app/inventory/purchase-orders?status=${encodeURIComponent(r.status)}`}>Open PO Page</a></td></tr>)}</tbody>
          </table>
        ) : null}
        {tab === "grn" ? (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left text-text-secondary"><tr><th className="px-4 py-3">GRN</th><th className="px-4 py-3">PO Ref</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Quick Link</th></tr></thead>
            <tbody>{fgrn.map((r) => <tr key={r.id} className="border-t"><td className="px-4 py-3">{r.grn_code}</td><td className="px-4 py-3">{r.purchase_order_id ?? "-"}</td><td className="px-4 py-3"><span className={`rounded px-2 py-1 text-xs font-semibold ${statusBadgeClass(r.status)}`}>{r.status}</span></td><td className="px-4 py-3"><a className="text-xs text-status-info hover:underline" href={`/app/inventory/goods-receiving?status=${encodeURIComponent(r.status)}`}>Open GRN Page</a></td></tr>)}</tbody>
          </table>
        ) : null}
        {tab === "challan" ? (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left text-text-secondary"><tr><th className="px-4 py-3">Challan</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Quick Link</th></tr></thead>
            <tbody>{fchallan.map((r) => <tr key={r.id} className="border-t"><td className="px-4 py-3">{r.challan_code}</td><td className="px-4 py-3">{r.customer_name}</td><td className="px-4 py-3"><span className={`rounded px-2 py-1 text-xs font-semibold ${statusBadgeClass(r.status)}`}>{r.status}</span></td><td className="px-4 py-3"><a className="text-xs text-status-info hover:underline" href={`/app/inventory/delivery-challans?status=${encodeURIComponent(r.status)}`}>Open Challan Page</a></td></tr>)}</tbody>
          </table>
        ) : null}
        {tab === "gatepass" ? (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left text-text-secondary"><tr><th className="px-4 py-3">Gate Pass</th><th className="px-4 py-3">Purpose</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Quick Link</th></tr></thead>
            <tbody>{fgate.map((r) => <tr key={r.id} className="border-t"><td className="px-4 py-3">{r.gate_pass_code}</td><td className="px-4 py-3">{r.purpose}</td><td className="px-4 py-3"><span className={`rounded px-2 py-1 text-xs font-semibold ${statusBadgeClass(r.status)}`}>{r.status}</span></td><td className="px-4 py-3"><a className="text-xs text-status-info hover:underline" href={`/app/inventory/enhanced-gate-passes?status=${encodeURIComponent(r.status)}`}>Open Gate Pass Page</a></td></tr>)}</tbody>
          </table>
        ) : null}
        {tab === "stock" ? (
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left text-text-secondary"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Warehouse</th><th className="px-4 py-3">In</th><th className="px-4 py-3">Out</th><th className="px-4 py-3">On Hand</th></tr></thead>
            <tbody>{fstock.map((r) => <tr key={`${r.item_id}-${r.warehouse_id ?? 0}`} className="border-t"><td className="px-4 py-3">{r.item_name}</td><td className="px-4 py-3">{r.warehouse_name ?? "-"}</td><td className="px-4 py-3">{r.in_qty}</td><td className="px-4 py-3">{r.out_qty}</td><td className="px-4 py-3 font-semibold">{r.on_hand_qty}</td></tr>)}</tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

