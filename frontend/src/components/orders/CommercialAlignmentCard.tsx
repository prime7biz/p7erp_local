import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type OrderCommercialAlignmentResponse } from "@/api/client";
import { formatMoney, toSafeNumber } from "@/features/quotations/workspace/mappers/quotationNumeric";
import { logApiError } from "@/utils/logApiError";

type Props = {
  orderId: number;
  quotationId: number | null | undefined;
  className?: string;
};

function fmtMoney(v: unknown): string {
  if (v == null || v === "") return "—";
  return formatMoney(toSafeNumber(String(v)));
}

export function CommercialAlignmentCard({ orderId, quotationId, className = "" }: Props) {
  const [data, setData] = useState<OrderCommercialAlignmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await api.getOrderCommercialAlignment(orderId);
        if (!cancelled) setData(res);
      } catch (e) {
        logApiError("CommercialAlignmentCard", e);
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load commercial alignment");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!quotationId) {
    return (
      <section
        className={`rounded-xl border border-border bg-surface-raised p-4 text-sm text-text-muted ${className}`}
      >
        <h2 className="text-base font-semibold text-text-primary mb-1">Commercial alignment</h2>
        <p>No linked quotation — comparison is not available.</p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className={`rounded-xl border border-border bg-surface-raised p-4 text-sm text-text-muted ${className}`}>
        Loading commercial alignment…
      </section>
    );
  }

  if (err || !data) {
    return (
      <section className={`rounded-xl border border-border bg-surface-raised p-4 text-sm text-status-danger-foreground ${className}`}>
        {err || "Unable to load alignment."}
      </section>
    );
  }

  const frozen = data.frozen_at_conversion;
  const live = data.live_quotation;
  const exec = data.order_execution;
  const hasDrift = data.discrepancies.some((d) => !d.code.startsWith("NO_CONVERSION"));

  return (
    <section className={`rounded-xl border border-border bg-surface-raised p-4 space-y-3 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Commercial alignment</h2>
          <p className="text-xs text-text-muted mt-0.5">{data.costing_numeraire_description}</p>
        </div>
        <div className="text-right text-xs">
          <div className="text-text-muted">Reporting / book currency</div>
          <div className="font-medium text-text-primary">{data.commercial_book_currency ?? "—"}</div>
        </div>
      </div>

      {data.quotation_commercially_locked ? (
        <div className="rounded-lg border border-status-warning/25 bg-status-warning-subtle/40 px-3 py-2 text-xs text-status-warning-foreground">
          Linked quotation is commercially locked. Use change requests for protected commercial fields; live quotation
          values may still differ from the frozen conversion snapshot below.
        </div>
      ) : null}

      {hasDrift ? (
        <div className="rounded-lg border border-status-warning/25 bg-status-warning-subtle/30 px-3 py-2 text-xs space-y-1">
          <div className="font-semibold text-text-primary">Drift or context notes</div>
          <ul className="list-disc pl-4 text-text-secondary space-y-0.5">
            {data.discrepancies.map((d) => (
              <li key={d.code}>{d.message}</li>
            ))}
          </ul>
        </div>
      ) : data.discrepancies.length > 0 ? (
        <div className="rounded-lg border border-border-subtle bg-surface-subtle px-3 py-2 text-xs text-text-secondary">
          {data.discrepancies[0]?.message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-border-subtle p-3 space-y-1.5">
          <div className="font-semibold text-text-primary">Frozen at order conversion</div>
          {frozen ? (
            <>
              <div>
                <span className="text-text-muted">Doc currency:</span> {String(frozen.document_currency ?? "—")}
              </div>
              <div>
                <span className="text-text-muted">Quoted / offer:</span>{" "}
                {fmtMoney(frozen.quoted_price)} {String(frozen.document_currency ?? "")}
              </div>
              <div>
                <span className="text-text-muted">Total cost (factory):</span> {fmtMoney(frozen.total_cost)}
              </div>
              <div>
                <span className="text-text-muted">Qty (projection):</span> {String(frozen.projected_quantity ?? "—")}
              </div>
            </>
          ) : (
            <p className="text-text-muted">No snapshot stored for this order.</p>
          )}
        </div>
        <div className="rounded-lg border border-border-subtle p-3 space-y-1.5">
          <div className="font-semibold text-text-primary">Live quotation vs order execution</div>
          {live ? (
            <>
              <div>
                <span className="text-text-muted">Live quoted:</span> {fmtMoney(live.quoted_price)}{" "}
                {String(live.document_currency ?? "")}
              </div>
              <div>
                <span className="text-text-muted">Order qty:</span>{" "}
                {exec.quantity != null && exec.quantity !== "" ? String(exec.quantity) : "—"}
              </div>
              <div>
                <span className="text-text-muted">Order delivery:</span>{" "}
                {exec.delivery_date != null && exec.delivery_date !== "" ? String(exec.delivery_date) : "—"}
              </div>
              <Link
                to={`/app/quotations/${quotationId}`}
                className="inline-block mt-1 text-status-info hover:underline font-medium"
              >
                Open quotation
              </Link>
            </>
          ) : (
            <p className="text-text-muted">Quotation not found.</p>
          )}
        </div>
      </div>
    </section>
  );
}
