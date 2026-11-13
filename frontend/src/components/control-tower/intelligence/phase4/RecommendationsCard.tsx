import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  mfgPredictiveApi,
  type Recommendation,
  type RecommendationDecision,
  type RecommendationStatusFilter,
} from "@/api/mfgPredictive";
import { RowActionsMenu, type RowActionItem } from "@/components/app/RowActionsMenu";
import { useMfgRecommendations } from "@/hooks/useMfgPredictive";
import { logApiError } from "@/utils/logApiError";

import { formatDate } from "../formatDecimal";
import { Chip, PanelCard, ReasonChips } from "../IntelligenceUi";
import { ConfirmDialog, EmptyState, NoticeBox, primaryBtn, secondaryBtn, SelectField } from "../phase2/Phase2Ui";
import { errorStatus, type MfgTabId } from "../phase2/phase2Logic";
import { DetailDrawer, KeyValues } from "../phase3/Phase3Ui";
import { warningLabel } from "../reasonLabels";
import { ExplainButton } from "./ExplainButton";
import {
  actionError,
  canDecide,
  confidenceLabel,
  confidenceTone,
  DECISION_LABEL,
  DECISION_NOTE_MAX,
  decisionNoteError,
  decisionTone,
  departmentLabel,
  findingDetails,
  KIND_LABEL,
  kindLabel,
  loadErrorText,
  OUTCOME_LABEL,
  REJECT_NOTE_MIN,
  screenForFinding,
  screenFromHref,
  severityLabel,
  severityTone,
  toDecisionInput,
  type ScreenLink,
} from "./phase4Logic";

type Props = {
  /** mfg_predictive_ai_text_v1: show the Explain button. */
  aiText: boolean;
  /** mfg_integrated_planning_v1: "Open screen" goes to the Plan changes tab. */
  integratedOn: boolean;
  /** Deep link `?finding=<id>`: open this finding's details once the list has loaded. */
  focusFindingId?: number | null;
  onShowForecast?: (orderId: number) => void;
  onOpenTab?: (tab: MfgTabId) => void;
};

function noticeText(raw: string): string {
  if (raw.startsWith("HIDDEN_KINDS_NO_SOURCE_ACCESS")) {
    const kinds = raw.split(":")[1]?.split(",").map((k) => KIND_LABEL[k.trim()] ?? k.trim()) ?? [];
    return `${kinds.join(", ") || "Some"} findings are hidden because they need inventory read access.`;
  }
  return warningLabel(raw);
}

