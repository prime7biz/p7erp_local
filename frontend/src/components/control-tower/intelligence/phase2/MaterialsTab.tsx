import { useState } from "react";

import type { ControlTowerOrderRow } from "@/api/models";
import {
  mfgPlanningApi as mp,
  type AllocationConfirmResult,
  type AllocationKind,
  type AllocationPreview,
  type AllocationRunConfirmResult,
  type AllocationRunPreview,
  type ItemAllocationAvailability,
  type MaterialHold,
  type MaterialPeg,
} from "@/api/mfgPlanning";
import { RowActionsMenu, type RowActionItem } from "@/components/app/RowActionsMenu";
import { useMfgResource } from "@/hooks/useManufacturingIntelligence";
import { todayLocalISO } from "@/lib/dates";
import { logApiError } from "@/utils/logApiError";

import { formatDate, formatDecimal } from "../formatDecimal";
import { Chip, PanelCard, Stat } from "../IntelligenceUi";
import { OrderPicker } from "../ReadinessPanel";
import { ALLOCATION_KIND_LABEL, reasonLabel, warningLabel } from "../reasonLabels";
import {
  addDaysISO,
  canManageHardMaterial,
  conflictTone,
  endOfDayIso,
  expiryError,
  friendlyError,
  holdIsReleasable,
  isHardHold,
  isHardPeg,
  isPositiveDecimalText,
  isStaleAllocation,
  isStaleError,
  MIN_HARD_REASON,
  PRIORITY_RANK_LABEL,
  releaseNeedsManager,
} from "./phase2Logic";
import { ConfirmDialog, EmptyState, ErrorBox, inputCls, labelCls, NoticeBox, primaryBtn, secondaryBtn } from "./Phase2Ui";

type Props = {
  orderOptions: ControlTowerOrderRow[];
  orderId: number | null;
  onOrderChange: (id: number | null) => void;
  roleName?: string | null;
  /** From GET /planning-permissions `can_allocate` (UI hint; the backend still checks). */
  canAllocate?: boolean;
};

type ReleaseTarget = { type: "hold"; row: MaterialHold } | { type: "peg"; row: MaterialPeg };

const q = (v: string | null | undefined) => formatDecimal(v, 2);

