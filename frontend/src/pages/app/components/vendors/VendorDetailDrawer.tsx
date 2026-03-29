import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import {
  api,
  type BtbLcRow,
  type GoodsReceivingResponse,
  type MasterContractRow,
  type OutstandingBillResponse,
  type PaymentRunResponse,
  type ProformaInvoiceRow,
  type PurchaseOrderResponse,
  type VendorAiAuditEntry,
  type VendorCreate,
  type VendorResponse,
  type VendorUpdate,
  type VoucherResponse,
} from "@/api/client";
import { AutofillReviewPanel } from "@/components/ai-extract/AutofillReviewPanel";
import { useVendorAi } from "@/hooks/useVendorAi";
import type { ConflictResolutionChoice, FieldApplyState } from "@/types/extraction";
import {
  buildVendorEnrichApplyStates,
  buildVendorFieldApplyStates,
  formatExtractedValue,
} from "@/utils/extractionHelpers";
import { logApiError } from "@/utils/logApiError";
import {
  emptyVendorCreate,
  vendorCreateToAiFieldCurrent,
  vendorResponseToSnapshot,
  vendorResponseToVendorUpdate,
  vendorSnapshotKeysToUpdate,
  vendorSnapshotToAiFieldCurrent,
  type VendorFormSnapshot,
} from "./vendorFormShared";
import { VendorAiPanel } from "./VendorAiPanel";

type DrawerTab = "profile" | "commercial" | "banking" | "accounting" | "payments" | "activity" | "ai" | "edit";

interface VendorDetailDrawerProps {
  open: boolean;
  mode: "view" | "create";
  vendor: VendorResponse | null;
  onClose: () => void;
  onCreate: (data: VendorCreate) => Promise<number | void>;
  onUpdate: (id: number, data: VendorUpdate) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onSuccess?: () => void;
}

const emptyCreate: VendorCreate = emptyVendorCreate();

