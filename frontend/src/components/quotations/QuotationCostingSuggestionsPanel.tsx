import { useCallback, useMemo } from "react";
import type { QuotationDetailResponse } from "@/api/client";
import { useQuotationCostingSuggestions } from "@/hooks/useQuotationCostingSuggestions";
import { quotationCostingReasonLabel } from "@/lib/quotationCostingReasonLabels";
import { isQuotationCommercialLocked } from "@/lib/commercialChangeFields";
import { Loader2 } from "lucide-react";

type Props = {
  quotation: QuotationDetailResponse;
  mode: "edit" | "view";
  onAfterApply?: () => void;
};

export function QuotationCostingSuggestionsPanel({ quotation, mode, onAfterApply }: Props) {
  const cs = useQuotationCostingSuggestions();
  const locked = isQuotationCommercialLocked(quotation.status);

  const grouped = useMemo(() => {
    const items = cs.batch?.items ?? [];
    return {
      material: items.filter((i) => i.cost_category === "material"),
      manufacturing: items.filter((i) => i.cost_category === "manufacturing"),
      other_cost: items.filter((i) => i.cost_category === "other_cost"),
    };
  }, [cs.batch]);

  const onGenerate = useCallback(async () => {
    if (!quotation.id) return;
    await cs.generate(quotation.id);
  }, [cs, quotation.id]);

  const onApplyOne = useCallback(
    async (itemId: number, decision: "apply" | "reject" | "skip") => {
      if (!quotation.id || !cs.batch) return;
      await cs.apply(quotation.id, cs.batch.id, [{ item_id: itemId, decision }]);
      onAfterApply?.();
    },
    [cs, quotation.id, onAfterApply],
  );

  const onDiscard = useCallback(async () => {
    if (!cs.batch) return;
    await cs.discard(cs.batch.id);
  }, [cs]);

  if (!quotation.id) {
    return (
      <aside className="rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-600 shadow-sm">
        <div className="font-semibold text-gray-800">Costing suggestions (Phase 2)</div>
        <p className="mt-1">Save the quotation first.</p>
      </aside>
    );
  }

  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-800 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">Costing suggestions (review)</div>
        {cs.busy ? <Loader2 className="h-4 w-4 animate-spin text-gray-500" /> : null}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-gray-600">
        Rule-based line suggestions only. Roll-up header totals are never written by this tool.
      </p>
      {locked ? (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
          Commercial lock: applies are blocked until the quotation is revised to an editable status (no silent line
          changes).
        </div>
      ) : null}
      {cs.error ? <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-800">{cs.error}</div> : null}
      {cs.lastApply?.requires_revision ? (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-900">
          Some items were blocked (locked). Use Revise workflow to edit costing.
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={cs.busy || mode !== "edit"}
          onClick={() => void onGenerate()}
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          Generate suggestions
        </button>
        {cs.batch ? (
          <button
            type="button"
            disabled={cs.busy}
            onClick={() => void onDiscard()}
            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            Discard batch
          </button>
        ) : null}
      </div>

      {cs.batch ? (
        <div className="mt-3 max-h-80 space-y-3 overflow-y-auto">
          {(["material", "manufacturing", "other_cost"] as const).map((cat) => {
            const label = cat === "material" ? "Materials" : cat === "manufacturing" ? "Manufacturing" : "Other costs";
            const rows = grouped[cat];
            if (!rows.length) return null;
            return (
              <div key={cat}>
                <div className="mb-1 font-medium text-gray-700">{label}</div>
                <ul className="space-y-2">
                  {rows.map((it) => (
                    <li key={it.id} className="rounded-lg border border-gray-100 bg-gray-50/80 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] uppercase text-gray-600">
                          {it.suggestion_type.replace("_", " ")}
                        </span>
                        {it.confidence != null ? (
                          <span className="text-[10px] text-gray-500">{(it.confidence * 100).toFixed(0)}% conf.</span>
                        ) : null}
                      </div>
                      {it.reason_code ? (
                        <div className="mt-1 text-[11px] text-gray-700">{quotationCostingReasonLabel(it.reason_code)}</div>
                      ) : null}
                      {it.explanation ? <div className="mt-0.5 text-[11px] text-gray-600">{it.explanation}</div> : null}
                      <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-white p-1 text-[10px] text-gray-800">
                        {JSON.stringify(it.field_changes_json, null, 0)}
                      </pre>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={cs.busy || locked}
                          className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] text-green-900 disabled:opacity-50"
                          onClick={() => void onApplyOne(it.id, "apply")}
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          disabled={cs.busy}
                          className="rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-700"
                          onClick={() => void onApplyOne(it.id, "reject")}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={cs.busy}
                          className="rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-700"
                          onClick={() => void onApplyOne(it.id, "skip")}
                        >
                          Skip
                        </button>
                      </div>
                      <div className="mt-0.5 text-[10px] text-gray-500">Status: {it.disposition}</div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-gray-500">No batch yet — generate to review line-level fixes (e.g. negative amounts).</p>
      )}
    </aside>
  );
}
