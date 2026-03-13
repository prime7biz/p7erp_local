import { useEffect, useMemo, useState } from "react";

import { api } from "@/api/client";

export function QualityDashboardPage() {
  const [checks, setChecks] = useState<Awaited<ReturnType<typeof api.listMfgQualityChecks>>>([]);
  const [ncrs, setNcrs] = useState<Awaited<ReturnType<typeof api.listMfgNcrs>>>([]);
  const [capas, setCapas] = useState<Awaited<ReturnType<typeof api.listMfgCapas>>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setError("");
      try {
        const [checkRows, ncrRows, capaRows] = await Promise.all([
          api.listMfgQualityChecks(),
          api.listMfgNcrs(),
          api.listMfgCapas(),
        ]);
        setChecks(checkRows);
        setNcrs(ncrRows);
        setCapas(capaRows);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load quality dashboard");
      }
    };
    void load();
  }, []);

  const kpi = useMemo(() => {
    const totalChecks = checks.length;
    const failedChecks = checks.filter((r) => r.result === "fail" || r.result === "reject").length;
    const openNcr = ncrs.filter((r) => r.status !== "closed").length;
    const openCapa = capas.filter((r) => r.status !== "closed" && r.status !== "completed").length;
    return { totalChecks, failedChecks, openNcr, openCapa };
  }, [checks, ncrs, capas]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Quality Dashboard</h1>
        <p className="text-sm text-slate-500">Monitor inspections, NCR, and CAPA resolution progress.</p>
      </div>
      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">Total Checks</div><div className="text-xl font-semibold">{kpi.totalChecks}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">Failed Checks</div><div className="text-xl font-semibold">{kpi.failedChecks}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">Open NCR</div><div className="text-xl font-semibold">{kpi.openNcr}</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">Open CAPA</div><div className="text-xl font-semibold">{kpi.openCapa}</div></div>
      </div>
    </div>
  );
}
