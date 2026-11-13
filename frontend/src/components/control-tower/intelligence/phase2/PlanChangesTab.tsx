import { useMemo, useRef, useState, type FormEvent } from "react";

import type { ControlTowerOrderRow } from "@/api/models";
import {
  mfgPlanningApi as mp,
  type LineBooking,
  type PlanRevision,
  type ReservationStatus,
  type RevisionItemInput,
  type RevisionPreview,
  type RevisionStatus,
} from "@/api/mfgPlanning";
import { RowActionsMenu, type RowActionItem } from "@/components/app/RowActionsMenu";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import { useMfgResource } from "@/hooks/useManufacturingIntelligence";
import { todayLocalISO } from "@/lib/dates";
import { logApiError } from "@/utils/logApiError";

import { formatDate, formatDecimal } from "../formatDecimal";
import { Chip, PanelCard } from "../IntelligenceUi";
import { windowDays } from "../panelLogic";
import { RESERVATION_STATUS_LABEL, REVISION_STATUS_LABEL } from "../reasonLabels";
import { ImpactView } from "./ImpactView";
import {
  addDaysISO,
  approveErrorMessage,
  bookingDraftErrors,
  buildCreateItem,
  buildUpdateItem,
  describeItem,
  draftFromBooking,
  errorStatus,
  friendlyError,
  MAX_REVISION_ITEMS,
  MIN_REVISION_REASON,
  newRequestId,
  type BookingDraft,
  type CreateDraft,
} from "./phase2Logic";
import {
  ConfirmDialog,
  EmptyState,
  ErrorBox,
  ErrorList,
  inputCls,
  labelCls,
  NoticeBox,
  primaryBtn,
  secondaryBtn,
  SelectField,
  TextField,
} from "./Phase2Ui";
import { usePlanningMasters } from "./usePlanningMasters";

const MAX_DAYS = 180;
const STATUS_OPTIONS: { value: ReservationStatus; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "SOFT_BOOKED", label: "Soft booked" },
  { value: "FIRM_BOOKED", label: "Firm booked (confirmed orders only)" },
];

type DraftEntry = { key: string; item: RevisionItemInput; label: string };

/** `canPropose` comes from GET /planning-permissions (a UI hint; the backend still checks every call). */
type Props = { orderOptions: ControlTowerOrderRow[]; fourEyes: boolean; canPropose?: boolean };

