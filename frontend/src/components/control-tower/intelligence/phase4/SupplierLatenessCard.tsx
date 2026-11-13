import { useState } from "react";

import type { LatenessGroup } from "@/api/mfgPredictive";
import { useMfgSupplierLateness } from "@/hooks/useMfgPredictive";

import { formatDate, formatPercent } from "../formatDecimal";
import { Chip, PanelCard, Stat } from "../IntelligenceUi";
import { EmptyState, NoticeBox, secondaryBtn, SelectField } from "../phase2/Phase2Ui";
import { ratioToPercentText } from "../phase3/phase3Logic";
import { humanizeCode, warningLabel } from "../reasonLabels";
import { loadErrorText } from "./phase4Logic";

type View = "vendors" | "categories" | "vendor_categories";

function days(v: number | null): string {
  return v == null ? "—" : `${v} d`;
}

function onTime(g: LatenessGroup): string {
  const p = ratioToPercentText(g.on_time_rate);
  return p == null ? "—" : formatPercent(p, 0);
}

/** Supplier lateness percentiles (days after the promised PO date). Needs inventory read access. */
export function SupplierLatenessCard() {
  const res = useMfgSupplierLateness(true);
  const [view, setView] = useState<View>("vendors");
  const data = res.data;

  if (res.errorStatus === 403) {
    return (
      <div data-testid="mfg-supplier-lateness-denied">
        <NoticeBox>Supplier lateness is shown only to users with inventory read access. Ask an admin if you need it.</NoticeBox>
      </div>
    );
  }

  const rows: { key: string; name: string; g: LatenessGroup }[] = !data
    ? []
    : view === "vendors"
      ? data.vendors.map((v) => ({ key: `v${v.vendor_id}`, name: v.vendor_name ?? `Supplier #${v.vendor_id}`, g: v }))
      : view === "categories"
        ? data.categories.map((c) => ({ key: `c${c.category_id}`, name: c.category_name ?? `Category #${c.category_id}`, g: c }))
        : data.vendor_categories.map((vc) => ({
            key: `vc${vc.vendor_id}-${vc.category_id}`,
            name: `${vc.vendor_name ?? `Supplier #${vc.vendor_id ?? "?"}`} · ${vc.category_name ?? `Category #${vc.category_id ?? "?"}`}`,
            g: vc,
          }));

  return (
    <PanelCard
      testId="mfg-supplier-lateness"
      title="Supplier lateness"
      subtitle="How many days after the promised purchase-order date material arrives in full, from the last year of receipts."
      loading={res.loading}
      error={res.error ? loadErrorText(res.errorStatus, res.error, "Supplier lateness") : ""}
    >
      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <Stat label="PO lines measured" value={data.tenant.n} />
            <Stat label="Likely delay (P50)" value={days(data.tenant.p50_days)} />
            <Stat label="Safe allowance (P80)" value={days(data.tenant.p80_days)} />
            <Stat label="Worst case (P90)" value={days(data.tenant.p90_days)} />
            <Stat label="On time" value={onTime(data.tenant)} />
          </div>
          <p className="text-[11px] text-text-muted">
            Promise = {humanizeCode(data.promise_basis).toLowerCase()} · as of {formatDate(data.as_of)} · a group needs at least {data.min_sample} lines,
            otherwise the next wider group is used.
            {Object.keys(data.excluded).length
              ? ` Left out: ${Object.entries(data.excluded)
                  .map(([k, v]) => `${humanizeCode(k).toLowerCase()} ${v}`)
                  .join(", ")}.`
              : ""}
          </p>
          {data.truncated ? <p className="text-[11px] text-amber-900">Only the newest purchase-order lines were read.</p> : null}
          {data.notices.map((n) => (
            <p key={n} className="text-[11px] text-text-muted">
              {warningLabel(n)}
            </p>
          ))}
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              id="mfg-lateness-view"
              label="Group by"
              value={view === "vendors" ? "" : view}
              placeholder="Supplier"
              onChange={(v) => setView((v || "vendors") as View)}
              options={[
                { value: "categories", label: "Material category" },
                { value: "vendor_categories", label: "Supplier + category" },
              ]}
            />
            <button type="button" className={secondaryBtn} onClick={res.reload}>
              Reload
            </button>
          </div>
          {rows.length === 0 ? <EmptyState>No groups with measured purchase-order lines.</EmptyState> : null}
          {rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs" aria-label="Supplier lateness">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted">
                    <th className="px-2 py-1 font-medium">Group</th>
                    <th className="px-2 py-1 text-right font-medium">Lines</th>
                    <th className="px-2 py-1 text-right font-medium">Likely (P50)</th>
                    <th className="px-2 py-1 text-right font-medium">Safe (P80)</th>
                    <th className="px-2 py-1 text-right font-medium">Worst (P90)</th>
                    <th className="px-2 py-1 text-right font-medium">On time</th>
                    <th className="px-2 py-1 text-right font-medium" title="Open lines already past the promise (at least this late)">
                      Open & late
                    </th>
                    <th className="px-2 py-1 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-b border-border/60">
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1 text-right">{r.g.n}</td>
                      <td className="px-2 py-1 text-right">{days(r.g.p50_days)}</td>
                      <td className="px-2 py-1 text-right">{days(r.g.p80_days)}</td>
                      <td className="px-2 py-1 text-right">{days(r.g.p90_days)}</td>
                      <td className="px-2 py-1 text-right">{onTime(r.g)}</td>
                      <td className="px-2 py-1 text-right">{r.g.open_late_lower_bound}</td>
                      <td className="px-2 py-1">
                        <Chip tone={r.g.sufficient ? "good" : "warn"}>{r.g.sufficient ? "Enough data" : "Too few lines"}</Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </PanelCard>
  );
}
