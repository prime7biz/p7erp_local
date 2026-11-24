import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchThreeWayMatchDetail,
  fetchThreeWayMatchExceptions,
  type ThreeWayExceptionRow,
  type ThreeWayMatchDetail,
} from "@/api/materialControl";
import { useEmbeddedPage } from "@/components/app/embeddedPage";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { logApiError } from "@/utils/logApiError";

export function ThreeWayMatchPage() {
  const embedded = useEmbeddedPage();
  const [rows, setRows] = useState<ThreeWayExceptionRow[]>([]);
  const [detail, setDetail] = useState<ThreeWayMatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grnLookup, setGrnLookup] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchThreeWayMatchExceptions()
      .then((res) => {
        if (!cancelled) {
          setRows(res.items);
          setError(null);
        }
      })
      .catch((e) => {
        logApiError("ThreeWayMatchPage.load", e);
        if (!cancelled) setError("Could not load 3-way match (hub or inbound flag needed).");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadDetail(grnId: number) {
    setError(null);
    try {
      setDetail(await fetchThreeWayMatchDetail(grnId));
    } catch (e) {
      logApiError("ThreeWayMatchPage.detail", e);
      setError("Could not load GRN match detail.");
    }
  }

  return (
    <div className="space-y-4">
      {!embedded ? (
        <AppPageHeader
          title="3-way match"
          description="Soft check: PO vs GRN vs Vendor bill (warn only — never blocks)"
        />
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const id = Number(grnLookup);
          if (id) void loadDetail(id);
        }}
      >
        <label className="block text-sm">
          <span className="text-text-secondary">GRN id</span>
          <input
            className="mt-1 block w-40 rounded border border-border bg-surface px-2 py-1.5"
            value={grnLookup}
            onChange={(e) => setGrnLookup(e.target.value)}
            inputMode="numeric"
          />
        </label>
        <button type="submit" className="rounded border border-border px-3 py-1.5 text-sm">
          Check GRN
        </button>
      </form>

      <div>
        <h3 className="text-sm font-medium text-text-primary">Recent exceptions</h3>
        {rows.length === 0 ? (
          <p className="mt-1 text-sm text-text-muted">No soft mismatches in the recent scan.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {rows.map((r) => (
              <li key={r.grn_id} className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="text-brand-primary underline"
                  onClick={() => void loadDetail(r.grn_id)}
                >
                  {r.grn_code}
                </button>
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">{r.status}</span>
                <Link className="text-xs text-text-muted underline" to={r.href}>
                  Open GRN
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detail ? (
        <div className="rounded-lg border border-border bg-surface-raised p-3 space-y-2">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="font-medium">{detail.grn_code}</span>
            <span className="rounded bg-surface px-1.5 py-0.5 text-xs">{detail.status}</span>
            {detail.warn_only ? <span className="text-xs text-text-muted">warn only</span> : null}
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-text-muted">
                <th className="py-1">Item</th>
                <th>PO qty</th>
                <th>GRN qty</th>
                <th>Bill qty</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((ln) => (
                <tr key={ln.grn_item_id} className="border-t border-border">
                  <td className="py-1">{ln.item_id}</td>
                  <td>{ln.po_qty}</td>
                  <td>{ln.grn_accepted_qty}</td>
                  <td>{ln.bill_qty}</td>
                  <td>{ln.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
