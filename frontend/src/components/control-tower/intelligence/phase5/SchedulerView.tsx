import { useState } from "react";

import type { SchedulerConvertResponse, SchedulerJob, SchedulerParams, SchedulerPreviewResponse } from "@/api/mfgAdvancedPlanning";
import { RowActionsMenu, type RowActionItem } from "@/components/app/RowActionsMenu";
import { useMfgSchedulerPreview } from "@/hooks/useMfgAdvancedPlanning";

import { formatDate, formatDecimal } from "../formatDecimal";
import { Chip, PanelCard } from "../IntelligenceUi";
import type { MfgTabId } from "../phase2/phase2Logic";
import { EmptyState, ErrorBox, ErrorList, NoticeBox, TextField, primaryBtn, secondaryBtn } from "../phase2/Phase2Ui";
import { DetailDrawer } from "../phase3/Phase3Ui";
import { ConvertProposalDialog } from "./ConvertProposalDialog";
import {
  ACTION_LABEL,
  JOB_STATUS_LABEL,
  MAX_EXCLUDE,
  alternativeText,
  formatMinutes,
  jobLabel,
  jobReasonLabel,
  jobStatusTone,
  kpiRows,
  noticeText,
  toggleExclude,
  whyThisLine,
} from "./phase5Logic";

const ADVISORY = new Set(["OVERTIME_WOULD_RECOVER", "FIRM_RESCHEDULE_SUGGESTED", "TENTATIVE_DISPLACED"]);

function delayError(label: string, raw: string): string {
  const s = raw.trim() || "0";
  return /^\d+$/.test(s) && Number(s) <= 60 ? "" : `${label} must be a whole number from 0 to 60.`;
}

/**
 * Scheduler preview (proposal only) with one Actions menu per job: "Why this line" and Exclude / Include (which re-runs
 * the preview with exclude_job_ids). "Create plan revision" sends the whole proposal to Plan changes for approval.
 */
