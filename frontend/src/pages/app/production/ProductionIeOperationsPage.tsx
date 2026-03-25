import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ProductionIeOperationsPage() {
  const [rows, setRows] = useState<
    Array<{
      id: number;
      operation_code: string;
      name: string;
      category: string;
      default_smv: number;
      machine_type_required: string | null;
    }>
  >([]);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [smv, setSmv] = useState("0");

  const load = useCallback(async () => {
    setError("");
    try {
      const list = await api.listIeOperations();
      setRows(list);
    } catch (e) {
      logApiError(e, "ProductionIeOperationsPage.load");
      setError("Could not load operations.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    try {
      await api.createIeOperation({
        operation_code: code.trim(),
        name: name.trim(),
        category: "other",
        default_smv: Number(smv) || 0,
      });
      setCode("");
      setName("");
      setSmv("0");
      await load();
    } catch (e) {
      logApiError(e, "ProductionIeOperationsPage.create");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">IE — Operations library</h1>
        <p className="text-sm text-text-secondary">Master operations with default SMV for building operation bulletins.</p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <form onSubmit={submit} className="rounded-lg border border-border-subtle bg-surface-elevated p-4 space-y-3">
        <h2 className="text-sm font-medium">Add operation</h2>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            Code
            <input
              className="ml-2 rounded-md border border-border-subtle px-2 py-1"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          <label className="text-sm">
            Name
            <input
              className="ml-2 rounded-md border border-border-subtle px-2 py-1 min-w-[200px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="text-sm">
            Default SMV
            <input
              type="number"
              step="0.0001"
              className="ml-2 w-28 rounded-md border border-border-subtle px-2 py-1"
              value={smv}
              onChange={(e) => setSmv(e.target.value)}
            />
          </label>
          <button type="submit" className="self-end rounded-lg border border-border-subtle bg-brand-primary px-3 py-1.5 text-sm text-white">
            Save
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-subtle text-text-secondary">
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">SMV</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border-subtle/60">
                <td className="px-3 py-2 font-mono text-xs">{r.operation_code}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.category}</td>
                <td className="px-3 py-2">{r.default_smv}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-4 text-sm text-text-secondary">No operations yet.</p> : null}
      </div>
    </div>
  );
}
