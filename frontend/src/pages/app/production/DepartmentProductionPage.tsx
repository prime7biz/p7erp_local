import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

const LABELS: Record<string, string> = {
  printing: "Printing",
  aop: "All over print",
  embroidery: "Embroidery",
  elastic: "Elastic",
  washing: "Washing",
  iron: "Iron",
  finishing: "Finishing",
};

export function DepartmentProductionPage() {
  const { deptType } = useParams<{ deptType: string }>();
  const department_type = deptType ?? "printing";
  const title = LABELS[department_type] ?? department_type;

  const [items, setItems] = useState<Array<{ id: number; department_type: string; status: string }>>([]);
  const [target, setTarget] = useState("");
  const [uom, setUom] = useState("pcs");
  const [orderId, setOrderId] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.listDepartmentProductionPlans(department_type);
      setItems((res.items as typeof items) ?? []);
    } catch (e) {
      logApiError(e, "DepartmentProductionPage.load");
    }
  }, [department_type]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await api.createDepartmentProductionPlan({
        department_type,
        target_output: target ? Number(target) : null,
        target_uom: uom,
        order_id: orderId ? Number(orderId) : null,
      });
      setTarget("");
      await load();
    } catch (e) {
      logApiError(e, "DepartmentProductionPage.create");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        <p className="text-sm text-text-secondary">
          Simple machine/day plans. Hourly capture:{" "}
          <Link className="text-brand-primary underline" to={`/app/production/hourly/${department_type}`}>
            /production/hourly/{department_type}
          </Link>
          .
        </p>
      </div>

      <form onSubmit={submit} className="rounded-lg border border-border-subtle bg-surface-elevated p-4 flex flex-wrap gap-2">
        <input className="rounded-md border px-2 py-1 w-28" placeholder="Target" value={target} onChange={(e) => setTarget(e.target.value)} />
        <input className="rounded-md border px-2 py-1 w-20" placeholder="UOM" value={uom} onChange={(e) => setUom(e.target.value)} />
        <input className="rounded-md border px-2 py-1 w-28" placeholder="Order ID" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
        <button type="submit" className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white">
          Add plan
        </button>
      </form>

      <ul className="text-sm space-y-1">
        {items.map((x) => (
          <li key={x.id} className="rounded border border-border-subtle px-3 py-2">
            #{x.id} — {x.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
