import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AppPageHeader } from "@/components/app/AppPageHeader";
import { AlertActionCenter } from "@/components/control-tower/AlertActionCenter";
import { CapacityHeatmap } from "@/components/control-tower/CapacityHeatmap";
import { FinanceSnapshot } from "@/components/control-tower/FinanceSnapshot";
import { MasterLcLadder } from "@/components/control-tower/MasterLcLadder";
import { OrderExecutionGrid } from "@/components/control-tower/OrderExecutionGrid";
import { useAuth } from "@/context/AuthContext";
import { useControlTower } from "@/hooks/useControlTower";

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function sectionVisibility(roleName: string | undefined) {
  const r = (roleName || "").toLowerCase();
  const all = ["admin", "owner", "manager"].includes(r);
  const merch = ["merchandiser"].includes(r);
  const planning = ["planner", "supervisor", "operator"].includes(r);
  const finance = ["finance"].includes(r);
  return {
    showLc: all || merch || finance,
    showCapacity: all || planning,
    showFinance: all || finance,
    showAlerts: true,
  };
}

export function ControlTowerPage() {
  const { me } = useAuth();
  const [searchParams] = useSearchParams();
  const focusOrderRaw = searchParams.get("focus_order");
  const focusOrderNum = focusOrderRaw ? Number(focusOrderRaw) : null;
  const focusOrderId = focusOrderNum != null && !Number.isNaN(focusOrderNum) ? focusOrderNum : null;
  const flags = me?.feature_flags as Record<string, boolean> | undefined;
  const enabled = flags?.control_tower_enabled === true;
  const vis = sectionVisibility(me?.role_name);

  const [deliveryFrom, setDeliveryFrom] = useState(() => addDays(new Date().toISOString().slice(0, 10), 0));
  const [deliveryTo, setDeliveryTo] = useState(() => addDays(new Date().toISOString().slice(0, 10), 90));

  const [openHeatmap, setOpenHeatmap] = useState(true);
  const [openLc, setOpenLc] = useState(true);
  const [openAlerts, setOpenAlerts] = useState(true);
  const [openFinance, setOpenFinance] = useState(true);

  const [selectedMc, setSelectedMc] = useState<number | null>(null);
  const [narrow, setNarrow] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);

  const { summary, summaryLoading, summaryError, fetchSummary, heatmap, heatmapLoading, heatmapError, fetchHeatmap, lcSnapshot, lcLoading, lcError, fetchLcSnapshot } =
    useControlTower();

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const refresh = useCallback(() => {
    void fetchSummary(deliveryFrom, deliveryTo);
    if (vis.showCapacity) void fetchHeatmap(deliveryFrom, deliveryTo);
  }, [deliveryFrom, deliveryTo, fetchHeatmap, fetchSummary, vis.showCapacity]);

  useEffect(() => {
    if (!enabled) return;
    void fetchSummary(deliveryFrom, deliveryTo);
  }, [deliveryFrom, deliveryTo, enabled, fetchSummary]);

  useEffect(() => {
    if (!enabled || !vis.showCapacity) return;
    void fetchHeatmap(deliveryFrom, deliveryTo);
  }, [deliveryFrom, deliveryTo, enabled, fetchHeatmap, vis.showCapacity]);

  const mcOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const o of summary?.orders ?? []) {
      if (o.master_contract_id != null && !m.has(o.master_contract_id)) {
        m.set(o.master_contract_id, `MC #${o.master_contract_id}`);
      }
    }
    return [...m.entries()].map(([id, label]) => ({ id, label }));
  }, [summary?.orders]);

  useEffect(() => {
    if (!enabled || !vis.showLc) return;
    if (selectedMc == null && mcOptions.length > 0) {
      setSelectedMc(mcOptions[0]?.id ?? null);
    }
  }, [enabled, mcOptions, selectedMc, vis.showLc]);

  useEffect(() => {
    if (!enabled || !vis.showLc || selectedMc == null) return;
    void fetchLcSnapshot(selectedMc);
  }, [enabled, fetchLcSnapshot, selectedMc, vis.showLc]);

  const avgMaterial = useMemo(() => {
    const rows = summary?.orders ?? [];
    const vals = rows.map((r) => r.material_readiness_pct).filter((x): x is number => typeof x === "number" && !Number.isNaN(x));
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [summary?.orders]);

  const peakSmv = useMemo(() => {
    let max = 0;
    for (const c of heatmap?.cells ?? []) {
      const v = (c.firm_minutes || 0) + (c.soft_minutes || 0);
      if (v > max) max = v;
    }
    return max;
  }, [heatmap?.cells]);

  if (!enabled) {
    return (
      <div className="p-6 space-y-4 max-w-xl">
        <AppPageHeader title="Control Tower" description="Cross-functional order execution view (read-only)." />
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
          <p className="font-medium">Control Tower is disabled for this tenant.</p>
          <p className="mt-2 text-text-secondary dark:text-amber-100/80">
            Ask an admin to enable <code className="rounded bg-white/60 px-1 dark:bg-black/20">control_tower_enabled</code> in{" "}
            <Link className="text-status-info underline" to="/app/settings/configuration">
              Settings → Configuration
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <AppPageHeader
        title="Control Tower"
        description="Read-only operational snapshot: orders, master LC, capacity load, alerts, and finance (by role)."
      />

      {narrow ? (
        <div className="rounded border border-status-info/30 bg-status-info-subtle px-3 py-2 text-xs text-status-info-foreground">
          Desktop is recommended for the full heatmap and finance panels. You can still use the order grid below.
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-raised p-4">
        <div>
          <label className="block text-xs font-medium text-text-secondary">Delivery from</label>
          <input
            type="date"
            className="mt-1 rounded border border-border px-2 py-1 text-sm"
            value={deliveryFrom}
            onChange={(e) => setDeliveryFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary">Delivery to</label>
          <input
            type="date"
            className="mt-1 rounded border border-border px-2 py-1 text-sm"
            value={deliveryTo}
            onChange={(e) => setDeliveryTo(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white"
          onClick={() => refresh()}
        >
          Refresh
        </button>
        <p className="text-[11px] text-text-muted">Window max 180 days (API enforced).</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border bg-surface-raised p-3">
          <div className="text-[11px] text-text-muted">Orders in range</div>
          <div className="text-2xl font-semibold text-text-primary">{summary?.total ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-3">
          <div className="text-[11px] text-text-muted">
            Avg material ready <span className="italic">(actual)</span>
          </div>
          <div className="text-2xl font-semibold text-text-primary">
            {avgMaterial != null ? `${Math.round(avgMaterial)}%` : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-3">
          <div className="text-[11px] text-text-muted">
            Peak SMV load <span className="italic">(projected)</span>
          </div>
          <div className="text-2xl font-semibold text-text-primary">{peakSmv > 0 ? `${Math.round(peakSmv)} min` : "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-3">
          <div className="text-[11px] text-text-muted">BTB exposure row</div>
          <div className="text-sm text-text-secondary">Select a master LC below for funded split.</div>
        </div>
      </div>

      {summaryError ? (
        <div className="rounded border border-status-danger/20 bg-status-danger-subtle p-3 text-sm text-status-danger-foreground">
          {summaryError}
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-text-primary">Order execution</h2>
        <OrderExecutionGrid
          orders={summary?.orders ?? []}
          loading={summaryLoading}
          highlightOrderId={focusOrderId}
        />
      </section>

      {vis.showCapacity && !narrow ? (
        <section className="rounded-xl border border-border bg-surface-raised p-4">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-text-primary"
            onClick={() => setOpenHeatmap((v) => !v)}
          >
            Capacity heatmap
            <span className="text-text-muted">{openHeatmap ? "▼" : "▶"}</span>
          </button>
          {openHeatmap ? (
            <div className="mt-3">
              <CapacityHeatmap
                dateFrom={deliveryFrom}
                dateTo={deliveryTo}
                cells={heatmap?.cells ?? []}
                loading={heatmapLoading}
                error={heatmapError}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {vis.showLc ? (
        <section className="rounded-xl border border-border bg-surface-raised p-4">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-text-primary"
            onClick={() => setOpenLc((v) => !v)}
          >
            Master LC ladder
            <span className="text-text-muted">{openLc ? "▼" : "▶"}</span>
          </button>
          {openLc ? (
            <div className="mt-3">
              <MasterLcLadder
                options={mcOptions}
                selectedId={selectedMc}
                onSelect={(id) => setSelectedMc(id)}
                snapshot={lcSnapshot}
                loading={lcLoading}
                error={lcError}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {vis.showAlerts ? (
        <section className="rounded-xl border border-border bg-surface-raised p-4">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-text-primary"
            onClick={() => setOpenAlerts((v) => !v)}
          >
            Alert center
            <span className="text-text-muted">{openAlerts ? "▼" : "▶"}</span>
          </button>
          {openAlerts ? (
            <div className="mt-3">
              <AlertActionCenter />
            </div>
          ) : null}
        </section>
      ) : null}

      {vis.showFinance && !narrow ? (
        <section className="rounded-xl border border-border bg-surface-raised p-4">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-text-primary"
            onClick={() => setOpenFinance((v) => !v)}
          >
            Finance snapshot
            <span className="text-text-muted">{openFinance ? "▼" : "▶"}</span>
          </button>
          {openFinance ? (
            <div className="mt-3">
              <FinanceSnapshot masterContractId={selectedMc} />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
