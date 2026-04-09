import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type DeliveryChallanResponse,
  type InventoryDocumentPrintPayload,
} from "@/api/client";
import {
  InventoryEmptyState,
  InventoryErrorPanel,
  InventoryTableSkeleton,
} from "@/components/inventory/InventoryListStates";
import {
  InventoryListViewToggle,
  inventoryScrollTableClass,
  touchFieldClass,
} from "@/components/inventory/InventoryMobileList";
import { InventoryDocumentPrintSheets } from "@/components/print/InventoryDocumentPrintSheets";
import { PrintPreviewModal } from "@/components/print/PrintPreviewModal";
import { useListViewPreference } from "@/hooks/useInventoryListView";
import { logApiError } from "@/utils/logApiError";

export function DeliveryChallansPage() {
  const [rows, setRows] = useState<DeliveryChallanResponse[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { isNarrow, view, setView, showCards } = useListViewPreference();
  const [printOpen, setPrintOpen] = useState(false);
  const [printData, setPrintData] = useState<InventoryDocumentPrintPayload | null>(null);
  const [printTitle, setPrintTitle] = useState("");
  const [copyCount, setCopyCount] = useState(1);
  const [template, setTemplate] = useState<"standard" | "compact" | "audit">("standard");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      setRows(await api.listDeliveryChallans());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load delivery challans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = (params.get("status") || "").toUpperCase();
    if (status) setStatusFilter(status);
    void load();
  }, [load]);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) {
      const s = (r.status || "OTHER").toUpperCase();
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [rows]);

  const filteredRows = useMemo(() => {
    let out = rows;
    if (statusFilter) out = out.filter((r) => (r.status || "").toUpperCase() === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) =>
          r.challan_code.toLowerCase().includes(q) || r.customer_name.toLowerCase().includes(q),
      );
    }
    return out;
  }, [rows, statusFilter, search]);

  async function openPrintForRow(row: DeliveryChallanResponse) {
    try {
      const data = await api.getDeliveryChallanPrintData(row.id);
      setPrintData(data);
      setPrintTitle(row.challan_code);
      setPrintOpen(true);
    } catch (e) {
      logApiError("DeliveryChallansPage.print", e);
      setError((e as Error).message);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-primary">Delivery Challans</h1>
          <p className="text-sm text-text-muted">Dispatch workflow with verified print & QR.</p>
        </div>
        <Link
          to="/app/inventory/delivery-challans/new"
          className="inline-flex items-center justify-center rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground hover:opacity-95"
        >
          New challan
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {["DRAFT", "SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED", "POSTED", "REJECTED"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === s ? "" : s))}
            className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
              statusFilter === s ? "border-brand-primary bg-brand-primary/10" : "border-border bg-surface-raised"
            }`}
          >
            <div className="font-semibold text-text-primary">{s}</div>
            <div className="text-text-muted">{counts[s] ?? 0}</div>
          </button>
        ))}
      </div>

      {error ? <InventoryErrorPanel message={error} onRetry={() => void load()} /> : null}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-3 sm:flex-row sm:items-center sm:justify-between">
        {isNarrow ? <InventoryListViewToggle value={view} onChange={setView} /> : null}
        <label className="flex flex-1 flex-wrap items-center gap-2 text-xs font-semibold text-text-secondary">
          Search
          <input
            className={`min-w-0 flex-1 rounded border px-2 py-1 text-xs sm:flex-none ${touchFieldClass}`}
            value={search}
            placeholder="Code or customer"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {loading ? (
        <InventoryTableSkeleton rows={8} cols={5} />
      ) : !filteredRows.length ? (
        <InventoryEmptyState
          title={rows.length ? "No challans match filters" : "No delivery challans yet"}
          description="Create a challan or clear filters."
        />
      ) : showCards ? (
        <div className="space-y-3">
          {filteredRows.map((row) => (
            <div key={row.id} className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-text-primary">{row.challan_code}</div>
                  <div className="text-sm text-text-secondary">{row.customer_name}</div>
                  <div className="mt-1 text-xs text-text-muted">
                    {row.status} · {row.items.length} line{row.items.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="relative inline-block shrink-0 text-left">
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
                        to={`/app/inventory/delivery-challans/${row.id}`}
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
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`rounded-xl border border-border bg-surface-raised ${inventoryScrollTableClass}`}>
          <table className="min-w-[720px] w-full">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Code</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Customer</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-text-muted">Lines</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-sm font-medium">{row.challan_code}</td>
                  <td className="px-3 py-2 text-sm">{row.customer_name}</td>
                  <td className="px-3 py-2 text-sm">{row.status}</td>
                  <td className="px-3 py-2 text-xs text-text-secondary">{row.items.length}</td>
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
                            to={`/app/inventory/delivery-challans/${row.id}`}
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
