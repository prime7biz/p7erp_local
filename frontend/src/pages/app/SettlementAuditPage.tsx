import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  api,
  type SettlementAuditPresetResponse,
  type SettlementAuditResponse,
  type SettlementAuditRow,
} from "@/api/client";
import { downloadCsv } from "@/lib/reportExport";

const STATUS_OPTIONS = ["DRAFT", "APPROVED", "PROCESSED", "EXECUTED"] as const;

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10);
}

type SettlementFilters = {
  from_date: string;
  to_date: string;
  status_filter: string;
  source_currency: string;
  party_query: string;
};

export function SettlementAuditPage() {
  const [rows, setRows] = useState<SettlementAuditRow[]>([]);
  const [totals, setTotals] = useState<SettlementAuditResponse["totals"]>({
    row_count: 0,
    source_total: 0,
    base_total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<SettlementFilters>({
    from_date: startOfMonth(),
    to_date: new Date().toISOString().slice(0, 10),
    status_filter: "",
    source_currency: "",
    party_query: "",
  });
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<SettlementAuditPresetResponse[]>([]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api.listSettlementAudit({
        ...filters,
        from_date: filters.from_date || undefined,
        to_date: filters.to_date || undefined,
        status_filter: filters.status_filter || undefined,
        source_currency: filters.source_currency || undefined,
        party_query: filters.party_query || undefined,
        limit: 500,
      });
      setRows(data.rows);
      setTotals(data.totals);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settlement audit");
      setRows([]);
      setTotals({ row_count: 0, source_total: 0, base_total: 0 });
    } finally {
      setLoading(false);
    }
  }

  async function loadPresets() {
    try {
      const data = await api.listSettlementAuditPresets();
      setPresets(data);
    } catch {
      setPresets([]);
    }
  }

  useEffect(() => {
    void load();
    void loadPresets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const distinctCurrencies = useMemo(() => {
    const set = new Set(rows.map((r) => r.source_currency).filter(Boolean));
    return Array.from(set).sort();
  }, [rows]);

  const onFilterSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await load();
  };

  const exportCsv = async () => {
    setExporting(true);
    setError("");
    try {
      const csv = await api.exportSettlementAuditCsv({
        from_date: filters.from_date || undefined,
        to_date: filters.to_date || undefined,
        status_filter: filters.status_filter || undefined,
        source_currency: filters.source_currency || undefined,
        party_query: filters.party_query || undefined,
      });
      downloadCsv(csv, "settlement_audit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export settlement audit CSV");
    } finally {
      setExporting(false);
    }
  };

  const savePreset = async () => {
    const name = presetName.trim();
    if (!name) {
      setError("Preset name is required.");
      return;
    }
    setError("");
    try {
      await api.saveSettlementAuditPreset({
        name,
        from_date: filters.from_date || null,
        to_date: filters.to_date || null,
        status_filter: filters.status_filter || null,
        source_currency: filters.source_currency || null,
        party_query: filters.party_query || null,
      });
      setPresetName("");
      await loadPresets();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save preset");
    }
  };

  const applyPreset = async (preset: SettlementAuditPresetResponse) => {
    const nextFilters: SettlementFilters = {
      from_date: preset.from_date || "",
      to_date: preset.to_date || "",
      status_filter: preset.status_filter || "",
      source_currency: preset.source_currency || "",
      party_query: preset.party_query || "",
    };
    setFilters(nextFilters);
    setError("");
    try {
      const data = await api.listSettlementAudit({
        ...nextFilters,
        from_date: nextFilters.from_date || undefined,
        to_date: nextFilters.to_date || undefined,
        status_filter: nextFilters.status_filter || undefined,
        source_currency: nextFilters.source_currency || undefined,
        party_query: nextFilters.party_query || undefined,
        limit: 500,
      });
      setRows(data.rows);
      setTotals(data.totals);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply preset");
    }
  };

  const deletePreset = async (presetId: number) => {
    try {
      await api.deleteSettlementAuditPreset(presetId);
      await loadPresets();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete preset");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Settlement Audit</h1>
        <p className="text-sm text-slate-500">
          Track source currency, FX rate, and base settlement values for payment runs.
        </p>
      </div>

      {error ? (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-2xl font-semibold text-slate-900">{totals.row_count}</p>
          <p className="text-xs uppercase tracking-wide text-slate-500">Rows</p>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-2xl font-semibold text-indigo-700">{totals.source_total.toLocaleString()}</p>
          <p className="text-xs uppercase tracking-wide text-slate-500">Source Total</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-2xl font-semibold text-emerald-700">{totals.base_total.toLocaleString()}</p>
          <p className="text-xs uppercase tracking-wide text-slate-500">Base Total</p>
        </div>
      </div>

      <form onSubmit={onFilterSubmit} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-6">
          <input
            type="date"
            className="rounded border px-3 py-2 text-sm"
            value={filters.from_date}
            onChange={(e) => setFilters((p) => ({ ...p, from_date: e.target.value }))}
          />
          <input
            type="date"
            className="rounded border px-3 py-2 text-sm"
            value={filters.to_date}
            onChange={(e) => setFilters((p) => ({ ...p, to_date: e.target.value }))}
          />
          <select
            className="rounded border px-3 py-2 text-sm"
            value={filters.status_filter}
            onChange={(e) => setFilters((p) => ({ ...p, status_filter: e.target.value }))}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="rounded border px-3 py-2 text-sm"
            value={filters.source_currency}
            onChange={(e) => setFilters((p) => ({ ...p, source_currency: e.target.value.toUpperCase() }))}
          >
            <option value="">All currencies</option>
            {distinctCurrencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            className="rounded border px-3 py-2 text-sm md:col-span-2"
            placeholder="Search party..."
            value={filters.party_query}
            onChange={(e) => setFilters((p) => ({ ...p, party_query: e.target.value }))}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Loading..." : "Apply Filters"}
          </button>
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm"
            onClick={() =>
              setFilters({
                from_date: startOfMonth(),
                to_date: new Date().toISOString().slice(0, 10),
                status_filter: "",
                source_currency: "",
                party_query: "",
              })
            }
          >
            Reset
          </button>
          <button
            type="button"
            className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 disabled:opacity-50"
            onClick={() => void exportCsv()}
            disabled={exporting}
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Saved Filter Presets</p>
          <div className="mb-2 flex flex-wrap gap-2">
            <input
              className="rounded border px-3 py-1.5 text-sm"
              placeholder="Preset name (e.g. Monthly Executed USD)"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <button
              type="button"
              className="rounded border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700"
              onClick={() => void savePreset()}
            >
              Save Preset
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <div key={preset.id} className="flex items-center gap-1 rounded border bg-white px-2 py-1">
                <button
                  type="button"
                  className="text-xs font-medium text-slate-700 hover:text-slate-900"
                  onClick={() => void applyPreset(preset)}
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  className="rounded px-1 text-xs text-rose-600 hover:bg-rose-50"
                  onClick={() => void deletePreset(preset.id)}
                  title="Delete preset"
                >
                  x
                </button>
              </div>
            ))}
            {presets.length === 0 ? (
              <span className="text-xs text-slate-500">No presets saved yet.</span>
            ) : null}
          </div>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Run</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Party</th>
              <th className="px-3 py-2">Bill</th>
              <th className="px-3 py-2">Source Cur</th>
              <th className="px-3 py-2 text-right">Source Amt</th>
              <th className="px-3 py-2 text-right">FX</th>
              <th className="px-3 py-2 text-right">Base Amt</th>
              <th className="px-3 py-2">Base Cur</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.item_id} className="border-t">
                <td className="px-3 py-2">{row.run_code}</td>
                <td className="px-3 py-2">{row.run_date}</td>
                <td className="px-3 py-2">{row.run_status}</td>
                <td className="px-3 py-2">{row.party_name}</td>
                <td className="px-3 py-2">{row.bill_no || "-"}</td>
                <td className="px-3 py-2">{row.source_currency}</td>
                <td className="px-3 py-2 text-right">{row.source_amount.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{row.fx_rate_to_base.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{row.base_amount.toLocaleString()}</td>
                <td className="px-3 py-2">{row.base_currency}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr className="border-t">
                <td className="px-3 py-3 text-slate-500" colSpan={10}>
                  No settlement records found for selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

