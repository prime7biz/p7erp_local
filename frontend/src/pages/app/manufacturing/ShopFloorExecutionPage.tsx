import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { api } from "@/api/client";
import { useAuth } from "@/context/AuthContext";

function screenTitle(pathname: string): string {
  if (pathname.includes("/production/cutting")) return "Shop Floor - Cutting";
  if (pathname.includes("/production/sewing")) return "Shop Floor - Sewing";
  if (pathname.includes("/production/finishing-packing")) return "Shop Floor - Finishing";
  return "Shop Floor Execution";
}

export function ShopFloorExecutionPage() {
  const location = useLocation();
  const { me } = useAuth();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.listMfgOperationQueue>>>([]);
  const [openDowntimeRows, setOpenDowntimeRows] = useState<Awaited<ReturnType<typeof api.listMfgDowntime>>>([]);
  const [downtimeReasonRows, setDowntimeReasonRows] = useState<Awaited<ReturnType<typeof api.getMfgDowntimeReasonSummary>>>([]);
  const [downtimeTrendRows, setDowntimeTrendRows] = useState<Awaited<ReturnType<typeof api.getMfgDowntimeTrend>>>([]);
  const [users, setUsers] = useState<Awaited<ReturnType<typeof api.listUsers>>>([]);
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof api.getMfgExecutionDashboard>> | null>(null);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedOpId, setSelectedOpId] = useState<number | null>(null);
  const [assignOpId, setAssignOpId] = useState<number | null>(null);
  const [assignUserId, setAssignUserId] = useState<number | null>(null);
  const [assignRoleType, setAssignRoleType] = useState("operator");
  const [downtimeReason, setDowntimeReason] = useState("MACHINE");
  const [analyticsStartDate, setAnalyticsStartDate] = useState("");
  const [analyticsEndDate, setAnalyticsEndDate] = useState("");
  const [completeByOpId, setCompleteByOpId] = useState<
    Record<number, { qty_in: string; qty_out: string; scrap_qty: string }>
  >({});

  const title = useMemo(() => screenTitle(location.pathname), [location.pathname]);
  const areaKey = useMemo(() => {
    if (location.pathname.includes("/production/cutting")) return "cutting";
    if (location.pathname.includes("/production/sewing")) return "sewing";
    if (location.pathname.includes("/production/finishing-packing")) return "finishing";
    return "all";
  }, [location.pathname]);
  const myRole = useMemo(() => {
    const mine = users.find((row) => row.id === me?.user_id);
    return (mine?.role_name ?? "").trim().toLowerCase();
  }, [users, me?.user_id]);
  const canAssign = myRole === "admin" || myRole === "manager" || myRole === "supervisor";
  const canManageDowntime = canAssign;
  const canRunOperationActions = myRole !== "quality";

  const load = async () => {
    setError("");
    try {
      const [queueRows, dash, userRows, downtimeRows, reasonRows, trendRows] = await Promise.all([
        api.listMfgOperationQueue({
          status_filter: statusFilter || undefined,
          area: areaKey === "all" ? undefined : areaKey,
          limit: 300,
        }),
        api.getMfgExecutionDashboard(),
        api.listUsers(),
        api.listMfgDowntime({ open_only: true }),
        api.getMfgDowntimeReasonSummary({
          start_date: analyticsStartDate || undefined,
          end_date: analyticsEndDate || undefined,
        }),
        api.getMfgDowntimeTrend({
          start_date: analyticsStartDate || undefined,
          end_date: analyticsEndDate || undefined,
        }),
      ]);
      setRows(queueRows);
      setDashboard(dash);
      setUsers(userRows.filter((row) => row.is_active));
      setOpenDowntimeRows(downtimeRows);
      setDowntimeReasonRows(reasonRows);
      setDowntimeTrendRows(trendRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shop floor queue");
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter, areaKey, analyticsStartDate, analyticsEndDate]);

  const runAction = async (action: "start" | "hold" | "resume" | "complete", opId: number) => {
    setError("");
    try {
      if (action === "start") await api.startMfgOperation(opId);
      if (action === "hold") await api.holdMfgOperation(opId);
      if (action === "resume") await api.resumeMfgOperation(opId);
      if (action === "complete") {
        const raw = completeByOpId[opId] ?? { qty_in: "", qty_out: "", scrap_qty: "" };
        const payload: { qty_in?: number; qty_out?: number; scrap_qty?: number } = {};
        if (raw.qty_in.trim()) payload.qty_in = Number(raw.qty_in);
        if (raw.qty_out.trim()) payload.qty_out = Number(raw.qty_out);
        if (raw.scrap_qty.trim()) payload.scrap_qty = Number(raw.scrap_qty);
        await api.completeMfgOperation(opId, payload);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  };

  const logDowntime = async () => {
    if (!selectedOpId) return;
    setError("");
    try {
      await api.createMfgDowntime({
        work_order_operation_id: selectedOpId,
        reason_code: downtimeReason,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Downtime log failed");
    }
  };

  const assignOperator = async () => {
    if (!assignOpId || !assignUserId) return;
    setError("");
    try {
      await api.assignMfgOperation({
        work_order_operation_id: assignOpId,
        assigned_user_id: assignUserId,
        role_type: assignRoleType,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operator assignment failed");
    }
  };

  const closeDowntime = async (downtimeId: number) => {
    setError("");
    try {
      await api.endMfgDowntime(downtimeId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Close downtime failed");
    }
  };

  const userLabelMap = useMemo(
    () =>
      new Map(
        users.map((row) => [
          row.id,
          [row.first_name ?? "", row.last_name ?? ""].join(" ").trim() || row.username || row.email,
        ]),
      ),
    [users],
  );
  const filteredRows = rows;
  const maxReasonMinutes = useMemo(
    () => Math.max(0, ...downtimeReasonRows.map((row) => row.total_minutes)),
    [downtimeReasonRows],
  );
  const maxTrendMinutes = useMemo(
    () => Math.max(0, ...downtimeTrendRows.map((row) => row.total_minutes)),
    [downtimeTrendRows],
  );
  const trendKpis = useMemo(() => {
    const totalMinutes = downtimeTrendRows.reduce((sum, row) => sum + row.total_minutes, 0);
    const totalEvents = downtimeTrendRows.reduce((sum, row) => sum + row.total_events, 0);
    const avgPerDay = downtimeTrendRows.length > 0 ? totalMinutes / downtimeTrendRows.length : 0;
    const worstDay = downtimeTrendRows.reduce<{ date: string; minutes: number } | null>((best, row) => {
      if (!best || row.total_minutes > best.minutes) return { date: row.trend_date, minutes: row.total_minutes };
      return best;
    }, null);
    const topReason = downtimeReasonRows.reduce<{ reason: string; minutes: number } | null>((best, row) => {
      if (!best || row.total_minutes > best.minutes) return { reason: row.reason_code, minutes: row.total_minutes };
      return best;
    }, null);
    return { totalMinutes, totalEvents, avgPerDay, worstDay, topReason };
  }, [downtimeTrendRows, downtimeReasonRows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">Operation queue, control actions, and downtime logging for factory floor use.</p>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {dashboard ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">Active WOs</div><div className="text-xl font-semibold">{dashboard.active_work_orders}</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">Completed Ops</div><div className="text-xl font-semibold">{dashboard.completed_operations}/{dashboard.total_operations}</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">Downtime (min)</div><div className="text-xl font-semibold">{dashboard.total_downtime_minutes.toFixed(2)}</div></div>
          <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">OEE-like %</div><div className="text-xl font-semibold">{dashboard.oee_like_percent.toFixed(2)}%</div></div>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <select className="rounded border px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
          </select>
          <select className="rounded border px-3 py-2 text-sm" value={selectedOpId ?? ""} onChange={(e) => setSelectedOpId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Select operation for downtime</option>
            {filteredRows.map((row) => <option key={row.work_order_operation_id} value={row.work_order_operation_id}>{row.mo_number} | Step {row.step_no}</option>)}
          </select>
          <select className="rounded border px-3 py-2 text-sm" value={downtimeReason} onChange={(e) => setDowntimeReason(e.target.value)}>
            <option value="MACHINE">Machine</option>
            <option value="POWER">Power</option>
            <option value="MATERIAL">Material</option>
            <option value="MANPOWER">Manpower</option>
          </select>
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={() => void logDowntime()}
            disabled={!selectedOpId || !canRunOperationActions}
            title={canRunOperationActions ? "" : "Quality role cannot log downtime"}
          >
            Log Downtime
          </button>
          <div className="text-xs text-slate-500">
            Tip: use assignment panel below to bind operator to operation.
            {myRole ? ` Current role: ${myRole}.` : ""}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Assign Operator</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <select className="rounded border px-3 py-2 text-sm" value={assignOpId ?? ""} onChange={(e) => setAssignOpId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Select operation</option>
            {filteredRows.map((row) => (
              <option key={row.work_order_operation_id} value={row.work_order_operation_id}>
                {row.mo_number} | Step {row.step_no} | {row.operation_name}
              </option>
            ))}
          </select>
          <select className="rounded border px-3 py-2 text-sm" value={assignUserId ?? ""} onChange={(e) => setAssignUserId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Select user</option>
            {users.map((row) => (
              <option key={row.id} value={row.id}>
                {[row.first_name ?? "", row.last_name ?? ""].join(" ").trim() || row.username || row.email}
              </option>
            ))}
          </select>
          <select className="rounded border px-3 py-2 text-sm" value={assignRoleType} onChange={(e) => setAssignRoleType(e.target.value)}>
            <option value="operator">Operator</option>
            <option value="supervisor">Supervisor</option>
            <option value="quality">Quality</option>
          </select>
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={() => void assignOperator()}
            disabled={!assignOpId || !assignUserId || !canAssign}
            title={canAssign ? "" : "Only supervisor/manager/admin can assign"}
          >
            Assign
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-2 gap-3 border-b border-slate-200 p-4 md:grid-cols-4">
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Avg Downtime / Day</div>
            <div className="text-lg font-semibold text-slate-900">{trendKpis.avgPerDay.toFixed(2)} min</div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Worst Day</div>
            <div className="text-lg font-semibold text-slate-900">
              {trendKpis.worstDay ? `${trendKpis.worstDay.date} (${trendKpis.worstDay.minutes.toFixed(2)})` : "-"}
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Top Reason</div>
            <div className="text-lg font-semibold text-slate-900">
              {trendKpis.topReason ? `${trendKpis.topReason.reason} (${trendKpis.topReason.minutes.toFixed(2)})` : "-"}
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Total Events</div>
            <div className="text-lg font-semibold text-slate-900">{trendKpis.totalEvents}</div>
          </div>
        </div>
        <div className="border-b px-4 py-3 text-sm font-semibold text-slate-700">Downtime Trend (Daily)</div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Events</th>
              <th className="px-3 py-2">Open</th>
              <th className="px-3 py-2">Minutes</th>
              <th className="px-3 py-2">Visual</th>
            </tr>
          </thead>
          <tbody>
            {downtimeTrendRows.map((row) => (
              <tr key={row.trend_date} className="border-t">
                <td className="px-3 py-2">{row.trend_date}</td>
                <td className="px-3 py-2">{row.total_events}</td>
                <td className="px-3 py-2">{row.open_events}</td>
                <td className="px-3 py-2">{row.total_minutes.toFixed(2)}</td>
                <td className="px-3 py-2">
                  <div className="h-2 w-full rounded bg-slate-100">
                    <div
                      className="h-2 rounded bg-emerald-500"
                      style={{
                        width: `${maxTrendMinutes > 0 ? (row.total_minutes / maxTrendMinutes) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {downtimeTrendRows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={5}>No downtime trend data.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="border-b px-4 py-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">Downtime By Reason</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <input
              className="rounded border px-3 py-2 text-sm"
              type="date"
              value={analyticsStartDate}
              onChange={(e) => setAnalyticsStartDate(e.target.value)}
            />
            <input
              className="rounded border px-3 py-2 text-sm"
              type="date"
              value={analyticsEndDate}
              onChange={(e) => setAnalyticsEndDate(e.target.value)}
            />
            <button
              className="rounded border px-3 py-2 text-sm"
              onClick={() => {
                setAnalyticsStartDate("");
                setAnalyticsEndDate("");
              }}
            >
              Clear Range
            </button>
            <div className="text-xs text-slate-500">Filters use downtime start date.</div>
          </div>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Events</th>
              <th className="px-3 py-2">Open</th>
              <th className="px-3 py-2">Minutes</th>
              <th className="px-3 py-2">Visual</th>
            </tr>
          </thead>
          <tbody>
            {downtimeReasonRows.map((row) => (
              <tr key={row.reason_code} className="border-t">
                <td className="px-3 py-2">{row.reason_code}</td>
                <td className="px-3 py-2">{row.total_events}</td>
                <td className="px-3 py-2">{row.open_events}</td>
                <td className="px-3 py-2">{row.total_minutes.toFixed(2)}</td>
                <td className="px-3 py-2">
                  <div className="h-2 w-full rounded bg-slate-100">
                    <div
                      className="h-2 rounded bg-indigo-500"
                      style={{
                        width: `${maxReasonMinutes > 0 ? (row.total_minutes / maxReasonMinutes) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {downtimeReasonRows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={5}>No downtime analytics yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">MO</th>
              <th className="px-3 py-2">Step</th>
              <th className="px-3 py-2">Operation</th>
              <th className="px-3 py-2">Work Center</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Assigned</th>
              <th className="px-3 py-2">Downtime</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.work_order_operation_id} className="border-t">
                <td className="px-3 py-2 font-medium">{row.mo_number}</td>
                <td className="px-3 py-2">{row.step_no}</td>
                <td className="px-3 py-2">{row.operation_name}</td>
                <td className="px-3 py-2">{row.work_center_name}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">{row.assigned_user_id ? userLabelMap.get(row.assigned_user_id) ?? `User #${row.assigned_user_id}` : "-"}</td>
                <td className="px-3 py-2">{row.open_downtime ? "Open" : "-"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    {row.status === "pending" || row.status === "on_hold" ? (
                      <button
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => void runAction("start", row.work_order_operation_id)}
                        disabled={!canRunOperationActions}
                      >
                        Start
                      </button>
                    ) : null}
                    {row.status === "in_progress" ? (
                      <button
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => void runAction("hold", row.work_order_operation_id)}
                        disabled={!canRunOperationActions}
                      >
                        Hold
                      </button>
                    ) : null}
                    {row.status === "on_hold" ? (
                      <button
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => void runAction("resume", row.work_order_operation_id)}
                        disabled={!canRunOperationActions}
                      >
                        Resume
                      </button>
                    ) : null}
                    {row.status === "in_progress" ? (
                      <div className="flex items-center gap-1">
                        <input
                          className="w-16 rounded border px-1 py-1 text-xs"
                          placeholder="In"
                          value={completeByOpId[row.work_order_operation_id]?.qty_in ?? ""}
                          onChange={(e) =>
                            setCompleteByOpId((prev) => ({
                              ...prev,
                              [row.work_order_operation_id]: {
                                qty_in: e.target.value,
                                qty_out: prev[row.work_order_operation_id]?.qty_out ?? "",
                                scrap_qty: prev[row.work_order_operation_id]?.scrap_qty ?? "",
                              },
                            }))
                          }
                        />
                        <input
                          className="w-16 rounded border px-1 py-1 text-xs"
                          placeholder="Out"
                          value={completeByOpId[row.work_order_operation_id]?.qty_out ?? ""}
                          onChange={(e) =>
                            setCompleteByOpId((prev) => ({
                              ...prev,
                              [row.work_order_operation_id]: {
                                qty_in: prev[row.work_order_operation_id]?.qty_in ?? "",
                                qty_out: e.target.value,
                                scrap_qty: prev[row.work_order_operation_id]?.scrap_qty ?? "",
                              },
                            }))
                          }
                        />
                        <input
                          className="w-16 rounded border px-1 py-1 text-xs"
                          placeholder="Scrap"
                          value={completeByOpId[row.work_order_operation_id]?.scrap_qty ?? ""}
                          onChange={(e) =>
                            setCompleteByOpId((prev) => ({
                              ...prev,
                              [row.work_order_operation_id]: {
                                qty_in: prev[row.work_order_operation_id]?.qty_in ?? "",
                                qty_out: prev[row.work_order_operation_id]?.qty_out ?? "",
                                scrap_qty: e.target.value,
                              },
                            }))
                          }
                        />
                        <button
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => void runAction("complete", row.work_order_operation_id)}
                          disabled={!canRunOperationActions}
                        >
                          Complete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={8}>No operations found for current filter.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="border-b px-4 py-3 text-sm font-semibold text-slate-700">Open Downtime Events</div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Operation ID</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {openDowntimeRows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">{row.id}</td>
                <td className="px-3 py-2">{row.work_order_operation_id}</td>
                <td className="px-3 py-2">{row.reason_code}</td>
                <td className="px-3 py-2">{row.started_at}</td>
                <td className="px-3 py-2">
                  <button
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() => void closeDowntime(row.id)}
                    disabled={!canManageDowntime}
                    title={canManageDowntime ? "" : "Only supervisor/manager/admin can close"}
                  >
                    Close
                  </button>
                </td>
              </tr>
            ))}
            {openDowntimeRows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={5}>No open downtime events.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