/** Bottlenecks and recommendations found by the daily job. Accept / Reject only records a decision. */
export function RecommendationsCard({ aiText, integratedOn, focusFindingId = null, onShowForecast, onOpenTab }: Props) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<RecommendationStatusFilter>("OPEN");
  const [kind, setKind] = useState("");
  const [openActions, setOpenActions] = useState<string | number | null>(null);
  const [detail, setDetail] = useState<Recommendation | null>(null);
  const [confirm, setConfirm] = useState<{ rec: Recommendation; decision: RecommendationDecision } | null>(null);
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [done, setDone] = useState("");
  const [doneLink, setDoneLink] = useState<ScreenLink | null>(null);
  const [decided, setDecided] = useState<Record<number, string>>({});
  const [focusMissing, setFocusMissing] = useState(false);
  const focusHandled = useRef(focusFindingId == null);
  const focusWidened = useRef(false);

  const list = useMfgRecommendations({ status, kind: kind || undefined }, true);
  const data = list.data;

  useEffect(() => {
    if (focusHandled.current || !data || list.loading || (data.status && data.status !== status)) return;
    const hit = data.items.find((r) => r.id === focusFindingId);
    if (hit) {
      focusHandled.current = true;
      setDetail(hit);
      return;
    }
    if (!focusWidened.current && status !== "ALL") {
      focusWidened.current = true;
      setStatus("ALL");
      return;
    }
    focusHandled.current = true;
    setFocusMissing(true);
  }, [data, list.loading, focusFindingId, status]);

  const decisionOf = (r: Recommendation) => decided[r.id] ?? r.decision_status;
  const decidable = (r: Recommendation) => canDecide({ status: r.status, decision_status: decisionOf(r) });

  const openScreen = (link: ScreenLink) => {
    setDetail(null);
    if (link.tab) onOpenTab?.(link.tab);
    else if (link.href) navigate(link.href);
  };

  const submitDecision = async (note: string) => {
    if (!confirm || pending) return;
    const err = decisionNoteError(confirm.decision, note);
    if (err) {
      setDialogError(err);
      return;
    }
    setPending(true);
    setDialogError("");
    const { rec, decision } = confirm;
    try {
      const res = await mfgPredictiveApi.decideRecommendation(rec.id, { decision: toDecisionInput(decision), ...(note ? { note } : {}) });
      const stored = String(res.decision ?? res.decision_status ?? decision).toUpperCase();
      setDecided((prev) => ({ ...prev, [rec.id]: stored }));
      setDone(
        stored !== decision || res.replayed === true
          ? `This finding already had a decision (${DECISION_LABEL[stored] ?? stored}). Nothing new was recorded.`
          : `Decision recorded: ${DECISION_LABEL[stored] ?? stored}. Nothing else was changed - open the matching screen to act.`,
      );
      const next = res.next_step?.href ? screenFromHref(res.next_step.href, res.next_step.label) : null;
      setDoneLink(next ?? (stored === "ACCEPTED" ? screenForFinding(rec, integratedOn) : null));
      setConfirm(null);
      list.reload();
    } catch (e) {
      logApiError("RecommendationsCard.decide", e);
      setDialogError(actionError(e, "record this decision"));
      if (errorStatus(e) === 409) list.reload();
    } finally {
      setPending(false);
    }
  };

  const askDecision = (rec: Recommendation, decision: RecommendationDecision) => {
    setDialogError("");
    setDone("");
    setDoneLink(null);
    setConfirm({ rec, decision });
  };

  const rowActions = (r: Recommendation): RowActionItem[] => {
    const link = screenForFinding(r, integratedOn);
    const items: RowActionItem[] = [{ key: "view", label: "View details", onClick: () => setDetail(r) }];
    if (decidable(r)) {
      items.push({ key: "accept", label: "Accept…", onClick: () => askDecision(r, "ACCEPTED") });
      items.push({ key: "reject", label: "Reject…", onClick: () => askDecision(r, "REJECTED"), danger: true });
    }
    if (r.order_id != null && onShowForecast) items.push({ key: "forecast", label: "Delivery forecast", onClick: () => onShowForecast(r.order_id!) });
    items.push({ key: "open", label: link.label, onClick: () => openScreen(link) });
    return items;
  };

  return (
    <PanelCard
      testId="mfg-recommendations"
      title="Bottlenecks and recommendations"
      subtitle="Found once a day from your own data. Accept or Reject only records your decision; it never changes plans, purchase orders or stock."
      loading={list.loading}
      error={list.error ? loadErrorText(list.errorStatus, list.error, "Recommendations") : ""}
    >
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          id="mfg-rec-status"
          label="Show"
          value={status}
          placeholder="Open findings"
          onChange={(v) => setStatus((v || "OPEN") as RecommendationStatusFilter)}
          options={[
            { value: "CLEARED", label: "Cleared findings" },
            { value: "ALL", label: "All findings" },
          ]}
        />
        <SelectField
          id="mfg-rec-kind"
          label="Kind"
          value={kind}
          placeholder="All kinds"
          onChange={setKind}
          options={(data?.kinds ?? Object.keys(KIND_LABEL)).map((k) => ({ value: k, label: kindLabel(k) }))}
        />
        <button type="button" className={secondaryBtn} onClick={list.reload}>
          Reload
        </button>
      </div>

      {done ? (
        <NoticeBox tone="good">
          {done}
          {doneLink ? (
            <button type="button" className="ml-2 font-semibold underline" onClick={() => openScreen(doneLink)}>
              {doneLink.label}
            </button>
          ) : null}
        </NoticeBox>
      ) : null}
      {focusMissing ? (
        <NoticeBox tone="warn">The linked finding was not found. It may have been removed, or it needs access you do not have.</NoticeBox>
      ) : null}
      {data?.notices.length ? (
        <ul className="list-disc pl-5 text-[11px] text-text-muted">
          {data.notices.map((n) => (
            <li key={n}>{noticeText(n)}</li>
          ))}
        </ul>
      ) : null}
      {data?.truncated ? <p className="text-[11px] text-amber-900">Only the first {data.limit} findings are listed (highest priority first).</p> : null}

      {data && data.items.length === 0 ? (
        <EmptyState>{status === "OPEN" ? "No open bottlenecks right now." : "No findings match this filter."}</EmptyState>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs" aria-label="Bottlenecks and recommendations">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-2 py-1 font-medium">Severity</th>
                <th className="px-2 py-1 font-medium">Finding</th>
                <th className="px-2 py-1 font-medium">Deadline</th>
                <th className="px-2 py-1 font-medium">Confidence</th>
                <th className="px-2 py-1 font-medium">Impact</th>
                <th className="px-2 py-1 font-medium">Decision</th>
                <th className="px-2 py-1 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => {
                const d = findingDetails(r.payload);
                const dec = decisionOf(r);
                return (
                  <tr
                    key={r.id}
                    data-testid={`mfg-rec-${r.id}`}
                    className={`border-b border-border/60 align-top ${r.id === focusFindingId ? "bg-blue-50" : ""}`}
                  >
                    <td className="px-2 py-1">
                      <Chip tone={severityTone(r.severity)}>{severityLabel(r.severity)}</Chip>
                    </td>
                    <td className="px-2 py-1">
                      <div className="font-medium text-text-primary">{kindLabel(r.kind)}</div>
                      <div className="text-[11px] text-text-muted">
                        {[r.order_code, r.line_code].filter(Boolean).join(" · ") || "—"}
                        {r.status === "CLEARED" ? ` · cleared ${formatDate(r.cleared_on)}` : ""}
                      </div>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">{formatDate(r.deadline_date)}</td>
                    <td className="px-2 py-1">{d.confidence ? <Chip tone={confidenceTone(d.confidence)}>{confidenceLabel(d.confidence)}</Chip> : "—"}</td>
                    <td className="px-2 py-1 text-text-secondary">{d.summary ?? d.recommendation ?? "—"}</td>
                    <td className="px-2 py-1">
                      {dec ? <Chip tone={decisionTone(dec)}>{DECISION_LABEL[dec] ?? dec}</Chip> : <span className="text-text-muted">Not decided</span>}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <RowActionsMenu rowId={`rec-${r.id}`} openId={openActions} onOpenChange={setOpenActions} items={rowActions(r)} menuPortal />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {detail ? (
        <FindingDrawer
          rec={detail}
          decision={decisionOf(detail)}
          decidable={decidable(detail)}
          aiText={aiText}
          link={screenForFinding(detail, integratedOn)}
          onClose={() => setDetail(null)}
          onDecide={(decision) => askDecision(detail, decision)}
          onOpenScreen={openScreen}
          onShowForecast={
            detail.order_id != null && onShowForecast
              ? () => {
                  const id = detail.order_id!;
                  setDetail(null);
                  onShowForecast(id);
                }
              : undefined
          }
        />
      ) : null}

      <ConfirmDialog
        open={confirm != null}
        title={confirm?.decision === "REJECTED" ? "Reject this recommendation?" : "Accept this recommendation?"}
        confirmLabel={confirm?.decision === "REJECTED" ? "Reject" : "Accept"}
        danger={confirm?.decision === "REJECTED"}
        reasonLabel="Note"
        reasonMin={confirm?.decision === "REJECTED" ? REJECT_NOTE_MIN : 0}
        reasonPlaceholder={`At most ${DECISION_NOTE_MAX} characters`}
        pending={pending}
        error={dialogError}
        onConfirm={(note) => void submitDecision(note)}
        onClose={() => {
          if (!pending) setConfirm(null);
        }}
      >
        {confirm ? (
          <>
            <p>
              <strong>{kindLabel(confirm.rec.kind)}</strong>
              {confirm.rec.order_code ? ` · ${confirm.rec.order_code}` : ""}
              {confirm.rec.line_code ? ` · ${confirm.rec.line_code}` : ""}
            </p>
            <p>
              This only <strong>records your decision</strong>. It does not change plans, purchase orders, stock or anything else. To act, open the
              matching screen afterwards, where the normal approvals apply.
            </p>
          </>
        ) : null}
      </ConfirmDialog>
    </PanelCard>
  );
}

function FindingDrawer({
  rec,
  decision,
  decidable,
  aiText,
  link,
  onClose,
  onDecide,
  onOpenScreen,
  onShowForecast,
}: {
  rec: Recommendation;
  decision: string | null;
  decidable: boolean;
  aiText: boolean;
  link: ScreenLink;
  onClose: () => void;
  onDecide: (d: RecommendationDecision) => void;
  onOpenScreen: (link: ScreenLink) => void;
  onShowForecast?: () => void;
}) {
  const d = findingDetails(rec.payload);
  return (
    <DetailDrawer
      open
      title={`${kindLabel(rec.kind)}${rec.order_code ? ` · ${rec.order_code}` : ""}${rec.line_code ? ` · ${rec.line_code}` : ""}`}
      description="Statistical estimate from your own history - never changes plans."
      onClose={onClose}
    >
      <div className="flex flex-wrap gap-1">
        <Chip tone={severityTone(rec.severity)}>{severityLabel(rec.severity)}</Chip>
        {d.confidence ? <Chip tone={confidenceTone(d.confidence)}>{confidenceLabel(d.confidence)}</Chip> : null}
        <Chip tone={rec.status === "OPEN" ? "info" : "neutral"}>{rec.status === "OPEN" ? "Open" : "Cleared"}</Chip>
        {decision ? <Chip tone={decisionTone(decision)}>{DECISION_LABEL[decision] ?? decision}</Chip> : null}
        {rec.outcome_status ? <Chip tone={rec.outcome_status === "MET" ? "good" : "neutral"}>{OUTCOME_LABEL[rec.outcome_status] ?? rec.outcome_status}</Chip> : null}
      </div>
      {d.summary ? <p className="text-sm text-text-primary">{d.summary}</p> : null}

      <KeyValues
        rows={[
          { label: "Responsible department", value: departmentLabel(rec.department) },
          { label: "Deadline", value: formatDate(rec.deadline_date) },
          { label: "First found", value: formatDate(rec.first_detected_on) },
          { label: "Last found", value: formatDate(rec.last_detected_on) },
          { label: "Order", value: rec.order_code ?? "—" },
          { label: "Sewing line", value: rec.line_code ?? "—" },
          { label: "Approval needed", value: d.approval ?? "Normal approvals on the screen where you act" },
          { label: "Priority score", value: rec.priority, hint: "Severity x days affected x orders affected x confidence (no money)." },
        ]}
      />

      {d.recommendation ? (
        <section>
          <h3 className="text-xs font-semibold text-text-primary">Recommendation</h3>
          <p className="mt-1 text-sm text-text-secondary">{d.recommendation}</p>
        </section>
      ) : null}
      {d.facts.length || d.dates.length || d.other.length ? (
        <section>
          <h3 className="text-xs font-semibold text-text-primary">Supporting data</h3>
          <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            {[...d.facts, ...d.dates, ...d.other].map((r, i) => (
              <div key={`${r.label}-${i}`} className="flex justify-between gap-2 border-b border-border/50 py-1">
                <dt className="text-text-muted">{r.label}</dt>
                <dd className="text-right text-text-primary">{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {d.reasonCodes.length ? (
        <div>
          <ReasonChips codes={d.reasonCodes} />
        </div>
      ) : null}
      {d.alternatives.length ? (
        <section>
          <h3 className="text-xs font-semibold text-text-primary">Alternatives</h3>
          <ul className="mt-1 list-disc pl-5 text-xs text-text-secondary">
            {d.alternatives.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {d.assumptions.length ? (
        <section>
          <h3 className="text-xs font-semibold text-text-primary">Assumptions</h3>
          <ul className="mt-1 list-disc pl-5 text-xs text-text-muted">
            {d.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {aiText ? <ExplainButton subject="finding" recordId={rec.id} /> : null}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {decidable ? (
          <>
            <button type="button" className={primaryBtn} onClick={() => onDecide("ACCEPTED")}>
              Accept…
            </button>
            <button type="button" className={secondaryBtn} onClick={() => onDecide("REJECTED")}>
              Reject…
            </button>
          </>
        ) : null}
        {onShowForecast ? (
          <button type="button" className={secondaryBtn} onClick={onShowForecast}>
            Delivery forecast
          </button>
        ) : null}
        <button type="button" className={secondaryBtn} onClick={() => onOpenScreen(link)}>
          {link.label}
        </button>
      </div>
      {!decidable && !decision ? <p className="text-[11px] text-text-muted">Cleared findings cannot be decided any more.</p> : null}
    </DetailDrawer>
  );
}
