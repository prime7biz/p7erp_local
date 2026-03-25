import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ProductionKnittingPage() {
  const [items, setItems] = useState<Array<{ id: number; status: string; planned_date: string | null }>>([]);
  const [machineId, setMachineId] = useState("");
  const [yarnId, setYarnId] = useState("");
  const [targetKg, setTargetKg] = useState("");
  const [planned, setPlanned] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.listKnittingPlans();
      setItems((res.items as typeof items) ?? []);
    } catch (e) {
      logApiError(e, "ProductionKnittingPage.load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await api.createKnittingPlan({
        machine_id: machineId ? Number(machineId) : null,
        yarn_item_id: yarnId ? Number(yarnId) : null,
        target_output_kg: targetKg ? Number(targetKg) : null,
        planned_date: planned || null,
      });
      setMachineId("");
      setYarnId("");
      setTargetKg("");
      await load();
    } catch (e) {
      logApiError(e, "ProductionKnittingPage.create");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Knitting</h1>
        <p className="text-sm text-text-secondary">
          Machine plans; track output with{" "}
          <Link className="text-brand-primary underline" to="/app/production/hourly/knitting">
            hourly production
          </Link>
          .
        </p>
      </div>

      <form onSubmit={submit} className="rounded-lg border border-border-subtle bg-surface-elevated p-4 space-y-2">
        <h2 className="text-sm font-medium">New plan</h2>
        <div className="flex flex-wrap gap-2">
          <input className="rounded-md border px-2 py-1 w-28" placeholder="Machine ID" value={machineId} onChange={(e) => setMachineId(e.target.value)} />
          <input className="rounded-md border px-2 py-1 w-28" placeholder="Yarn item ID" value={yarnId} onChange={(e) => setYarnId(e.target.value)} />
          <input className="rounded-md border px-2 py-1 w-28" placeholder="Target kg" value={targetKg} onChange={(e) => setTargetKg(e.target.value)} />
          <input type="date" className="rounded-md border px-2 py-1" value={planned} onChange={(e) => setPlanned(e.target.value)} />
          <button type="submit" className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white">
            Save
          </button>
        </div>
      </form>

      <ul className="text-sm space-y-1">
        {items.map((x) => (
          <li key={x.id} className="rounded border border-border-subtle px-3 py-2">
            Plan #{x.id} — {x.status} {x.planned_date ? `(${x.planned_date})` : ""}
          </li>
        ))}
      </ul>
      {items.length === 0 ? <p className="text-sm text-text-secondary">No knitting plans.</p> : null}
    </div>
  );
}