export function VendorDetailDrawer({
  open,
  mode,
  vendor,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onSuccess,
}: VendorDetailDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>("profile");
  const [createForm, setCreateForm] = useState<VendorCreate>(emptyCreate);
  const [editForm, setEditForm] = useState<VendorUpdate>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderResponse[]>([]);
  const [btbLcs, setBtbLcs] = useState<BtbLcRow[]>([]);
  const [grns, setGrns] = useState<GoodsReceivingResponse[]>([]);
  const [payables, setPayables] = useState<OutstandingBillResponse[]>([]);
  const [vendorProformas, setVendorProformas] = useState<ProformaInvoiceRow[]>([]);
  const [masterContracts, setMasterContracts] = useState<MasterContractRow[]>([]);
  const [paymentVouchers, setPaymentVouchers] = useState<VoucherResponse[]>([]);
  const [paymentRuns, setPaymentRuns] = useState<PaymentRunResponse[]>([]);

  const vendorAi = useVendorAi();
  const [vendorExtractRows, setVendorExtractRows] = useState<FieldApplyState[]>([]);
  const [vendorEnrichRows, setVendorEnrichRows] = useState<FieldApplyState[]>([]);
  const [vendorAiAuditItems, setVendorAiAuditItems] = useState<VendorAiAuditEntry[]>([]);

  useEffect(() => {
    if (!open) {
      setTab("profile");
      setCreateForm(emptyCreate);
      setEditForm({});
      setError("");
    } else if (vendor) {
      setEditForm(vendorResponseToVendorUpdate(vendor));
    }
  }, [open, vendor]);

  useEffect(() => {
    if (!open || !vendor) {
      setPurchaseOrders([]);
      setBtbLcs([]);
      setGrns([]);
      setPayables([]);
      setVendorProformas([]);
      setMasterContracts([]);
      return;
    }
    let mounted = true;
    const loadLinkage = async () => {
      try {
        const [poRows, lcRows, grnRows, payableRows, importPiRows, masterRows] = await Promise.all([
          api.listPurchaseOrders(),
          api.listBtbLcs({ vendor_id: vendor.id }),
          api.listGoodsReceiving(),
          api.listOutstandingBills({ bill_type: "PAYABLE" }),
          api.listProformaInvoices({ direction: "IMPORT", vendor_id: vendor.id }),
          api.listMasterContracts(),
        ]);
        if (!mounted) return;
        const vendorName = (vendor.name || "").trim().toLowerCase();
        const vendorPos = poRows.filter((r) => r.vendor_id === vendor.id);
        const vendorPoIds = new Set(vendorPos.map((po) => po.id));
        setPurchaseOrders(vendorPos);
        setBtbLcs(lcRows.filter((r) => (r.vendor_id ?? null) === vendor.id));
        setGrns(grnRows.filter((row) => row.purchase_order_id != null && vendorPoIds.has(row.purchase_order_id)));
        setVendorProformas(importPiRows);
        setMasterContracts(masterRows);
        setPayables(
          payableRows.filter((r) => {
            const rowVendor = (r as unknown as { vendor_id?: number | null }).vendor_id;
            if (rowVendor != null) return rowVendor === vendor.id;
            return (r.party_name || "").trim().toLowerCase() === vendorName;
          })
        );
      } catch {
        // Keep drawer usable even if one dataset fails
      }
    };
    loadLinkage();
    return () => {
      mounted = false;
    };
  }, [open, vendor]);

  useEffect(() => {
    if (!open || !vendor || tab !== "payments") {
      setPaymentVouchers([]);
      setPaymentRuns([]);
      return;
    }
    let mounted = true;
    const loadPay = async () => {
      try {
        const [vouchers, runs] = await Promise.all([api.listVouchers({}), api.listPaymentRuns({})]);
        if (!mounted || !vendor) return;
        const lid = vendor.ledger_id;
        const vFiltered =
          lid != null
            ? vouchers.filter((v) => v.lines?.some((l) => l.account_id === lid))
            : [];
        const nameLower = (vendor.name || "").trim().toLowerCase();
        const runsFiltered = runs.filter((r) =>
          r.items?.some((i) => (i.party_name || "").trim().toLowerCase() === nameLower),
        );
        setPaymentVouchers(vFiltered.slice(0, 40));
        setPaymentRuns(runsFiltered.slice(0, 25));
      } catch {
        if (mounted) {
          setPaymentVouchers([]);
          setPaymentRuns([]);
        }
      }
    };
    void loadPay();
    return () => {
      mounted = false;
    };
  }, [open, vendor, tab]);

  const payableTotal = useMemo(() => {
    return payables.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }, [payables]);

  const paidTotal = useMemo(() => {
    return payables.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);
  }, [payables]);

  const btbTotal = useMemo(() => {
    return btbLcs.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }, [btbLcs]);

  const paymentHistoryCount = useMemo(() => paymentVouchers.length + paymentRuns.length, [paymentVouchers, paymentRuns]);

  const linkedMasterCount = useMemo(() => {
    const ids = new Set(
      btbLcs.map((row) => Number(row.master_contract_id || 0)).filter((id) => id > 0)
    );
    return ids.size;
  }, [btbLcs]);

  const mergedVendorForAi = useMemo((): VendorResponse | null => {
    if (!vendor || mode === "create") return null;
    return { ...vendor, ...editForm } as VendorResponse;
  }, [vendor, editForm, mode]);

  const aiFieldCurrent = useMemo(() => {
    if (mode === "create") return vendorCreateToAiFieldCurrent(createForm);
    if (!mergedVendorForAi) return {};
    return vendorSnapshotToAiFieldCurrent(vendorResponseToSnapshot(mergedVendorForAi));
  }, [mode, createForm, mergedVendorForAi]);

  const formSnapshotForAi = useMemo(
    () => ({ ...aiFieldCurrent }) as Record<string, unknown>,
    [aiFieldCurrent],
  );

  useEffect(() => {
    if (!open) {
      vendorAi.clear();
      setVendorExtractRows([]);
      setVendorEnrichRows([]);
      setVendorAiAuditItems([]);
      return;
    }
    vendorAi.clear();
    setVendorExtractRows([]);
    setVendorEnrichRows([]);
    setVendorAiAuditItems([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when drawer target changes; vendorAi instance methods are stable enough for this pattern
  }, [open, vendor?.id, mode]);

  useEffect(() => {
    const res = vendorAi.extraction;
    if (!res) {
      setVendorExtractRows([]);
      return;
    }
    const next = buildVendorFieldApplyStates(res, aiFieldCurrent);
    setVendorExtractRows((prev) => {
      const applied = new Set(prev.filter((r) => r.applied).map((r) => r.fieldKey));
      const skipped = new Set(prev.filter((r) => r.skipped).map((r) => r.fieldKey));
      return next.map((row) => ({
        ...row,
        applied: applied.has(row.fieldKey),
        skipped: skipped.has(row.fieldKey),
      }));
    });
  }, [vendorAi.extraction, aiFieldCurrent]);

  useEffect(() => {
    const res = vendorAi.enrich;
    if (!res) {
      setVendorEnrichRows([]);
      return;
    }
    const next = buildVendorEnrichApplyStates(res, aiFieldCurrent);
    setVendorEnrichRows((prev) => {
      const applied = new Set(prev.filter((r) => r.applied).map((r) => r.fieldKey));
      const skipped = new Set(prev.filter((r) => r.skipped).map((r) => r.fieldKey));
      return next.map((row) => ({
        ...row,
        applied: applied.has(row.fieldKey),
        skipped: skipped.has(row.fieldKey),
      }));
    });
  }, [vendorAi.enrich, aiFieldCurrent]);

  useEffect(() => {
    if (!open || tab !== "ai" || !vendor) {
      setVendorAiAuditItems([]);
      return;
    }
    let cancelled = false;
    void api.vendorAiAuditLog({ vendor_id: vendor.id, limit: 30 }).then((r) => {
      if (!cancelled) setVendorAiAuditItems(r.items);
    });
    return () => {
      cancelled = true;
    };
  }, [open, tab, vendor]);

  const applyVendorCreatePatch = (patch: Partial<Record<string, string>>) => {
    const snap: Partial<VendorFormSnapshot> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (snap as Record<string, string | null>)[k] = v;
    }
    setCreateForm((p) => ({ ...p, ...vendorSnapshotKeysToUpdate(snap) }));
  };

  const handleVendorClearImport = () => {
    void vendorAi.discardAiResults();
    setVendorExtractRows([]);
    setVendorEnrichRows([]);
  };

  const handleApplyVendorExtractField = async (key: string) => {
    const res = vendorAi.extraction;
    if (!res?.fields[key]) return;
    const ef = res.fields[key];
    const v = formatExtractedValue(ef.value);
    if (mode === "create") {
      applyVendorCreatePatch({ [key]: v });
      setVendorExtractRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false } : r)),
      );
      const bid = vendorAi.extractionBatchId;
      if (bid != null) {
        try {
          await vendorAi.markSuggestionDecisions(bid, [{ field_key: key, decision: "apply" }]);
        } catch (e) {
          logApiError("VendorDrawer.markAiExtract", e);
        }
      }
      return;
    }
    if (!vendor) return;
    const bid = vendorAi.extractionBatchId;
    if (bid == null) {
      setEditForm((prev) => ({ ...prev, ...vendorSnapshotKeysToUpdate({ [key]: v } as Partial<VendorFormSnapshot>) }));
      setVendorExtractRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false } : r)),
      );
      return;
    }
    setError("");
    try {
      const out = await vendorAi.applySuggestionsToVendor(
        vendor.id,
        bid,
        [{ field_key: key, decision: "apply" }],
        "overwrite",
      );
      if (out.conflicts.some((c) => c.field === key)) {
        setError("Could not apply this field. Try again or edit manually.");
        return;
      }
      setEditForm(vendorResponseToVendorUpdate(out.vendor));
      setVendorExtractRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false } : r)),
      );
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    }
  };

  const handleApplyVendorEnrichField = async (key: string) => {
    const res = vendorAi.enrich;
    if (!res?.suggestions[key]) return;
    const sug = res.suggestions[key];
    const v = formatExtractedValue(sug.value);
    if (mode === "create") {
      applyVendorCreatePatch({ [key]: v });
      setVendorEnrichRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false } : r)),
      );
      const bid = vendorAi.enrichBatchId;
      if (bid != null) {
        try {
          await vendorAi.markSuggestionDecisions(bid, [{ field_key: key, decision: "apply" }]);
        } catch (e) {
          logApiError("VendorDrawer.markAiEnrich", e);
        }
      }
      return;
    }
    if (!vendor) return;
    const bid = vendorAi.enrichBatchId;
    if (bid == null) {
      setEditForm((prev) => ({ ...prev, ...vendorSnapshotKeysToUpdate({ [key]: v } as Partial<VendorFormSnapshot>) }));
      setVendorEnrichRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false } : r)),
      );
      return;
    }
    setError("");
    try {
      const out = await vendorAi.applySuggestionsToVendor(
        vendor.id,
        bid,
        [{ field_key: key, decision: "apply" }],
        "overwrite",
      );
      if (out.conflicts.some((c) => c.field === key)) {
        setError("Could not apply this field. Try again or edit manually.");
        return;
      }
      setEditForm(vendorResponseToVendorUpdate(out.vendor));
      setVendorEnrichRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false } : r)),
      );
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    }
  };

  const handleApplyAllHighVendorExtract = async () => {
    const res = vendorAi.extraction;
    if (!res) return;
    const toApply = vendorExtractRows.filter(
      (r) => !r.applied && !r.skipped && r.confidenceLevel === "high" && !r.hasConflict,
    );
    if (toApply.length === 0) return;
    if (mode === "create") {
      const patch: Partial<Record<string, string>> = {};
      for (const row of toApply) {
        const ef = res.fields[row.fieldKey];
        if (!ef) continue;
        patch[row.fieldKey] = formatExtractedValue(ef.value);
      }
      applyVendorCreatePatch(patch);
      setVendorExtractRows((rs) =>
        rs.map((r) =>
          toApply.some((t) => t.fieldKey === r.fieldKey) ? { ...r, applied: true, hasConflict: false } : r,
        ),
      );
      const bid = vendorAi.extractionBatchId;
      if (bid != null) {
        try {
          await vendorAi.markSuggestionDecisions(
            bid,
            toApply.map((row) => ({ field_key: row.fieldKey, decision: "apply" as const })),
          );
        } catch (e) {
          logApiError("VendorDrawer.markAiExtractBulk", e);
        }
      }
      return;
    }
    if (!vendor) return;
    const bid = vendorAi.extractionBatchId;
    if (bid == null) {
      const patch: Partial<VendorFormSnapshot> = {};
      for (const row of toApply) {
        const ef = res.fields[row.fieldKey];
        if (!ef) continue;
        (patch as Record<string, string | null>)[row.fieldKey] = formatExtractedValue(ef.value);
      }
      setEditForm((prev) => ({ ...prev, ...vendorSnapshotKeysToUpdate(patch) }));
      setVendorExtractRows((rs) =>
        rs.map((r) =>
          toApply.some((t) => t.fieldKey === r.fieldKey) ? { ...r, applied: true, hasConflict: false } : r,
        ),
      );
      return;
    }
    setError("");
    try {
      const out = await vendorAi.applySuggestionsToVendor(
        vendor.id,
        bid,
        toApply.map((row) => ({ field_key: row.fieldKey, decision: "apply" as const })),
        "skip_if_different",
      );
      setEditForm(vendorResponseToVendorUpdate(out.vendor));
      const appliedSet = new Set(out.applied_fields);
      setVendorExtractRows((rs) =>
        rs.map((r) =>
          appliedSet.has(r.fieldKey) ? { ...r, applied: true, hasConflict: false } : r,
        ),
      );
      if (out.conflicts.length > 0) {
        setError(
          `${out.conflicts.length} field(s) skipped because saved values changed. Review conflicts and apply individually if needed.`,
        );
      }
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    }
  };

  const handleApplyAllHighVendorEnrich = async () => {
    const res = vendorAi.enrich;
    if (!res) return;
    const toApply = vendorEnrichRows.filter(
      (r) => !r.applied && !r.skipped && r.confidenceLevel === "high" && !r.hasConflict,
    );
    if (toApply.length === 0) return;
    if (mode === "create") {
      const patch: Partial<Record<string, string>> = {};
      for (const row of toApply) {
        const sug = res.suggestions[row.fieldKey];
        if (!sug) continue;
        patch[row.fieldKey] = formatExtractedValue(sug.value);
      }
      applyVendorCreatePatch(patch);
      setVendorEnrichRows((rs) =>
        rs.map((r) =>
          toApply.some((t) => t.fieldKey === r.fieldKey) ? { ...r, applied: true, hasConflict: false } : r,
        ),
      );
      const bid = vendorAi.enrichBatchId;
      if (bid != null) {
        try {
          await vendorAi.markSuggestionDecisions(
            bid,
            toApply.map((row) => ({ field_key: row.fieldKey, decision: "apply" as const })),
          );
        } catch (e) {
          logApiError("VendorDrawer.markAiEnrichBulk", e);
        }
      }
      return;
    }
    if (!vendor) return;
    const bid = vendorAi.enrichBatchId;
    if (bid == null) {
      const patch: Partial<VendorFormSnapshot> = {};
      for (const row of toApply) {
        const sug = res.suggestions[row.fieldKey];
        if (!sug) continue;
        (patch as Record<string, string | null>)[row.fieldKey] = formatExtractedValue(sug.value);
      }
      setEditForm((prev) => ({ ...prev, ...vendorSnapshotKeysToUpdate(patch) }));
      setVendorEnrichRows((rs) =>
        rs.map((r) =>
          toApply.some((t) => t.fieldKey === r.fieldKey) ? { ...r, applied: true, hasConflict: false } : r,
        ),
      );
      return;
    }
    setError("");
    try {
      const out = await vendorAi.applySuggestionsToVendor(
        vendor.id,
        bid,
        toApply.map((row) => ({ field_key: row.fieldKey, decision: "apply" as const })),
        "skip_if_different",
      );
      setEditForm(vendorResponseToVendorUpdate(out.vendor));
      const appliedSet = new Set(out.applied_fields);
      setVendorEnrichRows((rs) =>
        rs.map((r) =>
          appliedSet.has(r.fieldKey) ? { ...r, applied: true, hasConflict: false } : r,
        ),
      );
      if (out.conflicts.length > 0) {
        setError(
          `${out.conflicts.length} field(s) skipped because saved values changed. Review conflicts and apply individually if needed.`,
        );
      }
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    }
  };

  const handleSkipVendorExtractField = (key: string) => {
    if (vendorAi.extractionBatchId != null) {
      void vendorAi.markSuggestionDecisions(vendorAi.extractionBatchId, [{ field_key: key, decision: "skip" }]);
    }
    setVendorExtractRows((rs) => rs.map((r) => (r.fieldKey === key ? { ...r, skipped: true } : r)));
  };

  const handleSkipVendorEnrichField = (key: string) => {
    if (vendorAi.enrichBatchId != null) {
      void vendorAi.markSuggestionDecisions(vendorAi.enrichBatchId, [{ field_key: key, decision: "skip" }]);
    }
    setVendorEnrichRows((rs) => rs.map((r) => (r.fieldKey === key ? { ...r, skipped: true } : r)));
  };

  const handleResolveVendorExtractConflict = async (key: string, choice: ConflictResolutionChoice) => {
    if (choice === "keep") {
      if (vendorAi.extractionBatchId != null) {
        void vendorAi.markSuggestionDecisions(vendorAi.extractionBatchId, [
          { field_key: key, decision: "reject" },
        ]);
      }
      setVendorExtractRows((rs) => rs.map((r) => (r.fieldKey === key ? { ...r, skipped: true } : r)));
      return;
    }
    const res = vendorAi.extraction;
    if (!res?.fields[key]) return;
    const ef = res.fields[key];
    const v = formatExtractedValue(ef.value);
    if (mode === "create") {
      applyVendorCreatePatch({ [key]: v });
      setVendorExtractRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false, skipped: false } : r)),
      );
      const bid = vendorAi.extractionBatchId;
      if (bid != null) {
        try {
          await vendorAi.markSuggestionDecisions(bid, [{ field_key: key, decision: "apply" }]);
        } catch (e) {
          logApiError("VendorDrawer.markAiExtract", e);
        }
      }
      return;
    }
    if (!vendor) return;
    const bid = vendorAi.extractionBatchId;
    if (bid == null) {
      setEditForm((prev) => ({ ...prev, ...vendorSnapshotKeysToUpdate({ [key]: v } as Partial<VendorFormSnapshot>) }));
      setVendorExtractRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false, skipped: false } : r)),
      );
      return;
    }
    setError("");
    try {
      const out = await vendorAi.applySuggestionsToVendor(
        vendor.id,
        bid,
        [{ field_key: key, decision: "apply" }],
        "overwrite",
      );
      if (out.conflicts.some((c) => c.field === key)) {
        setError("Could not apply this field. Try again or edit manually.");
        return;
      }
      setEditForm(vendorResponseToVendorUpdate(out.vendor));
      setVendorExtractRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false, skipped: false } : r)),
      );
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    }
  };

  const handleResolveVendorEnrichConflict = async (key: string, choice: ConflictResolutionChoice) => {
    if (choice === "keep") {
      if (vendorAi.enrichBatchId != null) {
        void vendorAi.markSuggestionDecisions(vendorAi.enrichBatchId, [{ field_key: key, decision: "reject" }]);
      }
      setVendorEnrichRows((rs) => rs.map((r) => (r.fieldKey === key ? { ...r, skipped: true } : r)));
      return;
    }
    const res = vendorAi.enrich;
    if (!res?.suggestions[key]) return;
    const sug = res.suggestions[key];
    const v = formatExtractedValue(sug.value);
    if (mode === "create") {
      applyVendorCreatePatch({ [key]: v });
      setVendorEnrichRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false, skipped: false } : r)),
      );
      const bid = vendorAi.enrichBatchId;
      if (bid != null) {
        try {
          await vendorAi.markSuggestionDecisions(bid, [{ field_key: key, decision: "apply" }]);
        } catch (e) {
          logApiError("VendorDrawer.markAiEnrich", e);
        }
      }
      return;
    }
    if (!vendor) return;
    const bid = vendorAi.enrichBatchId;
    if (bid == null) {
      setEditForm((prev) => ({ ...prev, ...vendorSnapshotKeysToUpdate({ [key]: v } as Partial<VendorFormSnapshot>) }));
      setVendorEnrichRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false, skipped: false } : r)),
      );
      return;
    }
    setError("");
    try {
      const out = await vendorAi.applySuggestionsToVendor(
        vendor.id,
        bid,
        [{ field_key: key, decision: "apply" }],
        "overwrite",
      );
      if (out.conflicts.some((c) => c.field === key)) {
        setError("Could not apply this field. Try again or edit manually.");
        return;
      }
      setEditForm(vendorResponseToVendorUpdate(out.vendor));
      setVendorEnrichRows((rs) =>
        rs.map((r) => (r.fieldKey === key ? { ...r, applied: true, hasConflict: false, skipped: false } : r)),
      );
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const newId = await onCreate(createForm);
      if (typeof newId === "number") {
        const finalizeIds = [
          ...new Set(
            [vendorAi.extractionBatchId, vendorAi.enrichBatchId].filter((x): x is number => x != null),
          ),
        ];
        for (const batchId of finalizeIds) {
          try {
            await vendorAi.finalizeSuggestionBatchAfterCreate(newId, batchId);
          } catch (err) {
            logApiError("VendorDrawer.finalizeAi", err);
          }
        }
      }
      setCreateForm(emptyCreate);
      vendorAi.clear();
      setVendorExtractRows([]);
      setVendorEnrichRows([]);
      onClose();
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create vendor");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor) return;
    setError("");
    setSaving(true);
    try {
      await onUpdate(vendor.id, editForm);
      onClose();
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update vendor");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!vendor || !window.confirm("Delete this vendor?")) return;
    setError("");
    setSaving(true);
    try {
      await onDelete(vendor.id);
      onClose();
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete vendor");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const isCreate = mode === "create";
  const formatMoney = (value: number) =>
    new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      Number.isFinite(value) ? value : 0
    );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md bg-surface-raised shadow-xl flex flex-col max-h-full overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
          <h2 className="text-lg font-semibold text-text-primary">
            {isCreate ? "Add vendor" : vendor ? `${vendor.vendor_code} – ${vendor.name}` : "Vendor"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-subtle text-text-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!isCreate && vendor && (
          <div className="flex border-b border-border px-2 gap-1 shrink-0">
            {(
              [
                "profile",
                "commercial",
                "banking",
                "accounting",
                "payments",
                "activity",
                "ai",
                "edit",
              ] as const
            ).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm font-medium rounded-t ${tab === t ? "bg-surface-subtle text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
              >
                {t === "profile"
                  ? "Profile"
                  : t === "commercial"
                    ? "Commercial"
                    : t === "banking"
                      ? "Banking"
                      : t === "accounting"
                        ? "Accounting"
                        : t === "payments"
                          ? "Payments"
                          : t === "activity"
                            ? "Activity"
                            : t === "ai"
                              ? "AI"
                              : "Edit"}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">
              {error}
            </div>
          )}

          {isCreate ? (
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Vendor code *</label>
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  placeholder="e.g. V001"
                  value={createForm.vendor_code}
                  onChange={(e) => setCreateForm((p) => ({ ...p, vendor_code: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Name *</label>
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  placeholder="Vendor name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Contact person</label>
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  placeholder="Contact name"
                  value={createForm.contact_person ?? ""}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, contact_person: e.target.value || null }))
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Email</label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  placeholder="email@example.com"
                  value={createForm.email ?? ""}
                  onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Phone</label>
                <input
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  placeholder="Phone number"
                  value={createForm.phone ?? ""}
                  onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value || null }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Address</label>
                <textarea
                  className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm min-h-[60px]"
                  placeholder="Address"
                  value={createForm.address ?? ""}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, address: e.target.value || null }))
                  }
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Vendor type</label>
                  <select
                    value={createForm.vendor_type ?? ""}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, vendor_type: e.target.value || null }))
                    }
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  >
                    <option value="">Select type</option>
                    <option value="local">Local</option>
                    <option value="foreign">Foreign</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Currency</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={createForm.default_currency ?? ""}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, default_currency: e.target.value.toUpperCase() || null }))
                    }
                    placeholder="USD"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Country</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={createForm.country ?? ""}
                    onChange={(e) => setCreateForm((p) => ({ ...p, country: e.target.value || null }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">City</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={createForm.city ?? ""}
                    onChange={(e) => setCreateForm((p) => ({ ...p, city: e.target.value || null }))}
                  />
                </div>
              </div>
              <div className="border-t border-border pt-3 space-y-3">
                <p className="text-xs font-semibold text-text-primary uppercase">Supplier AI</p>
                <VendorAiPanel
                  ai={vendorAi}
                  mode="create"
                  formSnapshot={formSnapshotForAi}
                />
                {vendorAi.extraction && vendorAi.extraction.duplicate_warnings.length > 0 ? (
                  <div className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm">
                    <p className="font-medium text-text-primary">Possible duplicate vendors</p>
                    <ul className="text-text-secondary mt-1 list-inside list-disc">
                      {vendorAi.extraction.duplicate_warnings.map((d) => (
                        <li key={d.field + "-" + d.existing_id}>
                          {`${d.field}: similar to "${d.existing_value}" (ID ${d.existing_id})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {vendorExtractRows.length > 0 && vendorAi.extraction ? (
                  <AutofillReviewPanel
                    title="Review extracted fields"
                    fields={vendorExtractRows}
                    onApply={(k) => void handleApplyVendorExtractField(k)}
                    onApplyAllHigh={() => void handleApplyAllHighVendorExtract()}
                    onSkip={handleSkipVendorExtractField}
                    onResolveConflict={(k, c) => void handleResolveVendorExtractConflict(k, c)}
                    persistNote="Merges into this form; after you create the vendor, accepted fields are finalized on the server (audited)."
                  />
                ) : null}
                {vendorEnrichRows.length > 0 && vendorAi.enrich ? (
                  <AutofillReviewPanel
                    title="Review enrichment suggestions"
                    fields={vendorEnrichRows}
                    valueColumnLabel="AI suggested"
                    onApply={(k) => void handleApplyVendorEnrichField(k)}
                    onApplyAllHigh={() => void handleApplyAllHighVendorEnrich()}
                    onSkip={handleSkipVendorEnrichField}
                    onResolveConflict={(k, c) => void handleResolveVendorEnrichConflict(k, c)}
                    persistNote="Same as extract: merge here, then finalize-after-create records what you accepted."
                  />
                ) : null}
                {vendorAi.extraction || vendorAi.enrich ? (
                  <button
                    type="button"
                    onClick={handleVendorClearImport}
                    className="text-xs font-medium text-status-danger-foreground hover:underline"
                  >
                    Clear AI results and discard open batches
                  </button>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={createForm.is_active ?? true}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, is_active: e.target.checked }))
                  }
                />
                Active
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Create vendor"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : vendor ? (
            tab === "profile" ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase">Code</p>
                  <p className="text-sm font-medium text-text-primary">{vendor.vendor_code}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase">Name</p>
                  <p className="text-sm text-text-primary">{vendor.name}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase">Status</p>
                  <span
                    className={
                      vendor.is_active
                        ? "inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-status-success-subtle text-status-success-foreground"
                        : "inline-flex rounded-md px-2 py-0.5 text-xs font-medium bg-surface-subtle text-text-muted"
                    }
                  >
                    {vendor.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface-subtle p-2">
                  <div>
                    <p className="text-xs text-text-muted">Type</p>
                    <p className="text-sm font-medium text-text-primary">{vendor.vendor_type || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Currency</p>
                    <p className="text-sm font-medium text-text-primary">{vendor.default_currency || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Country / City</p>
                    <p className="text-sm font-medium text-text-primary">
                      {[vendor.country, vendor.city].filter(Boolean).join(" / ") || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Payment terms</p>
                    <p className="text-sm font-medium text-text-primary">
                      {vendor.payment_terms_days != null ? `${vendor.payment_terms_days} days` : "—"}
                    </p>
                  </div>
                </div>
                {(vendor.contact_person || vendor.email || vendor.phone || vendor.address) && (
                  <div>
                    <p className="text-xs font-medium text-text-muted uppercase mb-1">Contact</p>
                    <ul className="text-sm text-text-secondary space-y-0.5">
                      {vendor.contact_person && <li>{vendor.contact_person}</li>}
                      {vendor.email && <li>{vendor.email}</li>}
                      {vendor.phone && <li>{vendor.phone}</li>}
                      {vendor.address && <li className="whitespace-pre-wrap">{vendor.address}</li>}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase">Created</p>
                  <p className="text-sm text-text-secondary">
                    {vendor.created_at
                      ? new Date(vendor.created_at).toLocaleString()
                      : "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-subtle p-3">
                  <p className="text-xs font-medium text-text-muted uppercase mb-2">Related Records</p>
                  <div className="flex flex-wrap gap-2">
                    <Link to="/app/inventory/purchase-orders" className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">
                      POs ({purchaseOrders.length})
                    </Link>
                    <Link to="/app/inventory/goods-receiving" className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">
                      GRNs ({grns.length})
                    </Link>
                    <Link to="/app/accounts/outstanding-bills" className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">
                      Outstanding bills ({payables.length})
                    </Link>
                    <button
                      type="button"
                      onClick={() => setTab("payments")}
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Payment history ({paymentHistoryCount})
                    </button>
                    <Link to="/app/commercial/btb-lcs" className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">
                      BTB LCs ({btbLcs.length})
                    </Link>
                  </div>
                </div>
                <div className="pt-4 border-t border-border flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTab("edit")}
                    className="rounded-lg border border-border-strong px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-1.5 text-sm font-medium text-status-danger-foreground hover:bg-status-danger-subtle disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : tab === "commercial" ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-status-info/30 bg-status-info-subtle px-3 py-2">
                  <p className="text-xs text-status-info-foreground">Linked Procurement</p>
                  <p className="text-sm font-semibold text-status-info-foreground">
                    {purchaseOrders.length} PO · {vendorProformas.length} Vendor PI · {btbLcs.length} BTB LC
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-brand-primary/30 bg-brand-primary/10 p-3">
                  <div>
                    <p className="text-xs text-brand-primary">BTB Value</p>
                    <p className="text-sm font-semibold text-brand-primary">{formatMoney(btbTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-brand-primary">Master Contracts Used</p>
                    <p className="text-sm font-semibold text-brand-primary">{linkedMasterCount}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase mb-1">Vendor import proforma invoices</p>
                  {vendorProformas.length === 0 ? (
                    <p className="text-sm text-text-muted">No vendor PI linked yet.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-text-secondary">
                      {vendorProformas.slice(0, 5).map((pi) => (
                        <li key={pi.id} className="rounded border border-border px-2 py-1">
                          {pi.reference || `PI-${pi.id}`} · {pi.currency || "—"} · {pi.amount ?? "—"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase mb-1">Recent purchase orders</p>
                  {purchaseOrders.length === 0 ? (
                    <p className="text-sm text-text-muted">No linked purchase order yet.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-text-secondary">
                      {purchaseOrders.slice(0, 5).map((po) => (
                        <li key={po.id} className="rounded border border-border px-2 py-1">
                          {po.po_code} · {po.status} · {po.currency || "—"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase mb-1">BTB LC linked</p>
                  {btbLcs.length === 0 ? (
                    <p className="text-sm text-text-muted">No BTB LC linked yet.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-text-secondary">
                      {btbLcs.slice(0, 5).map((lc) => (
                        <li key={lc.id} className="rounded border border-border px-2 py-1">
                          {lc.reference || `LC-${lc.id}`} · {lc.status || "—"} · {lc.currency || "—"} ·{" "}
                          {lc.master_contract_id ? `Master #${lc.master_contract_id}` : "No master"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {linkedMasterCount > 0 && (
                  <div>
                    <p className="text-xs font-medium text-text-muted uppercase mb-1">Linked master contracts</p>
                    <ul className="space-y-1 text-sm text-text-secondary">
                      {Array.from(
                        new Set(
                          btbLcs
                            .map((row) => Number(row.master_contract_id || 0))
                            .filter((id) => id > 0)
                        )
                      )
                        .slice(0, 5)
                        .map((id) => {
                          const mc = masterContracts.find((m) => m.id === id);
                          return (
                            <li key={id} className="rounded border border-border px-2 py-1">
                              {mc?.reference || `#${id}`} · {mc?.contract_type || "—"} ·{" "}
                              {mc?.amount != null ? formatMoney(Number(mc.amount)) : "—"}
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                )}
              </div>
            ) : tab === "banking" ? (
              <div className="space-y-2 text-sm text-text-secondary">
                <div className="rounded-lg border border-border bg-surface-subtle p-3">
                  <p className="text-xs text-text-muted uppercase">Bank Name</p>
                  <p className="font-medium text-text-primary">{vendor.bank_name || "—"}</p>
                </div>
                <div className="rounded-lg border border-border bg-surface-subtle p-3">
                  <p className="text-xs text-text-muted uppercase">Account Number</p>
                  <p className="font-medium text-text-primary">{vendor.bank_account_no || "—"}</p>
                </div>
                <div className="rounded-lg border border-border bg-surface-subtle p-3">
                  <p className="text-xs text-text-muted uppercase">SWIFT</p>
                  <p className="font-medium text-text-primary">{vendor.swift_code || "—"}</p>
                </div>
              </div>
            ) : tab === "accounting" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-text-muted uppercase">Ledger Link</p>
                    <p className="text-sm font-semibold text-text-primary">
                      {vendor.ledger_id ? `#${vendor.ledger_id}` : "Not Linked"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-text-muted uppercase">Credit Limit</p>
                    <p className="text-sm font-semibold text-text-primary">
                      {vendor.credit_limit != null ? formatMoney(Number(vendor.credit_limit)) : "—"}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle p-3">
                  <p className="text-xs text-status-warning-foreground uppercase">Payables</p>
                  <p className="text-sm font-semibold text-status-warning-foreground">
                    Outstanding: {formatMoney(payableTotal - paidTotal)} | Total Bill: {formatMoney(payableTotal)}
                  </p>
                  <Link to="/app/accounts/reports/ar-ap-aging" className="mt-1 inline-block text-xs font-medium text-brand-primary hover:underline">
                    View full AP aging
                  </Link>
                </div>
                <p className="text-xs text-text-muted">
                  <button type="button" className="font-medium text-brand-primary hover:underline" onClick={() => setTab("payments")}>
                    View payment history & vouchers
                  </button>
                </p>
              </div>
            ) : tab === "payments" ? (
              <div className="space-y-3 text-sm">
                {!vendor.ledger_id ? (
                  <p className="text-text-muted">Link a ledger account to the vendor to match payment vouchers.</p>
                ) : null}
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase mb-1">Vouchers touching this ledger</p>
                  {paymentVouchers.length === 0 ? (
                    <p className="text-text-muted">No matching vouchers found.</p>
                  ) : (
                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                      {paymentVouchers.map((v) => (
                        <li key={v.id}>
                          <a
                            href={`/app/vouchers/${v.id}`}
                            className="text-brand-primary hover:underline"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {v.voucher_number}
                          </a>{" "}
                          {v.voucher_date} · {v.voucher_type} · {v.status}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase mb-1">Payment runs</p>
                  {paymentRuns.length === 0 ? (
                    <p className="text-text-muted">No payment runs with this party name.</p>
                  ) : (
                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                      {paymentRuns.map((r) => (
                        <li key={r.id} className="rounded border border-border px-2 py-1">
                          {r.run_code} · {r.run_date} · {r.status} · {formatMoney(Number(r.total_amount || 0))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : tab === "activity" ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-text-muted uppercase">Recent workflow events</p>
                {purchaseOrders.length === 0 && btbLcs.length === 0 && payables.length === 0 ? (
                  <p className="text-sm text-text-muted">No activity found for this vendor.</p>
                ) : (
                  <ul className="space-y-1">
                    {purchaseOrders.slice(0, 3).map((po) => (
                      <li key={`po-${po.id}`} className="rounded border border-border px-2 py-1 text-sm text-text-secondary">
                        PO {po.po_code} created ({po.status})
                      </li>
                    ))}
                    {btbLcs.slice(0, 3).map((lc) => (
                      <li key={`lc-${lc.id}`} className="rounded border border-border px-2 py-1 text-sm text-text-secondary">
                        BTB LC {lc.reference || lc.id} ({lc.status || "DRAFT"}) {lc.currency || ""}
                      </li>
                    ))}
                    {vendorProformas.slice(0, 3).map((pi) => (
                      <li key={`pi-${pi.id}`} className="rounded border border-border px-2 py-1 text-sm text-text-secondary">
                        Vendor PI {pi.reference || pi.id} ({pi.status || "DRAFT"}) {pi.currency || ""}
                      </li>
                    ))}
                    {payables.slice(0, 3).map((bill) => (
                      <li key={`bill-${bill.id}`} className="rounded border border-border px-2 py-1 text-sm text-text-secondary">
                        AP Bill {bill.bill_no || bill.id} ({bill.status}) {bill.currency || ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : tab === "ai" ? (
              <div className="space-y-3 text-sm text-text-secondary">
                <VendorAiPanel
                  ai={vendorAi}
                  mode="edit"
                  vendorId={vendor.id}
                  formSnapshot={formSnapshotForAi}
                />
                {vendorAi.extraction && vendorAi.extraction.duplicate_warnings.length > 0 ? (
                  <div className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm">
                    <p className="font-medium text-text-primary">Possible duplicate vendors</p>
                    <ul className="text-text-secondary mt-1 list-inside list-disc">
                      {vendorAi.extraction.duplicate_warnings.map((d) => (
                        <li key={d.field + "-" + d.existing_id}>
                          {`${d.field}: similar to "${d.existing_value}" (ID ${d.existing_id})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {vendorExtractRows.length > 0 && vendorAi.extraction ? (
                  <AutofillReviewPanel
                    title="Review extracted fields"
                    fields={vendorExtractRows}
                    onApply={(k) => void handleApplyVendorExtractField(k)}
                    onApplyAllHigh={() => void handleApplyAllHighVendorExtract()}
                    onSkip={handleSkipVendorExtractField}
                    onResolveConflict={(k, c) => void handleResolveVendorExtractConflict(k, c)}
                    persistNote="Apply updates this vendor with audit. Use skip/reject to record decisions without changing the master."
                  />
                ) : null}
                {vendorEnrichRows.length > 0 && vendorAi.enrich ? (
                  <AutofillReviewPanel
                    title="Review enrichment suggestions"
                    fields={vendorEnrichRows}
                    valueColumnLabel="AI suggested"
                    onApply={(k) => void handleApplyVendorEnrichField(k)}
                    onApplyAllHigh={() => void handleApplyAllHighVendorEnrich()}
                    onSkip={handleSkipVendorEnrichField}
                    onResolveConflict={(k, c) => void handleResolveVendorEnrichConflict(k, c)}
                    persistNote="Same as extract: server apply with audit when a suggestion batch is open."
                  />
                ) : null}
                {vendorAi.validate ? (
                  <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-2">
                    <p className="text-xs font-semibold text-text-primary uppercase">Profile readiness</p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-text-muted">Completeness</p>
                        <p className="font-medium text-text-primary">{vendorAi.validate.completeness_score}%</p>
                      </div>
                      <div>
                        <p className="text-text-muted">Banking</p>
                        <p className="font-medium text-text-primary">{vendorAi.validate.banking_score}%</p>
                      </div>
                      <div>
                        <p className="text-text-muted">Compliance</p>
                        <p className="font-medium text-text-primary">{vendorAi.validate.compliance_score}%</p>
                      </div>
                    </div>
                    {vendorAi.validate.issues.length > 0 ? (
                      <ul className="max-h-40 overflow-y-auto text-xs space-y-1 list-inside list-disc">
                        {vendorAi.validate.issues.map((issue, idx) => (
                          <li key={idx}>
                            <span className="font-medium">{issue.severity}:</span> {issue.message}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-text-muted">No blocking issues flagged.</p>
                    )}
                  </div>
                ) : null}
                {vendorAi.dedupe ? (
                  <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-2">
                    <p className="text-xs font-semibold text-text-primary uppercase">Duplicate risk</p>
                    {vendorAi.dedupe.matches.length === 0 ? (
                      <p className="text-xs text-text-muted">No close matches in this tenant.</p>
                    ) : (
                      <ul className="text-xs space-y-1">
                        {vendorAi.dedupe.matches.map((m) => (
                          <li key={m.vendor_id} className="rounded border border-border/60 px-2 py-1">
                            <span className="font-medium">{m.vendor_code}</span> — {m.name}{" "}
                            <span className="text-text-muted">(score {m.score})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {vendorAi.dedupe.warnings.length > 0 ? (
                      <ul className="text-xs text-status-warning-foreground list-inside list-disc">
                        {vendorAi.dedupe.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                {vendorAi.summary ? (
                  <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-2">
                    <p className="text-xs font-semibold text-text-primary uppercase">Supplier summary</p>
                    <p className="text-xs text-text-secondary whitespace-pre-wrap">{vendorAi.summary.summary_text}</p>
                    {vendorAi.summary.key_facts.length > 0 ? (
                      <div>
                        <p className="text-xs font-medium text-text-muted mb-1">Key facts</p>
                        <ul className="text-xs list-inside list-disc">
                          {vendorAi.summary.key_facts.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {vendorAi.summary.risk_indicators.length > 0 ? (
                      <div>
                        <p className="text-xs font-medium text-status-warning-foreground mb-1">Risks</p>
                        <ul className="text-xs list-inside list-disc text-status-warning-foreground">
                          {vendorAi.summary.risk_indicators.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <p className="text-xs text-text-muted">Grade: {vendorAi.summary.profile_grade}</p>
                  </div>
                ) : null}
                {vendorAi.nextActions ? (
                  <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-2">
                    <p className="text-xs font-semibold text-text-primary uppercase">Next actions</p>
                    <ul className="text-xs space-y-2">
                      {vendorAi.nextActions.actions.map((a, i) => (
                        <li key={i} className="rounded border border-border/60 p-2">
                          <p className="font-medium text-text-primary">{a.title}</p>
                          <p className="text-text-secondary">{a.description}</p>
                          <p className="text-text-muted mt-1">
                            {a.target_module} · priority {a.priority}
                          </p>
                          {a.target_url ? (
                            <a
                              href={a.target_url}
                              className="text-xs text-brand-primary hover:underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open link
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {vendorAi.lastApplyConflicts.length > 0 ? (
                  <div className="rounded-lg border border-status-warning/30 bg-status-warning/10 px-3 py-2 text-xs">
                    <p className="font-medium text-text-primary">Apply conflicts</p>
                    <ul className="mt-1 list-inside list-disc">
                      {vendorAi.lastApplyConflicts.map((c, i) => (
                        <li key={i}>
                          {c.field}: current &quot;{c.current}&quot; vs suggested &quot;{c.suggested}&quot;
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="rounded-lg border border-border bg-surface-subtle p-3">
                  <p className="text-xs font-semibold text-text-primary uppercase mb-2">Recent AI activity</p>
                  {vendorAiAuditItems.length === 0 ? (
                    <p className="text-xs text-text-muted">No entries yet for this vendor.</p>
                  ) : (
                    <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
                      {vendorAiAuditItems.map((entry) => (
                        <li key={entry.id} className="border-b border-border/40 pb-2 last:border-0">
                          <p className="font-medium text-text-primary">
                            {entry.action}{" "}
                            <span className="font-normal text-text-muted">
                              {entry.created_at ? new Date(entry.created_at).toLocaleString() : ""}
                            </span>
                          </p>
                          {entry.summary ? <p className="text-text-secondary">{entry.summary}</p> : null}
                          {entry.event_label ? (
                            <p className="text-text-muted text-[10px] uppercase">{entry.event_label}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleUpdate} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Vendor code *</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={editForm.vendor_code ?? ""}
                    onChange={(e) => setEditForm((p) => ({ ...p, vendor_code: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Name *</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={editForm.name ?? ""}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Contact person</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={editForm.contact_person ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        contact_person: e.target.value || undefined,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={editForm.email ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, email: e.target.value || undefined }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Phone</label>
                  <input
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    value={editForm.phone ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, phone: e.target.value || undefined }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Address</label>
                  <textarea
                    className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm min-h-[60px]"
                    value={editForm.address ?? ""}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, address: e.target.value || undefined }))
                    }
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Ledger ID</label>
                    <input
                      type="number"
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.ledger_id ?? ""}
                      onChange={(e) =>
                        setEditForm((p) => ({
                          ...p,
                          ledger_id: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Currency</label>
                    <input
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.default_currency ?? ""}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, default_currency: e.target.value.toUpperCase() || undefined }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Vendor Type</label>
                    <select
                      value={editForm.vendor_type ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, vendor_type: e.target.value || undefined }))}
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    >
                      <option value="">Select type</option>
                      <option value="local">Local</option>
                      <option value="foreign">Foreign</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Payment Terms (days)</label>
                    <input
                      type="number"
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.payment_terms_days ?? ""}
                      onChange={(e) =>
                        setEditForm((p) => ({
                          ...p,
                          payment_terms_days: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Country</label>
                    <input
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.country ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, country: e.target.value || undefined }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">City</label>
                    <input
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.city ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value || undefined }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Bank Name</label>
                    <input
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.bank_name ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, bank_name: e.target.value || undefined }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Bank Account</label>
                    <input
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.bank_account_no ?? ""}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, bank_account_no: e.target.value || undefined }))
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">SWIFT Code</label>
                    <input
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.swift_code ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, swift_code: e.target.value || undefined }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-muted mb-1">Credit Limit</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                      value={editForm.credit_limit ?? ""}
                      onChange={(e) =>
                        setEditForm((p) => ({
                          ...p,
                          credit_limit: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={editForm.is_active ?? true}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, is_active: e.target.checked }))
                    }
                  />
                  Active
                </label>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-brand-primary-foreground hover:bg-brand-primary/90 disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("profile")}
                    className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
