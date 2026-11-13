import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { api } from "@/api/client";
import {
  mfgPlanningApi as mp,
  type PlanningSettings,
  type TentativeBooking,
  type TentativeCreateInput,
  type TentativeUpdateInput,
} from "@/api/mfgPlanning";
import { RemoteSearchSelect, type RemoteSelectOption } from "@/components/app/RemoteSearchSelect";
import { RowActionsMenu, type RowActionItem } from "@/components/app/RowActionsMenu";
import { HrFormDrawer } from "@/components/hr/kit/HrFormDrawer";
import { useMfgResource } from "@/hooks/useManufacturingIntelligence";
import { todayLocalISO } from "@/lib/dates";
import { logApiError } from "@/utils/logApiError";

import { formatDate, formatDecimal, formatPercent } from "../formatDecimal";
import { Chip, PanelCard, Stat } from "../IntelligenceUi";
import { reasonLabel } from "../reasonLabels";
import { dayFieldError } from "../phase3/phase3Logic";
import {
  endOfDayIso,
  errorStatus,
  friendlyError,
  isPercentText,
  isPositiveDecimalText,
  isStaleError,
  NOT_COUNTED_HELP,
  sameDecimal,
  tentativeDraftErrors,
  type TentativeDraft,
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

const EMPTY_DRAFT = (): TentativeDraft => ({
  source: "QUOTATION",
  source_id: "",
  line_id: "",
  start_date: todayLocalISO(),
  planned_end_date: "",
  planned_qty: "",
  confidence_pct: "",
  expires_on: "",
  notes: "",
});

function draftFrom(b: TentativeBooking): TentativeDraft {
  return {
    source: b.inquiry_id ? "INQUIRY" : "QUOTATION",
    source_id: String(b.inquiry_id ?? b.quotation_id ?? ""),
    line_id: String(b.line_id),
    start_date: b.start_date,
    planned_end_date: b.planned_end_date ?? "",
    planned_qty: b.planned_qty ?? "",
    confidence_pct: b.confidence_pct ?? "",
    expires_on: b.expires_at ? b.expires_at.slice(0, 10) : "",
    notes: b.notes ?? "",
  };
}

/** Tentative demand: inquiry / quotation bookings shown as SOFT load (never firm capacity). */
export function TentativeDemandTab({
  canEditSettings = true,
  canWrite = true,
  phase3On = false,
  canViewFinance = false,
}: {
  canEditSettings?: boolean;
  /** From GET /planning-permissions (UI hint; the backend still checks). */
  canWrite?: boolean;
  /** A Phase 3 flag is on: show the money / timing planning settings. */
  phase3On?: boolean;
  /** can_view_finance hint: may change the Phase 3 settings and see the CPM override. */
  canViewFinance?: boolean;
}) {
  const masters = usePlanningMasters(true);
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const demand = useMfgResource("TentativeDemandTab.list", statusFilter, () => mp.getTentativeDemand({ status: statusFilter || undefined, limit: 200 }));
  const settings = useMfgResource("TentativeDemandTab.settings", "s", () => mp.getPlanningSettings());
  const [openActions, setOpenActions] = useState<string | number | null>(null);

  const [editing, setEditing] = useState<TentativeBooking | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<TentativeDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState("");
  const [cancelRow, setCancelRow] = useState<TentativeBooking | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const stageDefault = settings.data?.stage_probability?.[draft.source] ?? null;
  const set = (patch: Partial<TentativeDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const openCreate = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT());
    setErrors([]);
    setSaveError("");
    setDrawerOpen(true);
  };

  const openEdit = (b: TentativeBooking) => {
    setEditing(b);
    setDraft(draftFrom(b));
    setErrors([]);
    setSaveError("");
    setDrawerOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const errs = tentativeDraftErrors(draft, todayLocalISO(), { confidenceDefault: stageDefault != null, isCreate: editing == null });
    setErrors(errs);
    if (errs.length) return;
    setSaving(true);
    setSaveError("");
    try {
      if (editing == null) {
        const body: TentativeCreateInput = {
          line_id: Number(draft.line_id),
          start_date: draft.start_date,
          planned_qty: draft.planned_qty.trim(),
          ...(draft.source === "INQUIRY" ? { inquiry_id: Number(draft.source_id) } : { quotation_id: Number(draft.source_id) }),
          ...(draft.planned_end_date ? { planned_end_date: draft.planned_end_date } : {}),
          ...(draft.confidence_pct.trim() ? { confidence_pct: draft.confidence_pct.trim() } : {}),
          ...(draft.expires_on ? { expires_at: endOfDayIso(draft.expires_on) } : {}),
          ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
        };
        await mp.createTentativeBooking(body);
        setFlash("Tentative booking added.");
      } else {
        const body: TentativeUpdateInput = { expected_lock_version: editing.lock_version };
        if (Number(draft.line_id) !== editing.line_id) body.line_id = Number(draft.line_id);
        if (draft.start_date !== editing.start_date) body.start_date = draft.start_date;
        if (draft.planned_end_date && draft.planned_end_date !== (editing.planned_end_date ?? "")) body.planned_end_date = draft.planned_end_date;
        if (!sameDecimal(draft.planned_qty, editing.planned_qty)) body.planned_qty = draft.planned_qty.trim();
        if (draft.confidence_pct.trim() && !sameDecimal(draft.confidence_pct, editing.confidence_pct)) body.confidence_pct = draft.confidence_pct.trim();
        if (draft.expires_on && draft.expires_on !== (editing.expires_at ?? "").slice(0, 10)) body.expires_at = endOfDayIso(draft.expires_on);
        if (draft.notes.trim() !== (editing.notes ?? "")) body.notes = draft.notes.trim();
        if (Object.keys(body).length === 1) {
          setErrors(["Nothing changed yet."]);
          return;
        }
        await mp.updateTentativeBooking(editing.id, body);
        setFlash("Tentative booking updated.");
      }
      setDrawerOpen(false);
      demand.reload();
    } catch (err) {
      logApiError("TentativeDemandTab.save", err);
      if (editing && isStaleError(err)) {
        setDrawerOpen(false);
        setFlash("This booking changed since you opened it; the list was reloaded - please try again.");
        demand.reload();
        return;
      }
      setSaveError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const doCancel = async () => {
    if (!cancelRow) return;
    setCancelBusy(true);
    setCancelError("");
    try {
      const res = await mp.cancelTentativeBooking(cancelRow.id);
      setFlash(res.changed === false ? "Nothing changed (it was already cancelled)." : "Tentative booking cancelled.");
      setCancelRow(null);
      demand.reload();
    } catch (err) {
      logApiError("TentativeDemandTab.cancel", err);
      setCancelError(friendlyError(err));
    } finally {
      setCancelBusy(false);
    }
  };

  const rowActions = (b: TentativeBooking): RowActionItem[] => {
    const active = b.status === "ACTIVE";
    return [
      { key: "edit", label: "Edit", disabled: !active, onClick: () => openEdit(b) },
      { key: "cancel", label: "Cancel booking", danger: true, disabled: !active, onClick: () => { setCancelError(""); setCancelRow(b); } },
    ];
  };

  const lineOptions = useMemo(() => masters.lines.filter((l) => l.active).map((l) => ({ value: String(l.id), label: l.label })), [masters.lines]);
  const data = demand.data;

  return (
    <div className="space-y-3" data-testid="mfg-tentative-tab">
      <NoticeBox>
        Tentative demand is <strong>soft load</strong> from inquiries and quotations. It shows as soft minutes on line loading so you can see what
        might come, but it <strong>never reduces firm capacity or promise dates</strong>. When an order is created, the order's own booking counts
        instead and this one stops counting.
      </NoticeBox>
      {masters.error ? <NoticeBox tone="warn">{masters.error}</NoticeBox> : null}
      {flash ? <NoticeBox tone="good">{flash}</NoticeBox> : null}

      <PanelCard testId="mfg-tentative-list" title="Tentative bookings" loading={demand.loading} error={demand.error}>
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            id="mfg-tent-status"
            label="Show"
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="All"
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "EXPIRED", label: "Expired" },
              { value: "CONVERTED", label: "Became an order" },
              { value: "CANCELLED", label: "Cancelled" },
            ]}
          />
          {canWrite ? (
            <button type="button" className={secondaryBtn} onClick={openCreate}>
              Add tentative booking
            </button>
          ) : null}
        </div>
        {data ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="mfg-tentative-totals">
            <Stat label="Bookings counted" value={data.counted_count} />
            <Stat label="Counted SMV minutes" value={formatDecimal(data.counted_total_smv_minutes)} />
            <Stat label="Weighted by confidence" value={formatDecimal(data.counted_weighted_smv_minutes)} hint="Minutes × confidence %" />
          </div>
        ) : null}
        {data && data.items.length === 0 ? <EmptyState>No tentative bookings in this list.</EmptyState> : null}
        {data && data.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs" aria-label="Tentative bookings">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-2 py-1 font-medium">From</th>
                  <th className="px-2 py-1 font-medium">Line</th>
                  <th className="px-2 py-1 font-medium">Dates</th>
                  <th className="px-2 py-1 text-right font-medium">Qty</th>
                  <th className="px-2 py-1 text-right font-medium">Confidence</th>
                  <th className="px-2 py-1 text-right font-medium">Weighted min</th>
                  <th className="px-2 py-1 font-medium">Expires</th>
                  <th className="px-2 py-1 font-medium">Counted?</th>
                  <th className="px-2 py-1 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((b) => (
                  <tr key={b.id} className="border-b border-border/60 align-top">
                    <td className="px-2 py-1 font-medium">
                      {b.inquiry_id ? `Inquiry ${b.inquiry_code ?? `#${b.inquiry_id}`}` : `Quotation ${b.quotation_code ?? `#${b.quotation_id}`}`}
                    </td>
                    <td className="px-2 py-1">{b.line_code ?? masters.lineLabel(b.line_id)}</td>
                    <td className="px-2 py-1">
                      {formatDate(b.start_date)} – {formatDate(b.planned_end_date)}
                    </td>
                    <td className="px-2 py-1 text-right">{formatDecimal(b.planned_qty)}</td>
                    <td className="px-2 py-1 text-right">{formatPercent(b.confidence_pct, 0)}</td>
                    <td className="px-2 py-1 text-right">{formatDecimal(b.weighted_smv_minutes)}</td>
                    <td className="px-2 py-1">{formatDate(b.expires_at)}</td>
                    <td className="px-2 py-1">
                      {b.counted ? (
                        <Chip tone="good">Counted</Chip>
                      ) : (
                        <Chip tone="neutral" title={b.not_counted_reason ? NOT_COUNTED_HELP[b.not_counted_reason] : undefined}>
                          {b.not_counted_reason ? reasonLabel(b.not_counted_reason) : b.status}
                        </Chip>
                      )}
                      {b.smv_per_piece == null ? <div className="mt-0.5 text-[11px] text-amber-900">No SMV: minutes unknown</div> : null}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {canWrite ? (
                        <RowActionsMenu rowId={`tb-${b.id}`} openId={openActions} onOpenChange={setOpenActions} items={rowActions(b)} menuPortal />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </PanelCard>

      <PlanningSettingsCard resource={settings} canEdit={canEditSettings} phase3On={phase3On} canViewFinance={canViewFinance} />

      <HrFormDrawer
        open={drawerOpen}
        title={editing ? "Edit tentative booking" : "Add tentative booking"}
        description="Soft load only. It never reduces firm capacity."
        submitLabel={editing ? "Save changes" : "Add booking"}
        submitting={saving}
        error={saveError}
        onClose={() => setDrawerOpen(false)}
        onSubmit={(e) => void submit(e)}
      >
        {editing == null ? (
          <>
            <SelectField
              id="mfg-tent-source"
              label="Demand comes from"
              required
              value={draft.source}
              onChange={(v) => set({ source: v as TentativeDraft["source"], source_id: "" })}
              options={[
                { value: "QUOTATION", label: "Quotation" },
                { value: "INQUIRY", label: "Inquiry" },
              ]}
            />
            <DemandPicker source={draft.source} value={draft.source_id ? Number(draft.source_id) : null} onChange={(id) => set({ source_id: id ? String(id) : "" })} />
          </>
        ) : (
          <p className="text-xs text-text-secondary">
            {editing.inquiry_id ? `Inquiry ${editing.inquiry_code ?? editing.inquiry_id}` : `Quotation ${editing.quotation_code ?? editing.quotation_id}`}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField id="mfg-tent-line" label="Sewing line" required value={draft.line_id} onChange={(v) => set({ line_id: v })} options={lineOptions} />
          <TextField id="mfg-tent-qty" label="Planned quantity (pcs)" required inputMode="decimal" value={draft.planned_qty} onChange={(v) => set({ planned_qty: v })} />
          <TextField id="mfg-tent-start" label="Start date" type="date" required value={draft.start_date} onChange={(v) => set({ start_date: v })} />
          <TextField id="mfg-tent-end" label="End date" type="date" value={draft.planned_end_date} onChange={(v) => set({ planned_end_date: v })} />
          <TextField
            id="mfg-tent-conf"
            label="Confidence % (0-100)"
            inputMode="decimal"
            required={editing == null && stageDefault == null}
            value={draft.confidence_pct}
            onChange={(v) => set({ confidence_pct: v })}
            hint={stageDefault != null ? `Leave empty to use the default ${formatPercent(stageDefault, 0)} for this stage.` : "No default is set for this stage, so enter one."}
          />
          <TextField
            id="mfg-tent-exp"
            label="Expires on"
            type="date"
            value={draft.expires_on}
            onChange={(v) => set({ expires_on: v })}
            hint={settings.data ? `Empty = ${settings.data.tentative_default_expiry_days} days from today. At most 180 days.` : "At most 180 days ahead."}
          />
        </div>
        <div>
          <label htmlFor="mfg-tent-notes" className={labelCls}>
            Notes
          </label>
          <textarea id="mfg-tent-notes" rows={2} className={inputCls} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>
        <ErrorList errors={errors} />
      </HrFormDrawer>

      <ConfirmDialog
        open={cancelRow != null}
        title="Cancel this tentative booking?"
        confirmLabel="Cancel booking"
        danger
        pending={cancelBusy}
        error={cancelError}
        onClose={() => setCancelRow(null)}
        onConfirm={() => void doCancel()}
      >
        <p>It stops showing as soft load. This cannot be undone; add a new booking if needed.</p>
      </ConfirmDialog>
    </div>
  );
}

function DemandPicker({ source, value, onChange }: { source: "INQUIRY" | "QUOTATION"; value: number | null; onChange: (id: number | null) => void }) {
  const fetchPage = useCallback(
    async (query: string, page: number, pageSize: number) => {
      const offset = (page - 1) * pageSize;
      const options: RemoteSelectOption[] =
        source === "INQUIRY"
          ? (await api.listInquiries({ search: query || undefined, limit: pageSize, offset })).map((r) => ({
              value: r.id,
              label: `${r.inquiry_code}${r.style_name ? ` · ${r.style_name}` : ""}`,
            }))
          : (await api.listQuotations({ search: query || undefined, latest_only: true, limit: pageSize, offset })).map((r) => ({
              value: r.id,
              label: r.quotation_code,
            }));
      const total = options.length < pageSize ? offset + options.length : page * pageSize + 1;
      return { options, total };
    },
    [source],
  );
  return (
    <div>
      <label htmlFor="mfg-tent-demand" className={labelCls}>
        {source === "INQUIRY" ? "Inquiry" : "Quotation"} *
      </label>
      <RemoteSearchSelect
        key={source}
        id="mfg-tent-demand"
        value={value ?? ""}
        onChange={(next) => onChange(next === "" ? null : next)}
        fetchPage={fetchPage}
        placeholder={source === "INQUIRY" ? "Search inquiry code…" : "Search quotation code…"}
        aria-label={source === "INQUIRY" ? "Inquiry" : "Quotation"}
        menuPortal
        className="mt-1 w-full"
      />
    </div>
  );
}

/** `phase2On=false` (Cost & cash tab without integrated planning): only the Phase 3 timing fields are shown and saved,
 * because the backend refuses Phase 2 keys while `mfg_integrated_planning_v1` is off. */
export function PlanningSettingsCard({
  resource,
  canEdit,
  phase3On = false,
  canViewFinance = false,
  phase2On = true,
}: {
  resource: { data: PlanningSettings | null; loading: boolean; error: string; reload: () => void };
  canEdit: boolean;
  phase3On?: boolean;
  canViewFinance?: boolean;
  phase2On?: boolean;
}) {
  const [inq, setInq] = useState("");
  const [quo, setQuo] = useState("");
  const [expiry, setExpiry] = useState("");
  const [buffer, setBuffer] = useState("");
  const [docDays, setDocDays] = useState("");
  const [usanceDays, setUsanceDays] = useState("");
  const [btbDays, setBtbDays] = useState("");
  const [cpm, setCpm] = useState("");
  const [frozenDays, setFrozenDays] = useState("");
  const [changeoverPct, setChangeoverPct] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const s = resource.data;
  // The backend returns the Phase 3 keys only while a Phase 3 flag is on.
  const showPhase3 = phase3On && s != null && s.export_document_days !== undefined;
  // Changing them needs planning approve AND the finance gate (the backend answers 403 otherwise).
  const canEditPhase3 = showPhase3 && canEdit && canViewFinance && !s?.cpm_override_hidden;
  // Phase 5 keys come back only while mfg_advanced_planning_v1 is on.
  const showPhase5 = s != null && s.frozen_horizon_days !== undefined;
  const canEditPhase5 = showPhase5 && canEdit;

  useEffect(() => {
    if (!s) return;
    setInq(s.stage_probability.INQUIRY ?? "");
    setQuo(s.stage_probability.QUOTATION ?? "");
    setExpiry(String(s.tentative_default_expiry_days));
    setBuffer(String(s.receipt_buffer_days));
    setDocDays(s.export_document_days != null ? String(s.export_document_days) : "");
    setUsanceDays(s.export_usance_days != null ? String(s.export_usance_days) : "");
    setBtbDays(s.btb_usance_days != null ? String(s.btb_usance_days) : "");
    setCpm(s.cpm_override ?? "");
    setFrozenDays(s.frozen_horizon_days != null ? String(s.frozen_horizon_days) : "");
    setChangeoverPct(s.changeover_loss_pct != null ? String(s.changeover_loss_pct) : "");
  }, [s]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    const exp = Number(expiry);
    const buf = Number(buffer);
    if (phase2On) {
      if (inq.trim() && !isPercentText(inq)) errs.push("Inquiry probability must be 0-100.");
      if (quo.trim() && !isPercentText(quo)) errs.push("Quotation probability must be 0-100.");
      if (!/^\d+$/.test(expiry.trim()) || exp < 1 || exp > 180) errs.push("Default expiry must be 1-180 days.");
      if (!/^\d+$/.test(buffer.trim()) || buf < 0 || buf > 60) errs.push("Receipt buffer must be 0-60 days.");
    }
    if (canEditPhase3) {
      for (const msg of [
        dayFieldError("Export document days", docDays, 0, 60),
        dayFieldError("Export usance days", usanceDays, 0, 365),
        dayFieldError("BTB usance days", btbDays, 0, 365),
      ])
        if (msg) errs.push(msg);
      if (cpm.trim() && !isPositiveDecimalText(cpm, 4)) errs.push("Cost per minute must be a number above 0 (up to 4 decimals), or empty.");
    }
    if (canEditPhase5) {
      for (const msg of [dayFieldError("Frozen zone days", frozenDays, 14, 60), dayFieldError("Changeover loss %", changeoverPct, 0, 100)])
        if (msg) errs.push(msg);
    }
    if (errs.length) {
      setError(errs.join(" "));
      return;
    }
    setSaving(true);
    setError("");
    setSaved("");
    try {
      await mp.putPlanningSettings({
        ...(phase2On
          ? {
              stage_probability: { INQUIRY: inq.trim() || null, QUOTATION: quo.trim() || null },
              tentative_default_expiry_days: exp,
              receipt_buffer_days: buf,
            }
          : {}),
        ...(canEditPhase3
          ? {
              export_document_days: Number(docDays.trim()),
              export_usance_days: Number(usanceDays.trim()),
              btb_usance_days: Number(btbDays.trim()),
              cpm_override: cpm.trim() || null,
            }
          : {}),
        ...(canEditPhase5 ? { frozen_horizon_days: Number(frozenDays.trim()), changeover_loss_pct: Number(changeoverPct.trim()) } : {}),
      });
      setSaved("Planning settings saved.");
      resource.reload();
    } catch (err) {
      logApiError("PlanningSettingsCard.save", err);
      setError(
        errorStatus(err) === 403 && canEditPhase3
          ? "You are not allowed to change the money settings: they need plan approval rights and finance access."
          : friendlyError(err),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelCard
      testId="mfg-planning-settings"
      title="Planning settings"
      subtitle={
        phase2On
          ? "Default confidence per stage, how long tentative bookings live, and the safety days added after a purchase-order receipt."
          : "Planning settings used by the estimates on this tab."
      }
      loading={resource.loading}
      error={resource.error}
    >
      {s ? (
        <form className="space-y-3" onSubmit={(e) => void save(e)}>
          {s.is_default ? <p className="text-[11px] text-text-muted">Showing the defaults (nothing saved yet).</p> : null}
          {phase2On ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <TextField id="mfg-set-inq" label="Inquiry confidence %" inputMode="decimal" value={inq} onChange={setInq} hint="Empty = planner must enter one" />
              <TextField id="mfg-set-quo" label="Quotation confidence %" inputMode="decimal" value={quo} onChange={setQuo} hint="Empty = planner must enter one" />
              <TextField id="mfg-set-exp" label="Default expiry (days)" inputMode="numeric" value={expiry} onChange={setExpiry} hint="1-180" />
              <TextField id="mfg-set-buf" label="Receipt buffer (days)" inputMode="numeric" value={buffer} onChange={setBuffer} hint="0-60, added after PO expected dates" />
            </div>
          ) : null}
          {showPhase3 ? (
            <fieldset className="space-y-2 rounded border border-border p-3" data-testid="mfg-settings-phase3">
              <legend className="px-1 text-xs font-semibold text-text-primary">Cost & cash timing</legend>
              <p className="text-[11px] text-text-muted">
                Used by the Cost & cash estimates only (never posted). Changing them needs plan approval rights and finance access.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {canEditPhase3 ? (
                  <>
                    <TextField id="mfg-set-docdays" label="Export document days" inputMode="numeric" value={docDays} onChange={setDocDays} hint="0-60, shipment to bank submission" />
                    <TextField id="mfg-set-usance" label="Export usance days" inputMode="numeric" value={usanceDays} onChange={setUsanceDays} hint="0-365, 0 = at sight" />
                    <TextField id="mfg-set-btb" label="BTB usance days" inputMode="numeric" value={btbDays} onChange={setBtbDays} hint="0-365, when no maturity date is stored" />
                    <TextField
                      id="mfg-set-cpm"
                      label="Cost per minute override"
                      inputMode="decimal"
                      value={cpm}
                      onChange={setCpm}
                      hint="Finance-approved CPM; empty = calculated from the ledger"
                    />
                  </>
                ) : (
                  <>
                    <ReadOnlySetting label="Export document days" value={docDays} />
                    <ReadOnlySetting label="Export usance days" value={usanceDays} />
                    <ReadOnlySetting label="BTB usance days" value={btbDays} />
                    <ReadOnlySetting
                      label="Cost per minute override"
                      value={s?.cpm_override_hidden ? "Hidden (finance access needed)" : cpm || "Not set (calculated)"}
                    />
                  </>
                )}
              </div>
            </fieldset>
          ) : null}
          {showPhase5 ? (
            <fieldset className="space-y-2 rounded border border-border p-3" data-testid="mfg-settings-phase5">
              <legend className="px-1 text-xs font-semibold text-text-primary">Scheduler (forward plan)</legend>
              <p className="text-[11px] text-text-muted">
                The scheduler never proposes changes inside the frozen zone (today + these days). Changeover loss is the share of the first day lost when
                a line changes style.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {canEditPhase5 ? (
                  <>
                    <TextField id="mfg-set-frozen" label="Frozen zone (days)" inputMode="numeric" value={frozenDays} onChange={setFrozenDays} hint="14-60" />
                    <TextField
                      id="mfg-set-changeover"
                      label="Changeover loss %"
                      inputMode="numeric"
                      value={changeoverPct}
                      onChange={setChangeoverPct}
                      hint="0-100, of the first day's minutes"
                    />
                  </>
                ) : (
                  <>
                    <ReadOnlySetting label="Frozen zone (days)" value={frozenDays} />
                    <ReadOnlySetting label="Changeover loss %" value={changeoverPct} />
                  </>
                )}
              </div>
            </fieldset>
          ) : null}
          <ErrorBox message={error} />
          {saved ? <NoticeBox tone="good">{saved}</NoticeBox> : null}
          {canEdit && (phase2On || canEditPhase3 || canEditPhase5) ? (
            <button type="submit" className={primaryBtn} disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </button>
          ) : (
            <p className="text-[11px] text-text-muted">Only planners with approval rights can change these.</p>
          )}
        </form>
      ) : null}
    </PanelCard>
  );
}

function ReadOnlySetting({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className={labelCls}>{label}</div>
      <div className="mt-1 rounded border border-border bg-surface-subtle px-2 py-1.5 text-sm text-text-secondary">{value || "—"}</div>
    </div>
  );
}