/** Plan changes: propose line booking changes, preview the impact, then an approver applies them. */
export function PlanChangesTab({ orderOptions, fourEyes, canPropose = true }: Props) {
  const masters = usePlanningMasters(true);
  const [from, setFrom] = useState(() => todayLocalISO());
  const [to, setTo] = useState(() => addDaysISO(todayLocalISO(), 29));
  const [lineFilter, setLineFilter] = useState("");
  const days = windowDays(from, to);
  const windowError =
    Number.isNaN(days) || days < 1 ? "Choose a valid date range." : days > MAX_DAYS ? `The window can be at most ${MAX_DAYS} days.` : "";

  const bookings = useMfgResource(
    "PlanChangesTab.bookings",
    `${from}|${to}|${lineFilter}`,
    windowError ? null : () => mp.listBookings({ date_from: from, date_to: to, line_id: lineFilter ? Number(lineFilter) : undefined }),
  );

  // ---- draft revision
  const [draft, setDraft] = useState<DraftEntry[]>([]);
  const [reason, setReason] = useState("");
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<RevisionPreview | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "propose">("");
  const [draftError, setDraftError] = useState("");
  const [proposed, setProposed] = useState<PlanRevision | null>(null);
  const requestRef = useRef<{ key: string; id: string } | null>(null);
  const [openActions, setOpenActions] = useState<string | number | null>(null);

  const items = draft.map((d) => d.item);
  const contentKey = JSON.stringify({ items, reason: reason.trim(), title: title.trim() });
  const requestId = () => {
    if (!requestRef.current || requestRef.current.key !== contentKey) requestRef.current = { key: contentKey, id: newRequestId() };
    return requestRef.current.id;
  };

  const addToDraft = (entry: DraftEntry) => {
    const rest = draft.filter((p) => p.key !== entry.key);
    if (rest.length >= MAX_REVISION_ITEMS) {
      setDraftError(`A change can hold at most ${MAX_REVISION_ITEMS} items.`);
      return;
    }
    setDraftError("");
    setDraft([...rest, entry]);
    setPreview(null);
    setProposed(null);
  };

  const runPreview = async () => {
    if (items.length === 0) return;
    setBusy("preview");
    setDraftError("");
    try {
      setPreview(await mp.previewRevision(items));
    } catch (e) {
      logApiError("PlanChangesTab.preview", e);
      setPreview(null);
      setDraftError(friendlyError(e));
    } finally {
      setBusy("");
    }
  };

  const propose = async () => {
    if (items.length === 0 || reason.trim().length < MIN_REVISION_REASON || busy) return;
    setBusy("propose");
    setDraftError("");
    try {
      const rev = await mp.proposeRevision({ items, reason: reason.trim(), title: title.trim() || undefined, request_id: requestId() });
      setProposed(rev);
      setDraft([]);
      setPreview(null);
      setReason("");
      setTitle("");
      requestRef.current = null;
      revisions.reload();
    } catch (e) {
      logApiError("PlanChangesTab.propose", e);
      setDraftError(friendlyError(e));
    } finally {
      setBusy("");
    }
  };

  // ---- edit / create drawer
  const [editing, setEditing] = useState<LineBooking | null>(null);
  const [editDraft, setEditDraft] = useState<BookingDraft | null>(null);
  const [editErrors, setEditErrors] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft>(() => ({
    line_id: "",
    order_id: "",
    start_date: todayLocalISO(),
    planned_end_date: "",
    planned_qty: "",
    reservation_status: "SOFT_BOOKED",
  }));

  const submitEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!editing || !editDraft) return;
    const errs = bookingDraftErrors(editDraft);
    const item = errs.length ? null : buildUpdateItem(editing, editDraft);
    if (!errs.length && !item) errs.push("Nothing changed yet.");
    setEditErrors(errs);
    if (!item) return;
    addToDraft({ key: `b-${editing.id}`, item, label: describeItem(item, editing.order_code ? `${editing.order_code} booking` : undefined) });
    setEditing(null);
  };

  const submitCreate = (e: FormEvent) => {
    e.preventDefault();
    const errs = bookingDraftErrors(createDraft);
    setEditErrors(errs);
    if (errs.length) return;
    const item = buildCreateItem(createDraft);
    const order = orderOptions.find((o) => o.order_id === item.order_id);
    addToDraft({ key: `new-${newRequestId()}`, item, label: `Add ${RESERVATION_STATUS_LABEL[item.reservation_status ?? ""] ?? ""} booking for ${order?.order_code ?? `order #${item.order_id}`} on ${masters.lineLabel(item.line_id)}` });
    setCreating(false);
  };

  const bookingActions = (b: LineBooking): RowActionItem[] => {
    const inProgress = (b.reservation_status || "").toUpperCase() === "IN_PROGRESS";
    const linked = b.order_id != null;
    if (!canPropose) return [];
    return [
      {
        key: "edit",
        label: "Change booking…",
        disabled: !linked,
        onClick: () => {
          setEditErrors([]);
          setEditing(b);
          setEditDraft(draftFromBooking(b));
        },
      },
      {
        key: "cancel",
        label: "Cancel booking",
        danger: true,
        disabled: !linked || inProgress,
        onClick: () => addToDraft({ key: `b-${b.id}`, item: { action: "CANCEL", config_id: b.id }, label: `Cancel ${b.order_code ?? `booking #${b.id}`} on ${masters.lineLabel(b.line_id)}` }),
      },
    ];
  };

  // ---- revisions list
  const [statusFilter, setStatusFilter] = useState<RevisionStatus | "">("PROPOSED");
  const revisions = useMfgResource("PlanChangesTab.revisions", statusFilter, () =>
    mp.listRevisions({ status: statusFilter || undefined, limit: 50 }),
  );
  const [viewId, setViewId] = useState<number | null>(null);
  const detail = useMfgResource("PlanChangesTab.revision", String(viewId ?? ""), viewId != null ? () => mp.getRevision(viewId) : null);
  const [decision, setDecision] = useState<{ type: "approve" | "reject" | "cancel"; rev: PlanRevision } | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [decisionDone, setDecisionDone] = useState("");
  const [decisionWarn, setDecisionWarn] = useState("");

  const decide = async (note: string) => {
    if (!decision) return;
    setDecisionBusy(true);
    setDecisionError("");
    setDecisionWarn("");
    try {
      const { rev, type } = decision;
      if (type === "approve") {
        const r = await mp.approveRevision(rev.id, { expected_lock_version: rev.lock_version, decision_note: note || undefined });
        setDecisionDone(r.applied_now ? "Approved and applied to the line plan." : "This change was already applied.");
      } else if (type === "reject") {
        await mp.rejectRevision(rev.id, { decision_note: note });
        setDecisionDone("Rejected.");
      } else {
        await mp.cancelRevision(rev.id);
        setDecisionDone("Cancelled.");
      }
      setDecision(null);
      revisions.reload();
      detail.reload();
      bookings.reload();
    } catch (e) {
      logApiError("PlanChangesTab.decide", e);
      if (errorStatus(e) === 409) {
        // stale: retrying with the old lock version can never work, so close, reload and ask for a fresh review
        setDecision(null);
        setDecisionWarn(decision.type === "approve" ? approveErrorMessage(e) : `${friendlyError(e)} The list was reloaded.`);
        revisions.reload();
        detail.reload();
        bookings.reload();
        return;
      }
      setDecisionError(decision.type === "approve" ? approveErrorMessage(e) : friendlyError(e));
    } finally {
      setDecisionBusy(false);
    }
  };

  const revisionActions = (r: PlanRevision): RowActionItem[] => {
    const open = r.status === "PROPOSED";
    const list: RowActionItem[] = [{ key: "view", label: "View details", onClick: () => setViewId(r.id) }];
    if (open && r.can_approve) list.push({ key: "approve", label: "Approve & apply", onClick: () => { setDecisionError(""); setDecision({ type: "approve", rev: r }); } });
    if (open && r.can_approve) list.push({ key: "reject", label: "Reject", danger: true, onClick: () => { setDecisionError(""); setDecision({ type: "reject", rev: r }); } });
    if (open) list.push({ key: "cancel", label: "Cancel proposal", danger: true, onClick: () => { setDecisionError(""); setDecision({ type: "cancel", rev: r }); } });
    return list;
  };

  const lineOptions = useMemo(() => masters.lines.map((l) => ({ value: String(l.id), label: l.label + (l.active ? "" : " (inactive)") })), [masters.lines]);
  const rows = bookings.data?.bookings ?? [];
  const reasonShort = reason.trim().length < MIN_REVISION_REASON;

  return (
    <div className="space-y-3" data-testid="mfg-plan-tab">
      <NoticeBox>
        Plan changes are <strong>proposals</strong>. Nothing moves on the line plan until someone with approval rights presses <strong>Approve &amp; apply</strong>.
        {fourEyes ? " Four-eyes rule is on: the person who proposes a change cannot approve it." : ""}
      </NoticeBox>
      {masters.error ? <NoticeBox tone="warn">{masters.error}</NoticeBox> : null}

      <PanelCard testId="mfg-bookings" title="Line bookings" subtitle="Current bookings in the window. Use Actions to change or cancel one; add a new one with Add booking." loading={bookings.loading} error={bookings.error}>
        <div className="flex flex-wrap items-end gap-3">
          <TextField id="mfg-plan-from" label="From" type="date" value={from} onChange={setFrom} />
          <TextField id="mfg-plan-to" label="To" type="date" value={to} onChange={setTo} />
          <SelectField id="mfg-plan-line" label="Sewing line" value={lineFilter} onChange={setLineFilter} options={lineOptions} placeholder="All lines" />
          {canPropose ? (
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => {
                setEditErrors([]);
                setCreating(true);
              }}
            >
              Add booking
            </button>
          ) : (
            <span className="text-xs text-text-muted">You can view bookings; proposing changes needs planning write access.</span>
          )}
        </div>
        <ErrorBox message={windowError} />
        {bookings.data && rows.length === 0 ? <EmptyState>No bookings in this window.</EmptyState> : null}
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs" aria-label="Line bookings">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-2 py-1 font-medium">Order</th>
                  <th className="px-2 py-1 font-medium">Line</th>
                  <th className="px-2 py-1 font-medium">Status</th>
                  <th className="px-2 py-1 font-medium">Start</th>
                  <th className="px-2 py-1 font-medium">End</th>
                  <th className="px-2 py-1 text-right font-medium">Planned</th>
                  <th className="px-2 py-1 text-right font-medium">Done</th>
                  <th className="px-2 py-1 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className={`border-b border-border/60 ${draft.some((d) => d.key === `b-${b.id}`) ? "bg-amber-50" : ""}`}>
                    <td className="px-2 py-1 font-medium">{b.order_code ?? "—"}</td>
                    <td className="px-2 py-1">{b.line_code ?? masters.lineLabel(b.line_id)}</td>
                    <td className="px-2 py-1">{RESERVATION_STATUS_LABEL[b.reservation_status] ?? b.reservation_status}</td>
                    <td className="px-2 py-1">{formatDate(b.start_date)}</td>
                    <td className="px-2 py-1">{formatDate(b.planned_end_date)}</td>
                    <td className="px-2 py-1 text-right">{formatDecimal(b.planned_qty)}</td>
                    <td className="px-2 py-1 text-right">{formatDecimal(b.completed_qty)}</td>
                    <td className="px-2 py-1 text-right">
                      {canPropose ? (
                        <RowActionsMenu rowId={`bk-${b.id}`} openId={openActions} onOpenChange={setOpenActions} items={bookingActions(b)} menuPortal />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {bookings.data?.truncated ? <p className="text-[11px] text-amber-900">Only the first {bookings.data.max_rows} bookings are shown; narrow the window.</p> : null}
      </PanelCard>

      <PanelCard testId="mfg-draft" title={`Your proposed change (${draft.length} of ${MAX_REVISION_ITEMS} items)`} subtitle="Collect the booking changes, preview what they do, then propose them for approval.">
        {draft.length === 0 ? <EmptyState>No changes yet. Use a booking's Actions menu or Add booking.</EmptyState> : null}
        {draft.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {draft.map((d) => (
              <li key={d.key} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-surface-subtle p-2">
                <span>{d.label}</span>
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-raised"
                  onClick={() => {
                    setDraft((prev) => prev.filter((p) => p.key !== d.key));
                    setPreview(null);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {draft.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField id="mfg-rev-title" label="Short title (optional)" value={title} onChange={setTitle} />
            <div className="sm:col-span-2">
              <label htmlFor="mfg-rev-reason" className={labelCls}>
                Reason * (at least {MIN_REVISION_REASON} characters)
              </label>
              <textarea id="mfg-rev-reason" rows={2} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
        ) : null}
        <ErrorBox message={draftError} testId="mfg-draft-error" />
        {draft.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryBtn} disabled={busy !== ""} onClick={() => void runPreview()}>
              {busy === "preview" ? "Checking…" : "Preview impact"}
            </button>
            <button
              type="button"
              className={primaryBtn}
              disabled={busy !== "" || reasonShort || !preview}
              title={preview ? undefined : "Preview the impact first"}
              onClick={() => void propose()}
            >
              {busy === "propose" ? "Sending…" : "Propose for approval"}
            </button>
            <button
              type="button"
              className={secondaryBtn}
              disabled={busy !== ""}
              onClick={() => {
                setDraft([]);
                setPreview(null);
              }}
            >
              Clear all
            </button>
          </div>
        ) : null}
        {draft.length > 0 && !preview ? (
          <p className="text-[11px] text-text-muted">Press Preview impact first; Propose unlocks once you have seen what the change does.</p>
        ) : null}
        {preview ? <ImpactView impact={preview.impact} heading="Preview only - nothing is saved yet" /> : null}
        {proposed ? (
          <NoticeBox tone="good">
            Proposed {proposed.title ? `"${proposed.title}"` : `change #${proposed.revision_no ?? proposed.id}`}. It waits for approval in the list below.
          </NoticeBox>
        ) : null}
      </PanelCard>

      <PanelCard testId="mfg-revisions" title="Proposed and past changes" loading={revisions.loading} error={revisions.error}>
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            id="mfg-rev-status"
            label="Show"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as RevisionStatus | "")}
            placeholder="All"
            options={Object.entries(REVISION_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </div>
        {decisionDone ? <NoticeBox tone="good">{decisionDone}</NoticeBox> : null}
        {decisionWarn ? <NoticeBox tone="warn">{decisionWarn}</NoticeBox> : null}
        {revisions.data && revisions.data.items.length === 0 ? <EmptyState>No changes in this list.</EmptyState> : null}
        {revisions.data && revisions.data.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs" aria-label="Plan revisions">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-2 py-1 font-medium">#</th>
                  <th className="px-2 py-1 font-medium">Title / reason</th>
                  <th className="px-2 py-1 font-medium">Status</th>
                  <th className="px-2 py-1 font-medium">Proposed by</th>
                  <th className="px-2 py-1 font-medium">Decided by</th>
                  <th className="px-2 py-1 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {revisions.data.items.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="px-2 py-1">{r.revision_no ?? r.id}</td>
                    <td className="px-2 py-1">{r.title || r.reason || "—"}</td>
                    <td className="px-2 py-1">
                      <Chip tone={r.status === "APPLIED" ? "good" : r.status === "PROPOSED" ? "info" : "neutral"}>{REVISION_STATUS_LABEL[r.status] ?? r.status}</Chip>
                    </td>
                    <td className="px-2 py-1">{r.proposed_by_name ?? "—"}</td>
                    <td className="px-2 py-1">{r.decided_by_name ?? "—"}</td>
                    <td className="px-2 py-1 text-right">
                      <RowActionsMenu rowId={`rev-${r.id}`} openId={openActions} onOpenChange={setOpenActions} items={revisionActions(r)} menuPortal />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </PanelCard>

      {viewId != null ? (
        <PanelCard testId="mfg-revision-detail" title={`Change #${detail.data?.revision_no ?? viewId}`} loading={detail.loading} error={detail.error}>
          <button type="button" className={secondaryBtn} onClick={() => setViewId(null)}>
            Close details
          </button>
          {detail.data ? <RevisionDetail rev={detail.data} fourEyes={fourEyes} /> : null}
        </PanelCard>
      ) : null}

      <HrFormDrawer
        open={editing != null && editDraft != null}
        title={`Change booking ${editing?.order_code ?? ""}`}
        description="Only the fields you change are sent. The change is added to your proposal; nothing is saved yet."
        submitLabel="Add to proposal"
        onClose={() => setEditing(null)}
        onSubmit={submitEdit}
      >
        {editDraft ? (
          <BookingFields
            idPrefix="mfg-edit"
            value={editDraft}
            onChange={(patch) => setEditDraft((d) => (d ? { ...d, ...patch } : d))}
            lineOptions={lineOptions}
            showStaffing
          />
        ) : null}
        <ErrorList errors={editErrors} />
      </HrFormDrawer>

      <HrFormDrawer
        open={creating}
        title="Add booking"
        description="A new booking for an order. It is added to your proposal; nothing is saved yet."
        submitLabel="Add to proposal"
        onClose={() => setCreating(false)}
        onSubmit={submitCreate}
      >
        <SelectField
          id="mfg-new-order"
          label="Order"
          required
          value={createDraft.order_id}
          onChange={(v) => setCreateDraft((d) => ({ ...d, order_id: v }))}
          options={orderOptions.map((o) => ({ value: String(o.order_id), label: `${o.order_code}${o.customer_name ? ` · ${o.customer_name}` : ""}` }))}
          placeholder={orderOptions.length ? "Choose an order…" : "No orders in the Control Tower window"}
        />
        <BookingFields
          idPrefix="mfg-new"
          value={createDraft}
          onChange={(patch) => setCreateDraft((d) => ({ ...d, ...patch }) as CreateDraft)}
          lineOptions={lineOptions}
        />
        <ErrorList errors={editErrors} />
      </HrFormDrawer>

      <ConfirmDialog
        open={decision != null}
        title={decision?.type === "approve" ? "Approve and apply this change?" : decision?.type === "reject" ? "Reject this change?" : "Cancel this proposal?"}
        confirmLabel={decision?.type === "approve" ? "Approve & apply" : decision?.type === "reject" ? "Reject" : "Cancel proposal"}
        danger={decision?.type !== "approve"}
        reasonLabel={decision?.type === "cancel" ? undefined : "Decision note"}
        reasonMin={decision?.type === "reject" ? 1 : 0}
        pending={decisionBusy}
        error={decisionError}
        onClose={() => setDecision(null)}
        onConfirm={(note) => void decide(note)}
      >
        {decision?.type === "approve" ? <p>The bookings are changed on the line plan at once. If anyone changed them since the proposal, nothing is written.</p> : null}
        {decision?.type === "approve" && decision.rev.impact ? (
          <ImpactView impact={decision.rev.impact} heading="Impact calculated when this was proposed" />
        ) : null}
        {decision?.type === "reject" ? <p>The proposer sees your note. Nothing changes on the line plan.</p> : null}
        {decision?.type === "cancel" ? <p>The proposal is withdrawn. Nothing changes on the line plan.</p> : null}
      </ConfirmDialog>
    </div>
  );
}

function BookingFields({
  idPrefix,
  value,
  onChange,
  lineOptions,
  showStaffing = false,
}: {
  idPrefix: string;
  value: Pick<BookingDraft, "line_id" | "start_date" | "planned_end_date" | "planned_qty"> & { reservation_status: string; operator_count?: string; target_efficiency_pct?: string };
  onChange: (patch: Partial<BookingDraft>) => void;
  lineOptions: { value: string; label: string }[];
  showStaffing?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField id={`${idPrefix}-line`} label="Sewing line" required value={value.line_id} onChange={(v) => onChange({ line_id: v })} options={lineOptions} />
      <SelectField
        id={`${idPrefix}-status`}
        label="Booking status"
        required
        value={value.reservation_status}
        onChange={(v) => onChange({ reservation_status: v as ReservationStatus })}
        options={STATUS_OPTIONS}
      />
      <TextField id={`${idPrefix}-start`} label="Start date" type="date" required value={value.start_date} onChange={(v) => onChange({ start_date: v })} />
      <TextField id={`${idPrefix}-end`} label="End date" type="date" value={value.planned_end_date} onChange={(v) => onChange({ planned_end_date: v })} />
      <TextField
        id={`${idPrefix}-qty`}
        label="Planned quantity (pcs)"
        required
        inputMode="decimal"
        value={value.planned_qty}
        onChange={(v) => onChange({ planned_qty: v })}
      />
      {showStaffing ? (
        <>
          <TextField id={`${idPrefix}-ops`} label="Operators" inputMode="numeric" value={value.operator_count ?? ""} onChange={(v) => onChange({ operator_count: v })} />
          <TextField
            id={`${idPrefix}-eff`}
            label="Target efficiency %"
            inputMode="decimal"
            value={value.target_efficiency_pct ?? ""}
            onChange={(v) => onChange({ target_efficiency_pct: v })}
          />
        </>
      ) : null}
    </div>
  );
}

function RevisionDetail({ rev, fourEyes }: { rev: PlanRevision; fourEyes: boolean }) {
  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={rev.status === "APPLIED" ? "good" : rev.status === "PROPOSED" ? "info" : "neutral"}>{REVISION_STATUS_LABEL[rev.status] ?? rev.status}</Chip>
        {rev.title ? <span className="font-semibold text-text-primary">{rev.title}</span> : null}
        {fourEyes && rev.status === "PROPOSED" && !rev.can_approve ? <Chip tone="warn">You cannot approve this (four-eyes rule or no approval right)</Chip> : null}
      </div>
      <p>
        <span className="text-text-muted">Reason:</span> {rev.reason ?? "—"}
      </p>
      <p className="text-text-muted">
        Proposed by {rev.proposed_by_name ?? "—"} on {formatDate(rev.proposed_at)}
        {rev.decided_by_name ? ` · decided by ${rev.decided_by_name} on ${formatDate(rev.decided_at)}` : ""}
      </p>
      {rev.decision_note ? (
        <p>
          <span className="text-text-muted">Decision note:</span> {rev.decision_note}
        </p>
      ) : null}
      {rev.items && rev.items.length > 0 ? (
        <ul className="space-y-1">
          {rev.items.map((i) => (
            <li key={i.id} className="rounded border border-border bg-surface-subtle p-2">
              <span className="font-medium">{i.action === "CREATE" ? "Add" : i.action === "CANCEL" ? "Cancel" : "Change"}</span>
              {i.config_id ? ` booking #${i.config_id}` : ""}
              <ChangedFields before={i.before} after={i.after} />
            </li>
          ))}
        </ul>
      ) : null}
      <ImpactView impact={rev.impact} heading={rev.status === "APPLIED" ? "Impact estimated when it was proposed" : "Expected impact (estimate)"} />
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = {
  line_id: "Line",
  start_date: "Start",
  planned_end_date: "End",
  planned_qty: "Qty",
  reservation_status: "Status",
  operator_count: "Operators",
  target_efficiency_pct: "Efficiency %",
  shift_id: "Shift",
};

function ChangedFields({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = Object.keys(FIELD_LABEL).filter((k) => String(before?.[k] ?? "") !== String(after?.[k] ?? ""));
  if (keys.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-[11px] text-text-secondary">
      {keys.map((k) => (
        <li key={k}>
          {FIELD_LABEL[k]}: {before ? String(before[k] ?? "—") : "—"} → {after ? String(after[k] ?? "—") : "removed"}
        </li>
      ))}
    </ul>
  );
}
