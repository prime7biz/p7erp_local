import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type EnhancedGatePassResponse,
  type InventoryDocumentPrintPayload,
} from "@/api/client";
import {
  InventoryEmptyState,
  InventoryErrorPanel,
  InventoryTableSkeleton,
} from "@/components/inventory/InventoryListStates";
import { inventoryScrollTableClass } from "@/components/inventory/InventoryMobileList";
import { InventoryDocumentPrintSheets } from "@/components/print/InventoryDocumentPrintSheets";
import { PrintPreviewModal } from "@/components/print/PrintPreviewModal";
import { logApiError } from "@/utils/logApiError";

const touchField = "min-h-[44px] w-full rounded border border-border px-3 py-3 text-base sm:text-sm touch-manipulation";

export function EnhancedGatePassesPage() {
  const [rows, setRows] = useState<EnhancedGatePassResponse[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [printOpen, setPrintOpen] = useState(false);
  const [printData, setPrintData] = useState<InventoryDocumentPrintPayload | null>(null);
  const [printTitle, setPrintTitle] = useState("");
  const [copyCount, setCopyCount] = useState(1);
  const [template, setTemplate] = useState<"standard" | "compact" | "audit">("standard");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      setRows(await api.listEnhancedGatePasses());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load gate passes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = (params.get("status") || "").toUpperCase();
    if (status) setStatusFilter(status);
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) {
      const s = (r.status || "OTHER").toUpperCase();
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  const filteredRows = statusFilter
    ? rows.filter((r) => (r.status || "").toUpperCase() === statusFilter)
    : rows;

  async function openPrintForRow(row: EnhancedGatePassResponse) {
    try {
      const data = await api.getGatePassPrintData(row.id);
      setPrintData(data);
      setPrintTitle(row.gate_pass_code);
      setPrintOpen(true);
    } catch (e) {
      logApiError("EnhancedGatePassesPage.print", e);
      setError((e as Error).message);
    }
  }

  return (
    <div className="min-w-0 space-y-6 touch-manipulation">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-primary">Enhanced Gate Passes</h1>
          <p className="text-sm text-text-muted">Yard release with approval, guard acknowledgement & verified print.</p>
        </div>
        <Link
          to="/app/inventory/enhanced-gate-passes/new"
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-brand-primary px-4 py-3 text-base font-semibold text-brand-primary-foreground hover:opacity-95 sm:text-sm"
        >
          New gate pass
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {["DRAFT", "SUBMITTED", "APPROVED", "RELEASED", "REJECTED"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === s ? "" : s))}
            className={`rounded-xl border px-3 py-2 text-left text-xs ${
              statusFilter === s ? "border-brand-primary bg-brand-primary/10" : "border-border bg-surface-raised"
            }`}
          >
            <div className="font-semibold">{s}</div>
            <div className="text-text-muted">{counts[s] ?? 0}</div>
          </button>
        ))}
      </div>

      {error ? <InventoryErrorPanel message={error} onRetry={() => void load()} /> : null}
      <div className="rounded-xl border border-border bg-surface-raised p-3 sm:p-4">
        <label className="mb-2 block text-xs font-semibold text-text-secondary">Status filter</label>
        <input
          className={touchField}
          value={statusFilter}
          placeholder="e.g. RELEASED"
          onChange={(e) => setStatusFilter(e.target.value.toUpperCase())}
          aria-label="Filter by status"
        />
      </div>

      {loading ? (
        <InventoryTableSkeleton rows={8} cols={5} />
      ) : !filteredRows.length ? (
        <InventoryEmptyState title="No gate passes" description="Create one with the button above." />
      ) : (
        <div className={`rounded-xl border border-border bg-surface-raised ${inventoryScrollTableClass}`}>
          <table className="min-w-[720px] w-full">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Code</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Purpose</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Challan</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-sm font-medium">{row.gate_pass_code}</td>
                  <td className="px-3 py-2 text-sm">{row.purpose}</td>
                  <td className="px-3 py-2 text-sm">{row.status}</td>
                  <td className="px-3 py-2 text-xs text-text-secondary">
                    {row.challan_id ? `#${row.challan_id}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="relative inline-block text-left">
                      <button
                        type="button"
                        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionsId((id) => (id === row.id ? null : row.id));
                        }}
                      >
                        Actions
                      </button>
                      {openActionsId === row.id ? (
                        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                          <Link
                            to={`/app/inventory/enhanced-gate-passes/${row.id}`}
                            className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={() => setOpenActionsId(null)}
                          >
                            View
                          </Link>
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionsId(null);
                              void openPrintForRow(row);
                            }}
                          >
                            Print
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {printOpen && printData ? (
        <PrintPreviewModal
          open={printOpen}
          title={`Print — ${printTitle}`}
          onClose={() => {
            setPrintOpen(false);
            setPrintData(null);
          }}
          copyCount={copyCount}
          onCopyCountChange={setCopyCount}
          template={template}
          onTemplateChange={setTemplate}
        >
          <InventoryDocumentPrintSheets data={printData} copyCount={copyCount} template={template} />
        </PrintPreviewModal>
      ) : null}
    </div>
  );
}
