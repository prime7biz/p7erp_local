import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import {
  api,
  FINANCE_COST_NATURE_CODES,
  type BtbLcRow,
  type ChartOfAccountResponse,
  type TradeCaseRow,
  type VoucherCreate,
  type VoucherEntryAssistRequest,
  type VoucherLineCreate,
  type VoucherNarrationSuggestion,
  type VoucherResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { DataTablePagination } from "@/components/app/DataTablePagination";
import { RemoteSearchSelect } from "@/components/app/RemoteSearchSelect";
import { VoucherActionReasonModal } from "@/components/vouchers/VoucherActionReasonModal";
import { VoucherEntryAssistPanel } from "@/components/vouchers/VoucherEntryAssistPanel";
import { formatDrCr, formatShortDate } from "@/components/vouchers/voucherAssistFormat";
import { useVoucherEntryAssist } from "@/hooks/useVoucherEntryAssist";
import {
  defaultDateForFiscalYear,
  fiscalYearBounds,
  fiscalYearLabel,
  fiscalYearOf,
  fiscalYearOptions,
  localTodayISO,
  normalizeStartMonth,
} from "@/lib/fiscalYear";
import { LedgerQuickCreateModal } from "@/components/quick-create/LedgerQuickCreateModal";
import { ACTION_LABEL, ACTION_TO_STATUS, ACTIONS_NEEDING_REASON, VOUCHER_STATUSES } from "@/components/vouchers/workflowMeta";
import { useListPagination } from "@/hooks/useListPagination";
import { VOUCHER_HOTKEYS, useVoucherHotkeys } from "@/hooks/useVoucherHotkeys";
import {
  fetchBtbLcPage,
  fetchChartAccountPage,
  fetchCostCenterPage,
  fetchTradeCasePage,
  hydrateBtbLc,
  hydrateChartAccount,
  hydrateCostCenter,
  hydrateTradeCase,
} from "@/lib/remoteSelectFetchers";
import { logApiError } from "@/utils/logApiError";
import { useSubmitGuard } from "@/hooks/useSubmitGuard";
import { useAuth } from "@/context/AuthContext";
import { resolveRole } from "@/lib/roles";
import type { TaxPreviewResponse } from "@/api/client";

const CTL =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20";
/** Compact control for voucher lines; same height as the ledger search box. */
const LINE_CTL =
  "w-full rounded border border-border-strong bg-surface-raised px-2 py-1.5 text-sm text-text-primary outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20";
const LINE_GRID = "md:grid-cols-[2rem_minmax(0,1fr)_8.5rem_8.5rem_5.5rem]";
const LABEL = "mb-1 block text-xs font-medium text-text-secondary";

function rowAmount(lines: VoucherLineCreate[], t: "DEBIT" | "CREDIT") {
  return lines.filter((l) => l.entry_type === t).reduce((sum, l) => sum + Number(l.amount || 0), 0);
}

function makeLine(accountId: number, currency: string, exchangeRate: string, entryType: "DEBIT" | "CREDIT" = "DEBIT"): VoucherLineCreate {
  return {
    account_id: accountId,
    cost_center_id: null,
    currency,
    exchange_rate: exchangeRate,
    entry_type: entryType,
    amount: "0",
    notes: "",
    cost_nature_override: null,
  };
}

export function VouchersPage() {
  const { me } = useAuth();
  const gstEnabled = me?.feature_flags?.gst_system_enabled === true;
  const directPostOn = me?.feature_flags?.direct_post_vouchers === true && resolveRole(me?.role_name).isElevated;
  const assistEnabled = me?.feature_flags?.voucher_entry_assist_enabled !== false;
  const fyStartMonth = normalizeStartMonth(me?.feature_flags?.fiscal_year_start_month);
  const { page, setPage, pageSize, setPageSize, offset, limit, allowedSizes } = useListPagination();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const voucherIdFromUrl = searchParams.get("voucher_id");
  const voucherIdFilter =
    voucherIdFromUrl != null && voucherIdFromUrl !== "" && Number.isFinite(Number(voucherIdFromUrl))
      ? Number(voucherIdFromUrl)
      : undefined;

  const loadedActionsRef = useRef<Set<number>>(new Set());
  const [voucherTypes, setVoucherTypes] = useState<string[]>([]);
  const [rows, setRows] = useState<VoucherResponse[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [availableActionMap, setAvailableActionMap] = useState<Record<number, string[]>>({});
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [accountBillWiseMap, setAccountBillWiseMap] = useState<Record<number, boolean>>({});
  const billWiseFetchedRef = useRef<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const saveGuard = useSubmitGuard();
  const [loading, setLoading] = useState(true);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [editingVoucherId, setEditingVoucherId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [pendingWorkflowAction, setPendingWorkflowAction] = useState<{ voucherId: number; action: string } | null>(null);
  const [ledgerCreate, setLedgerCreate] = useState<{ lineIdx: number; name: string } | null>(null);
  const [periodLock, setPeriodLock] = useState<{ locked: boolean; reason?: string; period_name?: string } | null>(null);
  const [taxPreview, setTaxPreview] = useState<TaxPreviewResponse | null>(null);
  const [taxPreviewError, setTaxPreviewError] = useState("");
  const [taxDirection, setTaxDirection] = useState<"OUTWARD" | "INWARD">("OUTWARD");
  const [taxPos, setTaxPos] = useState("");
  const [openLineActionsIdx, setOpenLineActionsIdx] = useState<number | null>(null);
  const [narrationSuggestion, setNarrationSuggestion] = useState<VoucherNarrationSuggestion | null>(null);
  const [narrationLoading, setNarrationLoading] = useState(false);

  // Multi-currency
  const [multiCurrency, setMultiCurrency] = useState(false);
  const [liveRateStatus, setLiveRateStatus] = useState<"idle" | "loading" | "fetched" | "error">("idle");

  const [form, setForm] = useState<VoucherCreate>({
    voucher_type: "JOURNAL",
    voucher_date: localTodayISO(),
    description: "",
    reference: "",
    currency: "BDT",
    base_currency: "BDT",
    exchange_rate: "1",
    exchange_rate_source: undefined,
    trade_case_id: undefined,
    btb_lc_id: undefined,
    lines: [makeLine(0, "BDT", "1", "DEBIT")],
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, voucherIdFilter, setPage]);

  useEffect(() => {
    let cancelled = false;
    void api.getVoucherTypesMeta().then((types) => {
      if (!cancelled) setVoucherTypes(types);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOpenActionsId(null);
    loadedActionsRef.current.clear();
    setAvailableActionMap({});
    try {
      const vRes = await api.listVouchersWithTotal({
        status_filter: statusFilter || undefined,
        search: debouncedSearch || undefined,
        voucher_id: voucherIdFilter,
        limit,
        offset,
      });
      setRows(vRes.rows);
      setTotalRows(vRes.total ?? vRes.rows.length);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, limit, offset, statusFilter, voucherIdFilter]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (openActionsId == null) return;
    const vid = openActionsId;
    if (loadedActionsRef.current.has(vid)) return;
    loadedActionsRef.current.add(vid);
    void api
      .getVoucherAvailableActions(vid)
      .then((m) => setAvailableActionMap((p) => ({ ...p, [vid]: m.actions })))
      .catch((e) => {
        logApiError("VouchersPage.getVoucherAvailableActions", e);
        setAvailableActionMap((p) => ({ ...p, [vid]: [] }));
      });
  }, [openActionsId]);

  useEffect(() => {
    if (!showCreate) return;
    const ids = new Set(form.lines.map((l) => l.account_id).filter((id) => id > 0));
    for (const id of ids) {
      if (billWiseFetchedRef.current.has(id)) continue;
      billWiseFetchedRef.current.add(id);
      void api
        .getChartOfAccount(id)
        .then((a) => setAccountBillWiseMap((m) => ({ ...m, [id]: Boolean(a.enable_bill_wise) })))
        .catch((e) => {
          logApiError("VouchersPage.getChartOfAccount", e);
        });
    }
  }, [showCreate, form.lines]);

  useEffect(() => {
    if (!showCreate || !form.voucher_date) {
      setPeriodLock(null);
      return;
    }
    let cancelled = false;
    void api
      .checkAccountingPeriodLock(form.voucher_date)
      .then((r) => {
        if (!cancelled) setPeriodLock(r);
      })
      .catch((e) => {
        logApiError("VouchersPage.checkAccountingPeriodLock", e);
        if (!cancelled) setPeriodLock(null);
      });
    return () => {
      cancelled = true;
    };
  }, [showCreate, form.voucher_date]);

  const debitTotal = useMemo(() => rowAmount(form.lines, "DEBIT"), [form.lines]);
  const creditTotal = useMemo(() => rowAmount(form.lines, "CREDIT"), [form.lines]);
  const isBalanced = Math.abs(debitTotal - creditTotal) < 0.001;

  const todayISO = localTodayISO();
  const selectedFiscalYear = fiscalYearOf(form.voucher_date || todayISO, fyStartMonth);
  const selectedFyBounds = fiscalYearBounds(selectedFiscalYear, fyStartMonth);
  const fyOptions = useMemo(() => {
    const opts = fiscalYearOptions(fyStartMonth, todayISO);
    if (!opts.some((o) => o.fiscalYear === selectedFiscalYear)) {
      opts.push({
        fiscalYear: selectedFiscalYear,
        label: fiscalYearLabel(selectedFiscalYear, fyStartMonth),
        ...fiscalYearBounds(selectedFiscalYear, fyStartMonth),
        isCurrent: false,
      });
    }
    return opts;
  }, [fyStartMonth, todayISO, selectedFiscalYear]);

  function changeFiscalYear(fy: number) {
    setForm((p) => ({ ...p, voucher_date: defaultDateForFiscalYear(fy, fyStartMonth, todayISO) }));
  }

  const assistRequest = useMemo<VoucherEntryAssistRequest | null>(() => {
    if (!showCreate || !assistEnabled || !form.voucher_date) return null;
    return {
      voucher_type: form.voucher_type,
      voucher_date: form.voucher_date,
      reference: form.reference || null,
      exclude_voucher_id: editingVoucherId,
      lines: form.lines.map((l) => ({ account_id: l.account_id, entry_type: l.entry_type, amount: String(l.amount || "0") })),
    };
  }, [showCreate, assistEnabled, form.voucher_type, form.voucher_date, form.reference, form.lines, editingVoucherId]);
  const assist = useVoucherEntryAssist(assistRequest);
  const assistAccounts = useMemo(
    () => new Map((assist.data?.accounts ?? []).map((a) => [a.account_id, a])),
    [assist.data],
  );

  function addSuggestedAccount(accountId: number, side: "DEBIT" | "CREDIT") {
    setForm((prev) => {
      const diff = rowAmount(prev.lines, "DEBIT") - rowAmount(prev.lines, "CREDIT");
      const fill = side === "CREDIT" && diff > 0.001 ? diff.toFixed(2) : side === "DEBIT" && diff < -0.001 ? (-diff).toFixed(2) : null;
      const emptyIdx = prev.lines.findIndex((l) => !l.account_id);
      const target = prev.lines[emptyIdx];
      if (target) {
        const amount = Number(target.amount) > 0 ? target.amount : fill ?? target.amount;
        return {
          ...prev,
          lines: prev.lines.map((l, i) => (i === emptyIdx ? { ...l, account_id: accountId, entry_type: side, amount } : l)),
        };
      }
      const line = { ...makeLine(accountId, prev.currency ?? "BDT", prev.exchange_rate ?? "1", side), amount: fill ?? "0" };
      return { ...prev, lines: [...prev.lines, line] };
    });
  }

  function switchLineSide(idx: number) {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((l, i) => (i === idx ? { ...l, entry_type: l.entry_type === "DEBIT" ? "CREDIT" : "DEBIT" } : l)),
    }));
  }

  async function requestNarration() {
    if (!assistRequest) return;
    setNarrationLoading(true);
    try {
      const res = await api.suggestVoucherNarration({
        ...assistRequest,
        lines: form.lines.map((l) => ({
          account_id: l.account_id,
          entry_type: l.entry_type,
          amount: String(l.amount || "0"),
          notes: l.notes || null,
        })),
      });
      setNarrationSuggestion(res);
    } catch (e) {
      logApiError("VouchersPage.suggestVoucherNarration", e);
      setError((e as Error).message);
    } finally {
      setNarrationLoading(false);
    }
  }

  useEffect(() => {
    if (openLineActionsIdx == null) return;
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-line-actions]")) setOpenLineActionsIdx(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openLineActionsIdx]);

  function setLine(idx: number, patch: Partial<VoucherLineCreate>) {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === idx ? { ...line, ...patch } : line)),
    }));
  }

  function addLine(entryType: "DEBIT" | "CREDIT" = "DEBIT") {
    setForm((prev) => ({
      ...prev,
      lines: [...prev.lines, makeLine(0, prev.currency ?? "BDT", prev.exchange_rate ?? "1", entryType)],
    }));
  }

  function copyLine(idx: number) {
    setForm((prev) => {
      const source = prev.lines[idx];
      if (!source) return prev;
      return { ...prev, lines: [...prev.lines, { ...source }] };
    });
  }

  function removeLine(idx: number) {
    setForm((prev) => (prev.lines.length <= 1 ? prev : { ...prev, lines: prev.lines.filter((_, i) => i !== idx) }));
  }

  function setLineSideAmount(idx: number, side: "DEBIT" | "CREDIT", value: string) {
    setLine(idx, { entry_type: side, amount: value });
  }

  function autoBalanceVoucher() {
    const diff = debitTotal - creditTotal;
    if (Math.abs(diff) < 0.001) { setSuccess("Voucher is already balanced."); return; }
    const entryType: "DEBIT" | "CREDIT" = diff > 0 ? "CREDIT" : "DEBIT";
    const amount = Math.abs(diff).toFixed(2);
    setForm((prev) => ({
      ...prev,
      lines: [...prev.lines, { ...makeLine(0, prev.currency ?? "BDT", prev.exchange_rate ?? "1", entryType), amount, notes: "Auto balance line" }],
    }));
    setSuccess("Auto-balance line added.");
  }

  function validateVoucherForm() {
    if (!form.voucher_type.trim()) throw new Error("Voucher type is required.");
    if (!form.voucher_date) throw new Error("Voucher date is required.");
    if (!(form.description ?? "").trim()) throw new Error("Narration is required for audit purposes.");
    if (multiCurrency) {
      if (!form.currency?.trim()) throw new Error("Transaction currency is required.");
      if (!form.base_currency?.trim()) throw new Error("Base currency is required.");
      if (Number(form.exchange_rate ?? 0) <= 0) throw new Error("Exchange rate must be greater than zero.");
    }
    if (form.lines.length < 2) throw new Error("Use at least two lines (debit and credit).");
    if (form.lines.some((line) => !line.account_id)) throw new Error("Select account for each line.");
    if (form.lines.some((line) => Number(line.amount) <= 0)) throw new Error("Line amount must be greater than zero.");
    if (!isBalanced) throw new Error("Voucher is not balanced.");
  }

  function resetForm() {
    setEditingVoucherId(null);
    setMultiCurrency(false);
    setLiveRateStatus("idle");
    billWiseFetchedRef.current.clear();
    setAccountBillWiseMap({});
    setOpenLineActionsIdx(null);
    setNarrationSuggestion(null);
    setForm({
      voucher_type: voucherTypes[0] ?? "JOURNAL",
      voucher_date: localTodayISO(),
      description: "",
      reference: "",
      currency: "BDT",
      base_currency: "BDT",
      exchange_rate: "1",
      exchange_rate_source: undefined,
      trade_case_id: undefined,
      btb_lc_id: undefined,
      lines: [makeLine(0, "BDT", "1", "DEBIT")],
    });
  }

  async function fetchLiveRate() {
    const cur = (form.currency ?? "BDT").toUpperCase();
    const base = (form.base_currency ?? "BDT").toUpperCase();
    if (cur === base) { setForm((p) => ({ ...p, exchange_rate: "1" })); return; }
    setLiveRateStatus("loading");
    try {
      const res = await fetch(`https://open.er-api.com/v6/latest/${cur}`);
      const json = await res.json();
      if (json.result === "success" && json.rates?.[base]) {
        setForm((p) => ({
          ...p,
          exchange_rate: String(json.rates[base]),
          exchange_rate_source: `open.er-api.com ${new Date().toISOString().slice(0, 10)}`,
        }));
        setLiveRateStatus("fetched");
      } else {
        setLiveRateStatus("error");
      }
    } catch {
      setLiveRateStatus("error");
    }
  }

  function submitVoucher(quickSubmit: boolean, directPost = false) {
    return saveGuard.run(() => saveVoucher(quickSubmit, directPost));
  }

  async function saveVoucher(quickSubmit: boolean, directPost: boolean) {
    setError(null);
    setSuccess(null);
    try {
      validateVoucherForm();
      let voucher: VoucherResponse;
      if (editingVoucherId) {
        voucher = await api.updateVoucher(editingVoucherId, {
          voucher_type: form.voucher_type,
          voucher_date: form.voucher_date,
          description: form.description,
          reference: form.reference,
          currency: form.currency,
          base_currency: form.base_currency,
          exchange_rate: form.exchange_rate,
          lines: form.lines,
        });
      } else {
        const createPayload: VoucherCreate = {
          ...form,
          exchange_rate_source: multiCurrency ? form.exchange_rate_source ?? "system" : undefined,
        };
        voucher = await api.createVoucher(createPayload);
      }
      if (directPost) {
        try {
          voucher = await api.directPostVoucher(voucher.id);
        } catch (e) {
          setError(`Saved as ${voucher.voucher_number}, but posting stopped: ${(e as Error).message}`);
          resetForm();
          setShowCreate(false);
          await loadList();
          return;
        }
      } else if (quickSubmit) await api.updateVoucherStatus(voucher.id, "SUBMITTED");
      setSuccess(
        directPost
          ? `Voucher ${voucher.voucher_number} saved and posted.`
          : quickSubmit
            ? "Voucher saved and submitted."
            : editingVoucherId
              ? "Voucher updated."
              : "Voucher created.",
      );
      resetForm();
      setShowCreate(false);
      await loadList();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await submitVoucher(false);
  }

  function openNewVoucher(voucherType: string) {
    const hasUnsavedLines = showCreate && form.lines.some((l) => Number(l.amount) > 0);
    if (hasUnsavedLines && !window.confirm("Discard the voucher you are entering and start a new one?")) return;
    resetForm();
    setForm((p) => ({ ...p, voucher_type: voucherType }));
    setShowCreate(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useVoucherHotkeys({
    onNewVoucher: openNewVoucher,
    onSave: (andSubmit) => void submitVoucher(andSubmit),
    formOpen: showCreate,
    enabled: pendingWorkflowAction == null && ledgerCreate == null,
  });

  const newTypeFromUrl = searchParams.get("new");
  useEffect(() => {
    if (!newTypeFromUrl) return;
    const type = newTypeFromUrl.trim().toUpperCase();
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("new");
        return next;
      },
      { replace: true },
    );
    if (!/^[A-Z_]{2,32}$/.test(type)) return;
    resetForm();
    setForm((p) => ({ ...p, voucher_type: type }));
    setShowCreate(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newTypeFromUrl, setSearchParams]);

  const runListWorkflowAction = useCallback(
    async (voucherId: number, action: string, reason: string) => {
      setError(null);
      setSuccess(null);
      try {
        if (action === "post") {
          const v = await api.postVoucher(voucherId);
          if (v.control_warnings?.length) {
            setSuccess(`Posted. Review: ${v.control_warnings.join(" ")}`);
            setOpenActionsId(null);
            await loadList();
            return;
          }
        } else if (action === "reverse") {
          await api.reverseVoucher(voucherId, { reason: reason.trim() || "Reversal" });
        }
        else if (action === "cancel_posting") await api.cancelVoucherPosting(voucherId);
        else {
          const nextStatus = ACTION_TO_STATUS[action];
          if (!nextStatus) throw new Error(`Unsupported action: ${action}`);
          await api.updateVoucherStatus(voucherId, nextStatus, { reason });
        }
        const label = ACTION_LABEL[action] ?? action;
        setSuccess(reason.trim() ? `Action complete: ${label} — ${reason.trim()}` : `Action complete: ${label}`);
        setOpenActionsId(null);
        await loadList();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [loadList],
  );

  function takeAction(voucherId: number, action: string) {
    if (ACTIONS_NEEDING_REASON.has(action)) {
      setPendingWorkflowAction({ voucherId, action });
      return;
    }
    void runListWorkflowAction(voucherId, action, "");
  }

  const startEdit = useCallback((voucher: VoucherResponse) => {
    billWiseFetchedRef.current.clear();
    setAccountBillWiseMap({});
    setEditingVoucherId(voucher.id);
    const isMc = voucher.currency !== voucher.base_currency;
    setMultiCurrency(isMc);
    setOpenLineActionsIdx(null);
    setNarrationSuggestion(null);
    setShowCreate(true);
    setForm({
      voucher_type: voucher.voucher_type,
      voucher_date: voucher.voucher_date,
      description: voucher.description ?? "",
      reference: voucher.reference ?? "",
      currency: voucher.currency,
      base_currency: voucher.base_currency,
      exchange_rate: voucher.exchange_rate,
      exchange_rate_source: voucher.exchange_rate_source ?? undefined,
      trade_case_id: voucher.trade_case_id,
      btb_lc_id: voucher.btb_lc_id,
      lines: voucher.lines.map((line) => ({
        account_id: line.account_id,
        cost_center_id: line.cost_center_id ?? null,
        currency: line.currency ?? voucher.currency,
        exchange_rate: line.exchange_rate ?? voucher.exchange_rate,
        base_amount: line.base_amount ?? undefined,
        is_rate_overridden: line.is_rate_overridden ?? false,
        rate_source: line.rate_source ?? "system",
        entry_type: line.entry_type,
        amount: line.amount,
        notes: line.notes ?? "",
        cost_nature_override: line.cost_nature_override ?? null,
      })),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const editIdFromUrl = searchParams.get("edit");
  useEffect(() => {
    if (!editIdFromUrl) return;
    const id = Number(editIdFromUrl);
    if (!Number.isFinite(id) || id <= 0) return;
    let cancelled = false;
    void api
      .getVoucher(id)
      .then((v) => {
        if (cancelled) return;
        startEdit(v);
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("edit");
            return next;
          },
          { replace: true },
        );
      })
      .catch((e) => {
        logApiError("VouchersPage.openEditFromUrl", e);
      });
    return () => {
      cancelled = true;
    };
  }, [editIdFromUrl, setSearchParams, startEdit]);

  async function handleDelete(voucherId: number) {
    if (!window.confirm("Delete this voucher? This cannot be undone.")) return;
    try {
      await api.deleteVoucher(voucherId);
      setSuccess("Voucher deleted.");
      await loadList();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const bdtEquivalent = multiCurrency ? (debitTotal * Number(form.exchange_rate || 1)).toFixed(2) : null;

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Vouchers"
        description="Create, manage and track accounting vouchers with multi-currency, cost centers, bill-wise accounts, and digital verification."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/app/accounts/reports/voucher-analytics"
              className="rounded-lg border border-border-strong px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
            >
              Analytics
            </Link>
            <Link
              to="/app/accounts/vouchers/approval-queue"
              className="rounded-lg border border-border-strong px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-subtle"
            >
              Approval queue
            </Link>
            <button
              type="button"
              className="rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
              onClick={() => {
                resetForm();
                setShowCreate(true);
              }}
            >
              + New Voucher
            </button>
          </div>
        }
      />

      {error ? <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}
      {success ? <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-3 py-2 text-sm text-status-success-foreground">{success}</div> : null}

      {/* ─────────────── CREATE / EDIT FORM ─────────────── */}
      {showCreate ? (
        <form onSubmit={submit} className="space-y-5">
          <div className={`grid gap-5 ${assistEnabled ? "xl:grid-cols-[minmax(0,1fr)_21rem]" : ""}`}>
          <div className="min-w-0 space-y-5">
          {/* Card: Voucher details */}
          <div className="rounded-xl border border-border bg-surface-raised p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{editingVoucherId ? `Edit Voucher #${editingVoucherId}` : "New Voucher"}</h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  {VOUCHER_HOTKEYS.map((h) => `${h.fKey} ${h.label}`).join(" · ")} · Ctrl+Enter save draft · Ctrl+Shift+Enter save &amp; submit
                </p>
              </div>
              <button type="button" className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => { resetForm(); setShowCreate(false); }}>
                Cancel
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Voucher type">
              {VOUCHER_HOTKEYS.filter((h) => voucherTypes.length === 0 || voucherTypes.includes(h.type)).map((h) => (
                <button
                  key={h.type}
                  type="button"
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    form.voucher_type === h.type
                      ? "border-brand-primary bg-brand-primary text-brand-primary-foreground"
                      : "border-border-strong text-text-secondary hover:bg-surface-subtle"
                  }`}
                  onClick={() => setForm((p) => ({ ...p, voucher_type: h.type }))}
                >
                  {h.label} <span className="opacity-70">{h.fKey}</span>
                </button>
              ))}
            </div>

            {periodLock?.locked ? (
              <div className="mb-4 rounded-lg border border-status-warning/30 bg-status-warning-subtle px-3 py-2 text-sm text-status-warning-foreground">
                <strong>Accounting period:</strong> {periodLock.reason ?? "This date cannot be posted."} Posting will fail until the period is open or the date is changed.
              </div>
            ) : periodLock && !periodLock.locked && periodLock.period_name ? (
              <div className="mb-4 rounded-lg border border-status-success/20 bg-status-success-subtle px-3 py-2 text-xs text-status-success-foreground">
                Open accounting period: <strong>{periodLock.period_name}</strong>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={LABEL}>Voucher type</label>
                <select className={CTL} value={form.voucher_type} onChange={(e) => setForm((p) => ({ ...p, voucher_type: e.target.value }))}>
                  {voucherTypes.length === 0 ? <option value="JOURNAL">JOURNAL</option> : null}
                  {voucherTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Financial year</label>
                <select className={CTL} value={selectedFiscalYear} onChange={(e) => changeFiscalYear(Number(e.target.value))}>
                  {fyOptions.map((o) => (
                    <option key={o.fiscalYear} value={o.fiscalYear}>
                      {o.label}
                      {o.isCurrent ? " (current)" : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-text-muted">
                  {formatShortDate(selectedFyBounds.startDate)} – {formatShortDate(selectedFyBounds.endDate)}
                </p>
              </div>
              <div>
                <label className={LABEL}>Voucher date</label>
                <input
                  type="date"
                  className={CTL}
                  value={form.voucher_date}
                  min={selectedFyBounds.startDate}
                  max={selectedFyBounds.endDate}
                  onChange={(e) => setForm((p) => ({ ...p, voucher_date: e.target.value }))}
                />
                {form.voucher_date !== todayISO ? (
                  <button
                    type="button"
                    className="mt-1 text-[11px] font-medium text-brand-primary hover:underline"
                    onClick={() => setForm((p) => ({ ...p, voucher_date: todayISO }))}
                  >
                    Use today
                  </button>
                ) : null}
              </div>
              <div>
                <label className={LABEL}>Reference</label>
                <input className={CTL} placeholder="e.g. INV-001" value={form.reference ?? ""} onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))} />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium text-text-secondary">
                    Narration <span className="text-status-danger-foreground">*</span>
                  </label>
                  {assistEnabled ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-2.5 py-1 text-xs font-medium text-brand-primary hover:bg-brand-primary/20 disabled:opacity-50"
                      onClick={() => void requestNarration()}
                      disabled={narrationLoading}
                      title="Write a narration from the lines you entered"
                    >
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />
                      {narrationLoading ? "Thinking…" : "Suggest with AI"}
                    </button>
                  ) : null}
                </div>
                <textarea
                  className={`${CTL} min-h-[2.75rem] resize-y`}
                  rows={2}
                  placeholder="Enter narration (required for audit)"
                  value={form.description ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  required
                />
                {narrationSuggestion ? (
                  <div className="mt-2 flex flex-wrap items-start gap-2 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-3 py-2 text-xs">
                    <span className="min-w-0 flex-1 text-text-primary">
                      <span className="mr-1 font-semibold text-brand-primary">
                        {narrationSuggestion.source === "ai" ? "AI suggestion:" : "Suggestion:"}
                      </span>
                      {narrationSuggestion.narration}
                    </span>
                    <button
                      type="button"
                      className="rounded-md bg-brand-primary px-2.5 py-1 font-medium text-brand-primary-foreground hover:bg-brand-primary/90"
                      onClick={() => {
                        setForm((p) => ({ ...p, description: narrationSuggestion.narration }));
                        setNarrationSuggestion(null);
                      }}
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-border-strong px-2.5 py-1 text-text-secondary hover:bg-surface-subtle"
                      onClick={() => setNarrationSuggestion(null)}
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="sm:col-span-2 lg:col-span-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className={LABEL}>Trade case (optional)</label>
                  <RemoteSearchSelect<TradeCaseRow>
                    className="w-full"
                    menuPortal
                    placeholder="Search reference, stage…"
                    value={form.trade_case_id && form.trade_case_id > 0 ? form.trade_case_id : ""}
                    onChange={(next) =>
                      setForm((p) => ({ ...p, trade_case_id: typeof next === "number" && next > 0 ? next : undefined }))
                    }
                    fetchPage={fetchTradeCasePage}
                    hydrateById={hydrateTradeCase}
                    allowClear
                  />
                </div>
                <div>
                  <label className={LABEL}>BTB LC (optional)</label>
                  <RemoteSearchSelect<BtbLcRow>
                    className="w-full"
                    menuPortal
                    placeholder="Search LC ref / number…"
                    value={form.btb_lc_id && form.btb_lc_id > 0 ? form.btb_lc_id : ""}
                    onChange={(next) =>
                      setForm((p) => ({ ...p, btb_lc_id: typeof next === "number" && next > 0 ? next : undefined }))
                    }
                    fetchPage={fetchBtbLcPage}
                    hydrateById={hydrateBtbLc}
                    allowClear
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card: Entries (ledger lines) */}
          <div className="rounded-xl border border-border bg-surface-raised p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Entries</h3>
                <p className="text-[11px] text-text-muted">Type to search a ledger. Arrow keys + Enter pick it; Alt+C creates a new ledger.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => addLine("DEBIT")}>+ Debit line</button>
                <button type="button" className="rounded-lg border border-border-strong px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => addLine("CREDIT")}>+ Credit line</button>
                <button type="button" className="rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 text-xs font-medium text-brand-primary hover:bg-brand-primary/20" onClick={autoBalanceVoucher}>Auto balance</button>
              </div>
            </div>

            <div className="rounded-lg border border-border">
              <div className={`hidden gap-2 border-b border-border bg-surface-subtle px-3 py-2 text-xs font-medium text-text-muted md:grid ${LINE_GRID}`}>
                <span className="text-center">#</span>
                <span>Ledger account</span>
                <span className="text-right">Debit</span>
                <span className="text-right">Credit</span>
                <span className="text-right">Actions</span>
              </div>
              {form.lines.map((line, idx) => {
                const insight = line.account_id > 0 ? assistAccounts.get(line.account_id) : undefined;
                const goesNegative = insight ? insight.is_cash_or_bank && Number(insight.projected_balance) < 0 : false;
                return (
                  <div
                    key={idx}
                    className={`border-b border-border px-3 py-3 last:border-b-0 ${line.entry_type === "CREDIT" ? "bg-surface-subtle/40" : ""}`}
                  >
                    <div className={`grid gap-2 md:items-start ${LINE_GRID}`}>
                      <span className="hidden pt-1.5 text-center text-xs text-text-muted md:block">{idx + 1}</span>
                      <div className="min-w-0">
                        <label className="mb-1 block text-xs text-text-muted md:hidden">Line {idx + 1} · Ledger account</label>
                        <RemoteSearchSelect<ChartOfAccountResponse>
                          className="w-full"
                          menuPortal
                          aria-label={`Ledger account for line ${idx + 1}`}
                          placeholder="Search account number or name…"
                          value={line.account_id > 0 ? line.account_id : ""}
                          onChange={(next, opt) => {
                            const id = typeof next === "number" && next > 0 ? next : 0;
                            setLine(idx, { account_id: id });
                            const meta = opt?.meta;
                            if (meta && id > 0) {
                              setAccountBillWiseMap((m) => ({ ...m, [id]: Boolean(meta.enable_bill_wise) }));
                            }
                          }}
                          fetchPage={fetchChartAccountPage}
                          hydrateById={hydrateChartAccount}
                          createLabel="ledger"
                          onCreateNew={(typed) => setLedgerCreate({ lineIdx: idx, name: typed })}
                        />
                        {insight || (line.account_id > 0 && accountBillWiseMap[line.account_id]) ? (
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-muted">
                            {insight ? (
                              <span>
                                Balance {formatDrCr(insight.balance, insight.normal_balance)} → after{" "}
                                <span className={goesNegative ? "font-semibold text-status-danger-foreground" : "font-medium text-text-secondary"}>
                                  {formatDrCr(insight.projected_balance, insight.normal_balance)}
                                </span>
                              </span>
                            ) : null}
                            {insight?.unusual_amount ? (
                              <span className="font-medium text-status-warning-foreground">Unusual amount</span>
                            ) : null}
                            {line.account_id > 0 && accountBillWiseMap[line.account_id] ? (
                              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">Bill-Wise Enabled</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-text-muted md:hidden">Debit</label>
                        <input
                          className={`${LINE_CTL} text-right tabular-nums`}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          aria-label={`Debit amount for line ${idx + 1}`}
                          value={line.entry_type === "DEBIT" ? line.amount : ""}
                          onChange={(e) => setLineSideAmount(idx, "DEBIT", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-text-muted md:hidden">Credit</label>
                        <input
                          className={`${LINE_CTL} text-right tabular-nums`}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          aria-label={`Credit amount for line ${idx + 1}`}
                          value={line.entry_type === "CREDIT" ? line.amount : ""}
                          onChange={(e) => setLineSideAmount(idx, "CREDIT", e.target.value)}
                        />
                      </div>
                      <div className="relative flex justify-end" data-line-actions>
                        <button
                          type="button"
                          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          onClick={() => setOpenLineActionsIdx((prev) => (prev === idx ? null : idx))}
                        >
                          Actions
                        </button>
                        {openLineActionsIdx === idx ? (
                          <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                            <button
                              type="button"
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                              onClick={() => { copyLine(idx); setOpenLineActionsIdx(null); }}
                            >
                              Copy line
                            </button>
                            <button
                              type="button"
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                              onClick={() => { switchLineSide(idx); setOpenLineActionsIdx(null); }}
                            >
                              Switch to {line.entry_type === "DEBIT" ? "Credit" : "Debit"}
                            </button>
                            <button
                              type="button"
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                              disabled={form.lines.length <= 1}
                              onClick={() => { removeLine(idx); setOpenLineActionsIdx(null); }}
                            >
                              Delete line
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 md:ml-[2.5rem] md:grid-cols-3">
                      <RemoteSearchSelect
                        className="w-full"
                        menuPortal
                        aria-label={`Cost center for line ${idx + 1}`}
                        placeholder="Cost center (optional)…"
                        value={line.cost_center_id ?? ""}
                        onChange={(next) => setLine(idx, { cost_center_id: next === "" ? null : Number(next) })}
                        fetchPage={fetchCostCenterPage}
                        hydrateById={hydrateCostCenter}
                        allowClear
                      />
                      <select
                        className={LINE_CTL}
                        aria-label={`Cost nature for line ${idx + 1}`}
                        value={line.cost_nature_override ?? ""}
                        onChange={(e) =>
                          setLine(idx, {
                            cost_nature_override: e.target.value
                              ? (e.target.value as (typeof FINANCE_COST_NATURE_CODES)[number])
                              : null,
                          })
                        }
                        title="Overrides the ledger account default for CM / material reporting on this line"
                      >
                        <option value="">Cost nature: account default</option>
                        {FINANCE_COST_NATURE_CODES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <input
                        className={LINE_CTL}
                        aria-label={`Note for line ${idx + 1}`}
                        placeholder="Line note (optional)"
                        value={line.notes ?? ""}
                        onChange={(e) => setLine(idx, { notes: e.target.value })}
                      />
                    </div>
                  </div>
                );
              })}
              <div className={`hidden gap-2 border-t border-border bg-surface-subtle px-3 py-2 text-sm md:grid ${LINE_GRID}`}>
                <span />
                <span className="pt-0.5 text-xs font-medium text-text-muted">Total</span>
                <span className="text-right font-semibold tabular-nums text-text-primary">
                  {debitTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className="text-right font-semibold tabular-nums text-text-primary">
                  {creditTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span />
              </div>
            </div>
          </div>

          {/* Card: Multi-Currency */}
          <div className="rounded-xl border border-border bg-surface-raised p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">Multi-Currency Entry</h3>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border-strong text-brand-primary focus:ring-brand-primary/20"
                  checked={multiCurrency}
                  onChange={(e) => {
                    setMultiCurrency(e.target.checked);
                    if (!e.target.checked) {
                      setForm((p) => ({
                        ...p,
                        currency: "BDT",
                        base_currency: "BDT",
                        exchange_rate: "1",
                        exchange_rate_source: undefined,
                      }));
                      setLiveRateStatus("idle");
                    }
                  }}
                />
                Enable Multi-Currency
              </label>
            </div>

            {multiCurrency ? (
              <div className="grid gap-4 md:grid-cols-4 items-end">
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Transaction Currency</label>
                  <select
                    className={CTL}
                    value={form.currency ?? "BDT"}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, currency: e.target.value }));
                      setLiveRateStatus("idle");
                    }}
                  >
                    {["BDT", "USD", "EUR", "GBP", "JPY", "CNY", "INR", "AED", "SAR", "CAD", "AUD", "SGD", "MYR", "CHF"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Base Currency</label>
                  <select className={CTL} value={form.base_currency ?? "BDT"} onChange={(e) => { setForm((p) => ({ ...p, base_currency: e.target.value })); setLiveRateStatus("idle"); }}>
                    {["BDT", "USD", "EUR", "GBP"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">Exchange Rate</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      className={CTL}
                      value={form.exchange_rate ?? "1"}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, exchange_rate: e.target.value, exchange_rate_source: "manual" }));
                        setLiveRateStatus("idle");
                      }}
                    />
                    <button
                      type="button"
                      className="whitespace-nowrap rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-2 text-xs font-semibold text-brand-primary hover:bg-brand-primary/20"
                      onClick={() => void fetchLiveRate()}
                      disabled={liveRateStatus === "loading"}
                    >
                      {liveRateStatus === "loading" ? "Fetching..." : "Live Rate"}
                    </button>
                  </div>
                  {liveRateStatus === "fetched" ? (
                    <p className="mt-1 text-xs text-status-success-foreground">Live rate fetched from open.er-api.com</p>
                  ) : liveRateStatus === "error" ? (
                    <p className="mt-1 text-xs text-status-danger-foreground">Could not fetch live rate. Enter manually.</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">BDT Equivalent</label>
                  <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm font-semibold text-text-primary">
                    {bdtEquivalent ? `${form.base_currency} ${Number(bdtEquivalent).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-muted">Toggle on to record vouchers in foreign currencies with automatic or manual exchange rates.</p>
            )}
          </div>

          {gstEnabled ? (
            <div className="rounded-xl border border-border bg-surface-raised p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-text-primary">Tax Preview</h3>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-text-muted">
                    Direction
                    <select
                      className={`${CTL} mt-1`}
                      value={taxDirection}
                      onChange={(e) => setTaxDirection(e.target.value as "OUTWARD" | "INWARD")}
                    >
                      <option value="OUTWARD">Outward (sales)</option>
                      <option value="INWARD">Inward (purchase / ITC)</option>
                    </select>
                  </label>
                  <label className="text-xs text-text-muted">
                    Place of supply
                    <input
                      className={`${CTL} mt-1`}
                      placeholder="State code e.g. 27"
                      value={taxPos}
                      onChange={(e) => setTaxPos(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="rounded-lg border border-border-strong px-3 py-1.5 text-xs hover:bg-surface-subtle"
                    onClick={() => {
                      const taxable = form.lines
                        .filter((ln) => {
                          const notes = ln.notes || "";
                          return /HSN[:\s=]/i.test(notes) || /GST_RATE[:\s=]/i.test(notes);
                        })
                        .map((ln) => {
                          const notes = ln.notes || "";
                          const hsn = notes.match(/HSN[:\s=]*([A-Za-z0-9]+)/i)?.[1];
                          const rate = notes.match(/GST_RATE[:\s=]*([0-9.]+)/i)?.[1] || "18";
                          return {
                            taxable_amount: ln.amount || "0",
                            gst_rate: rate,
                            hsn_code: hsn,
                          };
                        });
                      if (!taxable.length) {
                        setTaxPreviewError("Add HSN:xxxx and GST_RATE:18 in line notes to preview tax.");
                        setTaxPreview(null);
                        return;
                      }
                      setTaxPreviewError("");
                      void api
                        .previewTax({
                          taxable_lines: taxable,
                          place_of_supply_state: taxPos || undefined,
                          direction: taxDirection,
                        })
                        .then(setTaxPreview)
                        .catch((e) => {
                          logApiError("VouchersPage.taxPreview", e);
                          setTaxPreviewError((e as Error).message);
                          setTaxPreview(null);
                        });
                    }}
                  >
                    Calculate tax
                  </button>
                </div>
              </div>
              {taxPreviewError ? (
                <p className="text-xs text-status-danger-foreground">{taxPreviewError}</p>
              ) : null}
              {taxPreview ? (
                <div className="space-y-2 text-sm">
                  <p className="text-text-secondary">
                    Supply: <span className="font-medium">{String(taxPreview.supply_kind)}</span>
                    {" · "}Taxable {String(taxPreview.taxable_total)}
                    {" · "}Tax {String(taxPreview.tax_total)}
                    {" · "}Grand {String(taxPreview.grand_total)}
                  </p>
                  <table className="min-w-full text-xs">
                    <thead className="bg-surface-subtle text-left text-text-muted">
                      <tr>
                        <th className="px-2 py-1">Type</th>
                        <th className="px-2 py-1 text-right">Rate</th>
                        <th className="px-2 py-1 text-right">Taxable</th>
                        <th className="px-2 py-1 text-right">Tax</th>
                        <th className="px-2 py-1">HSN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(taxPreview.lines || []).map((ln, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-2 py-1">{ln.tax_type}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{ln.tax_rate}%</td>
                          <td className="px-2 py-1 text-right tabular-nums">{ln.taxable_amount}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{ln.tax_amount}</td>
                          <td className="px-2 py-1">{ln.hsn_code || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(taxPreview.warnings || []).length ? (
                    <p className="text-xs text-amber-700">{(taxPreview.warnings || []).join(" ")}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-text-muted">
                  Tip: put <code className="text-[11px]">HSN:6109 GST_RATE:18</code> in a sales/purchase line note, then
                  Calculate tax before posting.
                </p>
              )}
            </div>
          ) : null}

          </div>
          {assistEnabled ? (
            <VoucherEntryAssistPanel
              data={assist.data}
              loading={assist.loading}
              error={assist.error}
              onAddAccount={addSuggestedAccount}
              onUseNarration={(text) => setForm((p) => ({ ...p, description: text }))}
            />
          ) : null}
          </div>

          {/* Card: Totals & Actions */}
          <div className="sticky bottom-0 z-20 rounded-xl border border-border bg-surface-raised p-5 shadow-lg md:static md:shadow-none">
            <div className="grid gap-4 md:grid-cols-4 items-center">
              <div className="text-sm">Debit Total: <span className="font-semibold text-text-primary">{debitTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="text-sm">Credit Total: <span className="font-semibold text-text-primary">{creditTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className={`rounded-lg px-3 py-1.5 text-center text-sm font-semibold ${isBalanced ? "bg-status-success-subtle text-status-success-foreground" : "bg-status-danger-subtle text-status-danger-foreground"}`}>
                {isBalanced ? "Balanced" : `Difference: ${Math.abs(debitTotal - creditTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-status-info/30 bg-status-info-subtle px-4 py-2 text-sm font-medium text-status-info-foreground hover:bg-status-info-subtle/80 disabled:opacity-50"
                  disabled={saveGuard.busy}
                  onClick={() => void submitVoucher(true)}
                >
                  {saveGuard.busy ? "Saving…" : editingVoucherId ? "Update & Submit" : "Save & Submit"}
                </button>
                {directPostOn ? (
                  <button
                    type="button"
                    className="rounded-lg border border-status-success/30 bg-status-success-subtle px-4 py-2 text-sm font-medium text-status-success-foreground hover:bg-status-success-subtle/80 disabled:opacity-50"
                    title="Save and post in one step (direct posting is on for this company)"
                    disabled={saveGuard.busy}
                    onClick={() => void submitVoucher(false, true)}
                  >
                    {saveGuard.busy ? "Saving…" : editingVoucherId ? "Update & Post" : "Save & Post"}
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="rounded-lg bg-brand-primary px-5 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90 disabled:opacity-50"
                  disabled={saveGuard.busy}
                >
                  {saveGuard.busy ? "Saving…" : editingVoucherId ? "Update Draft" : "Save Draft"}
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : null}

      {/* ─────────────── VOUCHER LIST ─────────────── */}
      <div className="rounded-xl border border-border bg-surface-raised p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-text-primary">Voucher List</h2>
          <div className="flex flex-wrap gap-2">
            <select className={`${CTL} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              {VOUCHER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className={`${CTL} md:w-72`} placeholder="Search number, type, reference, narration..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-subtle text-left">
              <tr>
                <th className="px-3 py-2">No</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Narration</th>
                <th className="px-3 py-2">Currency</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Signed</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-3 py-5 text-text-muted" colSpan={10}>Loading vouchers...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="px-3 py-5 text-text-muted" colSpan={10}>No vouchers found.</td></tr>
              ) : (
                rows.map((row) => {
                  const amount = row.lines.filter((l) => l.entry_type === "DEBIT").reduce((s, l) => s + Number(l.amount || 0), 0);
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-t border-border hover:bg-surface-subtle/50"
                      onClick={() => navigate(`/app/accounts/vouchers/${row.id}`)}
                    >
                      <td className="px-3 py-2 font-medium text-brand-primary">{row.voucher_number}</td>
                      <td className="px-3 py-2">{row.voucher_date}</td>
                      <td className="px-3 py-2">{row.voucher_type}</td>
                      <td className="px-3 py-2"><span className="rounded-md bg-surface-subtle px-2 py-0.5 text-xs font-medium">{row.status}</span></td>
                      <td className="max-w-[10rem] truncate px-3 py-2">{row.reference ?? "—"}</td>
                      <td className="max-w-[14rem] truncate px-3 py-2">{row.description ?? "—"}</td>
                      <td className="px-3 py-2">{row.currency}</td>
                      <td className="px-3 py-2 text-right font-medium">{amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2">{row.signed_by_system ? <span className="text-status-success-foreground">Yes</span> : <span className="text-text-muted">No</span>}</td>
                      <td className="px-3 py-2">
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                            onClick={() => setOpenActionsId((prev) => (prev === row.id ? null : row.id))}
                          >
                            Actions
                          </button>
                          {openActionsId === row.id ? (
                            <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                              <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => navigate(`/app/accounts/vouchers/${row.id}`)}>View Details</button>
                              <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => startEdit(row)}>Edit</button>
                              <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => navigate(`/app/accounts/vouchers/print?voucher_id=${row.id}`)}>Print / PDF</button>
                              {(availableActionMap[row.id] ?? []).map((action) => (
                                <button key={action} type="button" className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle" onClick={() => void takeAction(row.id, action)}>
                                  {ACTION_LABEL[action] ?? action}
                                </button>
                              ))}
                              <button type="button" className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger-foreground hover:bg-status-danger-subtle" onClick={() => void handleDelete(row.id)}>Delete</button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!loading && totalRows > 0 ? (
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={totalRows}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            allowedSizes={allowedSizes}
          />
        ) : null}
      </div>

      <VoucherActionReasonModal
        open={pendingWorkflowAction != null}
        title={
          pendingWorkflowAction
            ? `Confirm ${ACTION_LABEL[pendingWorkflowAction.action] ?? pendingWorkflowAction.action}`
            : "Confirm"
        }
        description="A short reason helps your team during review. It is saved in the voucher's History."
        confirmLabel={pendingWorkflowAction ? ACTION_LABEL[pendingWorkflowAction.action] ?? "Confirm" : "Confirm"}
        onClose={() => setPendingWorkflowAction(null)}
        onConfirm={(reason) => {
          if (!pendingWorkflowAction) return;
          const { voucherId, action } = pendingWorkflowAction;
          setPendingWorkflowAction(null);
          void runListWorkflowAction(voucherId, action, reason);
        }}
      />

      <LedgerQuickCreateModal
        open={ledgerCreate != null}
        initialName={ledgerCreate?.name}
        onClose={() => setLedgerCreate(null)}
        onCreated={(account) => {
          if (ledgerCreate) setLine(ledgerCreate.lineIdx, { account_id: account.id });
          setAccountBillWiseMap((m) => ({ ...m, [account.id]: Boolean(account.enable_bill_wise) }));
          setSuccess(`Ledger "${account.name}" created and selected.`);
        }}
      />
    </div>
  );
}