export function SchedulerView({
  horizonDays,
  factoryUnit,
  canPropose,
  onOpenTab,
}: {
  horizonDays: number;
  factoryUnit?: string;
  canPropose: boolean;
  onOpenTab?: (tab: MfgTabId) => void;
}) {
  const [matDelay, setMatDelay] = useState("0");
  const [btbDelay, setBtbDelay] = useState("0");
  const [touched, setTouched] = useState(false);
  const [params, setParams] = useState<SchedulerParams | null>(null);
  const [openActions, setOpenActions] = useState<string | number | null>(null);
  const [why, setWhy] = useState<SchedulerJob | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [created, setCreated] = useState<SchedulerConvertResponse | null>(null);
  const [staleMsg, setStaleMsg] = useState("");
  const preview = useMfgSchedulerPreview(params);

  const errors = [delayError("Material delay", matDelay), delayError("BTB LC delay", btbDelay)].filter(Boolean);

  const run = () => {
    setTouched(true);
    if (errors.length) return;
    setCreated(null);
    setStaleMsg("");
    setParams({
      horizon_days: horizonDays,
      factory_unit: factoryUnit?.trim() || null,
      material_delay_days: Number(matDelay.trim() || "0"),
      btb_delay_days: Number(btbDelay.trim() || "0"),
      exclude_job_ids: params?.exclude_job_ids ?? [],
    });
  };

  const setExcluded = (ids: string[]) => {
    if (!params) return;
    setCreated(null);
    setStaleMsg("");
    setParams({ ...params, exclude_job_ids: ids });
  };

  const data = preview.data;
  const excluded = params?.exclude_job_ids ?? [];
  const lineCode = (id: number) => data?.lines.find((l) => l.line_id === id)?.line_code ?? `Line #${id}`;

  const rowActions = (j: SchedulerJob): RowActionItem[] => {
    const isExcluded = excluded.includes(j.job_id);
    return [
      { key: "why", label: "Why this line", onClick: () => setWhy(j) },
      isExcluded
        ? { key: "include", label: "Include", onClick: () => setExcluded(toggleExclude(excluded, j.job_id)) }
        : {
            key: "exclude",
            label: "Exclude",
            disabled: excluded.length >= MAX_EXCLUDE,
            onClick: () => setExcluded(toggleExclude(excluded, j.job_id)),
          },
    ];
  };

  return (
    <div className="space-y-3">
      <PanelCard
        testId="mfg-scheduler"
        title="Scheduler"
        subtitle="Suggests lines and dates for soft-booked and not-yet-booked confirmed orders after the frozen zone. Firm bookings never move."
        loading={preview.loading}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <TextField id="mfg-sch-mat" label="Material delay (days)" inputMode="numeric" value={matDelay} onChange={setMatDelay} hint="0-60, what-if late material" />
          </div>
          <div className="w-40">
            <TextField id="mfg-sch-btb" label="BTB LC delay (days)" inputMode="numeric" value={btbDelay} onChange={setBtbDelay} hint="0-60, what-if late BTB LC" />
          </div>
          <button type="button" className={primaryBtn} onClick={run} disabled={preview.loading}>
            {params ? "Run preview again" : "Run preview"}
          </button>
        </div>
        <p className="text-[11px] text-text-muted">Uses planned efficiency, the horizon and factory unit chosen above, and base capacity only (no overtime).</p>
        {touched ? <ErrorList errors={errors} /> : null}
        <ErrorBox message={preview.error} testId="mfg-scheduler-error" />
        {staleMsg ? <NoticeBox tone="warn">{staleMsg}</NoticeBox> : null}
        {created ? (
          <div role="status" data-testid="mfg-convert-done" className="space-y-2 rounded border border-green-200 bg-green-50 p-2 text-xs text-green-900">
            <p>
              {created.scheduler?.replay
                ? `This proposal was already sent: plan revision ${created.revision_no ?? `#${created.id}`} (nothing new created).`
                : `Plan revision ${created.revision_no ?? `#${created.id}`} created. It waits for approval in Plan changes.`}
            </p>
            {onOpenTab ? (
              <button type="button" className={secondaryBtn} onClick={() => onOpenTab("plan")}>
                Open Plan changes
              </button>
            ) : null}
          </div>
        ) : null}
        {!params && !preview.loading ? <EmptyState>Click Run preview to see the proposal. Nothing is changed by a preview.</EmptyState> : null}
        {data ? (
          <SchedulerResults
            data={data}
            excluded={excluded}
            openActions={openActions}
            onOpenActions={setOpenActions}
            rowActions={rowActions}
            lineCode={lineCode}
            onIncludeAll={() => setExcluded([])}
            canPropose={canPropose}
            onCreate={() => setDialogOpen(true)}
          />
        ) : null}
      </PanelCard>

      <DetailDrawer open={why != null} title={why ? `Why this line: ${jobLabel(why)}` : ""} description="How the scheduler chose the line and dates." onClose={() => setWhy(null)}>
        {why ? <WhyPanel job={why} lineCode={lineCode} /> : null}
      </DetailDrawer>

      {dialogOpen && data && params ? (
        <ConvertProposalDialog
          params={params}
          proposalHash={data.proposal_hash}
          itemCount={data.items.length}
          onClose={() => setDialogOpen(false)}
          onDone={(rev) => {
            setDialogOpen(false);
            setCreated(rev);
          }}
          onStale={(msg) => {
            setDialogOpen(false);
            setStaleMsg(msg);
            preview.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function SchedulerResults({
  data,
  excluded,
  openActions,
  onOpenActions,
  rowActions,
  lineCode,
  onIncludeAll,
  canPropose,
  onCreate,
}: {
  data: SchedulerPreviewResponse;
  excluded: string[];
  openActions: string | number | null;
  onOpenActions: (id: string | number | null) => void;
  rowActions: (j: SchedulerJob) => RowActionItem[];
  lineCode: (id: number) => string;
  onIncludeAll: () => void;
  canPropose: boolean;
  onCreate: () => void;
}) {
  const kpis = kpiRows(data.kpis.before, data.kpis.after);
  const itemCount = data.items.length;
  return (
    <div className="space-y-3 text-xs">
      <div role="note" data-testid="mfg-proposal-banner" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
        Proposal only - needs approval. Nothing changes until a plan revision is approved in Plan changes.
      </div>
      <p className="text-text-muted">
        {formatDate(data.date_from)} – {formatDate(data.date_to)} · frozen zone until <strong>{formatDate(data.frozen_end)}</strong>
        {data.settings.frozen_horizon_days != null ? ` (${data.settings.frozen_horizon_days} days)` : ""}
        {data.settings.changeover_loss_pct != null ? ` · changeover loss ${data.settings.changeover_loss_pct}% of the first day` : ""} ·{" "}
        {data.counts.candidate_lines ?? data.lines.length} line(s)
      </p>

      {kpis.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-[20rem]" data-testid="mfg-scheduler-kpis">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="py-1 pr-3 font-medium">Measure</th>
                <th className="py-1 pr-3 text-right font-medium">Now</th>
                <th className="py-1 pr-3 text-right font-medium">With proposal</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((k) => (
                <tr key={k.key} className="border-b border-border/60">
                  <td className="py-1 pr-3">{k.label}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{k.before}</td>
                  <td className={`py-1 pr-3 text-right tabular-nums ${k.trend === "better" ? "text-green-800" : k.trend === "worse" ? "text-red-700" : ""}`}>
                    {k.after}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data.firm_reschedule_suggested.length ? (
        <div role="note" data-testid="mfg-firm-reschedule" className="rounded border border-blue-200 bg-blue-50 p-2 text-blue-950">
          <p className="font-semibold">For information: firm bookings that will be late</p>
          <p>The scheduler never moves firm bookings. Consider changing them by hand in Plan changes.</p>
          <ul className="mt-1 list-disc pl-5">
            {data.firm_reschedule_suggested.map((f) => (
              <li key={f.config_id}>
                {f.order_code ?? `Order #${f.order_id}`} on {lineCode(f.line_id)}: ends {formatDate(f.end_date)}, ex-factory {formatDate(f.need_by)} (
                {f.lateness_days} day(s) late)
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {excluded.length ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="mfg-scheduler-excluded">
          <Chip tone="warn">{`${excluded.length} job(s) excluded - kept where they are`}</Chip>
          <button type="button" className="text-xs font-medium text-brand-primary underline" onClick={onIncludeAll}>
            Include all
          </button>
        </div>
      ) : null}

      {data.jobs.length === 0 ? (
        <EmptyState>No movable work in this horizon: nothing to schedule.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full" data-testid="mfg-scheduler-jobs">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="py-1 pr-2 font-medium">Order / job</th>
                <th className="py-1 pr-2 text-right font-medium">Qty</th>
                <th className="py-1 pr-2 font-medium">Ex-factory</th>
                <th className="py-1 pr-2 font-medium">Now</th>
                <th className="py-1 pr-2 font-medium">Proposed</th>
                <th className="py-1 pr-2 font-medium">Result</th>
                <th className="py-1 pr-2 font-medium">Notes</th>
                <th className="py-1 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((j) => (
                <tr key={j.job_id} className="border-b border-border/60 align-top" data-testid={`mfg-job-${j.job_id}`}>
                  <td className="py-1 pr-2">
                    <div className="font-medium text-text-primary">{jobLabel(j)}</div>
                    {j.family ? <div className="text-[10px] text-text-muted">{j.family}</div> : null}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {formatDecimal(j.qty)}
                    <div className="text-[10px] text-text-muted">{formatMinutes(j.minutes)}</div>
                  </td>
                  <td className="py-1 pr-2 whitespace-nowrap">{formatDate(j.need_by)}</td>
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {j.current ? `${lineCode(j.current.line_id)} · ${formatDate(j.current.start_date)}` : "Not booked"}
                  </td>
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {j.placement ? (
                      <>
                        {j.placement.line_code} · {formatDate(j.placement.start_date)} – {formatDate(j.placement.end_date)}
                        {j.action ? <div className="text-[10px] text-text-muted">{ACTION_LABEL[j.action] ?? j.action}</div> : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-1 pr-2">
                    <Chip tone={jobStatusTone(j.status)}>{JOB_STATUS_LABEL[j.status] ?? j.status}</Chip>
                    {j.placement && j.placement.lateness_days > 0 ? <div className="mt-0.5 text-[10px] text-red-700">{j.placement.lateness_days} day(s) late</div> : null}
                  </td>
                  <td className="py-1 pr-2">
                    <span className="inline-flex flex-wrap gap-1">
                      {j.reason_codes.map((c) => (
                        <Chip key={c} tone={ADVISORY.has(c) ? "info" : "neutral"}>
                          {c === "OVERTIME_WOULD_RECOVER" && j.overtime_would_recover_minutes
                            ? `${jobReasonLabel(c)}: ${formatMinutes(j.overtime_would_recover_minutes)}`
                            : jobReasonLabel(c)}
                        </Chip>
                      ))}
                    </span>
                  </td>
                  <td className="py-1 text-right">
                    <RowActionsMenu rowId={`job-${j.job_id}`} openId={openActions} onOpenChange={onOpenActions} items={rowActions(j)} menuPortal />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(data.counts.jobs_total ?? 0) > data.jobs.length ? (
        <p className="text-text-muted">
          Showing {data.jobs.length} of {data.counts.jobs_total} jobs.
        </p>
      ) : null}

      {data.notices.length ? (
        <ul className="list-disc pl-5 text-[11px] text-text-muted">
          {data.notices.map((n) => (
            <li key={n}>{noticeText(n)}</li>
          ))}
        </ul>
      ) : null}
      {data.assumptions.length ? (
        <details className="text-[11px] text-text-muted">
          <summary className="cursor-pointer text-text-secondary">Assumptions ({data.assumptions.length})</summary>
          <ul className="mt-1 list-disc pl-5">
            {data.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
        {canPropose ? (
          <button type="button" className={primaryBtn} disabled={itemCount === 0} onClick={onCreate}>
            Create plan revision
          </button>
        ) : (
          <p className="text-text-muted">Creating a plan revision needs the plan write permission.</p>
        )}
        <span className="text-text-muted">
          {itemCount === 0 ? "No changes proposed." : `${itemCount} change(s) in this proposal (all are sent together).`}
        </span>
      </div>
    </div>
  );
}

function WhyPanel({ job, lineCode }: { job: SchedulerJob; lineCode: (id: number) => string }) {
  return (
    <div className="space-y-3 text-sm text-text-secondary" data-testid="mfg-why-panel">
      <ul className="list-disc space-y-1 pl-5">
        {whyThisLine(job, lineCode).map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {job.overtime_would_recover_minutes ? (
        <NoticeBox>
          For information: about {formatMinutes(job.overtime_would_recover_minutes)} of overtime would recover the delay. The proposal itself
          never adds overtime.
        </NoticeBox>
      ) : null}
      {job.tentative_displaced.length ? (
        <p className="text-xs">Overlaps tentative booking(s) {job.tentative_displaced.map((id) => `#${id}`).join(", ")} (not blocking).</p>
      ) : null}
      <div>
        <h4 className="text-xs font-semibold text-text-primary">Other lines considered</h4>
        {job.alternatives.length ? (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
            {job.alternatives.map((a) => (
              <li key={`${a.line_id}-${a.start_date}`}>{alternativeText(a)}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-text-muted">No other line was possible.</p>
        )}
      </div>
    </div>
  );
}
