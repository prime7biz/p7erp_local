import { useEffect, useState } from "react";

import { api } from "@/api/client";

export function QualityCapaPage() {
  const [ncrs, setNcrs] = useState<Awaited<ReturnType<typeof api.listMfgNcrs>>>([]);
  const [capas, setCapas] = useState<Awaited<ReturnType<typeof api.listMfgCapas>>>([]);
  const [error, setError] = useState("");
  const [ncrForm, setNcrForm] = useState({ work_order_id: 0, defect_code: "", severity: "minor", description: "" });
  const [capaForm, setCapaForm] = useState({ ncr_id: 0, corrective_action: "", preventive_action: "", due_date: "" });

  const load = async () => {
    setError("");
    try {
      const [ncrRows, capaRows] = await Promise.all([api.listMfgNcrs(), api.listMfgCapas()]);
      setNcrs(ncrRows);
      setCapas(capaRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load NCR/CAPA");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const createNcr = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ncrForm.work_order_id || !ncrForm.defect_code) {
      setError("Work order ID and defect code are required.");
      return;
    }
    try {
      await api.createMfgNcr({
        work_order_id: ncrForm.work_order_id,
        defect_code: ncrForm.defect_code,
        severity: ncrForm.severity,
        description: ncrForm.description || undefined,
      });
      setNcrForm({ work_order_id: 0, defect_code: "", severity: "minor", description: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create NCR");
    }
  };

  const createCapa = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!capaForm.ncr_id || !capaForm.corrective_action) {
      setError("NCR ID and corrective action are required.");
      return;
    }
    try {
      await api.createMfgCapa({
        ncr_id: capaForm.ncr_id,
        corrective_action: capaForm.corrective_action,
        preventive_action: capaForm.preventive_action || undefined,
        due_date: capaForm.due_date || undefined,
      });
      setCapaForm({ ncr_id: 0, corrective_action: "", preventive_action: "", due_date: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create CAPA");
    }
  };

  const setNcrStatus = async (ncrId: number, statusValue: string, note?: string) => {
    setError("");
    try {
      await api.updateMfgNcrStatus(ncrId, statusValue, note);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update NCR status");
    }
  };

  const setCapaStatus = async (capaId: number, statusValue: string, note?: string) => {
    setError("");
    try {
      await api.updateMfgCapaStatus(capaId, {
        status: statusValue,
        closure_note: statusValue === "closed" ? "Closed from NCR/CAPA screen" : undefined,
        note: note,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update CAPA status");
    }
  };

  const quickCreateCapaFromNcr = async (ncrId: number) => {
    setError("");
    const exists = capas.some((row) => row.ncr_id === ncrId);
    if (exists) {
      setError("CAPA already exists for this NCR.");
      return;
    }
    try {
      await api.createMfgCapa({
        ncr_id: ncrId,
        corrective_action: "Root cause investigation and immediate correction",
        preventive_action: "Update SOP and train operators to avoid repeat issue",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to quick-create CAPA");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">NCR and CAPA</h1>
        <p className="text-sm text-slate-500">Track non-conformance and corrective/preventive actions.</p>
      </div>
      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Create NCR</h2>
          <form className="grid grid-cols-1 gap-2" onSubmit={createNcr}>
            <input className="rounded border px-3 py-2 text-sm" type="number" min={1} placeholder="Work Order ID" value={ncrForm.work_order_id || ""} onChange={(e) => setNcrForm((prev) => ({ ...prev, work_order_id: Number(e.target.value) }))} />
            <input className="rounded border px-3 py-2 text-sm" placeholder="Defect Code" value={ncrForm.defect_code} onChange={(e) => setNcrForm((prev) => ({ ...prev, defect_code: e.target.value }))} />
            <select className="rounded border px-3 py-2 text-sm" value={ncrForm.severity} onChange={(e) => setNcrForm((prev) => ({ ...prev, severity: e.target.value }))}>
              <option value="minor">Minor</option>
              <option value="major">Major</option>
              <option value="critical">Critical</option>
            </select>
            <input className="rounded border px-3 py-2 text-sm" placeholder="Description" value={ncrForm.description} onChange={(e) => setNcrForm((prev) => ({ ...prev, description: e.target.value }))} />
            <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white" type="submit">Create NCR</button>
          </form>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Create CAPA</h2>
          <form className="grid grid-cols-1 gap-2" onSubmit={createCapa}>
            <input className="rounded border px-3 py-2 text-sm" type="number" min={1} placeholder="NCR ID" value={capaForm.ncr_id || ""} onChange={(e) => setCapaForm((prev) => ({ ...prev, ncr_id: Number(e.target.value) }))} />
            <input className="rounded border px-3 py-2 text-sm" placeholder="Corrective Action" value={capaForm.corrective_action} onChange={(e) => setCapaForm((prev) => ({ ...prev, corrective_action: e.target.value }))} />
            <input className="rounded border px-3 py-2 text-sm" placeholder="Preventive Action" value={capaForm.preventive_action} onChange={(e) => setCapaForm((prev) => ({ ...prev, preventive_action: e.target.value }))} />
            <input className="rounded border px-3 py-2 text-sm" type="date" value={capaForm.due_date} onChange={(e) => setCapaForm((prev) => ({ ...prev, due_date: e.target.value }))} />
            <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white" type="submit">Create CAPA</button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="border-b px-4 py-3 text-sm font-semibold text-slate-700">NCR List</div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">WO</th><th className="px-3 py-2">Severity</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Action</th></tr></thead>
            <tbody>
              {ncrs.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">{row.ncr_code}</td>
                  <td className="px-3 py-2">{row.work_order_id}</td>
                  <td className="px-3 py-2">{row.severity}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {row.status !== "in_progress" ? <button className="rounded border px-2 py-1 text-xs" onClick={() => void setNcrStatus(row.id, "in_progress")}>In Progress</button> : null}
                      {row.status !== "closed" ? <button className="rounded border px-2 py-1 text-xs" onClick={() => void setNcrStatus(row.id, "closed")}>Close</button> : null}
                      {row.status === "closed" ? (
                        <button
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => {
                            const note = window.prompt("Reopen note (required):", "");
                            if (!note || !note.trim()) return;
                            void setNcrStatus(row.id, "reopen", note);
                          }}
                        >
                          Reopen
                        </button>
                      ) : null}
                      <button className="rounded border px-2 py-1 text-xs" onClick={() => void quickCreateCapaFromNcr(row.id)}>Quick CAPA</button>
                    </div>
                  </td>
                </tr>
              ))}
              {ncrs.length === 0 ? <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={5}>No NCR found.</td></tr> : null}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="border-b px-4 py-3 text-sm font-semibold text-slate-700">CAPA List</div>
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="px-3 py-2">ID</th><th className="px-3 py-2">NCR</th><th className="px-3 py-2">Due Date</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Action</th></tr></thead>
            <tbody>
              {capas.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">{row.id}</td>
                  <td className="px-3 py-2">{row.ncr_id}</td>
                  <td className="px-3 py-2">{row.due_date ?? "-"}</td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {row.status !== "in_progress" ? <button className="rounded border px-2 py-1 text-xs" onClick={() => void setCapaStatus(row.id, "in_progress")}>In Progress</button> : null}
                      {row.status !== "closed" ? <button className="rounded border px-2 py-1 text-xs" onClick={() => void setCapaStatus(row.id, "closed")}>Close</button> : null}
                      {row.status === "closed" || row.status === "completed" ? (
                        <button
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => {
                            const note = window.prompt("Reopen note (required):", "");
                            if (!note || !note.trim()) return;
                            void setCapaStatus(row.id, "reopen", note);
                          }}
                        >
                          Reopen
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {capas.length === 0 ? <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={5}>No CAPA found.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
