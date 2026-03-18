import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type FollowupResponse,
  type OrderResponse,
  type OrderFollowupActionResponse,
  type OrderFollowupActionCreate,
  type OrderFollowupActionUpdate,
  type FollowupActionTemplateResponse,
  type FollowupSummaryResponse,
  type TnaGenerateRequest,
  type CustomerResponse,
  type UserWithRoleResponse,
  type FollowupActionRejectionLogEntry,
  type FollowupActionCommentOut,
  type UnifiedTnaSummaryResponse,
  type UnifiedTnaActionResponse,
} from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TNA_PHASES = [
  "pre_order",
  "sampling",
  "approval",
  "sourcing",
  "fabric",
  "trims",
  "production",
  "inspection",
  "finishing",
  "packing",
  "commercial",
  "shipment",
  "payment",
  "other",
];
const TNA_STATUSES = [
  "pending",
  "in_progress",
  "submitted",
  "approved",
  "rejected",
  "resubmitted",
  "completed",
  "cancelled",
  "on_hold",
];

const MILESTONE_TYPES = [
  { value: "", label: "—" },
  { value: "ex_factory", label: "Ex-factory" },
  { value: "shipment", label: "Shipment" },
  { value: "cutting", label: "Cutting" },
];

function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function phaseBadgeClass(phase: string) {
  const p = phase.toLowerCase();
  if (p.includes("shipment") || p.includes("commercial")) return "bg-status-info-subtle text-status-info-foreground";
  if (p.includes("production") || p.includes("inspection")) return "bg-status-warning-subtle text-status-warning-foreground";
  if (p.includes("approval") || p.includes("sampling")) return "bg-brand-primary/10 text-brand-primary";
  if (p.includes("sourcing") || p.includes("fabric") || p.includes("trims")) return "bg-status-success-subtle text-status-success-foreground";
  return "bg-status-neutral-subtle text-status-neutral-foreground";
}

function statusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "completed" || s === "approved") return "bg-status-success-subtle text-status-success-foreground";
  if (s === "rejected") return "bg-status-danger-subtle text-status-danger-foreground";
  if (s === "in_progress" || s === "submitted" || s === "resubmitted") return "bg-status-info-subtle text-status-info-foreground";
  if (s === "on_hold" || s === "cancelled") return "bg-status-neutral-subtle text-status-neutral-foreground";
  return "bg-status-neutral-subtle text-status-neutral-foreground";
}

function severityBadgeClass(severity: string | null) {
  if (!severity) return "bg-status-neutral-subtle text-status-neutral-foreground";
  const v = severity.toLowerCase();
  if (v === "critical") return "bg-status-danger-subtle text-status-danger-foreground";
  if (v === "high") return "bg-status-warning-subtle text-status-warning-foreground";
  if (v === "medium") return "bg-status-info-subtle text-status-info-foreground";
  return "bg-status-neutral-subtle text-status-neutral-foreground";
}