/** Materials tab: hold stock / link open purchase orders to orders (preview first, then confirm). */
export function MaterialsTab({ orderOptions, orderId, onOrderChange, roleName, canAllocate = true }: Props) {
  const manager = canManageHardMaterial(roleName);
  const state = useMfgResource(
    "MaterialsTab.allocation",
    String(orderId ?? ""),
    orderId != null ? () => mp.getOrderAllocation(orderId) : null,
  );
  const data = state.data;

  // ---- allocate (one order)
  const [kindChoice, setKindChoice] = useState<AllocationKind | "">("");
  const kind: AllocationKind = kindChoice || data?.default_kind || "HARD_ATP";
  const [expiresOn, setExpiresOn] = useState(() => addDaysISO(todayLocalISO(), 30));
  const [preview, setPreview] = useState<AllocationPreview | null>(null);
  const [result, setResult] = useState<AllocationConfirmResult | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "confirm">("");
  const [allocError, setAllocError] = useState("");
  const [staleNote, setStaleNote] = useState("");

  const expiryErr = kind === "TENTATIVE" ? expiryError(expiresOn, todayLocalISO()) : "";
  const body = () => ({ kind, ...(kind === "TENTATIVE" ? { expires_at: endOfDayIso(expiresOn) } : {}) });

  const runPreview = async (): Promise<AllocationPreview | null> => {
    if (orderId == null || expiryErr) return null;
    setBusy("preview");
    setAllocError("");
    setResult(null);
    try {
      const p = await mp.allocatePreview(orderId, body());
      setPreview(p);
      return p;
    } catch (e) {
      logApiError("MaterialsTab.preview", e);
      setPreview(null);
      setAllocError(friendlyError(e));
      return null;
    } finally {
      setBusy("");
    }
  };

  const confirm = async () => {
    if (orderId == null || !preview) return;
    setBusy("confirm");
    setAllocError("");
    setStaleNote("");
    try {
      const r = await mp.allocateConfirm(orderId, { ...body(), state_token: preview.state_token });
      setResult(r);
      setPreview(null);
      state.reload();
    } catch (e) {
      logApiError("MaterialsTab.confirm", e);
      if (isStaleAllocation(e)) {
        setBusy("");
        setStaleNote("Stock or demand changed since your preview. The preview below was refreshed - check it and confirm again.");
        await runPreview();
        return;
      }
      setAllocError(friendlyError(e));
    } finally {
      setBusy("");
    }
  };

  // ---- release / reassign
  const [release, setRelease] = useState<ReleaseTarget | null>(null);
  const [releaseQty, setReleaseQty] = useState("");
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [releaseError, setReleaseError] = useState("");
  const [moveHold, setMoveHold] = useState<MaterialHold | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [moveQty, setMoveQty] = useState("");
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [flash, setFlash] = useState("");
  const [openActions, setOpenActions] = useState<string | number | null>(null);

  const releaseNeedsMgr = release
    ? releaseNeedsManager(release.type === "hold" ? isHardHold(release.row) : isHardPeg(release.row), data?.order_status)
    : false;

  const doRelease = async (reason: string) => {
    if (!release) return;
    if (release.type === "hold" && releaseQty.trim() && !isPositiveDecimalText(releaseQty, 4)) {
      setReleaseError("Quantity must be a number above 0, or leave it empty to release the whole hold.");
      return;
    }
    setReleaseBusy(true);
    setReleaseError("");
    try {
      const res =
        release.type === "hold"
          ? await mp.releaseReservation(release.row.reservation_id, {
              reason: reason || undefined,
              quantity: releaseQty.trim() || undefined,
              expected_lock_version: release.row.lock_version,
            })
          : await mp.releasePeg(release.row.peg_id, { reason: reason || undefined, expected_lock_version: release.row.lock_version });
      setFlash(res.changed ? `Released. ${res.remaining_qty != null ? `Still held: ${q(res.remaining_qty)}.` : ""}` : "Nothing changed (already released).");
      setRelease(null);
      setReleaseQty("");
      state.reload();
    } catch (e) {
      logApiError("MaterialsTab.release", e);
      if (isStaleError(e)) {
        setRelease(null);
        setFlash("This hold changed since you opened it; the list was reloaded - please try again.");
        state.reload();
        return;
      }
      setReleaseError(friendlyError(e));
    } finally {
      setReleaseBusy(false);
    }
  };

  const doMove = async (reason: string) => {
    if (!moveHold) return;
    if (!(Number(moveTo) > 0)) return setMoveError("Choose the order that should get the material.");
    if (!isPositiveDecimalText(moveQty, 4)) return setMoveError("Quantity must be a number above 0.");
    setMoveBusy(true);
    setMoveError("");
    try {
      const res = await mp.reassign({ from_reservation_id: moveHold.reservation_id, to_order_id: Number(moveTo), quantity: moveQty.trim(), reason });
      setFlash(`Moved ${q(res.quantity)} to order #${res.to_order_id}. Left on this hold: ${q(res.source_remaining_qty)}.`);
      setMoveHold(null);
      setMoveQty("");
      setMoveTo("");
      state.reload();
    } catch (e) {
      logApiError("MaterialsTab.reassign", e);
      setMoveError(friendlyError(e));
    } finally {
      setMoveBusy(false);
    }
  };

  // ---- item availability
  const [itemCheck, setItemCheck] = useState<number | null>(null);
  const availability = useMfgResource<ItemAllocationAvailability>(
    "MaterialsTab.itemAvailability",
    `${itemCheck ?? ""}|${orderId ?? ""}`,
    itemCheck != null ? () => mp.getItemAvailability(itemCheck, orderId) : null,
  );

  const itemName = (itemId: number) => data?.lines.find((l) => l.item_id === itemId)?.item_name ?? `Item #${itemId}`;

  const holdActions = (h: MaterialHold): RowActionItem[] => {
    const needsMgr = releaseNeedsManager(isHardHold(h), data?.order_status);
    const items: RowActionItem[] = [{ key: "stock", label: "Check item stock", onClick: () => setItemCheck(h.item_id) }];
    if (holdIsReleasable(h) && manager) {
      items.push({
        key: "move",
        label: "Move to another order",
        onClick: () => {
          setMoveError("");
          setMoveHold(h);
        },
      });
    }
    if (holdIsReleasable(h)) {
      items.push({
        key: "release",
        label: needsMgr && !manager ? "Release (manager only)" : "Release hold",
        danger: true,
        disabled: needsMgr && !manager,
        onClick: () => {
          setReleaseError("");
          setReleaseQty("");
          setRelease({ type: "hold", row: h });
        },
      });
    }
    return items;
  };

  const pegActions = (p: MaterialPeg): RowActionItem[] => {
    const needsMgr = releaseNeedsManager(isHardPeg(p), data?.order_status);
    return [
      { key: "stock", label: "Check item stock", onClick: () => setItemCheck(p.item_id) },
      {
        key: "release",
        label: needsMgr && !manager ? "Release (manager only)" : "Release link",
        danger: true,
        disabled: needsMgr && !manager,
        onClick: () => {
          setReleaseError("");
          setRelease({ type: "peg", row: p });
        },
      },
    ];
  };

  return (
    <div className="space-y-3" data-testid="mfg-materials-tab">
      <NoticeBox>
        Holds keep stock for an order; links reserve quantity on an open purchase order. They are advisory: store issues are not blocked,
        and nothing here posts stock or accounts. Always <strong>Preview</strong> first - nothing is saved until you press <strong>Confirm</strong>.
      </NoticeBox>

      <div className="rounded-xl border border-border bg-surface-raised p-3">
        <OrderPicker orders={orderOptions} orderId={orderId} onChange={(id) => { setPreview(null); setResult(null); setAllocError(""); setStaleNote(""); onOrderChange(id); }} />
      </div>

      <PanelCard testId="mfg-allocation-panel" title="Order material allocation" subtitle="What this order needs, what is issued, held and linked." loading={state.loading} error={state.error}>
        {orderId == null ? <EmptyState>Pick an order to see and allocate its materials.</EmptyState> : null}
        {flash ? <NoticeBox tone="good">{flash}</NoticeBox> : null}
        {data ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-text-primary">{data.order_code}</span>
              <Chip>{data.order_status}</Chip>
              <Chip tone={data.order_bom_usable ? "good" : "warn"}>
                {data.order_bom_usable ? `Order BOM ${data.order_bom_status ?? ""}`.trim() : "Order BOM not usable (missing or not approved)"}
              </Chip>
              <Chip tone="info">Priority: {PRIORITY_RANK_LABEL[data.priority_rank] ?? data.priority_rank}</Chip>
              {data.priority_date ? <Chip>Priority date {formatDate(data.priority_date)}</Chip> : null}
            </div>

            {data.lines.length === 0 ? (
              <EmptyState>No material lines (the order BOM has no items yet).</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs" aria-label="Material lines">
                  <thead>
                    <tr className="border-b border-border text-left text-text-muted">
                      <th className="px-2 py-1 font-medium">Item</th>
                      <th className="px-2 py-1 font-medium">UoM</th>
                      <th className="px-2 py-1 text-right font-medium">Required</th>
                      <th className="px-2 py-1 text-right font-medium">Issued</th>
                      <th className="px-2 py-1 text-right font-medium">Held</th>
                      <th className="px-2 py-1 text-right font-medium">Tentative held</th>
                      <th className="px-2 py-1 text-right font-medium">Linked to PO</th>
                      <th className="px-2 py-1 text-right font-medium">Still short</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((l) => (
                      <tr key={l.bom_item_id} className="border-b border-border/60">
                        <td className="px-2 py-1">{l.item_name ?? `Item ${l.item_id}`}</td>
                        <td className="px-2 py-1">{l.uom ?? "—"}</td>
                        <td className="px-2 py-1 text-right">{q(l.required_qty)}</td>
                        <td className="px-2 py-1 text-right">{q(l.issued_qty)}</td>
                        <td className="px-2 py-1 text-right">{q(l.held_qty)}</td>
                        <td className="px-2 py-1 text-right">{q(l.tentative_held_qty)}</td>
                        <td className="px-2 py-1 text-right">{q(l.pegged_qty)}</td>
                        <td className={`px-2 py-1 text-right ${Number(l.shortfall_qty) > 0 ? "font-semibold text-red-700" : ""}`}>{q(l.shortfall_qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-2 rounded-lg border border-border bg-surface-subtle p-3" data-testid="mfg-allocate-form">
              <h4 className="text-xs font-semibold text-text-primary">Allocate materials</h4>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="mfg-alloc-kind" className={labelCls}>
                    Kind of hold
                  </label>
                  <select
                    id="mfg-alloc-kind"
                    className={inputCls}
                    value={kind}
                    onChange={(e) => {
                      setKindChoice(e.target.value as AllocationKind);
                      setPreview(null);
                    }}
                  >
                    <option value="HARD_ATP">{ALLOCATION_KIND_LABEL.HARD_ATP}</option>
                    <option value="TENTATIVE">{ALLOCATION_KIND_LABEL.TENTATIVE}</option>
                  </select>
                </div>
                {kind === "TENTATIVE" ? (
                  <div>
                    <label htmlFor="mfg-alloc-expires" className={labelCls}>
                      Tentative hold expires on
                    </label>
                    <input
                      id="mfg-alloc-expires"
                      type="date"
                      className={inputCls}
                      value={expiresOn}
                      onChange={(e) => {
                        setExpiresOn(e.target.value);
                        setPreview(null);
                      }}
                    />
                  </div>
                ) : null}
                <button type="button" className={secondaryBtn} disabled={busy !== "" || Boolean(expiryErr)} onClick={() => void runPreview()}>
                  {busy === "preview" ? "Checking…" : "Preview allocation"}
                </button>
              </div>
              {expiryErr ? <p className="text-[11px] text-red-700">{expiryErr}</p> : null}
              <p className="text-[11px] text-text-muted">
                Hard holds are for confirmed orders and count as ready. Tentative holds are for draft orders, expire, and never count as ready.
              </p>
              {staleNote ? <NoticeBox tone="warn">{staleNote}</NoticeBox> : null}
              <ErrorBox message={allocError} testId="mfg-alloc-error" />
              {preview ? <AllocationPreviewView preview={preview} /> : null}
              {preview ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={primaryBtn}
                    disabled={busy !== "" || !preview.creates_anything || !canAllocate}
                    title={canAllocate ? undefined : "Confirming needs stock approval rights"}
                    onClick={() => void confirm()}
                  >
                    {busy === "confirm" ? "Saving…" : "Confirm allocation"}
                  </button>
                  <button type="button" className={secondaryBtn} disabled={busy !== ""} onClick={() => setPreview(null)}>
                    Discard preview
                  </button>
                </div>
              ) : null}
              {result ? (
                <NoticeBox tone="good">
                  {result.status === "NOOP"
                    ? "Nothing new to allocate - the order already has what is available."
                    : `Allocated: ${result.holds.length} hold(s) and ${result.pegs.length} purchase-order link(s) created.`}
                  {result.replayed ? " (This request was already done; nothing was created twice.)" : ""}
                </NoticeBox>
              ) : null}
            </div>

            <HoldsTable holds={data.holds} itemName={itemName} openActions={openActions} setOpenActions={setOpenActions} actions={holdActions} />
            <PegsTable pegs={data.pegs} itemName={itemName} openActions={openActions} setOpenActions={setOpenActions} actions={pegActions} />
          </div>
        ) : null}
      </PanelCard>

      {itemCheck != null ? (
        <PanelCard
          testId="mfg-item-availability"
          title={`Item stock check: ${availability.data?.item_name ?? itemName(itemCheck)}`}
          subtitle="Stock, holds and open purchase orders for this item across all orders (this order's own holds are added back)."
          loading={availability.loading}
          error={availability.error}
        >
          <button type="button" className={secondaryBtn} onClick={() => setItemCheck(null)}>
            Close stock check
          </button>
          {availability.data ? <AvailabilityView a={availability.data} /> : null}
        </PanelCard>
      ) : null}

      <AllocationRunCard orderOptions={orderOptions} onDone={state.reload} canAllocate={canAllocate} />
      <ConflictsCard />

      <ConfirmDialog
        open={release != null}
        title={release?.type === "peg" ? "Release purchase-order link?" : "Release material hold?"}
        confirmLabel="Release"
        danger
        reasonLabel="Reason"
        reasonMin={releaseNeedsMgr ? MIN_HARD_REASON : 0}
        pending={releaseBusy}
        error={releaseError}
        onClose={() => setRelease(null)}
        onConfirm={(r) => void doRelease(r)}
      >
        <p>
          {release?.type === "hold"
            ? `The stock goes back to the free pool and other orders can take it. Held now: ${q(release.row.effective_qty ?? release.row.reserved_qty)}.`
            : "The quantity on the purchase order goes back to the free pool."}
        </p>
        {release?.type === "hold" ? (
          <div>
            <label htmlFor="mfg-release-qty" className={labelCls}>
              Quantity to release (leave empty to release all)
            </label>
            <input id="mfg-release-qty" inputMode="decimal" className={inputCls} value={releaseQty} onChange={(e) => setReleaseQty(e.target.value)} />
          </div>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={moveHold != null}
        title="Move held material to another order"
        confirmLabel="Move material"
        reasonLabel="Reason"
        reasonMin={MIN_HARD_REASON}
        pending={moveBusy}
        error={moveError}
        onClose={() => setMoveHold(null)}
        onConfirm={(r) => void doMove(r)}
      >
        <p>Admin / manager only. The other order must still need this item.</p>
        <div>
          <label htmlFor="mfg-move-to" className={labelCls}>
            Move to order
          </label>
          <select id="mfg-move-to" className={inputCls} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="">Choose an order…</option>
            {orderOptions
              .filter((o) => o.order_id !== orderId)
              .map((o) => (
                <option key={o.order_id} value={o.order_id}>
                  {o.order_code}
                  {o.customer_name ? ` · ${o.customer_name}` : ""}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label htmlFor="mfg-move-qty" className={labelCls}>
            Quantity to move
          </label>
          <input id="mfg-move-qty" inputMode="decimal" className={inputCls} value={moveQty} onChange={(e) => setMoveQty(e.target.value)} />
        </div>
      </ConfirmDialog>
    </div>
  );
}

function AllocationPreviewView({ preview }: { preview: AllocationPreview }) {
  return (
    <div className="space-y-2" data-testid="mfg-alloc-preview">
      <p className="text-xs font-semibold text-text-primary">
        Preview only - nothing is saved yet. {preview.creates_anything ? "This will create:" : "Nothing new can be allocated right now."}
      </p>
      {preview.warnings.length > 0 ? (
        <ul className="list-disc pl-5 text-[11px] text-amber-900">
          {preview.warnings.map((w) => (
            <li key={w}>{warningLabel(w)}</li>
          ))}
        </ul>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs" aria-label="Allocation preview">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="px-2 py-1 font-medium">Item</th>
              <th className="px-2 py-1 text-right font-medium">Short now</th>
              <th className="px-2 py-1 text-right font-medium">Hold from stock</th>
              <th className="px-2 py-1 font-medium">Link to purchase orders</th>
              <th className="px-2 py-1 text-right font-medium">Still short after</th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.map((l) => (
              <tr key={l.bom_item_id} className="border-b border-border/60 align-top">
                <td className="px-2 py-1">{l.item_name ?? `Item ${l.item_id}`}</td>
                <td className="px-2 py-1 text-right">{q(l.shortfall_qty)}</td>
                <td className="px-2 py-1 text-right font-medium">{q(l.hold_qty)}</td>
                <td className="px-2 py-1">
                  {l.pegs.length === 0
                    ? "—"
                    : l.pegs.map((p) => (
                        <div key={p.purchase_order_item_id}>
                          {p.po_code}: {q(p.quantity)} (expected {formatDate(p.expected_date)})
                        </div>
                      ))}
                </td>
                <td className={`px-2 py-1 text-right ${Number(l.remaining_short_qty) > 0 ? "font-semibold text-red-700" : ""}`}>{q(l.remaining_short_qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type TableProps<T> = {
  itemName: (id: number) => string;
  openActions: string | number | null;
  setOpenActions: (id: string | number | null) => void;
  actions: (row: T) => RowActionItem[];
};

function HoldsTable({ holds, itemName, openActions, setOpenActions, actions }: TableProps<MaterialHold> & { holds: MaterialHold[] }) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-text-primary">Stock holds ({holds.length})</h4>
      {holds.length === 0 ? (
        <EmptyState>No stock is held for this order.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs" aria-label="Stock holds">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-2 py-1 font-medium">Item</th>
                <th className="px-2 py-1 font-medium">Kind</th>
                <th className="px-2 py-1 text-right font-medium">Held</th>
                <th className="px-2 py-1 text-right font-medium">Used so far</th>
                <th className="px-2 py-1 font-medium">Expires</th>
                <th className="px-2 py-1 font-medium">Status</th>
                <th className="px-2 py-1 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {holds.map((h) => (
                <tr key={h.reservation_id} className="border-b border-border/60">
                  <td className="px-2 py-1">{itemName(h.item_id)}</td>
                  <td className="px-2 py-1">{ALLOCATION_KIND_LABEL[h.kind ?? ""] ?? h.kind ?? "—"}</td>
                  <td className="px-2 py-1 text-right">{q(h.effective_qty ?? h.reserved_qty)}</td>
                  <td className="px-2 py-1 text-right">{q(h.consumed_qty)}</td>
                  <td className="px-2 py-1">{formatDate(h.expires_at)}</td>
                  <td className="px-2 py-1">
                    {h.status}
                    {h.legacy ? <span className="ml-1 text-[11px] text-text-muted">(older hold)</span> : null}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <RowActionsMenu rowId={`hold-${h.reservation_id}`} openId={openActions} onOpenChange={setOpenActions} items={actions(h)} menuPortal />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PegsTable({ pegs, itemName, openActions, setOpenActions, actions }: TableProps<MaterialPeg> & { pegs: MaterialPeg[] }) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-text-primary">Purchase-order links ({pegs.length})</h4>
      {pegs.length === 0 ? (
        <EmptyState>No open purchase-order quantity is linked to this order.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs" aria-label="Purchase-order links">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-2 py-1 font-medium">Item</th>
                <th className="px-2 py-1 font-medium">PO</th>
                <th className="px-2 py-1 font-medium">Kind</th>
                <th className="px-2 py-1 text-right font-medium">Linked</th>
                <th className="px-2 py-1 font-medium">Expected</th>
                <th className="px-2 py-1 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pegs.map((p) => (
                <tr key={p.peg_id} className="border-b border-border/60">
                  <td className="px-2 py-1">{itemName(p.item_id)}</td>
                  <td className="px-2 py-1">{p.po_code ?? "—"}</td>
                  <td className="px-2 py-1">{isHardPeg(p) ? "Hard" : "Tentative"}</td>
                  <td className="px-2 py-1 text-right">{q(p.effective_qty ?? p.pegged_qty)}</td>
                  <td className="px-2 py-1">{formatDate(p.expected_date)}</td>
                  <td className="px-2 py-1 text-right">
                    <RowActionsMenu rowId={`peg-${p.peg_id}`} openId={openActions} onOpenChange={setOpenActions} items={actions(p)} menuPortal />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AvailabilityView({ a }: { a: ItemAllocationAvailability }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="On hand (usable)" value={q(a.on_hand_qty)} />
        <Stat label="Held for orders (hard)" value={q(a.hard_reserved_qty)} />
        <Stat label="Free to promise now" value={q(a.atp_hard_qty)} hint="On hand minus hard holds of other orders" />
        <Stat label="Free incl. tentative" value={q(a.atp_stressed_qty)} hint="Also subtracts tentative holds" />
        <Stat label="On order (open POs)" value={q(a.on_order_net_qty)} />
        <Stat label="Linked to orders" value={q(a.hard_pegged_qty)} />
        <Stat label="Free incoming" value={q(a.free_inbound_qty)} />
        <Stat label="Waiting for QC" value={q(a.pending_qc_qty)} />
      </div>
      <p className="text-[11px] text-text-muted">
        Draft / submitted POs (not counted): {q(a.pending_po_qty)}. Earliest expected receipt: {formatDate(a.earliest_expected_date)}.
      </p>
      {a.po_lines.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs" aria-label="Open purchase orders">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-2 py-1 font-medium">PO</th>
                <th className="px-2 py-1 text-right font-medium">Ordered</th>
                <th className="px-2 py-1 text-right font-medium">Received (usable)</th>
                <th className="px-2 py-1 text-right font-medium">Still open</th>
                <th className="px-2 py-1 font-medium">Expected</th>
              </tr>
            </thead>
            <tbody>
              {a.po_lines.map((p) => (
                <tr key={p.purchase_order_item_id} className="border-b border-border/60">
                  <td className="px-2 py-1">{p.po_code}</td>
                  <td className="px-2 py-1 text-right">{q(p.ordered_qty)}</td>
                  <td className="px-2 py-1 text-right">{q(p.usable_received_qty)}</td>
                  <td className="px-2 py-1 text-right">{q(p.on_order_net_qty)}</td>
                  <td className="px-2 py-1">{formatDate(p.expected_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

/** Allocation run: preview many orders in priority order, then confirm. */
function AllocationRunCard({
  orderOptions,
  onDone,
  canAllocate,
}: {
  orderOptions: ControlTowerOrderRow[];
  onDone: () => void;
  canAllocate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AllocationKind>("HARD_ATP");
  const [scope, setScope] = useState<"all" | "window">("all");
  const [expiresOn, setExpiresOn] = useState(() => addDaysISO(todayLocalISO(), 30));
  const [preview, setPreview] = useState<AllocationRunPreview | null>(null);
  const [result, setResult] = useState<AllocationRunConfirmResult | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "confirm">("");
  const [error, setError] = useState("");
  const [staleNote, setStaleNote] = useState("");

  const expiryErr = kind === "TENTATIVE" ? expiryError(expiresOn, todayLocalISO()) : "";
  const ids = scope === "window" ? orderOptions.map((o) => o.order_id).slice(0, 200) : undefined;
  const body = () => ({
    kind,
    ...(ids ? { order_ids: ids } : {}),
    ...(kind === "TENTATIVE" ? { expires_at: endOfDayIso(expiresOn) } : {}),
  });

  const runPreview = async () => {
    setBusy("preview");
    setError("");
    setResult(null);
    try {
      setPreview(await mp.allocationRunPreview(body()));
    } catch (e) {
      logApiError("AllocationRunCard.preview", e);
      setPreview(null);
      setError(friendlyError(e));
    } finally {
      setBusy("");
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy("confirm");
    setError("");
    setStaleNote("");
    try {
      setResult(await mp.allocationRunConfirm({ ...body(), state_token: preview.state_token }));
      setPreview(null);
      onDone();
    } catch (e) {
      logApiError("AllocationRunCard.confirm", e);
      if (isStaleAllocation(e)) {
        setStaleNote("Stock or demand changed since your preview. The preview was refreshed - check it and confirm again.");
        setBusy("");
        await runPreview();
        return;
      }
      setError(friendlyError(e));
    } finally {
      setBusy("");
    }
  };

  const creating = preview?.orders.filter((o) => o.preview?.creates_anything).length ?? 0;

  return (
    <PanelCard testId="mfg-allocation-run" title="Allocation run (many orders)" subtitle="Allocates in priority order: orders in production first, then by plan start and delivery date.">
      <button type="button" className={secondaryBtn} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? "Hide allocation run" : "Open allocation run"}
      </button>
      {open ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="mfg-run-kind" className={labelCls}>
                Kind of hold
              </label>
              <select id="mfg-run-kind" className={inputCls} value={kind} onChange={(e) => { setKind(e.target.value as AllocationKind); setPreview(null); }}>
                <option value="HARD_ATP">{ALLOCATION_KIND_LABEL.HARD_ATP}</option>
                <option value="TENTATIVE">{ALLOCATION_KIND_LABEL.TENTATIVE}</option>
              </select>
            </div>
            <div>
              <label htmlFor="mfg-run-scope" className={labelCls}>
                Orders
              </label>
              <select id="mfg-run-scope" className={inputCls} value={scope} onChange={(e) => { setScope(e.target.value as "all" | "window"); setPreview(null); }}>
                <option value="all">Every open order (max 200)</option>
                <option value="window" disabled={orderOptions.length === 0}>
                  Only orders in the Control Tower window ({orderOptions.length})
                </option>
              </select>
            </div>
            {kind === "TENTATIVE" ? (
              <div>
                <label htmlFor="mfg-run-expires" className={labelCls}>
                  Tentative holds expire on
                </label>
                <input id="mfg-run-expires" type="date" className={inputCls} value={expiresOn} onChange={(e) => { setExpiresOn(e.target.value); setPreview(null); }} />
              </div>
            ) : null}
            <button type="button" className={secondaryBtn} disabled={busy !== "" || Boolean(expiryErr)} onClick={() => void runPreview()}>
              {busy === "preview" ? "Checking…" : "Preview run"}
            </button>
          </div>
          {expiryErr ? <p className="text-[11px] text-red-700">{expiryErr}</p> : null}
          {staleNote ? <NoticeBox tone="warn">{staleNote}</NoticeBox> : null}
          <ErrorBox message={error} />
          {preview ? (
            <div className="space-y-2" data-testid="mfg-run-preview">
              <p className="text-xs font-semibold text-text-primary">
                Preview only - nothing is saved yet. {creating} of {preview.orders.length} order(s) would get new holds or links.
                {preview.truncated ? " (List cut at 200 orders.)" : ""}
              </p>
              <ul className="space-y-1 text-xs">
                {preview.orders.map((o) => (
                  <li key={o.order_id} className="rounded border border-border bg-surface-subtle p-2">
                    <span className="font-medium">{o.order_code}</span>{" "}
                    {o.skipped_code ? (
                      <span className="text-amber-900">skipped: {o.skipped_message ?? reasonLabel(o.skipped_code)}</span>
                    ) : o.preview?.creates_anything ? (
                      <span>
                        {o.preview.lines.filter((l) => Number(l.hold_qty) > 0).length} hold(s),{" "}
                        {o.preview.lines.reduce((n, l) => n + l.pegs.length, 0)} PO link(s)
                      </span>
                    ) : (
                      <span className="text-text-muted">nothing to allocate</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={busy !== "" || creating === 0 || !canAllocate}
                  title={canAllocate ? undefined : "Confirming needs stock approval rights"}
                  onClick={() => void confirm()}
                >
                  {busy === "confirm" ? "Saving…" : "Confirm run"}
                </button>
                <button type="button" className={secondaryBtn} disabled={busy !== ""} onClick={() => setPreview(null)}>
                  Discard preview
                </button>
              </div>
            </div>
          ) : null}
          {result ? (
            <NoticeBox tone="good">
              Done: {result.results.filter((r) => r.status === "ALLOCATED").length} allocated, {result.results.filter((r) => r.status === "NOOP").length} unchanged,{" "}
              {result.results.filter((r) => r.status === "SKIPPED").length} skipped.
            </NoticeBox>
          ) : null}
        </div>
      ) : null}
    </PanelCard>
  );
}

function ConflictsCard() {
  const [tick, setTick] = useState(0);
  const conflicts = useMfgResource("MaterialsTab.conflicts", String(tick), () => mp.getConflicts(200));
  const items = conflicts.data?.items ?? [];
  return (
    <PanelCard
      testId="mfg-conflicts"
      title="Allocation problems"
      subtitle="Holds and links that no longer match orders, BOMs or stock. Fix them by releasing or re-allocating."
      loading={conflicts.loading}
      error={conflicts.error}
    >
      <button type="button" className={secondaryBtn} onClick={() => setTick((t) => t + 1)}>
        Check again
      </button>
      {conflicts.data && items.length === 0 ? <EmptyState>No problems found.</EmptyState> : null}
      {items.length > 0 ? (
        <ul className="space-y-1 text-xs">
          {items.map((c, i) => (
            <li key={`${c.code}-${c.reservation_id ?? ""}-${c.peg_id ?? ""}-${i}`} className="flex flex-wrap items-start gap-2 rounded border border-border bg-surface-subtle p-2">
              <Chip tone={conflictTone(c.severity)}>{c.severity}</Chip>
              <span className="font-medium">{reasonLabel(c.code)}</span>
              <span className="text-text-muted">
                {c.order_id ? `Order ${c.order_code ?? `#${c.order_id}`}` : ""}
                {c.item_id ? ` · ${c.item_name ?? c.item_code ?? `Item #${c.item_id}`}` : ""}
                {c.quantity ? ` · Qty ${q(c.quantity)}` : ""}
              </span>
              {c.detail ? <span className="w-full text-[11px] text-text-muted">{c.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {conflicts.data?.truncated ? <p className="text-[11px] text-amber-900">Only the first problems are shown.</p> : null}
    </PanelCard>
  );
}
