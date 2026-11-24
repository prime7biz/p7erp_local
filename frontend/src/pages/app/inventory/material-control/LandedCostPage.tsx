import { FormEvent, useState } from "react";
import { allocateLandedCost, postLandedCost } from "@/api/materialControl";
import { useEmbeddedPage } from "@/components/app/embeddedPage";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import { fetchChartAccountPage, hydrateChartAccount } from "@/lib/remoteSelectFetchers";
import { logApiError } from "@/utils/logApiError";

export function LandedCostPage() {
  const embedded = useEmbeddedPage();
  const [grnId, setGrnId] = useState("");
  const [freight, setFreight] = useState("");
  const [duty, setDuty] = useState("");
  const [creditAccountId, setCreditAccountId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const lines: Array<{ cost_kind: string; amount: string }> = [];
      if (freight.trim()) lines.push({ cost_kind: "FREIGHT", amount: freight.trim() });
      if (duty.trim()) lines.push({ cost_kind: "DUTY", amount: duty.trim() });
      if (!lines.length) {
        setError("Enter freight and/or duty amount.");
        return;
      }
      if (!creditAccountId) {
        setError("Pick the account to credit (for example Freight payable).");
        return;
      }
      const doc = await postLandedCost({
        goods_receiving_id: Number(grnId),
        lines,
        request_id: `ui-lc-${Date.now()}`,
      });
      const allocated = await allocateLandedCost(doc.id, Number(creditAccountId));
      setMessage(`Landed cost ${allocated.doc_no} → ${allocated.status} (total ${allocated.total_amount}).`);
    } catch (err) {
      logApiError("LandedCostPage.submit", err);
      setError("Could not allocate landed cost (need material_landed_cost_v1 + open GRN layers).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!embedded ? (
        <AppPageHeader
          title="Landed cost"
          description="Add freight/duty onto GRN FIFO unit costs (lite)"
        />
      ) : null}
      <form onSubmit={onSubmit} className="max-w-md space-y-3">
        <label className="block text-sm">
          <span className="text-text-secondary">GRN id</span>
          <input
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
            value={grnId}
            onChange={(e) => setGrnId(e.target.value)}
            required
            inputMode="numeric"
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-secondary">Freight amount</span>
          <input
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
            value={freight}
            onChange={(e) => setFreight(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-secondary">Duty amount</span>
          <input
            className="mt-1 w-full rounded border border-border bg-surface px-2 py-1.5"
            value={duty}
            onChange={(e) => setDuty(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-text-secondary">Credit account (e.g. Freight payable)</span>
          <RemoteSearchSelect
            className="mt-1"
            value={creditAccountId}
            onChange={(next) => setCreditAccountId(next === "" ? "" : Number(next))}
            fetchPage={fetchChartAccountPage}
            hydrateById={hydrateChartAccount}
            placeholder="Select account…"
            aria-label="Credit account"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Allocating…" : "Create & allocate"}
        </button>
      </form>
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
