/**
 * Bangladesh RMG setup ("Configure for Bangladesh"): adds the official 2023 Gazette wage grades,
 * designations, salary structures, leave types and labour-law settings. Add-only and safe to run again:
 * existing or edited records are never overwritten.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { hrBangladeshApi, type BdApplyResult, type BdPresetItem } from "@/api/hrBangladesh";
import { KitTable } from "@/components/hr/bd/BdKitTable";
import { Badge, Banner, Card, Messages, btnPrimary, btnSecondary } from "@/components/hr/bd/BdUi";
import { useAction, useLoad } from "@/components/hr/bd/bdHooks";
import { EmployeeNumberFormatCard } from "@/components/hr/bd/EmployeeNumberFormatCard";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

const AREA_LABELS: Record<string, string> = {
  designations: "Designations",
  structures: "Salary structures",
  components: "Pay components",
  leave: "Leave types",
  settings: "HR settings",
  locale: "Country / time zone / currency",
};

const STATE_TONE = { missing: "amber", matched: "green", edited: "blue", conflict: "red" } as const;
const STATE_LABEL = { missing: "Will be added", matched: "Present", edited: "Present (edited by you)", conflict: "Conflict" };

const CAP_TONE = { configured: "green", enforced: "green", preview_only: "blue", conflict: "red", unsupported: "gray" } as const;
const CAP_LABEL = {
  configured: "Configured",
  enforced: "Enforced",
  preview_only: "Preview only",
  conflict: "Conflict",
  unsupported: "Not automated yet",
};

export function HrBangladeshSetupPage() {
  const status = useLoad(() => hrBangladeshApi.bdPresetStatus(), []);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<BdApplyResult | null>(null);
  const [areaFilter, setAreaFilter] = useState("");
  const { busy, error, notice, run } = useAction();

  const data = result?.status ?? status.data;
  const items = useMemo(
    () => (data?.items ?? []).filter((i) => !areaFilter || i.area === areaFilter || (areaFilter === "conflict" && i.state === "conflict")),
    [data, areaFilter],
  );
  const areas = useMemo(() => Array.from(new Set((data?.items ?? []).map((i) => i.area))), [data]);

  const apply = () =>
    void run(async () => {
      const r = await hrBangladeshApi.bdPresetApply();
      setResult(r);
      setConfirming(false);
      await status.reload();
    }, "Bangladesh setup applied.");

  const counts = data?.counts ?? { missing: 0, matched: 0, edited: 0, conflict: 0 };
  const gazette = data?.catalog.wage_gazette ?? {};

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Bangladesh setup"
        description="Configure HR for the Bangladesh garments (RMG) industry: official minimum wage grades, designations, salary structures, leave and labour-law settings."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Bangladesh setup" }]}
      />
      <Messages error={error || status.error} notice={notice} />

      {status.loading && !data ? <div className="text-sm text-text-muted">Loading...</div> : null}

      {data ? (
        <>
          <Card
            title="Configure for Bangladesh"
            description="Adds only what is missing. Records you already have or have edited are kept as they are. You can edit every amount afterwards."
            actions={
              data.can_apply ? (
                <button type="button" className={btnPrimary} disabled={busy || data.complete} onClick={() => setConfirming(true)}>
                  {data.complete ? "Already configured" : "Configure for Bangladesh"}
                </button>
              ) : (
                <span className="text-xs text-text-muted">Needs manager / admin or “hr.payroll.manage”.</span>
              )
            }
          >
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge tone="amber">{counts.missing} to add</Badge>
              <Badge tone="green">{counts.matched} present</Badge>
              <Badge tone="blue">{counts.edited} edited by you</Badge>
              <Badge tone={counts.conflict ? "red" : "gray"}>{counts.conflict} conflicts</Badge>
              {data.marker ? (
                <span className="text-xs text-text-muted">
                  Last applied {String(data.marker.applied_at ?? "").slice(0, 10)} (catalog {String(data.marker.catalog_version ?? "")})
                </span>
              ) : null}
            </div>
            {confirming ? (
              <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p>
                  This adds {counts.missing} record(s): wage grades and designations from the 2023 Gazette, salary structures (basic, house rent
                  50%, medical 750, transport 450, food 1,250), casual / sick / earned / maternity leave types, Friday weekend and overtime at
                  2 × basic ÷ 208. Every new employee will also need a mobile number and an NID or birth registration number.
                </p>
                {counts.conflict ? <p>{counts.conflict} conflict(s) are skipped; review them in the list below.</p> : null}
                <div className="flex gap-2">
                  <button type="button" className={btnPrimary} disabled={busy} onClick={apply}>
                    {busy ? "Applying..." : "Yes, apply"}
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
            {result ? (
              <Banner kind="success">
                Created {result.created.length} record(s), {result.skipped_count} already present
                {result.conflicts.length ? `, ${result.conflicts.length} conflict(s) skipped` : ""}.
              </Banner>
            ) : null}
          </Card>

          <Card title="What Prime7 does with each rule" description="Rules marked 'Preview only' calculate and show results but do not change payroll until you approve a rule set and turn enforcement on.">
            <div className="grid gap-2 sm:grid-cols-2">
              {data.capabilities.map((c) => (
                <div key={c.area} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="text-text-secondary">{c.label}</span>
                  <Badge tone={CAP_TONE[c.state]}>{CAP_LABEL[c.state]}</Badge>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to={`${PREFIX}/bangladesh-rules`} className={btnSecondary}>
                Open rules, previews and enforcement
              </Link>
              <Link to={`${PREFIX}/payroll/salary-structures`} className={btnSecondary}>
                Edit salary structures
              </Link>
            </div>
          </Card>

          <Card
            title="Setup items"
            description="Each Gazette grade, designation, leave type and setting, and whether your company already has it."
            actions={
              <select aria-label="Filter by area" className="rounded border border-border-strong px-2 py-1 text-sm" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
                <option value="">All areas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {AREA_LABELS[a] ?? a}
                  </option>
                ))}
                <option value="conflict">Conflicts only</option>
              </select>
            }
          >
            <KitTable<BdPresetItem>
              rows={items}
              rowKey={(r) => `${r.area}-${r.code}`}
              empty="Nothing to show."
              searchPlaceholder="Search area, code or name…"
              defaultPageSize={50}
              columns={[
                { header: "Area", cell: (r) => AREA_LABELS[r.area] ?? r.area, value: (r) => AREA_LABELS[r.area] ?? r.area },
                { header: "Code", cell: (r) => <span className="font-mono text-xs">{r.code}</span>, value: (r) => r.code },
                { header: "Name", cell: (r) => r.label, value: (r) => r.label },
                { header: "Status", cell: (r) => <Badge tone={STATE_TONE[r.state]}>{STATE_LABEL[r.state]}</Badge>, value: (r) => STATE_LABEL[r.state] },
                { header: "Detail", cell: (r) => <span className="text-xs text-text-muted">{r.detail}</span>, value: (r) => r.detail, hideOnMobile: true },
              ]}
            />
          </Card>

          <Card title="Official sources" description={`Catalog ${data.catalog.catalog_version}. Amounts are copied from the official Gazette; check them against your own legal advice.`}>
            <ul className="list-disc space-y-1 pl-5 text-sm text-text-secondary">
              <li>
                {gazette.title}: notification {gazette.notification_no}, published {gazette.published}, effective {gazette.effective_from}.{" "}
                {gazette.url ? (
                  <a href={gazette.url} target="_blank" rel="noreferrer" className="text-brand-primary underline">
                    Gazette PDF
                  </a>
                ) : null}
              </li>
              <li>
                {data.catalog.labour_act.title}.{" "}
                <a href={data.catalog.labour_act.url} target="_blank" rel="noreferrer" className="text-brand-primary underline">
                  bdlaws
                </a>
              </li>
              <li>
                {data.catalog.privacy_act.title}.{" "}
                <a href={data.catalog.privacy_act.url} target="_blank" rel="noreferrer" className="text-brand-primary underline">
                  bdlaws
                </a>
              </li>
            </ul>
            {data.catalog.pending_sources.length ? (
              <Banner kind="warning">Still being verified (not automated): {data.catalog.pending_sources.join("; ")}.</Banner>
            ) : null}
          </Card>
        </>
      ) : null}

      <EmployeeNumberFormatCard />
    </div>
  );
}
