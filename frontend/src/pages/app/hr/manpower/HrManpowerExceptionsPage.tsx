/**
 * HR → Manpower → Quota exceptions: request and approve extra hiring slots over sanctioned strength.
 */
import { useCallback, useEffect, useState } from "react";
import type { HrDepartmentResponse, HrDesignationResponse } from "@/api/client";
import { fetchAllHrDepartments, fetchAllHrDesignations } from "@/pages/app/hr/hrMasterData";
import { hrManpowerApi, type ManpowerQuotaException } from "@/api/hrManpower";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrRowActions } from "@/components/hr/kit/HrRowActions";
import type { HrRowAction } from "@/components/hr/kit/rowActions";
import { logApiError } from "@/utils/logApiError";

function newRequestId(): string {
  return `mqx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function HrManpowerExceptionsPage() {
  const [rows, setRows] = useState<ManpowerQuotaException[]>([]);
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [designations, setDesignations] = useState<HrDesignationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [deptId, setDeptId] = useState("");
  const [desigId, setDesigId] = useState("");
  const [slots, setSlots] = useState("1");
  const [reason, setReason] = useState("");

  const load = useCallback(async (keepMessages = false) => {
    setLoading(true);
    if (!keepMessages) {
      setError("");
      setInfo("");
    }
    try {
      const [list, deps, desigs] = await Promise.all([
        hrManpowerApi.listExceptions(),
        fetchAllHrDepartments(),
        fetchAllHrDesignations(),
      ]);
      setRows(list);
      setDepartments(deps);
      setDesignations(desigs);
    } catch (e) {
      logApiError("HrManpowerExceptionsPage.load", e);
      setError(e instanceof Error ? e.message : "Could not load exceptions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    const department_id = Number(deptId);
    const designation_id = Number(desigId);
    const extra_slots = Number(slots);
    if (!department_id || !designation_id || !reason.trim() || !(extra_slots >= 1)) {
      setError("Department, designation, slots and reason are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await hrManpowerApi.createException({
        department_id,
        designation_id,
        extra_slots,
        reason: reason.trim(),
        request_id: newRequestId(),
      });
      setInfo("Exception requested. Waiting for management approval.");
      setReason("");
      await load(true);
    } catch (e) {
      logApiError("HrManpowerExceptionsPage.submit", e);
      setError(e instanceof Error ? e.message : "Could not request exception.");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (row: ManpowerQuotaException, decision: "APPROVE" | "REJECT") => {
    const note =
      decision === "REJECT" ? window.prompt("Why reject this exception?") : window.prompt("Optional note (OK to leave blank)");
    if (decision === "REJECT" && (note == null || !note.trim())) {
      setError("A reject reason is required.");
      return;
    }
    if (note === null && decision === "APPROVE") return;
    setBusy(true);
    setError("");
    try {
      await hrManpowerApi.decideException(row.id, { decision, note: note?.trim() || null });
      setInfo(decision === "APPROVE" ? "Exception approved." : "Exception rejected.");
      await load(true);
    } catch (e) {
      logApiError("HrManpowerExceptionsPage.decide", e);
      setError(e instanceof Error ? e.message : "Could not decide exception.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (row: ManpowerQuotaException) => {
    if (!window.confirm("Cancel this pending exception?")) return;
    setBusy(true);
    try {
      await hrManpowerApi.cancelException(row.id);
      setInfo("Exception cancelled.");
      await load(true);
    } catch (e) {
      logApiError("HrManpowerExceptionsPage.cancel", e);
      setError(e instanceof Error ? e.message : "Could not cancel.");
    } finally {
      setBusy(false);
    }
  };

  const deptName = (id: number) => departments.find((d) => d.id === id)?.name ?? id;
  const desigTitle = (id: number) => designations.find((d) => d.id === id)?.title ?? id;

  return (
    <div className="space-y-4">
      <HrPageHeader
        title="Quota exceptions"
        description="Request extra hiring slots when a department and designation are at sanctioned strength. A different person with the approve permission must approve."
      />

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {info ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p> : null}

      <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
        <p className="text-sm font-medium text-text-primary">Request extra slots</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-text-muted">
            Department
            <select
              className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
            >
              <option value="">Select…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-muted">
            Designation
            <select
              className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
              value={desigId}
              onChange={(e) => setDesigId(e.target.value)}
            >
              <option value="">Select…</option>
              {designations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-text-muted">
            Extra slots
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
              value={slots}
              onChange={(e) => setSlots(e.target.value)}
            />
          </label>
          <label className="text-xs text-text-muted sm:col-span-2 lg:col-span-4">
            Reason
            <input
              className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is over-quota hiring needed?"
            />
          </label>
        </div>
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
          onClick={() => void submit()}
          disabled={busy}
        >
          Submit request
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left text-xs uppercase text-text-muted">
            <tr>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2">Designation</th>
              <th className="px-3 py-2 text-right">Slots</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-text-muted">
                  No exception requests yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const actions: HrRowAction[] = [];
                if (row.status === "PENDING") {
                  actions.push(
                    {
                      key: "approve",
                      label: "Approve",
                      onClick: () => void decide(row, "APPROVE"),
                      primary: true,
                      tone: "positive",
                    },
                    { key: "reject", label: "Reject", onClick: () => void decide(row, "REJECT"), danger: true },
                    { key: "cancel", label: "Cancel", onClick: () => void cancel(row) },
                  );
                }
                return (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{deptName(row.department_id)}</td>
                    <td className="px-3 py-2">{desigTitle(row.designation_id)}</td>
                    <td className="px-3 py-2 text-right">
                      {row.extra_slots}
                      {row.status === "APPROVED" ? ` (${row.slots_remaining} left)` : ""}
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate" title={row.reason}>
                      {row.reason}
                    </td>
                    <td className="px-3 py-2">
                      {actions.length ? <HrRowActions rowId={row.id} actions={actions} /> : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default HrManpowerExceptionsPage;
