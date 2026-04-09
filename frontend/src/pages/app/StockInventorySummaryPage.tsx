import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers, Package, Warehouse, Workflow } from "lucide-react";
import { logApiError } from "@/utils/logApiError";

type Tab = "overview" | "group" | "warehouse" | "wip";

export function StockInventorySummaryPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [asOf, setAsOf] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof api.getStockSummaryOverview>> | null>(null);
  const [byGroup, setByGroup] = useState<Awaited<ReturnType<typeof api.getStockSummaryByGroup>> | null>(null);
  const [byWh, setByWh] = useState<Awaited<ReturnType<typeof api.getStockSummaryByWarehouse>> | null>(null);
  const [wip, setWip] = useState<Awaited<ReturnType<typeof api.getStockSummaryWip>> | null>(null);
  const [rebuildMsg, setRebuildMsg] = useState("");

  const asOfParam = asOf.trim() || undefined;

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [ov, g, w, wp] = await Promise.all([
        api.getStockSummaryOverview(asOfParam),
        api.getStockSummaryByGroup(asOfParam),
        api.getStockSummaryByWarehouse(asOfParam),
        api.getStockSummaryWip(),
      ]);
      setOverview(ov);
      setByGroup(g);
      setByWh(w);
      setWip(wp);
    } catch (e) {
      logApiError("StockInventorySummaryPage.load", e);
      setError(e instanceof Error ? e.message : "Failed to load summary");
    } finally {
      setLoading(false);
    }
  }, [asOfParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = (name: string, rows: Record<string, unknown>[]) => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]!);
    const escape = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const flatLinesFromGroup = () => {
    const rows: Record<string, unknown>[] = [];
    for (const g of byGroup?.groups ?? []) {
      for (const ln of g.lines) {
        rows.push({
          stock_group: g.stock_group_name ?? "Unassigned",
          ...ln,
        });
      }
    }
    return rows;
  };

  const flatLinesFromWh = () => {
    const rows: Record<string, unknown>[] = [];
    for (const w of byWh?.warehouses ?? []) {
      for (const ln of w.lines) {
        rows.push({
          warehouse: w.warehouse_name ?? "—",
          ...ln,
        });
      }
    }
    return rows;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">Stock Inventory Summary</h1>
          <p className="mt-1 text-sm text-text-muted">
            FIFO valuation by stock group and warehouse, plus WIP from issued process orders.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            className="rounded-lg border border-border-strong px-2 py-1.5 text-sm"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              setRebuildMsg("");
              try {
                const r = await api.postFifoRebuild();
                setRebuildMsg(`Replayed ${r.movements_replayed} movements.`);
                await load();
              } catch (e) {
                logApiError("StockInventorySummaryPage.fifoRebuild", e);
                setRebuildMsg(e instanceof Error ? e.message : "Rebuild failed");
              }
            }}
          >
            FIFO rebuild
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      ) : null}
      {rebuildMsg ? <p className="text-sm text-text-secondary">{rebuildMsg}</p> : null}

      <p className="text-xs text-text-muted">
        <strong>Material control:</strong> FIFO layers are built from all posted movements, including production material issues (
        <code className="rounded bg-surface-subtle px-1">PROD_ISSUE</code>) and consumption issues. For order-level BOM vs issued qty, use{" "}
        <Link className="text-status-info hover:underline" to="/app/inventory/consumption-control">
          Consumption control
        </Link>{" "}
        or the stock ledger with <code className="rounded bg-surface-subtle px-1">movement_kind</code> filters.
      </p>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["overview", "Overview", Package],
            ["group", "By group", Layers],
            ["warehouse", "By warehouse", Warehouse],
            ["wip", "WIP", Workflow],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
              tab === k ? "border-brand-primary bg-brand-primary/10 font-medium text-brand-primary" : "border-border text-text-secondary"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && overview ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-muted">Stock on hand (FIFO)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{overview.stock_on_hand_value.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-muted">WIP (process orders)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{overview.wip_value.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-muted">Grand total</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{overview.grand_total.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "group" && byGroup ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => exportCsv("stock_by_group", flatLinesFromGroup())}>
              Export CSV
            </Button>
          </div>
          {byGroup.groups.map((g) => (
            <Card key={g.stock_group_id ?? "none"} className="rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {g.stock_group_name ?? "Unassigned group"}{" "}
                  <span className="text-sm font-normal text-text-muted">
                    (Qty {g.total_qty.toLocaleString()} · Value {g.total_value.toLocaleString()})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-subtle text-left text-text-muted">
                    <tr>
                      <th className="px-4 py-2">Item</th>
                      <th className="px-4 py-2">Warehouse</th>
                      <th className="px-4 py-2">On hand</th>
                      <th className="px-4 py-2">Unit cost</th>
                      <th className="px-4 py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lines.map((ln) => (
                      <tr
                        key={`${ln.item_id}-${ln.warehouse_id}`}
                        role="link"
                        tabIndex={0}
                        onClick={() => navigate(`/app/inventory?tab=items&item=${ln.item_id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/app/inventory?tab=items&item=${ln.item_id}`);
                          }
                        }}
                        className="cursor-pointer border-t border-border-subtle hover:bg-surface-subtle/80"
                      >
                        <td className="px-4 py-2">
                          {ln.item_code} — {ln.item_name}
                        </td>
                        <td className="px-4 py-2">{ln.warehouse_name ?? "—"}</td>
                        <td className="px-4 py-2">{ln.on_hand_qty}</td>
                        <td className="px-4 py-2">{ln.unit_cost}</td>
                        <td className="px-4 py-2">{ln.line_value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "warehouse" && byWh ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => exportCsv("stock_by_warehouse", flatLinesFromWh())}>
              Export CSV
            </Button>
          </div>
          {byWh.warehouses.map((w) => (
            <Card key={w.warehouse_id ?? "none"} className="rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {w.warehouse_name ?? "No warehouse"}{" "}
                  <span className="text-sm font-normal text-text-muted">
                    (Qty {w.total_qty.toLocaleString()} · Value {w.total_value.toLocaleString()})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-subtle text-left text-text-muted">
                    <tr>
                      <th className="px-4 py-2">Item</th>
                      <th className="px-4 py-2">On hand</th>
                      <th className="px-4 py-2">Unit cost</th>
                      <th className="px-4 py-2">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.lines.map((ln) => (
                      <tr
                        key={`${ln.item_id}-${ln.warehouse_id}`}
                        role="link"
                        tabIndex={0}
                        onClick={() => navigate(`/app/inventory?tab=items&item=${ln.item_id}`)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            navigate(`/app/inventory?tab=items&item=${ln.item_id}`);
                          }
                        }}
                        className="cursor-pointer border-t border-border-subtle hover:bg-surface-subtle/80"
                      >
                        <td className="px-4 py-2">
                          {ln.item_code} — {ln.item_name}
                        </td>
                        <td className="px-4 py-2">{ln.on_hand_qty}</td>
                        <td className="px-4 py-2">{ln.unit_cost}</td>
                        <td className="px-4 py-2">{ln.line_value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "wip" && wip ? (
        <Card className="rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Work in process (ISSUED)</CardTitle>
            <span className="text-sm text-text-muted">Total: {wip.total_wip_value.toLocaleString()}</span>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle text-left text-text-muted">
                <tr>
                  <th className="px-4 py-2">Process #</th>
                  <th className="px-4 py-2">Input</th>
                  <th className="px-4 py-2">Output</th>
                  <th className="px-4 py-2">Qty</th>
                  <th className="px-4 py-2">WIP value</th>
                </tr>
              </thead>
              <tbody>
                {wip.rows.map((r) => (
                  <tr key={r.process_order_id} className="border-t border-border-subtle">
                    <td className="px-4 py-2">{r.process_number}</td>
                    <td className="px-4 py-2">{r.input_item_code}</td>
                    <td className="px-4 py-2">{r.output_item_code}</td>
                    <td className="px-4 py-2">{r.input_quantity}</td>
                    <td className="px-4 py-2">{r.wip_value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
