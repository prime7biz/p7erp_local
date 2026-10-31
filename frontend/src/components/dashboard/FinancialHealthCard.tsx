import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gauge } from "lucide-react";
import { api, type MisHealthResponse } from "@/api/client";
import { Card } from "@/components/ui/card";
import { logApiError } from "@/utils/logApiError";

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function FinancialHealthCard() {
  const [data, setData] = useState<MisHealthResponse | null>(null);

  useEffect(() => {
    void api
      .getMisHealth()
      .then(setData)
      .catch((e) => logApiError("FinancialHealthCard.load", e));
  }, []);

  if (!data?.enabled) return null;

  return (
    <Card variant="default" className="h-full p-4">
      <div className="mb-2 flex items-center gap-2">
        <Gauge className="h-4 w-4 text-accent-secondary" aria-hidden />
        <span className="text-sm font-semibold text-text-primary">Financial health</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-text-muted">Net profit</dt>
        <dd className="text-right font-medium tabular-nums text-text-primary">{fmt(data.net_profit)}</dd>
        <dt className="text-text-muted">Cash</dt>
        <dd className="text-right font-medium tabular-nums text-text-primary">{fmt(data.cash)}</dd>
        <dt className="text-text-muted">Runway</dt>
        <dd className="text-right font-medium text-text-primary">
          {data.runway_months != null ? `${data.runway_months.toFixed(1)} mo` : "OK"}
        </dd>
      </dl>
      <Link
        to="/app/finance/mis"
        className="mt-2 inline-block text-[11px] font-semibold text-accent-secondary hover:underline"
      >
        Open MIS dashboard
      </Link>
    </Card>
  );
}
