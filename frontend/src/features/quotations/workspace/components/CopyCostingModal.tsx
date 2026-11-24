import { useEffect, useState } from "react";
import { api, type QuotationDetailResponse, type QuotationResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export interface CopyCostingChoice {
  materials: boolean;
  manufacturing: boolean;
  otherCosts: boolean;
  sizeRatios: boolean;
}

interface Props {
  /** The quotation being edited (excluded from the list). */
  currentId: number;
  onClose: () => void;
  /** Called with the full source quotation and the sections the user ticked. The page puts them in the draft. */
  onImport: (source: QuotationDetailResponse, choice: CopyCostingChoice) => void;
}

/** Pick another quotation and copy its costing lines into the draft. Nothing is saved until the user clicks Save. */
export function CopyCostingModal({ currentId, onClose, onImport }: Props) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<QuotationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<CopyCostingChoice>({
    materials: true,
    manufacturing: true,
    otherCosts: true,
    sizeRatios: false,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      api
        .listQuotations({ search: search.trim() || undefined, latest_only: true, limit: 20 })
        .then((r) => {
          if (!cancelled) {
            setRows(r.filter((q) => q.id !== currentId));
            setError("");
          }
        })
        .catch((e) => {
          logApiError("CopyCostingModal.list", e);
          if (!cancelled) setError(e instanceof Error ? e.message : "Could not load quotations");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [search, currentId]);

  const nothingTicked = !Object.values(choice).some(Boolean);

  async function pick(id: number) {
    setBusyId(id);
    setError("");
    try {
      const full = await api.getQuotation(id);
      onImport(full, choice);
      onClose();
    } catch (e) {
      logApiError("CopyCostingModal.get", e);
      setError(e instanceof Error ? e.message : "Could not load that quotation");
    } finally {
      setBusyId(null);
    }
  }

  const sections: Array<[keyof CopyCostingChoice, string]> = [
    ["materials", "Materials"],
    ["manufacturing", "Labor / CM"],
    ["otherCosts", "Other costs"],
    ["sizeRatios", "Size ratios"],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-costing-title"
        className="w-full max-w-xl rounded-2xl border border-border bg-surface-raised p-4 shadow-xl"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="copy-costing-title" className="text-sm font-semibold text-text-primary">
            Copy costing from another quotation
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-2 py-1 text-xs text-text-secondary"
          >
            Close
          </button>
        </div>
        <p className="mt-1 text-xs text-text-muted">
          Chosen sections replace the same section in your draft. Nothing is saved until you click Save.
        </p>
        <fieldset className="mt-3 flex flex-wrap gap-3 text-xs text-text-secondary">
          <legend className="sr-only">Sections to copy</legend>
          {sections.map(([key, label]) => (
            <label key={key} className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={choice[key]}
                onChange={(e) => setChoice((c) => ({ ...c, [key]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code or style"
          aria-label="Search quotations"
          className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm"
        />
        {error ? <p className="mt-2 text-xs text-status-danger-foreground">{error}</p> : null}
        <ul className="mt-3 max-h-64 divide-y divide-border-subtle overflow-auto rounded-lg border border-border-subtle">
          {loading ? <li className="p-3 text-xs text-text-muted">Loading…</li> : null}
          {!loading && rows.length === 0 ? <li className="p-3 text-xs text-text-muted">No quotations found.</li> : null}
          {rows.map((q) => (
            <li key={q.id} className="flex items-center justify-between gap-2 p-2 text-xs">
              <div className="min-w-0">
                <div className="font-medium text-text-primary">
                  {q.quotation_code} · {q.status}
                </div>
                <div className="truncate text-text-muted">
                  {q.style_name ?? q.style_ref ?? "No style"} · {q.total_amount ?? "—"} {q.currency ?? ""}
                </div>
              </div>
              <button
                type="button"
                disabled={nothingTicked || busyId !== null}
                onClick={() => void pick(q.id)}
                className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
              >
                {busyId === q.id ? "Copying…" : "Copy"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
