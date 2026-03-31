import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { logApiError } from "@/utils/logApiError";
import { BomLineRow } from "@/components/merch/BomLineRow";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import {
  fetchInventoryItemPage,
  fetchVendorPage,
  hydrateInventoryItem,
  hydrateVendor,
} from "@/lib/remoteSelectFetchers";
import {
  api,
  type BomResponse,
  type BomDetailResponse,
  type StyleResponse,
  type InventoryItemResponse,
  type ConsumptionPlanResponse,
  type OrderResponse,
  type WastageReportRowResponse,
  type WastageSummaryResponse,
} from "@/api/client";

type WorkflowAction = "submit" | "approve" | "freeze";
type BomCommandTab = "bom_lines" | "procurement" | "consumption" | "wastage";

interface ConsumptionOrderSummaryRow {
  order: OrderResponse;
  hasPlan: boolean;
  plannedQty: number;
  issuedQty: number;
  remainingQty: number;
  snapshotLocked: boolean;
}

interface RecentGeneratedPO {
  id: number;
  po_code: string;
  created_at: string;
}

export function BomBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [styles, setStyles] = useState<StyleResponse[]>([]);
  const [stylesTotal, setStylesTotal] = useState<number | null>(null);
  const [boms, setBoms] = useState<BomResponse[]>([]);
  const [bomsTotal, setBomsTotal] = useState<number | null>(null);
  const [selectedBom, setSelectedBom] = useState<BomDetailResponse | null>(null);
  const [styleId, setStyleId] = useState<number>(0);
  const [styleQuery, setStyleQuery] = useState("");
  const [activeTab, setActiveTab] = useState<BomCommandTab>("bom_lines");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  /** Resolved inventory rows for BOM lines (default_cost / display); loaded per BOM, not full catalog. */
  const [itemDetailById, setItemDetailById] = useState<Map<number, InventoryItemResponse>>(() => new Map());
  const [consumptionPlans, setConsumptionPlans] = useState<ConsumptionPlanResponse[]>([]);
  const [consumptionPlansTotal, setConsumptionPlansTotal] = useState<number | null>(null);
  const [consumptionRows, setConsumptionRows] = useState<ConsumptionOrderSummaryRow[]>([]);
  const [pendingChangeRequests, setPendingChangeRequests] = useState(0);
  const [wastageRows, setWastageRows] = useState<WastageReportRowResponse[]>([]);
  const [wastageSummary, setWastageSummary] = useState<WastageSummaryResponse | null>(null);
  const [loadingConsumption, setLoadingConsumption] = useState(false);
  const [loadingWastage, setLoadingWastage] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | "">("");
  const [itemDesc, setItemDesc] = useState("");
  const [baseConsumption, setBaseConsumption] = useState("0");
  const [wastagePct, setWastagePct] = useState("");
  const [batchQty, setBatchQty] = useState("100");
  const [poQuantity, setPoQuantity] = useState("100");
  const [poSupplierName, setPoSupplierName] = useState("");
  const [poVendorId, setPoVendorId] = useState<number | "">("");
  const [generatingPO, setGeneratingPO] = useState(false);
  const [recentGeneratedPOs, setRecentGeneratedPOs] = useState<RecentGeneratedPO[]>([]);
  const [recentBOMDraftPOs, setRecentBOMDraftPOs] = useState<Array<{ id: number; po_code: string; status: string }>>([]);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editSelectedItemId, setEditSelectedItemId] = useState<number | "">("");
  const [editItemDesc, setEditItemDesc] = useState("");
  const [editBaseConsumption, setEditBaseConsumption] = useState("0");
  const [editWastagePct, setEditWastagePct] = useState("");
  const [processingWorkflow, setProcessingWorkflow] = useState(false);
  const [workflowConfirmAction, setWorkflowConfirmAction] = useState<WorkflowAction | null>(null);
  const [activeWorkflowAction, setActiveWorkflowAction] = useState<WorkflowAction | null>(null);
  const [openActionsItemId, setOpenActionsItemId] = useState<number | null>(null);
  const [openConsumptionRowActionsId, setOpenConsumptionRowActionsId] = useState<number | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const workflowModalRef = useRef<HTMLDivElement | null>(null);
  const workflowCancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const initialStyleIdRef = useRef<number | null>(null);
  const initialBomIdRef = useRef<number | null>(null);

  useEffect(() => {
    const styleFromQuery = Number(searchParams.get("styleId") || 0);
    const bomFromQuery = Number(searchParams.get("bomId") || 0);
    initialStyleIdRef.current = Number.isFinite(styleFromQuery) && styleFromQuery > 0 ? styleFromQuery : null;
    initialBomIdRef.current = Number.isFinite(bomFromQuery) && bomFromQuery > 0 ? bomFromQuery : null;
  }, [searchParams]);

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

  const parseNumber = (value: string | null | undefined) => {
    const parsed = Number(value ?? "");
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const formatNumber = (value: number, fractionDigits = 2) => {
    if (!Number.isFinite(value)) return "0";
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  };

  const filteredStyles = useMemo(() => {
    const q = styleQuery.trim().toLowerCase();
    if (!q) return styles;
    return styles.filter(
      (s) =>
        s.style_code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.buyer_style_ref || "").toLowerCase().includes(q),
    );
  }, [styles, styleQuery]);

  /** When line item_id links change under the same BOM id, refetch costs for the grid. */
  const bomItemsLinkSignature = useMemo(
    () =>
      selectedBom
        ? selectedBom.items
            .map((l) => `${l.id}:${l.item_id ?? ""}`)
            .sort()
            .join("|")
        : "",
    [selectedBom],
  );

  useEffect(() => {
    if (!selectedBom) return;
    const ids = [
      ...new Set(selectedBom.items.map((l) => l.item_id).filter((x): x is number => x != null)),
    ];
    if (ids.length === 0) return;
    let cancelled = false;
    void Promise.all(
      ids.map(async (id) => {
        try {
          const it = await api.getInventoryItem(id);
          return [id, it] as const;
        } catch {
          return null;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setItemDetailById((prev) => {
        const next = new Map(prev);
        for (const p of pairs) {
          if (p) next.set(p[0], p[1]);
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedBom, bomItemsLinkSignature]);

  const selectedStyle = useMemo(() => {
    const selectedStyleId = selectedBom?.bom.style_id ?? styleId;
    return styles.find((row) => row.id === selectedStyleId) ?? null;
  }, [selectedBom, styleId, styles]);

  const linkedLineCount = useMemo(() => {
    if (!selectedBom) return 0;
    return selectedBom.items.filter((item) => item.item_id != null).length;
  }, [selectedBom]);

  const computeRequiredQty = useCallback(
    (line: { base_consumption: string; wastage_pct: string | null }) => {
      const qty = parseNumber(batchQty);
      const base = parseNumber(line.base_consumption);
      const wastage = parseNumber(line.wastage_pct) / 100;
      return qty * base * (1 + wastage);
    },
    [batchQty],
  );

  const loadStylesAndMasters = useCallback(async () => {
    try {
      const styleList = await api.listStylesWithTotal({ limit: 500 });
      setStyles(styleList.rows);
      setStylesTotal(styleList.total);

      if (initialStyleIdRef.current && styleList.rows.some((s) => s.id === initialStyleIdRef.current)) {
        setStyleId(initialStyleIdRef.current);
      }
    } catch (e) {
      logApiError("BomBuilderPage.loadStylesAndMasters", e);
      setError(e instanceof Error ? e.message : "Failed to load BOM master data");
      setStylesTotal(null);
    }
  }, []);

  const openBom = useCallback(async (id: number) => {
    const detail = await api.getBom(id);
    setSelectedBom(detail);
  }, []);

  const loadBoms = useCallback(async () => {
    try {
      const list = await api.listBomsWithTotal(styleId ? { style_id: styleId } : undefined);
      setBoms(list.rows);
      setBomsTotal(list.total);
      if (list.rows.length === 0) {
        setSelectedBom(null);
        return;
      }

      const preferredBomId = initialBomIdRef.current;
      if (preferredBomId && list.rows.some((r) => r.id === preferredBomId)) {
        await openBom(preferredBomId);
        initialBomIdRef.current = null;
        return;
      }

      if (!selectedBom || !list.rows.some((r) => r.id === selectedBom.bom.id)) {
        const first = list.rows[0];
        if (first) await openBom(first.id);
      }
    } catch (e) {
      logApiError("BomBuilderPage.loadBoms", e);
      setError(e instanceof Error ? e.message : "Failed to load BOM data");
      setBomsTotal(null);
    }
  }, [openBom, selectedBom, styleId]);

  const loadProcurementSnapshot = useCallback(async () => {
    if (!selectedBom) return;
    try {
      const linkedPOs = await api.listPurchaseOrders({ source_bom_id: selectedBom.bom.id });
      const matched = linkedPOs.slice(0, 8).map((po) => ({ id: po.id, po_code: po.po_code, status: po.status }));
      setRecentBOMDraftPOs(matched);
    } catch {
      setRecentBOMDraftPOs([]);
    }
  }, [selectedBom]);

  const loadConsumptionSnapshot = useCallback(async () => {
    if (!selectedBom) return;
    setLoadingConsumption(true);
    try {
      const [allOrders, allPlansWithTotal, pendingCR] = await Promise.all([
        api.listOrders({ limit: 200 }),
        api.listConsumptionPlansWithTotal({ limit: 500, offset: 0 }),
        api.listConsumptionChangeRequests({ status_filter: "PENDING" }),
      ]);
      const allPlans = allPlansWithTotal.rows;
      const styleOrders = allOrders.filter((order) => order.style_id === selectedBom.bom.style_id);
      const planOrderIds = new Set(allPlans.map((plan) => plan.order_id));

      const rows = await Promise.all(
        styleOrders.slice(0, 12).map(async (order) => {
          try {
            const [reservations, snapshot] = await Promise.all([
              api.getConsumptionReservations(order.id),
              api.getConsumptionSnapshot(order.id),
            ]);
            const plannedQty = reservations.reduce((sum, row) => sum + row.reserved_qty, 0);
            const issuedQty = reservations.reduce((sum, row) => sum + row.issued_qty, 0);
            const remainingQty = reservations.reduce((sum, row) => sum + row.remaining_qty, 0);
            return {
              order,
              hasPlan: planOrderIds.has(order.id),
              plannedQty,
              issuedQty,
              remainingQty,
              snapshotLocked: Boolean(snapshot.snapshot_locked),
            } satisfies ConsumptionOrderSummaryRow;
          } catch {
            return {
              order,
              hasPlan: planOrderIds.has(order.id),
              plannedQty: 0,
              issuedQty: 0,
              remainingQty: 0,
              snapshotLocked: false,
            } satisfies ConsumptionOrderSummaryRow;
          }
        }),
      );

      const styleOrderIds = new Set(styleOrders.map((order) => order.id));
      const stylePendingCRCount = pendingCR.filter((row) => styleOrderIds.has(row.order_id)).length;

      setOrders(styleOrders);
      setConsumptionPlans(allPlans);
      setConsumptionPlansTotal(allPlansWithTotal.total);
      setConsumptionRows(rows);
      setPendingChangeRequests(stylePendingCRCount);
    } catch (e) {
      logApiError("BomBuilderPage.loadConsumptionSnapshot", e);
      setError(e instanceof Error ? e.message : "Failed to load consumption snapshot");
      setConsumptionRows([]);
      setConsumptionPlansTotal(null);
      setPendingChangeRequests(0);
    } finally {
      setLoadingConsumption(false);
    }
  }, [selectedBom]);

  useEffect(() => {
    void loadStylesAndMasters();
  }, [loadStylesAndMasters]);

  useEffect(() => {
    void loadBoms();
  }, [loadBoms]);

  const loadWastageSnapshot = useCallback(async () => {
    if (!selectedBom) return;
    setLoadingWastage(true);
    try {
      const [reportRows, summary] = await Promise.all([
        api.getWastageReport({ style_id: selectedBom.bom.style_id }),
        api.getWastageSummary({ style_id: selectedBom.bom.style_id }),
      ]);
      setWastageRows(reportRows.slice(0, 12));
      setWastageSummary(summary);
    } catch (e) {
      logApiError("BomBuilderPage.loadWastageSnapshot", e);
      setError(e instanceof Error ? e.message : "Failed to load wastage summary");
      setWastageRows([]);
      setWastageSummary(null);
    } finally {
      setLoadingWastage(false);
    }
  }, [selectedBom]);

  useEffect(() => {
    if (!selectedBom) return;
    if (activeTab === "procurement") void loadProcurementSnapshot();
    if (activeTab === "consumption") void loadConsumptionSnapshot();
    if (activeTab === "wastage") void loadWastageSnapshot();
  }, [activeTab, selectedBom, loadConsumptionSnapshot, loadProcurementSnapshot, loadWastageSnapshot]);

  const runWorkflowAction = async (action: WorkflowAction) => {
    if (!selectedBom) return;
    setProcessingWorkflow(true);
    setActiveWorkflowAction(action);
    setError("");
    try {
      if (action === "submit") await api.submitBom(selectedBom.bom.id);
      if (action === "approve") await api.approveBom(selectedBom.bom.id);
      if (action === "freeze") await api.freezeBom(selectedBom.bom.id);
      await loadBoms();
      await openBom(selectedBom.bom.id);
      if (action === "submit") setSuccess("BOM submitted successfully.");
      if (action === "approve") setSuccess("BOM approved successfully.");
      if (action === "freeze") setSuccess("BOM frozen successfully.");
      setWorkflowConfirmAction(null);
    } catch (e) {
      logApiError("BomBuilderPage.runWorkflowAction", e);
      if (action === "submit") setError(e instanceof Error ? e.message : "Failed to submit BOM");
      if (action === "approve") setError(e instanceof Error ? e.message : "Failed to approve BOM");
      if (action === "freeze") setError(e instanceof Error ? e.message : "Failed to freeze BOM");
    } finally {
      setProcessingWorkflow(false);
      setActiveWorkflowAction(null);
    }
  };

  const startEditingLine = (lineId: number) => {
    if (!selectedBom) return;
    const row = selectedBom.items.find((item) => item.id === lineId);
    if (!row) return;
    setEditingItemId(row.id);
    setEditSelectedItemId(row.item_id ?? "");
    setEditItemDesc(row.description ?? "");
    setEditBaseConsumption(row.base_consumption || "0");
    setEditWastagePct(row.wastage_pct ?? "");
    setOpenActionsItemId(null);
  };

  const resetEditForm = () => {
    setEditingItemId(null);
    setEditSelectedItemId("");
    setEditItemDesc("");
    setEditBaseConsumption("0");
    setEditWastagePct("");
  };

  const expectedValue = useMemo(() => wastageRows.reduce((sum, row) => sum + row.expected_qty, 0), [wastageRows]);
  const actualValue = useMemo(() => wastageRows.reduce((sum, row) => sum + row.actual_qty, 0), [wastageRows]);
  const efficiencyPct = expectedValue > 0 ? (actualValue / expectedValue) * 100 : 0;
  const bomItemsWithInventory = useMemo(
    () => (selectedBom?.items ?? []).filter((line) => line.item_id != null),
    [selectedBom],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">BOM Command Center</h1>
            <p className="mt-0.5 text-sm text-text-muted">
              Design materials, prepare procurement, and control usage and wastage from one place.
            </p>
            <div className="mt-2 text-xs text-text-muted">
              {selectedStyle ? `${selectedStyle.style_code} · ${selectedStyle.name}` : "Select a style to begin"}{" "}
              {selectedBom ? (
                <>
                  · BOM #{selectedBom.bom.id} · V{selectedBom.bom.version_no}
                </>
              ) : null}
              <span className="ml-2">· Styles loaded: {styles.length}{stylesTotal != null ? ` / ${stylesTotal}` : ""}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-0.5 block text-xs font-medium text-text-muted">Style</label>
              <input
                type="search"
                placeholder="Filter styles…"
                value={styleQuery}
                onChange={(e) => setStyleQuery(e.target.value)}
                className="mb-1.5 block w-full min-w-64 rounded-lg border border-border-strong bg-surface-raised px-3 py-1.5 text-xs text-text-primary"
              />
              <select
                value={styleId || ""}
                onChange={(e) => {
                  setStyleId(Number(e.target.value) || 0);
                  setSelectedBom(null);
                  setEditingItemId(null);
                }}
                className="min-w-64 rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary"
              >
                <option value="">Select style…</option>
                {filteredStyles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.style_code} · {s.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={async () => {
                if (!styleId) return;
                setError("");
                try {
                  const styleBoms = boms.filter((row) => row.style_id === styleId);
                  const nextVersion = styleBoms.reduce((maxVersion, row) => Math.max(maxVersion, row.version_no), 0) + 1;
                  await api.createBom({ style_id: styleId, status: "DRAFT", version_no: nextVersion });
                  await loadBoms();
                  setSuccess("New BOM created in DRAFT status.");
                } catch (e) {
                  logApiError("BomBuilderPage.createBom", e);
                  setError(e instanceof Error ? e.message : "Failed to create BOM");
                }
              }}
              className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground"
            >
              New BOM
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error}</div>}
      {success && <div className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-3 text-sm text-status-success-foreground">{success}</div>}

      <div className="rounded-xl border border-border bg-surface-raised p-2">
        <div className="flex flex-wrap gap-2">
          {([
            ["bom_lines", "BOM Lines"],
            ["procurement", "Procurement"],
            ["consumption", "Consumption"],
            ["wastage", "Wastage"],
          ] as Array<[BomCommandTab, string]>).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === tab ? "bg-brand-primary text-brand-primary-foreground" : "border border-border-strong text-text-secondary"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-sm font-semibold text-text-primary">
            BOM versions
            <span className="ml-2 text-xs font-normal text-text-muted">
              {boms.length}
              {bomsTotal != null ? ` / ${bomsTotal}` : ""}
            </span>
          </div>
          <div className="max-h-[640px] overflow-y-auto divide-y divide-border-subtle">
            {boms.map((b) => (
              <button
                key={b.id}
                onClick={() => void openBom(b.id)}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-surface-subtle ${selectedBom?.bom.id === b.id ? "bg-brand-primary/5" : ""}`}
              >
                <span className="font-medium text-text-primary">BOM #{b.id}</span>
                <span className="text-text-muted"> · V{b.version_no}</span>
                <span className={`ml-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${bomStatusBadgeClass(b.status)}`}>
                  {(b.status || "DRAFT").toUpperCase()}
                </span>
              </button>
            ))}
            {boms.length === 0 && <div className="px-4 py-6 text-sm text-text-muted">No BOM found for this selection.</div>}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-4 overflow-x-auto">
          {!selectedBom ? (
            <div className="text-sm text-text-muted">Select a BOM from the left panel.</div>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-surface-subtle/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-text-muted">
                    BOM #{selectedBom.bom.id} · Style {selectedBom.bom.style_id} · Status{" "}
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${bomStatusBadgeClass(bomStatus)}`}>
                      {bomStatus || "DRAFT"}
                    </span>
                    <span className="ml-2">Linked lines: {linkedLineCount}/{selectedBom.items.length}</span>
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
                      onClick={() => setActiveTab("procurement")}
                      className="rounded-lg border border-brand-primary bg-surface-raised px-3 py-1.5 text-sm font-medium text-brand-primary hover:bg-brand-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                      title={!isGovernedBom ? "Only APPROVED/FROZEN BOM can generate purchase order." : undefined}
                    >
                      Generate purchase order
                    </button>
                  </div>
                </div>
              </div>

              {!isGovernedBom && (
                <div className="rounded-md border border-status-warning/20 bg-status-warning-subtle px-3 py-2 text-xs text-status-warning-foreground">
                  This BOM is not governed yet. Submit/Approve/Freeze it first to lock content and enable downstream execution.
                </div>
              )}

              {activeTab === "bom_lines" && (
                <>
                  <div className="rounded-xl border border-border bg-surface-raised p-3">
                    <div className="mb-2 text-xs font-semibold text-text-secondary">Add BOM line</div>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
                      <div className="xl:col-span-2">
                        <label className="mb-0.5 block text-xs font-medium text-text-muted">Item (inventory)</label>
                        <RemoteSearchSelect
                          value={selectedItemId}
                          onChange={(id) => setSelectedItemId(id)}
                          placeholder="Search code or name…"
                          fetchPage={fetchInventoryItemPage}
                          hydrateById={hydrateInventoryItem}
                          pageSize={40}
                        />
                      </div>
                      <div className="xl:col-span-2">
                        <label className="mb-0.5 block text-xs font-medium text-text-muted">Description (optional override)</label>
                        <input
                          value={itemDesc}
                          onChange={(e) => setItemDesc(e.target.value)}
                          placeholder={selectedItemId ? "Optional override" : "Required if no item selected"}
                          className="w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-text-muted">Base consumption</label>
                        <input
                          type="text"
                          value={baseConsumption}
                          onChange={(e) => setBaseConsumption(e.target.value)}
                          placeholder="0"
                          className="w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-text-muted">Wastage %</label>
                        <input
                          type="text"
                          value={wastagePct}
                          onChange={(e) => setWastagePct(e.target.value)}
                          placeholder="0"
                          className="w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm"
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex justify-end">
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
                            logApiError("BomBuilderPage.createBomItem", e);
                            setError(e instanceof Error ? e.message : "Failed to add BOM item");
                          }
                        }}
                        className="rounded border border-border-strong bg-surface-subtle px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-base disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add line
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-text-primary">BOM line grid</h2>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-text-muted">Batch qty preview</label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={batchQty}
                        onChange={(e) => setBatchQty(e.target.value)}
                        className="w-28 rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>

                  {editingItemId != null && (
                    <div className="rounded-xl border border-border bg-surface-subtle/40 p-3">
                      <div className="mb-2 text-xs font-semibold text-text-secondary">Edit BOM line</div>
                      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
                        <div className="xl:col-span-2">
                          <label className="mb-0.5 block text-xs font-medium text-text-muted">Item (inventory)</label>
                          <RemoteSearchSelect
                            value={editSelectedItemId}
                            onChange={(id) => setEditSelectedItemId(id)}
                            placeholder="Search or clear for free text…"
                            fetchPage={fetchInventoryItemPage}
                            hydrateById={hydrateInventoryItem}
                            pageSize={40}
                          />
                        </div>
                        <div className="xl:col-span-2">
                          <label className="mb-0.5 block text-xs font-medium text-text-muted">Description</label>
                          <input
                            value={editItemDesc}
                            onChange={(e) => setEditItemDesc(e.target.value)}
                            className="w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-xs font-medium text-text-muted">Base consumption</label>
                          <input
                            value={editBaseConsumption}
                            onChange={(e) => setEditBaseConsumption(e.target.value)}
                            className="w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-xs font-medium text-text-muted">Wastage %</label>
                          <input
                            value={editWastagePct}
                            onChange={(e) => setEditWastagePct(e.target.value)}
                            className="w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm"
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={resetEditForm}
                          className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isGovernedBom}
                          onClick={async () => {
                            if (editingItemId == null) return;
                            const hasItem = editSelectedItemId !== "";
                            const hasDesc = editItemDesc.trim() !== "";
                            if (!hasItem && !hasDesc) return;
                            setError("");
                            try {
                              await api.updateBomItem(selectedBom.bom.id, editingItemId, {
                                item_id: hasItem ? Number(editSelectedItemId) : undefined,
                                category: "MATERIAL",
                                description: hasDesc ? editItemDesc.trim() : undefined,
                                base_consumption: editBaseConsumption.trim() || "0",
                                wastage_pct: editWastagePct.trim() || undefined,
                              });
                              await openBom(selectedBom.bom.id);
                              resetEditForm();
                              setSuccess("BOM line updated successfully.");
                            } catch (e) {
                              logApiError("BomBuilderPage.updateBomItem", e);
                              setError(e instanceof Error ? e.message : "Failed to update BOM item");
                            }
                          }}
                          className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-brand-primary-foreground disabled:opacity-50"
                        >
                          Save changes
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedBom.items.length === 0 ? (
                    <div className="text-xs text-text-muted">No items yet.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-[900px] w-full text-sm">
                        <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
                          <tr>
                            <th className="px-3 py-2">Item / Description</th>
                            <th className="px-3 py-2">Category</th>
                            <th className="px-3 py-2">UOM</th>
                            <th className="px-3 py-2">Base Cons.</th>
                            <th className="px-3 py-2">Wastage %</th>
                            <th className="px-3 py-2">Required Qty</th>
                            <th className="px-3 py-2">Est. Cost</th>
                            <th className="px-3 py-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedBom.items.map((line) => {
                            const requiredQty = computeRequiredQty(line);
                            const linkedItem = line.item_id != null ? itemDetailById.get(line.item_id) : undefined;
                            const unitCost = parseNumber(linkedItem?.default_cost || "0");
                            const estCost = requiredQty * unitCost;
                            return (
                              <BomLineRow
                                key={line.id}
                                line={line}
                                requiredQty={requiredQty}
                                estimatedCost={estCost}
                                isGovernedBom={isGovernedBom}
                                isActionsOpen={openActionsItemId === line.id}
                                actionsRef={actionsRef}
                                onToggleActions={(lineId) => setOpenActionsItemId((prev) => (prev === lineId ? null : lineId))}
                                onEdit={startEditingLine}
                                onDelete={async (lineId) => {
                                  try {
                                    setError("");
                                    await api.deleteBomItem(selectedBom.bom.id, lineId);
                                    await openBom(selectedBom.bom.id);
                                    setSuccess("BOM line deleted successfully.");
                                  } finally {
                                    setOpenActionsItemId(null);
                                  }
                                }}
                                formatNumber={formatNumber}
                              />
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {activeTab === "procurement" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-surface-raised p-3">
                    <h2 className="text-sm font-semibold text-text-primary">Generate draft purchase order</h2>
                    <p className="mt-1 text-xs text-text-muted">
                      Quantities use BOM formula: quantity × base consumption × (1 + wastage %).
                    </p>
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-text-muted">Quantity</label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={poQuantity}
                          onChange={(e) => setPoQuantity(e.target.value)}
                          className="w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-text-muted">Vendor (optional)</label>
                        <RemoteSearchSelect
                          value={poVendorId}
                          onChange={(id) => setPoVendorId(id)}
                          placeholder="Search vendor code or name…"
                          fetchPage={fetchVendorPage}
                          hydrateById={hydrateVendor}
                          pageSize={40}
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-xs font-medium text-text-muted">Supplier name fallback</label>
                        <input
                          type="text"
                          value={poSupplierName}
                          onChange={(e) => setPoSupplierName(e.target.value)}
                          placeholder="From BOM"
                          className="w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <Link
                        to="/app/inventory/purchase-orders"
                        className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-subtle"
                      >
                        View all purchase orders
                      </Link>
                      <button
                        type="button"
                        disabled={generatingPO || !isGovernedBom || Number(poQuantity) <= 0}
                        onClick={async () => {
                          const qty = Number(poQuantity);
                          if (!Number.isFinite(qty) || qty <= 0) return;
                          setGeneratingPO(true);
                          setError("");
                          try {
                            const res = await api.generatePurchaseOrderFromBom(selectedBom.bom.id, {
                              quantity: qty,
                              supplier_name: poSupplierName.trim() || undefined,
                              vendor_id: poVendorId === "" ? undefined : Number(poVendorId),
                            });
                            setRecentGeneratedPOs((prev) => [{ ...res, created_at: new Date().toISOString() }, ...prev].slice(0, 8));
                            await loadProcurementSnapshot();
                            setSuccess(`Draft PO ${res.po_code} generated successfully.`);
                            navigate("/app/inventory/purchase-orders", { state: { createdPO: res } });
                          } catch (e) {
                            logApiError("BomBuilderPage.generatePurchaseOrder", e);
                            setError(e instanceof Error ? e.message : "Failed to generate PO");
                          } finally {
                            setGeneratingPO(false);
                          }
                        }}
                        className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-brand-primary-foreground disabled:opacity-50"
                      >
                        {generatingPO ? "Generating..." : "Generate draft PO"}
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-surface-raised p-3">
                    <h3 className="text-sm font-semibold text-text-primary">PO preview from BOM</h3>
                    {bomItemsWithInventory.length === 0 ? (
                      <div className="mt-2 text-xs text-text-muted">No BOM lines linked to inventory items.</div>
                    ) : (
                      <div className="mt-2 overflow-x-auto">
                        <table className="min-w-[680px] w-full text-sm">
                          <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
                            <tr>
                              <th className="px-3 py-2">Item</th>
                              <th className="px-3 py-2">UOM</th>
                              <th className="px-3 py-2">Preview qty</th>
                              <th className="px-3 py-2">Unit cost</th>
                              <th className="px-3 py-2">Line value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bomItemsWithInventory.map((line) => {
                              const requiredQty = computeRequiredQty(line);
                              const linkedItem = line.item_id != null ? itemDetailById.get(line.item_id) : undefined;
                              const unitCost = parseNumber(linkedItem?.default_cost || "0");
                              return (
                                <tr key={line.id} className="border-b border-border-subtle last:border-0">
                                  <td className="px-3 py-2">{line.item_code ?? line.description ?? `Item #${line.item_id}`}</td>
                                  <td className="px-3 py-2">{line.uom ?? "—"}</td>
                                  <td className="px-3 py-2">{formatNumber(requiredQty, 4)}</td>
                                  <td className="px-3 py-2">{formatNumber(unitCost, 2)}</td>
                                  <td className="px-3 py-2">{formatNumber(unitCost * requiredQty, 2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-border bg-surface-raised p-3">
                      <h3 className="text-sm font-semibold text-text-primary">Recent generated POs (this session)</h3>
                      {recentGeneratedPOs.length === 0 ? (
                        <p className="mt-2 text-xs text-text-muted">No PO generated yet in this session.</p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {recentGeneratedPOs.map((po) => (
                            <div key={po.id} className="flex items-center justify-between rounded border border-border-subtle px-3 py-2">
                              <span className="text-sm text-text-primary">{po.po_code}</span>
                              <Link className="text-xs text-brand-primary hover:underline" to="/app/inventory/purchase-orders">
                                View
                              </Link>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-border bg-surface-raised p-3">
                      <h3 className="text-sm font-semibold text-text-primary">Existing POs for this BOM</h3>
                      {recentBOMDraftPOs.length === 0 ? (
                        <p className="mt-2 text-xs text-text-muted">No linked PO found by BOM note signature.</p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {recentBOMDraftPOs.map((po) => (
                            <div key={po.id} className="flex items-center justify-between rounded border border-border-subtle px-3 py-2">
                              <span className="text-sm text-text-primary">{po.po_code}</span>
                              <span className="text-xs text-text-muted">{po.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "consumption" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-surface-raised p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-text-primary">Consumption control snapshot</h2>
                      <Link to="/app/inventory/consumption-control" className="text-xs text-brand-primary hover:underline">
                        Open full consumption control
                      </Link>
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      Orders linked to this style: {orders.length} · Plans found: {consumptionPlans.filter((row) => orders.some((o) => o.id === row.order_id)).length}
                      {consumptionPlansTotal != null ? ` / ${consumptionPlansTotal}` : ""} · Pending change requests: {pendingChangeRequests}
                    </p>
                  </div>

                  {loadingConsumption ? (
                    <div className="text-sm text-text-muted">Loading consumption data...</div>
                  ) : consumptionRows.length === 0 ? (
                    <div className="text-sm text-text-muted">No order consumption data available for this style.</div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
                      <table className="min-w-[780px] w-full text-sm">
                        <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
                          <tr>
                            <th className="px-3 py-2">Order</th>
                            <th className="px-3 py-2">Plan</th>
                            <th className="px-3 py-2">Snapshot</th>
                            <th className="px-3 py-2">Planned qty</th>
                            <th className="px-3 py-2">Issued qty</th>
                            <th className="px-3 py-2">Remaining qty</th>
                            <th className="px-3 py-2 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {consumptionRows.map((row) => (
                            <tr key={row.order.id} className="border-b border-border-subtle last:border-0">
                              <td className="px-3 py-2">{row.order.order_code}</td>
                              <td className="px-3 py-2">{row.hasPlan ? "Yes" : "No"}</td>
                              <td className="px-3 py-2">{row.snapshotLocked ? "Locked" : "Open"}</td>
                              <td className="px-3 py-2">{formatNumber(row.plannedQty, 3)}</td>
                              <td className="px-3 py-2">{formatNumber(row.issuedQty, 3)}</td>
                              <td className="px-3 py-2">{formatNumber(row.remainingQty, 3)}</td>
                              <td className="px-3 py-2 text-right relative">
                                <button
                                  type="button"
                                  className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                  onClick={() =>
                                    setOpenConsumptionRowActionsId((id) =>
                                      id === row.order.id ? null : row.order.id
                                    )
                                  }
                                >
                                  Actions
                                </button>
                                {openConsumptionRowActionsId === row.order.id && (
                                  <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg text-left">
                                    <Link
                                      to={`/app/merchandising/consumption-reconciliation?orderId=${row.order.id}`}
                                      className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                                      onClick={() => setOpenConsumptionRowActionsId(null)}
                                    >
                                      Reconciliation
                                    </Link>
                                    <Link
                                      to={`/app/inventory/consumption-control?orderId=${row.order.id}`}
                                      className="block rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                                      onClick={() => setOpenConsumptionRowActionsId(null)}
                                    >
                                      Consumption control
                                    </Link>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "wastage" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-border bg-surface-raised p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-text-primary">Wastage & efficiency</h2>
                      <Link
                        to={`/app/merchandising/wastage-report?style_id=${selectedBom.bom.style_id}`}
                        className="text-xs text-brand-primary hover:underline"
                      >
                        Open full wastage report
                      </Link>
                    </div>
                    <div className="mt-2 grid gap-3 md:grid-cols-3">
                      <div className="rounded border border-border p-3">
                        <div className="text-xs text-text-muted">Total wastage value</div>
                        <div className="mt-1 text-lg font-semibold text-text-primary">{formatNumber(wastageSummary?.total_wastage_value ?? 0, 2)}</div>
                      </div>
                      <div className="rounded border border-border p-3">
                        <div className="text-xs text-text-muted">Avg fabric wastage %</div>
                        <div className="mt-1 text-lg font-semibold text-text-primary">{formatNumber(wastageSummary?.fabric_wastage_pct_avg ?? 0, 2)}%</div>
                      </div>
                      <div className="rounded border border-border p-3">
                        <div className="text-xs text-text-muted">Orders above threshold</div>
                        <div className="mt-1 text-lg font-semibold text-text-primary">{wastageSummary?.above_threshold_orders_count ?? 0}</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-xs text-text-muted">
                        <span>Procurement efficiency (actual / planned)</span>
                        <span>{formatNumber(efficiencyPct, 2)}%</span>
                      </div>
                      <div className="h-2 rounded bg-surface-subtle">
                        <div
                          className={`h-2 rounded ${efficiencyPct <= 100 ? "bg-status-success" : "bg-status-warning"}`}
                          style={{ width: `${Math.min(100, Math.max(0, efficiencyPct))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {loadingWastage ? (
                    <div className="text-sm text-text-muted">Loading wastage data...</div>
                  ) : wastageRows.length === 0 ? (
                    <div className="text-sm text-text-muted">No wastage records available for this style.</div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
                      <table className="min-w-[980px] w-full text-sm">
                        <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
                          <tr>
                            <th className="px-3 py-2">Order</th>
                            <th className="px-3 py-2">Item</th>
                            <th className="px-3 py-2">Category</th>
                            <th className="px-3 py-2">Expected</th>
                            <th className="px-3 py-2">Actual</th>
                            <th className="px-3 py-2">Wastage %</th>
                            <th className="px-3 py-2">Wastage value</th>
                            <th className="px-3 py-2">Threshold</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wastageRows.map((row) => (
                            <tr key={`${row.order_id}-${row.item_id}`} className="border-b border-border-subtle last:border-0">
                              <td className="px-3 py-2">{row.order_code}</td>
                              <td className="px-3 py-2">{row.item_code} · {row.item_name}</td>
                              <td className="px-3 py-2">{row.category}</td>
                              <td className="px-3 py-2">{formatNumber(row.expected_qty, 3)}</td>
                              <td className="px-3 py-2">{formatNumber(row.actual_qty, 3)}</td>
                              <td className="px-3 py-2">{formatNumber(row.wastage_pct_vs_bom, 2)}%</td>
                              <td className="px-3 py-2">{formatNumber(row.wastage_value, 2)}</td>
                              <td className="px-3 py-2">
                                {row.threshold_breach ? (
                                  <span className="rounded bg-status-warning-subtle px-2 py-0.5 text-xs text-status-warning-foreground">Above</span>
                                ) : (
                                  <span className="rounded bg-status-success-subtle px-2 py-0.5 text-xs text-status-success-foreground">Within</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
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
