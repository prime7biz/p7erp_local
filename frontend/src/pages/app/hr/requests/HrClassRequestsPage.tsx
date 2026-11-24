/**
 * HR Requests — voucher-style Class 3/4 → Class 2 → Class 1 workflow.
 * Shown when user_authority_classes_v1 is ON.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  hrClassRequestsApi,
  type HrClassRequestKind,
  type HrClassRequestRow,
  type HrClassRequestStatus,
  type HrSystemAccessMode,
} from "@/api/hrClassRequests";
import { useAuth } from "@/context/AuthContext";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrRowActions } from "@/components/hr/kit/HrRowActions";
import type { HrRowAction } from "@/components/hr/kit/rowActions";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<HrClassRequestKind, string> = {
  NEW_EMPLOYEE: "New employee",
  LEAVE: "Leave",
  INCREMENT: "Increment",
  PROMOTION: "Promotion",
  CORRECTION: "Data correction",
  RESIGNATION: "Resignation",
  DISCONTINUE: "Discontinue",
  WARNING: "Warning letter",
  BULK_INCREMENT: "Bulk increment",
  CONFIRMATION: "Confirmation",
};

const STATUS_LABELS: Record<HrClassRequestStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  RECOMMENDED: "Recommended",
  RETURNED: "Returned",
  APPLYING: "Applying",
  APPROVED: "Approved",
  APPLIED: "Applied",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
};

const ENTRY_KINDS: HrClassRequestKind[] = [
  "NEW_EMPLOYEE",
  "LEAVE",
  "INCREMENT",
  "PROMOTION",
  "CORRECTION",
  "RESIGNATION",
  "DISCONTINUE",
  "WARNING",
  "BULK_INCREMENT",
  "CONFIRMATION",
];

type View = "inbox" | "mine" | "all" | "new";

function when(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  }
  return `hrreq${Date.now().toString(36)}`;
}

export function HrClassRequestsPage() {
  const { me } = useAuth();
  const authorityOn = me?.authority_classes_enabled === true;
  const cls = (me?.authority_class || "").toUpperCase();
  const isSuper = me?.is_tenant_super_admin === true;
  const canEnter = isSuper || ["CLASS_1", "CLASS_2", "CLASS_3", "CLASS_4"].includes(cls);
  const canRecommend = isSuper || cls === "CLASS_2";
  const canApprove = isSuper || cls === "CLASS_1";

  const [view, setView] = useState<View>("inbox");
  const [rows, setRows] = useState<HrClassRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const [kind, setKind] = useState<HrClassRequestKind>("LEAVE");
  const [employeeId, setEmployeeId] = useState("");
  const [reason, setReason] = useState("");
  const [payloadText, setPayloadText] = useState("{\n  \n}");
  const [systemAccess, setSystemAccess] = useState<HrSystemAccessMode>("NONE");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!authorityOn) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const status =
        view === "inbox"
          ? canApprove
            ? "RECOMMENDED"
            : canRecommend
              ? "SUBMITTED"
              : undefined
          : undefined;
      const list = await hrClassRequestsApi.list({ status, limit: 100 });
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load HR requests");
    } finally {
      setLoading(false);
    }
  }, [authorityOn, view, canApprove, canRecommend]);

  useEffect(() => {
    if (view === "new") return;
    void load();
  }, [load, view]);

  const filtered = useMemo(() => {
    if (view === "mine" && me?.user_id != null) {
      return rows.filter((r) => r.entered_by === me.user_id);
    }
    return rows;
  }, [rows, view, me?.user_id]);

  const decide = async (row: HrClassRequestRow, decision: "RECOMMEND" | "RETURN" | "APPROVE" | "REJECT") => {
    setBusyId(row.id);
    setError("");
    setMessage("");
    try {
      const updated = await hrClassRequestsApi.decide(row.id, { decision });
      setMessage(
        decision === "REJECT"
          ? "Request rejected."
          : decision === "RETURN"
            ? "Returned to the maker."
            : updated.status === "APPLIED"
              ? "Approved and applied."
              : updated.status === "FAILED"
                ? `Could not apply: ${updated.failure_reason ?? ""}`
                : decision === "RECOMMEND"
                  ? "Recommended; waiting for Class 1."
                  : "Approved.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decision failed");
    } finally {
      setBusyId(null);
    }
  };

  const submitNew = async () => {
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(payloadText || "{}") as Record<string, unknown>;
      } catch {
        throw new Error("Payload must be valid JSON");
      }
      if (kind === "NEW_EMPLOYEE") {
        payload = { ...payload, system_access: systemAccess };
      }
      const needsEmployee = !["NEW_EMPLOYEE", "BULK_INCREMENT"].includes(kind);
      const emp = employeeId.trim() ? Number(employeeId) : null;
      if (needsEmployee && (!emp || !Number.isFinite(emp))) {
        throw new Error("Employee id is required for this request kind");
      }
      if (kind === "NEW_EMPLOYEE" && systemAccess === "ERP_USER" && (cls === "CLASS_1" || payload.settings)) {
        // UI warning only — server enforces Option A.
      }
      const created = await hrClassRequestsApi.submit({
        request_id: newRequestId(),
        kind,
        reason: reason.trim() || KIND_LABELS[kind],
        employee_id: needsEmployee ? emp : null,
        payload,
        source: "HR_ENTRY",
      });
      setMessage(
        created.status === "RECOMMENDED"
          ? `Submitted ${created.request_no} (auto-recommended). Waiting for Class 1.`
          : `Submitted ${created.request_no}. Waiting for Class 2.`,
      );
      setView("mine");
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!authorityOn) {
    return (
      <div className="space-y-4">
        <HrPageHeader title="HR Requests" description="Voucher-style employee changes with Class 2 recommend and Class 1 approve." />
        <p className="rounded-lg border border-border bg-surface-subtle px-4 py-3 text-sm text-text-secondary">
          Turn on <strong>User authority classes</strong> in Settings → Configuration to use this screen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HrPageHeader
        title="HR Requests"
        description="Enter leave, salary, promotion, correction, resignation and new-employee requests. Class 2 recommends; Class 1 approves."
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "inbox" as const, label: "Waiting for me" },
            { id: "mine" as const, label: "My requests" },
            { id: "all" as const, label: "History" },
            ...(canEnter ? [{ id: "new" as const, label: "New request" }] : []),
          ] as const
        ).map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm",
              view === v.id
                ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                : "border-border text-text-secondary hover:bg-surface-subtle",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-lg border border-status-danger/30 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-status-success/30 bg-status-success-subtle px-4 py-3 text-sm text-status-success-foreground">
          {message}
        </div>
      ) : null}

      {view === "new" ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface-card p-4">
          <p className="text-sm text-text-secondary">
            Class 3/4 or Class 1 entry needs a Class 2 recommend then a different Class 1 approve. Class 2 entry is
            auto-recommended. You cannot approve your own employee record.
          </p>
          <label className="block text-sm">
            <span className="text-text-secondary">Kind</span>
            <select
              className="mt-1 w-full rounded-lg border border-border bg-surface-base px-3 py-2"
              value={kind}
              onChange={(e) => setKind(e.target.value as HrClassRequestKind)}
            >
              {ENTRY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          {!["NEW_EMPLOYEE", "BULK_INCREMENT"].includes(kind) ? (
            <label className="block text-sm">
              <span className="text-text-secondary">Employee id</span>
              <input
                className="mt-1 w-full rounded-lg border border-border bg-surface-base px-3 py-2"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                inputMode="numeric"
              />
            </label>
          ) : null}
          {kind === "NEW_EMPLOYEE" ? (
            <label className="block text-sm">
              <span className="text-text-secondary">System access</span>
              <select
                className="mt-1 w-full rounded-lg border border-border bg-surface-base px-3 py-2"
                value={systemAccess}
                onChange={(e) => setSystemAccess(e.target.value as HrSystemAccessMode)}
              >
                <option value="NONE">None (employee record only)</option>
                <option value="ESS_ONLY">ESS only (My HR login)</option>
                <option value="ERP_USER">ERP user (Class + modules)</option>
              </select>
              {systemAccess === "ERP_USER" ? (
                <span className="mt-1 block text-xs text-text-muted">
                  Class 2–4 without Settings: Class 1 with HR + Settings may approve (only modules they hold). Class 1 or
                  Settings module: Super Admin only.
                </span>
              ) : null}
            </label>
          ) : null}
          <label className="block text-sm">
            <span className="text-text-secondary">Reason</span>
            <input
              className="mt-1 w-full rounded-lg border border-border bg-surface-base px-3 py-2"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-text-secondary">Payload (JSON)</span>
            <textarea
              className="mt-1 min-h-[140px] w-full rounded-lg border border-border bg-surface-base px-3 py-2 font-mono text-xs"
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitNew()}
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-brand-primary-foreground disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit request"}
          </button>
        </div>
      ) : loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-text-muted">No requests in this view.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-surface-subtle text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">Request</th>
                <th className="px-3 py-2 font-medium">Kind</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium">Updated</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const actions: HrRowAction[] = [];
                if (view === "inbox" && canRecommend && row.status === "SUBMITTED") {
                  actions.push({
                    key: "recommend",
                    label: "Recommend",
                    primary: true,
                    onClick: () => void decide(row, "RECOMMEND"),
                    disabled: busyId === row.id,
                  });
                  actions.push({
                    key: "return",
                    label: "Return",
                    onClick: () => void decide(row, "RETURN"),
                    disabled: busyId === row.id,
                  });
                  actions.push({
                    key: "reject",
                    label: "Reject",
                    danger: true,
                    onClick: () => void decide(row, "REJECT"),
                    disabled: busyId === row.id,
                  });
                }
                if (view === "inbox" && canApprove && row.status === "RECOMMENDED") {
                  actions.push({
                    key: "approve",
                    label: "Approve",
                    primary: true,
                    onClick: () => void decide(row, "APPROVE"),
                    disabled: busyId === row.id,
                  });
                  actions.push({
                    key: "return2",
                    label: "Return",
                    onClick: () => void decide(row, "RETURN"),
                    disabled: busyId === row.id,
                  });
                  actions.push({
                    key: "reject2",
                    label: "Reject",
                    danger: true,
                    onClick: () => void decide(row, "REJECT"),
                    disabled: busyId === row.id,
                  });
                }
                if ((row.status === "FAILED" || row.status === "APPROVED") && (canApprove || isSuper)) {
                  actions.push({
                    key: "retry",
                    label: "Retry apply",
                    onClick: () => {
                      setBusyId(row.id);
                      void hrClassRequestsApi
                        .retryApply(row.id)
                        .then(() => load())
                        .catch((e) => setError(e instanceof Error ? e.message : "Retry failed"))
                        .finally(() => setBusyId(null));
                    },
                    disabled: busyId === row.id,
                  });
                }
                return (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium text-text-primary">{row.request_no}</td>
                    <td className="px-3 py-2">{KIND_LABELS[row.kind] ?? row.kind}</td>
                    <td className="px-3 py-2">{STATUS_LABELS[row.status] ?? row.status}</td>
                    <td className="px-3 py-2">
                      {row.employee_id != null ? (
                        <Link
                          to={`/app/hr/employees/${row.employee_id}/profile`}
                          className="text-brand-primary hover:underline"
                        >
                          #{row.employee_id}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{when(row.updated_at)}</td>
                    <td className="px-3 py-2">
                      {actions.length > 0 ? <HrRowActions rowId={row.id} actions={actions} /> : <span className="text-text-muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
