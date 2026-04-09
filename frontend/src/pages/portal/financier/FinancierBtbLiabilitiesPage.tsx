import { useEffect, useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";

type Installment = {
  utilization_id: number;
  utilization_code: string | null;
  installment_number: number | null;
  due_date: string | null;
  emi_amount: number;
  status: string | null;
};

type UtilRow = {
  id: number;
  utilization_code: string | null;
  outstanding_principal: number;
  principal_amount: number;
  currency: string | null;
  maturity_date: string | null;
  status: string | null;
};

type BtbCard = {
  btb_lc_id: number;
  reference: string;
  status: string | null;
  amount: number;
  currency: string | null;
  open_date: string | null;
  expiry_date: string | null;
  maturity_date: string | null;
  maturity_amount: number | null;
  utilizations: UtilRow[];
  upcoming_installments: Installment[];
};

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

function urgencyClass(days: number | null): string {
  if (days == null) return "border-border";
  if (days < 0) return "border-red-500 bg-red-50/40";
  if (days < 30) return "border-red-400 bg-red-50/30";
  if (days < 90) return "border-amber-400 bg-amber-50/30";
  return "border-border";
}

export function FinancierBtbLiabilitiesPage() {
  const [items, setItems] = useState<BtbCard[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const d = await financierPortalApi.btbLiabilities();
        setItems((d.items as BtbCard[]) ?? []);
        setNote(typeof d.note === "string" ? d.note : null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  if (err) return <PortalErrorState message={err} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">BTB liabilities & maturity</h1>
        <p className="mt-1 text-xs text-text-muted">
          Party BTB LCs with amounts, key dates, linked utilizations, and next repayment installments.
        </p>
      </div>
      {note ? <p className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm text-amber-900">{note}</p> : null}

      {items.length === 0 && !note ? <p className="text-sm text-text-muted">No BTB LCs in scope.</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((b) => {
          const matDays = daysUntil(b.maturity_date) ?? daysUntil(b.expiry_date);
          const border = urgencyClass(matDays);
          return (
            <article key={b.btb_lc_id} className={`rounded-xl border-2 p-4 ${border}`}>
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">{b.reference}</h2>
                  <p className="text-xs text-text-muted">Status: {b.status ?? "—"}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium tabular-nums text-text-primary">
                    {b.currency ?? ""} {b.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                  {b.maturity_amount != null ? (
                    <p className="text-xs text-text-muted">Maturity amt: {b.maturity_amount.toLocaleString()}</p>
                  ) : null}
                </div>
              </header>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-muted">
                <div>
                  <dt className="font-medium text-text-primary">Open</dt>
                  <dd>{b.open_date ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-text-primary">Expiry</dt>
                  <dd>{b.expiry_date ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-text-primary">Maturity</dt>
                  <dd>{b.maturity_date ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-text-primary">Countdown</dt>
                  <dd>
                    {matDays == null ? (
                      "—"
                    ) : matDays < 0 ? (
                      <span className="font-semibold text-red-600">{Math.abs(matDays)}d overdue</span>
                    ) : (
                      <span className={matDays < 30 ? "font-semibold text-red-600" : matDays < 90 ? "font-semibold text-amber-700" : ""}>
                        {matDays}d
                      </span>
                    )}
                  </dd>
                </div>
              </dl>

              {b.utilizations.length > 0 ? (
                <div className="mt-3 border-t border-border pt-2">
                  <p className="text-[11px] font-medium uppercase text-text-muted">Linked utilizations</p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {b.utilizations.map((u) => (
                      <li key={u.id} className="flex flex-wrap justify-between gap-1">
                        <span>{u.utilization_code ?? `#${u.id}`}</span>
                        <span className="tabular-nums text-text-muted">
                          OS {u.outstanding_principal.toLocaleString()} · mat {u.maturity_date ?? "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {b.upcoming_installments.length > 0 ? (
                <div className="mt-3 border-t border-border pt-2">
                  <p className="text-[11px] font-medium uppercase text-text-muted">Upcoming installments</p>
                  <ul className="mt-2 space-y-1.5 text-xs">
                    {b.upcoming_installments.map((ln, idx) => {
                      const d = daysUntil(ln.due_date);
                      return (
                        <li
                          key={`${ln.utilization_id}-${ln.installment_number}-${idx}`}
                          className={`flex flex-wrap justify-between gap-2 rounded-md border px-2 py-1 ${urgencyClass(d)}`}
                        >
                          <span>
                            {ln.utilization_code ?? `U#${ln.utilization_id}`} · #{ln.installment_number ?? idx + 1}
                          </span>
                          <span className="tabular-nums">
                            {ln.emi_amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} due {ln.due_date ?? "—"}{" "}
                            {d != null && d < 90 ? (
                              <span className="text-text-muted">({d < 0 ? `${Math.abs(d)}d late` : `${d}d`})</span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
