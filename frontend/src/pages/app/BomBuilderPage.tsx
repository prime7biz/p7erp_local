import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  type BomResponse,
  type BomDetailResponse,
  type StyleResponse,
  type InventoryItemResponse,
} from "@/api/client";

type WorkflowAction = "submit" | "approve" | "freeze";

export function BomBuilderPage() {
  const navigate = useNavigate();
  const [styles, setStyles] = useState<StyleResponse[]>([]);
  const [boms, setBoms] = useState<BomResponse[]>([]);
  const [selectedBom, setSelectedBom] = useState<BomDetailResponse | null>(null);
  const [styleId, setStyleId] = useState<number>(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [inventoryItems, setInventoryItems] = useState<InventoryItemResponse[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | "">("");
  const [itemDesc, setItemDesc] = useState("");
  const [baseConsumption, setBaseConsumption] = useState("0");
  const [wastagePct, setWastagePct] = useState("");
  const [generatePOModalOpen, setGeneratePOModalOpen] = useState(false);
  const [poQuantity, setPoQuantity] = useState("100");
  const [poSupplierName, setPoSupplierName] = useState("");
  const [generatingPO, setGeneratingPO] = useState(false);
  const [processingWorkflow, setProcessingWorkflow] = useState(false);
  const [workflowConfirmAction, setWorkflowConfirmAction] = useState<WorkflowAction | null>(null);
  const [activeWorkflowAction, setActiveWorkflowAction] = useState<WorkflowAction | null>(null);
  const [openActionsItemId, setOpenActionsItemId] = useState<number | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const workflowModalRef = useRef<HTMLDivElement | null>(null);
  const workflowCancelBtnRef = useRef<HTMLButtonElement | null>(null);

  const bomStatus = (selectedBom?.bom.status || "").toUpperCase();
  const isGovernedBom = bomStatus === "APPROVED" || bomStatus === "FROZEN";
  const canSubmitBom = bomStatus === "DRAFT";
  const canApproveBom = bomStatus === "SUBMITTED";
  const canFreezeBom = bomStatus === "APPROVED";

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!actionsRef.current) return;
      if (!actionsRef.current.contains(event.target as Node)) {
        setOpenActionsItemId(null);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(""), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!workflowConfirmAction) return;
    workflowCancelBtnRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!processingWorkflow) setWorkflowConfirmAction(null);
        return;
      }
      if (event.key !== "Tab") return;
      const root = workflowModalRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [workflowConfirmAction, processingWorkflow]);

  const bomStatusBadgeClass = (value: string) => {
    const status = (value || "").toUpperCase();
    if (status === "FROZEN") return "bg-status-info-subtle text-status-info-foreground border-status-info/25";
    if (status === "APPROVED") return "bg-status-success-subtle text-status-success-foreground border-status-success/25";
    if (status === "SUBMITTED") return "bg-status-warning-subtle text-status-warning-foreground border-status-warning/25";
    if (status === "REJECTED" || status === "CANCELLED") return "bg-status-danger-subtle text-status-danger-foreground border-status-danger/25";
    return "bg-status-neutral-subtle text-status-neutral-foreground border-border";
  };

  const load = async () => {
    try {
      const [styleRows, bomRows] = await Promise.all([api.listStyles(), api.listBoms()]);
      setStyles(styleRows);
      setBoms(bomRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load BOM data");
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const loadItems = async () => {
      try {
        const items = await api.listInventoryItems();
        setInventoryItems(items);
      } catch {
        setInventoryItems([]);
      }
    };
    loadItems();
  }, []);

  const openBom = async (id: number) => {
    const detail = await api.getBom(id);
    setSelectedBom(detail);
  };

  const runWorkflowAction = async (action: WorkflowAction) => {
    if (!selectedBom) return;
    setProcessingWorkflow(true);
    setActiveWorkflowAction(action);
    setError("");
    try {
      if (action === "submit") await api.submitBom(selectedBom.bom.id);
      if (action === "approve") await api.approveBom(selectedBom.bom.id);
      if (action === "freeze") await api.freezeBom(selectedBom.bom.id);
      await load();
      await openBom(selectedBom.bom.id);
      if (action === "submit") setSuccess("BOM submitted successfully.");
      if (action === "approve") setSuccess("BOM approved successfully.");
      if (action === "freeze") setSuccess("BOM frozen successfully.");
      setWorkflowConfirmAction(null);
    } catch (e) {
      if (action === "submit") setError(e instanceof Error ? e.message : "Failed to submit BOM");
      if (action === "approve") setError(e instanceof Error ? e.message : "Failed to approve BOM");
      if (action === "freeze") setError(e instanceof Error ? e.message : "Failed to freeze BOM");
    } finally {
      setProcessingWorkflow(false);
      setActiveWorkflowAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">BOM Governance</h1>
          <p className="text-sm text-text-muted mt-0.5">Create BOM versions, manage items, and move through governance workflow.</p>
        </div>
        <div className="flex gap-2">
          <select value={styleId || ""} onChange={(e) => setStyleId(Number(e.target.value) || 0)} className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary">
            <option value="">Select style…</option>
            {styles.map((s) => <option key={s.id} value={s.id}>{s.style_code} · {s.name}</option>)}
          </select>
          <button
            onClick={async () => {
              if (!styleId) return;
              setError("");
              try {
                await api.createBom({ style_id: styleId, status: "DRAFT", version_no: 1 });
                await load();
                setSuccess("New BOM created in DRAFT status.");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to create BOM");
              }
            }}
            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground"
          >
            New BOM
          </button>
        </div>
      </div>
      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error}</div>}
      {success && <div className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-3 text-sm text-status-success-foreground">{success}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-sm font-semibold text-text-primary">BOMs</div>
          <div className="divide-y divide-border-subtle">
            {boms.map((b) => (
              <button key={b.id} onClick={() => openBom(b.id)} className="w-full text-left px-4 py-2 text-sm hover:bg-surface-subtle">
                <span className="font-medium text-text-primary">BOM #{b.id}</span>
                <span className="text-text-muted"> · Style {b.style_id} · V{b.version_no}</span>
                <span className={`ml-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${bomStatusBadgeClass(b.status)}`}>
                  {(b.status || "DRAFT").toUpperCase()}
                </span>
              </button>
            ))}
            {boms.length === 0 && <div className="px-4 py-6 text-sm text-text-muted">No BOM yet.</div>}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3 overflow-x-auto">
          <h2 className="text-sm font-semibold text-text-primary">BOM Items</h2>
          {!selectedBom ? (
            <div className="text-sm text-text-muted">Select a BOM from the left.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-text-muted">
                  BOM #{selectedBom.bom.id} · Style {selectedBom.bom.style_id} · Status{" "}
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${bomStatusBadgeClass(bomStatus)}`}>
                    {bomStatus || "DRAFT"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canSubmitBom && (
                    <button
                      type="button"
                      disabled={processingWorkflow || workflowConfirmAction !== null}
                      onClick={() => setWorkflowConfirmAction("submit")}
                      className="rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-60"
                    >
                      {activeWorkflowAction === "submit" && processingWorkflow ? "Submitting..." : "Submit"}
                    </button>
                  )}
                  {canApproveBom && (
                    <button
                      type="button"
                      disabled={processingWorkflow || workflowConfirmAction !== null}
                      onClick={() => setWorkflowConfirmAction("approve")}
                      className="rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-60"
                    >
                      {activeWorkflowAction === "approve" && processingWorkflow ? "Approving..." : "Approve"}
                    </button>
                  )}
                  {canFreezeBom && (
                    <button
                      type="button"
                      disabled={processingWorkflow || workflowConfirmAction !== null}
                      onClick={() => setWorkflowConfirmAction("freeze")}
                      className="rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-60"
                    >
                      {activeWorkflowAction === "freeze" && processingWorkflow ? "Freezing..." : "Freeze"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!isGovernedBom}
                    onClick={() => setGeneratePOModalOpen(true)}
                    className="rounded-lg border border-brand-primary bg-surface-raised px-3 py-1.5 text-sm font-medium text-brand-primary hover:bg-brand-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                    title={!isGovernedBom ? "Only APPROVED/FROZEN BOM can generate purchase order." : undefined}
                  >
                    Generate purchase order
                  </button>
                </div>
              </div>
              {!isGovernedBom && (
                <div className="rounded-md border border-status-warning/20 bg-status-warning-subtle px-3 py-2 text-xs text-status-warning-foreground">
                  This BOM is not governed yet. Submit/Approve/Freeze it first to lock content and enable downstream execution.
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 items-end">
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-text-muted mb-0.5">Item (from inventory)</label>
                  <select
                    value={selectedItemId}
                    onChange={(e) => setSelectedItemId(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm"
                  >
                    <option value="">— Free text —</option>
                    {inventoryItems.map((it) => (
                      <option key={it.id} value={it.id}>{it.item_code} · {it.name}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-text-muted mb-0.5">Description (or override)</label>
                  <input
                    value={itemDesc}
                    onChange={(e) => setItemDesc(e.target.value)}
                    placeholder={selectedItemId ? "Optional override" : "Required if no item selected"}
                    className="w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm min-w-0"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-text-muted mb-0.5">Base consumption</label>
                  <input
                    type="text"
                    value={baseConsumption}
                    onChange={(e) => setBaseConsumption(e.target.value)}
                    placeholder="0"
                    className="w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-xs font-medium text-text-muted mb-0.5">Wastage %</label>
                  <input
                    type="text"
                    value={wastagePct}
                    onChange={(e) => setWastagePct(e.target.value)}
                    placeholder="0"
                    className="w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm"
                  />
                </div>
                <button
                  disabled={isGovernedBom}
                  onClick={async () => {
                    const hasItem = selectedItemId !== "";
                    const hasDesc = itemDesc.trim() !== "";
                    if (!hasItem && !hasDesc) return;
                    setError("");
                    try {
                      await api.createBomItem(selectedBom.bom.id, {
                        item_id: hasItem ? Number(selectedItemId) : undefined,
                        category: "MATERIAL",
                        description: hasDesc ? itemDesc.trim() : undefined,
                        base_consumption: baseConsumption.trim() || "0",
                        wastage_pct: wastagePct.trim() || undefined,
                      });
                      setSelectedItemId("");
                      setItemDesc("");
                      setBaseConsumption("0");
                      setWastagePct("");
                      await openBom(selectedBom.bom.id);
                      setSuccess("BOM line added successfully.");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Failed to add BOM item");
                    }
                  }}
                  className="rounded border border-border-strong px-3 py-1.5 text-sm font-medium text-text-secondary bg-surface-subtle hover:bg-surface-base shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add line
                </button>
              </div>
              {selectedBom.items.length === 0 ? (
                <div className="text-xs text-text-muted">No items yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[560px] w-full text-sm">
                    <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
                      <tr>
                        <th className="py-2 px-3">Item / Description</th>
                        <th className="py-2 px-3">Category</th>
                        <th className="py-2 px-3">UOM</th>
                        <th className="py-2 px-3">Consumption</th>
                        <th className="py-2 px-3">Wastage %</th>
                        <th className="py-2 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBom.items.map((i) => (
                        <tr key={i.id} className="border-b border-border-subtle last:border-0">
                          <td className="py-2 px-3 text-text-primary">
                            {i.item_id != null ? (
                              <span title={`Item #${i.item_id}`}>{i.item_code ?? i.description ?? "—"}</span>
                            ) : (
                              i.description || i.item_code || "—"
                            )}
                          </td>
                          <td className="py-2 px-3 text-text-secondary">{i.category ?? "—"}</td>
                          <td className="py-2 px-3 text-text-secondary">{i.uom ?? "—"}</td>
                          <td className="py-2 px-3 text-text-secondary">{i.base_consumption}</td>
                          <td className="py-2 px-3 text-text-secondary">{i.wastage_pct ?? "—"}</td>
                          <td className="py-2 px-3 text-right">
                            <div className="relative inline-block text-left" ref={openActionsItemId === i.id ? actionsRef : undefined}>
                              <button
                                type="button"
                                disabled={isGovernedBom}
                                onClick={() => setOpenActionsItemId((prev) => (prev === i.id ? null : i.id))}
                                className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Actions
                              </button>
                              {openActionsItemId === i.id && !isGovernedBom && (
                                <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        setError("");
                                        await api.deleteBomItem(selectedBom.bom.id, i.id);
                                        await openBom(selectedBom.bom.id);
                                        setSuccess("BOM line deleted successfully.");
                                      } finally {
                                        setOpenActionsItemId(null);
                                      }
                                    }}
                                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {generatePOModalOpen && selectedBom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !generatingPO && setGeneratePOModalOpen(false)}>
          <div
            className="rounded-xl border border-border bg-surface-raised p-5 shadow-lg w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-text-primary mb-3">Generate purchase order from BOM</h3>
            <p className="text-sm text-text-muted mb-4">
              Creates a draft PO with lines for each BOM item linked to inventory. Quantity × consumption × (1 + wastage %) per line.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Quantity (e.g. order qty)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={poQuantity}
                  onChange={(e) => setPoQuantity(e.target.value)}
                  className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Supplier name (optional)</label>
                <input
                  type="text"
                  value={poSupplierName}
                  onChange={(e) => setPoSupplierName(e.target.value)}
                  placeholder="From BOM"
                  className="w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !generatingPO && setGeneratePOModalOpen(false)}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={generatingPO || !poQuantity || Number(poQuantity) <= 0}
                onClick={async () => {
                  const qty = Number(poQuantity);
                  if (!Number.isFinite(qty) || qty <= 0) return;
                  setGeneratingPO(true);
                  setError("");
                  try {
                    const res = await api.generatePurchaseOrderFromBom(selectedBom.bom.id, {
                      quantity: qty,
                      supplier_name: poSupplierName.trim() || undefined,
                    });
                    setGeneratePOModalOpen(false);
                    navigate("/app/inventory/purchase-orders", { state: { createdPO: res } });
                    setPoQuantity("100");
                    setPoSupplierName("");
                    setGeneratingPO(false);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Failed to generate PO");
                    setGeneratingPO(false);
                  }
                }}
                className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-medium text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
              >
                {generatingPO ? "Generating…" : "Generate PO"}
              </button>
            </div>
          </div>
        </div>
      )}
      {workflowConfirmAction && selectedBom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !processingWorkflow && setWorkflowConfirmAction(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
            ref={workflowModalRef}
          >
            <h3 className="text-lg font-semibold text-text-primary mb-2">Confirm BOM workflow action</h3>
            <p className="text-sm text-text-secondary">
              You are about to{" "}
              <span className="font-semibold text-text-primary">
                {workflowConfirmAction === "submit" ? "submit" : workflowConfirmAction === "approve" ? "approve" : "freeze"}
              </span>{" "}
              BOM #{selectedBom.bom.id}. This will move it to the next governance stage.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={processingWorkflow}
                onClick={() => setWorkflowConfirmAction(null)}
                ref={workflowCancelBtnRef}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={processingWorkflow}
                onClick={() => runWorkflowAction(workflowConfirmAction)}
                className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-medium text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
              >
                {processingWorkflow
                  ? activeWorkflowAction === "submit"
                    ? "Submitting..."
                    : activeWorkflowAction === "approve"
                      ? "Approving..."
                      : "Freezing..."
                  : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
