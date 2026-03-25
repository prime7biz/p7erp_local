import { useEffect, useState } from "react";
import { getRevenue, exportRevenueCsv } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { KPICard } from "@/components/ui/KPICard";
import { LoadingState } from "@/components/ui/LoadingState";
import { useToast } from "@/context/ToastContext";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { formatUsd } from "@/utils/format";

export function RevenuePage() {
  const { showToast } = useToast();
  const { can } = useAdminAuth();
  const manage = can("billing.manage_billing");

  const [mrr, setMrr] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    getRevenue()
      .then((r) => {
        setMrr(r.mrr_approx_usd);
        setNote(r.note ?? null);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Revenue"
        description={note ?? "Approximate revenue from paid invoices."}
        actions={
          manage ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  await exportRevenueCsv();
                  showToast("Export started", "success");
                } catch (e: unknown) {
                  showToast(e instanceof Error ? e.message : "Export failed", "error");
                }
              }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              Export CSV
            </button>
          ) : undefined
        }
      />
      {err && <p className="text-sm text-red-600 mb-4">{err}</p>}
      <div className="max-w-md">
        <KPICard label="Approx. paid revenue (USD)" value={mrr != null ? formatUsd(mrr) : "—"} />
      </div>
    </div>
  );
}
