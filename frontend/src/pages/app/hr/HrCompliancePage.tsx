import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type HrAuditReadinessGap,
  type HrComplianceFramework,
  type HrComplianceRequirement,
  type HrComplianceScore,
  type HrEmployeeComplianceRecord,
} from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrEmployeeSelect } from "@/components/hr/kit/HrEmployeeFields";
import { useAuth } from "@/context/AuthContext";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { logApiError } from "@/utils/logApiError";

const PREFIX = "/app/hr";

function gapKey(g: HrAuditReadinessGap) {
  return `${g.employee_id}-${g.requirement_id}`;
}

export function HrCompliancePage() {
  const { me } = useAuth();
  const complianceEnabled = me?.feature_flags?.compliance_tracking_enabled === true;

  const [frameworks, setFrameworks] = useState<HrComplianceFramework[]>([]);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<number | null>(null);
  const [requirements, setRequirements] = useState<HrComplianceRequirement[]>([]);
  const [records, setRecords] = useState<HrEmployeeComplianceRecord[]>([]);
  const [score, setScore] = useState<HrComplianceScore | null>(null);
  const [gaps, setGaps] = useState<HrAuditReadinessGap[]>([]);
  const [actionPlan, setActionPlan] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [openActionsKey, setOpenActionsKey] = useState<string | null>(null);

  const [legacyRows, setLegacyRows] = useState<Record<string, unknown>[]>([]);
  const [legacyLoading, setLegacyLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState("");
  const [checkType, setCheckType] = useState("AGE_VERIFICATION");

  const selectedFramework = useMemo(
    () => frameworks.find((f) => f.id === selectedFrameworkId) ?? null,
    [frameworks, selectedFrameworkId],
  );

  const recordByKey = useMemo(() => {
    const map = new Map<string, HrEmployeeComplianceRecord>();
    for (const r of records) {
      map.set(`${r.employee_id}-${r.requirement_id}`, r);
    }
    return map;
  }, [records]);

  const loadFrameworks = useCallback(async () => {
    if (!complianceEnabled) {
      setLoading(false);
      setFrameworks([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const rows = await api.listHrComplianceFrameworks();
      setFrameworks(rows);
      const active = rows.find((f) => f.is_active && !f.is_system) ?? rows.find((f) => f.is_active) ?? rows[0];
      if (active) setSelectedFrameworkId((current) => current ?? active.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load frameworks");
    } finally {
      setLoading(false);
    }
  }, [complianceEnabled]);

  const detailRequest = useLatestRequest();
  const loadFrameworkDetail = useCallback(async (frameworkId: number) => {
    const token = detailRequest.begin();
    setDetailLoading(true);
    try {
      const [reqRows, recRows, scoreRow, audit] = await Promise.all([
        api.listHrComplianceRequirements(frameworkId),
        api.listHrComplianceRecords({ framework_id: frameworkId }),
        api.getHrComplianceScore(frameworkId),
        api.getHrAuditReadiness(frameworkId),
      ]);
      if (!detailRequest.isCurrent(token)) return;
      setRequirements(reqRows);
      setRecords(recRows);
      setScore(scoreRow);
      setGaps(audit.gaps);
      setActionPlan(audit.action_plan ?? []);
    } catch (e) {
      if (!detailRequest.isCurrent(token)) return;
      setError(e instanceof Error ? e.message : "Failed to load framework details");
      setRequirements([]);
      setRecords([]);
      setScore(null);
      setGaps([]);
      setActionPlan([]);
    } finally {
      if (detailRequest.isCurrent(token)) setDetailLoading(false);
    }
  }, [detailRequest]);

  const loadLegacy = useCallback(async () => {
    setLegacyLoading(true);
    try {
      setLegacyRows(await api.listHrComplianceChecks());
    } catch (e) {
      logApiError("HrCompliancePage.listHrComplianceChecks", e);
      setLegacyRows([]);
    } finally {
      setLegacyLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFrameworks();
    void loadLegacy();
  }, [loadFrameworks, loadLegacy]);

  useEffect(() => {
    if (selectedFrameworkId != null && complianceEnabled) void loadFrameworkDetail(selectedFrameworkId);
  }, [selectedFrameworkId, loadFrameworkDetail, complianceEnabled]);

  const onActivate = async (id: number) => {
    setError("");
    try {
      const activated = await api.activateHrComplianceFramework(id);
      await loadFrameworks();
      setSelectedFrameworkId(activated.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Activation failed");
    }
  };

  const markStatus = async (gap: HrAuditReadinessGap, status: "COMPLIANT" | "NON_COMPLIANT") => {
    setError("");
    setOpenActionsKey(null);
    try {
      const key = gapKey(gap);
      const existing = recordByKey.get(key);
      if (existing) {
        await api.updateHrComplianceRecord(existing.id, { status });
      } else {
        await api.createHrComplianceRecord({
          employee_id: gap.employee_id,
          requirement_id: gap.requirement_id,
          status,
        });
      }
      if (selectedFrameworkId != null) await loadFrameworkDetail(selectedFrameworkId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const onLegacyCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!employeeId) {
      setError("Choose an employee first.");
      return;
    }
    try {
      await api.createHrComplianceCheck({
        employee_id: Number(employeeId),
        check_type: checkType,
        status: "OPEN",
      });
      setEmployeeId("");
      await loadLegacy();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  if (!complianceEnabled) {
    return (
      <div className="space-y-6">
        <HrPageHeader
          title="Compliance dashboard"
          description="BSCI, WRAP, SEDEX frameworks — score, requirements, and audit readiness."
          breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Compliance" }]}
        />
        <div className="rounded-xl border border-border bg-surface-subtle p-6 text-sm text-text-secondary">
          Compliance tracking is off. Enable{" "}
          <span className="font-medium text-text-primary">compliance_tracking_enabled</span> under{" "}
          <Link to="/app/settings/config" className="text-brand-primary underline">
            Settings → Configuration
          </Link>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Compliance dashboard"
        description="BSCI, WRAP, SEDEX frameworks — score, requirements, and audit readiness."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Compliance" }]}
      />

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface-raised p-4">
        <p className="mb-3 text-sm font-medium text-text-primary">Frameworks</p>
        {loading ? (
          <p className="text-sm text-text-muted">Loading frameworks...</p>
        ) : frameworks.length === 0 ? (
          <p className="text-sm text-text-muted">No compliance frameworks configured.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {frameworks.map((f) => (
              <div
                key={f.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  selectedFrameworkId === f.id ? "border-brand-primary bg-brand-primary/5" : "border-border"
                }`}
              >
                <button type="button" onClick={() => setSelectedFrameworkId(f.id)} className="font-medium text-text-primary">
                  {f.framework_name}
                  {f.version ? ` (${f.version})` : ""}
                  {f.is_system ? " · System" : ""}
                </button>
                {f.is_system && f.activated_tenant_framework_id == null && (
                  <button
                    type="button"
                    onClick={() => void onActivate(f.id)}
                    className="rounded border border-border-strong px-2 py-0.5 text-xs text-text-secondary hover:bg-surface-subtle"
                  >
                    Activate
                  </button>
                )}
                {f.is_system && f.activated_tenant_framework_id != null && (
                  <span className="text-xs text-text-muted">Activated</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedFramework && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface-raised p-4">
              <p className="text-xs uppercase text-text-muted">Score</p>
              <p className="mt-1 text-2xl font-semibold text-text-primary">
                {detailLoading || !score ? "—" : `${score.score_percent.toFixed(1)}%`}
              </p>
              {score && (
                <p className="mt-1 text-xs text-text-secondary">
                  {score.compliant_count} compliant · {score.pending_count} pending · {score.non_compliant_count} non-compliant
                </p>
              )}
            </div>
            <div className="rounded-xl border border-border bg-surface-raised p-4 sm:col-span-2">
              <p className="text-xs uppercase text-text-muted">Selected framework</p>
              <p className="mt-1 font-medium text-text-primary">
                {selectedFramework.framework_name}
                {selectedFramework.version ? ` v${selectedFramework.version}` : ""}
              </p>
              {actionPlan.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-text-secondary">
                  {actionPlan.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-text-primary">Requirements</p>
            </div>
            {detailLoading ? (
              <div className="p-8 text-sm text-text-muted">Loading requirements...</div>
            ) : (
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-surface-subtle">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs uppercase">Code</th>
                    <th className="px-4 py-2 text-left text-xs uppercase">Title</th>
                    <th className="px-4 py-2 text-left text-xs uppercase">Category</th>
                    <th className="px-4 py-2 text-left text-xs uppercase">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {requirements.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs">{r.requirement_code}</td>
                      <td className="px-4 py-2">{r.title}</td>
                      <td className="px-4 py-2 text-text-secondary">{r.category}</td>
                      <td className="px-4 py-2 text-text-secondary">{r.verification_method ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium text-text-primary">Audit readiness gaps</p>
              <p className="text-xs text-text-muted">{gaps.length} open gap(s)</p>
            </div>
            {detailLoading ? (
              <div className="p-8 text-sm text-text-muted">Loading gaps...</div>
            ) : gaps.length === 0 ? (
              <div className="p-8 text-sm text-text-muted">No gaps — audit ready.</div>
            ) : (
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-surface-subtle">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs uppercase">Employee</th>
                    <th className="px-4 py-2 text-left text-xs uppercase">Requirement</th>
                    <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
                    <th className="px-4 py-2 text-left text-xs uppercase">Missing docs</th>
                    <th className="px-4 py-2 text-right text-xs uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {gaps.map((g) => {
                    const key = gapKey(g);
                    return (
                      <tr key={key} className="border-t border-border">
                        <td className="px-4 py-2">
                          {g.employee_code ?? g.employee_id}
                          {g.employee_name ? ` — ${g.employee_name}` : ""}
                        </td>
                        <td className="px-4 py-2">
                          {g.requirement_code} — {g.title}
                        </td>
                        <td className="px-4 py-2">{g.status}</td>
                        <td className="px-4 py-2 text-text-secondary">
                          {g.missing_documents.length > 0 ? g.missing_documents.join(", ") : "—"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="relative inline-block">
                            <button
                              type="button"
                              onClick={() => setOpenActionsKey(openActionsKey === key ? null : key)}
                              className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Actions
                            </button>
                            {openActionsKey === key && (
                              <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                                <button
                                  type="button"
                                  onClick={() => void markStatus(g, "COMPLIANT")}
                                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                                >
                                  Mark compliant
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void markStatus(g, "NON_COMPLIANT")}
                                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                                >
                                  Mark non-compliant
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <div className="rounded-xl border border-border bg-surface-subtle p-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-text-primary">Legacy checks</p>
          <p className="text-xs text-text-muted">Original age verification / safety training check list.</p>
        </div>
        <form onSubmit={onLegacyCreate} className="flex flex-wrap items-end gap-2">
          <div className="w-full min-w-[240px] sm:w-72">
            <HrEmployeeSelect
              value={employeeId ? Number(employeeId) : null}
              onChange={(v) => setEmployeeId(v ? String(v) : "")}
              required
            />
          </div>
          <select className="rounded border border-border px-2 py-1 text-sm" value={checkType} onChange={(e) => setCheckType(e.target.value)}>
            <option value="AGE_VERIFICATION">Age verification</option>
            <option value="SAFETY_TRAINING">Safety training</option>
            <option value="WORKING_HOURS">Working hours</option>
          </select>
          <button type="submit" className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            Add check
          </button>
        </form>
        <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
          {legacyLoading ? (
            <div className="p-6 text-sm text-text-muted">Loading legacy checks...</div>
          ) : (
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-2 text-left text-xs uppercase">Employee</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Due</th>
                </tr>
              </thead>
              <tbody>
                {legacyRows.map((r) => (
                  <tr key={String(r.id)}>
                    <td className="px-4 py-2">{String(r.employee_id)}</td>
                    <td className="px-4 py-2">{String(r.check_type)}</td>
                    <td className="px-4 py-2">{String(r.status)}</td>
                    <td className="px-4 py-2">{String(r.due_date ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
