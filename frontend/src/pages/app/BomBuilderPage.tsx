import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { OrderMilestoneTracker } from "@/components/app/OrderMilestoneTracker";
import { BomOrderSelector } from "@/components/merch/bom/BomOrderSelector";
import { BomHeaderSummary } from "@/components/merch/bom/BomHeaderSummary";
import { BomSummaryCards } from "@/components/merch/bom/BomSummaryCards";
import { BomMaterialsTable } from "@/components/merch/bom/BomMaterialsTable";
import { BomLineEditDrawer } from "@/components/merch/bom/BomLineEditDrawer";
import { BomLinePoDrawer } from "@/components/merch/bom/BomLinePoDrawer";
import { BomLinkedPosDrawer } from "@/components/merch/bom/BomLinkedPosDrawer";
import { useBomPage } from "@/components/merch/bom/useBomPage";
import type { OrderDrivenBomLine } from "@/api/client";

export function BomBuilderPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    detail,
    loading,
    error,
    success,
    setSuccess,
    setError,
    clearFlash,
    loadByOrderId,
    createFromOrder,
    refreshDetail,
    updateLine,
    addLine,
    deleteLine,
    submit,
    approve,
    reject,
    freeze,
    bulkPos,
  } = useBomPage();

  const [editLine, setEditLine] = useState<OrderDrivenBomLine | null>(null);
  const [poLine, setPoLine] = useState<OrderDrivenBomLine | null>(null);
  const [linkedLineId, setLinkedLineId] = useState<number | null>(null);
  const [savingLine, setSavingLine] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [existingOrderInput, setExistingOrderInput] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [manualNet, setManualNet] = useState("0");
  const [manualWastage, setManualWastage] = useState("0");
  const [manualLoss, setManualLoss] = useState("0");
  const [manualPrice, setManualPrice] = useState("0");

  const orderIdParam = Number(searchParams.get("orderId") || 0);
  const styleIdParam = Number(searchParams.get("styleId") || 0);

  useEffect(() => {
    if (!Number.isFinite(orderIdParam) || orderIdParam <= 0) return;
    void loadByOrderId(orderIdParam);
  }, [orderIdParam, loadByOrderId]);

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => setSuccess(""), 3500);
    return () => window.clearTimeout(t);
  }, [success, setSuccess]);

  const onSelectNewOrder = useCallback(
    async (orderId: number) => {
      clearFlash();
      await createFromOrder(orderId);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("orderId", String(orderId));
        return next;
      });
    },
    [clearFlash, createFromOrder, setSearchParams],
  );

  const openExisting = useCallback(async () => {
    const id = Number(existingOrderInput);
    if (!Number.isFinite(id) || id <= 0) {
      setError("Enter a valid order ID");
      return;
    }
    clearFlash();
    await loadByOrderId(id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("orderId", String(id));
      return next;
    });
  }, [existingOrderInput, loadByOrderId, clearFlash, setError, setSearchParams]);

  const bom = detail?.bom;
  const st = (bom?.status || "DRAFT").toUpperCase();

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">BOM Builder</h1>
            <p className="mt-0.5 text-sm text-text-muted">
              Create and govern <strong>order execution</strong> BOMs from confirmed orders (prefilled from quotation materials),
              then raise POs per line or by vendor. Reference BOMs for a style live on the style page (BOM tab).
            </p>
          </div>
        </div>
      </div>

      {styleIdParam > 0 && orderIdParam <= 0 ? (
        <div className="rounded-xl border border-status-warning/30 bg-status-warning-subtle/30 p-4 text-sm text-text-secondary">
          <p className="font-medium text-text-primary">Style reference BOM</p>
          <p className="mt-1">
            This URL includes <code className="rounded bg-surface-subtle px-1">styleId</code> but no order. The BOM builder is
            for <strong>order execution</strong> BOMs. Manage <strong>reference</strong> (style) BOMs from the style detail page.
          </p>
          <Link
            className="mt-2 inline-block text-sm font-medium text-status-info-foreground hover:underline"
            to={`/app/merchandising/styles/${styleIdParam}?tab=bom`}
          >
            Open style BOM tab →
          </Link>
        </div>
      ) : null}

      {orderIdParam > 0 && (
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <h2 className="mb-2 text-sm font-semibold text-text-primary">Order pipeline</h2>
          <OrderMilestoneTracker orderId={orderIdParam} variant="compact" className="max-w-xl" />
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <BomOrderSelector disabled={loading} onSelectOrderId={(id) => void onSelectNewOrder(id)} />
          <div>
            <label className="mb-0.5 block text-xs font-medium text-text-muted">Load existing order BOM</label>
            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                min={1}
                className="w-36 rounded-lg border border-border-strong px-2 py-2 text-sm"
                placeholder="Order ID"
                value={existingOrderInput}
                onChange={(e) => setExistingOrderInput(e.target.value)}
              />
              <button
                type="button"
                className="rounded-lg border border-border-strong px-3 py-2 text-sm hover:bg-surface-subtle disabled:opacity-50"
                disabled={loading}
                onClick={() => void openExisting()}
              >
                Load
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-3 text-sm text-status-success-foreground">
          {success}
        </div>
      )}

      {!bom ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          {loading ? "Loading…" : "Select an eligible order to create a BOM, or load an existing order by ID."}
        </div>
      ) : (
        <>
          <BomHeaderSummary bom={bom} isLegacy={bom.is_legacy} />
          <div className="sticky top-0 z-[2] flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-raised/95 p-3 backdrop-blur">
            {st === "DRAFT" && (
              <button
                type="button"
                disabled={loading}
                className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-medium text-brand-primary-foreground disabled:opacity-50"
                onClick={() => bom && void submit(bom.id)}
              >
                Submit
              </button>
            )}
            {st === "SUBMITTED" && (
              <>
                <button
                  type="button"
                  disabled={loading}
                  className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-medium text-brand-primary-foreground disabled:opacity-50"
                  onClick={() => bom && void approve(bom.id)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={loading}
                  className="rounded-lg border border-status-danger/30 px-3 py-1.5 text-sm text-status-danger-foreground disabled:opacity-50"
                  onClick={() => setRejectOpen(true)}
                >
                  Reject
                </button>
              </>
            )}
            {st === "APPROVED" && (
              <button
                type="button"
                disabled={loading}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-sm disabled:opacity-50"
                onClick={() => bom && void freeze(bom.id)}
              >
                Freeze
              </button>
            )}
            {(st === "APPROVED" || st === "FROZEN") && (
              <button
                type="button"
                disabled={loading}
                className="rounded-lg border border-brand-primary px-3 py-1.5 text-sm font-medium text-brand-primary disabled:opacity-50"
                onClick={() => setBulkConfirm(true)}
              >
                Bulk generate POs (by vendor)
              </button>
            )}
            {bom.order_id ? (
              <Link
                className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
                to={`/app/merchandising/consumption-reconciliation?orderId=${bom.order_id}`}
              >
                Reconciliation
              </Link>
            ) : null}
          </div>

          {detail && <BomSummaryCards summary={detail.summary} />}

          {st === "DRAFT" && (
            <div className="rounded-xl border border-border bg-surface-subtle/30 p-3">
              <div className="text-xs font-semibold text-text-secondary">Add manual line</div>
              <div className="mt-2 grid gap-2 md:grid-cols-6">
                <input
                  className="rounded border border-border-strong px-2 py-1.5 text-sm md:col-span-2"
                  placeholder="Description"
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                />
                <input
                  className="rounded border border-border-strong px-2 py-1.5 text-sm"
                  placeholder="Net / unit"
                  value={manualNet}
                  onChange={(e) => setManualNet(e.target.value)}
                />
                <input
                  className="rounded border border-border-strong px-2 py-1.5 text-sm"
                  placeholder="Wastage %"
                  value={manualWastage}
                  onChange={(e) => setManualWastage(e.target.value)}
                />
                <input
                  className="rounded border border-border-strong px-2 py-1.5 text-sm"
                  placeholder="Loss %"
                  value={manualLoss}
                  onChange={(e) => setManualLoss(e.target.value)}
                />
                <input
                  className="rounded border border-border-strong px-2 py-1.5 text-sm"
                  placeholder="Exp. unit price"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                />
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className="rounded-lg bg-surface-raised px-3 py-1.5 text-sm font-medium border border-border"
                  onClick={async () => {
                    clearFlash();
                    await addLine(bom.id, {
                      description: manualDesc.trim() || undefined,
                      bom_net_consumption_per_unit: Number(manualNet) || 0,
                      wastage_pct: Number(manualWastage) || 0,
                      process_loss_pct: Number(manualLoss) || 0,
                      bom_expected_unit_price: Number(manualPrice) || 0,
                      category: "MATERIAL",
                    });
                    setManualDesc("");
                  }}
                >
                  Add line
                </button>
              </div>
            </div>
          )}

          {detail && (
            <BomMaterialsTable
              lines={detail.items}
              bomStatus={bom.status}
              quotationId={bom.quotation_id}
              onEdit={setEditLine}
              onCreatePo={setPoLine}
              onViewPos={(line) => setLinkedLineId(line.id)}
              onDelete={async (line) => {
                if (!window.confirm("Delete this line?")) return;
                clearFlash();
                await deleteLine(bom.id, line.id);
              }}
            />
          )}
        </>
      )}

      <BomLineEditDrawer
        open={editLine != null}
        line={editLine}
        saving={savingLine}
        onClose={() => setEditLine(null)}
        onSave={async (patch) => {
          if (!editLine || !bom) return;
          setSavingLine(true);
          try {
            await updateLine(bom.id, editLine.id, patch);
            setEditLine(null);
          } finally {
            setSavingLine(false);
          }
        }}
      />

      <BomLinePoDrawer
        open={poLine != null}
        line={poLine}
        currencyDefault={bom?.currency_snapshot ?? null}
        onClose={() => setPoLine(null)}
        onCreated={() => {
          if (bom) void refreshDetail(bom.id);
          setSuccess("Purchase order created.");
        }}
      />

      <BomLinkedPosDrawer open={linkedLineId != null} lineId={linkedLineId} onClose={() => setLinkedLineId(null)} />

      {rejectOpen && bom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !loading && setRejectOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-text-primary">Reject BOM</h3>
            <textarea
              className="mt-2 w-full rounded-lg border border-border-strong p-2 text-sm"
              rows={3}
              placeholder="Comment for merchandising…"
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setRejectOpen(false)} disabled={loading}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-status-danger px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                disabled={loading}
                onClick={async () => {
                  await reject(bom.id, rejectComment);
                  setRejectOpen(false);
                  setRejectComment("");
                }}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkConfirm && bom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !loading && setBulkConfirm(false)}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-text-primary">Bulk generate draft POs?</h3>
            <p className="mt-1 text-sm text-text-muted">Creates one draft PO per preferred vendor for lines that are not yet procured.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setBulkConfirm(false)} disabled={loading}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-medium text-brand-primary-foreground disabled:opacity-50"
                disabled={loading}
                onClick={async () => {
                  setBulkConfirm(false);
                  await bulkPos(bom.id);
                }}
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
