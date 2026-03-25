import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function ProductionOperationBulletinsPage() {
  const [rows, setRows] = useState<
    Array<{ id: number; style_id: number; ob_code: string; version_no: number; total_smv: number; status: string }>
  >([]);
  const [styleId, setStyleId] = useState("");
  const [obCode, setObCode] = useState("");
  const [seq, setSeq] = useState("1");
  const [opName, setOpName] = useState("Join shoulder");
  const [smv, setSmv] = useState("0.25");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const list = await api.listOperationBulletins();
      setRows(list);
    } catch (e) {
      logApiError(e, "ProductionOperationBulletinsPage.load");
      setError("Could not load bulletins.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const sid = Number(styleId);
    if (!Number.isFinite(sid)) return;
    try {
      await api.createOperationBulletin({
        style_id: sid,
        ob_code: obCode.trim(),
        version_no: 1,
        operations: [
          {
            sequence_no: Number(seq) || 1,
            operation_name: opName.trim(),
            smv: Number(smv) || 0,
          },
        ],
      });
      setObCode("");
      await load();
    } catch (e) {
      logApiError(e, "ProductionOperationBulletinsPage.create");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">IE — Operation bulletins</h1>
        <p className="text-sm text-text-secondary">Per-style OB with operations and total SMV.</p>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <form onSubmit={submit} className="rounded-lg border border-border-subtle bg-surface-elevated p-4 space-y-3">
        <h2 className="text-sm font-medium">Create OB (single operation row)</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">
            Style ID
            <input
              type="number"
              className="ml-2 w-28 rounded-md border border-border-subtle px-2 py-1"
              value={styleId}
              onChange={(e) => setStyleId(e.target.value)}
              required
            />
          </label>
          <label className="text-sm">
            OB code
            <input className="ml-2 rounded-md border border-border-subtle px-2 py-1" value={obCode} onChange={(e) => setObCode(e.target.value)} required />
          </label>
          <label className="text-sm">
            Seq
            <input type="number" className="ml-2 w-16 rounded-md border border-border-subtle px-2 py-1" value={seq} onChange={(e) => setSeq(e.target.value)} />
          </label>
          <label className="text-sm">
            Operation
            <input className="ml-2 min-w-[160px] rounded-md border border-border-subtle px-2 py-1" value={opName} onChange={(e) => setOpName(e.target.value)} />
          </label>
          <label className="text-sm">
            SMV
            <input type="number" step="0.0001" className="ml-2 w-24 rounded-md border border-border-subtle px-2 py-1" value={smv} onChange={(e) => setSmv(e.target.value)} />
          </label>
          <button type="submit" className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm text-white">
            Create
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-subtle text-text-secondary">
              <th className="px-3 py-2">OB</th>
              <th className="px-3 py-2">Style</th>
              <th className="px-3 py-2">SMV</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border-subtle/60">
                <td className="px-3 py-2">{r.ob_code}</td>
                <td className="px-3 py-2">{r.style_id}</td>
                <td className="px-3 py-2">{r.total_smv}</td>
                <td className="px-3 py-2">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-4 text-sm text-text-secondary">No bulletins yet.</p> : null}
      </div>
    </div>
  );
}
