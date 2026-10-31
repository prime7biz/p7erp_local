import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  api,
  type GoodsReceivingResponse,
  type GrnQualityInspection,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

type InspectDraft = {
  accepted_qty: string;
  rejected_qty: string;
  hold_qty: string;
  color: string;
  shade: string;
  weight: string;
  width: string;
  defects: string;
  notes: string;
  photos: string;
};

function emptyDraft(recv: string): InspectDraft {
  return {
    accepted_qty: recv,
    rejected_qty: "0",
    hold_qty: "0",
    color: "",
    shade: "",
    weight: "",
    width: "",
    defects: "",
    notes: "",
    photos: "",
  };
}

export function GrnInspectionPage() {
  const [searchParams] = useSearchParams();
  const grnIdParam = Number(searchParams.get("grn_id") || 0) || null;
  const [grns, setGrns] = useState<GoodsReceivingResponse[]>([]);
  const [selectedGrnId, setSelectedGrnId] = useState<number | null>(grnIdParam);
  const [pending, setPending] = useState<GrnQualityInspection[]>([]);
  const [drafts, setDrafts] = useState<Record<number, InspectDraft>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const loadGrns = useCallback(async () => {
    try {
      const page = await api.listGoodsReceivingPaginated({
        status_filter: "RECEIVED",
        page: 1,
        page_size: 50,
      });
      setGrns(page.items);
      if (!selectedGrnId && page.items[0]) setSelectedGrnId(page.items[0].id);
    } catch (e) {
      logApiError("GrnInspectionPage.loadGrns", e);
      setError((e as Error).message);
    }
  }, [selectedGrnId]);

  const loadPending = useCallback(async (grnId: number) => {
    setError("");
    try {
      const rows = await api.listGrnQcPending(grnId);
      setPending(rows);
      const next: Record<number, InspectDraft> = {};
      for (const r of rows) {
        next[r.grn_item_id] = emptyDraft(r.received_qty);
      }
      setDrafts(next);
    } catch (e) {
      logApiError("GrnInspectionPage.loadPending", e);
      setError((e as Error).message);
      setPending([]);
    }
  }, []);

  useEffect(() => {
    void loadGrns();
  }, [loadGrns]);

  useEffect(() => {
    if (selectedGrnId) void loadPending(selectedGrnId);
  }, [selectedGrnId, loadPending]);

  async function submitOne(row: GrnQualityInspection) {
    if (!selectedGrnId) return;
    const d = drafts[row.grn_item_id];
    if (!d) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const photos = d.photos
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const results = await api.submitGrnInspection(selectedGrnId, {
        lines: [
          {
            grn_item_id: row.grn_item_id,
            accepted_qty: d.accepted_qty,
            rejected_qty: d.rejected_qty,
            hold_qty: d.hold_qty,
            notes: d.notes || null,
            photos: photos.length ? photos : null,
            parameters: {
              color: d.color || null,
              shade: d.shade || null,
              weight: d.weight || null,
              width: d.width || null,
              defects: d.defects || null,
            },
          },
        ],
      });
      const first = results[0];
      const tip =
        first?.debit_note_suggested
          ? " Debit note suggested for rejected qty."
          : "";
      setSuccess(`Inspection ${first?.result ?? "done"}.${tip}`);
      await loadPending(selectedGrnId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="GRN Quality Inspection"
        description="Inspect quarantine receipts — accept, reject, or hold before stock is available"
      />
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="text-sm">
          Received GRN
          <select
            className="mt-1 block min-w-[220px] rounded-lg border border-gray-300 px-2 py-1.5"
            value={selectedGrnId ?? ""}
            onChange={(e) => setSelectedGrnId(Number(e.target.value) || null)}
          >
            <option value="">Select…</option>
            {grns.map((g) => (
              <option key={g.id} value={g.id}>
                {g.grn_code} (#{g.id})
              </option>
            ))}
          </select>
        </label>
        <Link to="/app/inventory/quality-dashboard" className="text-sm text-slate-700 underline">
          Quality dashboard
        </Link>
      </div>

      {pending.length === 0 ? (
        <p className="text-sm text-gray-500">
          No pending inspections for this GRN. Enable flag <code>grn_quality_inspection_enabled</code> and receive a
          GRN to create quarantine QC tasks.
        </p>
      ) : (
        <div className="space-y-4">
          {pending.map((row) => {
            const d = drafts[row.grn_item_id] ?? emptyDraft(row.received_qty);
            return (
              <div key={row.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">
                      {row.item_code ?? `Item #${row.item_id}`} — {row.item_name ?? ""}
                    </p>
                    <p className="text-xs text-gray-500">
                      Lot {row.lot_number ?? "—"} · Received {row.received_qty} · Pending #{row.id}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {(
                    [
                      ["accepted_qty", "Accepted"],
                      ["rejected_qty", "Rejected"],
                      ["hold_qty", "Hold"],
                      ["color", "Color"],
                      ["shade", "Shade"],
                      ["weight", "Weight"],
                      ["width", "Width"],
                      ["defects", "Defects"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="text-xs text-gray-600">
                      {label}
                      <input
                        className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                        value={d[key]}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.grn_item_id]: { ...d, [key]: e.target.value },
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <label className="mt-3 block text-xs text-gray-600">
                  Notes
                  <textarea
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    rows={2}
                    value={d.notes}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [row.grn_item_id]: { ...d, notes: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="mt-2 block text-xs text-gray-600">
                  Photo refs (comma or newline)
                  <textarea
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    rows={2}
                    value={d.photos}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [row.grn_item_id]: { ...d, photos: e.target.value },
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void submitOne(row)}
                  className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  Submit inspection
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
