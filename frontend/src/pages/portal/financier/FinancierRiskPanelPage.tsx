import { useEffect, useMemo, useState } from "react";
import { financierPortalApi } from "@/hooks/useFinancierPortal";
import { PortalErrorState } from "@/components/external-access/PortalErrorState";

type AlertItem = { code: string; severity: string; title: string; detail: string };

function categoryForCode(code: string): string {
  if (code.startsWith("DELAYED_MATERIAL") || code.includes("MATERIAL")) return "Material & RM";
  if (code.startsWith("DELAYED_PRODUCTION")) return "Production";
  if (code.startsWith("DELAYED_SHIPMENT")) return "Shipment";
  if (code.startsWith("DELAYED_COLLECTION")) return "Collection";
  if (code.startsWith("FINANCED_STOCK")) return "Stock aging";
  if (code.startsWith("DELAYED_APPROVAL")) return "Approvals";
  if (code.startsWith("FACILITY_")) return "Facility & limit";
  return "Other";
}

function severityClass(sev: string) {
  const s = sev.toLowerCase();
  if (s === "high") return "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30";
  if (s === "medium") return "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30";
  return "border-border bg-surface-subtle";
}

export function FinancierRiskPanelPage() {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const d = await financierPortalApi.alerts();
        setItems(d.items ?? []);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
  }, []);

  const summary = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of items) {
      const c = categoryForCode(a.code);
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const byCategory = useMemo(() => {
    const m = new Map<string, AlertItem[]>();
    for (const a of items) {
      const c = categoryForCode(a.code);
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(a);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  if (err) return <PortalErrorState message={err} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Risk signal panel</h1>
        <p className="mt-1 text-xs text-text-muted">
          Same feed as Alerts, grouped for bank-style monitoring: delays, stock aging, facility limits, and repayments.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {summary.map(([label, n]) => (
          <div key={label} className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs">
            <span className="font-semibold text-text-primary">{n}</span>
            <span className="ml-1 text-text-muted">{label}</span>
          </div>
        ))}
        {summary.length === 0 ? <p className="text-sm text-text-muted">No active signals.</p> : null}
      </div>
      {byCategory.map(([cat, alerts]) => (
        <section key={cat}>
          <h2 className="mb-2 text-sm font-semibold text-text-primary">{cat}</h2>
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={`${a.code}-${i}`} className={`rounded-lg border p-3 text-sm ${severityClass(a.severity)}`}>
                <p className="font-medium text-text-primary">{a.title}</p>
                <p className="text-[10px] uppercase text-text-muted">
                  {a.code} · {a.severity}
                </p>
                <p className="mt-1 text-xs text-text-muted">{a.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
