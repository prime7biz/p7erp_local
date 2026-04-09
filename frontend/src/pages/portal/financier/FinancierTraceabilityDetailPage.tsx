import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";

function StepCard({
  title,
  children,
  status,
}: {
  title: string;
  children: ReactNode;
  status?: string | null;
}) {
  return (
    <div className="relative rounded-xl border border-border bg-surface-raised p-4 pl-6">
      <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-brand-primary/40" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {status ? (
          <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[10px] font-medium uppercase text-text-muted">
            {status}
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-sm text-text-primary">{children}</div>
    </div>
  );
}

function NaBlock() {
  return <span className="text-text-muted">N/A</span>;
}

export function FinancierTraceabilityDetailPage() {
  const { utilizationId } = useParams<{ utilizationId: string }>();
  const id = Number(utilizationId);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    void (async () => {
      try {
        setData(await financierPortalApi.traceabilityDetail(id));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, [id]);

  if (!Number.isFinite(id)) return <PortalErrorState message="Invalid id" />;
  if (err) return <PortalErrorState message={err} />;
  if (!data) return <p className="text-sm text-text-muted">Loading…</p>;

  const facility = data.facility as Record<string, unknown> | null | undefined;
  const utilization = data.utilization as Record<string, unknown> | null | undefined;
  const master = data.master_contract as Record<string, unknown> | null | undefined;
  const btb = data.btb_lc as Record<string, unknown> | null | undefined;
  const procurement = data.procurement as { purchase_orders?: { id: number; po_code?: string; status?: string }[]; grn_count?: number } | undefined;
  const shipments = (data.shipments as { id: number; status?: string; etd?: string | null }[]) ?? [];
  const repayment = data.repayment as {
    schedule_lines?: number;
    paid_emi_total_approx?: number;
    next_due?: string | null;
  } | undefined;

  return (
    <div className="space-y-6">
      <Link to="/portal/financier/traceability" className="text-sm text-brand-primary hover:underline">
        ← Traceability list
      </Link>
      <h1 className="text-lg font-semibold text-text-primary">Chain detail</h1>
      <p className="text-xs text-text-muted">Vertical flow from facility to repayment.</p>

      <div className="space-y-4">
        <StepCard title="1. Facility" status={facility?.type != null ? String(facility.type) : undefined}>
          {facility?.code != null ? (
            <dl className="space-y-1 text-sm">
              <div>
                <span className="text-text-muted">Code: </span>
                {String(facility.code)}
              </div>
              {facility.sanctioned != null ? (
                <div>
                  <span className="text-text-muted">Sanctioned: </span>
                  {Number(facility.sanctioned).toLocaleString()}
                </div>
              ) : null}
            </dl>
          ) : (
            <NaBlock />
          )}
        </StepCard>

        <StepCard title="2. Utilization" status={utilization?.status != null ? String(utilization.status) : undefined}>
          {utilization?.code != null ? (
            <dl className="space-y-1">
              <div>
                <span className="text-text-muted">Code: </span>
                {String(utilization.code)}
              </div>
              <div>
                <span className="text-text-muted">Principal: </span>
                {Number(utilization.principal ?? 0).toLocaleString()}
              </div>
              <div>
                <span className="text-text-muted">Outstanding: </span>
                {Number(utilization.outstanding_principal ?? 0).toLocaleString()}
              </div>
            </dl>
          ) : (
            <NaBlock />
          )}
        </StepCard>

        <StepCard title="3. Master contract">
          {master?.reference != null ? (
            <dl className="space-y-1">
              <div>
                <span className="text-text-muted">Reference: </span>
                {String(master.reference)}
              </div>
              <div>
                <span className="text-text-muted">Amount: </span>
                {Number(master.amount ?? 0).toLocaleString()}
              </div>
            </dl>
          ) : (
            <NaBlock />
          )}
        </StepCard>

        <StepCard title="4. BTB LC" status={btb?.status != null ? String(btb.status) : undefined}>
          {btb?.reference != null ? (
            <dl className="space-y-1">
              <div>
                <span className="text-text-muted">Reference: </span>
                {String(btb.reference)}
              </div>
              <div>
                <span className="text-text-muted">Amount: </span>
                {Number(btb.amount ?? 0).toLocaleString()}
              </div>
            </dl>
          ) : (
            <NaBlock />
          )}
        </StepCard>

        <StepCard title="5. Procurement">
          {procurement?.purchase_orders && procurement.purchase_orders.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-text-muted">GRNs (total): {procurement.grn_count ?? 0}</p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                {procurement.purchase_orders.map((po) => (
                  <li key={po.id} className="rounded border border-border px-2 py-1">
                    <span className="font-medium">{po.po_code ?? po.id}</span>
                    {po.status ? <span className="ml-2 text-text-muted">{po.status}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <NaBlock />
          )}
        </StepCard>

        <StepCard title="6. Shipments">
          {shipments.length > 0 ? (
            <ul className="space-y-1 text-xs">
              {shipments.map((s) => (
                <li key={s.id} className="rounded border border-border px-2 py-1">
                  #{s.id}
                  {s.status ? <span className="ml-2 text-text-muted">{s.status}</span> : null}
                  {s.etd ? <span className="ml-2 text-text-muted">ETD {s.etd}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <NaBlock />
          )}
        </StepCard>

        <StepCard title="7. Repayment">
          {repayment ? (
            <dl className="space-y-2">
              <div>
                <dt className="text-xs text-text-muted">Schedule lines</dt>
                <dd className="font-medium tabular-nums">{repayment.schedule_lines ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-muted">Paid EMI total (approx.)</dt>
                <dd className="font-medium tabular-nums">
                  {repayment.paid_emi_total_approx != null ? repayment.paid_emi_total_approx.toLocaleString() : "—"}
                </dd>
              </div>
              <div className="rounded-lg border border-amber-400/40 bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
                <dt className="text-xs font-medium text-amber-900 dark:text-amber-100">Next due</dt>
                <dd className="text-sm font-semibold text-amber-950 dark:text-amber-50">{repayment.next_due ?? "—"}</dd>
              </div>
            </dl>
          ) : (
            <NaBlock />
          )}
        </StepCard>
      </div>
    </div>
  );
}
