import { useState } from "react";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ProductionLineBalancePage() {
  const [obId, setObId] = useState("");
  const [lineId, setLineId] = useState("");
  const [ws, setWs] = useState("8");
  const [result, setResult] = useState<unknown>(null);

  const run = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      const res = await api.runLineBalance({
        ob_id: Number(obId),
        line_id: Number(lineId),
        num_workstations: Number(ws) || 1,
      });
      setResult(res);
    } catch (e) {
      logApiError(e, "ProductionLineBalancePage.run");
      setResult(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">IE — Line balancing</h1>
        <p className="text-sm text-text-secondary">Run a balance from an operation bulletin and workstation count.</p>
      </div>

      <form onSubmit={run} className="rounded-lg border border-border-subtle bg-surface-elevated p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">
            OB ID
            <input type="number" className="ml-2 w-28 rounded-md border border-border-subtle px-2 py-1" value={obId} onChange={(e) => setObId(e.target.value)} required />
          </label>
          <label className="text-sm">
            Sewing line ID
            <input type="number" className="ml-2 w-28 rounded-md border border-border-subtle px-2 py-1" value={lineId} onChange={(e) => setLineId(e.target.value)} required />
          </label>
          <label className="text-sm">
            Workstations
            <input type="number" className="ml-2 w-20 rounded-md border border-border-subtle px-2 py-1" value={ws} onChange={(e) => setWs(e.target.value)} />
          </label>
          <button type="submit" className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white">
            Run balance
          </button>
        </div>
      </form>

      {result ? (
        <pre className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-subtle p-4 text-xs">{JSON.stringify(result, null, 2)}</pre>
      ) : null}
    </div>
  );
}
