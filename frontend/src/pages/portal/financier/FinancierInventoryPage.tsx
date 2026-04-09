import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";
import { logApiError } from "@/utils/logApiError";

type GroupLine = {
  item_id: number;
  item_code: string;
  item_name: string;
  warehouse_id: number | null;
  warehouse_name: string | null;
  on_hand_qty: number;
  unit_cost: number;
  line_value: number;
};

type GroupBlock = {
  stock_group_id: number | null;
  stock_group_name: string;
  total_qty: number;
  total_value: number;
  lines: GroupLine[];
};

type LedgerRow = Record<string, unknown>;

type InventoryOverviewPayload = {
  total_inventory_value?: number;
  total_wip_value?: number;
  grand_total?: number;
  category_count?: number;
  item_count?: number;
  item_position_count?: number;
};

export function FinancierInventoryPage() {
  const { itemId: itemIdParam } = useParams();
  const navigate = useNavigate();
  const itemId = itemIdParam ? parseInt(itemIdParam, 10) : NaN;
  const itemSelected = Number.isFinite(itemId) && itemId > 0;

  const [tab, setTab] = useState<"positions" | "accounting">("positions");
  const [btbScope, setBtbScope] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [includeGl, setIncludeGl] = useState(true);

  const [overview, setOverview] = useState<InventoryOverviewPayload | null>(null);
  const [byGroup, setByGroup] = useState<{ groups: GroupBlock[]; note?: string | null } | null>(null);
  const [ledger, setLedger] = useState<Record<string, unknown> | null>(null);
  const [recon, setRecon] = useState<Record<string, unknown> | null>(null);
  const [balance, setBalance] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");

  const loadOverview = useCallback(async () => {
    try {
        setOverview((await financierPortalApi.inventoryOverview()) as InventoryOverviewPayload);
    } catch (e) {
      logApiError("financier inventory overview", e);
      throw e;
    }
  }, []);

  const loadByGroup = useCallback(async () => {
    try {
      const d = await financierPortalApi.inventoryByGroup({ btb_scope: btbScope });
      setByGroup({
        groups: (d.groups as GroupBlock[]) ?? [],
        note: typeof d.note === "string" ? d.note : null,
      });
    } catch (e) {
      logApiError("financier inventory by-group", e);
      throw e;
    }
  }, [btbScope]);

  const loadLedger = useCallback(async () => {
    if (!itemSelected) {
      setLedger(null);
      return;
    }
    try {
      const d = await financierPortalApi.inventoryLedger({
        item_id: itemId,
        limit: 200,
        offset: 0,
        include_gl: includeGl,
      });
      setLedger(d);
    } catch (e) {
      logApiError("financier inventory ledger", e);
      throw e;
    }
  }, [itemId, itemSelected, includeGl]);

  const loadAccounting = useCallback(async () => {
    try {
      const [r, b] = await Promise.all([
        financierPortalApi.inventoryReconciliation(),
        financierPortalApi.inventoryBalanceSheet(),
      ]);
      setRecon(r);
      setBalance(b);
    } catch (e) {
      logApiError("financier inventory accounting", e);
      throw e;
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setErr("");
        await loadOverview();
      } catch {
        setErr("Failed to load inventory overview.");
      }
    })();
  }, [loadOverview]);

  useEffect(() => {
    if (tab !== "positions") return;
    void (async () => {
      try {
        setErr("");
        await loadByGroup();
      } catch {
        setErr("Failed to load inventory by category.");
      }
    })();
  }, [tab, loadByGroup]);

  useEffect(() => {
    if (!itemSelected) {
      setLedger(null);
      return;
    }
    void (async () => {
      try {
        setErr("");
        await loadLedger();
      } catch {
        setErr("Failed to load stock ledger.");
      }
    })();
  }, [itemSelected, loadLedger]);

  useEffect(() => {
    if (tab !== "accounting") return;
    void (async () => {
      try {
        setErr("");
        await loadAccounting();
      } catch {
        setErr("Failed to load accounting view.");
      }
    })();
  }, [tab, loadAccounting]);

  const groups = byGroup?.groups ?? [];
  const ledgerRows = (ledger?.items as LedgerRow[]) ?? [];

  const toggleExpand = (key: string) => {
    setExpanded((m) => ({ ...m, [key]: !m[key] }));
  };

  const wip = useMemo(() => overview?.total_wip_value, [overview]);

  if (err && !overview) return <PortalErrorState message={err} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Inventory valuation</h1>
          <p className="mt-1 text-xs text-text-muted">
            FIFO on-hand value, WIP, category drill-down, item ledger (with GL posting flags), and accounting-style position.
          </p>
        </div>
        {itemSelected ? (
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-subtle"
            onClick={() => void navigate("/portal/financier/inventory")}
          >
            ← Back to hub
          </button>
        ) : null}
      </div>

      {err ? <p className="rounded-lg border border-red-200 bg-red-50/50 p-2 text-sm text-red-800">{err}</p> : null}

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab === "positions" ? "bg-brand-primary/10 text-brand-primary" : "text-text-muted hover:bg-surface-subtle"}`}
          onClick={() => setTab("positions")}
        >
          Positions & ledger
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab === "accounting" ? "bg-brand-primary/10 text-brand-primary" : "text-text-muted hover:bg-surface-subtle"}`}
          onClick={() => setTab("accounting")}
        >
          Accounting view
        </button>
      </div>

      {tab === "positions" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <p className="text-xs font-medium uppercase text-text-muted">Inventory (FIFO)</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
                {typeof overview?.total_inventory_value === "number" ? overview.total_inventory_value.toLocaleString() : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <p className="text-xs font-medium uppercase text-text-muted">WIP (process orders)</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
                {typeof wip === "number" ? wip.toLocaleString() : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <p className="text-xs font-medium uppercase text-text-muted">Grand total</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">
                {typeof overview?.grand_total === "number" ? overview.grand_total.toLocaleString() : "—"}
              </p>
              <p className="mt-1 text-[10px] text-text-muted">
                Categories: {overview?.category_count ?? "—"} · item positions:{" "}
                {(overview?.item_count ?? overview?.item_position_count) ?? "—"}
              </p>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
            <input type="checkbox" checked={btbScope} onChange={(e) => setBtbScope(e.target.checked)} className="rounded border-border" />
            Show only items linked to my BTB-backed purchase lines
          </label>
          {byGroup?.note ? <p className="text-sm text-amber-800">{byGroup.note}</p> : null}

          <div className="space-y-2">
            {groups.map((g) => {
              const key = String(g.stock_group_id ?? "uncat");
              const open = expanded[key] ?? false;
              return (
                <div key={key} className="rounded-xl border border-border bg-surface-raised">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                    onClick={() => toggleExpand(key)}
                  >
                    <span className="font-medium text-text-primary">{g.stock_group_name}</span>
                    <span className="text-xs text-text-muted">
                      Qty {g.total_qty.toLocaleString()} · value{" "}
                      <span className="font-semibold tabular-nums text-text-primary">{g.total_value.toLocaleString()}</span>
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t border-border px-2 pb-2">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="text-text-muted">
                            <th className="px-2 py-1 text-left">Item</th>
                            <th className="px-2 py-1 text-left">Warehouse</th>
                            <th className="px-2 py-1 text-right">Qty</th>
                            <th className="px-2 py-1 text-right">Value</th>
                            <th className="px-2 py-1 text-right">Ledger</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.lines.map((ln) => (
                            <tr key={`${ln.item_id}-${ln.warehouse_id ?? "x"}`} className="border-t border-border/60">
                              <td className="px-2 py-1">
                                {ln.item_code} — {ln.item_name}
                              </td>
                              <td className="px-2 py-1">{ln.warehouse_name ?? "—"}</td>
                              <td className="px-2 py-1 text-right tabular-nums">{ln.on_hand_qty.toLocaleString()}</td>
                              <td className="px-2 py-1 text-right tabular-nums">{ln.line_value.toLocaleString()}</td>
                              <td className="px-2 py-1 text-right">
                                <Link
                                  to={`/portal/financier/inventory/${ln.item_id}`}
                                  className="text-brand-primary hover:underline"
                                >
                                  View
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {itemSelected ? (
            <section className="rounded-xl border border-border bg-surface-raised p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-text-primary">Stock ledger · item #{itemId}</h2>
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={includeGl}
                    onChange={(e) => setIncludeGl(e.target.checked)}
                    className="rounded border-border"
                  />
                  Show GL posting / voucher
                </label>
              </div>
              <p className="mb-2 text-xs text-text-muted">
                Current on hand:{" "}
                <span className="font-semibold tabular-nums text-text-primary">
                  {typeof ledger?.current_stock === "number" ? ledger.current_stock.toLocaleString() : "—"}
                </span>{" "}
                · FIFO value:{" "}
                <span className="font-semibold tabular-nums text-text-primary">
                  {typeof ledger?.current_value === "number" ? ledger.current_value.toLocaleString() : "—"}
                </span>
              </p>
              <div className="max-h-[480px] overflow-auto rounded-lg border border-border">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-surface-raised text-text-muted">
                    <tr>
                      <th className="px-2 py-1 text-left">Date</th>
                      <th className="px-2 py-1 text-left">Type</th>
                      <th className="px-2 py-1 text-left">Ref</th>
                      <th className="px-2 py-1 text-right">Qty</th>
                      <th className="px-2 py-1 text-right">Balance</th>
                      {includeGl ? (
                        <>
                          <th className="px-2 py-1 text-left">GL</th>
                          <th className="px-2 py-1 text-left">Voucher</th>
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.map((r) => (
                      <tr key={String(r.id)} className="border-t border-border">
                        <td className="px-2 py-1">{r.movement_date != null ? String(r.movement_date) : "—"}</td>
                        <td className="px-2 py-1">{String(r.movement_type ?? "")}</td>
                        <td className="px-2 py-1">
                          {String(r.reference_type ?? "")} #{String(r.reference_id ?? "")}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{String(r.quantity ?? "")}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {typeof r.running_balance === "number" ? r.running_balance.toLocaleString() : String(r.running_balance ?? "")}
                        </td>
                        {includeGl ? (
                          <>
                            <td className="px-2 py-1">{r.gl_posted === true ? "Yes" : "No"}</td>
                            <td className="px-2 py-1">{r.voucher_code != null ? String(r.voucher_code) : "—"}</td>
                          </>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[10px] text-text-muted">Showing recent movements (newest first). Total rows: {String(ledger?.total ?? 0)}.</p>
            </section>
          ) : (
            <p className="text-sm text-text-muted">Select an item from a category above to view its full movement history.</p>
          )}
        </>
      ) : null}

      {tab === "accounting" ? (
        <div className="space-y-4">
          {balance ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Inventory asset (FIFO)", k: "inventory_asset_value" },
                { label: "WIP", k: "wip_value" },
                { label: "GRNI liability", k: "grni_liability" },
                { label: "Net inventory position", k: "net_inventory_position" },
              ].map(({ label, k }) => (
                <div key={k} className="rounded-xl border border-border bg-surface-raised p-4">
                  <p className="text-xs font-medium uppercase text-text-muted">{label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-text-primary">
                    {typeof balance[k] === "number" ? (balance[k] as number).toLocaleString() : "—"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">Loading balance sheet view…</p>
          )}
          {balance?.fifo_vs_gl_variance != null ? (
            <p className="text-xs text-text-muted">
              FIFO vs GL variance (tenant):{" "}
              <span className="font-medium tabular-nums text-text-primary">{String(balance.fifo_vs_gl_variance)}</span>
            </p>
          ) : null}

          {recon ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border text-xs text-text-muted">
                  <tr>
                    <th className="px-2 py-2 text-left">Group</th>
                    <th className="px-2 py-2 text-right">FIFO value</th>
                    <th className="px-2 py-2 text-right">GL balance</th>
                    <th className="px-2 py-2 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {((recon.groups as Record<string, unknown>[]) ?? []).map((row, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-2 py-1">{String(row.stock_group_name ?? "")}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{String(row.fifo_value ?? "")}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{row.gl_balance == null ? "—" : String(row.gl_balance)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{row.variance == null ? "—" : String(row.variance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-border p-3 text-xs text-text-muted">
                <p>
                  Total FIFO stock:{" "}
                  <span className="font-medium text-text-primary">{String(recon.fifo_stock_value_total ?? "")}</span> · GL inventory
                  total:{" "}
                  <span className="font-medium text-text-primary">{String(recon.gl_inventory_balance_total ?? "")}</span> · GRNI:{" "}
                  <span className="font-medium text-text-primary">{String(recon.grni_liability_balance ?? "")}</span>
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">Loading reconciliation…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
