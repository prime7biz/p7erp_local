import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

type Tab = "overview" | "plans" | "rates" | "workOrders";

type PlanRow = {
  id: number;
  status: string;
  planned_date: string | null;
  machine_id: number | null;
  yarn_item_id: number | null;
  target_output_kg: number | null;
  fabric_type: string | null;
  gauge: string | null;
  order_id: number | null;
};

type RateRow = {
  id: number;
  fabric_type_code: string;
  unit_basis: string;
  rate_per_unit: number;
  currency: string;
  effective_from: string;
  effective_to?: string | null;
  is_active: boolean;
  notes?: string | null;
};

type WoRow = {
  id: number;
  wo_number: string;
  source_type: string;
  status: string;
  yarn_item_id: number;
  greige_item_id: number;
  process_order_id: number | null;
  delivery_challan_id: number | null;
  gate_pass_id: number | null;
  fabric_type_code?: string | null;
};

export function ProductionKnittingPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [workOrders, setWorkOrders] = useState<WoRow[]>([]);
  const [openActionsWoId, setOpenActionsWoId] = useState<number | null>(null);

  const [machineId, setMachineId] = useState("");
  const [yarnId, setYarnId] = useState("");
  const [targetKg, setTargetKg] = useState("");
  const [fabricType, setFabricType] = useState("");
  const [gauge, setGauge] = useState("");
  const [planned, setPlanned] = useState("");

  const [newRateFabric, setNewRateFabric] = useState("");
  const [newRateAmount, setNewRateAmount] = useState("");
  const [newRateFrom, setNewRateFrom] = useState(() => new Date().toISOString().slice(0, 10));

  const [woSrc, setWoSrc] = useState("in_house");
  const [woYarn, setWoYarn] = useState("");
  const [woGreige, setWoGreige] = useState("");
  const [woWh, setWoWh] = useState("");
  const [woOutWh, setWoOutWh] = useState("");
  const [woFabric, setWoFabric] = useState("");
  const [woYplan, setWoYplan] = useState("");
  const [woGplan, setWoGplan] = useState("");
  const [woCust, setWoCust] = useState("");
  const [woVendor, setWoVendor] = useState("");
  const [woMachine, setWoMachine] = useState("");
  const [linkDc, setLinkDc] = useState("");
  const [linkGp, setLinkGp] = useState("");
  const [linkWoId, setLinkWoId] = useState("");

  const loadStats = useCallback(async () => {
    try {
      const s = (await api.getKnittingDashboardStats()) as Record<string, unknown>;
      setStats(s);
    } catch (e) {
      logApiError(e, "ProductionKnittingPage.stats");
    }
  }, []);

  const loadPlans = useCallback(async () => {
    try {
      const res = await api.listKnittingPlans();
      setPlans((res.items as PlanRow[]) ?? []);
    } catch (e) {
      logApiError(e, "ProductionKnittingPage.plans");
    }
  }, []);

  const loadRates = useCallback(async () => {
    try {
      const res = await api.listKnittingChargeRates(true);
      setRates(((res.items as RateRow[]) ?? []).filter(Boolean));
    } catch (e) {
      logApiError(e, "ProductionKnittingPage.rates");
    }
  }, []);

  const loadWos = useCallback(async () => {
    try {
      const res = await api.listKnittingWorkOrders();
      setWorkOrders((res.items as WoRow[]) ?? []);
    } catch (e) {
      logApiError(e, "ProductionKnittingPage.workOrders");
    }
  }, []);

  useEffect(() => {
    void loadStats();
    void loadPlans();
    void loadRates();
    void loadWos();
  }, [loadPlans, loadRates, loadStats, loadWos]);

  useEffect(() => {
    const onClose = () => setOpenActionsWoId(null);
    document.body.addEventListener("click", onClose);
    return () => document.body.removeEventListener("click", onClose);
  }, []);

  const tabBtn = (key: Tab, label: string) => (
    <button
      type="button"
      key={key}
      onClick={() => setTab(key)}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
        tab === key ? "bg-brand-primary text-white" : "border border-border text-text-secondary hover:bg-surface-subtle"
      }`}
    >
      {label}
    </button>
  );

  const woByStatus = useMemo(() => {
    const m: Record<string, number> = {};
    for (const w of workOrders) m[w.status] = (m[w.status] ?? 0) + 1;
    return m;
  }, [workOrders]);

  const submitPlan = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await api.createKnittingPlan({
        machine_id: machineId ? Number(machineId) : null,
        yarn_item_id: yarnId ? Number(yarnId) : null,
        target_output_kg: targetKg ? Number(targetKg) : null,
        planned_date: planned || null,
        fabric_type: fabricType || null,
        gauge: gauge || null,
      });
      setMachineId("");
      setYarnId("");
      setTargetKg("");
      await loadPlans();
      await loadStats();
    } catch (e) {
      logApiError(e, "ProductionKnittingPage.createPlan");
    }
  };

  const submitRate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await api.createKnittingChargeRate({
        fabric_type_code: newRateFabric.trim(),
        unit_basis: "per_kg_greige",
        rate_per_unit: Number(newRateAmount || 0),
        effective_from: newRateFrom,
        is_active: true,
      });
      setNewRateFabric("");
      setNewRateAmount("");
      await loadRates();
    } catch (e) {
      logApiError(e, "ProductionKnittingPage.createRate");
    }
  };

  const submitWo = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await api.createKnittingWorkOrder({
        source_type: woSrc,
        yarn_item_id: Number(woYarn),
        greige_item_id: Number(woGreige),
        warehouse_id: woWh ? Number(woWh) : null,
        output_warehouse_id: woOutWh ? Number(woOutWh) : woWh ? Number(woWh) : null,
        fabric_type_code: woFabric.trim() || null,
        planned_yarn_qty: woYplan || undefined,
        planned_greige_qty: woGplan || undefined,
        customer_id: woSrc === "jobwork_customer" && woCust ? Number(woCust) : undefined,
        vendor_id: woSrc === "subcontract" && woVendor ? Number(woVendor) : undefined,
        machine_id: woMachine ? Number(woMachine) : undefined,
      });
      setWoYarn("");
      setWoGreige("");
      await loadWos();
      await loadStats();
    } catch (e) {
      logApiError(e, "ProductionKnittingPage.createWo");
    }
  };

  const linkDocs = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!linkWoId) return;
    try {
      await api.linkKnittingWorkOrderDocuments(Number(linkWoId), {
        delivery_challan_id: linkDc ? Number(linkDc) : undefined,
        gate_pass_id: linkGp ? Number(linkGp) : undefined,
      });
      setLinkDc("");
      setLinkGp("");
      await loadWos();
    } catch (e) {
      logApiError(e, "ProductionKnittingPage.linkDocs");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Knitting hub</h1>
        <p className="text-sm text-text-secondary">
          Yarn → greige: charge rates (outsourced knitting),{" "}
          <Link className="text-brand-primary underline" to="/app/inventory/process-orders">
            process orders
          </Link>{" "}
          (issue yarn / receive fabric), machines in{" "}
          <Link className="text-brand-primary underline" to="/app/production/setup">
            Production setup
          </Link>
          , output on{" "}
          <Link className="text-brand-primary underline" to="/app/production/hourly/knitting">
            Hourly — Knitting
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabBtn("overview", "Overview")}
        {tabBtn("plans", "Plans")}
        {tabBtn("rates", "Charge rates")}
        {tabBtn("workOrders", "Work orders")}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border-subtle bg-surface-elevated p-4 text-sm space-y-1">
            <h2 className="font-semibold text-text-primary">Snapshot</h2>
            <p>Open plans: {(stats?.open_plans as number | undefined) ?? "—"}</p>
            <p>Knitting machines: {(stats?.knitting_machine_count as number | undefined) ?? "—"}</p>
            <p className="text-xs text-text-muted pt-2">Work orders by status</p>
            <ul className="text-xs text-text-secondary space-y-0.5">
              {Object.entries(woByStatus).length === 0 ? <li>none yet</li> : null}
              {Object.entries(woByStatus).map(([st, ct]) => (
                <li key={st}>
                  {st}: {ct}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-950 space-y-1">
            <p className="font-semibold">Finance & documents</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>
                <strong>Subcontract knitting</strong> (vendor): charge accrues to WIP/AP at greige receipt; greige FIFO
                cost includes knitting charge.
              </li>
              <li>
                <strong>Customer job-work</strong>: knitting fee posts as AR/Revenue at receipt; FIFO greige excludes
                the fee so stock isn’t overstated vs revenue.
              </li>
              <li>In-house knitting: leave processing charge at 0.</li>
              <li>Create delivery challans and gate passes under Inventory; paste IDs below to attach to a work order.</li>
            </ul>
          </div>
        </div>
      )}

      {tab === "plans" && (
        <>
          <form onSubmit={submitPlan} className="rounded-lg border border-border-subtle bg-surface-elevated p-4 space-y-2">
            <h2 className="text-sm font-medium">New plan</h2>
            <div className="flex flex-wrap gap-2">
              <input
                className="rounded-md border px-2 py-1 w-28"
                placeholder="Machine ID"
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
              />
              <input
                className="rounded-md border px-2 py-1 w-28"
                placeholder="Yarn item ID"
                value={yarnId}
                onChange={(e) => setYarnId(e.target.value)}
              />
              <input
                className="rounded-md border px-2 py-1 w-28"
                placeholder="Target kg"
                value={targetKg}
                onChange={(e) => setTargetKg(e.target.value)}
              />
              <input
                className="rounded-md border px-2 py-1 w-40"
                placeholder="Fabric type"
                value={fabricType}
                onChange={(e) => setFabricType(e.target.value)}
              />
              <input
                className="rounded-md border px-2 py-1 w-24"
                placeholder="Gauge"
                value={gauge}
                onChange={(e) => setGauge(e.target.value)}
              />
              <input type="date" className="rounded-md border px-2 py-1" value={planned} onChange={(e) => setPlanned(e.target.value)} />
              <button type="submit" className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white">
                Save
              </button>
            </div>
          </form>
          <ul className="text-sm space-y-1">
            {plans.map((x) => (
              <li key={x.id} className="rounded border border-border-subtle px-3 py-2">
                Plan #{x.id} — {x.status} {x.planned_date ? `(${x.planned_date})` : ""}{" "}
                {x.fabric_type ? `fabric ${x.fabric_type}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "rates" && (
        <>
          <form onSubmit={submitRate} className="rounded-lg border border-border-subtle bg-surface-elevated p-4 space-y-2">
            <h2 className="text-sm font-medium">Effective-dated knitting charge (for outsourced jobs)</h2>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                className="rounded-md border px-2 py-1 w-48"
                placeholder="Fabric type code"
                value={newRateFabric}
                onChange={(e) => setNewRateFabric(e.target.value)}
              />
              <input
                className="rounded-md border px-2 py-1 w-28"
                placeholder="Rate / kg greige"
                value={newRateAmount}
                onChange={(e) => setNewRateAmount(e.target.value)}
              />
              <input type="date" className="rounded-md border px-2 py-1" value={newRateFrom} onChange={(e) => setNewRateFrom(e.target.value)} />
              <button type="submit" className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white">
                Add rate
              </button>
            </div>
            <p className="text-xs text-text-muted">Used to suggest processing charge on work orders (per kg greige planned).</p>
          </form>
          <ul className="text-sm space-y-1">
            {rates.map((r) => (
              <li key={r.id} className="rounded border border-border-subtle px-3 py-2 flex flex-wrap justify-between gap-2">
                <span>
                  {r.fabric_type_code} — {r.rate_per_unit} {r.currency} / {r.unit_basis} (from {r.effective_from})
                </span>
                <button
                  type="button"
                  className="text-xs text-red-600"
                  onClick={() =>
                    void api.patchKnittingChargeRate(r.id, { is_active: false }).then(() => loadRates()).catch((e) => logApiError(e, "deactivateRate"))
                  }
                >
                  Deactivate
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "workOrders" && (
        <>
          <form onSubmit={submitWo} className="rounded-lg border border-border-subtle bg-surface-elevated p-4 space-y-2">
            <h2 className="text-sm font-medium">New work order</h2>
            <div className="flex flex-wrap gap-2 items-center">
              <select value={woSrc} onChange={(e) => setWoSrc(e.target.value)} className="rounded-md border px-2 py-1 text-sm">
                <option value="in_house">In-house</option>
                <option value="jobwork_customer">Customer job (AR)</option>
                <option value="subcontract">Subcontract (AP)</option>
              </select>
              <input className="rounded-md border px-2 py-1 w-28" placeholder="Yarn item ID" value={woYarn} onChange={(e) => setWoYarn(e.target.value)} />
              <input
                className="rounded-md border px-2 py-1 w-28"
                placeholder="Greige item ID"
                value={woGreige}
                onChange={(e) => setWoGreige(e.target.value)}
              />
              <input className="rounded-md border px-2 py-1 w-28" placeholder="Warehouse ID" value={woWh} onChange={(e) => setWoWh(e.target.value)} />
              <input
                className="rounded-md border px-2 py-1 w-28"
                placeholder="Output WH (opt)"
                value={woOutWh}
                onChange={(e) => setWoOutWh(e.target.value)}
              />
              <input className="rounded-md border px-2 py-1 w-36" placeholder="Fabric type" value={woFabric} onChange={(e) => setWoFabric(e.target.value)} />
              <input className="rounded-md border px-2 py-1 w-28" placeholder="Planned yarn" value={woYplan} onChange={(e) => setWoYplan(e.target.value)} />
              <input
                className="rounded-md border px-2 py-1 w-28"
                placeholder="Planned greige"
                value={woGplan}
                onChange={(e) => setWoGplan(e.target.value)}
              />
              {woSrc === "jobwork_customer" ? (
                <input className="rounded-md border px-2 py-1 w-28" placeholder="Customer ID" value={woCust} onChange={(e) => setWoCust(e.target.value)} />
              ) : null}
              {woSrc === "subcontract" ? (
                <input className="rounded-md border px-2 py-1 w-28" placeholder="Vendor ID" value={woVendor} onChange={(e) => setWoVendor(e.target.value)} />
              ) : null}
              <input
                className="rounded-md border px-2 py-1 w-28"
                placeholder="Machine ID"
                value={woMachine}
                onChange={(e) => setWoMachine(e.target.value)}
              />
              <button type="submit" className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white">
                Create
              </button>
            </div>
          </form>

          <form onSubmit={linkDocs} className="rounded-lg border border-dashed border-border-subtle p-3 text-sm space-y-2">
            <p className="font-medium">Link inventory documents (after creating in Inventory)</p>
            <div className="flex flex-wrap gap-2">
              <input className="rounded-md border px-2 py-1 w-28" placeholder="WO id" value={linkWoId} onChange={(e) => setLinkWoId(e.target.value)} />
              <input className="rounded-md border px-2 py-1 w-32" placeholder="Challan ID" value={linkDc} onChange={(e) => setLinkDc(e.target.value)} />
              <input className="rounded-md border px-2 py-1 w-32" placeholder="Gate pass ID" value={linkGp} onChange={(e) => setLinkGp(e.target.value)} />
              <button type="submit" className="rounded-lg border border-border px-3 py-1 text-xs">
                Save links
              </button>
            </div>
          </form>

          <div className="overflow-x-auto rounded-lg border border-border-subtle">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-surface-subtle text-text-secondary">
                <tr>
                  <th className="px-3 py-2">WO</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Process order</th>
                  <th className="px-3 py-2">Docs</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workOrders.map((w) => (
                  <tr key={w.id} className="border-t border-border-subtle">
                    <td className="px-3 py-2 font-mono">{w.wo_number}</td>
                    <td className="px-3 py-2">{w.source_type}</td>
                    <td className="px-3 py-2">{w.status}</td>
                    <td className="px-3 py-2">{w.process_order_id ?? "—"}</td>
                    <td className="px-3 py-2 text-text-muted">
                      DC {w.delivery_challan_id ?? "—"} / GP {w.gate_pass_id ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right relative">
                      <button
                        type="button"
                        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionsWoId((cur) => (cur === w.id ? null : w.id));
                        }}
                      >
                        Actions
                      </button>
                      {openActionsWoId === w.id ? (
                        <div
                          className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg text-left"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={() =>
                              void api
                                .createKnittingWorkOrderProcessOrder(w.id)
                                .then(() => {
                                  setOpenActionsWoId(null);
                                  return loadWos();
                                })
                                .catch((e) => logApiError(e, "createProcessOrder"))
                            }
                          >
                            Create process order
                          </button>
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={() =>
                              void api
                                .refreshKnittingWorkOrderStatus(w.id)
                                .then(() => {
                                  setOpenActionsWoId(null);
                                  return loadWos();
                                })
                                .catch((e) => logApiError(e, "refreshWo"))
                            }
                          >
                            Refresh from process order
                          </button>
                          <Link
                            to="/app/inventory/process-orders"
                            className="block rounded-md px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                            onClick={() => setOpenActionsWoId(null)}
                          >
                            Open process orders…
                          </Link>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
