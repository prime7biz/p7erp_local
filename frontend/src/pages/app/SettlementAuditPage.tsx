import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type SettlementAuditPresetResponse,
  type SettlementAuditResponse,
  type SettlementAuditRow,
} from "@/api/client";
import { downloadCsv } from "@/lib/reportExport";
import { startOfMonthLocalISO, todayLocalISO } from "@/lib/dates";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { logApiError } from "@/utils/logApiError";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import {
  listPageEmptyClass,
  listPageErrorClass,
  listPageFilterBarClass,
  listPageRootClass,
  listPageToolbarButtonClass,
  listPageToolbarInputClass,
  listPageToolbarSelectClass,
  listTableBaseClass,
  listTableTdClass,
  listTableTdPrimaryClass,
  listTableThClass,
  listTableThRightClass,
  listTableTheadClass,
  listTableTrClass,
} from "@/components/app/listPageLayout";
import { ScrollTableCard, SummaryStrip, showingCountLabel } from "@/components/finance/kit";

const STATUS_OPTIONS = ["DRAFT", "APPROVED", "PROCESSED", "EXECUTED"] as const;

type SettlementFilters = {
  from_date: string;
  to_date: string;
  status_filter: string;
  source_currency: string;
  party_query: string;
};

function defaultFilters(): SettlementFilters {
  return {
    from_date: startOfMonthLocalISO(),
    to_date: todayLocalISO(),
    status_filter: "",
    source_currency: "",
    party_query: "",
  };
}

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
  const [filters, setFilters] = useState<SettlementFilters>(defaultFilters);
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<SettlementAuditPresetResponse[]>([]);
  const latest = useLatestRequest();

  const loadWith = useCallback(
    async (f: SettlementFilters) => {
      const token = latest.begin();
      setLoading(true);
      setError("");
      try {
        const data = await api.listSettlementAudit({
          ...f,
          from_date: f.from_date || undefined,
          to_date: f.to_date || undefined,
          status_filter: f.status_filter || undefined,
          source_currency: f.source_currency || undefined,
          party_query: f.party_query || undefined,
          limit: 500,
        });
        if (!latest.isCurrent(token)) return;
        setRows(data.rows);
        setTotals(data.totals);
      } catch (e) {
        if (!latest.isCurrent(token)) return;
        setError(e instanceof Error ? e.message : "Failed to load settlement audit");
        setRows([]);
        setTotals({ row_count: 0, source_total: 0, base_total: 0 });
      } finally {
        if (latest.isCurrent(token)) setLoading(false);
      }
    },
    [latest],
  );

  const load = () => loadWith(filters);

  async function loadPresets() {
    try {
      const data = await api.listSettlementAuditPresets();
      setPresets(data);
    } catch (e) {
      logApiError("SettlementAuditPage.loadPresets", e);
      setPresets([]);
    }
  }

  useEffect(() => {
    void loadWith(defaultFilters());
    void loadPresets();
  }, [loadWith]);

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
    const token = latest.begin();
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
      if (!latest.isCurrent(token)) return;
      setRows(data.rows);
      setTotals(data.totals);
    } catch (e) {
      if (!latest.isCurrent(token)) return;
      setError(e instanceof Error ? e.message : "Failed to apply preset");
    } finally {
      if (latest.isCurrent(token)) setLoading(false);
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
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Settlement Audit"
        description="Track source currency, FX rate, and base settlement values for payment runs."
      />

      <SummaryStrip
        items={[
          { key: "rows", label: "Rows", value: totals.row_count },
          { key: "source", label: "Source Total", value: totals.source_total.toLocaleString() },
          { key: "base", label: "Base Total", value: totals.base_total.toLocaleString(), tone: "success" },
        ]}
      />

      <form onSubmit={onFilterSubmit} className={`${listPageFilterBarClass} sm:items-start`}>
        <div className="flex w-full flex-col gap-2">
          <div className="flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center">
            <input
              type="date"
              aria-label="From date"
              className={`${listPageToolbarSelectClass} sm:w-40`}
              value={filters.from_date}
              onChange={(e) => setFilters((p) => ({ ...p, from_date: e.target.value }))}
            />
            <input
              type="date"
              aria-label="To date"
              className={`${listPageToolbarSelectClass} sm:w-40`}
              value={filters.to_date}
              onChange={(e) => setFilters((p) => ({ ...p, to_date: e.target.value }))}
            />
            <select
              aria-label="Status filter"
              className={listPageToolbarSelectClass}
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
              aria-label="Currency filter"
              className={listPageToolbarSelectClass}
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
              className={listPageToolbarInputClass}
              placeholder="Search party..."
              aria-label="Search party"
              value={filters.party_query}
              onChange={(e) => setFilters((p) => ({ ...p, party_query: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "Loading..." : "Apply Filters"}
            </button>
            <button type="button" className={listPageToolbarButtonClass} onClick={() => setFilters(defaultFilters())}>
              Reset
            </button>
            <button
              type="button"
              className="rounded-lg border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm font-medium text-status-success-foreground disabled:opacity-50"
              onClick={() => void exportCsv()}
              disabled={exporting}
            >
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
          </div>
          <div className="rounded-lg border border-border bg-surface-subtle p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Saved Filter Presets</p>
            <div className="mb-2 flex flex-wrap gap-2">
              <input
                className="rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-sm"
                placeholder="Preset name (e.g. Monthly Executed USD)"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
              <button
                type="button"
                className="rounded-lg border border-brand-primary/40 bg-brand-primary/10 px-3 py-1.5 text-sm font-medium text-brand-primary"
                onClick={() => void savePreset()}
              >
                Save Preset
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <div key={preset.id} className="flex items-center gap-1 rounded-lg border border-border bg-surface-raised px-2 py-1">
                  <button
                    type="button"
                    className="text-xs font-medium text-text-secondary hover:text-text-primary"
                    onClick={() => void applyPreset(preset)}
                  >
                    {preset.name}
                  </button>
                  <button
                    type="button"
                    className="rounded px-1 text-xs text-status-danger-foreground hover:bg-status-danger-subtle"
                    onClick={() => void deletePreset(preset.id)}
                    title="Delete preset"
                  >
                    x
                  </button>
                </div>
              ))}
              {presets.length === 0 ? <span className="text-xs text-text-muted">No presets saved yet.</span> : null}
            </div>
          </div>
        </div>
      </form>

      {error ? <div className={listPageErrorClass}>{error}</div> : null}

      <ScrollTableCard maxHeight="main" footer={showingCountLabel(rows.length, totals.row_count || rows.length, "record")}>
        <table className={`${listTableBaseClass} min-w-[56rem]`}>
          <thead className={listTableTheadClass}>
            <tr>
              <th className={listTableThClass}>Run</th>
              <th className={listTableThClass}>Date</th>
              <th className={listTableThClass}>Status</th>
              <th className={listTableThClass}>Party</th>
              <th className={listTableThClass}>Bill</th>
              <th className={listTableThClass}>Source Cur</th>
              <th className={listTableThRightClass}>Source Amt</th>
              <th className={listTableThRightClass}>FX</th>
              <th className={listTableThRightClass}>Base Amt</th>
              <th className={listTableThClass}>Base Cur</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.item_id} className={listTableTrClass}>
                <td className={listTableTdPrimaryClass}>{row.run_code}</td>
                <td className={listTableTdClass}>{row.run_date}</td>
                <td className={listTableTdClass}>{row.run_status}</td>
                <td className={listTableTdClass}>{row.party_name}</td>
                <td className={listTableTdClass}>{row.bill_no || "-"}</td>
                <td className={listTableTdClass}>{row.source_currency}</td>
                <td className={`${listTableTdClass} text-right`}>{row.source_amount.toLocaleString()}</td>
                <td className={`${listTableTdClass} text-right`}>{row.fx_rate_to_base.toLocaleString()}</td>
                <td className={`${listTableTdClass} text-right`}>{row.base_amount.toLocaleString()}</td>
                <td className={listTableTdClass}>{row.base_currency}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td className={listPageEmptyClass} colSpan={10}>
                  No settlement records found for selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </ScrollTableCard>
    </div>
  );
}