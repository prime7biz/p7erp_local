import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";

export function FinancierLoanPortfolioPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        setData(await financierPortalApi.loanPortfolio());
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  if (err) return <PortalErrorState message={err} />;
  const items = (data?.items as Record<string, unknown>[]) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-text-primary">Loan portfolio</h1>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead className="border-b border-border bg-surface-base text-xs text-text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Outstanding</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={String(u.id)} className="border-b border-border">
                <td className="px-3 py-2">
                  <Link className="text-brand-primary hover:underline" to={`/portal/financier/loan-portfolio/${u.id}`}>
                    {String(u.utilization_code)}
                  </Link>
                </td>
                <td className="px-3 py-2">{String(u.outstanding_principal)}</td>
                <td className="px-3 py-2">{String(u.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