function escapeCsvCell(s: string | null | undefined): string {
  if (s == null) return "";
  const t = String(s);
  if (t.includes(",") || t.includes('"') || t.includes("\n")) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function downloadActionsCsv(rows: OrderFollowupActionResponse[]) {
  const headers = [
    "Order", "Style", "Action", "Phase", "Planned", "Submission", "Approval", "Resubmission", "Status", "Priority", "Rejection reason", "Remarks",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        escapeCsvCell(r.order_code ?? `#${r.order_id}`),
        escapeCsvCell(r.style_code),
        escapeCsvCell(r.title),
        escapeCsvCell(r.phase),
        escapeCsvCell(r.planned_date),
        escapeCsvCell(r.actual_submission_date),
        escapeCsvCell(r.approval_received_date),
        escapeCsvCell(r.resubmission_date),
        escapeCsvCell(r.status),
        escapeCsvCell(r.severity),
        escapeCsvCell(r.rejection_reason),
        escapeCsvCell(r.remarks),
      ].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tna-followup-actions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function CalendarGrid({
  calendarMonth,
  actions,
  onOpenEdit,
  phaseBadgeClass,
}: {
  calendarMonth: string;
  actions: OrderFollowupActionResponse[];
  onOpenEdit: (a: OrderFollowupActionResponse) => void;
  phaseBadgeClass: (p: string) => string;
}) {
  const parts = calendarMonth.split("-").map(Number);
  const y = parts[0] ?? new Date().getFullYear();
  const m = parts[1] ?? 1;
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const totalCells = startPad + daysInMonth;
  const rows = Math.ceil(totalCells / 7);
  const actionsByDay = new Map<string, OrderFollowupActionResponse[]>();
  for (const a of actions) {
    if (!a.planned_date) continue;
    const key = a.planned_date.slice(0, 10);
    if (!actionsByDay.has(key)) actionsByDay.set(key, []);
    actionsByDay.get(key)!.push(a);
  }
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cells: { day: number | null; dateKey: string | null }[] = [];
  for (let i = 0; i < rows * 7; i++) {
    if (i < startPad) {
      cells.push({ day: null, dateKey: null });
    } else {
      const d = i - startPad + 1;
      if (d <= daysInMonth) {
        const dateKey = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        cells.push({ day: d, dateKey });
      } else {
        cells.push({ day: null, dateKey: null });
      }
    }
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            {dayLabels.map((label) => (
              <th key={label} className="p-2 text-left text-text-muted font-medium w-[14.28%]">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, rowIdx) => (
            <tr key={rowIdx} className="border-b border-border-subtle">
              {cells.slice(rowIdx * 7, rowIdx * 7 + 7).map((cell, colIdx) => (
                <td key={colIdx} className="align-top p-1 border border-border-subtle min-h-[80px] bg-surface-raised">
                  {cell.day != null && cell.dateKey != null ? (
                    <>
                      <div className="text-xs font-medium text-text-muted mb-1">{cell.day}</div>
                      <div className="space-y-1">
                        {(actionsByDay.get(cell.dateKey) ?? []).map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => onOpenEdit(a)}
                            className="block w-full text-left rounded px-1.5 py-0.5 text-xs bg-surface-subtle hover:bg-surface-subtle border border-border truncate"
                            title={`${a.title} — ${a.order_code ?? a.order_id}`}
                          >
                            <span className={`rounded-full px-1 py-0.5 text-[10px] ${phaseBadgeClass(a.phase)}`}>{a.phase}</span> {a.title}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FollowupPage() {
  const [summary, setSummary] = useState<FollowupSummaryResponse | null>(null);
  const [unifiedSummary, setUnifiedSummary] = useState<UnifiedTnaSummaryResponse | null>(null);
  const [unifiedActions, setUnifiedActions] = useState<UnifiedTnaActionResponse[]>([]);
  const [actions, setActions] = useState<OrderFollowupActionResponse[]>([]);
  const [overdue, setOverdue] = useState<OrderFollowupActionResponse[]>([]);
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [customers, setCustomers] = useState<CustomerResponse[]>([]);
  const [users, setUsers] = useState<UserWithRoleResponse[]>([]);
  const [templates, setTemplates] = useState<FollowupActionTemplateResponse[]>([]);
  const [manageTemplates, setManageTemplates] = useState<FollowupActionTemplateResponse[]>([]);
  const [filterTemplateBuyerId, setFilterTemplateBuyerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [filterOrderId, setFilterOrderId] = useState<number | null>(null);
  const [filterBuyerId, setFilterBuyerId] = useState<number | null>(null);
  const [filterAssignedToId, setFilterAssignedToId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPhase, setFilterPhase] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [modalAction, setModalAction] = useState<"add" | "edit" | null>(null);
  const [editingAction, setEditingAction] = useState<OrderFollowupActionResponse | null>(null);
  const [form, setForm] = useState<Partial<OrderFollowupActionCreate & OrderFollowupActionUpdate>>({});
  const [actionComments, setActionComments] = useState<FollowupActionCommentOut[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateOrderId, setGenerateOrderId] = useState<number | null>(null);
  const [generateTemplateIds, setGenerateTemplateIds] = useState<number[] | null>(null);
  const [timelineOrderId, setTimelineOrderId] = useState<number | null>(null);
  const [timelineActions, setTimelineActions] = useState<OrderFollowupActionResponse[]>([]);
  const [simpleSectionOpen, setSimpleSectionOpen] = useState(false);
  const [simpleRows, setSimpleRows] = useState<FollowupResponse[]>([]);
  const [simpleOrderId, setSimpleOrderId] = useState(0);
  const [simpleTitle, setSimpleTitle] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "calendar" | "kanban">("table");
  const [selectedActionIds, setSelectedActionIds] = useState<Set<number>>(new Set());
  const [shiftDatesModalOpen, setShiftDatesModalOpen] = useState(false);
  const [shiftDays, setShiftDays] = useState(0);
  const [rejectModalActionId, setRejectModalActionId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectResubmissionDate, setRejectResubmissionDate] = useState("");
  const [openActionsRowId, setOpenActionsRowId] = useState<number | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [calendarActions, setCalendarActions] = useState<OrderFollowupActionResponse[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [templatesSectionOpen, setTemplatesSectionOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<FollowupActionTemplateResponse | null>(null);
  const [templateForm, setTemplateForm] = useState<{
    code: string;
    name: string;
    phase: string;
    sequence_no: number;
    default_days_before_delivery: number | null;
    is_mandatory: boolean;
    is_active: boolean;
  }>({ code: "", name: "", phase: "pre_order", sequence_no: 0, default_days_before_delivery: null, is_mandatory: false, is_active: true });
  const [rejectionHistory, setRejectionHistory] = useState<FollowupActionRejectionLogEntry[]>([]);

  const loadTna = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params: Parameters<typeof api.listFollowupActions>[0] = {};
      if (filterOrderId != null) params.order_id = filterOrderId;
      if (filterAssignedToId != null) params.assigned_to_id = filterAssignedToId;
      if (filterStatus) params.status = filterStatus;
      if (filterPhase) params.phase = filterPhase;
      if (overdueOnly) params.overdue_only = true;
      if (dueFrom) params.due_from = dueFrom;
      if (dueTo) params.due_to = dueTo;
      const [sum, list, od, ords, custs, usrs, tmpl, unifiedSum, unifiedList] = await Promise.all([
        api.getFollowupActionsSummary(filterOrderId != null ? { order_id: filterOrderId } : undefined),
        api.listFollowupActions(params),
        api.getFollowupActionsOverdue(),
        api.listOrders({ limit: 200, offset: 0 }),
        api.listCustomers(),
        api.listUsers(),
        api.listFollowupTemplates({ is_active: true }), // active only for Generate TNA modal
        api.getUnifiedTnaSummary(filterOrderId != null ? { order_id: filterOrderId } : undefined).catch(() => null),
        api.listUnifiedTnaActions({
          order_id: filterOrderId ?? undefined,
          source: "all",
          limit: 8,
          offset: 0,
        }).catch(() => [] as UnifiedTnaActionResponse[]),
      ]);
      setSummary(sum);
      setActions(list);
      setOverdue(od);
      setOrders(ords);
      setCustomers(custs);
      setUsers(usrs);
      setTemplates(tmpl);
      setUnifiedSummary(unifiedSum);
      setUnifiedActions(unifiedList);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load follow-up data");
    } finally {
      setLoading(false);
    }
  }, [filterOrderId, filterAssignedToId, filterStatus, filterPhase, overdueOnly, dueFrom, dueTo]);

  useEffect(() => {
    loadTna();
  }, [loadTna]);

  useEffect(() => {
    const removePrintClasses = () => {
      document.body.classList.remove("print-timeline", "print-list");
    };
    window.addEventListener("afterprint", removePrintClasses);
    return () => window.removeEventListener("afterprint", removePrintClasses);
  }, []);

  const loadSearch = useCallback(async () => {
    if (searchQ.trim().length < 2) return;
    setLoading(true);
    try {
      const list = await api.searchFollowupActions(searchQ.trim());
      setActions(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [searchQ]);

  const loadTimeline = useCallback(async (orderId: number) => {
    setTimelineOrderId(orderId);
    try {
      const list = await api.getFollowupActionsTimeline(orderId);
      setTimelineActions(list);
    } catch {
      setTimelineActions([]);
    }
  }, []);

  const loadSimple = useCallback(async () => {
    try {
      const f = await api.listFollowups(simpleOrderId ? { order_id: simpleOrderId } : undefined);
      setSimpleRows(f);
    } catch {
      setSimpleRows([]);
    }
  }, [simpleOrderId]);

  useEffect(() => {
    if (simpleSectionOpen) loadSimple();
  }, [simpleSectionOpen, loadSimple]);

  const loadCalendar = useCallback(async () => {
    const parts = calendarMonth.split("-").map(Number);
    const y = parts[0] ?? new Date().getFullYear();
    const m = parts[1] ?? 1;
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const dueFrom = first.toISOString().slice(0, 10);
    const dueTo = last.toISOString().slice(0, 10);
    setCalendarLoading(true);
    try {
      const list = await api.listFollowupActions({ due_from: dueFrom, due_to: dueTo });
      setCalendarActions(list);
    } catch {
      setCalendarActions([]);
    } finally {
      setCalendarLoading(false);
    }
  }, [calendarMonth]);

  useEffect(() => {
    if (viewMode === "calendar") loadCalendar();
  }, [viewMode, loadCalendar]);

  const loadManageTemplates = useCallback(async () => {
    try {
      const params: { buyer_id?: number } = {};
      if (filterTemplateBuyerId != null) params.buyer_id = filterTemplateBuyerId;
      const list = await api.listFollowupTemplates(params);
      setManageTemplates(list);
    } catch {
      setManageTemplates([]);
    }
  }, [filterTemplateBuyerId]);

  useEffect(() => {
    if (templatesSectionOpen) loadManageTemplates();
  }, [templatesSectionOpen, loadManageTemplates]);

  const openAdd = () => {
    setEditingAction(null);
    setForm({ phase: "pre_order", status: "pending", title: "" });
    setModalAction("add");
  };

  const openEdit = (row: OrderFollowupActionResponse) => {
    setEditingAction(row);
    setForm({
      title: row.title,
      phase: row.phase,
      status: row.status,
      approval_status: row.approval_status ?? undefined,
      planned_date: row.planned_date ?? undefined,
      actual_submission_date: row.actual_submission_date ?? undefined,
      approval_received_date: row.approval_received_date ?? undefined,
      actual_completion_date: row.actual_completion_date ?? undefined,
      resubmission_date: row.resubmission_date ?? undefined,
      rejection_reason: row.rejection_reason ?? undefined,
      delay_reason: row.delay_reason ?? undefined,
      severity: row.severity ?? undefined,
      remarks: row.remarks ?? undefined,
      assigned_to_id: row.assigned_to_id ?? undefined,
      milestone_type: row.milestone_type ?? undefined,
      external_id: row.external_id ?? undefined,
    });
    setCommentText("");
    setActionComments([]);
    setModalAction("edit");
    setRejectionHistory([]);
    setCommentsLoading(true);
    api.getFollowupActionComments(row.id).then((list) => {
      setActionComments(list);
    }).finally(() => setCommentsLoading(false));
  };

  const closeModal = () => {
    setModalAction(null);
    setEditingAction(null);
    setForm({});
    setActionComments([]);
    setCommentText("");
  };

  const submitAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalAction === "add") {
      if (!form.order_id || !form.title?.trim() || !form.phase) return;
      await api.createFollowupAction({
        order_id: form.order_id,
        title: form.title.trim(),
        phase: form.phase,
        action_group: form.action_group ?? null,
        action_type: form.action_type ?? null,
        description: form.description ?? null,
        planned_date: form.planned_date ?? null,
        actual_submission_date: form.actual_submission_date ?? null,
        approval_received_date: form.approval_received_date ?? null,
        resubmission_date: form.resubmission_date ?? null,
        status: form.status ?? "pending",
        approval_status: form.approval_status ?? null,
        is_rejected: form.is_rejected ?? false,
        rejection_reason: form.rejection_reason ?? null,
        delay_reason: form.delay_reason ?? null,
        severity: form.severity ?? null,
        remarks: form.remarks ?? null,
        assigned_to_id: form.assigned_to_id ?? null,
      });
    } else if (modalAction === "edit" && editingAction) {
      await api.updateFollowupAction(editingAction.id, {
        title: form.title ?? editingAction.title,
        phase: form.phase ?? editingAction.phase,
        action_group: form.action_group ?? editingAction.action_group,
        action_type: form.action_type ?? editingAction.action_type,
        description: form.description ?? editingAction.description,
        planned_date: form.planned_date ?? editingAction.planned_date,
        actual_submission_date: form.actual_submission_date ?? editingAction.actual_submission_date,
        approval_received_date: form.approval_received_date ?? editingAction.approval_received_date,
        actual_completion_date: form.actual_completion_date ?? editingAction.actual_completion_date,
        resubmission_date: form.resubmission_date ?? editingAction.resubmission_date,
        status: form.status ?? editingAction.status,
        approval_status: form.approval_status ?? editingAction.approval_status,
        is_rejected: form.is_rejected ?? editingAction.is_rejected,
        rejection_reason: form.rejection_reason ?? editingAction.rejection_reason,
        delay_reason: form.delay_reason ?? editingAction.delay_reason,
        severity: form.severity ?? editingAction.severity,
        remarks: form.remarks ?? editingAction.remarks,
        assigned_to_id: form.assigned_to_id ?? editingAction.assigned_to_id,
        milestone_type: form.milestone_type !== undefined ? form.milestone_type : editingAction.milestone_type,
        external_id: form.external_id !== undefined ? form.external_id : editingAction.external_id,
      });
    }
    closeModal();
    await loadTna();
  };

  const handleGenerate = async () => {
    if (generateOrderId == null) return;
    const body: TnaGenerateRequest = { order_id: generateOrderId };
    if (generateTemplateIds != null && generateTemplateIds.length > 0) body.template_ids = generateTemplateIds;
    await api.generateFollowupActions(body);
    setGenerateModalOpen(false);
    setGenerateOrderId(null);
    setGenerateTemplateIds(null);
    await loadTna();
    await loadTimeline(generateOrderId);
  };

  const toggleSelect = (id: number) => {
    setSelectedActionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllOnPage = () => {
    if (selectedActionIds.size === filteredActions.length) {
      setSelectedActionIds(new Set());
    } else {
      setSelectedActionIds(new Set(filteredActions.map((a) => a.id)));
    }
  };

  const openAddTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({ code: "", name: "", phase: "pre_order", sequence_no: 0, default_days_before_delivery: null, is_mandatory: false, is_active: true });
    setTemplateModalOpen(true);
  };
  const openEditTemplate = (t: FollowupActionTemplateResponse) => {
    setEditingTemplate(t);
    setTemplateForm({
      code: t.code,
      name: t.name,
      phase: t.phase,
      sequence_no: t.sequence_no,
      default_days_before_delivery: t.default_days_before_delivery,
      is_mandatory: t.is_mandatory,
      is_active: t.is_active,
    });
    setTemplateModalOpen(true);
  };
  const closeTemplateModal = () => {
    setTemplateModalOpen(false);
    setEditingTemplate(null);
  };
  const submitTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTemplate) {
      await api.updateFollowupTemplate(editingTemplate.id, {
        name: templateForm.name,
        phase: templateForm.phase,
        sequence_no: templateForm.sequence_no,
        default_days_before_delivery: templateForm.default_days_before_delivery,
        is_mandatory: templateForm.is_mandatory,
        is_active: templateForm.is_active,
      });
    } else {
      if (!templateForm.code.trim() || !templateForm.name.trim()) return;
      await api.createFollowupTemplate({
        code: templateForm.code.trim(),
        name: templateForm.name.trim(),
        phase: templateForm.phase,
        sequence_no: templateForm.sequence_no,
        default_days_before_delivery: templateForm.default_days_before_delivery,
        is_mandatory: templateForm.is_mandatory,
        is_active: templateForm.is_active,
      });
    }
    closeTemplateModal();
    await loadTna();
    await loadManageTemplates();
  };

  const todayIso = () => new Date().toISOString().slice(0, 10);

  const setDueToday = () => {
    const t = todayIso();
    setDueFrom(t);
    setDueTo(t);
    setOverdueOnly(false);
  };
  const setDueThisWeek = () => {
    const d = new Date();
    const day = d.getDay();
    const daysToSunday = day === 0 ? 0 : 7 - day;
    const end = new Date(d);
    end.setDate(d.getDate() + daysToSunday);
    setDueFrom(todayIso());
    setDueTo(end.toISOString().slice(0, 10));
    setOverdueOnly(false);
  };
  /** Next 7 days – matches summary "Due this week" count (backend uses today..today+7). */
  const setDueSoon7Days = () => {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    setDueFrom(start.toISOString().slice(0, 10));
    setDueTo(end.toISOString().slice(0, 10));
    setOverdueOnly(false);
  };
  const setOverdueFilter = () => {
    setOverdueOnly(true);
    setDueFrom("");
    setDueTo("");
  };
  const clearDueFilter = () => {
    setOverdueOnly(false);
    setDueFrom("");
    setDueTo("");
  };

  const handleMarkSubmitted = async (actionId: number) => {
    await api.updateFollowupAction(actionId, { status: "submitted", actual_submission_date: todayIso() });
    await loadTna();
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rejectModalActionId == null) return;
    await api.addFollowupActionRejectionLog(rejectModalActionId, {
      rejection_reason: rejectReason.trim() || undefined,
      resubmission_date: rejectResubmissionDate.trim() || undefined,
    });
    setRejectModalActionId(null);
    setRejectReason("");
    setRejectResubmissionDate("");
    await loadTna();
  };

  const handleShiftDates = async () => {
    const ids = Array.from(selectedActionIds);
    for (const id of ids) {
      const a = actions.find((x) => x.id === id);
      if (!a?.planned_date) continue;
      const newDate = addDays(a.planned_date, shiftDays);
      await api.updateFollowupAction(id, { planned_date: newDate });
    }
    setSelectedActionIds(new Set());
    setShiftDatesModalOpen(false);
    setShiftDays(0);
    await loadTna();
  };

  const isOverdue = (r: OrderFollowupActionResponse) => {
    if (!r.planned_date || ["completed", "approved", "cancelled"].includes(r.status)) return false;
    return new Date(r.planned_date) < new Date();
  };

  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const filteredActions = useMemo(() => {
    if (filterBuyerId == null) return actions;
    return actions.filter((a) => orderById.get(a.order_id)?.customer_id === filterBuyerId);
  }, [actions, filterBuyerId, orderById]);
  const filteredCalendarActions = useMemo(() => {
    if (filterBuyerId == null) return calendarActions;
    return calendarActions.filter((a) => orderById.get(a.order_id)?.customer_id === filterBuyerId);
  }, [calendarActions, filterBuyerId, orderById]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const userDisplay = (userId: number | null) => {
    if (userId == null) return "—";
    const u = userById.get(userId);
    if (!u) return `#${userId}`;
    if (u.first_name || u.last_name) return [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
    return u.username;
  };
  const milestoneLabel = (milestoneType: string | null) => {
    if (!milestoneType) return null;
    const t = MILESTONE_TYPES.find((m) => m.value === milestoneType);
    return t?.label ?? milestoneType;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">Order Follow-up</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Track TNA actions, approvals, submissions, delays, and shipment readiness.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">{error}</div>
      )}

      {/* KPIs */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="rounded-xl shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking text-text-muted">Open</p>
              <p className="mt-1 text-2xl font-semibold text-text-primary">{summary.open_count}</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking text-text-muted">Overdue</p>
              <p className="mt-1 text-2xl font-semibold text-status-danger">{summary.overdue_count}</p>
            </CardContent>
          </Card>
          <Card
            className="rounded-xl shadow-sm cursor-pointer hover:bg-status-warning-subtle/60 transition-colors"
            title="Filter list to actions due in next 7 days"
            onClick={setDueSoon7Days}
          >
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking text-text-muted">Due this week</p>
              <p className="mt-1 text-2xl font-semibold text-status-warning">{summary.due_this_week_count}</p>
              <p className="mt-0.5 text-xs text-text-muted">Click to filter</p>
            </CardContent>
          </Card>
          <Card className="rounded-xl shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking text-text-muted">Rejected</p>
              <p className="mt-1 text-2xl font-semibold text-text-primary">{summary.rejected_count}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {unifiedSummary && (
        <Card className="rounded-xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Unified TNA (Merch + Manufacturing)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-6">
              <div><span className="text-text-muted">Total:</span> <span className="font-semibold">{unifiedSummary.total_count}</span></div>
              <div><span className="text-text-muted">Open:</span> <span className="font-semibold">{unifiedSummary.open_count}</span></div>
              <div><span className="text-text-muted">Overdue:</span> <span className="font-semibold text-status-danger">{unifiedSummary.overdue_count}</span></div>
              <div><span className="text-text-muted">Completed:</span> <span className="font-semibold">{unifiedSummary.completed_count}</span></div>
              <div><span className="text-text-muted">Merch:</span> <span className="font-semibold">{unifiedSummary.merch_count}</span></div>
              <div><span className="text-text-muted">Mfg:</span> <span className="font-semibold">{unifiedSummary.manufacturing_count}</span></div>
            </div>
            {unifiedActions.length > 0 && (
              <div className="rounded-lg border border-border">
                <div className="grid grid-cols-12 gap-2 border-b border-border bg-surface-subtle px-3 py-2 text-xs font-medium text-text-secondary">
                  <div className="col-span-2">Source</div>
                  <div className="col-span-3">Order</div>
                  <div className="col-span-3">Action</div>
                  <div className="col-span-2">Planned</div>
                  <div className="col-span-2">Status</div>
                </div>
                {unifiedActions.map((ua) => (
                  <div key={`${ua.source_system}-${ua.source_action_id}`} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs border-b border-border-subtle last:border-0">
                    <div className="col-span-2">
                      <span className={`rounded-full px-2 py-0.5 ${ua.source_system === "manufacturing" ? "bg-status-info-subtle text-status-info-foreground" : "bg-status-success-subtle text-status-success-foreground"}`}>
                        {ua.source_system}
                      </span>
                    </div>
                    <div className="col-span-3 text-text-secondary">{ua.order_code ?? "—"}</div>
                    <div className="col-span-3 text-text-primary">{ua.title}</div>
                    <div className="col-span-2 text-text-secondary">{formatDate(ua.planned_date ?? null)}</div>
                    <div className="col-span-2 text-text-secondary">{ua.status}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Overdue alert card */}
      {overdue.length > 0 && (
        <Card className="rounded-xl border-status-warning/20 bg-status-warning-subtle/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Overdue actions</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-text-secondary">
              {overdue.length} action{overdue.length !== 1 ? "s" : ""} past planned date.{" "}
              <button
                type="button"
                onClick={() => setOverdueOnly(true)}
                className="font-medium text-status-warning-foreground underline"
              >
                Show only overdue
              </button>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Toolbar: search, filters, actions */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by title, order, notes…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadSearch()}
          className="min-w-[200px] rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary"
        />
        <button
          type="button"
          onClick={() => loadSearch()}
          className="rounded-lg bg-surface-subtle px-3 py-2 text-sm font-medium text-text-secondary"
        >
          Search
        </button>
        <button
          type="button"
          onClick={() => { setSearchQ(""); loadTna(); }}
          className="rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary"
        >
          Clear
        </button>
        <select
          value={filterOrderId ?? ""}
          onChange={(e) => setFilterOrderId(e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary"
        >
          <option value="">All orders</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>{o.order_code}</option>
          ))}
        </select>
        <select
          value={filterBuyerId ?? ""}
          onChange={(e) => setFilterBuyerId(e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary"
          title="Buyer (customer)"
        >
          <option value="">All buyers</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={filterAssignedToId ?? ""}
          onChange={(e) => setFilterAssignedToId(e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary"
          title="Assigned to"
        >
          <option value="">All assigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{userDisplay(u.id)}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary"
        >
          <option value="">All statuses</option>
          {TNA_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filterPhase}
          onChange={(e) => setFilterPhase(e.target.value)}
          className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary"
        >
          <option value="">All phases</option>
          {TNA_PHASES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
          />
          Overdue only
        </label>
        <span className="text-xs text-text-muted self-center">Quick:</span>
        <button type="button" onClick={setDueToday} className="rounded-lg border border-border-strong px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle">
          Due today
        </button>
        <button type="button" onClick={setDueThisWeek} className="rounded-lg border border-border-strong px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle">
          Due this week
        </button>
        <button type="button" onClick={setOverdueFilter} className="rounded-lg border border-status-warning/25 px-2 py-1.5 text-xs font-medium text-status-warning-foreground hover:bg-status-warning-subtle">
          Overdue
        </button>
        <button type="button" onClick={clearDueFilter} className="rounded-lg border border-border px-2 py-1.5 text-xs text-text-muted hover:bg-surface-subtle">
          Clear dates
        </button>
        <input
          type="date"
          placeholder="Due from"
          value={dueFrom}
          onChange={(e) => setDueFrom(e.target.value)}
          className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary"
        />
        <input
          type="date"
          placeholder="Due to"
          value={dueTo}
          onChange={(e) => setDueTo(e.target.value)}
          className="rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary"
        />
        <button
          type="button"
          onClick={openAdd}
          className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground"
        >
          Add action
        </button>
        <button
          type="button"
          onClick={() => setGenerateModalOpen(true)}
          className="rounded-lg border border-brand-primary bg-surface-raised px-4 py-2 text-sm font-semibold text-brand-primary"
        >
          Generate TNA
        </button>
        <button
          type="button"
          onClick={() => downloadActionsCsv(filteredActions)}
          className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary"
        >
          Export CSV
        </button>
        {viewMode === "table" && (
          <button
            type="button"
            onClick={() => {
              document.body.classList.add("print-list");
              window.print();
            }}
            className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-secondary"
          >
            Print list
          </button>
        )}
        {viewMode === "table" && selectedActionIds.size > 0 && (
          <button
            type="button"
            onClick={() => setShiftDatesModalOpen(true)}
            className="rounded-lg border border-status-warning/25 bg-status-warning-subtle px-4 py-2 text-sm font-medium text-status-warning-foreground"
          >
            Shift dates ({selectedActionIds.size})
          </button>
        )}
        <div className="flex rounded-lg border border-border-strong overflow-hidden">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`px-3 py-2 text-sm font-medium ${viewMode === "table" ? "bg-surface-subtle text-text-primary" : "bg-surface-raised text-text-secondary"}`}
          >
            Table
          </button>
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className={`px-3 py-2 text-sm font-medium ${viewMode === "calendar" ? "bg-surface-subtle text-text-primary" : "bg-surface-raised text-text-secondary"}`}
          >
            Calendar
          </button>
          <button
            type="button"
            onClick={() => setViewMode("kanban")}
            className={`px-3 py-2 text-sm font-medium ${viewMode === "kanban" ? "bg-surface-subtle text-text-primary" : "bg-surface-raised text-text-secondary"}`}
          >
            Kanban
          </button>
        </div>
      </div>

      {/* Main content: Table or Calendar */}
      {viewMode === "table" && (
      <Card className="rounded-xl overflow-hidden shadow-sm" id="followup-table-print-area">
        {loading ? (
          <CardContent className="p-8">
            <div className="animate-pulse space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 rounded bg-surface-subtle" />
              ))}
            </div>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-surface-subtle text-left text-text-secondary">
                <tr>
                  <th className="px-2 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={filteredActions.length > 0 && selectedActionIds.size === filteredActions.length}
                      onChange={selectAllOnPage}
                      title="Select all"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Style</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Phase</th>
                  <th className="px-4 py-3 font-medium">Milestone</th>
                  <th className="px-4 py-3 font-medium">Planned</th>
                  <th className="px-4 py-3 font-medium">Submission</th>
                  <th className="px-4 py-3 font-medium">Approval</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Assigned</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Rejection</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredActions.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-border-subtle last:border-0 ${isOverdue(r) ? "bg-status-danger-subtle/50" : ""} ${r.is_rejected ? "bg-status-warning-subtle/50" : ""}`}
                  >
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selectedActionIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Link to={`/app/orders/${r.order_id}`} className="font-medium text-brand-primary hover:underline">
                        {r.order_code ?? `#${r.order_id}`}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-text-secondary">{r.style_code ?? "—"}</td>
                    <td className="px-4 py-2 font-medium text-text-primary">{r.title}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${phaseBadgeClass(r.phase)}`}>
                        {r.phase}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {milestoneLabel(r.milestone_type) ? (
                        <span className="rounded-full px-2 py-0.5 text-xs bg-status-info-subtle text-status-info-foreground">
                          {milestoneLabel(r.milestone_type)}
                          {r.external_id != null ? ` #${r.external_id}` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">{formatDate(r.planned_date)}</td>
                    <td className="px-4 py-2 text-text-secondary">{formatDate(r.actual_submission_date)}</td>
                    <td className="px-4 py-2 text-text-secondary">{formatDate(r.approval_received_date)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-text-secondary">{userDisplay(r.assigned_to_id)}</td>
                    <td className="px-4 py-2">
                      {r.severity && (
                        <span className={`rounded-full px-2 py-0.5 text-xs ${severityBadgeClass(r.severity)}`}>
                          {r.severity}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 max-w-[120px] truncate text-text-secondary" title={r.rejection_reason ?? undefined}>
                      {r.rejection_reason ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="relative inline-block text-right">
                        <button
                          type="button"
                          onClick={() => setOpenActionsRowId((prev) => (prev === r.id ? null : r.id))}
                          className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-subtle"
                        >
                          Actions
                        </button>
                        {openActionsRowId === r.id && (
                          <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-surface-raised py-1 shadow-lg">
                            <button
                              type="button"
                              onClick={() => { loadTimeline(r.order_id); setOpenActionsRowId(null); }}
                              className="block w-full px-3 py-2 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Timeline
                            </button>
                            {["pending", "in_progress"].includes(r.status) && (
                              <button
                                type="button"
                                onClick={() => { handleMarkSubmitted(r.id); setOpenActionsRowId(null); }}
                                className="block w-full px-3 py-2 text-left text-xs text-status-info-foreground hover:bg-status-info-subtle"
                              >
                                Mark submitted
                              </button>
                            )}
                            {!["completed", "approved", "cancelled"].includes(r.status) && (
                              <button
                                type="button"
                                onClick={() => { setRejectModalActionId(r.id); setRejectReason(r.rejection_reason ?? ""); setRejectResubmissionDate(r.resubmission_date ?? ""); setOpenActionsRowId(null); }}
                                className="block w-full px-3 py-2 text-left text-xs text-status-warning-foreground hover:bg-status-warning-subtle"
                              >
                                Mark rejected
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => { openEdit(r); setOpenActionsRowId(null); }}
                              className="block w-full px-3 py-2 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Edit
                            </button>
                            {!["completed", "approved"].includes(r.status) && (
                              <button
                                type="button"
                                onClick={async () => { await api.completeFollowupAction(r.id); await loadTna(); setOpenActionsRowId(null); }}
                                className="block w-full px-3 py-2 text-left text-xs text-status-success-foreground hover:bg-status-success-subtle"
                              >
                                Complete
                              </button>
                            )}
                            {["completed", "approved"].includes(r.status) && (
                              <button
                                type="button"
                                onClick={async () => { await api.reopenFollowupAction(r.id); await loadTna(); setOpenActionsRowId(null); }}
                                className="block w-full px-3 py-2 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                              >
                                Reopen
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async () => { await api.deleteFollowupAction(r.id); await loadTna(); setOpenActionsRowId(null); }}
                              className="block w-full px-3 py-2 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredActions.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-4 py-12 text-center text-text-muted">
                      No follow-up actions. Use &quot;Add action&quot; or &quot;Generate TNA&quot; to create steps for an order.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      )}

      {viewMode === "calendar" && (
      <Card className="rounded-xl overflow-hidden shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Calendar — planned dates</CardTitle>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const parts = calendarMonth.split("-").map(Number);
                const y = parts[0] ?? new Date().getFullYear();
                const m = parts[1] ?? 1;
                const d = new Date(y, m - 2, 1);
                setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
              }}
              className="rounded border border-border-strong px-2 py-1 text-sm"
            >
              Prev
            </button>
            <span className="text-sm font-medium text-text-secondary">
              {new Date(calendarMonth + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <button
              type="button"
              onClick={() => {
                const parts = calendarMonth.split("-").map(Number);
                const y = parts[0] ?? new Date().getFullYear();
                const m = parts[1] ?? 1;
                const d = new Date(y, m, 1);
                setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
              }}
              className="rounded border border-border-strong px-2 py-1 text-sm"
            >
              Next
            </button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {calendarLoading ? (
            <div className="animate-pulse h-64 rounded bg-surface-subtle" />
          ) : (
            <CalendarGrid
              calendarMonth={calendarMonth}
              actions={filteredCalendarActions}
              onOpenEdit={openEdit}
              phaseBadgeClass={phaseBadgeClass}
            />
          )}
        </CardContent>
      </Card>
      )}

      {viewMode === "kanban" && (
      <Card className="rounded-xl overflow-hidden shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Kanban — by phase</CardTitle>
          <p className="text-sm text-text-muted">Click a card to edit. Uses current filters.</p>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="animate-pulse h-48 rounded bg-surface-subtle" />
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2 min-h-[320px]">
              {TNA_PHASES.map((phase) => {
                const phaseActions = filteredActions.filter((a) => a.phase === phase);
                return (
                  <div key={phase} className="flex-shrink-0 w-64 rounded-lg border border-border bg-surface-subtle/50">
                    <div className={`px-3 py-2 border-b rounded-t-lg text-sm font-medium ${phaseBadgeClass(phase)}`}>
                      {phase}
                    </div>
                    <div className="p-2 space-y-2 max-h-[280px] overflow-y-auto">
                      {phaseActions.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => openEdit(a)}
                          className={`w-full text-left rounded-lg border p-2 shadow-sm bg-surface-raised hover:shadow-md transition-shadow ${isOverdue(a) ? "border-status-danger/20 bg-status-danger-subtle/30" : ""} ${a.is_rejected ? "border-status-warning/30 bg-status-warning-subtle/30" : ""}`}
                        >
                          <p className="font-medium text-text-primary text-sm truncate">{a.title}</p>
                          <p className="text-xs text-text-muted mt-0.5">{a.order_code ?? `#${a.order_id}`} · {formatDate(a.planned_date)}</p>
                          <span className={`inline-block mt-1 rounded-full px-1.5 py-0.5 text-[10px] ${statusBadgeClass(a.status)}`}>{a.status}</span>
                        </button>
                      ))}
                      {phaseActions.length === 0 && (
                        <p className="text-xs text-text-muted py-4 text-center">No actions</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Timeline panel */}
      {timelineOrderId != null && (
        <Card className="rounded-xl shadow-sm" id="timeline-print-area">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">
              Timeline —{" "}
              <Link to={`/app/orders/${timelineOrderId}`} className="font-semibold text-brand-primary hover:underline">
                {orders.find((o) => o.id === timelineOrderId)?.order_code ?? `Order #${timelineOrderId}`}
              </Link>
            </CardTitle>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  document.body.classList.add("print-timeline");
                  window.print();
                }}
                className="rounded border border-border-strong px-2 py-1 text-xs font-medium text-text-secondary hover:bg-surface-subtle"
              >
                Export PDF / Print timeline
              </button>
              <button
                type="button"
                onClick={() => setTimelineOrderId(null)}
                className="text-sm text-text-muted hover:text-text-secondary"
              >
                Close
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {(() => {
              const timelineOrder = orders.find((o) => o.id === timelineOrderId);
              return timelineOrder?.delivery_date ? (
                <p className="mb-3 text-sm text-text-secondary">
                  <span className="font-medium text-text-secondary">Delivery date:</span> {formatDate(timelineOrder.delivery_date)}
                </p>
              ) : null;
            })()}
            {(() => {
              const nextDue = timelineActions.find((a) => !["completed", "approved", "cancelled"].includes(a.status));
              return nextDue ? (
                <div className="mb-3 rounded-lg border border-status-warning/30 bg-status-warning-subtle/70 px-3 py-2 text-sm">
                  <span className="font-medium text-status-warning-foreground">Next due:</span> {nextDue.title}
                  {nextDue.planned_date && (
                    <span className="ml-2 text-status-warning-foreground">(planned {formatDate(nextDue.planned_date)})</span>
                  )}
                  {isOverdue(nextDue) && <span className="ml-2 rounded px-1.5 py-0.5 text-xs font-medium bg-status-danger-subtle text-status-danger-foreground">Overdue</span>}
                </div>
              ) : null;
            })()}
            <ul className="space-y-2">
              {timelineActions.map((a) => (
                <li
                  key={a.id}
                  className={`flex items-start gap-3 rounded-lg border p-2 ${isOverdue(a) ? "border-l-4 border-l-red-400 bg-status-danger-subtle/50 border-border" : "border-border-subtle bg-surface-subtle/50"}`}
                >
                  <span className="text-xs text-text-muted w-20 shrink-0">{formatDate(a.planned_date)}</span>
                  {isOverdue(a) && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-status-danger-subtle text-status-danger-foreground shrink-0">Overdue</span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${phaseBadgeClass(a.phase)}`}>{a.phase}</span>
                  <span className="font-medium text-text-primary">{a.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(a.status)}`}>{a.status}</span>
                  {a.rejection_reason && (
                    <span className="text-xs text-status-warning-foreground">Rej: {a.rejection_reason}</span>
                  )}
                </li>
              ))}
              {timelineActions.length === 0 && (
                <li className="py-4 text-center text-sm text-text-muted">No actions for this order.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit modal */}
      {modalAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg rounded-xl shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>{modalAction === "add" ? "Add follow-up action" : "Edit follow-up action"}</CardTitle>
              <button type="button" onClick={closeModal} className="text-text-muted hover:text-text-secondary">×</button>
            </CardHeader>
            <CardContent className="pt-0">
              <form onSubmit={submitAction} className="space-y-3">
                {modalAction === "add" && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary">Order</label>
                    <select
                      required
                      value={form.order_id ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, order_id: Number(e.target.value) }))}
                      className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    >
                      <option value="">Select order</option>
                      {orders.map((o) => (
                        <option key={o.id} value={o.id}>{o.order_code}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-text-secondary">Title</label>
                  <input
                    required
                    value={form.title ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary">Phase</label>
                    <select
                      value={form.phase ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    >
                      {TNA_PHASES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary">Status</label>
                    <select
                      value={form.status ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    >
                      {TNA_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary">Assigned to</label>
                  <select
                    value={form.assigned_to_id ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, assigned_to_id: e.target.value ? Number(e.target.value) : null }))}
                    className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  >
                    <option value="">—</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{userDisplay(u.id)}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary">Milestone</label>
                    <select
                      value={form.milestone_type ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, milestone_type: e.target.value || undefined }))}
                      className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    >
                      {MILESTONE_TYPES.map((m) => (
                        <option key={m.value || "none"} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary">External ID</label>
                    <input
                      type="number"
                      min={0}
                      value={form.external_id ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, external_id: e.target.value ? Number(e.target.value) : undefined }))}
                      placeholder="Link to plan/doc"
                      className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary">Planned date</label>
                    <input
                      type="date"
                      value={form.planned_date ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, planned_date: e.target.value || undefined }))}
                      className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary">Submission date</label>
                    <input
                      type="date"
                      value={form.actual_submission_date ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, actual_submission_date: e.target.value || undefined }))}
                      className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary">Approval received date</label>
                    <input
                      type="date"
                      value={form.approval_received_date ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, approval_received_date: e.target.value || undefined }))}
                      className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary">Resubmission date</label>
                    <input
                      type="date"
                      value={form.resubmission_date ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, resubmission_date: e.target.value || undefined }))}
                      className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                {modalAction === "edit" && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary">Actual completion date</label>
                    <input
                      type="date"
                      value={form.actual_completion_date ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, actual_completion_date: e.target.value || undefined }))}
                      className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-text-secondary">Rejection reason</label>
                  <input
                    value={form.rejection_reason ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, rejection_reason: e.target.value || undefined }))}
                    className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary">Remarks</label>
                  <textarea
                    value={form.remarks ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value || undefined }))}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
                {modalAction === "edit" && (
                  <div className="border-t border-border pt-3">
                    <h4 className="text-sm font-medium text-text-secondary mb-2">Rejection history</h4>
                    {rejectionHistory.length === 0 ? (
                      <p className="text-xs text-text-muted">No rejection entries for this action.</p>
                    ) : (
                      <ul className="space-y-2 max-h-40 overflow-y-auto rounded border border-border bg-surface-subtle/50 p-2">
                        {rejectionHistory.map((log) => (
                          <li key={log.id} className="text-xs border-b border-border-subtle pb-2 last:border-0 last:pb-0">
                            <span className="font-medium text-text-secondary">{formatDate(log.rejected_at)}</span>
                            {log.resubmission_date && (
                              <span className="ml-2 text-text-muted">Resubmit: {formatDate(log.resubmission_date)}</span>
                            )}
                            {log.rejection_reason && (
                              <p className="mt-0.5 text-text-secondary">{log.rejection_reason}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {modalAction === "edit" && (
                  <div className="border-t border-border pt-3">
                    <h4 className="text-sm font-medium text-text-secondary mb-2">Comments</h4>
                    {commentsLoading ? (
                      <p className="text-xs text-text-muted">Loading…</p>
                    ) : (
                      <>
                        <ul className="space-y-2 max-h-32 overflow-y-auto rounded border border-border bg-surface-subtle/50 p-2 mb-2">
                          {actionComments.length === 0 ? (
                            <li className="text-xs text-text-muted">No comments yet.</li>
                          ) : (
                            actionComments.map((c) => (
                              <li key={c.id} className="text-xs border-b border-border-subtle pb-2 last:border-0 last:pb-0">
                                <span className="font-medium text-text-secondary">{c.username ?? `#${c.user_id}`}</span>
                                <span className="ml-2 text-text-muted">{formatDate(c.created_at)}</span>
                                <p className="mt-0.5 text-text-secondary whitespace-pre-wrap">{c.comment_text}</p>
                              </li>
                            ))
                          )}
                        </ul>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Add a comment…"
                            className="flex-1 rounded-lg border border-border-strong px-3 py-2 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (commentText.trim() && editingAction) {
                                  api.createFollowupActionComment(editingAction.id, { comment_text: commentText.trim() }).then((newComment) => {
                                    setActionComments((prev) => [newComment, ...prev]);
                                    setCommentText("");
                                  });
                                }
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (commentText.trim() && editingAction) {
                                api.createFollowupActionComment(editingAction.id, { comment_text: commentText.trim() }).then((newComment) => {
                                  setActionComments((prev) => [newComment, ...prev]);
                                  setCommentText("");
                                });
                              }
                            }}
                            disabled={!commentText.trim()}
                            className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-medium text-brand-primary-foreground disabled:opacity-50"
                          >
                            Add comment
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={closeModal} className="rounded-lg border border-border-strong px-4 py-2 text-sm">
                    Cancel
                  </button>
                  <button type="submit" className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground">
                    {modalAction === "add" ? "Create" : "Save"}
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Generate TNA modal */}
      {generateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md rounded-xl shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Generate TNA</CardTitle>
              <button
                type="button"
                onClick={() => { setGenerateModalOpen(false); setGenerateOrderId(null); setGenerateTemplateIds(null); }}
                className="text-text-muted hover:text-text-secondary"
              >
                ×
              </button>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-text-secondary mb-3">
                Create follow-up action lines from template. Order must have a delivery date set.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-text-secondary">Order</label>
                  <select
                    required
                    value={generateOrderId ?? ""}
                    onChange={(e) => setGenerateOrderId(e.target.value ? Number(e.target.value) : null)}
                    className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  >
                    <option value="">Select order</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>{o.order_code}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary">Templates (optional)</label>
                  {generateOrderId != null && orders.find((o) => o.id === generateOrderId)?.customer_id != null && (
                    <p className="text-xs text-text-muted mb-0.5">Templates for this buyer (global + buyer-specific).</p>
                  )}
                  <p className="text-xs text-text-muted">Leave unchecked to use all selected templates.</p>
                  <div className="mt-1 max-h-40 overflow-y-auto rounded border border-border p-2 space-y-1">
                    {(generateOrderId != null
                      ? templates.filter(
                          (t) =>
                            t.buyer_id == null ||
                            t.buyer_id === orders.find((o) => o.id === generateOrderId)?.customer_id
                        )
                      : templates
                    ).map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={(generateTemplateIds ?? []).includes(t.id)}
                          onChange={(e) => {
                            setGenerateTemplateIds((prev) => {
                              const next = prev ?? [];
                              if (e.target.checked) return [...next, t.id];
                              return next.filter((id) => id !== t.id);
                            });
                          }}
                        />
                        {t.name} ({t.phase})
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setGenerateModalOpen(false); setGenerateOrderId(null); setGenerateTemplateIds(null); }}
                  className="rounded-lg border border-border-strong px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generateOrderId == null}
                  className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground disabled:opacity-50"
                >
                  Generate
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Shift dates modal */}
      {shiftDatesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-sm rounded-xl shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Shift planned dates</CardTitle>
              <button type="button" onClick={() => { setShiftDatesModalOpen(false); setShiftDays(0); }} className="text-text-muted hover:text-text-secondary">×</button>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-text-secondary mb-3">
                Add or subtract days from the planned date of {selectedActionIds.size} selected action(s). Only actions with a planned date will be updated.
              </p>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-text-secondary">Days to add:</label>
                <input
                  type="number"
                  value={shiftDays}
                  onChange={(e) => setShiftDays(Number(e.target.value) || 0)}
                  className="w-24 rounded-lg border border-border-strong px-3 py-2 text-sm"
                />
                <span className="text-xs text-text-muted">(negative = earlier)</span>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => { setShiftDatesModalOpen(false); setShiftDays(0); }} className="rounded-lg border border-border-strong px-4 py-2 text-sm">Cancel</button>
                <button type="button" onClick={handleShiftDates} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground">Apply</button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Mark rejected modal */}
      {rejectModalActionId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-sm rounded-xl shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Mark as rejected</CardTitle>
              <button type="button" onClick={() => { setRejectModalActionId(null); setRejectReason(""); setRejectResubmissionDate(""); }} className="text-text-muted hover:text-text-secondary">×</button>
            </CardHeader>
            <CardContent className="pt-0">
              <form onSubmit={handleRejectSubmit} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-text-secondary">Rejection reason</label>
                  <input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason from buyer..."
                    className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary">Resubmission date (optional)</label>
                  <input
                    type="date"
                    value={rejectResubmissionDate}
                    onChange={(e) => setRejectResubmissionDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => { setRejectModalActionId(null); setRejectReason(""); setRejectResubmissionDate(""); }} className="rounded-lg border border-border-strong px-4 py-2 text-sm">Cancel</button>
                  <button type="submit" className="rounded-lg bg-status-warning px-4 py-2 text-sm font-semibold text-brand-primary-foreground">Mark rejected</button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Template Add/Edit modal */}
      {templateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md rounded-xl shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{editingTemplate ? "Edit template" : "Add template"}</CardTitle>
              <button type="button" onClick={closeTemplateModal} className="text-text-muted hover:text-text-secondary">×</button>
            </CardHeader>
            <CardContent className="pt-0">
              <form onSubmit={submitTemplate} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-text-secondary">Code</label>
                  <input
                    required
                    value={templateForm.code}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, code: e.target.value }))}
                    readOnly={!!editingTemplate}
                    className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm bg-surface-subtle"
                  />
                  {editingTemplate && <p className="text-xs text-text-muted mt-0.5">Code cannot be changed.</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary">Name</label>
                  <input
                    required
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary">Phase</label>
                    <select
                      value={templateForm.phase}
                      onChange={(e) => setTemplateForm((f) => ({ ...f, phase: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    >
                      {TNA_PHASES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary">Sequence</label>
                    <input
                      type="number"
                      min={0}
                      value={templateForm.sequence_no}
                      onChange={(e) => setTemplateForm((f) => ({ ...f, sequence_no: Number(e.target.value) || 0 }))}
                      className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary">Default days before delivery</label>
                  <input
                    type="number"
                    min={0}
                    value={templateForm.default_days_before_delivery ?? ""}
                    onChange={(e) => setTemplateForm((f) => ({ ...f, default_days_before_delivery: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="e.g. 30"
                    className="mt-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={templateForm.is_mandatory}
                      onChange={(e) => setTemplateForm((f) => ({ ...f, is_mandatory: e.target.checked }))}
                    />
                    Mandatory
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={templateForm.is_active}
                      onChange={(e) => setTemplateForm((f) => ({ ...f, is_active: e.target.checked }))}
                    />
                    Active
                  </label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={closeTemplateModal} className="rounded-lg border border-border-strong px-4 py-2 text-sm">Cancel</button>
                  <button type="submit" className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground">{editingTemplate ? "Save" : "Create"}</button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Manage TNA templates */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setTemplatesSectionOpen((v) => !v)}
        >
          <CardTitle className="text-base">Manage TNA templates</CardTitle>
          <p className="text-sm text-text-muted">Define default steps used when generating TNA for an order.</p>
        </CardHeader>
        {templatesSectionOpen && (
          <CardContent className="pt-0">
            <div className="mb-3 flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <label className="text-sm text-text-secondary">Buyer:</label>
                <select
                  value={filterTemplateBuyerId ?? ""}
                  onChange={(e) => setFilterTemplateBuyerId(e.target.value ? Number(e.target.value) : null)}
                  className="rounded border border-border-strong px-2 py-1.5 text-sm"
                >
                  <option value="">All</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={openAddTemplate} className="rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-medium text-brand-primary-foreground">
                Add template
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border bg-surface-subtle text-left text-text-secondary">
                  <tr>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Phase</th>
                    <th className="px-3 py-2 font-medium">Days before delivery</th>
                    <th className="px-3 py-2 font-medium">Mandatory</th>
                    <th className="px-3 py-2 font-medium">Active</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {manageTemplates.map((t) => (
                    <tr key={t.id} className="border-b border-border-subtle last:border-0">
                      <td className="px-3 py-2 font-mono text-text-secondary">{t.code}</td>
                      <td className="px-3 py-2 text-text-primary">{t.name}</td>
                      <td className="px-3 py-2 text-text-secondary">{t.phase}</td>
                      <td className="px-3 py-2 text-text-secondary">{t.default_days_before_delivery ?? "—"}</td>
                      <td className="px-3 py-2 text-text-secondary">{t.is_mandatory ? "Yes" : "No"}</td>
                      <td className="px-3 py-2 text-text-secondary">{t.is_active ? "Yes" : "No"}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => openEditTemplate(t)} className="rounded border border-border-strong px-2 py-1 text-xs mr-1">Edit</button>
                        <button
                          type="button"
                          onClick={async () => { await api.deleteFollowupTemplate(t.id); await loadTna(); await loadManageTemplates(); }}
                          className="rounded border border-status-danger/20 px-2 py-1 text-xs text-status-danger"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {manageTemplates.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-text-muted">No templates. Add one or they will be seeded on first load.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Simple follow-ups (legacy) */}
      <Card className="rounded-xl shadow-sm">
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setSimpleSectionOpen((v) => !v)}
        >
          <CardTitle className="text-base">Simple follow-ups (legacy)</CardTitle>
          <p className="text-sm text-text-muted">Basic task list per order. Use TNA above for full tracking.</p>
        </CardHeader>
        {simpleSectionOpen && (
          <CardContent className="pt-0">
            <div className="rounded-xl border border-border bg-surface-raised p-4 flex flex-wrap gap-2 mb-4">
              <select
                value={simpleOrderId || ""}
                onChange={(e) => setSimpleOrderId(Number(e.target.value) || 0)}
                className="rounded border border-border-strong px-3 py-2 text-sm"
              >
                <option value="">Select order…</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>{o.order_code}</option>
                ))}
              </select>
              <input
                value={simpleTitle}
                onChange={(e) => setSimpleTitle(e.target.value)}
                placeholder="Follow-up title"
                className="min-w-72 rounded border border-border-strong px-3 py-2 text-sm"
              />
              <button
                onClick={async () => {
                  if (!simpleOrderId || !simpleTitle.trim()) return;
                  await api.createFollowup({ order_id: simpleOrderId, title: simpleTitle.trim(), status: "OPEN" });
                  setSimpleTitle("");
                  await loadSimple();
                }}
                className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground"
              >
                Add
              </button>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle border-b border-border text-left text-text-muted">
                <tr>
                  <th className="px-4 py-2">Order</th>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-4 py-2">Due</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {simpleRows.map((r) => (
                  <tr key={r.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-2 text-text-secondary">#{r.order_id}</td>
                    <td className="px-4 py-2 text-text-primary">{r.title}</td>
                    <td className="px-4 py-2 text-text-secondary">{r.due_date ? new Date(r.due_date).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-2 text-text-secondary">{r.status}</td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <button
                        onClick={async () => {
                          await api.updateFollowup(r.id, { status: r.status === "DONE" ? "OPEN" : "DONE" });
                          await loadSimple();
                        }}
                        className="rounded border border-border-strong px-2 py-1 text-xs text-text-secondary"
                      >
                        {r.status === "DONE" ? "Reopen" : "Done"}
                      </button>
                      <button
                        onClick={async () => { await api.deleteFollowup(r.id); await loadSimple(); }}
                        className="rounded border border-status-danger/20 px-2 py-1 text-xs text-status-danger"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {simpleRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-text-muted">No simple follow-ups.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
