import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ClipboardCheck,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  FlaskConical,
  ArrowRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
  FileBarChart,
  Sparkles,
} from "lucide-react";
import { api } from "@/api/client";
import type { QualityDashboardResponse } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const resultColors: Record<string, string> = {
  pass: "bg-emerald-100 text-emerald-800",
  fail: "bg-red-100 text-red-800",
  reject: "bg-rose-100 text-rose-800",
};

export function QualityDashboardPage() {
  const [dashboard, setDashboard] = useState<QualityDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const data = await api.getQualityDashboard({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setDashboard(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load QC dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [dateFrom, dateTo]);

  const passRatePct = useMemo(() => {
    if (!dashboard) return 0;
    const r = dashboard.inspections.pass_rate;
    return typeof r === "number" && r <= 1 ? r * 100 : r;
  }, [dashboard]);

  const checkTypePct = (passRate: number) =>
    typeof passRate === "number" && passRate <= 1 ? passRate * 100 : passRate;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">QC Dashboard</h1>
          <p className="text-sm text-slate-500">
            Quality control overview: inspections, pass rate, NCR, CAPA, and defect trends.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-sm text-slate-600">
            From
            <input
              type="date"
              className="rounded border border-slate-200 px-2 py-1.5 text-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            To
            <input
              type="date"
              className="rounded border border-slate-200 px-2 py-1.5 text-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {loading && !dashboard ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          Loading QC dashboard…
        </div>
      ) : dashboard ? (
        <>
          {/* KPI row */}
          <motion.div
            className="grid grid-cols-2 gap-3 md:grid-cols-5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Total Inspections</p>
                    <p className="text-2xl font-bold">{dashboard.inspections.total}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                    <ClipboardCheck className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <div className="mt-2 flex gap-2 text-xs">
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="h-3 w-3" />
                    {dashboard.inspections.passed} passed
                  </span>
                  <span className="flex items-center gap-1 text-red-600">
                    <XCircle className="h-3 w-3" />
                    {dashboard.inspections.failed} failed
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Pass Rate</p>
                    <p className="text-2xl font-bold">{passRatePct.toFixed(1)}%</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
                <div className="mt-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(passRatePct, 100)}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Pending CAPA</p>
                    <p className="text-2xl font-bold">{dashboard.capa.open}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {dashboard.capa.in_progress} in progress · {dashboard.capa.closed} closed
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Open NCR</p>
                    <p className="text-2xl font-bold">{dashboard.ncr.open}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                    <RotateCcw className="h-5 w-5 text-red-600" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">{dashboard.ncr.total} total NCR</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Defect Codes</p>
                    <p className="text-2xl font-bold">{dashboard.defect_distribution.length}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                    <FileBarChart className="h-5 w-5 text-slate-600" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">Logged in period</p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Main content: Recent checks + Quick actions + By stage */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Recent Inspections</CardTitle>
                <Link to="/app/quality/inspections">
                  <Button variant="ghost" size="sm" className="gap-1">
                    View All <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="pb-2 pr-2 font-medium">ID</th>
                        <th className="pb-2 pr-2 font-medium">WO</th>
                        <th className="pb-2 pr-2 font-medium">Type</th>
                        <th className="pb-2 pr-2 font-medium">Result</th>
                        <th className="pb-2 pr-2 font-medium">Defect</th>
                        <th className="pb-2 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.recent_checks.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-500">
                            No inspections in this period
                          </td>
                        </tr>
                      ) : (
                        dashboard.recent_checks.map((row) => (
                          <tr key={row.id} className="border-b border-slate-100">
                            <td className="py-2 pr-2 font-medium">{row.id}</td>
                            <td className="py-2 pr-2">{row.work_order_id}</td>
                            <td className="py-2 pr-2">{row.check_type}</td>
                            <td className="py-2 pr-2">
                              <Badge className={resultColors[row.result?.toLowerCase()] ?? "bg-slate-100 text-slate-800"}>
                                {row.result ?? "—"}
                              </Badge>
                            </td>
                            <td className="py-2 pr-2">{row.defect_code ?? "—"}</td>
                            <td className="py-2 text-slate-500">
                              {row.created_at
                                ? new Date(row.created_at).toLocaleDateString(undefined, {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link to="/app/quality/inspections" className="block">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <ClipboardCheck className="h-4 w-4" /> Inspections
                  </Button>
                </Link>
                <Link to="/app/quality/lab-tests" className="block">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <FlaskConical className="h-4 w-4" /> Lab Tests
                  </Button>
                </Link>
                <Link to="/app/quality/capa" className="block">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <AlertTriangle className="h-4 w-4" /> CAPA
                  </Button>
                </Link>
                <Link to="/app/quality/returns" className="block">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <RotateCcw className="h-4 w-4" /> Returns
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Pass/Fail by check type (inspection stage) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pass / Fail by Inspection Stage</CardTitle>
              <p className="text-sm font-normal text-slate-500">
                Quality metrics by check type (in-process, final, etc.)
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dashboard.by_check_type.length === 0 ? (
                  <p className="text-sm text-slate-500">No inspection data in this period.</p>
                ) : (
                  dashboard.by_check_type.map((stage) => {
                    const total = stage.total;
                    const pct = total > 0 ? checkTypePct(stage.pass_rate) : 0;
                    return (
                      <div key={stage.check_type} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium capitalize">
                            {stage.check_type.replace(/_/g, " ")}
                          </span>
                          <span className="text-slate-500">
                            {total} checks · {pct.toFixed(0)}% pass
                          </span>
                        </div>
                        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200">
                          {total > 0 ? (
                            <>
                              <div
                                className="bg-emerald-500"
                                style={{ width: `${pct}%` }}
                              />
                              <div
                                className="bg-red-400"
                                style={{ width: `${100 - pct}%` }}
                              />
                            </>
                          ) : (
                            <div className="h-full w-full bg-slate-300" />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* Defect distribution + AI insights row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Defect Distribution</CardTitle>
                <p className="text-sm font-normal text-slate-500">Top defect codes in selected period</p>
              </CardHeader>
              <CardContent>
                {dashboard.defect_distribution.length === 0 ? (
                  <p className="text-sm text-slate-500">No defects logged.</p>
                ) : (
                  <ul className="space-y-2">
                    {dashboard.defect_distribution.slice(0, 10).map((d) => (
                      <li
                        key={d.defect_code}
                        className="flex items-center justify-between rounded border border-slate-100 bg-slate-50/50 px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{d.defect_code}</span>
                        <Badge variant="secondary">{d.count}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-500" />
                  AI Quality Insights
                </CardTitle>
                <p className="text-sm font-normal text-slate-500">
                  Recommendations and anomaly alerts (coming soon)
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4 text-sm text-amber-800">
                  <p>
                    Use defect distribution and pass rate by stage to prioritize CAPA and process fixes.
                    AI-powered insights will suggest root causes and preventive actions here.
                  </p>
                  <Button variant="outline" size="sm" disabled>
                    AI Insights (Coming soon)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Reports section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quality Reports</CardTitle>
              <p className="text-sm font-normal text-slate-500">
                Export and standard quality reports
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <p className="font-medium text-slate-900">Quality Summary</p>
                  <p className="text-xs text-slate-500 mt-1">Pass rate, NCR, CAPA counts</p>
                  <Button variant="outline" size="sm" className="mt-2" disabled>
                    Generate
                  </Button>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <p className="font-medium text-slate-900">Defect Analysis</p>
                  <p className="text-xs text-slate-500 mt-1">By defect code and stage</p>
                  <Button variant="outline" size="sm" className="mt-2" disabled>
                    Generate
                  </Button>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <p className="font-medium text-slate-900">Trend Report</p>
                  <p className="text-xs text-slate-500 mt-1">Daily/weekly quality trends</p>
                  <Button variant="outline" size="sm" className="mt-2" disabled>
                    Generate
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
