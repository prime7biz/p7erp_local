import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type HrComplianceFramework, type HrPayrollRunResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { useAuth } from "@/context/AuthContext";

const PREFIX = "/app/hr";

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function messageOf(item: unknown): string {
  if (typeof item === "string") return item;
  if (typeof item === "object" && item) {
    const row = item as Record<string, unknown>;
    return asString(row.message ?? row.description ?? row.title ?? item);
  }
  return asString(item);
}

function flagOn(flags: Record<string, boolean | string | number | null> | null | undefined, key: string): boolean {
  return flags?.[key] === true;
}

export function HrAiInsightsPage() {
  const { me } = useAuth();
  const flags = me?.feature_flags;

  const anyAiEnabled =
    flagOn(flags, "ai_attendance_analysis_enabled") ||
    flagOn(flags, "ai_turnover_prediction_enabled") ||
    flagOn(flags, "ai_payroll_anomaly_detection_enabled") ||
    flagOn(flags, "ai_compliance_risk_prediction_enabled");

  const [frameworks, setFrameworks] = useState<HrComplianceFramework[]>([]);
  const [frameworkId, setFrameworkId] = useState<number | "">("");
  const [payrollRuns, setPayrollRuns] = useState<HrPayrollRunResponse[]>([]);
  const [runId, setRunId] = useState<number | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  const [attendance, setAttendance] = useState<Record<string, unknown> | null>(null);
  const [turnover, setTurnover] = useState<Record<string, unknown> | null>(null);
  const [payrollAnomalies, setPayrollAnomalies] = useState<Record<string, unknown> | null>(null);
  const [complianceRisk, setComplianceRisk] = useState<Record<string, unknown> | null>(null);

  const loadBase = useCallback(async () => {
    if (!anyAiEnabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const notes: string[] = [];

    const [fwRes, attRes, turnRes, runsRes] = await Promise.allSettled([
      api.listHrComplianceFrameworks(),
      flagOn(flags, "ai_attendance_analysis_enabled")
        ? api.getHrAttendanceAnalysis()
        : Promise.resolve(null),
      flagOn(flags, "ai_turnover_prediction_enabled") ? api.getHrTurnoverRisk() : Promise.resolve(null),
      api.listHrPayrollRuns().catch(() => [] as HrPayrollRunResponse[]),
    ]);

    if (fwRes.status === "fulfilled") {
      const fw = fwRes.value;
      setFrameworks(fw);
      const tenantFw = fw.find((f) => !f.is_system && f.is_active) ?? fw.find((f) => !f.is_system) ?? fw[0];
      if (tenantFw) setFrameworkId(tenantFw.id);
    } else {
      notes.push("Could not load compliance frameworks (enable compliance tracking to pick a framework).");
      setFrameworks([]);
    }

    if (attRes.status === "fulfilled") {
      setAttendance(attRes.value);
    } else {
      setAttendance(null);
      if (flagOn(flags, "ai_attendance_analysis_enabled")) notes.push("Attendance analysis unavailable.");
    }

    if (turnRes.status === "fulfilled") {
      setTurnover(turnRes.value);
    } else {
      setTurnover(null);
      if (flagOn(flags, "ai_turnover_prediction_enabled")) notes.push("Turnover risk unavailable.");
    }

    if (runsRes.status === "fulfilled") {
      setPayrollRuns(runsRes.value);
      const firstRun = runsRes.value[0];
      if (firstRun) setRunId(firstRun.id);
    } else {
      setPayrollRuns([]);
    }

    setWarnings(notes);
    setLoading(false);
  }, [anyAiEnabled, flags]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const loadPayrollAnomalies = async () => {
    if (runId === "") {
      setError("Select a payroll run.");
      return;
    }
    setError("");
    try {
      setPayrollAnomalies(await api.getHrPayrollAnomalies(Number(runId)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payroll analysis failed");
      setPayrollAnomalies(null);
    }
  };

  const loadComplianceRisk = useCallback(async () => {
    if (frameworkId === "" || !flagOn(flags, "ai_compliance_risk_prediction_enabled")) return;
    try {
      setComplianceRisk(await api.getHrComplianceRisk(Number(frameworkId)));
    } catch (e) {
      setWarnings((prev) => [...prev.filter((w) => !w.includes("Compliance forecast")), e instanceof Error ? e.message : "Compliance forecast failed"]);
      setComplianceRisk(null);
    }
  }, [frameworkId, flags]);

  useEffect(() => {
    if (frameworkId !== "") void loadComplianceRisk();
  }, [frameworkId, loadComplianceRisk]);

  const attendancePatterns = asArray(attendance?.patterns);
  const attendanceAnomalies = asArray(attendance?.anomalies);
  const attendancePredictions = asArray(attendance?.predictions);
  const turnoverRows = asArray(turnover?.predictions ?? turnover?.employees);
  const anomalyRows = asArray(payrollAnomalies?.anomalies);
  const complianceRisks = asArray(complianceRisk?.risks);

  const criticalAlerts = [
    ...attendanceAnomalies.filter(
      (a) => typeof a === "object" && a && (a as { severity?: string }).severity === "critical",
    ),
    ...complianceRisks.filter(
      (a) => typeof a === "object" && a && ["high", "critical"].includes(String((a as { severity?: string }).severity ?? "").toLowerCase()),
    ),
  ];

  if (!anyAiEnabled) {
    return (
      <div className="space-y-6">
        <HrPageHeader
          title="HR AI insights"
          description="Attendance patterns, turnover risk, payroll anomalies, and compliance forecast."
          breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "AI Insights" }]}
        />
        <div className="rounded-xl border border-border bg-surface-subtle p-6 text-sm text-text-secondary">
          HR AI insights are off for this company. Enable one or more of the AI flags under{" "}
          <Link to="/app/settings/config" className="text-brand-primary underline">
            Settings → Configuration
          </Link>{" "}
          (attendance, turnover, payroll anomalies, or compliance risk).
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="HR AI insights"
        description="Attendance patterns, turnover risk, payroll anomalies, and compliance forecast."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "AI Insights" }]}
      />

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning-subtle px-4 py-2 text-sm text-text-secondary">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-status-warning/30 bg-status-warning-subtle p-4">
        <p className="text-sm font-medium text-text-primary">Critical alerts</p>
        {loading ? (
          <p className="mt-2 text-sm text-text-muted">Loading...</p>
        ) : criticalAlerts.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">No critical alerts right now.</p>
        ) : (
          <ul className="mt-2 list-disc pl-5 text-sm text-text-secondary">
            {criticalAlerts.map((a, i) => (
              <li key={i}>{messageOf(a)}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <p className="text-sm font-medium text-text-primary">Attendance analysis</p>
          {!flagOn(flags, "ai_attendance_analysis_enabled") ? (
            <p className="mt-2 text-sm text-text-muted">Enable ai_attendance_analysis_enabled in Settings.</p>
          ) : loading ? (
            <p className="mt-2 text-sm text-text-muted">Loading...</p>
          ) : !attendance ? (
            <p className="mt-2 text-sm text-text-secondary">No attendance data.</p>
          ) : (
            <div className="mt-3 space-y-3 text-sm text-text-secondary">
              {attendancePatterns.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-text-muted">Patterns</p>
                  <ul className="mt-1 list-disc pl-5">
                    {attendancePatterns.slice(0, 8).map((p, i) => (
                      <li key={i}>{messageOf(p)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {attendanceAnomalies.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-text-muted">Anomalies</p>
                  <ul className="mt-1 list-disc pl-5">
                    {attendanceAnomalies.slice(0, 8).map((a, i) => (
                      <li key={i}>{messageOf(a)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {attendancePredictions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-text-muted">Predictions</p>
                  <ul className="mt-1 list-disc pl-5">
                    {attendancePredictions.slice(0, 5).map((p, i) => (
                      <li key={i}>{messageOf(p)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {attendancePatterns.length === 0 &&
                attendanceAnomalies.length === 0 &&
                attendancePredictions.length === 0 && (
                  <p>No attendance patterns or anomalies in the selected window.</p>
                )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <p className="text-sm font-medium text-text-primary">Turnover risk</p>
          {!flagOn(flags, "ai_turnover_prediction_enabled") ? (
            <p className="mt-2 text-sm text-text-muted">Enable ai_turnover_prediction_enabled in Settings.</p>
          ) : loading ? (
            <p className="mt-2 text-sm text-text-muted">Loading...</p>
          ) : turnoverRows.length === 0 ? (
            <p className="mt-2 text-sm text-text-secondary">No at-risk employees flagged.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {turnoverRows.slice(0, 10).map((row, i) => {
                const r = row as Record<string, unknown>;
                const empId = typeof r.employee_id === "number" ? r.employee_id : null;
                const name = asString(r.employee_name ?? r.name ?? "Employee");
                const code = r.employee_code ? ` (${asString(r.employee_code)})` : "";
                const content = (
                  <>
                    {name}
                    {code}
                    {r.risk_score != null && (
                      <span className="ml-2 text-xs text-text-muted">
                        risk {asString(r.risk_score)}
                        {r.risk_level != null ? ` · ${asString(r.risk_level)}` : ""}
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={i} className="rounded border border-border px-3 py-2 text-text-secondary">
                    {empId != null ? (
                      <Link to={`${PREFIX}/employees/${empId}`} className="hover:text-brand-primary">
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
        <p className="text-sm font-medium text-text-primary">Payroll anomalies</p>
        {!flagOn(flags, "ai_payroll_anomaly_detection_enabled") ? (
          <p className="text-sm text-text-muted">Enable ai_payroll_anomaly_detection_enabled in Settings.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <select
                className="rounded border border-border px-3 py-2 text-sm min-w-[220px]"
                value={runId}
                onChange={(e) => setRunId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Select payroll run</option>
                {payrollRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.run_code} · {r.run_date} · {r.status}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void loadPayrollAnomalies()}
                className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white"
              >
                Analyze run
              </button>
            </div>
            {payrollAnomalies && (
              <div className="text-sm text-text-secondary">
                {anomalyRows.length === 0 ? (
                  <p>No anomalies detected for this run.</p>
                ) : (
                  <ul className="list-disc pl-5">
                    {anomalyRows.map((a, i) => (
                      <li key={i}>{messageOf(a)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface-raised p-4 space-y-3">
        <p className="text-sm font-medium text-text-primary">Compliance forecast</p>
        {!flagOn(flags, "ai_compliance_risk_prediction_enabled") ? (
          <p className="text-sm text-text-muted">Enable ai_compliance_risk_prediction_enabled in Settings.</p>
        ) : (
          <>
            <select
              className="rounded border border-border px-3 py-2 text-sm"
              value={frameworkId}
              onChange={(e) => setFrameworkId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Select framework</option>
              {frameworks
                .filter((f) => !f.is_system)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.framework_name}
                    {f.version ? ` (${f.version})` : ""}
                  </option>
                ))}
            </select>
            {frameworks.filter((f) => !f.is_system).length === 0 && (
              <p className="text-xs text-text-muted">
                Activate a framework on the Compliance page first (and enable compliance tracking).
              </p>
            )}
            {complianceRisk && (
              <div className="text-sm text-text-secondary space-y-2">
                {complianceRisk.score_percent != null && (
                  <p>
                    Readiness score: <span className="font-medium text-text-primary">{asString(complianceRisk.score_percent)}%</span>
                  </p>
                )}
                {complianceRisks.length === 0 ? (
                  <p>No compliance risks flagged.</p>
                ) : (
                  <ul className="list-disc pl-5">
                    {complianceRisks.map((r, i) => (
                      <li key={i}>{messageOf(r)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
